import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { StudentImporter } from "./StudentImporter";

export default async function ImportPage() {
  await requirePermission("data.import");
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4">
        <Link href="/portal/setup" className="text-sm text-brand-700 hover:underline">
          ← Setup
        </Link>
      </div>
      <PageHeader
        title="Bulk import · Students"
        subtitle="Map columns, validate, preview row-level errors, then commit. Invalid rows are never imported; valid rows commit together."
      />
      <StudentImporter />
    </div>
  );
}
