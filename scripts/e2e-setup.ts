import { runE2ESetup } from "../tests/e2e/fixtures/e2e_setup";

runE2ESetup().catch((error) => {
  console.error("E2E setup failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
