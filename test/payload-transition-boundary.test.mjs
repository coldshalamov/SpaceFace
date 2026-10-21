import assert from 'node:assert/strict';
import test from 'node:test';
import {createBus} from '../src/core/eventBus.js';
import {createGameState} from '../src/core/gameState.js';
import {core} from '../src/core/coreSystem.js';
import {weapons} from '../src/systems/weapons.js';
import {resetRunState} from '../src/core/newGameBoot.js';
import {save} from '../src/save/saveSystem.js';
import {world} from '../src/systems/world.js';
import {spawnPayloadEntity,handlePayloadSectorTransition} from '../src/combat/industrialBeam.js';
import {drainDeferredEnterMaterializers} from '../src/core/sectorEnterDefer.js';
function fixture(sliced=false){
 const state=createGameState(47),bus=createBus(),helpers={};state.mode='loading';core.init({state,bus,helpers});
 if(sliced){bus.on('sector:enter',()=>{});bus.setEmitSliceBudget('sector:enter',1);}
 const owner=Object.create(weapons);owner.init({state,bus,helpers});
 return {state,bus,helpers,owner,spawn(){return spawnPayloadEntity(state,{},helpers);},close(){owner.destroy();core.destroy();},flush(){bus.flushSlicedEmits();bus.flush();}};
}
function boundary(f){f.state.world.enterSerial=(f.state.enterSerialSeq||0)+1;f.state.enterSerialSeq=f.state.world.enterSerial;return {enterEpoch:f.state.world.enterSerial,payloadGenerationCutoff:f.state.nextOccupantGeneration};}
function worldOwner(f,onMaterialize){
 const {state,bus,helpers}=f, sector={id:'boundary-target',name:'Boundary target',neighbors:[]};state.world.sectors[sector.id]=sector;state.world.currentSectorId='boundary-old';state.world.sectorContents={};
 const owner=Object.create(world);Object.assign(owner,{state,bus,helpers,
 _ensureResidencyState(){},_discoveryFor(){return {discovered:true,visitedCount:0};},_applyPlayableBounds(){},_entryPointFor(){return{x:0,z:0};},
 _applyResidencyPlan:onMaterialize,_emptySectorBag(){return{};},
 _spawnVestaOreCachePickup(){},_presentVestaOreCacheDecision(){},_spawnPallasHiddenCachePickup(){},_presentPallasHiddenCacheDecision(){},_ensureTethysEntranceRun(){},_placePlayer(){},_resolveShipModules(){},_flushPendingSpawns(){}});return owner;
}
for(const sliced of [false,true])test(`real world emitter preserves same-tick arrivals (${sliced?'sliced':'inline'})`,()=>{
 const f=fixture(sliced);try{
  const old=f.spawn(),cutoff=f.state.nextOccupantGeneration;let materialized,exitArrival,late,emitted;
  f.bus.on('sector:exit',()=>{exitArrival=f.spawn();});f.bus.on('sector:enter',p=>{emitted=p;});
  const owner=worldOwner(f,()=>{materialized=f.spawn();});
  const gen=owner.enterSectorChunked('boundary-target');assert.equal(gen.next().value,'enter-pre-emit');late=f.spawn();assert.equal(f.state.tick,0);gen.next();const after=f.spawn();f.flush();
  assert.equal(emitted.payloadGenerationCutoff,cutoff,'capture must precede exit listeners and materialization');assert.equal(old.alive,false);
  for(const e of [materialized,exitArrival,late,after])assert.equal(f.state.entities.get(e.id),e);
  const priorEpoch=emitted.enterEpoch;const second=owner.enterSectorChunked('boundary-target');second.next();const sameSectorArrival=f.spawn();second.next();f.flush();
  assert.ok(emitted.enterEpoch>priorEpoch);assert.equal(f.state.entities.get(sameSectorArrival.id),sameSectorArrival);
 }finally{f.close();}
});
test('sliced replay protects recycled IDs and removes the old default cohort once',()=>{
 const f=fixture(true);try{core.preStep(1/60,f.state);const old=f.spawn(),p=boundary(f),events=[];f.bus.on('entity:destroyed',p=>events.push(p));
 f.bus.emit('sector:enter',p);f.flush();assert.equal(old.alive,false);const next=f.spawn();assert.equal(next.id,old.id);assert.ok(next.occupantGeneration>=p.payloadGenerationCutoff);
 f.bus.emit('sector:enter',p);f.flush();assert.equal(f.state.entities.get(next.id),next);assert.equal(events.filter(e=>e.reason==='payload_sector_transition').length,1);
 }finally{f.close();}
});
test('stale sliced event cannot clean a newer epoch or replacement world',()=>{
 const f=fixture(true);try{const old=f.spawn(),p=boundary(f);f.bus.emit('sector:enter',p);const q=boundary(f);f.state.world={...f.state.world,enterSerial:q.enterEpoch};const next=f.spawn();f.flush();assert.equal(f.state.entities.get(old.id),old);assert.equal(f.state.entities.get(next.id),next);
 f.bus.emit('sector:enter',q);f.flush();assert.equal(old.alive,false);assert.equal(f.state.entities.get(next.id),next);
 }finally{f.close();}
});
for(const patch of [null,{}, {enterEpoch:'1',payloadGenerationCutoff:2},{enterEpoch:1},{enterEpoch:1,payloadGenerationCutoff:0},{enterEpoch:1,payloadGenerationCutoff:'2'},{enterEpoch:1,payloadGenerationCutoff:3}])test(`invalid explicit event boundary fails closed ${JSON.stringify(patch)}`,()=>{
 const f=fixture();try{const e=f.spawn();boundary(f);f.bus.emit('sector:enter',patch);f.flush();assert.equal(f.state.entities.get(e.id),e);assert.equal(handlePayloadSectorTransition(f.state,f.helpers,patch),0);assert.equal(handlePayloadSectorTransition(f.state,f.helpers),1);}finally{f.close();}
});
for(const generation of [undefined,'1',0,NaN])test(`unprovable occupant identity survives scoped cleanup ${String(generation)}`,()=>{
 const f=fixture();try{const e=f.spawn(),p=boundary(f);e.occupantGeneration=generation;assert.equal(handlePayloadSectorTransition(f.state,f.helpers,p),0);assert.equal(f.state.entities.get(e.id),e);}finally{f.close();}
});
test('deferred production provider forwards cutoff and preserves post-emit arrivals',()=>{
 const f=fixture();try{const old=f.spawn(),p=boundary(f);f.state.mode='flight';f.state.render.sectorEnterCookWillRun=()=>true;f.bus.emit('sector:enter',p);const next=f.spawn();assert.equal(old.alive,true);assert.ok(f.state.render.deferredEnterMaterializers.length);drainDeferredEnterMaterializers(f.state,{});assert.equal(old.alive,false);assert.equal(f.state.entities.get(next.id),next);}finally{f.close();}
});
for(const steps of [1,2])test(`partial weapons iterator stops when epoch changes after yield ${steps}`,()=>{
 const f=fixture();try{f.spawn();const p=boundary(f);f.owner._shuntCooldown=new Map([['sentinel',1]]);const gen=f.owner._onSectorEnterSteps(p);for(let i=0;i<steps;i++)assert.equal(gen.next().done,false);boundary(f);assert.equal(gen.next().done,true);assert.equal(f.owner._shuntCooldown.get('sentinel'),1);}finally{f.close();}
});

