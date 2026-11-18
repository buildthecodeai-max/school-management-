import { assertPermission, requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { ProvisionForm } from "./ProvisionForm";

export const metadata = { title: "Add a school" };

export default async function NewTenantPage() {
  const ctx = await requireUser();
  assertPermission(ctx, "platform.tenant.provision");
  const plans = await prisma.plan.findMany({ where: { isActive: true }, orderBy: { priceMonthly: "asc" }, select: { id: true, name: true, maxStudents: true, maxCampuses: true } });

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6">
        <a href="/portal/platform" className="text-sm text-brand-700 hover:underline">← Platform</a>
      </div>
      <h1 className="mb-2 text-2xl font-semibold">Add a school</h1>
      <p className="mb-6 text-sm text-[color:var(--color-muted)]">
        Creates the school with its first campus, the standard roles, a trial subscription, starting attendance codes, a grade scale and
        leave types, and an organization-owner account for the administrator, who receives a one-time link to choose a password.
        Submitting an existing slug safely updates that school instead of creating a duplicate.
      </p>
      <ProvisionForm plans={plans} />
    </div>
  );
}
