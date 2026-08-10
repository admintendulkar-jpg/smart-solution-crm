import { initializeSchema } from './index';
import { logger } from '../logger';

try {
  initializeSchema();
  logger.info('Database ready');
} catch (err) {
  logger.error('Migration failed', err instanceof Error ? err.message : err);
  process.exit(1);
}
