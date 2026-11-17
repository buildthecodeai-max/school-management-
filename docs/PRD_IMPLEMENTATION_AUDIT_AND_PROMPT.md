# School Management SaaS Implementation Audit and Development Prompt

## Audit conclusion

The repository contains a substantial web MVP, but it does not yet implement the full PRD/SRS. The strongest areas are admissions, student records, attendance, examinations, fee operations, tenant-aware access control, notifications, and selected campus administration. Homeschooling, native mobile applications, offline and hybrid synchronization, local licensing, full commercial subscription billing, comprehensive reporting, and several compliance and operational requirements are not implemented.

This is a source-code audit, not formal acceptance. A feature is marked implemented only when the repository contains a reachable user or API workflow, persistent data support, server-side authorization, and meaningful behavior. A model, page shell, seed record, or helper alone does not count as complete.

## Verification performed

- Read the attached `Commercial SaaS School Management Software Hybrid Homeschool PRD SRS` version 1.2.
- Compared the 195 identified requirements with routes, server actions, libraries, Prisma models, tests, and repository documentation.
- Ran the unit test suite: 4 test files and 45 tests passed.
- Ran the production build: compilation and type checking passed, but page-data collection failed.

### Current blocking defects

The application cannot currently be treated as release-ready because `npm run build` fails while collecting page data for:

- `/api/internal/cron/document-expiry`
- `/portal/academics/timetable/new`
- `/api/v1/attendance/sessions`

These failures must be diagnosed and fixed before feature completion work continues. Browser and integration tests also require a running PostgreSQL database and should be rerun after the build is fixed.

## Feature implementation matrix

Legend: ✅ implemented core workflow · 🟡 partially implemented or not fully accepted · ❌ not implemented · ⚪ requires operational evidence rather than source code alone

