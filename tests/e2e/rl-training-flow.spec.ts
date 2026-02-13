import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";

test("rl training flow persists and promotes a version", async () => {
  const api = await apiRequest();
  const end = new Date();
  const start = new Date(end.getTime() - 2 * 60 * 60 * 1000);

  const trainResponse = await api.post("/agents/gold-rl-agent/training", {
    data: {
      pair: "Gold-USDT",
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      windowSize: 5,
      stride: 1,
      timesteps: 25,
    },
  });

  expect(trainResponse.status()).toBe(201);
  const training = await trainResponse.json();
  expect(training.agentVersion?.id).toBeTruthy();
  expect(training.datasetVersion?.id).toBeTruthy();

  const evaluationResponse = await api.post("/agents/gold-rl-agent/evaluations", {
    data: {
      pair: "Gold-USDT",
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      agentVersionId: training.agentVersion.id,
      decisionThreshold: 0.01,
    },
  });

  expect(evaluationResponse.status()).toBe(202);
  const report = await evaluationResponse.json();
  expect(report.agent_version_id).toBe(training.agentVersion.id);
  expect(report.dataset_hash).toBeTruthy();

  const datasetResponse = await api.get(`/datasets/${training.datasetVersion.id}`);
  expect(datasetResponse.status()).toBe(200);
  const dataset = await datasetResponse.json();
  expect(dataset.dataset_hash).toBeTruthy();

  const lineageResponse = await api.get(`/datasets/${training.datasetVersion.id}/lineage`);
  expect(lineageResponse.status()).toBe(200);

  const promoteResponse = await api.post(`/agents/gold-rl-agent/versions/${training.agentVersion.id}/promote`);
  expect(promoteResponse.status()).toBe(200);
});
