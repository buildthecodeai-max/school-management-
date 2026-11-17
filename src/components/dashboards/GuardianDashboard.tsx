import Link from "next/link";
import { prisma } from "@/lib/db";
import type { AuthzContext } from "@/lib/rbac";
import { formatMoney } from "@/lib/money";
import { StatCard, Card, PageHeader, Badge } from "@/components/ui";

export async function GuardianDashboard({
  ctx,
  guardianId,
}: {
  ctx: AuthzContext;
  guardianId: string;
}) {
  const links = await prisma.guardianRelationship.findMany({
    where: { guardianId, tenantId: ctx.tenantId! },
    include: {
      student: {
        include: {
          person: true,
          enrollments: {
            where: { status: "ACTIVE" },
            include: { section: true, gradeLevel: true, campus: true },
            take: 1,
          },
        },
      },
    },
  });

  // Attendance summary per child (last 30 days).
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const children = await Promise.all(
    links.map(async (link) => {
      const records = await prisma.attendanceRecord.findMany({
        where: {
          studentId: link.student.id,
          createdAt: { gte: since },
        },
        include: { code: true },
      });
      const present = records.filter((r) => r.code.countsAsPresent).length;
      const total = records.length;
      const pct = total > 0 ? Math.round((present / total) * 100) : null;
      const recentAbsences = records
        .filter((r) => !r.code.countsAsPresent)
        .length;
      const balAgg = await prisma.invoice.aggregate({
        where: { studentId: link.student.id },
        _sum: { balance: true },
      });
      const feeBalance = balAgg._sum.balance ?? 0;

      // Most recent published report card for this student, if any — links
      // straight to the same report page a guardian is already authorized to
      // view (POR-001/POR-002: dedicated child context reachable in one click,
      // no re-authentication or role switch required).
      const latestResult = await prisma.studentResult.findFirst({
        where: {
          studentId: link.student.id,
          version: { status: "PUBLISHED" },
        },
        orderBy: { version: { publishedAt: "desc" } },
        select: { version: { select: { planId: true } } },
      });

      return { link, pct, total, recentAbsences, feeBalance, latestResult };
    }),
  );

  const messages = await prisma.message.findMany({
    where: { recipientUserId: ctx.user.id },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return (
    <div>
      <PageHeader
        title={`Welcome, ${ctx.user.displayName}`}
        subtitle="Your children's attendance, results and school notices."
      />

      {children.length === 0 ? (
        <Card>
          <p className="text-sm text-[color:var(--color-muted)]">
            No linked children found on this account.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {children.map(({ link, pct, total, recentAbsences, feeBalance, latestResult }) => {
            const enr = link.student.enrollments[0];
            const p = link.student.person;
            return (
              <Card key={link.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-lg font-semibold text-brand-700">
                      {p.firstName[0]}
                      {p.lastName[0]}
                    </div>
                    <div>
                      <p className="text-lg font-semibold">
                        {p.firstName} {p.lastName}
                      </p>
                      <p className="text-sm text-[color:var(--color-muted)]">
                        {enr
                          ? `${enr.campus.name} · ${enr.gradeLevel.name} · ${enr.section.name}`
                          : "Not currently enrolled"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {link.isPrimaryContact && <Badge tone="brand">Primary</Badge>}
                    {link.financiallyResponsible && (
                      <Badge tone="sky">Fee payer</Badge>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <StatCard
                    label="Attendance (30d)"
                    value={pct === null ? "—" : `${pct}%`}
                    tone={pct !== null && pct < 90 ? "amber" : "green"}
                    hint={`${total} sessions recorded`}
                  />
                  <StatCard
                    label="Absences (30d)"
                    value={recentAbsences}
                    tone={recentAbsences > 0 ? "amber" : "slate"}
                  />
                  <StatCard
                    label="Fee balance"
                    value={formatMoney(feeBalance)}
                    tone={feeBalance > 0 ? "amber" : "green"}
                    hint={link.financiallyResponsible ? "you are fee payer" : undefined}
                  />
                </div>

                <div className="mt-3 flex gap-4 border-t border-[color:var(--color-line)] pt-3 text-sm">
                  {latestResult ? (
                    <Link
                      href={`/portal/exams/${latestResult.version.planId}/report/${link.student.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      View report card →
                    </Link>
                  ) : (
                    <span className="text-[color:var(--color-muted)]">No published report card yet</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-6">
        <Card>
          <h3 className="mb-3 font-semibold">Recent notices</h3>
          {messages.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">
              No messages yet.
            </p>
          ) : (
            <ul className="divide-y divide-[color:var(--color-line)]">
              {messages.map((m) => (
                <li key={m.id} className="py-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{m.title}</p>
                    <span className="text-xs text-[color:var(--color-muted)]">
                      {m.createdAt.toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-[color:var(--color-muted)]">
                    {m.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
