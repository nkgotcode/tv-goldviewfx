import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable RL governance e2e tests.");

test("Governance controls update kill switch and promotion gates", async ({ page }) => {
  const api = await apiRequest();
  await api.post("/agents/gold-rl-agent/kill-switch", {
    data: { enabled: true, reason: "e2e" },
  });
  await api.patch("/agents/gold-rl-agent/promotion-gates", {
    data: {
      promotion_required: true,
      promotion_min_trades: 3,
      promotion_min_win_rate: 0.4,
      promotion_max_drawdown: 0.5,
    },
  });
  await api.patch("/agents/gold-rl-agent/source-policies", {
    data: [{ source_type: "news", enabled: true, min_confidence_score: 0.1 }],
  });

  await page.goto("/rl-agent");
  await expect(page.getByRole("heading", { name: "Governance Controls" })).toBeVisible();
  await expect(page.getByText("Kill Switch Enabled")).toBeVisible();
});
