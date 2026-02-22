import { expect, test } from "@playwright/test";
import { apiRequest } from "./fixtures";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable TA-Lib promotion e2e tests.");

test("TA feature evaluation returns walk-forward metadata and can be promoted", async () => {
  const api = await apiRequest();
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 6 * 60 * 60 * 1000);

  const trainResponse = await api.post("/agents/gold-rl-agent/training", {
    data: {
      pair: "Gold-USDT",
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      windowSize: 20,
      stride: 1,
      timesteps: 25,
    },
  });
  expect(trainResponse.ok()).toBeTruthy();
  const training = await trainResponse.json();
  const versionId = training.agentVersion?.id;
  expect(versionId).toBeTruthy();

  const evalResponse = await api.post("/agents/gold-rl-agent/evaluations", {
    data: {
      pair: "Gold-USDT",
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      agentVersionId: versionId,
      decisionThreshold: 0.01,
      walkForward: {
        folds: 3,
        purgeBars: 1,
        embargoBars: 1,
        minTrainBars: 60,
        strict: true,
      },
    },
  });
  expect(evalResponse.ok()).toBeTruthy();
  const report = await evalResponse.json();
  expect(report.metadata?.fold_metrics?.length ?? 0).toBeGreaterThan(0);

  const promoteResponse = await api.post(`/agents/gold-rl-agent/versions/${versionId}/promote`);
  expect(promoteResponse.ok()).toBeTruthy();
});
