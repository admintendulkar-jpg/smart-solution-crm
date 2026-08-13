import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import { config } from '../config';
import { logger } from '../logger';
import { convertPlaceholders, transformDialect } from './dialect';

const { Pool, types } = pg;

// node-postgres returns int8/numeric as strings; convert back to JS numbers.
types.setTypeParser(20, (value: string) => parseInt(value, 10));
types.setTypeParser(1700, (value: string) => parseFloat(value));

export type DbResult = { lastInsertRowid: number; changes: number };
type Row = object;

/**
 * DATABASE_URL set  -> Postgres (production / Render)
 * DATABASE_URL unset -> local SQLite file (development)
 */
export const usePostgres = Boolean(config.databaseUrl);

const txStore = new AsyncLocalStorage<pg.PoolClient>();
let sqlite: DatabaseSync | null = null;
let pool: pg.Pool | null = null;

if (usePostgres) {
  pool = new Pool({
    connectionString: config.databaseUrl,
    max: 10,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
  pool.on('error', (err) => logger.error(`Postgres pool error: ${err.message}`));
  logger.info(`Using Postgres database (${config.databaseUrl.split('@').pop() ?? 'remote'})`);
} else {
  fs.mkdirSync(config.dataDir, { recursive: true });
  sqlite = new DatabaseSync(config.dbFile);
  sqlite.exec('PRAGMA journal_mode = WAL;');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  sqlite.exec('PRAGMA busy_timeout = 5000;');
  logger.info(`Using SQLite database: ${config.dbFile}`);
}

/**
 * Translate SQLite-specific SQL to Postgres. Only applied when running on
 * Postgres, so local SQLite behaviour stays byte-for-byte identical.
 */
function toDialect(sql: string): string {
  return transformDialect(sql, usePostgres);
}

function toPlaceholders(sql: string): string {
  return convertPlaceholders(sql, usePostgres);
}

async function execute(text: string, params: unknown[]): Promise<pg.QueryResult> {
  if (!pool) throw new Error('Postgres pool is not initialized');
  const tx = txStore.getStore();
  if (tx) return tx.query(text, params as never[]);
  return pool.query(text, params as never[]);
}

// In SQLite mode every statement shares one connection, so serialise access
// to prevent interleaving between async transactions and regular queries.
let sqliteChain: Promise<unknown> = Promise.resolve();
function sqliteEnqueue<T>(work: () => T): Promise<T> {
  const next = sqliteChain.then(work);
  sqliteChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export async function all<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (!usePostgres) {
    return sqliteEnqueue(() => sqlite!.prepare(sql).all(...(params as never[])) as T[]);
  }
  const { rows } = await execute(toPlaceholders(toDialect(sql)), params);
  return rows as T[];
}

export async function get<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  if (!usePostgres) {
    return sqliteEnqueue(() => sqlite!.prepare(sql).get(...(params as never[])) as T | undefined);
  }
  const { rows } = await execute(toPlaceholders(toDialect(sql)), params);
  return rows[0] as T | undefined;
}

export async function run(sql: string, params: unknown[] = []): Promise<DbResult> {
  if (!usePostgres) {
    return sqliteEnqueue(() => {
      const result = sqlite!.prepare(sql).run(...(params as never[]));
      return { lastInsertRowid: Number(result.lastInsertRowid), changes: Number(result.changes) };
    });
  }

  const isIgnore = /^\s*INSERT OR IGNORE/i.test(sql);
  let text = toDialect(sql).replace(/^\s*INSERT OR IGNORE/i, 'INSERT');
  const wantsId = /^\s*INSERT\b/i.test(text) && !/RETURNING/i.test(text);

  let suffix = '';
  if (isIgnore) suffix += ' ON CONFLICT DO NOTHING';
  if (wantsId) suffix += ' RETURNING id';
  if (suffix) text = text.replace(/;\s*$/, '') + suffix + ';';

  const result = await execute(toPlaceholders(text), params);
  let lastInsertRowid = 0;
  if (wantsId && result.rows.length > 0) lastInsertRowid = Number(result.rows[0].id);
  return { lastInsertRowid, changes: result.rowCount ?? 0 };
}

export async function transaction<T>(fn: () => Promise<T> | T): Promise<T> {
  if (usePostgres) {
    if (!pool) throw new Error('Postgres pool is not initialized');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await txStore.run(client, async () => fn());
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // transaction already rolled back
      }
      throw err;
    } finally {
      client.release();
    }
  }

  return sqliteEnqueue(async () => {
    sqlite!.exec('BEGIN IMMEDIATE');
    try {
      const result = await fn();
      sqlite!.exec('COMMIT');
      return result;
    } catch (err) {
      sqlite!.exec('ROLLBACK');
      throw err;
    }
  });
}

