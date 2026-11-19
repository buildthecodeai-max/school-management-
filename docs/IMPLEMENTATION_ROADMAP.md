# Implementation Roadmap — Scholarum

Companion to `FEATURE_GAP_AUDIT.md`. Written 2026-09-11; status column and Phase J
added 2026-11-18 (the phase and slice descriptions below are otherwise the original
plan). Sequenced so that platform-safety and recoverability come before feature
volume. Each slice is bounded, reuses the
existing architecture, and ends with tests + `npm run build` green before the
next slice starts.

**Rule for every slice:** tenant + campus scope on every query · server-side
validation · deny-by-default authz · audit on sensitive/financial/academic/
config/export actions · transaction + idempotency where replay could harm ·
positive + negative (unauthorized / cross-tenant / cross-campus) tests · update
the matrix in `FEATURE_GAP_AUDIT.md` only after acceptance evidence exists.

---

## Status — 2026-11-20

Phase J (below) is finished. The table that follows is the 2026-11-18
snapshot; where it disagrees with the Phase J status column or with
[COMPLETION_REPORT.md](COMPLETION_REPORT.md), those win. Changes since the snapshot: A.3
approvals inbox ✅, A.4 MFA enforced ✅, C.4 bulk safety ✅ (preview, validation; still no rollback),
C.8 refunds ✅, D.4 competency ratings ✅ (templates still ⬜), D.5 timetable slots ✅, library
renewals ✅, E.5 student portal 🟡 (child hub, no payments).

## Snapshot — 2026-11-18

Legend: ✅ done and usable · 🟡 partly done (see note) · ⬜ not started. "Done" follows
the audit's rule: a user can reach it from a screen. Items rated 🟡 because logic
exists without a screen are covered by Phase J.

