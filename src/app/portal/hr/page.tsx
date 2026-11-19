import { requirePermission, canForCampus, canAnywhere } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { approveLeaveHr, initiateSeparation, toggleSeparationItem, completeSeparation } from "./actions";
import { ActionForm, inputCls, labelCls } from "@/components/ActionForm";
import { AddStaffForm } from "./AddStaffForm";
import { preferredCampusId, resolveCampusId } from "@/lib/campus-preference";

export const metadata = { title: "Human Resources" };

export default async function HrPage({
  searchParams,
}: {
  searchParams: Promise<{ campusId?: string; tab?: string }>;
}) {
  const ctx = await requirePermission("hr.staff.read");
  const params = await searchParams;

  const campuses = await prisma.campus.findMany({
    where: { tenantId: ctx.tenantId!, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });

  const accessible = campuses.filter((c) => canForCampus(ctx, "hr.staff.read", c.id));
  const preferred = await preferredCampusId(ctx, "hr.staff.read");
  const campusId = resolveCampusId(params.campusId, preferred, accessible);

  const tab = params.tab ?? "staff";

  const positions = campusId
    ? await prisma.position.findMany({
        where: { department: { tenantId: ctx.tenantId!, campusId } },
        include: { department: true },
        orderBy: { title: "asc" },
      })
    : [];

  const [staff, leaveRequests, separations] = campusId
    ? await Promise.all([
        prisma.staff.findMany({
          where: {
            tenantId: ctx.tenantId!,
            employmentRecords: { some: { campusId } },
          },
          include: {
            person: true,
            employmentRecords: {
              where: { campusId, endDate: null },
              include: { position: { include: { department: true } } },
              take: 1,
            },
          },
          take: 50,
        }),
        prisma.leaveRequest.findMany({
          where: { tenantId: ctx.tenantId!, campusId, status: "PENDING" },
          include: {
            staff: { include: { person: true } },
            leaveType: true,
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        prisma.separationChecklist.findMany({
          where: { tenantId: ctx.tenantId!, campusId, completedAt: null },
          include: { staff: { include: { person: true } } },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      ])
    : [[], [], []];

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Human Resources</h1>
        <div className="flex gap-2">
          {canAnywhere(ctx, "hr.recruit.read") && (
            <Link href="/portal/hr/recruitment" className="rounded border border-green-200 bg-green-50 px-3 py-1.5 text-sm text-green-700">Recruitment →</Link>
          )}
          <Link href="/portal/hr/attendance" className="rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700">Staff attendance →</Link>
          <Link href="/portal/hr/payroll" className="rounded border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm text-indigo-700">Payroll →</Link>
        </div>
      </div>

      {/* Campus tabs */}
      <div className="flex gap-2 flex-wrap">
        {campuses.map((c) => (
          <a
            key={c.id}
            href={`?campusId=${c.id}&tab=${tab}`}
            className={`rounded-full px-3 py-1 text-sm font-medium border ${
              c.id === campusId
                ? "bg-indigo-600 text-white border-indigo-600"
                : "border-gray-300 hover:bg-gray-50"
            }`}
          >
            {c.name}
          </a>
        ))}
      </div>

      {/* Sub-nav tabs */}
      <div className="flex gap-4 border-b border-gray-200">
        {(["staff", "leave", "separations"] as const).map((t) => (
          <a
            key={t}
            href={`?campusId=${campusId}&tab=${t}`}
            className={`pb-2 text-sm font-medium capitalize border-b-2 ${
              tab === t
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "leave" ? "Leave approvals" : t}
          </a>
        ))}
      </div>

      {tab === "staff" && (
        <div className="space-y-4">
          {campusId && (
            <AddStaffForm
              campusId={campusId}
              positions={positions.map((p) => ({
                id: p.id,
                title: p.title,
                departmentName: p.department.name,
              }))}
            />
          )}
          {staff.length === 0 ? (
            <p className="text-gray-500">No staff found for this campus.</p>
          ) : (
            <div className="overflow-x-auto rounded border border-gray-200">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs uppercase text-gray-500">
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Position</th>
                    <th className="px-3 py-2 text-left">Department</th>
                    <th className="px-3 py-2 text-left">Employee #</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {staff.map((s) => {
                    const emp = s.employmentRecords[0];
                    return (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">
                          {s.person.firstName} {s.person.lastName}
                        </td>
                        <td className="px-3 py-2">{emp?.position.title ?? "—"}</td>
                        <td className="px-3 py-2">{emp?.position.department.name ?? "—"}</td>
                        <td className="px-3 py-2 font-mono text-xs">{s.employeeNumber}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "leave" && (
        <div className="space-y-2">
          {leaveRequests.length === 0 ? (
            <p className="text-gray-500">No pending leave requests.</p>
          ) : (
            leaveRequests.map((r) => (
              <div key={r.id} className="rounded border border-gray-200 p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium">{r.staff?.person.firstName ?? "Unknown"} {r.staff?.person.lastName ?? ""}</div>
                  <div className="text-sm text-gray-500">
                    {r.leaveType.name} · {r.days} day(s) · {r.startDate.toLocaleDateString()} – {r.endDate.toLocaleDateString()}
                  </div>
                  {r.reason && <div className="text-xs text-gray-400 mt-1">{r.reason}</div>}
                </div>
                {campusId && canForCampus(ctx, "hr.leave.approve", campusId) && (
                  <div className="flex gap-2">
                    <form action={async (fd: FormData) => {
                      "use server";
                      fd.set("decision", "APPROVED");
                      await approveLeaveHr({}, fd);
                    }}>
                      <input type="hidden" name="leaveRequestId" value={r.id} />
                      <input type="hidden" name="campusId" value={campusId} />
                      <button className="rounded border border-green-300 bg-green-50 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-100">
                        Approve
                      </button>
                    </form>
                    <form action={async (fd: FormData) => {
                      "use server";
                      fd.set("decision", "REJECTED");
                      await approveLeaveHr({}, fd);
                    }}>
                      <input type="hidden" name="leaveRequestId" value={r.id} />
                      <input type="hidden" name="campusId" value={campusId} />
                      <button className="rounded border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100">
                        Decline
                      </button>
                    </form>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === "separations" && (
        <div className="space-y-4">
          {campusId && canForCampus(ctx, "hr.separation.manage", campusId) && (
            <div className="rounded border border-gray-200 p-4">
              <h3 className="mb-3 text-sm font-semibold">Start a separation</h3>
              <ActionForm action={initiateSeparation} submit="Start checklist" pendingLabel="Starting…" className="grid gap-3 sm:grid-cols-3">
                <label><span className={labelCls}>Staff member</span>
                  <select name="staffId" required className={inputCls}><option value="">Choose…</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.person.firstName} {s.person.lastName}</option>)}</select></label>
                <label><span className={labelCls}>Reason</span><input name="reason" required minLength={3} maxLength={300} className={inputCls} /></label>
                <label><span className={labelCls}>Last working day</span><input type="date" name="lastWorkDay" required className={inputCls} /></label>
              </ActionForm>
            </div>
          )}
          {separations.length === 0 ? (
            <p className="text-gray-500">No active separation checklists.</p>
          ) : (
            separations.map((s) => {
              const items = s.items as { label: string; done: boolean }[];
              const done = items.filter((i) => i.done).length;
              const canManage = canForCampus(ctx, "hr.separation.manage", s.campusId);
              return (
                <div key={s.id} className="rounded border border-gray-200 p-4 space-y-2">
                  <div className="font-medium">{s.staff.person.firstName} {s.staff.person.lastName}</div>
                  <div className="text-sm text-gray-500">{s.reason} · Last work day: {s.lastWorkDay.toLocaleDateString()} · {done}/{items.length} done</div>
                  <ul className="divide-y divide-gray-100 text-sm">
                    {items.map((it, idx) => (
                      <li key={idx} className="flex items-center justify-between py-1.5">
                        <span className={it.done ? "text-gray-400 line-through" : ""}>{it.label}</span>
                        {canManage && (
                          <ActionForm action={toggleSeparationItem} submit={it.done ? "Undo" : "Mark done"} variant="ghost">
                            <input type="hidden" name="checklistId" value={s.id} /><input type="hidden" name="index" value={idx} />
                          </ActionForm>
                        )}
                      </li>
                    ))}
                  </ul>
                  {canManage && done === items.length && (
                    <ActionForm action={completeSeparation} submit="Complete separation" confirmText="Close this checklist?"><input type="hidden" name="checklistId" value={s.id} /></ActionForm>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </main>
  );
}
