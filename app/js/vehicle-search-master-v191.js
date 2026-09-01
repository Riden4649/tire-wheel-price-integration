(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VehicleSearchMaster = Object.freeze(api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const text = value => String(value ?? "").trim();
  const unique = values => [...new Set(values.filter(Boolean))];
  const normalize = value => text(value).normalize("NFKC").toLowerCase()
    .replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/[\s\-‐‑‒–—―・_/]/g, "");

  function normalizeDataset(payload) {
    const records = Array.isArray(payload) ? payload : (Array.isArray(payload?.vehicles) ? payload.vehicles : []);
    return records.filter(record => record && record.search_enabled !== false && text(record.search_id) && text(record.maker) && text(record.model)).map(record => ({
      search_id: text(record.search_id), maker: text(record.maker), model: text(record.model), aliases: unique(Array.isArray(record.aliases) ? record.aliases.map(text) : []),
      market: text(record.market), fitment_ready: record.fitment_ready === true, fitment_status: text(record.fitment_status), fitment_note: text(record.fitment_note)
    }));
  }

  function modelVariants(model) {
    const known = {
      "ノア/ヴォクシー": ["ノア", "ヴォクシー"], "ノア/ヴォクシー/エスクァイア": ["ノア", "ヴォクシー", "エスクァイア"],
      "アルファード/ヴェルファイア": ["アルファード", "ヴェルファイア"], "カローラ/ツーリング/スポーツ": ["カローラ", "カローラツーリング", "カローラスポーツ"],
      "カローラ/フィールダー/アクシオ": ["カローラ", "カローラフィールダー", "カローラアクシオ"], "デミオ/MAZDA2": ["デミオ", "MAZDA2"],
      "eKワゴン/eKクロス": ["eKワゴン", "eKクロス"], "eKワゴン/eKカスタム": ["eKワゴン", "eKカスタム"]
    };
    return known[model] || [model, ...text(model).split(/[\/／]/)];
  }

  function names(record) { return unique([...modelVariants(record.model), ...(record.aliases || [])]).map(normalize); }

  function matchingVehicles(record, vehicles) {
    const recordNames = new Set(names(record));
    return vehicles.filter(vehicle => normalize(vehicle.maker) === normalize(record.maker) && names(vehicle).some(name => recordNames.has(name)));
  }

  function merge(vehicles, searchRecords) {
    const verified = (Array.isArray(vehicles) ? vehicles : []).map(vehicle => ({ ...vehicle, aliases: [...(vehicle.aliases || [])] }));
    const records = normalizeDataset(searchRecords).map(record => {
      const matches = matchingVehicles(record, verified);
      matches.forEach(vehicle => { vehicle.aliases = unique([...(vehicle.aliases || []), record.model, ...record.aliases]); });
      return { ...record, linked_vehicle_ids: matches.map(vehicle => vehicle.vehicle_id), has_verified_fitment: matches.length > 0 };
    });
    return { vehicles: verified, searchRecords: records, linkedCount: records.filter(record => record.has_verified_fitment).length };
  }

  return { normalize, normalizeDataset, matchingVehicles, merge };
});
