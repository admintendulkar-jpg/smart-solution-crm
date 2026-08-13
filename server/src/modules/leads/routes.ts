import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config';
import { requireAdminOrAbove, requireAuth, requireSalesOrAbove } from '../../auth/guards';
import { BRANCHES, CALL_OUTCOMES, LEAD_SOURCES, LEAD_STATUSES, SETTINGS_KEYS, SERVICES } from '../../constants';
import { all, get, run, transaction } from '../../db';
import { AppError, asyncHandler } from '../../errors';
import type { AuthUser } from '../../types';
import { addBusinessDays, isPast, nowIso, startOfDayLocal } from '../../utils/time';
import { recordAudit } from '../audit';
import { notify } from '../notifications';

const router = Router();

router.use(requireAuth);

export interface LeadRow {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  whatsapp: string | null;
  source: string;
  service: string;
  branch: string;
  status: string;
  assigned_to: number | null;
  assigned_name: string | null;
  follow_up_at: string | null;
  last_call_at: string | null;
  last_outcome: string | null;
  is_duplicate: number;
  duplicate_of: number | null;
  is_overdue: number;
  priority: string;
  created_at: string;
  [key: string]: unknown;
}

const LEAD_SELECT = `
  SELECT l.*, u.name AS assigned_name,
    CASE WHEN l.follow_up_at IS NOT NULL AND l.follow_up_at < ? AND l.status = 'Follow-up' THEN 1 ELSE 0 END AS is_overdue
  FROM leads l
  LEFT JOIN users u ON u.id = l.assigned_to
`;

async function assertLeadVisible(leadId: number, user: AuthUser, allowAdmin: boolean): Promise<LeadRow> {
  const lead = await get<LeadRow>(`${LEAD_SELECT} WHERE l.id = ?`, [nowIso(), leadId]);
  if (!lead) {
    throw new AppError(404, 'Lead not found.', 'LEAD_NOT_FOUND');
  }
  if (allowAdmin && ['super_admin', 'admin'].includes(user.role)) {
    return lead;
  }
  if (user.role !== 'sales' || lead.assigned_to !== user.id) {
    throw new AppError(403, 'This lead is not assigned to you.', 'FORBIDDEN');
  }
  return lead;
}

async function getSetting(key: string, fallback: string): Promise<string> {
  return (await get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]))?.value ?? fallback;
}

const callOutcomeSchema = z.object({
  outcome: z.enum(CALL_OUTCOMES),
  durationSec: z.number().int().min(0).max(7200).default(0),
  note: z.string().trim().max(2000).optional(),
  followUpAt: z.string().datetime().optional(),
});

const followUpSchema = z.object({
  scheduledAt: z.string().datetime({ message: 'Select a valid date and time' }),
  note: z.string().trim().max(2000).optional(),
});

const noteSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

const convertSchema = z.object({
  service: z.enum(SERVICES),
  packagePlan: z.string().trim().min(1).max(200),
  amount: z.number().min(0).max(10_000_000),
  whatsapp: z.string().trim().min(10).max(15).optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  notes: z.string().trim().max(4000).optional(),
  paymentStatus: z.enum(['Pending', 'Partial', 'Paid']).default('Pending'),
  paymentMethod: z.enum(['UPI', 'Bank Transfer', 'Cash', 'Card', 'Gateway']).optional(),
  amountPaid: z.number().min(0).max(10_000_000).optional(),
  serviceDescription: z.string().trim().max(4000).optional(),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  alternatePhone: z.string().trim().min(10).max(15).optional(),
  address: z.string().trim().max(1000).optional(),
  transactionRef: z.string().trim().max(200).optional(),
});

const assignSchema = z.object({
  userId: z.number().int().positive(),
});

const editLeadSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().min(10).max(15).optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  whatsapp: z.string().trim().min(10).max(15).optional().or(z.literal('')),
  source: z.enum(LEAD_SOURCES).optional(),
  service: z.enum(SERVICES).optional(),
  branch: z.enum(BRANCHES).optional(),
});

const prioritySchema = z.object({
  priority: z.enum(['Hot', 'Warm', 'Normal', 'Cold']),
});

const bulkAssignSchema = z.object({
  leadIds: z.array(z.number().int().positive()).min(1).max(500),
  userId: z.number().int().positive(),
});

