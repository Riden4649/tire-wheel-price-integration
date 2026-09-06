import fs from "node:fs";
import fitment from "../js/vehicle-fitment-v170.js";

const payload = JSON.parse(fs.readFileSync(new URL("../data/vehicles_2012_2026.json", import.meta.url)));
const golden = JSON.parse(fs.readFileSync(new URL("./vehicle-golden-v190.json", import.meta.url)));
const vehicles = fitment.normalizeDataset(payload);
const failures = [];
const makerCounts = Object.fromEntries([...new Set(vehicles.map(v => v.maker))].sort().map(maker => [maker, vehicles.filter(v => v.maker === maker).length]));
const nullFitment = vehicles.filter(v => [v.pcd, v.holes, v.hub_bore, v.fastener].some(value => value == null || value === ""));
const priorityToyota = new Map([
  ["GRMNヤリス", { code: "GXPA16", pcd: 114.3, holes: 5, hub: 60, fastener: "M12×P1.5" }],
  ["アルファードPHEV", { code: "AAHP45W", pcd: 120, holes: 5, hub: 60, fastener: "M14×P1.5 ナット締結" }],
  ["ヴェルファイアPHEV", { code: "AAHP45W", pcd: 120, holes: 5, hub: 60, fastener: "M14×P1.5 ナット締結" }],
]);

if (vehicles.length !== payload.record_count) failures.push("record_count不一致");
if (new Set(vehicles.map(v => v.vehicle_id)).size !== vehicles.length) failures.push("vehicle_id重複");
if ((makerCounts["レクサス"] || 0) < 10) failures.push("レクサス10世代未満");
for (const expected of golden.records) {
  const actual = vehicles.find(v => v.vehicle_id === expected.vehicle_id);
  if (!actual) { failures.push(`${expected.vehicle_id}欠落`); continue; }
  for (const [key, value] of Object.entries(expected)) if (key !== "vehicle_id" && JSON.stringify(actual[key]) !== JSON.stringify(value)) failures.push(`${expected.vehicle_id}.${key}基準差異`);
}
for (const [model, expected] of priorityToyota) {
  const actual = vehicles.find(v => v.model === model && v.model_codes.includes(expected.code));
  if (!actual) { failures.push(`${model}.${expected.code}欠落`); continue; }
  if (actual.pcd !== expected.pcd || actual.holes !== expected.holes || actual.hub_bore !== expected.hub || actual.fastener !== expected.fastener) failures.push(`${model}.${expected.code}取付規格差異`);
  if (!actual.sources.some(source => source.source_type === "vehicle_manufacturer_official")) failures.push(`${model}.${expected.code}メーカー公式根拠欠落`);
}
if (payload.vehicles.some(vehicle => (vehicle.sources || []).some(source => ["user_provided_matching_document", "user_supplied_manufacturer_matching_workbook"].includes(source.source_type)))) failures.push("ユーザー指定4資料に旧出典区分が残存");

console.log(JSON.stringify({ record_count: vehicles.length, maker_counts: makerCounts, lexus_count: makerCounts["レクサス"], golden_count: golden.records.length, null_fitment_count: nullFitment.length, null_fitment_ids: nullFitment.map(v => v.vehicle_id), failures }, null, 2));
if (failures.length) process.exitCode = 1;
