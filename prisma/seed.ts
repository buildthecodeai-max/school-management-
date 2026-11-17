import { PrismaClient, type Gender } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PASSWORD = "password123";

async function main() {
  console.log("Seeding Scholarum demo data…");
  const hash = await bcrypt.hash(PASSWORD, 12);

  // --- Clean (dev only) ---------------------------------------------------
  // Delete in dependency order.
  await prisma.auditEvent.deleteMany();
  await prisma.message.deleteMany();
  // Phase 3 module data (before students/staff)
  await prisma.safeguardingNote.deleteMany();
  await prisma.safeguardingCase.deleteMany();
  await prisma.healthIncident.deleteMany();
  await prisma.healthRecord.deleteMany();
  await prisma.stockLedgerEntry.deleteMany();
  await prisma.requisitionLine.deleteMany();
  await prisma.requisition.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.inventoryCategory.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.tripAttendance.deleteMany();
  await prisma.routeAssignment.deleteMany();
  await prisma.stop.deleteMany();
  await prisma.route.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.libraryCirculation.deleteMany();
  await prisma.libraryCopy.deleteMany();
  await prisma.libraryItem.deleteMany();
  await prisma.libraryCategory.deleteMany();
  await prisma.libraryAuthor.deleteMany();
  await prisma.payrollInput.deleteMany();
  await prisma.separationChecklist.deleteMany();
  await prisma.performanceReview.deleteMany();
  await prisma.employmentRecord.deleteMany();
  await prisma.position.deleteMany();
  await prisma.department.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.leaveBalance.deleteMany();
  await prisma.leaveType.deleteMany();
  // Core module data
  await prisma.attendanceRecord.deleteMany();
  await prisma.attendanceSession.deleteMany();
  await prisma.attendanceCode.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.section.deleteMany();
  await prisma.gradeLevel.deleteMany();
  await prisma.term.deleteMany();
  await prisma.academicYear.deleteMany();
  await prisma.guardianRelationship.deleteMany();
  await prisma.roleAssignment.deleteMany();
  await prisma.session.deleteMany();
  await prisma.student.deleteMany();
  await prisma.guardian.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.user.deleteMany();
  await prisma.person.deleteMany();
  await prisma.role.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.plan.deleteMany();

  // --- Plans --------------------------------------------------------------
  const [starter, professional, enterprise] = await Promise.all([
    prisma.plan.create({
      data: {
        code: "starter",
        name: "Starter",
        priceMonthly: 9900,
        maxStudents: 300,
        maxCampuses: 1,
        features: ["sis", "attendance", "portals"],
      },
    }),
    prisma.plan.create({
      data: {
        code: "professional",
        name: "Professional",
        priceMonthly: 39900,
        maxStudents: 3000,
        maxCampuses: 10,
        features: ["sis", "attendance", "portals", "academics", "fees", "reports"],
      },
    }),
    prisma.plan.create({
      data: {
        code: "enterprise",
        name: "Enterprise",
        priceMonthly: 129900,
        maxStudents: 500000,
        maxCampuses: 500,
        features: ["all"],
      },
    }),
  ]);

  // --- Platform operator --------------------------------------------------
  const platformRole = await prisma.role.create({
    data: {
      name: "Platform Super Administrator",
      description: "Full platform operations access.",
      permissions: ["*"],
      isSystem: true,
    },
  });
  const ops = await prisma.user.create({
    data: {
      email: "ops@scholarum.io",
      passwordHash: hash,
      displayName: "Platform Operator",
      isPlatformStaff: true,
    },
  });
  await prisma.roleAssignment.create({
    data: { userId: ops.id, roleId: platformRole.id, scopeType: "PLATFORM" },
  });

  // A second demo tenant so the platform registry looks alive.
  await createTenant("Riverside International", "riverside", starter.id, "TRIAL", {
    minimal: true,
    hash,
    planPrice: starter.priceMonthly,
  });

  // --- Primary demo tenant: HMSS -----------------------------
  const tenant = await prisma.tenant.create({
    data: {
      name: "HMSS",
      slug: "hmss",
      status: "ACTIVE",
      primaryColor: "#4f46e5",
      timezone: "America/New_York",
    },
  });
  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: professional.id,
      status: "ACTIVE",
      currentPeriodEnd: addDays(new Date(), 300),
      seatsInUse: 45,
    },
  });

  // Campuses
  const main = await prisma.campus.create({
    data: {
      tenantId: tenant.id,
      name: "HMSS Main",
      code: "MAIN",
      city: "Boston",
      timezone: "America/New_York",
    },
  });
  const east = await prisma.campus.create({
    data: {
      tenantId: tenant.id,
      name: "HMSS East",
      code: "EAST",
      city: "Cambridge",
      timezone: "America/New_York",
    },
  });

  // Roles (tenant scoped) --------------------------------------------------
  const ownerRole = await prisma.role.create({
    data: {
      tenantId: tenant.id,
      name: "Organization Owner",
      description: "Full access across the organization.",
      permissions: ["*"],
    },
  });
  const campusAdminRole = await prisma.role.create({
    data: {
      tenantId: tenant.id,
      name: "Campus Administrator",
      description: "Operational management within assigned campuses.",
      permissions: [
        "campus.read",
        "setup.read",
        "data.import",
        "admissions.read",
        "admissions.write",
        "admissions.decide",
        "admissions.convert",
        "student.read",
        "student.write",
        "guardian.read",
        "guardian.write",
        "academics.read",
        "academics.write",
        "attendance.read",
        "attendance.write",
        "attendance.amend",
        "attendance.leave.request",
        "attendance.leave.approve",
        "timetable.read",
        "timetable.write",
        "timetable.publish",
        "exams.read",
        "exams.enter",
        "exams.manage",
        "exams.approve",
        "fee.read",
        "fee.configure",
        "fee.bill",
        "fee.collect",
        "fee.adjust",
        "message.read",
        "communication.send",
        "notifications.operate",
        "billing.read",
      ],
    },
  });
  const financeRole = await prisma.role.create({
    data: {
      tenantId: tenant.id,
      name: "Finance Officer",
      description:
        "Billing and collections. Cannot approve refunds/credit notes (separation of duties).",
      permissions: [
        "fee.read",
        "fee.configure",
        "fee.bill",
        "fee.collect",
        "student.read",
        "academics.read",
        "campus.read",
        "message.read",
      ],
    },
  });
  const admissionsRole = await prisma.role.create({
    data: {
      tenantId: tenant.id,
      name: "Admissions Officer",
      description: "Manage the admissions pipeline within assigned campuses.",
      permissions: [
        "admissions.read",
        "admissions.write",
        "student.read",
        "academics.read",
        "campus.read",
        "message.read",
      ],
    },
  });
  const teacherRole = await prisma.role.create({
    data: {
      tenantId: tenant.id,
      name: "Teacher",
      description: "Attendance and class workflows within assigned scope.",
      permissions: [
        "student.read",
        "academics.read",
        "attendance.read",
        "attendance.write",
        "exams.read",
        "exams.enter",
        "message.read",
      ],
    },
  });
  const parentRole = await prisma.role.create({
    data: {
      tenantId: tenant.id,
      name: "Parent / Guardian",
      description: "View and act for linked children.",
      permissions: ["message.read"],
    },
  });
  // IMPORTANT: health & safeguarding permissions are intentionally NOT added
  // to campusAdminRole or teacherRole — visibility is permission-gated by design.
  const safeguardingOfficerRole = await prisma.role.create({
    data: {
      tenantId: tenant.id,
      name: "Safeguarding Officer",
      description: "Restricted: health records and safeguarding cases only.",
      permissions: [
        "health.record.read",
        "health.record.write",
        "health.incident.write",
        "safeguarding.case.read",
        "safeguarding.case.write",
        "message.read",
      ],
    },
  });

  // Academic structure (per campus) --------------------------------------
  const yearMain = await createAcademicYear(tenant.id, main.id);
  const yearEast = await createAcademicYear(tenant.id, east.id);

  const gradesMain = await createGrades(tenant.id, main.id);
  const gradesEast = await createGrades(tenant.id, east.id);

  // Teacher staff + user (scoped to Main)
  const teacherPerson = await prisma.person.create({
    data: {
      tenantId: tenant.id,
      firstName: "Sarah",
      lastName: "Mitchell",
      gender: "FEMALE",
      email: "teacher@hmss.edu",
    },
  });
  const teacherStaff = await prisma.staff.create({
    data: {
      tenantId: tenant.id,
      personId: teacherPerson.id,
      employeeNumber: "EMP-0001",
      title: "Class Teacher",
    },
  });
  const teacherUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      personId: teacherPerson.id,
      email: "teacher@hmss.edu",
      passwordHash: hash,
      displayName: "Sarah Mitchell",
    },
  });
  await prisma.roleAssignment.create({
    data: {
      userId: teacherUser.id,
      roleId: teacherRole.id,
      scopeType: "CAMPUS",
      campusId: main.id,
    },
  });

  // Sections (with homeroom teacher on Main grade 3)
  const sectionsMain = await createSections(
    tenant.id,
    main.id,
    yearMain.id,
    gradesMain,
    teacherStaff.id,
  );
  const sectionsEast = await createSections(
    tenant.id,
    east.id,
    yearEast.id,
    gradesEast,
    null,
  );

  // Owner user (org-wide) --------------------------------------------------
  const owner = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "owner@hmss.edu",
      passwordHash: hash,
      displayName: "David Chen",
    },
  });
  await prisma.roleAssignment.create({
    data: { userId: owner.id, roleId: ownerRole.id, scopeType: "ORG" },
  });

  // Campus admin (scoped to Main only) ------------------------------------
  const admin = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "admin@hmss.edu",
      passwordHash: hash,
      displayName: "Maria Lopez",
    },
  });
  await prisma.roleAssignment.create({
    data: {
      userId: admin.id,
      roleId: campusAdminRole.id,
      scopeType: "CAMPUS",
      campusId: main.id,
    },
  });

  // Admissions officer (scoped to Main) ----------------------------------
  const admissionsUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "admissions@hmss.edu",
      passwordHash: hash,
      displayName: "Priya Nair",
    },
  });
  await prisma.roleAssignment.create({
    data: {
      userId: admissionsUser.id,
      roleId: admissionsRole.id,
      scopeType: "CAMPUS",
      campusId: main.id,
    },
  });

  // Finance officer (scoped to Main; no adjustment/approval rights) ---------
  const financeUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "finance@hmss.edu",
      passwordHash: hash,
      displayName: "Grace Okoro",
    },
  });
  await prisma.roleAssignment.create({
    data: {
      userId: financeUser.id,
      roleId: financeRole.id,
      scopeType: "CAMPUS",
      campusId: main.id,
    },
  });

  // Safeguarding officer (scoped to Main; NOT campusAdmin or teacher) --------
  const safeguardingPerson = await prisma.person.create({
    data: {
      tenantId: tenant.id,
      firstName: "James",
      lastName: "Osei",
      gender: "MALE",
      email: "safeguarding@hmss.edu",
    },
  });
  const safeguardingUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      personId: safeguardingPerson.id,
      email: "safeguarding@hmss.edu",
      passwordHash: hash,
      displayName: "James Osei",
    },
  });
  await prisma.roleAssignment.create({
    data: {
      userId: safeguardingUser.id,
      roleId: safeguardingOfficerRole.id,
      scopeType: "CAMPUS",
      campusId: main.id,
    },
  });

  // Attendance codes -------------------------------------------------------
  const codes = await createAttendanceCodes(tenant.id);

  // Students + enrollments -------------------------------------------------
  const mainStudents = await createStudents(
    tenant.id,
    main.id,
    yearMain.id,
    sectionsMain,
    18,
    1,
  );
  await createStudents(tenant.id, east.id, yearEast.id, sectionsEast, 8, 100);

  // Parent user linked to the first two Main students ---------------------
  const parentPerson = await prisma.person.create({
    data: {
      tenantId: tenant.id,
      firstName: "Jennifer",
      lastName: "Adams",
      gender: "FEMALE",
      email: "parent@hmss.edu",
      phone: "+1-617-555-0142",
    },
  });
  const guardian = await prisma.guardian.create({
    data: {
      tenantId: tenant.id,
      personId: parentPerson.id,
      occupation: "Architect",
    },
  });
  const parentUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      personId: parentPerson.id,
      email: "parent@hmss.edu",
      passwordHash: hash,
      displayName: "Jennifer Adams",
    },
  });
  await prisma.roleAssignment.create({
    data: { userId: parentUser.id, roleId: parentRole.id, scopeType: "ORG" },
  });

  const linkedChildren = mainStudents.slice(0, 2);
  for (const [i, child] of linkedChildren.entries()) {
    await prisma.guardianRelationship.create({
      data: {
        tenantId: tenant.id,
        guardianId: guardian.id,
        studentId: child.studentId,
        relationship: "MOTHER",
        isPrimaryContact: i === 0,
        financiallyResponsible: true,
        receivesNotifications: true,
      },
    });
  }

  // Attendance history for realistic percentages --------------------------
  await createAttendanceHistory(
    tenant.id,
    main.id,
    sectionsMain[2].id, // grade-3 section with the teacher
    mainStudents.filter((s) => s.sectionId === sectionsMain[2].id),
    codes,
    teacherStaff.id,
  );

  // Guardian notices -------------------------------------------------------
  await prisma.message.createMany({
    data: [
      {
        tenantId: tenant.id,
        recipientUserId: parentUser.id,
        title: "Attendance alert",
        body: `${linkedChildren[0]?.name ?? "Your child"} was marked late this morning.`,
        relatedType: "attendance",
      },
      {
        tenantId: tenant.id,
        recipientUserId: parentUser.id,
        title: "Parent-teacher conference",
        body: "Term 1 conferences are scheduled for the week of the 20th. Please book a slot in the portal.",
      },
      {
        tenantId: tenant.id,
        recipientUserId: parentUser.id,
        title: "Fee statement issued",
        body: "Your Term 1 fee statement is now available. Payment is due by the end of the month.",
        relatedType: "finance",
      },
    ],
  });

  // Admissions pipeline demo data ----------------------------------------
  await createApplications(tenant.id, main.id, gradesMain, admissionsUser.id);

  // Fees demo data --------------------------------------------------------
  await createFees(tenant.id, main.id, mainStudents, financeUser.id);

  // Assessment demo data (Grade 3 section, has the teacher) ----------------
  await createExams(
    tenant.id,
    main.id,
    sectionsMain[2].id,
    yearMain.id,
    mainStudents.filter((s) => s.sectionId === sectionsMain[2].id),
    teacherStaff.id,
  );

  // Leave types (ATT-005 / HR shared) --------------------------------------
  await createLeaveTypes(tenant.id);

  // Timetable demo data (ACD-001/002/003) -----------------------------------
  await createTimetableDemo(
    tenant.id,
    main.id,
    yearMain.id,
    sectionsMain,
    teacherStaff.id,
  );

  // Phase 3 module seed data -------------------------------------------------
  await createHrDemo(tenant.id, main.id, teacherStaff.id);
  await createLibraryDemo(tenant.id, main.id);
  await createTransportDemo(tenant.id, main.id, mainStudents.slice(0, 3).map((s) => s.studentId));
  await createInventoryDemo(tenant.id, main.id);
  await createHealthAndSafeguardingDemo(tenant.id, main.id, mainStudents[0].studentId, safeguardingUser.id);

  console.log("\nSeed complete. Demo logins (password: password123):");
  console.log("  ops@scholarum.io            — Platform operator");
  console.log("  owner@hmss.edu         — Organization owner (all campuses)");
  console.log("  admin@hmss.edu         — Campus admin (HMSS Main only)");
  console.log("  admissions@hmss.edu    — Admissions officer (HMSS Main)");
  console.log("  finance@hmss.edu       — Finance officer (Main; no adjust rights)");
  console.log("  teacher@hmss.edu       — Teacher (HMSS Main)");
  console.log("  parent@hmss.edu        — Parent (2 children)");
  console.log("  safeguarding@hmss.edu  — Safeguarding officer (restricted; Main only)");
}