| Slice | Status | Note |
| --- | --- | --- |
| 0.1 git + migrations | ✅ | Git history on GitHub; migrations caught up on 2026-11-20 and checked for drift (see J.14) |
| 0.2 integration harness | ✅ | `tests/integration/`, 29 tests, single-threaded config |
| 0.3 cross-tenant isolation suite | 🟡 | `isolation.test.ts` plus search, campus-switch and merge suites; not yet table-driven across every action and API route |
| 0.4 cross-campus isolation suite | ✅ | Search and campus-switch regressions locked in |
| 0.5 audit hardening | 🟡 | Hash chain, verification script, backfill done. No database-level UPDATE/DELETE block; read-audit events not added |
| A.1 effective-access report / role editor | ⬜ | |
| A.2 negative-endpoint matrix | ⬜ | |
| A.3 generalized maker-checker | 🟡 | `lib/approvals.ts` used by refunds and requisitions, but no approvals inbox and no policy table |
| A.4 MFA enforcement | 🟡 | TOTP enrolment works, but the code is never asked for at sign-in, for anyone (see J.0) |
| A.5 org→campus settings | ✅ | |
| A.6 tenant offboarding | ✅ | Export, scheduled deletion with evidence gate, hard delete |
| B.1 entitlement enforcement | 🟡 | Enforced when creating enrollments; not audited across every create path |
| B.2 plan versioning | 🟡 | `PlanVersion` exists; pinning of subscribers not verified |
| B.3–B.6, B.8–B.9 usage metering, lifecycle, SaaS ledger, dunning, overrides, commercial reports | ⬜ | |
| B.7 billing portal | 🟡 | Read-only page; no upgrade or payment flow |
| C.1 numbering + document templates | 🟡 | Numbering prefixes are settings; notification templates exist; document templates (report card, invoice, transcript) not built |
| C.2 import center v2 | 🟡 | Students and marks CSV with preview and all-or-nothing commit; no mapping profiles, resumability or other entity types |
| C.3 SIS relationship enforcement | 🟡 | Flags editable; enforcement not verified |
| C.4 bulk update safety | 🟡 | Grade promotion with preview; no rollback; reassign-section has no screen |
| C.5 staff attendance + ingestion | 🟡 | Staff attendance screen done; no device or file ingestion |
| C.6 attendance analytics | 🟡 | Analytics page with chronic-absence flags; no CSV compliance export |
| C.7 mark import | ✅ | |
| C.8 fee adjustments + plans | 🟡 | Credit notes, write-offs, payment plans done; refunds stuck without approvals |
| C.9 fee reports | ✅ | |
| C.10 effective-dated fee rules | ⬜ | |
| D.1 lesson plans and coverage | 🟡 | Lesson plans and homework done; coverage view not built |
| D.2 electives | ⬜ | |
| D.3 exam scheduling polish | 🟡 | Rooms, invigilators, conflicts, seating done; accommodations not built |
| D.4 report-card templates | ⬜ | Competency ratings exist only as unwired logic |
| D.5 timetable substitutions | 🟡 | Substitute assignment done; depends on timetable slots that no screen can create |
| E.1 announcement composer | ⬜ | `portal/messages` is a read-only inbox |
| E.2 events / notices / newsletters | 🟡 | Calendar events only |
| E.3 forms / surveys / consent | ⬜ | |
| E.4 emergency broadcast | ⬜ | `notify()` already supports `urgent`; no composer |
| E.5 student portal, E.7 applicant/alumni portals, E.8 service requests | ⬜ | |
| E.6 guardian child switcher | ⬜ | Guardian dashboard lists all children on one page |
| E.9 notification template management | ✅ | UI, per-language versions, live preview; no test-send or versioning |
| E.10 delivery-log operator view | ✅ | Filter by status and retry; no CSV export |
| F HR recruitment (HRM-002) | ✅ | Internal tracking with hire-to-staff (phase 20) |
| F other (shifts, payroll lock, performance, library renewal, transport compliance, inventory counts, medication log, help content) | ⬜ | Payroll runs and posting exist |
| G.1 report framework | 🟡 | Three reports with scope-aware filters |
| G.2 metric registry, G.4–G.6 consolidated/sensitive/scheduled reports | ⬜ | |
| G.3 export jobs | 🟡 | Synchronous CSV and XLSX; print view for PDF; no async jobs or signed URLs |
| G.7 API expansion + versioning | 🟡 | `/api/v1` slice (students, attendance sessions); no OAuth, sandbox or deprecation policy |
| G.8 webhook ordering and replay | ⬜ | Manual redeliver exists |
| H Local / hybrid / licensing / mobile | ⬜ | No design documents written |
| I Homeschool | ⬜ | Blocked on the scope decision |
| NFR evidence track | ⬜ | Tests exist; no load, accessibility, restore or observability evidence |
| *Not in the original plan:* inbound payment-gateway webhook, notification localization, per-recipient throttle, portal translation, student-record merge, password reset, HIBP check | ✅ | Phases 11–19 |

---

## Phase J — Close the reachability gaps

Added 2026-11-18. The audit found server logic with no screen, dead links, and setup
data with no creation path (see the "Reachability gaps" section of
`REQUIREMENTS_TRACEABILITY.md`). These slices make existing work usable, so they
come before new feature volume. Each ends with the screen reachable, a permission
check on the server, an audit entry, and a negative test.

