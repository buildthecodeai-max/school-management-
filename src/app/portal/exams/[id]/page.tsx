import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, canForCampus } from "@/lib/rbac";
import { allowedCampusIds } from "@/lib/scope";
import { prisma } from "@/lib/db";
import { computePlanResults } from "@/lib/exams-server";
import { PageHeader, Card, Badge } from "@/components/ui";
import { MarksGrid } from "./MarksGrid";
import { setPlanStatus, publishResults } from "../actions";
import { ActionForm } from "@/components/ActionForm";

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requirePermission("exams.read");
  const { id } = await params;

  const data = await computePlanResults(ctx.tenantId!, id);
  if (!data) notFound();
  const { plan, students, computed, missing } = data;

  const allowed = allowedCampusIds(ctx, "exams.read");
  if (allowed && !allowed.includes(plan.campusId)) notFound();

  const canEnter = canForCampus(ctx, "exams.enter", plan.campusId);
  const canManage = canForCampus(ctx, "exams.manage", plan.campusId);
  const canApprove = canForCampus(ctx, "exams.approve", plan.campusId);
  const editable = plan.status === "OPEN" && (canEnter || canManage);

  const [marks, enrollments] = await Promise.all([
    prisma.markEntry.findMany({ where: { planId: id } }),
    prisma.enrollment.findMany({
      where: { sectionId: plan.sectionId, status: "ACTIVE" },
      select: { studentId: true, rollNumber: true },
    }),
  ]);
  const rollBy = new Map(enrollments.map((e) => [e.studentId, e.rollNumber]));
  const nameBy = new Map(students.map((s) => [s.id, `${s.person.firstName} ${s.person.lastName}`]));

  const initial: Record<string, { value: string; status: "NORMAL" | "ABSENT" | "EXEMPT" }> = {};
  for (const m of marks) {
    initial[`${m.subjectId}:${m.studentId}:${m.componentId}`] = {
      value: m.marks != null ? String(m.marks) : "",
      status: m.status,
    };
  }

  const latestVersion = await prisma.resultVersion.findFirst({
    where: { planId: id },
    orderBy: { version: "desc" },
  });

  return (
    <div>
      <div className="mb-4">
        <Link href="/portal/exams" className="text-sm text-brand-700 hover:underline">
          ← Assessment plans
        </Link>
      </div>

      <PageHeader
        title={plan.name}
        subtitle={`${plan.section.gradeLevel.name} · ${plan.section.name} · ${plan.section.campus.name} · ${plan.term.name}`}
        action={
          <Badge tone={plan.status === "PUBLISHED" ? "green" : plan.status === "APPROVED" ? "brand" : plan.status === "SUBMITTED" ? "amber" : "sky"}>
            {plan.status}
          </Badge>
        }
      />

      {/* Workflow bar */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            {plan.components.map((c) => (
              <span key={c.id} className="rounded bg-slate-100 px-2 py-0.5 text-xs">
                {c.name} · {c.weight}% · /{c.maxMarks}
              </span>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {missing > 0 ? (
              <span className="text-xs text-amber-600">{missing} mark(s) missing</span>
            ) : (
              <span className="text-xs text-green-600">All marks entered</span>
            )}

            {plan.status === "SUBMITTED" && canApprove && (
              <ActionForm action={setPlanStatus} submit="Approve">
                <input type="hidden" name="planId" value={plan.id} />
                <input type="hidden" name="status" value="APPROVED" />
              </ActionForm>
            )}
            {plan.status === "APPROVED" && canApprove && (
              <ActionForm action={publishResults} submit="Publish results" confirmText="Publish these results and notify guardians?">
                <input type="hidden" name="planId" value={plan.id} />
                <input type="hidden" name="reason" value={latestVersion ? "Correction" : ""} />
              </ActionForm>
            )}
            {plan.status !== "OPEN" && canApprove && (
              <ActionForm action={setPlanStatus} submit="Reopen" variant="ghost" className="flex items-center gap-2">
                <input type="hidden" name="planId" value={plan.id} />
                <input type="hidden" name="status" value="OPEN" />
                <input name="reason" required minLength={5} maxLength={300} placeholder="Reason for reopening" className="rounded-lg border border-[color:var(--color-line)] px-2 py-1.5 text-sm" />
              </ActionForm>
            )}
          </div>
        </div>
      </Card>

      {/* Marks grid */}
      <div className="mb-6">
        <h3 className="mb-2 font-semibold">Marks entry</h3>
        <MarksGrid
          planId={plan.id}
          editable={editable}
          subjects={plan.subjects.map((ps) => ({ id: ps.subjectId, name: ps.subject.name }))}
          components={plan.components.map((c) => ({ id: c.id, name: c.name, maxMarks: c.maxMarks, weight: c.weight }))}
          students={students.map((s) => ({ id: s.id, name: nameBy.get(s.id)!, roll: rollBy.get(s.id) ?? null }))}
          initial={initial}
        />
        {!editable && plan.status !== "OPEN" && (
          <p className="mt-2 text-xs text-[color:var(--color-muted)]">
            Marks entry is closed while the plan is {plan.status.toLowerCase()}.
          </p>
        )}
      </div>

      {/* Computed result preview */}
      <Card className="p-0">
        <div className="flex items-center justify-between p-5 pb-2">
          <h3 className="font-semibold">
            {plan.status === "PUBLISHED" ? "Published results" : "Result preview (not yet published)"}
          </h3>
          {latestVersion && <Badge tone="green">v{latestVersion.version} published</Badge>}
        </div>
        <div className="overflow-x-auto px-5 pb-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-line)] text-left text-xs uppercase tracking-wide text-[color:var(--color-muted)]">
                <th className="py-2 pr-4 font-medium">Rank</th>
                <th className="py-2 pr-4 font-medium">Student</th>
                {plan.subjects.map((ps) => (
                  <th key={ps.subjectId} className="py-2 pr-4 font-medium">{ps.subject.name}</th>
                ))}
                <th className="py-2 pr-4 font-medium">Overall</th>
                <th className="py-2 pr-4 font-medium">Grade</th>
                <th className="py-2 pr-4 font-medium">Result</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {[...computed].sort((a, b) => a.rank - b.rank).map((r) => (
                <tr key={r.studentId} className="border-b border-[color:var(--color-line)] last:border-0">
                  <td className="py-2 pr-4 font-semibold">{r.rank}</td>
                  <td className="py-2 pr-4 font-medium">{nameBy.get(r.studentId)}</td>
                  {plan.subjects.map((ps) => {
                    const line = r.lines.find((l) => l.subjectId === ps.subjectId);
                    return (
                      <td key={ps.subjectId} className="py-2 pr-4">
                        {line ? `${line.percent}% (${line.grade})` : "—"}
                      </td>
                    );
                  })}
                  <td className="py-2 pr-4 font-medium">{r.overallPercent}%</td>
                  <td className="py-2 pr-4">{r.overallGrade}</td>
                  <td className="py-2 pr-4">
                    <Badge tone={r.passed ? "green" : "red"}>{r.passed ? "Pass" : "Fail"}</Badge>
                  </td>
                  <td className="py-2">
                    {plan.status === "PUBLISHED" && (
                      <Link href={`/portal/exams/${plan.id}/report/${r.studentId}`} className="text-brand-700 hover:underline">
                        Report card
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
