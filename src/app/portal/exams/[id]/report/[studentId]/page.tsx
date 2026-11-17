import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, Badge } from "@/components/ui";

// Authorize: staff with exams.read on the campus, the student themselves, or a
// guardian linked to the student.
async function authorize(
  ctx: Awaited<ReturnType<typeof requireUser>>,
  campusId: string,
  student: { personId: string; id: string },
) {
  if (canForCampus(ctx, "exams.read", campusId)) return true;
  const personId = ctx.user.personId;
  if (!personId) return false;
  if (student.personId === personId) return true;
  const guardian = await prisma.guardian.findUnique({ where: { personId } });
  if (!guardian) return false;
  const rel = await prisma.guardianRelationship.findFirst({
    where: { guardianId: guardian.id, studentId: student.id },
  });
  return !!rel;
}

export default async function ReportCardPage({
  params,
}: {
  params: Promise<{ id: string; studentId: string }>;
}) {
  const ctx = await requireUser();
  const { id, studentId } = await params;

  const plan = await prisma.assessmentPlan.findFirst({
    where: { id, tenantId: ctx.tenantId! },
    include: { section: { include: { gradeLevel: true, campus: true } }, term: true },
  });
  if (!plan) notFound();

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: ctx.tenantId! },
    include: { person: true },
  });
  if (!student) notFound();

  if (!(await authorize(ctx, plan.campusId, student))) notFound();

  const version = await prisma.resultVersion.findFirst({
    where: { planId: id, status: "PUBLISHED" },
    orderBy: { version: "desc" },
    include: {
      results: {
        where: { studentId },
        include: { lines: true },
      },
    },
  });
  const result = version?.results[0];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <Link href={`/portal/exams/${id}`} className="text-sm text-brand-700 hover:underline">
          ← Plan
        </Link>
      </div>

      {!version || !result ? (
        <Card>
          <p className="text-sm text-[color:var(--color-muted)]">
            No published report card is available for this student yet.
          </p>
        </Card>
      ) : (
        <div className="card p-8">
          <div className="flex items-start justify-between border-b border-[color:var(--color-line)] pb-4">
            <div>
              <p className="text-sm text-[color:var(--color-muted)]">{plan.section.campus.name}</p>
              <h1 className="text-2xl font-semibold">Report card</h1>
              <p className="text-sm text-[color:var(--color-muted)]">
                {plan.name} · {plan.term.name}
              </p>
            </div>
            <Badge tone="green">v{version.version}</Badge>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-[color:var(--color-muted)]">Student</p>
              <p className="font-medium">{student.person.firstName} {student.person.lastName}</p>
            </div>
            <div>
              <p className="text-xs text-[color:var(--color-muted)]">Class</p>
              <p className="font-medium">{plan.section.gradeLevel.name} · {plan.section.name}</p>
            </div>
            <div>
              <p className="text-xs text-[color:var(--color-muted)]">Admission no.</p>
              <p className="font-medium">{student.admissionNumber}</p>
            </div>
            <div>
              <p className="text-xs text-[color:var(--color-muted)]">Class rank</p>
              <p className="font-medium">{result.rank ?? "—"}</p>
            </div>
          </div>

          <table className="mt-6 w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-line)] text-left text-xs uppercase tracking-wide text-[color:var(--color-muted)]">
                <th className="py-2 font-medium">Subject</th>
                <th className="py-2 text-right font-medium">Percent</th>
                <th className="py-2 text-right font-medium">Grade</th>
              </tr>
            </thead>
            <tbody>
              {result.lines.map((l) => (
                <tr key={l.id} className="border-b border-[color:var(--color-line)] last:border-0">
                  <td className="py-2">{l.subjectName}</td>
                  <td className="py-2 text-right">{l.percent}%</td>
                  <td className="py-2 text-right font-medium">{l.grade}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-6 flex items-center justify-between rounded-lg bg-slate-50 p-4">
            <div>
              <p className="text-xs text-[color:var(--color-muted)]">Overall</p>
              <p className="text-2xl font-semibold">{result.overallPercent}% · {result.overallGrade}</p>
            </div>
            <Badge tone={result.passed ? "green" : "red"}>{result.passed ? "Promoted / Pass" : "Not passed"}</Badge>
          </div>

          <p className="mt-4 text-xs text-[color:var(--color-muted)]">
            Published {version.publishedAt.toLocaleDateString()} · version {version.version}
            {version.reason ? ` · ${version.reason}` : ""}. This is an
            immutable snapshot of the approved result.
          </p>
        </div>
      )}
    </div>
  );
}
