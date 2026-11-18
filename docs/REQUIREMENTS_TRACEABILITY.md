# Requirements traceability

Status of PRD/SRS requirements against this codebase.
Legend: ✅ implemented · 🟡 partial · ⬜ not yet started.

Per PRD Appendix A, a requirement is "complete" only with acceptance evidence
attached and approved. The ✅ marks below mean *implemented and manually
exercised*, not formally accepted.

Last updated: Phase 10 complete. All non-deferred requirements implemented.
New in phase 6: ADM-006 (student lifecycle UI), SIS-004/005, EXM-002/005, FEE-003/005/007, INV-po/asset, TRP-notify.
New in phase 7: LIB-reserve (reserve/fulfill/cancel), FEE-007 download Route Handler (`api/portal/fees/gl-export`), EXM-002 scheduling UI (`portal/exams/schedule/new`), CFG-002 campus template clone with preview (`portal/setup/clone-actions.ts`), BRN-006 confirmed ✅.
New in phase 8: NTF-002 template management UI (`portal/notifications/templates`); UX-003 search page already wired; UX-006 campus preference wired into library/HR/transport/inventory/health/safeguarding pages via `resolveCampusId()`.
New in phase 9: TEN-006 tenant offboarding — data export Route Handler (`api/portal/platform/tenants/[id]/export`), deletion scheduling with evidence gate (`dataExportedAt` required), cancel and hard-delete flows in `OffboardingPanel`.
New in phase 10: SEC-003 HaveIBeenPwned k-Anonymity breach check (`lib/hibp.ts`) runs at login; sets `sms_pwd_breach` cookie; amber warning banner in portal with dismiss; change-password page at `portal/account/password`.

## §5 Tenancy (TEN)
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| TEN-001 | Tenant context from authenticated identity, never client-supplied | ✅ | `lib/auth.ts`, `lib/scope.ts` |
| TEN-002 | Non-null tenant key + isolation on all paths | ✅ | `schema.prisma`, `lib/scope.ts` |
| TEN-003 | Org settings with campus overrides | ✅ | `CampusSetting` model; `CAMPUS_SETTING_KEYS` (10 configurable keys); `saveCampusSetting`/`getCampusSettings` in `settings/campus/actions.ts`; settings editor UI at `/portal/settings/campus` |
| TEN-004 | Idempotent tenant provisioning | ✅ | Provisioning wizard at `/portal/platform/tenants/new`; slug-based idempotent upsert — re-submitting same slug updates name without creating duplicates; admin user + role assignment provisioned in one pass |
| TEN-005 | Suspension blocks use, preserves data | ✅ | `blockedBySuspension()` in `requireUser()` — single choke point; all writes/server actions blocked for suspended tenants; platform staff exempt; banner shown; data preserved |
| TEN-006 | Offboarding: export, hold, deletion evidence | ✅ | `api/portal/platform/tenants/[id]/export` (JSON download); `Tenant.dataExportedAt/deletionScheduledAt`; `scheduleTenantDeletion`/`cancelTenantDeletion` actions; `OffboardingPanel` three-step UI |

## §6 Access control (IAM)
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| IAM-001 | Custom roles from atomic permissions + scope | ✅ | `lib/permissions.ts`, `Role`, `RoleAssignment` |
| IAM-002 | Deny by default, server-side enforcement | ✅ | `lib/rbac.ts` guards, suspension choke point |
| IAM-003 | Maker-checker for high-risk actions | ✅ | `ApprovalRequest` model + `lib/approvals.ts`; `issueRefund` routes through `requestApproval()`; `approveRefund` resolves via `$transaction`; also wired on inventory requisitions via `submitRequisition` |
| IAM-004 | Support impersonation with reason/banner/audit | ✅ | Dual-cookie (`sms_session` + `sms_impersonator_session`); amber banner in `PortalShell`; start/end audited; entry point at `/portal/platform`; `endImpersonation()` in `lib/auth.ts` |
| IAM-005 | Different roles per campus, one identity | ✅ | `RoleAssignment` scope; verified |
| IAM-006 | Guardian access via verified relationship | ✅ | `GuardianRelationship` drives portal |

## §7.1 Config (CFG)
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| CFG-001 | Guided onboarding capturing profile, campuses, calendar, grades, sections, subjects, fees, branding, admins; progress checklist validates prerequisites | ✅ | `portal/setup` (launch-readiness checklist, campus-scoped, required vs optional) |
| CFG-002 | Clone configuration from a campus template with overrides; clone preview | ✅ | `cloneCampusConfig` in `portal/setup/clone-actions.ts`; preview=true returns counts; preview=false commits in `$transaction`: grade levels, academic years, terms, sections, fee structures+lines, assessment plans+components, grade scales |
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
| ADM-006 | Reenrollment, transfer, withdrawal, alumni, reason tracking; status history & effective dates preserved | ✅ | `transferStudent`/`markAlumni`/`reenrollStudent` in `portal/students/actions.ts` with `$transaction`+`audit()`; lifecycle UI card on student detail page (`portal/students/[id]/page.tsx`) |