// --- leave & timetable helpers --------------------------------------------

async function createLeaveTypes(tenantId: string) {
  await prisma.leaveType.createMany({
    data: [
      { tenantId, name: "Annual Leave", daysPerYear: 21, isPaid: true, appliesTo: "STAFF" },
      { tenantId, name: "Sick Leave", daysPerYear: 10, isPaid: true, appliesTo: "STAFF" },
      { tenantId, name: "Maternity Leave", daysPerYear: 90, isPaid: true, appliesTo: "STAFF" },
    ],
  });
}

async function createTimetableDemo(
  tenantId: string,
  campusId: string,
  academicYearId: string,
  sections: { id: string }[],
  teacherStaffId: string,
) {
  const version = await prisma.timetableVersion.create({
    data: {
      tenantId,
      campusId,
      academicYearId,
      name: "Term 1 2025",
      status: "ACTIVE",
      publishedAt: new Date(),
    },
  });

  // Seed a room
  const room = await prisma.room.create({
    data: { tenantId, campusId, code: "A101", name: "Room A101", capacity: 35 },
  });

  // Get the first subject
  const subject = await prisma.subject.findFirst({ where: { tenantId } });
  if (!subject || sections.length === 0) return;

  const sectionId = sections[0].id;
  const DAYS = ["MON", "TUE", "WED", "THU", "FRI"] as const;

  await prisma.timetableSlot.createMany({
    data: DAYS.map((day, i) => ({
      tenantId,
      versionId: version.id,
      sectionId,
      subjectId: subject.id,
      staffId: teacherStaffId,
      roomId: room.id,
      dayOfWeek: day,
      periodNumber: 1,
      startTime: "08:00",
      endTime: "08:45",
    })),
  });
}