router.get(
  '/mine',
  requireSalesOrAbove,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const { status, search } = req.query;
    const conditions: string[] = ["l.assigned_to = ?"];
    const params: unknown[] = [nowIso(), user.id];

    if (typeof status === 'string' && status) {
      if (status === 'Overdue') {
        conditions.push("l.status = 'Follow-up' AND l.follow_up_at < ?");
        params.push(nowIso());
      } else if (LEAD_STATUSES.includes(status as (typeof LEAD_STATUSES)[number])) {
        conditions.push('l.status = ?');
        params.push(status);
      }
    } else {
      conditions.push("l.status NOT IN ('Converted', 'Not Interested')");
    }
    if (typeof search === 'string' && search.trim()) {
      conditions.push('(l.name LIKE ? OR l.phone LIKE ? OR l.email LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    const leads = await all<LeadRow>(
      `${LEAD_SELECT} WHERE ${conditions.join(' AND ')}
       ORDER BY is_overdue DESC,
         CASE l.status WHEN 'Follow-up' THEN 0 WHEN 'Attempting' THEN 1 WHEN 'New' THEN 2 ELSE 3 END,
         l.follow_up_at IS NULL, l.follow_up_at ASC, l.created_at ASC`,
      params,
    );
    res.json({ leads });
  }),
);

router.get(
  '/stats',
  requireSalesOrAbove,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const todayStart = startOfDayLocal(new Date()).toISOString();

    const count = async (sql: string, params: unknown[] = []): Promise<number> =>
      (await get<{ c: number }>(sql, params))?.c ?? 0;

    const assignedTotal = await count(
      `SELECT COUNT(*) AS c FROM leads WHERE assigned_to = ? AND status != 'Converted'`,
      [user.id],
    );
    const todayAssigned = await count(
      `SELECT COUNT(*) AS c FROM leads WHERE assigned_to = ? AND assigned_at >= ?`,
      [user.id, todayStart],
    );
    const calledToday = await count(
      `SELECT COUNT(*) AS c FROM call_logs WHERE user_id = ? AND created_at >= ?`,
      [user.id, todayStart],
    );
    const connectedToday = await count(
      `SELECT COUNT(*) AS c FROM call_logs WHERE user_id = ? AND outcome = 'Connected' AND created_at >= ?`,
      [user.id, todayStart],
    );
    const convertedToday = await count(
      `SELECT COUNT(*) AS c FROM clients WHERE sales_person_id = ? AND created_at >= ?`,
      [user.id, todayStart],
    );
    const convertedTotal = await count(
      `SELECT COUNT(*) AS c FROM clients WHERE sales_person_id = ?`,
      [user.id],
    );
    const followUpsDueToday = await count(
      `SELECT COUNT(*) AS c FROM leads
       WHERE assigned_to = ? AND status = 'Follow-up' AND follow_up_at < ?`,
      [user.id, todayStart],
    );
    const followUpsDueLater = await count(
      `SELECT COUNT(*) AS c FROM leads
       WHERE assigned_to = ? AND status = 'Follow-up' AND follow_up_at >= ?`,
      [user.id, todayStart],
    );

    res.json({
      assignedTotal,
      todayAssigned,
      calledToday,
      connectedToday,
      convertedToday,
      convertedTotal,
      followUpsDueToday,
      followUpsDueLater,
    });
  }),
);

router.get(
  '/duplicates',
  requireAdminOrAbove,
  asyncHandler(async (_req, res) => {
    const rows = await all<LeadRow>(
      `${LEAD_SELECT} WHERE l.id IN (
         SELECT l2.id FROM leads l2 WHERE EXISTS (
           SELECT 1 FROM leads o
           WHERE o.id != l2.id
             AND (o.phone = l2.phone OR (l2.email IS NOT NULL AND o.email = l2.email))
         )
       ) ORDER BY l.created_at DESC LIMIT 2000`,
      [nowIso()],
    );

    const groups: { key: string; phone: string | null; email: string | null; canonical: LeadRow | null; duplicates: LeadRow[] }[] = [];
    const byKey = new Map<string, typeof groups[number]>();

    for (const row of rows) {
      const key = row.phone || row.email || `row-${row.id}`;
      let group = byKey.get(key);
      if (!group) {
        group = { key, phone: row.phone, email: row.email, canonical: null, duplicates: [] };
        byKey.set(key, group);
        groups.push(group);
      }
      group.duplicates.push(row);
    }

    for (const group of groups) {
      const canonical = group.duplicates.find((d) => d.is_duplicate === 0 && d.duplicate_of === null);
      if (canonical) {
        group.canonical = canonical;
        group.duplicates = group.duplicates.filter((d) => d.id !== canonical.id);
      } else if (group.duplicates.length > 1) {
        group.canonical = group.duplicates[0];
        group.duplicates = group.duplicates.slice(1);
      }
    }

    res.json({ groups: groups.filter((g) => g.duplicates.length > 0) });
  }),
);

