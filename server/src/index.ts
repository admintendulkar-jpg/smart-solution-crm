import { createApp } from './app';
import { config } from './config';
import { initializeSchema } from './db';
import { logger } from './logger';
import { startSheetSyncScheduler } from './modules/sync/routes';
import { ensureDefaultSettings } from './db/settings';

async function boot(): Promise<void> {
  await initializeSchema();
  await ensureDefaultSettings();

  startSheetSyncScheduler();

  const app = createApp();

  app.listen(config.port, () => {
    logger.info(`Smart Solution CRM server listening on http://localhost:${config.port}`);
  });
}

boot().catch((err) => {
  logger.error(`Fatal boot error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