// --- helpers --------------------------------------------------------------

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

async function createTenant(
  name: string,
  slug: string,
  planId: string,
  status: "TRIAL" | "ACTIVE",
  opts: { minimal?: boolean; hash: string; planPrice: number },
) {
  const t = await prisma.tenant.create({
    data: { name, slug, status },
  });
  await prisma.subscription.create({
    data: {
      tenantId: t.id,
      planId,
      status: status === "TRIAL" ? "TRIAL" : "ACTIVE",
      trialEndsAt: status === "TRIAL" ? addDays(new Date(), 14) : null,
      currentPeriodEnd: addDays(new Date(), 30),
    },
  });
  return t;
}

async function createAcademicYear(tenantId: string, campusId: string) {
  const year = await prisma.academicYear.create({
    data: {
      tenantId,
      campusId,
      name: "2025–2026",
      startDate: new Date("2025-08-15"),
      endDate: new Date("2026-06-15"),
      isCurrent: true,
    },
  });
  await prisma.term.createMany({
    data: [
      {
        tenantId,
        academicYearId: year.id,
        name: "Term 1",
        startDate: new Date("2025-08-15"),
        endDate: new Date("2025-12-20"),
      },
      {
        tenantId,
        academicYearId: year.id,
        name: "Term 2",
        startDate: new Date("2026-01-06"),
        endDate: new Date("2026-06-15"),
      },
    ],
  });
  return year;
}