router.post(
  '/:id/resolve-duplicate',
  requireAdminOrAbove,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const lead = await assertLeadVisible(Number(req.params.id), user, true);
    const targetId = req.body?.targetId ? Number(req.body.targetId) : lead.id;

    const canonical = targetId === lead.id ? lead.id : targetId;
    if (targetId !== lead.id) {
      const target = await get<{ id: number }>('SELECT id FROM leads WHERE id = ?', [targetId]);
      if (!target) {
        throw new AppError(404, 'Target lead not found.', 'LEAD_NOT_FOUND');
      }
      const targetLead = await get<LeadRow>(`${LEAD_SELECT} WHERE l.id = ?`, [nowIso(), targetId]);
      const sameGroup =
        targetLead &&
        (targetLead.phone === lead.phone ||
          (lead.email && targetLead.email && targetLead.email === lead.email));
      if (!sameGroup) {
        throw new AppError(400, 'Leads do not share a phone or email — cannot merge.', 'NOT_DUPLICATES');
      }
    }

    const canonicalRow = await get<LeadRow>(`${LEAD_SELECT} WHERE l.id = ?`, [nowIso(), canonical]);
    if (!canonicalRow) {
      throw new AppError(404, 'Canonical lead not found.', 'LEAD_NOT_FOUND');
    }

    await run(
      "UPDATE leads SET is_duplicate = 0, duplicate_of = NULL, updated_at = datetime('now') WHERE id = ?",
      [canonical],
    );

    const others = await all<{ id: number }>(
      `SELECT id FROM leads WHERE id != ? AND
        (phone = ? OR (email IS NOT NULL AND ? IS NOT NULL AND email = ?))`,
      [canonical, canonicalRow.phone, canonicalRow.email, canonicalRow.email],
    );
    for (const other of others) {
      await run("UPDATE leads SET is_duplicate = 1, duplicate_of = ?, updated_at = datetime('now') WHERE id = ?", [
        canonical,
        other.id,
      ]);
    }

    await recordAudit(
      user.id,
      'lead.resolve_duplicate',
      'lead',
      lead.id,
      `Resolved duplicate group: canonical #${canonical}, ${others.length} merged`,
    );

    res.json({ canonicalId: canonical, merged: others.length });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const lead = await assertLeadVisible(Number(req.params.id), user, true);
    const calls = await all(
      `SELECT c.*, u.name AS user_name FROM call_logs c
       JOIN users u ON u.id = c.user_id WHERE c.lead_id = ? ORDER BY c.created_at DESC`,
      [lead.id],
    );
    const notes = await all(
      `SELECT n.*, u.name AS user_name FROM lead_notes n
       JOIN users u ON u.id = n.user_id WHERE n.lead_id = ? ORDER BY n.created_at DESC`,
      [lead.id],
    );
    const duplicateOf = lead.duplicate_of
      ? await get<{ id: number; name: string; phone: string }>('SELECT id, name, phone FROM leads WHERE id = ?', [
          lead.duplicate_of,
        ])
      : null;
    const events = await all(
      `SELECT a.id, a.action, a.entity, a.entity_id, a.detail, a.created_at, u.name AS user_name
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.entity = 'lead' AND a.entity_id = ?
       ORDER BY a.created_at DESC`,
      [lead.id],
    );
    res.json({ lead, calls, notes, duplicateOf, events });
  }),
);

