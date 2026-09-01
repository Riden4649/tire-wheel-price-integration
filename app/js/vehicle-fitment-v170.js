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
    const normalized = {
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
    normalized.aliases = unique(splitValues(record.aliases));
    normalized.model_codes = unique(splitValues(record.model_codes));
    normalized.variants = (Array.isArray(record.variants) ? record.variants : []).map((variant, index) => ({
      ...variant,
      variant_id: text(variant.variant_id) || `${vehicleId}-V${index + 1}`,
      label: text(variant.label || variant.grade || variant.name) || `仕様${index + 1}`,
      year_from: text(variant.year_from || record.year_from),
      year_to: text(variant.year_to || record.year_to),
      grades: unique(splitValues(variant.grades || variant.grade)),
      drivetrain: text(variant.drivetrain),
      powertrain: text(variant.powertrain),
      oem_inches: parseOemInches(variant.oem_inch),
      oem_tires: parseOemTires(variant.oem_tire),
      front_tires: parseOemTires(variant.front_tires),
      rear_tires: parseOemTires(variant.rear_tires),
      confidence: text(variant.confidence || record.confidence).toUpperCase()
    }));
    return normalized;
  }

  function normalizeVehicleDatabase(payload) {
    const records = Array.isArray(payload) ? payload : (Array.isArray(payload?.vehicles) ? payload.vehicles : []);
    return records.map(normalizeVehicle).filter(Boolean);
  }

  function variants(vehicle, selectedYear) {
    const values = Array.isArray(vehicle?.variants) ? vehicle.variants : [];
    if (!selectedYear) return [...values];
    const year = Number(selectedYear);
    return values.filter(item => {
      const from = Number(text(item.year_from).slice(0, 4));
      const to = Number(text(item.year_to).slice(0, 4));
      return (!Number.isInteger(from) || year >= from) && (!Number.isInteger(to) || year <= to);
    });
  }

  function tireSizes(vehicle, options = {}) {
    const matching = variants(vehicle, options.year);
    if (matching.length) {
      const selected = options.variantId && matching.find(item => item.variant_id === options.variantId);
      const targets = selected ? [selected] : matching;
      const sizes = unique(targets.flatMap(item => [...item.oem_tires, ...item.front_tires, ...item.rear_tires]));
      if (sizes.length) return sizes;
    }
    if (Array.isArray(vehicle?.oem_tires)) return [...vehicle.oem_tires];
    return parseOemTires(vehicle?.oem_tire);
  }

  function validateVehicles(records) {
    const vehicles = normalizeVehicleDatabase(records);
    const errors = [];
    const ids = new Set();
    vehicles.forEach((vehicle, index) => {
      const at = `${vehicle.vehicle_id || `行${index + 1}`}`;
      if (ids.has(vehicle.vehicle_id)) errors.push(`${at}: vehicle_idが重複しています`);
      ids.add(vehicle.vehicle_id);
      if (!vehicle.maker || !vehicle.model || !vehicle.generation) errors.push(`${at}: メーカー・車種・世代は必須です`);
      if (!years(vehicle).length) errors.push(`${at}: 年式範囲が不正です`);
      if (!vehicle.oem_tires.length && !vehicle.variants.some(item => item.oem_tires.length || item.front_tires.length)) errors.push(`${at}: 純正タイヤサイズがありません`);
      tireSizes(vehicle).forEach(size => { if (!/^\d{3}\/\d{2}R\d{2}(?:\.5)?$/i.test(size)) errors.push(`${at}: タイヤサイズ ${size} を確認してください`); });
    });
    return { valid: errors.length === 0 && vehicles.length > 0, vehicles, errors };
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
    variants,
    validateVehicles,
    years,
    parseOemInches,
    parseOemTires,
    normalizeFastener,
    wheelInch,
    evaluateWheel,
    evaluate
  };
});
