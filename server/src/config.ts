import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fileExists(p: string): boolean {
  return p.length > 0 && fs.existsSync(p);
}

const serviceAccountFile = process.env.GOOGLE_SERVICE_ACCOUNT_FILE ?? '';
const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? '';

function isRealGoogleCreds(): boolean {
  if (serviceAccountJson.trim().startsWith('{') && serviceAccountJson.includes('private_key') && !serviceAccountJson.includes('YOUR_PRIVATE_KEY_HERE')) {
    return true;
  }
  if (serviceAccountFile.length > 0 && fs.existsSync(serviceAccountFile)) {
    try {
      const content = fs.readFileSync(serviceAccountFile, 'utf8');
      return content.includes('private_key') && !content.includes('YOUR_PRIVATE_KEY_HERE');
    } catch {
      return false;
    }
  }
  return false;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: int(process.env.PORT, 4000),
  appOrigin: process.env.APP_ORIGIN ?? 'http://localhost:5173',

  dataDir: path.resolve(__dirname, '../data'),
  dbFile: path.resolve(__dirname, '../data/crm.db'),
  uploadDir: path.resolve(__dirname, '../data/uploads'),

  otp: {
    validityMin: int(process.env.OTP_VALIDITY_MIN, 10),
    resendCooldownSec: int(process.env.OTP_RESEND_COOLDOWN_SEC, 30),
    maxAttempts: int(process.env.OTP_MAX_ATTEMPTS, 3),
    lockoutMin: int(process.env.OTP_LOCKOUT_MIN, 15),
  },
  sessionIdleHours: int(process.env.SESSION_IDLE_HOURS, 12),
  dailyLeadQuota: int(process.env.DAILY_LEAD_QUOTA, 50),
  sheetSyncMinutes: int(process.env.SHEET_SYNC_MINUTES, 15),

  sheets: {
    enabled: Boolean(process.env.GOOGLE_SHEET_ID ?? '1l_RvoVCJYWcR6IPsGFuHQFtGBBI8lkTivPOqzIenmvw'),
    sheetId: process.env.GOOGLE_SHEET_ID ?? '1l_RvoVCJYWcR6IPsGFuHQFtGBBI8lkTivPOqzIenmvw',
    serviceAccountFile,
    serviceAccountJson,
    range: process.env.SHEET_RANGE ?? 'Leads!A:H',
  },

  otpProvider: (process.env.OTP_PROVIDER ?? 'console') as 'console' | 'twilio' | 'msg91' | 'smtp',
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
    authToken: process.env.TWILIO_AUTH_TOKEN ?? '',
    from: process.env.TWILIO_FROM ?? '',
  },
  msg91: {
    authKey: process.env.MSG91_AUTH_KEY ?? '',
    senderId: process.env.MSG91_SENDER_ID ?? '',
  },
  smtp: {
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: int(process.env.SMTP_PORT, 465),
    user: process.env.SMTP_USER ?? process.env.GMAIL_USER ?? '',
    pass: process.env.SMTP_PASS ?? process.env.GMAIL_APP_PASS ?? '',
    from: process.env.SMTP_FROM ?? 'Smart Solution CRM <noreply@smartsolutionagency.in>',
  },
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  brevoApiKey: process.env.BREVO_API_KEY ?? '',
};
