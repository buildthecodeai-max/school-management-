import { requirePermission, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Badge } from "@/components/ui";
import Link from "next/link";
import { saveStaffAttendance } from "./actions";

const STATUSES = ["PRESENT", "ABSENT", "LATE", "HALF_DAY", "LEAVE"] as const;
type Status = (typeof STATUSES)[number];

function statusTone(s: string): "green" | "red" | "amber" | "slate" {
  if (s === "PRESENT") return "green";
  if (s === "ABSENT") return "red";
  if (s === "LATE" || s === "HALF_DAY") return "amber";
  return "slate";
}

export default async function StaffAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ campusId?: string; date?: string }>;
}) {
  const ctx = await requirePermission("hr.staff.read");
  const params = await searchParams;

  const campuses = await prisma.campus.findMany({
    where: { tenantId: ctx.tenantId!, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });

  const campusId =
    params.campusId ??
    campuses.find((c) => canForCampus(ctx, "hr.staff.read", c.id))?.id;

  const dateStr = params.date ?? new Date().toISOString().slice(0, 10);
  const date = new Date(dateStr);
  date.setUTCHours(0, 0, 0, 0);

  const canWrite = campusId ? canForCampus(ctx, "hr.staff.write", campusId) : false;

  const [staff, existingRecords] = campusId
    ? await Promise.all([
        prisma.staff.findMany({
          where: {
            tenantId: ctx.tenantId!,
            employmentRecords: { some: { campusId, endDate: null } },
          },
          include: {
            person: true,
            employmentRecords: {
              where: { campusId, endDate: null },
              include: { position: { include: { department: true } } },
              take: 1,
            },
          },
          orderBy: { person: { lastName: "asc" } },
        }),
        prisma.staffAttendanceRecord.findMany({
          where: { tenantId: ctx.tenantId!, campusId, date },
        }),
      ])
    : [[], []];

  const recordMap = new Map(existingRecords.map((r) => [r.staffId, r]));

  const thCls = "pb-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]";
  const tdCls = "py-2 pr-4 text-sm";

  return (
    <div>
      <div className="mb-4">
        <Link href="/portal/hr" className="text-sm text-brand-700 hover:underline">
          ← HR
        </Link>
      </div>

      <PageHeader
        title="Staff attendance"
        subtitle="Daily register for all active staff on a campus."
      />

      {/* Campus + date pickers */}
      <form method="get" className="mb-6 flex flex-wrap gap-3">
        <select
          name="campusId"
          defaultValue={campusId ?? ""}
          className="rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm"
        >
          <option value="" disabled>Select campus…</option>
          {campuses.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input
          type="date"
          name="date"
          defaultValue={dateStr}
          className="rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50"
        >
          Load
        </button>
      </form>

      {!campusId ? (
        <Card>
          <p className="text-sm text-[color:var(--color-muted)]">Select a campus to view staff.</p>
        </Card>
      ) : staff.length === 0 ? (
        <Card>
          <p className="text-sm text-[color:var(--color-muted)]">No active staff on this campus.</p>
        </Card>
      ) : (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">
              {date.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </h3>
            <span className="text-sm text-[color:var(--color-muted)]">
              {existingRecords.length}/{staff.length} recorded
            </span>
          </div>

          <form action={saveStaffAttendance}>
            <input type="hidden" name="campusId" value={campusId} />
            <input type="hidden" name="date" value={dateStr} />
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={thCls}>Name</th>
                    <th className={thCls}>Position</th>
                    <th className={thCls}>Status</th>
                    <th className={thCls + " pr-0"}>Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-line)]">
                  {staff.map((s) => {
                    const rec = recordMap.get(s.id);
                    const position = s.employmentRecords[0]?.position;
                    return (
                      <tr key={s.id}>
                        <td className={tdCls + " font-medium"}>
                          {s.person.firstName} {s.person.lastName}
                        </td>
                        <td className={tdCls + " text-[color:var(--color-muted)]"}>
                          {position?.title ?? "—"}
                        </td>
                        <td className="py-2 pr-4">
                          {canWrite ? (
                            <select
                              name={`status_${s.id}`}
                              defaultValue={rec?.status ?? "PRESENT"}
                              className="rounded border border-[color:var(--color-line)] bg-white px-2 py-1 text-sm"
                            >
                              {STATUSES.map((st) => (
                                <option key={st} value={st}>{st.replace("_", " ")}</option>
                              ))}
                            </select>
                          ) : rec ? (
                            <Badge tone={statusTone(rec.status)}>{rec.status.replace("_", " ")}</Badge>
                          ) : (
                            <span className="text-xs text-[color:var(--color-muted)]">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-0">
                          {canWrite ? (
                            <input
                              name={`note_${s.id}`}
                              defaultValue={rec?.note ?? ""}
                              placeholder="Optional note"
                              className="w-full rounded border border-[color:var(--color-line)] bg-white px-2 py-1 text-sm"
                            />
                          ) : (
                            <span className="text-sm text-[color:var(--color-muted)]">{rec?.note ?? ""}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {canWrite && (
              <div className="mt-4 flex justify-end">
                <button
                  type="submit"
                  className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Save attendance
                </button>
              </div>
            )}
          </form>
        </Card>
      )}
    </div>
  );
}
