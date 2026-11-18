# Feature Gap Audit — Scholarum vs PRD/SRS v1.2

Date: 2026-09-11 (original audit). Updated 2026-11-18: see §0, which is current. Sections 1–7 are kept as the 2026-09-11 snapshot.
Method: source inspection + runtime verification against
`Commercial_SaaS_School_Management_Software_Hybrid_Homeschool_PRD_SRS.docx` (195 requirement IDs).
A requirement is credited only where a reachable UI/API workflow, persistent data,
server-side authorization, and meaningful behaviour were all confirmed. A model,
page shell, seed record, or helper without a caller does not count.

> **Note on this file's history:** this document was rewritten once during the
> session after the original copy disappeared from `docs/` for reasons outside
> this session's own actions (no delete of it was ever issued). Content below is
> reconstructed from the session record and is materially equivalent to the
> original; if the two differ anywhere, treat this version as current.

Legend: ✅ implemented · 🟡 partial · ❌ missing · 🔴 security/backend gap · 🔵 UI/UX gap · ⚪ needs operational evidence

---

## 0. Update — 2026-11-18

This update does **not** re-score all 180 in-scope requirement IDs (the full
row-by-row table is not in this file). It refreshes the verified facts, records what
changed for the items this audit tracked, and adds a new class of finding that the
original method (which credited only reachable workflows) would have caught had it
been applied to the later work: backend logic that no screen can reach.

### State of the build (verified 2026-11-18)

| Item | Finding |
| --- | --- |
| `npm run build` | **Passes** (73 pages generated). It was failing on a type error in the demo script `scripts/seed-hmssb1.ts`, which sits inside the `tsconfig` include; fixed this pass. |
| `npx tsc --noEmit` | Clean (0 errors). |
| `npm test` (unit) | **84 pass**, 11 files. |
| `npm run test:integration` | **29 pass**, 6 files, against real Postgres (isolation, campus switch, search scope, audit chain, student merge, payment-webhook processing). |
| `npm run test:e2e` | 5 Playwright specs, 13 tests; still smoke-level; not re-run in this pass. |
| Git | History exists on `main` and is pushed to GitHub. The "no commits" half of P0-1 is closed. |
| Migrations | Still not adopted. The app is run with `prisma db push`; the checked-in migrations stop at 11 September and omit later tables and columns. A fresh baseline is required before production. |

Size today: 135 Prisma models, 47 enums, 80 permission keys, 74 pages, 13 route
handlers, 54 `"use server"` files exporting 153 server actions.

### What changed for the items tracked here

| Item (2026-09-11 status) | Now | Notes |
| --- | --- | --- |
| P0-1 git baseline + migrations (open) | 🟡 partly closed | Git ✅. Migrations ⬜ (see above) |
| P0-2…P0-6 (closed) | ✅ still closed | Integration suite has grown from 18 to 29 tests |
| TEN-006 offboarding (❌) | ✅ | Data export, scheduled deletion with an export-evidence gate, hard delete (phase 9) |
| CFG-002 campus clone (not listed) | 🟡 | Server logic only; no screen (see below) |
| CFG-003 configurable fields/statuses (❌) | 🟡 | Numbering prefixes, organization→campus settings (incl. notification throttle) and notification templates. No generic custom fields, statuses or workflows (deferred) |
| CFG-004 import (not in the P1 list) | ✅ | Students CSV and marks CSV with preview, row errors, all-or-nothing commit |
| POR-001/002 portals (🟡) | 🟡 | Unchanged: no student, applicant or alumni portals and no child switcher; the guardian dashboard is now translated |
| IAM-001 role editor / effective access (🟡) | 🟡 | Unchanged. Platform operators create users and standard roles; no school-owner role editor or permission preview |
| SIS-002 guardian flags (🟡) | 🟡 | Flags are editable and honoured by transport notifications; enforcement across guardian-portal actions not verified |
| ATT-001 staff attendance (🟡) | 🟡 | Staff attendance is now recorded in HR; no device or file ingestion |
| ACD-004/005 lesson plans, electives (❌) | 🟡 / ❌ | Lesson plans and homework can be created; coverage tracking and electives not built |
| FEE-006 fee reports (❌) | ✅ | Aging, payments received, concessions, student ledger, finance dashboard |
| HRM-002 recruitment (❌) | ✅ | Internal opening and applicant tracking with hire-to-staff (phase 20); no public careers page |
| COM-001/004/005 (❌) | COM-004 🟡, others ❌ | Calendar events exist; announcement composer, forms/surveys and emergency broadcast do not |
| RPT-001…008 (❌) | 🟡 | Report center with three reports (CSV/XLSX/print) and fee reports; no metric registry, scheduled reports, async export jobs or PDF generation |
| BIL-003…006 (❌) | ❌ | Unchanged. BIL-007 is a read-only billing page (no upgrade or payment flow) |
| SEC-003 (n/a) | ✅ | Password reset, breached-password check, login throttling |
| SEC-002 MFA (not in the P1 list) | 🟡 | TOTP can be enrolled but is never checked at sign-in (see P0-8) |
| SEC-006 (❌) | ❌ | Building blocks only: tenant data export, redaction of sensitive messages. No classification, retention, legal hold or DSAR workflow |
| API-007 (❌) | 🟡 | `/api/v1` namespace exists; deprecation tooling deferred |
| NTF-002/006/007 (roadmap E.9/E.10) | ✅ | Templates (one per language), delivery log with retry, daily digest endpoint, per-recipient throttle, sensitive-message redaction |
| DEP/SYN/LIC/MOB (❌) | ❌ | Unchanged; no code |

