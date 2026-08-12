import fs from 'node:fs';
import { google } from 'googleapis';
import { config } from '../../config';
import { logger } from '../../logger';
import { parseCsv } from './csv';
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
    this.available = Boolean(config.sheets.sheetId);
  }

  async fetchLeads(): Promise<IncomingLead[]> {
    if (!this.available || !config.sheets.sheetId) {
      throw new Error('Google Sheet ID is not configured.');
    }

    let values: string[][] = [];

    // Try Google Service Account API first if configured
    let credentials: { client_email?: string; private_key?: string } = {};
    if (config.sheets.serviceAccountJson.trim().startsWith('{')) {
      try { credentials = JSON.parse(config.sheets.serviceAccountJson); } catch {}
    } else if (config.sheets.serviceAccountFile && fs.existsSync(config.sheets.serviceAccountFile)) {
      try { credentials = JSON.parse(fs.readFileSync(config.sheets.serviceAccountFile, 'utf8')); } catch {}
    }

    if (credentials.client_email && credentials.private_key && !credentials.private_key.includes('YOUR_PRIVATE_KEY_HERE')) {
      try {
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
        values = (response.data.values ?? []) as string[][];
      } catch (err) {
        logger.warn(`Sheets API fetch failed, falling back to public CSV export: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Fallback to public CSV export fetch if values not populated
    if (values.length === 0) {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${config.sheets.sheetId}/export?format=csv`;
      const res = await fetch(csvUrl);
      if (!res.ok) {
        throw new Error(`Failed to fetch Google Sheet CSV (${res.status} ${res.statusText}). Make sure the Sheet permissions are set to "Anyone with the link can view".`);
      }
      const csvText = await res.text();
      values = parseCsv(csvText);
    }

    if (values.length === 0) return [];

    const headers = values[0].map((h) => h.trim().toLowerCase());
    const findCol = (...candidates: string[]): number => {
      for (const name of candidates) {
        const idx = headers.indexOf(name);
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const nameCol = findCol('full_name', 'name', 'lead_name', 'customer_name');
    const phoneCol = findCol('phone', 'mobile', 'contact', 'phone_number');
    const emailCol = findCol('email', 'email_id');
    const whatsappCol = findCol('whatsapp', 'whatsapp_number');
    const sourceCol = findCol('platform', 'source', 'campaign_name');
    const serviceCol = findCol('form_name', 'service', 'ad_name');

    if (nameCol === -1 || phoneCol === -1) {
      logger.warn(`Sheets header mismatch. Headers found: ${headers.join(', ')}`);
      return [];
    }

    const leads: IncomingLead[] = [];
    for (let i = 1; i < values.length; i += 1) {
      const cells = values[i] ?? [];
      const rawName = cells[nameCol]?.trim();
      let rawPhone = (cells[phoneCol] ?? '').trim();
      
      // Clean Meta/Facebook lead format "p:+919842457000"
      if (rawPhone.startsWith('p:')) {
        rawPhone = rawPhone.slice(2).trim();
      }
      const phone = rawPhone.replace(/[^0-9+]/g, '');

      if (!rawName || !phone) continue;

      const source = cells[sourceCol]?.trim();
      const service = cells[serviceCol]?.trim();

      leads.push({
        externalKey: `${config.sheets.sheetId}:${i + 1}`,
        name: rawName,
        phone,
        email: cells[emailCol]?.trim() || undefined,
        whatsapp: cells[whatsappCol]?.trim() || undefined,
        source: source && source.length > 0 ? source : 'Google Sheets',
        service: service && service.length > 0 ? service : 'Job Support',
      });
    }

    logger.info(`Sheets sync: ${leads.length} rows fetched from ${config.sheets.sheetId}`);
    return leads;
  }
}

export function getAdapter(): LeadSourceAdapter {
  return new GoogleSheetsAdapter();
}
