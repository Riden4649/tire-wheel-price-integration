#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const baselineRef = process.argv[2] || 'fe0e145';
const root = new URL('../', import.meta.url);
const db = JSON.parse(fs.readFileSync(new URL('app/data/vehicles_2012_2026.json', root)));
const baseline = JSON.parse(execFileSync('git', ['show', `${baselineRef}:app/data/vehicles_2012_2026.json`], { encoding: 'utf8' }));
const ids = new Set(baseline.vehicles.map((record) => record.vehicle_id));
const updates = db.vehicles.filter((record) => !ids.has(record.vehicle_id));
const patchId = '2026-09-06-fitment-cumulative';
const patchUrl = 'data/vehicle-updates/fitment-cumulative-2026-09-06.json';

fs.writeFileSync(new URL(`app/${patchUrl}`, root), `${JSON.stringify({ schema_version: '1.0.0', updates }, null, 2)}\n`);
fs.writeFileSync(new URL('app/data/vehicle-updates/manifest.json', root), `${JSON.stringify({
  schema_version: '1.0.0', dataset_version: patchId, generated_at: new Date().toISOString(),
  patches: [{ id: patchId, url: patchUrl, count: updates.length, review_status: 'reviewed_additions' }],
}, null, 2)}\n`);
db.dataset_version = patchId;
fs.writeFileSync(new URL('app/data/vehicles_2012_2026.json', root), `${JSON.stringify(db, null, 2)}\n`);
console.log(JSON.stringify({ baseline: baseline.vehicles.length, current: db.vehicles.length, updates: updates.length }));
