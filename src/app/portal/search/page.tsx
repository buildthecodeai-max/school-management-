import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { globalSearch } from "./actions";

export const metadata = { title: "Search" };

const TYPE_META = {
  student: { label: "Student", tone: "sky" as const },
  staff: { label: "Staff", tone: "amber" as const },
  application: { label: "Applicant", tone: "green" as const },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await requireUser();
  if (!ctx.tenantId) redirect("/portal/platform");

  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const results = query.length >= 2 ? await globalSearch(query) : [];

  return (
    <div>
      <PageHeader
        title="Search"
        subtitle="Students, staff and applicants within your campus scope."
      />

      <Card className="mb-4">
        <form className="flex gap-2" action="/portal/search">
          <input
            name="q"
            defaultValue={query}
            autoFocus
            placeholder="Name or admission number…"
            className="w-full max-w-md rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          />
          <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Search
          </button>
        </form>
      </Card>

      {query.length === 0 ? (
        <EmptyState
          title="Search across your school"
          hint="Type at least two characters. Results are limited to the campuses you have access to."
        />
      ) : query.length < 2 ? (
        <EmptyState title="Keep typing" hint="Enter at least two characters." />
      ) : results.length === 0 ? (
        <EmptyState
          title={`Nothing found for “${query}”`}
          hint="Try a different spelling, or check that the record is on a campus you can access."
        />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-[color:var(--color-line)]">
            {results.map((r) => {
              const meta = TYPE_META[r.type];
              return (
                <li key={`${r.type}-${r.id}`}>
                  <Link
                    href={r.href}
                    className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-brand-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-brand-700">{r.label}</p>
                      {r.sublabel && (
                        <p className="truncate text-sm text-[color:var(--color-muted)]">
                          {r.sublabel}
                        </p>
                      )}
                    </div>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
