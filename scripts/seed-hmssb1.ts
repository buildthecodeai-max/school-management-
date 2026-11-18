import { PrismaClient, type AttendanceCategory } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const FIRST = ["Aisha","Bilal","Fatima","Hassan","Imran","Khadija","Omar","Nadia","Tariq","Zainab","Adeel","Bushra","Farhan","Hira","Jawad","Layla","Muneeb","Nimra","Saad","Uzma","Yusuf","Amina","Usman","Sara","Ali"];
const LAST = ["Ahmed","Butt","Chaudhry","Danish","Farooq","Gilani","Hussain","Iqbal","Javed","Khan","Malik","Nawaz","Qureshi","Raza","Sheikh","Tahir","Umar","Waqas","Yousaf","Zaidi"];

async function main() {
  const hash = await bcrypt.hash("password123", 10);

  // Find hmssb1 tenant
  const tenant = await prisma.tenant.findFirst({ where: { slug: "hmssb1" } });
  if (!tenant) { console.error("hmssb1 tenant not found"); return; }
  console.log("Tenant:", tenant.id, tenant.name);

  // Clean all tenant data before re-seeding (idempotent)
  const tid = tenant.id;
  await prisma.payment.deleteMany({ where: { tenantId: tid } });
  await prisma.invoiceLine.deleteMany({ where: { tenantId: tid } });
  await prisma.invoice.deleteMany({ where: { tenantId: tid } });
  await prisma.feeStructureLine.deleteMany({ where: { tenantId: tid } });
  await prisma.feeStructure.deleteMany({ where: { tenantId: tid } });
  await prisma.feeHead.deleteMany({ where: { tenantId: tid } });
  await prisma.libraryCopy.deleteMany({ where: { tenantId: tid } });
  await prisma.libraryCirculation.deleteMany({ where: { tenantId: tid } });
  await prisma.libraryItem.deleteMany({ where: { tenantId: tid } });
  await prisma.libraryCategory.deleteMany({ where: { tenantId: tid } });
  await prisma.libraryAuthor.deleteMany({ where: { tenantId: tid } });
  await prisma.enrollment.deleteMany({ where: { tenantId: tid } });
  await prisma.student.deleteMany({ where: { tenantId: tid } });
  await prisma.section.deleteMany({ where: { tenantId: tid } });
  await prisma.attendanceCode.deleteMany({ where: { tenantId: tid } });
  await prisma.term.deleteMany({ where: { tenantId: tid } });
  await prisma.academicYear.deleteMany({ where: { tenantId: tid } });
  await prisma.gradeLevel.deleteMany({ where: { tenantId: tid } });
  await prisma.employmentRecord.deleteMany({ where: { tenantId: tid } });
  await prisma.staff.deleteMany({ where: { tenantId: tid } });
  await prisma.leaveType.deleteMany({ where: { tenantId: tid } });
  await prisma.subject.deleteMany({ where: { tenantId: tid } });
  await prisma.position.deleteMany({ where: { tenantId: tid } });
  await prisma.department.deleteMany({ where: { tenantId: tid } });
  const nonAdminUsers = await prisma.user.findMany({ where: { tenantId: tid, email: { not: "admin@diglip.com" } } });
  for (const u of nonAdminUsers) {
    await prisma.roleAssignment.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
    if (u.personId) await prisma.person.delete({ where: { id: u.personId } }).catch(() => {});
  }
  await prisma.roleAssignment.deleteMany({ where: { role: { tenantId: tid } } });
  await prisma.role.deleteMany({ where: { tenantId: tid } });
  await prisma.subscription.deleteMany({ where: { tenantId: tid } });
  await prisma.person.deleteMany({ where: { tenantId: tid } });
  console.log("Cleaned previous data.");

  // Activate tenant + add subscription
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "ACTIVE" } });
  const plan = await prisma.plan.findFirst({ where: { name: { contains: "Professional" } } });
  const existingSub = await prisma.subscription.findFirst({ where: { tenantId: tenant.id } });
  if (!existingSub && plan) {
    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 300 * 86400000),
        seatsInUse: 20,
      },
    });
  }

  // Get or create campus
  let campus = await prisma.campus.findFirst({ where: { tenantId: tenant.id } });
  if (!campus) { console.error("No campus found"); return; }
  console.log("Campus:", campus.id, campus.name);

  // Roles
  const ownerRole = await prisma.role.create({ data: { tenantId: tenant.id, name: "Organization Owner", description: "Full access.", permissions: ["*"] } });
  const adminRole = await prisma.role.create({ data: { tenantId: tenant.id, name: "Campus Administrator", description: "Campus management.", permissions: ["campus.read","setup.read","data.import","admissions.read","admissions.write","admissions.decide","admissions.convert","student.read","student.write","guardian.read","guardian.write","academics.read","academics.write","attendance.read","attendance.write","fee.read","fee.bill","fee.collect","fee.adjust","hr.staff.read","hr.leave.approve","hr.payroll.read","hr.payroll.write","library.read","library.circulate","inventory.read","transport.read","calendar.read","message.read","message.write","reports.read","exams.read","exams.write","exams.publish","finance.read","billing.read","integrations.manage","safeguarding.case.read","safeguarding.case.write","health.record.read","health.record.write","health.incident.write"] } });
  const teacherRole = await prisma.role.create({ data: { tenantId: tenant.id, name: "Teacher", description: "Teaching staff.", permissions: ["student.read","academics.read","academics.write","attendance.read","attendance.write","exams.read","exams.write","exams.publish","message.read","calendar.read","library.read"] } });

  // Fix existing admin user
  const existingAdmin = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: "admin@diglip.com" } });
  if (existingAdmin) {
    await prisma.user.update({ where: { id: existingAdmin.id }, data: { displayName: "Hashmat Admin" } });
    await prisma.roleAssignment.create({ data: { userId: existingAdmin.id, roleId: ownerRole.id, scopeType: "ORG" } });
  }

  // Academic year
  const year = await prisma.academicYear.create({
    data: {
      tenantId: tenant.id, campusId: campus.id,
      name: "2025–2026",
      startDate: new Date("2025-08-15"), endDate: new Date("2026-06-15"),
      isCurrent: true,
    },
  });
  await prisma.term.createMany({
    data: [
      { tenantId: tenant.id, academicYearId: year.id, name: "Term 1", startDate: new Date("2025-08-15"), endDate: new Date("2025-12-20") },
      { tenantId: tenant.id, academicYearId: year.id, name: "Term 2", startDate: new Date("2026-01-06"), endDate: new Date("2026-06-15") },
    ],
  });

  // Grades
  const gradeNames = ["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6"];
  const grades = [];
  for (let i = 0; i < gradeNames.length; i++) {
    grades.push(await prisma.gradeLevel.create({ data: { tenantId: tenant.id, campusId: campus.id, name: gradeNames[i], rank: i+1 } }));
  }

  // Departments + positions
  const deptTeaching = await prisma.department.create({ data: { tenantId: tenant.id, campusId: campus.id, name: "Teaching" } });
  const deptAdmin = await prisma.department.create({ data: { tenantId: tenant.id, campusId: campus.id, name: "Administration" } });
  const posTeacher = await prisma.position.create({ data: { tenantId: tenant.id, departmentId: deptTeaching.id, title: "Class Teacher" } });
  const posMath = await prisma.position.create({ data: { tenantId: tenant.id, departmentId: deptTeaching.id, title: "Mathematics Teacher" } });
  const posPrincipal = await prisma.position.create({ data: { tenantId: tenant.id, departmentId: deptAdmin.id, title: "Principal" } });
  const posCoordinator = await prisma.position.create({ data: { tenantId: tenant.id, departmentId: deptAdmin.id, title: "Academic Coordinator" } });

  // Teachers
  const teachers = [
    { first: "Zahid", last: "Mehmood", email: "zahid@hmssb1.edu", pos: posTeacher.id, empNo: "HMSSB1-001" },
    { first: "Asma", last: "Malik", email: "asma@hmssb1.edu", pos: posMath.id, empNo: "HMSSB1-002" },
    { first: "Tariq", last: "Hassan", email: "tariq@hmssb1.edu", pos: posTeacher.id, empNo: "HMSSB1-003" },
    { first: "Nadia", last: "Butt", email: "nadia@hmssb1.edu", pos: posCoordinator.id, empNo: "HMSSB1-004" },
    { first: "Jawad", last: "Ahmed", email: "principal@hmssb1.edu", pos: posPrincipal.id, empNo: "HMSSB1-005" },
  ];
  const staffRecords = [];
  for (const t of teachers) {
    const person = await prisma.person.create({ data: { tenantId: tenant.id, firstName: t.first, lastName: t.last, gender: "MALE", email: t.email } });
    const staff = await prisma.staff.create({ data: { tenantId: tenant.id, personId: person.id, employeeNumber: t.empNo, title: t.pos === posPrincipal.id ? "Principal" : "Teacher" } });
    await prisma.employmentRecord.create({ data: { tenantId: tenant.id, campusId: campus.id, staffId: staff.id, positionId: t.pos, startDate: new Date("2023-09-01"), contractType: "PERMANENT", salary: 450000 } });
    const user = await prisma.user.create({ data: { tenantId: tenant.id, personId: person.id, email: t.email, passwordHash: hash, displayName: `${t.first} ${t.last}` } });
    await prisma.roleAssignment.create({ data: { userId: user.id, roleId: teacherRole.id, scopeType: "CAMPUS", campusId: campus.id } });
    staffRecords.push({ staffId: staff.id, personId: person.id });
  }

  // Sections (one per grade, first teacher as homeroom for grade 1-3)
  const sections = [];
  for (let i = 0; i < grades.length; i++) {
    sections.push(await prisma.section.create({
      data: {
        tenantId: tenant.id, campusId: campus.id, academicYearId: year.id,
        gradeLevelId: grades[i].id, name: "Section A", capacity: 30,
        homeroomStaffId: i < 3 ? staffRecords[i % staffRecords.length].staffId : null,
      },
    }));
  }

  // Attendance codes
  const codeDefs: { code: string; label: string; category: AttendanceCategory; countsAsPresent: boolean; notifyGuardian: boolean }[] = [
    { code: "P", label: "Present", category: "PRESENT", countsAsPresent: true, notifyGuardian: false },
    { code: "A", label: "Absent", category: "ABSENT", countsAsPresent: false, notifyGuardian: true },
    { code: "L", label: "Late", category: "LATE", countsAsPresent: true, notifyGuardian: true },
    { code: "E", label: "Excused", category: "EXCUSED", countsAsPresent: true, notifyGuardian: false },
  ];
  for (const c of codeDefs) {
    await prisma.attendanceCode.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: c.code } },
      create: { tenantId: tenant.id, ...c },
      update: {},
    });
  }

  // Students
  const students: { studentId: string; sectionId: string; name: string }[] = [];
  for (let i = 0; i < 24; i++) {
    const first = FIRST[i % FIRST.length];
    const last = LAST[i % LAST.length];
    const dob = new Date(2016 - (i % 6), (i * 3) % 12, ((i * 7) % 27) + 1);
    const person = await prisma.person.create({ data: { tenantId: tenant.id, firstName: first, lastName: last, gender: i % 2 === 0 ? "FEMALE" : "MALE", dateOfBirth: dob } });
    const student = await prisma.student.create({ data: { tenantId: tenant.id, personId: person.id, admissionNumber: `HB1-${String(i+1).padStart(4,"0")}`, status: "ENROLLED" } });
    const section = sections[i % sections.length];
    await prisma.enrollment.create({
      data: { tenantId: tenant.id, studentId: student.id, campusId: campus.id, academicYearId: year.id, gradeLevelId: section.gradeLevelId, sectionId: section.id, rollNumber: i+1, status: "ACTIVE", startDate: new Date("2025-08-15") },
    });
    students.push({ studentId: student.id, sectionId: section.id, name: `${first} ${last}` });
  }

  // Leave types
  const leaveTypes = [
    { name: "Sick Leave", daysPerYear: 10 },
    { name: "Annual Leave", daysPerYear: 21 },
    { name: "Emergency Leave", daysPerYear: 3 },
    { name: "Study Leave", daysPerYear: 5 },
  ];
  for (const lt of leaveTypes) {
    await prisma.leaveType.create({ data: { tenantId: tenant.id, name: lt.name, daysPerYear: lt.daysPerYear } });
  }

  // Subjects
  const subjectNames = ["Mathematics","English","Science","Urdu","Social Studies","Islamic Studies","Computer Science","Art & Craft","Physical Education"];
  const subjects = [];
  for (const name of subjectNames) {
    subjects.push(await prisma.subject.create({ data: { tenantId: tenant.id, campusId: campus.id, name, code: name.slice(0,3).toUpperCase() + "-101" } }));
  }

  // Fee structure
  const feeHead1 = await prisma.feeHead.create({ data: { tenantId: tenant.id, name: "Tuition Fee", code: "TUI", glAccountCode: "4001" } });
  const feeHead2 = await prisma.feeHead.create({ data: { tenantId: tenant.id, name: "Transport Fee", code: "TRP", glAccountCode: "4002" } });
  const feeHead3 = await prisma.feeHead.create({ data: { tenantId: tenant.id, name: "Lab / Activity Fee", code: "ACT", glAccountCode: "4003" } });

  const feeStructure = await prisma.feeStructure.create({
    data: {
      tenantId: tenant.id, campusId: campus.id, name: "Standard Annual Fee 2025–26",
      academicYearId: year.id, active: true,
      lines: {
        create: [
          { tenantId: tenant.id, feeHeadId: feeHead1.id, amount: 500000 },
          { tenantId: tenant.id, feeHeadId: feeHead2.id, amount: 200000 },
          { tenantId: tenant.id, feeHeadId: feeHead3.id, amount: 50000 },
        ],
      },
    },
  });

  // Generate a few invoices for the first 5 students
  for (let i = 0; i < 5; i++) {
    const s = students[i];
    const total = 750000; // PKR 7500
    const inv = await prisma.invoice.create({
      data: {
        tenantId: tenant.id, campusId: campus.id, studentId: s.studentId,
        feeStructureId: feeStructure.id,
        number: `INV-HB1-${String(i+1).padStart(4,"0")}`,
        periodLabel: "September 2025",
        total, balance: i === 0 ? 0 : total,
        discountTotal: 0, taxTotal: 0,
        dueDate: new Date("2025-09-30"),
        status: i === 0 ? "PAID" : "OPEN",
        lines: {
          create: [
            { tenantId: tenant.id, feeHeadId: feeHead1.id, description: "Monthly Tuition Fee", amount: 500000 },
            { tenantId: tenant.id, feeHeadId: feeHead2.id, description: "Monthly Transport Fee", amount: 200000 },
            { tenantId: tenant.id, feeHeadId: feeHead3.id, description: "Monthly Activity Fee", amount: 50000 },
          ],
        },
      },
    });
    if (i === 0) {
      // Add a payment for the first student
      const payment = await prisma.payment.create({
        data: {
          tenantId: tenant.id, campusId: campus.id, studentId: s.studentId,
          number: `PAY-HB1-0001`,
          amount: total, method: "CASH",
          status: "CONFIRMED",
          receivedAt: new Date("2025-09-05"),
        },
      });
      await prisma.allocation.create({
        data: { tenantId: tenant.id, invoiceId: inv.id, paymentId: payment.id, amount: total },
      });
    }
  }

  // Library: books
  const libCat1 = await prisma.libraryCategory.create({ data: { tenantId: tenant.id, campusId: campus.id, name: "Science & Nature" } });
  const libCat2 = await prisma.libraryCategory.create({ data: { tenantId: tenant.id, campusId: campus.id, name: "Mathematics" } });
  const libCat3 = await prisma.libraryCategory.create({ data: { tenantId: tenant.id, campusId: campus.id, name: "Islamic Studies" } });
  const libCat4 = await prisma.libraryCategory.create({ data: { tenantId: tenant.id, campusId: campus.id, name: "Literature" } });
  const author1 = await prisma.libraryAuthor.create({ data: { tenantId: tenant.id, name: "Dr. Abdul Qadeer" } });
  const author2 = await prisma.libraryAuthor.create({ data: { tenantId: tenant.id, name: "Prof. Naseem Khan" } });
  const author3 = await prisma.libraryAuthor.create({ data: { tenantId: tenant.id, name: "Allama Iqbal" } });

  const books = [
    { title: "Elements of Mathematics", cat: libCat2.id, author: author2.id, isbn: "978-969-001-01-1", barcodes: ["HB1-LIB-001","HB1-LIB-002","HB1-LIB-003"] },
    { title: "Discover Science Grade 5", cat: libCat1.id, author: author1.id, isbn: "978-969-001-02-2", barcodes: ["HB1-LIB-004","HB1-LIB-005"] },
    { title: "Kulliyat-e-Iqbal", cat: libCat3.id, author: author3.id, isbn: "978-969-001-03-3", barcodes: ["HB1-LIB-006","HB1-LIB-007","HB1-LIB-008"] },
    { title: "English Grammar Mastery", cat: libCat4.id, author: author2.id, isbn: "978-969-001-04-4", barcodes: ["HB1-LIB-009","HB1-LIB-010"] },
    { title: "Atlas of Pakistan", cat: libCat1.id, author: author1.id, isbn: "978-969-001-05-5", barcodes: ["HB1-LIB-011","HB1-LIB-012","HB1-LIB-013"] },
    { title: "Introduction to Computer Science", cat: libCat2.id, author: author2.id, isbn: "978-969-001-06-6", barcodes: ["HB1-LIB-014","HB1-LIB-015"] },
  ];
  for (const b of books) {
    const item = await prisma.libraryItem.create({ data: { tenantId: tenant.id, campusId: campus.id, categoryId: b.cat, authorId: b.author, title: b.title, isbn: b.isbn } });
    for (let j = 0; j < b.barcodes.length; j++) {
      await prisma.libraryCopy.create({ data: { tenantId: tenant.id, itemId: item.id, barcode: b.barcodes[j], status: j === 0 ? "ISSUED" : "AVAILABLE" } });
    }
  }

  // Health record for first student
  await prisma.healthRecord.create({
    data: { tenantId: tenant.id, campusId: campus.id, studentId: students[0].studentId, allergies: "None known", conditions: "None", emergencyContact: "Father — 0300-1234567" },
  });

  console.log(`\n✓ Seeded Hashmat b1 campus:`);
  console.log(`  ${teachers.length} teachers/staff`);
  console.log(`  ${students.length} students across ${sections.length} sections`);
  console.log(`  ${books.length} library books`);
  console.log(`  5 invoices (1 paid)`);
  console.log(`  Fee structure: Standard Annual Fee 2025–26`);
  console.log(`\nLogin: admin@diglip.com / password123 (owner)`);
  console.log(`       zahid@hmssb1.edu / password123 (teacher)`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
