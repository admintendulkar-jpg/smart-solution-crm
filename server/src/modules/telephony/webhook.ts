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
