import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { preferredCampusId, resolveCampusId } from "@/lib/campus-preference";
import { PageHeader, Card, Badge } from "@/components/ui";
import { ActionForm, inputCls, labelCls } from "@/components/ActionForm";
import { openSafeguardingCase } from "./actions";

export const metadata = { title: "Safeguarding" };

export default async function SafeguardingPage({ searchParams }: { searchParams: Promise<{ campusId?: string }> }) {
  const ctx = await requireUser();
  const params = await searchParams;
  const campuses = await prisma.campus.findMany({ where: { tenantId: ctx.tenantId!, status: "ACTIVE" }, orderBy: { name: "asc" } });
  // safeguarding.case.read is NOT in any default role — deliberately narrow.
  const accessible = campuses.filter((c) => canForCampus(ctx, "safeguarding.case.read", c.id));
  const preferred = await preferredCampusId(ctx, "safeguarding.case.read");
  const campusId = resolveCampusId(params.campusId, preferred, accessible);
  if (!campusId || !canForCampus(ctx, "safeguarding.case.read", campusId)) redirect("/portal?denied=safeguarding.case.read");
  const canWrite = canForCampus(ctx, "safeguarding.case.write", campusId);

  const cases = await prisma.safeguardingCase.findMany({
    where: { tenantId: ctx.tenantId!, campusId },
    include: { student: { include: { person: true } }, _count: { select: { notes: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const open = cases.filter((c) => c.status !== "CLOSED");
  const closed = cases.filter((c) => c.status === "CLOSED");

  return (
    <div>
      <PageHeader title="Safeguarding" subtitle="Case records are append-only and every view is audited" action={<Badge tone="red">Sensitive — restricted</Badge>} />
      <div className="mb-6 flex flex-wrap gap-2">
        {accessible.map((c) => (
          <Link key={c.id} href={`?campusId=${c.id}`} className={`rounded-full px-3 py-1 text-sm font-medium ${c.id === campusId ? "bg-brand-600 text-white" : "bg-white ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50"}`}>{c.name}</Link>
        ))}
      </div>

      {canWrite && (
        <Card className="mb-6">
          <h3 className="mb-3 font-semibold">Open a case</h3>
          <ActionForm action={openSafeguardingCase} submit="Open case" pendingLabel="Opening…" className="grid gap-3 sm:grid-cols-2">
            <label><span className={labelCls}>Student admission number</span><input name="admissionNumber" required className={inputCls} /></label>
            <label><span className={labelCls}>Title</span><input name="title" required minLength={3} maxLength={200} className={inputCls} /></label>
            <label className="sm:col-span-2"><span className={labelCls}>The concern</span><textarea name="concern" rows={3} required minLength={10} maxLength={5000} className={inputCls} /></label>
          </ActionForm>
        </Card>
      )}

      <h2 className="mb-3 text-lg font-semibold">Open cases ({open.length})</h2>
      {open.length === 0 ? <p className="mb-6 text-sm text-[color:var(--color-muted)]">No open cases.</p> : (
        <div className="mb-6 space-y-3">
          {open.map((c) => (
            <Card key={c.id}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{c.title}</p>
                  <p className="text-sm text-[color:var(--color-muted)]">{c.student.person.firstName} {c.student.person.lastName} · {c._count.notes} note(s) · opened {c.createdAt.toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2"><Badge tone={c.status === "UNDER_REVIEW" ? "sky" : "amber"}>{c.status.replace("_", " ")}</Badge><Link href={`/portal/safeguarding/${c.id}`} className="text-sm text-brand-700 hover:underline">Open</Link></div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {closed.length > 0 && (
        <>
          <h2 className="mb-3 text-lg font-semibold text-[color:var(--color-muted)]">Closed ({closed.length})</h2>
          <div className="space-y-2">
            {closed.map((c) => (
              <Card key={c.id}><p className="text-sm"><Link href={`/portal/safeguarding/${c.id}`} className="text-brand-700 hover:underline">{c.title}</Link> — {c.student.person.firstName} {c.student.person.lastName}{c.closedAt && ` · closed ${c.closedAt.toLocaleDateString()}`}</p></Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
