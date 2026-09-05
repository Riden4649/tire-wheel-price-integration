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
  await page.evaluate(() => VehicleStore.clearMissing());

  const target = await page.evaluate(() => {
    const record = IntegratedApp.state.vehicleSearchRecords.find(item => !item.has_verified_fitment);
    return { maker: record.maker, model: record.model };
  });
  await page.evaluate(({ maker, model }) => {
    const makerButton = [...document.querySelectorAll('[data-vehicle-filter="maker"]')].find(button => button.dataset.value === maker);
    makerButton.click();
    const modelButton = [...document.querySelectorAll('[data-vehicle-filter="model"]')].find(button => button.dataset.value === model);
    modelButton.click();
  }, target);

  await page.waitForFunction(({ maker, model }) => IntegratedApp.state.missingVehicles.some(item => item.maker === maker && item.model === model), target);
  const saved = await page.evaluate(({ maker, model }) => IntegratedApp.state.missingVehicles.find(item => item.maker === maker && item.model === model), target);
  check(saved.count === 1, "適合未確認車を選ぶと候補へ自動保存");
  check(saved.memo === "車種選択時に自動記録", "自動記録の由来を保存");
  check((await page.locator("#searchOnlyVehicleText").textContent()).includes("自動で保存しました"), "画面に自動保存結果を表示");
  check((await page.locator("#missingVehicleCount").textContent()) === "1件", "管理画面の候補件数へ即時反映");
  check(errors.length === 0, `ブラウザ例外0件 ${errors.join(" / ")}`);
  console.log("COMPLETE 5 checks");
} finally {
  await browser.close();
}
