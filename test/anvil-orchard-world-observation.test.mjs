import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRapierCompatRuntime,orchardRapierBaseline} from '../src/core/rapierCompatRuntime.js';
import {createOrchardNativeLane,prepareOrchardNativeObservation} from '../src/core/anvilOrchardCollarQuery.js';
import {createSimulation} from '../src/core/sim.js';
import {createSg02DynamicBodyOwner} from '../src/core/sg02DynamicBodyOwner.js';
import {ready} from './fixtures/anvil-orchard-custody-ready.mjs';
const R=await loadRapierCompatRuntime();
async function station(){
 const sim=createSimulation(),owner=await createSg02DynamicBodyOwner({RAPIER:R});
 const entity=sim.spawn({type:'station',pos:{x:700,z:900},radius:42,mass:1e6,hull:1e6,collides:true,data:{stationId:'station_tethys'}});
 assert.equal(Object.hasOwn(entity,'physicsBody'),false);
 owner.rebuildWorldFromEntities([entity]);
 assert.equal(Object.hasOwn(entity,'physicsBody'),false,'scratch normalization must not fabricate original authoring');
 const lane=createOrchardNativeLane(R,owner.world,orchardRapierBaseline(R));
 return {sim,owner,entity,lane,close(){owner.dispose();sim.dispose();}};
}
for(const explicit of [false,true])test(`ordinary station native census retains ${explicit?'explicit':'absent'} body authoring`,async()=>{
 const h=await station();try{
  if(explicit)h.entity.physicsBody={schemaVersion:1};
  const snapshot=prepareOrchardNativeObservation(h.owner,h.lane).scan();
  assert.equal(snapshot.byHandle.size,1);assert.equal(snapshot.byHandle.get(h.owner.records.get(h.entity.id).body.handle).mass,0);
 }finally{h.close();}
});
for(const change of ['own-getter','inherited-getter','inherited-value','absent-present','present-replaced','present-absent','prototype'])test(`ordinary station rejects ${change} without calling accessors`,async()=>{
 const h=await station();let calls=0;try{
  if(change.startsWith('present'))h.entity.physicsBody={schemaVersion:1};
  const observation=prepareOrchardNativeObservation(h.owner,h.lane);
  if(change==='own-getter')Object.defineProperty(h.entity,'physicsBody',{configurable:true,get(){calls++;return {};}});
  if(change==='inherited-getter')Object.setPrototypeOf(h.entity,{get physicsBody(){calls++;return {};}});
  if(change==='inherited-value')Object.setPrototypeOf(h.entity,{physicsBody:{}});
  if(change==='absent-present'||change==='present-replaced')h.entity.physicsBody={schemaVersion:1};
  if(change==='present-absent')delete h.entity.physicsBody;
  if(change==='prototype')Object.setPrototypeOf(h.entity,{});
  assert.throws(()=>observation.scan());assert.equal(calls,0);
  if(change.endsWith('getter')||change==='inherited-value')assert.throws(()=>prepareOrchardNativeObservation(h.owner,h.lane));
  assert.equal(calls,0);
 }finally{h.close();}
});
test('released finite lot scalar Continue tolerates a newly materialized ordinary station without weakening custody',async()=>{
 const h=await ready();try{
  h.sim.spawn({type:'station',pos:{x:h.frame.pos.x+600,z:h.frame.pos.z},radius:42,mass:1e6,hull:1e6,collides:true,flags:{persistent:true},data:{stationId:'station_tethys'}});
  const save=h.sim.registry.get('save'),envelope=JSON.parse(JSON.stringify(save.serialize('station-continue')));delete envelope.checksum;envelope.data.physics=null;
  assert.equal(save.loadEnvelope(envelope),true);
  const pod=h.sim.state.entityList.find(e=>e.data?.orchardKind==='pod');assert.ok(h.facade.readOrchardPodReady(pod));
  assert.equal(h.sim.state.sites.anvilOrchard.sourceRemaining,44);assert.equal(h.sim.state.sites.anvilOrchard.lots.length,1);
 }finally{h.close();}
});
for(const native of [false,true])test(`real world sector regeneration preserves released lot through ${native?'native':'scalar'} Continue`,async()=>{
 const h=await ready();try{
  // The finite-lot fixture is deliberately bounded. From here the actual world
  // owner supplies sector population and the actual save owner drives Continue.
  const {world}=await import('../src/systems/world.js');
  const worldOwner=Object.create(world),registry=h.sim.registry,get=registry.get.bind(registry);
  registry.get=name=>name==='world'?worldOwner:get(name);worldOwner.init(registry.ctx);
  worldOwner.enterSector(h.sim.state.world.currentSectorId,{placePlayer:false});
  const row=structuredClone(h.sim.state.sites.anvilOrchard);
  const save=registry.get('save'),envelope=JSON.parse(JSON.stringify(save.serialize('populated-world-continue')));delete envelope.checksum;
  if(!native)envelope.data.physics=null;
  assert.equal(save.loadEnvelope(envelope),true);
  const pod=h.sim.state.entityList.find(e=>e.data?.orchardKind==='pod');
  assert.ok(h.sim.state.entityList.some(e=>e.type==='station'&&e.data.stationId==='station_tethys'));
  assert.ok(h.facade.readOrchardPodReady(pod));assert.deepEqual(h.sim.state.sites.anvilOrchard,row);
  assert.equal(h.sim.state.entityList.filter(e=>e.data?.orchardKind==='pod').length,1);
 }finally{h.close();}
});
