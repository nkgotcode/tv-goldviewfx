import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable RL ops critical flow tests.");

test("RL ops critical flow exposes status and run controls", async ({ page }) => {
  const api = await apiRequest();

  const statusResponse = await api.get("/ops/learning/status");
  expect(statusResponse.ok()).toBeTruthy();
  const statusPayload = await statusResponse.json();
  expect(statusPayload).toHaveProperty("config");
  expect(statusPayload).toHaveProperty("latestUpdates");

  await page.goto("/rl-ops");
  await expect(page.getByRole("heading", { name: "Ops Command Center" })).toBeVisible();
  await expect(page.getByText("Online Learning")).toBeVisible();
  await expect(page.getByRole("button", { name: /run with overrides/i })).toBeVisible();
});
