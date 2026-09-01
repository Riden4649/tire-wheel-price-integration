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
  check((await page.locator("#vehicleModelSearchStatus").textContent()).includes("適合世代") && (await page.locator("#sharedVehicleSummary").textContent()) === "車両未選択", "表記揺れを候補提示し自動確定しない");
  const searchMs = await page.evaluate(() => {
    const input = document.querySelector("#vehicleModelSearch");
    const start = performance.now();
    for (const value of ["N-BOX", "プリウス", "セレナ", "CX-5", "フォレスター", "シビック", "タント", "スペーシア", "ノア", "シエンタ"]) {
      input.value = value; input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    return performance.now() - start;
  });
  check(searchMs < 250, `主要10車種の連続検索 ${searchMs.toFixed(1)}ms`);
  await page.locator("#vehicleModelSearch").fill("ハチロク");
  check((await page.locator("#vehicleModelSearchStatus").textContent()).includes("適合世代"), "補完aliasesを検証済み86へ統合");
  await page.locator("#vehicleModelSearch").fill("レクサスCT");
  await page.locator('[data-vehicle-filter="maker"][data-value="レクサス"]').click(); await page.locator('[data-vehicle-filter="model"][data-value="CT"]').click();
  check(await page.locator("#searchOnlyVehicleNotice").isVisible(), "適合情報なし車種を検索結果で明示");
  check((await page.locator("#searchOnlyVehicleNotice").textContent()).includes("車種登録済み／適合情報は要確認"), "検索不能と適合未確認を分離");
  await page.locator('[data-tab="wheel"]').click();
  check((await page.locator("#wheelResults").textContent()).includes("アルミ適合情報が未検証"), "検索補完データをアルミ判定に使用しない");
  await page.locator('[data-tab="tire"]').click();
  check((await page.locator("#tireResults").textContent()).includes("純正タイヤサイズが未検証"), "検索補完データからタイヤサイズを推測しない");
  await page.locator("#clearVehicleSelection").click();

  await page.locator("#vehicleModelSearch").fill("テスト未登録車");
  check(await page.locator("#missingVehiclePanel").isVisible(), "該当なし時だけ未登録フォームを表示");
  await page.locator("#missingVehicleYear").fill("2004");
  await page.locator("#missingVehicleCode").fill("QA-TEST");
  await page.locator("#missingVehicleTire").fill("195/65R15");
  await page.locator("#saveMissingVehicle").click();
  await page.waitForFunction(() => document.querySelector("#missingVehicleSaveStatus")?.textContent.includes("保存しました"));
  await page.locator("#saveMissingVehicle").click();
  results.push("PASS 未登録車を端末DBへ保存");

  await page.reload();
  await page.waitForFunction(() => document.querySelector("#missingVehicleCount")?.textContent === "1件");
  results.push("PASS 再起動後も未登録車を保持");
  await page.locator('[data-tab="settings"]').click();
  await page.locator("details.settings-accordion", { hasText: "車種マスタ・未登録候補" }).locator("summary").click();
  await page.locator("[data-missing-key]").click();
  await page.locator("#fetchVehicleInfo").click();
  await page.waitForFunction(() => document.querySelector("#vehicleReviewMessage")?.textContent.includes("候補がありません"));
  results.push("PASS オンライン候補0件でも自動確定しない");
  await page.locator("#reviewMaker").fill("トヨタ"); await page.locator("#reviewModel").fill("テスト未登録車"); await page.locator("#reviewGeneration").fill("QA-TEST");
  await page.locator("#reviewYearFrom").fill("2004-01"); await page.locator("#reviewYearTo").fill("2004-12"); await page.locator("#reviewTires").fill("195/65R15"); await page.locator("#reviewInches").fill("15");
  await page.locator("#reviewPcd").fill("100"); await page.locator("#reviewHoles").fill("5"); await page.locator("#reviewHub").fill("54"); await page.locator("#reviewFastener").fill("M12×P1.5");
  await page.locator("#reviewSourceName").fill("QA公式資料"); await page.locator("#reviewSourceUrl").fill("https://example.com/official"); await page.locator("#reviewVerifiedAt").fill("2026-09-01");
  await page.locator("#verifyVehicleCandidate").click();
  await page.waitForFunction(() => document.querySelector("#vehicleReviewStatus")?.textContent === "確認済み");
  check(await page.locator("#registerVehicleCandidate").isEnabled(), "人間確認後だけDB登録可能");
  await page.locator("#registerVehicleCandidate").click();
  await page.waitForFunction(() => document.querySelector("#vehicleReviewStatus")?.textContent === "DB登録済み");
  await page.locator('[data-tab="tire"]').click(); await page.locator("#vehicleModelSearch").fill("テスト未登録車");
  check((await page.locator("#vehicleModelSearchStatus").textContent()).includes("1適合世代"), "登録後すぐ車種検索可能");

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
  await page.locator('[data-tab="tire"]').click(); await page.locator("#vehicleModelSearch").fill("NHW20");
  await page.locator('[data-vehicle-filter="maker"][data-value="トヨタ"]').click(); await page.locator('[data-vehicle-filter="model"][data-value="プリウス"]').click();
  await page.locator('[data-vehicle-filter="generation"]').click(); await page.locator('[data-vehicle-filter="year"]').last().click(); await page.locator('[data-vehicle-filter="tire"]').first().click();
  await page.locator('[data-tab="wheel"]').click();
  check(await page.locator("#wheelFitmentWarning").isVisible(), "取付条件未確認車は結果下部へ警告表示");
  check(await page.locator("#wheelResults .card").count() > 0, "取付条件未確認でも価格確認用アルミ候補を表示");
  check(await page.locator("#wheelResults .fitment-card-note").count() === 0, "一般的な欠損項目コメントは商品カードに表示しない");

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
