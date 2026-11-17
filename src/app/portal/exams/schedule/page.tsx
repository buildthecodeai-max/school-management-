import { requirePermission, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { assignSeats } from "./actions";

export const metadata = { title: "Exam Schedules" };

export default async function ExamSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ campusId?: string }>;
}) {
  const ctx = await requirePermission("exams.read");
  const params = await searchParams;

  const campuses = await prisma.campus.findMany({
    where: { tenantId: ctx.tenantId!, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });

  const campusId =
    params.campusId ?? campuses.find((c) => canForCampus(ctx, "exams.read", c.id))?.id;
  const canManage = campusId ? canForCampus(ctx, "exams.manage", campusId) : false;

  const schedules = campusId
    ? await prisma.examSchedule.findMany({
        where: { campusId, tenantId: ctx.tenantId! },
        include: {
          invigilators: { include: { staff: { include: { person: true } } } },
          _count: { select: { seatAssignments: true } },
        },
        orderBy: { examDate: "asc" },
      })
    : [];

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Exam Schedules</h1>
        <div className="flex gap-2">
          <Link href="/portal/exams" className="text-sm text-gray-500 hover:underline">
            ← Exams
          </Link>
          {canManage && campusId && (
            <Link
              href={`/portal/exams/schedule/new?campusId=${campusId}`}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Schedule exam
            </Link>
          )}
        </div>
      </div>

      {/* Campus tabs */}
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

      {schedules.length === 0 ? (
        <p className="text-gray-500">
          No exam schedules yet.{" "}
          {canManage && campusId && (
            <Link href={`/portal/exams/schedule/new?campusId=${campusId}`} className="text-indigo-600 underline">
              Create one.
            </Link>
          )}
        </p>
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => (
            <div key={s.id} className="rounded border border-gray-200 p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{s.name}</div>
                  <div className="text-sm text-gray-500">
                    {s.examDate.toLocaleDateString()} · {s.startTime}–{s.endTime}
                  </div>
                  <div className="text-sm text-gray-500">
                    {s._count.seatAssignments} seat(s) assigned ·{" "}
                    {s.invigilators.length > 0
                      ? s.invigilators
                          .map((iv) => `${iv.staff.person.firstName} ${iv.staff.person.lastName}`)
                          .join(", ")
                      : "No invigilators assigned"}
                  </div>
                </div>
                {canManage && campusId && (
                  <form
                    action={async () => {
                      "use server";
                      await assignSeats(s.id, campusId);
                    }}
                  >
                    <button
                      type="submit"
                      className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50"
                    >
                      Assign seats
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