| Slice | What | Unblocks | Status 2026-11-20 |
| --- | --- | --- | --- |
| J.0 | **Enforce two-factor at sign-in.** Add a challenge step between the password check and session creation for users with MFA enrolled; require enrolment for platform staff and organization owners; recovery procedure. Also make mark import follow the `saveMarks` rules (plan open, assigned teacher). | SEC-002, A.4, EXM-003 | ✅ |
| J.1 | **Make a new school usable.** Fix the provisioning wizard (role name `Campus Admin` vs `Campus Administrator`, show or email the temporary password, create a subscription from the chosen plan). Create standard roles at provisioning. | TEN-004, P0-7 | ✅ |
| J.2 | **Setup-data screens.** Academic years and terms, grade levels, sections, subjects, grade scales, assessment plans and components, attendance codes, leave types and balances, departments and positions, rooms. Wire the existing `cloneCampusConfig` with its preview. Make the Setup checklist items link to these. | CFG-001/002, ACD-001, EXM-001, HR-staff, ATT-005 | ✅ (positions have no screen yet) |
| J.3 | **Approvals inbox.** List pending approval requests for the approver, approve or reject with a reason, execute the approved action (`approveRefund`, requisition approval); notify the requester. | IAM-003, FEE-004, INV-req | ✅ |
| J.4 | **Leave requests and separations.** Staff submit leave requests; HR initiates separation checklists. | ATT-005, HR-leave, HR-separation | ✅ |
| J.5 | **Safeguarding and health screens.** Case detail page (`/portal/safeguarding/[id]`), open case, add note, close case; edit health record; report incident. | SAF-case, HLT-record, HLT-incident | ✅ |
| J.6 | **Transport screens.** Create vehicles, routes, stops and assignments; the trip recording page (`/portal/transport/trip`). | TRP-fleet, TRP-trip, TRP-notify | ✅ |
| J.7 | **Inventory screens.** Items, categories, warehouses, suppliers; stock adjustment; the requisition form (`/portal/inventory/requisition/new`); purchase orders; asset assignment. | INV-stock, INV-req, INV-po, INV-asset | ✅ |
| J.8 | **Library reservations and renewals.** | LIB-reserve, LIB-circ | ✅ |
| J.9 | **Student records.** Register documents (feeds the expiry cron); bulk reassign section; assign a fee structure or discount to a student; use pickers instead of typed record ids on the bulk and issue forms. | SIS-004, SIS-005, FEE-001 | ✅ (documents, bulk, fee assignment; pickers on the issue and bulk forms) |
| J.10 | **Bank reconciliation.** Import a statement; match, unmatch and exception queue. | FEE-003, FEE-005 | ✅ |
| J.11 | **Assessment gaps.** Competency and conduct ratings; the timetable slot editor (`/portal/academics/timetable/[id]/slot/new`) so conflict detection is reachable. | EXM-005, ACD-002 | ✅ |
| J.12 | **School-owner user and role management** with a permission preview and an effective-access report. | IAM-001, A.1 | ✅ `/portal/settings/users` and `/portal/settings/roles`, permissions `iam.users.manage` and `iam.roles.manage` (migration `20261120120000` adds them to existing owner roles) |
| J.13 | **Regression guards.** A test that fails when an internal link points at a route that does not exist, and a script that fails CI when an exported server action has no caller. | Prevents recurrence | ✅ `static-guards.test.ts` (runs in `npm test`) |
| J.14 | **Production readiness.** Baseline migration from the current schema; switch deployment to `prisma migrate deploy`. | P0-1, 0.1 | ✅ catch-up migration `20261120000000`, verified against a fresh database; `db:deploy` and `db:drift` scripts |

---

## Phase 0 — Recoverability & test harness (do first, blocks everything)

