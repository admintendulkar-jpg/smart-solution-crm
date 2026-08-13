import { run } from '../db';

export async function recordAudit(
  userId: number | null,
  action: string,
  entity?: string | null,
  entityId?: number | null,
  detail?: string | null,
): Promise<void> {
  await run('INSERT INTO audit_log (user_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)', [
    userId,
    action,
    entity ?? null,
    entityId ?? null,
    detail ?? null,
  ]);
}