async function createGrades(tenantId: string, campusId: string) {
  const names = ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"];
  const grades = [];
  for (let i = 0; i < names.length; i++) {
    grades.push(
      await prisma.gradeLevel.create({
        data: { tenantId, campusId, name: names[i], rank: i + 1 },
      }),
    );
  }
  return grades;
}

async function createSections(
  tenantId: string,
  campusId: string,
  academicYearId: string,
  grades: { id: string }[],
  homeroomStaffId: string | null,
) {
  const sections = [];
  for (let i = 0; i < grades.length; i++) {
    sections.push(
      await prisma.section.create({
        data: {
          tenantId,
          campusId,
          academicYearId,
          gradeLevelId: grades[i].id,
          name: "Section A",
          capacity: 30,
          // give the grade-3 section a homeroom teacher on the main campus
          homeroomStaffId: i === 2 ? homeroomStaffId : null,
        },
      }),
    );
  }
  return sections;
}

async function createAttendanceCodes(tenantId: string) {
  const defs = [
    { code: "P", label: "Present", category: "PRESENT", countsAsPresent: true, notifyGuardian: false },
    { code: "A", label: "Absent", category: "ABSENT", countsAsPresent: false, notifyGuardian: true },
    { code: "L", label: "Late", category: "LATE", countsAsPresent: true, notifyGuardian: true },
    { code: "E", label: "Excused", category: "EXCUSED", countsAsPresent: true, notifyGuardian: false },
    { code: "LV", label: "Leave", category: "LEAVE", countsAsPresent: false, notifyGuardian: false },
  ] as const;
  const codes: Record<string, { id: string; countsAsPresent: boolean }> = {};
  for (const d of defs) {
    const c = await prisma.attendanceCode.create({
      data: {
        tenantId,
        code: d.code,
        label: d.label,
        category: d.category,
        countsAsPresent: d.countsAsPresent,
        notifyGuardian: d.notifyGuardian,
      },
    });
    codes[d.code] = { id: c.id, countsAsPresent: d.countsAsPresent };
  }
  return codes;
}

