import fs from 'node:fs';
import { google } from 'googleapis';
import { config } from '../../config';
import { logger } from '../../logger';
import type { IncomingLead } from './import.service';

export interface LeadSourceAdapter {
  name: string;
  available: boolean;
  fetchLeads(): Promise<IncomingLead[]>;
}

export class GoogleSheetsAdapter implements LeadSourceAdapter {
  readonly name = 'Google Sheets';
  readonly available: boolean;

  constructor() {
    this.available = config.sheets.enabled;
  }

  async fetchLeads(): Promise<IncomingLead[]> {
    if (!this.available) {
      throw new Error('Google Sheets is not configured.');
    }

    let credentials: { client_email?: string; private_key?: string } = {};
    if (config.sheets.serviceAccountJson.trim().startsWith('{')) {
      credentials = JSON.parse(config.sheets.serviceAccountJson);
    } else if (config.sheets.serviceAccountFile && fs.existsSync(config.sheets.serviceAccountFile)) {
      credentials = JSON.parse(fs.readFileSync(config.sheets.serviceAccountFile, 'utf8'));
    }

    if (!credentials.client_email || !credentials.private_key || credentials.private_key.includes('YOUR_PRIVATE_KEY_HERE')) {
      throw new Error('Google service account credentials are invalid or unconfigured.');
    }

    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.sheets.sheetId,
      range: config.sheets.range,
    });

    const values = response.data.values ?? [];
    if (values.length === 0) return [];

    const headers = values[0].map((h) => h.trim().toLowerCase());
    const col = (name: string): number => headers.indexOf(name);

    const nameCol = col('name');
    const phoneCol = col('phone') !== -1 ? col('phone') : col('mobile');
    const emailCol = col('email');
    const whatsappCol = col('whatsapp');
    const sourceCol = col('source');
    const serviceCol = col('service');

    const leads: IncomingLead[] = [];
    for (let i = 1; i < values.length; i += 1) {
      const cells = values[i] ?? [];
      const name = cells[nameCol]?.trim();
      const phone = (cells[phoneCol] ?? '').trim().replace(/[^0-9+]/g, '');
      if (!name || !phone) continue;

      const source = cells[sourceCol]?.trim();
      const service = cells[serviceCol]?.trim();

      leads.push({
        externalKey: `${config.sheets.sheetId}:${i + 1}`,
        name,
        phone,
        email: cells[emailCol]?.trim() || undefined,
        whatsapp: cells[whatsappCol]?.trim() || undefined,
        source: source && source.length > 0 ? source : undefined,
        service: service && service.length > 0 ? service : undefined,
      });
    }

    logger.info(`Sheets sync: ${leads.length} rows fetched from ${config.sheets.sheetId}`);
    return leads;
  }
}

export function getAdapter(): LeadSourceAdapter {
  return new GoogleSheetsAdapter();
}