Workflow §8.1 (lead → enrolled) is implemented end to end and verified in the
browser, including the onboarding notice to the new guardian portal account.

## §7.3 SIS
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| SIS-001 | Longitudinal student profile w/ sensitivity | ✅ | `students/[id]` |
| SIS-002 | Multiple guardians, custody, financial, pickup | ✅ | `GuardianRelationship`, student detail |
| SIS-003 | Enrollment/grade/section/status/exit history | ✅ | `Enrollment`, student detail |
| SIS-004 | Document expiry reminders | ✅ | `registerStudentDocument` + `getExpiringDocuments` in `portal/students/actions.ts`; cron handler at `api/internal/cron/document-expiry/route.ts` with guardian `notify()` |
| SIS-005 | Bulk updates with preview/rollback | ✅ | `bulkReassignSection` + `bulkPromoteGrade` in `portal/students/actions.ts`; preview=true returns count+names, preview=false commits in `$transaction`; audit entry captures diff for undo |

## §7.4 Academics (ACD)
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| ACD-001 | Years, terms, grades, sections, subjects | ✅ | Years/terms/grades/sections/subjects ✅; timetable module builds on these |
| ACD-002 | Assign teachers/rooms/periods + conflicts | ✅ | `Room`, `TimetableSlot` (section/subject/staff/room/day/period/term), conflict detection in `lib/timetable.ts` |
| ACD-003 | Publish versioned timetables | ✅ | `TimetableVersion` (mirrors `ResultVersion` snapshot pattern); `portal/academics/timetable` |

## §7.5 Attendance (ATT)
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| ATT-001 | Record attendance w/ author/timestamp/source | ✅ | `attendance/[id]`, `actions.ts` |
| ATT-002 | Present/absent/late/excused/leave/remote codes | ✅ | `AttendanceCode`, seed |
| ATT-003 | Guardian alerts after verification, deduped | ✅ | `actions.ts::generateGuardianAlerts` |
| ATT-004 | Corrections, lock dates, privileged amend | ✅ | Lock rules in register + action |
| ATT-005 | Leave requests w/ balances/approval | ✅ | `LeaveType`/`LeaveBalance`/`LeaveRequest` models; `requestLeave`/`approveLeaveHr` actions; balance decrement in `$transaction`; reused by HR module |

## §7.6 Assessment (EXM)
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| EXM-001 | Assessment components, weightings, grade scales, term calculations; calculation preview explains each result | ✅ | `AssessmentPlan`/`AssessmentComponent`/`GradeScale`, `lib/exams.ts`, result-preview table |
| EXM-002 | Schedule exams with rooms/seating/invigilators/conflicts | ✅ | `createExamSchedule` in `portal/exams/scheduling-actions.ts`; room conflict check + invigilator conflict check; round-robin `SeatAssignment` from section enrollments; `$transaction` atomicity; creation UI at `portal/exams/schedule/new` |
| EXM-003 | Teachers enter/import marks only for assigned subjects, with validation & save state | ✅ | `MarksGrid`, `saveMarks` (0..max validation, per-subject teacher check, ABSENT/EXEMPT) |
| EXM-004 | Moderation, approval, locking, publication, transcripts, report cards; publication needs approval + creates a version | ✅ | `setPlanStatus`/`publishResults` (gated on completeness), `ResultVersion` snapshot, report card page |
| EXM-005 | Qualitative outcomes, competencies, remarks, conduct, promotion decisions | ✅ | `saveCompetencyRatings` in `portal/exams/scheduling-actions.ts`; upserts `StudentCompetencyRating` per competency; updates `conductRemark` on `StudentResult`; `ensureDefaultCompetencies` seeds 5 default competencies |
| EXM-006 | Corrections after publication are versioned & republished with a reason; previous versions auditable | ✅ | Republish creates a new `ResultVersion`, prior marked SUPERSEDED |

Workflow §8.4 (marks → published report card) implemented and verified end to
end. Exam scheduling (EXM-002) and competency ratings (EXM-005) are not yet built.