| Slice | What | Requirements | Acceptance |
| --- | --- | --- | --- |
| 0.1 | **Decide git/migration strategy.** Options: (a) commit current tree as baseline + `prisma migrate dev --create-only` from here; (b) keep `db push` for now, accept risk. Recommend (a). *User decision required.* | DEP-006, eng-rule 6 | A baseline exists; schema changes ship as reviewed migrations |
| 0.2 | **`tests/integration/` harness.** Real Postgres (reuse `docker-compose.yml`), per-test tenant factory, truncate-between. Fix the `test:integration` script. | TEN-002 | `npm run test:integration` runs and is green with ≥1 real test |
| 0.3 | **Cross-tenant isolation suite.** Tenant A actor must get nothing of Tenant B via: direct query in each `actions.ts`, each `/api/v1` route, global search, GL/report CSV export, cron job output. Table-driven. | TEN-001, TEN-002, IAM-002, RPT-008 | Every listed path has a passing "returns 404/empty for foreign tenant" test |
| 0.4 | **Cross-campus isolation suite.** Campus-scoped role must not read/write another campus; `?campusId=` tampering → 404; `campus-switch` rejects unauthorized id. Locks in this session's search + switch fixes. | UX-003, UX-006, BRN-004 | Regression tests for P0-3 and P0-4 pass |
| 0.5 | **Audit hardening.** Hash-chain `AuditEvent` (`prevHash`/`hash`), block UPDATE/DELETE (DB grant or trigger), retention config, `verifyAuditChain()` job. Add read-audit events on health, safeguarding, finance, export views. | SEC-005, P0-5 | Tamper of any row fails `verifyAuditChain`; sensitive views appear in the log |

Exit Phase 0 when: baseline decided, integration harness green, isolation suites cover every enumerated path, audit chain verifiable.

---

## Phase A — Platform safety hardening

| Slice | What | Requirements |
| --- | --- | --- |
| A.1 | **Effective-access report + permission preview.** `/portal/settings/roles`: build a role from atomic perms, live "this role can…" preview; `effectiveAccess(userId)` shows resolved perms per campus. | IAM-001 |
| A.2 | **Negative-endpoint matrix.** Generated test: for each `actions.ts` export and API route, an actor lacking the perm is denied. Wire into CI. | IAM-002 |
| A.3 | **Generalize maker-checker.** Extend `approvals.ts` beyond refunds: discount-above-threshold, result publication, bulk delete, tenant delete. `ApprovalPolicy` table (action → threshold → approver scope). | IAM-003, UX-005 |
| A.4 | **MFA enforcement.** Gate `platform.*` and organization-owner logins behind TOTP enrolment; verified recovery procedure. | SEC-002 |
| A.5 | **Org→campus settings inheritance.** `OrgSetting` + `effectiveSetting(tenantId, campusId, key)` returning `{value, source, locked}`; compare-across-campuses page; inherit/override/lock/publish. | TEN-003, BRN-003 |
| A.6 | **Tenant offboarding.** `TenantOffboarding` state machine (export requested → retention hold → scheduled deletion → evidence) behind `platform.manage` + approval; export job produces a machine-readable archive + data dictionary; immutable completion record; legal-hold exception. | TEN-006, SEC-006(partial), NFR-015 |

---

## Phase B — Commercial SaaS core (highest revenue risk)

| Slice | What | Requirements |
| --- | --- | --- |
| B.1 | **Finish entitlement enforcement.** Complete BIL-002 on `POST /api/v1/students` (started this session), add to any other create path (staff, campus via API). Integration tests: at-limit create is refused in UI *and* API *and* background job. | BIL-002, LIC-007 |
| B.2 | **Plan versioning & pinning.** On subscribe, freeze the `PlanVersion`; plan edits create a new version, existing subscribers keep theirs unless migrated. Add `Coupon`, `SubscriptionOverride` (negotiated price/limits). | BIL-001 |
| B.3 | **Usage metering.** `UsageMeter` period snapshots (students, staff, users, campuses, storage est., API calls, messages) with source-record references + corrections; "reproduce this billing period" view. | BIL-003 |
| B.4 | **Subscription lifecycle.** State machine: trial → active → past_due → suspended → cancelled → expired. Operations: quote, checkout, trial-convert, renew, upgrade, downgrade, add-on, cancel, reactivate, scheduled-change — each with proration + effective-date **preview** before confirm. | BIL-004 |
| B.5 | **SaaS billing ledger.** `SaasInvoice` / `SaasPayment` / `SaasCredit` — **strictly separate model tree from school `Invoice`** (BIL-010 already holds). Gateway adapter + **verified webhook signature**; idempotent financial events. | BIL-005, BIL-010 |
| B.6 | **Dunning.** Config: reminder cadence, retry schedule, grace period, service restriction, suspension. "Critical school access" policy explicit + recoverable on payment. | BIL-006, TEN-005 |
| B.7 | **Billing portal (tenant-facing).** `/portal/billing` becomes read+write for org-owner: plan, usage, invoices, payments, renewal, limits, authorized changes — behind MFA step-up. | BIL-007 |
| B.8 | **Platform contract ops.** Price overrides + credits behind approval + audit (extends A.3). | BIL-008 |
| B.9 | **Commercial reporting.** Revenue + tax reports on the SaaS ledger only; explicit "commercial vs tenant-operational" labelling. | BIL-010, RPT(partial) |

