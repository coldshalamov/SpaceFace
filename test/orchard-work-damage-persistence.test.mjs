import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureActivityClassified } from '../src/world/activityRuntime.js';
import { save } from '../src/save/saveSystem.js';
import { createSimulation } from '../src/core/sim.js';
import { traffic } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';
import { anvilWorkerRecordId } from '../src/systems/anvilWork.js';
import { PLANET_SITE } from '../src/data/planets.js';
import { createCombatCatalog, ensureCombatant } from '../src/combat/runtime.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { SUBSYSTEM_DEFS } from '../src/data/combatDefs.js';
import { captureOrchardWorkDamage, hydrateOrchardWorkDamage } from '../src/combat/orchardWorkDamage.js';
import { captureEntityRecord, spawnSpecFromRecord, bindEntityToRecord } from '../src/world/worldRecords.js';

function boot(role='receiver') {
 const sim=createSimulation({seed:47,systems:[{...world,update(){}},{...traffic,update(){}},save]});
 const state=sim.state;state.mode='flight';state.world.currentSectorId=PLANET_SITE.sectorId;
 sim.registry.get('traffic').ensureAnvilWorker(state,sim.spawn,{x:14000,z:6000});
 const e=state.entityList.find(e=>e.data?.worldRecordId===anvilWorkerRecordId(state,role));
 const catalog=createCombatCatalog(),kernel=getCombatKernel({state,bus:sim.bus});
 kernel.inspect({entityId:e.id});
 const runtime=state.combat.entities[e.id];
 const def=SUBSYSTEM_DEFS.find(d=>d.id==='subsystem_drive');
 kernel.routeDamage({attackerId:null,targetId:e.id,packet:{channels:{ion:def.armor.flat+runtime.subsystems.subsystem_drive.health/def.armor.multipliers.ion},penetration:0,shieldBypass:1,subsystemShare:1,hit:{subsystemId:def.id},source:{kind:'test',id:'orchard-damage'}},origin:{kind:'test',id:'orchard-damage'}});
 state.tick+=2;kernel.prePhysics(1/60);assert.equal(runtime.capabilities.drive,false);
 const capture=()=>{const rec=captureEntityRecord(e,{seed:47,sectorId:PLANET_SITE.sectorId,stationSource:state,previousRecord:state.world.records.byId[e.data.worldRecordId]});state.world.records.byId[rec.recordId]=rec;return rec;};
 return {sim,state,e,catalog,kernel,runtime,capture};
}
for(const role of ['collector','receiver'])test(`canonical ${role} damage survives record rematerialization without transient combat authority`,()=>{
 const t=boot(role);try{
  const rec=t.capture(),snapshot=rec.extra.orchardSubsystemDamage;
  assert.equal(snapshot.subsystems.find(s=>s.id==='subsystem_drive').destroyed,true);
  assert.deepEqual(Object.keys(snapshot).sort(),['version','recordId','role','shipDefId','sectorId','profileId','subsystems'].sort());
  const copied=JSON.parse(JSON.stringify(rec));t.state.entities.delete(t.e.id);t.e.alive=false;delete t.state.combat.entities[t.e.id];
  t.state.world.records.byId[copied.recordId]=copied;
  const restored=t.sim.spawn(spawnSpecFromRecord(copied));bindEntityToRecord(restored,copied);
  const rt=ensureCombatant(t.state,restored,t.catalog);
  assert.equal(rt.capabilities.drive,false);assert.equal(rt.subsystems.subsystem_drive.destroyed,true);
  assert.deepEqual(rt.statuses,{});assert.equal(Object.keys(t.state.combat.attachments.byId).length,0);
  assert.equal(restored.data.worldRecordId,copied.recordId);assert.equal(restored.hull,copied.hull);
 }finally{t.sim.dispose();}
});

