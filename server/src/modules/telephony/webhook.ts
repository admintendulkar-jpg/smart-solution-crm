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
  const rawBody = req.body || {};
  logger.info(`Callyzer Webhook Received: ${JSON.stringify(rawBody)}`);

  // Support array wrapper or single object
  const bodyObj = Array.isArray(rawBody) ? rawBody[0] || {} : rawBody;
  
  const cleanPhone = (p: string) => {
    const digits = String(p || '').replace(/[^0-9]/g, '');
    return digits.length >= 10 ? digits.slice(-10) : digits;
  };

  const agentPhoneRaw = String(bodyObj.agent_phone || bodyObj.employee_number || bodyObj.emp_number || bodyObj.caller_number || bodyObj.employee_phone || '').trim();
  const agentPhone = cleanPhone(agentPhoneRaw);

  // 1. Resolve agent user by phone
  let user = agentPhone ? await get<{ id: number; name: string }>('SELECT id, name FROM users WHERE phone LIKE ? LIMIT 1', [`%${agentPhone}`]) : undefined;
  if (!user) {
    user = await get<{ id: number; name: string }>('SELECT id, name FROM users WHERE role = "super_admin" LIMIT 1');
  }
  const userId = user?.id ?? 1;

  // Extract call logs array if present, otherwise treat body as single call item
  const rawCallLogs = Array.isArray(bodyObj.call_logs) && bodyObj.call_logs.length > 0 ? bodyObj.call_logs : [bodyObj];

  let processedCount = 0;

  for (const item of rawCallLogs) {
    const customerPhoneRaw = String(item.customer_phone || item.client_number || item.phone_number || item.client_phone || bodyObj.customer_phone || bodyObj.client_number || '').trim();
    const customerPhone = cleanPhone(customerPhoneRaw);

    if (!customerPhone) continue;

    const durationSec = Number(item.duration || item.call_duration || item.duration_sec || 0);
    const recordingUrl = String(item.recording_url || item.call_recording_url || item.recording || '').trim() || null;
    const rawCallType = String(item.call_type || item.type || 'OUTGOING').toUpperCase();

    // 2. Resolve matching lead or client by phone number
    const lead = await get<{ id: number; name: string; status: string }>(
      'SELECT id, name, status FROM leads WHERE phone LIKE ? ORDER BY id DESC LIMIT 1',
      [`%${customerPhone}`]
    );
    const client = !lead ? await get<{ id: number; name: string }>('SELECT id, name FROM clients WHERE phone LIKE ? ORDER BY id DESC LIMIT 1', [`%${customerPhone}`]) : undefined;

    const isMissed = rawCallType.includes('MISSED') || rawCallType.includes('REJECTED') || durationSec === 0;
    const outcome = isMissed ? 'Not Answered' : 'Connected';
    const crmStatus = 'Completed';
    const note = `Callyzer ${rawCallType} call (${durationSec}s)`;

    // 3. Insert Call Log
    await run(
      `INSERT INTO call_logs (provider, user_id, lead_id, client_id, agent_phone, customer_phone, status, outcome, duration_sec, recording_url, note)
       VALUES ('callyzer', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        lead?.id ?? null,
        client?.id ?? null,
        agentPhoneRaw || null,
        customerPhoneRaw,
        crmStatus,
        outcome,
        durationSec,
        recordingUrl,
        note,
      ]
    );

    // 4. Update Lead status if lead call
    if (lead) {
      const nextStatus = lead.status === 'New' ? 'Attempting' : lead.status;
      await run(
        "UPDATE leads SET status = ?, last_call_at = datetime('now'), last_outcome = ?, updated_at = datetime('now') WHERE id = ?",
        [nextStatus, outcome, lead.id]
      );
    }

    // 5. Notify Agent
    if (userId) {
      await notify(
        userId,
        'Callyzer Call Synced 📞',
        `Call with ${lead?.name || client?.name || customerPhoneRaw} recorded (${durationSec}s)`,
        lead ? `/leads/${lead.id}` : client ? `/clients/${client.id}` : undefined
      );
    }

    processedCount += 1;
  }

  res.status(200).json({ success: true, processed: processedCount });
}
