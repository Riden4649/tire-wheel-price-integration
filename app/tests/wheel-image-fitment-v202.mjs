import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const base = process.env.APP_URL || "http://127.0.0.1:4173";
const fixtures = process.env.PRICE_FIXTURE_DIR || "/Users/user/Desktop/MYBooK/会社価格表/価格表読み込み用";
const files = [
  ["#bsWheelFileSetting", "BSアルミホイール価格表.xlsx"],
  ["#otherWheelFileSetting", "他社アルミ2026スノー.xlsx"]
];

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
const context = await browser.newContext({ serviceWorkers: "block" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));

try {
  await page.goto(base);
  await page.waitForFunction(() => window.IntegratedApp?.state.vehicles.length);
  await page.waitForFunction(() => window.IntegratedApp?.state.imageMaster.length >= 91);
  for (const [selector, name] of files) {
    const file = `${fixtures}/${name}`;
    assert.ok(existsSync(file), `missing fixture: ${file}`);
    await page.locator(selector).setInputFiles(file);
  }
  await page.waitForFunction(() => IntegratedApp.state.bsWheelData.length && IntegratedApp.state.otherWheelData.length);

  const result = await page.evaluate(() => {
    const state = IntegratedApp.state;
    const all = [...state.bsWheelData, ...state.otherWheelData];
    const variantMap = new Map();
    for (const item of all) {
      const key = `${item.fullPatternName || item.patternName}|${item.color || ""}`;
      if (!variantMap.has(key)) variantMap.set(key, item);
    }
    const variants = [...variantMap.values()];
    const mapped = variants.filter(item => IntegratedApp.findImage(item));
    const pick = (pattern, color) => {
      const item = all.find(value =>
        `${value.fullPatternName || ""} ${value.patternName || ""}`.normalize("NFKC").toUpperCase().includes(pattern.normalize("NFKC").toUpperCase())
        && String(value.color || "").normalize("NFKC").toUpperCase() === color.normalize("NFKC").toUpperCase()
      );
      const image = item && IntegratedApp.findImage(item);
      return { foundItem: Boolean(item), src: image?.src || "", matchedColor: image?.entry?.color || "" };
    };
    return {
      masterCount: state.imageMaster.length,
      registered: state.imageMaster.filter(item => item.imageFile).length,
      bsMissingColorDefaults: state.bsWheelData.filter(item => item.color === "S" && !/\b(?:S|SL|SI|GS|HS|MS)\b/i.test(item.sizeText)).length,
      bsUnknownColors: state.bsWheelData.filter(item => !item.color || item.color === "—").length,
      catalogVariants: variants.length,
      mappedVariants: mapped.length,
      unresolvedVariants: variants.filter(item => !IntegratedApp.findImage(item)).map(item => `${item.fullPatternName || item.patternName} / ${item.color || "—"}`),
      tqGm: pick("TQ22W", "GM"),
      tqSilver: pick("TQ22W", "S"),
      hanna: pick("HANNATL9", "FGM"),
      cvw: pick("CVW-01", "S"),
      r45: pick("R45", "S"),
      r45Gb: pick("R45", "GB"),
      sibilla: pick("ｳﾞｨﾊﾁﾊﾁ", "S"),
      bazalt: pick("ﾀｲﾌﾟﾂｰ", "GM"),
      biasso: pick("BI-02", "HG"),
      tiradoSilver: pick("TIRADOCR", "S"),
      tiradoGb: pick("TIRADOCR", "GB"),
      tqGmFuture: (() => {
        const image = IntegratedApp.findImage({ fullPatternName: "GRADUAL TQ22W", brandName: "GRADUAL", patternName: "TQ22W", color: "GM" });
        return { foundItem: true, src: image?.src || "", matchedColor: image?.entry?.color || "" };
      })()
    };
  });

  console.log(JSON.stringify(result, null, 2));
  assert.ok(result.registered >= 106);
  assert.equal(result.bsUnknownColors, 0);
  for (const key of ["tqSilver", "hanna", "cvw", "r45", "r45Gb", "sibilla", "bazalt", "biasso", "tiradoSilver", "tiradoGb", "tqGmFuture"]) {
    const value = result[key];
    assert.equal(value.foundItem, true);
    assert.ok(value.src.startsWith("assets/wheels/"));
    assert.ok(value.matchedColor);
  }
  assert.equal(result.tqGm.foundItem, false);
  assert.match(result.tqGmFuture.src, /_GM\.webp$/);
  assert.match(result.tqSilver.src, /_S\.webp$/);
  assert.notEqual(result.tqGmFuture.src, result.tqSilver.src);
  assert.deepEqual(errors, []);
  console.log("PASS wheel image model/color fitment");
} finally {
  await browser.close();
}