for(const reset of ['new-game','restore-session'])test(`real ${reset} epoch boundary rejects pending sliced cleanup`,()=>{
 const f=fixture(true);let session;try{const old=f.spawn(),p=boundary(f),generation=f.state.nextOccupantGeneration;f.bus.emit('sector:enter',p);
 if(reset==='new-game')resetRunState(f.state,{seed:48});
 else {const owner=Object.create(save);Object.assign(owner,{state:f.state,bus:f.bus,helpers:f.helpers});session=owner._openRestoreSession({entities:{persistent:[]}},'boundary',{});assert.notEqual(session.openFailed,true);}
 assert.ok(f.state.world.enterSerial>p.enterEpoch);assert.equal(f.state.nextOccupantGeneration,generation);const next=f.spawn();assert.ok(next.occupantGeneration>=generation);f.flush();assert.equal(f.state.entities.get(old.id),old);assert.equal(f.state.entities.get(next.id),next);
 }finally{if(session?.timeEffects)session.timeEffects.clear(session.restoreSource);f.close();}
});
// These exercise the actual reset/session-open boundaries, not a full Continue restore.
test('recycled ID before delayed delivery is a new occupant, not the captured cohort',()=>{
 const f=fixture(true);try{core.preStep(1/60,f.state);const old=f.spawn(),p=boundary(f);f.bus.emit('sector:enter',p);f.helpers.removeEntity(old.id,{immediate:true,reason:'boundary_test_recycle'});const next=f.spawn();assert.equal(next.id,old.id);assert.ok(next.occupantGeneration>=p.payloadGenerationCutoff);f.flush();assert.equal(f.state.entities.get(next.id),next);}finally{f.close();}
});
for(const counter of [undefined,0,'2',NaN,Number.MAX_SAFE_INTEGER+1])test(`world emitter refuses invalid capture counter ${String(counter)}`,()=>{
 const f=fixture();try{const e=f.spawn();f.state.nextOccupantGeneration=counter;let emitted;f.bus.on('sector:enter',p=>{emitted=p;});const owner=worldOwner(f,()=>{}),gen=owner.enterSectorChunked('boundary-target');gen.next();gen.next();f.flush();assert.equal(emitted.payloadGenerationCutoff,null);assert.equal(f.state.entities.get(e.id),e);}finally{f.close();}
});
for(const effect of ['reuse-id','reset-epoch'])test(`reentrant canonical removal cannot act on stale snapshot after ${effect}`,()=>{
 const f=fixture();try{core.preStep(1/60,f.state);const first=f.spawn(),second=f.spawn(),p=boundary(f),remove=f.helpers.removeEntity;let replacement,calls=[];
 const helpers={...f.helpers,removeEntity(id,options){calls.push(id);const result=remove(id,options);if(id===first.id){if(effect==='reuse-id'){remove(second.id,{immediate:true,reason:'boundary_test_recycle'});replacement=f.spawn();assert.equal(replacement.id,second.id);}else resetRunState(f.state,{seed:49});}return result;}};
 assert.equal(handlePayloadSectorTransition(f.state,helpers,p),1);assert.deepEqual(calls,[first.id]);if(replacement)assert.equal(f.state.entities.get(replacement.id),replacement);else assert.equal(f.state.entities.get(second.id),second);
 }finally{f.close();}
});
test('inline weapons cleanup stops if payload removal enters a new run',()=>{
 const f=fixture();try{f.spawn();const p=boundary(f),remove=f.helpers.removeEntity;let ship;f.owner.helpers={...f.helpers,removeEntity(id,options){const result=remove(id,options);resetRunState(f.state,{seed:50});f.owner._shuntCooldown=new Map([['new-run',1]]);ship=f.helpers.spawnEntity({type:'ship',data:{momentumSinkPlant:{active:true,anchorId:99}}});return result;}};f.bus.emit('sector:enter',p);assert.equal(f.owner._shuntCooldown.get('new-run'),1);assert.equal(ship.data.momentumSinkPlant.active,true);assert.equal(ship.data.momentumSinkPlant.anchorId,99);}finally{f.close();}
});
