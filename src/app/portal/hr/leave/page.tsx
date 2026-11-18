import { canForCampus, requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionForm, inputCls, labelCls } from "@/components/ActionForm";
import { remainingDays } from "@/lib/leave";
import { cancelLeaveRequest, submitLeaveRequest } from "../leave-actions";

export const metadata = { title: "My leave" };
const TONE = { PENDING: "amber", APPROVED: "green", REJECTED: "red", CANCELLED: "slate" } as const;
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export default async function MyLeavePage() {
  const ctx = await requirePermission("attendance.leave.request");
  const personId = ctx.user.personId;
  const staff = personId ? await prisma.staff.findFirst({ where: { personId, tenantId: ctx.tenantId! } }) : null;
  if (!personId || !staff) return <EmptyState title="No staff profile" hint="Leave requests are for staff members. Ask HR to link your account to your staff record." />;

  const [employment, types, balances, requests] = await Promise.all([
    prisma.employmentRecord.findMany({ where: { staffId: staff.id, endDate: null }, include: { campus: true } }),
    prisma.leaveType.findMany({ where: { tenantId: ctx.tenantId!, appliesTo: { in: ["STAFF", "BOTH"] } }, orderBy: { name: "asc" } }),
    prisma.leaveBalance.findMany({ where: { tenantId: ctx.tenantId!, personId, academicYearId: null } }),
    prisma.leaveRequest.findMany({ where: { tenantId: ctx.tenantId!, personId }, include: { leaveType: true }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const campuses = employment.filter((e) => canForCampus(ctx, "attendance.leave.request", e.campusId)).map((e) => e.campus);
  const pendingFor = (typeId: string) => requests.filter((r) => r.leaveTypeId === typeId && r.status === "PENDING").reduce((s, r) => s + r.days, 0);

  return (
    <div className="space-y-5">
      <PageHeader title="My leave" subtitle="Your leave balances, requests and their status." />
      {types.length === 0 ? (
        <EmptyState title="No leave types set up" hint="Ask an administrator to add leave types under Academics → Configure → Leave types." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {types.map((t) => {
            const b = balances.find((x) => x.leaveTypeId === t.id);
            const used = b?.usedDays ?? 0, total = b?.totalDays ?? t.daysPerYear;
            const left = remainingDays(total, used, pendingFor(t.id));
            return (
              <Card key={t.id}>
                <p className="text-sm text-[color:var(--color-muted)]">{t.name}</p>
                <p className="text-2xl font-semibold">{left === null ? "No limit" : `${left} left`}</p>
                <p className="text-xs text-[color:var(--color-muted)]">{total > 0 ? `${used} of ${total} used` : `${used} used`}{pendingFor(t.id) ? ` · ${pendingFor(t.id)} pending` : ""}</p>
              </Card>
            );
          })}
        </div>
      )}
      {types.length > 0 && campuses.length > 0 && (
        <Card>
          <h3 className="mb-3 font-semibold">Request leave</h3>
          <ActionForm action={submitLeaveRequest} submit="Submit request" className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-5">
              <div><label className={labelCls}>Leave type</label><select name="leaveTypeId" className={inputCls}>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
              <div><label className={labelCls}>Campus</label><select name="campusId" className={inputCls}>{campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div><label className={labelCls}>From</label><input name="startDate" type="date" required className={inputCls} /></div>
              <div><label className={labelCls}>To</label><input name="endDate" type="date" required className={inputCls} /></div>
              <div><label className={labelCls}>Days off</label><input name="days" type="number" min={0.5} step={0.5} required className={inputCls} /></div>
            </div>
            <div><label className={labelCls}>Reason (optional)</label><input name="reason" className={inputCls} /></div>
          </ActionForm>
        </Card>
      )}
      {requests.length === 0 ? <EmptyState title="No leave requests yet" /> : (
        <Card>
          <ul className="divide-y divide-[color:var(--color-line)]">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div><span className="font-medium">{r.leaveType.name}</span> · {fmt(r.startDate)} to {fmt(r.endDate)} · {r.days} day(s)
                  {r.reviewNote && <p className="text-[color:var(--color-muted)]">{r.reviewNote}</p>}</div>
                <div className="flex items-center gap-3">
                  <Badge tone={TONE[r.status]}>{r.status}</Badge>
                  {r.status === "PENDING" && <ActionForm action={cancelLeaveRequest} submit="Cancel" variant="danger" confirmText="Cancel this request?" className="inline"><input type="hidden" name="id" value={r.id} /></ActionForm>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
