import type { Request, Response } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { get, run } from '../db';
import { AppError, asyncHandler } from '../errors';
import { sha256, randomToken } from '../utils/crypto';
import { addHours, nowIso } from '../utils/time';
import { requestOtp, verifyOtp } from './otp.service';

const SESSION_COOKIE = 'sscrm_session';

export function sessionTokenFrom(req: Request): string | null {
  const cookie = req.cookies?.[SESSION_COOKIE];
  if (typeof cookie === 'string') return cookie;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

export function createSession(userId: number): { token: string; expiresAt: string } {
  const token = randomToken(32);
  const expiresAt = addHours(new Date(), config.sessionIdleHours).toISOString();
  run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [
    sha256(token),
    userId,
    expiresAt,
  ]);
  return { token, expiresAt };
}

export function setSessionCookie(res: Response, token: string, expiresAt: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    path: '/',
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

const requestOtpSchema = z.object({
  identifier: z.string().trim().min(3).max(100),
  identifierType: z.enum(['phone', 'email']),
});

const verifyOtpSchema = z.object({
  identifier: z.string().trim().min(3).max(100),
  otp: z.string().trim().regex(/^\d{6}$/, 'OTP must be a 6-digit number'),
});

export const authRoutes = {
  requestOtp: asyncHandler(async (req: Request, res: Response) => {
    const body = requestOtpSchema.parse(req.body);

    const user = get<{ id: number; name: string }>(
      `SELECT id, name FROM users
       WHERE ${body.identifierType === 'phone' ? 'phone' : 'email'} = ? AND active = 1`,
      [body.identifier],
    );
    if (!user) {
      throw new AppError(404, 'No active account found with this identifier.', 'USER_NOT_FOUND');
    }

    const result = await requestOtp(body.identifier, body.identifierType, user.name);
    res.status(result.ok ? 200 : 429).json({ success: result.ok, message: result.message });
  }),

  verifyOtp: asyncHandler(async (req: Request, res: Response) => {
    const body = verifyOtpSchema.parse(req.body);
    const result = verifyOtp(body.identifier, body.otp);

    if (!result.ok || !result.user) {
      throw new AppError(401, result.message, 'OTP_INVALID');
    }

    const { token, expiresAt } = createSession(result.user.id);
    setSessionCookie(res, token, expiresAt);

    run('INSERT INTO audit_log (user_id, action, entity, detail) VALUES (?, ?, ?, ?)', [
      result.user.id,
      'auth.login',
      'user',
      `Login via OTP`,
    ]);

    res.json({ success: true, token, user: { id: result.user.id, role: result.user.role, name: result.user.name } });
  }),

  me: (req: Request, res: Response): void => {
    res.json({ user: req.user });
  },

  logout: (req: Request, res: Response): void => {
    const token = sessionTokenFrom(req);
    if (token) {
      run('DELETE FROM sessions WHERE token_hash = ?', [sha256(token)]);
    }
    clearSessionCookie(res);
    res.json({ success: true });
  },
};
