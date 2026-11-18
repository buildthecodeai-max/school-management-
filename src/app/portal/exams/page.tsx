import Link from "next/link";
import { canAnywhere, requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { allowedCampusIds } from "@/lib/scope";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import type { AssessmentPlanStatus } from "@prisma/client";

const STATUS_TONE: Record<AssessmentPlanStatus, "sky" | "amber" | "brand" | "green"> = {
  OPEN: "sky",
  SUBMITTED: "amber",
  APPROVED: "brand",
  PUBLISHED: "green",
};

export default async function ExamsPage() {
  const ctx = await requirePermission("exams.read");
  const campusIds = allowedCampusIds(ctx, "exams.read");

  const plans = await prisma.assessmentPlan.findMany({
    where: {
      tenantId: ctx.tenantId!,
      ...(campusIds ? { campusId: { in: campusIds } } : {}),
    },
    include: {
      section: { include: { gradeLevel: true, campus: true } },
      term: true,
      _count: { select: { subjects: true, versions: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Assessment & results"
        subtitle="Assessment plans, marks entry and report cards."
        action={
          <div className="flex gap-2">
            <Link href="/portal/exams/schedule" className="rounded-lg bg-white px-3.5 py-2 text-sm font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50">Exam schedules</Link>
            {canAnywhere(ctx, "exams.manage") && <Link href="/portal/exams/new" className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700">New plan</Link>}
          </div>
        }
      />

      {plans.length === 0 ? (
        <EmptyState title="No assessment plans" hint="Create a plan to define components, subjects and who enters marks." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <Link key={p.id} href={`/portal/exams/${p.id}`}>
              <Card className="transition hover:border-brand-300 hover:shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-sm text-[color:var(--color-muted)]">
                      {p.section.gradeLevel.name} · {p.section.name} · {p.section.campus.name}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
                </div>
                <p className="mt-3 text-sm text-[color:var(--color-muted)]">
                  {p.term.name} · {p._count.subjects} subjects
                  {p._count.versions > 0 ? ` · v${p._count.versions} published` : ""}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
