import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { familyLinks } from "@/lib/family";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";

export const metadata = { title: "My children" };

export default async function FamilyIndexPage() {
  const ctx = await requireUser();
  const links = await familyLinks(ctx);
  if (links.length === 1) redirect(`/portal/family/${links[0].studentId}`);
  const students = await prisma.student.findMany({
    where: { tenantId: ctx.tenantId!, id: { in: links.map((l) => l.studentId) } },
    include: { person: true, enrollments: { where: { status: "ACTIVE" }, include: { campus: true, gradeLevel: true, section: true }, take: 1 } },
  });
  return (
    <div>
      <PageHeader title="My children" subtitle="Attendance, results, fees, timetable and leave for each child" />
      {students.length === 0 ? (
        <EmptyState title="No children are linked to your account" hint="If this looks wrong, ask the school office to link you to your child." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {students.map((s) => {
            const e = s.enrollments[0];
            return (
              <Link key={s.id} href={`/portal/family/${s.id}`}>
                <Card className="transition hover:border-brand-300 hover:shadow-sm">
                  <p className="text-lg font-semibold">{s.person.firstName} {s.person.lastName}</p>
                  <p className="text-sm text-[color:var(--color-muted)]">{e ? `${e.campus.name} · ${e.gradeLevel.name} · ${e.section.name}` : "Not currently enrolled"}</p>
                  <div className="mt-2"><Badge tone="brand">{links.find((l) => l.studentId === s.id)?.relation === "self" ? "You" : "Your child"}</Badge></div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
