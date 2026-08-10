# Smart Solution CRM

Internal lead-management and sales-tracking system for Smart Solution Agency (Coimbatore / Bangalore / Dharmapuri).

Built as a production-grade internal tool — Zoho/Freshsales-style light theme, server-side access control, full audit trail.

## Status

**Phase 1 — MVP: complete and verified end-to-end**

- [x] OTP login (10-min expiry, 30s resend cooldown, 3-attempt lockout for 15 min, 12-hr session)
- [x] Role-based access (Super Admin, Admin, Sales, Service, HR) — enforced on the backend, not just the UI
- [x] Lead intake: CSV import + Google Sheets live sync (15-min scheduler) + duplicate detection
- [x] Auto lead-split with daily quota (round-robin, load-aware), manual reassignment
- [x] Sales queue with status pipeline, overdue auto-flagging, follow-up resurfacing
- [x] Call logging with outcome-driven status mapping, notes & call history (timestamped)
- [x] Lead → client conversion with SLA due-date calculation
- [x] Super Admin: pipeline kanban, team management, import history, split settings, audit log
- [x] Notifications (in-app) + realistic seeded demo data

Phase 2 (payment gateway + service team workflow), Phase 3 (reports + HR) and Phase 4 (telephony, polish, permission audit) are planned — see `docs/PHASES.md`-style notes in this README below.

## Stack

| Layer    | Tech                                                            |
| -------- | --------------------------------------------------------------- |
| Frontend | React 18, Vite, TypeScript, TanStack Query, lucide icons        |
| Backend  | Node.js, Express 4, TypeScript, zod                              |
| Database | SQLite (node:sqlite) for local dev — schema is portable to PostgreSQL/MySQL |
| Auth     | OTP via pluggable provider: console (dev) / Twilio / MSG91       |
| Sync     | Google Sheets API (service account)                              |

> Google Sheets is the **lead intake** layer only. The database is the system of record. Nothing is ever deleted — duplicates are flagged (`is_duplicate`) and shown to the owner, never overwritten.

## Running locally

Prerequisites: Node.js 20+ (tested on Node 24).

```powershell
# 1. install dependencies
npm.cmd install --prefix server
npm.cmd install --prefix client

# 2. seed the database (9 users, 60 demo leads)
npm.cmd run seed --prefix server

# 3. start the API  -> http://localhost:4000
npm.cmd run dev:server

# 4. start the web app -> http://localhost:5173
npm.cmd run dev:client
```

Open http://localhost:5173.

### Demo accounts (dev OTP provider)

The default `OTP_PROVIDER=console` prints the OTP to the server console. Copy `server/.env.example` to `server/.env` to configure Twilio/MSG91 for real SMS delivery.

| Phone      | Role        | Name          |
| ---------- | ----------- | ------------- |
| 9000000001 | Super Admin | Karthik R     |
| 9000000002 | Admin       | Priya N       |
| 9000000003 | Sales       | Arun Kumar    |
| 9000000004 | Sales       | Divya S       |
| 9000000005 | Sales       | Mohammed Faisal |
| 9000000006 | Sales       | Rahul Sharma  |
| 9000000007 | Service     | Meena V       |
| 9000000008 | Service     | Deepak P      |
| 9000000009 | HR          | Lakshmi K     |

## Google Sheets sync setup

1. Create a service account in Google Cloud Console, enable the Sheets API, download the JSON key.
2. Share your master lead sheet with the service account email (Editor).
3. Create `server/.env`:

```
GOOGLE_SHEET_ID=your_spreadsheet_id
GOOGLE_SERVICE_ACCOUNT_FILE=C:\path\to\service-account.json
SHEET_RANGE=Leads!A:H
```

The scheduler pulls new rows every `SHEET_SYNC_MINUTES` (default 15). Header columns: `name`, `phone` (required), plus optional `email`, `whatsapp`, `source`, `service`.

## API surface (Phase 1)

```
POST /api/auth/request-otp          { identifier, identifierType }
POST /api/auth/verify-otp           { identifier, otp }
GET  /api/auth/me | POST /api/auth/logout

GET  /api/leads/mine                sales queue (?status=&search=) — overdue floats to top
GET  /api/leads/stats               sales dashboard counters
GET  /api/leads/:id                 detail + calls + notes
POST /api/leads/:id/call            { outcome, durationSec?, note?, followUpAt? }
POST /api/leads/:id/follow-up       { scheduledAt, note? }
POST /api/leads/:id/notes           { body }
POST /api/leads/:id/convert         { service, packagePlan, amount, whatsapp?, email?, notes? }
POST /api/leads/:id/assign          { userId } (admin+)
GET  /api/leads                     all leads, filters (admin+)
GET  /api/leads/duplicates          (admin+)

GET/POST /api/clients…              client records
GET  /api/admin/dashboard           totals + rep performance + pipeline (admin+)
GET/POST/PATCH /api/admin/users     staff management (admin+)
GET/PUT /api/admin/settings         owner-only configuration
GET  /api/admin/audit               owner-only audit log
GET  /api/admin/split/preview | POST /api/admin/split/run   (owner)
POST /api/admin/sync/import/csv     (owner) multipart CSV upload
GET  /api/admin/sync/import/batches (owner)
GET  /api/admin/sync/sheets/status | POST /api/admin/sync/sheets/run  (owner)
GET/POST /api/admin/notifications…  in-app notifications
```

## Access control notes

- Every route goes through `requireAuth`; role guards (`requireRoles`, `requireSuperAdmin`, …) run on the server — URL manipulation cannot bypass them.
- Data scoping is applied in queries: a sales rep only sees leads where `assigned_to = <their id>`; `lead.call / follow-up / convert` re-check ownership server-side.
- HR role has no CRM routes at all; its module is mounted separately (Phase 3).
- All state changes are written to `audit_log` (visible to Super Admin only).

## Roadmap

- **Phase 2** — Payment gateway link (Razorpay/PayU, test-mode keys, auto-confirm), Service Team delivery workflow (statuses, SLA flagging), full client records with documents.
- **Phase 3** — Reports (daily/weekly/monthly exports), HR module (attendance, payroll, staff records) in an isolated mount, sales targets & incentives.
- **Phase 4** — Telephony provider adapter (Exotel/Knowlarity/Twilio click-to-call + call recording), WhatsApp Business API triggers, permission audit & load testing, UI polish pass.

## Decisions taken (from the spec's open questions)

| Question            | Decision                                          |
| ------------------- | ------------------------------------------------- |
| OTP validity        | 10 minutes (spec recommendation)                  |
| Payment flow        | Gateway-based (Option A) — Phase 2                |
| Daily lead quota    | Configurable default of 50/rep/day in Settings    |
| Sheets role         | Intake layer only; DB is the source of truth      |

## Project layout

```
smart-solution-crm/
├─ server/
│  ├─ src/
│  │  ├─ auth/            OTP service, sessions, RBAC guards
│  │  ├─ db/              migrations (SQL), connection, seed
│  │  ├─ modules/         users, leads, clients, split, sync, admin, audit, notifications
│  │  ├─ app.ts, index.ts, config.ts, constants.ts, errors.ts
│  └─ scripts/            PowerShell end-to-end smoke tests
└─ client/
   └─ src/
      ├─ auth/            login (OTP), session guards
      ├─ layout/          app shell, sidebar, topbar, notifications
      ├─ features/        dashboard, leads, clients, admin (pipeline/users/import/split/audit), hr
      ├─ ui/              design-system components
      ├─ lib/             API client, types, constants, formatting
      └─ styles/          design tokens + component styles
```
