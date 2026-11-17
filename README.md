# Scholarum — School Management SaaS Platform

A commercial, multi-tenant, subscription-based school management platform, built
from the PRD/SRS *"Commercial SaaS Platform — School Management Software (Hybrid
+ Homeschool)"* v1.2.

This repository is the **governed product codebase** (one source for cloud and,
later, local/offline/hybrid editions — no per-customer forks, per PRD §15.4).

---

## What is built so far (MVP vertical slice)

The PRD is a full commercial platform (20 sections, ~120 requirements). Following
its own roadmap (§19), this repo delivers **Phase 1 (platform core)** plus a
fully working **Phase 2 vertical slice**, so the architecture is proven end to
end rather than stubbed broadly.

**Platform core**
- Multi-tenancy with hard logical isolation — `tenantId` on every customer-owned
  entity, enforced server-side through a single scoping helper (TEN-001/002).
- Campuses within a tenant, with campus-scoped access (BRN, §10).
- Identity & access: session auth (bcrypt, httpOnly cookies), custom roles built
  from an **atomic permission catalog**, and role assignments limited by scope
  (PLATFORM / ORG / CAMPUS). A user can hold different roles on different
  campuses (IAM-001/002/005).
- Append-only **audit trail** (SEC-005).
- Subscription / plan / entitlement model with usage-vs-limit display (BIL).

**Onboarding & data**
- **Guided setup** — a launch-readiness checklist that validates prerequisites
  (org profile, campuses, calendar, grades, sections, subjects, grade scale, fee
  structures, users, enrolled students) with a progress meter (CFG-001).
- **Bulk import** — paste/upload CSV, auto column-mapping with manual override,
  server-side row-level validation (resolves campus/grade/section, flags
  duplicate admission numbers and unknown references), a preview with per-row
  errors, and an **all-or-nothing commit** of the valid rows with reconciliation
  totals (CFG-004).

**Public API & webhooks** (`/portal/integrations`, API §15)
- **Versioned REST API** (`/api/v1/*`) with a hand-authored **OpenAPI spec** at
  `/api/v1/openapi.json` — students (list/get/create) and attendance sessions
  (list) as a representative, fully-working slice.
- **Tenant-scoped API credentials** — `keyId.secret` bearer tokens, curated
  scopes, shown once at creation, instantly revocable.
- **Idempotency-Key** support on mutating endpoints: a replayed key+body
  returns the original response verbatim; the same key with a different body
  is rejected (409) — never a silent duplicate.
- **Rate limiting** (429 with `resetAt`) and **correlation IDs** on every
  response.
- **Signed, retryable webhooks** — HMAC-SHA256 over the raw JSON body,
  subscribed by event (`student.enrolled`, `attendance.session.submitted`),
  with a delivery log and one-click **redeliver** that preserves the original
  failed attempt (API-001..006).

**School operations slice**
- **Admissions** — full lead-to-enrolled pipeline: a **public inquiry form**
  (`/apply/<tenant-slug>`), staff application entry, a Kanban pipeline board with
  funnel/conversion stats, per-application detail with a requirements checklist
  that gates stage advancement, assessments, interviews, **versioned offers**
  (approval-gated), duplicate detection, and a **transactional conversion** into
  student + guardian + enrollment + portal access (ADM-001..006, workflow §8.1).
- **Fees & finance** — fee heads/structures with per-student concessions, a
  **billing run** (preview eligible students + totals → post invoices,
  **idempotent** so re-running a period never double-bills), invoices with unique
  numbering and line items, **payments with FIFO allocation** and receipts,
  partial/advance handling, **credit notes & refunds gated by separation of
  duties** (`fee.adjust`), a finance dashboard with **aging buckets**, a
  per-student ledger, and guardian-visible balances (FEE-001..006, workflow §8.3).
- **Assessment & report cards** — assessment plans with weighted components and
  a configurable grade scale, a teacher **marks-entry grid** (per subject,
  validated, absent/exempt), a **moderation → approve → publish** workflow that
  **blocks publication until marks are complete**, weighted calculation with
  ranking, and **immutable versioned report cards** (corrections republish a new
  version); guardians/students see published cards only (EXM-001/003/004/006,
  workflow §8.4).
- **SIS** — student list (search, campus-scoped) and longitudinal student detail
  with guardians, custody/consent flags, enrollment history, attendance
  (SIS-001/002/003).
- **Attendance** — interactive register per section, draft/submit, idempotent
  upsert, lock rules requiring privileged amend, and **guardian alerts generated
  on submit** for qualifying codes (ATT-001..004, NTF-001).
