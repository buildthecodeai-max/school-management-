import { describe, it, expect } from "vitest";
import { DICTS, resolveUiLocale, textDirection, translator } from "@/lib/i18n";
import { SUPPORTED_LOCALES, isSupportedLocale, pickByLocale } from "@/lib/locales";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("ui translator", () => {
  it("translates known strings and falls back to English for unknown ones or locales", () => {
    expect(translator("es")("Dashboard")).toBe("Panel");
    expect(translator("es")("A string nobody translated")).toBe("A string nobody translated");
    expect(translator("sw")("Students")).toBe("Wanafunzi");
    expect(translator("en")("Dashboard")).toBe("Dashboard");
    expect(translator("xx")("Dashboard")).toBe("Dashboard");
  });

  it("substitutes placeholders, in translated and untranslated strings", () => {
    expect(translator("fr")("{n} days", { n: 30 })).toBe("30 jours");
    expect(translator("en")("{n} days", { n: 30 })).toBe("{n} days".replace("{n}", "30"));
    expect(translator("es")("Welcome, {name}", { name: "Ana" })).toBe("Bienvenido/a, Ana");
    expect(translator("es")("{n} days", {})).toBe("{n} días");
  });

  it("resolves locale: user, then organization, then English; ignores unsupported codes", () => {
    expect(resolveUiLocale("fr", "es")).toBe("fr");
    expect(resolveUiLocale(null, "es")).toBe("es");
    expect(resolveUiLocale("klingon", "pt")).toBe("pt");
    expect(resolveUiLocale(null, undefined)).toBe("en");
  });

  it("is right-to-left only for Arabic", () => {
    expect(textDirection("ar")).toBe("rtl");
    for (const l of SUPPORTED_LOCALES.filter((l) => l.code !== "ar")) expect(textDirection(l.code)).toBe("ltr");
  });

  it("only has dictionaries for supported locales", () => {
    for (const code of Object.keys(DICTS)) expect(isSupportedLocale(code)).toBe(true);
  });

  it("keeps every translation's {placeholders} identical to its English key, and non-empty", () => {
    for (const [code, dict] of Object.entries(DICTS))
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), `${code}: "${key}" is empty`).not.toBe("");
        expect(placeholders(value), `${code}: "${key}"`).toEqual(placeholders(key));
      }
  });
});

describe("template locale choice", () => {
  const t = [{ locale: "en", n: 1 }, { locale: "es", n: 2 }, { locale: "fr", n: 3 }];

  it("prefers the first preferred locale that has a template", () => {
    expect(pickByLocale(t, ["es", "en"])?.n).toBe(2);
    expect(pickByLocale(t, [null, "fr", "en"])?.n).toBe(3);
  });

  it("skips missing translations, then falls back to any template", () => {
    expect(pickByLocale(t, ["pt", "en"])?.n).toBe(1);
    expect(pickByLocale(t, ["pt", "ar"])?.n).toBe(1);
    expect(pickByLocale([], ["en"])).toBeUndefined();
  });
});