function resolveMigrationsDir(): string {
  let dir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(dir)) dir = path.resolve(__dirname, '../../src/db/migrations');
  if (!fs.existsSync(dir)) dir = path.resolve(process.cwd(), 'src/db/migrations');
  return dir;
}

export async function initializeSchema(): Promise<void> {
  const migrationsDir = resolveMigrationsDir();
  if (!fs.existsSync(migrationsDir)) {
    logger.warn(`Migrations directory not found at ${migrationsDir}`);
    return;
  }
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (usePostgres) {
    if (!pool) throw new Error('Postgres pool is not initialized');
    const client = await pool.connect();
    try {
      await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
         id BIGSERIAL PRIMARY KEY,
         name TEXT NOT NULL UNIQUE,
         applied_at timestamptz NOT NULL DEFAULT now()
       );`);
      const { rows } = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
      const applied = new Set(rows.map((r) => r.name));

      for (const file of files) {
        if (applied.has(file)) continue;
        const sql = toDialect(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw err;
        }
        // Migration 004 rebuilds `clients` (DROP TABLE ... CASCADE); restore
        // the payments FK and make sure the serial sequence is in sync.
        await client
          .query('ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_client_id_fkey;')
          .then(() =>
            client.query(
              'ALTER TABLE payments ADD CONSTRAINT payments_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;',
            ),
          )
          .catch(() => undefined);
        logger.info(`Migration applied: ${file}`);
      }

      await client
        .query(
          "SELECT setval(pg_get_serial_sequence('clients', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM clients), 0), 1), false);",
        )
        .catch(() => undefined);
    } finally {
      client.release();
    }
  } else {
    sqlite!.exec(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         name TEXT NOT NULL UNIQUE,
         applied_at TEXT NOT NULL DEFAULT (datetime('now'))
       );`,
    );

    const applied = new Set(
      (await all<{ name: string }>('SELECT name FROM schema_migrations')).map((r) => r.name),
    );

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      sqlite!.exec('PRAGMA foreign_keys = OFF;');
      sqlite!.exec('BEGIN');
      try {
        sqlite!.exec(sql);
        sqlite!.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
        sqlite!.exec('COMMIT');
        sqlite!.exec('PRAGMA foreign_keys = ON;');
        const violations = sqlite!.prepare('PRAGMA foreign_key_check').all() as { [key: string]: unknown }[];
        if (violations.length > 0) {
          throw new Error(`Foreign key violations after migration ${file}: ${JSON.stringify(violations[0])}`);
        }
        logger.info(`Migration applied: ${file}`);
      } catch (err) {
        sqlite!.exec('ROLLBACK');
        sqlite!.exec('PRAGMA foreign_keys = ON;');
        throw err;
      }
    }
  }

  await ensureRealUsers();
}

const OVERRIDE_FILE = path.join(config.dataDir, 'users_override.json');

export function saveUserOverride(user: { id: number; name?: string; email?: string | null; phone?: string | null; role?: string; branch?: string; active?: number }): void {
  try {
    let overrides: Record<string, typeof user> = {};
    if (fs.existsSync(OVERRIDE_FILE)) {
      try {
        overrides = JSON.parse(fs.readFileSync(OVERRIDE_FILE, 'utf8'));
      } catch {
        overrides = {};
      }
    }
    const key = String(user.id);
    overrides[key] = { ...(overrides[key] ?? {}), ...user };
    fs.writeFileSync(OVERRIDE_FILE, JSON.stringify(overrides, null, 2), 'utf8');
  } catch (err) {
    logger.warn(`Failed to write user override: ${err}`);
  }
}