### New finding: reachability gaps

Server logic, permissions and audit exist for many workflows, but no screen calls
them, a few links point at pages that were never built, and much setup data has no
creation path. By the original rule ("a helper without a caller does not count"),
these are not implemented. Full lists are in
[REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md#reachability-gaps-found-2026-11-18);
the headline numbers are:

| Measure | Count |
| --- | --- |
| Exported server actions with no caller | **31 of 153** |
| Internal links to routes that do not exist | **4** (timetable slot form, inventory requisition form, safeguarding case page, transport trip form) |
| Rows in the traceability document regraded ✅ → 🟡 | **34** |
| Kinds of setup data with no creation path (seed only) | 20+ (academic years, terms, grades, sections, subjects, grade scales, assessment plans, attendance codes, leave types, departments, positions, rooms, vehicles, routes, stops, inventory items/categories/warehouses/suppliers, fee assignments, …) |

### New items for the P0/P1 lists

| # | Issue | Status |
| --- | --- | --- |
| P0-7 | **A school created in the platform console cannot be used.** The provisioning wizard looks for a role named "Campus Admin" (the standard role is "Campus Administrator" and does not exist yet at that point), so the admin gets no role; the temporary password is never shown; no subscription is created and `updateSubscription` only edits an existing one; and no screen creates academic years, terms, grades, sections, subjects, grade scales, assessment plans, attendance codes or leave types. Someone has to populate the school by script. | **Open** |
| P0-8 | 🔴 **Two-factor authentication is not enforced at sign-in.** Enrolling, verifying and disabling TOTP work (`/portal/settings/security`), but `loginAction` creates the session right after the password check and never asks for the code. A user who turns MFA on is still admitted with the password alone; MFA is not enforced for privileged roles. | **Open** |
| P1-A | **Approvals can be requested but never resolved.** `issueRefund` and `submitRequisition` call `requestApproval()`; there is no approvals inbox, `resolveApproval()` and `approveRefund()` have no caller, so a requested refund never executes. | **Open** |
| P1-D | **Mark import bypasses `saveMarks` rules.** It checks `exams.enter` for the campus but not that the plan is open or that the user is the subject's assigned teacher, so it can change marks that the normal entry path would refuse. | **Open** |
| P1-B | **No school-owner user or role management.** Only platform operators create users, assign roles and run "ensure school roles". | **Open** |
| P1-C | **Staff cannot submit leave requests**, safeguarding cases cannot be opened or read in detail, health records cannot be created, trips cannot be recorded, inventory cannot be created or requisitioned, library reservations and renewals do not exist, student documents cannot be registered, bank statements cannot be imported or matched. | **Open** |

### Recommended immediate order (supersedes §7)

0. **Enforce two-factor at sign-in (P0-8)** and make mark import follow the `saveMarks` rules (P1-D): both are small and security-relevant.
1. **Make a new school usable (P0-7):** fix the provisioning wizard; add screens for academic years, terms, grades, sections, subjects, grade scales, assessment plans, attendance codes, leave types, departments, positions and rooms; wire the existing campus-clone logic.
2. **Approvals inbox (P1-A)** so refunds and requisitions can complete.
3. **Build the screens for logic that is already written (P1-C):** leave requests, safeguarding case pages, health records and incidents, transport fleet and trips, inventory, library reservations, student documents, bank import and matching, competency ratings, timetable slots, separation checklists.
4. **School-owner user and role management (P1-B)** with a permission preview (roadmap A.1).
5. **Production readiness:** a baseline migration; a CI check that fails on dead internal links and on server actions with no caller, so this class of gap cannot reappear.
6. Then resume [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) phases B (SaaS billing) and C–G.

---

> **Sections 1–7 below are the 2026-09-11 snapshot, kept for history.** Where they
> disagree with §0, §0 is current.

## 1. Executive summary

| Bucket | Count |
| --- | --- |
| Total requirement IDs in PRD | 195 |
| HOM-001…HOM-015 | **Excluded — see note** |
| In-scope (non-HOM) reviewed | 180 |
| ✅ Implemented (as of this update) | 36 |
| 🟡 Partial | 40 |
| ❌ Missing | 73 |
| 🔴 defect on existing feature | 1 (down from 6 — see §11a) |
| ⚪ Needs measured evidence (mostly NFR/SEC-ops) | 25 |

> **HOM note.** Two task prompts in this repo disagree: one says *exclude HOM
> entirely*, the other says *do not ignore HOM*. HOM-001…HOM-015 are listed as
> **Excluded by user request** pending an explicit decision. Nothing homeschool-
> related is in the schema, navigation, or backlog.

### State of the build

| Item | Finding |
| --- | --- |
| `npm run build` | **Passes**, 52/52 pages. |
| `npm test` (unit) | **45 pass**, 4 files. Now scoped to `tests/unit` only (was silently able to pick up DB tests). |
| `npm run test:integration` | **Fixed this session** — was pointed at a directory that didn't exist. Now a real, database-backed suite: **18 tests, all green**, run single-threaded via `vitest.integration.config.mts` (parallel files were racing each other's cleanup). |
| `npm run test:e2e` | 5 Playwright specs, still shallow "page loads / nav gate" smoke checks — not touched this session. |
| Git | Still **no commits**. Flagged as P0-1; not resolved (see §11a). |

