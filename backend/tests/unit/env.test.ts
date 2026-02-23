import { afterEach, beforeEach, expect, test } from "bun:test";
import { loadEnv } from "../../src/config/env";

const TRACKED_ENV_KEYS = [
  "NODE_ENV",
  "DISABLE_TEST_DATA_IN_DB",
  "E2E_RUN",
  "BINGX_MARKET_DATA_MOCK",
  "TRADINGVIEW_USE_HTML",
  "TRADINGVIEW_HTML_PATH",
  "TELEGRAM_MESSAGES_PATH",
] as const;

let envSnapshot: Partial<Record<(typeof TRACKED_ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  envSnapshot = Object.fromEntries(TRACKED_ENV_KEYS.map((key) => [key, process.env[key]]));
});

afterEach(() => {
  for (const key of TRACKED_ENV_KEYS) {
    const value = envSnapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("production requires DISABLE_TEST_DATA_IN_DB=true", () => {
  process.env.NODE_ENV = "production";
  process.env.DISABLE_TEST_DATA_IN_DB = "false";

  expect(() => loadEnv()).toThrow("DISABLE_TEST_DATA_IN_DB must be true");
});

test("production blocks fixture and mock flags even when guard is enabled", () => {
  process.env.NODE_ENV = "production";
  process.env.DISABLE_TEST_DATA_IN_DB = "true";
  process.env.BINGX_MARKET_DATA_MOCK = "true";

  expect(() => loadEnv()).toThrow("test/fixture sources disabled for DB writes");
});

test("non-production can explicitly disable the guard for isolated test environments", () => {
  process.env.NODE_ENV = "development";
  process.env.DISABLE_TEST_DATA_IN_DB = "false";
  process.env.E2E_RUN = "true";

  expect(() => loadEnv()).not.toThrow();
});
