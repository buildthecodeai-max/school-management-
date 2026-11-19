import "server-only";
import { prisma } from "./db";
import type { AuthzContext } from "./rbac";

export type FamilyLink = {
  studentId: string;
  relation: "guardian" | "self";
  /** Fee data is shown only to the guardian who pays or is the primary contact; never to the student. */
  canSeeFees: boolean;
};

/** Pure rule: who may see a child's fee data. */
export function feeVisibility(link: { financiallyResponsible: boolean; isPrimaryContact: boolean } | null): boolean {
  return !!link && (link.financiallyResponsible || link.isPrimaryContact);
}

/**
 * The students this signed-in person may view as family: the children they are
 * linked to as a guardian, and themselves if they are a student. Staff access
 * goes through the staff pages and their own permissions, never through here.
 */
export async function familyLinks(ctx: AuthzContext): Promise<FamilyLink[]> {
  const personId = ctx.user.personId;
  if (!personId || !ctx.tenantId) return [];
  const [guardian, self] = await Promise.all([
    prisma.guardian.findFirst({ where: { personId, tenantId: ctx.tenantId }, select: { id: true } }),
    prisma.student.findFirst({ where: { personId, tenantId: ctx.tenantId }, select: { id: true } }),
  ]);
  const links: FamilyLink[] = [];
  if (guardian) {
    const rels = await prisma.guardianRelationship.findMany({ where: { guardianId: guardian.id, tenantId: ctx.tenantId } });
    for (const r of rels) links.push({ studentId: r.studentId, relation: "guardian", canSeeFees: feeVisibility(r) });
  }
  if (self && !links.some((l) => l.studentId === self.id)) links.push({ studentId: self.id, relation: "self", canSeeFees: false });
  return links;
}

export async function familyAccess(ctx: AuthzContext, studentId: string): Promise<FamilyLink | null> {
  return (await familyLinks(ctx)).find((l) => l.studentId === studentId) ?? null;
}
