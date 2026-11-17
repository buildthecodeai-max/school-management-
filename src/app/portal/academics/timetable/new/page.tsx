import { requireUser, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { createTimetableVersion } from "../actions";
import { redirect } from "next/navigation";
import Link from "next/link";

export const metadata = { title: "New Timetable Version" };

export default async function NewTimetableVersionPage() {
  const ctx = await requireUser();

  const campuses = await prisma.campus.findMany({
    where: { tenantId: ctx.tenantId!, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });

  const writableCampuses = campuses.filter((c) => canForCampus(ctx, "timetable.write", c.id));
  if (writableCampuses.length === 0) {
    return (
      <main className="p-8">
        <p className="text-red-600">You do not have permission to create timetables.</p>
      </main>
    );
  }

  const firstCampus = writableCampuses[0];
  const academicYears = await prisma.academicYear.findMany({
    where: { campusId: firstCampus.id, tenantId: ctx.tenantId! },
    orderBy: { startDate: "desc" },
    take: 10,
  });

  return (
    <main className="p-6 max-w-xl space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/portal/academics/timetable" className="text-indigo-600 hover:underline text-sm">
          ← Timetable
        </Link>
      </div>
      <h1 className="text-2xl font-bold">New Timetable Version</h1>

      <form
          action={async (formData: FormData) => {
            "use server";
            const result = await createTimetableVersion(undefined as never, formData);
            if (result.ok) redirect("/portal/academics/timetable");
          }}
          className="space-y-4"
        >
        <div>
          <label className="block text-sm font-medium mb-1">Campus</label>
          <select name="campusId" required className="w-full border rounded px-3 py-2">
            {writableCampuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Academic year</label>
          <select name="academicYearId" required className="w-full border rounded px-3 py-2">
            {academicYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Version name</label>
          <input
            name="name"
            type="text"
            required
            placeholder="e.g. Term 1 2025"
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <button
          type="submit"
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Create version
        </button>
      </form>
    </main>
  );
}