router.post(
  '/:id/call',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const body = callOutcomeSchema.parse(req.body);
    // allowAdmin=true: admins can log calls on any lead, not just their own
    const lead = await assertLeadVisible(Number(req.params.id), user, true);

    if (body.outcome === 'Call Back Later' && !body.followUpAt) {
      throw new AppError(400, 'A follow-up date is required when the outcome is "Call Back Later".', 'FOLLOWUP_REQUIRED');
    }

    let nextStatus: string;
    switch (body.outcome) {
      case 'Connected':
        nextStatus = lead.status === 'New' ? 'Attempting' : lead.status;
        break;
      case 'Not Answered':
        nextStatus = 'Attempting';
        break;
      case 'Call Back Later':
        nextStatus = 'Follow-up';
        break;
      case 'Not Interested':
        nextStatus = 'Not Interested';
        break;
      case 'Converted':
        // Conversion happens via POST /:id/convert — logging the outcome alone
        // must not mark the lead converted, or the client record never gets created.
        nextStatus = lead.status;
        break;
      default:
        nextStatus = lead.status;
    }

    const callId = (
      await run(
        'INSERT INTO call_logs (lead_id, user_id, outcome, duration_sec, note) VALUES (?, ?, ?, ?, ?)',
        [lead.id, user.id, body.outcome, body.durationSec, body.note ?? null],
      )
    ).lastInsertRowid;

    const followUpAt = body.followUpAt ?? null;
    await run(
      `UPDATE leads SET status = ?, follow_up_at = COALESCE(?, follow_up_at),
       last_call_at = ?, last_outcome = ?, updated_at = datetime('now') WHERE id = ?`,
      [nextStatus, followUpAt, nowIso(), body.outcome, lead.id],
    );

    await recordAudit(
      user.id,
      'lead.call',
      'lead',
      lead.id,
      `${body.outcome} on ${lead.name} (${lead.phone})`,
    );

    res.status(201).json({ id: callId, status: nextStatus });
  }),
);

router.post(
  '/:id/follow-up',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const body = followUpSchema.parse(req.body);
    // allowAdmin=true: admins can schedule follow-ups on any lead
    const lead = await assertLeadVisible(Number(req.params.id), user, true);

    await run(
      "UPDATE leads SET follow_up_at = ?, status = 'Follow-up', updated_at = datetime('now') WHERE id = ?",
      [body.scheduledAt, lead.id],
    );
    if (body.note) {
      await run('INSERT INTO lead_notes (lead_id, user_id, body) VALUES (?, ?, ?)', [
        lead.id,
        user.id,
        `Follow-up scheduled: ${body.note}`,
      ]);
    }
    await recordAudit(user.id, 'lead.followup', 'lead', lead.id, `Follow-up on ${body.scheduledAt}`);

    res.status(201).json({ success: true, status: 'Follow-up' });
  }),
);

router.post(
  '/:id/notes',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const body = noteSchema.parse(req.body);
    const lead = await assertLeadVisible(Number(req.params.id), user, true);

    const noteId = (
      await run('INSERT INTO lead_notes (lead_id, user_id, body) VALUES (?, ?, ?)', [
        lead.id,
        user.id,
        body.body,
      ])
    ).lastInsertRowid;

    res.status(201).json({ id: noteId });
  }),
);

