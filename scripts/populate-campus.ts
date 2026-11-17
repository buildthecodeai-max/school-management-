/**
 * One-off: populate the empty "Hashmat b1" / "Hmss" tenant+campus (created
 * while testing the platform "Add school" flow) with realistic demo data,
 * mirroring prisma/seed.ts's HMSS patterns — academic year/terms, grades,
 * sections, attendance codes, a teacher, students + enrollments, and a
 * guardian. Also fixes the tenant status and gives it a subscription and
 * proper roles, none of which existed.
 *
 *   npx tsx scripts/populate-campus.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ALL_PERMISSIONS } from "../src/lib/permissions";

const prisma = new PrismaClient();

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const FIRST = [
  "Amara", "Kwame", "Zoe", "Ravi", "Layla", "Diego", "Nina", "Tariq",
  "Elena", "Marco", "Priya", "Sam", "Yara", "Leo", "Fatima",
];
const LAST = [
  "Osei", "Nkomo", "Mensah", "Reyes", "Kapoor", "Lindqvist", "Farrow",
  "Delacroix", "Okafor", "Santos", "Ahmed", "Novak", "Hassan", "Petrov", "Singh",
];

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { name: "Hashmat b1" } });
  if (!tenant) {
    console.log("Tenant 'Hashmat b1' not found — nothing to do.");
    return;
  }

  const campus = await prisma.campus.findFirst({ where: { tenantId: tenant.id } });
  if (!campus) {
    console.log("No campus found for this tenant — nothing to do.");
    return;
  }

  const existingEnrollments = await prisma.enrollment.count({ where: { campusId: campus.id } });
  if (existingEnrollments > 0) {
    console.log(`${campus.name} already has ${existingEnrollments} enrollment(s) — skipping to avoid duplicates.`);
    return;
  }

  console.log(`Populating ${tenant.name} / ${campus.name} (${campus.code})...`);

  // --- Fix tenant status + subscription -----------------------------------
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "ACTIVE" } });
  const starter = await prisma.plan.findFirst({ where: { code: "starter" } });
  let subscription = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
  if (!subscription && starter) {
    subscription = await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: starter.id,
        status: "ACTIVE",
        currentPeriodEnd: addDays(new Date(), 30),
      },
    });
  }
  console.log("  tenant status -> ACTIVE, subscription:", subscription?.id ?? "(no Starter plan found, skipped)");

  // --- Roles (same definitions as the platform's ensureSchoolRoles action) ---
  const tenantPermissions = ALL_PERMISSIONS.filter((p) => !p.startsWith("platform."));
  const roleDefs: Record<string, string[]> = {
    "Organization Owner": tenantPermissions,
    "Campus Administrator": tenantPermissions.filter(
      (p) => !p.startsWith("billing.") && !p.startsWith("health.") && !p.startsWith("safeguarding."),
    ),
    Teacher: [
      "student.read", "academics.read", "attendance.read", "attendance.write",
      "exams.read", "exams.enter", "timetable.read", "campus.read", "message.read",
    ],
    "Parent / Guardian": ["message.read"],
  };
  const roleByName: Record<string, string> = {};
  for (const [name, permissions] of Object.entries(roleDefs)) {
    const existing = await prisma.role.findFirst({ where: { tenantId: tenant.id, name } });
    const role = existing ?? (await prisma.role.create({ data: { tenantId: tenant.id, name, permissions } }));
    roleByName[name] = role.id;
  }
  console.log("  roles ready:", Object.keys(roleByName).join(", "));

  // --- Give the existing admin user an Organization Owner role -----------
  const existingUser = await prisma.user.findFirst({ where: { tenantId: tenant.id } });
  if (existingUser) {
    const hasOwnerRole = await prisma.roleAssignment.findFirst({
      where: { userId: existingUser.id, roleId: roleByName["Organization Owner"] },
    });
    if (!hasOwnerRole) {
      await prisma.roleAssignment.create({
        data: { userId: existingUser.id, roleId: roleByName["Organization Owner"], scopeType: "ORG" },
      });
    }
    console.log(`  ${existingUser.email} -> Organization Owner (org-wide)`);
  }

  // --- Academic year + terms ----------------------------------------------
  const year = await prisma.academicYear.create({
    data: {
      tenantId: tenant.id,
      campusId: campus.id,
      name: "2025–2026",
      startDate: new Date("2025-08-15"),
      endDate: new Date("2026-06-15"),
      isCurrent: true,
    },
  });
  await prisma.term.createMany({
    data: [
      { tenantId: tenant.id, academicYearId: year.id, name: "Term 1", startDate: new Date("2025-08-15"), endDate: new Date("2025-12-20") },
      { tenantId: tenant.id, academicYearId: year.id, name: "Term 2", startDate: new Date("2026-01-06"), endDate: new Date("2026-06-15") },
    ],
  });
  console.log("  academic year 2025–2026 + 2 terms");

  // --- Grade levels + sections ---------------------------------------------
  const gradeNames = ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"];
  const grades = [];
  for (let i = 0; i < gradeNames.length; i++) {
    grades.push(await prisma.gradeLevel.create({ data: { tenantId: tenant.id, campusId: campus.id, name: gradeNames[i], rank: i + 1 } }));
  }

  // Teacher (staff + user), homeroom on Grade 3's section.
  const teacherPerson = await prisma.person.create({
    data: { tenantId: tenant.id, firstName: "Nadia", lastName: "Farouk", gender: "FEMALE", email: "teacher@hmssb1.edu" },
  });
  const teacherStaff = await prisma.staff.create({
    data: { tenantId: tenant.id, personId: teacherPerson.id, employeeNumber: "EMP-0001", title: "Class Teacher" },
  });
  const hash = await bcrypt.hash("password123", 10);
  const teacherUser = await prisma.user.create({
    data: { tenantId: tenant.id, personId: teacherPerson.id, email: "teacher@hmssb1.edu", passwordHash: hash, displayName: "Nadia Farouk" },
  });
  await prisma.roleAssignment.create({
    data: { userId: teacherUser.id, roleId: roleByName["Teacher"], scopeType: "CAMPUS", campusId: campus.id },
  });

  const sections = [];
  for (let i = 0; i < grades.length; i++) {
    sections.push(
      await prisma.section.create({
        data: {
          tenantId: tenant.id,
          campusId: campus.id,
          academicYearId: year.id,
          gradeLevelId: grades[i].id,
          name: "Section A",
          capacity: 30,
          homeroomStaffId: i === 2 ? teacherStaff.id : null,
        },
      }),
    );
  }
  console.log(`  ${grades.length} grade levels, ${sections.length} sections, 1 teacher (homeroom: Grade 3)`);

  // --- Attendance codes (tenant-scoped, needed before any register works) ---
  const codeDefs = [
    { code: "P", label: "Present", category: "PRESENT", countsAsPresent: true, notifyGuardian: false },
    { code: "A", label: "Absent", category: "ABSENT", countsAsPresent: false, notifyGuardian: true },
    { code: "L", label: "Late", category: "LATE", countsAsPresent: true, notifyGuardian: true },
    { code: "E", label: "Excused", category: "EXCUSED", countsAsPresent: true, notifyGuardian: false },
  ] as const;
  for (const d of codeDefs) {
    const exists = await prisma.attendanceCode.findFirst({ where: { tenantId: tenant.id, code: d.code } });
    if (!exists) await prisma.attendanceCode.create({ data: { tenantId: tenant.id, ...d } });
  }
  console.log("  attendance codes: P, A, L, E");

  // --- Students + enrollments ----------------------------------------------
  const students: { studentId: string; sectionId: string; name: string }[] = [];
  for (let i = 0; i < 15; i++) {
    const first = FIRST[i % FIRST.length];
    const last = LAST[i % LAST.length];
    const person = await prisma.person.create({
      data: {
        tenantId: tenant.id,
        firstName: first,
        lastName: last,
        gender: i % 2 === 0 ? "FEMALE" : "MALE",
        dateOfBirth: new Date(2016 - (i % 5), (i * 3) % 12, ((i * 7) % 27) + 1),
      },
    });
    const student = await prisma.student.create({
      data: { tenantId: tenant.id, personId: person.id, admissionNumber: `HB1-${String(i + 1).padStart(4, "0")}`, status: "ENROLLED" },
    });
    const section = sections[i % sections.length];
    await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        studentId: student.id,
        campusId: campus.id,
        academicYearId: year.id,
        gradeLevelId: section.gradeLevelId,
        sectionId: section.id,
        rollNumber: i + 1,
        status: "ACTIVE",
        startDate: new Date("2025-08-15"),
      },
    });
    students.push({ studentId: student.id, sectionId: section.id, name: `${first} ${last}` });
  }
  console.log(`  ${students.length} students enrolled across ${sections.length} sections`);

  // --- A guardian linked to the first two students -------------------------
  const parentPerson = await prisma.person.create({
    data: { tenantId: tenant.id, firstName: "Malik", lastName: "Farouk", gender: "MALE", email: "parent@hmssb1.edu", phone: "+1-555-0110" },
  });
  const guardian = await prisma.guardian.create({ data: { tenantId: tenant.id, personId: parentPerson.id, occupation: "Engineer" } });
  const parentUser = await prisma.user.create({
    data: { tenantId: tenant.id, personId: parentPerson.id, email: "parent@hmssb1.edu", passwordHash: hash, displayName: "Malik Farouk" },
  });
  await prisma.roleAssignment.create({ data: { userId: parentUser.id, roleId: roleByName["Parent / Guardian"], scopeType: "ORG" } });
  for (const [i, child] of students.slice(0, 2).entries()) {
    await prisma.guardianRelationship.create({
      data: {
        tenantId: tenant.id,
        guardianId: guardian.id,
        studentId: child.studentId,
        relationship: "FATHER",
        isPrimaryContact: i === 0,
        financiallyResponsible: true,
        receivesNotifications: true,
      },
    });
  }
  console.log(`  guardian ${parentUser.email} linked to 2 students`);

  console.log(`\nDone. Log in as any of:`);
  console.log(`  ${existingUser?.email ?? "(no admin user found)"} — Organization Owner`);
  console.log(`  teacher@hmssb1.edu — Teacher (campus: ${campus.name})`);
  console.log(`  parent@hmssb1.edu — Guardian`);
  console.log(`  (password: password123 for the two new accounts)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
