CREATE TABLE employee_profiles (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  designation      TEXT,
  department       TEXT,
  joining_date     TEXT,
  salary_grade     TEXT,
  bank_name        TEXT,
  bank_account     TEXT,
  bank_ifsc        TEXT,
  emergency_contact TEXT,
  emergency_phone  TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_employee_profiles_department ON employee_profiles(department);

CREATE TABLE leave_types (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL UNIQUE,
  days_per_year  INTEGER NOT NULL DEFAULT 0,
  is_paid        INTEGER NOT NULL DEFAULT 1,
  requires_doc   INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE leave_balances (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leave_type_id  INTEGER NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  year           INTEGER NOT NULL,
  total_days     REAL NOT NULL DEFAULT 0,
  used_days      REAL NOT NULL DEFAULT 0,
  remaining_days REAL NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, leave_type_id, year)
);
CREATE INDEX idx_leave_balances_user ON leave_balances(user_id, year);

CREATE TABLE leave_requests (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leave_type_id  INTEGER NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
  from_date      TEXT NOT NULL,
  to_date        TEXT NOT NULL,
  days           REAL NOT NULL,
  reason         TEXT,
  status         TEXT NOT NULL DEFAULT 'Pending'
                 CHECK (status IN ('Pending','Approved','Rejected','Cancelled')),
  reviewed_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at    TEXT,
  reviewer_note  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_leave_requests_user ON leave_requests(user_id);
CREATE INDEX idx_leave_requests_status ON leave_requests(status);

CREATE TABLE employee_documents (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc_type        TEXT NOT NULL,
  file_path       TEXT NOT NULL,
  original_name   TEXT,
  mime            TEXT,
  size            INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'Pending'
                  CHECK (status IN ('Pending','Verified','Rejected')),
  verified_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  verified_at     TEXT,
  rejection_reason TEXT,
  uploaded_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_employee_documents_user ON employee_documents(user_id);
CREATE INDEX idx_employee_documents_status ON employee_documents(status);

CREATE TABLE attendance_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date         TEXT NOT NULL,
  check_in     TEXT,
  check_out    TEXT,
  total_hours  REAL,
  status       TEXT NOT NULL DEFAULT 'Present'
               CHECK (status IN ('Present','Absent','Half-day','Leave')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, date)
);
CREATE INDEX idx_attendance_date ON attendance_logs(date);

CREATE TABLE payroll_records (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month         TEXT NOT NULL,
  basic         REAL NOT NULL DEFAULT 0,
  hra          REAL NOT NULL DEFAULT 0,
  allowances    REAL NOT NULL DEFAULT 0,
  deductions    REAL NOT NULL DEFAULT 0,
  pf           REAL NOT NULL DEFAULT 0,
  tax          REAL NOT NULL DEFAULT 0,
  gross         REAL NOT NULL DEFAULT 0,
  net           REAL NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'Draft'
                CHECK (status IN ('Draft','Published')),
  generated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  generated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  published_at  TEXT,
  UNIQUE (user_id, month)
);
CREATE INDEX idx_payroll_month ON payroll_records(month);
CREATE INDEX idx_payroll_user ON payroll_records(user_id);

INSERT INTO leave_types (name, days_per_year, is_paid, requires_doc) VALUES
  ('Casual Leave', 12, 1, 0),
  ('Sick Leave', 10, 1, 1),
  ('Paid Leave', 12, 1, 0),
  ('Comp-off', 6, 1, 0);
