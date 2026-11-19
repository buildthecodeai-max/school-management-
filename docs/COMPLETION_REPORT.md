# Completion report — 2026-11-20

Scope: take the existing Scholarum app, find what was incomplete, and make the core school
operations genuinely work through the UI, without rebuilding. The rule used throughout: a
feature counts only when an authorized user can finish the workflow from a screen, the data
persists, permissions and validation are enforced on the server, and it was verified.

This report covers the work from commit `de7986a` to `5888a52` (11 commits changing
123 files, about 7,700 lines added and 3,300 removed). Earlier phases are described in the other docs.

## How verification was done

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `next build` | compiles |
| Unit tests (`npm test`) | 142 passed, 23 files |
| Integration tests (real Postgres, throwaway tenants) | 139 passed, 25 files, stable over repeated runs |
| Browser checks | Read-only passes over the new screens against the demo school, as the owner, campus admin and parent |
| End-to-end (Playwright) | **Not run.** The specs sign in with `*@greenwood.edu` accounts that the current seed does not create, and they write records. They need updating and a disposable database |

What "verified" does and does not mean here: every server action has integration tests that call
it as different users and check permissions, validation, persistence, audit entries and
cross-school isolation. The screens were compiled and, for most, opened in a browser, but the
demo school holds no data for transport, inventory, library, health, safeguarding or bank
lines, so the add / save / approve flows on those screens are proven by the tests and not by
clicking through them. Nothing was written to the demo data.

## Completed (workflow works end to end, tested)

- **Sign-in security**: two-factor is now actually asked for at sign-in (pending session grants nothing).
- **New school setup**: provisioning gives an admin role, a one-time invite link, a trial subscription, default roles, attendance codes, a grade scale, leave types (staff and student) and competencies.
- **Academic configuration screens**: years, terms, grades, sections, subjects, rooms, grade scales, attendance codes, leave types, departments, with overlap and delete guards. Campus configuration clone with preview.
- **Approvals inbox** with maker-checker; refunds and requisitions execute on approval.
- **Fees**: assignment and discounts (bulk with preview), refunds limited to unapplied credit, payment reversal, per-payment receipts, filtered reports with CSV (collections, overdue and aging, discounts, refunds, ledger), bank-statement import with auto and manual matching, safe GL journal export.
- **Attendance**: any-date registers with rules, validated marks, amendments with reasons and history, locking, reports and CSV, student leave requests that pre-fill registers.
- **Exams**: plan creation, atomic validated marks, enforced status workflow, maker-checker approval, tie-aware ranks, printable report cards, competency ratings and conduct carried across corrections, timetable slot editor.
- **Staff**: leave requests, separation checklists. **Students**: documents with expiry, bulk promotion and section moves with preview.
- **Transport, inventory, library, health, safeguarding**: full management screens (they were view-only).
- **Family portal** for guardians and students, with privacy rules.
- **School-owner user and role management** (IAM-001): add people by one-time invite link, grant and revoke roles within the manager's own rights, disable and sign out, effective-access preview, custom roles from the permission catalog with escalation, lockout and built-in-role protections.
- **Regression guards** that fail the test run on the mistake classes that caused most of the defects below.

## Partially completed

| Area | What exists | What is missing |
| --- | --- | --- |
| Attendance | Daily registers, reports, amendments | Period / subject registers, trend charts |
| Fees | Everything above | Online payment, automatic late fees, Excel export of fee reports (CSV only), approval step for payment reversal |
| Report cards | Printable HTML, ratings | PDF generation, template editor, per-section bulk print |
| Exams | Workflow, schedules (not re-reviewed) | Accommodations, grade promotion decisions from results |
| Dashboards | Role-aware dashboards existed | Not reworked in this pass; new modules have no dashboard tiles |
| Student / guardian portals | Child hub, leave | Online payment, messaging with teachers, student-facing library and homework views |
| Translations | Existing screens | All new screens are English only |
| Pagination and filters | Reports and library have filters | List pages generally cap at 50–300 rows without paging |

## Not done

- Announcement composer, forms and surveys, emergency broadcast (E.1–E.4), subscription upgrade flow, usage metering and dunning (B.3–B.9), homeschool, native mobile, offline editions.
- Non-functional evidence: load, accessibility, restore drills, observability.
- Student photos and ID generation, emergency contact management, teacher and staff document upload.
- Seed data for the new modules (the demo school has none for transport, library, inventory, health, safeguarding).

## Defects found and fixed

Security and data isolation (the serious ones):