- **Academics** — academic years/terms, grades, sections, homeroom (ACD).
- **Notifications** — a **central dispatch service** (`notify()`) used by every
  domain event instead of ad-hoc inbox writes: resolves the recipient, always
  creates the in-app message, then attempts **pluggable EMAIL/SMS/PUSH
  providers** (swap in real SES/Twilio/FCM behind one interface), applies
  per-user **channel preferences** (opt-out, mandatory categories bypass it),
  suppresses non-urgent external delivery during **quiet hours**, and **dedupes**
  by event key so retries/resubmits never double-notify. Every attempt is logged
  — provider, recipient, channel, status, correlation id, failure reason — in an
  **operations delivery log** with filters and one-click **retry** (append-only:
  the failed attempt stays, a new attempt is added) (NTF-001/003/004/005/006).
- **Role-aware dashboards** — platform operator, staff/campus, and guardian
  (§9, Table 27).

### Verified behaviors (clicked through in a browser)
- Org owner sees **26 enrollments across both campuses**; the Main-scoped admin
  sees **only 18 Main enrollments** — same page, isolation by role scope.
- A direct URL to an out-of-scope student returns **404** (does not reveal
  existence), not just a filtered list.
- Admin submits a register marking a student *Late* → the linked **guardian sees
  a "Late" alert** in their portal, and the student's attendance updates.
- Converting an *accepted* applicant transactionally creates the student
  (auto admission number), guardian, enrollment/placement, and an **active
  guardian portal account** — and moves the application to ENROLLED. The convert
  button is disabled for roles without `admissions.convert`.
- A public `/apply/greenwood` inquiry lands as a WEBSITE-source lead in the
  pipeline's Inquiry column.
- Importing the sample CSV previews **3 valid · 2 invalid** (a duplicate
  admission number and an unknown "Grade 9" are flagged per-row); committing
  creates exactly the 3 valid students and never touches the invalid rows.
- An admin approves and publishes the Grade 3 "Term 1 Assessment" → each
  student gets an **immutable v1 report card** (Mason Green: rank 1, overall
  75% B), and guardians are notified. "Republish" creates v2 and supersedes v1.
- The **finance officer** can record payments but the credit-note/refund panel
  shows "requires approval rights (separation of duties)"; recording a $1,000
  payment on a $1,650 invoice flips it to PARTIAL with a $650 balance, and
  re-running the same billing period reports "0 to bill · 18 already invoiced".
- An attendance alert delivers end-to-end — in-app **and** EMAIL, logged `SENT`
  with a correlation id in the delivery log. The parent then disables EMAIL for
  Attendance in **Preferences**; the next alert's EMAIL attempt logs `SKIPPED —
  Recipient opted out…` while the in-app message still arrives. Retrying a
  seeded `FAILED` delivery from the ops log produces a new `SENT` attempt
  without erasing the original failure.
- `curl` against the live API: no token → `401`; valid token → `200` + list;
  a token missing `attendance.read` hit against attendance sessions → `403
  insufficient_scope`; `POST /students` with an `Idempotency-Key`, replayed
  with the same body, returns the **exact same response** (same ids) and
  creates **exactly one** student in the database; the same key with a
  different body → `409`. Firing 125 rapid requests hits **exactly 121**
  successes then `429 rate_limited`. A webhook endpoint pointed at a real
  local receiver got a POST whose `X-Scholarum-Signature` was independently
  recomputed and **matched byte-for-byte**; stopping the receiver produced a
  genuine `FAILED` delivery (`fetch failed`), and **Redeliver** produced a
  new `DELIVERED` attempt while the original failure stayed in the log.

---

## Tech stack

| Concern        | Choice                                              |
| -------------- | --------------------------------------------------- |
| Language       | TypeScript (end to end)                             |
| Web + API      | Next.js 15 (App Router, Server Actions)             |
| Database       | PostgreSQL 16 (via Docker) + Prisma ORM             |
| Auth           | Custom session auth, bcrypt, httpOnly cookies       |
| UI             | Tailwind CSS v4, lucide-react icons                 |
| Validation     | Zod                                                 |

---

## Quick start

Prerequisites: **Node 20+**, **Docker** (for PostgreSQL).

```bash
npm install
docker compose up -d          # start PostgreSQL on localhost:5433
npx prisma db push            # create the schema
npm run db:seed               # load demo tenant, users and data
npm run dev                   # http://localhost:3000
```

Or in one shot after `npm install`:

```bash
npm run setup && npm run dev
```

### Demo accounts (password: `password123`)

| Role                 | Email                   | Scope                       |
| -------------------- | ----------------------- | --------------------------- |
| Platform operator    | `ops@scholarum.io`      | Cross-tenant platform admin |
| Organization owner   | `owner@greenwood.edu`   | All campuses                |
| Campus administrator | `admin@greenwood.edu`   | Greenwood Main only         |
| Admissions officer   | `admissions@greenwood.edu` | Greenwood Main (no convert rights) |
| Finance officer      | `finance@greenwood.edu` | Greenwood Main (no adjust/approval rights) |
| Teacher              | `teacher@greenwood.edu` | Greenwood Main              |
| Parent / guardian    | `parent@greenwood.edu`  | Two linked children         |

Try signing in as the **owner** then the **campus admin** on the Students page to
see campus-scoped isolation in action. The public admissions form is at
`http://localhost:3000/apply/greenwood` (no login required). The campus admin
also holds `notifications.operate` — after triggering an event (e.g. submitting
attendance), check `/portal/notifications` for the delivery log; any signed-in
user can manage their own channels and quiet hours at `/portal/preferences`.
Only the **owner** (org-wide only, by design) can reach `/portal/integrations`
to mint an API key and register a webhook endpoint — try:
```bash
curl -H "Authorization: Bearer <keyId>.<secret>" http://localhost:3000/api/v1/students
```

