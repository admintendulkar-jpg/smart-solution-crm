import { Router } from 'express';
import { z } from 'zod';
import { requireAdminOrAbove, requireAuth } from '../../auth/guards';
import { ROLES, BRANCHES, ROLE_LABELS } from '../../constants';
import { all, get, run } from '../../db';
import { AppError, asyncHandler } from '../../errors';
import { recordAudit } from '../audit';

const router = Router();

const createUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().optional().or(z.literal('')),
  phone: z.string().trim().min(10).max(15),
  role: z.enum(ROLES),
  branch: z.enum(BRANCHES),
});

const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  phone: z.string().trim().min(10).max(15).optional(),
  role: z.enum(ROLES).optional(),
  branch: z.enum(BRANCHES).optional(),
  active: z.boolean().optional(),
});

router.use(requireAuth);

router.get(
  '/',
  requireAdminOrAbove,
  asyncHandler(async (req, res) => {
    const { role, branch, active } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (typeof role === 'string' && role) {
      conditions.push('role = ?');
      params.push(role);
    }
    if (typeof branch === 'string' && branch) {
      conditions.push('branch = ?');
      params.push(branch);
    }
    if (active !== undefined) {
      conditions.push('active = ?');
      params.push(active === 'true' ? 1 : 0);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const users = all<{
      id: number;
      name: string;
      email: string | null;
      phone: string | null;
      role: string;
      branch: string;
      active: number;
      created_at: string;
      [key: string]: unknown;
    }>(
      `SELECT id, name, email, phone, role, branch, active, created_at
       FROM users ${where} ORDER BY created_at DESC`,
      params,
    );
    res.json({ users: users.map((u) => ({ ...u, role_label: ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] })) });
  }),
);

router.post(
  '/',
  requireAdminOrAbove,
  asyncHandler(async (req, res) => {
    const body = createUserSchema.parse(req.body);
    const me = req.user!;

    const phoneExists = get('SELECT id FROM users WHERE phone = ?', [body.phone]);
    if (phoneExists) {
      throw new AppError(409, 'A user with this phone number already exists.', 'DUPLICATE_PHONE');
    }
    const email = body.email?.trim() || null;
    if (email) {
      const emailExists = get('SELECT id FROM users WHERE email = ?', [email]);
      if (emailExists) {
        throw new AppError(409, 'A user with this email already exists.', 'DUPLICATE_EMAIL');
      }
    }

    const result = run(
      'INSERT INTO users (name, email, phone, role, branch) VALUES (?, ?, ?, ?, ?)',
      [body.name, email, body.phone, body.role, body.branch],
    );

    recordAudit(me.id, 'user.create', 'user', result.lastInsertRowid, `${body.name} (${ROLE_LABELS[body.role]})`);

    res.status(201).json({ id: result.lastInsertRowid });
  }),
);

router.patch(
  '/:id',
  requireAdminOrAbove,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = updateUserSchema.parse(req.body);
    const me = req.user!;

    const target = get<{ id: number; name: string; role: string; email: string | null; phone: string | null }>(
      'SELECT id, name, role, email, phone FROM users WHERE id = ?',
      [id],
    );
    if (!target) {
      throw new AppError(404, 'User not found.', 'USER_NOT_FOUND');
    }
    if (target.role === 'super_admin' && me.role !== 'super_admin') {
      throw new AppError(403, 'Only the Super Admin can modify owner accounts.', 'FORBIDDEN');
    }
    if (body.role && body.role !== 'super_admin' && target.role === 'super_admin') {
      throw new AppError(403, 'Owner role cannot be reassigned.', 'FORBIDDEN');
    }

    if (body.phone && body.phone !== target.phone) {
      const clash = get('SELECT id FROM users WHERE phone = ? AND id != ?', [body.phone, id]);
      if (clash) {
        throw new AppError(409, 'A user with this phone number already exists.', 'DUPLICATE_PHONE');
      }
    }
    if (body.email !== undefined && body.email?.trim() !== target.email) {
      const email = body.email?.trim() || null;
      const clash = email ? get('SELECT id FROM users WHERE email = ? AND id != ?', [email, id]) : null;
      if (clash) {
        throw new AppError(409, 'A user with this email already exists.', 'DUPLICATE_EMAIL');
      }
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    for (const key of ['name', 'email', 'phone', 'role', 'branch'] as const) {
      if (body[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(key === 'email' ? (body.email?.trim() || null) : body[key]);
      }
    }
    if (body.active !== undefined) {
      fields.push('active = ?');
      params.push(body.active ? 1 : 0);
    }
    fields.push("updated_at = datetime('now')");

    if (fields.length > 1) {
      run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, [...params, id]);
    }

    recordAudit(
      me.id,
      'user.update',
      'user',
      id,
      `Updated ${target.name}: ${fields.filter((f) => f.includes('role') || f.includes('active') || f.includes('branch')).join(', ')}`,
    );

    res.json({ success: true });
  }),
);

export const usersRoutes = router;
