import { resetE2eDatabase } from "../../scripts/e2e-db";

// Rebuild the disposable database before every run so specs start from the seed.
export default async function globalSetup() {
  await resetE2eDatabase();
}
