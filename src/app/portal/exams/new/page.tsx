import Link from "next/link";
import { canForCampus, requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { preferredCampusId, resolveCampusId } from "@/lib/campus-preference";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionForm, inputCls, labelCls } from "@/components/ActionForm";
import { DEFAULT_COMPONENTS } from "@/lib/assessment-plan";
import { createAssessmentPlan } from "../plan-actions";

export const metadata = { title: "New assessment plan" };

export default async function NewPlanPage({ searchParams }: { searchParams: Promise<{ campusId?: string }> }) {
  const ctx = await requirePermission("exams.manage");
  const sp = await searchParams;
  const campuses = (await prisma.campus.findMany({ where: { tenantId: ctx.tenantId!, status: "ACTIVE" }, orderBy: { name: "asc" } })).filter((c) => canForCampus(ctx, "exams.manage", c.id));
  const campusId = resolveCampusId(sp.campusId, await preferredCampusId(ctx, "exams.manage"), campuses);
  if (!campusId) return <EmptyState title="No campus in your scope" />;

  const [sections, years, subjects, scales, staff] = await Promise.all([
    prisma.section.findMany({ where: { tenantId: ctx.tenantId!, campusId }, include: { gradeLevel: true, academicYear: true }, orderBy: [{ academicYear: { startDate: "desc" } }, { gradeLevel: { rank: "asc" } }, { name: "asc" }] }),
    prisma.academicYear.findMany({ where: { tenantId: ctx.tenantId!, campusId }, include: { terms: { orderBy: { startDate: "asc" } } }, orderBy: { startDate: "desc" } }),
    prisma.subject.findMany({ where: { tenantId: ctx.tenantId!, campusId }, orderBy: { name: "asc" } }),
    prisma.gradeScale.findMany({ where: { tenantId: ctx.tenantId! }, orderBy: { name: "asc" } }),
    prisma.staff.findMany({ where: { tenantId: ctx.tenantId!, employmentRecords: { some: { campusId, endDate: null } } }, include: { person: true }, orderBy: { person: { lastName: "asc" } } }),
  ]);
  const terms = years.flatMap((y) => y.terms.map((t) => ({ ...t, yearName: y.name })));
  const cfg = (tab: string) => `/portal/academics/config?campusId=${campusId}&tab=${tab}`;
  const missing = [
    sections.length === 0 && ["sections", "Create a grade and a section"],
    terms.length === 0 && ["terms", "Create an academic year and a term"],
    subjects.length === 0 && ["subjects", "Create subjects"],
    scales.length === 0 && ["scales", "Create a grade scale"],
  ].filter(Boolean) as [string, string][];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/portal/exams" className="text-sm text-brand-700 hover:underline">← Assessment plans</Link>
      <PageHeader title="New assessment plan" subtitle="A plan defines what is assessed for one section in one term: the components and their weights, the subjects, and who enters each subject's marks." />
      <div className="flex flex-wrap gap-2">
        {campuses.map((c) => (
          <Link key={c.id} href={`/portal/exams/new?campusId=${c.id}`} className={`rounded-full border px-3 py-1 text-sm font-medium ${c.id === campusId ? "border-indigo-600 bg-indigo-600 text-white" : "border-gray-300 hover:bg-gray-50"}`}>{c.name}</Link>
        ))}
      </div>
      {missing.length > 0 ? (
        <Card>
          <p className="mb-2 font-medium">Set these up first:</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">{missing.map(([tab, text]) => <li key={tab}><Link className="text-brand-700 underline" href={cfg(tab)}>{text}</Link></li>)}</ul>
        </Card>
      ) : (
        <Card>
          <ActionForm action={createAssessmentPlan} submit="Create plan" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className={labelCls}>Plan name</label><input name="name" required placeholder="Term 1 assessment" className={inputCls} /></div>
              <div><label className={labelCls}>Grade scale</label><select name="gradeScaleId" className={inputCls}>{scales.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><label className={labelCls}>Section</label><select name="sectionId" className={inputCls}>{sections.map((s) => <option key={s.id} value={s.id}>{s.gradeLevel.name} · {s.name} ({s.academicYear.name})</option>)}</select></div>
              <div><label className={labelCls}>Term (of the section's year)</label><select name="termId" className={inputCls}>{terms.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.yearName})</option>)}</select></div>
            </div>
            <div>
              <label className={labelCls}>Components (one per line: name, weight %, maximum marks — weights total 100)</label>
              <textarea name="components" rows={4} defaultValue={DEFAULT_COMPONENTS} className={`${inputCls} font-mono`} />
            </div>
            <div>
              <p className={labelCls}>Subjects and the teacher who enters their marks</p>
              <ul className="divide-y divide-[color:var(--color-line)] rounded-md border border-[color:var(--color-line)]">
                {subjects.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={`subject:${s.id}`} /> {s.name} <code className="text-xs text-[color:var(--color-muted)]">{s.code}</code></label>
                    <select name={`teacher:${s.id}`} aria-label={`Teacher for ${s.name}`} className="rounded-md border border-[color:var(--color-line)] px-2 py-1 text-sm">
                      <option value="">Any teacher with marks-entry rights</option>
                      {staff.map((t) => <option key={t.id} value={t.id}>{t.person.firstName} {t.person.lastName}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