| PRD area | Status | What exists | Principal gaps |
| --- | --- | --- | --- |
| TEN Tenant isolation and lifecycle | 🟡 | Tenant IDs, scoped queries, provisioning, suspension, campus settings | Verified offboarding export, legal hold, scheduled deletion, deletion evidence; broader isolation tests for exports, files, jobs, and caches |
| IAM Roles and access control | 🟡 | Atomic permissions, scoped assignments, server guards, approvals, impersonation, guardian relationships | Complete negative endpoint matrix, effective-access preview/report, stronger step-up and recovery controls |
| CFG Configuration and imports | 🟡 | Guided setup, campus cloning, student CSV preview and commit | Generic configurable fields/statuses/templates/workflows; import resumability and rollback evidence |
| ADM Admissions | ✅ | Public inquiry, pipeline, assessments/interviews, offers, duplicate detection, transactional enrollment, lifecycle actions | Full acceptance/e2e coverage for every decision path and external API ingestion |
| SIS Student information | 🟡 | Student profile, guardians, enrollment history, documents, bulk section/grade actions | Full sensitivity matrix, configurable document rules, approval/error report and true rollback for bulk updates |
| ACD Academics and timetable | 🟡 | Years, terms, grades, sections, subjects, rooms, timetable slots/versioning | Programs, credits, prerequisites, lesson plans, syllabus coverage, homework/resources, electives and subject-selection approvals |
| ATT Attendance and leave | 🟡 | Student register, codes, submit/lock/amend, guardian notifications, basic leave models/actions | Staff/device/import/mobile entry, verification delay, chronic absence/compliance exports, attachments/delegation/calendar integration |
| EXM Exams and report cards | 🟡 | Weighted plans, marks grid, moderation/publication, result versions, scheduling, seating, competencies | Mark import, accommodations, complete transcript behavior, approval separation and acceptance tests for all workflows |
| FEE School fees | 🟡 | Structures, assignments, billing runs, invoices, allocations, receipts, adjustments, bank CSV reconciliation, GL CSV | Real gateways and signed webhooks, all payment methods and controls, reversals/waivers/write-offs, robust settlement/cashier/report suite |
| HRM Human resources | 🟡 | Staff/employment records, leave, payroll inputs, performance record, separation checklist | Recruitment, qualifications/documents/emergency contacts UI, shifts/attendance/holidays, training/certification expiry, full offboarding automation |
| COM Communications and content | 🟡 | In-app messages and notification delivery infrastructure | Targeted announcement composer, moderated conversations/attachments, calendars/events/newsletters, forms/surveys/consent, emergency broadcast workflow |
| LIB Library | 🟡 | Catalog, copies, issue/return/reservation and simple fines | Renewal, loss/damage, stock verification, policy variations, complete circulation/overdue/inventory/usage reports |
| TRN Transport | 🟡 | Vehicles, routes, stops, assignments, basic trip attendance and alerts | Compliance documents, drivers/attendants/schedules/fees, capacity enforcement, incidents and live tracking integration |
| INV Inventory and assets | 🟡 | Items, suppliers, warehouses, stock ledger, requisitions, purchase orders, asset assignment | Transfers, issue/return/adjustment/count workflows, maintenance/warranty/depreciation/disposal approval and history |
| HSD Health and safeguarding | 🟡 | Health record/incidents and restricted safeguarding cases/notes | Medication schedules and administration, immunization/clinic depth, evidence/review/escalation and discipline workflow |
| POR Portals and service requests | 🟡 | Staff and guardian-oriented dashboards; selected guardian records | Dedicated student/applicant/alumni experiences, child/campus context switching acceptance, configurable service requests, searchable help/tours |
| HOM Homeschooling | ❌ | No dedicated homeschool domain or workflows | All HOM-001 through HOM-015, including family accounts, plans, portfolios, compliance packs, cooperative classes and offline learning packs |
| UX User experience | 🟡 | Responsive web shell and role dashboards | Global search is not connected to UI; campus preference cookie is not applied; saved views/drilldowns/exports are inconsistent; accessibility evidence is absent |
| BRN Campus management | 🟡 | Campus records/lifecycle, scoping, settings, student transfer | Merge workflow, shared-service queues, historical effective assignments, safe campus export/closure analysis and cross-campus bulk actions |
| BIL Commercial SaaS billing | 🟡 | Plans, versions, subscriptions, entitlements, usage display and basic plan-change UI | Deterministic metering, checkout/quotes, trials and proration, SaaS invoices/payments, dunning, overrides, partners, tax/revenue reporting |
| NTF Notifications | 🟡 | Central dispatcher, in-app/email/SMS/push adapters, preferences, quiet hours, dedupe, delivery log and digest endpoint | Real provider configuration/failover, localized versioned template management UI, test-send/preview, configurable throttling and escalation |
| RPT Reports and exports | ❌ | A few page-specific summaries and CSV exports | Governed report catalog, comprehensive operational reports, scheduling, XLSX/PDF, async secure downloads, metric definitions, campus comparison and protected bulk exports |
| API Public API and webhooks | 🟡 | Small v1 API slice, API keys/scopes, idempotency, pagination helpers, rate limiting, signed webhooks | Broad domain coverage, OAuth option, durable/distributed quotas, ordering guarantees, async jobs, test environment, compatibility/deprecation program |
| DEP Cloud/local deployment | ❌ | Development Docker Compose for PostgreSQL | Signed release artifacts, installer, cache/jobs/object storage/proxy/backups/health, HA profiles, migration recovery, local admin console and support matrix |
| SYN Hybrid synchronization | ❌ | No node/event synchronization subsystem | All SYN-001 through SYN-006 |
| LIC Local licensing | ❌ | SaaS entitlements are not cryptographic local licences | All LIC-001 through LIC-008 |
| MOB Native mobile apps | ❌ | Responsive web pages only | All MOB-001 through MOB-007; no iOS or Android projects |
| SEC Security/privacy/compliance | 🟡 | Password hashing, sessions, TOTP MFA, login limiting, scoped permissions and audit events | At-rest/deployment evidence, breached-password/device management, privacy/legal-hold workflows, SDLC security gates, incident response, backups, vendor risk and residency controls |
| NFR Quality attributes | ⚪ | Unit tests pass; TypeScript compilation succeeds | Production build currently fails; availability, performance, scale, RPO/RTO, accessibility, browsers, observability, restore, usability and portability need measured acceptance evidence |