const FIRST = [
  "Emma", "Liam", "Olivia", "Noah", "Ava", "Ethan", "Sophia", "Mason",
  "Isabella", "Lucas", "Mia", "Oliver", "Amelia", "Elijah", "Harper",
  "James", "Evelyn", "Benjamin", "Abigail", "Henry", "Emily", "Alexander",
  "Charlotte", "Daniel", "Grace", "Michael",
];
const LAST = [
  "Adams", "Adams", "Brooks", "Carter", "Diaz", "Evans", "Foster", "Green",
  "Hughes", "Iqbal", "Jones", "Khan", "Lee", "Morgan", "Nguyen", "Owens",
  "Patel", "Quinn", "Reed", "Silva", "Tan", "Usman", "Vance", "Wong",
  "Yang", "Zhang",
];

async function createStudents(
  tenantId: string,
  campusId: string,
  academicYearId: string,
  sections: { id: string; gradeLevelId: string }[],
  count: number,
  startIndex: number,
) {
  const out: { studentId: string; sectionId: string; name: string }[] = [];
  for (let i = 0; i < count; i++) {
    const idx = startIndex + i;
    const first = FIRST[i % FIRST.length];
    const last = LAST[i % LAST.length];
    const gender: Gender = i % 2 === 0 ? "FEMALE" : "MALE";
    const person = await prisma.person.create({
      data: {
        tenantId,
        firstName: first,
        lastName: last,
        gender,
        dateOfBirth: new Date(2015 - (i % 5), (i * 3) % 12, ((i * 7) % 27) + 1),
      },
    });
    const student = await prisma.student.create({
      data: {
        tenantId,
        personId: person.id,
        admissionNumber: `GA-${String(idx).padStart(4, "0")}`,
        status: "ENROLLED",
      },
    });
    const section = sections[i % sections.length];
    await prisma.enrollment.create({
      data: {
        tenantId,
        studentId: student.id,
        campusId,
        academicYearId,
        gradeLevelId: section.gradeLevelId,
        sectionId: section.id,
        rollNumber: i + 1,
        status: "ACTIVE",
        startDate: new Date("2025-08-15"),
      },
    });
    out.push({
      studentId: student.id,
      sectionId: section.id,
      name: `${first} ${last}`,
    });
  }
  return out;
}

async function createAttendanceHistory(
  tenantId: string,
  campusId: string,
  sectionId: string,
  students: { studentId: string }[],
  codes: Record<string, { id: string; countsAsPresent: boolean }>,
  staffId: string,
) {
  // last 10 weekdays (stored at midnight to match the day-keyed register)
  const days: Date[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (days.length < 10) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() - 1);
  }

  for (const [di, date] of days.entries()) {
    const isToday = di === 0;
    const session = await prisma.attendanceSession.create({
      data: {
        tenantId,
        campusId,
        sectionId,
        date,
        period: "DAY",
        status: isToday ? "SUBMITTED" : "LOCKED",
        takenByStaffId: staffId,
        submittedAt: date,
        lockedAt: isToday ? null : date,
      },
    });
    for (const [si, s] of students.entries()) {
      // deterministic pseudo-random: mostly present, occasional absent/late
      const roll = (si * 7 + di * 3) % 20;
      const codeKey = roll === 0 ? "A" : roll === 1 ? "L" : roll === 2 ? "E" : "P";
      await prisma.attendanceRecord.create({
        data: {
          tenantId,
          sessionId: session.id,
          studentId: s.studentId,
          codeId: codes[codeKey].id,
        },
      });
    }
  }
}

const PIPELINE = [
  "INQUIRY", "APPLICATION", "REVIEW", "ASSESSMENT",
  "INTERVIEW", "DECISION", "OFFER", "ACCEPTED", "ENROLLED",
] as const;

