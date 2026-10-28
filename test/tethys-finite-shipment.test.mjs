import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { traffic } from '../src/systems/traffic.js';
import { activityActorSlotById, TETHYS_ACTIVITY_SECTOR_ID as SECTOR } from '../src/data/sectorActivityPockets.js';
import { stableRecordId, RECORD_KIND, captureEntityRecord, spawnSpecFromRecord } from '../src/world/worldRecords.js';
import { lootShards } from '../src/systems/lootShards.js';
import { world } from '../src/systems/world.js';
import { save } from '../src/save/saveSystem.js';
import { cargo } from '../src/systems/cargo.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { SECTORS } from '../src/data/sectors.js';

const SLOT='tethys_quiet_runner';
function fixture(pos={x:0,z:0}) {
  const sim=createSimulation({seed:4242,systems:[cargo,npcJobsRuntime]});
  const {state,bus}=sim;state.mode='flight';state.world.currentSectorId=SECTOR;
  const slot=activityActorSlotById(SLOT);
  const worldRecordId=stableRecordId(4242,SECTOR,RECORD_KIND.CONVOY,slot.worldRecordSlotId);
  const entity=sim.spawn({type:'ship',alive:true,homeSectorId:SECTOR,pos,radius:18,hull:200,hullMax:200,
    data:{worldRecordId,activityActorSlotId:SLOT,durable:true,trafficRole:'smuggler',defId:'ship_drifter'}});
  const rec={id:entity.id,worldRecordId,activityActorSlotId:SLOT};
  state.traffic={freighters:[rec]};
  const owner=Object.assign(Object.create(traffic),{state,bus,helpers:sim.registry.ctx.helpers});
  assert.equal(owner._initializeTethysShipment(entity,{slot},true,null),true);
  rec.manifest=entity.data.cargoManifest;
  const actor=()=>owner._tethysShipmentActor();
  const spec=i=>({type:'pickup',pos:{x:30+i*8,z:0},radius:2.4,homeSectorId:SECTOR,
    data:{kind:'cargo',commodityId:'cmdty_stolen_goods',amount:1,tethysHandoff:true}});
  const emit=(phase='handoff')=>owner._emitTethysShipmentPortion(actor(),phase,spec);
  const pods=()=>state.entityList.filter(e=>e.data?.tethysHandoff);
  return {sim,state,bus,owner,entity,rec,slot,actor,spec,emit,pods};
}

test('finite Tethys: actual staged publication preserves authored six-unit 3+3',()=>{
  const f=fixture();assert.equal(f.emit(),3);assert.equal(f.entity.data.cargoManifest.totalQty,3);
  assert.equal(f.emit('jettison'),3);assert.equal(f.entity.data.cargoManifest.totalQty,0);
  assert.equal(f.pods().length,6);assert.ok(f.pods().every(e=>e.flags.persistent));
  assert.equal(f.emit(),0);assert.equal(f.emit('jettison'),0);f.sim.dispose();
});

test('finite Tethys: refused stage leaves stock aboard; phase replay never spends reserve',()=>{
  const f=fixture(),stage=f.owner.helpers.stageEntitySpawn;let attempts=0;
  f.owner.helpers={...f.owner.helpers,stageEntitySpawn:s=>++attempts===2?null:stage(s)};
  assert.equal(f.emit(),2);assert.equal(f.entity.data.cargoManifest.totalQty,4);
  assert.equal(f.emit(),0);assert.equal(f.emit('jettison'),3);
  assert.equal(f.entity.data.cargoManifest.totalQty,1);assert.equal(f.pods().length,5);f.sim.dispose();
});

test('finite Tethys: real entity:spawned cross-phase reentry cannot overspend',()=>{
  const f=fixture();let nested;
  f.bus.on('entity:spawned',({entity:e})=>{if(e.data?.tethysHandoff)nested=f.emit('jettison');});
  assert.equal(f.emit(),3);assert.equal(nested,0);assert.equal(f.entity.data.cargoManifest.totalQty,3);
  assert.equal(f.entity.data.cargoManifest.tethysShipment.jettisonDone,false);f.sim.dispose();
});

