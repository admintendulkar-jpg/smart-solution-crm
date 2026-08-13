import { run, all } from '../db';

export async function notify(userId: number, title: string, body: string, link?: string): Promise<void> {
  await run('INSERT INTO notifications (user_id, title, body, link) VALUES (?, ?, ?, ?)', [
    userId,
    title,
    body,
    link ?? null,
  ]);
}

export async function notifyRole(role: string, title: string, body: string, link?: string): Promise<void> {
  const users = await all<{ id: number }>('SELECT id FROM users WHERE role = ? AND active = 1', [role]);
  for (const user of users) {
    await notify(user.id, title, body, link);
  }
}

export async function markAllRead(userId: number): Promise<void> {
  await run('UPDATE notifications SET read = 1 WHERE user_id = ?', [userId]);
}
