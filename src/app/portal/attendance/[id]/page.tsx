import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { allowedCampusIds } from "@/lib/scope";
import { dayStart, dayEnd } from "@/lib/dates";
import { PageHeader, Badge } from "@/components/ui";
import { RegisterForm } from "./RegisterForm";

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requirePermission("attendance.read");
  const { id } = await params;

  const section = await prisma.section.findFirst({
    where: { id, tenantId: ctx.tenantId! },
    include: { campus: true, gradeLevel: true },
  });
  if (!section) notFound();

  // Campus scope check
  const allowed = allowedCampusIds(ctx, "attendance.read");
  if (allowed && !allowed.includes(section.campusId)) notFound();

  const [enrollments, codes, session] = await Promise.all([
    prisma.enrollment.findMany({
      where: { sectionId: section.id, status: "ACTIVE" },
      include: { student: { include: { person: true } } },
      orderBy: { rollNumber: "asc" },
    }),
    prisma.attendanceCode.findMany({
      where: { tenantId: ctx.tenantId! },
      orderBy: { code: "asc" },
    }),
    prisma.attendanceSession.findUnique({
      where: {
        sectionId_date_period: {
          sectionId: section.id,
          date: dayStart(),
          period: "DAY",
        },
      },
      include: { records: true },
    }),
  ]);

  const existingMarks: Record<string, string> = {};
  session?.records.forEach((r) => {
    existingMarks[r.studentId] = r.codeId;
  });

  const canWrite = canForCampus(ctx, "attendance.write", section.campusId);
  const canAmend = canForCampus(ctx, "attendance.amend", section.campusId);
  const status = session?.status ?? "NOT_STARTED";
  const locked = status === "LOCKED";
  const editable = canWrite && (!locked || canAmend);

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/portal/attendance"
          className="text-sm text-brand-700 hover:underline"
        >
          ← All registers
        </Link>
      </div>

      <PageHeader
        title={`${section.gradeLevel.name} · ${section.name}`}
        subtitle={`${section.campus.name} · ${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`}
        action={
          <Badge
            tone={
              locked
                ? "slate"
                : status === "SUBMITTED"
                  ? "green"
                  : status === "DRAFT"
                    ? "amber"
                    : "sky"
            }
          >
            {status === "NOT_STARTED" ? "Not started" : status}
          </Badge>
        }
      />

      {locked && !canAmend && (
        <div className="mb-4 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">
          This register is locked. You can view it, but amending a locked
          register requires approval rights.
        </div>
      )}

      <RegisterForm
        sectionId={section.id}
        editable={editable}
        codes={codes.map((c) => ({
          id: c.id,
          code: c.code,
          label: c.label,
          category: c.category,
        }))}
        students={enrollments.map((e) => ({
          id: e.student.id,
          roll: e.rollNumber,
          name: `${e.student.person.firstName} ${e.student.person.lastName}`,
          admissionNumber: e.student.admissionNumber,
        }))}
        initialMarks={existingMarks}
      />
    </div>
  );
}
