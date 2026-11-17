import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { allowedCampusIds } from "@/lib/scope";
import { PageHeader } from "@/components/ui";
import { NewApplicationForm } from "./NewApplicationForm";

export default async function NewApplicationPage() {
  const ctx = await requirePermission("admissions.write");
  const campusIds = allowedCampusIds(ctx, "admissions.write");

  const campuses = await prisma.campus.findMany({
    where: {
      tenantId: ctx.tenantId!,
      status: "ACTIVE",
      ...(campusIds ? { id: { in: campusIds } } : {}),
    },
    include: { gradeLevels: { orderBy: { rank: "asc" } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <Link href="/portal/admissions" className="text-sm text-brand-700 hover:underline">
          ← Pipeline
        </Link>
      </div>
      <PageHeader
        title="New application"
        subtitle="Capture an inquiry or application. Duplicate checks run automatically."
      />
      <NewApplicationForm
        campuses={campuses.map((c) => ({
          id: c.id,
          name: c.name,
          grades: c.gradeLevels.map((g) => ({ id: g.id, name: g.name })),
        }))}
      />
    </div>
  );
}
