import Link from "next/link";
import { canForCampus, requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionForm, inputCls, labelCls } from "@/components/ActionForm";
import { assignFeeToStudent, bulkAssignFeeToSection, removeFeeAssignment } from "../assignment-actions";

export const metadata = { title: "Fee assignments & discounts" };

export default async function AssignmentsPage() {
  const ctx = await requirePermission("fee.read");
  const campuses = (await prisma.campus.findMany({ where: { tenantId: ctx.tenantId!, status: "ACTIVE" }, select: { id: true } })).map((c) => c.id);
  const manageable = campuses.filter((id) => canForCampus(ctx, "fee.adjust", id));
  const readable = campuses.filter((id) => canForCampus(ctx, "fee.read", id));

  const [structures, sections, assignments] = await Promise.all([
    prisma.feeStructure.findMany({ where: { tenantId: ctx.tenantId!, campusId: { in: manageable } }, include: { campus: true, gradeLevel: true }, orderBy: { name: "asc" } }),
    prisma.section.findMany({ where: { tenantId: ctx.tenantId!, campusId: { in: manageable } }, include: { gradeLevel: true, academicYear: true, campus: true }, orderBy: [{ gradeLevel: { rank: "asc" } }, { name: "asc" }] }),
    prisma.studentFeeAssignment.findMany({
      where: { tenantId: ctx.tenantId!, structure: { campusId: { in: readable } } },
      include: { structure: { include: { campus: true } }, student: { include: { person: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  const canManage = manageable.length > 0 && structures.length > 0;
  const structureSelect = (
    <select name="feeStructureId" className={inputCls}>
      {structures.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.campus.name}{s.gradeLevel ? ` · ${s.gradeLevel.name}` : ""}</option>)}
    </select>
  );
  const discount = (
    <>
      <div><label className={labelCls}>Discount %</label><input name="discountPct" type="number" min={0} max={100} defaultValue={0} className={inputCls} /></div>
      <div><label className={labelCls}>Reason (needed for any discount)</label><input name="discountReason" placeholder="Sibling discount, scholarship…" className={inputCls} /></div>
    </>
  );

  return (
    <div className="space-y-5">
      <Link href="/portal/fees" className="text-sm text-brand-700 hover:underline">← Fees</Link>
      <PageHeader title="Fee assignments & discounts" subtitle="Which students are billed under which fee structure, and any discount, scholarship or concession. Billing runs apply these automatically." />
      {canManage ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="mb-3 font-semibold">Assign one student</h3>
            <ActionForm action={assignFeeToStudent} submit="Assign" className="space-y-3">
              <div><label className={labelCls}>Admission number</label><input name="admissionNumber" required className={inputCls} /></div>
              <div><label className={labelCls}>Fee structure</label>{structureSelect}</div>
              <div className="grid gap-3 sm:grid-cols-2">{discount}</div>
            </ActionForm>
          </Card>
          <Card>
            <h3 className="mb-3 font-semibold">Assign a whole section</h3>
            <ActionForm action={bulkAssignFeeToSection} submit="Assign section" className="space-y-3">
              <div><label className={labelCls}>Fee structure</label>{structureSelect}</div>
              <div><label className={labelCls}>Section</label>
                <select name="sectionId" className={inputCls}>{sections.map((s) => <option key={s.id} value={s.id}>{s.gradeLevel.name} · {s.name} ({s.academicYear.name}, {s.campus.name})</option>)}</select></div>
              <div className="grid gap-3 sm:grid-cols-2">{discount}</div>
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-1.5"><input type="radio" name="mode" value="preview" defaultChecked /> Preview only</label>
                <label className="flex items-center gap-1.5"><input type="radio" name="mode" value="commit" /> Commit</label>
              </div>
            </ActionForm>
          </Card>
        </div>
      ) : (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {structures.length === 0 && manageable.length > 0 ? "Create a fee structure first (Fees → Fee structures)." : "You can view assignments but not change them; that needs the fee-adjust permission."}
        </p>
      )}
      {assignments.length === 0 ? (
        <EmptyState title="No assignments yet" hint="Students without an assignment are billed the full structure amount with no discount." />
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[color:var(--color-line)] text-left text-xs uppercase tracking-wide text-[color:var(--color-muted)]">
                <th className="px-4 py-3">Student</th><th className="px-4 py-3">Structure</th><th className="px-4 py-3">Discount</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3" />
              </tr></thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id} className="border-b border-[color:var(--color-line)] last:border-0">
                    <td className="px-4 py-2.5"><Link className="text-brand-700 hover:underline" href={`/portal/students/${a.studentId}`}>{a.student.person.firstName} {a.student.person.lastName}</Link> <span className="text-xs text-[color:var(--color-muted)]">{a.student.admissionNumber}</span></td>
                    <td className="px-4 py-2.5">{a.structure.name} <span className="text-xs text-[color:var(--color-muted)]">{a.structure.campus.name}</span></td>
                    <td className="px-4 py-2.5">{a.discountPct > 0 ? <Badge tone="green">{a.discountPct}% off</Badge> : "—"}</td>
                    <td className="px-4 py-2.5 text-[color:var(--color-muted)]">{a.discountReason ?? ""}</td>
                    <td className="px-4 py-2.5 text-right">
                      {canForCampus(ctx, "fee.adjust", a.structure.campusId) && (
                        <ActionForm action={removeFeeAssignment} submit="Remove" variant="danger" confirmText="Remove this assignment? Invoices already issued are not changed." className="inline"><input type="hidden" name="id" value={a.id} /></ActionForm>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
