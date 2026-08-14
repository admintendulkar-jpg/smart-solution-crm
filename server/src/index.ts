import { createApp } from './app';
import { config } from './config';
import { initializeSchema } from './db';
import { logger } from './logger';
import { startSheetSyncScheduler, syncFromSheet } from './modules/sync/routes';
import { ensureDefaultSettings } from './db/settings';

async function boot(): Promise<void> {
  logger.info('Boot: starting schema initialization...');
  try {
    await initializeSchema();
    logger.info('Boot: schema OK');
  } catch (err) {
    logger.error(`Boot: schema FAILED — ${err instanceof Error ? err.stack : String(err)}`);
    throw err;
  }

  try {
    await ensureDefaultSettings();
    logger.info('Boot: settings OK');
  } catch (err) {
    logger.error(`Boot: settings FAILED — ${err instanceof Error ? err.stack : String(err)}`);
    throw err;
  }

  startSheetSyncScheduler();

  const app = createApp();

  app.listen(config.port, () => {
    logger.info(`Smart Solution CRM server listening on http://localhost:${config.port}`);
  });

  // Auto-sync from Google Sheets on boot (restores data after Render redeploy)
  if (config.sheets.sheetId && config.sheets.enabled) {
    setTimeout(async () => {
      try {
        const result = await syncFromSheet();
        if (result.imported > 0 || result.duplicates > 0) {
          logger.info(`Boot sync complete: ${result.imported} imported, ${result.duplicates} duplicates, ${result.errors} errors`);
        }
      } catch (err) {
        logger.warn(`Boot sync failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
      }
    }, 5_000);
  }
}

boot().catch((err) => {
  logger.error(`Fatal boot error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
