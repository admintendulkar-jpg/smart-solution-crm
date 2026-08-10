import { SETTINGS_KEYS } from '../../constants';
import { all, get, run, transaction } from '../../db';
import { recordAudit } from '../audit';
import { notifyRole } from '../notifications';

export interface IncomingLead {
  externalKey?: string;
  name: string;
  phone: string;
  email?: string;
  whatsapp?: string;
  source?: string;
  service?: string;
}

export interface ImportResult {
  total: number;
  imported: number;
  duplicates: number;
  errors: number;
  duplicateDetails: { name: string; phone: string; matches: string }[];
}

export function importLeads(
  rows: IncomingLead[],
  fileName: string,
  sourceLabel: string,
  actorId: number | null,
): ImportResult {
  const defaultBranch =
    get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [SETTINGS_KEYS.defaultBranch])?.value ??
    'Coimbatore';

  const result: ImportResult = { total: rows.length, imported: 0, duplicates: 0, errors: 0, duplicateDetails: [] };

  transaction(() => {
    for (const row of rows) {
      const phone = row.phone.replace(/[^0-9+]/g, '');
      const email = row.email?.trim().toLowerCase() || null;
      if (!phone || phone.length < 10) {
        result.errors += 1;
        continue;
      }

      if (row.externalKey) {
        const sameSourceRow = get<{ id: number }>(
          `SELECT id FROM leads WHERE external_key = ? LIMIT 1`,
          [row.externalKey],
        );
        if (sameSourceRow) {
          result.duplicates += 1;
          result.duplicateDetails.push({ name: row.name, phone, matches: row.name });
          continue;
        }
      }

      const existing = get<{ id: number; name: string }>(
        `SELECT id, name FROM leads WHERE phone = ? OR (email IS NOT NULL AND ? IS NOT NULL AND email = ?) LIMIT 1`,
        [phone, email, email],
      );

      if (existing) {
        run(
          `INSERT INTO leads (external_key, name, phone, email, whatsapp, source, service, branch,
             is_duplicate, duplicate_of, imported_batch)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL)`,
          [
            row.externalKey ?? null,
            row.name,
            phone,
            email,
            row.whatsapp?.trim() ?? null,
            row.source ?? 'Purchased Data',
            row.service ?? 'ATS Resume',
            defaultBranch,
            existing.id,
          ],
        );
        result.duplicates += 1;
        result.duplicateDetails.push({ name: row.name, phone, matches: existing.name });
        continue;
      }

      run(
        `INSERT INTO leads (external_key, name, phone, email, whatsapp, source, service, branch,
           imported_batch)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [
          row.externalKey ?? null,
          row.name,
          phone,
          email,
          row.whatsapp?.trim() ?? null,
          row.source ?? 'Purchased Data',
          row.service ?? 'ATS Resume',
          defaultBranch,
        ],
      );
      result.imported += 1;
    }

    run(
      `INSERT INTO lead_batches (file_name, source, status, total, imported, duplicates, errors, uploaded_by)
       VALUES (?, ?, 'Imported', ?, ?, ?, ?, ?)`,
      [fileName, sourceLabel, result.total, result.imported, result.duplicates, result.errors, actorId],
    );
  });

  if (result.imported > 0) {
    notifyRole(
      'sales',
      `${result.imported} new leads available`,
      `New leads were synced from ${sourceLabel}. They will be split by the owner.`,
    );
  }

  recordAudit(
    actorId,
    'lead.import',
    'lead',
    null,
    `${sourceLabel} "${fileName}": ${result.imported} imported, ${result.duplicates} duplicates, ${result.errors} errors`,
  );

  return result;
}

export function lastBatch(): { id: number; file_name: string; source: string; status: string; total: number; imported: number; duplicates: number; created_at: string } | undefined {
  return get(
    `SELECT id, file_name, source, status, total, imported, duplicates, created_at
     FROM lead_batches ORDER BY id DESC LIMIT 1`,
  );
}

export function listBatches(limit = 50): unknown[] {
  return all(
    `SELECT b.*, u.name AS uploaded_by_name
     FROM lead_batches b LEFT JOIN users u ON u.id = b.uploaded_by
     ORDER BY b.id DESC LIMIT ?`,
    [limit],
  );
}
