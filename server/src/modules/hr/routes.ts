import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../../auth/guards';
import { config } from '../../config';
import { all, get, run, transaction } from '../../db';
import { AppError, asyncHandler } from '../../errors';
import { nowIso } from '../../utils/time';
import { validateUploadedFile } from '../../utils/fileValidation';
import { recordAudit } from '../audit';
import { notify, notifyRole } from '../notifications';

const router = Router();

const HR_DOC_TYPES = ['Aadhar', 'PAN', 'Degree', 'Bank', 'Photo', 'Other'] as const;

const requireHrAdmin = requireRoles('hr', 'super_admin');

fs.mkdirSync(config.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10) || '.bin';
    cb(null, `hr-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});

const uploadDoc = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new AppError(400, 'Only images and PDF files are allowed.', 'INVALID_FILE_TYPE'));
    }
  },
});

function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthStartEnd(month: string): [string, string] {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return [`${month}-01`, `${month}-${String(last).padStart(2, '0')}`];
}

function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function daySpan(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

function notifyHrAdmins(title: string, body: string, link?: string): void {
  notifyRole('hr', title, body, link);
  notifyRole('super_admin', title, body, link);
}

function ensureLeaveBalance(userId: number, leaveTypeId: number, year: number): { total_days: number; used_days: number; remaining_days: number } {
  run(
    `INSERT OR IGNORE INTO leave_balances (user_id, leave_type_id, year, total_days, used_days, remaining_days)
     SELECT ?, lt.id, ?, lt.days_per_year, 0, lt.days_per_year FROM leave_types lt WHERE lt.id = ?`,
    [userId, year, leaveTypeId],
  );
  const balance = get<{ total_days: number; used_days: number; remaining_days: number }>(
    'SELECT total_days, used_days, remaining_days FROM leave_balances WHERE user_id = ? AND leave_type_id = ? AND year = ?',
    [userId, leaveTypeId, year],
  );
  if (!balance) {
    throw new AppError(400, 'Leave type not found.', 'LEAVE_TYPE_NOT_FOUND');
  }
  return balance;
}

function seedBalancesForUser(userId: number, year: number): void {
  const types = all<{ id: number; days_per_year: number }>('SELECT id, days_per_year FROM leave_types');
  for (const t of types) {
    run(
      `INSERT OR IGNORE INTO leave_balances (user_id, leave_type_id, year, total_days, used_days, remaining_days)
       VALUES (?, ?, ?, ?, 0, ?)`,
      [userId, t.id, year, t.days_per_year, t.days_per_year],
    );
  }
}

function approvedLeaveOn(userId: number, date: string): boolean {
  const row = get(
    "SELECT id FROM leave_requests WHERE user_id = ? AND status = 'Approved' AND from_date <= ? AND to_date >= ?",
    [userId, date, date],
  );
  return Boolean(row);
}

router.use(requireAuth);

/* ------------------------------ SELF SERVICE ------------------------------ */

router.get(
  '/me/dashboard',
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const today = localDateKey();

    const profile = get<Record<string, unknown>>(
      `SELECT ep.*, u.name, u.email, u.phone, u.role, u.branch, u.active
       FROM employee_profiles ep JOIN users u ON u.id = ep.user_id
       WHERE ep.user_id = ?`,
      [me.id],
    );

    const balances = all<{
      leave_type_id: number;
      name: string;
      is_paid: number;
      requires_doc: number;
      total_days: number;
      used_days: number;
      remaining_days: number;
    }>(
      `SELECT b.leave_type_id, lt.name, lt.is_paid, lt.requires_doc,
              b.total_days, b.used_days, (b.total_days - b.used_days) AS remaining_days
       FROM leave_balances b JOIN leave_types lt ON lt.id = b.leave_type_id
       WHERE b.user_id = ? AND b.year = ?
       ORDER BY lt.id`,
      [me.id, new Date().getFullYear()],
    );

    const docs = all<{ doc_type: string; status: string }>(
      'SELECT doc_type, status FROM employee_documents WHERE user_id = ? ORDER BY id DESC',
      [me.id],
    );

    const todayLog = get<{ check_in: string | null; check_out: string | null; total_hours: number | null; status: string }>(
      'SELECT check_in, check_out, total_hours, status FROM attendance_logs WHERE user_id = ? AND date = ?',
      [me.id, today],
    );

    const pendingLeaves = get<{ c: number }>(
      "SELECT COUNT(*) AS c FROM leave_requests WHERE user_id = ? AND status = 'Pending'",
      [me.id],
    )?.c ?? 0;

    res.json({ user: me, profile, balances, docs, today: todayLog, pendingLeaves });
  }),
);

router.get(
  '/me/profile',
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const profile = get<Record<string, unknown>>(
      `SELECT ep.* FROM employee_profiles ep WHERE ep.user_id = ?`,
      [me.id],
    );
    res.json({ user: me, profile: profile ?? null });
  }),
);

router.patch(
  '/me/profile',
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const schema = z.object({
      bank_name: z.string().trim().max(100).optional().or(z.literal('')),
      bank_account: z.string().trim().max(50).optional().or(z.literal('')),
      bank_ifsc: z.string().trim().max(20).optional().or(z.literal('')),
      emergency_contact: z.string().trim().max(100).optional().or(z.literal('')),
      emergency_phone: z.string().trim().max(15).optional().or(z.literal('')),
    });
    const body = schema.parse(req.body);

    const existing = get<{ id: number }>('SELECT id FROM employee_profiles WHERE user_id = ?', [me.id]);
    if (existing) {
      const fields: string[] = [];
      const params: unknown[] = [];
      for (const key of ['bank_name', 'bank_account', 'bank_ifsc', 'emergency_contact', 'emergency_phone'] as const) {
        if (body[key] !== undefined) {
          fields.push(`${key} = ?`);
          params.push((body[key] as string | undefined)?.trim() || null);
        }
      }
      if (fields.length) {
        fields.push("updated_at = datetime('now')");
        run(`UPDATE employee_profiles SET ${fields.join(', ')} WHERE user_id = ?`, [...params, me.id]);
      }
    } else {
      run(
        `INSERT INTO employee_profiles (user_id, bank_name, bank_account, bank_ifsc, emergency_contact, emergency_phone)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          me.id,
          body.bank_name?.trim() || null,
          body.bank_account?.trim() || null,
          body.bank_ifsc?.trim() || null,
          body.emergency_contact?.trim() || null,
          body.emergency_phone?.trim() || null,
        ],
      );
      seedBalancesForUser(me.id, new Date().getFullYear());
    }
    res.json({ success: true });
  }),
);

