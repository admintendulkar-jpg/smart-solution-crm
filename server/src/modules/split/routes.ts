import { Router } from 'express';
import { z } from 'zod';
import { requireAdminOrAbove, requireAuth } from '../../auth/guards';
import { SETTINGS_KEYS } from '../../constants';
import { all, get, run, transaction } from '../../db';
import { AppError, asyncHandler } from '../../errors';
import { config } from '../../config';
import { nowIso, startOfDayLocal } from '../../utils/time';
import { recordAudit } from '../audit';
import { notify } from '../notifications';

const router = Router();

export interface DistributionHistoryItem {
  id: number;
  actor_id: number | null;
  actor_name: string | null;
  total_leads: number;
  selected_reps_count: number;
  split_type: 'equal' | 'custom';
  daily_target: number;
  deadline: string | null;
  created_at: string;
  items: {
    id: number;
    rep_id: number;
    rep_name: string;
    assigned_count: number;
    daily_target: number;
  }[];
}

export async function getDistributionHistory(): Promise<DistributionHistoryItem[]> {
  try {
    const batches = await all<{
      id: number;
      actor_id: number | null;
      actor_name: string | null;
      total_leads: number;
      selected_reps_count: number;
      split_type: 'equal' | 'custom';
      daily_target: number;
      deadline: string | null;
      created_at: string;
    }>(
      `SELECT b.id, b.actor_id, u.name AS actor_name, b.total_leads, b.selected_reps_count,
              b.split_type, b.daily_target, b.deadline, b.created_at
       FROM distribution_batches b
       LEFT JOIN users u ON u.id = b.actor_id
       ORDER BY b.id DESC
       LIMIT 25`,
    );

    const historyWithDetails: DistributionHistoryItem[] = [];
    for (const b of batches) {
      const items = await all<{
        id: number;
        rep_id: number;
        rep_name: string;
        assigned_count: number;
        daily_target: number;
      }>(
        `SELECT i.id, i.rep_id, u.name AS rep_name, i.assigned_count, i.daily_target
         FROM distribution_batch_items i
         JOIN users u ON u.id = i.rep_id
         WHERE i.batch_id = ?
         ORDER BY i.id ASC`,
        [b.id],
      );
      historyWithDetails.push({ ...b, items });
    }

    return historyWithDetails;
  } catch (err) {
    // If migration hasn't created tables yet or query fails, return empty array
    return [];
  }
}

export async function getDistributionSummary() {
  const unassignedPool =
    (
      await get<{ c: number }>(
        `SELECT COUNT(*) AS c FROM leads WHERE assigned_to IS NULL AND is_duplicate = 0 AND status = 'New'`,
      )
    )?.c ?? 0;

  const reps = await all<{ id: number; name: string; email: string; phone: string; branch: string }>(
    `SELECT id, name, email, phone, branch FROM users WHERE role = 'sales' AND active = 1 ORDER BY id ASC`,
  );

  const history = await getDistributionHistory();

  return { unassignedPool, reps, history };
}

const distributeSchema = z.object({
  selectedRepIds: z.array(z.number().int().positive()).min(1, 'Select at least one sales rep'),
  splitType: z.enum(['equal', 'custom']),
  customCounts: z.record(z.string(), z.number().int().min(0)).optional(),
  dailyTarget: z.number().int().min(1).default(40),
  deadline: z.string().optional().nullable(),
});