async function createApplications(
  tenantId: string,
  campusId: string,
  grades: { id: string }[],
  ownerUserId: string,
) {
  const demo: {
    first: string; last: string; grade: number;
    source: "WEBSITE" | "WALK_IN" | "REFERRAL" | "STAFF" | "API";
    stage: string; gEmail: string; gName: string;
    reason?: string;
  }[] = [
    { first: "Grace", last: "Bennett", grade: 0, source: "WEBSITE", stage: "INQUIRY", gName: "Paul Bennett", gEmail: "paul.bennett@example.com" },
    { first: "Leo", last: "Fischer", grade: 1, source: "WALK_IN", stage: "APPLICATION", gName: "Anna Fischer", gEmail: "anna.fischer@example.com" },
    { first: "Nora", last: "Schmidt", grade: 2, source: "REFERRAL", stage: "REVIEW", gName: "Erik Schmidt", gEmail: "erik.schmidt@example.com" },
    { first: "Kai", last: "Andersson", grade: 3, source: "WEBSITE", stage: "ASSESSMENT", gName: "Sofia Andersson", gEmail: "sofia.a@example.com" },
    { first: "Zara", last: "Malik", grade: 4, source: "STAFF", stage: "INTERVIEW", gName: "Omar Malik", gEmail: "omar.malik@example.com" },
    { first: "Theo", last: "Rossi", grade: 0, source: "WEBSITE", stage: "OFFER", gName: "Marco Rossi", gEmail: "marco.rossi@example.com" },
    { first: "Ivy", last: "Chen", grade: 1, source: "REFERRAL", stage: "ACCEPTED", gName: "Wei Chen", gEmail: "wei.chen@example.com" },
    { first: "Max", last: "Turner", grade: 2, source: "WALK_IN", stage: "REJECTED", gName: "Kate Turner", gEmail: "kate.turner@example.com", reason: "Did not meet assessment threshold" },
    { first: "Lily", last: "Wong", grade: 3, source: "WEBSITE", stage: "WAITLISTED", gName: "Henry Wong", gEmail: "henry.wong@example.com", reason: "Grade at capacity" },
  ];

  for (const [i, d] of demo.entries()) {
    const person = await prisma.person.create({
      data: {
        tenantId,
        firstName: d.first,
        lastName: d.last,
        dateOfBirth: new Date(2016 - (d.grade % 5), (i * 2) % 12, ((i * 5) % 27) + 1),
        email: null,
      },
    });

    const pipelineIdx = (PIPELINE as readonly string[]).indexOf(d.stage);
    const pastApplication = pipelineIdx >= 2 || d.stage === "REJECTED" || d.stage === "WAITLISTED";

    const app = await prisma.application.create({
      data: {
        tenantId,
        campusId,
        applicantPersonId: person.id,
        gradeLevelId: grades[d.grade].id,
        source: d.source,
        stage: d.stage as never,
        ownerUserId,
        consentGiven: true,
        guardianName: d.gName,
        guardianEmail: d.gEmail,
        guardianRelationship: i % 2 === 0 ? "FATHER" : "MOTHER",
        appliedAt: new Date(Date.now() - (i + 1) * 3 * 24 * 60 * 60 * 1000),
        checklist: {
          create: [
            { tenantId, label: "Birth certificate", type: "DOCUMENT", completed: pastApplication },
            { tenantId, label: "Previous school report", type: "DOCUMENT", completed: pastApplication },
            { tenantId, label: "Application fee", type: "PAYMENT", completed: pastApplication },
            { tenantId, label: "Guardian consent", type: "CONSENT", completed: true },
          ],
        },
      },
    });

    // stage history chain
    const chain: string[] = ["INQUIRY"];
    if (pipelineIdx > 0) {
      for (let s = 1; s <= pipelineIdx; s++) chain.push(PIPELINE[s]);
    } else if (d.stage === "REJECTED" || d.stage === "WAITLISTED") {
      chain.push("APPLICATION", "REVIEW", "ASSESSMENT", d.stage);
    }
    let prev: string | null = null;
    for (const st of chain) {
      await prisma.applicationStageEvent.create({
        data: {
          tenantId,
          applicationId: app.id,
          fromStage: (prev as never) ?? null,
          toStage: st as never,
          actorUserId: ownerUserId,
          reason: st === d.stage && d.reason ? d.reason : undefined,
        },
      });
      prev = st;
    }

    // assessment / interview / offers as appropriate
    if (["ASSESSMENT", "INTERVIEW", "OFFER", "ACCEPTED"].includes(d.stage)) {
      await prisma.admissionAssessment.create({
        data: { tenantId, applicationId: app.id, name: "Entrance assessment", score: 78 + (i % 15), maxScore: 100 },
      });
    }
    if (["INTERVIEW", "OFFER", "ACCEPTED"].includes(d.stage)) {
      await prisma.interview.create({
        data: {
          tenantId,
          applicationId: app.id,
          scheduledAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          interviewerUserId: ownerUserId,
          status: "COMPLETED",
          score: 8,
        },
      });
    }
    if (d.stage === "OFFER") {
      await prisma.offer.create({
        data: {
          tenantId, applicationId: app.id, version: 1, status: "ISSUED",
          depositAmount: 50000, deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          terms: "Standard enrollment offer.", approvedByUserId: ownerUserId,
        },
      });
    }
    if (d.stage === "ACCEPTED") {
      await prisma.offer.create({
        data: {
          tenantId, applicationId: app.id, version: 1, status: "ACCEPTED",
          depositAmount: 50000, depositPaid: true, respondedAt: new Date(),
          terms: "Standard enrollment offer.", approvedByUserId: ownerUserId,
        },
      });
    }
  }
}

function padNo(prefix: string, n: number) {
  return `${prefix}-${String(n).padStart(6, "0")}`;
}

