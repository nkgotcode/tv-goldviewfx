import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";
import { parseSingleResponse } from "./fixtures/api_list";
import { featureSetSchema } from "./fixtures/schemas";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable RL feature input e2e tests.");

test("Feature inputs panel lists newly created feature set", async ({ page }) => {
  const api = await apiRequest();
  const response = await api.post("/feature-sets", { data: { includeNews: true, includeOcr: true } });
  expect(response.ok()).toBeTruthy();
  parseSingleResponse(featureSetSchema, await response.json());

  await page.goto("/rl-agent");
  await expect(page.getByRole("heading", { name: "Feature Inputs" })).toBeVisible();
  const latestLabel = page.getByText("Latest Label").locator("..");
  await expect(latestLabel.getByText("core+news+ocr")).toBeVisible();
});
