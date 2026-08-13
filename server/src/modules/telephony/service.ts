import { all, get, run } from '../../db';
import { AppError } from '../../errors';
import { logger } from '../../logger';
import { recordAudit } from '../audit';
import { config } from '../../config';
import { makeExotelConnectCall, fetchExotelCallDetails } from './exotel';
import type { InitiateCallParams, CallLogRecord } from './types';

// In-memory idempotency lock: map key -> timestamp
const activeCallLocks = new Map<string, number>();

export function mapExotelStatusToOutcome(status?: string): { outcome: string; crmStatus: string } {
  if (!status) return { outcome: 'Initiated', crmStatus: 'Initiated' };
  const s = status.toLowerCase();
  if (s.includes('completed') || s.includes('answered')) {
    return { outcome: 'Connected', crmStatus: 'Answered' };
  }
  if (s.includes('busy')) {
    return { outcome: 'Busy', crmStatus: 'Busy' };
  }
  if (s.includes('no-answer') || s.includes('unanswered')) {
    return { outcome: 'Not Answered', crmStatus: 'No Answer' };
  }
  if (s.includes('failed')) {
    return { outcome: 'Failed', crmStatus: 'Failed' };
  }
  if (s.includes('canceled') || s.includes('cancelled')) {
    return { outcome: 'Cancelled', crmStatus: 'Cancelled' };
  }
  if (s.includes('ringing')) {
    return { outcome: 'Ringing', crmStatus: 'Ringing' };
  }
  return { outcome: 'Attempting', crmStatus: status };
}

export async function initiateClickToCall(params: InitiateCallParams, user: { id: number; role: string; phone: string | null }) {
  let leadId: number | null = null;
  let clientId: number | null = null;
  let targetName = 'Contact';
  let targetPhone = '';

  // 1. Resolve Target Entity from Database
  if (params.leadId) {
    const lead = await get<{ id: number; name: string; phone: string; assigned_to: number | null; status: string }>(
      'SELECT id, name, phone, assigned_to, status FROM leads WHERE id = ?',
      [params.leadId]
    );
    if (!lead) {
      throw new AppError(404, 'Lead not found.', 'LEAD_NOT_FOUND');
    }
    // Permission Guard
    if (user.role === 'sales' && lead.assigned_to !== user.id) {
      throw new AppError(403, 'You can only call leads assigned to you.', 'FORBIDDEN');
    }
    if (user.role === 'service') {
      throw new AppError(403, 'Service team cannot call leads.', 'FORBIDDEN');
    }
    if (user.role === 'hr') {
      throw new AppError(403, 'HR role does not have telephony access.', 'FORBIDDEN');
    }
    leadId = lead.id;
    targetName = lead.name;
    targetPhone = lead.phone;
  } else if (params.clientId) {
    const client = await get<{ id: number; name: string; phone: string; assigned_to: number | null; sales_person_id: number | null }>(
      'SELECT id, name, phone, assigned_to, sales_person_id FROM clients WHERE id = ?',
      [params.clientId]
    );
    if (!client) {
      throw new AppError(404, 'Client not found.', 'CLIENT_NOT_FOUND');
    }
    if (user.role === 'sales' && client.sales_person_id !== user.id && client.assigned_to !== user.id) {
      throw new AppError(403, 'You can only call clients assigned to you.', 'FORBIDDEN');
    }
    if (user.role === 'hr') {
      throw new AppError(403, 'HR role does not have telephony access.', 'FORBIDDEN');
    }
    clientId = client.id;
    targetName = client.name;
    targetPhone = client.phone;
  } else {
    throw new AppError(400, 'Either leadId or clientId must be provided.', 'INVALID_INPUT');
  }

  if (!targetPhone || targetPhone.trim().length < 10) {
    throw new AppError(400, 'Customer phone number is not available.', 'PHONE_UNAVAILABLE');
  }

  // 2. Resolve Agent Phone Number
  const agentPhone = config.telephony.testAgentPhone || user.phone;
  if (!agentPhone || agentPhone.trim().length < 10) {
    throw new AppError(400, 'Your account does not have a valid registered phone number for placing calls.', 'AGENT_PHONE_MISSING');
  }

  // 3. Idempotency Check (Prevent duplicate call clicks within 3s)
  const lockKey = `${user.id}:${leadId || clientId}`;
  const lastCallTime = activeCallLocks.get(lockKey) ?? 0;
  if (Date.now() - lastCallTime < 3000) {
    throw new AppError(429, 'A call is already being initiated. Please wait a moment.', 'DUPLICATE_CALL_REQUEST');
  }
  activeCallLocks.set(lockKey, Date.now());

  // 4. Create Pending Call Record in DB
  const initialLog = await run(
    `INSERT INTO call_logs (lead_id, client_id, user_id, outcome, duration_sec, note, provider, agent_phone, customer_phone, status)
     VALUES (?, ?, ?, 'Initiated', 0, ?, 'exotel', ?, ?, 'Initiated')`,
    [leadId, clientId, user.id, `Exotel Click-to-Call initiated for ${targetName}`, agentPhone, targetPhone]
  );
  const callLogId = initialLog.lastInsertRowid;

  // 5. Trigger Exotel API
  try {
    const callbackUrl = `${config.appOrigin.replace(/\/$/, '')}/api/telephony/exotel/webhook`;
    const result = await makeExotelConnectCall({
      agentPhone,
      customerPhone: targetPhone,
      callbackUrl,
      customField: String(callLogId),
    });

    await run('UPDATE call_logs SET exotel_call_sid = ?, status = ? WHERE id = ?', [result.sid, result.status, callLogId]);

    await recordAudit(user.id, 'telephony.call_initiated', leadId ? 'lead' : 'client', (leadId || clientId)!, `Initiated Exotel call to ${targetName} (${targetPhone})`);

    return {
      callLogId,
      exotelCallSid: result.sid,
      status: result.status,
      message: 'Call initiated. Exotel is connecting your phone first.',
    };
  } catch (err) {
    activeCallLocks.delete(lockKey);
    await run("UPDATE call_logs SET status = 'Failed', outcome = 'Failed' WHERE id = ?", [callLogId]);
    if (err instanceof AppError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new AppError(400, msg, 'EXOTEL_CALL_FAILED');
  }
}

export async function reconcileCallLogStatus(callLogId: number): Promise<CallLogRecord | null> {
  const callLog = await get<CallLogRecord>('SELECT * FROM call_logs WHERE id = ?', [callLogId]);
  if (!callLog || !callLog.exotel_call_sid) return callLog ?? null;

  // If call status is still pending, fetch live status from Exotel API
  if (!callLog.status || ['Initiated', 'Ringing', 'in-progress'].includes(callLog.status)) {
    const details = await fetchExotelCallDetails(callLog.exotel_call_sid);
    if (details?.status) {
      const mapped = mapExotelStatusToOutcome(details.status);
      const fields: string[] = ['status = ?', 'outcome = ?'];
      const params: unknown[] = [mapped.crmStatus, mapped.outcome];

      if (details.recordingUrl) {
        fields.push('recording_url = ?');
        params.push(details.recordingUrl);
      }

      await run(`UPDATE call_logs SET ${fields.join(', ')} WHERE id = ?`, [...params, callLogId]);
      return (await get<CallLogRecord>('SELECT * FROM call_logs WHERE id = ?', [callLogId])) ?? null;
    }
  }

  return callLog;
}