async function createExams(
  tenantId: string,
  campusId: string,
  sectionId: string,
  academicYearId: string,
  students: { studentId: string }[],
  teacherStaffId: string,
) {
  const term = await prisma.term.findFirst({ where: { academicYearId } });
  if (!term) return;

  const scale = await prisma.gradeScale.create({
    data: {
      tenantId,
      name: "Standard A–F",
      bands: {
        create: [
          { tenantId, grade: "A", minPercent: 80, gradePoint: 4, isPass: true },
          { tenantId, grade: "B", minPercent: 65, gradePoint: 3, isPass: true },
          { tenantId, grade: "C", minPercent: 50, gradePoint: 2, isPass: true },
          { tenantId, grade: "D", minPercent: 40, gradePoint: 1, isPass: true },
          { tenantId, grade: "F", minPercent: 0, gradePoint: 0, isPass: false },
        ],
      },
    },
  });

  const subjectDefs = [
    { code: "MATH", name: "Mathematics" },
    { code: "ENG", name: "English" },
    { code: "SCI", name: "Science" },
  ];
  const subjects = [];
  for (const s of subjectDefs) {
    subjects.push(
      await prisma.subject.create({
        data: { tenantId, campusId, code: s.code, name: s.name },
      }),
    );
  }

  const plan = await prisma.assessmentPlan.create({
    data: {
      tenantId,
      campusId,
      sectionId,
      termId: term.id,
      name: "Term 1 Assessment",
      gradeScaleId: scale.id,
      status: "SUBMITTED", // marks entered, awaiting approval + publish
      components: {
        create: [
          { tenantId, name: "Midterm", weight: 40, maxMarks: 100 },
          { tenantId, name: "Final", weight: 60, maxMarks: 100 },
        ],
      },
      subjects: {
        create: subjects.map((s) => ({ tenantId, subjectId: s.id, teacherStaffId })),
      },
    },
    include: { components: true },
  });

  // Enter complete marks for every student × subject × component.
  for (const [si, s] of students.entries()) {
    for (const [ji, subject] of subjects.entries()) {
      for (const [ci, comp] of plan.components.entries()) {
        const base = ci === 0 ? 55 : 50;
        const spread = ci === 0 ? 40 : 45;
        const marks = base + ((si * 7 + ji * 13 + ci * 5) % spread);
        await prisma.markEntry.create({
          data: {
            tenantId,
            planId: plan.id,
            studentId: s.studentId,
            subjectId: subject.id,
            componentId: comp.id,
            marks,
            status: "NORMAL",
            enteredByUserId: null,
          },
        });
      }
    }
  }
}

async function createFees(
  tenantId: string,
  campusId: string,
  students: { studentId: string }[],
  financeUserId: string,
) {
  const tuition = await prisma.feeHead.create({
    data: { tenantId, code: "TUI", name: "Tuition", category: "TUITION" },
  });
  const transport = await prisma.feeHead.create({
    data: { tenantId, code: "TRP", name: "Transport", category: "TRANSPORT" },
  });
  const activity = await prisma.feeHead.create({
    data: { tenantId, code: "ACT", name: "Activity & materials", category: "ACTIVITY" },
  });

  const structure = await prisma.feeStructure.create({
    data: {
      tenantId,
      campusId,
      name: "Standard Fees · 2025–26",
      lines: {
        create: [
          { tenantId, feeHeadId: tuition.id, label: "Tuition", amount: 120000 },
          { tenantId, feeHeadId: transport.id, label: "Transport", amount: 30000 },
          { tenantId, feeHeadId: activity.id, label: "Activity & materials", amount: 15000 },
        ],
      },
    },
    include: { lines: true },
  });

  // Merit scholarship for the first student (25% concession).
  await prisma.studentFeeAssignment.create({
    data: {
      tenantId,
      studentId: students[0].studentId,
      feeStructureId: structure.id,
      discountPct: 25,
      discountReason: "Merit scholarship",
    },
  });

  const period = "Term 1 · 2025–26";
  const subtotal = 165000;
  const run = await prisma.billingRun.create({
    data: {
      tenantId,
      campusId,
      feeStructureId: structure.id,
      periodLabel: period,
      dueDate: new Date(),
      approvedByUserId: financeUserId,
    },
  });

  let iseq = 1;
  let pseq = 1;
  let count = 0;
  let totalAmt = 0;
  const now = Date.now();
  const dueOffsets = [21, -15, -45, -75]; // spread across aging buckets

  for (const [i, s] of students.entries()) {
    const discountPct = i === 0 ? 25 : 0;
    const discountTotal = Math.round((subtotal * discountPct) / 100);
    const total = subtotal - discountTotal;
    const dueDate = new Date(now + dueOffsets[i % 4] * 864e5);

    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        campusId,
        studentId: s.studentId,
        feeStructureId: structure.id,
        number: padNo("INV", iseq++),
        periodLabel: period,
        dueDate,
        subtotal,
        discountTotal,
        taxTotal: 0,
        total,
        balance: total,
        status: "OPEN",
        sourceRunId: run.id,
        lines: {
          create: structure.lines.map((l) => ({
            tenantId,
            feeHeadId: l.feeHeadId,
            description: l.label ?? "Fee",
            amount: l.amount,
            taxAmount: 0,
          })),
        },
      },
    });
    count++;
    totalAmt += total;

    // Mixed payment states: full / half / none.
    const mod = i % 3;
    const payAmt = mod === 0 ? total : mod === 1 ? Math.round(total / 2) : 0;
    if (payAmt > 0) {
      const payment = await prisma.payment.create({
        data: {
          tenantId,
          campusId,
          studentId: s.studentId,
          number: padNo("RCP", pseq++),
          method: mod === 0 ? "BANK" : "CASH",
          amount: payAmt,
          status: "CONFIRMED",
          collectedByUserId: financeUserId,
        },
      });
      await prisma.allocation.create({
        data: { tenantId, paymentId: payment.id, invoiceId: invoice.id, amount: payAmt },
      });
      const balance = total - payAmt;
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { balance, status: balance === 0 ? "PAID" : "PARTIAL" },
      });
    }
  }

  await prisma.billingRun.update({
    where: { id: run.id },
    data: { invoiceCount: count, totalAmount: totalAmt },
  });
}

// ---------------------------------------------------------------------------
// Phase 3 seed helpers
// ---------------------------------------------------------------------------

