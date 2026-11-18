# Requirements traceability

Status of PRD/SRS requirements against this codebase.
Legend: ✅ usable end to end · 🟡 partial (the row says what is missing) · ⬜ not yet started.

A ✅ means a permitted user can complete the workflow from a screen (or the public
API), with server-side authorization and an audit trail. Server logic that no
screen calls does not earn a ✅. Per PRD Appendix A, "complete" additionally needs
formal acceptance evidence, which this document does not claim.

Last updated: 2026-11-18 (phase 20 plus a reachability audit). The audit
cross-checked all 153 exported server actions and every internal link against the
code that exists: **31 actions have no caller and 4 links point at pages that do
not exist**. 34 rows that previously read ✅ were regraded to 🟡 for that reason;
the details are in [Reachability gaps](#reachability-gaps-found-2026-11-18) at the end. Earlier versions of this file said
"all non-deferred requirements implemented", which overstated the state of the UI.

Build history (what each phase added):

New in phase 6: ADM-006 (student lifecycle UI), SIS-004/005, EXM-002/005, FEE-003/005/007, INV-po/asset, TRP-notify.
New in phase 7: LIB-reserve (reserve/fulfill/cancel), FEE-007 download Route Handler (`api/portal/fees/gl-export`), EXM-002 scheduling UI (`portal/exams/schedule/new`), CFG-002 campus template clone with preview (`portal/setup/clone-actions.ts`), BRN-006 confirmed ✅.
New in phase 8: NTF-002 template management UI (`portal/notifications/templates`); UX-003 search page already wired; UX-006 campus preference wired into library/HR/transport/inventory/health/safeguarding pages via `resolveCampusId()`.
New in phase 9: TEN-006 tenant offboarding — data export Route Handler (`api/portal/platform/tenants/[id]/export`), deletion scheduling with evidence gate (`dataExportedAt` required), cancel and hard-delete flows in `OffboardingPanel`.
New in phase 10: SEC-003 HaveIBeenPwned k-Anonymity breach check (`lib/hibp.ts`) runs at login; sets `sms_pwd_breach` cookie; amber warning banner in portal with dismiss; change-password page at `portal/account/password`.
New in phase 11: self-service password reset (`login/forgot-password`, `login/reset-password`).
New in phase 12: account page (`portal/account`) linked from the top-bar avatar.
New in phase 13: inbound payment-gateway webhook (`api/webhooks/payments/[tenantSlug]`, `lib/gateway-webhooks.ts`).
New in phase 14: notification localization (per-language templates, per-user language).
New in phase 15: per-recipient notification throttle window.
New in phases 16–19: portal translation (shell, account, students, attendance, fees, dashboards) into es/fr/pt/ar, shell into sw/hi.
New in phase 17: student-record merge. New in phase 20: HR recruitment tracking.

## §5 Tenancy (TEN)
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| TEN-001 | Tenant context from authenticated identity, never client-supplied | ✅ | `lib/auth.ts`, `lib/scope.ts` |
| TEN-002 | Non-null tenant key + isolation on all paths | ✅ | `schema.prisma`, `lib/scope.ts` |
| TEN-003 | Org settings with campus overrides | ✅ | `CampusSetting` model; `CAMPUS_SETTING_KEYS` (10 configurable keys); `saveCampusSetting`/`getCampusSettings` in `settings/campus/actions.ts`; settings editor UI at `/portal/settings/campus` |
| TEN-004 | Idempotent tenant provisioning | 🟡 | Wizard at `/portal/platform/tenants/new`: a slug-based upsert creates the tenant, a campus and an admin user without duplicates. Defects: it looks for a role named "Campus Admin" (the roles `ensureSchoolRoles` creates are "Campus Administrator", and no roles exist yet at that point), so the admin is never given a role; the generated temporary password is never shown; and no subscription is created. `updateSubscription` only edits an existing subscription ("This tenant has no subscription"), so a new school cannot be given one from any screen. Academic structure is not created either (see CFG-002 and ACD-001). Workaround: a platform operator runs "ensure school roles" and assigns the role on the tenant page, and the admin signs in through Forgot password |
| TEN-005 | Suspension blocks use, preserves data | ✅ | `blockedBySuspension()` in `requireUser()` — single choke point; all writes/server actions blocked for suspended tenants; platform staff exempt; banner shown; data preserved |
| TEN-006 | Offboarding: export, hold, deletion evidence | ✅ | `api/portal/platform/tenants/[id]/export` (JSON download); `Tenant.dataExportedAt/deletionScheduledAt`; `scheduleTenantDeletion`/`cancelTenantDeletion` actions; `OffboardingPanel` three-step UI |

## §6 Access control (IAM)
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| IAM-001 | Custom roles from atomic permissions + scope | 🟡 | `lib/permissions.ts` (80 permission keys), `Role`, `RoleAssignment`; enforced on every page and action. Default roles are created per school by a platform operator (`ensureSchoolRoles`) and platform operators create users and assign roles on the tenant page. No screen lets a school owner create users or edit roles, and there is no permission preview or effective-access report |
| IAM-002 | Deny by default, server-side enforcement | ✅ | `lib/rbac.ts` guards, suspension choke point |
| IAM-003 | Maker-checker for high-risk actions | 🟡 | `ApprovalRequest` + `lib/approvals.ts`: `issueRefund` (student page) records an approval request with payload, audit entry and notification; `submitRequisition` would too but has no screen. There is no approvals inbox: `resolveApproval()` and `approveRefund()` have no caller, so a requested refund can never be executed from the UI |
| IAM-004 | Support impersonation with reason/banner/audit | ✅ | Dual-cookie (`sms_session` + `sms_impersonator_session`); amber banner in `PortalShell`; start/end audited; entry point at `/portal/platform`; `endImpersonation()` in `lib/auth.ts` |
| IAM-005 | Different roles per campus, one identity | ✅ | `RoleAssignment` scope; verified |
| IAM-006 | Guardian access via verified relationship | ✅ | `GuardianRelationship` drives portal |

## §7.1 Config (CFG)
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| CFG-001 | Guided onboarding capturing profile, campuses, calendar, grades, sections, subjects, fees, branding, admins; progress checklist validates prerequisites | 🟡 | `portal/setup`: an 11-step launch-readiness checklist (campus-scoped) that validates prerequisites and links to existing screens. Campuses, fee structures and student import can be done in the UI; the calendar, terms, grade levels, sections, subjects and grade scale it checks cannot be entered from any screen (see CFG-002, ACD-001, EXM-001) |
| CFG-002 | Clone configuration from a campus template with overrides; clone preview | 🟡 | `cloneCampusConfig` (`portal/setup/clone-actions.ts`) and `cloneCampusTemplate` are complete server logic (preview returns counts, commit runs in a `$transaction`: grade levels, academic years, terms, sections, fee structures + lines, assessment plans + components, grade scales) but no screen calls either |
| CFG-003 | Configurable fields, statuses, numbering, templates, workflows, thresholds; versioned & effective dated | 🟡 | Numbering (INV/RCP/admission) + effective-dated fee/academic structures exist; generic field/template config ⬜ |
| CFG-004 | Bulk import: mapping, validation, preview, row-level errors, resumability, reconciliation totals; no partial commit unless approved | ✅ | `portal/import` + `previewImport`/`commitImport` (auto-map, per-row errors, all-or-nothing commit, dup skip, reconciliation summary) |

## §7.2 Admissions (ADM)
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| ADM-001 | Capture inquiries/applications from public forms, staff, referral, API; configurable stages; pipeline shows source/owner/status/age | ✅ | `apply/[slug]`, `admissions/new`, pipeline board |
| ADM-002 | Household data, prior education, documents, consent, assessment, interview, scoring, notes; required items block advancement | ✅ | Application detail; checklist gate in `advanceStage` |
| ADM-003 | Duplicate detection with reasons, tenant-scoped; reviewed before proceeding | ✅ | `admissions-server.ts::findDuplicates`, warning banner |
| ADM-004 | Offers, waitlists, rejections, deadlines, deposits; each decision approved & timestamped; versioned offers | ✅ | `issueOffer` (versioned, requires `admissions.decide`), stage events |
| ADM-005 | Convert accepted applicant → student, guardian, enrollment, placement, portal access, without rekeying; transactional & traceable | ✅ | `convertToEnrolled` ($transaction + `EnrollmentConversion`) |
| ADM-006 | Reenrollment, transfer, withdrawal, alumni, reason tracking; status history & effective dates preserved | ✅ | `transferStudent`/`markAlumni`/`reenrollStudent`/`suspendEnrollment`/`withdrawEnrollment` in `portal/students/actions.ts` with `$transaction`+`audit()`; lifecycle card on the student detail page. Duplicate-record merge (phase 17): `lib/student-merge.ts` + `portal/students/[id]/merge` (organization-wide `student.merge`, dry-run preview, blocks on two active enrollments or two health records, keeper wins on unique clashes, verifies nothing is left before the cascading delete, audited) |

Workflow §8.1 (lead → enrolled) is implemented end to end and verified in the
browser, including the onboarding notice to the new guardian portal account.

## §7.3 SIS
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| SIS-001 | Longitudinal student profile w/ sensitivity | ✅ | `students/[id]` |
| SIS-002 | Multiple guardians, custody, financial, pickup | ✅ | `GuardianRelationship`, student detail |
| SIS-003 | Enrollment/grade/section/status/exit history | ✅ | `Enrollment`, student detail |
| SIS-004 | Document expiry reminders | 🟡 | `getExpiringDocuments` and the cron handler `api/internal/cron/document-expiry` (guardian `notify()`) exist, but no screen registers student documents (`registerStudentDocument` has no caller), so there is nothing to expire except seeded rows |
| SIS-005 | Bulk updates with preview/rollback | 🟡 | `bulkPromoteGrade` works at `portal/students/bulk` (preview returns count + names, commit runs in a `$transaction`, the audit entry records the diff); `bulkReassignSection` has no screen and there is no rollback screen |

## §7.4 Academics (ACD)
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| ACD-001 | Years, terms, grades, sections, subjects | 🟡 | Shown at `/portal/academics` (read-only). No screen creates academic years, terms, grade levels, sections or subjects: the data comes from the seed or from the unwired clone actions (CFG-002) |
| ACD-002 | Assign teachers/rooms/periods + conflicts | 🟡 | `Room`, `TimetableSlot`, conflict detection in `lib/timetable.ts`. Teacher assignment and substitute coverage work (`portal/academics/teachers`); timetable versions can be created. No screen adds slots (the "add slot" link on the timetable page goes to a route that does not exist) and rooms cannot be created |
| ACD-003 | Publish versioned timetables | ✅ | `TimetableVersion` (mirrors the `ResultVersion` snapshot pattern); `publishTimetableVersion` at `portal/academics/timetable` publishes whatever slots the version already holds |
| ACD-004 | Lesson plans and homework | 🟡 | `portal/academics/planning` (`createPlanningItem`): teachers save lesson plans and publish homework, listed as recent plans / upcoming homework. Syllabus-coverage tracking is not built |

## §7.5 Attendance (ATT)
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| ATT-001 | Record attendance w/ author/timestamp/source | ✅ | `attendance/[id]`, `actions.ts` |
| ATT-002 | Present/absent/late/excused/leave/remote codes | ✅ | `AttendanceCode` with category (`PRESENT`/`ABSENT`/`LATE`/`EXCUSED`/`LEAVE`/`REMOTE`); the P/A/L/E codes are seeded and no screen edits codes |
| ATT-003 | Guardian alerts after verification, deduped | ✅ | `actions.ts::generateGuardianAlerts` |
| ATT-004 | Corrections, lock dates, privileged amend | ✅ | Lock rules in register + action |
| ATT-005 | Leave requests w/ balances/approval | 🟡 | `LeaveType`/`LeaveBalance`/`LeaveRequest`; the HR page approves or declines pending requests (`approveLeaveHr`, balance decrement in a `$transaction`, notification to the staff member). No screen submits a request (`requestLeave` has no caller; `approvLeave` in `attendance/actions.ts` is an unused near-duplicate) and leave types and balances are seed-only |

## §7.6 Assessment (EXM)
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| EXM-001 | Assessment components, weightings, grade scales, term calculations; calculation preview explains each result | 🟡 | `AssessmentPlan`/`AssessmentComponent`/`GradeScale`, `lib/exams.ts` and the result-preview table all work, but no screen creates plans, components, subjects or grade scales (seed or unwired clone only), so a new school cannot set up assessment |
| EXM-002 | Schedule exams with rooms/seating/invigilators/conflicts | ✅ | `createExamSchedule` in `portal/exams/scheduling-actions.ts`; room conflict check + invigilator conflict check; round-robin `SeatAssignment` from section enrollments; `$transaction` atomicity; creation UI at `portal/exams/schedule/new` |
| EXM-003 | Teachers enter/import marks only for assigned subjects, with validation & save state | 🟡 | `MarksGrid` + `saveMarks` enforce 0..max validation, an open plan, and the per-subject teacher rule, with ABSENT/EXEMPT. The CSV mark import (`portal/import/marks`) checks `exams.enter` for the campus but **not** that the plan is open or that the user is the subject's assigned teacher, so it can overwrite marks that `saveMarks` would refuse |
| EXM-004 | Moderation, approval, locking, publication, transcripts, report cards; publication needs approval + creates a version | ✅ | `setPlanStatus`/`publishResults` (gated on completeness), `ResultVersion` snapshot, report card page |
| EXM-005 | Qualitative outcomes, competencies, remarks, conduct, promotion decisions | 🟡 | `saveCompetencyRatings` and `ensureDefaultCompetencies` (`portal/exams/scheduling-actions.ts`, `StudentCompetencyRating`, conduct remark on `StudentResult`) are implemented but no screen calls them |
| EXM-006 | Corrections after publication are versioned & republished with a reason; previous versions auditable | ✅ | Republish creates a new `ResultVersion`, prior marked SUPERSEDED |

Workflow §8.4 (marks → published report card) works end to end for an assessment
plan that already exists. Exam scheduling (EXM-002) is usable; competency ratings
(EXM-005) and creating plans (EXM-001) have no screen.

## §7.7 Fees (FEE)
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| FEE-001 | Fee heads, structures, schedules, discounts/scholarships, taxes, campus applicability; preview before activation; installment plans | 🟡 | Heads and structures are managed at `portal/fees/structures` (`FeeHeadManager`, `FeeStructureBuilder`); billing preview; `buildInstallmentSchedule()` makes `postBillingRun` generate per-installment invoices when `maxInstallments > 1`. No screen assigns a structure or discount to a student (`StudentFeeAssignment` has no creation path), so per-student concessions cannot be set |
| FEE-002 | Assign fees, generate invoices/statements/receipts with unique numbering; posting idempotent & reconciles | ✅ | `postBillingRun` (idempotent per student+structure+period), `Invoice`/`InvoiceLine` |
| FEE-003 | Accept cash/bank/card/wallet/cheque/gateway/imported payments | 🟡 | `recordPayment` + `Allocation` work from the student and invoice pages (cash, bank, card, wallet, cheque, online gateway). The inbound gateway webhook (phase 13, `lib/gateway-webhooks.ts`) posts and allocates receipts automatically. Bank statement import (`importBankStatement`, CSV into `BankStatementLine`) has no screen |
| FEE-004 | Partial/overpayment/advance/refunds/reversals/waivers/write-offs/plans; sensitive adjustments need reason + approval | 🟡 | Partial and advance payments, credit notes, write-offs and payment plans work from the invoice page (reason required, `fee.adjust`, separation of duties verified). Refunds: `issueRefund` records an approval request but nothing resolves it (see IAM-003) |
| FEE-005 | Reconcile gateway settlements & bank imports with exception queues | 🟡 | `portal/fees/reconciliation` lists bank statement lines and their status. No screen imports statements or matches lines ("Match manually" is plain text; `reconcilePayments` has no caller) |
| FEE-006 | Aging, collection, concession, outstanding, cashier, ledger reports; totals agree to ledger | ✅ | Finance dashboard (aging), invoice list, student ledger, guardian balance |
| FEE-007 | Export accounting journals/dimensions to finance systems | ✅ | `exportGLJournal` in `portal/fees/bank-actions.ts` (string) + Route Handler at `api/portal/fees/gl-export` (downloadable CSV with `Content-Disposition`); groups `InvoiceLine` by `FeeHead.glAccountCode` for date range |

Workflow §8.3 works end to end through billing run → collect → allocate → receipt,
and the GL export (FEE-007) is usable. Bank statement import and matching
(FEE-003/005) and refund approval (FEE-004) have no screen.

## §7.8 HR
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| HR-staff | Staff directory, employment records, departments, positions | 🟡 | `portal/hr`: campus-scoped directory and add-staff form work (`addStaff`, `EmploymentRecord`). Departments and positions cannot be created from any screen, and adding staff or hiring an applicant needs an existing position |
| HR-leave | Leave requests, balances, approval queue | 🟡 | Approval queue works at `portal/hr` (`approveLeaveHr`, notification on decision); submitting requests has no screen (see ATT-005) |
| HR-payroll | Payroll runs (not a statutory calculation engine) | ✅ | `portal/hr/payroll`: `createPayrollRun` builds a period's payslips from active employment records (salary, less loan and advance deductions) and `postPayrollRun` posts it; amounts in cents, audited. The older manual `recordPayrollInput` has no screen, and staff loans and advances have no creation screen (so deductions are normally zero) |
| HR-separation | Separation checklists | 🟡 | `SeparationChecklist` with a default 5-item checklist is listed on the Separations tab of `portal/hr`; `initiateSeparation` has no screen |
| HR-recruit | Recruitment/applicant tracking | ✅ | `portal/hr/recruitment` — `JobOpening`/`JobApplicant`/`JobApplicantEvent`; stage pipeline (Applied → Screening → Interview → Offer, Rejected/Withdrawn) with history; `hr.recruit.read`/`write` permissions; Hire (Offer stage only, also needs `hr.staff.write`) creates Person + Staff + EmploymentRecord in one transaction and auto-fills the opening at headcount; applicant data is included in the tenant export. Needs an existing position to hire into (see HR-staff). Internal entry only: a public careers page is not built (needs CAPTCHA/rate-limiting) |

## §7.9 Library
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| LIB-catalog | Catalog with authors, categories, copies, availability | ✅ | `LibraryItem`/`LibraryCopy`/`LibraryCategory`/`LibraryAuthor`; `portal/library` |
| LIB-circ | Issue, return, fine | 🟡 | `LibraryCirculation`; issue (`portal/library/issue`, by copy barcode and borrower id, 7–30 day loan) and return (by barcode) work; a late return adds a flat 500-cent fine and notifies the borrower. There is no renew action |
| LIB-reserve | Reservations | 🟡 | `reserveBook`/`fulfillReservation`/`cancelReservation` (dedup guard, 7-day expiry, guardian `notify()` on fulfil) are implemented but no screen calls them |

## §7.10 Transport
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| TRP-fleet | Vehicles, routes, stops, student assignments | 🟡 | `Vehicle`/`Route`/`Stop`/`RouteAssignment`; `portal/transport` shows the fleet (registration, model, capacity, driver) and routes (stops, assigned students) read-only. Nothing in the app creates or edits them (seed only) |
| TRP-trip | Trip attendance recording | 🟡 | `TripAttendance`; `recordTrip` is implemented but no screen calls it: the "Record trip" button on `portal/transport` links to `/portal/transport/trip`, which does not exist |
| TRP-notify | Guardian notifications on board/miss events | 🟡 | `recordTrip` looks up `GuardianRelationship` rows with `receivesNotifications=true` for BOARDED/ABSENT students and calls `notify()` per guardian-user with a dedup key; it only runs when a trip is recorded, which no screen can do (see TRP-trip) |

## §7.11 Inventory
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| INV-stock | Items, categories, warehouse, suppliers, append-only ledger | 🟡 | `InventoryItem`/`StockLedgerEntry` (current stock = SUM); `portal/inventory` lists stock against reorder levels, read-only. Items, categories, warehouses and suppliers have no creation screen, and `adjustStock` (which also raises low-stock notifications) has no caller |
| INV-req | Requisitions with IAM-003 approval | 🟡 | `Requisition`/`RequisitionLine`; `submitRequisition` calls `requestApproval()` but has no screen (the "New requisition" button links to `/portal/inventory/requisition/new`, which does not exist) and nothing resolves approvals (IAM-003) |
| INV-po | Purchase orders | 🟡 | `createPurchaseOrder` + `receivePurchaseOrder` (`portal/inventory/po-actions.ts`; receiving writes `StockLedgerEntry` rows) are implemented but no screen calls them |
| INV-asset | Asset assignment tracking | 🟡 | `assignAsset` + `returnAsset` (`AssetAssignment` with `assignedAt`/`returnedAt`, audited) are implemented but no screen calls them |

## §7.12 Health & Safeguarding
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| HLT-record | Student health records, emergency contacts | 🟡 | `HealthRecord` (one-to-one with Student); `portal/health` lists records (allergies, conditions, last incident) for users holding `health.record.read`, which no default role has apart from the Safeguarding Officer. `upsertHealthRecord` has no screen, so records cannot be created or edited |
| HLT-incident | Health incidents | 🟡 | `HealthIncident`; `reportHealthIncident` is implemented but no screen calls it |
| SAF-case | Safeguarding cases (OPEN/UNDER_REVIEW/CLOSED), append-only notes | 🟡 | `SafeguardingCase`/`SafeguardingNote`; `portal/safeguarding` lists open and closed cases. `openSafeguardingCase`/`addSafeguardingNote`/`closeSafeguardingCase` have no screen, and each case links to `/portal/safeguarding/[id]`, which does not exist |
| SAF-access | Permissions never in default roles; UI hidden if no permission | ✅ | `health.record.*`/`safeguarding.case.*` deliberately excluded from `campusAdminRole` and `teacherRole`; pages redirect if no permission; verified via E2E test |

Critical constraint verified: campus admin and teacher cannot access Health or
Safeguarding. Dedicated `safeguardingOfficerRole` seeded for demo.

## §9 Dashboards / UX
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| UX (Table 27) | Role-aware dashboards | ✅ | Platform/staff/guardian ✅; Finance (`FinanceDashboard`) ✅; Admissions (`AdmissionsDashboard`) ✅; role-gated routing in `portal/page.tsx` |
| UX-001 | Dashboards respect scope + freshness | ✅ | All dashboards use scoped queries via `allowedCampusIds()` |
| UX-003 | Tenant-scoped, permission-filtered global search | ✅ | `portal/search/actions.ts::globalSearch()` campus-scoped via `canAnywhere`+`allowedCampusIds`; search input in topbar (`PortalShell`); results page at `portal/search` with student/staff/applicant type badges |
| UX-006 | Effective campus context visible + switcher | ✅ | CampusSwitcher in topbar POSTs to `portal/campus-switch`; `preferredCampusId()` reads cookie; `resolveCampusId()` now wired into library, HR, transport, inventory, health, safeguarding pages to default to preferred campus |

## §10 Branch/campus (BRN)
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| BRN-001..005 | Campus lifecycle: ACTIVE → SUSPENDED → CLOSED with dependency guards | ✅ | `portal/campuses/actions.ts` — `activateCampus`/`suspendCampus`/`closeCampus`; `closeCampus` guards against active enrollments; all require `campus.write`, audited |
| BRN-006 | Inter-campus student transfer | ✅ | `transferStudent` action in `portal/students/actions.ts`; UI on student detail page; `$transaction` closes source enrollment + opens TRANSFERRED_IN on destination campus |
| BRN-007 | Campus merge | ⬜ | Deferred — high risk, low frequency |
| BRN-008 | Campus-scoped RBAC inheritance | ✅ | `canForCampus()` + `campusScopeFor()` throughout |

## §11 Billing (BIL)
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| BIL-001 | Versioned plans/prices/entitlements | ✅ | `Plan`/`Subscription`/`PlanVersion` (effectiveFrom, priceCents, limits JSON) |
| BIL-002 | Server-side entitlement/limit evaluation w/ preview | ✅ | `lib/entitlements.ts::assertWithinLimit()` — wired into enrollment creation (`admissions/actions.ts`); usage vs limit shown on billing page |
| BIL-007 | Customer billing portal | 🟡 | `portal/billing` shows the plan, entitlements and usage against limits (read-only). There is no upgrade or payment flow: plan and subscription changes are made by platform operators |

## §14 Data model / §17 Security
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| §14.1 | Tenant keys, effective dating, append-only audit | ✅ | `schema.prisma` |
| SEC-002 | MFA for privileged roles | 🟡 | TOTP enrolment works at `/portal/settings/security` (`@otplib/preset-default`, QR code, verify, disable; `User.mfaSecret` holds `pending:` until verified). **Nothing in the sign-in flow checks the code**: `loginAction` creates the session straight after the password check, so a user who enrols is still admitted with the password alone, and MFA is not enforced for privileged roles either |
| SEC-003 | Password policy, session expiry, login rate limiting | ✅ | bcrypt + session expiry ✅; `lib/login-rate-limit.ts` (10 attempts / 15 min per email+IP, in-memory) ✅; HaveIBeenPwned k-Anonymity breach check on login (`lib/hibp.ts`) + amber warning banner in portal + change-password page (`portal/account/password`) ✅; self-service password reset (phase 11): `login/forgot-password` and `login/reset-password`, single-use 1-hour token, same response whether or not the email exists, all sessions invalidated on reset |
| SEC-005 | Immutable audit trails | ✅ | `AuditEvent`, `lib/audit.ts` |

## §15 APIs
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| API-001 | Versioned REST API, JSON over TLS; OpenAPI docs + test environment | ✅ | `/api/v1/*` route handlers; hand-authored spec at `/api/v1/openapi.json` |
| API-002 | Tenant-scoped clients with granular scopes; rotation/revocation takes effect without restart | ✅ | `ApiClient` (keyId + bcrypt secret hash, scopes = curated `PermissionKey` subset); revoke flips `status` and is enforced on next request |
| API-003 | Idempotency on mutating endpoints | ✅ | `lib/api-idempotency.ts` + `Idempotency-Key` header on `POST /students`; verified |
| API-004 | Bounded pagination, filtering, sorting, field selection | ✅ | Cursor pagination + filters ✅; `parseSortParam()` + `applyFields()` in `lib/api-response.ts`; `?sort=field:asc` and `?fields=a,b,c` on `/api/v1/students` and `/api/v1/attendance/sessions` |
| API-005 | Signed, versioned, retryable, observable webhooks | ✅ | `WebhookEndpoint`/`WebhookDelivery` + `lib/webhooks.ts` (HMAC-SHA256 signed); verified |
| API-006 | Rate limits, quotas, abuse controls, correlation IDs, structured audit | ✅ | `lib/api-rate-limit.ts` (120 req/min per client, in-memory — single-process limitation documented); verified |
| API-007 | Backward-incompatible changes use a new version + deprecation window | 🟡 | Routes namespaced `/api/v1/*`; no v2 exists yet, deprecation tooling premature |

## §7.9 Communication / §12 Notifications (NTF)
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| NTF-001 | Central notification service with dedup, quiet hours, channel fallback | ✅ | `lib/notify.ts::notify()` — single entry point; `dedupeKey` enforced |
| NTF-002 | Templates: branding, localization, approved variables, preview, versioning | ✅ | `MessageTemplate` model + `notifyFromTemplate()` in `lib/notify.ts`; CRUD management UI at `portal/notifications/templates` with live `{{variable}}` preview; `saveTemplate`/`deleteTemplate` server actions with audit trail; linked from notifications ops page; localization (phase 14): `MessageTemplate` is unique per `(tenant, code, locale)`, and `notifyFromTemplate()` picks the recipient's language, then the organization's, then English; a user chooses their language at `/portal/preferences` |
| NTF-003 | Delivery records: provider, status, timestamps, retries; searchable | ✅ | `DeliveryAttempt` + `/portal/notifications` ops log; `retryDelivery()` |
| NTF-004 | Non-mandatory preferences managed by user | ✅ | `/portal/preferences` (per-category × EMAIL/SMS opt-out); `SECURITY`/`BILLING` bypass opt-out |
| NTF-005 | In-app inbox + email/SMS/push, pluggable providers | ✅ | `Message` inbox + `lib/notification-providers.ts` (swappable interface) |
| NTF-006 | Digesting/throttling/dedup/escalation | ✅ | Dedup ✅; quiet-hours suppression ✅; daily digest cron at `/api/internal/cron/digest-notifications` (groups unread messages by user, dedupe key per user per day); per-recipient throttle (phase 15): non-urgent email/SMS beyond `notifications.throttleMax` per `notifications.throttleWindowMinutes` is skipped and logged while the in-app message still arrives; `SECURITY`, `BILLING` and urgent notices are exempt |
| NTF-007 | Avoid disclosing sensitive info on insecure channels | ✅ | `dataClassification` on `Message`; `SENSITIVE` classification redacts body on ALL external channels (EMAIL, SMS, PUSH) — generic prompt only; full body stays in-app; enforced in `lib/notify.ts` for every `notify()` call |

## Reporting and communication
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| RPT-001/004 | Governed reports with scope-aware filters; exports | 🟡 | `portal/reports` (Report center): three reports (income and expenses, posted payroll, enrollment by section) with campus and date filters, each as CSV, XLSX or a print view (`api/portal/reports`, `lib/reports.ts`, `reports/print`). Fee reports live at `portal/fees/reports`. No wider report catalog, metric registry, PDF generation, scheduled reports or asynchronous export jobs |
| COM-004 | Calendar and events | 🟡 | `portal/calendar`: create events (campus, staff or guardians audience) and list upcoming ones for the first campus in scope. No notices, newsletters, forms, surveys or consent requests |
| COM-001/005 | Announcements, emergency broadcast | ⬜ | `portal/messages` is a read-only inbox; there is no composer, group send or emergency broadcast screen. (`notify()` already supports an `urgent` flag that bypasses quiet hours and throttling.) |
| OPS | Certificates & ID cards, hostel, operational finance ledger | ✅ | `portal/certificates` (bonafide, school-leaving and character certificates with unique numbers and a print page, ID cards per academic year, issue log, edit/delete); `portal/hostel` (hostels with gender policy, rooms with capacity, bed assignment that refuses a full room); `portal/finance` (cash/bank/petty-cash/gateway accounts, income and expense categories, designated funds, transactions, balances and fund utilization) |

## Automated tests
| Layer | Status | Where |
| --- | --- | --- |
| Unit (Vitest) | ✅ | `tests/unit/` — 11 files, 84 tests: money, permissions/RBAC, platform access, exams, timetable, reports and workbook export, translations, recruitment stage rules, gateway signature verification |
| Integration (Vitest + Postgres) | ✅ | `tests/integration/` — 6 files, 29 tests: tenant isolation, campus switching, search scoping, audit chain, student merge, payment-webhook processing. Each suite builds throwaway `itest_` tenants and removes them |
| E2E (Playwright) | 🟡 | `tests/e2e/` — 5 specs, 13 tests (login and navigation RBAC, admissions, attendance, billing idempotency, HR leave). Shallow smoke checks; not re-run during the 2026-11-18 audit. Run with `TEST_BASE_URL=http://localhost:<port> npm run test:e2e` |
| Type-check and build | ✅ | `npx tsc --noEmit` is clean and `npm run build` passes (73 pages). The build was failing because of a type error in the demo script `scripts/seed-hmssb1.ts` (it is inside the `tsconfig` include); fixed on 2026-11-18 |

## §7.15 Homeschooling (HOM) / §16 Mobile (MOB)
| HOM-001..015, MOB-001..007 | Family accounts, learning plans, portfolios; native mobile apps | ⬜ | Out of scope for this pass — multi-week standalone undertakings |

---

## Deferred by design

| Gap | Why deferred |
|---|---|
| API-007 deprecation tooling | No v2 exists; premature |
| Provider-specific gateway adapters (Stripe, etc.) | The generic signed webhook exists (phase 13); mapping a specific provider's payload to it needs that provider's credentials |
| CFG-003 generic custom-status/workflow engine | Kept as hardcoded enums; no business case for a generic engine yet |
| BRN-007 campus merge | High risk, low frequency |
| Public careers page for applicants | Recruitment tracking is internal entry only. A public application form would be an unauthenticated write endpoint and needs bot protection and rate limiting first |
| Scheduled-job triggering (digest, document expiry) | The handlers exist and are protected by `CRON_SECRET`; actually calling them is external infrastructure (Vercel Cron, system cron) |
| Real email/SMS/push delivery | `lib/notification-providers.ts` contains console stand-ins behind a swappable interface |
| Portal translation beyond the shell, account, students, attendance, fees and the staff/guardian/finance/admissions dashboards | Those screens are translated into es/fr/pt/ar (RTL for Arabic) and the shell into sw/hi, with English fallback per string. Everything else, the platform dashboard, workflow-stage names and the sw/hi page bodies are untranslated. All translations are machine-drafted and need native review |
| Production migrations | `prisma/migrations` stops at 11 September; later schema changes were applied with `db push`. A fresh baseline migration is needed before a production deployment |
| HOM / MOB native apps, local/offline/hybrid editions, sync, licensing | Out of scope for the web-only pass |

## Reachability gaps (found 2026-11-18)

These are not deferred by design: the logic or the data model is there, but a user
cannot reach it. They are the main remaining work.

**Server actions with no caller (31 of 153).** Each is complete server logic
(permission check, validation, audit) that no screen, form or other code invokes.

| Feature | Actions |
|---|---|
| Safeguarding cases | `openSafeguardingCase`, `addSafeguardingNote`, `closeSafeguardingCase` |
| Health | `upsertHealthRecord`, `reportHealthIncident` |
| Transport trips | `recordTrip` |
| Inventory | `submitRequisition`, `adjustStock`, `createPurchaseOrder`, `receivePurchaseOrder`, `assignAsset`, `returnAsset` |
| Library | `reserveBook`, `fulfillReservation`, `cancelReservation`, `returnBook` (superseded by the barcode return) |
| Bank import and reconciliation | `importBankStatement`, `reconcilePayments` |
| Approvals | `approveRefund` (and `resolveApproval` in `lib/approvals.ts`) |
| Leave and HR | `requestLeave`, `approvLeave` (near-duplicate of `approveLeaveHr`), `initiateSeparation`, `recordPayrollInput` (superseded by payroll runs) |
| Students | `registerStudentDocument`, `bulkReassignSection` |
| Setup | `cloneCampusConfig`, `cloneCampusTemplate` |
| Assessment | `saveCompetencyRatings`, `ensureDefaultCompetencies` |
| Timetable | `addTimetableSlot` |
| Settings | `getCampusSettings` (a getter; not a user-facing gap) |

**Links to pages that do not exist (4).** `/portal/academics/timetable/[id]/slot/new`
(timetable page), `/portal/inventory/requisition/new` (inventory page),
`/portal/safeguarding/[id]` (safeguarding page) and `/portal/transport/trip`
(transport page). They return 404. The "Match manually" label on the bank
reconciliation page is also plain text, not a control.

**Data with no creation path in the app (seed or SQL only).** Academic years, terms,
grade levels and sections (only the unwired clone actions create them); subjects;
grade scales, assessment plans and components; attendance codes; leave types and
balances; departments and positions; rooms; vehicles, routes, stops and route
assignments; inventory items, categories, warehouses and suppliers; library
categories; student fee assignments and discounts; staff loans and advances.
Until screens exist, a school created through the platform console is an empty
shell that someone has to populate by script (the one-off `scripts/populate-campus.ts`
exists for exactly that reason).

**Onboarding and user management.** The provisioning wizard has the defects listed
under TEN-004. A school owner cannot create users or roles; only platform operators can,
from the tenant page.

## Other defects found 2026-11-18

- **Two-factor authentication is not enforced at sign-in** (SEC-002). Enrolment, verification and disabling work, but no login step asks for the code, so enrolling gives a false sense of security. Needs a challenge step between the password check and session creation.
- **Mark import bypasses `saveMarks` rules** (EXM-003): it does not require the plan to be open, and does not restrict a user to the subjects they are assigned to teach.
- **Refund and requisition approvals can be requested but never resolved** (IAM-003), and the provisioning wizard leaves a new school without a role, a visible password or a subscription (TEN-004). Both are described above.
