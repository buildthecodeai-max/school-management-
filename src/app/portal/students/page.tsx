import { ctxTranslator } from "@/lib/i18n";
import Link from "next/link";
import { requirePermission, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { tenantCampusWhere } from "@/lib/scope";
import { ENROLLED_STATUSES } from "@/lib/entitlements";
import { PageHeader, Card, Badge, EmptyState, ButtonLink } from "@/components/ui";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; campus?: string }>;
}) {
  const ctx = await requirePermission("student.read");
  const tr = ctxTranslator(ctx);
  const { q } = await searchParams;

  // Campus-scoped tenant isolation via the shared helper.
  const enrollWhere = tenantCampusWhere(ctx, "student.read");

  const enrollments = await prisma.enrollment.findMany({
    where: {
      ...enrollWhere,
      status: { in: [...ENROLLED_STATUSES] },
      ...(q
        ? {
            student: {
              person: {
                OR: [
                  { firstName: { contains: q, mode: "insensitive" } },
                  { lastName: { contains: q, mode: "insensitive" } },
                ],
              },
            },
          }
        : {}),
    },
    include: {
      student: { include: { person: true } },
      section: true,
      gradeLevel: true,
      campus: true,
    },
    orderBy: [{ gradeLevel: { rank: "asc" } }, { rollNumber: "asc" }],
    take: 200,
  });

  return (
    <div>
      <PageHeader
        title={tr("Students")}
        subtitle={tr(enrollments.length === 1 ? "{n} active enrollment in your scope" : "{n} active enrollments in your scope", { n: enrollments.length })}
        action={
          <div className="flex gap-2">
            {(can(ctx, "student.write") || [...ctx.campusPermissions.values()].some((s) => s.has("student.write") || s.has("*"))) && (
              <ButtonLink href="/portal/students/bulk" variant="ghost">
                {tr("Bulk actions")}
              </ButtonLink>
            )}
            {(can(ctx, "data.import") || [...ctx.campusPermissions.values()].some((s) => s.has("data.import") || s.has("*"))) && (
              <ButtonLink href="/portal/import" variant="ghost">
                {tr("Import students")}
              </ButtonLink>
            )}
          </div>
        }
      />

      <Card className="mb-4">
        <form className="flex gap-2" action="/portal/students">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder={tr("Search by name…")}
            className="w-full max-w-md rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          />
          <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            {tr("Search")}
          </button>
          {q && (
            <Link
              href="/portal/students"
              className="rounded-lg px-3 py-2 text-sm text-[color:var(--color-muted)] hover:underline"
            >
              {tr("Clear")}
            </Link>
          )}
        </form>
      </Card>

      {enrollments.length === 0 ? (
        <EmptyState
          title={tr("No students found")}
          hint={tr("Try a different search, or check your campus scope.")}
        />
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-line)] text-left text-xs uppercase tracking-wide text-[color:var(--color-muted)]">
                  <th className="px-5 py-3 font-medium">{tr("Student")}</th>
                  <th className="px-5 py-3 font-medium">{tr("Admission no.")}</th>
                  <th className="px-5 py-3 font-medium">{tr("Campus")}</th>
                  <th className="px-5 py-3 font-medium">{tr("Grade / Section")}</th>
                  <th className="px-5 py-3 font-medium">{tr("Roll")}</th>
                  <th className="px-5 py-3 font-medium">{tr("Status")}</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((e) => {
                  const p = e.student.person;
                  return (
                    <tr
                      key={e.id}
                      className="border-b border-[color:var(--color-line)] last:border-0 hover:bg-slate-50"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/portal/students/${e.student.id}`}
                          className="flex items-center gap-3 font-medium text-brand-700 hover:underline"
                        >
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                            {p.firstName[0]}
                            {p.lastName[0]}
                          </span>
                          {p.firstName} {p.lastName}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-[color:var(--color-muted)]">
                        {e.student.admissionNumber}
                      </td>
                      <td className="px-5 py-3">{e.campus.name}</td>
                      <td className="px-5 py-3">
                        {e.gradeLevel.name} · {e.section.name}
                      </td>
                      <td className="px-5 py-3">{e.rollNumber ?? "—"}</td>
                      <td className="px-5 py-3">
                        <Badge tone="green">{e.student.status}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
