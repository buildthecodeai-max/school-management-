import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { allowedCampusIds } from "@/lib/scope";
import { formatMoney } from "@/lib/money";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { FeeHeadManager, FeeStructureBuilder, StructureStatusButton } from "./FeeStructureManager";

export default async function FeeStructuresPage() {
  const ctx = await requirePermission("fee.read");
  const campusIds = allowedCampusIds(ctx, "fee.read");

  const [structures, heads, campuses] = await Promise.all([
    prisma.feeStructure.findMany({
      where: { tenantId: ctx.tenantId!, ...(campusIds ? { campusId: { in: campusIds } } : {}) },
      include: {
        campus: true,
        gradeLevel: true,
        lines: { include: { feeHead: true } },
        _count: { select: { assignments: true, invoices: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.feeHead.findMany({ where: { tenantId: ctx.tenantId! }, orderBy: { name: "asc" } }),
    prisma.campus.findMany({ where: { tenantId: ctx.tenantId!, ...(campusIds ? { id: { in: campusIds } } : {}) }, include: { gradeLevels: { orderBy: { rank: "asc" } }, academicYears: { orderBy: { startDate: "desc" } } }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <div className="mb-4">
        <Link href="/portal/fees" className="text-sm text-brand-700 hover:underline">
          ← Finance
        </Link>
      </div>
      <PageHeader title="Fee structures" subtitle="Fee heads and campus fee structures." />

      <Card className="mb-6"><FeeHeadManager heads={heads} /></Card>
      <Card className="mb-6"><FeeStructureBuilder heads={heads} campuses={campuses.map(c => ({ id: c.id, name: c.name, grades: c.gradeLevels.map(g => ({ id: g.id, name: g.name })), years: c.academicYears.map(y => ({ id: y.id, name: y.name })) }))} /></Card>

      {structures.length === 0 ? (
        <EmptyState title="No fee structures" />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {structures.map((s) => {
            const total = s.lines.reduce((sum, l) => sum + l.amount, 0);
            return (
              <Card key={s.id}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{s.name}</p>
                    <p className="text-sm text-[color:var(--color-muted)]">
                      {s.campus.name}{s.gradeLevel ? ` · ${s.gradeLevel.name}` : " · all grades"}
                    </p>
                  </div>
                  <Badge tone={s.active ? "green" : "slate"}>{s.active ? "Active" : "Inactive"}</Badge>
                  <StructureStatusButton id={s.id} active={s.active} />
                </div>
                <ul className="mt-3 divide-y divide-[color:var(--color-line)] text-sm">
                  {s.lines.map((l) => (
                    <li key={l.id} className="flex justify-between py-1.5">
                      <span>{l.label ?? l.feeHead.name}</span>
                      <span className="font-medium">{formatMoney(l.amount)}</span>
                    </li>
                  ))}
                  <li className="flex justify-between py-1.5 font-semibold">
                    <span>Total</span>
                    <span>{formatMoney(total)}</span>
                  </li>
                </ul>
                <p className="mt-2 text-xs text-[color:var(--color-muted)]">
                  {s._count.assignments} concession assignment(s) · {s._count.invoices} invoice(s)
                </p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
