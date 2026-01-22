import { chromium } from "playwright";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

function getArg(index: number, fallback?: string) {
  return process.argv[index] ?? fallback;
}

async function waitForEnter() {
  process.stdout.write("Press Enter to save cookies once you are logged in...\n");
  return new Promise<void>((resolvePromise) => {
    process.stdin.once("data", () => resolvePromise());
  });
}

async function main() {
  const defaultPath = resolve(process.cwd(), "tradingview.storage.json");
  const storagePath = getArg(2, defaultPath);
  const startUrl = getArg(3, "https://www.tradingview.com/");

  if (existsSync(storagePath)) {
    console.warn(`Warning: ${storagePath} already exists and will be overwritten.`);
  }

  console.log("Opening TradingView login page...");
  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(startUrl, { waitUntil: "domcontentloaded" });
    console.log("Log in to TradingView in the browser window.");
    await waitForEnter();
    await context.storageState({ path: storagePath });
    console.log(`Saved cookies to ${storagePath}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("Failed to generate TradingView storage state:", error);
  process.exit(1);
});
