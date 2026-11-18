import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Badge } from "@/components/ui";
import { ActionForm, inputCls, labelCls } from "@/components/ActionForm";
import { addTimetableSlot, removeTimetableSlot } from "../actions";

export const metadata = { title: "Edit timetable" };

const DAYS = [["MON", "Monday"], ["TUE", "Tuesday"], ["WED", "Wednesday"], ["THU", "Thursday"], ["FRI", "Friday"], ["SAT", "Saturday"]] as const;

export default async function TimetableEditorPage({ params }: { params: Promise<{ versionId: string }> }) {
  const ctx = await requireUser();
  const { versionId } = await params;
  const version = await prisma.timetableVersion.findFirst({ where: { id: versionId, tenantId: ctx.tenantId! } });
  if (!version || !canForCampus(ctx, "timetable.read", version.campusId)) notFound();
  const canWrite = canForCampus(ctx, "timetable.write", version.campusId);
  const editable = canWrite && version.status === "DRAFT";

  const [slots, sections, subjects, staff, rooms] = await Promise.all([
    prisma.timetableSlot.findMany({
      where: { versionId },
      include: { section: { include: { gradeLevel: true } }, subject: true, staff: { include: { person: true } }, room: true },
      orderBy: [{ section: { name: "asc" } }, { dayOfWeek: "asc" }, { periodNumber: "asc" }],
    }),
    prisma.section.findMany({ where: { tenantId: ctx.tenantId!, campusId: version.campusId }, include: { gradeLevel: true }, orderBy: [{ gradeLevel: { rank: "asc" } }, { name: "asc" }] }),
    prisma.subject.findMany({ where: { tenantId: ctx.tenantId!, OR: [{ campusId: null }, { campusId: version.campusId }] }, orderBy: { name: "asc" } }),
    prisma.staff.findMany({ where: { tenantId: ctx.tenantId!, employmentRecords: { some: { campusId: version.campusId } } }, include: { person: true }, orderBy: { person: { lastName: "asc" } } }),
    prisma.room.findMany({ where: { tenantId: ctx.tenantId!, campusId: version.campusId }, orderBy: { code: "asc" } }),
  ]);
  const order = new Map(DAYS.map(([d], i) => [d as string, i]));
  slots.sort((a, b) => a.section.name.localeCompare(b.section.name) || (order.get(a.dayOfWeek) ?? 9) - (order.get(b.dayOfWeek) ?? 9) || a.periodNumber - b.periodNumber);
  const th = "pb-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]";

  return (
    <div>
      <div className="mb-4">
        <Link href={`/portal/academics/timetable?campusId=${version.campusId}&versionId=${version.id}`} className="text-sm text-brand-700 hover:underline">← Timetable grid</Link>
      </div>
      <PageHeader
        title={version.name}
        subtitle={`${slots.length} slot${slots.length === 1 ? "" : "s"}`}
        action={<Badge tone={version.status === "ACTIVE" ? "green" : version.status === "DRAFT" ? "amber" : "slate"}>{version.status}</Badge>}
      />

      {!editable && (
        <p className="mb-4 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">
          {version.status === "DRAFT" ? "You can view this draft but not edit it." : "Published and archived versions are read-only. Create a new version to change the timetable."}
        </p>
      )}

      {editable && (
        <Card className="mb-6">
          <h3 className="mb-3 font-semibold">Add a slot</h3>
          {sections.length === 0 || subjects.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">
              Sections and subjects are needed first. <Link className="text-brand-700 underline" href="/portal/academics/config">Configure academics</Link>.
            </p>
          ) : (
            <ActionForm action={addTimetableSlot} submit="Add slot" pendingLabel="Adding…" className="grid gap-3 sm:grid-cols-3">
              <input type="hidden" name="versionId" value={version.id} />
              <label><span className={labelCls}>Section</span>
                <select name="sectionId" required className={inputCls}>{sections.map((s) => <option key={s.id} value={s.id}>{s.gradeLevel.name} · {s.name}</option>)}</select></label>
              <label><span className={labelCls}>Subject</span>
                <select name="subjectId" required className={inputCls}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              <label><span className={labelCls}>Teacher</span>
                <select name="staffId" className={inputCls}><option value="">— none —</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.person.firstName} {s.person.lastName}</option>)}</select></label>
              <label><span className={labelCls}>Room</span>
                <select name="roomId" className={inputCls}><option value="">— none —</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.name}</option>)}</select></label>
              <label><span className={labelCls}>Day</span>
                <select name="dayOfWeek" required className={inputCls}>{DAYS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}</select></label>
              <label><span className={labelCls}>Period</span>
                <input name="periodNumber" type="number" min={1} max={12} defaultValue={1} required className={inputCls} /></label>
              <label><span className={labelCls}>Starts</span>
                <input name="startTime" type="time" defaultValue="08:00" required className={inputCls} /></label>
              <label><span className={labelCls}>Ends</span>
                <input name="endTime" type="time" defaultValue="08:45" required className={inputCls} /></label>
            </ActionForm>
          )}
        </Card>
      )}

      <Card>
        {slots.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">No slots yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr><th className={th}>Section</th><th className={th}>Day</th><th className={th}>Period</th><th className={th}>Time</th><th className={th}>Subject</th><th className={th}>Teacher</th><th className={th}>Room</th><th /></tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-line)]">
                {slots.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2 pr-4">{s.section.gradeLevel.name} · {s.section.name}</td>
                    <td className="py-2 pr-4">{s.dayOfWeek}</td>
                    <td className="py-2 pr-4">{s.periodNumber}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{s.startTime}–{s.endTime}</td>
                    <td className="py-2 pr-4">{s.subject.name}</td>
                    <td className="py-2 pr-4">{s.staff ? `${s.staff.person.firstName} ${s.staff.person.lastName}` : "—"}</td>
                    <td className="py-2 pr-4">{s.room?.code ?? "—"}</td>
                    <td className="py-2 text-right">
                      {editable && (
                        <ActionForm action={removeTimetableSlot} submit="Remove" variant="danger" confirmText="Remove this slot?">
                          <input type="hidden" name="slotId" value={s.id} />
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