router.post(
  '/:id/convert',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const body = convertSchema.parse(req.body);
    // allowAdmin=true: admins can convert any lead
    const lead = await assertLeadVisible(Number(req.params.id), user, true);

    if (lead.status === 'Converted') {
      const existingClient = await get<{ id: number }>('SELECT id FROM clients WHERE lead_id = ?', [lead.id]);
      if (existingClient) {
        throw new AppError(409, 'This lead is already converted.', 'ALREADY_CONVERTED');
      }
      // A legacy "Converted" status with no client record (e.g. a call outcome
      // logged before conversion) is allowed through so the client gets created.
    }

    const slaDays = Number(await getSetting(SETTINGS_KEYS.slaBusinessDays, '4')) || 4;
    const dueDate = body.deliveryDate
      ? new Date(`${body.deliveryDate}T23:59:59`)
      : addBusinessDays(new Date(), slaDays);

    const serviceRep = await get<{ id: number }>(
      `SELECT id FROM users WHERE role = 'service' AND active = 1
       ORDER BY (SELECT COUNT(*) FROM clients WHERE assigned_to = users.id) ASC, id ASC LIMIT 1`,
    );

    // sales_person_id: if admin converts, use the lead's assigned sales rep (not the admin)
    const salesPersonId = lead.assigned_to ?? user.id;

    const paymentStatus = body.paymentStatus ?? 'Pending';
    const clientId = (
      await run(
        `INSERT INTO clients (lead_id, name, phone, email, whatsapp, service, package_plan, amount,
           payment_status, source, sales_person_id, assigned_to, status, due_date, guarantee_status,
           address, alternate_phone, service_description, transaction_ref)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', ?, 'Guarantee Active', ?, ?, ?, ?)`,
        [
          lead.id,
          lead.name,
          lead.phone,
          body.email?.trim() || null,
          body.whatsapp ?? null,
          body.service,
          body.packagePlan,
          body.amount,
          paymentStatus,
          lead.source,
          salesPersonId,
          serviceRep?.id ?? null,
          dueDate.toISOString(),
          body.address ?? null,
          body.alternatePhone ?? null,
          body.serviceDescription ?? null,
          body.transactionRef ?? null,
        ],
      )
    ).lastInsertRowid;

    if ((body.amountPaid ?? 0) > 0) {
      await run(
        `INSERT INTO payments (client_id, amount, method, status, gateway_ref)
         VALUES (?, ?, ?, 'Confirmed', ?)`,
        [clientId, body.amountPaid, body.paymentMethod ?? 'Gateway', body.transactionRef ?? `manual-${Date.now()}`],
      );
    }

    const paidRow = await get<{ paid: number }>(
      "SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE client_id = ? AND status = 'Confirmed'",
      [clientId],
    );
    const totalPaid = paidRow?.paid ?? 0;
    const computedPaymentStatus = totalPaid >= body.amount ? 'Paid' : totalPaid > 0 ? 'Partial' : 'Pending';
    await run("UPDATE clients SET payment_status = ? WHERE id = ?", [computedPaymentStatus, clientId]);

    await run(
      "UPDATE leads SET status = 'Converted', last_outcome = 'Converted', updated_at = datetime('now') WHERE id = ?",
      [lead.id],
    );

    if (body.notes) {
      await run('INSERT INTO client_notes (client_id, user_id, body) VALUES (?, ?, ?)', [
        clientId,
        user.id,
        body.notes,
      ]);
    }

    if (serviceRep) {
      await notify(serviceRep.id, 'New client assigned', `${lead.name} (${body.service}) is in your delivery queue.`, `/clients/${clientId}`);
    }

    await recordAudit(
      user.id,
      'lead.convert',
      'lead',
      lead.id,
      `Converted to client #${clientId} (${body.service} / ${body.packagePlan} / ${body.amount})`,
    );

    res.status(201).json({ clientId, dueDate: dueDate.toISOString() });
  }),
);

router.post(
  '/:id/revert',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const lead = await assertLeadVisible(Number(req.params.id), user, true);

    if (lead.status !== 'Converted') {
      throw new AppError(400, 'Only converted leads can be reverted.', 'NOT_CONVERTED');
    }

    const client = await get<{ id: number; name: string; assigned_to: number | null }>(
      'SELECT id, name, assigned_to FROM clients WHERE lead_id = ?',
      [lead.id],
    );

    if (client) {
      const payments = await all<{ id: number; proof_path: string | null }>(
        'SELECT id, proof_path FROM payments WHERE client_id = ?',
        [client.id],
      );
      for (const payment of payments) {
        if (payment.proof_path) {
          try {
            fs.unlinkSync(path.join(config.uploadDir, payment.proof_path));
          } catch {
            // proof file already gone — nothing to clean up
          }
        }
      }
      await run('DELETE FROM payments WHERE client_id = ?', [client.id]);
      await run('DELETE FROM client_notes WHERE client_id = ?', [client.id]);
      await run('DELETE FROM clients WHERE id = ?', [client.id]);
    }

    const lastCall = await get<{ outcome: string }>(
      `SELECT outcome FROM call_logs WHERE lead_id = ? AND outcome != 'Converted' ORDER BY id DESC LIMIT 1`,
      [lead.id],
    );

    let restored = 'New';
    if (lastCall) {
      switch (lastCall.outcome) {
        case 'Call Back Later':
          restored = 'Follow-up';
          break;
        case 'Connected':
        case 'Not Answered':
          restored = 'Attempting';
          break;
        case 'Not Interested':
          restored = 'Not Interested';
          break;
      }
    }

    await run(
      "UPDATE leads SET status = ?, last_outcome = ?, updated_at = datetime('now') WHERE id = ?",
      [restored, lastCall?.outcome ?? null, lead.id],
    );

    if (client?.assigned_to) {
      await notify(client.assigned_to, 'Client reverted', `${lead.name} was moved back to the sales queue.`, `/leads/${lead.id}`);
    }

    await recordAudit(
      user.id,
      'lead.revert',
      'lead',
      lead.id,
      client
        ? `Reverted client #${client.id} — lead back to '${restored}'`
        : `Reverted converted status — lead back to '${restored}'`,
    );

    res.json({ success: true, status: restored });
  }),
);

