(function (root) {
  "use strict";

  const DB_NAME = "integrated-vehicle-store-v1";
  const DB_VERSION = 1;
  const FALLBACK_OVERRIDES = "integrated-vehicle-overrides-v1";
  const FALLBACK_MISSING = "integrated-missing-vehicles-v1";

  function openDb() {
    if (!root.indexedDB) return Promise.resolve(null);
    return new Promise(resolve => {
      const request = root.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("vehicle_overrides")) db.createObjectStore("vehicle_overrides", { keyPath: "vehicle_id" });
        if (!db.objectStoreNames.contains("missing_vehicles")) db.createObjectStore("missing_vehicles", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }

  async function getAll(storeName, fallbackKey) {
    const db = await openDb();
    if (!db) return readFallback(fallbackKey);
    return new Promise(resolve => {
      const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve(readFallback(fallbackKey));
    });
  }

  async function putAll(storeName, records, fallbackKey) {
    const values = Array.isArray(records) ? records : [];
    const db = await openDb();
    if (!db) return mergeFallback(fallbackKey, values, storeName === "vehicle_overrides" ? "vehicle_id" : "key");
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      values.forEach(record => store.put(record));
      tx.oncomplete = () => resolve(values.length);
      tx.onerror = () => reject(tx.error || new Error("端末DBへ保存できませんでした。"));
    });
  }

  async function recordMissing(input) {
    const now = new Date().toISOString();
    const key = missingKey(input);
    const current = (await getAll("missing_vehicles", FALLBACK_MISSING)).find(item => item.key === key);
    const record = {
      key,
      maker: clean(input.maker),
      model: clean(input.model),
      year: clean(input.year),
      model_code: clean(input.model_code),
      tire_size: clean(input.tire_size).toUpperCase(),
      count: Number(current?.count || 0) + 1,
      first_seen: current?.first_seen || now,
      last_seen: now,
      sync_status: "local_only"
    };
    await putAll("missing_vehicles", [record], FALLBACK_MISSING);
    return record;
  }

  async function clearMissing() {
    const db = await openDb();
    if (!db) {
      root.localStorage?.removeItem(FALLBACK_MISSING);
      return;
    }
    await new Promise((resolve, reject) => {
      const tx = db.transaction("missing_vehicles", "readwrite");
      tx.objectStore("missing_vehicles").clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  function missingKey(input) {
    return [input.maker, input.model, input.year, input.model_code, input.tire_size].map(normalize).join("|");
  }

  function normalize(value) {
    return clean(value).normalize("NFKC").toLowerCase().replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60)).replace(/[^a-z0-9ぁ-ん一-龯]/g, "");
  }

  function clean(value) { return String(value ?? "").trim(); }
  function readFallback(key) {
    try { return JSON.parse(root.localStorage?.getItem(key) || "[]"); } catch { return []; }
  }
  function mergeFallback(key, values, idKey) {
    const map = new Map(readFallback(key).map(item => [item[idKey], item]));
    values.forEach(item => map.set(item[idKey], item));
    root.localStorage?.setItem(key, JSON.stringify([...map.values()]));
    return values.length;
  }

  root.VehicleStore = Object.freeze({
    getVehicleOverrides: () => getAll("vehicle_overrides", FALLBACK_OVERRIDES),
    upsertVehicleOverrides: records => putAll("vehicle_overrides", records, FALLBACK_OVERRIDES),
    listMissing: () => getAll("missing_vehicles", FALLBACK_MISSING),
    recordMissing,
    clearMissing,
    missingKey
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
