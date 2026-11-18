import "server-only";
import { prisma } from "./db";

export const DEFAULT_COMPETENCIES = [
  { code: "COLLAB", name: "Collaboration", description: "Works effectively with others" },
  { code: "COMM", name: "Communication", description: "Expresses ideas clearly" },
  { code: "CRIT", name: "Critical Thinking", description: "Analyses and evaluates information" },
  { code: "SELF", name: "Self-Management", description: "Organises time and completes tasks" },
  { code: "RESIL", name: "Resilience", description: "Persists through challenges" },
];

/** Adds the standard set if the school has no competencies. Returns how many were added. */
export async function ensureDefaultCompetencies(tenantId: string, db: Pick<typeof prisma, "competency"> = prisma): Promise<number> {
  if ((await db.competency.count({ where: { tenantId } })) > 0) return 0;
  const r = await db.competency.createMany({ data: DEFAULT_COMPETENCIES.map((c) => ({ tenantId, ...c })), skipDuplicates: true });
  return r.count;
}