test('repaired recapture replaces old wound, and derived temporary disable is never fossilized',()=>{
 const t=boot();try{
  t.capture();t.kernel.repair(t.e.id,'subsystem_drive',100,'test-real-repair');t.state.tick+=2;t.kernel.prePhysics(1/60);
  assert.equal(t.runtime.capabilities.drive,true);
  t.runtime.capabilities.drive=false; // stand-in derived temporary effect, not durable damage.
  const rec=t.capture();assert.deepEqual(rec.extra.orchardSubsystemDamage.subsystems,[]);
  delete t.state.combat.entities[t.e.id];const rt=ensureCombatant(t.state,t.e,t.catalog);
  assert.equal(rt.capabilities.drive,true);assert.equal(rt.subsystems.subsystem_drive.destroyed,false);
 }finally{t.sim.dispose();}
});

for(const cause of ['duplicate-row','unknown-row','max-health','nan-health','negative-health','over-health','wrong-role','wrong-record','wrong-profile','wrong-ship','wrong-sector','wrong-version','unknown-snapshot-key','unknown-row-key'])test(`cold hydrate rejects ${cause} snapshot atomically`,()=>{
 const t=boot();try{
  const rec=t.capture(),s=rec.extra.orchardSubsystemDamage,r=s.subsystems[0];
  if(cause==='duplicate-row')s.subsystems.push({...r});
  if(cause==='unknown-row')r.id='subsystem_invented';
  if(cause==='max-health')r.maxHealth*=100;
  if(cause==='nan-health')r.health=NaN;
  if(cause==='negative-health')r.health=-1;
  if(cause==='over-health')r.health=r.maxHealth+1;
  if(cause==='wrong-role')s.role='collector';
  if(cause==='wrong-record')s.recordId+='x';
  if(cause==='wrong-profile')s.profileId='combat_profile_station';
  if(cause==='wrong-ship')s.shipDefId='ship_kestrel';
  if(cause==='wrong-sector')s.sectorId='sector_ceres_belt';
  if(cause==='wrong-version')s.version=2;
  if(cause==='unknown-snapshot-key')s.targetId=123;
  if(cause==='unknown-row-key')r.capabilities={drive:true};
  const clean=structuredClone(t.runtime);for(const row of Object.values(clean.subsystems)){row.health=row.maxHealth;row.destroyed=false;row.effectiveDisabled=false;}
  const before=structuredClone(clean);
  assert.equal(hydrateOrchardWorkDamage(t.state,t.e,clean,t.catalog.profiles.get(clean.profileId),t.catalog),false);
  assert.equal(clean.orchardDamageUnresolved,true);
  delete clean.orchardDamageUnresolved;assert.deepEqual(clean,before);
 }finally{t.sim.dispose();}
});

for(const cause of ['dead','superseded','duplicate','foreign-job','wrong-role','wrong-ship','foreign-site','wrong-owner','record-dead'])test(`capture rejects ${cause} actor without overwriting foreign extra`,()=>{
 const t=boot();try{
  const extra={unrelated:'kept'};
  if(cause==='dead')t.e.alive=false;
  if(cause==='superseded')t.state.entities.delete(t.e.id);
  if(cause==='duplicate')t.sim.spawn({type:'ship',hull:100,data:{...t.e.data}});
  if(cause==='foreign-job')t.e.data.jobId='foreign';
  if(cause==='wrong-role')t.e.data.itinerary.role='collector';
  if(cause==='wrong-ship')t.e.data.defId='ship_kestrel';
  if(cause==='foreign-site')t.e.data.worldSiteId='site';
  if(cause==='wrong-owner')t.e.data.persistenceOwner='other';
  if(cause==='record-dead')t.state.world.records.byId[t.e.data.worldRecordId].alive=false;
  assert.equal(captureOrchardWorkDamage(t.state,t.e,extra),extra);
 }finally{t.sim.dispose();}
});

