import Link from "next/link";
import { notFound } from "next/navigation";
import { canForCampus, requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ACTIVE_STAGES, CLOSED_STAGES, stageLabel } from "@/lib/recruitment";
import { AddApplicantForm, ApplicantControls, OpeningStatusControl } from "../RecruitmentForms";

const statusTone = { OPEN: "green", ON_HOLD: "amber", CLOSED: "slate", FILLED: "sky" } as const;
const stageTone = { APPLIED: "slate", SCREENING: "sky", INTERVIEW: "amber", OFFER: "brand", HIRED: "green", REJECTED: "red", WITHDRAWN: "slate" } as const;

export default async function OpeningPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("hr.recruit.read");
  const { id } = await params;

  const opening = await prisma.jobOpening.findFirst({
    where: { id, tenantId: ctx.tenantId! },
    include: {
      campus: { select: { name: true } },
      position: { select: { title: true } },
      applicants: {
        include: { events: { orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!opening || !canForCampus(ctx, "hr.recruit.read", opening.campusId)) notFound();

  const canWrite = canForCampus(ctx, "hr.recruit.write", opening.campusId);
  const canHire = canWrite && canForCampus(ctx, "hr.staff.write", opening.campusId);

  const positions = await prisma.position.findMany({
    where: { tenantId: ctx.tenantId!, department: { campusId: opening.campusId } },
    include: { department: true },
    orderBy: { title: "asc" },
  });
  const positionOptions = positions.map((p) => ({ id: p.id, title: p.title, departmentName: p.department.name }));

  const hired = opening.applicants.filter((a) => a.stage === "HIRED").length;
  const closedApplicants = opening.applicants.filter((a) => CLOSED_STAGES.includes(a.stage));

  const card = (a: (typeof opening.applicants)[number]) => (
    <div key={a.id} className="rounded-lg border border-[color:var(--color-line)] bg-white p-3 text-sm">
      <p className="font-medium">{a.firstName} {a.lastName}</p>
      <p className="break-all text-xs text-[color:var(--color-muted)]">{a.email}{a.phone ? ` · ${a.phone}` : ""}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-muted)]">
        {a.source && <span>via {a.source}</span>}
        {a.rating && <span aria-label={`Rating ${a.rating} of 5`}>{"★".repeat(a.rating)}{"☆".repeat(5 - a.rating)}</span>}
      </div>
      {a.coverNote && (
        <details className="mt-1 text-xs">
          <summary className="cursor-pointer text-brand-700">Notes</summary>
          <p className="mt-1 whitespace-pre-line text-[color:var(--color-muted)]">{a.coverNote}</p>
        </details>
      )}
      <details className="mt-1 text-xs">
        <summary className="cursor-pointer text-brand-700">History</summary>
        <ul className="mt-1 space-y-0.5 text-[color:var(--color-muted)]">
          {a.events.map((e) => (
            <li key={e.id}>
              {e.createdAt.toLocaleDateString()} · {e.fromStage ? `${stageLabel(e.fromStage)} → ` : ""}{stageLabel(e.toStage)}{e.note ? ` — ${e.note}` : ""}
            </li>
          ))}
        </ul>
      </details>
      {canWrite && (
        <ApplicantControls
          applicantId={a.id}
          stage={a.stage}
          rating={a.rating}
          canHire={canHire}
          positions={positionOptions}
          defaultPositionId={opening.positionId}
        />
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <Link href={`/portal/hr/recruitment?campusId=${opening.campusId}`} className="text-sm text-brand-700 hover:underline">
        ← Openings
      </Link>
      <PageHeader
        title={opening.title}
        subtitle={`${opening.campus.name} · ${opening.position?.title ?? "No linked position"} · ${hired}/${opening.headcount} filled${opening.closesAt ? ` · closes ${opening.closesAt.toLocaleDateString()}` : ""}`}
        action={<Badge tone={statusTone[opening.status]}>{opening.status.replace("_", " ")}</Badge>}
      />
      {opening.description && (
        <Card><p className="whitespace-pre-line text-sm">{opening.description}</p></Card>
      )}

      {canWrite && (
        <div className="space-y-3">
          <OpeningStatusControl openingId={opening.id} status={opening.status} />
          {opening.status === "OPEN" && <AddApplicantForm openingId={opening.id} />}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {ACTIVE_STAGES.map((stage) => {
          const list = opening.applicants.filter((a) => a.stage === stage);
          return (
            <section key={stage}>
              <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">
                {stageLabel(stage)} <Badge tone={stageTone[stage]}>{list.length}</Badge>
              </h3>
              <div className="space-y-2">
                {list.length === 0 ? <p className="text-xs text-[color:var(--color-muted)]">No applicants.</p> : list.map(card)}
              </div>
            </section>
          );
        })}
      </div>

      {closedApplicants.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">Closed</h3>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
            {closedApplicants.map((a) => (
              <div key={a.id}>
                <div className="mb-1"><Badge tone={stageTone[a.stage]}>{stageLabel(a.stage)}</Badge></div>
                {card(a)}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
