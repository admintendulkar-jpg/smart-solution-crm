import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireSuperAdmin } from '../../auth/guards';
import { SETTINGS_KEYS } from '../../constants';
import { all, get, run, transaction } from '../../db';
import { AppError, asyncHandler } from '../../errors';
import { config } from '../../config';
import { nowIso, startOfDayLocal } from '../../utils/time';
import { recordAudit } from '../audit';
import { notify } from '../notifications';

const router = Router();

async function getQuota(): Promise<number> {
  const raw = (await get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [SETTINGS_KEYS.dailyLeadQuota]))
    ?.value;
  const quota = raw ? Number(raw) : config.dailyLeadQuota;
  return Number.isFinite(quota) && quota > 0 ? Math.floor(quota) : config.dailyLeadQuota;
}

async function getSplitEnabled(): Promise<boolean> {
  const raw = (await get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [SETTINGS_KEYS.leadSplitEnabled]))
    ?.value;
  return raw === 'true';
}

interface RepWithLoad {
  id: number;
  name: string;
  load: number;
  [key: string]: unknown;
}

async function repLoads(): Promise<RepWithLoad[]> {
  const todayStart = startOfDayLocal(new Date()).toISOString();
  return all<RepWithLoad>(
    `SELECT u.id, u.name, COUNT(l.id) AS load
     FROM users u
     LEFT JOIN leads l ON l.assigned_to = u.id AND l.assigned_at >= ?
     WHERE u.role = 'sales' AND u.active = 1
     GROUP BY u.id, u.name
     ORDER BY COUNT(l.id) ASC, u.id ASC`,
    [todayStart],
  );
}

async function splitSummary(): Promise<{ reps: RepWithLoad[]; pool: number; quota: number; enabled: boolean }> {
  const pool =
    (await get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM leads WHERE assigned_to IS NULL AND is_duplicate = 0 AND status = 'New'`,
    ))?.c ?? 0;
  return { reps: await repLoads(), pool, quota: await getQuota(), enabled: await getSplitEnabled() };
}

export async function runLeadSplitEngine(overrideCount?: number, actorId?: number): Promise<{ assigned: number }> {
  if (!(await getSplitEnabled())) {
    return { assigned: 0 };
  }

  const { reps, quota } = await splitSummary();
  if (reps.length === 0) {
    return { assigned: 0 };
  }

  const maxAssign = overrideCount ?? quota;
  let assigned = 0;
  let round = 0;
  const assignments: Record<number, string[]> = {};

  await transaction(async () => {
    for (const rep of reps) {
      assignments[rep.id] = [];
    }
    while (true) {
      const rep = reps[round % reps.length];
      if (rep.load >= quota) {
        round += 1;
        if (round >= reps.length * 2) break;
        continue;
      }
      const lead = await get<{ id: number; name: string; phone: string }>(
        `SELECT id, name, phone FROM leads
         WHERE assigned_to IS NULL AND is_duplicate = 0 AND status = 'New'
         ORDER BY created_at ASC LIMIT 1`,
      );
      if (!lead) break;
      await run(
        "UPDATE leads SET assigned_to = ?, assigned_at = ?, updated_at = datetime('now') WHERE id = ?",
        [rep.id, nowIso(), lead.id],
      );
      assignments[rep.id].push(`${lead.name} (${lead.phone})`);
      rep.load += 1;
      assigned += 1;
      if (assigned >= maxAssign) break;
      round += 1;
    }
  });

  for (const [repId, leads] of Object.entries(assignments)) {
    if (leads.length > 0) {
      await notify(Number(repId), `${leads.length} new lead${leads.length > 1 ? 's' : ''} assigned`, leads.slice(0, 5).join(', '));
    }
  }

  if (actorId && assigned > 0) {
    await recordAudit(actorId, 'lead.split', 'lead', null, `Auto-split assigned ${assigned} lead(s)`);
  }

  return { assigned };
}

router.use(requireAuth);
router.use(requireSuperAdmin);

router.get(
  '/preview',
  asyncHandler(async (_req, res) => {
    res.json(splitSummary());
  }),
);

router.post(
  '/run',
  asyncHandler(async (req, res) => {
    const body = z.object({ count: z.number().int().min(1).optional() }).parse(req.body ?? {});
    const user = req.user!;

    if (!(await getSplitEnabled())) {
      throw new AppError(409, 'Lead split is disabled in settings. Enable it first.', 'SPLIT_DISABLED');
    }

    const { reps } = await splitSummary();
    if (reps.length === 0) {
      throw new AppError(409, 'No active sales reps found.', 'NO_SALES_REPS');
    }

    const result = await runLeadSplitEngine(body.count, user.id);
    res.json({ assigned: result.assigned, summary: await splitSummary() });
  }),
);

export const splitRoutes = router;
