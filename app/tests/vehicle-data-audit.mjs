import fs from "node:fs";
import fitment from "../js/vehicle-fitment-v170.js";

const payload = JSON.parse(fs.readFileSync(new URL("../data/vehicles_2012_2026.json", import.meta.url)));
const golden = JSON.parse(fs.readFileSync(new URL("./vehicle-golden-v190.json", import.meta.url)));
const vehicles = fitment.normalizeDataset(payload);
const failures = [];
const makerCounts = Object.fromEntries([...new Set(vehicles.map(v => v.maker))].sort().map(maker => [maker, vehicles.filter(v => v.maker === maker).length]));
const nullFitment = vehicles.filter(v => [v.pcd, v.holes, v.hub_bore, v.fastener].some(value => value == null || value === ""));

if (vehicles.length !== payload.record_count) failures.push("record_count不一致");
if (new Set(vehicles.map(v => v.vehicle_id)).size !== vehicles.length) failures.push("vehicle_id重複");
if ((makerCounts["レクサス"] || 0) < 10) failures.push("レクサス10世代未満");
for (const expected of golden.records) {
  const actual = vehicles.find(v => v.vehicle_id === expected.vehicle_id);
  if (!actual) { failures.push(`${expected.vehicle_id}欠落`); continue; }
  for (const [key, value] of Object.entries(expected)) if (key !== "vehicle_id" && JSON.stringify(actual[key]) !== JSON.stringify(value)) failures.push(`${expected.vehicle_id}.${key}基準差異`);
}

console.log(JSON.stringify({ record_count: vehicles.length, maker_counts: makerCounts, lexus_count: makerCounts["レクサス"], golden_count: golden.records.length, null_fitment_count: nullFitment.length, null_fitment_ids: nullFitment.map(v => v.vehicle_id), failures }, null, 2));
if (failures.length) process.exitCode = 1;
