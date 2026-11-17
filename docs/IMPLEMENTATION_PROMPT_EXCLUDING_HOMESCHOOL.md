# School Management SaaS Completion Prompt Excluding Homeschooling

Use this prompt to continue development of the Scholarum application. Homeschooling is explicitly outside the scope of this task.

```text
Act as a senior SaaS architect, full-stack engineer, security engineer and QA lead working directly in this repository:

/Users/mac/school software

Use this PRD/SRS as the authoritative product specification:

/Users/mac/Desktop/Commercial_SaaS_School_Management_Software_Hybrid_Homeschool_PRD_SRS.docx

Use this audit as the current conservative implementation assessment:

/Users/mac/school software/docs/PRD_IMPLEMENTATION_AUDIT_AND_PROMPT.md

OBJECTIVE

Audit, repair and complete the school-management platform according to the PRD/SRS, with the explicit scope exclusion below. Existing implementation claims are not proof. Verify every feature from its user interface or API through authorization, business logic and database persistence.

EXPLICIT SCOPE EXCLUSION

Do not implement, modify, scaffold or plan the HOM Homeschooling module in this task.

Exclude all requirements HOM-001 through HOM-015, including:
- Family learning accounts
- Personalized home learning plans
- Homeschool curricula
- Homeschool schedules and instructional-time tracking
- Learner portfolios
- Homeschool assessments and compliance reports
- Homeschool provider case management
- Cooperative classes
- Concurrent home/provider/campus enrollment behavior
- Homeschool learner self-service
- Offline homeschool learning packs
- Homeschool-specific consent and regulatory packs

The presence of homeschooling requirements in the source document must not cause them to enter the backlog, database schema, navigation, UI, API, tests or completion calculation. Clearly report them as “Excluded by user request,” not “Missing” or “Completed.” Do not let their exclusion block completion of the remaining product scope.

IN-SCOPE REQUIREMENT GROUPS

Complete and verify all applicable non-HOM requirements:

- TEN: tenant isolation and tenant lifecycle
- IAM: identity, roles, permissions and scoped access
- CFG: configuration, onboarding and imports
- ADM: admissions and enrollment
- SIS: student information
- ACD: academics, curriculum and timetables
- ATT: attendance and leave
- EXM: examinations, grading and report cards
- FEE: school fees and finance operations
- HRM: human resources and staff administration
- COM: communications and content
- LIB: library
- TRN: transport
- INV: inventory, procurement and assets
- HSD: health, safeguarding and discipline
- POR: portals and service requests
- UX: dashboards and user experience
- BRN: branches and campuses
- BIL: commercial SaaS billing and subscriptions
- NTF: notifications
- RPT: reporting, analytics and exports
- API: public APIs, credentials and webhooks
- DEP: cloud and local deployment
- SYN: hybrid synchronization
- LIC: local deployment licensing
- MOB: native mobile applications
- SEC: security, privacy, compliance and audit
- NFR: non-functional requirements

FIRST PRIORITY

Before adding features:

1. Inspect git status and preserve every existing user change.
2. Run the unit tests and production build.
3. Diagnose and fix the known production-build failures involving:
   - /api/internal/cron/document-expiry
   - /portal/academics/timetable/new
   - /api/v1/attendance/sessions
4. Rerun the full production build and tests.
5. Repair global search so it is reachable from the UI and correctly supports campus-scoped users.
6. Repair campus switching so the selected authorized campus affects queries and persists safely through navigation.

IMPLEMENTATION METHOD

Work in bounded vertical slices. Select one requirement or one tightly connected end-to-end workflow at a time. Prioritize in this order:

1. Broken existing Must workflows
2. Security and tenant-isolation defects
3. Partially implemented Must requirements
4. Missing Must requirements
5. Should requirements
6. Could requirements

For every selected requirement:

1. Read the exact requirement and acceptance summary in the PRD/SRS.
2. Inspect existing schema, routes, pages, components, server actions, APIs, permission catalog, tenant/campus scoping, audit service and tests.
3. Classify the current state as Implemented, Partial, Not implemented or Excluded.
4. Write a short implementation plan identifying affected files and risks.
5. Implement a reachable production workflow. Do not count a page shell, model, helper, seed-only example, hard-coded response or disabled control as implementation.
6. Add server-side validation and deny-by-default authorization.
7. Apply authenticated tenant context and authorized campus scope to every read and write.
8. Add audit records for sensitive, financial, academic, configuration, export and support actions.
9. Use database transactions and idempotency where duplicate or partial execution could cause harm.
10. Add unit, database integration and Playwright tests appropriate to the risk.
11. Include negative tests for unauthorized roles, cross-campus access and cross-tenant access.
12. Run relevant tests and the production build before marking the requirement implemented.
13. Update traceability only after acceptance evidence exists.

DEFINITION OF IMPLEMENTED

A requirement is Implemented only when all applicable conditions are satisfied:

- The workflow is reachable through an authorized UI or documented API.
- Required data persists in PostgreSQL through Prisma.
- Server-side permission checks exist.
- Tenant and campus isolation are enforced.
- Inputs and state transitions are validated.
- Errors are safe, understandable and do not leak protected data.
- Sensitive changes are audited.
- Financial and other replay-sensitive writes are idempotent where required.
- Automated tests cover the main success path and critical denial/failure paths.
- The production build passes.
- The PRD acceptance summary is demonstrated with evidence.

If any required condition is missing, mark the requirement Partial rather than Implemented.

MANDATORY ARCHITECTURE AND SECURITY RULES

- Resolve tenant context from the authenticated server-side identity. Never authorize access from a client-supplied tenantId.
- Apply tenantId to every tenant-owned entity and database query.
- Apply campus scope wherever the record or action is campus-specific.
- Return a safe 404 or equivalent where revealing an out-of-scope record would disclose its existence.
- Enforce authorization in server actions, route handlers and APIs. Hidden navigation is not authorization.
- Use least privilege and deny by default.
- Require appropriate approval or separation of duties for refunds, large adjustments, publication and destructive bulk operations.
- Use integer minor currency units. Do not use floating-point arithmetic for money.
- Use transactions and idempotency for enrollment conversion, billing, payments, refunds, publication, imports and synchronization-sensitive writes.
- Preserve immutable or append-only history for audit events, financial events and published academic results.
- Never mix tenant school-fee accounting with platform commercial subscription billing.
- Protect child, health, safeguarding, custody and financial information with explicit permissions and safe exports.
- Do not expose secrets, session tokens, API credentials or sensitive data in logs or client responses.
- Do not claim responsive web pages are native iOS or Android applications.
- Do not claim SaaS plan entitlements are signed offline licences.
- Do not claim local/offline/hybrid support without an implemented, tested deployment and synchronization path.
- Do not mark security, availability, performance, recovery, accessibility or other NFR requirements complete without measurable evidence.

TESTING REQUIREMENTS

At minimum, maintain or add tests for:

- Cross-tenant isolation for reads, writes, searches, exports, jobs and files
- Campus-scoped role behavior
- Direct URL and direct API authorization denial
- Admissions conversion transactionality and replay safety
- Attendance locking, correction and notification deduplication
- Examination mark validation, approval and immutable report-card versions
- Fee billing idempotency, allocation, adjustments and reconciliation
- Guardian relationship and custody restrictions
- Sensitive health and safeguarding access
- Commercial entitlement enforcement on both UI-backed actions and APIs
- API authentication, scopes, idempotency, pagination, rate limits and webhook signatures
- Import validation, reconciliation and rollback behavior
- Suspension and tenant lifecycle behavior
- Production build completion

TRACEABILITY

Maintain a conservative requirements matrix. For every audited requirement, record:

Requirement ID | Priority | Status | UI/API path | Data model | Server authorization | Tenant/campus scope | Automated tests | Acceptance evidence | Remaining gap

Use only these statuses:

- Implemented: complete end-to-end behavior with passing acceptance evidence
- Partial: useful implementation exists but at least one required condition is missing
- Not implemented: no meaningful end-to-end implementation exists
- Excluded by user request: only for HOM-001 through HOM-015

Do not use percentages based only on file or model presence. Provide separate completion counts for Must, Should and Could requirements, excluding HOM-001 through HOM-015 from both numerator and denominator.

DELIVERY EXPECTATIONS

At the end of each vertical slice, report:

1. Requirement IDs addressed
2. Previous and new status
3. User-visible behavior delivered
4. Schema or migration changes
5. Authorization and isolation controls
6. Tests added or changed
7. Commands run and exact results
8. Manual verification instructions
9. Known limitations and remaining acceptance gaps
10. The next highest-priority non-HOM requirement

Do not stop after analysis when a safe, bounded implementation step remains. Do not broaden work into the excluded HOM module. Do not mark the whole application complete until every in-scope Must requirement has acceptance evidence and the full test and production-build gates pass.
```
