import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, Badge } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";
import { ActionForm, inputCls, labelCls } from "@/components/ActionForm";
import { saveCompetencyRatings, seedDefaultCompetencies } from "../../../scheduling-actions";
import { RATING_LABELS } from "@/lib/competency-labels";

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
  const canRate = canForCampus(ctx, "exams.enter", plan.campusId);
  const canManage = canForCampus(ctx, "exams.manage", plan.campusId);
  const [competencies, ratings] = result
    ? await Promise.all([
        prisma.competency.findMany({ where: { tenantId: ctx.tenantId! }, orderBy: { name: "asc" } }),
        prisma.studentCompetencyRating.findMany({ where: { studentResultId: result.id } }),
      ])
    : [[], []];
  const ratingBy = new Map(ratings.map((r) => [r.competencyId, r]));

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/portal/exams/${id}`} className="text-sm text-brand-700 hover:underline">
          ← Plan
        </Link>
        {version && result && <PrintButton />}
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

          {(ratings.length > 0 || result.conductRemark) && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold">Competencies &amp; conduct</h3>
              <table className="w-full text-sm">
                <tbody>
                  {competencies.filter((c) => ratingBy.has(c.id)).map((c) => {
                    const r = ratingBy.get(c.id)!;
                    return (
                      <tr key={c.id} className="border-b border-[color:var(--color-line)] last:border-0">
                        <td className="py-1.5">{c.name}</td>
                        <td className="py-1.5 text-right font-medium">{RATING_LABELS[r.rating]} ({r.rating}/4)</td>
                        <td className="py-1.5 pl-4 text-[color:var(--color-muted)]">{r.comment}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {result.conductRemark && <p className="mt-2 text-sm"><span className="text-[color:var(--color-muted)]">Conduct: </span>{result.conductRemark}</p>}
            </div>
          )}

          <p className="mt-4 text-xs text-[color:var(--color-muted)]">
            Published {version.publishedAt.toLocaleDateString()} · version {version.version}
            {version.reason ? ` · ${version.reason}` : ""}. This is an
            immutable snapshot of the approved result.
          </p>
        </div>
      )}

      {result && canRate && (
        <div className="card mt-6 p-6 print:hidden">
          <h3 className="mb-3 font-semibold">Record competencies &amp; conduct</h3>
          {competencies.length === 0 ? (
            canManage ? (
              <ActionForm action={seedDefaultCompetencies} submit="Add standard competencies">
                <p className="mb-2 text-sm text-[color:var(--color-muted)]">This school has no competencies yet.</p>
              </ActionForm>
            ) : (
              <p className="text-sm text-[color:var(--color-muted)]">No competencies are configured. Ask an administrator to add them.</p>
            )
          ) : (
            <ActionForm action={saveCompetencyRatings} submit="Save" pendingLabel="Saving…" className="space-y-3">
              <input type="hidden" name="studentResultId" value={result.id} />
              {competencies.map((c) => (
                <div key={c.id} className="grid gap-2 sm:grid-cols-[1fr_9rem_2fr] sm:items-center">
                  <span className="text-sm">{c.name}</span>
                  <select name={`rating:${c.id}`} defaultValue={String(ratingBy.get(c.id)?.rating ?? "")} className={inputCls}>
                    <option value="">Not rated</option>
                    {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} · {RATING_LABELS[n]}</option>)}
                  </select>
                  <input name={`comment:${c.id}`} defaultValue={ratingBy.get(c.id)?.comment ?? ""} maxLength={300} placeholder="Comment (optional)" className={inputCls} />
                </div>
              ))}
              <label className="block">
                <span className={labelCls}>Conduct remark</span>
                <textarea name="conductRemark" defaultValue={result.conductRemark ?? ""} maxLength={500} rows={2} className={inputCls} />
              </label>
            </ActionForm>
          )}
        </div>
      )}
    </div>
  );
}
