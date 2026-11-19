// Static regression guards over the source tree. They exist because these
// mistakes compile fine, pass in dev, and only fail at `next build` or in front
// of a user: a "use server" file exporting a non-function, a link to a page that
// does not exist, and a server action nothing ever calls.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";

const SRC = join(__dirname, "..", "..", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const files = walk(SRC);
const read = (f: string) => readFileSync(f, "utf8");
const rel = (f: string) => relative(SRC, f).split(sep).join("/");
const serverFiles = files.filter((f) => /^\s*(\/\/.*\n|\/\*[\s\S]*?\*\/\s*)*["']use server["']/.test(read(f)));

describe("\"use server\" files", () => {
  it("export only async functions (and types)", () => {
    const bad: string[] = [];
    for (const f of serverFiles) {
      for (const [i, line] of read(f).split("\n").entries()) {
        if (!/^export\s/.test(line)) continue;
        if (/^export\s+(async\s+function|type\s|interface\s|\{\s*type\s)/.test(line)) continue;
        if (/^export\s+type\b/.test(line) || /^export\s+\{\s*\}/.test(line)) continue;
        bad.push(`${rel(f)}:${i + 1}  ${line.trim()}`);
      }
    }
    expect(bad, `Only async functions may be exported from a "use server" file:\n${bad.join("\n")}`).toEqual([]);
  });
});

describe("server actions and tenant ids", () => {
  it("no exported action takes a tenantId argument (a caller could name another school)", () => {
    const bad: string[] = [];
    for (const f of serverFiles) {
      for (const m of read(f).matchAll(/^export\s+async\s+function\s+(\w+)\s*\(([^)]*)\)/gm)) {
        if (/\btenantId\b/.test(m[2])) bad.push(`${rel(f)}: ${m[1]}(${m[2].trim()})`);
      }
    }
    expect(bad, `Server actions must derive the school from the signed-in user, never from an argument:\n${bad.join("\n")}`).toEqual([]);
  });
});

// ---- links ---------------------------------------------------------------

function routePatterns(): string[][] {
  const out: string[][] = [];
  for (const f of files) {
    if (!/\/(page\.tsx|route\.ts)$/.test(f)) continue;
    const segs = rel(f).replace(/\/(page\.tsx|route\.ts)$/, "").split("/").filter((s) => s && !/^\(.*\)$/.test(s));
    out.push(segs);
  }
  return out;
}

describe("internal links", () => {
  it("every hard-coded /portal link points at a real page or route", () => {
    const patterns = routePatterns().filter((p) => p[0] === "app" || p[0] === "pages").map((p) => p.slice(1));
    const dead: string[] = [];
    const linkRe = /(?:href|redirect\(|push\(|router\.replace\()\s*=?\s*(?:\{?\s*`|["'])(\/portal[^"'`?#]*)/g;
    for (const f of files) {
      if (rel(f).startsWith("app/api/")) continue;
      const text = read(f);
      for (const m of text.matchAll(linkRe)) {
        const raw = m[1];
        const segs = raw.split("/").filter(Boolean).map((s) => (s.includes("${") ? "*" : s));
        // a trailing partial template like /portal/exams/${id}/ stays a wildcard segment
        const ok = patterns.some((p) => p.length === segs.length && p.every((ps, i) => segs[i] === "*" || /^\[.+\]$/.test(ps) ? true : ps === segs[i]));
        if (!ok) dead.push(`${rel(f)}  →  ${raw}`);
      }
    }
    expect([...new Set(dead)], `Links to pages that do not exist:\n${dead.join("\n")}`).toEqual([]);
  });
});

// ---- server actions with no caller ------------------------------------------

// Actions that are invoked from outside the UI (cron, webhooks) or are shared helpers.
const NO_UI_CALLER_OK = new Set<string>([]);

describe("server actions", () => {
  it("every exported action is called from somewhere else in the app", () => {
    const orphans: string[] = [];
    for (const f of serverFiles) {
      const names = [...read(f).matchAll(/^export\s+async\s+function\s+(\w+)/gm)].map((m) => m[1]);
      for (const name of names) {
        if (NO_UI_CALLER_OK.has(name)) continue;
        const re = new RegExp(`\\b${name}\\b`);
        const used = files.some((o) => o !== f && re.test(read(o)));
        // used within its own file by another function also counts as a helper, but a UI action must be referenced elsewhere
        if (!used) orphans.push(`${rel(f)}: ${name}`);
      }
    }
    expect(orphans, `Server actions that nothing calls (dead code, or a screen is missing):\n${orphans.join("\n")}`).toEqual([]);
  });
});