export async function ensureRealUsers(): Promise<void> {
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

  // Deactivate old placeholder sample reps
  await run(`UPDATE users SET active = 0 WHERE email LIKE '%@example.com' OR name IN ('Karthik R', 'Priya N', 'Arun Kumar', 'Divya S', 'Mohammed Faisal', 'Rahul Sharma', 'Meena V', 'Deepak P', 'Lakshmi K')`);

  for (const u of REAL_USERS) {
    const existing = await get<{ id: number }>('SELECT id FROM users WHERE phone = ? OR (email IS NOT NULL AND email = ?)', [u.phone, u.email]);
    if (!existing) {
      await run(`INSERT INTO users (name, email, phone, role, branch, active) VALUES (?, ?, ?, ?, ?, 1)`, [
        u.name,
        u.email,
        u.phone,
        u.role,
        u.branch,
      ]);
    } else {
      await run(`UPDATE users SET active = 1, role = ? WHERE id = ?`, [u.role, existing.id]);
    }
  }

  // Re-apply any custom UI user edits saved across restarts
  if (fs.existsSync(OVERRIDE_FILE)) {
    try {
      const overrides: Record<string, { id: number; name?: string; email?: string | null; phone?: string | null; role?: string; branch?: string; active?: number }> = JSON.parse(fs.readFileSync(OVERRIDE_FILE, 'utf8'));
      for (const item of Object.values(overrides)) {
        if (item.id || item.phone) {
          const existing = await get<{ id: number }>('SELECT id FROM users WHERE id = ? OR phone = ?', [item.id ?? -1, item.phone ?? '-1']);
          if (existing) {
            const fields: string[] = [];
            const params: unknown[] = [];
            if (item.name !== undefined) { fields.push('name = ?'); params.push(item.name); }
            if (item.email !== undefined) { fields.push('email = ?'); params.push(item.email); }
            if (item.phone !== undefined) { fields.push('phone = ?'); params.push(item.phone); }
            if (item.role !== undefined) { fields.push('role = ?'); params.push(item.role); }
            if (item.branch !== undefined) { fields.push('branch = ?'); params.push(item.branch); }
            if (item.active !== undefined) { fields.push('active = ?'); params.push(item.active); }
            if (fields.length > 0) {
              await run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, [...params, existing.id]);
            }
          }
        }
      }
    } catch (err) {
      logger.warn(`Failed to re-apply user overrides: ${err}`);
    }
  }

  // Auto-assign any unassigned leads to real active sales reps
  try {
    const unassignedCount = (await get<{ c: number }>('SELECT COUNT(*) AS c FROM leads WHERE assigned_to IS NULL AND is_duplicate = 0 AND status = "New"'))?.c ?? 0;
    if (unassignedCount > 0) {
      const activeSales = await all<{ id: number }>('SELECT id FROM users WHERE role = "sales" AND active = 1 ORDER BY id ASC');
      if (activeSales.length > 0) {
        const unassignedLeads = await all<{ id: number }>('SELECT id FROM leads WHERE assigned_to IS NULL AND is_duplicate = 0 AND status = "New" ORDER BY id ASC');
        let idx = 0;
        for (const lead of unassignedLeads) {
          const rep = activeSales[idx % activeSales.length];
          await run('UPDATE leads SET assigned_to = ?, assigned_at = datetime("now") WHERE id = ?', [rep.id, lead.id]);
          idx += 1;
        }
        logger.info(`Auto-assigned ${unassignedLeads.length} leads across ${activeSales.length} active sales reps.`);
      }
    }
  } catch (err) {
    logger.warn(`Failed to auto-assign unassigned leads on boot: ${err}`);
  }
}