---

## 2. Architecture summary

Next.js 15 App Router, React 19, TypeScript strict · PostgreSQL + Prisma 6.19 —
**106+ models** (108 after this session's `AuditEvent` columns and `OrgSetting`
model), 42 enums, `prisma/schema.prisma` · no migrations, `prisma db push` only ·
custom bcrypt+session-cookie auth with TOTP MFA · 73 atomic permission keys,
campus/org-scoped `RoleAssignment` · `tenantId` on every tenant-owned model,
isolation funneled through `src/lib/scope.ts` · ~25 `"use server"` action files
· generic maker-checker (`src/lib/approvals.ts`) · integer-cents money ·
`/api/v1` slice with key-auth, scopes, idempotency, signed webhooks, OpenAPI ·
notification dispatcher with preferences/quiet-hours/dedupe/delivery-log.

---

## 3. P0 — critical issues

| # | Issue | Status |
| --- | --- | --- |
| P0-1 | No git history, no migrations — entire app is uncommitted working tree, schema managed by `db push` | **Open.** Declined once this session (destructive/hard-to-reverse without explicit consent); flagged again below. |
| P0-2 | Zero tenant-isolation tests | **Closed this session.** `tests/integration/isolation.test.ts`, 6 tests. |
| P0-3 | Global search leaked cross-campus data and returned nothing for campus-scoped users | **Closed this session.** Logic extracted to `src/lib/search-core.ts`; `tests/integration/search-scope.test.ts`, 5 tests. |
| P0-4 | Campus-switch route had no authorization (any `campusId` from any request body) + open redirect | **Closed this session.** `canPreferCampus()` in `src/lib/campus-preference.ts`; `tests/integration/campus-switch.test.ts`, 4 tests. |
| P0-5 | Audit trail not tamper-evident — ordinary mutable table, no hash chain, no retention | **Closed this session.** Hash-chained `AuditEvent` (chainKey/seq/prevHash/entryHash), Serializable-transaction append with retry, `verifyAuditChain()`, `npm run audit:verify` ops script. `tests/integration/audit-chain.test.ts`, 4 tests. Existing 20 rows backfilled. |
| P0-6 | Plan entitlements were decorative (limits stored, enforced nowhere; alumni billed forever) | **Closed in the prior pass** (before this audit doc existed) — `src/lib/entitlements.ts`. |