router.get(
  '/me/leave-balance',
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const year = Number(req.query.year) || new Date().getFullYear();
    seedBalancesForUser(me.id, year);
    const balances = all(
      `SELECT b.leave_type_id, lt.name, lt.is_paid, lt.requires_doc,
              b.total_days, b.used_days, (b.total_days - b.used_days) AS remaining_days
       FROM leave_balances b JOIN leave_types lt ON lt.id = b.leave_type_id
       WHERE b.user_id = ? AND b.year = ?
       ORDER BY lt.id`,
      [me.id, year],
    );
    res.json({ balances, year });
  }),
);

router.get(
  '/me/leaves',
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const rows = all(
      `SELECT lr.*, lt.name AS leave_type_name, rt.name AS reviewer_name
       FROM leave_requests lr
       JOIN leave_types lt ON lt.id = lr.leave_type_id
       LEFT JOIN users rt ON rt.id = lr.reviewed_by
       WHERE lr.user_id = ?
       ORDER BY lr.created_at DESC`,
      [me.id],
    );
    res.json({ leaves: rows });
  }),
);

router.post(
  '/me/leaves',
  uploadDoc.single('document'),
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const body = req.body as Record<string, string | undefined>;

    const leaveTypeId = Number(body.leaveTypeId);
    const fromDate = (body.fromDate ?? '').trim();
    const toDate = (body.toDate ?? '').trim();
    const reason = (body.reason ?? '').trim() || null;

    if (!Number.isInteger(leaveTypeId) || leaveTypeId <= 0) {
      throw new AppError(400, 'Please choose a leave type.', 'VALIDATION_ERROR');
    }
    if (!isValidDateKey(fromDate) || !isValidDateKey(toDate)) {
      throw new AppError(400, 'Invalid date. Use YYYY-MM-DD.', 'VALIDATION_ERROR');
    }
    if (toDate < fromDate) {
      throw new AppError(400, 'End date cannot be before start date.', 'VALIDATION_ERROR');
    }

    const leaveType = get<{ id: number; name: string; days_per_year: number; requires_doc: number }>(
      'SELECT id, name, days_per_year, requires_doc FROM leave_types WHERE id = ?',
      [leaveTypeId],
    );
    if (!leaveType) {
      throw new AppError(404, 'Leave type not found.', 'LEAVE_TYPE_NOT_FOUND');
    }
    if (daySpan(fromDate, toDate) > leaveType.days_per_year) {
      throw new AppError(400, `Leave cannot exceed ${leaveType.days_per_year} days in one request.`, 'VALIDATION_ERROR');
    }
    if (leaveType.requires_doc && !req.file) {
      throw new AppError(400, `This leave type requires a supporting document (doctor note / report).`, 'DOCUMENT_REQUIRED');
    }

    const overlap = get(
      `SELECT id FROM leave_requests
       WHERE user_id = ? AND status IN ('Pending','Approved')
         AND NOT (to_date < ? OR from_date > ?)`,
      [me.id, fromDate, toDate],
    );
    if (overlap) {
      throw new AppError(409, 'You already have an overlapping leave request.', 'OVERLAPPING_LEAVE');
    }

    const year = Number(fromDate.slice(0, 4));
    const balance = ensureLeaveBalance(me.id, leaveTypeId, year);
    const days = daySpan(fromDate, toDate);
    if (days > balance.remaining_days) {
      throw new AppError(400, `Insufficient balance. Only ${balance.remaining_days} day(s) left for ${leaveType.name}.`, 'INSUFFICIENT_BALANCE');
    }

    let documentId: number | null = null;
    if (req.file) {
      validateUploadedFile(req.file);
      const file = req.file;
      const docResult = run(
        `INSERT INTO employee_documents (user_id, doc_type, file_path, original_name, mime, size)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [me.id, leaveType.name, file.filename, file.originalname, file.mimetype, file.size],
      );
      documentId = docResult.lastInsertRowid;
    }

    const result = run(
      `INSERT INTO leave_requests (user_id, leave_type_id, from_date, to_date, days, reason)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [me.id, leaveTypeId, fromDate, toDate, days, reason],
    );

    recordAudit(me.id, 'leave.apply', 'leave', result.lastInsertRowid, `${leaveType.name} ${fromDate} → ${toDate} (${days}d)`);
    notifyHrAdmins(
      'New leave request',
      `${me.name} applied for ${leaveType.name} (${fromDate} → ${toDate})`,
      '/hr/leaves',
    );

    res.status(201).json({ id: result.lastInsertRowid, documentId });
  }),
);

