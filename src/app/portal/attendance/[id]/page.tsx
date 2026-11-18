import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { allowedCampusIds } from "@/lib/scope";
import { dayStart, dayEnd } from "@/lib/dates";
import { PageHeader, Badge } from "@/components/ui";
import { RegisterForm } from "./RegisterForm";
import { parseDay, formatDay, checkRegisterDate } from "@/lib/attendance";
import { ActionForm } from "@/components/ActionForm";
import { lockAttendanceRegister } from "../actions";

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const ctx = await requirePermission("attendance.read");
  const { id } = await params;
  const sp = await searchParams;
  const day = (sp.date ? parseDay(sp.date) : null) ?? dayStart();
  const dayStr = formatDay(day);
  const todayStr = formatDay(dayStart());

  const section = await prisma.section.findFirst({
    where: { id, tenantId: ctx.tenantId! },
    include: { campus: true, gradeLevel: true },
  });
  if (!section) notFound();

  // Campus scope check
  const allowed = allowedCampusIds(ctx, "attendance.read");
  if (allowed && !allowed.includes(section.campusId)) notFound();

  const [enrollments, codes, session] = await Promise.all([
    prisma.enrollment.findMany({
      where: { sectionId: section.id, status: "ACTIVE" },
      include: { student: { include: { person: true } } },
      orderBy: { rollNumber: "asc" },
    }),
    prisma.attendanceCode.findMany({
      where: { tenantId: ctx.tenantId! },
      orderBy: { code: "asc" },
    }),
    prisma.attendanceSession.findUnique({
      where: {
        sectionId_date_period: {
          sectionId: section.id,
          date: day,
          period: "DAY",
        },
      },
      include: { records: true, amendments: { orderBy: { createdAt: "desc" }, take: 50 } },
    }),
  ]);

  const existingMarks: Record<string, string> = {};
  session?.records.forEach((r) => {
    existingMarks[r.studentId] = r.codeId;
  });

  const canWrite = canForCampus(ctx, "attendance.write", section.campusId);
  const canAmend = canForCampus(ctx, "attendance.amend", section.campusId);
  const status = session?.status ?? "NOT_STARTED";
  const locked = status === "LOCKED";
  const dateOk = checkRegisterDate(day, dayStart(), canAmend).ok;
  const submitted = status === "SUBMITTED" || locked;
  // After submission only amend-rights holders can edit (and must say why).
  const editable = canWrite && dateOk && (!submitted || canAmend);
  const needsReason = submitted && canAmend;

  // Resolve names for the amendment history.
  const amendments = session?.amendments ?? [];
  const nameIds = [...new Set(amendments.map((a) => a.studentId))];
  const actorIds = [...new Set(amendments.map((a) => a.actorUserId))];
  const [studs, actors] = await Promise.all([
    nameIds.length ? prisma.student.findMany({ where: { id: { in: nameIds }, tenantId: ctx.tenantId! }, include: { person: true } }) : [],
    actorIds.length ? prisma.user.findMany({ where: { id: { in: actorIds }, tenantId: ctx.tenantId! }, select: { id: true, email: true } }) : [],
  ]);
  const studName = new Map(studs.map((s) => [s.id, `${s.person.firstName} ${s.person.lastName}`]));
  const actorName = new Map(actors.map((a) => [a.id, a.email]));
  const codeLabel = new Map(codes.map((c) => [c.id, c.code]));

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/portal/attendance"
          className="text-sm text-brand-700 hover:underline"
        >
          ← All registers
        </Link>
      </div>

      <PageHeader
        title={`${section.gradeLevel.name} · ${section.name}`}
        subtitle={`${section.campus.name} · ${day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`}
        action={
          <Badge
            tone={
              locked
                ? "slate"
                : status === "SUBMITTED"
                  ? "green"
                  : status === "DRAFT"
                    ? "amber"
                    : "sky"
            }
          >
            {status === "NOT_STARTED" ? "Not started" : status}
          </Badge>
        }
      />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2 text-sm">
        <label>
          <span className="mb-1 block text-xs font-medium text-[color:var(--color-muted)]">Register date</span>
          <input type="date" name="date" defaultValue={dayStr} max={todayStr} className="rounded-lg border border-[color:var(--color-line)] px-3 py-2" />
        </label>
        <button className="rounded-lg bg-white px-3 py-2 font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50">Open</button>
        {dayStr !== todayStr && (
          <Link href={`/portal/attendance/${section.id}`} className="px-2 py-2 text-brand-700 hover:underline">Today</Link>
        )}
      </form>

      {!dateOk && canWrite && (
        <div className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This date is outside the window you can change. Amend rights are needed for registers older than a week.
        </div>
      )}

      {locked && !canAmend && (
        <div className="mb-4 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">
          This register is locked. You can view it, but amending a locked
          register requires approval rights.
        </div>
      )}

      <RegisterForm
        sectionId={section.id}
        editable={editable}
        codes={codes.map((c) => ({
          id: c.id,
          code: c.code,
          label: c.label,
          category: c.category,
        }))}
        students={enrollments.map((e) => ({
          id: e.student.id,
          roll: e.rollNumber,
          name: `${e.student.person.firstName} ${e.student.person.lastName}`,
          admissionNumber: e.student.admissionNumber,
        }))}
        initialMarks={existingMarks}
        date={dayStr}
        needsReason={needsReason}
        key={dayStr + status}
      />

      {session && status === "SUBMITTED" && canAmend && (
        <div className="mt-4">
          <ActionForm action={lockAttendanceRegister} submit="Lock register" variant="ghost" confirmText="Lock this register? Further changes will need a reason and amend rights.">
            <input type="hidden" name="sessionId" value={session.id} />
          </ActionForm>
        </div>
      )}

      {amendments.length > 0 && (
        <div className="card mt-6">
          <h3 className="mb-3 font-semibold">Amendment history</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[color:var(--color-muted)]">
                <th className="pb-2 pr-4 font-medium">When</th>
                <th className="pb-2 pr-4 font-medium">Student</th>
                <th className="pb-2 pr-4 font-medium">Change</th>
                <th className="pb-2 pr-4 font-medium">By</th>
                <th className="pb-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-line)]">
              {amendments.map((a) => (
                <tr key={a.id}>
                  <td className="py-2 pr-4 whitespace-nowrap">{a.createdAt.toLocaleString()}</td>
                  <td className="py-2 pr-4">{studName.get(a.studentId) ?? "—"}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{a.fromCodeId ? codeLabel.get(a.fromCodeId) ?? "?" : "—"} → {codeLabel.get(a.toCodeId) ?? "?"}</td>
                  <td className="py-2 pr-4">{actorName.get(a.actorUserId) ?? "—"}</td>
                  <td className="py-2">{a.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