## Highest-priority repair and delivery order

1. Restore a clean production build and add a CI command that fails on build or test errors.
2. Repair global search and campus switching because both exist in code but are not usable end to end.
3. Add database-backed integration tests for tenant isolation, admissions conversion, billing idempotency, attendance alert deduplication, authorization denial, and result publication.
4. Complete the mandatory web MVP gaps: reporting, communications, portal/service requests, commercial billing, privacy workflows, and tenant offboarding.
5. Treat homeschool, local/offline/hybrid deployment, synchronization, cryptographic licensing, and native mobile apps as separate epics with architecture decisions before implementation.
6. Collect non-functional acceptance evidence instead of marking NFRs complete from source inspection.

## Ready-to-use implementation prompt

Copy the prompt below into a coding task with this repository as the workspace.

```text
You are a senior product engineer and QA lead working on Scholarum, a Next.js 15, TypeScript, PostgreSQL and Prisma multi-tenant school-management SaaS.

Authoritative product requirements are in:
/Users/mac/Desktop/Commercial_SaaS_School_Management_Software_Hybrid_Homeschool_PRD_SRS.docx

The current conservative audit is in:
/Users/mac/school software/docs/PRD_IMPLEMENTATION_AUDIT_AND_PROMPT.md

The older traceability file in docs/REQUIREMENTS_TRACEABILITY.md is useful context but is not proof of completion. Do not trust status claims without checking reachable UI/API behavior, database persistence, authorization, tests and acceptance criteria.

Goal:
Make the application reliably implement the next incomplete PRD slice while preserving strict tenant and campus isolation.

Work in this order:
1. Run git status and preserve all existing user changes. Never delete or overwrite unrelated work.
2. Run npm test and npm run build. Diagnose and fix the current production-build failures for the document-expiry cron route, timetable/new page and attendance/sessions API route before adding features.
3. Select one bounded PRD requirement or tightly related workflow from the audit. Prefer Must requirements and broken existing workflows over new Should/Could scope.
4. Trace the entire requirement through Prisma schema, migration implications, seed data, server-side permissions, tenant/campus scope, server action or API, reachable UI, audit logging, validation, error handling and notification behavior.
5. Implement production behavior, not placeholders. A page shell, model, hard-coded demo result or helper without a caller does not count.
6. Add or update unit, integration and Playwright tests that prove the PRD acceptance summary. Include negative authorization and cross-tenant/cross-campus tests for protected features.
7. Run formatting/type checks as available, the complete unit suite, relevant integration/e2e tests and npm run build.
8. Update docs/REQUIREMENTS_TRACEABILITY.md only after the tests pass. Use:
   - Implemented: reachable end-to-end behavior plus persistence, authorization and acceptance evidence.
   - Partial: useful behavior exists but any required acceptance condition is missing.
   - Not implemented: no meaningful end-to-end workflow.
9. Report changed files, migrations, commands run, test results, remaining gaps and manual verification steps. Never claim the entire PRD is complete from a passing unit suite.

Mandatory engineering rules:
- Resolve tenant context from authenticated server-side identity. Never authorize from a client-supplied tenantId.
- Apply tenantId to every tenant-owned query and campus scope wherever applicable.
- Deny by default and enforce permissions on the server, not only by hiding UI.
- Use transactions and idempotency for financial, enrollment, publication and synchronization-sensitive writes.
- Preserve immutable history for audit, money, published results and high-risk changes.
- Do not mix school-fee accounting with commercial SaaS subscription billing.
- Do not label responsive web pages as native mobile applications.
- Do not label SaaS entitlement checks as offline cryptographic licensing.
- Do not mark operational or NFR requirements complete without measurable evidence.

For each requirement handled, finish with this evidence table:
Requirement ID | Status | UI/API path | Data model | Authorization | Automated tests | Acceptance evidence | Remaining gap
```

## Suggested first coding task

Fix the three production-build route failures, then make global search and campus switching fully reachable and correctly scoped. These are high-value repairs to existing code and are smaller and safer than beginning homeschool, synchronization, licensing, or native mobile work.
