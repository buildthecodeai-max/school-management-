import Link from "next/link";
import { canForCampus, requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { preferredCampusId, resolveCampusId } from "@/lib/campus-preference";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ACTIVE_STAGES, stageLabel } from "@/lib/recruitment";
import { NewOpeningForm } from "./RecruitmentForms";

export const metadata = { title: "Recruitment" };

const statusTone = { OPEN: "green", ON_HOLD: "amber", CLOSED: "slate", FILLED: "sky" } as const;

export default async function RecruitmentPage({
  searchParams,
}: {
  searchParams: Promise<{ campusId?: string }>;
}) {
  const ctx = await requirePermission("hr.recruit.read");
  const params = await searchParams;

  const campuses = await prisma.campus.findMany({
    where: { tenantId: ctx.tenantId!, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });
  const accessible = campuses.filter((c) => canForCampus(ctx, "hr.recruit.read", c.id));
  const preferred = await preferredCampusId(ctx, "hr.recruit.read");
  const campusId = resolveCampusId(params.campusId, preferred, accessible);
  const canWrite = campusId ? canForCampus(ctx, "hr.recruit.write", campusId) : false;

  const [openings, positions] = campusId
    ? await Promise.all([
        prisma.jobOpening.findMany({
          where: { tenantId: ctx.tenantId!, campusId },
          include: { applicants: { select: { stage: true } }, position: { select: { title: true } } },
          orderBy: { createdAt: "desc" },
        }),
        prisma.position.findMany({
          where: { tenantId: ctx.tenantId!, department: { campusId } },
          include: { department: true },
          orderBy: { title: "asc" },
        }),
      ])
    : [[], []];

  const rank = { OPEN: 0, ON_HOLD: 1, FILLED: 2, CLOSED: 3 } as const;
  const sorted = [...openings].sort((a, b) => rank[a.status] - rank[b.status]);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/portal/hr" className="text-sm text-brand-700 hover:underline">← Human resources</Link>
      </div>
      <PageHeader title="Recruitment" subtitle="Job openings and applicant pipeline." />

      <div className="flex flex-wrap gap-2">
        {accessible.map((c) => (
          <Link
            key={c.id}
            href={`/portal/hr/recruitment?campusId=${c.id}`}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${
              c.id === campusId ? "border-indigo-600 bg-indigo-600 text-white" : "border-gray-300 hover:bg-gray-50"
            }`}
          >
            {c.name}
          </Link>
        ))}
      </div>

      {canWrite && campusId && (
        <NewOpeningForm
          campusId={campusId}
          positions={positions.map((p) => ({ id: p.id, title: p.title, departmentName: p.department.name }))}
        />
      )}

      {sorted.length === 0 ? (
        <EmptyState title="No job openings" hint={canWrite ? "Create an opening to start tracking applicants." : undefined} />
      ) : (
        <div className="space-y-3">
          {sorted.map((o) => {
            const counts = Object.fromEntries(ACTIVE_STAGES.map((s) => [s, o.applicants.filter((a) => a.stage === s).length]));
            const hired = o.applicants.filter((a) => a.stage === "HIRED").length;
            return (
              <Link key={o.id} href={`/portal/hr/recruitment/${o.id}`} className="block">
                <Card className={`transition hover:border-brand-300 hover:shadow-sm ${o.status === "CLOSED" ? "opacity-70" : ""}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{o.title}</p>
                      <p className="text-sm text-[color:var(--color-muted)]">
                        {o.position?.title ?? "No linked position"} · {hired}/{o.headcount} filled
                        {o.closesAt ? ` · closes ${o.closesAt.toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <Badge tone={statusTone[o.status]}>{o.status.replace("_", " ")}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-[color:var(--color-muted)]">
                    {ACTIVE_STAGES.map((s) => (
                      <span key={s}>{stageLabel(s)}: <strong className="text-[color:inherit]">{counts[s]}</strong></span>
                    ))}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
