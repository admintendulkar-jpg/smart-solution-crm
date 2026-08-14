import { Router } from 'express';
import { z } from 'zod';
import { requireAdminOrAbove, requireAuth, requireSuperAdmin } from '../../auth/guards';
import { BRANCHES, SETTINGS_KEYS } from '../../constants';
import { all, get, run } from '../../db';
import { asyncHandler } from '../../errors';
import { recordAudit } from '../audit';
import { markAllRead } from '../notifications';

const router = Router();

router.use(requireAuth);

const settingsSchema = z.object({
  [SETTINGS_KEYS.dailyLeadQuota]: z.number().int().min(1).max(10000).optional(),
  [SETTINGS_KEYS.leadSplitEnabled]: z.boolean().optional(),
  [SETTINGS_KEYS.defaultBranch]: z.enum(BRANCHES).optional(),
  [SETTINGS_KEYS.slaBusinessDays]: z.number().int().min(1).max(30).optional(),
});

const ALL_SETTING_KEYS = Object.values(SETTINGS_KEYS);

router.get(
  '/settings',
  requireSuperAdmin,
  asyncHandler(async (_req, res) => {
    const rows = await all<{ key: string; value: string; updated_at: string }>(
      'SELECT key, value, updated_at FROM settings WHERE key IN (' +
        ALL_SETTING_KEYS.map(() => '?').join(',') +
        ')',
      ALL_SETTING_KEYS,
    );
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    res.json({ settings });
  }),
);

router.put(
  '/settings',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const body = settingsSchema.parse(req.body);
    const me = req.user!;

    const entries: [string, string][] = [];
    for (const [key, value] of Object.entries(body)) {
      entries.push([key, typeof value === 'boolean' ? String(value) : String(value)]);
    }

    for (const [key, value] of entries) {
      await run(
        `INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = datetime('now')`,
        [key, value, me.id],
      );
    }

    await recordAudit(me.id, 'settings.update', 'settings', null, entries.map(([k, v]) => `${k}=${v}`).join(', '));
    res.json({ success: true });
  }),
);

router.get(
  '/audit',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const { entity, entityId, limit } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (typeof entity === 'string' && entity) {
      conditions.push('a.entity = ?');
      params.push(entity);
    }
    if (entityId !== undefined && entityId !== '') {
      conditions.push('a.entity_id = ?');
      params.push(Number(entityId));
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const take = Math.min(Math.max(Number(limit) || 100, 1), 500);

    const entries = await all(
      `SELECT a.*, u.name AS user_name FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id
       ${where} ORDER BY a.id DESC LIMIT ?`,
      [...params, take],
    );
    res.json({ entries });
  }),
);

router.get(
  '/dashboard',
  requireAdminOrAbove,
  asyncHandler(async (_req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.toISOString();

    const count = async (sql: string, params: unknown[] = []): Promise<number> =>
      (await get<{ c: number }>(sql, params))?.c ?? 0;

    const reps = await all<{ id: number; name: string; branch: string; assigned: number; calls: number; converted: number }>(
      `SELECT u.id, u.name, u.branch,
         (SELECT COUNT(*) FROM leads l WHERE l.assigned_to = u.id AND l.status != 'Converted') AS assigned,
         (SELECT COUNT(*) FROM call_logs c WHERE c.user_id = u.id) AS calls,
         (SELECT COUNT(*) FROM clients cl WHERE cl.sales_person_id = u.id) AS converted
       FROM users u WHERE u.role = 'sales' AND u.active = 1 ORDER BY u.name`,
    );

    const pipeline: Record<string, number> = {};
    for (const row of await all<{ status: string; c: number }>(
      `SELECT status, COUNT(*) AS c FROM leads WHERE status != 'Converted' GROUP BY status`,
    )) {
      pipeline[row.status] = row.c;
    }

    res.json({
      totals: {
        openLeads: await count(`SELECT COUNT(*) AS c FROM leads WHERE status != 'Converted'`),
        leadsToday: await count(`SELECT COUNT(*) AS c FROM leads WHERE created_at >= ?`, [todayStart]),
        overdueFollowUps: await count(
          `SELECT COUNT(*) AS c FROM leads WHERE status = 'Follow-up' AND follow_up_at < ?`,
          [new Date().toISOString()],
        ),
        pendingDuplicates: await count(`SELECT COUNT(*) AS c FROM leads WHERE is_duplicate = 1`),
        unassigned: await count(`SELECT COUNT(*) AS c FROM leads WHERE assigned_to IS NULL AND is_duplicate = 0 AND status = 'New'`),
        clientsTotal: await count(`SELECT COUNT(*) AS c FROM clients`),
        clientsInProgress: await count(`SELECT COUNT(*) AS c FROM clients WHERE status = 'In Progress'`),
        revenueConfirmed:
          (await get<{ c: number }>(
            `SELECT COALESCE(SUM(amount), 0) AS c FROM payments WHERE status = 'Confirmed'`,
          ))?.c ?? 0,
        convertedToday: await count(`SELECT COUNT(*) AS c FROM clients WHERE created_at >= ?`, [todayStart]),
      },
      reps,
      pipeline,
    });
  }),
);

