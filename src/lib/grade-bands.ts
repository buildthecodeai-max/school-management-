export interface BandInput {
  grade: string;
  minPercent: number;
  gradePoint: number;
  isPass: boolean;
}

// One band per line: "A, 90, 4.0, pass" (grade, minimum %, grade points, pass|fail).
export function parseBands(text: string): { bands?: BandInput[]; error?: string } {
  const bands: BandInput[] = [];
  for (const raw of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const [grade, min, points, result] = raw.split(",").map((x) => x.trim());
    const minPercent = Number(min);
    const gradePoint = Number(points || 0);
    if (!grade || min === "" || !Number.isFinite(minPercent) || minPercent < 0 || minPercent > 100 || !Number.isFinite(gradePoint))
      return { error: `Line "${raw}": use grade, minimum percent (0-100), grade points, pass or fail.` };
    bands.push({ grade, minPercent, gradePoint, isPass: (result ?? "pass").toLowerCase() !== "fail" });
  }
  if (bands.length < 2) return { error: "Enter at least two bands." };
  if (new Set(bands.map((b) => b.grade.toLowerCase())).size !== bands.length) return { error: "Each grade may appear only once." };
  if (new Set(bands.map((b) => b.minPercent)).size !== bands.length) return { error: "Two bands cannot start at the same percentage." };
  if (!bands.some((b) => b.minPercent === 0)) return { error: "One band must start at 0% so every score has a grade." };
  return { bands };
}

export const DEFAULT_BANDS = `A, 80, 4.0, pass
B, 70, 3.0, pass
C, 60, 2.0, pass
D, 50, 1.0, pass
F, 0, 0, fail`;
