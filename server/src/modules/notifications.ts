import { run, all } from '../db';

export function notify(userId: number, title: string, body: string, link?: string): void {
  run('INSERT INTO notifications (user_id, title, body, link) VALUES (?, ?, ?, ?)', [
    userId,
    title,
    body,
    link ?? null,
  ]);
}

export function notifyRole(role: string, title: string, body: string, link?: string): void {
  const users = all<{ id: number }>('SELECT id FROM users WHERE role = ? AND active = 1', [role]);
  for (const user of users) {
    notify(user.id, title, body, link);
  }
}

export function markAllRead(userId: number): void {
  run('UPDATE notifications SET read = 1 WHERE user_id = ?', [userId]);
}
