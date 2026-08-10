CREATE TABLE users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  email       TEXT UNIQUE,
  phone       TEXT UNIQUE,
  role        TEXT NOT NULL CHECK (role IN ('super_admin','admin','sales','service','hr')),
  branch      TEXT NOT NULL DEFAULT 'Coimbatore',
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE otp_requests (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  identifier     TEXT NOT NULL,
  identifier_type TEXT NOT NULL CHECK (identifier_type IN ('phone','email')),
  otp_hash       TEXT NOT NULL,
  attempts       INTEGER NOT NULL DEFAULT 0,
  locked_until   TEXT,
  last_sent_at   TEXT,
  expires_at     TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_otp_identifier ON otp_requests(identifier);

CREATE TABLE sessions (
  token_hash    TEXT PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at    TEXT NOT NULL,
  last_seen_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE leads (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  external_key  TEXT UNIQUE,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  email         TEXT,
  whatsapp      TEXT,
  source        TEXT NOT NULL DEFAULT 'Website',
  service       TEXT NOT NULL DEFAULT 'ATS Resume',
  branch        TEXT NOT NULL DEFAULT 'Coimbatore',
  status        TEXT NOT NULL DEFAULT 'New'
                CHECK (status IN ('New','Attempting','Follow-up','Not Interested','Converted')),
  assigned_to   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_at   TEXT,
  follow_up_at  TEXT,
  last_call_at  TEXT,
  last_outcome  TEXT,
  is_duplicate  INTEGER NOT NULL DEFAULT 0,
  duplicate_of  INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  imported_batch INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_leads_assigned ON leads(assigned_to, status);
CREATE INDEX idx_leads_phone ON leads(phone);
CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_leads_followup ON leads(follow_up_at);

CREATE TABLE call_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id      INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  outcome      TEXT NOT NULL,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  note         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_calls_lead ON call_logs(lead_id);

CREATE TABLE lead_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id    INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_lead_notes_lead ON lead_notes(lead_id);

CREATE TABLE clients (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id         INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  phone           TEXT NOT NULL,
  email           TEXT,
  whatsapp        TEXT,
  service         TEXT NOT NULL,
  package_plan    TEXT,
  amount          REAL NOT NULL DEFAULT 0,
  payment_status  TEXT NOT NULL DEFAULT 'Pending'
                  CHECK (payment_status IN ('Paid','Pending','Partial')),
  source          TEXT,
  sales_person_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'In Progress'
                  CHECK (status IN ('In Progress','Revision','Delivered','Closed')),
  guarantee_status TEXT NOT NULL DEFAULT 'Guarantee Active',
  due_date        TEXT,
  assigned_to     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  inquiry_date    TEXT NOT NULL DEFAULT (date('now')),
  last_follow_up  TEXT,
  next_follow_up  TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_clients_phone ON clients(phone);
CREATE INDEX idx_clients_sales ON clients(sales_person_id);

CREATE TABLE payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  amount      REAL NOT NULL,
  method      TEXT NOT NULL DEFAULT 'Gateway',
  gateway_ref TEXT,
  status      TEXT NOT NULL DEFAULT 'Pending'
              CHECK (status IN ('Pending','Confirmed','Failed','Refunded')),
  proof_path  TEXT,
  verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  verified_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_payments_client ON payments(client_id);

CREATE TABLE client_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_client_notes_client ON client_notes(client_id);

CREATE TABLE documents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('lead','client','payment')),
  entity_id     INTEGER NOT NULL,
  original_name TEXT NOT NULL,
  stored_name   TEXT NOT NULL,
  mime          TEXT,
  size          INTEGER NOT NULL DEFAULT 0,
  uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE lead_batches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name   TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'Sheets',
  status      TEXT NOT NULL DEFAULT 'Imported',
  total       INTEGER NOT NULL DEFAULT 0,
  imported    INTEGER NOT NULL DEFAULT 0,
  duplicates  INTEGER NOT NULL DEFAULT 0,
  errors      INTEGER NOT NULL DEFAULT 0,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  INTEGER,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);
CREATE INDEX idx_audit_user ON audit_log(user_id);

CREATE TABLE notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read);
