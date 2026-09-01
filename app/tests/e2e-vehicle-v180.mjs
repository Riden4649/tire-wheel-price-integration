import { chromium } from "/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const base = process.env.APP_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const context = await browser.newContext({ viewport: { width: 1024, height: 1366 } });
const page = await context.newPage();
const results = [];
const check = (condition, label) => { if (!condition) throw new Error(label); results.push(`PASS ${label}`); };

try {
  await page.goto(`${base}/tests/vehicle-fitment.test.html`);
  await page.waitForFunction(() => document.title.startsWith("PASS"));
  results.push("PASS 車種判定ブラウザテスト");

  await page.goto(`${base}/`);
  await page.waitForFunction(() => document.querySelector("#vehicleModelSearchStatus")?.textContent.includes("検索できます"));
  await page.locator("#vehicleModelSearch").fill("ベルファイア");
  await page.waitForTimeout(100);
  check((await page.locator("#vehicleModelSearchStatus").textContent()).includes("近い候補"), "表記揺れを候補提示し自動確定しない");
  const searchMs = await page.evaluate(() => {
    const input = document.querySelector("#vehicleModelSearch");
    const start = performance.now();
    for (const value of ["N-BOX", "プリウス", "セレナ", "CX-5", "フォレスター", "シビック", "タント", "スペーシア", "ノア", "シエンタ"]) {
      input.value = value; input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    return performance.now() - start;
  });
  check(searchMs < 250, `主要10車種の連続検索 ${searchMs.toFixed(1)}ms`);

  await page.locator("#vehicleModelSearch").fill("テスト未登録車");
  check(await page.locator("#missingVehiclePanel").isVisible(), "該当なし時だけ未登録フォームを表示");
  await page.locator("#missingVehicleYear").fill("2004");
  await page.locator("#missingVehicleCode").fill("QA-TEST");
  await page.locator("#missingVehicleTire").fill("195/65R15");
  await page.locator("#saveMissingVehicle").click();
  await page.waitForFunction(() => document.querySelector("#missingVehicleSaveStatus")?.textContent.includes("保存しました"));
  results.push("PASS 未登録車を端末DBへ保存");

  await page.reload();
  await page.waitForFunction(() => document.querySelector("#missingVehicleCount")?.textContent === "1件");
  results.push("PASS 再起動後も未登録車を保持");

  await page.locator("#vehicleModelSearch").fill("シビック");
  await page.locator('[data-vehicle-filter="maker"][data-value="ホンダ"]').click();
  await page.locator('[data-vehicle-filter="model"][data-value="シビック"]').click();
  await page.locator('[data-vehicle-filter="generation"]').first().click();
  await page.locator('[data-vehicle-filter="year"]').first().click();
  await page.locator('[data-vehicle-filter="tire"]').first().click();
  check((await page.locator("#sharedVehicleSummary").textContent()).includes("シビック"), "車両からタイヤサイズまで選択");
  if (process.env.QA_SCREENSHOT) await page.screenshot({ path: process.env.QA_SCREENSHOT, fullPage: true });

  await page.locator('[data-tab="settings"]').click();
  await page.locator("#bsWheelFileSetting").setInputFiles("/Users/user/Desktop/MYBooK/会社価格表/価格表読み込み用/BSアルミホイール価格表.xlsx");
  await page.waitForFunction(() => /成功|失敗/.test(document.querySelector("#bsWheelSourceBadge")?.textContent || ""), null, { timeout: 30000 });
  check((await page.locator("#bsWheelSourceBadge").textContent()).includes("成功"), `BSアルミExcel読込: ${await page.locator('[data-source-detail="bsWheel"]').textContent()}`);
  const imports = [
    ["#summerTireFileSetting", "#summerTireSourceBadge", "/Users/user/Desktop/MYBooK/会社価格表/価格表読み込み用/26.9夏卸_改訂版.xlsm", "夏タイヤ"],
    ["#winterTireFileSetting", "#winterTireSourceBadge", "/Users/user/Desktop/MYBooK/会社価格表/価格表読み込み用/26.9冬卸_改訂版.xlsm", "冬タイヤ"],
    ["#otherWheelFileSetting", "#otherWheelSourceBadge", "/Users/user/Desktop/MYBooK/会社価格表/価格表読み込み用/他社アルミ2026スノー.xlsx", "社外アルミ"]
  ];
  for (const [input, badge, file, label] of imports) {
    await page.locator(input).setInputFiles(file);
    await page.waitForFunction(selector => /成功|失敗/.test(document.querySelector(selector)?.textContent || ""), badge, { timeout: 30000 });
    check((await page.locator(badge).textContent()).includes("成功"), `${label}Excel読込`);
  }

  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 10000 });
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#vehicleModelSearch"));
  await page.locator("#vehicleModelSearch").fill("N-BOX");
  check((await page.locator("#vehicleModelSearchStatus").textContent()).includes("世代"), "完全オフラインで車種検索");
  await page.locator('[data-tab="wheel"]').click();
  await page.locator('[data-tab="settings"]').click();
  check((await page.locator("#bsWheelSourceBadge").textContent()).includes("成功"), "完全オフラインで価格データを保持");
  for (const badge of ["#summerTireSourceBadge", "#winterTireSourceBadge", "#otherWheelSourceBadge"]) check((await page.locator(badge).textContent()).includes("成功"), `${badge}をオフライン保持`);
  results.push("PASS PWAオフライン再起動");
} finally {
  await browser.close();
}

console.log(results.join("\n"));
