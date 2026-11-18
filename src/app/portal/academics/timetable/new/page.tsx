import Link from "next/link";
import { requireUser, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader, Card } from "@/components/ui";
import { NewVersionForm } from "./NewVersionForm";

export const metadata = { title: "New Timetable Version" };

export default async function NewTimetableVersionPage() {
  const ctx = await requireUser();
  const campuses = await prisma.campus.findMany({
    where: { tenantId: ctx.tenantId!, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });
  const writable = campuses.filter((c) => canForCampus(ctx, "timetable.write", c.id));
  if (writable.length === 0) {
    return <Card><p className="text-sm text-red-700">You do not have permission to create timetables.</p></Card>;
  }
  const years = await prisma.academicYear.findMany({
    where: { tenantId: ctx.tenantId!, campusId: { in: writable.map((c) => c.id) } },
    orderBy: [{ startDate: "desc" }],
    take: 30,
  });
  const campusName = new Map(writable.map((c) => [c.id, c.name]));

  return (
    <div className="max-w-xl">
      <div className="mb-4">
        <Link href="/portal/academics/timetable" className="text-sm text-brand-700 hover:underline">← Timetable</Link>
      </div>
      <PageHeader title="New timetable version" subtitle="Build it as a draft, then publish when it is conflict-free." />
      {years.length === 0 ? (
        <Card>
          <p className="text-sm">No academic year exists yet. <Link href="/portal/academics/config?tab=years" className="text-brand-700 underline">Create one first.</Link></p>
        </Card>
      ) : (
        <Card>
          <NewVersionForm years={years.map((y) => ({ id: y.id, label: `${campusName.get(y.campusId)} · ${y.name}` }))} />
        </Card>
      )}
    </div>
  );
}
