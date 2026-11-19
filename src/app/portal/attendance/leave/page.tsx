import Link from "next/link";
import { requirePermission, canForCampus } from "@/lib/rbac";
import { allowedCampusIds } from "@/lib/scope";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Badge, ButtonLink } from "@/components/ui";
import { ActionForm, inputCls } from "@/components/ActionForm";
import { decideStudentLeave } from "../leave-actions";

export const metadata = { title: "Student leave" };

export default async function StudentLeavePage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const ctx = await requirePermission("attendance.leave.approve");
  const sp = await searchParams;
  const campusIds = allowedCampusIds(ctx, "attendance.leave.approve");
  const all = sp.show === "all";
  const reqs = await prisma.leaveRequest.findMany({
    where: { tenantId: ctx.tenantId!, staffId: null, person: { student: { isNot: null } }, ...(campusIds ? { campusId: { in: campusIds } } : {}), ...(all ? {} : { status: "PENDING" }) },
    include: { person: { include: { student: { include: { enrollments: { where: { status: "ACTIVE" }, include: { gradeLevel: true, section: true }, take: 1 } } } } }, leaveType: true },
    orderBy: [{ status: "asc" }, { startDate: "asc" }],
    take: 200,
  });
  const th = "pb-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]";
  const tone = (s: string) => (s === "APPROVED" ? "green" : s === "REJECTED" ? "red" : s === "PENDING" ? "amber" : "slate") as "green" | "red" | "amber" | "slate";
  const d = (x: Date) => x.toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader title="Student leave" subtitle="Approved leave shows as Leave in that day's register" action={<ButtonLink href="/portal/attendance" variant="ghost">← Attendance</ButtonLink>} />
      <div className="mb-4 flex gap-3 text-sm">
        <Link href="?" className={!all ? "font-semibold text-brand-700" : "text-[color:var(--color-muted)]"}>Pending</Link>
        <Link href="?show=all" className={all ? "font-semibold text-brand-700" : "text-[color:var(--color-muted)]"}>All requests</Link>
      </div>
      <Card className="overflow-x-auto">
        {reqs.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">{all ? "No requests yet." : "Nothing waiting for a decision."}</p> : (
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Student</th><th className={th}>Class</th><th className={th}>Dates</th><th className={th}>Type</th><th className={th}>Reason</th><th className={th}>Status</th><th /></tr></thead>
            <tbody className="divide-y divide-[color:var(--color-line)]">
              {reqs.map((r) => {
                const s = r.person.student!;
                const e = s.enrollments[0];
                const can = r.status === "PENDING" && canForCampus(ctx, "attendance.leave.approve", r.campusId);
                return (
                  <tr key={r.id} className="align-top">
                    <td className="py-2 pr-4"><Link className="font-medium text-brand-700 hover:underline" href={`/portal/students/${s.id}`}>{r.person.firstName} {r.person.lastName}</Link></td>
                    <td className="py-2 pr-4">{e ? `${e.gradeLevel.name} · ${e.section.name}` : "—"}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{d(r.startDate)} → {d(r.endDate)} <span className="text-xs text-[color:var(--color-muted)]">({r.days}d)</span></td>
                    <td className="py-2 pr-4">{r.leaveType.name}</td>
                    <td className="py-2 pr-4">{r.reason}</td>
                    <td className="py-2 pr-4"><Badge tone={tone(r.status)}>{r.status}</Badge></td>
                    <td className="space-y-2 py-2">
                      {can && (
                        <>
                          <ActionForm action={decideStudentLeave} submit="Approve" pendingLabel="…"><input type="hidden" name="requestId" value={r.id} /><input type="hidden" name="decision" value="APPROVED" /></ActionForm>
                          <ActionForm action={decideStudentLeave} submit="Decline" variant="danger" className="flex items-center gap-1"><input type="hidden" name="requestId" value={r.id} /><input type="hidden" name="decision" value="REJECTED" /><input name="note" required minLength={3} placeholder="Reason for the family" className={inputCls} /></ActionForm>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
