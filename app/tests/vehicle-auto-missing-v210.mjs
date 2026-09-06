import assert from "node:assert/strict";
import { chromium } from "/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const base = process.env.APP_URL || "http://127.0.0.1:4184/?v=210";
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, serviceWorkers: "block" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const check = (value, label) => { assert.ok(value, label); console.log(`PASS ${label}`); };

try {
  await page.goto(base);
  await page.waitForFunction(() => window.IntegratedApp?.state?.vehicleSearchRecords?.length && window.VehicleStore);
  const target = await page.evaluate(() => {
    const record = IntegratedApp.state.vehicleSearchRecords.find(item => !item.has_verified_fitment);
    return { maker: record.maker, model: record.model };
  });
  await page.locator('[data-start="vehicle"]').click();
  await page.locator("#vehicleModelSearch").fill(target.model);
  check(await page.locator(`[data-vehicle-filter="model"][data-value="${target.model}"]`).count() === 0, "適合未確認車を商談候補に表示しない");
  check(await page.locator("#missingVehiclePanel").isVisible(), "未確認車の検索を調査候補登録へ案内");
  check(!await page.locator("#searchOnlyVehicleNotice").isVisible(), "未確認車を選択済みに見せない");
  check(errors.length === 0, `ブラウザ例外0件 ${errors.join(" / ")}`);
  console.log("COMPLETE 4 checks");
} finally {
  await browser.close();
}
