import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
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
      />

      {plans.length === 0 ? (
        <EmptyState title="No assessment plans" hint="Assessment plans appear here once created." />
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
