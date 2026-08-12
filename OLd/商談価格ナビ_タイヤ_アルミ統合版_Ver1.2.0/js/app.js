(() => {
  "use strict";

  const STORE_KEY = "integrated-price-navi-v1";
  const IMAGE_KEY = "integrated-wheel-image-master-v1";
  const TIRE_KEY = "integrated-tire-products-v1";
  const WHEEL_KEY = "integrated-wheel-products-v1";
  const SUMMER_TIRE_KEY = "integrated-summer-tire-products-v120";
  const WINTER_TIRE_KEY = "integrated-winter-tire-products-v120";
  const BS_WHEEL_KEY = "integrated-bs-wheel-products-v120";
  const OTHER_WHEEL_KEY = "integrated-other-wheel-products-v120";
  const APP_VERSION = "Ver1.2.0";
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const yen = value => `${Math.round(Number(value) || 0).toLocaleString("ja-JP")}円`;
  const text = value => String(value ?? "").trim();

  const state = {
    summerTireWorkbook: null,
    winterTireWorkbook: null,
    bsWheelWorkbook: null,
    otherWheelWorkbook: null,
    summerTireData: loadJson(SUMMER_TIRE_KEY, loadJson(TIRE_KEY, [])),
    winterTireData: loadJson(WINTER_TIRE_KEY, []),
    bsWheelData: loadJson(BS_WHEEL_KEY, loadJson(WHEEL_KEY, [])),
    otherWheelData: loadJson(OTHER_WHEEL_KEY, []),
    imageMaster: loadJson(IMAGE_KEY, []),
    imagePreviewUrls: {},
    selectedTire: null,
    selectedWheel: null,
    tireInch: "",
    wheelInch: "",
    settings: normalizeSettings(loadJson(STORE_KEY, null) || defaultSettings())
  };
  state.tireProducts = [];
  state.wheelProducts = [];

  const els = {
    saveStatus: $("#saveStatus"),
    summerTireFileSetting: $("#summerTireFileSetting"),
    winterTireFileSetting: $("#winterTireFileSetting"),
    bsWheelFileSetting: $("#bsWheelFileSetting"),
    otherWheelFileSetting: $("#otherWheelFileSetting"),
    useSummerTire: $("#useSummerTire"),
    useWinterTire: $("#useWinterTire"),
    useBsWheel: $("#useBsWheel"),
    useOtherWheel: $("#useOtherWheel"),
    imageDbFile: $("#imageDbFile"),
    imageDbFileSetting: $("#imageDbFileSetting"),
    tireStatus: $("#tireStatus"),
    wheelStatus: $("#wheelStatus"),
    tireBrand: $("#tireBrand"),
    tireProduct: $("#tireProduct"),
    tireSize: $("#tireSize"),
    tireLimit: $("#tireLimit"),
    tireBrandChips: $("#tireBrandChips"),
    tireProductChips: $("#tireProductChips"),
    tireInchChips: $("#tireInchChips"),
    tireSizeChips: $("#tireSizeChips"),
    tireSearchSummary: $("#tireSearchSummary"),
    tireResults: $("#tireResults"),
    wheelMaker: $("#wheelMaker"),
    wheelPattern: $("#wheelPattern"),
    wheelSize: $("#wheelSize"),
    wheelColor: $("#wheelColor"),
    wheelPcd: $("#wheelPcd"),
    wheelHoles: $("#wheelHoles"),
    wheelLimit: $("#wheelLimit"),
    wheelMakerChips: $("#wheelMakerChips"),
    wheelPatternChips: $("#wheelPatternChips"),
    wheelInchChips: $("#wheelInchChips"),
    wheelPcdChips: $("#wheelPcdChips"),
    wheelHolesChips: $("#wheelHolesChips"),
    wheelColorChips: $("#wheelColorChips"),
    wheelSearchSummary: $("#wheelSearchSummary"),
    wheelResults: $("#wheelResults"),
    estimateItems: $("#estimateItems"),
    estimateCosts: $("#estimateCosts"),
    grandTotal: $("#grandTotal"),
    totalBreakdown: $("#totalBreakdown"),
    inchWarning: $("#inchWarning"),
    printEstimate: $("#printEstimate"),
    printItems: $("#printItems"),
    printGrandTotal: $("#printGrandTotal"),
    registeredImageCount: $("#registeredImageCount"),
    missingImageCount: $("#missingImageCount"),
    patternCount: $("#patternCount"),
    imageList: $("#imageList"),
    exportImageDb: $("#exportImageDb"),
    clearEstimate: $("#clearEstimate"),
    resetData: $("#resetData"),
    refreshCache: $("#refreshCache"),
    taxRate: $("#taxRate"),
    rounding: $("#rounding"),
    tireAddition: $("#tireAddition"),
    defaultRate: $("#defaultRate"),
    wheelMarkup: $("#wheelMarkup"),
    setDiscountRate: $("#setDiscountRate"),
    laborCategoryGrid: $("#laborCategoryGrid"),
    printOptionGrid: $("#printOptionGrid"),
    imageDialog: $("#imageDialog"),
    dialogImage: $("#dialogImage"),
    closeImageDialog: $("#closeImageDialog")
  };

  initialize();

  function initialize() {
    bindEvents();
    applySettingsToInputs();
    renderLaborCategorySettings();
    renderPrintOptionSettings();
    refreshActiveProducts();
    populateTireBrands();
    renderTires();
    renderWheels();
    renderEstimate();
    renderImageManager();
    restoreBundledImageDb();
    registerServiceWorker();
  }

  function bindEvents() {
    $$(".tab").forEach(button => button.addEventListener("click", () => switchTab(button.dataset.tab)));
    els.summerTireFileSetting.addEventListener("change", event => event.target.files[0] && importTireFile(event.target.files[0], "summer"));
    els.winterTireFileSetting.addEventListener("change", event => event.target.files[0] && importTireFile(event.target.files[0], "winter"));
    els.bsWheelFileSetting.addEventListener("change", event => event.target.files[0] && importWheelFile(event.target.files[0], "bs"));
    els.otherWheelFileSetting.addEventListener("change", event => event.target.files[0] && importWheelFile(event.target.files[0], "other"));
    [els.imageDbFile, els.imageDbFileSetting].filter(Boolean).forEach(input => input.addEventListener("change", event => event.target.files[0] && importImageDb(event.target.files[0])));
    [els.tireBrand, els.tireProduct, els.tireSize, els.tireLimit].forEach(input => input.addEventListener("input", renderTires));
    [els.wheelMaker, els.wheelPattern, els.wheelSize, els.wheelColor, els.wheelPcd, els.wheelHoles, els.wheelLimit].forEach(input => input.addEventListener("input", renderWheels));
    [els.useSummerTire, els.useWinterTire].forEach(input => input.addEventListener("change", () => { refreshActiveProducts(); renderTires(); }));
    [els.useBsWheel, els.useOtherWheel].forEach(input => input.addEventListener("change", () => { refreshActiveProducts(); renderWheels(); }));
    [els.tireBrandChips, els.tireProductChips, els.tireInchChips, els.tireSizeChips].forEach(container => container.addEventListener("click", handleTireChipClick));
    [els.wheelMakerChips, els.wheelPatternChips, els.wheelInchChips, els.wheelPcdChips, els.wheelHolesChips, els.wheelColorChips].forEach(container => container.addEventListener("click", handleWheelChipClick));
    $$("[data-cost]").forEach(input => input.addEventListener("input", () => {
      state.settings.costs[input.dataset.cost] = number(input.value);
      saveSettings();
      renderEstimate();
    }));
    $$("[data-default-cost]").forEach(input => input.addEventListener("input", () => {
      state.settings.defaultCosts[input.dataset.defaultCost] = number(input.value);
      state.settings.costs[input.dataset.defaultCost] = number(input.value);
      saveSettings();
      renderEstimate();
    }));
    [els.taxRate, els.rounding, els.tireAddition, els.defaultRate, els.wheelMarkup].forEach(input => input.addEventListener("input", () => {
      state.settings.taxRate = number(els.taxRate.value);
      state.settings.rounding = els.rounding.value;
      state.settings.tireAddition = number(els.tireAddition.value);
      state.settings.defaultRate = number(els.defaultRate.value) || 1;
      state.settings.wheelMarkup = number(els.wheelMarkup.value) || 1.25;
      saveSettings();
      renderTires();
      renderWheels();
      renderEstimate();
    }));
    els.setDiscountRate.addEventListener("input", () => {
      state.settings.setDiscountRate = number(els.setDiscountRate.value);
      saveSettings();
      renderEstimate();
    });
    els.laborCategoryGrid.addEventListener("input", event => {
      const input = event.target.closest("[data-labor-category]");
      if (!input) return;
      const category = state.settings.laborCategories.find(item => item.key === input.dataset.laborCategory);
      if (!category) return;
      category[input.dataset.laborField] = number(input.value);
      saveSettings();
      renderEstimate();
    });
    els.printOptionGrid.addEventListener("change", event => {
      const input = event.target.closest("[data-print-option]");
      if (!input) return;
      state.settings.printOptions[input.dataset.printOption] = input.checked;
      saveSettings();
      renderPrintSheet(currentEstimateParts());
    });
    els.exportImageDb.addEventListener("click", exportImageDb);
    els.printEstimate.addEventListener("click", () => window.print());
    els.clearEstimate.addEventListener("click", () => {
      state.selectedTire = null;
      state.selectedWheel = null;
      renderTires();
      renderWheels();
      renderEstimate();
    });
    els.resetData.addEventListener("click", resetAllData);
    els.refreshCache.addEventListener("click", refreshCache);
    els.imageList.addEventListener("change", handleImagePick);
    els.imageList.addEventListener("click", handleImageListClick);
    els.wheelResults.addEventListener("click", handleWheelResultClick);
    els.closeImageDialog.addEventListener("click", () => els.imageDialog.close());
  }

  function switchTab(tab) {
    $$(".tab").forEach(button => button.classList.toggle("active", button.dataset.tab === tab));
    $$(".panel").forEach(panel => panel.classList.toggle("active", panel.id === `tab-${tab}`));
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function refreshActiveProducts() {
    const summer = els.useSummerTire?.checked !== false ? state.summerTireData : [];
    const winter = els.useWinterTire?.checked !== false ? state.winterTireData : [];
    const bs = els.useBsWheel?.checked !== false ? state.bsWheelData : [];
    const other = els.useOtherWheel?.checked !== false ? state.otherWheelData : [];
    state.tireProducts = [...summer, ...winter];
    state.wheelProducts = [...bs, ...other];
  }

  async function importTireFile(file, tireType) {
    if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
      setMessage(els.tireStatus, "対応形式は .xlsx / .xlsm です。", true);
      return;
    }
    setMessage(els.tireStatus, `${file.name} を解析しています。`);
    try {
      const catalog = await window.CatalogParser.parse(await file.arrayBuffer());
      const label = tireType === "winter" ? "冬タイヤ" : "夏タイヤ";
      const data = catalog.products
        .filter(item => item.brand && item.size && Number(item.cost) > 0)
        .map(item => ({ ...item, sourceType: tireType, sourceLabel: label, id: stableId([tireType, item.brand, item.subbrand, item.size, item.code, item.cost]) }));
      if (tireType === "winter") {
        state.winterTireWorkbook = { fileName: file.name, loadedAt: new Date().toISOString(), sheetCount: catalog.sheets?.length || 0 };
        state.winterTireData = data;
        localStorage.setItem(WINTER_TIRE_KEY, JSON.stringify(data));
      } else {
        state.summerTireWorkbook = { fileName: file.name, loadedAt: new Date().toISOString(), sheetCount: catalog.sheets?.length || 0 };
        state.summerTireData = data;
        localStorage.setItem(SUMMER_TIRE_KEY, JSON.stringify(data));
      }
      refreshActiveProducts();
      setMessage(els.tireStatus, `${label} ${file.name}：${data.length.toLocaleString("ja-JP")}件を読み込みました。他の価格表は保持しています。`);
      populateTireBrands();
      renderTireChips();
      renderTires();
      setSaved();
    } catch (error) {
      console.error(error);
      setMessage(els.tireStatus, `${file.name} の読み込みに失敗しました。${error.message || ""}`, true);
    }
  }

  async function importWheelFile(file, wheelType) {
    if (!/\.(xls|xlsx|xlsm)$/i.test(file.name)) {
      setMessage(els.wheelStatus, "対応形式は .xls / .xlsx / .xlsm です。", true);
      return;
    }
    if (!window.XLSX?.read) {
      setMessage(els.wheelStatus, "アルミ価格表の読み込みライブラリを確認できません。", true);
      return;
    }
    setMessage(els.wheelStatus, `${file.name} を解析しています。`);
    try {
      const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, cellText: false, dense: false });
      const label = wheelType === "other" ? "社外アルミ" : "BSアルミ";
      const workbookInfo = { fileName: file.name, loadedAt: new Date().toISOString(), sheetCount: workbook.SheetNames?.length || 0 };
      const products = [];
      workbook.SheetNames.forEach(sheetName => {
        if (isSkipSheet(sheetName)) return;
        const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", blankrows: false, raw: false });
        products.push(...parseWheelRows(rows, { fileName: file.name, sheetName }));
      });
      const data = dedupe(products).map(item => ({ ...item, sourceType: wheelType, sourceLabel: label, id: stableId([wheelType, item.productCode, item.maker, item.patternName, item.sizeText, item.color, item.holes, item.pcd, item.wholesalePrice, item.salePrice]) }));
      if (wheelType === "other") {
        state.otherWheelWorkbook = workbookInfo;
        state.otherWheelData = data;
        localStorage.setItem(OTHER_WHEEL_KEY, JSON.stringify(data));
      } else {
        state.bsWheelWorkbook = workbookInfo;
        state.bsWheelData = data;
        localStorage.setItem(BS_WHEEL_KEY, JSON.stringify(data));
      }
      refreshActiveProducts();
      ensureImageMasterFromWheelPatterns();
      setMessage(els.wheelStatus, `${label} ${file.name}：${data.length.toLocaleString("ja-JP")}件を読み込みました。他の価格表は保持しています。`);
      renderWheelChips();
      renderWheels();
      renderImageManager();
      setSaved();
    } catch (error) {
      console.error(error);
      setMessage(els.wheelStatus, `${file.name} の読み込みに失敗しました。${error.message || ""}`, true);
    }
  }

  function parseWheelRows(rows, source) {
    const unlisted = parseBsUnlistedRows(rows, source);
    if (unlisted.length) return unlisted;
    const header = findWheelHeader(rows);
    if (!header) return [];
    const out = [];
    const context = { lastPattern: "" };
    for (let rowIndex = header.index + 1; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex] || [];
      const item = readWheelRow(row, header.map, source, rowIndex + 1, context);
      if (item) out.push(item);
    }
    return out;
  }

  function findWheelHeader(rows) {
    for (let index = 0; index < Math.min(rows.length, 80); index++) {
      const row = rows[index] || [];
      const map = {};
      row.forEach((cell, col) => {
        const label = normalizeHeader(cell);
        Object.entries(wheelAliases()).forEach(([key, aliases]) => {
          if (aliases.some(alias => label === normalizeHeader(alias) || label.includes(normalizeHeader(alias)))) map[key] ??= col;
        });
      });
      const score = ["patternName", "sizeText", "color", "wholesalePrice", "salePrice", "productCode"].filter(key => map[key] != null).length;
      if (score >= 3 && (map.patternName != null || map.productCode != null)) return { index, map };
    }
    return null;
  }

  function readWheelRow(row, map, source, sourceRow, context = {}) {
    const get = key => text(row[map[key]]);
    const productCode = get("productCode");
    const brandPattern = cleanPattern(get("brandName"));
    const rawPattern = cleanPattern(get("patternName"));
    const patternColumnIsSize = looksWheelSize(rawPattern);
    const patternName = patternColumnIsSize
      ? cleanPattern(brandPattern || context.lastPattern || inferPatternFromRow(row))
      : cleanPattern(rawPattern || brandPattern || inferPatternFromRow(row));
    if (patternName && !looksWheelSize(patternName)) context.lastPattern = patternName;
    const sizeText = patternColumnIsSize ? rawPattern : (get("sizeText") || [get("inch"), get("rimWidth")].filter(Boolean).join("×"));
    const color = get("color") || get("colorDescription") || (patternColumnIsSize ? colorFromBsSize(rawPattern) : "");
    const fitment = parseFitment(get("holesPcdText") || rawPattern || sizeText);
    const maker = get("maker") || inferMaker(patternName, brandPattern, source.sheetName);
    const wholesalePrice = firstPrice(get("wholesalePrice"), get("wholesalePrice2"), get("dealerCost"), get("chainStorePrice"));
    const directSale = firstPrice(get("salePrice"), get("listPrice"));
    const base = wholesalePrice || directSale;
    if (!patternName && !productCode) return null;
    if (!base && !sizeText && !color) return null;
    const salePrice = directSale || roundPrice((wholesalePrice || 0) * state.settings.wheelMarkup * taxMultiplier());
    return {
      productCode,
      maker,
      brandName: get("brandName"),
      patternName: patternName || "—",
      sizeText: sizeText || "—",
      color: color || "—",
      holes: fitment.holes,
      pcd: fitment.pcd,
      holesPcdText: fitment.label,
      wholesalePrice: wholesalePrice || 0,
      salePrice: salePrice || 0,
      sourceSheet: source.sheetName,
      sourceRow
    };
  }

  function wheelAliases() {
    return {
      productCode: ["BRJ", "BRJコード", "商品コード", "品番", "コード"],
      brandName: ["ブランド名", "ブランド"],
      patternName: ["パターン名", "パターン等", "パターン", "デザイン名", "商品名", "モデル名"],
      sizeText: ["インチ×リム幅", "インチxリム幅", "サイズ", "リム径", "インチ"],
      inch: ["インチ"],
      rimWidth: ["リム幅"],
      color: ["カラー", "色"],
      colorDescription: ["カラー解説", "カラー説明", "色解説"],
      holesPcdText: ["孔数/PCD", "孔数 PCD", "穴数/PCD", "H/PCD", "HOLE/PCD"],
      maker: ["メーカー名", "メーカー", "取扱会社名"],
      listPrice: ["25年定価", "定価", "希望小売価格"],
      dealerCost: ["販社仕切", "販社仕切価格", "仕切価格"],
      chainStorePrice: ["チェーン店", "チェーン店価格", "BTS"],
      salePrice: ["直営店価格", "販売価格", "売価案", "売価"],
      wholesalePrice: ["①卸価格", "卸価格1", "卸価格①", "卸価格"],
      wholesalePrice2: ["②卸価格", "卸価格2", "卸価格②"]
    };
  }

  function parseBsUnlistedRows(rows, source) {
    const headerIndex = rows.findIndex(row => (row || []).some(cell => normalizeHeader(cell).includes("品名表示")));
    if (headerIndex < 0) return [];
    const header = rows[headerIndex] || [];
    const next = rows[headerIndex + 1] || [];
    const brandCol = header.findIndex(cell => normalizeHeader(cell).includes("ブランド"));
    const codeCol = header.findIndex(cell => normalizeHeader(cell).includes("商品コード"));
    const displayCol = header.findIndex(cell => normalizeHeader(cell).includes("品名表示"));
    let priceCol = next.findIndex(cell => /チェーン店|価格|売価|卸/i.test(text(cell)));
    if (priceCol < 0) priceCol = displayCol + 1;
    if (brandCol < 0 || codeCol < 0 || displayCol < 0) return [];
    const out = [];
    for (let rowIndex = headerIndex + 2; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex] || [];
      const patternName = cleanPattern(row[brandCol]);
      const display = cleanPattern(row[displayCol]);
      const price = firstPrice(row[priceCol]);
      const productCode = text(row[codeCol]);
      if (!patternName || !display || !price) continue;
      out.push({
        ...parseFitment(display),
        productCode,
        maker: inferMaker(patternName, patternName, source.sheetName),
        brandName: patternName,
        patternName,
        sizeText: cleanBsDisplaySize(display, patternName),
        color: colorFromBsSize(display) || "—",
        wholesalePrice: price,
        salePrice: roundPrice(price * state.settings.wheelMarkup * taxMultiplier()),
        sourceSheet: source.sheetName,
        sourceRow: rowIndex + 1
      });
    }
    return out;
  }

  function renderTires() {
    const brand = els.tireBrand.value;
    const product = norm(els.tireProduct.value);
    const size = norm(els.tireSize.value);
    const tireInch = state.tireInch;
    const limit = number(els.tireLimit.value) || 30;
    const filtered = state.tireProducts
      .filter(item => !brand || item.brand === brand)
      .filter(item => !product || norm(`${item.subbrand} ${item.code}`).includes(product))
      .filter(item => !tireInch || String(item.inch) === String(tireInch))
      .filter(item => !size || norm(item.size).includes(size))
      .slice(0, limit);
    renderTireChips();
    els.tireSearchSummary.textContent = summaryText([sourceSummary([els.useSummerTire.checked && "夏", els.useWinterTire.checked && "冬"], "タイヤ"), brand, els.tireProduct.value, tireInch && `${tireInch}インチ`, els.tireSize.value]);
    if (!state.tireProducts.length) {
      els.tireResults.innerHTML = emptyCard("管理タブでタイヤ価格表を読み込んでください。");
      return;
    }
    els.tireResults.innerHTML = filtered.map(item => tireCard(item)).join("") || emptyCard("条件に合うタイヤがありません。");
    els.tireResults.querySelectorAll("[data-tire-id]").forEach(button => button.addEventListener("click", () => {
      const tire = state.tireProducts.find(item => item.id === button.dataset.tireId);
      if (!tire) return;
      state.selectedTire = tire;
      renderTires();
      renderEstimate();
      switchTab("estimate");
    }));
  }

  function renderTireChips() {
    if (!els.tireBrandChips) return;
    const brand = els.tireBrand.value;
    const product = norm(els.tireProduct.value);
    const inch = state.tireInch;
    const size = norm(els.tireSize.value);
    const brands = [...new Set(state.tireProducts.map(item => item.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));
    const brandFiltered = state.tireProducts.filter(item => !brand || item.brand === brand);
    const productFiltered = brandFiltered.filter(item => !product || norm(`${item.subbrand} ${item.code}`).includes(product));
    const inchFiltered = productFiltered.filter(item => !inch || String(item.inch) === String(inch));
    const products = [...new Set(brandFiltered.map(item => item.subbrand).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja")).slice(0, 36);
    const inches = [...new Set(productFiltered.map(item => item.inch).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
    const sizes = [...new Set(inchFiltered.map(item => item.size).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja")).slice(0, 48);
    els.tireBrandChips.innerHTML = chips("tire", "brand", brands, brand);
    els.tireProductChips.innerHTML = chips("tire", "product", products, els.tireProduct.value);
    els.tireInchChips.innerHTML = chips("tire", "inch", inches.map(value => `${value}インチ`), inch && `${inch}インチ`);
    els.tireSizeChips.innerHTML = chips("tire", "size", sizes, els.tireSize.value || (size ? els.tireSize.value : ""));
  }

  function handleTireChipClick(event) {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    const value = button.dataset.value || "";
    if (button.dataset.filter === "brand") {
      els.tireBrand.value = value;
      els.tireProduct.value = "";
      els.tireSize.value = "";
      state.tireInch = "";
    }
    if (button.dataset.filter === "product") {
      els.tireProduct.value = value;
      els.tireSize.value = "";
    }
    if (button.dataset.filter === "inch") {
      state.tireInch = value.replace(/インチ/g, "");
      els.tireSize.value = "";
    }
    if (button.dataset.filter === "size") els.tireSize.value = value;
    renderTires();
  }

  function tireCard(item) {
    const single = tireSalePrice(item);
    const selected = state.selectedTire?.id === item.id;
    return `<article class="card">
      <span class="source-badge">${escapeHtml(item.sourceLabel || "タイヤ")}</span>
      <h3>${escapeHtml(item.brand)} ${escapeHtml(item.subbrand || "")}</h3>
      <p class="card-meta">${escapeHtml(item.size)}<br>商品コード：${escapeHtml(item.code || "—")}</p>
      <div class="price-row">
        <div><span>1本税込</span><strong>${yen(single)}</strong></div>
        <div><span>4本税込</span><strong>${yen(single * 4)}</strong></div>
      </div>
      <button class="select-button" data-tire-id="${escapeHtml(item.id)}">${selected ? "選択中" : "セット見積に選択"}</button>
    </article>`;
  }

  function renderWheels() {
    const maker = norm(els.wheelMaker.value);
    const pattern = norm(els.wheelPattern.value);
    const size = norm(els.wheelSize.value);
    const color = norm(els.wheelColor.value);
    const pcd = norm(els.wheelPcd.value);
    const holes = norm(els.wheelHoles.value);
    const inch = state.wheelInch;
    const limit = number(els.wheelLimit.value) || 30;
    const filtered = state.wheelProducts
      .filter(item => !maker || norm(item.maker).includes(maker))
      .filter(item => !pattern || norm(item.patternName).includes(pattern))
      .filter(item => !inch || String(wheelInch(item.sizeText)) === String(inch))
      .filter(item => !size || norm(item.sizeText).includes(size))
      .filter(item => !color || norm(item.color).includes(color))
      .filter(item => !pcd || norm(item.pcd).includes(pcd) || norm(item.holesPcdText).includes(pcd))
      .filter(item => !holes || norm(item.holes).includes(holes) || norm(item.holesPcdText).includes(holes))
      .slice(0, limit);
    renderWheelChips();
    els.wheelSearchSummary.textContent = summaryText([sourceSummary([els.useBsWheel.checked && "BS", els.useOtherWheel.checked && "社外"], "アルミ"), els.wheelMaker.value, els.wheelPattern.value, inch && `${inch}インチ`, els.wheelPcd.value && `PCD ${els.wheelPcd.value}`, els.wheelHoles.value && `${els.wheelHoles.value}穴`, els.wheelSize.value, els.wheelColor.value]);
    if (!state.wheelProducts.length) {
      els.wheelResults.innerHTML = emptyCard("管理タブでアルミ価格表を読み込んでください。");
      return;
    }
    els.wheelResults.innerHTML = filtered.map(item => wheelCard(item)).join("") || emptyCard("条件に合うアルミホイールがありません。");
  }

  function renderWheelChips() {
    if (!els.wheelMakerChips) return;
    const maker = norm(els.wheelMaker.value);
    const pattern = norm(els.wheelPattern.value);
    const inch = state.wheelInch;
    const size = norm(els.wheelSize.value);
    const color = norm(els.wheelColor.value);
    const pcd = norm(els.wheelPcd.value);
    const holes = norm(els.wheelHoles.value);
    const makerFiltered = state.wheelProducts.filter(item => !maker || norm(item.maker).includes(maker));
    const patternFiltered = makerFiltered.filter(item => !pattern || norm(item.patternName).includes(pattern));
    const inchFiltered = patternFiltered.filter(item => !inch || String(wheelInch(item.sizeText)) === String(inch));
    const sizeFiltered = inchFiltered.filter(item => !size || norm(item.sizeText).includes(size));
    const pcdFiltered = sizeFiltered.filter(item => !pcd || norm(item.pcd).includes(pcd) || norm(item.holesPcdText).includes(pcd));
    const holesFiltered = pcdFiltered.filter(item => !holes || norm(item.holes).includes(holes) || norm(item.holesPcdText).includes(holes));
    const makers = [...new Set(state.wheelProducts.map(item => item.maker).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja")).slice(0, 24);
    const patterns = [...new Set(makerFiltered.map(item => item.patternName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja")).slice(0, 40);
    const inches = [...new Set(patternFiltered.map(item => wheelInch(item.sizeText)).filter(Boolean))].sort((a, b) => Number(a) - Number(b)).map(value => `${value}インチ`);
    const pcds = [...new Set(inchFiltered.map(item => item.pcd).filter(Boolean))].sort((a, b) => Number(a) - Number(b)).slice(0, 24);
    const holeValues = [...new Set(pcdFiltered.map(item => item.holes).filter(Boolean))].sort((a, b) => Number(a) - Number(b)).map(value => `${value}穴`);
    const colors = [...new Set(holesFiltered.map(item => item.color).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja")).slice(0, 36);
    els.wheelMakerChips.innerHTML = chips("wheel", "maker", makers, els.wheelMaker.value);
    els.wheelPatternChips.innerHTML = chips("wheel", "pattern", patterns, els.wheelPattern.value);
    els.wheelInchChips.innerHTML = chips("wheel", "inch", inches, inch && `${inch}インチ`);
    els.wheelPcdChips.innerHTML = chips("wheel", "pcd", pcds, els.wheelPcd.value);
    els.wheelHolesChips.innerHTML = chips("wheel", "holes", holeValues, els.wheelHoles.value && `${els.wheelHoles.value}穴`);
    els.wheelColorChips.innerHTML = chips("wheel", "color", colors, els.wheelColor.value);
  }

  function handleWheelChipClick(event) {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    const value = button.dataset.value || "";
    if (button.dataset.filter === "maker") {
      els.wheelMaker.value = value;
      els.wheelPattern.value = "";
      els.wheelSize.value = "";
      els.wheelColor.value = "";
      els.wheelPcd.value = "";
      els.wheelHoles.value = "";
      state.wheelInch = "";
    }
    if (button.dataset.filter === "pattern") {
      els.wheelPattern.value = value;
      els.wheelSize.value = "";
      els.wheelColor.value = "";
      els.wheelPcd.value = "";
      els.wheelHoles.value = "";
      state.wheelInch = "";
    }
    if (button.dataset.filter === "inch") {
      state.wheelInch = value.replace(/インチ/g, "");
      els.wheelSize.value = "";
    }
    if (button.dataset.filter === "pcd") els.wheelPcd.value = value;
    if (button.dataset.filter === "holes") els.wheelHoles.value = value.replace(/穴/g, "");
    if (button.dataset.filter === "color") els.wheelColor.value = value;
    renderWheels();
  }

  function wheelCard(item) {
    const image = findImage(item.patternName);
    const selected = state.selectedWheel?.id === item.id;
    const imageHtml = image?.src
      ? `<button data-preview-src="${escapeHtml(image.src)}" data-preview-alt="${escapeHtml(item.patternName)}"><img src="${escapeHtml(image.src)}" alt="${escapeHtml(item.patternName)}" onerror="this.closest('.wheel-image').textContent='画像なし'"></button>`
      : "画像なし";
    return `<article class="card">
      <span class="source-badge">${escapeHtml(item.sourceLabel || "アルミ")}</span>
      <div class="wheel-image">${imageHtml}</div>
      <h3>${escapeHtml(item.patternName)}</h3>
      <p class="card-meta">${escapeHtml(item.maker || "—")}<br>${escapeHtml(item.sizeText || "—")} / ${escapeHtml(item.color || "—")}<br>${escapeHtml(item.holesPcdText || [item.holes && `${item.holes}穴`, item.pcd && `PCD ${item.pcd}`].filter(Boolean).join(" / ") || "—")}</p>
      <div class="price-row">
        <div><span>卸価格</span><strong>${priceText(item.wholesalePrice)}</strong></div>
        <div><span>販売価格</span><strong>${priceText(item.salePrice)}</strong></div>
        <div><span>4本合計</span><strong>${item.salePrice ? yen(item.salePrice * 4) : "—"}</strong></div>
        <div><span>画像</span><strong>${image?.entry?.imageFile ? "登録済み" : "画像なし"}</strong></div>
      </div>
      <button class="select-button" data-wheel-id="${escapeHtml(item.id)}">${selected ? "選択中" : "セット見積に選択"}</button>
    </article>`;
  }

  function handleWheelResultClick(event) {
    const preview = event.target.closest("[data-preview-src]");
    if (preview) {
      els.dialogImage.src = preview.dataset.previewSrc;
      els.dialogImage.alt = preview.dataset.previewAlt || "";
      els.imageDialog.showModal();
      return;
    }
    const select = event.target.closest("[data-wheel-id]");
    if (select) {
      const wheel = state.wheelProducts.find(item => item.id === select.dataset.wheelId);
      if (!wheel) return;
      state.selectedWheel = wheel;
      renderWheels();
      renderEstimate();
      switchTab("estimate");
    }
  }

  function renderEstimate() {
    const tireSingle = state.selectedTire ? tireSalePrice(state.selectedTire) : 0;
    const wheelSingle = state.selectedWheel ? number(state.selectedWheel.salePrice) : 0;
    const cost = state.settings.costs;
    const labor = currentLabor();
    $$("[data-cost]").forEach(input => input.value = cost[input.dataset.cost] ?? 0);
    const workTotal = labor.total;
    const optionTotal = number(cost.nuts) + number(cost.other);
    const discount = number(cost.discount);
    const total = tireSingle * 4 + wheelSingle * 4 + workTotal + optionTotal - discount;
    const mismatch = inchMismatch();
    els.estimateItems.innerHTML = `
      <dt>選択中のタイヤ</dt><dd>${state.selectedTire ? escapeHtml(`${state.selectedTire.brand} ${state.selectedTire.subbrand} ${state.selectedTire.size}`) : "未選択"}</dd>
      <dt>タイヤ1本価格</dt><dd>${yen(tireSingle)}</dd>
      <dt>タイヤ4本価格</dt><dd>${yen(tireSingle * 4)}</dd>
      <dt>選択中のアルミ</dt><dd>${state.selectedWheel ? escapeHtml(`${state.selectedWheel.maker} ${state.selectedWheel.patternName} ${state.selectedWheel.sizeText} ${state.selectedWheel.color}`) : "未選択"}</dd>
      <dt>アルミ1本価格</dt><dd>${yen(wheelSingle)}</dd>
      <dt>アルミ4本価格</dt><dd>${yen(wheelSingle * 4)}</dd>
      <dt>工賃</dt><dd>${yen(workTotal)}</dd>
      <dt>ナット代</dt><dd>${yen(cost.nuts)}</dd>
      <dt>その他費用</dt><dd>${yen(cost.other)}</dd>
      <dt>値引き</dt><dd>-${yen(discount)}</dd>`;
    els.estimateCosts.innerHTML = `
      <dt>組替工賃</dt><dd>${yen(labor.mountTotal)}${labor.discountAmount ? `（通常 ${yen(labor.mountNormalTotal)} / セット割引 ${state.settings.setDiscountRate}%）` : ""}</dd>
      <dt>バランス</dt><dd>${yen(labor.balanceTotal)}</dd>
      <dt>廃タイヤ</dt><dd>${yen(labor.disposalTotal)}</dd>
      <dt>ゴムバルブ</dt><dd>${yen(labor.valveTotal)}</dd>
      <dt>工賃合計</dt><dd>${yen(workTotal)}</dd>
      <dt>ナット代</dt><dd>${yen(cost.nuts)}</dd>
      <dt>その他費用</dt><dd>${yen(cost.other)}</dd>
      <dt>値引き</dt><dd>-${yen(discount)}</dd>`;
    if (mismatch) {
      els.inchWarning.hidden = false;
      els.inchWarning.innerHTML = `タイヤとホイールのインチが一致していません。<br>タイヤ：${mismatch.tire}インチ　ホイール：${mismatch.wheel}インチ<br>サイズを確認してください。`;
      els.grandTotal.textContent = "サイズ確認";
      els.totalBreakdown.textContent = "インチが一致する組み合わせを選択すると合計金額を表示します。";
      els.printEstimate.disabled = true;
    } else {
      els.inchWarning.hidden = true;
      els.inchWarning.textContent = "";
      els.grandTotal.textContent = yen(Math.max(0, total));
      els.totalBreakdown.textContent = `タイヤ ${yen(tireSingle * 4)} + アルミ ${yen(wheelSingle * 4)} + 工賃 ${yen(workTotal)} + その他 ${yen(optionTotal)} - 値引き ${yen(discount)}`;
      els.printEstimate.disabled = false;
    }
    renderPrintSheet({ tireSingle, wheelSingle, workTotal, optionTotal, discount, total, mismatch });
  }

  function renderPrintSheet({ tireSingle, wheelSingle, workTotal, discount, total, mismatch }) {
    const cost = state.settings.costs;
    const tireName = state.selectedTire ? `${state.selectedTire.brand} ${state.selectedTire.subbrand}` : "—";
    const tireSizeText = state.selectedTire?.size || "—";
    const wheelName = state.selectedWheel ? `${state.selectedWheel.maker} ${state.selectedWheel.patternName}` : "—";
    const wheelSizeText = state.selectedWheel?.sizeText || "—";
    const rows = [
      ["tireName", "タイヤ商品名", escapeHtml(tireName)],
      ["tireSize", "タイヤサイズ", escapeHtml(tireSizeText)],
      ["tirePrice", "タイヤ4本価格", yen(tireSingle * 4)],
      ["wheelName", "アルミホイール商品名", escapeHtml(wheelName)],
      ["wheelSize", "ホイールサイズ", escapeHtml(wheelSizeText)],
      ["wheelPrice", "アルミ4本価格", yen(wheelSingle * 4)],
      ["labor", "工賃", yen(workTotal)],
      ["nuts", "ナット代", yen(cost.nuts)],
      ["other", "その他費用", yen(cost.other)]
    ].filter(([key]) => state.settings.printOptions[key]);
    els.printItems.innerHTML = rows.map(([, label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join("");
    els.printGrandTotal.parentElement.hidden = !state.settings.printOptions.total;
    els.printGrandTotal.textContent = mismatch ? "サイズ確認" : yen(Math.max(0, total));
  }

  function inchMismatch() {
    if (!state.selectedTire || !state.selectedWheel) return null;
    const tire = tireInch(state.selectedTire.size);
    const wheel = wheelInch(state.selectedWheel.sizeText);
    if (!tire || !wheel || String(tire) === String(wheel)) return null;
    return { tire, wheel };
  }

  function renderImageManager() {
    ensureImageMasterFromWheelPatterns();
    const patterns = wheelPatterns();
    const registered = patterns.filter(pattern => findImageEntry(pattern)?.imageFile).length;
    els.registeredImageCount.textContent = registered.toLocaleString("ja-JP");
    els.missingImageCount.textContent = Math.max(0, patterns.length - registered).toLocaleString("ja-JP");
    els.patternCount.textContent = patterns.length.toLocaleString("ja-JP");
    els.imageList.innerHTML = patterns.map(pattern => imageItem(pattern)).join("") || emptyCard("アルミ価格表を読み込むと、画像未登録リストを表示します。");
    localStorage.setItem(IMAGE_KEY, JSON.stringify(state.imageMaster));
  }

  function imageItem(pattern) {
    const entry = findImageEntry(pattern) || { patternName: pattern, imageFile: "", aliases: [] };
    const preview = state.imagePreviewUrls[pattern] || (entry.imageFile ? `wheel_images/${entry.imageFile}` : "");
    const stateText = entry.imageFile ? `登録済み　画像：${entry.imageFile}` : "画像未登録";
    return `<article class="image-item">
      <div class="thumb">${preview ? `<img src="${escapeHtml(preview)}" alt="${escapeHtml(pattern)}" onerror="this.parentElement.textContent='画像なし'">` : "画像なし"}</div>
      <div class="image-info">
        <strong>${escapeHtml(pattern)}</strong>
        <span class="image-state">${escapeHtml(stateText)}</span>
        <label class="secondary file-inline">${entry.imageFile ? "画像差し替え" : "画像を登録"}<input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" data-image-pattern="${escapeHtml(pattern)}"></label>
        ${entry.imageFile ? `<button class="secondary" data-download-image="${escapeHtml(pattern)}">画像を推奨名で再ダウンロード</button>` : ""}
      </div>
    </article>`;
  }

  async function handleImagePick(event) {
    const input = event.target.closest("[data-image-pattern]");
    if (!input || !input.files[0]) return;
    const file = input.files[0];
    const pattern = input.dataset.imagePattern;
    const ext = (file.name.match(/\.(jpe?g|png|webp)$/i)?.[1] || "jpg").toLowerCase().replace("jpeg", "jpg");
    const fileName = `${safeFileBase(pattern)}.${ext}`;
    upsertImageEntry(pattern, fileName);
    state.imagePreviewUrls[pattern] = URL.createObjectURL(file);
    state[`blob:${pattern}`] = file;
    localStorage.setItem(IMAGE_KEY, JSON.stringify(state.imageMaster));
    renderImageManager();
    renderWheels();
    downloadBlob(file, fileName);
    setSaved(`画像登録：${fileName}`);
  }

  function handleImageListClick(event) {
    const button = event.target.closest("[data-download-image]");
    if (!button) return;
    const pattern = button.dataset.downloadImage;
    const blob = state[`blob:${pattern}`];
    const entry = findImageEntry(pattern);
    if (blob && entry?.imageFile) downloadBlob(blob, entry.imageFile);
  }

  async function importImageDb(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data)) throw new Error("JSONの形式が配列ではありません。");
      state.imageMaster = data.map(item => ({
        patternName: text(item.patternName),
        imageFile: text(item.imageFile),
        aliases: Array.isArray(item.aliases) ? item.aliases.map(text).filter(Boolean) : []
      })).filter(item => item.patternName);
      ensureImageMasterFromWheelPatterns();
      localStorage.setItem(IMAGE_KEY, JSON.stringify(state.imageMaster));
      renderImageManager();
      renderWheels();
      setSaved("画像DBを読み込みました");
    } catch (error) {
      alert(`画像DBを読み込めませんでした。\n${error.message || ""}`);
    }
  }

  function exportImageDb() {
    ensureImageMasterFromWheelPatterns();
    downloadBlob(new Blob([JSON.stringify(state.imageMaster, null, 2)], { type: "application/json" }), "wheel_image_master.json");
  }

  async function restoreBundledImageDb() {
    if (state.imageMaster.length) return;
    try {
      const res = await fetch("data/wheel_image_master.json", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        state.imageMaster = data;
        renderImageManager();
      }
    } catch {}
  }

  function tireSalePrice(item) {
    const settings = {
      rates: {},
      defaultRate: state.settings.defaultRate,
      addition: state.settings.tireAddition,
      taxRate: state.settings.taxRate
    };
    return window.PriceEngine.calculate(number(item.cost), item.brand, settings);
  }

  function roundPrice(value) {
    const n = number(value);
    if (state.settings.rounding === "round100") return Math.round(n / 100) * 100;
    if (state.settings.rounding === "none") return Math.round(n);
    return Math.ceil(n / 100) * 100;
  }

  function taxMultiplier() {
    return 1 + number(state.settings.taxRate) / 100;
  }

  function ensureImageMasterFromWheelPatterns() {
    const existing = new Set(state.imageMaster.map(item => imageKey(item.patternName)));
    wheelPatterns().forEach(pattern => {
      const key = imageKey(pattern);
      if (!existing.has(key)) {
        state.imageMaster.push({ patternName: pattern, imageFile: "", aliases: [] });
        existing.add(key);
      }
    });
    state.imageMaster.sort((a, b) => a.patternName.localeCompare(b.patternName, "ja"));
  }

  function findImage(patternName) {
    const entry = findImageEntry(patternName);
    if (!entry?.imageFile) return null;
    const src = state.imagePreviewUrls[entry.patternName] || `wheel_images/${entry.imageFile}`;
    return { entry, src };
  }

  function findImageEntry(patternName) {
    const key = imageKey(patternName);
    return state.imageMaster.find(entry => imageKey(entry.patternName) === key || (entry.aliases || []).some(alias => imageKey(alias) === key));
  }

  function upsertImageEntry(patternName, imageFile) {
    const entry = findImageEntry(patternName);
    if (entry) entry.imageFile = imageFile;
    else state.imageMaster.push({ patternName, imageFile, aliases: [] });
  }

  function wheelPatterns() {
    return [...new Set(state.wheelProducts.map(item => cleanPattern(item.patternName)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));
  }

  function populateTireBrands() {
    const brands = [...new Set(state.tireProducts.map(item => item.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));
    els.tireBrand.innerHTML = `<option value="">すべて</option>${brands.map(brand => `<option>${escapeHtml(brand)}</option>`).join("")}`;
  }

  function applySettingsToInputs() {
    els.taxRate.value = state.settings.taxRate;
    els.rounding.value = state.settings.rounding;
    els.tireAddition.value = state.settings.tireAddition;
    els.defaultRate.value = state.settings.defaultRate;
    els.wheelMarkup.value = state.settings.wheelMarkup;
    els.setDiscountRate.value = state.settings.setDiscountRate;
    $$("[data-default-cost]").forEach(input => input.value = state.settings.defaultCosts[input.dataset.defaultCost] ?? 0);
    Object.assign(state.settings.costs, state.settings.costs || {});
  }

  function renderLaborCategorySettings() {
    els.laborCategoryGrid.innerHTML = state.settings.laborCategories.map(category => `
      <section class="labor-category-card">
        <h3>${escapeHtml(category.label)}</h3>
        <div class="labor-category-fields">
          <label>組替<input data-labor-category="${category.key}" data-labor-field="mount" type="number" min="0" value="${category.mount}"></label>
          <label>バランス<input data-labor-category="${category.key}" data-labor-field="balance" type="number" min="0" value="${category.balance}"></label>
          <label>廃タイヤ<input data-labor-category="${category.key}" data-labor-field="disposal" type="number" min="0" value="${category.disposal}"></label>
          <label>ゴムバルブ<input data-labor-category="${category.key}" data-labor-field="valve" type="number" min="0" value="${category.valve}"></label>
        </div>
      </section>
    `).join("");
  }

  function renderPrintOptionSettings() {
    const labels = {
      tireName: "タイヤ商品名",
      tireSize: "タイヤサイズ",
      tirePrice: "タイヤ価格",
      wheelName: "アルミ商品名",
      wheelSize: "アルミサイズ",
      wheelPrice: "アルミ価格",
      labor: "工賃",
      nuts: "ナット代",
      other: "その他費用",
      total: "合計金額"
    };
    els.printOptionGrid.innerHTML = Object.entries(labels).map(([key, label]) => `
      <label class="check-field"><input data-print-option="${key}" type="checkbox" ${state.settings.printOptions[key] ? "checked" : ""}><span>${label}</span></label>
    `).join("");
  }

  function currentLabor() {
    const inch = state.selectedTire ? tireInch(state.selectedTire.size) : 0;
    const category = laborCategoryForInch(inch);
    const hasSet = Boolean(state.selectedTire && state.selectedWheel);
    const rate = hasSet ? Math.max(0, Math.min(100, number(state.settings.setDiscountRate))) / 100 : 0;
    const mount = Math.round(number(category.mount) * (1 - rate));
    const balance = number(category.balance);
    const disposal = number(category.disposal);
    const valve = number(category.valve);
    return {
      category,
      mount,
      balance,
      disposal,
      valve,
      mountTotal: mount * 4,
      mountNormalTotal: number(category.mount) * 4,
      discountAmount: (number(category.mount) - mount) * 4,
      balanceTotal: balance * 4,
      disposalTotal: disposal * 4,
      valveTotal: valve * 4,
      total: (mount + balance + disposal + valve) * 4
    };
  }

  function laborCategoryForInch(inch) {
    return state.settings.laborCategories.find(category => inch >= category.min && inch <= category.max) || state.settings.laborCategories[0];
  }

  function currentEstimateParts() {
    const tireSingle = state.selectedTire ? tireSalePrice(state.selectedTire) : 0;
    const wheelSingle = state.selectedWheel ? number(state.selectedWheel.salePrice) : 0;
    const labor = currentLabor();
    const cost = state.settings.costs;
    const optionTotal = number(cost.nuts) + number(cost.other);
    const discount = number(cost.discount);
    const total = tireSingle * 4 + wheelSingle * 4 + labor.total + optionTotal - discount;
    return { tireSingle, wheelSingle, workTotal: labor.total, optionTotal, discount, total, mismatch: inchMismatch() };
  }

  function defaultSettings() {
    const labor = window.APP_DATA?.defaultLaborSettings || {};
    return {
      taxRate: 10,
      rounding: "ceil100",
      tireAddition: window.APP_DATA?.defaultPriceSettings?.addition || 0,
      defaultRate: window.APP_DATA?.defaultPriceSettings?.defaultRate || 0.9,
      wheelMarkup: 1.25,
      setDiscountRate: 30,
      laborCategories: defaultLaborCategories(labor),
      printOptions: defaultPrintOptions(),
      defaultCosts: {
        nuts: 0,
        other: 0
      },
      costs: {
        nuts: 0,
        other: 0,
        discount: 0
      }
    };
  }

  function normalizeSettings(settings) {
    const defaults = defaultSettings();
    return {
      ...defaults,
      ...settings,
      defaultCosts: { ...defaults.defaultCosts, ...(settings.defaultCosts || {}) },
      costs: { ...defaults.costs, ...(settings.costs || {}) },
      laborCategories: Array.isArray(settings.laborCategories) ? settings.laborCategories : defaults.laborCategories,
      printOptions: { ...defaults.printOptions, ...(settings.printOptions || {}) },
      setDiscountRate: settings.setDiscountRate ?? defaults.setDiscountRate
    };
  }

  function defaultLaborCategories(labor = {}) {
    return [
      { key: "inch12to14", label: "12〜14インチ", min: 0, max: 14, mount: labor.replacement || 1100, balance: labor.balancing || 550, disposal: labor.disposal || 330, valve: labor.valve || 275 },
      { key: "inch15to16", label: "15〜16インチ", min: 15, max: 16, mount: labor.replacement || 1100, balance: labor.balancing || 550, disposal: 550, valve: labor.valve || 275 },
      { key: "inch17to18", label: "17〜18インチ", min: 17, max: 18, mount: 1210, balance: 770, disposal: 550, valve: labor.valve || 275 },
      { key: "inch19up", label: "19インチ以上", min: 19, max: 99, mount: 1540, balance: 880, disposal: 550, valve: labor.valve || 275 }
    ];
  }

  function defaultPrintOptions() {
    return {
      tireName: true,
      tireSize: true,
      tirePrice: true,
      wheelName: true,
      wheelSize: true,
      wheelPrice: true,
      labor: true,
      nuts: true,
      other: true,
      total: true
    };
  }

  function saveSettings() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state.settings));
    setSaved();
  }

  function setSaved(message = "保存済み") {
    els.saveStatus.textContent = message;
    window.clearTimeout(setSaved.timer);
    setSaved.timer = window.setTimeout(() => { els.saveStatus.textContent = "READY"; }, 1800);
  }

  function resetAllData() {
    if (!confirm("読み込んだ価格表・画像DB・選択状態を初期化します。よろしいですか？")) return;
    [STORE_KEY, IMAGE_KEY, TIRE_KEY, WHEEL_KEY, SUMMER_TIRE_KEY, WINTER_TIRE_KEY, BS_WHEEL_KEY, OTHER_WHEEL_KEY].forEach(key => localStorage.removeItem(key));
    location.reload();
  }

  async function refreshCache() {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(reg => reg.update()));
    }
    setSaved("キャッシュ更新済み");
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(console.warn));
    }
  }

  function setMessage(el, message, isError = false) {
    el.textContent = message;
    el.classList.toggle("error", isError);
  }

  function emptyCard(message) {
    return `<article class="card"><h3>${escapeHtml(message)}</h3><p class="card-meta">検索条件は初期状態で閉じています。</p></article>`;
  }

  function chips(scope, filter, values, selected) {
    const allActive = !text(selected);
    const all = `<button type="button" class="choice-chip ${allActive ? "active" : ""}" data-scope="${scope}" data-filter="${filter}" data-value="">すべて</button>`;
    return all + values.map(value => {
      const label = text(value);
      const active = text(selected) === label;
      return `<button type="button" class="choice-chip ${active ? "active" : ""}" data-scope="${scope}" data-filter="${filter}" data-value="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
    }).join("");
  }

  function priceText(value) {
    return number(value) > 0 ? yen(value) : "—";
  }

  function summaryText(values) {
    const summary = values.map(text).filter(Boolean);
    return summary.length ? summary.join(" / ") : "未指定";
  }

  function sourceSummary(values, suffix) {
    const active = values.filter(Boolean);
    if (active.length >= 2) return `${active.join("+")}${suffix}`;
    return active.length ? `${active[0]}${suffix}` : `${suffix}未選択`;
  }

  function dedupe(items) {
    const seen = new Set();
    return items.filter(item => {
      const key = stableId([item.productCode, item.maker, item.patternName, item.sizeText, item.color, item.wholesalePrice, item.salePrice]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function isSkipSheet(name) {
    return /連絡文書|説明|案内|注意|表紙|印刷用/i.test(text(name));
  }

  function inferMaker(pattern, brand, sheetName) {
    const source = norm(`${pattern} ${brand} ${sheetName}`);
    const makers = [
      ["BS", ["BS", "BRIDGESTONE", "ブリヂストン", "TOPRUN", "BALMINUM", "ECOFORME", "ECO FORME", "POTENZA", "SUVENCER"]],
      ["WEDS", ["WEDS", "ウェッズ", "LEONIS", "RIZLEY", "VELVA"]],
      ["WORK", ["WORK", "ワーク"]],
      ["HOT STUFF", ["HOTSTUFF", "HOT STUFF", "EXCEEDER", "G-SPEED"]],
      ["MID", ["MID", "MARUKA", "SCHNEIDER", "RMP", "NITROPOWER"]],
      ["KYOHO", ["KYOHO", "共豊"]],
      ["TOPY", ["TOPY", "トピー"]],
      ["JAPAN三陽", ["JAPAN三陽", "JAPANSANYO", "MONZA", "ZACK"]],
      ["阿部商会", ["阿部商会", "ABE", "MAK", "LASTRADA"]]
    ];
    return makers.find(([, keys]) => keys.some(key => source.includes(norm(key))))?.[0] || text(brand) || "その他";
  }

  function inferPatternFromRow(row) {
    return row.map(text).find(value => /[A-Za-zＡ-Ｚａ-ｚ]{2,}|\p{Script=Katakana}/u.test(value) && !/価格|サイズ|カラー|メーカー|コード/.test(value)) || "";
  }

  function looksWheelSize(value) {
    return /^\s*\d{2}(?:\.\d)?\s*[xX×]\s*\d/.test(String(value || "").normalize("NFKC"));
  }

  function tireInch(value) {
    return window.PriceEngine?.tireInch(value) || 0;
  }

  function wheelInch(value) {
    const normalized = String(value || "").normalize("NFKC").toUpperCase();
    const match = normalized.match(/(?:^|\s)(\d{2})(?:\.\d)?\s*[X×]/) || normalized.match(/(\d{2})\s*インチ/);
    return match ? Number(match[1]) : 0;
  }

  function parseFitment(value) {
    const normalized = String(value || "").normalize("NFKC").toUpperCase().replace(/PCD/g, " ");
    const slash = normalized.match(/(\d)\s*[/／]\s*(\d{3}(?:\.\d)?)/);
    const spaced = normalized.match(/\b(\d)\s+(\d{3}(?:\.\d)?)\b/);
    const holesText = normalized.match(/(\d)\s*(?:H|穴)/);
    const pcdText = normalized.match(/(?:PCD)?\s*(100|110|112|114\.3|114|120|139\.7|139)\b/);
    const holes = slash?.[1] || spaced?.[1] || holesText?.[1] || "";
    const pcd = slash?.[2] || spaced?.[2] || pcdText?.[1] || "";
    const label = [holes && `${holes}穴`, pcd && `PCD ${pcd}`].filter(Boolean).join(" / ");
    return { holes, pcd, label, holesPcdText: label };
  }

  function colorFromBsSize(value) {
    const normalized = String(value || "").normalize("NFKC").trim();
    const tokens = normalized.split(/\s+/).filter(Boolean);
    const colorTokens = ["GS", "DS", "B", "BP", "MB", "MS", "GM", "PB", "S", "BK", "HS", "H", "GM/N", "M/N"];
    return tokens.find(token => colorTokens.includes(token.toUpperCase())) || "";
  }

  function cleanBsDisplaySize(display, patternName) {
    const normalized = String(display || "").normalize("NFKC").replace(new RegExp(escapeRegExp(patternName), "ig"), "").replace(/\b1P\b/ig, "");
    return normalized.replace(/\s+/g, " ").trim();
  }

  function cleanPattern(value) {
    return text(value).replace(/\s+/g, " ").replace(/　/g, " ").trim();
  }

  function firstPrice(...values) {
    for (const value of values) {
      const n = number(String(value ?? "").replace(/[￥¥円,\s]/g, ""));
      if (n > 0) return n;
    }
    return 0;
  }

  function number(value) {
    const n = Number(String(value ?? "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeHeader(value) {
    return String(value ?? "").normalize("NFKC").replace(/\s+/g, "").replace(/[()（）・･]/g, "").toUpperCase();
  }

  function norm(value) {
    return String(value ?? "")
      .normalize("NFKC")
      .toUpperCase()
      .replace(/[\\s　_＿\\-‐‑‒–—―ーｰ・･/／\\\\.,，。:：;；()（）[\\]【】"'“”‘’]/g, "");
  }

  function imageKey(value) {
    return norm(value);
  }

  function safeFileBase(value) {
    const normalized = String(value || "wheel")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return normalized || `wheel_${Date.now()}`;
  }

  function stableId(parts) {
    let hash = 0;
    const input = parts.map(text).join("|");
    for (let i = 0; i < input.length; i++) hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
    return Math.abs(hash).toString(36);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function loadJson(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
})();
