// Shared helpers for the restricted health and safeguarding modules.
import "server-only";
import { prisma } from "./db";

/** The campus a student is currently enrolled at (latest active enrollment), or null. */
export async function currentCampusOf(tenantId: string, studentId: string): Promise<string | null> {
  const e = await prisma.enrollment.findFirst({
    where: { tenantId, studentId, status: "ACTIVE" },
    orderBy: { startDate: "desc" },
    select: { campusId: true },
  });
  return e?.campusId ?? null;
}

export function clean(v: FormDataEntryValue | null, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}