test('actual sector demotion captures original wound before despawn and promotion hydrates it',()=>{
 const t=boot();try{
  const owner=t.sim.registry.get('world'),id=t.e.data.worldRecordId;
  owner._demoteSectorToRecordOnly(PLANET_SITE.sectorId);
  assert.equal(t.state.world.records.byId[id].extra.orchardSubsystemDamage.subsystems.find(s=>s.id==='subsystem_drive').destroyed,true);
  assert.ok(!t.state.entities.get(t.e.id)||t.e.alive===false,'world actually evicted original body');
  owner._rematerializeSectorRecords(PLANET_SITE.sectorId,owner._emptySectorBag(),'FULL',{restoreDurableRecords:true});
  const e=t.state.entityList.find(e=>e.alive===true&&e.data?.worldRecordId===id);
  assert.ok(e);assert.notEqual(e,t.e);
  const rt=ensureCombatant(t.state,e,t.catalog);assert.equal(rt.capabilities.drive,false);
  assert.equal(t.state.entityList.filter(e=>e.alive===true&&e.data?.worldRecordId===id).length,1);
 }finally{t.sim.dispose();}
});


test('actual activity demotion captures durable drive wound rather than offscreen healing',()=>{
 const t=boot();try{
  const player=t.sim.spawn({type:'ship',team:0,hull:100,hullMax:100,radius:6,pos:{x:t.e.pos.x+50,z:t.e.pos.z},flags:{persistent:true}});
  t.state.playerId=player.id;t.state.camera={zoom:144};t.state.settings.video={fov:50};
  ensureActivityClassified(t.state);
  const before=t.e.activity.simTier;
  player.pos.x+=10000;
  for(let i=0;i<180;i++){t.state.tick++;t.state.simTime+=1/60;ensureActivityClassified(t.state);}
  assert.notEqual(t.e.activity.simTier,before,'classification actually demoted the original');
  const record=t.state.world.records.byId[t.e.data.worldRecordId];
  assert.equal(record.extra.orchardSubsystemDamage.subsystems.find(s=>s.id==='subsystem_drive').destroyed,true);
  assert.equal(t.runtime.capabilities.drive,false);
 }finally{t.sim.dispose();}
});

test('off-sector Continue preserves record-only damage and does not wake the tender until promotion',()=>{
 const t=boot();try{
  const owner=t.sim.registry.get('world'),id=t.e.data.worldRecordId;
  const player=t.sim.spawn({type:'ship',team:0,hull:100,hullMax:100,radius:6,pos:{x:0,z:0},flags:{persistent:true}});
  t.state.playerId=player.id;
  owner._demoteSectorToRecordOnly(PLANET_SITE.sectorId);
  t.state.world.currentSectorId='sector_ceres_belt';
  const saver=t.sim.registry.get('save'),envelope=JSON.parse(JSON.stringify(saver.serialize('offsector-orchard-drive')));
  assert.equal(saver.loadEnvelope(envelope),true);t.state.mode='flight';
  assert.equal(t.state.entityList.filter(e=>e.alive===true&&e.data?.worldRecordId===id).length,0);
  assert.equal(t.state.world.records.byId[id].extra.orchardSubsystemDamage.subsystems.find(s=>s.id==='subsystem_drive').destroyed,true);
  t.state.world.currentSectorId=PLANET_SITE.sectorId;
  owner._rematerializeSectorRecords(PLANET_SITE.sectorId,owner._emptySectorBag(),'FULL',{restoreDurableRecords:true});
  const e=t.state.entityList.find(e=>e.alive===true&&e.data?.worldRecordId===id);assert.ok(e);
  const rt=ensureCombatant(t.state,e,t.catalog);assert.equal(rt.capabilities.drive,false);
 }finally{t.sim.dispose();}
});

for(const outcome of ['removed','consumed'])test(`terminal ${outcome} record cannot hydrate a replacement`,()=>{
 const t=boot();try{
  const rec=t.capture();rec.outcome=outcome;
  const clean=structuredClone(t.runtime),before=structuredClone(clean);
  assert.equal(hydrateOrchardWorkDamage(t.state,t.e,clean,t.catalog.profiles.get(clean.profileId),t.catalog),false);
  assert.deepEqual(clean,before);
 }finally{t.sim.dispose();}
});

