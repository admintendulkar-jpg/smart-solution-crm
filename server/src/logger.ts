import { config } from './config';

type Level = 'info' | 'warn' | 'error' | 'debug';

function write(level: Level, message: string, meta?: unknown): void {
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}`;
  if (config.nodeEnv === 'production') {
    const record = { ts: new Date().toISOString(), level, message, meta };
    process.stdout.write(JSON.stringify(record) + '\n');
  } else {
    const suffix = meta === undefined ? '' : ` ${JSON.stringify(meta)}`;
    process.stdout.write(line + suffix + '\n');
  }
}

export const logger = {
  info: (message: string, meta?: unknown) => write('info', message, meta),
  warn: (message: string, meta?: unknown) => write('warn', message, meta),
  error: (message: string, meta?: unknown) => write('error', message, meta),
  debug: (message: string, meta?: unknown) => write('debug', message, meta),
};
