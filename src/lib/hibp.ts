import { createHash } from "crypto";

// SEC-003: HaveIBeenPwned k-Anonymity check.
// Sends only the first 5 hex chars of the SHA-1 hash — the plaintext password
// never leaves the server. Returns the breach count (0 = not found or API
// unavailable). Fails open so a transient HIBP outage never blocks login.
export async function pwnedPasswordCount(password: string): Promise<number> {
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      {
        headers: { "Add-Padding": "true" },
        signal: controller.signal,
        cache: "no-store",
      },
    );
    clearTimeout(timer);
    if (!res.ok) return 0;
    const text = await res.text();
    const line = text.split("\n").find((l) => l.startsWith(suffix));
    if (!line) return 0;
    return parseInt(line.split(":")[1] ?? "0", 10) || 0;
  } catch {
    return 0;
  }
}
