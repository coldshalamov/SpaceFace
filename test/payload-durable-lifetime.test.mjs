import assert from 'node:assert/strict';
import test from 'node:test';
import {createBus} from '../src/core/eventBus.js';
import {createGameState} from '../src/core/gameState.js';
import {core} from '../src/core/coreSystem.js';
import {weapons} from '../src/systems/weapons.js';
import {spawn47aOpeningScene} from '../src/data/scenarios/47aLiveScene.js';
import {handlePayloadSectorTransition,spawnPayloadEntity} from '../src/combat/industrialBeam.js';

function fixture(sliced=false){
 const state=createGameState(47),bus=createBus(),helpers={};
 state.mode='loading';core.init({state,bus,helpers});
 if(sliced){bus.on('sector:enter',()=>{});bus.setEmitSliceBudget('sector:enter',1);}
 const owner=Object.create(weapons);owner.init({state,bus,helpers});
 return{state,bus,helpers,owner,close(){owner.destroy();core.destroy();}};
}
for(const sliced of [false,true])test(`authored47-A payloads survive ${sliced?'sliced':'synchronous'} boot-enter cleanup`,()=>{
 const f=fixture(sliced);
 try{
  const old=spawnPayloadEntity(f.state,{pos:{x:1,z:1}},f.helpers);
  f.state.world.enterSerial = 1;
  f.bus.emit('sector:enter',{sectorId:'sector_helios_prime',enterTick:0,enterEpoch:1,payloadGenerationCutoff:f.state.nextOccupantGeneration});
  const cast=spawn47aOpeningScene({state:f.state,helpers:f.helpers,liveColdStartSafe:true});
  const props=[cast.spindle,cast.civilianPod];
  assert.ok(props.every(Boolean),'real authored props must exist');
  const ids=props.map(e=>e.id),generations=props.map(e=>e.occupantGeneration);
  f.state.mode='flight';f.state.tick=1;f.bus.flushSlicedEmits();f.bus.flush();
  assert.notEqual(f.state.entities.get(old.id),old);
  assert.equal(old.alive,false);
  for(let i=0;i<props.length;i++){
   assert.equal(f.state.entities.get(ids[i]),props[i]);assert.equal(props[i].alive,true);
   assert.equal(props[i].occupantGeneration,generations[i]);
   assert.ok(f.state.entityIndex.payloads.includes(props[i]));
   assert.equal(props[i].data.anchored,undefined,'no fixture-only anchoring');
  }
 }finally{f.close();}
});
const durablePolicies={
 persistent:e=>{e.flags={...e.flags,persistent:true};},
 missionPinned:e=>{e.flags={...e.flags,missionPinned:true};},
 dataPersistent:e=>{e.data.persistent=true;},
 dataMissionPinned:e=>{e.data.missionPinned=true;},
 nonTransient:e=>{e.data.transientSector=false;},
 anchored:e=>{e.data.anchored=true;},
 worldRecord:e=>{e.data.worldRecordId='original-payload-record';},
};
for(const[policy,stamp]of Object.entries(durablePolicies))test(`payload cleanup respects explicit ${policy} lifetime without duplicating custody`,()=>{
 const f=fixture(true);try{
  const destroyed=[];f.bus.on('entity:destroyed',p=>destroyed.push(p));
  const e=spawnPayloadEntity(f.state,{salvagePool:{cmdty_copper:3}},f.helpers);stamp(e);
  const before=JSON.stringify({data:e.data,flags:e.flags}),generation=e.occupantGeneration;
  assert.equal(handlePayloadSectorTransition(f.state,f.helpers),0);
  assert.equal(handlePayloadSectorTransition(f.state,f.helpers),0);
  assert.equal(f.state.entities.get(e.id),e);assert.equal(e.occupantGeneration,generation);
  assert.equal(JSON.stringify({data:e.data,flags:e.flags}),before);
  assert.equal(f.state.entityList.filter(x=>x===e).length,1);
  f.state.world.enterSerial = 1;
  for(let i=0;i<3;i++){f.bus.emit('sector:enter',{sectorId:'sector_helios_prime',enterTick:i,enterEpoch:1,payloadGenerationCutoff:f.state.nextOccupantGeneration});f.bus.flushSlicedEmits();f.bus.flush();}
  assert.equal(f.state.entities.get(e.id),e);assert.equal(JSON.stringify({data:e.data,flags:e.flags}),before);
  assert.deepEqual(destroyed,[]);
 }finally{f.close();}
});
test('default transient cleanup publishes canonical destruction exactly once and cannot affect reused ID',()=>{
 const f=fixture();try{
  core.preStep(1/60,f.state);
  const e=spawnPayloadEntity(f.state,{},f.helpers),events=[];
  f.bus.on('entity:destroyed',p=>events.push(p));
  assert.equal(handlePayloadSectorTransition(f.state,f.helpers),1);
  assert.equal(handlePayloadSectorTransition(f.state,f.helpers),0);f.bus.flush();
  assert.deepEqual(events.map(p=>({id:p.id,reason:p.reason})),[{id:e.id,reason:'payload_sector_transition'}]);
  assert.equal(f.state.entityIndex.payloads.includes(e),false);
  const next=spawnPayloadEntity(f.state,{transientSector:false},f.helpers);
  assert.equal(next.id,e.id);assert.notEqual(next.occupantGeneration,e.occupantGeneration);
  assert.equal(handlePayloadSectorTransition(f.state,f.helpers),0);
  assert.equal(f.state.entities.get(next.id),next);
 }finally{f.close();}
});
test('active player tether protects original transient body until detached',()=>{
 const f=fixture();try{
  const e=spawnPayloadEntity(f.state,{},f.helpers);f.state.player.tether={targetId:e.id};
  assert.equal(handlePayloadSectorTransition(f.state,f.helpers),0);
  f.state.player.tether.targetId=null;
  assert.equal(handlePayloadSectorTransition(f.state,f.helpers),1);
 }finally{f.close();}
});
test('serialized explicit lifetime markers survive canonical rehydration and repeated cleanup',()=>{
 const f=fixture();try{
  const original=spawnPayloadEntity(f.state,{transientSector:false,salvagePool:{cmdty_copper:3}},f.helpers);
  original.flags={...original.flags,persistent:true};
  // Serialized-entity boundary control, not an end-to-end Save/Continue claim.
  const saved=JSON.parse(JSON.stringify({type:original.type,data:original.data,flags:original.flags,pos:original.pos,radius:original.radius,mass:original.mass,hull:original.hull,hullMax:original.hullMax}));
  f.helpers.removeEntity(original.id,{immediate:true,reason:'test-envelope-rehydrate'});
  const restored=f.helpers.spawnEntity(saved);
  assert.equal(handlePayloadSectorTransition(f.state,f.helpers),0);
  assert.equal(f.state.entities.get(restored.id),restored);
  assert.deepEqual(restored.data.salvagePool,{cmdty_copper:3});
 }finally{f.close();}
});

for(const marker of [{flags:{persistent:false}},{flags:{missionPinned:false}},{flags:{persistent:'false'}},{data:{persistent:false}},{data:{missionPinned:false}},{data:{transientSector:true}},{data:{transientSector:'false'}}])test(`non-opt-in marker remains transient ${JSON.stringify(marker)}`,()=>{
 const f=fixture();try{const e=spawnPayloadEntity(f.state,{},f.helpers);
  if(marker.flags)e.flags={...e.flags,...marker.flags};if(marker.data)Object.assign(e.data,marker.data);
  assert.equal(handlePayloadSectorTransition(f.state,f.helpers),1);assert.equal(f.state.entities.has(e.id),false);
 }finally{f.close();}
});