---

## Project structure

```
prisma/
  schema.prisma        # multi-tenant data model (PRD §14)
  seed.ts              # demo tenant, roles, students, attendance
src/
  lib/
    db.ts              # Prisma client singleton
    auth.ts            # sessions, password hashing
    permissions.ts     # atomic permission catalog (IAM-001)
    rbac.ts            # scope resolution + guards
    scope.ts           # tenant + campus query filter (isolation)
    audit.ts           # append-only audit writer
    dates.ts           # day-key helpers for registers
    notify.ts          # central notification dispatch (NTF-001)
    notification-providers.ts  # pluggable EMAIL/SMS/PUSH providers (NTF-005)
    api-auth.ts        # API key generation/verification (API-002)
    api-request.ts     # per-request auth + rate-limit + scope check
    api-rate-limit.ts  # in-memory sliding-window limiter (API-006)
    api-response.ts    # success/error envelopes, pagination (API-004)
    api-idempotency.ts # Idempotency-Key handling (API-003)
    webhooks.ts         # signed webhook dispatch + redeliver (API-005)
    webhook-events.ts   # webhook event catalog
  components/
    ui.tsx             # shared UI kit
    PortalShell.tsx    # authenticated shell (permission-filtered nav)
    dashboards/        # role-aware dashboards
  app/
    login/             # login page + server action
    logout/            # logout route
    portal/            # authenticated app
      setup/           # guided onboarding checklist (CFG-001)
      import/          # bulk student importer (CFG-004)
      admissions/      # pipeline board, application detail, new application
      exams/           # assessment plans, marks grid, report cards
      fees/            # finance dashboard, billing run, invoices + detail
      students/        # SIS list + detail (fees ledger + report cards)
      attendance/      # registers + take-attendance flow
      notifications/   # NTF ops delivery log + retry (notifications.operate)
      preferences/      # self-service channel opt-out + quiet hours
      integrations/     # API clients + webhook management (integrations.manage)
      academics/  campuses/  billing/  messages/  platform/
  app/api/v1/          # PUBLIC REST API (API-002 key auth, not session auth)
  app/apply/[slug]/    # PUBLIC inquiry form (no auth)
docs/
  ARCHITECTURE.md
  REQUIREMENTS_TRACEABILITY.md
```

---

## What's next (not yet built)

Following the PRD roadmap, in rough priority order:

1. **API depth** — more resources (guardians, enrollments, invoices, exam
   results) behind the same auth/idempotency/pagination pattern (API-004
   field selection/sorting), OAuth2 client-credentials as an alternative to
   raw bearer keys, a durable/shared rate-limit store for multi-instance
   deployments, webhook delivery retry-with-backoff (currently manual only).
2. **Notification depth** — message templates with branding/localization/
   versioning (NTF-002), digest/throttle batching (NTF-006 stretch), per-channel
   data classification (NTF-007).
3. **Assessment depth** — exam scheduling/seating (EXM-002), competencies &
   conduct (EXM-005), transcripts across terms.
4. **Finance depth** — gateway/bank settlement reconciliation (FEE-005),
   accounting export (FEE-007), installment plans, penalties, period close.
5. **Admissions depth** — transfer/alumni/reenrollment (ADM-006), capacity
   enforcement, offer expiry jobs, and duplicate *merge*.
6. **Config depth** — campus template cloning (CFG-002), configurable
   fields/statuses/templates (CFG-003), and more import types (staff, guardians).
7. **HR, Library, Transport, Inventory, Health** (§7.8–7.13).
8. **Homeschooling module** (HOM, §7.15).
9. **Local / offline / hybrid editions, sync, licensing** (§15.4–15.6, DEP/SYN/LIC).
10. **Mobile apps** (MOB, §16).

See [docs/REQUIREMENTS_TRACEABILITY.md](docs/REQUIREMENTS_TRACEABILITY.md) for the
requirement-by-requirement status.

## Security note

`next@15.5.25` patches the known runtime CVE. Remaining `npm audit` findings are
in a build-time-only nested `postcss` bundled by Next; clearing them requires
Next 16 (a separate migration).