---

## 4. P1 — high-value Must gaps still open (selected)

| Requirement | Status | Gap |
| --- | --- | --- |
| TEN-003 / BRN-003 | **✅ Closed this session** | Org→campus setting inheritance: `OrgSetting` model, `effectiveSettings()` resolver (campus override → org value → default, with `locked` blocking override), `/portal/settings/campus` rewritten with org tab, per-campus tab, cross-campus comparison table. Verified live. |
| POR-001/002 | 🟡 (small improvement) | Guardian dashboard now links to each child's report card when one is published (was unreachable). Full dedicated student/applicant/alumni portals and an explicit child-context switcher (beyond "all children on one page") remain open. |
| TEN-006 | ❌ | No tenant offboarding: no verified export, retention hold, scheduled deletion, deletion evidence |
| IAM-001 | 🟡 | No permission preview / effective-access report |
| CFG-003 | ❌ | No configurable fields / statuses / numbering schemes / document templates / workflows beyond the new settings resolver |
| SIS-002 | 🟡 | Custody / pickup-authorization / financial-responsibility flags not enforced in guardian portal actions |
| ACD-004/005 | ❌ | No lesson plans/syllabus coverage/homework; no electives/subject selection |
| ATT-001 | 🟡 | Student register solid; no staff attendance, no device/import ingestion |
| FEE-006 | ❌ | No aging/collection/concession/outstanding/refund/cashier/settlement/ledger report set |
| HRM-002 | ❌ | No recruitment (the `Requisition` model in schema is inventory, not HR) |
| COM-001/004/005 | ❌ | No announcement composer, no calendar/events/forms/surveys/consent, no emergency broadcast |
| RPT-001…008 | ❌ | No report catalog, no governed metrics, no export framework, no consolidated cross-campus reports |
| BIL-003…006 | ❌ | No usage metering, no checkout/proration lifecycle, no SaaS invoices, no dunning |
| SEC-006 | ❌ | No data classification / masking / retention / legal hold / DSAR workflow |
| API-007 | ❌ | No version-deprecation policy |
| DEP/SYN/LIC/MOB | ❌ | 30 requirements, 0 code — each needs an architecture decision doc before implementation (see roadmap Phase H) |

Full 180-row requirement-by-requirement table is in the prior audit pass; the
essential facts (counts, P0/P1/P2/P3 grouping, and what changed) are captured
above and in the session log below. See `docs/IMPLEMENTATION_ROADMAP.md` for
the phased build sequence covering every requirement in this list.

---

## 5. What is genuinely solid (do not rewrite)

Admissions pipeline end-to-end · RBAC core (atomic perms, campus scoping,
multi-campus single identity, deny-by-default) · exam lifecycle with immutable
versioned results · fee posting idempotency + FIFO allocation + maker-checker
refunds · API plumbing (key auth, scopes, idempotency, signed webhooks,
OpenAPI) · notification dispatcher · money as integer cents · tenant
provisioning + suspension · platform console (tenant/plan/subscription CRUD,
filterable audit log) · entitlement enforcement · **now also:** hash-chained
tamper-evident audit trail, database-backed isolation test suite, org→campus
settings inheritance.

---

## 6. Session progress log (append-only, newest first)

### Pass 3 — 2026-11-18, documentation refresh + reachability audit

Triggered by a request to bring the project's markdown documents up to date. While
verifying claims against the code, found and recorded:

- `npm run build` was failing on a type error in `scripts/seed-hmssb1.ts`; fixed (two-line typing change), build now passes and `tsc` is clean.
- 31 of 153 server actions have no caller; 4 internal links 404; more than 20 kinds of setup data have no creation path; the provisioning wizard leaves a school without a role, a visible password or a subscription (see §0).
- The traceability document had marked 34 rows ✅ that were not usable from any screen or did not hold up against the code (31 unwired actions, 4 dead links, MFA never checked at sign-in, mark import skipping rules); they were regraded to 🟡 with notes.

Documents updated: `README.md`, `docs/ARCHITECTURE.md`, `docs/REQUIREMENTS_TRACEABILITY.md`, `docs/FEATURE_REFERENCE.md` (rewritten), this file and `docs/IMPLEMENTATION_ROADMAP.md`. Method for the reachability finding: every exported server action was searched for a caller in `src/`, every internal `href`/`redirect` was matched against the route files, and every Prisma model was searched for a create/upsert call; suspicious results were confirmed by reading the pages.

