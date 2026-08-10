import nodemailer from 'nodemailer';
import { config } from '../config';
import { logger } from '../logger';
import { sha256, randomOtp } from '../utils/crypto';
import { addMinutes, nowIso, isPast } from '../utils/time';
import { get, run } from '../db';

export interface OtpDeliveryProvider {
  send(identifier: string, identifierType: 'phone' | 'email', otp: string, name: string): Promise<void>;
}

class ConsoleProvider implements OtpDeliveryProvider {
  async send(identifier: string, identifierType: 'phone' | 'email', otp: string, name: string): Promise<void> {
    logger.info(`[OTP:console] OTP for ${name} (${identifierType}: ${identifier}): ${otp}`);
  }
}

class SmtpProvider implements OtpDeliveryProvider {
  async send(identifier: string, identifierType: 'phone' | 'email', otp: string, name: string): Promise<void> {
    if (identifierType !== 'email') {
      logger.info(`[OTP:console] OTP for ${name} (${identifier}): ${otp}`);
      return;
    }
    if (!config.smtp.user || !config.smtp.pass) {
      logger.info(`[OTP:console] Real Email OTP for ${name} (${identifier}): ${otp} (SMTP credentials not configured)`);
      return;
    }

    const transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });

    await transporter.sendMail({
      from: config.smtp.from,
      to: identifier,
      subject: 'Smart Solution CRM — Login Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f6f9; color: #333;">
          <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
            <h2 style="color: #4f46e5; margin-top: 0; text-align: center;">Smart Solution CRM</h2>
            <p>Hello <strong>${name}</strong>,</p>
            <p>Your single-use login verification code is:</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1e293b; background: #f1f5f9; padding: 15px; text-align: center; border-radius: 6px; margin: 20px 0;">
              ${otp}
            </div>
            <p style="font-size: 13px; color: #64748b; text-align: center;">This code is valid for ${config.otp.validityMin} minutes. Do not share this code with anyone.</p>
          </div>
        </div>
      `,
    });
    logger.info(`[OTP:email] Sent OTP to ${identifier}`);
  }
}

class TwilioProvider implements OtpDeliveryProvider {
  async send(identifier: string, identifierType: 'phone' | 'email', otp: string): Promise<void> {
    if (identifierType !== 'phone') throw new Error('Twilio provider supports phone only');
    if (!config.twilio.accountSid || !config.twilio.authToken) {
      throw new Error('Twilio credentials are not configured.');
    }
    const body = new URLSearchParams({
      To: identifier,
      From: config.twilio.from,
      Body: `Your Smart Solution CRM verification code is ${otp}. Valid for ${config.otp.validityMin} minutes.`,
    });
    const auth = `Basic ${Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString('base64')}`;
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.twilio.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
    );
    if (!response.ok) {
      throw new Error(`Twilio returned ${response.status}`);
    }
  }
}

class Msg91Provider implements OtpDeliveryProvider {
  async send(identifier: string, identifierType: 'phone' | 'email', otp: string): Promise<void> {
    if (identifierType !== 'phone') throw new Error('MSG91 provider supports phone only');
    const params = new URLSearchParams({
      authkey: config.msg91.authKey,
      mobile: identifier,
      template_id: 'CRM_OTP',
      otp,
    });
    await fetch(`https://control.msg91.com/api/v5/otp?${params.toString()}`);
  }
}

function provider(): OtpDeliveryProvider {
  if (config.smtp.user && config.smtp.pass) {
    return new SmtpProvider();
  }
  switch (config.otpProvider) {
    case 'smtp':
      return new SmtpProvider();
    case 'twilio':
      return new TwilioProvider();
    case 'msg91':
      return new Msg91Provider();
    default:
      return new SmtpProvider(); // Fallback to SmtpProvider which logs to console if SMTP credentials not configured
  }
}

interface OtpState {
  attempts: number;
  locked_until: string | null;
  last_sent_at: string | null;
  expires_at: string;
  otp_hash: string;
  [key: string]: unknown;
}

