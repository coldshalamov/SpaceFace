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

async function dressing(){
 const {insertDressingRow}=await import('../src/world/dressingTable.js');
 const sim=createSimulation(),owner=await createSg02DynamicBodyOwner({RAPIER:R});
 const entity=insertDressingRow(sim.state,{pos:{x:700,z:900},radius:18,collides:true,physicsBody:{dynamic:false,material:'prop'},data:{placeId:'place_lane_beacon'}});
 owner.syncFromEntityLayers([entity],[],1);
 const lane=createOrchardNativeLane(R,owner.world,orchardRapierBaseline(R));
 return {sim,owner,entity,lane,close(){owner.dispose();sim.dispose();}};
}
for(const explicit of [false,true])test(`static dressing native census retains ${explicit?'explicit':'absent'} generation`,async()=>{
 const h=await dressing();try{
  if(explicit)h.entity.occupantGeneration=7;
  const snapshot=prepareOrchardNativeObservation(h.owner,h.lane).scan();
  assert.equal(snapshot.byHandle.size,1);
  assert.equal(snapshot.byHandle.get(h.owner.records.get(h.entity.id).body.handle).type,R.RigidBodyType.Fixed);
 }finally{h.close();}
});
for(const change of ['own-getter','inherited-getter','inherited-value','absent-present','present-replaced','present-absent','descriptor','prototype','entity-replaced','classification','spec-dynamic','authored-dynamic','native-dynamic','orchard-claim'])test(`static dressing rejects ${change} generation or identity change`,async()=>{
 const h=await dressing();let calls=0;try{
  if(change.startsWith('present')||change==='descriptor')h.entity.occupantGeneration=7;
  const observation=prepareOrchardNativeObservation(h.owner,h.lane),rec=h.owner.records.get(h.entity.id);
  if(change==='own-getter')Object.defineProperty(h.entity,'occupantGeneration',{configurable:true,get(){calls++;return 7;}});
  if(change==='inherited-getter')Object.setPrototypeOf(h.entity,{get occupantGeneration(){calls++;return 7;}});
  if(change==='inherited-value')Object.setPrototypeOf(h.entity,{occupantGeneration:7});
  if(change==='absent-present'||change==='present-replaced')h.entity.occupantGeneration=8;
  if(change==='present-absent')delete h.entity.occupantGeneration;
  if(change==='descriptor')Object.defineProperty(h.entity,'occupantGeneration',{writable:false});
  if(change==='prototype')Object.setPrototypeOf(h.entity,{});
  if(change==='entity-replaced')rec.entity={...h.entity};
  if(change==='classification')h.entity.dressingResident=false;
  if(change==='spec-dynamic')rec.spec.dynamic=true;
  if(change==='authored-dynamic')h.entity.physicsBody.dynamic=true;
  if(change==='native-dynamic')rec.body.setBodyType(R.RigidBodyType.Dynamic,true);
  if(change==='orchard-claim')h.entity.data.orchardKind='pod';
  assert.throws(()=>observation.scan());assert.equal(calls,0);
  if(change.endsWith('getter')||change==='inherited-value')assert.throws(()=>prepareOrchardNativeObservation(h.owner,h.lane));
  assert.equal(calls,0);
 }finally{h.close();}
});
for(const kind of ['ordinary','frame','pod','worker','dynamic'])test(`missing generation remains forbidden for ${kind}`,async()=>{
 const h=await dressing();try{
  if(kind==='ordinary')delete h.entity.dressingResident;
  if(kind==='frame'||kind==='pod')h.entity.data.orchardKind=kind;
  if(kind==='worker')h.entity.type='ship';
  if(kind==='dynamic')h.owner.records.get(h.entity.id).spec.dynamic=true;
  assert.throws(()=>prepareOrchardNativeObservation(h.owner,h.lane),/occupantGeneration/);
 }finally{h.close();}
});
test('normal populated entry before workers admits and continues an exact finite lot',async()=>{
 const modules=await Promise.all(['world','traffic','asteroidSites','planetRuntime','environmentalMachinery'].map(n=>import(`../src/systems/${n}.js`)));
 const extra=await Promise.all(['input','npcJobsRuntime','flightV3','fields','combat','collisionConsequences','cargo','mining','economy','scanner'].map(async n=>(await import(`../src/systems/${n}.js`))[n]));
 const [input,npcJobsRuntime,flightV3,fields,combat,collisionConsequences,cargo,mining,economy,scanner]=extra;
 const [world,traffic,asteroidSites,planetRuntime,environmentalMachinery]=modules.map((m,i)=>m[['world','traffic','asteroidSites','planetRuntime','environmentalMachinery'][i]]);
 const {physics}=await import('../src/core/physics.js'),{save}=await import('../src/save/saveSystem.js');
 const {PLANET_FLAGS,PLANET_SITE}=await import('../src/data/planets.js');
 const {ANVIL_ORCHARD}=await import('../src/data/anvilOrchard.js');
 const {PRODUCTION_FEATURES}=await import('../src/runtime/runtimeProfiles.js');
 const enabled=PLANET_FLAGS.enabled;PLANET_FLAGS.enabled=true;
 const sim=createSimulation({seed:424214,runtimeConfig:{profileId:'production',features:PRODUCTION_FEATURES},systems:[{...world,update(){}},{...traffic,update(dt,state){this._stepAnvilWork(dt,state);}},asteroidSites,input,npcJobsRuntime,flightV3,fields,planetRuntime,physics,environmentalMachinery,combat,collisionConsequences,cargo,mining,economy,scanner,save]});
 try{
  const state=sim.state;state.mode='flight';state.world.currentSectorId=PLANET_SITE.sectorId;state.settings.gameplay.physicsBackend='rapier-dynamic';
  sim.registry.get('world').enterSector(PLANET_SITE.sectorId,{placePlayer:false});sim.step();
  const frame=state.entities.get(state.planet.orchardFrameId),worker=state.entities.get(state.planet.witnessId);
  const receiver=state.entityList.find(e=>e.data?.itinerary?.role==='receiver');assert.ok(receiver?.alive);
  // Explicit fixture positioning bounds admission; this is not a normal-flight travel proof.
  const player=sim.spawn({type:'ship',isPlayer:true,pos:{x:(receiver.pos.x+frame.pos.x)/2,z:(receiver.pos.z+frame.pos.z)/2},radius:6,hull:100,data:{defId:'ship_kestrel'}});state.playerId=player.id;
  const facade=sim.registry.get('physics');assert.equal(await facade.prepareBackend(state),true);
  assert.ok([...facade._sg02.records.values()].some(r=>r.entity.dressingResident&&!Object.hasOwn(r.entity,'occupantGeneration')));
  worker.data.itinerary.phase='collect';
  assert.equal(sim.registry.get('environmentalMachinery').acceptOrchardNewPod(worker,{frame,socket:1,qty:4,commodityId:ANVIL_ORCHARD.commodityId}),4);
  assert.equal(state.sites.anvilOrchard.sourceRemaining,44);assert.ok(receiver.alive);
  const row=structuredClone(state.sites.anvilOrchard),envelope=JSON.parse(JSON.stringify(sim.registry.get('save').serialize('entry-before-workers')));delete envelope.checksum;envelope.data.physics=null;
  assert.equal(sim.registry.get('save').loadEnvelope(envelope),true);
  assert.deepEqual(state.sites.anvilOrchard,row);assert.equal(state.entityList.filter(e=>e.data?.orchardKind==='pod').length,1);
 }finally{sim.dispose();PLANET_FLAGS.enabled=enabled;}
});
