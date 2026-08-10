-- Rebuild clients table with new status flow (Open -> In Progress -> Delivered -> Closed)
-- and the extra conversion fields (address, alternate_phone, service_description, transaction_ref).

CREATE TABLE clients_new (
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
  status          TEXT NOT NULL DEFAULT 'Open'
                  CHECK (status IN ('Open','In Progress','Delivered','Closed')),
  guarantee_status TEXT NOT NULL DEFAULT 'Guarantee Active',
  due_date        TEXT,
  assigned_to     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  inquiry_date    TEXT NOT NULL DEFAULT (date('now')),
  last_follow_up  TEXT,
  next_follow_up  TEXT,
  address         TEXT,
  alternate_phone TEXT,
  service_description TEXT,
  transaction_ref TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO clients_new (
  id, lead_id, name, phone, email, whatsapp, service, package_plan, amount, payment_status,
  source, sales_person_id, status, guarantee_status, due_date, assigned_to, inquiry_date,
  last_follow_up, next_follow_up, created_at, updated_at
)
SELECT id, lead_id, name, phone, email, whatsapp, service, package_plan, amount, payment_status,
  source, sales_person_id, status, guarantee_status, due_date, assigned_to, inquiry_date,
  last_follow_up, next_follow_up, created_at, updated_at
FROM clients;

DROP TABLE clients;
ALTER TABLE clients_new RENAME TO clients;

CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_clients_phone ON clients(phone);
CREATE INDEX idx_clients_sales ON clients(sales_person_id);