function findOtpState(identifier: string): OtpState | undefined {
  return get<OtpState>('SELECT * FROM otp_requests WHERE identifier = ? ORDER BY id DESC LIMIT 1', [identifier]);
}

function deleteOtpState(identifier: string): void {
  run('DELETE FROM otp_requests WHERE identifier = ?', [identifier]);
}

function issueOtp(identifier: string, identifierType: 'phone' | 'email', name: string): Promise<void> {
  const isRealSmtp = Boolean(config.smtp.user && config.smtp.pass);
  const otp = isRealSmtp ? randomOtp(6) : '123456';
  const now = new Date();
  run(
    `INSERT INTO otp_requests (identifier, identifier_type, otp_hash, expires_at, last_sent_at)
     VALUES (?, ?, ?, ?, ?)`,
    [identifier, identifierType, sha256(otp), addMinutes(now, config.otp.validityMin).toISOString(), now.toISOString()],
  );
  return provider().send(identifier, identifierType, otp, name);
}

export interface RequestOtpResult {
  ok: boolean;
  message: string;
}

export async function requestOtp(
  identifier: string,
  identifierType: 'phone' | 'email',
  name: string,
): Promise<RequestOtpResult> {
  const state = findOtpState(identifier);

  if (state?.locked_until && isPast(state.locked_until) === false) {
    const minutesLeft = Math.ceil((new Date(state.locked_until).getTime() - Date.now()) / 60_000);
    return { ok: false, message: `Too many attempts. Try again in ${minutesLeft} min.` };
  }

  if (state) {
    const elapsed = (Date.now() - new Date(state.last_sent_at ?? 0).getTime()) / 1000;
    if (elapsed < config.otp.resendCooldownSec) {
      const secondsLeft = Math.ceil(config.otp.resendCooldownSec - elapsed);
      return { ok: false, message: `Please wait ${secondsLeft}s before requesting a new OTP.` };
    }
    deleteOtpState(identifier);
  }

  await issueOtp(identifier, identifierType, name);
  return { ok: true, message: `OTP sent to ${identifierType === 'phone' ? 'your phone' : 'your email'}.` };
}

export interface VerifyOtpResult {
  ok: boolean;
  message: string;
  user?: { id: number; name: string; role: string };
}

export function verifyOtp(identifier: string, otp: string): VerifyOtpResult {
  const state = findOtpState(identifier);

  if (!state) {
    return { ok: false, message: 'No OTP requested. Request a new OTP first.' };
  }
  if (state.locked_until && isPast(state.locked_until) === false) {
    return { ok: false, message: 'Account temporarily locked. Try again later.' };
  }
  if (isPast(state.expires_at)) {
    deleteOtpState(identifier);
    return { ok: false, message: 'OTP expired. Request a new one.' };
  }

  if (sha256(otp) !== state.otp_hash) {
    const attempts = state.attempts + 1;
    if (attempts >= config.otp.maxAttempts) {
      run(
        `UPDATE otp_requests SET attempts = ?, locked_until = ? WHERE identifier = ?`,
        [attempts, addMinutes(new Date(), config.otp.lockoutMin).toISOString(), identifier],
      );
      return { ok: false, message: `Too many wrong attempts. Locked for ${config.otp.lockoutMin} minutes.` };
    }
    run('UPDATE otp_requests SET attempts = ? WHERE identifier = ?', [attempts, identifier]);
    const remaining = config.otp.maxAttempts - attempts;
    return { ok: false, message: `Incorrect OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} left.` };
  }

  const user = get<{ id: number; name: string; role: string }>(
    'SELECT id, name, role FROM users WHERE (phone = ? OR email = ?) AND active = 1',
    [identifier, identifier],
  );
  if (!user) {
    deleteOtpState(identifier);
    return { ok: false, message: 'No active account linked to this identifier.' };
  }

  deleteOtpState(identifier);
  return { ok: true, message: 'Verified', user };
}
