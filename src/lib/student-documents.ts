export const DOCUMENT_TYPES = ["BIRTH_CERTIFICATE", "PASSPORT", "NATIONAL_ID", "VISA", "VACCINATION_RECORD", "PREVIOUS_SCHOOL_REPORT", "TRANSFER_CERTIFICATE", "MEDICAL_REPORT", "OTHER"] as const;

export const documentLabel = (t: string) => t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, " ");

export type ExpiryState = "none" | "expired" | "soon" | "ok";

// "soon" = expires within `withinDays` (default 30).
export function expiryState(expiresAt: Date | null, now = new Date(), withinDays = 30): ExpiryState {
  if (!expiresAt) return "none";
  if (expiresAt < now) return "expired";
  return expiresAt.getTime() - now.getTime() <= withinDays * 86_400_000 ? "soon" : "ok";
}