---

## Phase C — School core gap-fill

| Slice | What | Requirements |
| --- | --- | --- |
| C.1 | **Configurable numbering + document templates.** `NumberingScheme` (invoice/receipt/admission/…); `DocumentTemplate` (report card, invoice, transcript) with tenant/campus branding, versioning, effective dates. Foundation for BRN-002 campus identity on documents. | CFG-003, BRN-002 |
| C.2 | **Import center v2.** `ImportBatch` with mapping profile, checkpointed resumability, post-commit reconciliation totals, source-file retention, audit history. Extend beyond students to guardians, staff, classes, opening fee balances, historic results. | CFG-004, NFR-012 |
| C.3 | **SIS relationship enforcement.** Custody restriction, pickup authorization, financial-responsibility, communication-preference flags on `GuardianRelationship` — enforced in guardian portal reads/writes and notification targeting. | SIS-002, IAM-006 |
| C.4 | **Bulk update safety.** Preview → approve → apply → before/after audit → rollback for eligible SIS fields; reuse `ImportBatch`. | SIS-005, UX-005 |
| C.5 | **Staff attendance + ingestion.** `StaffAttendance` model + entry UI; CSV import; `AttendanceDevice` allow-list + ingest endpoint (HMAC). Author/timestamp/source/amendment on every record. | ATT-001 |
| C.6 | **Attendance analytics.** Derived attendance %, chronic-absence rule + flag, CSV compliance export; locked-period privileged amend with reason. | ATT-004 |
| C.7 | **Mark import.** CSV mark import reusing the grid's range/ABSENT/EXEMPT validation; dry-run preview. | EXM-003 |
| C.8 | **Fee adjustments + plans.** Reversals, waivers, write-offs, payment plans — all behind `fee.adjust` + approval + reason; `PaymentPlan` schedule with installment tracking. | FEE-004 |
| C.9 | **Fee reports.** `/portal/fees/reports`: aging, collection, concession, outstanding, refund, cashier, settlement, student ledger — each reconciling to the `Allocation`/`Payment` ledger for the selected scope (RPT-005 discipline). | FEE-006 |
| C.10 | **Effective-dated fee rules.** Preview screen before activating a structure/discount/penalty change. | FEE-001 |

---

## Phase D — Academic operations

| Slice | What | Requirements |
| --- | --- | --- |
| D.1 | **Lesson plans & coverage.** `LessonPlan`, `SyllabusUnit`, `ClassDiaryEntry`, `Homework`; teacher UI; leader "planned vs completed coverage" view. | ACD-004 |
| D.2 | **Electives & subject selection.** `ElectiveGroup`, `SubjectSelection` with capacity + prerequisite checks + approval. | ACD-005 |
| D.3 | **Exam scheduling polish.** Conflict resolution enforced before publish; `Accommodation` per student applied to seating/time. | EXM-002 |
| D.4 | **Report-card templates.** Template variants by program/grade; qualitative outcomes + conduct + promotion decision blocks. | EXM-005 |
| D.5 | **Timetable substitutions.** Substitution + room-change workflow with notification; keeps only active version visible. | ACD-003 (complete) |

---

## Phase E — Stakeholder portals & communications

