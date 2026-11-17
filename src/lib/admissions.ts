import type { ApplicationStage } from "@prisma/client";

// Ordered pipeline (the stages an application walks through).
export const PIPELINE_STAGES: ApplicationStage[] = [
  "INQUIRY",
  "APPLICATION",
  "REVIEW",
  "ASSESSMENT",
  "INTERVIEW",
  "DECISION",
  "OFFER",
  "ACCEPTED",
  "ENROLLED",
];

// Terminal / side states, reachable from most pipeline stages.
export const SIDE_STAGES: ApplicationStage[] = [
  "WAITLISTED",
  "REJECTED",
  "WITHDRAWN",
];

type Tone = "brand" | "green" | "amber" | "red" | "slate" | "sky";

export const STAGE_META: Record<
  ApplicationStage,
  { label: string; tone: Tone; short: string }
> = {
  INQUIRY: { label: "Inquiry", tone: "slate", short: "Inq" },
  APPLICATION: { label: "Application", tone: "sky", short: "App" },
  REVIEW: { label: "Review", tone: "sky", short: "Rev" },
  ASSESSMENT: { label: "Assessment", tone: "brand", short: "Asmt" },
  INTERVIEW: { label: "Interview", tone: "brand", short: "Intv" },
  DECISION: { label: "Decision", tone: "amber", short: "Dec" },
  OFFER: { label: "Offer", tone: "amber", short: "Offer" },
  ACCEPTED: { label: "Accepted", tone: "green", short: "Acc" },
  ENROLLED: { label: "Enrolled", tone: "green", short: "Enr" },
  REJECTED: { label: "Rejected", tone: "red", short: "Rej" },
  WAITLISTED: { label: "Waitlisted", tone: "slate", short: "Wait" },
  WITHDRAWN: { label: "Withdrawn", tone: "slate", short: "Wdn" },
};

// The next pipeline stage after the given one, or null at the end/side states.
export function nextStage(stage: ApplicationStage): ApplicationStage | null {
  const i = PIPELINE_STAGES.indexOf(stage);
  if (i === -1 || i >= PIPELINE_STAGES.length - 1) return null;
  return PIPELINE_STAGES[i + 1];
}

export function isPipeline(stage: ApplicationStage): boolean {
  return PIPELINE_STAGES.includes(stage);
}

export function isActive(stage: ApplicationStage): boolean {
  return stage !== "ENROLLED" && !SIDE_STAGES.includes(stage);
}

// Human age of an application in whole days.
export function ageInDays(from: Date): number {
  return Math.floor((Date.now() - from.getTime()) / (1000 * 60 * 60 * 24));
}