1. Stock adjustment, asset assignment and return trusted ids from the form: anyone with the permission on one campus could change another school's stock or assets.
2. Health records could be overwritten across schools (upsert by student id with no school check); safeguarding notes and closes could target another school's case.
3. Competency ratings trusted a campus from the form; the default-competency helper was callable by anyone with any school id.
4. Bulk promotion and section reassignment could write enrollments into another school's section; "false" for the preview flag was read as true.
5. GL journal export ignored campus scope (data leak to campus-limited users).
6. Transport trips, library issue/return and reservations, requisition lines, purchase-order lines all trusted ids and campuses from the form.
7. Marks could be saved for students outside the section; any status could be forced, including straight to Published.
8. Student documents accepted another school's student and `javascript:` links.

Correctness:

9. Two-factor was never asked for at sign-in. 10. Re-importing a bank statement doubled every line; CSV parsing broke on quoted commas. 11. Purchase orders could be received twice, doubling stock. 12. Tied students got arbitrary ranks. 13. A draft save re-opened a submitted attendance register. 14. Library issue looked up copies by internal id but asked for a barcode. 15. Money was written as "$1,234.00" inside CSV columns. 16. A "to" date overwrote the "from" date in the journal export. 17. Submitting one subject's marks submitted the whole plan.

Schema: deleting a school failed once it had trips, asset assignments, library or inventory rows (missing cascades); fixed. Test-helper campus codes occasionally collided; fixed.

## Core module status

| Module | Status | Verified by |
| --- | --- | --- |
| Academic configuration | Complete | integration tests, browser |
| Student lifecycle | Complete for registration, documents, bulk moves, transfer, merge; photos and IDs missing | integration tests |
| Fee management | Complete except the items under Partial | integration tests, browser (reports, receipts, CSV) |
| Attendance | Complete for daily registers | integration tests, browser (register, reports) |
| Exams, results, report cards | Complete for the workflow and printable cards | integration tests, browser (plan page) |
| Teacher / staff | Leave, separation, timetable, marks, registers | integration tests |
| Access management (users, roles) | Complete | integration tests (11), browser as owner and as a campus admin |
| Student & guardian portals | Child hub complete | integration tests, browser as parent |
| Library, transport, inventory, health, safeguarding | Complete management screens | integration tests; screens opened but not driven with data |
| HR | Staff, leave, payroll runs, recruitment, separation | integration tests |
| Finance (operational ledger), campus, notifications | Unchanged in this pass | earlier tests |

## Remaining risks

1. **Migrations**: closed on 2026-11-20 (`20261120000000_catch_up_to_schema`). A database built only from the migrations was compared with `schema.prisma` and with the development database and showed no difference. Remaining discipline: every future schema change needs a migration; `npm run db:drift` enforces it. Not tested: running `migrate deploy` against a database that already holds production data.
2. **End-to-end specs are stale**, so the browser-level regression net is thin; most confidence comes from the integration tests and the static guards.
3. **Screens driven only by tests** for the modules the demo school has no data for. Do a manual pass with real data before go-live.
4. **Payment reversal has no second approver**, unlike refunds.
5. **Real email, SMS and push delivery are still console stand-ins**, so "notified" in this report means an in-app message was created.
6. **Throwaway school**: "Test Academy" (`test-academy`) still exists in the dev database from UI testing; remove it if you do not want it.
7. **Accessibility and mobile layouts** were not audited.

## Files changed

Roughly: 68 files added, 53 modified, 2 deleted. By area (paths under `src/` unless noted):

- `app/portal/academics/config`, `app/portal/exams/*`, `app/portal/approvals`, `app/login/mfa`, `lib/provision.ts`, `lib/school-roles.ts`: configuration, workflow and sign-in work.
- `app/portal/fees/*`, `app/api/portal/fees/*`, `lib/fee-reports.ts`, `lib/bank-statement.ts`, `lib/refunds.ts`: fee work.
- `app/portal/attendance/*`, `lib/attendance*.ts`, `lib/leave.ts`: attendance and leave.
- `app/portal/{transport,inventory,library,health,safeguarding}/*`, `lib/{transport,inventory,library,restricted}.ts`: operational modules.
- `app/portal/family/*`, `lib/family.ts`, `components/PortalShell.tsx`: portals.
- `app/portal/students/*`, `app/portal/setup/*`, `app/portal/hr/*`: bulk actions, clone, separations.
- `prisma/schema.prisma`: attendance amendments, bank line constraints, renewal counter, cascades, MFA session flag.
- `tests/`: 25 integration files, 23 unit files and 5 (stale) end-to-end specs. `tests/unit/static-guards.test.ts` is the regression net.

Git: `git log --oneline de7986a..HEAD` lists every commit with its scope.
