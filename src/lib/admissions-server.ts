import "server-only";
import { prisma } from "./db";

export interface DuplicateMatch {
  personId: string;
  name: string;
  reasons: string[];
  kind: "student" | "applicant" | "person";
  admissionNumber?: string;
}

// Configurable-ish duplicate detection (ADM-003). Scoped to the tenant so no
// other tenant's people are ever revealed. Matches on exact email/phone or a
// name + date-of-birth combination.
export async function findDuplicates(
  tenantId: string,
  input: {
    firstName: string;
    lastName: string;
    dateOfBirth?: Date | null;
    email?: string | null;
    phone?: string | null;
  },
  excludePersonId?: string,
): Promise<DuplicateMatch[]> {
  const or: object[] = [];
  if (input.email) or.push({ email: { equals: input.email, mode: "insensitive" } });
  if (input.phone) or.push({ phone: input.phone });
  // name match (both parts, case-insensitive)
  or.push({
    AND: [
      { firstName: { equals: input.firstName, mode: "insensitive" } },
      { lastName: { equals: input.lastName, mode: "insensitive" } },
    ],
  });

  const people = await prisma.person.findMany({
    where: {
      tenantId,
      deletedAt: null,
      ...(excludePersonId ? { id: { not: excludePersonId } } : {}),
      OR: or,
    },
    include: { student: true, guardian: true },
    take: 10,
  });

  return people.map((p) => {
    const reasons: string[] = [];
    if (input.email && p.email?.toLowerCase() === input.email.toLowerCase())
      reasons.push("same email");
    if (input.phone && p.phone === input.phone) reasons.push("same phone");
    if (
      p.firstName.toLowerCase() === input.firstName.toLowerCase() &&
      p.lastName.toLowerCase() === input.lastName.toLowerCase()
    ) {
      reasons.push("same name");
      if (
        input.dateOfBirth &&
        p.dateOfBirth &&
        p.dateOfBirth.toISOString().slice(0, 10) ===
          input.dateOfBirth.toISOString().slice(0, 10)
      ) {
        reasons.push("same date of birth");
      }
    }
    return {
      personId: p.id,
      name: `${p.firstName} ${p.lastName}`,
      reasons,
      kind: p.student ? "student" : p.guardian ? "person" : "applicant",
      admissionNumber: p.student?.admissionNumber,
    } as DuplicateMatch;
  });
}

// Generate the next admission number for a tenant, e.g. GA-0042.
export async function nextAdmissionNumber(
  tenantId: string,
  prefix = "GA",
): Promise<string> {
  const count = await prisma.student.count({ where: { tenantId } });
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}