| Slice | What | Requirements |
| --- | --- | --- |
| E.1 | **Announcement composer.** `Announcement` + targeting resolver (org/campus/grade/class/subject/role/route/individual); audience preview + recipient count before send; routes through `notify.ts`. | COM-001 |
| E.2 | **Events / notices / newsletters.** `CalendarEvent`, `Notice`, `Newsletter` + calendar views in portals. | COM-004 |
| E.3 | **Forms / surveys / consent.** `Form`, `FormField`, `FormResponse`, `ConsentRequest` + acknowledgement; responses attributable + exportable. | COM-004 |
| E.4 | **Emergency broadcast.** Priority path bypassing quiet hours; delivery-status board; authorized-initiator only. | COM-005 |
| E.5 | **Student portal.** Timetable, homework, submissions, attendance, results, report cards, resources, notices, library, requests. | POR-001 |
| E.6 | **Guardian child/campus switcher.** In-shell switcher for guardian role (mirror the campus switcher built this session); context always visible, preserved through navigation. | POR-002, MOB-004(web) |
| E.7 | **Applicant + alumni portals.** Applicant: status, checklist, offer response. Alumni: read-only transcript/record. | POR-001 |
| E.8 | **Service requests.** `ServiceRequest` (type, SLA, owner, status, comments, audit) — certificates, leave, data correction, refund, transport change, appointment; guardian + staff queues. | POR-003 |
| E.9 | **Notification template management.** `/portal/settings/templates`: CRUD, approved-variable list, preview, test-send, versioning, effective dates, unsafe-variable validation, per-channel data classification. | NTF-002, NTF-007 |
| E.10 | **Delivery-log operator view.** Filterable + CSV export (reuse the platform-audit page pattern from this session). | NTF-003 |

---

## Phase F — Operations modules (Should-tier depth)

HR recruitment (`StaffRequisition`/`StaffApplicant`/onboarding) HRM-002 · HR shifts + holiday calendar + effective-dated leave balances HRM-003 · payroll period-lock + reconciled export HRM-004 · performance/training/cert-expiry UI HRM-005 · separation checklist drives asset-return + access-revocation HRM-006 · library renewal/loss/damage/verification + reports LIB-002/003 · transport compliance-doc alerts + capacity + effective dates TRN-001/002 · inventory issue/return/adjust/count reconciliation + asset maintenance/warranty/depreciation/disposal INV-002/003 · medication administration log HSD-003 · help content + guided tours POR-004.

---

## Phase G — Reporting, API, migration center

| Slice | What | Requirements |
| --- | --- | --- |
| G.1 | **Report framework.** `ReportDef` catalog (source, filters, formula, permissions); permission-aware multi-dimension filter bar; filters echoed in output. | RPT-001, RPT-002 |
| G.2 | **Metric registry.** Governed definitions; metric detail exposes numerator/denominator/exclusions/freshness; summary totals reconcile to drill-down. | RPT-005, UX-002 |
| G.3 | **Export jobs.** `ExportJob` + worker; CSV/XLSX/PDF; row limits; async for large; signed short-TTL download URL. | RPT-004 |
| G.4 | **Consolidated cross-campus reports.** Normalization rules for local calendars/currencies/completeness, visible in output. | RPT-006, BRN-005 |
| G.5 | **Sensitive-export controls.** Watermark, approval, reason capture, download audit, by data class + role. | RPT-007 |
| G.6 | **Scheduled reports.** To secure destination, expiry, audit; failure alerts owner without leaking data. | RPT-003 |
| G.7 | **API expansion + versioning.** Broaden `/api/v1` domain coverage on demand; deprecation policy + version negotiation + compatibility contract tests; sandbox environment. OAuth 2.0 client-credentials option. | API-001, API-002, API-007 |
| G.8 | **Webhook ordering + replay.** Sequence numbers; consumer self-serve replay of eligible failures. | API-005 |

---

