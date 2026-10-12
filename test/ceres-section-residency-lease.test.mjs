import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {restore,capture,pose,initialRecoveryWire} from './ceres-reacquire-harness.mjs';
import {snapshotFeatureMaps,applyFeatureConfigToMaps,restoreFeatureMaps} from '../src/data/featureFlags.js';
import {PRODUCTION_FEATURES} from '../src/runtime/runtimeProfiles.js';
import {CERES_WORKFLEET_CONTRACT as C} from '../src/data/ceresWorkfleet.js';
import {ceresWorkfleetRetainsSection,clearCeresWorkfleetControls,syncCeresWorkfleetActivity} from '../src/systems/ceresWorkfleet.js';
import {reconcileWorldSiteResidency} from '../src/systems/worldSiteRuntime.js';
const prior=snapshotFeatureMaps();
const wire=JSON.parse(readFileSync(new URL('./fixtures/ceres-handoff/seed47-mid-head-return.json',import.meta.url)));
test.before(()=>applyFeatureConfigToMaps(PRODUCTION_FEATURES));
test.after(()=>restoreFeatureMaps(prior));
const retire=h=>reconcileWorldSiteResidency(h.state,h.sites.ctx.helpers);
test('far-player Continue keeps the original released section resident without altering its motion',async()=>{
 const h=await restore(wire);let continued;
 try{
  const player=h.state.entities.get(h.state.playerId);
  assert.ok(Math.hypot(player.pos.x-h.b.section.pos.x,player.pos.z-h.b.section.pos.z)>2000);
  assert.equal(ceresWorkfleetRetainsSection(h.state,h.b.section),true);
  const before=pose(h.b.section);retire(h);
  assert.equal(h.b.section.alive,true);assert.deepEqual(pose(h.b.section),before);
  h.sim.step();assert.equal(h.b.section.alive,true);
  continued=await restore(capture(h));
  assert.deepEqual(pose(continued.b.section),pose(h.b.section));
  retire(continued);continued.sim.step();
  assert.equal(continued.b.section.alive,true);
  assert.equal(ceresWorkfleetRetainsSection(continued.state,continued.b.section),true);
  assert.equal(continued.state.entityList.filter(e=>e.alive&&e.data?.worldRecordId===C.identities.payload).length,1);
 }finally{continued?.close();h.close();}
});
for(const kind of ['terminal','saved-marker-only','job-replaced','section-life','worker-life','head-life','cradle-life','worker-destroyed','worker-record-destroyed','player-custody','remote-section','nan-position','infinite-position','expired-budget','broken-mount','restore-teardown'])test(`site retirement rejects ${kind} section leases`,async()=>{
 const h=await restore(wire);try{
  assert.equal(ceresWorkfleetRetainsSection(h.state,h.b.section),true);
  if(kind==='terminal')h.job().phase='secured';
  if(kind==='saved-marker-only'){clearCeresWorkfleetControls(h.state);h.b.section.data.jobId=h.job().id;}
  if(kind==='job-replaced')h.state.npcJobs.ceresWorkfleet={...h.job()};
  if(kind==='section-life')h.b.section.occupantGeneration++;
  if(kind==='worker-life')h.b.breaker.occupantGeneration++;
  if(kind==='head-life')h.b.cutterHead.occupantGeneration++;
  if(kind==='cradle-life')h.b.cradle.occupantGeneration++;
  if(kind==='worker-destroyed')h.b.breaker.hull=0;
  if(kind==='worker-record-destroyed')h.state.world.records.byId[C.identities.worker].alive=false;
  if(kind==='player-custody')h.b.section.data.playerOwned=true;
  if(kind==='remote-section')h.b.section.pos.x=C.sitePlacement.pos.x-900;
  if(kind==='nan-position')h.b.section.pos.x=NaN;
  if(kind==='infinite-position')h.b.section.pos.x=Infinity;
  if(kind==='expired-budget'){
   h.job().phase='reacquire';h.job().reacquireReturnBudget={schemaVersion:1,startedTick:h.state.tick,deadlineTick:h.state.tick+120};
   h.state.tick=h.job().reacquireReturnBudget.deadlineTick+1;
  }
  if(kind==='broken-mount'){h.job().phase='reacquire';h.job().mountId='missing-mount';}
  if(kind==='restore-teardown')h.sim.bus.emit('save:restoring',{});
  assert.equal(ceresWorkfleetRetainsSection(h.state,h.b.section),false);
  retire(h);assert.equal(h.b.section.alive,false,'the site owner uses ordinary far-player retirement');
 }finally{h.close();}
});
test('an unrelated structural section cannot borrow the active long-plate lease',async()=>{
 const h=await restore(wire);try{
  const sibling=h.state.entityList.find(e=>e.alive&&e.data?.worldSiteStructural&&e!==h.b.section);
  assert.ok(sibling);sibling.data.jobId=h.job().id;
  assert.equal(ceresWorkfleetRetainsSection(h.state,sibling),false);
  retire(h);assert.equal(sibling.alive,false);assert.equal(h.b.section.alive,true);
 }finally{h.close();}
});

for(const kind of ['active','displaced','nan-position','infinite-position','cut','stale-target','stale-owner','foreign-mode'])test(`physical tow handoff retains only its real same-life coupling: ${kind}`,async()=>{
 const h=await restore(initialRecoveryWire());try{
  const section=h.b.section,line=h.service.get(h.job().towId);
  assert.equal(line.state,'active');assert.equal(section.data.jobId,undefined);
  assert.equal(ceresWorkfleetRetainsSection(h.state,section),true);
  if(kind==='displaced')section.pos.x=C.sitePlacement.pos.x-900;
  if(kind==='nan-position')section.pos.x=NaN;
  if(kind==='infinite-position')section.pos.x=Infinity;
  if(kind==='cut')h.service.cut(line.id,h.b.breaker.id,'test-release');
  if(kind==='stale-target')section.occupantGeneration++;
  if(kind==='stale-owner')h.b.breaker.occupantGeneration++;
  if(kind==='foreign-mode')line.controlMode='foreign';
  const retained=['active','displaced'].includes(kind);
  assert.equal(ceresWorkfleetRetainsSection(h.state,section),retained);
  const before=pose(section);retire(h);
  assert.equal(section.alive,retained);assert.deepEqual(pose(section),before);
 }finally{h.close();}
});

for(const kind of ['not-started','malformed','future','expired'])test(`reacquire residency respects ${kind} return budget`,async()=>{
 const h=await restore(initialRecoveryWire());try{
  h.service.cut(h.job().towId,h.b.breaker.id,'test-reacquire');h.job().towId=null;h.job().phase='reacquire';
  h.job().reacquireReturnBudget=null;syncCeresWorkfleetActivity(h.owner);
  assert.equal(ceresWorkfleetRetainsSection(h.state,h.b.section),true,'a return budget is not required until a return route actually starts');
  if(kind==='malformed')h.job().reacquireReturnBudget={schemaVersion:1,startedTick:h.state.tick,deadlineTick:Infinity};
  if(kind==='future')h.job().reacquireReturnBudget={schemaVersion:1,startedTick:h.state.tick+1,deadlineTick:h.state.tick+120};
  if(kind==='expired')h.job().reacquireReturnBudget={schemaVersion:1,startedTick:h.state.tick-20,deadlineTick:h.state.tick-1};
  assert.equal(ceresWorkfleetRetainsSection(h.state,h.b.section),kind==='not-started');
  retire(h);assert.equal(h.b.section.alive,kind==='not-started');
 }finally{h.close();}
});
