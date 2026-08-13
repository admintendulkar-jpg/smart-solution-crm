/**
 * SQLite -> Postgres SQL translation helpers.
 * Only applied when the server runs on Postgres (DATABASE_URL set);
 * local SQLite behaviour stays byte-for-byte identical.
 */

export function transformDialect(sql: string, toPostgres: boolean): string {
  if (!toPostgres) return sql;
  return sql
    .replace(/\bdatetime\s*\(\s*'now'\s*\)/g, 'now()')
    .replace(/\bdate\s*\(\s*'now'\s*\)/g, 'CURRENT_DATE::text')
    .replace(/julianday\s*\(\s*'now'\s*\)/g, 'EXTRACT(EPOCH FROM now()) / 86400.0')
    .replace(/julianday\s*\(([^)]+)\)/g, 'EXTRACT(EPOCH FROM $1) / 86400.0')
    .replace(/\bINTEGER PRIMARY KEY AUTOINCREMENT\b/g, 'BIGSERIAL PRIMARY KEY')
    .replace(/\bTEXT NOT NULL DEFAULT \(now\(\)\)/g, 'timestamptz NOT NULL DEFAULT now()')
    .replace(/\bDROP TABLE clients;/g, 'DROP TABLE clients CASCADE;');
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
