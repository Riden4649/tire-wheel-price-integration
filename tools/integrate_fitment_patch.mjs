import fs from 'node:fs';
import fitment from '../app/js/vehicle-fitment-v170.js';
const patchFile = process.argv[2];
const patchId = process.argv[3];
if (!patchFile || !patchId) throw new Error('patch file and patch id required');
const root = new URL('../', import.meta.url);
const dbPath = new URL('app/data/vehicles_2012_2026.json', root);
const manifestPath = new URL('app/data/vehicle-updates/manifest.json', root);
const data = JSON.parse(fs.readFileSync(dbPath));
const patch = JSON.parse(fs.readFileSync(new URL(patchFile, root)));
const ids = new Set(data.vehicles.map(v => v.vehicle_id));
for (const record of patch.updates) {
  const check = fitment.validateVehicleForApproval(record);
  if (!check.valid) throw new Error(check.errors.join('\n'));
  if (ids.has(record.vehicle_id)) throw new Error(`duplicate ${record.vehicle_id}`);
  ids.add(record.vehicle_id); data.vehicles.push(record);
}
data.record_count = data.vehicles.length;
data.dataset_version = patchId;
fs.writeFileSync(dbPath, JSON.stringify(data, null, 2)+'\n');
const manifest = JSON.parse(fs.readFileSync(manifestPath));
manifest.dataset_version = patchId;
manifest.generated_at = new Date().toISOString();
manifest.patches = manifest.patches.filter(p => p.id !== patchId);
manifest.patches.push({ id:patchId, url:patchFile.replace(/^app\//,''), count:patch.updates.length, review_status:'reviewed_additions' });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2)+'\n');
console.log({record_count:data.record_count, added:patch.updates.length});
