import "server-only";
import { randomBytes } from "crypto";
import type { AttendanceCategory } from "@prisma/client";
import { prisma } from "./db";
import { hashPassword } from "./auth";
import { ensureStandardRoles } from "./school-roles";
import { DEFAULT_BANDS, parseBands } from "./grade-bands";

export class ProvisionError extends Error {}

export interface ProvisionInput {
  name: string;
  slug: string;
  planId: string;
  campusName?: string;
  adminEmail: string;
  adminName?: string;
}

const INVITE_DAYS = 7;
const TRIAL_DAYS = 14;

// TEN-004: idempotent school provisioning. Re-running with the same slug
// updates the school rather than duplicating it. The first administrator
// becomes the Organization Owner and receives a one-time invite link (a reset
// token) instead of a password anyone has to read out.
export async function provisionSchool(input: ProvisionInput) {
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  const email = input.adminEmail.trim().toLowerCase();
  if (!name) throw new ProvisionError("School name is required.");
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) throw new ProvisionError("The slug must be 2–40 lowercase letters, digits or hyphens.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ProvisionError("Enter a valid admin email.");

  const plan = await prisma.plan.findFirst({ where: { id: input.planId, isActive: true } });
  if (!plan) throw new ProvisionError("Choose an active plan.");

  const [existingTenant, existingUser] = await Promise.all([
    prisma.tenant.findUnique({ where: { slug } }),
    prisma.user.findUnique({ where: { email } }),
  ]);
  if (existingUser && existingUser.tenantId !== (existingTenant?.id ?? "__none__"))
    throw new ProvisionError("That email already belongs to an account in another school or on the platform.");

  const passwordHash = existingUser ? null : await hashPassword(randomBytes(24).toString("hex"));
  const inviteToken = randomBytes(32).toString("hex");

  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.upsert({ where: { slug }, update: { name }, create: { name, slug, status: "ACTIVE" } });

    // An explicit campus name finds or creates that campus; otherwise reuse the
    // school's first campus (so renaming the school never spawns a second one).
    const explicit = input.campusName?.trim();
    const campus =
      (await tx.campus.findFirst({ where: explicit ? { tenantId: tenant.id, name: explicit } : { tenantId: tenant.id }, orderBy: { createdAt: "asc" } })) ??
      (await tx.campus.create({
        data: {
          tenantId: tenant.id,
          name: explicit || `${name} Main`,
          code: `${slug.toUpperCase().replace(/-/g, "").slice(0, 6)}-${(await tx.campus.count({ where: { tenantId: tenant.id } })) + 1}`,
          status: "ACTIVE",
        },
      }));

    const roles = await ensureStandardRoles(tx, tenant.id);

    const admin =
      existingUser ??
      (await tx.user.create({
        data: { tenantId: tenant.id, email, displayName: input.adminName?.trim() || email, passwordHash: passwordHash!, status: "ACTIVE" },
      }));
    const ownerRole = roles.get("Organization Owner")!;
    if (!(await tx.roleAssignment.findFirst({ where: { userId: admin.id, roleId: ownerRole.id, scopeType: "ORG" } })))
      await tx.roleAssignment.create({ data: { userId: admin.id, roleId: ownerRole.id, scopeType: "ORG" } });
    await tx.user.update({
      where: { id: admin.id },
      data: { passwordResetToken: inviteToken, passwordResetTokenExpiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) },
    });

    if (!(await tx.subscription.findUnique({ where: { tenantId: tenant.id } })))
      await tx.subscription.create({
        data: { tenantId: tenant.id, planId: plan.id, status: "TRIAL", trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000) },
      });

    // Sensible starting configuration; every item can be edited under Academics → Configure.
    if ((await tx.attendanceCode.count({ where: { tenantId: tenant.id } })) === 0)
      await tx.attendanceCode.createMany({
        data: (
          [
            { code: "P", label: "Present", category: "PRESENT", countsAsPresent: true, notifyGuardian: false },
            { code: "A", label: "Absent", category: "ABSENT", countsAsPresent: false, notifyGuardian: true },
            { code: "L", label: "Late", category: "LATE", countsAsPresent: true, notifyGuardian: true },
            { code: "E", label: "Excused", category: "EXCUSED", countsAsPresent: true, notifyGuardian: false },
          ] as { code: string; label: string; category: AttendanceCategory; countsAsPresent: boolean; notifyGuardian: boolean }[]
        ).map((c) => ({ tenantId: tenant.id, ...c })),
      });
    if ((await tx.gradeScale.count({ where: { tenantId: tenant.id } })) === 0) {
      const bands = parseBands(DEFAULT_BANDS).bands!;
      await tx.gradeScale.create({ data: { tenantId: tenant.id, name: "Standard A–F", bands: { create: bands.map((b) => ({ tenantId: tenant.id, ...b })) } } });
    }
    await tx.leaveType.createMany({
      data: [
        { tenantId: tenant.id, name: "Annual leave", daysPerYear: 21, isPaid: true, appliesTo: "STAFF" },
        { tenantId: tenant.id, name: "Sick leave", daysPerYear: 10, isPaid: true, appliesTo: "STAFF" },
      ],
      skipDuplicates: true,
    });

    return { tenantId: tenant.id, campusId: campus.id, adminUserId: admin.id, adminEmail: email, inviteToken, created: !existingTenant };
  });
}
