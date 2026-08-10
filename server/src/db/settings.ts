import { SETTINGS_KEYS } from '../constants';
import { config } from '../config';
import { get, run } from './index';

const DEFAULTS: Record<string, string> = {
  [SETTINGS_KEYS.dailyLeadQuota]: String(config.dailyLeadQuota),
  [SETTINGS_KEYS.leadSplitEnabled]: 'true',
  [SETTINGS_KEYS.defaultBranch]: 'Coimbatore',
  [SETTINGS_KEYS.slaBusinessDays]: '4',
};

export function ensureDefaultSettings(): void {
  for (const [key, value] of Object.entries(DEFAULTS)) {
    const existing = get('SELECT value FROM settings WHERE key = ?', [key]);
    if (!existing) {
      run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
    }
  }
}