### Pass 2 — 2026-09-11, "fix it" (P0 batch + one P1 slice)

**P0 batch — all four closed and verified:**

| Item | What shipped | Evidence |
| --- | --- | --- |
| P0-5 SEC-005 | `AuditEvent` hash-chained: `chainKey`/`seq`/`prevHash`/`entryHash`. `audit()` appends inside a Serializable transaction with retry; `verifyAuditChain()` recomputes and detects mutation or deletion. Existing 20 rows backfilled (`scripts/backfill-audit-chain.ts`). Ops check: `npm run audit:verify`. | `tests/integration/audit-chain.test.ts` (4 tests). Verified live: a real login while the dev server was running extended the `__platform__` chain to 5 events and `verifyAuditChain` still passed. |
| P0-2 TEN-001/002 | First database-backed isolation tests in the repo. `tests/integration/` stood up with its own single-threaded Vitest config (`vitest.integration.config.mts`) — files run sequentially because each suite creates/deletes its own `itest_`-prefixed tenants. | `tests/integration/isolation.test.ts` (6 tests). |
| P0-3 UX-003 | `globalSearch` logic extracted into `src/lib/search-core.ts` (`runGlobalSearch(ctx, query)`), testable without a request context. | `tests/integration/search-scope.test.ts` (5 tests) — regression-proves the campus-scoped-user-got-zero-results bug and the cross-campus/cross-tenant leak are both fixed. |
| P0-4 UX-006 | Campus-switch authorization extracted into `canPreferCampus(ctx, campusId)` (`src/lib/campus-preference.ts`). | `tests/integration/campus-switch.test.ts` (4 tests). |
| P0-1 DEP-006 / git baseline | **Not touched** — declined once this session; still blocking, flagged again. | — |

Test harness: `npm test` → unit only (fast, no infra, restores "45 pass"
baseline); `npm run test:integration` → new DB suite; `npm run test:all` → both,
correctly configured. 45 unit + **18 integration**, all green. `tsc --noEmit`
clean. `next build` clean (52/52 pages).

**One P1 Must closed:** TEN-003 / BRN-003 — org→campus setting inheritance (see
§4). Verified live: locked an org value, campus tab showed it read-only;
unlocked override on one campus showed correctly in the cross-campus
comparison table next to the sibling campus's inherited default.

**One POR gap partially closed:** guardian dashboard had no path to a child's
report card even though the report page already authorizes guardians via
`GuardianRelationship`. Added a "View report card →" link per child (or a
"no published report card yet" state). Verified live with `parent@hmss.edu` —
correct empty state (tenant has no published results yet).

Files touched: `prisma/schema.prisma`, `src/lib/audit.ts` (+ new
`audit-hash.ts`), `src/lib/settings.ts` (new), `src/lib/search-core.ts` (new),
`src/lib/campus-preference.ts`, `src/app/portal/search/actions.ts`,
`src/app/portal/campus-switch/route.ts`, `src/app/portal/settings/campus/**`,
`src/components/dashboards/GuardianDashboard.tsx`, `scripts/backfill-audit-
chain.ts` + `verify-audit-chains.ts` (new), `tests/integration/**` (new, 4
files + helpers + global setup), `vitest.config.mts`,
`vitest.integration.config.mts` (new), `package.json` scripts.

### Pass 1 — 2026-09-11, initial audit

Produced this document and `docs/IMPLEMENTATION_ROADMAP.md` from scratch:
parsed all 195 PRD requirement IDs, inventoried 106 Prisma models / 73
permission keys / 47 pages / 25 action files, ran build + unit tests, and
scored every non-HOM requirement. Also fixed the search and campus-switch
defects described above as P0-3/P0-4 (fixed in this same session, before the
audit doc itself was written) and the entitlement-enforcement gap (P0-6).

---

## 7. Recommended immediate order (2026-09-11; superseded by §0)

See `docs/IMPLEMENTATION_ROADMAP.md` for the full phased plan. Immediate next
steps once this pass is reviewed:

1. **P0-1** decision: commit a baseline + adopt `prisma migrate` — still blocks safe schema work.
2. Continue Phase A (platform safety) and Phase C (school core gap-fill) in the roadmap, prioritizing Must requirements over Should/Could.
3. Expand `tests/e2e/` beyond smoke checks now that the integration harness pattern exists to copy from.
