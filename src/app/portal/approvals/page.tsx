import { canForCampus, requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionForm, inputCls } from "@/components/ActionForm";
import { formatMoney } from "@/lib/money";
import { APPROVAL_PERMISSION } from "@/lib/approval-types";
import { decideApproval } from "./actions";

export const metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const ctx = await requireUser();
  if (!ctx.tenantId) return <EmptyState title="Select a school first" />;
  const [pending, recent, users] = await Promise.all([
    prisma.approvalRequest.findMany({ where: { tenantId: ctx.tenantId, status: "PENDING" }, orderBy: { createdAt: "asc" } }),
    prisma.approvalRequest.findMany({ where: { tenantId: ctx.tenantId, status: { not: "PENDING" } }, orderBy: { decidedAt: "desc" }, take: 15 }),
    prisma.user.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, displayName: true } }),
  ]);
  const name = new Map(users.map((u) => [u.id, u.displayName]));
  const mine = (r: { requestType: string; campusId: string | null }) => {
    const perm = APPROVAL_PERMISSION[r.requestType];
    return !!perm && !!r.campusId && canForCampus(ctx, perm, r.campusId);
  };
  const visible = pending.filter((r) => mine(r) || r.requestedByUserId === ctx.user.id);
  const describe = (r: (typeof pending)[number]) => {
    const p = r.payload as Record<string, unknown>;
    if (r.requestType === "fee.adjust") return `Refund of ${formatMoney(Number(p.amount ?? 0))} (${String(p.method ?? "")}) — ${String(p.reason ?? "")}`;
    if (r.requestType === "inventory.requisition") return `Stock requisition, ${Array.isArray(p.lines) ? p.lines.length : 0} line(s)${p.notes ? ` — ${String(p.notes)}` : ""}`;
    return r.requestType;
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Approvals" subtitle="Requests that need a second person's decision. You cannot approve your own." />
      {visible.length === 0 ? (
        <EmptyState title="Nothing waiting" hint="Refund and requisition requests appear here for an approver." />
      ) : (
        <div className="space-y-3">
          {visible.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{describe(r)}</p>
                  <p className="text-sm text-[color:var(--color-muted)]">Requested by {name.get(r.requestedByUserId) ?? "someone"} · {r.createdAt.toLocaleDateString()}</p>
                </div>
                <Badge tone="amber">Pending</Badge>
              </div>
              {mine(r) && r.requestedByUserId !== ctx.user.id ? (
                <div className="mt-3 flex flex-wrap items-start gap-4">
                  <ActionForm action={decideApproval} submit="Approve" className="inline">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="decision" value="APPROVED" />
                  </ActionForm>
                  <ActionForm action={decideApproval} submit="Reject" variant="danger" className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="decision" value="REJECTED" />
                    <input name="note" placeholder="Reason (required)" className={`${inputCls} !w-56`} />
                  </ActionForm>
                </div>
              ) : (
                <p className="mt-2 text-sm text-[color:var(--color-muted)]">{r.requestedByUserId === ctx.user.id ? "Waiting for another approver." : ""}</p>
              )}
            </Card>
          ))}
        </div>
      )}
      {recent.length > 0 && (
        <Card>
          <h3 className="mb-2 font-semibold">Recently decided</h3>
          <ul className="divide-y divide-[color:var(--color-line)] text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{describe(r)}</span>
                <span><Badge tone={r.status === "APPROVED" ? "green" : "red"}>{r.status}</Badge> <span className="text-[color:var(--color-muted)]">{r.decisionNote ?? ""}</span></span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
