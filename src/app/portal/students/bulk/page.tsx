import Link from "next/link";
import { requireUser, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader, Card } from "@/components/ui";
import { PromoteForm, ReassignForm } from "./BulkForms";

export const metadata = { title: "Bulk student actions" };

export default async function BulkActionsPage({ searchParams }: { searchParams: Promise<{ campusId?: string }> }) {
  const ctx = await requireUser();
  const sp = await searchParams;
  const all = await prisma.campus.findMany({ where: { tenantId: ctx.tenantId!, status: "ACTIVE" }, orderBy: { name: "asc" } });
  const campuses = all.filter((c) => canForCampus(ctx, "student.write", c.id));
  if (campuses.length === 0) return <Card><p className="text-sm text-red-700">You need student-write access on a campus to use bulk actions.</p></Card>;
  const campus = campuses.find((c) => c.id === sp.campusId) ?? campuses[0];

  const [grades, sections] = await Promise.all([
    prisma.gradeLevel.findMany({ where: { tenantId: ctx.tenantId!, campusId: campus.id }, orderBy: { rank: "asc" } }),
    prisma.section.findMany({ where: { tenantId: ctx.tenantId!, campusId: campus.id }, include: { gradeLevel: true, academicYear: true }, orderBy: [{ academicYear: { startDate: "desc" } }, { gradeLevel: { rank: "asc" } }, { name: "asc" }] }),
  ]);
  const sectionOpts = sections.map((s) => ({ id: s.id, label: `${s.academicYear.name} · ${s.gradeLevel.name} · ${s.name}` }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div><Link href="/portal/students" className="text-sm text-brand-700 hover:underline">← Students</Link></div>
      <PageHeader title="Bulk student actions" subtitle="Always preview first: nothing changes until you confirm." />
      {campuses.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {campuses.map((c) => <Link key={c.id} href={`?campusId=${c.id}`} className={`rounded-full px-3 py-1 text-sm font-medium ${c.id === campus.id ? "bg-brand-600 text-white" : "bg-white ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50"}`}>{c.name}</Link>)}
        </div>
      )}
      <Card>
        <h2 className="mb-1 font-semibold">Year-end promotion</h2>
        <p className="mb-4 text-sm text-[color:var(--color-muted)]">Closes every active enrollment in the grade and opens a new one in the section you choose. The target section decides the new grade and academic year.</p>
        <PromoteForm grades={grades.map((g) => ({ id: g.id, label: g.name }))} sections={sectionOpts} />
      </Card>
      <Card>
        <h2 className="mb-1 font-semibold">Move a whole section</h2>
        <p className="mb-4 text-sm text-[color:var(--color-muted)]">Moves every active student between two sections of the same grade and year, for example when merging classes.</p>
        <ReassignForm sections={sectionOpts} />
      </Card>
    </div>
  );
}