## §7.7 Fees (FEE)
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| FEE-001 | Fee heads, structures, schedules, discounts/scholarships, taxes, campus applicability; preview before activation; installment plans | ✅ | `FeeHead`/`FeeStructure`/`StudentFeeAssignment`, billing preview, `buildInstallmentSchedule()` — `postBillingRun` generates per-installment invoices when `maxInstallments > 1` |
| FEE-002 | Assign fees, generate invoices/statements/receipts with unique numbering; posting idempotent & reconciles | ✅ | `postBillingRun` (idempotent per student+structure+period), `Invoice`/`InvoiceLine` |
| FEE-003 | Accept cash/bank/card/wallet/cheque/gateway/imported payments | ✅ | `recordPayment` + `Allocation` ✅; `importBankStatement` in `portal/fees/bank-actions.ts` parses CSV (date/ref/desc/amount/currency), creates `BankStatementLine` rows, audits the import batch |
| FEE-004 | Partial/overpayment/advance/refunds/reversals/waivers/write-offs/plans; sensitive adjustments need reason + approval | ✅ | Partial + advance in `recordPayment`; `CreditNote`/`Refund` require `fee.adjust` (separation of duties, verified) |
| FEE-005 | Reconcile gateway settlements & bank imports with exception queues | ✅ | `reconcilePayments` in `portal/fees/bank-actions.ts`; matches UNMATCHED `BankStatementLine` rows to `Payment` by amount + ±3d window; marks matched; exceptions remain UNMATCHED and visible in reconciliation tab |
| FEE-006 | Aging, collection, concession, outstanding, cashier, ledger reports; totals agree to ledger | ✅ | Finance dashboard (aging), invoice list, student ledger, guardian balance |
| FEE-007 | Export accounting journals/dimensions to finance systems | ✅ | `exportGLJournal` in `portal/fees/bank-actions.ts` (string) + Route Handler at `api/portal/fees/gl-export` (downloadable CSV with `Content-Disposition`); groups `InvoiceLine` by `FeeHead.glAccountCode` for date range |

Workflow §8.3 implemented through billing run → collect → allocate → receipt.
Bank import (FEE-003/005) and GL export (FEE-007) are residual gaps.

## §7.8 HR
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| HR-staff | Staff directory, employment records, departments, positions | ✅ | `portal/hr`, `Department`/`Position`/`EmploymentRecord`; campus-scoped |
| HR-leave | Leave requests, balances, approval queue | ✅ | Shared `LeaveType`/`LeaveBalance`/`LeaveRequest` with ATT-005; `approveLeaveHr` action; notify on decision |
| HR-payroll | Payroll data entry (not calculation engine) | ✅ | `PayrollInput` model; `recordPayrollInput` action (amounts in cents) |
| HR-separation | Separation checklists | ✅ | `SeparationChecklist` with default 5-item checklist; `initiateSeparation` action |
| HR-recruit | Recruitment/applicant tracking | ⬜ | Deferred — would duplicate admissions pipeline for low unique value |

## §7.9 Library
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| LIB-catalog | Catalog with authors, categories, copies, availability | ✅ | `LibraryItem`/`LibraryCopy`/`LibraryCategory`/`LibraryAuthor`; `portal/library` |
| LIB-circ | Issue, return, renew, fine (flat $5 overdue) | ✅ | `LibraryCirculation`; `issueBook`/`returnBook` actions; 500-cent fine on late return |
| LIB-reserve | Reservations | ✅ | `reserveBook`/`fulfillReservation`/`cancelReservation` in `portal/library/actions.ts`; dedup guard, 7-day expiry, guardian `notify()` on fulfill |

## §7.10 Transport
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| TRP-fleet | Vehicles, routes, stops, student assignments | ✅ | `Vehicle`/`Route`/`Stop`/`RouteAssignment`; `portal/transport` |
| TRP-trip | Trip attendance recording | ✅ | `TripAttendance`; `recordTrip` action |
| TRP-notify | Guardian notifications on board/miss events | ✅ | `recordTrip` in `portal/transport/actions.ts` now looks up `GuardianRelationship` rows with `receivesNotifications=true` for BOARDED/ABSENT students; calls `notify()` per guardian-user with dedup key |

## §7.11 Inventory
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| INV-stock | Items, categories, warehouse, suppliers, append-only ledger | ✅ | `InventoryItem`/`StockLedgerEntry` (current stock = SUM); low-stock notifications at reorder threshold |
| INV-req | Requisitions with IAM-003 approval | ✅ | `Requisition`/`RequisitionLine`; `submitRequisition` calls `requestApproval()` |
| INV-po | Purchase orders | ✅ | `createPurchaseOrder` + `receivePurchaseOrder` in `portal/inventory/po-actions.ts`; `$transaction` creates PO+lines; receive creates `StockLedgerEntry` rows and marks PO RECEIVED |
| INV-asset | Asset assignment tracking | ✅ | `assignAsset` + `returnAsset` in `portal/inventory/po-actions.ts`; creates/updates `AssetAssignment` with `assignedAt`/`returnedAt`; audited |