test('finite Tethys: committed pod remains spent when a real publication observer throws',()=>{
  const f=fixture();f.bus.on('entity:spawned',({entity:e})=>{if(e.data?.tethysHandoff)throw Error('observer');});
  assert.equal(f.emit(),3);assert.equal(f.pods().length,3);assert.equal(f.entity.data.cargoManifest.totalQty,3);f.sim.dispose();
});

test('finite Tethys: synchronous death spill reads the committed remainder, not all six',()=>{
  const f=fixture();let spill;
  const loot=Object.assign(Object.create(lootShards),{state:f.state,bus:f.bus,helpers:f.owner.helpers});
  f.bus.on('entity:spawned',({entity:e})=>{
    if(!e.data?.tethysHandoff||spill)return;
    f.entity.alive=false;f.entity.hull=0;
    spill=loot._trySpawnCivilianManifestPayload({pos:f.entity.pos},f.entity);
  });
  assert.equal(f.emit(),1);assert.ok(spill);
  assert.equal(spill.data.salvagePool.cmdty_stolen_goods,5);
  assert.equal(f.pods().length+spill.data.salvagePool.cmdty_stolen_goods,6);f.sim.dispose();
});

test('finite Tethys: relinquished row or recycled identity prevents later portion spending',()=>{
  for(const change of [f=>f.state.traffic.freighters.splice(0),f=>{f.entity.data.worldRecordId='replacement';},f=>{f.entity.data.activityActorSlotId='replacement';}]){
    const f=fixture();f.bus.on('entity:spawned',({entity:e})=>{if(e.data?.tethysHandoff)change(f);});
    assert.equal(f.emit(),1);assert.equal(f.pods().length,1);assert.equal(f.entity.data.cargoManifest.totalQty,5);f.sim.dispose();
  }
});

test('finite Tethys: malformed or explicitly empty manifest never gains fresh stock',()=>{
  for(const manifest of [null,{}, {lines:[],totalQty:0}]){
    const f=fixture();f.entity.data.cargoManifest=manifest;f.rec.manifest=manifest;
    assert.equal(f.owner._initializeTethysShipment(f.entity,{slot:f.slot},true,null),false);
    assert.equal(f.emit(),0);assert.equal(f.pods().length,0);f.sim.dispose();
  }
});

test('finite Tethys: actual world-record capture and rematerialization preserve partial stock and completion',()=>{
  const f=fixture();f.emit();
  const record=captureEntityRecord(f.entity,{seed:4242,sectorId:SECTOR});
  assert.ok(record,'ordinary durable capture accepts original actor');
  const restoredSpec=spawnSpecFromRecord(JSON.parse(JSON.stringify(record)));
  assert.equal(restoredSpec.data.cargoManifest.totalQty,3);
  assert.equal(restoredSpec.data.cargoManifest.tethysShipment.handoffDone,true);
  assert.equal(f.owner._initializeTethysShipment(f.entity,{slot:f.slot},false,record),false);
  f.sim.dispose();
});

test('finite Tethys: real actor lookup scratch does not collapse the physical exchange gap',()=>{
  const f=fixture({x:10852,z:8542}),slot=activityActorSlotById('tethys_quiet_keeper');
  const worldRecordId=stableRecordId(4242,SECTOR,RECORD_KIND.CONVOY,slot.worldRecordSlotId);
  const keeper=f.sim.spawn({type:'ship',pos:{x:10952,z:8542},radius:18,hull:200,homeSectorId:SECTOR,
    data:{worldRecordId,activityActorSlotId:slot.id}});
  f.state.traffic.freighters.push({id:keeper.id,worldRecordId,activityActorSlotId:slot.id});
  const before=JSON.stringify([f.entity.pos,keeper.pos,f.entity.vel,keeper.vel]);
  f.owner._dropTethysHandoffLoad({eventId:'ev_criminal_handoff'});
  assert.equal(f.pods().length,3);
  for(const [i,pod] of f.pods().entries()) {
    const expected=10852+24.4+(100-48.8)*i/2;
    assert.ok(Math.abs(pod.pos.x-expected)<=2);
    assert.ok(Math.hypot(pod.pos.x,pod.pos.z)>20.4);
    assert.ok(Math.hypot(pod.pos.x-100,pod.pos.z)>20.4);
  }
  assert.equal(JSON.stringify([f.entity.pos,keeper.pos,f.entity.vel,keeper.vel]),before);
  assert.equal(f.entity.data.cargoManifest.totalQty,3);f.sim.dispose();
});

