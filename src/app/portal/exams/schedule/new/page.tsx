import { requirePermission, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { createExamSchedule } from "../../../exams/scheduling-actions";

export const metadata = { title: "Schedule Exam" };

export default async function NewExamSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ campusId?: string }>;
}) {
  const ctx = await requirePermission("exams.manage");
  const { campusId } = await searchParams;
  if (!campusId || !canForCampus(ctx, "exams.manage", campusId)) redirect("/portal/exams/schedule");

  const [rooms, staff, sections] = await Promise.all([
    prisma.room.findMany({
      where: { tenantId: ctx.tenantId!, campusId },
      orderBy: { name: "asc" },
    }),
    prisma.staff.findMany({
      where: { tenantId: ctx.tenantId! },
      include: { person: true },
      orderBy: { person: { lastName: "asc" } },
    }),
    prisma.section.findMany({
      where: { tenantId: ctx.tenantId!, campusId },
      include: { gradeLevel: true, academicYear: true },
      orderBy: [{ gradeLevel: { rank: "asc" } }, { name: "asc" }],
    }),
  ]);

  async function submitSchedule(fd: FormData) {
    "use server";
    // Checkboxes send multiple values; join into a single comma-separated string.
    const staffIds = fd.getAll("staffIds").join(",");
    fd.delete("staffIds");
    fd.set("staffIds", staffIds);
    const result = await createExamSchedule({}, fd);
    if (!result.error) redirect(`/portal/exams/schedule?campusId=${campusId}`);
  }

  const inputCls =
    "w-full rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200";

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6">
        <a href={`/portal/exams/schedule?campusId=${campusId}`} className="text-sm text-brand-700 hover:underline">
          ← Back to schedules
        </a>
      </div>
      <h1 className="mb-6 text-2xl font-semibold">Schedule an exam</h1>

      <form action={submitSchedule} className="space-y-5">
        <input type="hidden" name="campusId" value={campusId} />

        <div>
          <label className="mb-1 block text-sm font-medium">Exam name</label>
          <input name="name" required placeholder="e.g. Mathematics Mid-Term" className={inputCls} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Date</label>
            <input name="examDate" type="date" required className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Start time</label>
            <input name="startTime" type="time" required className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">End time</label>
            <input name="endTime" type="time" required className={inputCls} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Room (optional)</label>
          <select name="roomId" className={inputCls}>
            <option value="">No room assigned</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.code}) — capacity {r.capacity}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Section for seat plan (optional)</label>
          <select name="sectionId" className={inputCls}>
            <option value="">No auto-seating</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.gradeLevel.name} {s.name} · {s.academicYear.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[color:var(--color-muted)]">
            If selected, active enrollments will be assigned seats in roll-number order.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Invigilators (optional)</label>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-[color:var(--color-line)] divide-y divide-[color:var(--color-line)]">
            {staff.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  name="staffIds"
                  value={s.id}
                  className="rounded"
                />
                <span>
                  {s.person.firstName} {s.person.lastName}
                  {s.title ? ` (${s.title})` : ""}
                </span>
              </label>
            ))}
            {staff.length === 0 && (
              <p className="px-3 py-3 text-sm text-[color:var(--color-muted)]">No staff found.</p>
            )}
          </div>
          <p className="mt-1 text-xs text-[color:var(--color-muted)]">
            First selected invigilator is marked as primary.
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Create schedule
          </button>
          <a
            href={`/portal/exams/schedule?campusId=${campusId}`}
            className="rounded-lg px-5 py-2.5 text-sm font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
