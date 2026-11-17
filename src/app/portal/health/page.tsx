import { requireUser, canForCampus } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export const metadata = { title: "Health Records" };

export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<{ campusId?: string }>;
}) {
  const ctx = await requireUser();
  const params = await searchParams;

  const campuses = await prisma.campus.findMany({
    where: { tenantId: ctx.tenantId!, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });

  // health.record.read is NOT in any default role — deliberately narrow.
  const campusId =
    params.campusId ??
    campuses.find((c) => canForCampus(ctx, "health.record.read", c.id))?.id;

  if (!campusId || !canForCampus(ctx, "health.record.read", campusId)) {
    redirect("/portal");
  }

  const records = await prisma.healthRecord.findMany({
    where: { tenantId: ctx.tenantId!, campusId },
    include: {
      student: { include: { person: true } },
      incidents: { orderBy: { occurredAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Health Records</h1>
        <span className="rounded bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
          Restricted access
        </span>
      </div>

      {/* Campus tabs */}
      <div className="flex gap-2 flex-wrap">
        {campuses
          .filter((c) => canForCampus(ctx, "health.record.read", c.id))
          .map((c) => (
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

      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs uppercase text-gray-500">
              <th className="px-3 py-2 text-left">Student</th>
              <th className="px-3 py-2 text-left">Allergies</th>
              <th className="px-3 py-2 text-left">Conditions</th>
              <th className="px-3 py-2 text-left">Last incident</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {records.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-400">
                  No health records on file.
                </td>
              </tr>
            )}
            {records.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium">
                  {r.student.person.firstName} {r.student.person.lastName}
                </td>
                <td className="px-3 py-2">{r.allergies ?? "None"}</td>
                <td className="px-3 py-2">{r.conditions ?? "None"}</td>
                <td className="px-3 py-2">
                  {r.incidents[0]
                    ? r.incidents[0].occurredAt.toLocaleDateString()
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
