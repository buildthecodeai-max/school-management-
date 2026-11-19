# Scholarum — School Management SaaS

A multi-tenant, multi-campus, subscription-based school management platform in one
web application: admissions, student records, attendance, assessment and report
cards, fees and finance, HR and recruitment, library, transport, inventory, health
and safeguarding, notifications, reports, and a public API.

It is built from the PRD/SRS *"Commercial SaaS Platform — School Management
Software (Hybrid + Homeschool)"* v1.2. This repository is the governed product
codebase: one source for every customer, no per-customer forks (PRD §15.4).

**Status.** The core workflows are built and exercised: admissions, students,
attendance, marks entry and report cards, billing and payments, HR and recruitment,
certificates, hostel, library circulation, notifications, integrations and the
platform console, with automated tests on the riskiest parts (access control, money,
merges, webhooks). A reachability audit on 2026-11-18 also found that some modules
are view-only or have server logic with no screen (transport, inventory, health,
safeguarding, leave requests, bank import, approvals), that a new school cannot yet
be set up without scripts, and that two-factor sign-in is not enforced. The
homeschooling module and native mobile apps are not built. See
[docs/REQUIREMENTS_TRACEABILITY.md](docs/REQUIREMENTS_TRACEABILITY.md) for the
row-by-row status and [Known limitations](#known-limitations) for the summary.

---

## Contents

- [What it does](#what-it-does)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Commands](#commands)
- [Testing](#testing)
- [Integrations: API, webhooks, cron](#integrations-api-webhooks-cron)
- [Project structure](#project-structure)
- [Conventions for contributors](#conventions-for-contributors)
- [Known limitations](#known-limitations)
- [Documentation](#documentation)

---

## What it does

### Modules

| Module | Where | Highlights |
| --- | --- | --- |
| Admissions | `/portal/admissions`, public `/apply/<school>` | Public inquiry form, pipeline board, checklist-gated stages, assessments and interviews, versioned offers, duplicate detection, one-step conversion into student + guardian + enrollment + portal account |
| Students | `/portal/students` | Longitudinal profiles, guardians with custody/pickup/financial flags, enrollment history, transfer / withdraw / alumni / re-enrol, documents with expiry flags, payments and refund requests from the student page, bulk year-end promotion and section moves (preview first, capacity and consistency checked), duplicate-record merge |
| Attendance | `/portal/attendance` | Per-section registers for any date within a week (older needs amend rights), validated marks, draft / submit / lock, amendments with a required reason and visible history, guardian alerts, reports by student and an absence/late log with CSV, analytics, student leave requests from parents with approval (approved leave pre-fills the register) |
| Academics | `/portal/academics`, `/portal/calendar` | Full configuration screens (years, terms, grades, sections, subjects, rooms, grade scales, attendance codes, leave types, departments); timetable versions with a slot editor, conflict detection and publish; teacher assignment and substitutes; lesson plans and homework; school calendar |
| Assessment | `/portal/exams` | Assessment plan creation, validated atomic marks entry, enforced workflow (enter → submit → approve → publish, maker-checker), tie-aware ranks, immutable versioned report cards (printable) with competency ratings and conduct, exam scheduling with seating and invigilators, CSV mark import |
| Fees | `/portal/fees` | Fee heads and structures, student fee assignment and discounts (bulk with preview), installments, idempotent billing runs, invoices, payments with FIFO allocation, per-payment printable receipts, payment reversal, credit notes, write-offs, payment plans, refunds through the approvals inbox (limited to unapplied credit), filtered fee reports with CSV (collections, overdue and aging, discounts, refunds, ledger), bank-statement import with auto and manual reconciliation, GL journal export |
| Finance | `/portal/finance` | Operational ledger: accounts, categories, funds, income and expense transactions |
| HR | `/portal/hr` | Staff directory and add-staff, leave requests and approvals, staff attendance, payroll runs with payslips, recruitment pipeline with hire-to-staff, separation checklists |
| Library | `/portal/library` | Catalog and copies, issue and return by barcode, renewals (max 2), reservation queue with notifications, per-day late fines that staff can pay or waive, damaged returns, readers see their own loans |
| Transport | `/portal/transport` | Fleet, routes, stops, student assignment with seat limits, trip attendance with guardian alerts |
| Inventory | `/portal/inventory` | Catalog, suppliers, stock adjustment (never below zero), requisitions through approvals then issue, purchase orders (send, receive exactly once, cancel), asset assignment, low-stock alerts to the people who can restock |
| Health and safeguarding | `/portal/health`, `/portal/safeguarding` | Health records and incidents; safeguarding cases with an append-only record, reasoned status changes, and audited views, under dedicated permissions that campus admins and teachers do not hold by default |
| Hostel, certificates, ID cards | `/portal/hostel`, `/portal/certificates` | Hostel assignments; certificate issuing and student ID cards |
| Communication | `/portal/messages`, `/portal/notifications` | In-app inbox, delivery log with retry, per-language templates, daily digest, per-user preferences |
| Reports | `/portal/reports` | CSV and XLSX exports and print views (income and expenses, posted payroll, enrollment by section) |
| Setup and import | `/portal/setup`, `/portal/import` | Launch-readiness checklist, campus configuration clone (preview, then copy), CSV student and marks import (mapping, validation, preview, all-or-nothing commit), organization and campus settings |
| Integrations | `/portal/integrations` | API clients, outbound webhooks, inbound payment-gateway webhook |
| Subscription | `/portal/billing` | Plan, entitlements and usage against limits (view only) |
| Platform console | `/portal/platform` | Tenant provisioning, suspension, support impersonation, data export and offboarding, plans, platform audit log |
| Family portal | `/portal/family` | For guardians and students: per-child attendance, results, timetable, leave requests, and (paying or primary guardian only) fees and receipts |
| Approvals | `/portal/approvals` | Inbox for refunds and requisitions with maker-checker (the requester cannot approve their own) |
| Account | `/portal/account` | Change password, two-factor authentication, notification and language preferences |

### Cross-cutting

- **Tenancy and campuses.** Every customer-owned row carries a `tenantId`; campus-scoped
  data also carries `campusId`. Tenant context always comes from the authenticated session,
  never from the client. A user can hold different roles on different campuses.
- **Access control.** An atomic permission catalog, custom roles, and role assignments at
  `PLATFORM`, `ORG` or `CAMPUS` scope. Deny by default, enforced on the server. High-risk
  actions (refunds, requisitions) are routed through the approvals inbox.
- **Security.** Database-backed sessions in `httpOnly`, `SameSite=Lax` cookies (`Secure` in
  production), bcrypt password hashing, TOTP two-factor enforced at sign-in for enrolled users, login rate
  limiting, a breached-password check at sign-in, self-service password reset, and support
  impersonation with a visible banner and audit trail.
- **Audit.** An append-only, hash-chained audit log; `npm run audit:verify` checks the chains.
- **Notifications.** One dispatch function (`notify()`) for every domain event: in-app message
  first, then email / SMS / push through pluggable providers, honouring user preferences, quiet
  hours, de-duplication and a per-recipient throttle. Sensitive messages never put their body
  on an external channel.
- **Localization.** Seven selectable languages (English, Spanish, French, Portuguese, Arabic,
  Swahili, Hindi). The portal shell, account page, students, attendance, fees and the main
  dashboards are translated into Spanish, French, Portuguese and Arabic (right-to-left for
  Arabic); anything untranslated falls back to English. Notification templates can have one
  version per language.
- **Dashboards and search.** Role-aware dashboards (platform operator, staff, guardian,
  finance, admissions), a permission-filtered global search, and a campus switcher.

---

## Tech stack

| Concern | Choice |
| --- | --- |
| Language | TypeScript, end to end |
| Web and API | Next.js 15 (App Router, Server Actions), React 19 |
| Database | PostgreSQL 16 (Docker) with Prisma 6 |
| Auth | Custom database-backed sessions, bcrypt, TOTP MFA enrolment (not yet enforced at sign-in) |
| UI | Tailwind CSS v4, lucide-react |
| Validation | Zod |
| Exports | exceljs (XLSX), CSV |
| Tests | Vitest (unit and integration), Playwright (end to end) |

---

## Quick start

Prerequisites: **Node.js 20+**, **npm**, and **Docker** (for PostgreSQL).

```bash
npm install
cp .env.example .env          # defaults match docker-compose.yml
docker compose up -d          # PostgreSQL 16 on localhost:5433
npx prisma db push            # create the schema
npm run db:seed               # load the demo school
npm run dev                   # http://localhost:3000
```

After `npm install` and creating `.env`, `npm run setup && npm run dev` does the database
steps in one go. Give the database a few seconds to become healthy first
(`docker compose ps`).

> **Warning: `npm run db:seed` wipes your data.** The seed script first deletes all existing
> tenants, users, plans, audit events and the data that hangs off them, then loads the demo
> data. It is for local development only. `npm run setup` runs it too. Never point it at a
> database you want to keep.

### Demo accounts

The seed creates one demo school, **HMSS** (slug `hmss`), with two campuses, **HMSS Main** and
**HMSS East**. All demo accounts use the password `password123`.

| Role | Email | Access |
| --- | --- | --- |
| Platform operator | `ops@scholarum.io` | Cross-tenant platform console |
| Organization owner | `owner@hmss.edu` | Everything, all campuses (the only role that can open Integrations) |
| Campus administrator | `admin@hmss.edu` | HMSS Main only; can convert applicants and approve credit notes and refunds |
| Admissions officer | `admissions@hmss.edu` | HMSS Main; cannot convert applicants |
| Finance officer | `finance@hmss.edu` | HMSS Main; can bill and collect but not adjust or refund |
| Teacher | `teacher@hmss.edu` | HMSS Main |
| Parent / guardian | `parent@hmss.edu` | Guardian portal with two linked children |
| Safeguarding officer | `safeguarding@hmss.edu` | HMSS Main; health and safeguarding only |

Things worth trying:

- Sign in as the **owner**, then as the **campus administrator**, and open Students: the same
  page shows both campuses to one and only Main to the other. A direct link to an out-of-scope
  student returns a 404, not a filtered list.
- Submit the public inquiry form at `http://localhost:3000/apply/hmss` (no login) and watch it
  land in the admissions pipeline.
- Submit an attendance register with a student marked late, then sign in as the **parent** to
  see the alert. The email and SMS providers are console stand-ins, so the "delivery" appears
  in the server log and in the delivery log at `/portal/notifications` (owner and campus
  administrator).
- As the **finance officer**, record a partial payment; the credit note and refund panel stays
  locked because that needs the separate adjust permission.

---

## Configuration

Copy `.env.example` to `.env`. These are the variables the code reads:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string (read by Prisma). The default matches `docker-compose.yml`. |
| `CRON_SECRET` | for scheduled jobs | Shared secret for `/api/internal/cron/*`. If unset, those endpoints refuse every request. |
| `NEXT_PUBLIC_BASE_URL` | no | Public origin used in password-reset links and shown as the payment webhook URL. Defaults to `http://localhost:3000`. |
| `NODE_ENV` | no | Set to `production` in production; turns on `Secure` cookies. |

`AUTH_SECRET` and `APP_NAME` appear in `.env.example` but are not read by the code today:
sessions are random tokens stored in the database, so there is no signing key.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server on port 3000 |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run db:up` / `npm run db:down` | Start / stop the PostgreSQL container |
| `npm run db:push` | Apply `schema.prisma` to the database (quick local development) |
| `npm run db:migrate` | Create a migration from schema changes (do this for anything that will ship) |
| `npm run db:deploy` | Apply the committed migrations (production, CI, fresh environments) |
| `npm run db:drift` | Fail if `schema.prisma` has changes that no migration contains (needs `SHADOW_DATABASE_URL`, see `.env.example`) |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:seed` | **Wipe** the database and load the demo school |
| `npm run setup` | `db:up` + schema push + seed |
| `npm test` | Unit tests |
| `npm run test:integration` | Integration tests (need the database running) |
| `npm run test:e2e` | Playwright end-to-end tests (need the dev server and the seeded database) |
| `npm run test:all` | Unit and integration tests |
| `npm run audit:verify` | Verify the audit-log hash chains |
| `npm run audit:backfill` | Backfill hash chains for older audit rows |

`npm run db:reset` rebuilds the database from `prisma/migrations`, which now match the schema.
For a quick local loop `db:push` is still fine; run `db:migrate` before you commit a schema change.

---

## Testing

| Layer | Where | How to run |
| --- | --- | --- |
| Unit | `tests/unit/` | `npm test`. No database needed. |
| Integration | `tests/integration/` | `npm run db:up`, then `npm run test:integration`. Runs against the real database in `DATABASE_URL`, creating and then deleting throwaway `itest_` tenants. |
| End to end | `tests/e2e/` | Start the app with `npm run dev` on a seeded database, install a browser once with `npx playwright install chromium`, then `npm run test:e2e`. Set `TEST_BASE_URL` if the app is not on port 3000. |

Integration tests (139) cover tenant isolation, campus switching, search scoping, the audit chain,
sign-in with two-factor, school provisioning, academic configuration, approvals, fee assignment,
reports and payment reversal, attendance, exams workflow, timetable and competencies, transport,
inventory, health and safeguarding, library, bank reconciliation, the family portal, bulk student
actions, campus clone and separation checklists. Unit tests (142) cover money, permissions, exams,
timetable, reports, translations, recruitment rules, parsing and matching of bank statements,
library and fee-report rules, and **static guards** (`tests/unit/static-guards.test.ts`) that fail
when a `"use server"` file exports anything but functions, an internal link points at a page
that does not exist, a server action has no caller, or an action takes a school id as an argument.

**End-to-end specs are stale.** `tests/e2e/` still signs in with `*@greenwood.edu` demo accounts
that the current seed no longer creates (it creates `*@hmss.edu`), and the specs write records,
so they have not been run in this pass. Update the accounts and run them against a disposable
database before relying on them.

Type-check with `npx tsc --noEmit` (currently clean). `npm run build` also type-checks every
`.ts` file in the repository, including `scripts/`, so a type error in a one-off script fails
the production build.

Vitest replaces the `server-only` package with a stub (`tests/stubs/server-only.ts`) so that
server modules can be imported in tests.

---

## Integrations: API, webhooks, cron

### Public REST API (`/api/v1`)

Create an API client under **Integrations** (organization owners only; the secret is shown
once and can be revoked instantly), then:

```bash
curl -H "Authorization: Bearer <keyId>.<secret>" http://localhost:3000/api/v1/students
```

| Endpoint | Notes |
| --- | --- |
| `GET /api/v1/students`, `POST /api/v1/students` | List (cursor pagination, filters, `?sort=field:asc`, `?fields=a,b`) and create |
| `GET /api/v1/students/{id}` | One student |
| `GET /api/v1/attendance/sessions` | Attendance sessions |
| `GET /api/v1/openapi.json` | OpenAPI description |

Keys carry scopes, and a missing scope returns `403`. `POST` accepts an `Idempotency-Key`
header: the same key and body replays the original response, the same key with a different
body returns `409`. Each client is limited to 120 requests per minute (`429` after that).
Every response carries a correlation id.

### Outbound webhooks

Register endpoints under **Integrations** for `student.enrolled` and
`attendance.session.submitted`. Each delivery is a JSON `POST` with the headers
`X-Scholarum-Event`, `X-Scholarum-Delivery` and
`X-Scholarum-Signature: sha256=<hex HMAC-SHA256 of the raw body, keyed with the endpoint secret>`.
The delivery log keeps every attempt, and **Redeliver** adds a new attempt without erasing
the failed one.

### Inbound payment-gateway webhook

`POST /api/webhooks/payments/<school-slug>`. Generate the signing secret under
**Integrations → Payment gateway (inbound)**. The endpoint takes a provider-neutral event:

```json
{
  "id": "evt_123",
  "type": "payment.succeeded",
  "data": { "reference": "ch_456", "amount": 10000, "currency": "USD", "invoiceNumber": "INV-000002" }
}
```

`amount` is in minor units (cents). Identify the payer with `invoiceNumber` or
`admissionNumber`. Sign the request with
`X-Scholarum-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`; requests more
than five minutes old are rejected. Note that this format differs from the outbound one above.

| Event type | Result |
| --- | --- |
| `payment.succeeded` | Posts a gateway receipt and allocates it, starting with the named invoice |
| `payment.refunded`, `payment.disputed` | Logged and flagged for review; never reversed automatically, because refunds need approval |
| anything else | Logged and ignored |

Processing is idempotent on the event `id` and on the gateway `reference`, so retries never
double-post. Unknown invoices return `422` (do not retry); transient failures return `500`.
Recent events are listed on the Integrations page. A real provider (Stripe and so on) still
needs a small adapter that maps its payload to this shape.

### Scheduled jobs

Two endpoints need an external scheduler (Vercel Cron, system cron, and so on). Call them with
`GET` and `Authorization: Bearer $CRON_SECRET`:

| Endpoint | Job |
| --- | --- |
| `/api/internal/cron/digest-notifications` | Daily digest of each user's unread messages |
| `/api/internal/cron/document-expiry` | Reminders for student documents that are about to expire |

---

## Project structure

```
prisma/
  schema.prisma          # 130+ models — the multi-tenant data model
  seed.ts                # demo school "HMSS" (wipes the database first)
  migrations/            # baseline and early migrations (lag the schema; see limitations)
scripts/                 # audit verify/backfill, plus one-off demo-data helpers
src/
  app/
    login/               # sign in, forgot password, reset password
    apply/[slug]/        # public admissions inquiry form (no login)
    portal/              # the authenticated app, one folder per module
    reports/print/       # printable report layout
    api/v1/              # public REST API (API-key auth)
    api/webhooks/payments/[tenantSlug]/   # inbound payment-gateway webhook
    api/internal/cron/   # scheduled jobs (Bearer CRON_SECRET)
    api/portal/          # authenticated downloads: reports, GL export, tenant export
  components/            # UI kit, PortalShell (nav, banners), dashboards
  lib/                   # domain logic and helpers (see below)
tests/
  unit/  integration/  e2e/  stubs/
docs/                    # architecture, traceability, feature reference
```

Key files in `src/lib`:

| File | Responsibility |
| --- | --- |
| `scope.ts` | Tenant + campus `where` fragment used by scoped queries |
| `permissions.ts`, `rbac.ts` | Permission catalog; scope resolution and guards (`requirePermission`, `canForCampus`, ...) |
| `auth.ts`, `login-rate-limit.ts`, `hibp.ts` | Sessions, login throttling, breached-password check |
| `audit.ts`, `audit-hash.ts` | Append-only hash-chained audit writer |
| `notify.ts`, `notification-providers.ts` | Central notification dispatch and pluggable providers |
| `webhooks.ts`, `webhook-events.ts` | Outbound signed webhooks and the event catalog |
| `gateway-webhooks.ts` | Inbound payment-gateway event verification and posting |
| `api-*.ts` | API keys, request preamble, rate limit, idempotency, response envelopes |
| `finance-server.ts`, `money.ts` | Billing helpers and invoice recompute; integer-cents money |
| `settings.ts` | Organization → campus settings with locking |
| `entitlements.ts` | Plan limits |
| `student-merge.ts`, `recruitment.ts` | Duplicate-student merge; applicant stage rules |
| `i18n*.ts`, `locales.ts` | Translations and locale resolution |

---

## Conventions for contributors

- **Check permissions on the server**, in both the page and the Server Action
  (`requirePermission`, `canForCampus`). Hiding a button is not access control.
- **Scope every query by tenant, and by campus where relevant**, using `src/lib/scope.ts`. Detail
  pages return 404 for out-of-scope records so existence is not revealed.
- **Mutations live in `actions.ts` files** next to their route and are Server Actions.
- **Send notices through `notify()`** (or `notifyFromTemplate()`), never `prisma.message.create`,
  so de-duplication, preferences, quiet hours, throttling and delivery logging stay uniform.
- **Emit `emitWebhook()` after the transaction commits** for events integrators may want, and
  add the event name to `src/lib/webhook-events.ts`.
- **Write an `audit()` entry** for every state-changing action.
- **Money is integer minor units (cents)** everywhere; format with `src/lib/money.ts`.
- **Anything marked `"server-only"` cannot be imported by a client component.** Put constants a
  client needs in a plain file (see `api-scopes.ts`).
- **After changing `schema.prisma`**, run `npx prisma db push` and **restart the dev server**; it
  caches the generated Prisma client and otherwise fails with errors like
  `Cannot read properties of undefined (reading 'findMany')`.
- **Translations** are keyed by the English source string and wrapped with `tr()` (see
  `src/lib/i18n.ts`); add the strings to `src/lib/i18n-pages.ts` or `i18n-dashboards.ts`.
  A missing entry simply falls back to English.

---

## Known limitations

Known gaps, so nothing here is a surprise. The full list and rationale are in
[docs/COMPLETION_REPORT.md](docs/COMPLETION_REPORT.md).

- **Student and guardian portals** cover the child hub (attendance, results, timetable, fees,
  leave). Not built: online fee payment, messaging with teachers, a mobile layout review.
- **Payment reversal and refunds take effect on one person's say-so** (permission plus a reason, audited).
  Refunds go through the approvals inbox; reversals do not.
- **Attendance is daily only.** Period- and subject-level registers and trend charts are not built.
- **Report cards** are printable HTML; there is no PDF generator or template editor.
- **Several modules are thin on reporting** (inventory valuation, transport costs, library statistics).
- **Email, SMS and push are console stand-ins.** The providers in
  `src/lib/notification-providers.ts` log instead of sending. Implement the `NotificationProvider`
  interface with a real service (SES, Twilio, FCM and so on) to deliver for real.
- **Rate limiters are in memory.** The API limiter and the login limiter are per process, so a
  multi-instance deployment needs a shared store.
- **Scheduled jobs are not self-triggering.** The cron endpoints need an external scheduler.
- **Payment gateway.** Only the generic signed webhook exists; there are no provider-specific
  adapters.
- **Migrations are caught up, but new schema changes need one.** `prisma/migrations` now
  reproduces the current schema exactly (verified: a fresh database built only from the migrations
  has no difference from `schema.prisma`). In development you can still use `db push`, but
  every schema change that ships needs a migration (`npm run db:migrate`), and `npm run db:drift`
  fails when `schema.prisma` has changes no migration contains. Production uses
  `npm run db:deploy`.
- **The breached-password check calls an external service** (Have I Been Pwned, using
  k-anonymity: only a 5-character hash prefix leaves the server) at sign-in. It fails open if the
  service is unreachable.
- **Translations are machine-drafted and partial.** Have a native speaker review them before
  real users see them.
- **No public careers page.** Recruitment is internal entry only; a public application form
  would be an unauthenticated write endpoint and needs bot protection first.
- **Not built:** the homeschooling module, native mobile apps, local / offline / hybrid editions
  with sync and licensing, campus merge, a generic custom-status workflow engine, and API v2
  deprecation tooling.
- **Dependencies.** `next` is pinned to 15.5.25, which patches the known runtime CVE. When last
  checked (September 2026), the remaining `npm audit` findings were in a build-time-only nested
  `postcss` that only Next 16 would clear.

---

## Documentation

| Document | What it is |
| --- | --- |
| [docs/COMPLETION_REPORT.md](docs/COMPLETION_REPORT.md) | **Current status.** What is complete, partial and missing, defects fixed, test results and remaining risks (2026-11-20) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | The load-bearing design decisions: tenancy, authorization, data conventions, notifications, API |
| [docs/REQUIREMENTS_TRACEABILITY.md](docs/REQUIREMENTS_TRACEABILITY.md) | Requirement-by-requirement status and the list of deferred items |
| [docs/FEATURE_REFERENCE.md](docs/FEATURE_REFERENCE.md) | Module-by-module feature reference |
| [docs/FEATURE_GAP_AUDIT.md](docs/FEATURE_GAP_AUDIT.md), [docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md) | Planning notes from earlier in the project (dated; the completion report is the current status) |