router.post(
  '/:id/assign',
  requireAdminOrAbove,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const body = assignSchema.parse(req.body);
    const lead = await assertLeadVisible(Number(req.params.id), user, true);

    const target = await get<{ id: number; name: string; role: string; active: number }>(
      'SELECT id, name, role, active FROM users WHERE id = ?',
      [body.userId],
    );
    if (!target || target.active !== 1) {
      throw new AppError(400, 'Target user is not active.', 'INVALID_USER');
    }
    if (target.role !== 'sales') {
      throw new AppError(400, 'Leads can only be assigned to sales reps.', 'INVALID_ROLE');
    }

    const previous = lead.assigned_to ?? null;
    await run(
      "UPDATE leads SET assigned_to = ?, assigned_at = ?, status = CASE WHEN status = 'Not Interested' THEN 'New' ELSE status END, updated_at = datetime('now') WHERE id = ?",
      [target.id, nowIso(), lead.id],
    );

    await notify(target.id, 'New lead assigned', `${lead.name} (${lead.phone}) is now in your queue.`, `/leads/${lead.id}`);
    if (previous && previous !== target.id) {
      const prevUser = await get<{ id: number; name: string }>('SELECT id, name FROM users WHERE id = ?', [previous]);
      if (prevUser) {
        await notify(previous, 'Lead reassigned', `${lead.name} was moved out of your queue.`);
      }
    }

    await recordAudit(user.id, 'lead.assign', 'lead', lead.id, `Assigned to ${target.name} (from ${previous ?? 'unassigned'})`);

    res.json({ success: true });
  }),
);

router.patch(
  '/:id',
  requireAdminOrAbove,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const body = editLeadSchema.parse(req.body);
    const lead = await assertLeadVisible(Number(req.params.id), user, true);

    const updates: string[] = [];
    const params: unknown[] = [];
    const changed: string[] = [];

    const pushField = (field: string, value: string | null, label: string): void => {
      const before = lead[field];
      if (String(before ?? '') === String(value ?? '')) return;
      updates.push(`${field} = ?`);
      params.push(value);
      changed.push(`${label}: ${before ?? '—'} → ${value ?? '—'}`);
    };

    if (body.name !== undefined) pushField('name', body.name, 'Name');
    if (body.phone !== undefined) pushField('phone', body.phone, 'Phone');
    if (body.email !== undefined) pushField('email', body.email ? body.email.toLowerCase() : null, 'Email');
    if (body.whatsapp !== undefined) pushField('whatsapp', body.whatsapp ? body.whatsapp : null, 'WhatsApp');
    if (body.source !== undefined) pushField('source', body.source, 'Source');
    if (body.service !== undefined) pushField('service', body.service, 'Service');
    if (body.branch !== undefined) pushField('branch', body.branch, 'Branch');

    if (updates.length === 0) {
      throw new AppError(400, 'No fields were changed.', 'NOTHING_TO_UPDATE');
    }

    if (body.phone) {
      const dup = await get<{ id: number }>('SELECT id FROM leads WHERE phone = ? AND id != ? LIMIT 1', [body.phone, lead.id]);
      if (dup) {
        throw new AppError(409, 'Another lead already uses this phone number.', 'DUPLICATE_PHONE');
      }
    }
    if (body.email) {
      const dup = await get<{ id: number }>('SELECT id FROM leads WHERE email = ? AND id != ? LIMIT 1', [body.email.toLowerCase(), lead.id]);
      if (dup) {
        throw new AppError(409, 'Another lead already uses this email.', 'DUPLICATE_EMAIL');
      }
    }

    updates.push("updated_at = datetime('now')");
    await run(`UPDATE leads SET ${updates.join(', ')} WHERE id = ?`, [...params, lead.id]);

    await recordAudit(user.id, 'lead.edit', 'lead', lead.id, changed.length ? changed.join('; ') : 'Lead details updated');

    const updated = await get<LeadRow>(`${LEAD_SELECT} WHERE l.id = ?`, [nowIso(), lead.id]);
    res.json({ lead: updated });
  }),
);

