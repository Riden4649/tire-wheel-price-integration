import fs from "node:fs";
import fitment from "../js/vehicle-fitment-v170.js";
import searchMaster from "../js/vehicle-search-master-v191.js";

const searchPayload = JSON.parse(fs.readFileSync(new URL("../data/jp_vehicle_search_master_2000_2026_v1.json", import.meta.url)));
const fitmentPayload = JSON.parse(fs.readFileSync(new URL("../data/vehicles_2012_2026.json", import.meta.url)));
const searchRecords = searchMaster.normalizeDataset(searchPayload);
const verified = fitment.normalizeDataset(fitmentPayload);
const merged = searchMaster.merge(verified, searchPayload);
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const makerCounts = Object.fromEntries([...new Set(searchRecords.map(v => v.maker))].sort().map(maker => [maker, searchRecords.filter(v => v.maker === maker).length]));
const expectedMakers = { "トヨタ":165, "レクサス":22, "日産":76, "ホンダ":69, "マツダ":47, "SUBARU":34, "スズキ":44, "ダイハツ":39, "三菱":49 };

expect(searchRecords.length === 545 && searchPayload.record_count === 545, "補完マスター545件不一致");
expect(new Set(searchRecords.map(v => v.search_id)).size === 545, "search_id重複");
expect(Object.entries(expectedMakers).every(([maker, count]) => makerCounts[maker] === count), "メーカー別件数不一致");
expect(searchRecords.every(v => v.fitment_ready === false), "fitment_ready:trueが混入");
const lexusExpected = ["CT","ES","GS","GS F","GX","HS","IS","IS F","LBX","LC","LFA","LM","LS","LX","NX","RC","RC F","RX","RZ","SC","UX","UX EV"];
const lexusActual = searchRecords.filter(v => v.maker === "レクサス").map(v => v.model);
expect(lexusExpected.every(model => lexusActual.includes(model)) && lexusActual.length === 22, "レクサス22車種不一致");
const fitmentKeys = ["pcd","holes","hub_bore","fastener","oem_inch","oem_tire","confidence","variants"];
expect(verified.every((before, index) => fitmentKeys.every(key => JSON.stringify(before[key]) === JSON.stringify(merged.vehicles[index][key]))), "補完マージが既存適合値を変更");
expect(merged.searchRecords.some(v => v.has_verified_fitment) && merged.searchRecords.some(v => !v.has_verified_fitment), "適合あり/なしの分類失敗");
expect(merged.searchRecords.filter(v => v.maker === "レクサス").every(v => v.model && v.aliases.length), "レクサスaliases欠落");

console.log(JSON.stringify({ search_count: searchRecords.length, maker_counts: makerCounts, lexus_search_count: lexusActual.length, verified_fitment_count: verified.length, linked_search_records: merged.linkedCount, search_only_records: searchRecords.length - merged.linkedCount, failures }, null, 2));
if (failures.length) process.exitCode = 1;
