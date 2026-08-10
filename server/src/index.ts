import { createApp } from './app';
import { config } from './config';
import { initializeSchema } from './db';
import { logger } from './logger';
import { startSheetSyncScheduler } from './modules/sync/routes';
import { ensureDefaultSettings } from './db/settings';

initializeSchema();
ensureDefaultSettings();

startSheetSyncScheduler();

const app = createApp();

app.listen(config.port, () => {
  logger.info(`Smart Solution CRM server listening on http://localhost:${config.port}`);
});
