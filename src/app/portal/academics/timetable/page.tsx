import { requireUser, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { publishTimetableVersion } from "./actions";
import { ActionForm } from "@/components/ActionForm";

export const metadata = { title: "Timetable" };

const DAYS = ["MON", "TUE", "WED", "THU", "FRI"] as const;
const DAY_LABEL: Record<string, string> = {
  MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday", FRI: "Friday",
};

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ campusId?: string; versionId?: string }>;
}) {
  const ctx = await requireUser();
  const params = await searchParams;

  const campuses = await prisma.campus.findMany({
    where: { tenantId: ctx.tenantId!, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });

  // Default to the first campus the user can actually read, not just campuses[0]
  // (which could be alphabetically first but not in the user's campus scope).
  const defaultCampusId =
    params.campusId ??
    campuses.find((c) => canForCampus(ctx, "timetable.read", c.id))?.id;
  const campusId = defaultCampusId;

  const canRead = campusId ? canForCampus(ctx, "timetable.read", campusId) : false;
  const canWrite = campusId ? canForCampus(ctx, "timetable.write", campusId) : false;
  const canPublish = campusId ? canForCampus(ctx, "timetable.publish", campusId) : false;

  if (!canRead) {
    return (
      <main className="p-8">
        <p className="text-red-600">You do not have permission to view timetables.</p>
      </main>
    );
  }

  const versions = campusId
    ? await prisma.timetableVersion.findMany({
        where: { campusId, tenantId: ctx.tenantId! },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const versionId = params.versionId ?? versions.find((v) => v.status === "ACTIVE")?.id ?? versions[0]?.id;

  const version = versionId ? versions.find((v) => v.id === versionId) : null;

  const slots = versionId
    ? await prisma.timetableSlot.findMany({
        where: { versionId },
        include: {
          section: true,
          subject: true,
          staff: { include: { person: true } },
          room: true,
        },
        orderBy: [{ dayOfWeek: "asc" }, { periodNumber: "asc" }],
      })
    : [];

  // Group slots by day then by period
  const slotsByDay = new Map<string, typeof slots>();
  for (const day of DAYS) slotsByDay.set(day, []);
  for (const slot of slots) {
    const bucket = slotsByDay.get(slot.dayOfWeek) ?? [];
    bucket.push(slot);
    slotsByDay.set(slot.dayOfWeek, bucket);
  }

  const maxPeriod = slots.reduce((m, s) => Math.max(m, s.periodNumber), 0) || 8;

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Timetable</h1>
        {canWrite && (
          <Link
            href="/portal/academics/timetable/new"
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            New version
          </Link>
        )}
      </div>

      {/* Campus selector */}
      <div className="flex gap-2 flex-wrap">
        {campuses.map((c) => (
          <a
            key={c.id}
            href={`?campusId=${c.id}`}
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

      {/* Version picker */}
      {versions.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-sm text-gray-500">Version:</span>
          {versions.map((v) => (
            <a
              key={v.id}
              href={`?campusId=${campusId}&versionId=${v.id}`}
              className={`rounded px-3 py-1 text-sm border ${
                v.id === versionId
                  ? "bg-gray-800 text-white border-gray-800"
                  : "border-gray-300 hover:bg-gray-50"
              }`}
            >
              {v.name}
              {v.status === "ACTIVE" && (
                <span className="ml-1 text-xs text-emerald-400">(active)</span>
              )}
              {v.status === "DRAFT" && (
                <span className="ml-1 text-xs text-yellow-600">(draft)</span>
              )}
            </a>
          ))}
        </div>
      )}

      {version && (
        <Link href={`/portal/academics/timetable/${version.id}`} className="inline-block text-sm text-indigo-600 underline">
          {canWrite && version.status === "DRAFT" ? "Edit slots" : "Slot list"}
        </Link>
      )}

      {version && canPublish && version.status === "DRAFT" && (
        <ActionForm action={publishTimetableVersion} submit="Publish this version" confirmText="Publish this timetable? It replaces the active version.">
          <input type="hidden" name="versionId" value={version.id} />
        </ActionForm>
      )}

      {versions.length === 0 && (
        <p className="text-gray-500">
          No timetable versions yet.{" "}
          {canWrite && (
            <Link href="/portal/academics/timetable/new" className="text-indigo-600 underline">
              Create the first one.
            </Link>
          )}
        </p>
      )}

      {/* Grid */}
      {version && slots.length > 0 && (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Period
                </th>
                {DAYS.map((d) => (
                  <th key={d} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    {DAY_LABEL[d]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Array.from({ length: maxPeriod }, (_, i) => i + 1).map((period) => (
                <tr key={period} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-700">{period}</td>
                  {DAYS.map((day) => {
                    const daySlots = (slotsByDay.get(day) ?? []).filter(
                      (s) => s.periodNumber === period,
                    );
                    return (
                      <td key={day} className="px-3 py-2">
                        {daySlots.map((s) => (
                          <div key={s.id} className="rounded bg-indigo-50 px-2 py-1 text-xs space-y-0.5">
                            <div className="font-medium text-indigo-800">{s.subject.name}</div>
                            <div className="text-indigo-600">{s.section.name}</div>
                            {s.staff && (
                              <div className="text-gray-500">
                                {s.staff.person.firstName} {s.staff.person.lastName}
                              </div>
                            )}
                            {s.room && <div className="text-gray-400">{s.room.code}</div>}
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {version && slots.length === 0 && (
        <p className="text-gray-500">
          No slots in this version.{" "}
          {canWrite && (
            <Link
              href={`/portal/academics/timetable/${version.id}`}
              className="text-indigo-600 underline"
            >
              Add the first slot.
            </Link>
          )}
        </p>
      )}
    </main>
  );
}
