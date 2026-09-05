import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const temp = await mkdtemp(path.join(os.tmpdir(), "wheel-upload-v205-"));
const appRoot = path.join(temp, "app");
const port = 43000 + process.pid % 1000;
const node = process.execPath;
await cp(path.join(root, "app"), appRoot, { recursive: true });
const server = spawn(node, [path.join(root, "scripts/serve-app.mjs")], { env: { ...process.env, APP_ROOT: appRoot, APP_PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/wheel-images/status`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("upload server did not start");
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const page = await browser.newPage();
  page.on("dialog", dialog => dialog.accept());
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.IntegratedApp?.state.vehicles.length && window.IntegratedApp.state.imageMaster.length >= 91);
  const fixtureDir = process.env.PRICE_FIXTURE_DIR || "/Users/user/Desktop/MYBooK/会社価格表/価格表読み込み用";
  await page.locator("#bsWheelFileSetting").setInputFiles(path.join(fixtureDir, "BSアルミホイール価格表.xlsx"));
  await page.locator("#otherWheelFileSetting").setInputFiles(path.join(fixtureDir, "他社アルミ2026スノー.xlsx"));
  await page.waitForFunction(() => IntegratedApp.state.bsWheelData.length && IntegratedApp.state.otherWheelData.length);
  const input = page.locator('input[data-image-pattern="R45"][data-image-color="GB"]');
  await assert.doesNotReject(() => input.waitFor({ state: "attached" }));
  await input.setInputFiles(path.join(root, "app/assets/wheels/R45_S.webp"));
  await page.waitForFunction(() => document.querySelector("#imageUploadStatus")?.textContent.includes("保存完了"));

  const master = JSON.parse(await readFile(path.join(appRoot, "data/wheel_image_master.json"), "utf8"));
  const entry = master.find(item => item.patternName === "R45" && item.color === "GB");
  assert.match(entry.imageFile, /^assets\/wheels\/.*_[a-f0-9]{10}\.webp$/);
  await access(path.join(appRoot, entry.imageFile));
  await page.reload();
  await page.waitForFunction(() => window.IntegratedApp?.state.imageMaster.length >= 91);
  const persisted = await page.evaluate(() => IntegratedApp.findImage({ fullPatternName: "ｳﾞｧｰｹﾞﾙ R45", brandName: "ｳﾞｧｰｹﾞﾙ", patternName: "R45", color: "GB" })?.src || "");
  assert.match(persisted, /^assets\/wheels\/.*_[a-f0-9]{10}\.webp$/);
  console.log(`PASS local wheel image upload: ${entry.imageFile}`);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await new Promise(resolve => server.once("exit", resolve));
  await rm(temp, { recursive: true, force: true });
}
