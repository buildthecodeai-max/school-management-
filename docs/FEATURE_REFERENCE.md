# Scholarum Feature Reference

> **Multi-tenant school management SaaS** · Multi-campus · Role-based access · Next.js 15 · Prisma · PostgreSQL · Subscription-based

Every feature operates within a strict tenant boundary and optional campus scope, with role-based access control (RBAC) enforced at every data layer.

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
  - [Finance (GL)](#finance-gl)
  - [Human Resources](#human-resources)
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
  - [Integrations](#integrations)
  - [Platform Admin](#platform-admin)
- [Roles & Permissions](#roles--permissions)

---

## Core Modules

> **Tenant isolation:** Every record carries a `tenantId`. Campus-scoped users (teachers, campus admins) see only data for their assigned campuses. Org-wide roles see across all campuses in the tenant.

### Dashboard

Role-tailored landing page showing live enrollment counts, today's attendance status, absence alerts, and quick-action shortcuts scoped to the user's campus access.

**Overview tiles**
- Active enrollment count across campuses
- Registers opened today (submitted vs. pending)
- Absences & late arrivals requiring action
- Campus count for org-wide roles

**Quick actions**
- View students shortcut
- Attendance shortcut
- Academics shortcut
- Campuses shortcut

**Role variants**
- Staff dashboard (attendance focus)
- Guardian dashboard (child's updates)
- Platform dashboard (tenant health)

---

### Admissions

Lead-to-enrolled pipeline tracking every application from first enquiry through enrollment. Kanban-style stage view with conversion metrics and source attribution.

**Pipeline stages**
- Enquiry → Assessment → Interview
- Offer → Accepted → Enrolled
- Side stages: Waitlisted, Rejected, Withdrawn
- Stage age tracking (days in stage)

**Application management**
- New application form (walk-in or referral)
- Application detail view
- Desired grade level & campus assignment
- Source attribution (website, walk-in, referral, staff, API)

**Analytics**
- Total / active / enrolled counts
- Outstanding offers count
- Conversion rate (enquiry → enrolled)
- Per-stage breakdown

---

### Students

Central directory of all active enrollments. Search, filter by campus, drill into individual student profiles with enrollment history, health records, and documents.

**Directory**
- Live search by name (case-insensitive)
- Filter by campus
- Admission number, grade level & section
- Status badges (Active, Graduated, Transferred)

**Student profile**
- Personal details (DOB, gender, contact)
- Enrollment history with dates
- Guardian/parent linkage
- Health records summary
- Issued certificates & ID cards

**Data management**
- Bulk import via CSV
- Admission number auto-assign
- Roll number within section

---

### Attendance

Daily register system per section. Teachers open a register, mark each student's status, and lock it. Absence alerts can notify guardians automatically.

**Register workflow**
- Section cards showing today's status
- Status: Not started, In progress, Submitted, Locked
- Mark present / absent / late / excused per student
- Custom attendance codes (P, A, L, E, …)

**Periods & sessions**
- DAY period (default) and custom periods
- Date-stamped sessions per section
- Lock prevents after-the-fact edits

**Alerts & reporting**
- Absence count shown on dashboard
- Guardian alert on absence (configurable)
- Attendance history per student

---

### Academics

Academic structure management covering grade levels, sections, timetables, subject assignments, and teacher scheduling across one or more campuses.

**Structure**
- Grade levels with rank ordering
- Sections per grade (Class A, B, C…)
- Academic years with terms
- Campus-scoped academic config

**Timetable**
- Timetable builder (new / edit)
- Period slots per day of week
- Subject-teacher assignment per slot
- Conflict detection

**Teachers & subjects**
- Teacher list with subject assignments
- Subject catalogue per campus
- Academic planning view

---

### Assessment & Exams

Schedule examinations, enter marks, and generate per-student report cards with grade summaries. Supports multiple exam types and grading schemes.

**Exam management**
- Schedule new exam (title, date, grade, campus)
- Exam schedule overview
- Per-exam result entry
- Mark sheet per section

**Results & reports**
- Student result detail page
- Printable report card per student
- Grade aggregation across subjects
- Pass / fail / distinction bands

---

## Finance & Administration

### Fees

Full fee-lifecycle management: define structures with heads and billing cycles, generate invoices (challans), record payments, reconcile accounts, and print receipts.

**Fee structures**
- Fee heads (Tuition, Transport, Activity…)
- GL account code per fee head
- Structure lines with amounts
- Structures per campus & academic year

**Invoices & billing**
- Billing page: preview & post invoices in bulk
- Invoice status: Open, Partial, Paid, Void
- Per-invoice detail view
- Printable challan / invoice PDF
- Payment receipt print

**Payments & reconciliation**
- Payment allocation to invoices
- Partial payment tracking
- Reconciliation report
- Outstanding balance summary

---

### Finance (GL)

Chart of accounts, GL entries linked to fee transactions, and a high-level financial overview for finance officers and org owners.

**GL accounts**
- Account codes (`glAccountCode`)
- Account type classification
- Linked to fee heads & transactions

**Overview**
- Income & expense summary
- Transaction ledger
- Campus-scoped financial view

---

### Human Resources

Staff lifecycle management from hiring to separation. Covers staff directory, employment records, leave management, and off-boarding checklists.

**Staff directory**
- Add new staff member (inline form)
- Employee number, position & department
- Contract type (Permanent / Temporary / Contract / Part-time)
- Start date & salary record
- Staff list per campus

**Leave management**
- Leave request submission
- HR approval / rejection workflow
- Leave balance tracking (days used)
- Multiple leave types (Annual, Sick, Maternity…)
- Approval notification to staff

**Separation**
- Initiate separation checklist
- Configurable checklist items
- Last working day tracking
- Reason & completion status

---

### Payroll

Manual payroll input for each staff member per period. Records gross pay, deductions, and net pay. Not an automated payroll engine — designed for data entry and audit.

**Payroll input**
- Period label (e.g. "Sep 2025")
- Gross pay & net pay entry
- Deductions list (JSON flexible)
- Notes per entry

**Records**
- Per-staff payroll history
- Campus-scoped payroll access
- Audit trail on every entry

---

## Student Services

### Library

Catalog management with barcode-tracked copies, issue and return workflows, and active loan monitoring per campus library.

**Catalog**
- Add book (title, author, ISBN, category)
- Multiple copies per item (up to 10)
- Auto-generated barcodes per copy
- Category management
- Search catalog by title

**Circulation**
- Issue book to borrower (copy ID + user + due date)
- Return book by barcode scan
- Due period: 7 / 14 / 21 / 30 days
- Copy status: Available, Issued, Lost
- Active loans list with due dates

**Campus scope**
- Separate catalog per campus
- Campus tab switcher
- Circulation permission (`hr.library.circulate`)

---

### Certificates & ID Cards

Issue and print school certificates and student ID cards. Every issued certificate is logged with a unique number and is immediately printable from the browser.

**Certificate types**
- Bonafide Certificate
- School Leaving Certificate
- Character Certificate
- Unique certificate number (`CERT-XXXXXXX`)

**Print template**
- School name, campus & logo area
- Decorative double-rule border
- Watermark with school name
- Student details auto-populated
- Dual signature blocks (Principal / Class Teacher)
- Print / Save as PDF button

**ID Cards & log**
- Issue / renew ID card per academic year
- Active / Revoked status
- Certificate issuance log (searchable)
- Issued-by attribution

---

### Health

Student health records including medical conditions, allergies, emergency contacts, and immunisation history. Access restricted to authorised staff.

**Records**
- Medical conditions & diagnoses
- Allergies & dietary requirements
- Immunisation log
- Emergency contact details

**Access**
- Health-specific permission gate
- Campus-scoped access
- Audit log on every read/write

---

### Hostel

Boarding facility management for residential students. Track room assignments, bed availability, and hostel fees linked to the fee module.

- Room and bed assignment per student
- Hostel occupancy overview
- Boarding fee linkage
- Campus-scoped hostel records

---

### Transport

School transport route and vehicle management. Assign students to routes and track transport-fee linkage.

- Route and stop management
- Vehicle assignment per route
- Student-to-route assignment
- Transport fee head linkage

---

## Communication

### Messages

Internal messaging between staff, guardians, and students. Supports broadcast announcements and direct conversations within the tenant.

- Compose and send messages
- Inbox with read/unread tracking
- Broadcast to group (campus / grade)
- Tenant-isolated message threads

---

### Notifications

In-app notification feed for system events — leave approvals, absence alerts, certificate issuance, and admin actions — with deduplication.

- Real-time notification feed
- Category tags (Announcement, Alert, System)
- Deduplicated delivery (`dedupeKey`)
- Read / unread state per user

---

### Calendar

School calendar showing academic events, term dates, exam schedules, and holidays.

- Academic term dates
- School events and holidays
- Exam schedule overlay
- Campus-filtered calendar view

---

## Operations

### Reports

Analytics and exportable reports across all modules.

- Enrollment & headcount report
- Attendance summary (by section / date range)
- Fee collection & outstanding balance
- Exam performance overview
- HR & leave summary
- Date-range and academic year filters
- Campus-scoped results

---

### Inventory

Track school assets, stationery, lab equipment, and supplies.

- Item catalogue with categories
- Stock-in / stock-out movements
- Current quantity tracking
- Campus-scoped inventory

---

### Safeguarding

Confidential incident logging and case management for student welfare concerns. Restricted to designated safeguarding officers.

- Incident creation and case notes
- Case status tracking
- Involved student / staff linkage
- Confidential access control
- Audit trail on every access

---

### Data Import

Bulk CSV import for students and enrollment records.

- CSV upload with column mapping
- Row-level validation errors
- Dry-run preview before commit
- Admission number auto-assignment
- Enrollment linkage on import

---

## Platform & Setup

### Campuses

Create and manage physical campuses within the tenant. Each campus can have its own academic structure, staff, fee configuration, and enrolled students.

**Campus management**
- Create campus (name, city, address)
- Activate / suspend a campus
- Campus-switch in the portal header
- Per-campus subscription entitlements

**Settings**
- Campus profile & contact info
- Security settings per campus
- Timezone & locale config

---

### Setup

One-time and recurring configuration wizard covering academic year creation, grade structure, departments, positions, and leave types.

**Academic setup**
- Academic year (name, start/end dates, `isCurrent`)
- Terms within an academic year
- Grade levels with rank
- Sections per grade per campus

**HR setup**
- Departments per campus
- Positions within departments
- Leave types with annual allowance (`daysPerYear`)
- Attendance codes (P/A/L/E…)

---

### Integrations

Connect Scholarum to external systems. Manage API keys, webhooks, and third-party service configurations.

- API key management
- Webhook endpoint configuration
- OAuth / SSO integrations
- Tenant-level integration list

---

### Platform Admin

Super-admin panel for Scholarum operators. Create and manage tenants, assign subscription plans, monitor platform health, and inspect audit logs.

**Tenant management**
- Create new tenant (school / org)
- Tenant detail & status (Active, Suspended, Trial)
- Assign subscription plan
- Tenant-level feature flags

**Subscription plans**
- Plan catalogue (Starter, Professional, Enterprise)
- Per-plan feature entitlements
- Billing cycle configuration

**Audit & health**
- Platform-wide audit log
- Actor, action, target & metadata
- Timestamp and IP tracking

---

## Roles & Permissions

> Permissions are evaluated in order: **suspension check → org-wide wildcard → org-wide named permission → campus-level wildcard → campus-level named permission.** A suspended tenant blocks all non-platform actions regardless of role.

| Role | Scope | Access summary |
|---|---|---|
| **Platform Operator** | Cross-tenant | Full access to all tenants, subscription plans, audit logs. Cannot be scoped to a single tenant. |
| **Organization Owner** | Tenant-wide | All modules across all campuses in the tenant. Manages setup, billing, integrations and user roles. |
| **Campus Administrator** | Assigned campuses | Full access to academic, attendance, fees, HR, and student data for their assigned campus(es). Cannot manage subscription or cross-campus data. |
| **Teacher** | Assigned campuses | Attendance registers for assigned sections, student read access, timetable read, exam mark entry for assigned subjects. |
| **Admissions Officer** | Assigned campuses | Create and manage applications, move pipeline stages. Cannot access finance or HR. |
| **Finance Officer** | Assigned campuses | Fee structures, invoice generation, payment recording, payroll input. No HR separation or student academic data. |
| **HR Manager** | Assigned campuses | Staff directory, leave approvals, payroll input, separation checklists. No student academic data. |
| **Parent / Guardian** | Linked students only | View their child's attendance, exam results, fee invoices, and messages. Read-only across all modules. |

---

*Scholarum — One governed platform for every campus.*
