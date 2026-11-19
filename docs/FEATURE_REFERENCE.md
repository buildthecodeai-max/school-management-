# Scholarum Feature Reference

> **Currency note (2026-11-20).** This reference was written before the completion pass. The
> sections for Attendance, Assessment, Fees, Library, Transport, Inventory, Health and
> safeguarding, Students (bulk actions, documents), Setup and the guardian dashboard describe
> the earlier, thinner behaviour and its "view only" / "no screen" caveats. For what the app
> does now, see [COMPLETION_REPORT.md](COMPLETION_REPORT.md) and the module table in the README.
> Sections on admissions, finance, communication, integrations, platform and account are unchanged.


> **Multi-tenant school management SaaS** · Multi-campus · Role-based access · Next.js 15 · Prisma · PostgreSQL · Subscription-based

Every feature operates within a strict tenant boundary and optional campus scope, with role-based access control (RBAC) enforced on the server.

This reference describes **what a user can do from the screens**. It was rewritten on 2026-11-18 after a check of every screen against the code, and it deliberately leaves out things that exist only as server logic or as data models. For requirement-level status see [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md); for design decisions see [ARCHITECTURE.md](ARCHITECTURE.md).

**Availability labels used below**

| Label | Meaning |
|---|---|
| **Available** | The workflow can be completed from the UI |
| **Partial** | Some of it works; the "Not available" list says what is missing |
| **View only** | The screen lists data, but nothing in the app creates or edits it (today it comes from the demo seed) |

---

## Table of Contents