router.delete(
  '/me/leaves/:id',
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const id = Number(req.params.id);
    const row = get<{ status: string }>('SELECT status FROM leave_requests WHERE id = ? AND user_id = ?', [id, me.id]);
    if (!row) {
      throw new AppError(404, 'Leave request not found.', 'LEAVE_NOT_FOUND');
    }
    if (row.status !== 'Pending') {
      throw new AppError(409, 'Only pending requests can be cancelled.', 'CANNOT_CANCEL');
    }
    run("UPDATE leave_requests SET status = 'Cancelled' WHERE id = ?", [id]);
    res.json({ success: true });
  }),
);

router.get(
  '/me/documents',
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const rows = all(
      `SELECT ed.*, v.name AS verified_by_name
       FROM employee_documents ed
       LEFT JOIN users v ON v.id = ed.verified_by
       WHERE ed.user_id = ?
       ORDER BY ed.id DESC`,
      [me.id],
    );
    res.json({ documents: rows });
  }),
);

router.post(
  '/me/documents/:type',
  uploadDoc.single('file'),
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const docType = req.params.type as string;
    if (!(HR_DOC_TYPES as readonly string[]).includes(docType)) {
      throw new AppError(400, 'Unsupported document type.', 'INVALID_DOC_TYPE');
    }
    if (!req.file) {
      throw new AppError(400, 'A file is required.', 'FILE_REQUIRED');
    }
    validateUploadedFile(req.file);
    const file = req.file;

    run(
      "UPDATE employee_documents SET status = 'Rejected', rejection_reason = 'Superseded by a newer upload', verified_by = NULL, verified_at = NULL WHERE user_id = ? AND doc_type = ? AND status != 'Rejected'",
      [me.id, docType],
    );

    const result = run(
      `INSERT INTO employee_documents (user_id, doc_type, file_path, original_name, mime, size)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [me.id, docType, file.filename, file.originalname, file.mimetype, file.size],
    );

    recordAudit(me.id, 'hr.doc.upload', 'hr-doc', result.lastInsertRowid, `${docType} (${file.originalname})`);
    notifyHrAdmins('Document uploaded', `${me.name} uploaded ${docType}`, '/hr/documents');

    res.status(201).json({ id: result.lastInsertRowid });
  }),
);

router.get(
  '/me/attendance',
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const month = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : monthKey();
    const [start, end] = monthStartEnd(month);

    const rows = all<{ date: string; check_in: string | null; check_out: string | null; total_hours: number | null; status: string }>(
      `SELECT date, check_in, check_out, total_hours, status
       FROM attendance_logs WHERE user_id = ? AND date >= ? AND date <= ?
       ORDER BY date DESC`,
      [me.id, start, end],
    );

    const summary = {
      present: rows.filter((r) => r.status === 'Present').length,
      half_day: rows.filter((r) => r.status === 'Half-day').length,
      on_leave: rows.filter((r) => r.status === 'Leave').length,
    };

    res.json({ month, rows, summary });
  }),
);

router.post(
  '/me/attendance/checkin',
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const today = localDateKey();
    const existing = get<{ id: number; check_in: string | null }>(
      'SELECT id, check_in FROM attendance_logs WHERE user_id = ? AND date = ?',
      [me.id, today],
    );
    if (existing?.check_in) {
      throw new AppError(409, 'You have already checked in today.', 'ALREADY_CHECKED_IN');
    }
    if (approvedLeaveOn(me.id, today)) {
      throw new AppError(409, 'You are on approved leave today.', 'ON_LEAVE');
    }

    const now = nowIso();
    if (existing) {
      run('UPDATE attendance_logs SET check_in = ?, updated_at = ? WHERE id = ?', [now, now, existing.id]);
    } else {
      run(
        `INSERT INTO attendance_logs (user_id, date, check_in, status) VALUES (?, ?, ?, 'Present')`,
        [me.id, today, now],
      );
    }

    recordAudit(me.id, 'attendance.checkin', 'attendance', me.id, today);
    notifyHrAdmins('Check-in', `${me.name} checked in at ${new Date(now).toLocaleTimeString('en-IN')}`, '/hr/attendance');

    res.status(201).json({ date: today, check_in: now });
  }),
);

router.post(
  '/me/attendance/checkout',
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const today = localDateKey();
    const existing = get<{ id: number; check_in: string | null; check_out: string | null }>(
      'SELECT id, check_in, check_out FROM attendance_logs WHERE user_id = ? AND date = ?',
      [me.id, today],
    );
    if (!existing?.check_in) {
      throw new AppError(409, 'Check in before checking out.', 'NOT_CHECKED_IN');
    }
    if (existing.check_out) {
      throw new AppError(409, 'You have already checked out today.', 'ALREADY_CHECKED_OUT');
    }

    const now = nowIso();
    const hours = (Date.parse(now) - Date.parse(existing.check_in)) / 3_600_000;
    const status = hours >= 6 ? 'Present' : hours >= 3 ? 'Half-day' : 'Present';
    run('UPDATE attendance_logs SET check_out = ?, total_hours = ?, status = ?, updated_at = ? WHERE id = ?', [
      now,
      Math.round(hours * 100) / 100,
      status,
      now,
      existing.id,
    ]);

    recordAudit(me.id, 'attendance.checkout', 'attendance', me.id, today);
    res.json({ date: today, check_out: now, total_hours: Math.round(hours * 100) / 100, status });
  }),
);

router.get(
  '/me/salary',
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const rows = all(
      `SELECT pr.*, ep.designation, ep.department, ep.bank_name, ep.bank_account, ep.bank_ifsc, u.name
       FROM payroll_records pr
       LEFT JOIN employee_profiles ep ON ep.user_id = pr.user_id
       JOIN users u ON u.id = pr.user_id
       WHERE pr.user_id = ? AND pr.status = 'Published'
       ORDER BY pr.month DESC`,
      [me.id],
    );
    res.json({ records: rows });
  }),
);

/* ------------------------------ HR ADMIN ------------------------------ */

router.get(
  '/dashboard',
  requireHrAdmin,
  asyncHandler(async (req, res) => {
    const today = localDateKey();
    const pendingLeaves = get<{ c: number }>("SELECT COUNT(*) AS c FROM leave_requests WHERE status = 'Pending'")?.c ?? 0;
    const pendingDocs = get<{ c: number }>("SELECT COUNT(*) AS c FROM employee_documents WHERE status = 'Pending'")?.c ?? 0;
    const teamSize = get<{ c: number }>('SELECT COUNT(*) AS c FROM users WHERE active = 1')?.c ?? 0;

    const activeUsers = all<{ id: number }>('SELECT id FROM users WHERE active = 1');
    let checkedIn = 0;
    let onLeave = 0;
    for (const u of activeUsers) {
      const log = get<{ check_in: string | null }>(
        'SELECT check_in FROM attendance_logs WHERE user_id = ? AND date = ?',
        [u.id, today],
      );
      if (log?.check_in) checkedIn += 1;
      else if (approvedLeaveOn(u.id, today)) onLeave += 1;
    }
    const absent = activeUsers.length - checkedIn - onLeave;

    const recentJoiners = all(
      `SELECT u.id, u.name, u.role, u.branch, ep.designation, ep.joining_date
       FROM employee_profiles ep JOIN users u ON u.id = ep.user_id
       WHERE ep.joining_date IS NOT NULL
       ORDER BY ep.joining_date DESC LIMIT 6`,
    );

    const recentLeaves = all(
      `SELECT lr.id, lr.from_date, lr.to_date, lr.days, lr.status, lt.name AS leave_type_name, u.name AS employee_name
       FROM leave_requests lr
       JOIN leave_types lt ON lt.id = lr.leave_type_id
       JOIN users u ON u.id = lr.user_id
       ORDER BY lr.created_at DESC LIMIT 6`,
    );

    res.json({ today, teamSize, checkedIn, onLeave, absent, pendingLeaves, pendingDocs, recentJoiners, recentLeaves });
  }),
);

router.get(
  '/employees',
  requireHrAdmin,
  asyncHandler(async (req, res) => {
    const { role, branch, department, active, search } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (typeof role === 'string' && role) {
      conditions.push('u.role = ?');
      params.push(role);
    }
    if (typeof branch === 'string' && branch) {
      conditions.push('u.branch = ?');
      params.push(branch);
    }
    if (typeof department === 'string' && department) {
      conditions.push('ep.department = ?');
      params.push(department);
    }
    if (active !== undefined) {
      conditions.push('u.active = ?');
      params.push(active === 'true' ? 1 : 0);
    }
    if (typeof search === 'string' && search.trim()) {
      conditions.push('(u.name LIKE ? OR u.phone LIKE ? OR u.email LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = all(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.branch, u.active,
              ep.designation, ep.department, ep.joining_date, ep.salary_grade
       FROM users u
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       ${where}
       ORDER BY u.name`,
      params,
    );
    res.json({ employees: rows });
  }),
);

const createEmployeeSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().optional().or(z.literal('')),
  phone: z.string().trim().min(10).max(15),
  role: z.enum(['super_admin', 'admin', 'sales', 'service', 'hr']),
  branch: z.enum(['Coimbatore', 'Bangalore', 'Dharmapuri']),
  designation: z.string().trim().max(100).optional().or(z.literal('')),
  department: z.string().trim().max(100).optional().or(z.literal('')),
  joining_date: z.string().trim().optional().or(z.literal('')),
});

router.post(
  '/employees',
  requireHrAdmin,
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const body = createEmployeeSchema.parse(req.body);
    const year = new Date().getFullYear();

    if (get('SELECT id FROM users WHERE phone = ?', [body.phone])) {
      throw new AppError(409, 'A user with this phone number already exists.', 'DUPLICATE_PHONE');
    }
    const email = body.email?.trim() || null;
    if (email && get('SELECT id FROM users WHERE email = ?', [email])) {
      throw new AppError(409, 'A user with this email already exists.', 'DUPLICATE_EMAIL');
    }

    const userId = transaction(() => {
      const result = run(
        'INSERT INTO users (name, email, phone, role, branch) VALUES (?, ?, ?, ?, ?)',
        [body.name, email, body.phone, body.role, body.branch],
      );
      run(
        `INSERT INTO employee_profiles (user_id, designation, department, joining_date)
         VALUES (?, ?, ?, ?)`,
        [result.lastInsertRowid, body.designation?.trim() || null, body.department?.trim() || null, body.joining_date?.trim() || null],
      );
      seedBalancesForUser(result.lastInsertRowid, year);
      return result.lastInsertRowid;
    });

    recordAudit(me.id, 'hr.employee.create', 'user', userId, `${body.name} (${body.role})`);
    notify(userId, 'Welcome aboard', `Your staff profile has been created. Log in to view your dashboard.`, '/my/dashboard');

    res.status(201).json({ id: userId });
  }),
);

