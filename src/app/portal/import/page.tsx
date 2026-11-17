import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { StudentImporter } from "./StudentImporter";

type Tab = "students" | "marks";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requirePermission("data.import");
  const params = await searchParams;
  const tab: Tab = params.tab === "marks" ? "marks" : "students";

  const tabCls = (k: Tab) =>
    k === tab
      ? "border-b-2 border-brand-700 pb-2 text-sm font-semibold text-brand-700"
      : "pb-2 text-sm text-[color:var(--color-muted)] hover:text-[color:var(--color-text)]";

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4">
        <Link href="/portal/setup" className="text-sm text-brand-700 hover:underline">
          ← Setup
        </Link>
      </div>
      <PageHeader
        title="Import centre"
        subtitle="Bulk import students, marks and more. Invalid rows are never committed; valid rows upsert together."
      />

      <div className="mb-6 flex gap-6 border-b border-[color:var(--color-line)]">
        <Link href="?tab=students" className={tabCls("students")}>Students</Link>
        <Link href="?tab=marks" className={tabCls("marks")}>Marks</Link>
      </div>

      {tab === "students" && <StudentImporter />}

      {tab === "marks" && (
        <Card>
          <p className="mb-3 text-sm text-[color:var(--color-muted)]">
            Import marks into an assessment plan from a CSV file. Select the plan on the marks import page.
          </p>
          <Link
            href="/portal/import/marks"
            className="inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Open mark import →
          </Link>
        </Card>
      )}
    </div>
  );
}
