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
  const SOURCE_META_KEY = "integrated-source-meta-v1";
  const APP_VERSION = "Ver1.7.4";
  const PRIMARY_WHEEL_INCHES = [12, 13, 14, 15, 16, 17, 18, 19, 20];
  const ESTIMATE_COST_KEYS = ["mount", "balance", "disposal", "valve", "nuts", "other"];
  const WHEEL_DISCOUNT_BRANDS = ["TOPRUN", "ECO FORME", "BALMINUM"];
  const SEARCH_ORDER_CONFIG = {
    tire: {
      title: "タイヤ検索",
      labels: { category: "区分", brand: "ブランド", product: "商品名", inch: "インチ", size: "サイズ" },
      defaults: ["category", "brand", "product", "inch", "size"]
    },
    wheel: {
      title: "アルミ検索",
      labels: { maker: "メーカー", brand: "ブランド", pattern: "パターン", inch: "インチ", pcd: "PCD", size: "サイズ" },
      defaults: ["maker", "brand", "pattern", "inch", "pcd", "size"]
    }
  };
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
    sourceMeta: loadJson(SOURCE_META_KEY, {}),
    imagePreviewUrls: {},
    selectedTire: null,
    selectedWheel: null,
    vehicles: [],
    vehicleLoadError: "",
    wheelSearchMode: "vehicle",
    vehicleQuery: "",
    vehicleSelection: { maker: "", model: "", vehicleId: "", year: "", tire: "" },
    tireInch: "",
    tireCategory: "",
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
    clearSummerTire: $("#clearSummerTire"),
    clearWinterTire: $("#clearWinterTire"),
    clearBsWheel: $("#clearBsWheel"),
    clearOtherWheel: $("#clearOtherWheel"),
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
    tireCategoryChips: $("#tireCategoryChips"),
    tireChoicePanel: $("#tireChoicePanel"),
    tireBrandChips: $("#tireBrandChips"),
    tireProductChips: $("#tireProductChips"),
    tireInchChips: $("#tireInchChips"),
    tireSizeChips: $("#tireSizeChips"),
    tireSearchSummary: $("#tireSearchSummary"),
    tireResults: $("#tireResults"),
    wheelMaker: $("#wheelMaker"),
    wheelBrand: $("#wheelBrand"),
    wheelPattern: $("#wheelPattern"),
    wheelInch: $("#wheelInch"),
    wheelSize: $("#wheelSize"),
    wheelColor: $("#wheelColor"),
    wheelPcd: $("#wheelPcd"),
    wheelLimit: $("#wheelLimit"),
    wheelMakerChips: $("#wheelMakerChips"),
    wheelBrandChips: $("#wheelBrandChips"),
    wheelPatternChips: $("#wheelPatternChips"),
    wheelInchChips: $("#wheelInchChips"),
    wheelSizeChips: $("#wheelSizeChips"),
    wheelPcdChips: $("#wheelPcdChips"),
    wheelSearchSummary: $("#wheelSearchSummary"),
    wheelChoicePanel: $("#wheelChoicePanel"),
    wheelResults: $("#wheelResults"),
    vehicleChoicePanel: $("#vehicleChoicePanel"),
    sharedVehicleSearch: $("#sharedVehicleSearch"),
    sharedVehicleSummary: $("#sharedVehicleSummary"),
    vehicleModelSearch: $("#vehicleModelSearch"),
    clearVehicleModelSearch: $("#clearVehicleModelSearch"),
    clearVehicleSelection: $("#clearVehicleSelection"),
    vehicleModelSearchStatus: $("#vehicleModelSearchStatus"),
    vehicleMakerChips: $("#vehicleMakerChips"),
    vehicleModelChips: $("#vehicleModelChips"),
    vehicleGenerationChips: $("#vehicleGenerationChips"),
    vehicleYearChips: $("#vehicleYearChips"),
    vehicleTireChips: $("#vehicleTireChips"),
    vehicleSummary: $("#vehicleSummary"),
    wheelAssistGrid: $("#wheelAssistGrid"),
    estimateItems: $("#estimateItems"),
    estimateCosts: $("#estimateCosts"),
    grandTotal: $("#grandTotal"),
    totalBreakdown: $("#totalBreakdown"),
    inchWarning: $("#inchWarning"),
    printEstimate: $("#printEstimate"),
    printPreviewScreen: $("#printPreviewScreen"),
    printPreviewPaper: $("#printPreviewPaper"),
    printPreviewRun: $("#printPreviewRun"),
    printPreviewClose: $("#printPreviewClose"),
    printTireTitle: $("#printTireTitle"),
    printTireItems: $("#printTireItems"),
    printWheelTitle: $("#printWheelTitle"),
    printWheelItems: $("#printWheelItems"),
    printDetailItems: $("#printDetailItems"),
    printGrandTotal: $("#printGrandTotal"),
    printDate: $("#printDate"),
    printShopName: $("#printShopName"),
    printShopAddress: $("#printShopAddress"),
    printShopTel: $("#printShopTel"),
    printNoteText: $("#printNoteText"),
    registeredImageCount: $("#registeredImageCount"),
    missingImageCount: $("#missingImageCount"),
    patternCount: $("#patternCount"),
    imageList: $("#imageList"),
    exportImageDb: $("#exportImageDb"),
    clearEstimate: $("#clearEstimate"),
    resetData: $("#resetData"),
    refreshCache: $("#refreshCache"),
    shopName: $("#shopName"),
    shopAddress: $("#shopAddress"),
    shopTel: $("#shopTel"),
    quoteNote: $("#quoteNote"),
    taxRate: $("#taxRate"),
    rounding: $("#rounding"),
    tireAddition: $("#tireAddition"),
    defaultRate: $("#defaultRate"),
    wheelMarkup: $("#wheelMarkup"),
    wheelPricingMode: $("#wheelPricingMode"),
    wheelImageDisplay: $("#wheelImageDisplay"),
    imageManagerDisplay: $("#imageManagerDisplay"),
    imageManagerSection: $("#imageManagerSection"),
    wheelBrandDiscountGrid: $("#wheelBrandDiscountGrid"),
    searchOrderSettings: $("#searchOrderSettings"),
    bsRateLabels: $("#bsRateLabels"),
    bsBrandRateLabels: $("#bsBrandRateLabels"),
    wheelRatePreview: $("#wheelRatePreview"),
    sourceBadges: {
      summerTire: $("#summerTireSourceBadge"),
      winterTire: $("#winterTireSourceBadge"),
      bsWheel: $("#bsWheelSourceBadge"),
      otherWheel: $("#otherWheelSourceBadge"),
      imageDb: $("#imageDbSourceBadge")
    },
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
    updateRatePreview();
    renderLaborCategorySettings();
    renderPrintOptionSettings();
    renderWheelBrandDiscountSettings();
    renderSearchOrderSettings();
    applySearchOrder("tire");
    applySearchOrder("wheel");
    refreshActiveProducts();
    populateTireBrands();
    renderTires();
    renderWheels();
    renderEstimate();
    renderImageManager();
    updateImageManagerVisibility();
    renderSourceStatus();
    restoreBundledImageDb();
    restoreBundledVehicleDb();
    registerServiceWorker();
  }

  function bindEvents() {
    $$(".tab").forEach(button => button.addEventListener("click", () => switchTab(button.dataset.tab)));
    els.summerTireFileSetting.addEventListener("change", event => event.target.files[0] && importTireFile(event.target.files[0], "summer"));
    els.winterTireFileSetting.addEventListener("change", event => event.target.files[0] && importTireFile(event.target.files[0], "winter"));
    els.bsWheelFileSetting.addEventListener("change", event => event.target.files[0] && importWheelFile(event.target.files[0], "bs"));
    els.otherWheelFileSetting.addEventListener("change", event => event.target.files[0] && importWheelFile(event.target.files[0], "other"));
    els.clearSummerTire.addEventListener("click", () => clearSourceData("summerTire"));
    els.clearWinterTire.addEventListener("click", () => clearSourceData("winterTire"));
    els.clearBsWheel.addEventListener("click", () => clearSourceData("bsWheel"));
    els.clearOtherWheel.addEventListener("click", () => clearSourceData("otherWheel"));
    [els.imageDbFile, els.imageDbFileSetting].filter(Boolean).forEach(input => input.addEventListener("change", event => event.target.files[0] && importImageDb(event.target.files[0])));
    [els.tireBrand, els.tireProduct, els.tireSize, els.tireLimit].forEach(input => input.addEventListener("input", renderTires));
    [els.wheelMaker, els.wheelBrand, els.wheelPattern, els.wheelInch, els.wheelPcd, els.wheelSize, els.wheelColor, els.wheelLimit].forEach(input => input.addEventListener("input", renderWheels));
    [els.useSummerTire, els.useWinterTire].forEach(input => input.addEventListener("change", () => { refreshActiveProducts(); renderTires(); }));
    [els.useBsWheel, els.useOtherWheel].forEach(input => input.addEventListener("change", () => { refreshActiveProducts(); renderWheels(); }));
    [els.tireCategoryChips, els.tireBrandChips, els.tireProductChips, els.tireInchChips, els.tireSizeChips].forEach(container => container.addEventListener("click", handleTireChipClick));
    [els.wheelMakerChips, els.wheelBrandChips, els.wheelPatternChips, els.wheelInchChips, els.wheelSizeChips, els.wheelPcdChips].forEach(container => container.addEventListener("click", handleWheelChipClick));
    $$("[data-default-cost]").forEach(input => input.addEventListener("input", () => {
      state.settings.defaultCosts[input.dataset.defaultCost] = number(input.value);
      state.settings.costs[input.dataset.defaultCost] = number(input.value);
      saveSettings();
      renderEstimate();
    }));
    [els.taxRate, els.rounding, els.tireAddition, els.defaultRate, els.wheelMarkup, els.wheelPricingMode, els.wheelImageDisplay, els.imageManagerDisplay].forEach(input => input.addEventListener("input", () => {
      state.settings.taxRate = number(els.taxRate.value);
      state.settings.rounding = els.rounding.value;
      state.settings.tireAddition = number(els.tireAddition.value);
      state.settings.defaultRate = number(els.defaultRate.value) || 1;
      state.settings.wheelMarkup = number(els.wheelMarkup.value) || 0.9;
      state.settings.wheelPricingMode = els.wheelPricingMode.value || "divide";
      state.settings.wheelImageDisplay = els.wheelImageDisplay.value === "on";
      state.settings.imageManagerDisplay = els.imageManagerDisplay.value === "on";
      state.settings.wheelRateLabels = state.settings.wheelRateLabels || [];
      saveSettings();
      updateRatePreview();
      updateImageManagerVisibility();
      renderTires();
      renderWheels();
      renderEstimate();
    }));
    [els.shopName, els.shopAddress, els.shopTel, els.quoteNote].forEach(input => input.addEventListener("input", () => {
      state.settings.shop = {
        name: els.shopName.value,
        address: els.shopAddress.value,
        tel: els.shopTel.value
      };
      state.settings.quoteNote = els.quoteNote.value;
      saveSettings();
      renderPrintSheet(currentEstimateParts());
    }));
    els.setDiscountRate.addEventListener("input", () => {
      state.settings.setDiscountRate = number(els.setDiscountRate.value);
      saveSettings();
      renderEstimate();
    });
    els.wheelBrandDiscountGrid.addEventListener("input", event => {
      const input = event.target.closest("[data-wheel-brand-discount]");
      if (!input) return;
      state.settings.wheelBrandDiscounts[input.dataset.wheelBrandDiscount] = number(input.value);
      saveSettings();
      updateRatePreview();
      renderWheels();
      renderEstimate();
    });
    els.searchOrderSettings.addEventListener("click", event => {
      const button = event.target.closest("[data-search-order-move]");
      if (!button) return;
      moveSearchOrderItem(button.dataset.searchOrderType, button.dataset.searchOrderKey, button.dataset.searchOrderMove);
    });
    els.estimateCosts.addEventListener("change", event => {
      const input = event.target.closest("[data-estimate-cost-enabled]");
      if (!input) return;
      setEstimateCost(input.dataset.estimateCostEnabled, { enabled: input.checked });
      saveSettings();
      renderEstimate();
    });
    els.estimateCosts.addEventListener("input", event => {
      const input = event.target.closest("[data-estimate-cost-amount]");
      if (!input) return;
      setEstimateCost(input.dataset.estimateCostAmount, { amount: number(input.value), manual: true });
      saveSettings();
      renderEstimate(input.dataset.estimateCostAmount);
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
    els.printEstimate.addEventListener("click", printEstimateSheet);
    els.printPreviewRun.addEventListener("click", () => window.print());
    els.printPreviewClose.addEventListener("click", closePrintPreview);
    window.addEventListener("afterprint", closePrintPreview);
    els.clearEstimate.addEventListener("click", () => {
      state.selectedTire = null;
      state.selectedWheel = null;
      setEstimateCost("nuts", { manual: false, amount: 0 });
      saveSettings();
      renderTires();
      renderWheels();
      renderEstimate();
    });
    els.resetData.addEventListener("click", resetAllData);
    els.refreshCache.addEventListener("click", refreshCache);
    els.imageList.addEventListener("change", handleImagePick);
    els.imageList.addEventListener("click", handleImageListClick);
    els.wheelResults.addEventListener("click", handleWheelResultClick);
    $$('[data-wheel-search-mode]').forEach(button => button.addEventListener("click", () => setWheelSearchMode(button.dataset.wheelSearchMode)));
    els.vehicleChoicePanel.addEventListener("click", handleVehicleChipClick);
    els.vehicleModelSearch.addEventListener("input", handleVehicleModelSearch);
    els.clearVehicleModelSearch.addEventListener("click", () => {
      els.vehicleModelSearch.value = "";
      handleVehicleModelSearch({ target: els.vehicleModelSearch });
      els.vehicleModelSearch.focus();
    });
    els.clearVehicleSelection.addEventListener("click", clearVehicleSelection);
    els.closeImageDialog.addEventListener("click", () => els.imageDialog.close());
  }

  function switchTab(tab) {
    $$(".tab").forEach(button => button.classList.toggle("active", button.dataset.tab === tab));
    $$(".panel").forEach(panel => panel.classList.toggle("active", panel.id === `tab-${tab}`));
    els.sharedVehicleSearch.hidden = !["tire", "wheel"].includes(tab);
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
      saveSourceMeta(sourceKeyForTire(tireType), { status: "error", fileName: file.name, count: 0, message: "対応形式は .xlsx / .xlsm です。" });
      return;
    }
    const sourceKey = sourceKeyForTire(tireType);
    saveSourceMeta(sourceKey, { status: "loading", fileName: file.name, count: 0, message: "Excelを解析しています。" });
    setMessage(els.tireStatus, `${file.name} を解析しています。`);
    try {
      const buffer = await file.arrayBuffer();
      const catalog = await window.CatalogParser.parse(buffer);
      const label = tireType === "winter" ? "冬タイヤ" : "夏タイヤ";
      const data = catalog.products
        .filter(item => item.brand && item.size && Number(item.cost) > 0)
        .map(item => ({ ...item, sourceType: tireType, sourceLabel: label, id: stableId([tireType, item.brand, item.subbrand, item.size, item.code, item.cost]) }));
      if (!data.length) {
        const wheelLike = looksLikeWheelWorkbook(buffer);
        const sheets = catalog.sheets?.join("、") || "不明";
        throw new Error(wheelLike
          ? "このファイルはタイヤ価格表ではなく、アルミ価格表の形式です。BSアルミ価格表読み込みへ入れてください。"
          : `タイヤ商品を抽出できませんでした。必要なシートまたは価格列が見つかりません。検出シート：${sheets}`);
      }
      if (tireType === "winter") {
        state.winterTireWorkbook = { fileName: file.name, loadedAt: new Date().toISOString(), sheetCount: catalog.sheets?.length || 0 };
        state.winterTireData = data;
        localStorage.setItem(WINTER_TIRE_KEY, JSON.stringify(data));
      } else {
        state.summerTireWorkbook = { fileName: file.name, loadedAt: new Date().toISOString(), sheetCount: catalog.sheets?.length || 0 };
        state.summerTireData = data;
        localStorage.setItem(SUMMER_TIRE_KEY, JSON.stringify(data));
      }
      saveSourceMeta(sourceKey, { status: "loaded", fileName: file.name, count: data.length, summary: summarizeTireData(data, catalog) });
      refreshActiveProducts();
      setMessage(els.tireStatus, `${label} ${file.name}：${data.length.toLocaleString("ja-JP")}件 / ${uniqueCount(data, item => item.size).toLocaleString("ja-JP")}サイズを読み込みました。他の価格表は保持しています。`);
      populateTireBrands();
      renderTireChips();
      renderTires();
      setSaved();
    } catch (error) {
      console.error(error);
      const message = friendlyError(error, "タイヤ価格表を読み込めませんでした。");
      setMessage(els.tireStatus, `${file.name} の読み込みに失敗しました。${message}`, true);
      saveSourceMeta(sourceKey, { status: "error", fileName: file.name, count: 0, message });
    }
  }

  async function importWheelFile(file, wheelType) {
    if (!/\.(xls|xlsx|xlsm)$/i.test(file.name)) {
      setMessage(els.wheelStatus, "対応形式は .xls / .xlsx / .xlsm です。", true);
      saveSourceMeta(sourceKeyForWheel(wheelType), { status: "error", fileName: file.name, count: 0, message: "対応形式は .xls / .xlsx / .xlsm です。" });
      return;
    }
    if (!window.XLSX?.read) {
      setMessage(els.wheelStatus, "アルミ価格表の読み込みライブラリを確認できません。", true);
      saveSourceMeta(sourceKeyForWheel(wheelType), { status: "error", fileName: file.name, count: 0, message: "読込ライブラリなし" });
      return;
    }
    const sourceKey = sourceKeyForWheel(wheelType);
    saveSourceMeta(sourceKey, { status: "loading", fileName: file.name, count: 0, message: "Excelを解析しています。" });
    setMessage(els.wheelStatus, `${file.name} を解析しています。`);
    try {
      const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, dense: false });
      const label = wheelType === "other" ? "社外アルミ" : "BSアルミ";
      const workbookInfo = { fileName: file.name, loadedAt: new Date().toISOString(), sheetCount: workbook.SheetNames?.length || 0 };
      const products = [];
      const rateLabels = [];
      const brandRates = [];
      const importSheetNames = wheelSheetNamesForImport(workbook, wheelType);
      importSheetNames.forEach(sheetName => {
        const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", blankrows: false, raw: true });
        rateLabels.push(...extractRateLabels(rows));
        brandRates.push(...extractBrandRateLabels(rows));
        products.push(...parseWheelRows(rows, { fileName: file.name, sheetName }));
      });
      const data = dedupe(products).map(item => normalizeWheelProduct(item, wheelType, label));
      if (!data.length) {
        throw new Error(`アルミ商品を抽出できませんでした。対応する見出し（ブランド名、パターン等、商品コード、チェーン店など）が見つかりません。検出シート：${(workbook.SheetNames || []).join("、") || "不明"}`);
      }
      if (wheelType === "other") {
        state.otherWheelWorkbook = workbookInfo;
        state.otherWheelData = data;
        localStorage.setItem(OTHER_WHEEL_KEY, JSON.stringify(data));
      } else {
        state.bsWheelWorkbook = workbookInfo;
        state.bsWheelData = data;
        state.settings.bsRateLabels = [...new Set(rateLabels)].sort((a, b) => number(a) - number(b));
        state.settings.bsBrandRateLabels = mergeBrandRateLabels(brandRates);
        saveSettings();
        localStorage.setItem(BS_WHEEL_KEY, JSON.stringify(data));
      }
      saveSourceMeta(sourceKey, { status: "loaded", fileName: file.name, count: data.length, summary: summarizeWheelData(data, workbook) });
      refreshActiveProducts();
      ensureImageMasterFromWheelPatterns();
      setMessage(els.wheelStatus, `${label} ${file.name}：${data.length.toLocaleString("ja-JP")}件 / ${uniqueCount(data, item => item.patternName).toLocaleString("ja-JP")}パターンを読み込みました。他の価格表は保持しています。`);
      renderWheelChips();
      renderWheels();
      renderImageManager();
      updateRatePreview();
      setSaved();
    } catch (error) {
      console.error(error);
      const message = friendlyError(error, "アルミ価格表を読み込めませんでした。");
      setMessage(els.wheelStatus, `${file.name} の読み込みに失敗しました。${message}`, true);
      saveSourceMeta(sourceKey, { status: "error", fileName: file.name, count: 0, message });
    }
  }

  function parseWheelRows(rows, source) {
    const winterWholesale = parseBsWinterWholesaleRows(rows, source);
    if (winterWholesale.length) return winterWholesale;
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

  function parseBsWinterWholesaleRows(rows, source) {
    const headerIndex = rows.findIndex(row => {
      const labels = (row || []).map(normalizeHeader);
      return labels.some(label => label.includes("ブランド名")) &&
        labels.some(label => label.includes("パターン等")) &&
        labels.some(label => label.includes("商品コード")) &&
        labels.some(label => label.includes("チェーン店") || label.startsWith("仕切"));
    });
    if (headerIndex < 0) return [];
    const header = rows[headerIndex] || [];
    const col = name => header.findIndex(cell => normalizeHeader(cell).includes(normalizeHeader(name)));
    const brandCol = col("ブランド名");
    const patternCol = col("パターン等");
    const codeCol = col("商品コード");
    const priceCol = header.findIndex(cell => {
      const label = normalizeHeader(cell);
      return label.includes("チェーン店") || label.startsWith("仕切");
    });
    if ([brandCol, patternCol, codeCol, priceCol].some(index => index < 0)) return [];
    const out = [];
    let activeBrandName = "";
    for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex] || [];
      const rowBrandName = cleanPattern(row[brandCol]);
      const sizeText = cleanPattern(row[patternCol]);
      const productCode = text(row[codeCol]);
      const price = firstPrice(row[priceCol]);
      if (rowBrandName) activeBrandName = rowBrandName;
      const brandName = rowBrandName || activeBrandName;
      if (!brandName || !looksWheelSize(sizeText) || !productCode || !price) continue;
      out.push({
        ...parseFitment(sizeText),
        productCode,
        maker: "BS",
        brandName,
        patternName: brandName,
        sizeText,
        color: colorFromBsSize(sizeText) || "—",
        insetText: wheelInsetText(insetFromText(sizeText)),
        basePrice: price,
        wholesalePrice: price,
        salePrice: wheelSalePrice({ wholesalePrice: price }),
        priceSource: "chainStore",
        priceRate: state.settings.wheelMarkup,
        sourceSheet: source.sheetName,
        sourceRow: rowIndex + 1
      });
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
    const insetText = wheelInsetText(get("inset") || insetFromText([rawPattern, sizeText].join(" ")));
    const fitment = parseFitment(get("holesPcdText") || rawPattern || sizeText);
    const maker = get("maker") || inferMaker(patternName, brandPattern, source.sheetName);
    const dealerCost = firstPrice(get("dealerCost"));
    const wholesalePrice1 = firstPrice(get("wholesalePrice"));
    const wholesalePrice2 = firstPrice(get("wholesalePrice2"));
    const chainStorePrice = firstPrice(get("chainStorePrice"));
    const wholesalePrice = firstPrice(dealerCost, wholesalePrice1, wholesalePrice2, chainStorePrice);
    const directSale = firstPrice(get("salePrice"));
    const listPrice = firstPrice(get("listPrice"));
    const base = wholesalePrice || directSale || listPrice;
    if (!patternName && !productCode) return null;
    if (!base && !sizeText && !color) return null;
    const salePrice = wheelSalePrice({ wholesalePrice, directSalePrice: directSale });
    return {
      productCode,
      maker,
      brandName: get("brandName"),
      patternName: patternName || "—",
      sizeText: sizeText || "—",
      color: color || "—",
      insetText,
      holes: fitment.holes,
      pcd: fitment.pcd,
      holesPcdText: fitment.label,
      basePrice: wholesalePrice || listPrice || directSale,
      dealerCost,
      listPrice,
      directSalePrice: directSale,
      wholesalePrice: wholesalePrice || 0,
      salePrice: salePrice || 0,
      priceSource: "wholesale",
      priceRate: state.settings.wheelMarkup,
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
      inset: ["インセット", "オフセット", "INSET", "OFFSET", "ET", "IS"],
      color: ["カラー", "色"],
      colorDescription: ["カラー解説", "カラー説明", "色解説"],
      holesPcdText: ["孔数/PCD", "孔数 PCD", "穴数/PCD", "H/PCD", "HOLE/PCD"],
      maker: ["メーカー名", "メーカー", "取扱会社名"],
      listPrice: ["25年定価", "定価", "希望小売価格"],
      dealerCost: ["販社仕切", "販社仕切価格", "仕切価格"],
      chainStorePrice: ["チェーン店", "チェーン店価格", "BTS"],
      salePrice: ["直営店価格", "販売価格", "売価案", "売価"],
      wholesalePrice: ["①卸価格", "卸価格1", "卸価格①", "卸価格", "仕切り", "仕切価格", "仕切り価格"],
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
        basePrice: price,
        wholesalePrice: price,
        salePrice: wheelSalePrice({ wholesalePrice: price }),
        priceSource: "wholesale",
        priceRate: state.settings.wheelMarkup,
        sourceSheet: source.sheetName,
        sourceRow: rowIndex + 1
      });
    }
    return out;
  }

  function normalizeWheelProduct(item, wheelType, label) {
    if (wheelType === "bs") {
      const split = splitBsWheelName(item.patternName || item.brandName);
      const maker = "BS";
      const brandName = split.brand || "BS";
      const patternName = split.pattern || item.patternName || "—";
      const fullPatternName = split.fullName || [brandName, patternName].filter(Boolean).join(" ");
      const salePrice = wheelSalePrice(item);
      return {
        ...item,
        maker,
        brandName,
        patternName,
        fullPatternName,
        insetText: item.insetText || wheelInsetText(insetFromText(item.sizeText)),
        salePrice,
        sourceType: wheelType,
        sourceLabel: label,
        id: stableId([wheelType, item.productCode, maker, brandName, patternName, item.sizeText, item.insetText, item.color, item.holes, item.pcd])
      };
    }
    const maker = item.maker || "その他";
    const brandName = item.brandName || item.patternName || "—";
    const patternName = item.patternName || "—";
    return {
      ...item,
      maker,
      brandName,
      patternName,
      fullPatternName: [brandName, patternName].filter(Boolean).join(" "),
      insetText: item.insetText || wheelInsetText(insetFromText(item.sizeText)),
      sourceType: wheelType,
      sourceLabel: label,
      id: stableId([wheelType, item.productCode, maker, brandName, patternName, item.sizeText, item.insetText, item.color, item.holes, item.pcd])
    };
  }

  function splitBsWheelName(value) {
    const fullName = cleanPattern(value);
    const normalized = fullName.normalize("NFKC").toUpperCase();
    const brands = ["BALMINUM", "ECO FORME", "TOPRUN", "POTENZA", "SUVENCER", "PREO"];
    const brand = brands.find(name => normalized === name || normalized.startsWith(`${name} `));
    if (!brand) return { brand: "", pattern: fullName, fullName };
    const pattern = fullName.slice(brand.length).replace(/^[\s　-]+/, "").trim();
    return { brand, pattern: pattern || brand, fullName };
  }

  function renderTires() {
    const brand = els.tireBrand.value;
    const product = norm(els.tireProduct.value);
    const size = norm(els.tireSize.value);
    const tireInch = state.tireInch;
    const tireCategory = state.tireCategory;
    const limit = number(els.tireLimit.value) || 30;
    const selectedVehicle = currentVehicle();
    const selectedOemTire = state.vehicleSelection.tire;
    const filtered = state.tireProducts
      .filter(isPricedTire)
      .filter(item => !selectedVehicle || !selectedOemTire || sameTireSize(tireDisplaySize(item), selectedOemTire))
      .filter(item => !brand || item.brand === brand)
      .filter(item => !tireCategory || (item.productCategory || "normal") === tireCategory)
      .filter(item => !product || norm(`${item.subbrand} ${item.code}`).includes(product))
      .filter(item => !tireInch || String(item.inch) === String(tireInch))
      .filter(item => !size || norm(tireDisplaySize(item)).includes(size))
      .sort(compareTireSalePrice)
      .slice(0, limit);
    renderTireChips();
    els.tireSearchSummary.textContent = summaryText([selectedVehicle && vehicleSearchSummary(selectedVehicle), sourceSummary([els.useSummerTire.checked && "夏", els.useWinterTire.checked && "冬"], "タイヤ"), tireCategoryLabel(tireCategory), tireBrandDisplayName(brand), els.tireProduct.value, tireInch && `${tireInch}インチ`, els.tireSize.value]);
    if (!state.tireProducts.length) {
      els.tireResults.innerHTML = emptyCard("管理タブでタイヤ価格表を読み込んでください。");
      return;
    }
    els.tireResults.innerHTML = filtered.map(item => tireCard(item)).join("") || emptyCard(selectedVehicle && selectedOemTire ? `純正サイズ ${selectedOemTire} の価格登録済みタイヤがありません。` : "条件に合う価格登録済みタイヤがありません。");
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
    const tireCategory = state.tireCategory;
    const selectedVehicle = currentVehicle();
    const selectedOemTire = state.vehicleSelection.tire;
    const categoryFiltered = state.tireProducts.filter(isPricedTire)
      .filter(item => !selectedVehicle || !selectedOemTire || sameTireSize(tireDisplaySize(item), selectedOemTire))
      .filter(item => !tireCategory || (item.productCategory || "normal") === tireCategory);
    const brands = [...new Set(categoryFiltered.map(item => item.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));
    const brandFiltered = categoryFiltered.filter(item => !brand || item.brand === brand);
    const productFiltered = brandFiltered.filter(item => !product || norm(`${item.subbrand} ${item.code}`).includes(product));
    const inchFiltered = productFiltered.filter(item => !inch || String(item.inch) === String(inch));
    const products = [...new Set(brandFiltered.map(item => item.subbrand).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja")).slice(0, 36);
    const inches = [...new Set(productFiltered.map(item => item.inch).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
    const sizes = [...new Set(inchFiltered.map(item => tireDisplaySize(item)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja")).slice(0, 48);
    els.tireCategoryChips.innerHTML = chips("tire", "category", ["乗用タイヤ", "OEM", "VAN"], tireCategoryLabel(tireCategory));
    els.tireBrandChips.innerHTML = chips("tire", "brand", brands, brand, tireBrandDisplayName);
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
    if (button.dataset.filter === "category") {
      state.tireCategory = tireCategoryKey(value);
      els.tireBrand.value = "";
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
    openNextSearchStep("tire", button.dataset.filter);
  }

  function tireCard(item) {
    const single = tireSalePrice(item);
    const selected = state.selectedTire?.id === item.id;
    return `<article class="card">
      <span class="source-badge">${escapeHtml(item.sourceLabel || "タイヤ")}</span>
      <h3>${escapeHtml(tireBrandDisplayName(item.brand))} ${escapeHtml(item.subbrand || "")}</h3>
      <p class="card-meta">${escapeHtml(tireDisplaySize(item))}<br>商品コード：${escapeHtml(item.code || "—")}</p>
      <div class="price-row">
        <div><span>1本税込</span><strong>${yen(single)}</strong></div>
        <div><span>4本税込</span><strong>${yen(single * 4)}</strong></div>
      </div>
      <button class="select-button" data-tire-id="${escapeHtml(item.id)}">${selected ? "選択中" : "セット見積に選択"}</button>
    </article>`;
  }

  async function restoreBundledVehicleDb() {
    if (!window.VehicleFitment) {
      state.vehicleLoadError = "車両判定モジュールを読み込めませんでした。";
      renderWheels();
      return;
    }
    try {
      const response = await fetch("data/vehicles_2012_2026.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      state.vehicles = window.VehicleFitment.normalizeDataset(payload);
      renderVehicleChips();
      renderTires();
      renderWheels();
    } catch (error) {
      console.error(error);
      state.vehicleLoadError = "車両DBを読み込めませんでした。管理者に確認してください。";
      renderWheels();
    }
  }

  function setWheelSearchMode(mode) {
    state.wheelSearchMode = mode === "wheel" ? "wheel" : "vehicle";
    $$('[data-wheel-search-mode]').forEach(button => button.classList.toggle("active", button.dataset.wheelSearchMode === state.wheelSearchMode));
    els.wheelChoicePanel.hidden = state.wheelSearchMode !== "wheel";
    els.wheelAssistGrid.hidden = state.wheelSearchMode !== "wheel";
    renderWheels();
  }

  function currentVehicle() {
    return state.vehicles.find(vehicle => vehicle.vehicle_id === state.vehicleSelection.vehicleId) || null;
  }

  function vehicleSearchSummary(vehicle) {
    if (!vehicle) return "車両未選択";
    return summaryText([displayVehicleMaker(vehicle.maker), vehicle.model, vehicle.generation, state.vehicleSelection.year && `${state.vehicleSelection.year}年`, state.vehicleSelection.tire]);
  }

  function displayVehicleMaker(maker) {
    return maker === "SUBARU" ? "スバル" : maker;
  }

  function vehicleModelAliases(model) {
    const known = {
      "ノア/ヴォクシー": ["ノア", "ヴォクシー"],
      "ノア/ヴォクシー/エスクァイア": ["ノア", "ヴォクシー", "エスクァイア"],
      "アルファード/ヴェルファイア": ["アルファード", "ヴェルファイア"],
      "カローラ/ツーリング/スポーツ": ["カローラ", "カローラツーリング", "カローラスポーツ"],
      "カローラ/フィールダー/アクシオ": ["カローラ", "カローラフィールダー", "カローラアクシオ"],
      "デミオ/MAZDA2": ["デミオ", "MAZDA2"],
      "eKワゴン/eKクロス": ["eKワゴン", "eKクロス"],
      "eKワゴン/eKカスタム": ["eKワゴン", "eKカスタム"]
    };
    return known[model] || [model];
  }

  function vehicleChip(step, value, label, active) {
    return `<button type="button" class="choice-chip${active ? " active" : ""}" data-vehicle-filter="${escapeHtml(step)}" data-value="${escapeHtml(value)}">${escapeHtml(label)}</button>`;
  }

  function normalizeVehicleQuery(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60))
      .replace(/[\s\-‐‑‒–—―・_/]/g, "");
  }

  function vehicleMatchesQuery(vehicle, query) {
    if (!query) return true;
    return [vehicle.model, ...vehicleModelAliases(vehicle.model), vehicle.generation]
      .some(value => normalizeVehicleQuery(value).includes(query));
  }

  function handleVehicleModelSearch(event) {
    state.vehicleQuery = event.target.value || "";
    state.vehicleSelection = { maker: "", model: "", vehicleId: "", year: "", tire: "" };
    $$('[data-vehicle-step]').forEach(details => { details.open = details.dataset.vehicleStep === "maker"; });
    renderVehicleChips();
    renderTires();
    renderWheels();
  }

  function clearVehicleSelection() {
    state.vehicleQuery = "";
    state.vehicleSelection = { maker: "", model: "", vehicleId: "", year: "", tire: "" };
    els.vehicleModelSearch.value = "";
    renderVehicleChips();
    renderTires();
    renderWheels();
  }

  function renderVehicleChips() {
    const selection = state.vehicleSelection;
    const query = normalizeVehicleQuery(state.vehicleQuery);
    const matchingVehicles = state.vehicles.filter(vehicle => vehicleMatchesQuery(vehicle, query));
    const byMaker = matchingVehicles.filter(vehicle => !selection.maker || vehicle.maker === selection.maker);
    const byModel = byMaker.filter(vehicle => !selection.model || vehicleModelAliases(vehicle.model).includes(selection.model));
    const vehicle = currentVehicle();
    const makers = [...new Set(matchingVehicles.map(item => item.maker))].sort((a, b) => displayVehicleMaker(a).localeCompare(displayVehicleMaker(b), "ja"));
    const models = [...new Set(byMaker.flatMap(item => vehicleModelAliases(item.model)))].sort((a, b) => a.localeCompare(b, "ja"));
    els.vehicleMakerChips.innerHTML = makers.map(value => vehicleChip("maker", value, displayVehicleMaker(value), selection.maker === value)).join("");
    els.vehicleModelChips.innerHTML = models.map(value => vehicleChip("model", value, value, selection.model === value)).join("");
    els.vehicleModelSearchStatus.textContent = query
      ? `${matchingVehicles.length}世代・${models.length || [...new Set(matchingVehicles.flatMap(item => vehicleModelAliases(item.model)))].length}車種が該当`
      : "ひらがな・カタカナ・英数字で検索できます";
    els.vehicleGenerationChips.innerHTML = byModel.map(item => vehicleChip("generation", item.vehicle_id, item.generation, selection.vehicleId === item.vehicle_id)).join("");
    const years = vehicle ? window.VehicleFitment.years(vehicle) : [];
    els.vehicleYearChips.innerHTML = years.map(value => vehicleChip("year", String(value), `${value}年`, selection.year === String(value))).join("");
    const tires = vehicle ? window.VehicleFitment.tireSizes(vehicle) : [];
    els.vehicleTireChips.innerHTML = tires.map(value => vehicleChip("tire", value, value, selection.tire === value)).join("");
    if (vehicle && selection.year && selection.tire) {
      els.vehicleSummary.hidden = false;
      els.vehicleSummary.innerHTML = `<strong>${escapeHtml(displayVehicleMaker(vehicle.maker))} ${escapeHtml(vehicle.model)} / ${escapeHtml(vehicle.generation)}</strong><span>${escapeHtml(selection.year)}年・純正 ${escapeHtml(selection.tire)}</span><span>PCD ${escapeHtml(vehicle.pcd)} / ${escapeHtml(vehicle.holes)}穴 / ハブ径 ${escapeHtml(vehicle.hub_bore)}mm / ${escapeHtml(vehicle.fastener)} / 純正 ${escapeHtml(vehicle.oem_inch)}インチ</span>`;
    } else {
      els.vehicleSummary.hidden = true;
      els.vehicleSummary.innerHTML = "";
    }
    els.sharedVehicleSummary.textContent = vehicleSearchSummary(vehicle);
    els.clearVehicleSelection.hidden = !selection.maker && !state.vehicleQuery;
  }

  function handleVehicleChipClick(event) {
    const button = event.target.closest("[data-vehicle-filter]");
    if (!button) return;
    const step = button.dataset.vehicleFilter;
    const value = button.dataset.value || "";
    if (step === "maker") state.vehicleSelection = { maker: value, model: "", vehicleId: "", year: "", tire: "" };
    if (step === "model") state.vehicleSelection = { ...state.vehicleSelection, model: value, vehicleId: "", year: "", tire: "" };
    if (step === "generation") state.vehicleSelection = { ...state.vehicleSelection, vehicleId: value, year: "", tire: "" };
    if (step === "year") state.vehicleSelection = { ...state.vehicleSelection, year: value, tire: "" };
    if (step === "tire") state.vehicleSelection = { ...state.vehicleSelection, tire: value };
    renderVehicleChips();
    const steps = ["maker", "model", "generation", "year", "tire"];
    const next = steps[steps.indexOf(step) + 1];
    if (next) {
      $$('[data-vehicle-step]').forEach(details => { details.open = details.dataset.vehicleStep === next; });
    }
    renderTires();
    renderWheels();
  }

  function renderWheels() {
    const maker = norm(els.wheelMaker.value);
    const brand = norm(els.wheelBrand.value);
    const pattern = norm(els.wheelPattern.value);
    const inch = norm(els.wheelInch.value).replace(/インチ/g, "");
    const size = norm(els.wheelSize.value);
    const color = norm(els.wheelColor.value);
    const pcd = norm(els.wheelPcd.value);
    const limit = number(els.wheelLimit.value) || 30;
    const selectedVehicle = currentVehicle();
    const baseFiltered = state.wheelProducts
      .filter(isPricedWheel)
      .filter(item => !maker || norm(item.maker).includes(maker))
      .filter(item => !brand || norm(item.brandName).includes(brand))
      .filter(item => !pattern || norm(item.patternName).includes(pattern))
      .filter(item => !inch || String(wheelInch(item.sizeText)) === inch)
      .filter(item => !pcd || norm(wheelFitmentKey(item)).includes(pcd))
      .filter(item => !size || norm(wheelSizeGroup(item.sizeText)).includes(size))
      .filter(item => !color || norm(item.color).includes(color));
    const assessed = baseFiltered.map(item => ({ item, fitment: state.wheelSearchMode === "vehicle" && selectedVehicle
      ? window.VehicleFitment.evaluate(selectedVehicle, item, state.vehicleSelection.tire)
      : null }));
    const visible = assessed
      .filter(entry => !entry.fitment || (hasMinimumWheelFitment(entry.item) && entry.fitment.status !== "excluded"))
      .sort((a, b) => compareWheelSalePrice(a.item, b.item))
      .slice(0, limit);
    if (state.wheelSearchMode === "wheel") renderWheelChips();
    els.wheelSearchSummary.textContent = state.wheelSearchMode === "vehicle"
      ? vehicleSearchSummary(selectedVehicle)
      : summaryText([sourceSummary([els.useBsWheel.checked && "BS", els.useOtherWheel.checked && "社外"], "アルミ"), els.wheelMaker.value, els.wheelBrand.value, els.wheelPattern.value, els.wheelInch.value && `${els.wheelInch.value.replace(/インチ/g, "")}インチ`, els.wheelPcd.value && `PCD ${els.wheelPcd.value}`, els.wheelSize.value]);
    if (!state.wheelProducts.length) {
      els.wheelResults.innerHTML = emptyCard("管理タブでアルミ価格表を読み込んでください。");
      return;
    }
    if (state.wheelSearchMode === "vehicle" && !selectedVehicle) {
      els.wheelResults.innerHTML = emptyCard(state.vehicleLoadError || "メーカーから順に車両を選択してください。");
      return;
    }
    els.wheelResults.innerHTML = visible.map(entry => wheelCard(entry.item)).join("") || emptyCard("基本条件を満たす価格登録済みアルミホイールがありません。");
  }

  function renderWheelChips() {
    if (!els.wheelMakerChips) return;
    const maker = norm(els.wheelMaker.value);
    const brand = norm(els.wheelBrand.value);
    const pattern = norm(els.wheelPattern.value);
    const inch = norm(els.wheelInch.value).replace(/インチ/g, "");
    const size = norm(els.wheelSize.value);
    const pcd = norm(els.wheelPcd.value);
    const pricedWheels = state.wheelProducts.filter(isPricedWheel);
    const makerFiltered = pricedWheels.filter(item => !maker || norm(item.maker).includes(maker));
    const brandFiltered = makerFiltered.filter(item => !brand || norm(item.brandName).includes(brand));
    const patternFiltered = brandFiltered.filter(item => !pattern || norm(item.patternName).includes(pattern));
    const inchFiltered = patternFiltered.filter(item => !inch || String(wheelInch(item.sizeText)) === inch);
    const pcdFiltered = inchFiltered.filter(item => !pcd || norm(wheelFitmentKey(item)).includes(pcd));
    const makers = [...new Set(pricedWheels.map(item => item.maker).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja")).slice(0, 24);
    const brands = [...new Set(makerFiltered.map(item => item.brandName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja")).slice(0, 36);
    const patterns = [...new Set(brandFiltered.map(item => item.patternName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja")).slice(0, 40);
    const inches = PRIMARY_WHEEL_INCHES;
    const pcds = [...new Set(inchFiltered.map(item => wheelFitmentKey(item)).filter(Boolean))].sort(compareWheelFitments).slice(0, 32);
    const sizes = inch ? [...new Set(pcdFiltered.map(item => wheelSizeGroup(item.sizeText)).filter(Boolean))].sort(compareWheelSizeGroups).slice(0, 48) : [];
    els.wheelMakerChips.innerHTML = chips("wheel", "maker", makers, els.wheelMaker.value);
    els.wheelBrandChips.innerHTML = chips("wheel", "brand", brands, els.wheelBrand.value);
    els.wheelPatternChips.innerHTML = chips("wheel", "pattern", patterns, els.wheelPattern.value);
    els.wheelInchChips.innerHTML = chips("wheel", "inch", inches.map(value => `${value}インチ`), inch && `${inch}インチ`);
    els.wheelPcdChips.innerHTML = chips("wheel", "pcd", pcds, els.wheelPcd.value);
    els.wheelSizeChips.innerHTML = chips("wheel", "size", sizes, els.wheelSize.value);
  }

  function handleWheelChipClick(event) {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    const value = button.dataset.value || "";
    if (button.dataset.filter === "maker") {
      els.wheelMaker.value = value;
      els.wheelBrand.value = "";
      els.wheelPattern.value = "";
      els.wheelInch.value = "";
      els.wheelPcd.value = "";
      els.wheelSize.value = "";
      els.wheelColor.value = "";
    }
    if (button.dataset.filter === "brand") {
      els.wheelBrand.value = value;
      els.wheelPattern.value = "";
      els.wheelInch.value = "";
      els.wheelPcd.value = "";
      els.wheelSize.value = "";
    }
    if (button.dataset.filter === "pattern") {
      els.wheelPattern.value = value;
      els.wheelInch.value = "";
      els.wheelPcd.value = "";
      els.wheelSize.value = "";
      els.wheelColor.value = "";
    }
    if (button.dataset.filter === "inch") {
      els.wheelInch.value = value.replace(/インチ/g, "");
      els.wheelPcd.value = "";
      els.wheelSize.value = "";
      els.wheelColor.value = "";
    }
    if (button.dataset.filter === "pcd") {
      els.wheelPcd.value = value;
      els.wheelSize.value = "";
    }
    if (button.dataset.filter === "size") els.wheelSize.value = value;
    renderWheels();
    openNextSearchStep("wheel", button.dataset.filter);
  }

  function wheelCard(item) {
    const image = findImage(item.fullPatternName || [item.brandName, item.patternName].filter(Boolean).join(" ") || item.patternName);
    const selected = state.selectedWheel?.id === item.id;
    const salePrice = wheelSalePrice(item);
    const showImage = Boolean(state.settings.wheelImageDisplay);
    const imageHtml = image?.src
      ? `<button data-preview-src="${escapeHtml(image.src)}" data-preview-alt="${escapeHtml(item.fullPatternName || item.patternName)}"><img src="${escapeHtml(image.src)}" alt="${escapeHtml(item.fullPatternName || item.patternName)}" onerror="this.closest('.wheel-image').textContent='画像なし'"></button>`
      : "画像なし";
    return `<article class="card">
      <span class="source-badge">${escapeHtml(item.sourceLabel || "アルミ")}</span>
      ${showImage ? `<div class="wheel-image">${imageHtml}</div>` : ""}
      <h3>${escapeHtml([item.brandName, item.patternName].filter(Boolean).join(" "))}</h3>
      <p class="card-meta">${escapeHtml(item.maker || "—")}<br>${escapeHtml(wheelDisplayDetails(item))}<br>商品コード：${escapeHtml(wheelProductCode(item))}</p>
      <div class="price-row">
        <div><span>販売価格</span><strong>${priceText(salePrice)}</strong></div>
        <div><span>4本合計</span><strong>${salePrice ? yen(salePrice * 4) : "—"}</strong></div>
        ${showImage ? `<div><span>画像</span><strong>${image?.entry?.imageFile ? "登録済み" : "画像なし"}</strong></div>` : ""}
      </div>
      <button class="select-button" data-wheel-id="${escapeHtml(item.id)}">${selected ? "選択中" : "セット見積に選択"}</button>
    </article>`;
  }

  function displayWheelSize(item = {}) {
    const size = text(item.sizeText) || "—";
    const fitment = item.holes && item.pcd ? `${item.holes}/${item.pcd}` : "";
    return [size, fitment].filter(Boolean).join(" ");
  }

  function wheelDisplayDetails(item = {}) {
    const inset = wheelInsetValue(item);
    return [displayWheelSize(item), inset && `インセット ${inset}`, item.color || "—"].filter(Boolean).join(" / ");
  }

  function wheelInsetValue(item = {}) {
    return wheelInsetText(item.insetText || insetFromText(item.sizeText));
  }

  function wheelInsetText(value) {
    const raw = text(value).normalize("NFKC").replace(/^INSET\s*/i, "").replace(/^OFFSET\s*/i, "").replace(/^ET\s*/i, "");
    if (!raw || raw === "—") return "";
    const match = raw.match(/[+-]?\d+(?:\.\d+)?/);
    return match ? match[0] : raw;
  }

  function insetFromText(value) {
    const normalized = text(value).normalize("NFKC").toUpperCase();
    const explicit = normalized.match(/(?:INSET|OFFSET|ET|インセット|オフセット)\s*([+-]?\d+(?:\.\d+)?)/);
    if (explicit) return explicit[1];
    const afterPcd = normalized.match(/\b(?:100|110|112|114\.3|114|120|139\.7|139)\s+([+-]?\d{1,3})(?=\s|$)/);
    return afterPcd ? afterPcd[1] : "";
  }

  function wheelFitmentKey(item = {}) {
    return item.holes && item.pcd ? `${item.holes}/${item.pcd}` : "";
  }

  function wheelProductCode(item = {}) {
    return text(item.productCode) || "—";
  }

  function compareWheelFitments(a, b) {
    const parse = value => String(value || "").split("/").map(Number);
    const [ah, ap] = parse(a);
    const [bh, bp] = parse(b);
    return (ah - bh) || (ap - bp) || String(a).localeCompare(String(b), "ja");
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
      setEstimateCost("nuts", { manual: false, amount: autoNutTotal() });
      saveSettings();
      renderWheels();
      renderEstimate();
      switchTab("estimate");
    }
  }

  function renderEstimate(focusCostKey = "") {
    const tireSingle = state.selectedTire ? tireSalePrice(state.selectedTire) : 0;
    const wheelSingle = state.selectedWheel ? wheelSalePrice(state.selectedWheel) : 0;
    const labor = currentLabor();
    syncEstimateCostDefaults(labor);
    const costLines = estimateCostLines(labor);
    const workTotal = estimateCostGroupTotal("work", costLines);
    const optionTotal = estimateCostGroupTotal("option", costLines);
    const total = tireSingle * 4 + wheelSingle * 4 + workTotal + optionTotal;
    const mismatch = inchMismatch();
    els.estimateItems.innerHTML = `
      <dt>選択中のタイヤ</dt><dd>${state.selectedTire ? escapeHtml(`${tireBrandDisplayName(state.selectedTire.brand)} ${state.selectedTire.subbrand} ${tireDisplaySize(state.selectedTire)}`) : "未選択"}</dd>
      <dt>タイヤ1本価格</dt><dd>${yen(tireSingle)}</dd>
      <dt>タイヤ4本価格</dt><dd>${yen(tireSingle * 4)}</dd>
      <dt>選択中のアルミ</dt><dd>${state.selectedWheel ? escapeHtml(`${state.selectedWheel.maker} ${state.selectedWheel.brandName || ""} ${state.selectedWheel.patternName} ${wheelDisplayDetails(state.selectedWheel)}`) : "未選択"}</dd>
      <dt>アルミ商品コード</dt><dd>${state.selectedWheel ? escapeHtml(wheelProductCode(state.selectedWheel)) : "—"}</dd>
      <dt>アルミ1本価格</dt><dd>${yen(wheelSingle)}</dd>
      <dt>アルミ4本価格</dt><dd>${yen(wheelSingle * 4)}</dd>
      <dt>工賃</dt><dd>${yen(workTotal)}</dd>
      <dt>ナット代</dt><dd>${yen(estimateCostAmount("nuts", costLines))}</dd>
      <dt>その他費用</dt><dd>${yen(estimateCostAmount("other", costLines))}</dd>`;
    els.estimateCosts.innerHTML = costLines.map(line => estimateCostControl(line)).join("");
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
      els.totalBreakdown.textContent = `タイヤ ${yen(tireSingle * 4)} + アルミ ${yen(wheelSingle * 4)} + 工賃 ${yen(workTotal)} + その他 ${yen(optionTotal)}`;
      els.printEstimate.disabled = false;
    }
    renderPrintSheet({ tireSingle, wheelSingle, workTotal, optionTotal, costLines, total, mismatch });
    if (focusCostKey) {
      const input = els.estimateCosts.querySelector(`[data-estimate-cost-amount="${focusCostKey}"]`);
      if (input) {
        input.focus();
        try { input.setSelectionRange(input.value.length, input.value.length); } catch (_) {}
      }
    }
  }

  function renderPrintSheet({ tireSingle, wheelSingle, costLines, total, mismatch }) {
    const labor = currentLabor();
    syncEstimateCostDefaults(labor);
    const lines = costLines || estimateCostLines(labor);
    const shop = state.settings.shop || defaultShopInfo();
    const tireTitle = state.selectedTire ? `${tireBrandDisplayName(state.selectedTire.brand)} ${state.selectedTire.subbrand || ""}` : "未選択";
    const wheelTitle = state.selectedWheel ? `${state.selectedWheel.maker} ${state.selectedWheel.brandName || ""} ${state.selectedWheel.patternName || ""}` : "未選択";
    const tireRows = [
      ["ブランド", state.selectedTire ? tireBrandDisplayName(state.selectedTire.brand) : "—"],
      ["商品名", state.selectedTire?.subbrand || "—"],
      ["サイズ", state.selectedTire ? tireDisplaySize(state.selectedTire) : "—"],
      ["商品コード", state.selectedTire?.code || "—"],
      ["本数", "4本"],
      ["単価", tireSingle ? yen(tireSingle) : "—"],
      ["4本合計", tireSingle ? yen(tireSingle * 4) : "—"]
    ];
    const wheelRows = [
      ["メーカー", state.selectedWheel?.maker || "—"],
      ["ブランド", state.selectedWheel?.brandName || "—"],
      ["パターン", state.selectedWheel?.patternName || "—"],
      ["商品コード", state.selectedWheel ? wheelProductCode(state.selectedWheel) : "—"],
      ["サイズ", state.selectedWheel ? displayWheelSize(state.selectedWheel) : "—"],
      ["本数", "4本"],
      ["単価", wheelSingle ? yen(wheelSingle) : "—"],
      ["4本合計", wheelSingle ? yen(wheelSingle * 4) : "—"]
    ];
    const detailRows = lines.filter(row => row.enabled && state.settings.printOptions[row.printKey]);
    if (els.printTireTitle) els.printTireTitle.textContent = tireTitle.trim();
    if (els.printWheelTitle) els.printWheelTitle.textContent = wheelTitle.trim();
    if (els.printTireItems) els.printTireItems.innerHTML = tireRows.map(([label, value]) => printDefinition(label, value)).join("");
    if (els.printWheelItems) els.printWheelItems.innerHTML = wheelRows.map(([label, value]) => printDefinition(label, value)).join("");
    if (els.printDetailItems) {
      els.printDetailItems.innerHTML = detailRows.map(row => `
        <tr>
          <td>${escapeHtml(row.label)}</td>
          <td>${yen(row.unit)}</td>
          <td>${row.qty}</td>
          <td>${yen(row.total)}</td>
        </tr>
      `).join("");
    }
    if (els.printDate) els.printDate.textContent = `作成日：${new Date().toLocaleDateString("ja-JP")}`;
    if (els.printShopName) els.printShopName.textContent = shop.name || "タイヤ館 箕輪";
    if (els.printShopAddress) els.printShopAddress.textContent = shop.address || "長野県上伊那郡箕輪町大字三日町964-1";
    if (els.printShopTel) els.printShopTel.textContent = shop.tel ? `TEL ${shop.tel}` : "TEL 0265-98-9111";
    if (els.printNoteText) els.printNoteText.textContent = state.settings.quoteNote || "表示価格は税込です。有効期限・在庫状況は店頭にてご確認ください。";
    els.printGrandTotal.parentElement.hidden = !state.settings.printOptions.total;
    els.printGrandTotal.textContent = mismatch ? "サイズ確認" : `￥${Math.max(0, Math.round(total || 0)).toLocaleString("ja-JP")}`;
  }

  function printDefinition(label, value) {
    const className = label === "単価" ? " class=\"print-price-row\"" : label === "4本合計" ? " class=\"print-total-row\"" : "";
    return `<dt${className}>${escapeHtml(label)}</dt><dd${className}>${escapeHtml(value)}</dd>`;
  }

  function printEstimateSheet() {
    renderPrintSheet(currentEstimateParts());
    const sheetHtml = $("#printSheet")?.outerHTML || "";
    if (!sheetHtml) return;
    if (isIOSPrintTarget()) {
      showPrintPreview(sheetHtml);
      return;
    }
    const printHtml = printDocumentHtml(sheetHtml);
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(printHtml);
      printWindow.document.close();
      return;
    }
    showPrintPreview(sheetHtml);
  }

  function printDocumentHtml(sheetHtml) {
    return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title></title>
  <link rel="stylesheet" href="css/app.css?v=20260817-v166-labor-ceil10">
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: 210mm; height: 297mm; min-width: 0; margin: 0 !important; padding: 0 !important; overflow: hidden; background: #fff !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .print-sheet { display: block !important; width: 210mm; height: 297mm; min-height: 0 !important; margin: 0 !important; padding: 8mm !important; overflow: hidden; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
    .print-header { gap: 8px !important; }
    .print-heading span { font-size: 10pt !important; letter-spacing: 2px !important; }
    .print-heading strong { margin-top: 12px !important; font-size: 25pt !important; }
    .print-heading small { margin-top: 10px !important; font-size: 9pt !important; }
    .print-shop { gap: 4px !important; font-size: 8.5pt !important; }
    .print-shop strong { font-size: 13pt !important; }
    .print-rule { height: 2px !important; margin: 9px 0 !important; }
    .print-product-grid { gap: 8px !important; margin-bottom: 9px !important; }
    .print-product-box { padding: 8px 9px !important; border-radius: 10px !important; box-shadow: none !important; }
    .print-product-box > span { min-height: 20px !important; padding: 0 9px !important; font-size: 8pt !important; }
    .print-product-box h3 { margin: 7px 0 10px !important; font-size: 17pt !important; font-weight: 700 !important; line-height: 1.08 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
    .print-product-box dl { grid-template-columns: 23mm minmax(0, 1fr) !important; }
    .print-product-box dt, .print-product-box dd { padding: 3px 0 !important; font-size: 8pt !important; line-height: 1.22 !important; }
    .print-product-box dd.print-price-row { font-size: 8.7pt !important; }
    .print-product-box dd.print-total-row { font-size: 10pt !important; }
    .print-detail-table { margin: 8px 0 9px !important; font-size: 8.2pt !important; }
    .print-detail-table th, .print-detail-table td { padding: 5px 6px !important; }
    .print-detail-table td:last-child { font-size: 9pt !important; }
    .print-total { padding: 10px 13px !important; border-radius: 9px !important; }
    .print-total span { font-size: 13pt !important; }
    .print-total strong { font-size: 25pt !important; }
    .print-note { margin-top: 9px !important; padding: 9px !important; border-radius: 9px !important; }
    .print-note p { margin-top: 5px !important; font-size: 8.2pt !important; line-height: 1.4 !important; }
    .print-footer-message { margin-top: 8px !important; font-size: 7.8pt !important; }
    .print-product-box, .print-detail-table, .print-total, .print-note { break-inside: avoid; page-break-inside: avoid; }
    @media print {
      @page { size: A4 portrait; margin: 0; }
      html, body { width: 210mm; height: 297mm; margin: 0 !important; padding: 0 !important; overflow: hidden; }
      .print-sheet { margin: 0 !important; page-break-after: avoid; page-break-before: avoid; }
    }
  </style>
</head>
<body>
  ${sheetHtml}
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () {
        window.focus();
        window.print();
      }, 250);
    });
    window.addEventListener("afterprint", function () {
      setTimeout(function () { window.close(); }, 250);
    });
  <\/script>
</body>
</html>`;
  }

  function showPrintPreview(sheetHtml) {
    els.printPreviewPaper.innerHTML = sheetHtml;
    document.body.classList.add("print-preview-active");
    els.printPreviewScreen.hidden = false;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    setTimeout(() => {
      window.focus();
      window.print();
    }, 350);
  }

  function closePrintPreview() {
    if (!els.printPreviewScreen || els.printPreviewScreen.hidden) return;
    els.printPreviewScreen.hidden = true;
    els.printPreviewPaper.innerHTML = "";
    document.body.classList.remove("print-preview-active");
  }

  function isIOSPrintTarget() {
    const ua = navigator.userAgent || "";
    const platform = navigator.platform || "";
    const isiPadOS = platform === "MacIntel" && navigator.maxTouchPoints > 1;
    return /iPad|iPhone|iPod/.test(ua) || isiPadOS || window.matchMedia?.("(display-mode: standalone)")?.matches;
  }

  function estimateCostLines(labor = currentLabor()) {
    const defaults = estimateCostDefaults(labor);
    return [
      { key: "mount", printKey: "labor", group: "work", label: "セット（組換）", qty: 4, unit: labor.mount, defaultTotal: defaults.mount, note: labor.discountAmount ? `通常 ${yen(labor.mountNormalTotal)} / セット割引 ${state.settings.setDiscountRate}%` : "" },
      { key: "balance", printKey: "labor", group: "work", label: "バランス", qty: 4, unit: labor.balance, defaultTotal: defaults.balance },
      { key: "disposal", printKey: "disposal", group: "work", label: "廃タイヤ処理料", qty: 4, unit: labor.disposal, defaultTotal: defaults.disposal },
      { key: "valve", printKey: "valve", group: "work", label: "チューブレスバルブ", qty: 4, unit: labor.valve, defaultTotal: defaults.valve },
      { key: "nuts", printKey: "nuts", group: "option", label: "ナット代", qty: 1, unit: defaults.nuts, defaultTotal: defaults.nuts, note: nutAutoNote() },
      { key: "other", printKey: "other", group: "option", label: "その他費用", qty: 1, unit: defaults.other, defaultTotal: defaults.other }
    ].map(line => {
      const setting = estimateCostSetting(line.key);
      const total = setting.manual ? number(setting.amount) : line.defaultTotal;
      const unit = line.qty ? Math.round(total / line.qty) : total;
      return { ...line, enabled: setting.enabled, total, unit };
    });
  }

  function estimateCostDefaults(labor = currentLabor()) {
    return {
      mount: labor.mountTotal,
      balance: labor.balanceTotal,
      disposal: labor.disposalTotal,
      valve: labor.valveTotal,
      nuts: autoNutTotal(),
      other: number(state.settings.defaultCosts?.other ?? state.settings.costs?.other)
    };
  }

  function estimateCostControl(line) {
    const disabled = line.enabled ? "" : " disabled";
    const note = line.note ? `<small>${escapeHtml(line.note)}</small>` : "";
    return `
      <dt class="estimate-cost-label">
        <label><input data-estimate-cost-enabled="${line.key}" type="checkbox" ${line.enabled ? "checked" : ""}>${escapeHtml(line.label)}</label>
        ${note}
      </dt>
      <dd class="estimate-cost-value">
        <input data-estimate-cost-amount="${line.key}" type="number" min="0" step="1" value="${line.total}"${disabled}>
        <strong>${yen(line.total)}</strong>
      </dd>
    `;
  }

  function estimateCostAmount(key, lines = estimateCostLines()) {
    const line = lines.find(item => item.key === key);
    return line?.enabled ? line.total : 0;
  }

  function estimateCostGroupTotal(group, lines = estimateCostLines()) {
    return lines
      .filter(line => line.group === group && line.enabled)
      .reduce((sum, line) => sum + line.total, 0);
  }

  function estimateCostSetting(key) {
    state.settings.estimateCosts ||= {};
    const defaults = defaultEstimateCostSettings()[key] || { enabled: true, amount: 0, manual: false };
    state.settings.estimateCosts[key] = { ...defaults, ...(state.settings.estimateCosts[key] || {}) };
    return state.settings.estimateCosts[key];
  }

  function setEstimateCost(key, patch) {
    const setting = estimateCostSetting(key);
    state.settings.estimateCosts[key] = { ...setting, ...patch };
  }

  function syncEstimateCostDefaults(labor = currentLabor()) {
    const defaults = estimateCostDefaults(labor);
    ESTIMATE_COST_KEYS.forEach(key => {
      const setting = estimateCostSetting(key);
      if (!setting.manual) setting.amount = defaults[key] || 0;
    });
  }

  function autoNutTotal() {
    const holes = number(state.selectedWheel?.holes);
    if (!holes) return 0;
    return holes * 330 * 4;
  }

  function nutAutoNote() {
    const holes = number(state.selectedWheel?.holes);
    return holes ? `${holes}穴 × 330円 × 4枚` : "アルミ選択後に自動計算";
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

  function renderSourceStatus() {
    const rows = [
      sourceStatusInfo("summerTire", "夏タイヤ価格表", state.summerTireData),
      sourceStatusInfo("winterTire", "冬タイヤ価格表", state.winterTireData),
      sourceStatusInfo("bsWheel", "BSアルミ価格表", state.bsWheelData),
      sourceStatusInfo("otherWheel", "社外アルミ価格表", state.otherWheelData),
      sourceStatusInfo("imageDb", "画像DB", state.imageMaster)
    ];
    rows.forEach(row => {
      const badge = els.sourceBadges?.[row.key];
      if (badge) badge.textContent = row.statusLabel;
      const card = document.querySelector(`[data-source-card="${row.key}"]`);
      const detail = document.querySelector(`[data-source-detail="${row.key}"]`);
      const clearButton = clearButtonForSource(row.key);
      if (card) card.dataset.state = row.status;
      if (detail) detail.textContent = row.detail;
      if (clearButton) clearButton.disabled = row.status === "empty" && !row.count;
    });
  }

  function sourceStatusInfo(key, label, data = []) {
    const meta = state.sourceMeta?.[key] || {};
    const count = Number(meta.count ?? (Array.isArray(data) ? data.length : 0)) || 0;
    const inferredLoaded = !meta.status && count > 0;
    const status = meta.status || (inferredLoaded ? "loaded" : "empty");
    const statusLabel = status === "loaded" ? "🟢 読込成功" : status === "loading" ? "🟡 読み込み中" : status === "error" ? "🔴 読込失敗" : "⚪ 未読込";
    const fileName = meta.fileName || (inferredLoaded ? "保存済みデータ" : "—");
    const loadedAt = formatDateTime(meta.loadedAt) || (inferredLoaded ? "保存済み" : "—");
    const detail = sourceDetailText({ status, label, fileName, loadedAt, count, message: meta.message, summary: meta.summary, data });
    return {
      label,
      key,
      status,
      statusLabel,
      fileName,
      loadedAt,
      count,
      detail,
      message: status === "error" ? meta.message || "読込エラー" : ""
    };
  }

  function saveSourceMeta(key, meta) {
    state.sourceMeta[key] = {
      status: meta.status,
      fileName: text(meta.fileName) || "—",
      loadedAt: new Date().toISOString(),
      count: Math.max(0, Number(meta.count) || 0),
      message: text(meta.message),
      summary: meta.summary || null
    };
    localStorage.setItem(SOURCE_META_KEY, JSON.stringify(state.sourceMeta));
    renderSourceStatus();
  }

  function sourceDetailText({ status, fileName, loadedAt, count, message, summary, data }) {
    if (status === "loading") return `${fileName}\n解析しています。大きなExcelは数秒かかることがあります。`;
    if (status === "error") return `${fileName}\n原因：${message || "対応していない価格表、壊れたファイル、必要なシート不足の可能性があります。"}`;
    if (status === "loaded") {
      const lines = [`${fileName}`, `${count.toLocaleString("ja-JP")}件`, loadedAt];
      const extra = summaryLines(summary, data);
      return lines.concat(extra).filter(Boolean).join("\n");
    }
    return "ファイル未選択";
  }

  function summaryLines(summary, data) {
    if (summary?.lines?.length) return summary.lines;
    if (!Array.isArray(data) || !data.length) return [];
    if (data[0]?.size) return [`${uniqueCount(data, item => item.size).toLocaleString("ja-JP")}サイズ`, `${uniqueCount(data, item => item.subbrand).toLocaleString("ja-JP")}商品`];
    return [`${uniqueCount(data, item => item.brandName).toLocaleString("ja-JP")}ブランド`, `${uniqueCount(data, item => item.patternName).toLocaleString("ja-JP")}パターン`];
  }

  function summarizeTireData(data, catalog) {
    return {
      lines: [
        `${uniqueCount(data, item => item.size).toLocaleString("ja-JP")}サイズ`,
        `${uniqueCount(data, item => item.subbrand).toLocaleString("ja-JP")}商品`,
        `${uniqueCount(data, item => item.inch).toLocaleString("ja-JP")}インチ区分`,
        `${(catalog.sheets?.length || 0).toLocaleString("ja-JP")}シート`
      ]
    };
  }

  function summarizeWheelData(data, workbook) {
    return {
      lines: [
        `${uniqueCount(data, item => item.brandName).toLocaleString("ja-JP")}ブランド`,
        `${uniqueCount(data, item => item.patternName).toLocaleString("ja-JP")}パターン`,
        `${uniqueCount(data, item => wheelInch(item.sizeText)).toLocaleString("ja-JP")}インチ区分`,
        `${(workbook.SheetNames?.length || 0).toLocaleString("ja-JP")}シート`
      ]
    };
  }

  function uniqueCount(items, getter) {
    return new Set((items || []).map(getter).filter(Boolean)).size;
  }

  function clearButtonForSource(key) {
    return {
      summerTire: els.clearSummerTire,
      winterTire: els.clearWinterTire,
      bsWheel: els.clearBsWheel,
      otherWheel: els.clearOtherWheel
    }[key] || null;
  }

  function clearSourceData(key) {
    const names = {
      summerTire: "夏タイヤ価格表",
      winterTire: "冬タイヤ価格表",
      bsWheel: "BSアルミ価格表",
      otherWheel: "社外アルミ価格表"
    };
    if (!confirm(`${names[key] || "価格表"}の読み込みデータをクリアします。よろしいですか？`)) return;
    if (key === "summerTire") {
      state.summerTireData = [];
      state.summerTireWorkbook = null;
      localStorage.removeItem(SUMMER_TIRE_KEY);
      els.summerTireFileSetting.value = "";
    }
    if (key === "winterTire") {
      state.winterTireData = [];
      state.winterTireWorkbook = null;
      localStorage.removeItem(WINTER_TIRE_KEY);
      els.winterTireFileSetting.value = "";
    }
    if (key === "bsWheel") {
      state.bsWheelData = [];
      state.bsWheelWorkbook = null;
      localStorage.removeItem(BS_WHEEL_KEY);
      els.bsWheelFileSetting.value = "";
    }
    if (key === "otherWheel") {
      state.otherWheelData = [];
      state.otherWheelWorkbook = null;
      localStorage.removeItem(OTHER_WHEEL_KEY);
      els.otherWheelFileSetting.value = "";
    }
    delete state.sourceMeta[key];
    localStorage.setItem(SOURCE_META_KEY, JSON.stringify(state.sourceMeta));
    if (!state.summerTireData.length && !state.winterTireData.length) state.selectedTire = null;
    if (!state.bsWheelData.length && !state.otherWheelData.length) state.selectedWheel = null;
    refreshActiveProducts();
    populateTireBrands();
    renderTires();
    renderWheels();
    renderEstimate();
    renderImageManager();
    renderSourceStatus();
    setSaved("クリア済み");
  }

  function sourceKeyForTire(tireType) {
    return tireType === "winter" ? "winterTire" : "summerTire";
  }

  function sourceKeyForWheel(wheelType) {
    return wheelType === "other" ? "otherWheel" : "bsWheel";
  }

  function formatDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return text(value);
    return date.toLocaleString("ja-JP");
  }

  function friendlyError(error, fallback) {
    const message = text(error?.message);
    if (message) return message;
    const raw = String(error || "");
    if (/password|encrypted|保護/i.test(raw)) return "パスワード付きファイルは読み込めません。保護を解除してから再度読み込んでください。";
    return fallback;
  }

  function looksLikeWheelWorkbook(arrayBuffer) {
    if (!window.XLSX?.read) return false;
    try {
      const workbook = window.XLSX.read(arrayBuffer, { type: "array", dense: false });
      return (workbook.SheetNames || []).some(sheetName => {
        const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", blankrows: false, raw: true });
        return Boolean(findWheelHeader(rows)) || parseBsWinterWholesaleRows(rows, { sheetName }).length > 0;
      });
    } catch {
      return false;
    }
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
      saveSourceMeta("imageDb", { status: "loaded", fileName: file.name, count: state.imageMaster.length });
      setSaved("画像DBを読み込みました");
    } catch (error) {
      saveSourceMeta("imageDb", { status: "error", fileName: file.name, count: 0, message: error.message || "読込エラー" });
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
        if (!state.sourceMeta.imageDb) saveSourceMeta("imageDb", { status: "loaded", fileName: "同梱 wheel_image_master.json", count: state.imageMaster.length });
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

  function canonicalTireSize(value) {
    const normalized = String(value || "").normalize("NFKC").toUpperCase().replace(/[\s　]/g, "");
    const match = normalized.match(/(\d{3}\/\d{2,3}(?:\.5)?(?:R|ZR)\d{2}(?:\.5)?)/);
    return match ? match[1].replace("ZR", "R") : "";
  }

  function sameTireSize(left, right) {
    const a = canonicalTireSize(left);
    const b = canonicalTireSize(right);
    return Boolean(a && b && a === b);
  }

  function isPricedTire(item) {
    return number(item?.cost) > 0 && tireSalePrice(item) > 0 && Boolean(canonicalTireSize(tireDisplaySize(item)));
  }

  function compareTireSalePrice(a, b) {
    return compareSalePrice(tireSalePrice(a), tireSalePrice(b))
      || tireBrandDisplayName(a.brand).localeCompare(tireBrandDisplayName(b.brand), "ja")
      || text(a.subbrand).localeCompare(text(b.subbrand), "ja")
      || text(tireDisplaySize(a)).localeCompare(text(tireDisplaySize(b)), "ja")
      || text(a.code).localeCompare(text(b.code), "ja");
  }

  function wheelSalePrice(item) {
    const mode = state.settings.wheelPricingMode || "divide";
    const rate = positiveRate(state.settings.wheelMarkup, 0.9);
    const base = number(item?.wholesalePrice || item?.dealerCost || item?.basePrice || item?.salePrice);
    const direct = number(item?.directSalePrice || item?.salePrice);
    const discount = wheelBrandDiscountRate(item);
    if (discount !== null && base > 0) return roundPrice(base * (100 - discount) / 100);
    if (mode === "direct") return direct > 0 ? roundPrice(direct) : (base > 0 ? roundPrice(base) : 0);
    if (!base) return 0;
    if (mode === "multiply") return roundPrice(base * rate);
    return roundPrice(base / rate);
  }

  function isPricedWheel(item) {
    const rawPrice = firstPrice(item?.wholesalePrice, item?.dealerCost, item?.basePrice, item?.directSalePrice, item?.salePrice);
    return rawPrice > 0 && wheelSalePrice(item) > 0 && looksWheelSize(item?.sizeText);
  }

  function hasMinimumWheelFitment(item) {
    return number(item?.pcd) > 0 && number(item?.holes) > 0 && wheelInch(item?.sizeText) > 0;
  }

  function compareWheelSalePrice(a, b) {
    return compareSalePrice(wheelSalePrice(a), wheelSalePrice(b))
      || text(a.maker).localeCompare(text(b.maker), "ja")
      || text(a.brandName).localeCompare(text(b.brandName), "ja")
      || text(a.patternName).localeCompare(text(b.patternName), "ja")
      || text(wheelDisplayDetails(a)).localeCompare(text(wheelDisplayDetails(b)), "ja")
      || text(wheelProductCode(a)).localeCompare(text(wheelProductCode(b)), "ja");
  }

  function compareSalePrice(a, b) {
    return salePriceSortValue(a) - salePriceSortValue(b);
  }

  function salePriceSortValue(value) {
    const price = number(value);
    return price > 0 ? price : Number.POSITIVE_INFINITY;
  }

  function wheelBrandDiscountRate(item = {}) {
    const brand = norm([item.brandName, item.fullPatternName, item.patternName].filter(Boolean).join(" "));
    const matched = WHEEL_DISCOUNT_BRANDS.find(name => brand.includes(norm(name)));
    if (!matched) return null;
    return number(state.settings.wheelBrandDiscounts?.[matched] ?? 8);
  }

  function positiveRate(value, fallback = 1) {
    const n = number(value);
    return n > 0 ? n : fallback;
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

  function tireDisplaySize(item = {}) {
    const size = text(item.size);
    if ((item.productCategory || "normal") === "van") return size || "—";
    const normalized = size.normalize("NFKC").toUpperCase();
    const match = normalized.match(/(\d{3}\/\d{2}(?:R|RF|ZR)\d{2}(?:\.5)?)/);
    return match ? match[1] : size || "—";
  }

  function populateTireBrands() {
    const brands = [...new Set(state.tireProducts.map(item => item.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));
    els.tireBrand.innerHTML = `<option value="">すべて</option>${brands.map(brand => `<option value="${escapeHtml(brand)}">${escapeHtml(tireBrandDisplayName(brand))}</option>`).join("")}`;
  }

  function applySettingsToInputs() {
    const shop = state.settings.shop || defaultShopInfo();
    els.shopName.value = shop.name || "";
    els.shopAddress.value = shop.address || "";
    els.shopTel.value = shop.tel || "";
    els.quoteNote.value = state.settings.quoteNote || "";
    els.taxRate.value = state.settings.taxRate;
    els.rounding.value = state.settings.rounding;
    els.tireAddition.value = state.settings.tireAddition;
    els.defaultRate.value = state.settings.defaultRate;
    els.wheelMarkup.value = state.settings.wheelMarkup;
    els.wheelPricingMode.value = state.settings.wheelPricingMode || "divide";
    els.wheelImageDisplay.value = state.settings.wheelImageDisplay ? "on" : "off";
    els.imageManagerDisplay.value = state.settings.imageManagerDisplay ? "on" : "off";
    els.setDiscountRate.value = state.settings.setDiscountRate;
    $$("[data-default-cost]").forEach(input => input.value = state.settings.defaultCosts[input.dataset.defaultCost] ?? 0);
    Object.assign(state.settings.costs, state.settings.costs || {});
  }

  function renderWheelBrandDiscountSettings() {
    els.wheelBrandDiscountGrid.innerHTML = WHEEL_DISCOUNT_BRANDS.map(brand => `
      <label>${escapeHtml(brand)} 値引き率（%）<input data-wheel-brand-discount="${escapeHtml(brand)}" type="number" min="0" max="100" step="0.1" value="${state.settings.wheelBrandDiscounts[brand] ?? 8}"></label>
    `).join("");
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
      wheelCode: "アルミ商品コード",
      wheelSize: "アルミサイズ",
      wheelPrice: "アルミ価格",
      labor: "工賃",
      disposal: "廃タイヤ処理料",
      valve: "チューブレスバルブ",
      nuts: "ナット代",
      other: "その他費用",
      total: "合計金額"
    };
    els.printOptionGrid.innerHTML = Object.entries(labels).map(([key, label]) => `
      <label class="check-field"><input data-print-option="${key}" type="checkbox" ${state.settings.printOptions[key] ? "checked" : ""}><span>${label}</span></label>
    `).join("");
  }

  function renderSearchOrderSettings() {
    els.searchOrderSettings.innerHTML = Object.entries(SEARCH_ORDER_CONFIG).map(([type, config]) => {
      const order = normalizedSearchOrder(type);
      return `
        <section class="search-order-box">
          <h4>${escapeHtml(config.title)}</h4>
          <div class="search-order-list">
            ${order.map((key, index) => `
              <div class="search-order-item">
                <span>${escapeHtml(config.labels[key] || key)}</span>
                <div>
                  <button type="button" class="secondary mini-button" data-search-order-type="${type}" data-search-order-key="${key}" data-search-order-move="up" ${index === 0 ? "disabled" : ""}>↑</button>
                  <button type="button" class="secondary mini-button" data-search-order-type="${type}" data-search-order-key="${key}" data-search-order-move="down" ${index === order.length - 1 ? "disabled" : ""}>↓</button>
                </div>
              </div>
            `).join("")}
          </div>
        </section>
      `;
    }).join("");
  }

  function moveSearchOrderItem(type, key, direction) {
    const order = normalizedSearchOrder(type);
    const index = order.indexOf(key);
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return;
    [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
    state.settings.searchOrder[type] = order;
    saveSettings();
    renderSearchOrderSettings();
    applySearchOrder(type);
  }

  function applySearchOrder(type) {
    const panel = type === "tire" ? els.tireChoicePanel : els.wheelChoicePanel;
    if (!panel) return;
    normalizedSearchOrder(type).forEach(key => {
      const section = panel.querySelector(`[data-search-panel="${type}"][data-search-item="${key}"]`);
      if (section) panel.appendChild(section);
    });
  }

  function openNextSearchStep(type, currentKey) {
    const panel = type === "tire" ? els.tireChoicePanel : els.wheelChoicePanel;
    if (!panel || !currentKey) return;
    const order = normalizedSearchOrder(type);
    const currentIndex = order.indexOf(currentKey);
    const nextKey = order[currentIndex + 1];
    if (!nextKey) return;
    const next = panel.querySelector(`[data-search-panel="${type}"][data-search-item="${nextKey}"]`);
    if (next?.tagName === "DETAILS") next.open = true;
  }

  function normalizedSearchOrder(type) {
    const config = SEARCH_ORDER_CONFIG[type];
    const saved = Array.isArray(state.settings.searchOrder?.[type]) ? state.settings.searchOrder[type] : [];
    return [...saved.filter(key => config.defaults.includes(key)), ...config.defaults.filter(key => !saved.includes(key))];
  }

  function updateRatePreview() {
    if (els.wheelRatePreview) els.wheelRatePreview.textContent = wheelPricingLabel();
    if (els.bsRateLabels) {
      const labels = state.settings.bsRateLabels || [];
      els.bsRateLabels.textContent = labels.length ? labels.join("、") : "未読込";
    }
    if (els.bsBrandRateLabels) {
      const labels = state.settings.bsBrandRateLabels || [];
      els.bsBrandRateLabels.textContent = labels.length ? labels.map(item => `${item.brand}：${item.rate}`).join(" / ") : "未読込";
    }
  }

  function updateImageManagerVisibility() {
    if (!els.imageManagerSection) return;
    els.imageManagerSection.hidden = !state.settings.imageManagerDisplay;
    if (!state.settings.imageManagerDisplay) els.imageManagerSection.open = false;
  }

  function wheelPricingLabel() {
    const rate = positiveRate(state.settings.wheelMarkup, 0.9).toFixed(2);
    if (state.settings.wheelPricingMode === "multiply") return `仕切価格 × ${rate}`;
    if (state.settings.wheelPricingMode === "direct") return "販売価格をそのまま使用";
    return `仕切価格 ÷ ${rate}`;
  }

  function currentLabor() {
    const inch = state.selectedTire ? tireInch(state.selectedTire.size) : 0;
    const category = laborCategoryForInch(inch);
    const hasSet = Boolean(state.selectedTire && state.selectedWheel);
    const rate = hasSet ? Math.max(0, Math.min(100, number(state.settings.setDiscountRate))) / 100 : 0;
    const mount = ceilTo(number(category.mount) * (1 - rate), 10);
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

  function ceilTo(value, unit) {
    const n = number(value);
    const step = number(unit) || 1;
    return Math.ceil(n / step) * step;
  }

  function currentEstimateParts() {
    const tireSingle = state.selectedTire ? tireSalePrice(state.selectedTire) : 0;
    const wheelSingle = state.selectedWheel ? wheelSalePrice(state.selectedWheel) : 0;
    const labor = currentLabor();
    syncEstimateCostDefaults(labor);
    const costLines = estimateCostLines(labor);
    const workTotal = estimateCostGroupTotal("work", costLines);
    const optionTotal = estimateCostGroupTotal("option", costLines);
    const total = tireSingle * 4 + wheelSingle * 4 + workTotal + optionTotal;
    return { tireSingle, wheelSingle, workTotal, optionTotal, costLines, total, mismatch: inchMismatch() };
  }

  function defaultSettings() {
    const labor = window.APP_DATA?.defaultLaborSettings || {};
    return {
      taxRate: 10,
      rounding: "ceil100",
      tireAddition: window.APP_DATA?.defaultPriceSettings?.addition || 0,
      defaultRate: window.APP_DATA?.defaultPriceSettings?.defaultRate || 0.9,
      wheelMarkup: 0.9,
      wheelPricingMode: "divide",
      wheelImageDisplay: false,
      imageManagerDisplay: false,
      wheelBrandDiscounts: defaultWheelBrandDiscounts(),
      searchOrder: defaultSearchOrder(),
      bsRateLabels: [],
      bsBrandRateLabels: [],
      shop: defaultShopInfo(),
      quoteNote: "表示価格は税込です。有効期限・在庫状況は店頭にてご確認ください。",
      setDiscountRate: 30,
      laborCategories: defaultLaborCategories(labor),
      estimateCosts: defaultEstimateCostSettings(),
      printOptions: defaultPrintOptions(),
      defaultCosts: {
        other: 0
      },
      costs: {
        other: 0
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
      estimateCosts: { ...defaults.estimateCosts, ...(settings.estimateCosts || {}) },
      printOptions: { ...defaults.printOptions, ...(settings.printOptions || {}) },
      wheelBrandDiscounts: { ...defaults.wheelBrandDiscounts, ...(settings.wheelBrandDiscounts || {}) },
      searchOrder: normalizeSearchOrderSettings(settings.searchOrder, defaults.searchOrder),
      shop: { ...defaults.shop, ...(settings.shop || {}) },
      quoteNote: settings.quoteNote ?? defaults.quoteNote,
      bsRateLabels: Array.isArray(settings.bsRateLabels) ? settings.bsRateLabels : defaults.bsRateLabels,
      bsBrandRateLabels: Array.isArray(settings.bsBrandRateLabels) ? settings.bsBrandRateLabels : defaults.bsBrandRateLabels,
      wheelPricingMode: ["divide", "multiply", "direct"].includes(settings.wheelPricingMode) ? settings.wheelPricingMode : defaults.wheelPricingMode,
      wheelImageDisplay: Boolean(settings.wheelImageDisplay),
      imageManagerDisplay: Boolean(settings.imageManagerDisplay),
      setDiscountRate: settings.setDiscountRate ?? defaults.setDiscountRate
    };
  }

  function defaultShopInfo() {
    return {
      name: "タイヤ館 箕輪",
      address: "長野県上伊那郡箕輪町大字三日町964-1",
      tel: "0265-98-9111"
    };
  }

  function defaultWheelBrandDiscounts() {
    return Object.fromEntries(WHEEL_DISCOUNT_BRANDS.map(brand => [brand, 8]));
  }

  function defaultSearchOrder() {
    return Object.fromEntries(Object.entries(SEARCH_ORDER_CONFIG).map(([type, config]) => [type, [...config.defaults]]));
  }

  function normalizeSearchOrderSettings(saved = {}, defaults = defaultSearchOrder()) {
    return Object.fromEntries(Object.entries(SEARCH_ORDER_CONFIG).map(([type, config]) => {
      const values = Array.isArray(saved?.[type]) ? saved[type] : defaults[type];
      return [type, [...values.filter(key => config.defaults.includes(key)), ...config.defaults.filter(key => !values.includes(key))]];
    }));
  }

  function defaultEstimateCostSettings() {
    return Object.fromEntries(ESTIMATE_COST_KEYS.map(key => [key, { enabled: true, amount: 0, manual: false }]));
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
      wheelCode: true,
      wheelSize: true,
      wheelPrice: true,
      labor: true,
      disposal: true,
      valve: true,
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
    [STORE_KEY, IMAGE_KEY, TIRE_KEY, WHEEL_KEY, SUMMER_TIRE_KEY, WINTER_TIRE_KEY, BS_WHEEL_KEY, OTHER_WHEEL_KEY, SOURCE_META_KEY].forEach(key => localStorage.removeItem(key));
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

  function chips(scope, filter, values, selected, labelForValue = value => value) {
    const allActive = !text(selected);
    const all = `<button type="button" class="choice-chip ${allActive ? "active" : ""}" data-scope="${scope}" data-filter="${filter}" data-value="">全て</button>`;
    return all + values.map(value => {
      const rawValue = text(value);
      const label = text(labelForValue(value));
      const active = text(selected) === rawValue;
      return `<button type="button" class="choice-chip ${active ? "active" : ""}" data-scope="${scope}" data-filter="${filter}" data-value="${escapeHtml(rawValue)}">${escapeHtml(label)}</button>`;
    }).join("");
  }

  function tireBrandDisplayName(value) {
    if (!text(value)) return "";
    return isIcePartnerBrand(value) ? "BS" : text(value);
  }

  function isIcePartnerBrand(value) {
    const normalized = norm(value);
    return normalized === "アイスパートナー" || normalized === "ICEPARTNER" || normalized === "ICEPARTNER2";
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

  function tireCategoryLabel(key) {
    return ({ normal: "乗用タイヤ", oem: "OEM", van: "VAN" })[key] || "";
  }

  function tireCategoryKey(label) {
    return ({ "乗用タイヤ": "normal", OEM: "oem", VAN: "van" })[label] || "";
  }

  function dedupe(items) {
    const seen = new Set();
    return items.filter(item => {
      const key = wheelProductIdentity(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function isSkipSheet(name) {
    return /連絡文書|説明|案内|注意|表紙|印刷用/i.test(text(name));
  }

  function wheelSheetNamesForImport(workbook, wheelType) {
    const sheetNames = (workbook.SheetNames || []).filter(name => !isSkipSheet(name));
    if (wheelType !== "other") return sheetNames;
    const currentSheetNames = sheetNames.filter(isCurrentOtherWheelSheet);
    return currentSheetNames.length ? currentSheetNames : sheetNames;
  }

  function isCurrentOtherWheelSheet(name) {
    const normalized = norm(name);
    return /(?:2026|26|Ｒ8|R8|令和8)/i.test(normalized);
  }

  function wheelProductIdentity(item) {
    const code = text(item.productCode);
    if (code) return stableId(["code", code]);
    return stableId([item.maker, item.brandName, item.patternName, item.sizeText, item.insetText, item.color, item.holes, item.pcd]);
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

  function wheelSizeGroup(value) {
    const normalized = String(value || "").normalize("NFKC").toUpperCase().replace(/\s+/g, " ").trim();
    const compact = normalized.match(/(\d{2})(?:\.\d)?\s*[X×]\s*(\d{2})(?=\D|$)/);
    if (compact) return `${Number(compact[1])}×${(Number(compact[2]) / 10).toFixed(1)}`;
    const decimal = normalized.match(/(\d{2})(?:\.\d)?\s*[X×]\s*(\d+(?:\.\d)?)(?:J)?/);
    if (decimal) return `${Number(decimal[1])}×${Number(decimal[2]).toFixed(1)}`;
    return "";
  }

  function compareWheelSizeGroups(a, b) {
    const parse = value => String(value || "").split("×").map(Number);
    const [ai, aw] = parse(a);
    const [bi, bw] = parse(b);
    return (ai - bi) || (aw - bw) || String(a).localeCompare(String(b), "ja");
  }

  function parseFitment(value) {
    const normalized = String(value || "").normalize("NFKC").toUpperCase().replace(/PCD/g, " ");
    const slash = normalized.match(/(\d)\s*[/／]\s*(\d{3}(?:\.\d)?)/);
    const spaced = normalized.match(/\b(\d)\s+(\d{3}(?:\.\d)?)\b/);
    const holesText = normalized.match(/(\d)\s*(?:H|穴)/);
    const pcdText = normalized.match(/(?:PCD)?\s*(100|110|112|114\.3|114|120|139\.7|139)\b/);
    const holes = slash?.[1] || spaced?.[1] || holesText?.[1] || "";
    const rawPcd = slash?.[2] || spaced?.[2] || pcdText?.[1] || "";
    const pcd = rawPcd === "114" ? "114.3" : rawPcd === "139" ? "139.7" : rawPcd;
    const label = [holes && `${holes}穴`, pcd && `PCD ${pcd}`].filter(Boolean).join(" / ");
    return { holes, pcd, label, holesPcdText: label };
  }

  function extractRateLabels(rows) {
    const labels = [];
    rows.slice(0, 120).forEach(row => {
      (row || []).forEach(cell => {
        const matches = String(cell ?? "").normalize("NFKC").match(/\d{2,3}\s*掛/g);
        if (matches) labels.push(...matches.map(value => value.replace(/\s+/g, "")));
      });
    });
    return labels;
  }

  function extractBrandRateLabels(rows) {
    const knownBrands = ["BALMINUM", "ECO FORME", "ECOFORME", "TOPRUN", "POTENZA", "SUVENCER", "PREO"];
    const out = [];
    let currentBrand = "";
    rows.forEach(row => {
      const cells = (row || []).map(cell => String(cell ?? "").normalize("NFKC").trim());
      const line = cells.join(" ");
      const brands = knownBrands
        .filter(name => norm(line).includes(norm(name)))
        .map(name => name === "ECOFORME" ? "ECO FORME" : name)
        .filter((brand, index, list) => list.indexOf(brand) === index);
      const rates = (line.match(/\d{2,3}\s*掛/g) || []).map(value => value.replace(/\s+/g, ""));
      if (brands.length) currentBrand = brands[brands.length - 1];
      if (!rates.length) return;
      if (brands.length && brands.length === rates.length) {
        brands.forEach((brand, index) => out.push({ brand, rate: rates[index] }));
      } else if (brands.length) {
        brands.forEach(brand => out.push({ brand, rate: rates[0] }));
      } else if (currentBrand) {
        out.push({ brand: currentBrand, rate: rates[0] });
      }
    });
    return out;
  }

  function mergeBrandRateLabels(items) {
    const merged = new Map();
    (items || []).forEach(item => {
      if (!item?.brand || !item?.rate) return;
      merged.set(item.brand, item.rate);
    });
    return [...merged.entries()]
      .map(([brand, rate]) => ({ brand, rate }))
      .sort((a, b) => a.brand.localeCompare(b.brand, "ja"));
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