router.get(
  '/employees/:id',
  requireHrAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const employee = get<Record<string, unknown>>(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.branch, u.active,
              ep.*
       FROM users u
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       WHERE u.id = ?`,
      [id],
    );
    if (!employee) {
      throw new AppError(404, 'Employee not found.', 'EMPLOYEE_NOT_FOUND');
    }

    const year = Number(req.query.year) || new Date().getFullYear();
    const balances = all(
      `SELECT b.leave_type_id, lt.name, b.total_days, b.used_days, (b.total_days - b.used_days) AS remaining_days
       FROM leave_balances b JOIN leave_types lt ON lt.id = b.leave_type_id
       WHERE b.user_id = ? AND b.year = ? ORDER BY lt.id`,
      [id, year],
    );
    const leaves = all(
      `SELECT lr.*, lt.name AS leave_type_name, rt.name AS reviewer_name
       FROM leave_requests lr
       JOIN leave_types lt ON lt.id = lr.leave_type_id
       LEFT JOIN users rt ON rt.id = lr.reviewed_by
       WHERE lr.user_id = ? ORDER BY lr.created_at DESC LIMIT 50`,
      [id],
    );
    const documents = all(
      `SELECT ed.*, v.name AS verified_by_name
       FROM employee_documents ed LEFT JOIN users v ON v.id = ed.verified_by
       WHERE ed.user_id = ? ORDER BY ed.id DESC`,
      [id],
    );
    const payroll = all(
      'SELECT id, month, basic, hra, allowances, deductions, pf, tax, gross, net, status, published_at FROM payroll_records WHERE user_id = ? ORDER BY month DESC',
      [id],
    );

    res.json({ employee, balances, leaves, documents, payroll });
  }),
);

const updateEmployeeSchema = z.object({
  designation: z.string().trim().max(100).optional().or(z.literal('')),
  department: z.string().trim().max(100).optional().or(z.literal('')),
  joining_date: z.string().trim().optional().or(z.literal('')),
  salary_grade: z.string().trim().max(100).optional().or(z.literal('')),
  bank_name: z.string().trim().max(100).optional().or(z.literal('')),
  bank_account: z.string().trim().max(50).optional().or(z.literal('')),
  bank_ifsc: z.string().trim().max(20).optional().or(z.literal('')),
  emergency_contact: z.string().trim().max(100).optional().or(z.literal('')),
  emergency_phone: z.string().trim().max(15).optional().or(z.literal('')),
  active: z.boolean().optional(),
});

router.patch(
  '/employees/:id',
  requireHrAdmin,
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const id = Number(req.params.id);
    const body = updateEmployeeSchema.parse(req.body);

    const target = get<{ id: number; name: string; role: string }>('SELECT id, name, role FROM users WHERE id = ?', [id]);
    if (!target) {
      throw new AppError(404, 'Employee not found.', 'EMPLOYEE_NOT_FOUND');
    }
    if (body.joining_date && !isValidDateKey(body.joining_date)) {
      throw new AppError(400, 'Invalid joining date.', 'VALIDATION_ERROR');
    }

    transaction(() => {
      if (body.active !== undefined) {
        run('UPDATE users SET active = ?, updated_at = datetime(\'now\') WHERE id = ?', [body.active ? 1 : 0, id]);
      }
      const existing = get<{ id: number }>('SELECT id FROM employee_profiles WHERE user_id = ?', [id]);
      if (existing) {
        const fields: string[] = [];
        const params: unknown[] = [];
        for (const key of ['designation', 'department', 'joining_date', 'salary_grade', 'bank_name', 'bank_account', 'bank_ifsc', 'emergency_contact', 'emergency_phone'] as const) {
          if (body[key] !== undefined) {
            fields.push(`${key} = ?`);
            params.push((body[key] as string | undefined)?.trim() || null);
          }
        }
        if (fields.length) {
          fields.push("updated_at = datetime('now')");
          run(`UPDATE employee_profiles SET ${fields.join(', ')} WHERE user_id = ?`, [...params, id]);
        }
      } else {
        run(
          `INSERT INTO employee_profiles
             (user_id, designation, department, joining_date, salary_grade, bank_name, bank_account, bank_ifsc, emergency_contact, emergency_phone)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            body.designation?.trim() || null,
            body.department?.trim() || null,
            body.joining_date?.trim() || null,
            body.salary_grade?.trim() || null,
            body.bank_name?.trim() || null,
            body.bank_account?.trim() || null,
            body.bank_ifsc?.trim() || null,
            body.emergency_contact?.trim() || null,
            body.emergency_phone?.trim() || null,
          ],
        );
        seedBalancesForUser(id, new Date().getFullYear());
      }
    });

    recordAudit(me.id, 'hr.employee.update', 'user', id, `Updated ${target.name}`);
    res.json({ success: true });
  }),
);

