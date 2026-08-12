import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config';
import { logger } from '../logger';

fs.mkdirSync(config.dataDir, { recursive: true });

export const db = new DatabaseSync(config.dbFile);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

type Row = object;

export function all<T extends Row = Row>(sql: string, params: unknown[] = []): T[] {
  return db.prepare(sql).all(...(params as never[])) as T[];
}

export function get<T extends Row = Row>(sql: string, params: unknown[] = []): T | undefined {
  return db.prepare(sql).get(...(params as never[])) as T | undefined;
}

export function run(sql: string, params: unknown[] = []): { lastInsertRowid: number; changes: number } {
  const result = db.prepare(sql).run(...(params as never[]));
  return { lastInsertRowid: Number(result.lastInsertRowid), changes: Number(result.changes) };
}

export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function initializeSchema(): void {
  let migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    migrationsDir = path.resolve(__dirname, '../../src/db/migrations');
  }
  if (!fs.existsSync(migrationsDir)) {
    logger.warn(`Migrations directory not found at ${migrationsDir}`);
    return;
  }
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       name TEXT NOT NULL UNIQUE,
       applied_at TEXT NOT NULL DEFAULT (datetime('now'))
     );`,
  );

  const applied = new Set(
    all<{ name: string }>('SELECT name FROM schema_migrations').map((r) => r.name),
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
      db.exec('COMMIT');
      db.exec('PRAGMA foreign_keys = ON;');
      const violations = all<{ [key: string]: unknown }>('PRAGMA foreign_key_check');
      if (violations.length > 0) {
        throw new Error(`Foreign key violations after migration ${file}: ${JSON.stringify(violations[0])}`);
      }
      logger.info(`Migration applied: ${file}`);
    } catch (err) {
      db.exec('ROLLBACK');
      db.exec('PRAGMA foreign_keys = ON;');
      throw err;
    }
  }

  ensureRealUsers();
}

export function ensureRealUsers(): void {
  const REAL_USERS = [
    { name: 'Tendulkar', email: 'admin.tendulkar@smartsolutionagency.in', phone: '7094523321', role: 'super_admin', branch: 'Coimbatore' },
    { name: 'Siddharthan A', email: 'smartsolution.agency01@gmail.com', phone: '8248011190', role: 'super_admin', branch: 'Coimbatore' },
    { name: 'Rajesh (GM)', email: 'gmrk@smartsolutionagency.in', phone: '9000000000', role: 'admin', branch: 'Coimbatore' },
    { name: 'HR & Admin', email: 'hr@smartsolutionagency.in', phone: '7550173452', role: 'hr', branch: 'Coimbatore' },
    { name: 'Prathima', email: 'prathimatadmoreacademy@gmail.com', phone: '9632215972', role: 'sales', branch: 'Coimbatore' },
    { name: 'Hari', email: 'harhar9972@gmail.com', phone: '6383331947', role: 'sales', branch: 'Coimbatore' },
    { name: 'Kishore M', email: 'krishoffcl12@gmail.com', phone: '9952297655', role: 'sales', branch: 'Coimbatore' },
    { name: 'Service Support', email: 'service@smartsolutionagency.in', phone: '9000000007', role: 'service', branch: 'Coimbatore' },
  ];

  for (const u of REAL_USERS) {
    const existing = get<{ id: number }>('SELECT id FROM users WHERE email = ? OR phone = ?', [u.email, u.phone]);
    if (!existing) {
      run(
        `INSERT INTO users (name, email, phone, role, branch, active) VALUES (?, ?, ?, ?, ?, 1)`,
        [u.name, u.email, u.phone, u.role, u.branch]
      );
    }
  }
}