test('finite Tethys: actual save serializers and load owners retain partial custody and loose pods',()=>{
  const f=fixture();f.emit();
  const worldA=Object.assign(Object.create(world),{state:f.state,bus:f.bus,helpers:f.owner.helpers});
  const saver=Object.assign(Object.create(save),{state:f.state,bus:f.bus,helpers:f.owner.helpers,
    registry:{get:name=>name==='world'?worldA:name==='traffic'?f.owner:f.sim.registry.get(name)}});
  const data=JSON.parse(JSON.stringify(saver.serializeData()));
  assert.equal(data.entities.persistent.filter(e=>e.data?.tethysHandoff).length,3);
  const record=data.world.records.byId[f.rec.worldRecordId];
  assert.equal(record.cargoManifest.totalQty,3);
  const b=createSimulation({seed:4242,systems:[npcJobsRuntime,traffic]});
  const worldB=Object.assign(Object.create(world),{state:b.state,bus:b.bus,helpers:b.registry.ctx.helpers});
  worldB.deserialize(data.world);
  const loader=Object.assign(Object.create(save),{state:b.state,bus:b.bus,helpers:b.registry.ctx.helpers,registry:b.registry});
  loader._spawnPersistentEntities(data.entities.persistent,new Map());
  worldB._rematerializeSectorRecords(SECTOR,worldB._emptySectorBag(),'full');
  const restored=b.state.entityList.find(e=>e.data?.worldRecordId===record.recordId);
  assert.ok(restored,'world owner rematerializes original durable hull');
  assert.equal(restored.data.cargoManifest.totalQty,3);
  assert.equal(restored.data.cargoManifest.tethysShipment.handoffDone,true);
  assert.equal(b.state.entityList.filter(e=>e.data?.tethysHandoff).length,3);
  b.state.mode='flight';b.state.world.currentSectorId=SECTOR;
  b.bus.emit('save:loaded',{data});
  const owner=b.registry.get('traffic');
  assert.equal(owner._initializeTethysShipment(restored,{slot:f.slot},false,record),false);
  assert.equal(owner._emitTethysShipmentPortion(owner._tethysShipmentActor(),'handoff',f.spec),0);
  assert.equal(restored.data.activityActorSlotId,SLOT,'ordinary traffic sector adoption stamps original slot');
  assert.equal(owner._emitTethysShipmentPortion(owner._tethysShipmentActor(),'jettison',f.spec),3);
  assert.equal(restored.data.cargoManifest.totalQty,0);
  f.sim.dispose();b.dispose();
});


test('finite Tethys: ordinary cargo pickup acceptance retains six-unit custody',()=>{
  const f=fixture();f.emit();
  const player=f.sim.spawn({type:'ship',team:0,pos:{x:300,z:0},radius:6});
  f.state.playerId=player.id;f.state.player.cargo.capVolume=100;
  const pod=f.pods()[0];
  const payload={pickupId:pod.id,collectorId:player.id,kind:'cargo',commodityId:'cmdty_stolen_goods',amount:1};
  f.bus.emit('pickup:collected',payload);
  assert.equal(payload.acceptedAmount,1);
  // Same acceptance receipt used by the physical pickup owner to remove the accepted body.
  f.owner.helpers.removeEntity(pod.id);
  const held=f.entity.data.cargoManifest.totalQty;
  const collected=f.state.player.cargo.items.cmdty_stolen_goods;
  const loose=f.state.entityList.filter(e=>e.alive!==false&&e.data?.tethysHandoff).length;
  assert.equal(held+collected+loose,6);f.sim.dispose();
});

