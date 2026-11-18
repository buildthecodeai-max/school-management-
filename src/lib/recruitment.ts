import type { ApplicantStage } from "@prisma/client";

export const ACTIVE_STAGES: ApplicantStage[] = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER"];
export const CLOSED_STAGES: ApplicantStage[] = ["HIRED", "REJECTED", "WITHDRAWN"];

const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

// Returns a user-facing error if the move is not allowed, otherwise null.
// Active stages can be moved between freely (corrections happen); HIRED is
// reachable only through the hire action; closed stages are final.
export function stageMoveError(from: ApplicantStage, to: ApplicantStage): string | null {
  if (CLOSED_STAGES.includes(from)) return `This applicant is already ${label(from)}.`;
  if (from === to) return `The applicant is already at the ${label(to)} stage.`;
  if (to === "HIRED") return "Use the Hire action to hire an applicant.";
  return null;
}

export function stageLabel(s: string): string {
  return label(s);
}
