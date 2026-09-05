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

  function parseFastener(value, source = {}) {
    const raw = typeof value === "object" && value ? value : source;
    const label = typeof value === "string" ? value : text(source.fastener);
    const normalized = normalizeFastener(label);
    const thread = normalized.match(/M(\d+(?:\.\d+)?)XP(\d+(?:\.\d+)?)/);
    const seatText = text(raw.seat_type || raw.seat || source.seat_type || source.oem_seat).toLowerCase();
    const methodText = text(raw.fastener_type || raw.method || source.fastener_type).toLowerCase();
    return {
      method: /bolt|ボルト/.test(methodText || label.toLowerCase()) ? "bolt" : /nut|ナット/.test(methodText || label.toLowerCase()) ? "nut" : null,
      thread_diameter: text(raw.thread_diameter || source.thread_diameter) || (thread ? `M${thread[1]}` : ""),
      pitch: number(raw.pitch ?? raw.thread_pitch ?? source.pitch ?? source.thread_pitch) ?? (thread ? Number(thread[2]) : null),
      seat: /球|spherical/.test(seatText || label) ? "spherical" : /テーパ|taper/.test(seatText || label) ? "taper" : /平面|flat/.test(seatText || label) ? "flat" : "unknown"
    };
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
    const fastener = parseFastener(record.fastener_details || record.fastener, record);
    normalized.fastener_type = fastener.method;
    normalized.thread_diameter = fastener.thread_diameter;
    normalized.pitch = fastener.pitch;
    normalized.seat_type = fastener.seat;
    normalized.rim_width_min = number(record.rim_width_min);
    normalized.rim_width_max = number(record.rim_width_max);
    normalized.offset_min = number(record.offset_min);
    normalized.offset_max = number(record.offset_max);
    normalized.wheel_torque_nm = number(record.wheel_torque_nm);
    normalized.wheel_torque_nm_min = number(record.wheel_torque_nm_min);
    normalized.wheel_torque_nm_max = number(record.wheel_torque_nm_max);
    normalized.torque_source = text(record.torque_source);
    normalized.tpms = text(record.tpms || "unknown");
    normalized.front_rear_staggered = Boolean(record.front_rear_staggered || normalized.variants.some(item => item.front_tires.length && item.rear_tires.length));
    return normalized;
  }

  function normalizeVehicleDatabase(payload) {
    const records = Array.isArray(payload) ? payload : (Array.isArray(payload?.vehicles) ? payload.vehicles : (Array.isArray(payload?.updates) ? payload.updates : (Array.isArray(payload?.candidates) ? payload.candidates : [])));
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

  function validateVehicleForApproval(record) {
    const result = validateVehicles([record]);
    const vehicle = result.vehicles[0];
    const errors = [...result.errors];
    if (!vehicle) return { valid: false, vehicle: null, errors: ["車種データがありません"] };
    if (vehicle.pcd == null || vehicle.holes == null || vehicle.hub_bore == null || !vehicle.fastener || !vehicle.oem_inches.length) errors.push(`${vehicle.vehicle_id}: PCD・穴数・ハブ径・取付規格・純正インチは必須です`);
    const sources = Array.isArray(record.sources) ? record.sources : [];
    if (!sources.length) errors.push(`${vehicle.vehicle_id}: 情報源が必要です`);
    sources.forEach((source, index) => {
      if (!text(source.source_name) || !/^https:\/\//i.test(text(source.source_url))) errors.push(`${vehicle.vehicle_id}: 情報源${index + 1}の名称とHTTPS URLを確認してください`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text(source.verified_at))) errors.push(`${vehicle.vehicle_id}: 情報源${index + 1}の確認日はYYYY-MM-DDで入力してください`);
    });
    return { valid: errors.length === 0, vehicle, errors };
  }

  function years(vehicle) {
    const from = Number(text(vehicle?.year_from).slice(0, 4));
    const to = Number(text(vehicle?.year_to).slice(0, 4));
    if (!Number.isInteger(from) || !Number.isInteger(to) || to < from) return [];
    return Array.from({ length: to - from + 1 }, (_, index) => from + index);
  }

  function upsertVehicles(current, updates) {
    const map = new Map(normalizeVehicleDatabase(current).map(vehicle => [vehicle.vehicle_id, vehicle]));
    const rawUpdates = Array.isArray(updates) ? updates : (updates?.updates || updates?.vehicles || []);
    rawUpdates.forEach(update => {
      const vehicleId = text(update?.vehicle_id);
      if (!vehicleId) return;
      const previous = map.get(vehicleId);
      const vehicle = normalizeVehicle(previous ? { ...previous, ...update, vehicle_id: vehicleId } : update);
      if (vehicle) map.set(vehicleId, vehicle);
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

  function wheelRimWidth(wheel) {
    const direct = number(wheel?.rim_width ?? wheel?.rimWidth);
    if (direct) return direct;
    const match = text(wheel?.sizeText || wheel?.size).normalize("NFKC").match(/\d{2}(?:\.\d)?\s*[X×]\s*(\d+(?:\.\d+)?)/i);
    return match ? Number(match[1]) : null;
  }

  function wheelOffset(wheel) {
    return number(wheel?.offset ?? wheel?.inset ?? wheel?.insetText);
  }

  function evaluateWheel(vehicleInput, wheel = {}) {
    const vehicle = normalizeVehicle(vehicleInput);
    if (!vehicle) return { status: "excluded", label: "× 除外", reasons: ["車両データが不正です"], checks: {} };

    const values = {
      pcd: number(wheel.pcd),
      holes: number(wheel.holes),
      inch: wheelInch(wheel),
      hub_bore: wheelHubBore(wheel),
      fastener: wheelFastener(wheel),
      rim_width: wheelRimWidth(wheel),
      offset: wheelOffset(wheel)
    };
    const vehicleFastener = parseFastener(vehicle.fastener_details || vehicle.fastener, vehicle);
    const wheelFastenerDetails = parseFastener(wheel.fastener_details || values.fastener, wheel);
    const checks = {
      pcd: values.pcd != null && vehicle.pcd != null ? Math.abs(values.pcd - vehicle.pcd) < 0.01 : null,
      holes: values.holes != null && vehicle.holes != null ? values.holes === vehicle.holes : null,
      inch: values.inch != null && vehicle.oem_inches.length ? vehicle.oem_inches.includes(values.inch) : null,
      hub_bore: values.hub_bore != null && vehicle.hub_bore != null ? values.hub_bore >= vehicle.hub_bore : null,
      fastener_type: wheelFastenerDetails.method && vehicleFastener.method ? wheelFastenerDetails.method === vehicleFastener.method : (values.fastener && vehicle.fastener && normalizeFastener(values.fastener) === normalizeFastener(vehicle.fastener) ? true : null),
      thread_diameter: wheelFastenerDetails.thread_diameter && vehicleFastener.thread_diameter ? wheelFastenerDetails.thread_diameter === vehicleFastener.thread_diameter : null,
      pitch: wheelFastenerDetails.pitch != null && vehicleFastener.pitch != null ? Math.abs(wheelFastenerDetails.pitch - vehicleFastener.pitch) < 0.01 : null
    };
    const names = { pcd: "PCD", holes: "穴数", inch: "インチ", hub_bore: "ハブ径", fastener_type: "ナット/ボルト方式", thread_diameter: "ねじ径", pitch: "ピッチ" };
    const mismatches = Object.keys(checks).filter(key => checks[key] === false);
    const missing = Object.keys(checks).filter(key => checks[key] === null);
    const cautions = [];
    if (vehicleFastener.seat !== "unknown" && wheelFastenerDetails.seat !== "unknown" && vehicleFastener.seat !== wheelFastenerDetails.seat) cautions.push(vehicleFastener.seat === "spherical" && wheelFastenerDetails.seat === "taper" ? "社外ホイール用テーパーナットが必要な可能性があります（純正球面ナット流用不可）" : "座面形状が異なるため取付部品を確認してください");
    if (values.hub_bore != null && vehicle.hub_bore != null && values.hub_bore > vehicle.hub_bore + 0.5) cautions.push("ハブリングの要否を確認してください");
    if (values.rim_width != null && ((vehicle.rim_width_min != null && values.rim_width < vehicle.rim_width_min) || (vehicle.rim_width_max != null && values.rim_width > vehicle.rim_width_max))) cautions.push("リム幅が確認済み候補範囲外です");
    if (values.offset != null && ((vehicle.offset_min != null && values.offset < vehicle.offset_min) || (vehicle.offset_max != null && values.offset > vehicle.offset_max))) cautions.push("インセットが確認済み候補範囲外です");
    if (["C", "D"].includes(vehicle.confidence)) cautions.push(`車両データ信頼度${vehicle.confidence}：未確認項目があります`);

    if (mismatches.length) {
      return { status: "excluded", label: "× 除外", reasons: mismatches.map(key => `${names[key]}が不一致`), checks, values, cautions };
    }
    if (missing.length || cautions.length) {
      return { status: "review", label: "△ 要確認", reasons: [...missing.map(key => `${names[key]}を確認できません`), ...cautions], checks, values, cautions };
    }
    return { status: "candidate", label: "○ 基本候補", reasons: ["基本物理条件が一致"], checks, values, cautions };
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
    validateVehicleForApproval,
    years,
    parseOemInches,
    parseOemTires,
    normalizeFastener,
    parseFastener,
    wheelRimWidth,
    wheelOffset,
    wheelInch,
    evaluateWheel,
    evaluate
  };
});

(function () {
  "use strict";
  if (typeof document === "undefined") return;
  let serviceSpecs = [];

  function normalizeMaker(value) {
    return String(value || "").replace(/^TOYOTA$/i, "トヨタ").replace(/^HONDA$/i, "ホンダ").trim();
  }

  function selectedVehicleFromSummary(summary) {
    const strong = summary.querySelector("strong");
    const spans = summary.querySelectorAll("span");
    if (!strong || !spans.length) return null;
    const head = strong.textContent.trim();
    const parts = head.split(" / ");
    const makerModel = parts[0] || "";
    const generation = parts[1] || "";
    const makers = ["トヨタ", "レクサス", "日産", "ホンダ", "マツダ", "SUBARU", "スバル", "スズキ", "ダイハツ", "三菱"];
    const maker = makers.find(value => makerModel.startsWith(value + " ")) || "";
    const model = maker ? makerModel.slice(maker.length + 1).trim() : makerModel;
    const yearMatch = spans[0].textContent.match(/(20\d{2})年/);
    return { maker: normalizeMaker(maker), model, generation, year: yearMatch ? Number(yearMatch[1]) : null };
  }

  function matchSpec(selected) {
    if (!selected || !selected.year) return null;
    return serviceSpecs.find(spec => normalizeMaker(spec.maker) === selected.maker && spec.model === selected.model && selected.year >= Number(spec.year_from || 0) && selected.year <= Number(spec.year_to || 9999)) || null;
  }

  function renderServiceInfo() {
    const summary = document.querySelector("#vehicleSummary");
    if (!summary || summary.hidden) return;
    const old = summary.querySelector(".vehicle-service-info");
    const selected = selectedVehicleFromSummary(summary);
    const spec = matchSpec(selected);
    const signature = JSON.stringify({ selected, spec });
    if (old?.dataset.signature === signature) return;
    if (old) old.remove();
    const box = document.createElement("div");
    box.className = "vehicle-service-info";
    box.dataset.signature = signature;
    box.style.cssText = "margin-top:6px;padding:6px 8px;border-radius:8px;background:rgba(47,107,87,.08);font-size:12px;line-height:1.45;text-align:right;align-self:flex-end";
    if (spec) {
      const torque = spec.torque_label || (spec.wheel_torque_nm != null ? `${spec.wheel_torque_nm} N・m` : "未確認");
      const title = document.createElement("strong"); title.textContent = `ホイール締付 ${torque}`;
      const source = document.createElement("span"); source.textContent = `メーカー公式確認済み ${spec.verified_at || ""}`;
      box.append(title, document.createElement("br"), source);
      if (spec.source_url) {
        box.title = `${spec.source_name || "メーカー公式資料"}\n${spec.source_url}`;
      }
    } else {
      box.innerHTML = `<span style=\"opacity:.62\">🔧 締付トルク：未確認</span>`;
    }
    summary.appendChild(box);
  }

  async function initializeServiceInfo() {
    document.addEventListener("vehicle-service:loaded", event => { serviceSpecs = event.detail; renderServiceInfo(); });
    try {
      const response = await fetch("data/vehicle_service_specs.json", { cache: "no-store" });
      if (response.ok) {
        const payload = await response.json();
        serviceSpecs = Array.isArray(payload.records) ? payload.records : [];
      }
    } catch (_) {}
    const summary = document.querySelector("#vehicleSummary");
    if (!summary) return;
    const observer = new MutationObserver(() => window.requestAnimationFrame(renderServiceInfo));
    observer.observe(summary, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    renderServiceInfo();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializeServiceInfo, { once: true });
  else initializeServiceInfo();
})();