test('finite Tethys: rendezvous refuses a new job without stranding either original crew',()=>{
  const f=fixture({x:10852,z:8542}),slot=activityActorSlotById('tethys_quiet_keeper');
  const id=stableRecordId(4242,SECTOR,RECORD_KIND.CONVOY,slot.worldRecordSlotId);
  const keeper=f.sim.spawn({type:'ship',pos:{x:10964,z:8542},homeSectorId:SECTOR,data:{worldRecordId:id,activityActorSlotId:slot.id,trafficRole:'tender'}});
  f.state.traffic.freighters.push({id:keeper.id,worldRecordId:id,activityActorSlotId:slot.id});
  const jobs=f.owner.helpers.npcJobs, route=[{id:'a',pos:{x:10852,z:8542}},{id:'b',pos:{x:10964,z:8542}}];
  jobs.assign(f.entity,{kind:'hauler',route});jobs.assign(keeper,{kind:'surveyor',route});
  const prior=jobs.get(keeper.data.jobId),assign=jobs.assign;let refuse=true;
  f.owner.helpers={...f.owner.helpers,npcJobs:{...jobs,assign:(entity,spec)=>entity===keeper&&refuse?null:assign(entity,spec)}};
  f.owner._ensureCeresCausalChain('test');
  const live={};f.owner._prepareTethysRendezvous(live);
  assert.equal(live.tethysRendezvous,false);assert.equal(live.redirectedSlots.length,1);
  assert.equal(jobs.get(keeper.data.jobId),prior);
  refuse=false;f.owner._prepareTethysRendezvous(live);
  assert.equal(live.tethysRendezvous,true);assert.equal(live.redirectedSlots.length,2);
  assert.equal(f.entity.data.cargoManifest.totalQty,6);
  const release=jobs.release;let replaced=false;
  f.owner.helpers.npcJobs.release=id=>{const result=release(id);if(!replaced){replaced=true;assign(f.entity,{kind:'hauler',route:[{id:'foreign',pos:{x:0,z:0}},{id:'foreign-end',pos:{x:1,z:0}}]});}return result;};
  f.owner._restoreCeresCausalJobs(live);
  assert.equal(jobs.get(f.entity.data.jobId).job.route[0].id,'foreign','post-release owner is never overwritten');
  f.sim.dispose();
});