test('unrelated actor pointing at malformed Orchard record gains no runtime quarantine marker',()=>{
 const t=boot();try{
  const rec=t.capture();rec.extra.orchardSubsystemDamage.extra='bad';t.e.data.itinerary.kind='other';
  const clean=structuredClone(t.runtime),before=structuredClone(clean);
  assert.equal(hydrateOrchardWorkDamage(t.state,t.e,clean,t.catalog.profiles.get(clean.profileId),t.catalog),false);
  assert.deepEqual(clean,before);
 }finally{t.sim.dispose();}
});

test('save on the actual repair tick retains earned pending enable, not the prior destroyed flag',()=>{
 const t=boot();try{
  t.capture();t.kernel.repair(t.e.id,'subsystem_drive',100,'test-earned-repair');
  assert.equal(t.runtime.subsystems.subsystem_drive.destroyed,true,'transition has not run yet');
  assert.equal(t.runtime.subsystems.subsystem_drive.pendingTransition.destroyed,false);
  const rec=t.capture();assert.deepEqual(rec.extra.orchardSubsystemDamage.subsystems,[]);
  t.state.tick++;t.kernel.prePhysics(1/60);assert.equal(t.runtime.capabilities.drive,true,'normal next-step parity');
  delete t.state.combat.entities[t.e.id];const rt=ensureCombatant(t.state,t.e,t.catalog);
  assert.equal(rt.capabilities.drive,true,'Continue does not undo earned repair');
 }finally{t.sim.dispose();}
});

for(const [label,pending] of Object.entries({legacy:null,string:'false',missingTick:{destroyed:false},nanTick:{destroyed:false,atTick:NaN},infiniteTick:{destroyed:false,atTick:Infinity},negativeTick:{destroyed:false,atTick:-1},fractionalTick:{destroyed:false,atTick:1.5},futureTick:{destroyed:false,atTick:10000},nonBoolean:{destroyed:0,atTick:2}}))test(`invalid or legacy pending enable ${label} cannot erase an existing wound`,()=>{
 const t=boot();try{
  t.capture();t.kernel.repair(t.e.id,'subsystem_drive',100,'test-earned-repair');
  t.runtime.subsystems.subsystem_drive.pendingTransition=pending;
  const rec=t.capture();assert.equal(rec.extra.orchardSubsystemDamage.subsystems[0].destroyed,true);
  delete t.state.combat.entities[t.e.id];assert.equal(ensureCombatant(t.state,t.e,t.catalog).capabilities.drive,false);
 }finally{t.sim.dispose();}
});
test('save on actual damage tick preserves pending disable and matches normal next step',()=>{
 const t=boot();try{
  t.kernel.repair(t.e.id,'subsystem_drive',100,'test-repair');t.state.tick++;t.kernel.prePhysics(1/60);
  assert.equal(t.runtime.capabilities.drive,true);
  const def=SUBSYSTEM_DEFS.find(d=>d.id==='subsystem_drive');
  t.kernel.routeDamage({attackerId:null,targetId:t.e.id,packet:{channels:{ion:def.armor.flat+def.health/def.armor.multipliers.ion},penetration:0,shieldBypass:1,subsystemShare:1,hit:{subsystemId:def.id},source:{kind:'test',id:'boundary-damage'}},origin:{kind:'test',id:'boundary-damage'}});
  const sub=t.runtime.subsystems.subsystem_drive;
  assert.equal(sub.destroyed,false);assert.equal(sub.pendingTransition.destroyed,true);assert.equal(sub.health,0);
  const rec=t.capture();assert.equal(rec.extra.orchardSubsystemDamage.subsystems[0].destroyed,true);
  t.state.tick++;t.kernel.prePhysics(1/60);assert.equal(t.runtime.capabilities.drive,false);
  delete t.state.combat.entities[t.e.id];assert.equal(ensureCombatant(t.state,t.e,t.catalog).capabilities.drive,false);
 }finally{t.sim.dispose();}
});
