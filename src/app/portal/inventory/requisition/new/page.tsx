import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader, Card } from "@/components/ui";
import { LinesForm } from "@/components/LinesEditor";
import { inputCls, labelCls } from "@/components/ActionForm";
import { submitRequisition } from "../../actions";

export const metadata = { title: "New requisition" };

export default async function NewRequisitionPage({ searchParams }: { searchParams: Promise<{ campusId?: string }> }) {
  const ctx = await requireUser();
  const { campusId } = await searchParams;
  if (!campusId || !canForCampus(ctx, "inventory.requisition.request", campusId)) notFound();
  const items = await prisma.inventoryItem.findMany({ where: { tenantId: ctx.tenantId!, campusId }, orderBy: { name: "asc" } });
  return (
    <div className="max-w-2xl">
      <div className="mb-4"><Link href={`/portal/inventory?campusId=${campusId}`} className="text-sm text-brand-700 hover:underline">← Inventory</Link></div>
      <PageHeader title="New requisition" subtitle="Requests go to an approver before stock is issued." />
      <Card>
        {items.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">There are no items on this campus yet.</p>
        ) : (
          <LinesForm
            action={submitRequisition}
            items={items.map((i) => ({ id: i.id, label: `${i.name} (${i.unit})` }))}
            hidden={{ campusId }}
            submit="Submit for approval"
            extra={<label className="block"><span className={labelCls}>Notes (optional)</span><input name="notes" maxLength={500} className={inputCls} /></label>}
          />
        )}
      </Card>
    </div>
  );
}