test('finite Tethys: public Save envelope API restores original shipment and authored chain',async()=>{
  for(const phase of ['before','partial','afterPickup','empty']) {
  const sim=createSimulation({seed:4242,systems:[world,cargo,npcJobsRuntime,traffic,save]});
  const {state,bus}=sim;state.mode='flight';state.world.currentSectorId=SECTOR;
  const player=sim.spawn({type:'ship',team:0,pos:{x:12288,z:5192},radius:6,hull:100,hullMax:100,data:{defId:'ship_kestrel'}});
  state.playerId=player.id;state.onboarding={active:false,finished:true};
  bus.emit('sector:enter',{sectorId:SECTOR,sector:SECTORS.find(s=>s.id===SECTOR)});
  const owner=sim.registry.get('traffic'), saver=sim.registry.get('save');
  const actor=owner._tethysShipmentActor();assert.ok(actor);
  const spec=i=>({type:'pickup',pos:{x:10900+i*8,z:8542},radius:2.4,homeSectorId:SECTOR,
    data:{kind:'cargo',commodityId:'cmdty_stolen_goods',amount:1,tethysHandoff:true}});
  if(phase==='partial'){const stage=owner.helpers.stageEntitySpawn;let i=0;owner.helpers={...owner.helpers,stageEntitySpawn:s=>++i===2?null:stage(s)};}
  if(phase!=='before') owner._emitTethysShipmentPortion(actor,'handoff',spec);
  if(phase==='afterPickup'){
    const pod=state.entityList.find(e=>e.data?.tethysHandoff);state.player.cargo.capVolume=100;
    const payload={pickupId:pod.id,collectorId:player.id,kind:'cargo',commodityId:'cmdty_stolen_goods',amount:1};
    bus.emit('pickup:collected',payload);assert.equal(payload.acceptedAmount,1);owner.helpers.removeEntity(pod.id);
  }
  if(phase==='empty')owner._emitTethysShipmentPortion(actor,'jettison',spec);
  const expectedHeld=actor.entity.data.cargoManifest.totalQty;
  const expectedLoose=state.entityList.filter(e=>e.alive!==false&&e.data?.tethysHandoff).length;
  const expectedCollected=state.player.cargo.items.cmdty_stolen_goods||0;
  const raw=JSON.stringify(saver.serialize('tethys-native'));
  const errors=[];bus.on('save:error',p=>errors.push(p));
  let loaded;
  if(phase==='partial'){
    const priorStorage=globalThis.localStorage, ram=new Map([['sf.save.quick',raw]]);
    globalThis.localStorage={get length(){return ram.size;},key:i=>[...ram.keys()][i]??null,getItem:k=>ram.get(k)??null,setItem:(k,v)=>ram.set(k,String(v)),removeItem:k=>ram.delete(k)};
    try{loaded=saver.load('quick');}finally{if(priorStorage)globalThis.localStorage=priorStorage;else delete globalThis.localStorage;}
  }else loaded=await saver.loadEnvelopeFromString(raw,'tethys-native');
  assert.equal(loaded,true,JSON.stringify(errors));
  const restored=owner._tethysShipmentActor();assert.ok(restored,'Continue rebinds original pair');
  assert.equal(restored.entity.data.cargoManifest.totalQty,expectedHeld,phase);
  assert.equal(restored.entity.data.cargoManifest.tethysShipment.handoffDone,phase!=='before');
  assert.equal(state.entityList.filter(e=>e.alive!==false&&e.data?.tethysHandoff).length,expectedLoose);
  assert.equal(state.player.cargo.items.cmdty_stolen_goods||0,expectedCollected);
  assert.equal(expectedHeld+expectedLoose+expectedCollected,6);
  assert.equal(state.traffic.freighters.filter(row=>row.activityActorSlotId?.startsWith('tethys_')).length,12);
  const returnErrors=[], priorError=console.error;
  console.error=(...args)=>{if(args.some(a=>a instanceof ReferenceError && /stationName/.test(a.message)))returnErrors.push(args);priorError(...args);};
  try {
  for(const continuous of [true,false]){
    const worldOwner=sim.registry.get('world');
    worldOwner.enterSector('sector_helios_prime',{continuous,placePlayer:false});
    worldOwner.enterSector(SECTOR,{continuous,placePlayer:false});
    const returned=owner._tethysShipmentActor();assert.ok(returned,`${phase} return ${continuous}`);
    assert.equal(returned.entity.data.cargoManifest.totalQty,expectedHeld);
    assert.equal(returned.entity.data.cargoManifest.tethysShipment.handoffDone,phase!=='before');
    assert.equal(state.entityList.filter(e=>e.alive!==false&&e.data?.tethysHandoff).length,expectedLoose);
    assert.equal(state.player.cargo.items.cmdty_stolen_goods||0,expectedCollected);
  }
  }finally{console.error=priorError;}
  assert.equal(returnErrors.length,0,'ordinary EventBus must not swallow a stationName ReferenceError on return');
  const returned=owner._tethysShipmentActor();
  assert.equal(owner._emitTethysShipmentPortion(returned,'handoff',spec),phase==='before'?3:0);
  assert.equal(owner._emitTethysShipmentPortion(returned,'jettison',spec),phase==='empty'?0:3);
  assert.equal(returned.entity.data.cargoManifest.totalQty,phase==='partial'?1:0);
  sim.dispose();
  }
});