- [Core Modules](#core-modules)
  - [Dashboard](#dashboard)
  - [Admissions](#admissions)
  - [Students](#students)
  - [Attendance](#attendance)
  - [Academics](#academics)
  - [Assessment & Exams](#assessment--exams)
- [Finance & Administration](#finance--administration)
  - [Fees](#fees)
  - [Operational Finance](#operational-finance)
  - [Human Resources](#human-resources)
  - [Recruitment](#recruitment)
  - [Payroll](#payroll)
- [Student Services](#student-services)
  - [Library](#library)
  - [Certificates & ID Cards](#certificates--id-cards)
  - [Health](#health)
  - [Hostel](#hostel)
  - [Transport](#transport)
- [Communication](#communication)
  - [Messages](#messages)
  - [Notifications](#notifications)
  - [Calendar](#calendar)
- [Operations](#operations)
  - [Reports](#reports)
  - [Inventory](#inventory)
  - [Safeguarding](#safeguarding)
  - [Data Import](#data-import)
- [Platform & Setup](#platform--setup)
  - [Campuses](#campuses)
  - [Setup](#setup)
  - [Settings](#settings)
  - [Integrations](#integrations)
  - [Subscription](#subscription)
  - [Account & Sign-in](#account--sign-in)
  - [Search](#search)
  - [Platform Admin](#platform-admin)
- [Languages](#languages)
- [Roles & Permissions](#roles--permissions)

---

## Core Modules

> **Tenant isolation:** Every record carries a `tenantId`. Campus-scoped users (teachers, campus admins) see only data for their assigned campuses. Org-wide roles see across all campuses in the tenant. A direct link to an out-of-scope record returns a 404 rather than revealing that it exists.

### Dashboard

**Available.** The landing page changes with the user's role.

| Variant | Shown to | Contents |
|---|---|---|
| Staff | Default for school staff | Active enrollments and campus count, registers opened today (submitted vs pending), absences and lates, today's registers, quick links |
| Guardian | A linked guardian without staff-level student access | Per child: attendance (30 days), absences, fee balance, link to the latest published report card; recent notices |
| Finance | Users who can bill fees but not manage students | Outstanding balance, overdue invoices, unmatched bank lines, recent billing runs, links to reconciliation and GL export |
| Admissions | Users who work applications but not attendance | Active applications, awaiting interview, offers out, pipeline by stage, recent applications |
| Platform | Platform operators with no school selected | Tenants (active, trial, suspended), indicative MRR and ARR, subscriptions |

A suspended school is redirected to a notice page.

---

### Admissions

**Available.** Lead-to-enrolled pipeline from first inquiry through enrollment, with a Kanban-style board and conversion statistics.

**Pipeline stages**
- Inquiry → Application → Review → Assessment → Interview → Decision → Offer → Accepted → Enrolled
- Side stages: Waitlisted, Rejected, Withdrawn
- Stage age (days in stage) and source attribution (website, walk-in, referral, staff)

**Capturing applications**
- Public inquiry form at `/apply/<school-slug>` (no login); creates an Inquiry-stage lead
- Staff entry form for walk-ins and referrals

**Working an application**
- Requirements checklist that blocks advancing a stage until required items are done
- Record assessments and schedule interviews
- Versioned offers (issuing needs the decide permission); record the family's response
- Duplicate detection with reasons, shown before proceeding
- Convert an accepted applicant into student + guardian + enrollment + portal account in one transaction (needs the convert permission)
- Delete an application; **re-admit** starts a fresh application for the same applicant

---

### Students

**Partial.**

**Directory**
- Search by name (case-insensitive); results are limited to the user's campus scope
- Admission number, campus, grade and section, roll number, status

**Student profile**
- Profile details; guardians with flags (primary contact, fee payer, pickup, notifications) that can be edited
- Enrollment history; recent attendance (30-day sessions and absences)
- Published report cards
- Fees ledger: invoices and payments, **record a payment**, **request a refund**
- Lifecycle: transfer to another campus, suspend or withdraw an enrollment, mark as alumni, re-enroll (each with a reason, history preserved)
- **Merge duplicate** (organization owners only): enter the duplicate's admission number, review exactly what will move and any blockers, give a reason, confirm. Irreversible; audited

**Bulk actions**
- Grade promotion with a dry-run preview (the form asks for campus, grade, section and academic-year ids)

**Not available:** registering student documents (and therefore expiry reminders), bulk reassignment of sections, a campus filter on the directory.

---

### Attendance

**Partial.** Daily registers per section; teachers open a register, mark each student, submit, and lock it.

**Register workflow**
- Section cards showing today's status: Not started, Draft, Submitted, Locked
- One code per student. The seeded codes are P, A, L, E (categories: present, absent, late, excused, leave, remote)
- Re-submitting the same register updates it rather than duplicating it
- A locked register needs the amend permission to change

**Alerts and reporting**
- Guardians receive an alert when a student is marked with a code that notifies guardians; resubmitting never alerts twice
- Attendance analytics per section: sessions and chronic-absence flags

**Not available:** submitting a leave request (approvals are in [Human Resources](#human-resources)), creating or editing attendance codes.

---

### Academics

**Partial.**

**Structure (view only)**
- Academic years, grades, sections and homeroom teacher by campus. These are not created from any screen today; they come from the seed

**Timetable**
- Create a timetable version and publish it; publishing archives the campus's previously active version and makes the new one active

**Teachers**
- Assign teaching (teacher, subject, section, academic year) and see workload
- Assign a substitute for an absent teacher for a timetable slot on a given date

**Planning**
- Teachers save lesson plans and publish homework; recent lesson plans and upcoming homework are listed

**Not available:** creating years, terms, grades, sections or subjects; adding timetable slots (the "add slot" link on the timetable page leads nowhere, so teacher and room conflict checks cannot be exercised from the UI, and substitutes can only cover slots that already exist); syllabus-coverage tracking.

---

### Assessment & Exams

**Partial.** Marks entry, moderation and report cards for an assessment plan that already exists.

**Marks and results**
- Per-plan marks-entry grid per subject, validated against the maximum, with Absent and Exempt statuses; only the assigned teacher can enter a subject's marks
- A completeness check; **Approve**, **Reopen for edits**, then **Publish**. Publication is blocked until every mark is in
- Weighted calculation, overall result, grade and ranking
- Printable report card per student. Publishing creates an immutable version; corrections republish a new version and supersede the old one. Guardians and students see published cards only

**Exam scheduling**
- Create an exam schedule with rooms and invigilators (room and invigilator conflicts are rejected) and assign seats

**Mark import**
- Upload a CSV into a plan, with preview, row-level validation and skipped invalid rows. It does not yet apply the rules manual entry does (the plan must be open; only the subject's assigned teacher may enter marks)

**Not available:** creating assessment plans, components, subjects and grade scales; competency and conduct ratings.

---

## Finance & Administration

### Fees

**Partial.**

**Fee structures**
- Manage fee heads (with tax rate and a GL account code) and campus fee structures with line items; activate or deactivate a structure

**Billing**
- Preview eligible students and totals, then post invoices. Posting is idempotent per student, structure and period, so re-running a period never double-bills
- Installment plans on a structure generate one invoice per installment

**Invoices and payments**
- Invoice list and detail (status Open, Partial, Paid, Void), printable invoice and payment receipt
- Record payments (cash, bank transfer, card, wallet, cheque, online gateway); payments allocate to the oldest due invoice first; partial and advance payments are handled
- On an invoice: **credit note / adjustment** (reason required), **write off balance**, **payment plan**
- **Request a refund** from the student page (see below)

**Reports and exports**
- Fee reports: outstanding invoices with aging, payments received, credit notes and concessions, student ledger
- GL journal export as CSV, grouped by the fee head's GL account code
- Online payments can also arrive automatically through the [payment-gateway webhook](#integrations)

**Not available:** approving refunds (requests are recorded but no screen resolves them, so a refund never executes), importing bank statements, matching bank lines (the reconciliation page only lists them), assigning a structure or discount to an individual student.

---

### Operational Finance

**Available.** A simple operational ledger, separate from student fees.

- Accounts: cash, bank, petty cash, online gateway
- Income and expense categories; designated funds
- Post an income or expense transaction against an account, category and optional fund
- Account balances and fund collection versus utilization

---

### Human Resources

**Partial.**

**Staff directory**
- Add a staff member (employee number, position, contract type, salary, start date); list staff per campus with position and department

**Leave**
- Pending leave requests with Approve and Decline; the staff member is notified and balances are updated

**Staff attendance**
- Record daily staff attendance per campus

**Separations**
- The Separations tab lists active checklists

**Not available:** creating departments or positions (adding staff and hiring need an existing one), submitting a leave request, starting a separation checklist.

---

### Recruitment

**Available.** Internal opening and applicant tracking under **HR → Recruitment**. Applicants are entered by staff; there is no public careers page.

- **Openings** per campus: title, linked position, vacancies, closing date, description; status Open, On hold, Closed or Filled
- **Applicants**: name, email (one application per email per opening), phone, source, notes, a 1 to 5 rating
- **Pipeline**: Applied → Screening → Interview → Offer, plus Rejected and Withdrawn, with a note and a full history on every move
- **Hire** (Offer stage only; needs both recruitment and HR-staff write rights): creates the person, staff record and employment record in one transaction and marks the opening Filled when all vacancies are taken. Refuses an employee number or email that already belongs to staff
- Needs an existing position to hire into
- Applicant data is included in the tenant data export

---

### Payroll

**Available.** Payroll runs, not a statutory tax engine.

- Calculate a run for a period from active employment records: gross is the salary, less any loan or advance deductions, giving net pay per payslip
- Post a run to lock it; one run per campus and period; amounts in cents; audited

Staff loans and advances have no creation screen, so deductions are normally zero.

---

## Student Services

### Library

**Partial.**

- Search the catalog by title; see availability (available / total copies)
- **Add a book**: title, author, category, ISBN and number of copies; barcodes are generated per copy
- **Issue** a book (copy barcode, borrower user id, loan period in days)
- **Return** by scanning a barcode; a late return adds a flat $5 fine and notifies the borrower
- Active loans with due dates; separate catalog per campus

**Not available:** reservations, renewals, creating categories.

---

### Certificates & ID Cards

**Available.**

- Issue a Bonafide, School Leaving or Character certificate with a unique number (`CERT-…`); edit or delete one
- Printable certificate: school name, campus and logo area, border, watermark, auto-filled student details, Principal and Class Teacher signature blocks, Print / Save as PDF
- Issue or renew a student ID card per academic year; active or revoked status
- Searchable issuance log with issued-by attribution

---

### Health

**View only.** Restricted to users holding the health-record permission.

- Lists students with allergies, conditions and the date of the last incident
- Campus-scoped; no default role has access except the Safeguarding Officer

**Not available:** creating or editing health records, reporting incidents.

---

### Hostel

**Available.**

- Create hostels with a gender policy (any, male, female) and rooms with a capacity
- Assign a student to a bed; a full room or a room on another campus is refused
- Occupancy per room

Access uses the student-write permission (there is no hostel-specific permission). It is not linked to fees.

---

### Transport

**View only.**

- Fleet: registration number, model, capacity, driver
- Routes: stops and the students assigned to each

**Not available:** creating or editing vehicles, routes, stops or assignments, and recording trips (the "Record trip" button leads to a page that does not exist).

---

## Communication

### Messages

**View only.** A personal inbox of notices and alerts (attendance alerts, fee notices, report cards, leave decisions).

**Not available:** composing or sending messages, group announcements, emergency broadcast.

---

### Notifications

**Available.**

- **Delivery log** (for users with the notifications-operate permission): every external delivery attempt with provider, recipient, channel, status, correlation id and failure reason; filter by status; **retry** a failed attempt (the original failure is kept and a new attempt is added)
- **Templates**: create and edit reusable messages with `{{variable}}` placeholders and a live preview; one version per language
- **Preferences** (any signed-in user): per category, choose email and SMS; set quiet hours; choose a language
- Behaviour: the in-app message always arrives; security and billing notices cannot be opted out of; sensitive messages never put their text on an external channel; duplicates are suppressed; non-urgent email and SMS are throttled per recipient (default 10 per hour, adjustable in Settings); a daily digest endpoint exists for a scheduler
- Email, SMS and push are console stand-ins until real providers are plugged in

---

### Calendar

**Partial.**

- Create an event (title, start, end, location, description, audience: campus, staff or guardians)
- Lists upcoming events for the first campus in the user's scope

**Not available:** switching campus on this page, notices, newsletters, forms and surveys.

---

## Operations

### Reports

**Available.**

- **Report center**: income and expenses, posted payroll, and enrollment by section; filter by campus and date range; download CSV or Excel, or open a print view and save as PDF
- Fee reports live under [Fees](#fees)

Only these three reports exist.

---

### Inventory

**View only.**

- Stock per item with the reorder level, and active requisitions

**Not available:** creating items, categories, warehouses or suppliers; adjusting stock; submitting requisitions (the "New requisition" button leads to a page that does not exist); purchase orders; asset assignment.

---

### Safeguarding

**View only.** Confidential case list restricted to designated officers.

- Open and closed cases

**Not available:** opening a case, adding notes, closing a case, or opening a case's detail page (the link leads to a page that does not exist).

---

### Data Import

**Available.**

- **Students (CSV)**: upload or paste, automatic column mapping with manual override, server-side row validation (campus, grade, section, duplicate admission numbers, unknown references), a preview with per-row errors, and an all-or-nothing commit of the valid rows with reconciliation totals
- **Marks (CSV)**: choose an assessment plan, preview, and commit valid rows (invalid rows are skipped)

---

## Platform & Setup

### Campuses

**Available.**

- Create and edit a campus (name, code, city, address)
- Activate, suspend or close a campus; closing is refused while students are actively enrolled
- Totals for students and sections per campus
- A campus switcher in the top bar sets the user's preferred campus

---

### Setup

**Partial.** A launch-readiness checklist of 11 steps: organization profile, campuses, academic calendar, terms, grade levels, sections, subjects, grade scale, fee structures, users and roles, students enrolled. It validates what exists and links to the relevant screens, with a progress meter.

**Not available:** entering the calendar, terms, grade levels, sections, subjects and grade scale from any screen; cloning a campus's configuration to another.

---

### Settings

**Available.**

- **Campus settings**: organization-wide defaults for numbering prefixes (invoice, receipt, admission), fees (late fee, grace period), attendance, library, inventory, exams and notifications, with per-campus overrides and a lock that stops campuses overriding a value; a comparison table across campuses
- **Security**: enroll, verify or disable two-factor authentication (authenticator app with QR code). *Known gap:* the sign-in page does not yet ask for the code, so enrolling does not protect the account today

---

### Integrations

**Available.** Organization owners only. Under `/portal/integrations`:

- **API clients**: create a client with chosen scopes (the secret is shown once), revoke instantly. Authenticate with `Authorization: Bearer <keyId>.<secret>`
- **REST API v1**: list and create students, get a student, list attendance sessions; OpenAPI at `/api/v1/openapi.json`; idempotency keys, rate limiting (120 requests a minute per client), cursor pagination, sorting and field selection
- **Outbound webhooks**: subscribe a URL to `student.enrolled` and `attendance.session.submitted`; signed payloads, delivery log, redeliver
- **Payment gateway (inbound)**: generate a signing secret, enable or disable, see the webhook URL and the last 10 events. Successful payments post a receipt and allocate it to invoices automatically; refunds and disputes are flagged for review and never reversed automatically

---

### Subscription

**View only.** The school's plan, entitlements and usage against limits. Plan and subscription changes are made by platform operators.

---

### Account & Sign-in

**Available.**

- Change password; a banner warns when the password has appeared in a known breach
- **Forgot password** on the sign-in page: emailed one-hour, single-use link; signs out every session when the password changes
- Links to two-factor enrolment (not yet enforced at sign-in), notification preferences and language preference
- Login attempts are rate-limited

---

### Search

**Available.** A search box in the top bar finds students, staff and applicants within the user's campus scope.

---

### Platform Admin

**Available.** For Scholarum operators (platform staff).

**Tenants**
- Registry with status, campuses, users and plan usage
- **Add a school**: creates the school, a campus and an admin user. *Known defects:* the admin is not given a role, the temporary password is not shown, and no subscription is created (see the traceability document)
- Per school: edit organization details and status; manage campuses; create, edit, activate or deactivate users and reset a password; grant or remove a role for the whole school or one campus; "ensure school roles" creates the standard roles; edit an existing subscription; impersonate a user for support (banner shown, audited)
- **Offboarding**: download a full data export, schedule or cancel deletion, then permanently delete (needs the school closed, an export on record and the slug typed)

**Plans**
- Create, edit and delete subscription plans with limits

**Audit log**
- Platform-wide, filterable by tenant, outcome and action

---

## Languages

Seven languages can be selected: English, Spanish, French, Portuguese, Arabic, Swahili and Hindi (a user's own choice, otherwise the school's default). The portal shell, account page, students, attendance, fees and the staff, guardian, finance and admissions dashboards are translated into Spanish, French, Portuguese and Arabic (Arabic switches the layout to right-to-left); the shell and account page are also translated into Swahili and Hindi. Everything else shows in English. Notification templates can have one version per language. The translations are machine-drafted and need review by a native speaker.

---

## Roles & Permissions

> Permissions are evaluated in order: **suspension check → org-wide wildcard → org-wide named permission → campus-level wildcard → campus-level named permission.** A suspended tenant blocks all non-platform actions regardless of role.

There are 80 permission keys in groups: Platform, Organization, Admissions, People, Academics, Assessment & exams, Fees & finance, Attendance & leave, Timetable, Communication, Billing, Audit, HR, Library, Transport, Inventory, and Health & Safeguarding (restricted). Roles are bundles of those keys assigned at platform, organization or campus scope.

| Role | Scope | Access summary |
|---|---|---|
| **Platform Operator** | Cross-tenant | Tenants, plans, audit logs, impersonation, offboarding. Cannot be scoped to one tenant. |
| **Organization Owner** | Tenant-wide | Every permission (`*`) across all campuses, including integrations and duplicate-student merge, which are organization-wide only. |
| **Campus Administrator** | Assigned campuses | Everything except billing, health and safeguarding: admissions (including convert), students, attendance, academics, exams, fees (including adjustments and refunds), HR, library, transport, inventory, notifications. |
| **Admissions Officer** | Assigned campuses | Applications and pipeline stages; read access to students and guardians. Cannot convert applicants, or reach finance or HR. |
| **Finance Officer** | Assigned campuses | Fee structures, billing, payment recording; read access to students. Cannot adjust or refund (a separate permission). |
| **Teacher** | Assigned campuses | Attendance for their sections, student read access, timetable read, exam mark entry for assigned subjects. |
| **Parent / Guardian** | Linked students only | The guardian dashboard for their children (attendance, fee balance, published report cards) and their messages. |
| **Safeguarding Officer** (demo seed) | Assigned campus | Health records and safeguarding cases only. |

The standard roles above are created for a school by a platform operator ("ensure school roles"); there is no screen for a school owner to create users or edit roles yet.

---

*Scholarum — One governed platform for every campus.*