async function createHrDemo(tenantId: string, campusId: string, staffId: string) {
  const dept = await prisma.department.create({
    data: { tenantId, campusId, name: "Administration" },
  });
  const dept2 = await prisma.department.create({
    data: { tenantId, campusId, name: "Teaching" },
  });
  const pos1 = await prisma.position.create({ data: { tenantId, departmentId: dept.id, title: "Administrative Officer" } });
  const pos2 = await prisma.position.create({ data: { tenantId, departmentId: dept2.id, title: "Class Teacher" } });

  await prisma.employmentRecord.create({
    data: {
      tenantId,
      campusId,
      staffId,
      positionId: pos2.id,
      startDate: new Date("2023-09-01"),
      contractType: "PERMANENT",
      salary: 500000, // $5000/month
    },
  });
}

async function createLibraryDemo(tenantId: string, campusId: string) {
  const author = await prisma.libraryAuthor.create({ data: { tenantId, name: "George Orwell" } });
  const cat = await prisma.libraryCategory.create({ data: { tenantId, campusId, name: "Fiction" } });
  const item1 = await prisma.libraryItem.create({
    data: {
      tenantId,
      campusId,
      categoryId: cat.id,
      authorId: author.id,
      title: "Nineteen Eighty-Four",
      isbn: "978-0-451-52493-5",
    },
  });
  await prisma.libraryCopy.createMany({
    data: [
      { tenantId, itemId: item1.id, barcode: "LIB-001", status: "AVAILABLE" },
      { tenantId, itemId: item1.id, barcode: "LIB-002", status: "ISSUED" },
    ],
  });
  const item2 = await prisma.libraryItem.create({
    data: {
      tenantId,
      campusId,
      categoryId: cat.id,
      authorId: author.id,
      title: "Animal Farm",
      isbn: "978-0-452-28424-1",
    },
  });
  await prisma.libraryCopy.create({ data: { tenantId, itemId: item2.id, barcode: "LIB-003", status: "AVAILABLE" } });
}

async function createTransportDemo(tenantId: string, campusId: string, studentIds: string[]) {
  const vehicle = await prisma.vehicle.create({
    data: { tenantId, campusId, regNumber: "GH-1234-A", model: "Toyota Coaster", capacity: 30 },
  });
  const route = await prisma.route.create({
    data: { tenantId, campusId, vehicleId: vehicle.id, name: "Route 1 — East Side" },
  });
  await prisma.stop.createMany({
    data: [
      { tenantId, routeId: route.id, name: "Main Gate", order: 1 },
      { tenantId, routeId: route.id, name: "Market Junction", order: 2 },
      { tenantId, routeId: route.id, name: "East Terminal", order: 3 },
    ],
  });
  for (const studentId of studentIds) {
    await prisma.routeAssignment.create({
      data: { tenantId, routeId: route.id, studentId },
    });
  }
}

async function createInventoryDemo(tenantId: string, campusId: string) {
  const cat = await prisma.inventoryCategory.create({ data: { tenantId, campusId, name: "Stationery" } });
  const supplier = await prisma.supplier.create({ data: { tenantId, name: "Office Supplies Ltd", email: "orders@officesupplies.example" } });
  const warehouse = await prisma.warehouse.create({ data: { tenantId, campusId, name: "Main Store" } });

  const item1 = await prisma.inventoryItem.create({
    data: { tenantId, campusId, categoryId: cat.id, warehouseId: warehouse.id, supplierId: supplier.id, name: "Exercise Books (48 pages)", unit: "pcs", reorderThreshold: 50 },
  });
  const item2 = await prisma.inventoryItem.create({
    data: { tenantId, campusId, categoryId: cat.id, warehouseId: warehouse.id, supplierId: supplier.id, name: "HB Pencils", unit: "boxes", reorderThreshold: 10 },
  });

  // Initial stock entries
  await prisma.stockLedgerEntry.createMany({
    data: [
      { tenantId, itemId: item1.id, qty: 200, reason: "PURCHASE", reference: "Opening stock" },
      { tenantId, itemId: item2.id, qty: 30, reason: "PURCHASE", reference: "Opening stock" },
    ],
  });
}

async function createHealthAndSafeguardingDemo(
  tenantId: string,
  campusId: string,
  studentId: string,
  authorUserId: string,
) {
  // Health record for first student
  await prisma.healthRecord.upsert({
    where: { studentId },
    update: {},
    create: {
      tenantId,
      campusId,
      studentId,
      allergies: "Peanuts",
      conditions: "Mild asthma",
      emergencyContact: "Jennifer Adams — +1-617-555-0142",
    },
  });

  // Closed safeguarding case (demo only — not a real incident)
  const sCase = await prisma.safeguardingCase.create({
    data: {
      tenantId,
      campusId,
      studentId,
      title: "Demo case (closed) — well-being check",
      status: "CLOSED",
      closedAt: new Date("2025-11-15"),
    },
  });
  await prisma.safeguardingNote.create({
    data: {
      tenantId,
      caseId: sCase.id,
      authorUserId,
      body: "Initial referral from pastoral team. Follow-up completed; no further action required.",
    },
  });
  await prisma.safeguardingNote.create({
    data: {
      tenantId,
      caseId: sCase.id,
      authorUserId,
      body: "Case closed after three-week monitoring period. Family support services engaged.",
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
