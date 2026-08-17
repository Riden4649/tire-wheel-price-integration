window.PriceEngine = Object.freeze({
  calculate(cost, brand, settings) {
    const configuredRate = Number(settings.rates[brand] ?? settings.defaultRate ?? 1);
    const rate = Number.isFinite(configuredRate) && configuredRate > 0 ? configuredRate : 1;
    const addition = Math.max(0, Number(settings.addition) || 0);
    const tax = Math.max(0, Number(settings.taxRate) || 0) / 100;
    return Math.ceil(((cost / rate + addition) * (1 + tax)) / 100) * 100;
  },
  fourTires(singlePrice) {
    return singlePrice * 4;
  },
  tireTotal(singlePrice, quantity = 4) {
    return singlePrice * Math.max(1, Number(quantity) || 4);
  },
  laborPerTire(labor) {
    return Object.values(labor || {}).reduce((total, value) => total + Math.max(0, Number(value) || 0), 0);
  },
  laborForTires(labor, quantity = 4) {
    return this.laborPerTire(labor) * Math.max(0, Number(quantity) || 0);
  },
  tireInch(size) {
    const normalized = String(size || "").normalize("NFKC").toUpperCase();
    const match = normalized.match(/(?:R|RF)(\d{2}(?:\.5)?)/);
    return match ? Number(match[1]) : 0;
  },
  autoLaborCategory(size, autoLaborSettings) {
    const inch = this.tireInch(size);
    const categories = autoLaborSettings?.categories || [];
    const category = categories.find(item =>
      inch >= Number(item.minInch || 0) &&
      inch <= Number(item.maxInch || 99)
    );
    return category ? { ...category, inch } : { inch, key: "", label: "未判定" };
  },
  autoLaborByKey(key, autoLaborSettings, fallbackSize = "") {
    const categories = autoLaborSettings?.categories || [];
    const category = categories.find(item => item.key === key);
    if (category) return { ...category, inch: this.tireInch(fallbackSize) };
    return this.autoLaborCategory(fallbackSize, autoLaborSettings);
  },
  laborFromAutoCategory(category) {
    const common = window.APP_DATA?.autoLaborSettings?.common || {};
    return {
      replacement: Math.max(0, Number(category?.replacement) || 0),
      removal: Math.max(0, Number(category?.removal) || 0),
      balancing: Math.max(0, Number(category?.balancing) || 0),
      valve: Math.max(0, Number(common.valve) || 0),
      disposal: Math.max(0, Number(category?.disposal ?? common.disposal) || 0),
      nitrogen: Math.max(0, Number(common.nitrogen) || 0),
      bag: Math.max(0, Number(common.bag) || 0)
    };
  },
  autoLaborTotal(category) {
    return this.laborPerTire(this.laborFromAutoCategory(category));
  },
  runFlatAmount(vehicle = {}) {
    return vehicle?.runFlat ? 2200 : 0;
  },
  vehicleLabel(vehicle = {}) {
    return vehicle?.type === "import" ? "輸入車" : "国産車";
  },
  quoteOptionLines(labor, options, quantity = 4, customItems = [], vehicle = {}) {
    const q = Math.max(1, Number(quantity) || 4);
    const enabled = options || {};
    const number = value => Math.max(0, Number(value) || 0);
    const customRows = (Array.isArray(customItems) ? customItems : [])
      .filter(item => item?.enabled && String(item.label || "").trim() && String(item.value || "").trim())
      .map(item => {
        const rawValue = String(item.value || "").trim();
        const normalized = rawValue.replace(/[￥¥円,\s]/g, "");
        const amount = /^\d+(?:\.\d+)?$/.test(normalized) ? Math.max(0, Number(normalized)) : 0;
        return {
          key: item.id || `custom-${item.label}`,
          label: String(item.label || "").trim(),
          unit: amount,
          quantity: amount ? q : "",
          total: amount ? amount * q : 0,
          value: amount ? `¥${this.format(amount * q)}` : rawValue,
          details: []
        };
      });
    const runFlat = this.runFlatAmount(vehicle);
    const baseWork = number(labor?.replacement) + number(labor?.removal) + number(labor?.balancing) + runFlat;
    const laborDetails = [
      ["組替", number(labor?.replacement)],
      ["脱着", number(labor?.removal)],
      ["バランス調整", number(labor?.balancing)]
    ];
    if (runFlat) laborDetails.push(["ランフラット加算", runFlat]);
    const rows = [
      {
        key: "labor",
        label: "工賃",
        unit: baseWork,
        quantity: q,
        total: baseWork * q,
        details: laborDetails
      },
      { key: "disposal", label: "廃タイヤ処理料", unit: number(labor?.disposal), quantity: q, total: number(labor?.disposal) * q, details: [] },
      { key: "valve", label: "チューブレスバルブ", unit: number(labor?.valve), quantity: q, total: number(labor?.valve) * q, details: [] },
      { key: "nitrogen", label: "窒素ガス充填", unit: number(labor?.nitrogen), quantity: q, total: number(labor?.nitrogen) * q, details: [] },
      { key: "bag", label: "持ち帰り袋", unit: number(labor?.bag), quantity: q, total: number(labor?.bag) * q, details: [] },
      { key: "inspection", label: "安全点検・100km点検", unit: 0, quantity: 1, total: 0, details: [["安全点検・100km点検", 0]] }
    ];
    return rows.filter(row => enabled[row.key] && (row.total > 0 || row.key === "inspection")).concat(customRows);
  },
  totalWithLabor(tirePrice, laborPrice, includeLabor = true) {
    return tirePrice + (includeLabor ? laborPrice : 0);
  },
  format(value) {
    return Math.round(value).toLocaleString("ja-JP");
  }
});