export async function executeLeadDistribution(
  body: z.infer<typeof distributeSchema>,
  actorId: number,
) {
  const { selectedRepIds, splitType, customCounts, dailyTarget, deadline } = distributeSchema.parse(body);

  // Fetch valid selected active sales reps
  const reps = await all<{ id: number; name: string }>(
    `SELECT id, name FROM users WHERE role = 'sales' AND active = 1 AND id IN (${selectedRepIds.map(() => '?').join(',')}) ORDER BY id ASC`,
    selectedRepIds,
  );

  if (reps.length === 0) {
    throw new AppError(400, 'None of the selected sales reps are active.', 'NO_ACTIVE_REPS');
  }

  // Fetch all current unassigned leads
  const unassignedLeads = await all<{ id: number; name: string; phone: string }>(
    `SELECT id, name, phone FROM leads WHERE assigned_to IS NULL AND is_duplicate = 0 AND status = 'New' ORDER BY created_at ASC`,
  );

  if (unassignedLeads.length === 0) {
    throw new AppError(409, 'There are no unassigned leads in the pool to distribute.', 'NO_LEADS');
  }

  // Determine distribution count per rep
  const repCounts: { repId: number; repName: string; count: number }[] = [];

  if (splitType === 'equal') {
    const totalToDistribute = unassignedLeads.length;
    const N = reps.length;
    const baseShare = Math.floor(totalToDistribute / N);
    const remainder = totalToDistribute % N;

    for (let i = 0; i < N; i++) {
      const share = baseShare + (i < remainder ? 1 : 0);
      repCounts.push({ repId: reps[i].id, repName: reps[i].name, count: share });
    }
  } else {
    // Custom split
    let totalRequested = 0;
    for (const r of reps) {
      const count = customCounts?.[String(r.id)] ?? customCounts?.[r.id] ?? 0;
      repCounts.push({ repId: r.id, repName: r.name, count });
      totalRequested += count;
    }

    if (totalRequested <= 0) {
      throw new AppError(400, 'Please enter at least 1 lead for at least one sales rep.', 'INVALID_CUSTOM_COUNTS');
    }

    if (totalRequested > unassignedLeads.length) {
      throw new AppError(
        400,
        `Cannot assign ${totalRequested} leads. Only ${unassignedLeads.length} leads are available in the unassigned pool.`,
        'EXCEEDS_POOL',
      );
    }
  }

  let totalAssigned = 0;
  let leadPointer = 0;

  await transaction(async () => {
    // 1. Create distribution batch record
    const batchRes = await run(
      `INSERT INTO distribution_batches (actor_id, total_leads, selected_reps_count, split_type, daily_target, deadline)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [actorId, unassignedLeads.length, reps.length, splitType, dailyTarget, deadline ?? null],
    );
    const batchId = batchRes.lastInsertRowid;

    // 2. Assign leads per rep
    for (const item of repCounts) {
      if (item.count <= 0) continue;

      const leadsToAssign = unassignedLeads.slice(leadPointer, leadPointer + item.count);
      leadPointer += item.count;
      totalAssigned += leadsToAssign.length;

      // Insert batch item
      await run(
        `INSERT INTO distribution_batch_items (batch_id, rep_id, assigned_count, daily_target)
         VALUES (?, ?, ?, ?)`,
        [batchId, item.repId, leadsToAssign.length, dailyTarget],
      );

      // Batch update leads assignment
      for (const lead of leadsToAssign) {
        await run(
          `UPDATE leads SET assigned_to = ?, assigned_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
          [item.repId, lead.id],
        );
      }

      // Notify sales rep
      await notify(
        item.repId,
        `🚀 ${leadsToAssign.length} new leads assigned to you`,
        `Target: ${dailyTarget} leads/day. Start connecting with your queue!`,
      );
    }

    if (actorId && totalAssigned > 0) {
      await recordAudit(actorId, 'lead.distribution', 'lead', null, `Distributed ${totalAssigned} leads to ${reps.length} sales reps (${splitType} split, target ${dailyTarget}/day)`);
    }
  });

  return { success: true, totalAssigned, summary: await getDistributionSummary() };
}

// ===== BACKWARD COMPATIBILITY ENGINE HELPERS =====
export async function assignAllUnassignedLeads(actorId?: number): Promise<{ assigned: number }> {
  const summary = await getDistributionSummary();
  if (summary.reps.length === 0 || summary.unassignedPool === 0) return { assigned: 0 };
  const result = await executeLeadDistribution(
    {
      selectedRepIds: summary.reps.map((r) => r.id),
      splitType: 'equal',
      dailyTarget: 40,
    },
    actorId ?? summary.reps[0].id,
  );
  return { assigned: result.totalAssigned };
}

export async function runLeadSplitEngine(overrideCount?: number, actorId?: number): Promise<{ assigned: number }> {
  return assignAllUnassignedLeads(actorId);
}

// ===== ROUTE DEFINITIONS =====
router.use(requireAuth);
router.use(requireAdminOrAbove);

// New Lead Distribution summary & wizard data
router.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    res.json(await getDistributionSummary());
  }),
);

// New Lead Distribution execution
router.post(
  '/distribute',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const result = await executeLeadDistribution(req.body, user.id);
    res.json(result);
  }),
);

// Backward-compatible routes
router.get(
  '/preview',
  asyncHandler(async (_req, res) => {
    const s = await getDistributionSummary();
    res.json({
      reps: s.reps.map((r) => ({ id: r.id, name: r.name, load: 0 })),
      pool: s.unassignedPool,
      quota: 50,
      enabled: true,
    });
  }),
);

router.post(
  '/run',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const result = await assignAllUnassignedLeads(user.id);
    res.json({ assigned: result.assigned, summary: await getDistributionSummary() });
  }),
);

router.post(
  '/assign-all',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const result = await assignAllUnassignedLeads(user.id);
    res.json({ assigned: result.assigned });
  }),
);

export const splitRoutes = router;
