import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { preferredCampusId, resolveCampusId } from "@/lib/campus-preference";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { currentCampusOf } from "@/lib/restricted";
import { inputCls, labelCls } from "@/components/ActionForm";

export const metadata = { title: "Health Records" };

export default async function HealthPage({ searchParams }: { searchParams: Promise<{ campusId?: string; admission?: string }> }) {
  const ctx = await requireUser();
  const params = await searchParams;
  const campuses = await prisma.campus.findMany({ where: { tenantId: ctx.tenantId!, status: "ACTIVE" }, orderBy: { name: "asc" } });
  // health.record.read is NOT in any default role — deliberately narrow.
  const accessible = campuses.filter((c) => canForCampus(ctx, "health.record.read", c.id));
  const preferred = await preferredCampusId(ctx, "health.record.read");
  const campusId = resolveCampusId(params.campusId, preferred, accessible);
  if (!campusId || !canForCampus(ctx, "health.record.read", campusId)) redirect("/portal?denied=health.record.read");

  const records = await prisma.healthRecord.findMany({
    where: { tenantId: ctx.tenantId!, campusId },
    include: { student: { include: { person: true } }, incidents: { orderBy: { occurredAt: "desc" }, take: 1 } },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  // Lookup by admission number, so a record can be started for a student who has none yet.
  let found: { id: string; name: string } | null = null;
  let notFound = false;
  const admission = params.admission?.trim();
  if (admission) {
    const s = await prisma.student.findFirst({ where: { tenantId: ctx.tenantId!, admissionNumber: admission }, include: { person: true } });
    const sCampus = s ? await currentCampusOf(ctx.tenantId!, s.id) : null;
    if (s && sCampus && canForCampus(ctx, "health.record.read", sCampus)) found = { id: s.id, name: `${s.person.firstName} ${s.person.lastName}` };
    else notFound = true;
  }

  return (
    <div>
      <PageHeader title="Health records" subtitle="Allergies, conditions, emergency contacts and incidents" action={<Badge tone="amber">Restricted access</Badge>} />
      <div className="mb-6 flex flex-wrap gap-2">
        {accessible.map((c) => (
          <Link key={c.id} href={`?campusId=${c.id}`} className={`rounded-full px-3 py-1 text-sm font-medium ${c.id === campusId ? "bg-brand-600 text-white" : "bg-white ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50"}`}>{c.name}</Link>
        ))}
      </div>

      <Card className="mb-6">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="campusId" value={campusId} />
          <label><span className={labelCls}>Find a student by admission number</span><input name="admission" defaultValue={admission} className={inputCls} /></label>
          <button className="rounded-lg bg-white px-3 py-2 text-sm font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50">Find</button>
        </form>
        {found && <p className="mt-3 text-sm">Found <b>{found.name}</b>. <Link className="text-brand-700 underline" href={`/portal/health/${found.id}`}>Open health record</Link></p>}
        {notFound && <p className="mt-3 text-sm text-red-700">No enrolled student with that admission number on a campus you can access.</p>}
      </Card>

      {records.length === 0 ? (
        <EmptyState title="No health records on file" hint="Find a student above to start one." />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-[color:var(--color-muted)]"><th className="pb-2 pr-4">Student</th><th className="pb-2 pr-4">Allergies</th><th className="pb-2 pr-4">Conditions</th><th className="pb-2">Last incident</th></tr></thead>
            <tbody className="divide-y divide-[color:var(--color-line)]">
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-4"><Link href={`/portal/health/${r.studentId}`} className="font-medium text-brand-700 hover:underline">{r.student.person.firstName} {r.student.person.lastName}</Link></td>
                  <td className="py-2 pr-4">{r.allergies ?? "None"}</td>
                  <td className="py-2 pr-4">{r.conditions ?? "None"}</td>
                  <td className="py-2">{r.incidents[0] ? r.incidents[0].occurredAt.toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
