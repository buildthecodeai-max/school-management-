// Pure assessment calculation. Kept free of I/O so results are reproducible
// from marks + the plan configuration alone (§14.1).

import type { MarkStatus } from "@prisma/client";

export interface Band {
  grade: string;
  minPercent: number;
  gradePoint: number;
  isPass: boolean;
}
export interface Component {
  id: string;
  weight: number;
  maxMarks: number;
}
export interface Mark {
  componentId: string;
  marks: number | null;
  status: MarkStatus;
}

// Weighted percentage for one subject. ABSENT counts as 0; EXEMPT drops the
// component's weight from the denominator.
export function subjectPercent(components: Component[], marks: Mark[]): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const c of components) {
    const m = marks.find((x) => x.componentId === c.id);
    if (m?.status === "EXEMPT") continue;
    const raw = m?.status === "ABSENT" ? 0 : (m?.marks ?? 0);
    const pct = c.maxMarks > 0 ? raw / c.maxMarks : 0;
    weighted += pct * c.weight;
    totalWeight += c.weight;
  }
  return totalWeight > 0 ? (weighted / totalWeight) * 100 : 0;
}

export function gradeForPercent(bands: Band[], percent: number): Band | null {
  const sorted = [...bands].sort((a, b) => b.minPercent - a.minPercent);
  return sorted.find((b) => percent >= b.minPercent) ?? null;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface SubjectLine {
  subjectId: string;
  subjectName: string;
  percent: number;
  grade: string;
}
export interface ComputedResult {
  studentId: string;
  lines: SubjectLine[];
  overallPercent: number;
  overallGrade: string;
  passed: boolean;
}

// Compute a full result set for a section, then assign ranks by overall %.
export function computeResults(input: {
  bands: Band[];
  components: Component[];
  subjects: { id: string; name: string }[];
  students: string[];
  // marks keyed by `${studentId}:${subjectId}` → Mark[]
  marksBy: Map<string, Mark[]>;
}): (ComputedResult & { rank: number })[] {
  const results: ComputedResult[] = input.students.map((studentId) => {
    const lines: SubjectLine[] = input.subjects.map((s) => {
      const marks = input.marksBy.get(`${studentId}:${s.id}`) ?? [];
      const pct = round1(subjectPercent(input.components, marks));
      const band = gradeForPercent(input.bands, pct);
      return { subjectId: s.id, subjectName: s.name, percent: pct, grade: band?.grade ?? "—" };
    });
    const overallPercent =
      lines.length > 0
        ? round1(lines.reduce((s, l) => s + l.percent, 0) / lines.length)
        : 0;
    const band = gradeForPercent(input.bands, overallPercent);
    return {
      studentId,
      lines,
      overallPercent,
      overallGrade: band?.grade ?? "—",
      passed: band?.isPass ?? false,
    };
  });

  // Standard competition ranking: equal percentages share a rank and the next
  // rank skips (1, 2, 2, 4).
  const ranked = [...results].sort((a, b) => b.overallPercent - a.overallPercent);
  const rankOf = new Map<string, number>();
  ranked.forEach((r, i) => {
    const prev = ranked[i - 1];
    rankOf.set(r.studentId, prev && prev.overallPercent === r.overallPercent ? rankOf.get(prev.studentId)! : i + 1);
  });
  return results.map((r) => ({ ...r, rank: rankOf.get(r.studentId)! }));
}

export type PlanStatus = "OPEN" | "SUBMITTED" | "APPROVED" | "PUBLISHED";

// Allowed manual transitions. PUBLISHED is only ever reached by publishing
// (which computes and freezes a result version), never by setting a status.
export const PLAN_TRANSITIONS: Record<PlanStatus, PlanStatus[]> = {
  OPEN: ["SUBMITTED"],
  SUBMITTED: ["APPROVED", "OPEN"],
  APPROVED: ["OPEN"],
  PUBLISHED: ["OPEN"],
};
export function canTransition(from: PlanStatus, to: string): to is PlanStatus {
  return (PLAN_TRANSITIONS[from] as string[]).includes(to);
}
