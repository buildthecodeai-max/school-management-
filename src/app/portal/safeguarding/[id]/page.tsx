import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { PageHeader, Card, Badge } from "@/components/ui";
import { ActionForm, inputCls, labelCls } from "@/components/ActionForm";
import { addSafeguardingNote, setSafeguardingStatus } from "../actions";

export const metadata = { title: "Safeguarding case" };

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser();
  const { id } = await params;
  const c = await prisma.safeguardingCase.findFirst({
    where: { id, tenantId: ctx.tenantId! },
    include: { student: { include: { person: true } }, notes: { orderBy: { createdAt: "asc" } } },
  });
  if (!c || !canForCampus(ctx, "safeguarding.case.read", c.campusId)) notFound();
  const canWrite = canForCampus(ctx, "safeguarding.case.write", c.campusId);

  // Opening a case file is an audited event.
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "safeguarding.case.viewed", targetType: "SafeguardingCase", targetId: c.id, campusId: c.campusId, scopeType: "CAMPUS" });

  const authors = await prisma.user.findMany({ where: { id: { in: [...new Set(c.notes.map((n) => n.authorUserId))] }, tenantId: ctx.tenantId! }, select: { id: true, email: true } });
  const who = new Map(authors.map((a) => [a.id, a.email]));
  const moves: Record<string, [string, string][]> = {
    OPEN: [["UNDER_REVIEW", "Move to review"], ["CLOSED", "Close case"]],
    UNDER_REVIEW: [["OPEN", "Back to open"], ["CLOSED", "Close case"]],
    CLOSED: [["OPEN", "Reopen case"]],
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-4"><Link href="/portal/safeguarding" className="text-sm text-brand-700 hover:underline">← Safeguarding</Link></div>
      <PageHeader
        title={c.title}
        subtitle={`${c.student.person.firstName} ${c.student.person.lastName} · ${c.student.admissionNumber} · opened ${c.createdAt.toLocaleDateString()}`}
        action={<Badge tone={c.status === "CLOSED" ? "slate" : c.status === "UNDER_REVIEW" ? "sky" : "amber"}>{c.status.replace("_", " ")}</Badge>}
      />

      <Card className="mb-6">
        <h3 className="mb-3 font-semibold">Case record</h3>
        <ol className="space-y-3">
          {c.notes.map((n) => (
            <li key={n.id} className="border-l-2 border-[color:var(--color-line)] pl-3 text-sm">
              <p className="text-xs text-[color:var(--color-muted)]">{n.createdAt.toLocaleString()} · {who.get(n.authorUserId) ?? "former user"}</p>
              <p className="whitespace-pre-wrap">{n.body}</p>
            </li>
          ))}
        </ol>
      </Card>

      {canWrite && c.status !== "CLOSED" && (
        <Card className="mb-6">
          <h3 className="mb-3 font-semibold">Add a note</h3>
          <ActionForm action={addSafeguardingNote} submit="Add note" pendingLabel="Saving…" className="space-y-3">
            <input type="hidden" name="caseId" value={c.id} />
            <textarea name="body" rows={3} required minLength={3} maxLength={5000} className={inputCls} />
          </ActionForm>
        </Card>
      )}

      {canWrite && (
        <Card>
          <h3 className="mb-3 font-semibold">Change status</h3>
          <div className="space-y-3">
            {moves[c.status].map(([to, label]) => (
              <ActionForm key={to} action={setSafeguardingStatus} submit={label} variant={to === "CLOSED" ? "danger" : "ghost"} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="caseId" value={c.id} /><input type="hidden" name="to" value={to} />
                {(to === "CLOSED" || c.status === "CLOSED") && (
                  <label className="flex-1"><span className={labelCls}>Reason (recorded in the case)</span><input name="reason" required minLength={10} maxLength={2000} className={inputCls} /></label>
                )}
              </ActionForm>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
