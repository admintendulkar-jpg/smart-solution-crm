/**
 * SQLite -> Postgres SQL translation helpers.
 * Only applied when the server runs on Postgres (DATABASE_URL set);
 * local SQLite behaviour stays byte-for-byte identical.
 */

export function transformDialect(sql: string, toPostgres: boolean): string {
  if (!toPostgres) return sql;
  return sql
    // datetime('now') → now()
    .replace(/\bdatetime\s*\(\s*'now'\s*\)/g, 'now()')
    // date('now') → CURRENT_DATE
    .replace(/\bdate\s*\(\s*'now'\s*\)/g, 'CURRENT_DATE')
    // julianday
    .replace(/julianday\s*\(\s*'now'\s*\)/g, 'EXTRACT(EPOCH FROM now()) / 86400.0')
    .replace(/julianday\s*\(([^)]+)\)/g, 'EXTRACT(EPOCH FROM $1) / 86400.0')
    // AUTOINCREMENT → BIGSERIAL
    .replace(/\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/g, 'BIGSERIAL PRIMARY KEY')
    // TEXT columns with now() default → timestamptz
    .replace(/\bTEXT\s+NOT\s+NULL\s+DEFAULT\s+\(now\(\)\)/g, 'timestamptz NOT NULL DEFAULT now()')
    .replace(/\bTEXT\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/g, 'timestamptz NOT NULL DEFAULT now()')
    // TEXT columns with date default → TEXT (CURRENT_DATE casts to text automatically)
    .replace(/\bTEXT\s+NOT\s+NULL\s+DEFAULT\s+\(CURRENT_DATE\)/g, 'TEXT NOT NULL DEFAULT (CURRENT_DATE::text)')
    .replace(/\bTEXT\s+NOT\s+NULL\s+DEFAULT\s+CURRENT_DATE\b/g, 'TEXT NOT NULL DEFAULT (CURRENT_DATE::text)')
    // Nullable TEXT datetime columns
    .replace(/\bTEXT\s+DEFAULT\s+\(now\(\)\)/g, 'timestamptz DEFAULT now()')
    .replace(/\bTEXT\s+DEFAULT\s+now\(\)/g, 'timestamptz DEFAULT now()')
    // DROP TABLE → DROP TABLE CASCADE (for FK deps)
    .replace(/\bDROP TABLE clients;/g, 'DROP TABLE clients CASCADE;')
    // SQLite REAL → PostgreSQL DOUBLE PRECISION (or just leave as REAL which PG supports)
    // SQLite INTEGER → INTEGER (PG supports this natively)
    // Remove SQLite-specific PRAGMA statements if any leaked into migrations
    .replace(/PRAGMA\s+\w+\s*=\s*\w+\s*;/gi, '-- PRAGMA removed for PG')
    // SQLite ON CONFLICT excluded.field → PostgreSQL EXCLUDED.field
    .replace(/\bexcluded\./gi, 'EXCLUDED.');
}

/**
 * Convert SQLite `?` placeholders into Postgres `$1..$n`, skipping `?`
 * characters that appear inside single-quoted string literals.
 */
export function convertPlaceholders(sql: string, toPostgres: boolean): string {
  if (!toPostgres) return sql;
  let out = '';
  let paramIndex = 0;
  let inString = false;
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    if (char === "'") {
      inString = !inString;
      out += char;
    } else if (char === '?' && !inString) {
      paramIndex += 1;
      out += `$${paramIndex}`;
    } else {
      out += char;
    }
  }
  return out;
}
