import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { requireAdminOrAbove, requireAuth } from '../../auth/guards';
import { config } from '../../config';
import { all, get, run } from '../../db';
import { AppError, asyncHandler } from '../../errors';
import { nowIso } from '../../utils/time';
import { validateUploadedFile } from '../../utils/fileValidation';
import { recordAudit } from '../audit';

const router = Router();

const CLIENT_STATUSES = ['Open', 'In Progress', 'Delivered', 'Closed'] as const;
const PAYMENT_METHODS = ['UPI', 'Bank Transfer', 'Cash', 'Card', 'Gateway'] as const;
const GUARANTEE_STATUSES = [
  'Guarantee Active',
  'Guarantee Fulfilled',
  'Refund Requested',
  'Refund Processed',
] as const;

fs.mkdirSync(config.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10) || '.bin';
    cb(null, `proof-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});

const uploadProof = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new AppError(400, 'Only images and PDF proof files are allowed.', 'INVALID_FILE_TYPE'));
    }
  },
});

interface ClientRow {
  id: number;
  name: string;
  amount: number;
  payment_status: string;
  sales_person_id: number | null;
  assigned_to: number | null;
  [key: string]: unknown;
}

async function assertClientAccess(user: { id: number; role: string }, clientId: number): Promise<ClientRow> {
  const client = await get<ClientRow>('SELECT * FROM clients WHERE id = ?', [clientId]);
  if (!client) {
    throw new AppError(404, 'Client not found.', 'CLIENT_NOT_FOUND');
  }
  if (['super_admin', 'admin'].includes(user.role)) {
    return client;
  }
  if (user.role === 'sales' && client.sales_person_id === user.id) {
    return client;
  }
  if (user.role === 'service' && client.assigned_to === user.id) {
    return client;
  }
  throw new AppError(403, 'You do not have permission to access this client.', 'FORBIDDEN');
}

async function recomputePaymentStatus(clientId: number, amount: number): Promise<void> {
  const row = await get<{ paid: number }>(
    "SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE client_id = ? AND status = 'Confirmed'",
    [clientId],
  );
  const paid = row?.paid ?? 0;
  const next = paid >= amount ? 'Paid' : paid > 0 ? 'Partial' : 'Pending';
  await run("UPDATE clients SET payment_status = ?, updated_at = datetime('now') WHERE id = ?", [next, clientId]);
}

router.use(requireAuth);

const CLIENT_SELECT = `
  SELECT c.*, s.name AS sales_person_name, sv.name AS service_person_name,
    CASE WHEN c.due_date IS NOT NULL AND c.due_date < ? AND c.status NOT IN ('Delivered','Closed') THEN 1 ELSE 0 END AS is_overdue
  FROM clients c
  LEFT JOIN users s ON s.id = c.sales_person_id
  LEFT JOIN users sv ON sv.id = c.assigned_to
`;

router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    if (user.role === 'sales') {
      const clients = await all(
        `${CLIENT_SELECT} WHERE c.sales_person_id = ? ORDER BY c.created_at DESC`,
        [nowIso(), user.id],
      );
      res.json({ clients });
      return;
    }
    if (user.role === 'service') {
      const clients = await all(
        `${CLIENT_SELECT} WHERE c.assigned_to = ? ORDER BY c.created_at DESC`,
        [nowIso(), user.id],
      );
      res.json({ clients });
      return;
    }
    if (['super_admin', 'admin'].includes(user.role)) {
      const clients = await all(`${CLIENT_SELECT} ORDER BY c.created_at DESC LIMIT 500`, [nowIso()]);
      res.json({ clients });
      return;
    }
    // HR and other unpermitted roles return empty array
    res.json({ clients: [] });
  }),
);

router.get(
  '/',
  requireAdminOrAbove,
  asyncHandler(async (req, res) => {
    const { status, search } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [nowIso()];
    if (typeof status === 'string' && status) {
      conditions.push('c.status = ?');
      params.push(status);
    }
    if (typeof search === 'string' && search.trim()) {
      conditions.push('(c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }
    const clients = await all(
      `${CLIENT_SELECT} ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       ORDER BY c.updated_at DESC LIMIT 1000`,
      params,
    );
    res.json({ clients });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const clientId = Number(req.params.id);
    await assertClientAccess(user, clientId);

    const client = await get<Record<string, unknown>>(`${CLIENT_SELECT} WHERE c.id = ?`, [nowIso(), clientId]);
    if (!client) {
      throw new AppError(404, 'Client not found.', 'CLIENT_NOT_FOUND');
    }
    const payments = await all('SELECT * FROM payments WHERE client_id = ? ORDER BY created_at DESC', [clientId]);
    const notes = await all(
      `SELECT n.*, u.name AS user_name FROM client_notes n
       JOIN users u ON u.id = n.user_id WHERE n.client_id = ? ORDER BY n.created_at DESC`,
      [clientId],
    );
    res.json({ client, payments, notes });
  }),
);

router.post(
  '/:id/notes',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const body = String(req.body?.body ?? '').trim();
    if (!body) {
      throw new AppError(400, 'Note cannot be empty.', 'EMPTY_NOTE');
    }
    const client = await get<{ id: number; name: string; sales_person_id: number | null; assigned_to: number | null }>(
      'SELECT id, name, sales_person_id, assigned_to FROM clients WHERE id = ?',
      [Number(req.params.id)],
    );
    if (!client) {
      throw new AppError(404, 'Client not found.', 'CLIENT_NOT_FOUND');
    }
    if (
      user.role === 'sales' && client.sales_person_id !== user.id ||
      user.role === 'service' && client.assigned_to !== user.id
    ) {
      throw new AppError(403, 'You cannot add notes to this client.', 'FORBIDDEN');
    }
    const noteId = (
      await run('INSERT INTO client_notes (client_id, user_id, body) VALUES (?, ?, ?)', [
        client.id,
        user.id,
        body,
      ])
    ).lastInsertRowid;
    res.status(201).json({ id: noteId });
  }),
);

router.post(
  '/:id/payments',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const client = await assertClientAccess(user, Number(req.params.id));

    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppError(400, 'Enter a valid payment amount.', 'INVALID_AMOUNT');
    }
    const method = String(req.body?.method ?? 'Gateway');
    if (!(PAYMENT_METHODS as readonly string[]).includes(method)) {
      throw new AppError(400, 'Invalid payment method.', 'INVALID_METHOD');
    }

    const paymentId = (
      await run('INSERT INTO payments (client_id, amount, method, status) VALUES (?, ?, ?, ?)', [
        client.id,
        amount,
        method,
        'Pending',
      ])
    ).lastInsertRowid;

    await recordAudit(user.id, 'payment.add', 'client', client.id, `${method} ₹${amount}`);
    res.status(201).json({ id: paymentId });
  }),
);

router.post(
  '/:id/payments/:pid/verify',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    if (user.role !== 'super_admin' && user.role !== 'admin') {
      throw new AppError(403, 'Only admins can verify payments.', 'FORBIDDEN');
    }
    const client = await assertClientAccess(user, Number(req.params.id));
    const payment = await get<{ id: number; status: string }>('SELECT id, status FROM payments WHERE id = ? AND client_id = ?', [
      Number(req.params.pid),
      client.id,
    ]);
    if (!payment) {
      throw new AppError(404, 'Payment not found.', 'PAYMENT_NOT_FOUND');
    }
    if (payment.status === 'Confirmed') {
      throw new AppError(409, 'Payment is already verified.', 'ALREADY_VERIFIED');
    }

    await run("UPDATE payments SET status = 'Confirmed', verified_by = ?, verified_at = ? WHERE id = ?", [
      user.id,
      nowIso(),
      payment.id,
    ]);
    await recomputePaymentStatus(client.id, client.amount);

    await recordAudit(user.id, 'payment.verify', 'client', client.id, `₹${client.amount} payment ${payment.id}`);
    res.json({ ok: true });
  }),
);

router.post(
  '/:id/payments/:pid/proof',
  uploadProof.single('proof'),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const client = await assertClientAccess(user, Number(req.params.id));
    const payment = await get<{ id: number }>('SELECT id FROM payments WHERE id = ? AND client_id = ?', [
      Number(req.params.pid),
      client.id,
    ]);
    if (!payment) {
      throw new AppError(404, 'Payment not found.', 'PAYMENT_NOT_FOUND');
    }
    if (!req.file) {
      throw new AppError(400, 'Proof file is required.', 'PROOF_REQUIRED');
    }
    validateUploadedFile(req.file);
    await run('UPDATE payments SET proof_path = ? WHERE id = ?', [req.file.filename, payment.id]);
    await recordAudit(user.id, 'payment.proof', 'client', client.id, `Uploaded proof for payment ${payment.id}`);
    res.status(201).json({ filename: req.file.filename });
  }),
);

router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const client = await assertClientAccess(user, Number(req.params.id));
    const currentStatus = String(client.status ?? 'Open');
    const newStatus = String(req.body?.status ?? '');

    if (!(CLIENT_STATUSES as readonly string[]).includes(newStatus)) {
      throw new AppError(400, 'Invalid client status.', 'INVALID_STATUS');
    }

    if (currentStatus !== newStatus) {
      const ALLOWED_TRANSITIONS: Record<string, string[]> = {
        'Open': ['In Progress', 'Closed'],
        'In Progress': ['Delivered', 'Open'],
        'Delivered': ['Closed', 'In Progress'],
        'Closed': [],
      };

      const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];
      const isAdmin = ['super_admin', 'admin'].includes(user.role);

      if (!allowed.includes(newStatus)) {
        if (currentStatus === 'Closed' && isAdmin && ['Delivered', 'In Progress'].includes(newStatus)) {
          // Admin override allowed to reopen Closed client to Delivered or In Progress
        } else {
          throw new AppError(
            400,
            `Cannot change client status from '${currentStatus}' to '${newStatus}'.`,
            'INVALID_STATUS_TRANSITION',
          );
        }
      }
    }

    await run("UPDATE clients SET status = ?, updated_at = datetime('now') WHERE id = ?", [newStatus, client.id]);
    await recordAudit(user.id, 'client.status', 'client', client.id, `${currentStatus} -> ${newStatus}`);
    res.json({ ok: true });
  }),
);

router.patch(
  '/:id/guarantee',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const client = await assertClientAccess(user, Number(req.params.id));
    const guaranteeStatus = String(req.body?.guarantee_status ?? '');
    if (!(GUARANTEE_STATUSES as readonly string[]).includes(guaranteeStatus)) {
      throw new AppError(400, 'Invalid guarantee status.', 'INVALID_GUARANTEE');
    }
    await run('UPDATE clients SET guarantee_status = ?, updated_at = datetime(\'now\') WHERE id = ?', [
      guaranteeStatus,
      client.id,
    ]);
    await recordAudit(user.id, 'client.guarantee', 'client', client.id, guaranteeStatus);
    res.json({ ok: true });
  }),
);

export const clientsRoutes = router;
