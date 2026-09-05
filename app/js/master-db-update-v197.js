(() => {
  "use strict";
  const DB = "integrated-master-bundle-v2", STORE = "snapshots";
  const KEYS = {
    "integrated-summer-tire-products-v120": ["tires", "summer"],
    "integrated-winter-tire-products-v120": ["tires", "winter"],
    "integrated-bs-wheel-products-v120": ["wheels", "bs"],
    "integrated-other-wheel-products-v120": ["wheels", "other"],
    "integrated-wheel-image-master-v1": ["images"]
  };
  const PATHS = { "data/vehicles_2012_2026.json": "fitment", "data/jp_vehicle_search_master_2000_2026_v1.json": "search", "data/vehicle_service_specs.json": "service", "data/wheel_image_master.json": "images" };
  const REQUIRED = ["tires", "wheels", "fitment", "search", "service", "images", "labor"];
  const nativeFetch = window.fetch.bind(window);
  let active = null, previous = null, busy = false;
  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("別画面でデータ保存が使用中です。"));
    });
  }
  async function readKey(key) {
    const db = await openDb();
    try { return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error);
    }); } finally { db.close(); }
  }
  async function read() { return readKey("active"); }
  async function commit(snapshot) {
    const db = await openDb();
    try { await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(snapshot, "active");
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || new Error("保存中断")); tx.onerror = () => {};
    }); } finally { db.close(); }
    active = snapshot;
  }
  async function activate(snapshot, backup = active) {
    const db = await openDb();
    try { await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      if (backup) tx.objectStore(STORE).put(backup, "previous");
      tx.objectStore(STORE).put(snapshot, "active");
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || new Error("保存中断")); tx.onerror = () => {};
    }); } finally { db.close(); }
    previous = backup || previous;
    active = snapshot;
  }
  async function restorePrevious() {
    if (!previous) throw new Error("復元できる前の価格表がありません。");
    const restored = previous;
    validate(restored.data, manifestFor(restored.data, restored.version || "復元データ"));
    const restoredAt = new Date().toISOString();
    await activate({ ...restored, generation: makeGeneration(), updatedAt: restoredAt, restoredAt }, active);
    return snapshotInfo(active);
  }
  function rows(value) { return Array.isArray(value) ? value : value?.vehicles || value?.records || []; }
  function count(key, data) {
    if (key === "tires") return (data.summer?.length || 0) + (data.winter?.length || 0);
    if (key === "wheels") return (data.bs?.length || 0) + (data.other?.length || 0);
    if (key === "labor") return data.laborCategories?.length || 0;
    return rows(data).length;
  }
  const finite = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
  function validate(data, manifest) {
    for (const key of REQUIRED) {
      if (!data[key] || count(key, data[key]) !== manifest.files[key].count) throw new Error(`${key}: 件数不一致`);
    }
    const catalogs = [[data.tires, ["summer", "winter"], "size", "cost"], [data.wheels, ["bs", "other"], "sizeText", "price"]];
    for (const [catalog, groups, size, price] of catalogs) {
      const ids = new Set();
      for (const group of groups) {
        if (!Array.isArray(catalog[group])) throw new Error(`${group}: 配列が必要です`);
        for (const item of catalog[group]) {
          if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item[size] !== "string" || !item[size].trim()) throw new Error(`${group}: ID・サイズ不正／重複`);
          const amounts = price === "cost" ? [item.cost] : [item.wholesalePrice, item.dealerCost, item.basePrice, item.directSalePrice, item.salePrice];
          if (!amounts.some(x => finite(x) && x > 0) || amounts.some(x => x != null && !finite(x))) throw new Error(`${group}: 価格不正`);
          ids.add(item.id);
        }
      }
      if (!ids.size) throw new Error("空の価格DBは適用できません。");
    }
    const vehicles = rows(data.fitment), search = rows(data.search);
    if (!vehicles.length || vehicles.some(v => !v.vehicle_id || !v.maker || !v.model) || new Set(vehicles.map(v => v.vehicle_id)).size !== vehicles.length) throw new Error("車種適合DB不正");
    if (!window.VehicleFitment.validateVehicles(data.fitment).valid) throw new Error("車種適合DBの年式・サイズが不正");
    if (!search.length || search.some(v => !v.search_id || !v.maker || !v.model) || new Set(search.map(v => v.search_id)).size !== search.length) throw new Error("車種検索DB不正");
    if (!Array.isArray(data.service.records) || !Array.isArray(data.images)) throw new Error("整備／画像DB不正");
    if (data.images.some(v => !v || typeof v.patternName !== "string" || (v.imageFile && !safeUrl(v.imageFile)))) throw new Error("画像情報不正");
    if (!Array.isArray(data.labor.laborCategories) || !data.labor.laborCategories.length || data.labor.laborCategories.some(v => !/^[a-z0-9_-]+$/i.test(v.key) || typeof v.label !== "string" || !finite(v.min) || !finite(v.max) || v.min > v.max || [v.mount,v.balance,v.disposal,v.valve].some(n => !finite(n)))) throw new Error("工賃DB不正");
    if (!data.labor.defaultCosts || Object.values(data.labor.defaultCosts).some(n => !finite(n)) || !finite(data.labor.setDiscountRate) || data.labor.setDiscountRate > 100) throw new Error("諸費用DB不正");
    // Only known labor fields are eligible for a settings merge.
    data.labor = { laborCategories: data.labor.laborCategories, defaultCosts: data.labor.defaultCosts, setDiscountRate: data.labor.setDiscountRate };
    return data;
  }
  function safeUrl(value) {
    const url = new URL(value, location.href);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  }
  function localValue(key, fallback) {
    if (!active) return fallback;
    if (localStorage.getItem(`${key}:bundle`) === active.generation) return fallback;
    if (KEYS[key]) return KEYS[key].reduce((value, part) => value?.[part], active.data);
    if (key === "integrated-price-navi-v1") return { ...fallback, ...active.data.labor };
    if (key === "integrated-source-meta-v1") {
      const method = active.method === "manual" ? "AirDrop / 手動取込" : "自動更新";
      return Object.fromEntries(["summerTire", "winterTire", "bsWheel", "otherWheel", "imageDb"].map(k => [k, { status: "loaded", fileName: `${method} ${active.version}`, loadedAt: active.updatedAt }]));
    }
    return fallback;
  }
  function markLocal(key) { if (active) localStorage.setItem(`${key}:bundle`, active.generation); }
  const ready = Promise.all([readKey("active"), readKey("previous")]).then(([current, backup]) => {
    active = current;
    previous = backup;
  }).catch(error => { console.warn("一括データ保存を利用できません。既存端末データで起動します。", error); });
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    const relative = url.origin === location.origin ? url.pathname.replace(new URL(".", location.href).pathname, "") : "";
    const key = PATHS[relative];
    if (key && active?.data[key]) return new Response(JSON.stringify(active.data[key]), { headers: { "Content-Type": "application/json" } });
    if (key && key !== "images") {
      try { const old = JSON.parse(localStorage.getItem("integrated-main-master-snapshot-v1") || "null"); if (old?.[key]) return new Response(JSON.stringify(old[key])); } catch {}
    }
    return nativeFetch(input, init);
  };
  async function getText(url) {
    const fresh = new URL(url, location.href); fresh.searchParams.set("__bundle_update", "1");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    let response;
    try { response = await nativeFetch(fresh.href, { cache: "no-store", signal: controller.signal }); }
    finally { clearTimeout(timer); }
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${new URL(url, location.href).pathname}`);
    return response.text();
  }
  function makeGeneration() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
    return [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
  }
  async function digest(value) {
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  function manifestFor(data, version) {
    return { schemaVersion: 2, version, files: Object.fromEntries(REQUIRED.map(key => [key, { count: count(key, data[key]) }])) };
  }
  function snapshotInfo(snapshot) {
    if (!snapshot) return null;
    return {
      version: snapshot.version || "不明",
      updatedAt: snapshot.updatedAt || "",
      method: snapshot.method || "automatic",
      sourceFiles: snapshot.sourceFiles || [],
      counts: snapshot.data ? {
        summer: snapshot.data.tires?.summer?.length || 0,
        winter: snapshot.data.tires?.winter?.length || 0,
        bsWheel: snapshot.data.wheels?.bs?.length || 0,
        otherWheel: snapshot.data.wheels?.other?.length || 0
      } : {}
    };
  }
  async function captureAppData(prices = null) {
    const s = window.IntegratedApp?.state;
    if (!s) throw new Error("アプリの初期化が完了していません。少し待ってから再実行してください。");
    const service = s.serviceSpecs?.length ? { records: s.serviceSpecs } : await window.fetch("data/vehicle_service_specs.json").then(response => response.json());
    return {
      tires: prices?.tires || { summer: s.summerTireData, winter: s.winterTireData },
      wheels: prices?.wheels || { bs: s.bsWheelData, other: s.otherWheelData },
      fitment: { vehicles: s.vehicles },
      search: { vehicles: s.vehicleSearchRecords },
      service,
      images: s.imageMaster,
      labor: { laborCategories: s.settings.laborCategories, defaultCosts: s.settings.defaultCosts, setDiscountRate: s.settings.setDiscountRate }
    };
  }
  async function backupFromCurrent() {
    const data = await captureAppData();
    const hasTires = count("tires", data.tires) > 0;
    const hasWheels = count("wheels", data.wheels) > 0;
    if (!hasTires || !hasWheels) return active || null;
    return {
      schemaVersion: 2,
      version: active?.version || "端末保存データ",
      generation: makeGeneration(),
      updatedAt: active?.updatedAt || new Date().toISOString(),
      method: active?.method || "manual",
      sourceFiles: active?.sourceFiles || [],
      data
    };
  }
  async function prepareRemote(url) {
    if (busy) throw new Error("更新処理中です。");
    if (!navigator.onLine) throw new Error("オフラインです。保存済みデータを継続使用します。");
    busy = true;
    try {
      const manifestUrl = new URL(url, location.href);
      if (!safeUrl(manifestUrl.href)) throw new Error("HTTP(S)の更新先が必要です。");
      const manifest = JSON.parse(await getText(manifestUrl.href));
      if (manifest.schemaVersion !== 2 || typeof manifest.version !== "string" || !manifest.version.trim()) throw new Error("一括更新マニフェストの形式が不正です。");
      const data = {};
      await Promise.all(REQUIRED.map(async key => {
        const file = manifest.files?.[key];
        if (!file || !Number.isInteger(file.count) || file.count < 0 || !/^[a-f0-9]{64}$/i.test(file.sha256)) throw new Error(`${key}: 必須ファイル・件数・SHA-256が不足`);
        const target = new URL(file.url, manifestUrl);
        if (target.origin !== manifestUrl.origin || !safeUrl(target.href)) throw new Error(`${key}: 配信元が不一致`);
        const content = await getText(target.href);
        if (await digest(content) !== file.sha256.toLowerCase()) throw new Error(`${key}: 内容検証に失敗`);
        data[key] = JSON.parse(content);
      }));
      validate(data, manifest);
      return {
        schemaVersion: 2,
        version: manifest.version,
        generation: makeGeneration(),
        updatedAt: new Date().toISOString(),
        method: "automatic",
        sourceFiles: [manifestUrl.href],
        data
      };
    } finally { busy = false; }
  }
  async function activatePrepared(snapshot) {
    if (!snapshot?.data) throw new Error("検証済みの更新データがありません。");
    const backup = await backupFromCurrent();
    await activate(snapshot, backup);
    return snapshotInfo(active);
  }
  async function replace(url) {
    return activatePrepared(await prepareRemote(url));
  }
  async function commitPriceUpdate(update) {
    if (busy) throw new Error("更新処理中です。");
    busy = true;
    try {
      const version = String(update?.version || "").trim();
      if (!version) throw new Error("価格表バージョンがありません。");
      const data = await captureAppData({ tires: update.tires, wheels: update.wheels });
      validate(data, manifestFor(data, version));
      const backup = await backupFromCurrent();
      await activate({
        schemaVersion: 2,
        version,
        generation: makeGeneration(),
        updatedAt: new Date().toISOString(),
        method: update.method || "manual",
        sourceFiles: Array.isArray(update.sourceFiles) ? update.sourceFiles : [],
        data
      }, backup);
      return snapshotInfo(active);
    } finally { busy = false; }
  }
  async function exportBundle() {
    const s = window.IntegratedApp.state;
    const data = {
      tires: { summer: s.summerTireData, winter: s.winterTireData }, wheels: { bs: s.bsWheelData, other: s.otherWheelData },
      fitment: { vehicles: s.vehicles }, search: { vehicles: s.vehicleSearchRecords },
      service: await fetch("data/vehicle_service_specs.json").then(r => r.json()), images: s.imageMaster,
      labor: { laborCategories: s.settings.laborCategories, defaultCosts: s.settings.defaultCosts, setDiscountRate: s.settings.setDiscountRate }
    };
    const manifest = { schemaVersion: 2, version: new Date().toISOString(), files: {} };
    const zip = new JSZip();
    for (const key of REQUIRED) {
      const content = JSON.stringify(data[key]);
      manifest.files[key] = { url: `${key}.json`, count: count(key, data[key]), sha256: await digest(content) };
      zip.file(`${key}.json`, content);
    }
    validate(data, manifest); zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = "master-bundle.zip"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  window.MasterBundle = Object.freeze({
    ready,
    hasSnapshot: () => Boolean(active),
    generation: () => active?.generation || "",
    info: () => ({ active: snapshotInfo(active), previous: snapshotInfo(previous) }),
    clear: () => commit(null),
    localValue,
    markLocal,
    prepareRemote,
    activatePrepared,
    replace,
    commitPriceUpdate,
    restorePrevious,
    validate,
    count,
    exportBundle
  });
})();
