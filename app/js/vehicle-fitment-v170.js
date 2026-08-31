(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VehicleFitment = Object.freeze(api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const text = value => String(value ?? "").trim();
  const number = value => {
    if (value == null || String(value).trim() === "") return null;
    const parsed = Number(String(value ?? "").normalize("NFKC").replace(/[^\d.+-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const unique = values => [...new Set(values.filter(value => value !== "" && value != null))];

  function splitValues(value) {
    if (Array.isArray(value)) return value.flatMap(splitValues);
    return text(value).normalize("NFKC").split(/[;,/、\s]+/).map(item => item.trim()).filter(Boolean);
  }

  function parseOemInches(value) {
    return unique(splitValues(value).map(item => number(item)).filter(item => item > 0));
  }

  function parseOemTires(value) {
    const values = Array.isArray(value)
      ? value.flatMap(parseOemTires)
      : text(value).normalize("NFKC").split(/[;,、\s]+/).filter(Boolean);
    return unique(values.map(item => item.toUpperCase().replace(/[\s　]/g, "")));
  }

  function normalizeFastener(value) {
    return text(value).normalize("NFKC").toUpperCase()
      .replace(/[×✕＊*]/g, "X")
      .replace(/\s+/g, "")
      .replace(/PITCH/g, "P")
      .replace(/^M?(\d+)XP?(\d+(?:\.\d+)?)$/, "M$1XP$2");
  }

  function normalizeVehicle(record) {
    if (!record || typeof record !== "object") return null;
    const vehicleId = text(record.vehicle_id);
    if (!vehicleId) return null;
    return {
      ...record,
      vehicle_id: vehicleId,
      maker: text(record.maker),
      model: text(record.model),
      generation: text(record.generation),
      year_from: text(record.year_from),
      year_to: text(record.year_to),
      pcd: number(record.pcd),
      holes: number(record.holes),
      hub_bore: number(record.hub_bore),
      fastener: text(record.fastener),
      oem_inches: parseOemInches(record.oem_inch),
      oem_tires: parseOemTires(record.oem_tire),
      confidence: text(record.confidence).toUpperCase(),
      weds_url: text(record.weds_url)
    };
  }

  function normalizeVehicleDatabase(payload) {
    const records = Array.isArray(payload) ? payload : (Array.isArray(payload?.vehicles) ? payload.vehicles : []);
    return records.map(normalizeVehicle).filter(Boolean);
  }

  function tireSizes(vehicle) {
    if (Array.isArray(vehicle?.oem_tires)) return [...vehicle.oem_tires];
    return parseOemTires(vehicle?.oem_tire);
  }

  function years(vehicle) {
    const from = Number(text(vehicle?.year_from).slice(0, 4));
    const to = Number(text(vehicle?.year_to).slice(0, 4));
    if (!Number.isInteger(from) || !Number.isInteger(to) || to < from) return [];
    return Array.from({ length: to - from + 1 }, (_, index) => from + index);
  }

  function upsertVehicles(current, updates) {
    const map = new Map(normalizeVehicleDatabase(current).map(vehicle => [vehicle.vehicle_id, vehicle]));
    normalizeVehicleDatabase(updates).forEach(vehicle => {
      const previous = map.get(vehicle.vehicle_id);
      map.set(vehicle.vehicle_id, previous ? normalizeVehicle({ ...previous, ...vehicle }) : vehicle);
    });
    return [...map.values()];
  }

  function wheelInch(wheel) {
    const direct = number(wheel?.inch);
    if (direct > 0) return direct;
    const match = text(wheel?.sizeText || wheel?.size).normalize("NFKC").match(/(?:^|\D)(\d{2})(?=\s*[X×]|\D|$)/i);
    return match ? Number(match[1]) : null;
  }

  function wheelHubBore(wheel) {
    return number(wheel?.hub_bore ?? wheel?.hubBore ?? wheel?.hubDiameter ?? wheel?.hub);
  }

  function wheelFastener(wheel) {
    return text(wheel?.fastener ?? wheel?.mountingStandard ?? wheel?.mounting_standard ?? wheel?.boltSpec);
  }

  function evaluateWheel(vehicleInput, wheel = {}) {
    const vehicle = normalizeVehicle(vehicleInput);
    if (!vehicle) return { status: "excluded", label: "× 除外", reasons: ["車両データが不正です"], checks: {} };

    const values = {
      pcd: number(wheel.pcd),
      holes: number(wheel.holes),
      inch: wheelInch(wheel),
      hub_bore: wheelHubBore(wheel),
      fastener: wheelFastener(wheel)
    };
    const checks = {
      pcd: values.pcd != null && vehicle.pcd != null ? Math.abs(values.pcd - vehicle.pcd) < 0.01 : null,
      holes: values.holes != null && vehicle.holes != null ? values.holes === vehicle.holes : null,
      inch: values.inch != null && vehicle.oem_inches.length ? vehicle.oem_inches.includes(values.inch) : null,
      hub_bore: values.hub_bore != null && vehicle.hub_bore != null ? values.hub_bore >= vehicle.hub_bore : null,
      fastener: values.fastener && vehicle.fastener ? normalizeFastener(values.fastener) === normalizeFastener(vehicle.fastener) : null
    };
    const names = { pcd: "PCD", holes: "穴数", inch: "インチ", hub_bore: "ハブ径", fastener: "取付規格" };
    const mismatches = Object.keys(checks).filter(key => checks[key] === false);
    const missing = Object.keys(checks).filter(key => checks[key] === null);

    if (mismatches.length) {
      return { status: "excluded", label: "× 除外", reasons: mismatches.map(key => `${names[key]}が不一致`), checks, values };
    }
    if (missing.length) {
      return { status: "review", label: "△ 要確認", reasons: missing.map(key => `${names[key]}を確認できません`), checks, values };
    }
    return { status: "candidate", label: "○ 候補", reasons: ["基本適合条件が一致"], checks, values };
  }

  function evaluate(vehicle, wheel, selectedTire) {
    if (!selectedTire) return evaluateWheel(vehicle, wheel);
    const tireValue = typeof selectedTire === "string"
      ? selectedTire
      : (selectedTire.size || selectedTire.baseSize || selectedTire.oem_tire || "");
    const tireMatch = text(tireValue).normalize("NFKC").toUpperCase().match(/(?:R|RF)(\d{2}(?:\.5)?)/);
    if (!tireMatch) return evaluateWheel(vehicle, wheel);
    return evaluateWheel({ ...vehicle, oem_inch: tireMatch[1] }, wheel);
  }

  return {
    normalizeVehicle,
    normalizeDataset: normalizeVehicleDatabase,
    normalizeVehicleDatabase,
    upsertVehicles,
    tireSizes,
    years,
    parseOemInches,
    parseOemTires,
    normalizeFastener,
    wheelInch,
    evaluateWheel,
    evaluate
  };
});