router.patch(
  '/:id/priority',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const body = prioritySchema.parse(req.body);
    const lead = await assertLeadVisible(Number(req.params.id), user, true);

    if (lead.priority !== body.priority) {
      await run("UPDATE leads SET priority = ?, updated_at = datetime('now') WHERE id = ?", [body.priority, lead.id]);
      await recordAudit(user.id, 'lead.priority', 'lead', lead.id, `Priority ${lead.priority} → ${body.priority}`);
    }

    res.json({ success: true, priority: body.priority });
  }),
);

router.post(
  '/bulk-assign',
  requireAdminOrAbove,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const body = bulkAssignSchema.parse(req.body);

    const target = await get<{ id: number; name: string; role: string; active: number }>(
      'SELECT id, name, role, active FROM users WHERE id = ?',
      [body.userId],
    );
    if (!target || target.active !== 1) {
      throw new AppError(400, 'Target user is not active.', 'INVALID_USER');
    }
    if (target.role !== 'sales') {
      throw new AppError(400, 'Leads can only be assigned to sales reps.', 'INVALID_ROLE');
    }

    const uniqueIds = [...new Set(body.leadIds)];
    const placeholders = uniqueIds.map(() => '?').join(',');
    const found = await all<{ id: number }>(`SELECT id FROM leads WHERE id IN (${placeholders})`, uniqueIds);
    const foundIds = new Set(found.map((f) => f.id));
    const missing = uniqueIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new AppError(404, `Leads not found: ${missing.join(', ')}`, 'LEAD_NOT_FOUND');
    }

    const now = nowIso();
    await transaction(async () => {
      for (const id of uniqueIds) {
        await run(
          "UPDATE leads SET assigned_to = ?, assigned_at = ?, status = CASE WHEN status = 'Not Interested' THEN 'New' ELSE status END, updated_at = datetime('now') WHERE id = ?",
          [target.id, now, id],
        );
      }
    });

    await notify(target.id, 'New leads assigned', `${uniqueIds.length} leads were assigned to you by ${user.name}.`, '/leads');
    await recordAudit(user.id, 'lead.bulk_assign', 'lead', null, `Bulk assigned ${uniqueIds.length} leads to ${target.name}`);

    res.json({ success: true, assigned: uniqueIds.length });
  }),
);

router.get(
  '/',
  requireAdminOrAbove,
  asyncHandler(async (req, res) => {
    const { status, source, search, rep, branch, priority, from, to } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [nowIso()];

    if (typeof status === 'string' && status) {
      conditions.push('l.status = ?');
      params.push(status);
    }
    if (typeof source === 'string' && source) {
      conditions.push('l.source = ?');
      params.push(source);
    }
    if (typeof priority === 'string' && ['Hot', 'Warm', 'Normal', 'Cold'].includes(priority)) {
      conditions.push('l.priority = ?');
      params.push(priority);
    }
    if (typeof rep === 'string' && rep && rep !== 'all') {
      conditions.push('l.assigned_to = ?');
      params.push(Number(rep));
    }
    if (typeof branch === 'string' && branch) {
      conditions.push('l.branch = ?');
      params.push(branch);
    }
    if (typeof search === 'string' && search.trim()) {
      conditions.push('(l.name LIKE ? OR l.phone LIKE ? OR l.email LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }
    if (typeof from === 'string' && from) {
      conditions.push('l.created_at >= ?');
      params.push(from);
    }
    if (typeof to === 'string' && to) {
      conditions.push('l.created_at <= ?');
      params.push(to);
    }

    const page = Math.max(1, Number.parseInt(String(req.query.page ?? ''), 10) || 1);
    const pageSize = Math.min(200, Math.max(1, Number.parseInt(String(req.query.pageSize ?? ''), 10) || 25));

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = (await get<{ c: number }>(`SELECT COUNT(*) AS c FROM leads l ${where}`, params.slice(1)))?.c ?? 0;

    const leads = await all<LeadRow>(
      `${LEAD_SELECT} ${where}
       ORDER BY CASE l.priority WHEN 'Hot' THEN 0 WHEN 'Warm' THEN 1 WHEN 'Normal' THEN 2 ELSE 3 END,
         l.updated_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    res.json({ leads, total, page, pageSize });
  }),
);

export const leadsRoutes = router;
