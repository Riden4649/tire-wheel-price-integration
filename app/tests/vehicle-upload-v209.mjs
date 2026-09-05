import assert from "node:assert/strict";
import { chromium } from "/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const base = process.env.APP_URL || "http://127.0.0.1:4184/?v=209";
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, serviceWorkers: "block" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const check = (value, label) => { assert.ok(value, label); console.log(`PASS ${label}`); };

try {
  await page.goto(base);
  await page.waitForFunction(() => window.IntegratedApp?.state?.vehicles?.length && window.VehicleStore);
  await page.evaluate(() => VehicleStore.recordMissing({ maker: "トヨタ", model: "QA候補車", year: "2026", model_code: "QA1", tire_size: "195/65R15", memo: "GitHub連携QA" }));
  await page.reload();
  await page.waitForFunction(() => window.IntegratedApp?.state?.missingVehicles?.length === 1);
  await page.locator('[data-tab="settings"]').click();
  await page.locator("details:has(#uploadMissingVehicles) > summary").click();
  check(await page.locator("#uploadMissingVehicles").isVisible(), "JSON書き出しをGitHubアップロードへ置換");
  check(await page.locator("#exportMissingVehicles").count() === 0, "旧JSON書き出しボタンを削除");
  await page.evaluate(() => { window.__openedVehicleIssue = ""; window.open = value => { window.__openedVehicleIssue = String(value); return null; }; });
  await page.locator("#uploadMissingVehicles").click();
  const opened = await page.evaluate(() => window.__openedVehicleIssue);
  const url = new URL(opened);
  check(url.hostname === "github.com" && url.pathname === "/Riden4649/tire-wheel-price-integration/issues/new", "対象GitHubリポジトリのIssue送信画面を開く");
  check(url.searchParams.get("title").startsWith("[vehicle-research]"), "自動調査トリガーを付与");
  const body = url.searchParams.get("body");
  const payload = JSON.parse(body.match(/VEHICLE_RESEARCH_JSON\n(.*?)\n-->/s)[1]);
  check(payload.candidates.length === 1 && payload.candidates[0].model === "QA候補車", "端末候補を最小JSONとして送信");
  check(!("draft" in payload.candidates[0]) && !("candidates" in payload.candidates[0]), "不要な取得候補や下書きを送信しない");
  check((await page.locator("#missingVehicleAdminStatus").textContent()).includes("Submit new issue"), "GitHubでの確定操作を案内");
  await context.setOffline(true);
  await page.evaluate(() => { window.__openedVehicleIssue = ""; });
  await page.locator("#uploadMissingVehicles").click();
  check(!await page.evaluate(() => window.__openedVehicleIssue) && (await page.locator("#missingVehicleAdminStatus").textContent()).includes("オフライン"), "オフライン送信を安全に停止");
  check(errors.length === 0, `ブラウザ例外0件 ${errors.join(" / ")}`);
  console.log("COMPLETE 9 checks");
} finally {
  await browser.close();
}