## Phase H — Enterprise deployment (architecture decision gates)

Each of these needs a design doc approved before code. Do **not** start as MVP.

| Epic | Requirements | First step |
| --- | --- | --- |
| Local / connected / offline deployment | DEP-001…009 | Decision doc: packaging (signed containers vs compiled), installer, local admin console scope, degraded-mode contract |
| Hybrid synchronization | SYN-001…006 | Design doc: outbox schema, event-ID scheme, idempotent consumers, conflict queue UI, safe-mode, node-identity rotation. Name the four never-auto-merge domains (finance, enrollment, published results, safeguarding). |
| Local licensing | LIC-001…008 | Design doc: signing authority, embedded public key, offline activation file format, expiry stages (warn→grace→restricted-write→read-only), clock-rollback detection. Explicitly *not* the SaaS entitlement check. |
| Native mobile | MOB-001…007 | Decision doc: RN/Expo vs native; which workflows ship first (teacher attendance, guardian fees/results); secure token storage, biometric, device revocation, step-up, encrypted offline cache, deep-link auth. |

---

## Phase I — Homeschool (HOM-001…015)

**Blocked on a scope decision** — the two task prompts in this repo contradict each
other. If included: family learning accounts, personalized learning plans,
flexible curricula (no forced grading model), schedules + instructional-time
tracking, learner portfolios, formative assessment + assessor review, compliance
packs per jurisdiction, provider case management, cooperatives, concurrent
home/provider/campus enrollment, age-appropriate learner self-service, offline
learning packs, sharing consent. Treat as its own epic with its own design docs
after Phases A–C are stable.

---

## Non-functional evidence (NFR-001…015) — parallel track

Not a phase; a checklist to satisfy alongside feature work before any "production-ready" claim:

availability monitoring + monthly report (NFR-001) · load test + p95 telemetry (NFR-002) · capacity model + staged load (NFR-003) · documented restore exercise hitting RPO 15m / RTO 4h (NFR-004, SEC-009) · transactional + reconciliation + restore tests for money & published results (NFR-005) · WCAG 2.2 AA audit, automated + manual, on critical journeys (NFR-006, UX-004) · locale/timezone/currency/RTL test matrix (NFR-007) · cross-browser regression suite (NFR-008) · per-module ownership + runbooks (NFR-009) · correlated logs/metrics/traces/health/alerts (NFR-010) · backward-compatible migration + staged rollout + rollback + flags (NFR-011, DEP-006) · import/calc/integration validation + reject + reconciliation reports (NFR-012) · moderated usability study (NFR-013) · support simulation using correlation IDs + safe telemetry (NFR-014) · export + reimport validation with data dictionaries (NFR-015).

Plus SEC operational evidence: config/at-rest scans (SEC-001), env separation review (SEC-004), SDLC gates — dep scan / SAST / DAST / secrets detection / pen test (SEC-007), incident-response runbook + exercise (SEC-008), subprocessor inventory (SEC-010).

---

## Suggested navigation (Phase 24 — evaluate, don't force)

Current single flat sidebar works but is long (26 entries, 3 of them platform-only;
it was 19 on 2026-09-11). Reports, Calendar, Certificates and Hostel have since been
added. Consider grouping — **without renaming routes**:

```
DASHBOARD
ACADEMICS   Students · Admissions · Academics · Attendance · Exams · (Homework)
FINANCE     Fees · Invoices · Payments · Reconciliation · (Fee Reports)
PEOPLE      HR · Leave · (Recruitment · Payroll)
OPERATIONS  Library · Transport · Inventory · Health · Safeguarding
COMMS       (Announcements) · Messages · (Events) · Notifications
PORTALS     (Student) · (Applicant)   [guardian portal is its own login context]
REPORTS
ADMIN       Organization · Campuses · Setup · (Roles) · Integrations · (Templates) · Audit · Platform
```

Routes and permissions stay as-is; this is a presentation grouping only.