router.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    const notifications = await all(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      [req.user!.id],
    );
    const unread =
      (await get<{ c: number }>('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0', [
        req.user!.id,
      ]))?.c ?? 0;
    res.json({ notifications, unread });
  }),
);

router.post(
  '/notifications/read-all',
  asyncHandler(async (req, res) => {
    await markAllRead(req.user!.id);
    res.json({ success: true });
  }),
);

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvDownload(res: import('express').Response, filename: string, headers: string[], rows: unknown[][]): void {
  const lines = [headers.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(`\uFEFF${lines.join('\r\n')}`);
}

router.get(
  '/export/leads',
  requireAdminOrAbove,
  asyncHandler(async (req, res) => {
    const { status, branch, rep, from, to } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (typeof status === 'string' && status) {
      conditions.push('l.status = ?');
      params.push(status);
    }
    if (typeof branch === 'string' && branch) {
      conditions.push('l.branch = ?');
      params.push(branch);
    }
    if (typeof rep === 'string' && rep && rep !== 'all') {
      conditions.push('l.assigned_to = ?');
      params.push(Number(rep));
    }
    if (typeof from === 'string' && from) {
      conditions.push('l.created_at >= ?');
      params.push(from);
    }
    if (typeof to === 'string' && to) {
      conditions.push('l.created_at <= ?');
      params.push(to);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await all<Record<string, unknown>>(
      `SELECT l.*, u.name AS assigned_name FROM leads l
       LEFT JOIN users u ON u.id = l.assigned_to
       ${where} ORDER BY l.created_at DESC`,
      params,
    );

    await recordAudit(req.user!.id, 'export.leads', 'lead', null, `${rows.length} rows`);
    csvDownload(
      res,
      `leads-${new Date().toISOString().slice(0, 10)}.csv`,
      ['ID', 'Name', 'Phone', 'Email', 'WhatsApp', 'Source', 'Service', 'Branch', 'Status', 'Assigned To', 'Follow-up At', 'Last Call', 'Last Outcome', 'Duplicate', 'Created At'],
      rows.map((r) => [
        r.id, r.name, r.phone, r.email, r.whatsapp, r.source, r.service, r.branch, r.status,
        r.assigned_name, r.follow_up_at, r.last_call_at, r.last_outcome,
        r.is_duplicate === 1 ? 'Yes' : 'No', r.created_at,
      ]),
    );
  }),
);

router.get(
  '/export/clients',
  requireAdminOrAbove,
  asyncHandler(async (req, res) => {
    const { status, rep } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (typeof status === 'string' && status) {
      conditions.push('c.status = ?');
      params.push(status);
    }
    if (typeof rep === 'string' && rep && rep !== 'all') {
      conditions.push('c.sales_person_id = ?');
      params.push(Number(rep));
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await all<Record<string, unknown>>(
      `SELECT c.*, s.name AS sales_name, sv.name AS service_name,
         COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.client_id = c.id AND p.status = 'Confirmed'), 0) AS paid_amount
       FROM clients c
       LEFT JOIN users s ON s.id = c.sales_person_id
       LEFT JOIN users sv ON sv.id = c.assigned_to
       ${where} ORDER BY c.created_at DESC`,
      params,
    );

    await recordAudit(req.user!.id, 'export.clients', 'client', null, `${rows.length} rows`);
    csvDownload(
      res,
      `clients-${new Date().toISOString().slice(0, 10)}.csv`,
      ['ID', 'Name', 'Phone', 'Email', 'WhatsApp', 'Service', 'Package', 'Amount', 'Paid', 'Payment Status', 'Status', 'Guarantee', 'Sales Rep', 'Service Rep', 'SLA Due', 'Inquiry Date', 'Created At'],
      rows.map((r) => [
        r.id, r.name, r.phone, r.email, r.whatsapp, r.service, r.package_plan, r.amount,
        r.paid_amount, r.payment_status, r.status, r.guarantee_status, r.sales_name, r.service_name,
        r.due_date, r.inquiry_date, r.created_at,
      ]),
    );
  }),
);

export const adminRoutes = router;
