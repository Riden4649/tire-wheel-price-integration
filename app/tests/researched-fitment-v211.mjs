import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import fitment from '../js/vehicle-fitment-v170.js';
import search from '../js/vehicle-search-master-v191.js';
const read = name => JSON.parse(fs.readFileSync(new URL('../data/'+name,import.meta.url)));
const patch = read('vehicle-updates/researched-2026-09-06.json');
const db = read('vehicles_2012_2026.json');
const before = JSON.parse(execFileSync('git',['show','97918a9:app/data/vehicles_2012_2026.json'],{encoding:'utf8'}));
assert.equal(patch.updates.length,55);
assert.equal(db.record_count,208);
for (const old of before.vehicles) assert.deepEqual(db.vehicles.find(v=>v.vehicle_id===old.vehicle_id),old);
for (const row of patch.updates) {
  assert.ok(fitment.validateVehicleForApproval(row).valid);
  assert.ok(row.year_from < row.year_to);
  assert.ok(row.source_document.rows.length);
  assert.ok(row.sources.every(s=>s.verified_at==='2026-09-06'));
}
assert.equal(search.merge(fitment.normalizeDataset(db),read('jp_vehicle_search_master_2000_2026_v1.json')).linkedCount,138);
const ct=patch.updates.find(v=>v.model==='CT');
assert.equal(ct.year_to,'2022-11');assert.equal(ct.pcd,100);assert.equal(ct.holes,5);assert.equal(ct.hub_bore,54);
const code=fs.readFileSync(new URL('../js/app-v174-core.js',import.meta.url),'utf8');
const handler=code.slice(code.indexOf('  async function checkVehicleUpdates()'),code.indexOf('  async function importVehicleMaster'));
async function scenario({cancel=false,broken=false,fail=false,offline=false,applied=false}={}) {
  let writes=0;let saved=[];const original=fitment.normalizeDataset(before);
  const state={vehicles:original,vehicleSearchRecords:read('jp_vehicle_search_master_2000_2026_v1.json')};
  const els={checkVehicleUpdates:{disabled:false},vehicleMasterStatus:{},vehicleMasterBadge:{}};
  const context={state,els,navigator:{onLine:!offline},location:{href:'https://example.test/',origin:'https://example.test'},URL,APP_VERSION:'test',
    renderVehicleChips(){},renderTires(){},renderWheels(){},async refreshMissingVehicleAdmin(){},
    async fetch(url){assert.ok(String(url).includes('__bundle_update'));return {ok:true,async json(){return String(url).includes('manifest')?{dataset_version:'test',patches:[{id:'test',url:'data/vehicle-updates/researched-2026-09-06.json',count:55,review_status:'reviewed_additions'}]}:broken?{updates:[]}:patch;}}},
    window:{confirm:()=>!cancel,VehicleFitment:fitment,VehicleSearchMaster:search,MasterBundle:{generation:()=> 'old-price',hasSnapshot:()=>true},VehicleStore:{
      getMetadata:async()=>applied?['test']:[],getVehicleOverrides:async()=>saved,
      applyPublishedAdditions:async rows=>{if(fail)throw new Error('quota');writes++;saved=rows;}
    }}};
  vm.createContext(context);vm.runInContext(handler+'\nthis.run=checkVehicleUpdates;',context);await context.run();
  assert.equal(els.checkVehicleUpdates.disabled,false);
  if(cancel||broken||fail||offline||applied){assert.equal(writes,0);assert.equal(state.vehicles.length,153);}
  else {assert.equal(writes,1);assert.equal(state.vehicles.length,208);assert.ok(saved.every(x=>x._publishedAddition));}
}
for(const settings of [{},{cancel:true},{broken:true},{fail:true},{offline:true},{applied:true}])await scenario(settings);
console.log('PASS: 55 additions, 153 preserved, 138 linked models; update/cancel/corruption/save failure/offline/idempotency');
