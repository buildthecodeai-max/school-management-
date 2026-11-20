/**
 * Builds the disposable database the end-to-end suite runs against.
 *
 * The seed WIPES every table, so this refuses to touch anything but a database
 * whose name ends in `_e2e`. It never reads DATABASE_URL (which points at the
 * development data): the target is E2E_DATABASE_URL, defaulting to the local
 * Docker Postgres with the database `sms_e2e`.
 */
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://sms:sms_dev_password@localhost:5433/sms_e2e?schema=public";

export function assertDisposable(url: string) {
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!/_e2e$/.test(name)) {
    throw new Error(`Refusing to reset "${name}": the E2E database name must end in _e2e.`);
  }
  return name;
}

export async function resetE2eDatabase(url = E2E_DATABASE_URL) {
  const name = assertDisposable(url);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  admin.search = "";
  const client = new PrismaClient({ datasourceUrl: admin.toString() });
  try {
    await client.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await client.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await client.$disconnect();
  }
  const env = { ...process.env, DATABASE_URL: url };
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env, stdio: "inherit" });
  execFileSync("npx", ["tsx", "prisma/seed.ts"], { env, stdio: "inherit" });
}

if (process.argv[1]?.endsWith("e2e-db.ts")) {
  resetE2eDatabase().then(
    () => console.log("E2E database ready."),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