router.get(
  '/leaves',
  requireHrAdmin,
  asyncHandler(async (req, res) => {
    const { status, from, to } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (typeof status === 'string' && status) {
      conditions.push('lr.status = ?');
      params.push(status);
    }
    if (typeof from === 'string' && isValidDateKey(from)) {
      conditions.push('lr.from_date >= ?');
      params.push(from);
    }
    if (typeof to === 'string' && isValidDateKey(to)) {
      conditions.push('lr.to_date <= ?');
      params.push(to);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = all(
      `SELECT lr.*, lt.name AS leave_type_name, u.name AS employee_name, u.role, rt.name AS reviewer_name
       FROM leave_requests lr
       JOIN leave_types lt ON lt.id = lr.leave_type_id
       JOIN users u ON u.id = lr.user_id
       LEFT JOIN users rt ON rt.id = lr.reviewed_by
       ${where}
       ORDER BY CASE lr.status WHEN 'Pending' THEN 0 ELSE 1 END, lr.created_at DESC`,
      params,
    );
    res.json({ leaves: rows });
  }),
);

router.patch(
  '/leaves/:id',
  requireHrAdmin,
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const id = Number(req.params.id);
    const schema = z.object({
      action: z.enum(['approve', 'reject']),
      note: z.string().trim().max(500).optional().or(z.literal('')),
    });
    const body = schema.parse(req.body);

    const leave = get<{
      id: number;
      user_id: number;
      leave_type_id: number;
      from_date: string;
      to_date: string;
      days: number;
      status: string;
    }>('SELECT * FROM leave_requests WHERE id = ?', [id]);
    if (!leave) {
      throw new AppError(404, 'Leave request not found.', 'LEAVE_NOT_FOUND');
    }
    if (leave.status !== 'Pending') {
      throw new AppError(409, 'This request has already been reviewed.', 'ALREADY_REVIEWED');
    }

    const status = body.action === 'approve' ? 'Approved' : 'Rejected';
    const note = body.note?.trim() || null;
    const reviewedAt = nowIso();

    transaction(() => {
      if (body.action === 'approve') {
        const year = Number(leave.from_date.slice(0, 4));
        const balance = ensureLeaveBalance(leave.user_id, leave.leave_type_id, year);
        if (leave.days > balance.remaining_days) {
          throw new AppError(400, `Insufficient balance (${balance.remaining_days} day(s) left).`, 'INSUFFICIENT_BALANCE');
        }
        run(
          `UPDATE leave_balances
           SET used_days = used_days + ?, remaining_days = total_days - (used_days + ?), updated_at = ?
           WHERE user_id = ? AND leave_type_id = ? AND year = ?`,
          [leave.days, leave.days, reviewedAt, leave.user_id, leave.leave_type_id, year],
        );
      }
      run(
        `UPDATE leave_requests SET status = ?, reviewed_by = ?, reviewed_at = ?, reviewer_note = ? WHERE id = ?`,
        [status, me.id, reviewedAt, note, id],
      );
    });

    const reviewer = me;
    const leaveTypeName = get<{ name: string }>('SELECT name FROM leave_types WHERE id = ?', [leave.leave_type_id])?.name ?? 'Leave';
    notify(
      leave.user_id,
      status === 'Approved' ? 'Leave approved' : 'Leave request rejected',
      `${leaveTypeName} (${leave.from_date} → ${leave.to_date}) was ${status.toLowerCase()} by ${reviewer.name}${note ? `: ${note}` : ''}.`,
      status === 'Approved' ? '/my/dashboard' : '/my/leave',
    );

    recordAudit(me.id, 'hr.leave.review', 'leave', id, `${leaveTypeName} → ${status}`);
    res.json({ success: true, status });
  }),
);

