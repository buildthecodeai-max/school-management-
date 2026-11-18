// Atomic, documented permission catalog (IAM-001).
// Roles are composed from these keys. The UI can preview effective access
// by resolving a user's role assignments against this catalog.

export const PERMISSIONS = {
  // Platform operations
  "platform.manage": "Manage plans, tenants and platform configuration",
  "platform.tenant.read": "View tenant registry and health",
  "platform.tenant.provision": "Create and provision new tenants",
  "platform.impersonate": "Impersonate another user's session for support purposes",

  // Organization / configuration
  "org.settings.read": "View organization settings",
  "org.settings.write": "Change organization settings and branding",
  "campus.read": "View campuses",
  "campus.write": "Create, edit and manage campus lifecycle",
  "setup.read": "View the guided onboarding checklist",
  "data.import": "Bulk import master data (students, etc.)",
  "integrations.manage": "Manage API clients and webhook endpoints",

  // Admissions
  "admissions.read": "View the admissions pipeline and applications",
  "admissions.write": "Create and edit applications, move stages, schedule interviews",
  "admissions.decide": "Approve or reject decisions and issue offers",
  "admissions.convert": "Convert an accepted applicant into an enrolled student",

  // People & students (SIS)
  "student.read": "View student records",
  "student.write": "Create and edit student records",
  "student.merge": "Merge duplicate student records (organization-wide, irreversible)",
  "guardian.read": "View guardian records and relationships",
  "guardian.write": "Create and edit guardian records and relationships",
  "staff.read": "View staff records",
  "staff.write": "Create and edit staff records",

  // Academics
  "academics.read": "View academic structure (years, grades, sections)",
  "academics.write": "Manage academic structure",

  // Assessment & exams
  "exams.read": "View assessment plans, marks and report cards",
  "exams.enter": "Enter and submit marks for assigned subjects",
  "exams.manage": "Create and configure assessment plans and grade scales",
  "exams.approve": "Moderate, approve and publish results",

  // Fees & finance
  "fee.read": "View fee structures, invoices, ledgers and finance reports",
  "fee.configure": "Manage fee heads, structures and student assignments",
  "fee.bill": "Run billing and post invoices",
  "fee.collect": "Record payments and issue receipts",
  "fee.adjust": "Approve refunds, credit notes, waivers and write-offs",
  "finance.read": "View operational accounts, income, expenses and fund balances",
  "finance.write": "Manage operational accounts and record income, expenses and transfers",

  // Attendance & leave
  "attendance.read": "View attendance registers and summaries",
  "attendance.write": "Record and submit attendance",
  "attendance.amend": "Amend locked attendance (privileged)",
  "attendance.leave.request": "Submit a leave request",
  "attendance.leave.approve": "Approve or reject leave requests",

  // Timetable
  "timetable.read": "View the timetable",
  "timetable.write": "Create and edit timetable slots",
  "timetable.publish": "Publish a timetable version",

  // Communication
  "message.read": "Read own messages and inbox",
  "communication.send": "Send announcements and notifications",
  "calendar.read": "View campus events and calendar",
  "calendar.write": "Create and manage campus events",
  "notifications.operate": "View delivery logs and retry failed notification deliveries",

  // Billing / subscription
  "billing.read": "View subscription, usage and invoices",
  "billing.manage": "Manage subscription and billing",

  // Audit
  "audit.read": "View audit trail",

  // HR module (B1)
  "hr.staff.read": "View HR staff records and employment history",
  "hr.staff.write": "Create and edit HR employment records",
  "hr.leave.read": "View leave requests and balances",
  "hr.leave.approve": "Approve or reject staff leave requests",
  "hr.payroll.read": "View payroll data entries",
  "hr.payroll.write": "Enter and edit payroll data",
  "hr.review.read": "View performance reviews",
  "hr.review.write": "Create and edit performance reviews",
  "hr.separation.manage": "Manage staff separation checklists",
  "hr.recruit.read": "View job openings and applicants",
  "hr.recruit.write": "Manage job openings, move applicants through stages and hire",

  // Library module (B2)
  "library.read": "View library catalog and loans",
  "library.catalog.write": "Add and edit library items and copies",
  "library.circulate": "Issue, return and renew library copies",
  "library.fines.manage": "Manage and waive library fines",

  // Transport module (B3)
  "transport.read": "View routes, vehicles and assignments",
  "transport.write": "Create and manage routes and vehicle assignments",
  "transport.trip.record": "Record trip attendance",

  // Inventory module (B4)
  "inventory.read": "View inventory catalog and stock levels",
  "inventory.write": "Adjust stock and manage items",
  "inventory.requisition.request": "Submit a stock requisition",
  "inventory.requisition.approve": "Approve or reject requisitions",
  "inventory.po.manage": "Create and manage purchase orders",
  "inventory.asset.manage": "Assign and track asset assignments",

  // Health & Safeguarding (B5) — intentionally narrow, never in default roles
  "health.record.read": "View student health records (restricted)",
  "health.record.write": "Create and update health records (restricted)",
  "health.incident.write": "Report health incidents (restricted)",
  "safeguarding.case.read": "View safeguarding cases (restricted)",
  "safeguarding.case.write": "Open and manage safeguarding cases (restricted)",
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

// Wildcard grants everything (used by the platform super administrator and
// organization owner system roles). Enforced in rbac.ts.
export const WILDCARD = "*";

// Grouping for the role editor / permission preview UI.
export const PERMISSION_GROUPS: { label: string; keys: PermissionKey[] }[] = [
  {
    label: "Platform",
    keys: [
      "platform.manage",
      "platform.tenant.read",
      "platform.tenant.provision",
      "platform.impersonate",
    ],
  },
  {
    label: "Organization",
    keys: [
      "org.settings.read",
      "org.settings.write",
      "campus.read",
      "campus.write",
      "setup.read",
      "data.import",
      "integrations.manage",
    ],
  },
  {
    label: "Admissions",
    keys: [
      "admissions.read",
      "admissions.write",
      "admissions.decide",
      "admissions.convert",
    ],
  },
  {
    label: "People",
    keys: [
      "student.read",
      "student.write",
      "student.merge",
      "guardian.read",
      "guardian.write",
      "staff.read",
      "staff.write",
    ],
  },
  { label: "Academics", keys: ["academics.read", "academics.write"] },
  {
    label: "Assessment & exams",
    keys: ["exams.read", "exams.enter", "exams.manage", "exams.approve"],
  },
  {
    label: "Fees & finance",
    keys: ["fee.read", "fee.configure", "fee.bill", "fee.collect", "fee.adjust", "finance.read", "finance.write"],
  },
  {
    label: "Attendance & leave",
    keys: [
      "attendance.read",
      "attendance.write",
      "attendance.amend",
      "attendance.leave.request",
      "attendance.leave.approve",
    ],
  },
  {
    label: "Timetable",
    keys: ["timetable.read", "timetable.write", "timetable.publish"],
  },
  {
    label: "Communication",
    keys: ["message.read", "communication.send", "calendar.read", "calendar.write", "notifications.operate"],
  },
  { label: "Billing", keys: ["billing.read", "billing.manage"] },
  { label: "Audit", keys: ["audit.read"] },
  {
    label: "HR",
    keys: [
      "hr.staff.read", "hr.staff.write", "hr.leave.read", "hr.leave.approve",
      "hr.payroll.read", "hr.payroll.write", "hr.review.read", "hr.review.write",
      "hr.separation.manage", "hr.recruit.read", "hr.recruit.write",
    ],
  },
  {
    label: "Library",
    keys: ["library.read", "library.catalog.write", "library.circulate", "library.fines.manage"],
  },
  {
    label: "Transport",
    keys: ["transport.read", "transport.write", "transport.trip.record"],
  },
  {
    label: "Inventory",
    keys: [
      "inventory.read", "inventory.write", "inventory.requisition.request",
      "inventory.requisition.approve", "inventory.po.manage", "inventory.asset.manage",
    ],
  },
  {
    label: "Health & Safeguarding (restricted)",
    keys: [
      "health.record.read", "health.record.write", "health.incident.write",
      "safeguarding.case.read", "safeguarding.case.write",
    ],
  },
];
