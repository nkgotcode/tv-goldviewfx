import { loadLocalEnv, runE2ESetup } from "./e2e_setup";

export default async function globalSetup() {
  loadLocalEnv();
  if (!process.env.E2E_RUN) {
    return;
  }
  if (process.env.E2E_SETUP_DONE === "1") {
    if (!process.env.CONVEX_URL) {
      throw new Error("CONVEX_URL is required to run e2e tests.");
    }
    return;
  }
  await runE2ESetup();
}