router.get(
  '/documents',
  requireHrAdmin,
  asyncHandler(async (req, res) => {
    const { status, type } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (typeof status === 'string' && status) {
      conditions.push('ed.status = ?');
      params.push(status);
    }
    if (typeof type === 'string' && type) {
      conditions.push('ed.doc_type = ?');
      params.push(type);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = all(
      `SELECT ed.*, u.name AS employee_name, v.name AS verified_by_name
       FROM employee_documents ed
       JOIN users u ON u.id = ed.user_id
       LEFT JOIN users v ON v.id = ed.verified_by
       ${where}
       ORDER BY CASE ed.status WHEN 'Pending' THEN 0 ELSE 1 END, ed.id DESC`,
      params,
    );
    res.json({ documents: rows });
  }),
);

router.patch(
  '/documents/:id',
  requireHrAdmin,
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const id = Number(req.params.id);
    const schema = z.object({
      action: z.enum(['verify', 'reject']),
      reason: z.string().trim().max(500).optional().or(z.literal('')),
    });
    const body = schema.parse(req.body);

    const doc = get<{ id: number; user_id: number; doc_type: string; status: string }>(
      'SELECT id, user_id, doc_type, status FROM employee_documents WHERE id = ?',
      [id],
    );
    if (!doc) {
      throw new AppError(404, 'Document not found.', 'DOCUMENT_NOT_FOUND');
    }
    if (doc.status === 'Verified' && body.action === 'verify') {
      throw new AppError(409, 'Document is already verified.', 'ALREADY_VERIFIED');
    }

    if (body.action === 'verify') {
      run('UPDATE employee_documents SET status = \'Verified\', verified_by = ?, verified_at = ?, rejection_reason = NULL WHERE id = ?', [me.id, nowIso(), id]);
      notify(doc.user_id, 'Document verified', `Your ${doc.doc_type} document has been verified.`, '/my/documents');
    } else {
      run('UPDATE employee_documents SET status = \'Rejected\', rejection_reason = ?, verified_by = ?, verified_at = ? WHERE id = ?', [
        body.reason?.trim() || 'Not acceptable.',
        me.id,
        nowIso(),
        id,
      ]);
      notify(doc.user_id, 'Document rejected', `Your ${doc.doc_type} document was rejected${body.reason?.trim() ? `: ${body.reason.trim()}` : ''}.`, '/my/documents');
    }

    recordAudit(me.id, 'hr.document.review', 'hr-doc', id, `${doc.doc_type} → ${body.action}`);
    res.json({ success: true });
  }),
);

router.get(
  '/attendance',
  requireHrAdmin,
  asyncHandler(async (req, res) => {
    const date = typeof req.query.date === 'string' && isValidDateKey(req.query.date) ? req.query.date : localDateKey();

    const users = all<{ id: number; name: string; role: string; branch: string }>(
      'SELECT id, name, role, branch FROM users WHERE active = 1 ORDER BY name',
    );
    const logs = new Map(
      all<{ user_id: number; check_in: string | null; check_out: string | null; total_hours: number | null; status: string }>(
        'SELECT user_id, check_in, check_out, total_hours, status FROM attendance_logs WHERE date = ?',
        [date],
      ).map((r) => [r.user_id, r]),
    );

    const rows = users.map((u) => {
      const log = logs.get(u.id);
      const onLeave = approvedLeaveOn(u.id, date);
      let status = log?.status ?? (log?.check_in ? 'Present' : 'Absent');
      if (onLeave) status = 'Leave';
      return {
        user: u,
        check_in: log?.check_in ?? null,
        check_out: log?.check_out ?? null,
        total_hours: log?.total_hours ?? null,
        status,
      };
    });

    res.json({ date, rows });
  }),
);

router.get(
  '/attendance/export',
  requireHrAdmin,
  asyncHandler(async (req, res) => {
    const from = typeof req.query.from === 'string' && isValidDateKey(req.query.from) ? req.query.from : `${monthKey()}-01`;
    const to = typeof req.query.to === 'string' && isValidDateKey(req.query.to) ? req.query.to : localDateKey();
    if (to < from) {
      throw new AppError(400, 'Invalid date range.', 'VALIDATION_ERROR');
    }
    if (daySpan(from, to) > 31) {
      throw new AppError(400, 'Export range is limited to 31 days.', 'RANGE_TOO_LARGE');
    }

    const users = all<{ id: number; name: string; role: string; branch: string }>(
      'SELECT id, name, role, branch FROM users WHERE active = 1 ORDER BY name',
    );
    const logs = all<{ user_id: number; date: string; check_in: string | null; check_out: string | null; total_hours: number | null; status: string }>(
      'SELECT user_id, date, check_in, check_out, total_hours, status FROM attendance_logs WHERE date >= ? AND date <= ?',
      [from, to],
    );
    const byUser = new Map<number, Map<string, typeof logs[number]>>();
    for (const log of logs) {
      if (!byUser.has(log.user_id)) byUser.set(log.user_id, new Map());
      byUser.get(log.user_id)!.set(log.date, log);
    }

    const leaveDates = all<{ user_id: number; date: string }>(
      `SELECT user_id, date
       FROM leave_requests
       WHERE status = 'Approved' AND from_date <= ? AND to_date >= ?
       ORDER BY user_id, date`,
      [to, from],
    );
    const leaveByUser = new Map<number, Set<string>>();
    for (const row of leaveDates) {
      if (!leaveByUser.has(row.user_id)) leaveByUser.set(row.user_id, new Set());
      leaveByUser.get(row.user_id)!.add(row.date);
    }

    const dates: string[] = [];
    for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }

    const lines = ['Date,Employee,Role,Branch,Check In,Check Out,Hours,Status'];
    for (const date of dates) {
      for (const u of users) {
        const log = byUser.get(u.id)?.get(date);
        const onLeave = leaveByUser.get(u.id)?.has(date) ?? false;
        const status = onLeave ? 'Leave' : log?.status ?? (log?.check_in ? 'Present' : 'Absent');
        lines.push(
          [
            date,
            u.name,
            u.role,
            u.branch,
            log?.check_in ? new Date(log.check_in).toLocaleTimeString('en-IN', { hour12: false }) : '',
            log?.check_out ? new Date(log.check_out).toLocaleTimeString('en-IN', { hour12: false }) : '',
            log?.total_hours ?? '',
            status,
          ].join(','),
        );
      }
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-${from}-to-${to}.csv"`);
    res.send(lines.join('\n'));
  }),
);

router.get(
  '/payroll',
  requireHrAdmin,
  asyncHandler(async (req, res) => {
    const { month } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (typeof month === 'string' && month) {
      conditions.push('pr.month = ?');
      params.push(month);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = all(
      `SELECT pr.*, u.name, u.role, u.branch, ep.designation, ep.department
       FROM payroll_records pr
       JOIN users u ON u.id = pr.user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = pr.user_id
       ${where}
       ORDER BY pr.month DESC, u.name`,
      params,
    );
    res.json({ records: rows });
  }),
);

const createPayrollSchema = z.object({
  userId: z.number().int().positive(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  basic: z.number().min(0),
  hra: z.number().min(0),
  allowances: z.number().min(0),
  deductions: z.number().min(0),
  pf: z.number().min(0),
  tax: z.number().min(0),
});

router.post(
  '/payroll',
  requireHrAdmin,
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const body = createPayrollSchema.parse(req.body);

    const employee = get<{ id: number; name: string }>('SELECT id, name FROM users WHERE id = ?', [body.userId]);
    if (!employee) {
      throw new AppError(404, 'Employee not found.', 'EMPLOYEE_NOT_FOUND');
    }

    const gross = body.basic + body.hra + body.allowances;
    const net = gross - body.deductions - body.pf - body.tax;

    const existing = get<{ id: number; status: string }>('SELECT id, status FROM payroll_records WHERE user_id = ? AND month = ?', [
      body.userId,
      body.month,
    ]);
    if (existing?.status === 'Published') {
      throw new AppError(409, 'A payslip for this month is already published.', 'PAYSLIP_PUBLISHED');
    }

    let id: number;
    if (existing) {
      run(
        `UPDATE payroll_records
         SET basic = ?, hra = ?, allowances = ?, deductions = ?, pf = ?, tax = ?, gross = ?, net = ?, generated_by = ?, generated_at = ?
         WHERE id = ?`,
        [body.basic, body.hra, body.allowances, body.deductions, body.pf, body.tax, gross, net, me.id, nowIso(), existing.id],
      );
      id = existing.id;
    } else {
      const result = run(
        `INSERT INTO payroll_records
           (user_id, month, basic, hra, allowances, deductions, pf, tax, gross, net, generated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [body.userId, body.month, body.basic, body.hra, body.allowances, body.deductions, body.pf, body.tax, gross, net, me.id],
      );
      id = result.lastInsertRowid;
    }

    recordAudit(me.id, 'hr.payroll.generate', 'payroll', id, `${employee.name} ${body.month} gross ${gross}`);
    res.status(201).json({ id, status: 'Draft' });
  }),
);

router.patch(
  '/payroll/:id',
  requireHrAdmin,
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const id = Number(req.params.id);
    const row = get<{ id: number; user_id: number; month: string; status: string; net: number }>(
      'SELECT id, user_id, month, status, net FROM payroll_records WHERE id = ?',
      [id],
    );
    if (!row) {
      throw new AppError(404, 'Payslip not found.', 'PAYSLIP_NOT_FOUND');
    }
    if (row.status === 'Published') {
      throw new AppError(409, 'Payslip is already published.', 'ALREADY_PUBLISHED');
    }

    run(
      `UPDATE payroll_records SET status = 'Published', published_at = ? WHERE id = ?`,
      [nowIso(), id],
    );

    notify(row.user_id, 'Payslip published', `Your payslip for ${row.month} is ready. Net pay ₹${row.net.toLocaleString('en-IN')}.`, '/my/salary');
    recordAudit(me.id, 'hr.payroll.publish', 'payroll', id, `${row.month} net ${row.net}`);

    res.json({ success: true, status: 'Published' });
  }),
);

router.delete(
  '/payroll/:id',
  requireHrAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const row = get<{ id: number; status: string }>('SELECT id, status FROM payroll_records WHERE id = ?', [id]);
    if (!row) {
      throw new AppError(404, 'Payslip not found.', 'PAYSLIP_NOT_FOUND');
    }
    if (row.status === 'Published') {
      throw new AppError(409, 'Published payslips cannot be deleted.', 'CANNOT_DELETE');
    }
    run('DELETE FROM payroll_records WHERE id = ?', [id]);
    res.json({ success: true });
  }),
);

export const hrRoutes = router;
