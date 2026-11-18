import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader, Card } from "@/components/ui";
import { formatDay } from "@/lib/attendance";
import { dayStart } from "@/lib/dates";
import { TripForm } from "./TripForm";

export const metadata = { title: "Record trip" };

export default async function RecordTripPage({ searchParams }: { searchParams: Promise<{ routeId?: string }> }) {
  const ctx = await requireUser();
  const { routeId } = await searchParams;
  const route = routeId ? await prisma.route.findFirst({
    where: { id: routeId, tenantId: ctx.tenantId!, active: true },
    include: { vehicle: true, assignments: { include: { student: { include: { person: true } } } } },
  }) : null;
  if (!route || !canForCampus(ctx, "transport.trip.record", route.campusId)) notFound();
  const recent = await prisma.tripAttendance.findMany({ where: { routeId: route.id }, orderBy: [{ tripDate: "desc" }, { createdAt: "desc" }], take: 8 });
  const today = formatDay(dayStart());

  return (
    <div className="max-w-2xl">
      <div className="mb-4"><Link href="/portal/transport" className="text-sm text-brand-700 hover:underline">← Transport</Link></div>
      <PageHeader title={`Record trip — ${route.name}`} subtitle={route.vehicle ? route.vehicle.regNumber : "No vehicle assigned"} />
      {route.assignments.length === 0 ? (
        <Card><p className="text-sm text-[color:var(--color-muted)]">No students are assigned to this route yet.</p></Card>
      ) : (
        <TripForm
          routeId={route.id}
          today={today}
          students={route.assignments.map((a) => ({ id: a.studentId, name: `${a.student.person.firstName} ${a.student.person.lastName}`, admissionNumber: a.student.admissionNumber }))}
        />
      )}
      {recent.length > 0 && (
        <Card className="mt-6">
          <h3 className="mb-2 text-sm font-semibold">Recent trips</h3>
          <ul className="space-y-1 text-sm">
            {recent.map((t) => {
              const recs = (t.records as { status: string }[]) ?? [];
              return <li key={t.id}>{formatDay(t.tripDate)} · {t.direction.toLowerCase()} · {recs.filter((r) => r.status === "BOARDED").length} boarded, {recs.filter((r) => r.status === "ABSENT").length} absent, {recs.filter((r) => r.status === "LATE").length} late</li>;
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
