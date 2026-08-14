import { Router } from 'express';
import multer from 'multer';
import { requireAdminOrAbove, requireAuth } from '../../auth/guards';
import { AppError, asyncHandler } from '../../errors';
import { config } from '../../config';
import { logger } from '../../logger';
import { parseCsv } from './csv';
import { getAdapter } from './sheets';
import { importLeads, listBatches } from './import.service';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new AppError(400, 'Only CSV files are accepted.', 'INVALID_FILE'));
    }
  },
});

router.use(requireAuth);
router.use(requireAdminOrAbove);

router.post(
  '/import/csv',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError(400, 'No file uploaded.', 'FILE_REQUIRED');
    }
    const text = req.file.buffer.toString('utf8');
    const rows = parseCsv(text);
    if (rows.length < 2) {
      throw new AppError(400, 'CSV must contain a header row and at least one data row.', 'EMPTY_FILE');
    }

    const headers = rows[0].map((h) => h.trim().toLowerCase());
    const idx = (name: string): number => headers.indexOf(name);
    const nameCol = idx('name');
    const phoneCol = idx('phone') !== -1 ? idx('phone') : idx('mobile');
    const emailCol = idx('email');
    const whatsappCol = idx('whatsapp');
    const sourceCol = idx('source');
    const serviceCol = idx('service');

    if (nameCol === -1 || phoneCol === -1) {
      throw new AppError(
        400,
        'CSV must have "name" and "phone" columns. Optional: email, whatsapp, source, service.',
        'BAD_HEADERS',
      );
    }

    const incoming = rows.slice(1).map((cells) => ({
      name: cells[nameCol]?.trim() ?? '',
      phone: cells[phoneCol]?.trim() ?? '',
      email: cells[emailCol]?.trim() || undefined,
      whatsapp: cells[whatsappCol]?.trim() || undefined,
      source: cells[sourceCol]?.trim() || undefined,
      service: cells[serviceCol]?.trim() || undefined,
    }));

    const result = await importLeads(incoming, req.file.originalname, 'CSV Upload', req.user!.id);
    res.status(201).json(result);
  }),
);

router.get(
  '/import/batches',
  asyncHandler(async (_req, res) => {
    res.json({ batches: await listBatches() });
  }),
);

router.get(
  '/sheets/status',
  asyncHandler(async (_req, res) => {
    const adapter = getAdapter();
    const sheetId = config.sheets.sheetId;
    res.json({
      configured: Boolean(sheetId),
      provider: adapter.name,
      sheetId: sheetId || null,
      syncMinutes: config.sheetSyncMinutes,
    });
  }),
);

router.post(
  '/sheets/run',
  asyncHandler(async (req, res) => {
    const adapter = getAdapter();
    if (!adapter.available) {
      throw new AppError(409, 'Google Sheets is not configured on this server.', 'SHEETS_NOT_CONFIGURED');
    }
    const rows = await adapter.fetchLeads();
    const result = await importLeads(rows, `sheets-${Date.now()}`, 'Google Sheets', req.user!.id);
    res.json(result);
  }),
);

export const syncRoutes = router;

export async function syncFromSheet(): Promise<{ imported: number; duplicates: number; errors: number }> {
  const adapter = getAdapter();
  if (!adapter.available) {
    return { imported: 0, duplicates: 0, errors: 0 };
  }
  const rows = await adapter.fetchLeads();
  if (rows.length === 0) return { imported: 0, duplicates: 0, errors: 0 };
  const result = await importLeads(rows, `boot-sync-${Date.now()}`, 'Google Sheets (boot)', null);
  return { imported: result.imported, duplicates: result.duplicates, errors: result.errors };
}

export function startSheetSyncScheduler(): void {
  if (!config.sheets.enabled) {
    logger.info('Google Sheets sync disabled (no credentials configured)');
    return;
  }
  const cron = require('node-cron') as typeof import('node-cron');
  const pattern = `*/${Math.max(5, Math.min(60, config.sheetSyncMinutes))} * * * *`;
  cron.schedule(pattern, () => {
    getAdapter()
      .fetchLeads()
      .then(async (rows) => {
        if (rows.length > 0) {
          const result = await importLeads(rows, `sheets-${Date.now()}`, 'Google Sheets', null);
          logger.info(`Scheduled sheets sync: ${result.imported} imported, ${result.duplicates} duplicates`);
        }
      })
      .catch((err) => logger.error('Sheets sync failed', err instanceof Error ? err.message : err));
  });
  logger.info(`Google Sheets sync scheduled every ${config.sheetSyncMinutes} min`);
}
