import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { chromium } from '/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const output = process.env.QA_OUTPUT || '/tmp/tire-integration-qa';
await mkdir(output, {recursive:true});
const checks = [];
function check(value, label) { assert.ok(value, label); checks.push(label); console.log(`PASS ${label}`); }
const browser = await chromium.launch({ headless:true, executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
let context = await browser.newContext({viewport:{width:1194,height:834},serviceWorkers:'block'});
let page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.accept());
const waitApp = async () => page.waitForFunction(() => window.IntegratedApp && document.querySelector('#dealTotal') && window.IntegratedApp.state.vehicles.length);
const parts = () => page.evaluate(() => window.IntegratedApp.currentEstimateParts());
const click = selector => page.locator(selector.replace(':first-child', '')).first().click();
const background = selector => page.locator(selector).first().evaluate(el => getComputedStyle(el).backgroundColor);
const orange = 'rgb(243, 151, 50)', paleOrange = 'rgb(255, 240, 223)';
const fixtures = process.env.PRICE_FIXTURE_DIR || '/Users/user/Desktop/MYBooK/会社価格表/価格表読み込み用';
try {
  await page.goto(base); await waitApp();
  check(await page.locator('#tab-home').isVisible(), '② 起動ホームに2入口');
  await click('[data-tab=tire]');
  check(await page.locator('#tireSeasonSwitch').isVisible(), 'タイヤを開くと夏・冬ボタンを表示');
  check(await background('.tab.active') === orange && await background('.deal-progress [aria-current]') === orange, '選択タブ・現在の商談ステップはオレンジ');
  check(await page.evaluate(()=>document.querySelector('.deal-progress').nextElementSibling.id==='tireSeasonSwitch'), '進行状況の直後に夏・冬切り替えを配置');
  await click('[data-tab=home]');
  await click('[data-start=size]');
  await page.locator('#manualTireSize').fill('195/65R15'); await click('#applyManualVehicle');
  check(await page.locator('#tireSeasonSwitch').isVisible() && !await page.locator('#tireSearchDetails').evaluate(e=>e.open), '検索条件を閉じても夏・冬の切り替えが可能');
  check(await page.locator('#tab-tire').isVisible() && await page.locator('#tab-estimate').isVisible(), '共通商談：一覧と見積を同時表示');
  check(await page.evaluate(()=>document.querySelector('#comparisonPanel').nextElementSibling.classList.contains('estimate-control-layout') && document.querySelector('#comparisonPanel').getBoundingClientRect().bottom <= document.querySelector('.estimate-cost-card').getBoundingClientRect().top), '商談画面：比較欄を費用調整の直前に表示');
  check(await page.locator('#printEstimate').isDisabled() && (await parts()).total === 0, '未選択は印刷不可・合計0');
  await click('[data-tab=settings]');
  for (const [input,badge,file] of [
    ['summerTireFileSetting','summerTireSourceBadge','26.9夏卸_改訂版.xlsm'],
    ['winterTireFileSetting','winterTireSourceBadge','26.9冬卸_改訂版.xlsm'],
    ['bsWheelFileSetting','bsWheelSourceBadge','BSアルミホイール価格表.xlsx'],
    ['otherWheelFileSetting','otherWheelSourceBadge','他社アルミ2026スノー.xlsx']
  ]) {
    assert.ok(existsSync(`${fixtures}/${file}`), `実価格表が必要: ${fixtures}/${file}`);
    await page.locator('#'+input).setInputFiles(`${fixtures}/${file}`);
    await page.waitForFunction(id => /成功|失敗/.test(document.getElementById(id).textContent), badge);
    check((await page.locator('#'+badge).textContent()).includes('成功'), `既存読込回帰: ${file}`);
  }
  console.log('CATALOG COUNTS', await page.evaluate(() => Object.fromEntries(['summerTireData','winterTireData','bsWheelData','otherWheelData'].map(k=>[k,IntegratedApp.state[k].length]))));
  await click('[data-tab=tire]');
  await page.locator('#tireSeasonSwitch label:has(#useSummerTire)').click();
  check(await page.evaluate(()=>IntegratedApp.state.tireProducts.every(item=>IntegratedApp.state.winterTireData.some(w=>w.id===item.id))), '冬のみの切り替えは既存処理を維持');
  check(await background('label:has(#useWinterTire)') === orange && await background('label:has(#useSummerTire)') !== orange, '夏・冬は選択中だけオレンジ');
  await page.locator('#tireSeasonSwitch label:has(#useSummerTire)').click();
  await click('[data-tire-id]:first-child');
  check((await page.locator('#dealType').textContent()) === 'タイヤ お見積り', '③ タイヤ単品自動判定');
  check(await page.locator('#tab-tire').isVisible(), '商品選択後も一覧を保持');
  check(await page.locator('[data-tire-id][aria-pressed=true]').count() === 1 && await background('[data-tire-id][aria-pressed=true]') === orange, '選択タイヤのボタンはオレンジ');
  const tireParts = await parts();
  check(tireParts.tireSingle > 0 && tireParts.wheelSingle === 0 && tireParts.total === tireParts.tireSingle*4+tireParts.workTotal+tireParts.optionTotal, 'タイヤ4本＋工賃の税込合計');
  await click('#toggleTire'); await click('#toggleWheel');
  await click('[data-wheel-search-mode=wheel]'); await click('[data-wheel-id]:first-child');
  check((await page.locator('#dealType').textContent()) === 'アルミホイール お見積り', '④ アルミ単品自動判定');
  check(await page.locator('[data-wheel-id][aria-pressed=true]').count() === 1 && await background('[data-wheel-id][aria-pressed=true]') === orange && await background('.search-mode-button.active') === orange, '選択ホイール・検索方法はオレンジ');
  const wheelParts = await parts();
  check(wheelParts.wheelSingle>0 && wheelParts.tireSingle===0, 'アルミ4本価格');
  await page.locator('[data-estimate-cost-amount=nuts]').fill('1234');
  await page.locator('[data-estimate-cost-amount=other]').fill('567');
  await click('#toggleTire'); await click('[data-tire-id]:first-child');
  check((await page.locator('#dealType').textContent()).includes('セット'), '⑤ アルミ→タイヤ追加でセット');
  check((await parts()).costLines.find(x=>x.key==='nuts').total===1234, '追加で手動ナット代保持');
  await click('#toggleWheel');
  check((await parts()).costLines.find(x=>x.key==='other').total===567 && !(await parts()).costLines.find(x=>x.key==='nuts').enabled, '解除で他工賃保持・タイヤ単品にナット代を課金しない');
  await click('#toggleWheel'); await click('[data-wheel-id]:first-child');
  check((await parts()).costLines.find(x=>x.key==='nuts').total===1234, '再追加で手動ナット代復元');

  // Differential regression against the untouched pre-integration calculation source.
  const legacySource = execFileSync('git',['show','HEAD:app/js/app-v174-core.js'],{encoding:'utf8'}).replace('  initialize();', '  window.Legacy = {state,currentEstimateParts,tireSalePrice,wheelSalePrice,currentLabor};');
  const oldContext = { window:{}, localStorage:{getItem:()=>null}, document:{querySelector:()=>({value:'',checked:true}),querySelectorAll:()=>[]}, console };
  vm.createContext(oldContext);
  vm.runInContext(await readFile(new URL('../js/brand-config.js',import.meta.url),'utf8'), oldContext);
  vm.runInContext(await readFile(new URL('../js/pricing.js',import.meta.url),'utf8'), oldContext);
  vm.runInContext(legacySource, oldContext);
  const selected = await page.evaluate(() => ({tire:IntegratedApp.state.selectedTire,wheel:IntegratedApp.state.selectedWheel,settings:IntegratedApp.state.settings}));
  Object.assign(oldContext.window.Legacy.state,{selectedTire:selected.tire,selectedWheel:selected.wheel,settings:selected.settings});
  check(oldContext.window.Legacy.currentEstimateParts().total === (await parts()).total, '⑥ 既存セット計算と総額が一致');
  for(const rate of [.9,.8,1]) for(const tax of [0,8,10]) for(const cost of [1,999,10001,12345.67]) {
    const value = await page.evaluate(({rate,tax,cost})=>PriceEngine.calculate(cost,'TEST',{rates:{},defaultRate:rate,taxRate:tax,addition:123}),{rate,tax,cost});
    assert.equal(value,oldContext.window.PriceEngine.calculate(cost,'TEST',{rates:{},defaultRate:rate,taxRate:tax,addition:123}));
  }
  checks.push('税込100円切上げ36ケース'); console.log('PASS 税込100円切上げ36ケース');
  await page.evaluate(() => { const s=IntegratedApp.state;s.settings.estimateCosts.mount={enabled:true,manual:false,amount:0}; s.settings.laborCategories.forEach(x=>x.mount=1111);s.settings.setDiscountRate=30;IntegratedApp.renderEstimate(); });
  check((await parts()).costLines.find(x=>x.key==='mount').total===780*4, 'セット工賃は1本10円切上げ後×4');

  await click('#addComparison'); await click('#toggleWheel'); await click('#addComparison');
  await click('#toggleTire'); await click('#toggleWheel'); await click('[data-wheel-id]:first-child'); await click('#addComparison');
  await page.locator('[data-estimate-cost-amount=other]').fill('999'); await click('#addComparison');
  check(await page.locator('.comparison-card').count()===4 && await page.locator('#addComparison').isDisabled(), '⑦ 比較4案まで・5案目を防止');
  const savedFirst = await page.locator('.comparison-card strong').first().textContent();
  await page.locator('[data-estimate-cost-amount=other]').fill('111');
  check(await page.locator('.comparison-card strong').first().textContent()===savedFirst,'比較案は現商談の変更から独立');
  await page.locator('[data-comparison-index="1"] h3').click();
  check(await page.locator('.comparison-card.selected').count() === 1 && await background('[data-comparison-index="1"]') === paleOrange && (await page.locator('#dealTotal').textContent()) === (await page.locator('[data-comparison-index="1"] strong').textContent()), '比較カードをタップして呼出し・薄いオレンジ表示');
  await page.locator('[data-restore="2"]').focus(); await page.keyboard.press('Space');
  check(await page.locator('[data-restore="2"]').getAttribute('aria-pressed') === 'true' && await page.locator('[data-restore="1"]').getAttribute('aria-pressed') === 'false', '比較案はキーボードでも選択・前の案は解除');
  await click('[data-restore="0"]');
  check((await page.locator('#dealTotal').textContent())===savedFirst, '比較案の選択・費用復元');
  check(await page.evaluate(()=>document.querySelector('#comparisonPanel').getBoundingClientRect().bottom <= document.querySelector('.estimate-cost-card').getBoundingClientRect().top), '見積画面：比較4案を費用調整より上に表示');
  await page.locator('#comparisonPanel').screenshot({path:`${output}/comparison-orange.png`});
  await page.evaluate(() => {window.print = () => {window.__printCalls=(window.__printCalls||0)+1;};});
  await click('#printComparison');
  check(await page.locator('#printPreviewPaper .print-sheet').count()===4, '⑧ 4案比較印刷プレビュー');
  if (process.env.QA_PDF) await page.pdf({path:`${output}/comparison.pdf`,preferCSSPageSize:true,printBackground:true});
  if (await page.locator('#printPreviewClose').isVisible()) await click('#printPreviewClose');

  await click('[data-tab=home]'); await click('[data-start=vehicle]');
  await page.locator('#vehicleModelSearch').fill('レクサスCT');
  await click('[data-vehicle-filter=maker][data-value="レクサス"]');
  await click('[data-vehicle-filter=model][data-value="CT"]');
  check(await background('[data-vehicle-filter=model].active') === orange, '選択した車種ボタンはオレンジ');
  check(await page.locator('#searchOnlyVehicleNotice').isVisible(), '適合未確認車を区別');
  check(await page.locator('[data-tire-id]').count()>0, '適合未確認でもタイヤを選択可能');
  await click('#manualSelection'); await page.locator('#manualModel').fill('QA未登録');
  await page.locator('#manualPcd').fill('999'); await page.locator('#manualTireSize').fill('195/65R15');
  await click('#recordManualVehicle'); await click('#applyManualVehicle');
  await click('[data-tab=wheel]'); await click('[data-wheel-search-mode=wheel]');
  await page.locator('#wheelPcd').fill('4/100');
  check(await page.locator('[data-wheel-id]').count()>0, '全商品を見るで不一致も選択可');
  await click('[data-wheel-id]:first-child');
  check((await page.locator('#dealWarnings').textContent()).includes('PCDが不一致'), '不一致警告を見積にも保持');
  check((await page.locator('#printNoteText').textContent()).includes('PCDが不一致'), '不一致警告を印刷にも保持');
  check(await page.locator('#printEstimate').isEnabled(), '未確認でも参考見積は印刷可能');
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:`${output}/wheel-ipad-landscape.png`});
  await page.setViewportSize({width:820,height:1180});
  await page.screenshot({path:`${output}/wheel-ipad-portrait.png`});
  console.log('OVERFLOW', await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,nodes:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth && e.getBoundingClientRect().width>0).map(e=>[e.tagName,e.id,e.className,Math.round(e.getBoundingClientRect().right)]).slice(0,15)})));
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'iPad縦：ページ横はみ出しなし');
  await page.setViewportSize({width:1194,height:834});

  // Build a complete hashed fixture from real parsed data, then simulate GitHub HTTP responses.
  const bundle = await page.evaluate(async () => {
    const s=IntegratedApp.state;
    return {tires:{summer:s.summerTireData,winter:s.winterTireData},wheels:{bs:s.bsWheelData,other:s.otherWheelData},fitment:{vehicles:s.vehicles},search:{vehicles:s.vehicleSearchRecords},service:await fetch('data/vehicle_service_specs.json').then(r=>r.json()),images:s.imageMaster,labor:{laborCategories:s.settings.laborCategories,defaultCosts:s.settings.defaultCosts,setDiscountRate:s.settings.setDiscountRate}};
  });
  const manifest = {schemaVersion:2,version:'qa-complete-1',files:{}};
  const payloads = {};
  for (const [key,data] of Object.entries(bundle)) {
    payloads[key]=JSON.stringify(data);
    manifest.files[key]={url:`${key}.json`,count:await page.evaluate(({key,data})=>MasterBundle.count(key,data),{key,data}),sha256:createHash('sha256').update(payloads[key]).digest('hex')};
  }
  // Block service workers for interceptable network fault tests; offline is tested separately below.
  await page.evaluate(async()=>{for(const reg of await navigator.serviceWorker.getRegistrations())await reg.unregister();});
  await page.reload(); await waitApp();
  let bad = 'hash';
  await page.route('**/qa-bundle/*.json*',async route=>{
    const key = new URL(route.request().url()).pathname.split('/').pop().replace('.json','');
    if(bad==='network' && key==='labor') return route.abort();
    if(key==='manifest')return route.fulfill({contentType:'application/json',body:JSON.stringify(manifest)});
    await route.fulfill({contentType:'application/json',body:bad==='hash'&&key==='tires'?'{}':payloads[key]});
  });
  const replace = () => page.evaluate(async()=>{try{return await MasterBundle.replace('qa-bundle/manifest.json')}catch(e){return {error:e.message}}});
  let result=await replace(); console.log('UPDATE HASH RESULT',result); check(result.error?.includes('内容検証'), '⑨ SHA不一致の一式を拒否');
  check(await page.evaluate(()=>!MasterBundle.hasSnapshot()),'失敗時は旧データ未変更');
  bad='network'; result=await replace(); check(!!result.error,'取得途中失敗は部分適用なし');
  bad=''; result=await replace(); console.log('UPDATE RESULT',result); check(result.version==='qa-complete-1','全必須ファイルの一括置換成功');
  await page.reload(); await waitApp();
  check(await page.evaluate(()=>MasterBundle.hasSnapshot()), '再起動で一括データ復元');
  check(await page.locator('.comparison-card').count()===4,'更新後も比較4案を保持');
  check(await page.locator('[data-restore="0"]').getAttribute('aria-pressed') === 'true', '再起動・データ更新後も比較案の選択色を保持');
  check(await page.evaluate(async()=>(await VehicleStore.listMissing()).some(v=>v.model==='QA未登録')),'更新後も未登録候補を保持');
  check(await page.evaluate(()=>IntegratedApp.state.summerTireData.length)>0,'更新後もタイヤ価格利用');
  const previousGeneration = await page.evaluate(()=>MasterBundle.generation());
  await page.evaluate(()=>{ window.__originalPut=IDBObjectStore.prototype.put; IDBObjectStore.prototype.put=function(...args){ if(this.transaction.db.name==='integrated-master-bundle-v2')throw new DOMException('QA storage full','QuotaExceededError'); return window.__originalPut.apply(this,args); }; });
  result=await replace(); check(!!result.error && await page.evaluate(()=>MasterBundle.generation())===previousGeneration,'容量不足・保存失敗で旧スナップショットを保持');
  await page.evaluate(()=>{IDBObjectStore.prototype.put=window.__originalPut;});
  bundle.tires.winter=[];
  bundle.tires.summer[0].cost+=100;
  bundle.labor.defaultCosts.removal=123;
  manifest.version='qa-complete-2';
  for(const key of ['tires','labor']) {payloads[key]=JSON.stringify(bundle[key]);manifest.files[key].sha256=createHash('sha256').update(payloads[key]).digest('hex');manifest.files[key].count=await page.evaluate(({key,data})=>MasterBundle.count(key,data),{key,data:bundle[key]});}
  result=await replace(); check(result.version==='qa-complete-2','2回目の全置換成功');
  await page.reload(); await waitApp();
  check(await page.evaluate(()=>IntegratedApp.state.winterTireData.length)===0,'全置換で削除された商品が復活しない');
  check(await page.evaluate(()=>IntegratedApp.state.settings.defaultCosts.removal)===123,'更新された標準工賃を反映');
  const downloadPromise=page.waitForEvent('download');
  await page.evaluate(()=>MasterBundle.exportBundle());
  const download=await downloadPromise; check(download.suggestedFilename()==='master-bundle.zip','配信用一式ZIPを書出し可能');
  const storageState = await context.storageState({indexedDB:true});
  await context.close();
  context = await browser.newContext({viewport:{width:1194,height:834},storageState});
  page = await context.newPage(); page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base); await waitApp();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.reload(); await waitApp();
  await context.setOffline(true); await page.reload(); await waitApp();
  await click('[data-tab=tire]');
  check(await page.locator('[data-tire-id]').count()>0,'⑩ オフライン再起動・タイヤ検索');
  check((await parts()).total>0,'オフライン見積計算・選択保持');
  result=await replace(); console.log('OFFLINE RESULT',result); check(!!result.error && await page.evaluate(()=>MasterBundle.hasSnapshot()),'オフライン更新拒否・旧データ保持');
  await context.setOffline(false);
  await click('[data-tab=estimate]'); await click('[data-restore="3"]');
  const selectedTotal = (await parts()).total;
  await click('[data-remove="0"]');
  check(await page.locator('[data-restore="2"]').getAttribute('aria-pressed') === 'true' && (await parts()).total === selectedTotal, '別の比較案を外しても選択中の案と見積を保持');
  await click('[data-remove="2"]');
  check(await page.locator('.comparison-card.selected').count() === 0 && (await parts()).total === selectedTotal, '選択中の比較案を外すと色を解除・現在の見積は保持');
  await page.locator('[data-estimate-cost-amount=other]').fill('9876');
  await page.locator('[data-estimate-cost-enabled=mount]').uncheck();
  const protectedData = () => page.evaluate(() => {
    const {estimateCosts, ...settings} = IntegratedApp.state.settings;
    const s = IntegratedApp.state;
    return JSON.stringify({settings, history:JSON.parse(localStorage.getItem('integrated-consultation-v2')).history,
      catalogs:[s.summerTireData,s.winterTireData,s.bsWheelData,s.otherWheelData,s.vehicles,s.imageMaster], generation:MasterBundle.generation()});
  });
  const retainedBefore = await protectedData();
  await click('[data-tab=home]');
  check(await page.locator('.comparison-card').count() === 2, 'ホームに戻るだけでは商談・比較案を消さない');
  const draftBeforeCancel = await page.evaluate(()=>localStorage.getItem('integrated-consultation-v2'));
  page.once('dialog', dialog => dialog.dismiss()); await click('#newConsultation');
  check(await page.evaluate(()=>localStorage.getItem('integrated-consultation-v2')) === draftBeforeCancel, '新規作成の確認キャンセルで商談・比較案を保持');
  await context.setOffline(true);
  page.once('dialog', dialog => dialog.accept()); await click('#newConsultation');
  check(await page.locator('#tab-home').isVisible() && await page.locator('.comparison-card').count() === 0 && await page.locator('#comparisonCount').textContent() === '0 / 4', '新規作成で比較案を全クリアしてホームに留まる');
  check(await page.locator('#printEstimate').isDisabled() && await page.locator('#printComparison').isDisabled() && (await parts()).total === 0, '新規商談は商品未選択・総額0・印刷不可');
  check(await page.evaluate(()=>{
    const s=IntegratedApp.state;
    return !s.selectedTire && !s.selectedWheel && !s.manualMode && !Object.keys(s.manualVehicle).length && !Object.values(s.vehicleSelection).some(Boolean) && !s.vehicleQuery && !s.tireInch && !s.tireCategory && s.wheelSearchMode==='vehicle' &&
      ['manualModel','manualTireSize','manualPcd','vehicleModelSearch','tireSize','wheelPcd','wheelSize'].every(id=>!document.getElementById(id).value) &&
      Object.values(s.settings.estimateCosts).every(cost=>!cost.manual && cost.enabled);
  }), '新規作成で車種・手動入力・検索条件・個別費用調整をリセット');
  check(await protectedData() === retainedBefore, '新規作成でも商品DB・基本設定・保存履歴・データ更新世代を保持');
  await page.screenshot({path:`${output}/new-consultation-home.png`});
  await page.reload(); await waitApp();
  check(await page.locator('.comparison-card').count() === 0 && (await parts()).total === 0, 'オフライン再起動後もクリア済みの比較案・商談は復活しない');
  await click('[data-start=size]');
  await page.locator('#manualTireSize').fill('195/65R15'); await click('#applyManualVehicle');
  await click('[data-tire-id]:first-child');
  for(let i=0;i<4;i++) await click('#addComparison');
  check(await page.locator('.comparison-card').count() === 4 && await page.locator('#addComparison').isDisabled(), '新規商談で商品を選び直し比較4案を再作成できる');
  await context.setOffline(false);
  check(errors.length===0, `ブラウザ例外0件 ${errors.join(',')}`);
  console.log(`COMPLETE ${checks.length} checks`);
} finally { await browser.close(); }
