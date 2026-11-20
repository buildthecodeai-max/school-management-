import { PrismaClient } from "@prisma/client";
import { assertDisposable, E2E_DATABASE_URL } from "../../scripts/e2e-db";

// Direct read access to the disposable database, for asserting that UI actions persisted.
assertDisposable(E2E_DATABASE_URL);
export const db = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });
