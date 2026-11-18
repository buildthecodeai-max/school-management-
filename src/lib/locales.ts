export const SUPPORTED_LOCALES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "pt", label: "Português" },
  { code: "ar", label: "العربية" },
  { code: "sw", label: "Kiswahili" },
  { code: "hi", label: "हिन्दी" },
] as const;

export function isSupportedLocale(code: string): boolean {
  return SUPPORTED_LOCALES.some((l) => l.code === code);
}

// Picks the template whose locale appears earliest in `preferred`
// (recipient → organization → "en"); falls back to any available one.
export function pickByLocale<T extends { locale: string }>(
  candidates: T[],
  preferred: (string | null | undefined)[],
): T | undefined {
  for (const loc of preferred) {
    if (!loc) continue;
    const hit = candidates.find((c) => c.locale === loc);
    if (hit) return hit;
  }
  return candidates[0];
}
