import { requireUser, assertPermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";

export const metadata = { title: "Add a school" };

// TEN-004: Idempotent tenant provisioning wizard.
// Creating the same slug twice is safe — it finds and updates the existing tenant.
async function provisionTenant(fd: FormData) {
  "use server";
  const ctx = await requireUser();
  assertPermission(ctx, "platform.tenant.provision");

  const name = String(fd.get("name") ?? "").trim();
  const slug = String(fd.get("slug") ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const plan = String(fd.get("plan") ?? "STARTER");
  const campusName = String(fd.get("campusName") ?? "").trim() || `${name} Main`;
  const adminEmail = String(fd.get("adminEmail") ?? "").trim();
  const adminName = String(fd.get("adminName") ?? "").trim();

  if (!name || !slug || !adminEmail) {
    throw new Error("Name, slug, and admin email are required.");
  }

  // Idempotent: upsert the tenant by slug (unique).
  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: { name },
    create: {
      name,
      slug,
      status: "ACTIVE",
    },
  });

  // Upsert the main campus (match by name within tenant).
  const existingCampus = await prisma.campus.findFirst({
    where: { tenantId: tenant.id, name: campusName },
  });
  const campus = existingCampus ?? await prisma.campus.create({
    data: {
      tenantId: tenant.id,
      name: campusName,
      code: `${slug.toUpperCase().slice(0, 6)}-MAIN`,
      status: "ACTIVE",
    },
  });

  // Idempotent admin user: upsert by email.
  const { hashPassword } = await import("@/lib/auth");
  const tempPassword = `Welcome-${Math.random().toString(36).slice(2, 10)}`;
  const passwordHash = await hashPassword(tempPassword);

  const existingUser = await prisma.user.findUnique({ where: { email: adminEmail } });
  const adminUser = existingUser ?? await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: adminEmail,
      displayName: adminName || adminEmail,
      passwordHash,
      status: "ACTIVE",
    },
  });

  // Ensure admin has an org-level campus admin role on this campus.
  const adminRole = await prisma.role.findFirst({
    where: { tenantId: tenant.id, name: "Campus Admin" },
  });
  if (adminRole) {
    await prisma.roleAssignment.upsert({
      where: {
        userId_roleId_scopeType_campusId: {
          userId: adminUser.id,
          roleId: adminRole.id,
          scopeType: "CAMPUS",
          campusId: campus.id,
        },
      },
      update: {},
      create: {
        userId: adminUser.id,
        roleId: adminRole.id,
        scopeType: "CAMPUS",
        campusId: campus.id,
      },
    });
  }

  await audit({
    tenantId: null,
    actorUserId: ctx.user.id,
    action: "platform.tenant.provisioned",
    targetType: "Tenant",
    targetId: tenant.id,
    scopeType: "PLATFORM",
    metadata: { slug, plan, campusId: campus.id, adminEmail, idempotent: !!existingCampus },
  });

  redirect(`/portal/platform/tenants/${tenant.id}`);
}

export default async function NewTenantPage() {
  const ctx = await requireUser();
  assertPermission(ctx, "platform.tenant.provision");

  const inputCls =
    "w-full rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200";

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6">
        <a href="/portal/platform" className="text-sm text-brand-700 hover:underline">← Platform</a>
      </div>
      <h1 className="mb-2 text-2xl font-semibold">Add a school</h1>
      <p className="mb-6 text-sm text-[color:var(--color-muted)]">
        This creates the school, its first campus, and an administrator account in one step. Submitting with an existing slug safely updates that school instead of creating a duplicate.
      </p>

      <form action={provisionTenant} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">School name</label>
            <input name="name" required placeholder="Greenwood Academy" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Slug (unique URL key)</label>
            <input name="slug" required placeholder="greenwood" pattern="[a-z0-9-]+" className={inputCls} />
            <p className="mt-1 text-xs text-[color:var(--color-muted)]">Lowercase letters, digits, hyphens only.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Plan</label>
            <select name="plan" className={inputCls}>
              <option value="STARTER">Starter</option>
              <option value="PROFESSIONAL">Professional</option>
              <option value="ENTERPRISE">Enterprise</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Main campus name</label>
            <input name="campusName" placeholder="Main Campus (default)" className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Admin email</label>
            <input name="adminEmail" type="email" required placeholder="admin@school.edu" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Admin display name</label>
            <input name="adminName" placeholder="School Admin" className={inputCls} />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Create school
          </button>
          <a
            href="/portal/platform"
            className="rounded-lg px-5 py-2.5 text-sm font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
