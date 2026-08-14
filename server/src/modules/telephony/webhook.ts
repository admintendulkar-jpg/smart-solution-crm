import type { Request, Response } from 'express';
import { get, run } from '../../db';
import { logger } from '../../logger';
import { notify } from '../notifications';
import { mapExotelStatusToOutcome } from './service';
import type { ExotelWebhookPayload, CallLogRecord } from './types';

export async function handleExotelWebhook(req: Request, res: Response): Promise<void> {
  const body = req.body as ExotelWebhookPayload;
  logger.info(`Exotel Webhook Received: ${JSON.stringify(body)}`);

  const sid = body.CallSid;
  const customField = body.CustomField;

  if (!sid && !customField) {
    res.status(200).send('OK');
    return;
  }

  // Locate existing call record by Exotel Call SID or CustomField call_log ID
  let record: CallLogRecord | undefined;
  if (customField && Number.isInteger(Number(customField))) {
    record = await get<CallLogRecord>('SELECT * FROM call_logs WHERE id = ?', [Number(customField)]);
  }
  if (!record && sid) {
    record = await get<CallLogRecord>('SELECT * FROM call_logs WHERE exotel_call_sid = ?', [sid]);
  }

  if (!record) {
    logger.warn(`Exotel Webhook: No matching call record found for SID ${sid} / CustomField ${customField}`);
    res.status(200).send('OK');
    return;
  }

  const mapped = mapExotelStatusToOutcome(body.Status);
  const durationSec = body.Duration ? Number.parseInt(body.Duration, 10) : record.duration_sec;
  const recordingUrl = body.RecordingUrl || record.recording_url;

  // Update call log idempotently
  const fields: string[] = ['status = ?', 'outcome = ?'];
  const params: unknown[] = [mapped.crmStatus, mapped.outcome];

  if (Number.isFinite(durationSec) && durationSec > 0) {
    fields.push('duration_sec = ?');
    params.push(durationSec);
  }

  if (recordingUrl) {
    fields.push('recording_url = ?');
    params.push(recordingUrl);
  }

  if (sid && !record.exotel_call_sid) {
    fields.push('exotel_call_sid = ?');
    params.push(sid);
  }

  await run(`UPDATE call_logs SET ${fields.join(', ')} WHERE id = ?`, [...params, record.id]);

  // Update lead status if lead call and answered
  if (record.lead_id && (mapped.outcome === 'Connected' || mapped.outcome === 'Not Answered')) {
    const lead = await get<{ status: string }>('SELECT status FROM leads WHERE id = ?', [record.lead_id]);
    if (lead && lead.status === 'New') {
      await run("UPDATE leads SET status = 'Attempting', last_call_at = datetime('now'), last_outcome = ? WHERE id = ?", [mapped.outcome, record.lead_id]);
    }
  }

  // Trigger in-app notification to agent
  await notify(
    record.user_id,
    'Call Completed',
    `Call to ${record.customer_phone} status: ${mapped.crmStatus}${durationSec ? ` (${durationSec}s)` : ''}`,
    record.lead_id ? `/leads/${record.lead_id}` : record.client_id ? `/clients/${record.client_id}` : undefined
  );

  res.status(200).send('OK');
}

export async function handleCallyzerWebhook(req: Request, res: Response): Promise<void> {
  try {
  const rawBody = req.body || {};
  logger.info(`Callyzer Webhook Received: ${JSON.stringify(rawBody)}`);

  // Callyzer sends an ARRAY of employee objects, each with call_logs array
  // Format: [{emp_name, emp_number, emp_country_code, call_logs:[{client_number, duration, call_type, call_recording_url, ...}]}]
  const employees: Array<Record<string, unknown>> = Array.isArray(rawBody) ? rawBody : [rawBody];

  let processedCount = 0;

  for (const emp of employees) {
    const empNumber = String(emp.emp_number || emp.employee_number || emp.agent_phone || '').replace(/[^0-9]/g, '').slice(-10);
    const empName = String(emp.emp_name || emp.employee_name || '').trim();

    // Resolve agent user by phone number
    let user = empNumber
      ? await get<{ id: number; name: string }>('SELECT id, name FROM users WHERE phone LIKE $1 LIMIT 1', [`%${empNumber}`])
      : undefined;
    if (!user) {
      user = await get<{ id: number; name: string }>('SELECT id, name FROM users WHERE role = $1 LIMIT 1', ['super_admin']);
    }
    const userId = user?.id ?? 1;

    const callLogs = Array.isArray(emp.call_logs) ? emp.call_logs : [];

    for (const item of callLogs) {
      const itemObj = item as Record<string, unknown>;

      const customerPhoneRaw = String(itemObj.client_number || itemObj.customer_phone || itemObj.phone_number || '').trim();
      const customerPhone = customerPhoneRaw.replace(/[^0-9]/g, '').slice(-10);

      if (!customerPhone) continue;

      const durationSec = Number(itemObj.duration || itemObj.duration_sec || 0);
      const recordingUrl = String(itemObj.call_recording_url || itemObj.recording_url || '').trim() || null;
      const rawCallType = String(itemObj.call_type || 'Outgoing').toUpperCase();
      const isMissed = rawCallType.includes('MISSED') || rawCallType.includes('REJECTED') || durationSec === 0;
      const outcome = isMissed ? 'Not Answered' : 'Connected';
      const note = `Callyzer ${String(itemObj.call_type || 'Outgoing')} call (${durationSec}s)${empName ? ` by ${empName}` : ''}`;

      // Resolve matching lead or client by phone number
      const lead = await get<{ id: number; name: string; status: string }>(
        'SELECT id, name, status FROM leads WHERE phone LIKE $1 ORDER BY id DESC LIMIT 1',
        [`%${customerPhone}`]
      );
      const client = !lead
        ? await get<{ id: number; name: string }>('SELECT id, name FROM clients WHERE phone LIKE $1 ORDER BY id DESC LIMIT 1', [`%${customerPhone}`])
        : undefined;

      // Insert Call Log
      await run(
        `INSERT INTO call_logs (provider, user_id, lead_id, client_id, agent_phone, customer_phone, status, outcome, duration_sec, recording_url, note)
         VALUES ('callyzer', $1, $2, $3, $4, $5, 'Completed', $6, $7, $8, $9)`,
        [
          userId,
          lead?.id ?? null,
          client?.id ?? null,
          empNumber || null,
          customerPhoneRaw,
          outcome,
          durationSec,
          recordingUrl,
          note,
        ]
      );

      // Update Lead status
      if (lead) {
        const nextStatus = lead.status === 'New' ? 'Attempting' : lead.status;
        await run(
          "UPDATE leads SET status = $1, last_call_at = now(), last_outcome = $2, updated_at = now() WHERE id = $3",
          [nextStatus, outcome, lead.id]
        );
      }

      // Notify Agent
      if (userId) {
        await notify(
          userId,
          'Callyzer Call Synced 📞',
          `Call with ${lead?.name || client?.name || customerPhoneRaw} (${durationSec}s) — ${outcome}`,
          lead ? `/leads/${lead.id}` : client ? `/clients/${client.id}` : undefined
        );
      }

      processedCount += 1;
    }
  }

  res.status(200).json({ success: true, processed: processedCount });
  } catch (err) {
    logger.error(`Callyzer Webhook Error: ${err instanceof Error ? err.message : String(err)}`);
    res.status(200).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
}