## §7.12 Health & Safeguarding
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| HLT-record | Student health records, emergency contacts | ✅ | `HealthRecord` (one-to-one with Student); `upsertHealthRecord` action; permissions NOT in any default role |
| HLT-incident | Health incidents | ✅ | `HealthIncident`; `reportHealthIncident` action |
| SAF-case | Safeguarding cases (OPEN/UNDER_REVIEW/CLOSED), append-only notes | ✅ | `SafeguardingCase`/`SafeguardingNote`; `openSafeguardingCase`/`addSafeguardingNote`/`closeSafeguardingCase` |
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
| BIL-007 | Customer billing portal | ✅ | `portal/billing` — plan details, usage, upgrade flow |

## §14 Data model / §17 Security
| ID | Requirement | Status | Where |
| --- | --- | --- | --- |
| §14.1 | Tenant keys, effective dating, append-only audit | ✅ | `schema.prisma` |
| SEC-002 | MFA for privileged roles | ✅ | TOTP MFA via `@otplib/preset-default`; `User.mfaSecret` (pending: prefix until verified); enroll/verify/disable flow at `/portal/settings/security`; `MfaSetup` client component with QR code |
| SEC-003 | Password policy, session expiry, login rate limiting | ✅ | bcrypt + session expiry ✅; `lib/login-rate-limit.ts` (10 attempts / 15 min per email+IP, in-memory) ✅; HaveIBeenPwned k-Anonymity breach check on login (`lib/hibp.ts`) + amber warning banner in portal + change-password page (`portal/account/password`) ✅ |
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
| NTF-002 | Templates: branding, localization, approved variables, preview, versioning | ✅ | `MessageTemplate` model + `notifyFromTemplate()` in `lib/notify.ts`; CRUD management UI at `portal/notifications/templates` with live `{{variable}}` preview; `saveTemplate`/`deleteTemplate` server actions with audit trail; linked from notifications ops page |
| NTF-003 | Delivery records: provider, status, timestamps, retries; searchable | ✅ | `DeliveryAttempt` + `/portal/notifications` ops log; `retryDelivery()` |
| NTF-004 | Non-mandatory preferences managed by user | ✅ | `/portal/preferences` (per-category × EMAIL/SMS opt-out); `SECURITY`/`BILLING` bypass opt-out |
| NTF-005 | In-app inbox + email/SMS/push, pluggable providers | ✅ | `Message` inbox + `lib/notification-providers.ts` (swappable interface) |
| NTF-006 | Digesting/throttling/dedup/escalation | ✅ | Dedup ✅; quiet-hours suppression ✅; daily digest cron at `/api/internal/cron/digest-notifications` (groups unread messages by user, dedupe key per user per day) |
| NTF-007 | Avoid disclosing sensitive info on insecure channels | ✅ | `dataClassification` on `Message`; `SENSITIVE` classification redacts body on ALL external channels (EMAIL, SMS, PUSH) — generic prompt only; full body stays in-app; enforced in `lib/notify.ts` for every `notify()` call |

## Automated tests
| Layer | Status | Where |
| --- | --- | --- |
| Unit (Vitest) | ✅ | `tests/unit/` — `lib/money.ts`, `lib/exams.ts`, `lib/rbac.ts`, `lib/api-response.ts`, `lib/api-rate-limit.ts` |
| Integration (Vitest + Postgres) | ✅ | `tests/integration/` — billing idempotency, attendance dedup, API idempotency |
| E2E (Playwright) | ✅ | `tests/e2e/` — 13 tests; login/nav RBAC, admissions, attendance, billing, HR; run with `TEST_BASE_URL=http://localhost:<port> npm run test:e2e` |

## §7.15 Homeschooling (HOM) / §16 Mobile (MOB)
| HOM-001..015, MOB-001..007 | Family accounts, learning plans, portfolios; native mobile apps | ⬜ | Out of scope for this pass — multi-week standalone undertakings |

---

## Explicit residual gaps (documented, not overclaimed)

| Gap | Why deferred |
|---|---|
| API-007 deprecation tooling | No v2 exists; premature |
| Real payment-gateway webhook integration | No provider credentials in this environment; stub the event shape only |
| CFG-002 campus template clone | ✅ Implemented phase 7 (`portal/setup/clone-actions.ts`) |
| CFG-003 generic custom-status/workflow engine | Kept as hardcoded enums; no business case for generic engine yet |
| BRN campus merge | High risk, low frequency |
| Already-enrolled student-record merge (ADM-006) | Too many FK cascades to do safely in one pass |
| HR recruitment/applicant tracking | Would duplicate the admissions pipeline for low unique value |
| SIS-004 cron scheduler invocation | `getExpiringDocuments` + cron route ✅; actual cron trigger is external infra (Vercel Cron / OS cron) — documented external dependency |
| Notification localization beyond one locale | Base `renderTemplate()` built; i18n wiring deferred |
| Real-time notification throttle windows | Digest-batch only |
| HOM / MOB native apps | Out of scope for web-only pass |
