import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { get, run } from '../db';
import { AppError, asyncHandler } from '../errors';
import type { AuthUser } from '../types';
import { sha256 } from '../utils/crypto';
import { addHours, isPast } from '../utils/time';
import { sessionTokenFrom } from './session';

const SESSION_COOKIE = 'sscrm_session';

export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = sessionTokenFrom(req);
  if (!token) {
    throw new AppError(401, 'Authentication required.', 'UNAUTHORIZED');
  }

  const row = await get<{ token_hash: string; user_id: number; expires_at: string }>(
    'SELECT * FROM sessions WHERE token_hash = ?',
    [sha256(token)],
  );
  if (!row || isPast(row.expires_at)) {
    throw new AppError(401, 'Session expired. Please log in again.', 'UNAUTHORIZED');
  }

  const user = await get<AuthUser>(
    `SELECT id, name, email, phone, role, branch FROM users WHERE id = ? AND active = 1`,
    [row.user_id],
  );
  if (!user) {
    throw new AppError(401, 'Account is no longer active.', 'UNAUTHORIZED');
  }

  const newExpiry = addHours(new Date(), config.sessionIdleHours).toISOString();
  await run('UPDATE sessions SET expires_at = ?, last_seen_at = ? WHERE token_hash = ?', [
    newExpiry,
    new Date().toISOString(),
    row.token_hash,
  ]);

  req.user = user;
  next();
});

export function requireRoles(...roles: AuthUser['role'][]): (req: Request, _res: Response, next: NextFunction) => void {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError(401, 'Authentication required.', 'UNAUTHORIZED');
    }
    if (!roles.includes(req.user.role)) {
      throw new AppError(403, 'You do not have permission to perform this action.', 'FORBIDDEN');
    }
    next();
  };
}

export const requireSuperAdmin = requireRoles('super_admin');
export const requireAdminOrAbove = requireRoles('super_admin', 'admin');
export const requireSalesOrAbove = requireRoles('super_admin', 'admin', 'sales');
