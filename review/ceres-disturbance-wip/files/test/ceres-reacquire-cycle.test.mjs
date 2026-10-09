import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {restore,capture,pose} from './ceres-reacquire-harness.mjs';
import {snapshotFeatureMaps,applyFeatureConfigToMaps,restoreFeatureMaps} from '../src/data/featureFlags.js';
import {PRODUCTION_FEATURES} from '../src/runtime/runtimeProfiles.js';
import {CERES_WORKFLEET_CONTRACT as C} from '../src/data/ceresWorkfleet.js';
const input=file=>JSON.parse(readFileSync(new URL('./fixtures/ceres-handoff/'+file,import.meta.url)));
for(const file of ['seed47-head-return-entry.json','seed47-mid-head-return.json'])test(`${file}: reacquires the actually released displaced plate and resumes physical extraction with Continue`,async()=>{
 const prior=snapshotFeatureMaps();applyFeatureConfigToMaps(PRODUCTION_FEATURES);const h=await restore(input(file));let resumed=null;
 const original=h.b.section,life=original.occupantGeneration;let sawReacquire=false,sawPlateLease=false,plateBeforeTow=null,entered=null;
 try{
  for(let i=0;i<26000;i++){
   h.sim.step();const j=h.job();sawReacquire||=j.phase==='reacquire';sawPlateLease||=original.data.jobId===j.id;
   if(j.phase==='reacquire'&&!entered)entered={...h.b.breaker.pos};
   if(j.phase==='reacquire'&&!resumed&&j.reacquire?.leg==='approach'&&Math.hypot(h.b.breaker.pos.x-entered.x,h.b.breaker.pos.z-entered.z)>2){
    const saved=capture(h);resumed=await restore(saved);
    for(const role of ['breaker','cutterHead','section'])assert.deepEqual(pose(resumed.b[role]),JSON.parse(JSON.stringify(pose(h.b[role]))),'typed Continue begins at the exact measured pose and momentum');
    assert.equal(resumed.job().phase,'reacquire');assert.deepEqual(resumed.job().reacquire,saved.jobs.ceresWorkfleet.reacquire);
    assert.equal(Object.values(resumed.state.combat.attachments.byId).filter(a=>a.state==='active').length,1,'only the existing head mount is rebound; no ghost tow');
   }
   if(!j.towId)plateBeforeTow={...original.pos};
   if(resumed)resumed.sim.step();
   if(j.phase==='extract'&&(!resumed||resumed.job().phase==='extract')){
    for(let k=0;k<600;k++){h.sim.step();resumed?.sim.step();}break;
   }
  }
  console.log('REACQUIRE_FINAL_DIAGNOSTIC',JSON.stringify({file,job:h.job(),breaker:pose(h.b.breaker),head:pose(h.b.cutterHead),section:pose(h.b.section),continued:resumed&&resumed.job()}));
  assert.equal(h.job().phase,'extract','released cargo is physically reacquired instead of permanently waiting at commissioning');
  assert.ok(sawReacquire);assert.ok(sawPlateLease);assert.ok(resumed,'Continue is exercised during approach, before tow');
  assert.ok(plateBeforeTow.z-C.sitePlacement.pos.z>7,'observed free plate really displaced before reacquisition');
  assert.equal(h.b.section,original);assert.equal(original.occupantGeneration,life);assert.equal(original.mass,1800);
  for(const q of [h,resumed]){
   const line=q.service.get(q.job().towId);assert.equal(line.state,'active');assert.equal(line.targetId,q.b.section.id);
   assert.equal(q.b.section.data.jobId,undefined,'temporary pre-tow residency lease is released at real tow handoff');
   assert.equal(q.physics._sg02.records.get(q.b.section.id)?.entity,q.b.section);
   assert.equal(q.state.entityList.filter(e=>e.alive&&e.data?.worldRecordId===C.identities.payload).length,1);
   assert.equal(q.b.section.mass,1800);assert.ok(q.b.section.pos.z<plateBeforeTow.z-2,'existing native line resumes actual extraction');
  }
  console.log('CERES_REACQUIRE_CYCLE',JSON.stringify({file,tick:h.state.tick,continuedTick:resumed.state.tick,plateBeforeTow,after:original.pos,towId:h.job().towId}));
 }finally{resumed?.close();h.close();restoreFeatureMaps(prior);}
});