test('finite Tethys: committed-stage throw cannot refund an admitted pod',()=>{
  const f=fixture(), stage=f.owner.helpers.stageEntitySpawn;
  f.owner.helpers={...f.owner.helpers,stageEntitySpawn:spec=>{
    const value=stage(spec);return {get committed(){return value.committed;},abort:()=>value.abort(),
      commit:contract=>{value.commit(contract);throw Error('post-commit presentation failure');}};
  }};
  assert.equal(f.emit(),3);assert.equal(f.entity.data.cargoManifest.totalQty,3);assert.equal(f.pods().length,3);f.sim.dispose();
});

test('finite Tethys: saved FLEE identity retries only after ordinary resume',()=>{
  const f=fixture(), jobs=f.sim.registry.get('npcJobsRuntime');
  const record=captureEntityRecord(f.entity,{seed:4242,sectorId:SECTOR});
  f.state.world.records={byId:{[record.recordId]:record},bySector:{[SECTOR]:[record.recordId]}};
  jobs.assign(f.entity,{kind:'hauler',sectorId:SECTOR,route:[{id:'a',pos:{x:0,z:0}},{id:'b',pos:{x:10,z:0}}]});
  jobs.interruptJob(f.entity.data.jobId,{entityId:999});
  delete f.entity.data.activityActorSlotId;delete f.rec.activityActorSlotId;delete f.rec.worldRecordId;
  const intent=f.entity.data.intent;
  f.owner._rebindTethysSavedCast();assert.equal(f.entity.data.activityActorSlotId,undefined);
  assert.equal(f.entity.data.intent,intent);assert.equal(f.owner._tethysSavedCastRebindPending,true);
  jobs.resumeJob(f.entity.data.jobId);f.owner._stepCeresCausalChain(1/60);
  assert.equal(f.entity.data.activityActorSlotId,SLOT);assert.equal(f.entity.data.cargoManifest.totalQty,6);f.sim.dispose();
});


test('finite Tethys: existing world-record cap fails closed for an uncaptured original',()=>{
  const f=fixture();const worldOwner=Object.assign(Object.create(world),{state:f.state,bus:f.bus,helpers:f.owner.helpers});
  for(let i=0;i<24;i++){
    const entity=f.sim.spawn({type:'ship',homeSectorId:SECTOR,pos:{x:200+i*30,z:0},data:{worldRecordId:`cap-original-${i}`,durable:true,trafficRole:'hauler'}});
    assert.ok(worldOwner.upsertWorldRecord(entity));
  }
  worldOwner._captureSectorDurableRecords(SECTOR);
  assert.equal(f.state.world.records.byId[f.rec.worldRecordId],undefined);
  assert.ok(!f.entity.data.worldRecordId,'cap refuses and clears uncaptured identity');
  assert.equal(f.emit(),0);assert.equal(f.entity.data.cargoManifest.totalQty,6);
  assert.equal(f.owner._initializeTethysShipment(f.entity,{slot:f.slot},true,null),false);
  f.sim.dispose();
});


test('finite Tethys: interrupted choreography news never invents a successful cargo release',()=>{
  const f=fixture();f.owner._ensureCeresCausalChain('test');
  const news=f.owner._causalSpec().cycleNews({seeds:{runner_bolted:true}});
  assert.match(news.text,/tense watch/);assert.doesNotMatch(news.text,/dumped|delivered|transferred/);
  f.sim.dispose();
});


test('finite Tethys: rebind rejects a wrong-kind record or non-ship original impostor',()=>{
  for(const malformed of ['record','entity']){
    const f=fixture();const record=captureEntityRecord(f.entity,{seed:4242,sectorId:SECTOR});
    f.state.world.records={byId:{[record.recordId]:record},bySector:{[SECTOR]:[record.recordId]}};
    delete f.entity.data.activityActorSlotId;delete f.rec.activityActorSlotId;
    if(malformed==='record')record.kind=RECORD_KIND.HOSTILE;else f.entity.type='pickup';
    f.owner._rebindTethysSavedCast();
    assert.equal(f.entity.data.activityActorSlotId,undefined);assert.equal(f.rec.activityActorSlotId,undefined);
    assert.equal(f.entity.data.cargoManifest.totalQty,6);f.sim.dispose();
  }
});
