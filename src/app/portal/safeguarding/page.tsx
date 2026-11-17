import { requireUser, canForCampus } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { preferredCampusId, resolveCampusId } from "@/lib/campus-preference";

export const metadata = { title: "Safeguarding" };

export default async function SafeguardingPage({
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

  // safeguarding.case.read is NOT in any default role — deliberately narrow.
  const accessible = campuses.filter((c) => canForCampus(ctx, "safeguarding.case.read", c.id));
  const preferred = await preferredCampusId(ctx, "safeguarding.case.read");
  const campusId = resolveCampusId(params.campusId, preferred, accessible);

  if (!campusId || !canForCampus(ctx, "safeguarding.case.read", campusId)) {
    redirect("/portal");
  }

  const cases = await prisma.safeguardingCase.findMany({
    where: { tenantId: ctx.tenantId!, campusId },
    include: {
      student: { include: { person: true } },
      notes: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const open = cases.filter((c) => c.status !== "CLOSED");
  const closed = cases.filter((c) => c.status === "CLOSED");

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Safeguarding</h1>
        <span className="rounded bg-red-100 px-3 py-1 text-xs font-medium text-red-800">
          Sensitive — restricted access
        </span>
      </div>

      {/* Campus tabs (only visible ones) */}
      <div className="flex gap-2 flex-wrap">
        {campuses
          .filter((c) => canForCampus(ctx, "safeguarding.case.read", c.id))
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

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Open cases ({open.length})</h2>
        {open.length === 0 ? (
          <p className="text-gray-500">No open cases.</p>
        ) : (
          open.map((c) => (
            <div key={c.id} className="rounded border border-gray-200 p-4 space-y-1">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{c.title}</div>
                  <div className="text-sm text-gray-500">
                    {c.student.person.firstName} {c.student.person.lastName} · {c.status.replace("_", " ")}
                  </div>
                </div>
                <a
                  href={`/portal/safeguarding/${c.id}?campusId=${campusId}`}
                  className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50"
                >
                  View
                </a>
              </div>
              {c.notes[0] && (
                <p className="text-xs text-gray-400 truncate">{c.notes[0].body}</p>
              )}
            </div>
          ))
        )}
      </section>

      {closed.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-500">Closed cases ({closed.length})</h2>
          {closed.map((c) => (
            <div key={c.id} className="rounded border border-gray-200 p-3 text-sm text-gray-500">
              {c.title} — {c.student.person.firstName} {c.student.person.lastName}
              {c.closedAt && ` · Closed ${c.closedAt.toLocaleDateString()}`}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
