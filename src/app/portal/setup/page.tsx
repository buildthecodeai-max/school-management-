import Link from "next/link";
import { requirePermission, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { allowedCampusIds } from "@/lib/scope";
import { PageHeader, Card, ButtonLink } from "@/components/ui";
import { Check } from "lucide-react";

export default async function SetupPage() {
  const ctx = await requirePermission("setup.read");
  const tenantId = ctx.tenantId!;
  const campusIds = allowedCampusIds(ctx, "campus.read");
  const inCampus = campusIds ? { in: campusIds } : undefined;

  const [
    campusCount,
    currentYear,
    termCount,
    gradeCount,
    sectionCount,
    subjectCount,
    feeStructureCount,
    gradeScaleCount,
    userCount,
    enrollmentCount,
    tenant,
  ] = await Promise.all([
    prisma.campus.count({ where: { tenantId, status: "ACTIVE", ...(inCampus ? { id: inCampus } : {}) } }),
    prisma.academicYear.findFirst({ where: { tenantId, isCurrent: true, ...(inCampus ? { campusId: inCampus } : {}) } }),
    prisma.term.count({ where: { tenantId, academicYear: { isCurrent: true } } }),
    prisma.gradeLevel.count({ where: { tenantId, ...(inCampus ? { campusId: inCampus } : {}) } }),
    prisma.section.count({ where: { tenantId, ...(inCampus ? { campusId: inCampus } : {}) } }),
    prisma.subject.count({ where: { tenantId } }),
    prisma.feeStructure.count({ where: { tenantId, active: true, ...(inCampus ? { campusId: inCampus } : {}) } }),
    prisma.gradeScale.count({ where: { tenantId } }),
    prisma.user.count({ where: { tenantId, roleAssignments: { some: {} } } }),
    prisma.enrollment.count({ where: { tenantId, status: "ACTIVE", ...(inCampus ? { campusId: inCampus } : {}) } }),
    prisma.tenant.findUnique({ where: { id: tenantId } }),
  ]);

  const items = [
    { label: "Organization profile", done: !!tenant?.name, hint: tenant?.name ?? "", required: true, href: "/portal/campuses" },
    { label: "Campuses", done: campusCount > 0, hint: `${campusCount} active`, required: true, href: "/portal/campuses" },
    { label: "Academic calendar", done: !!currentYear, hint: currentYear?.name ?? "No current year", required: true, href: "/portal/academics" },
    { label: "Terms", done: termCount > 0, hint: `${termCount} terms`, required: true, href: "/portal/academics" },
    { label: "Grade levels", done: gradeCount > 0, hint: `${gradeCount} grades`, required: true, href: "/portal/academics" },
    { label: "Sections", done: sectionCount > 0, hint: `${sectionCount} sections`, required: true, href: "/portal/academics" },
    { label: "Subjects", done: subjectCount > 0, hint: `${subjectCount} subjects`, required: false, href: "/portal/exams" },
    { label: "Grade scale", done: gradeScaleCount > 0, hint: `${gradeScaleCount} scales`, required: false, href: "/portal/exams" },
    { label: "Fee structures", done: feeStructureCount > 0, hint: `${feeStructureCount} structures`, required: false, href: "/portal/fees/structures" },
    { label: "Users & roles", done: userCount > 0, hint: `${userCount} users`, required: true, href: "/portal/campuses" },
    { label: "Students enrolled", done: enrollmentCount > 0, hint: `${enrollmentCount} active`, required: true, href: "/portal/import" },
  ];

  const requiredItems = items.filter((i) => i.required);
  const requiredDone = requiredItems.filter((i) => i.done).length;
  const pct = Math.round((requiredDone / requiredItems.length) * 100);
  const ready = requiredDone === requiredItems.length;
  const canImport =
    can(ctx, "data.import") ||
    [...ctx.campusPermissions.values()].some((s) => s.has("data.import") || s.has("*"));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Guided setup"
        subtitle="Complete these steps to get the organization ready for launch."
        action={canImport ? <ButtonLink href="/portal/import">Bulk import students</ButtonLink> : undefined}
      />

      <Card className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[color:var(--color-muted)]">Launch readiness</p>
            <p className="text-2xl font-semibold">
              {ready ? "Ready to launch" : `${requiredDone} of ${requiredItems.length} required steps`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold text-brand-600">{pct}%</p>
          </div>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full ${ready ? "bg-green-500" : "bg-brand-500"}`} style={{ width: `${pct}%` }} />
        </div>
      </Card>

      <Card className="p-0">
        <ul className="divide-y divide-[color:var(--color-line)]">
          {items.map((item) => (
            <li key={item.label} className="flex items-center gap-3 px-5 py-3">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${item.done ? "bg-green-600 text-white" : "border border-slate-300 bg-white"}`}>
                {item.done && <Check size={14} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {item.label}
                  {!item.required && <span className="ml-2 text-xs text-[color:var(--color-muted)]">optional</span>}
                </p>
                <p className="text-xs text-[color:var(--color-muted)]">{item.hint}</p>
              </div>
              <Link href={item.href} className="text-sm text-brand-700 hover:underline">
                {item.done ? "Review" : "Set up"}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
