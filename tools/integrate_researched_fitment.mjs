import fs from 'node:fs';
import fitment from '../app/js/vehicle-fitment-v170.js';
const path = new URL('../app/data/vehicles_2012_2026.json', import.meta.url);
const patchPath = new URL('../app/data/vehicle-updates/researched-2026-09-06.json', import.meta.url);
const data = JSON.parse(fs.readFileSync(path));
const patch = JSON.parse(fs.readFileSync(patchPath));
for (const record of patch.updates) {
  const check = fitment.validateVehicleForApproval(record);
  if (!check.valid) throw new Error(check.errors.join('\n'));
  const old = data.vehicles.find(v => v.vehicle_id === record.vehicle_id);
  if (old && JSON.stringify(old) !== JSON.stringify(record)) throw new Error('Existing record conflict');
  if (!old) data.vehicles.push(record);
}
data.record_count = data.vehicles.length;
data.dataset_version = '2026-09-06-researched';
fs.writeFileSync(path, JSON.stringify(data, null, 2)+'\n');
const mp = new URL('../app/data/vehicle-updates/manifest.json', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(mp));
manifest.dataset_version = data.dataset_version;
manifest.generated_at = '2026-09-06T12:00:00+09:00';
manifest.patches = manifest.patches.filter(p => p.id !== data.dataset_version);
manifest.patches.push({id:data.dataset_version, url:'data/vehicle-updates/researched-2026-09-06.json', count:patch.updates.length, review_status:'reviewed_additions'});
fs.writeFileSync(mp, JSON.stringify(manifest,null,2)+'\n');
console.log({record_count:data.record_count,patch_count:patch.updates.length});
