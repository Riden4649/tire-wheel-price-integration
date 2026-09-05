import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const base = process.env.APP_URL || "http://127.0.0.1:4184/?v=208";
const fixtureDir = process.env.PRICE_FIXTURE_DIR || "/Users/user/Desktop/MYBooK/会社価格表/読込";
const output = process.env.QA_OUTPUT || "/tmp/price-update-v208-qa";
const paths = [
  `${fixtureDir}/26.9夏卸_改訂版読込.xlsm`,
  `${fixtureDir}/26.9冬卸_改訂版読込.xlsm`,
  `${fixtureDir}/BSアルミ2026年ｽﾉｰ読込用.xlsx`,
  `${fixtureDir}/他社アルミ2026スノー読込.xlsx`
];

await mkdir(output, { recursive: true });
const checks = [];
function check(value, label) {
  assert.ok(value, label);
  checks.push(label);
  console.log(`PASS ${label}`);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
let context = await browser.newContext({ viewport: { width: 820, height: 1180 }, serviceWorkers: "block" });
let page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const waitApp = () => page.waitForFunction(() => window.IntegratedApp?.state?.vehicles?.length && window.MasterBundle);
const info = () => page.evaluate(() => MasterBundle.info());

try {
  await page.goto(base);
  await waitApp();
  await page.locator('[data-tab="settings"]').click();
  check(await page.locator("#priceUpdateSection").isVisible(), "設定に価格表更新セクションを表示");
  check(await page.locator("#manualPriceTableFiles").getAttribute("multiple") !== null, "iPadファイル選択で複数Excelを指定可能");
  check(await page.locator("#restorePreviousPriceTables").isDisabled(), "初回は復元ボタンを無効化");

  await page.locator("#manualPriceTableFiles").setInputFiles({
    name: "26.10夏卸_破損.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("broken workbook")
  });
  await page.waitForFunction(() => document.querySelector("#priceUpdateStatus").textContent.includes("更新失敗"));
  check(!(await info()).active, "壊れたExcelを拒否し現在データを変更しない");

  const started = Date.now();
  await page.locator("#manualPriceTableFiles").setInputFiles(paths);
  await page.waitForFunction(() => document.querySelector("#priceUpdateDialog").open || document.querySelector("#priceUpdateStatus").textContent.includes("更新失敗"), null, { timeout: 30000 });
  const firstStatus = await page.locator("#priceUpdateStatus").textContent();
  console.log("FIRST IMPORT STATUS", firstStatus);
  check(await page.locator("#priceUpdateDialog").isVisible(), `実価格表の検証完了: ${firstStatus}`);
  const summary = await page.locator("#priceUpdateDialogSummary").textContent();
  check(summary.includes("2026.09") && /件数\s*[\d,]+件/.test(summary), "更新前にバージョンと件数を確認表示");
  await page.locator("#confirmPriceUpdate").click();
  await page.waitForFunction(() => MasterBundle.info().active || document.querySelector("#priceUpdateStatus").textContent.includes("更新失敗"), null, { timeout: 30000 });
  await page.waitForLoadState("domcontentloaded");
  await waitApp();
  const first = await info();
  console.log("FIRST COMMIT", first, await page.locator("#priceUpdateStatus").textContent());
  check(first.active?.version === "2026.09" && first.active?.method === "manual", "実価格表4ファイルを手動更新として保存");
  check(Object.values(first.active.counts).every(value => value >= 20), "夏・冬・BS・社外アルミを最低件数以上で保存");
  check(!first.previous, "有効な旧価格表がない初回更新では空バックアップを作らない");
  check(Date.now() - started < 30000, "実価格表4ファイルを古いiPad向け上限内の処理時間で更新");

  await page.locator('[data-tab="settings"]').click();
  check((await page.locator("#priceTableVersion").textContent()) === "2026.09", "再起動後に使用中バージョンを表示");
  check((await page.locator("#priceTableUpdateMethod").textContent()).includes("AirDrop"), "手動取込の更新方法を表示");
  check(await page.locator("#restorePreviousPriceTables").isDisabled(), "有効な旧価格表がない間は復元ボタンを無効化");

  const oldNames = [
    "25.8夏卸_改訂版読込.xlsm",
    "25.8冬卸_改訂版読込.xlsm",
    "BSアルミ2025.8年スノー読込用.xlsx",
    "他社アルミ2025.8スノー読込.xlsx"
  ];
  const oldPayloads = await Promise.all(paths.map(async (path, index) => ({
    name: oldNames[index],
    mimeType: path.endsWith(".xlsm") ? "application/vnd.ms-excel.sheet.macroEnabled.12" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await readFile(path)
  })));
  const generationBeforeOld = await page.evaluate(() => MasterBundle.generation());
  await page.locator("#manualPriceTableFiles").setInputFiles(oldPayloads);
  await page.locator("#priceUpdateDialog").waitFor({ state: "visible", timeout: 30000 });
  check(await page.locator("#priceUpdateOlderWarning").isVisible(), "現在より古い価格表を警告");
  await page.locator("#cancelPriceUpdate").click();
  check(await page.evaluate(value => MasterBundle.generation() === value, generationBeforeOld), "古い価格表のキャンセルで現行版を維持");

  await page.locator("#manualPriceTableFiles").setInputFiles(paths);
  await page.locator("#priceUpdateDialog").waitFor({ state: "visible", timeout: 30000 });
  await page.locator("#confirmPriceUpdate").click();
  await page.waitForFunction(value => MasterBundle.generation() !== value, generationBeforeOld, { timeout: 30000 });
  await page.waitForLoadState("domcontentloaded");
  await waitApp();
  const second = await info();
  check(second.previous?.version === "2026.09" && Object.values(second.previous.counts).every(value => value >= 20), "2回目更新で現行価格表を有効なバックアップとして保存");

  await page.locator('[data-tab="settings"]').click();
  await page.locator("#restorePreviousPriceTables").click();
  await page.locator("#priceUpdateDialog").waitFor({ state: "visible" });
  check((await page.locator("#priceUpdateDialogTitle").textContent()).includes("前の価格表"), "復元前にも確認画面を表示");
  const generationBeforeRestore = await page.evaluate(() => MasterBundle.generation());
  await page.locator("#confirmPriceUpdate").click();
  await page.waitForFunction(value => MasterBundle.generation() !== value, generationBeforeRestore, { timeout: 30000 });
  await page.waitForLoadState("domcontentloaded");
  await waitApp();
  check((await info()).active?.version === "2026.09", "前の価格表へ復元");

  const bundle = await page.evaluate(async () => {
    const s = IntegratedApp.state;
    return {
      tires: { summer: s.summerTireData, winter: s.winterTireData },
      wheels: { bs: s.bsWheelData, other: s.otherWheelData },
      fitment: { vehicles: s.vehicles },
      search: { vehicles: s.vehicleSearchRecords },
      service: { records: s.serviceSpecs },
      images: s.imageMaster,
      labor: { laborCategories: s.settings.laborCategories, defaultCosts: s.settings.defaultCosts, setDiscountRate: s.settings.setDiscountRate }
    };
  });
  const manifest = { schemaVersion: 2, version: "2026.10", files: {} };
  const payloads = {};
  for (const [key, value] of Object.entries(bundle)) {
    payloads[key] = JSON.stringify(value);
    const count = key === "tires" ? value.summer.length + value.winter.length
      : key === "wheels" ? value.bs.length + value.other.length
      : key === "labor" ? value.laborCategories.length
      : Array.isArray(value) ? value.length : (value.vehicles || value.records || []).length;
    manifest.files[key] = { url: `${key}.json`, count, sha256: createHash("sha256").update(payloads[key]).digest("hex") };
  }
  await page.route("**/secure-price-qa/*.json*", async route => {
    const name = new URL(route.request().url()).pathname.split("/").pop().replace(".json", "");
    if (name === "manifest") return route.fulfill({ contentType: "application/json", body: JSON.stringify(manifest) });
    return route.fulfill({ contentType: "application/json", body: payloads[name] });
  });
  await page.locator('[data-tab="settings"]').click();
  await page.locator(".price-update-advanced > summary").click();
  await page.locator("#priceUpdateManifestUrl").fill(new URL("secure-price-qa/manifest.json", base).href);
  await page.locator("#fetchLatestPriceTables").click();
  await page.locator("#priceUpdateDialog").waitFor({ state: "visible", timeout: 30000 });
  await page.locator("#confirmPriceUpdate").click();
  await page.waitForFunction(() => MasterBundle.info().active?.version === "2026.10", null, { timeout: 30000 });
  await page.waitForLoadState("domcontentloaded");
  await waitApp();
  const automatic = await info();
  check(automatic.active?.version === "2026.10" && automatic.active?.method === "automatic", "SHA-256検証済み自動更新を同じ内部形式へ保存");
  check(JSON.stringify(automatic.active.counts) === JSON.stringify((await info()).previous.counts), "自動・手動更新で価格データ件数が一致");
  check(await page.evaluate(() => IntegratedApp.tireSalePrice(IntegratedApp.state.summerTireData[0]) > 0 && IntegratedApp.wheelSalePrice(IntegratedApp.state.bsWheelData[0]) > 0), "更新後も既存価格計算が正常");

  await page.reload();
  await waitApp();
  check((await info()).active?.version === "2026.10", "アプリ再起動後もIndexedDBの価格表が残る");
  await page.locator('[data-tab="settings"]').click();
  await page.screenshot({ path: `${output}/price-update-ipad-portrait.png`, fullPage: true });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "iPad縦画面で横方向にはみ出さない");

  const storageState = await context.storageState({ indexedDB: true });
  await context.close();
  context = await browser.newContext({ viewport: { width: 820, height: 1180 }, storageState });
  page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base);
  await waitApp();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await waitApp();
  await context.setOffline(true);
  await page.reload();
  await waitApp();
  check(await page.evaluate(() => IntegratedApp.state.summerTireData.length > 0 && IntegratedApp.state.bsWheelData.length > 0), "オフライン再起動後もタイヤ・アルミ価格を検索可能");
  check(await page.evaluate(() => MasterBundle.info().active.version === "2026.10"), "オフラインでも更新済み価格表バージョンを保持");
  check(errors.length === 0, `ブラウザ例外0件 ${errors.join(" / ")}`);
  console.log(`COMPLETE ${checks.length} checks`);
} finally {
  await browser.close();
}
