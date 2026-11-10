// Actual Rhea traffic placement, job owner and Save/Continue; casualty/pod receipts are
// explicit scalar inputs. No native combat, recovery flight or full production boot claimed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {uniqueWrecks} from '../src/systems/uniqueWrecks.js';
import {npcJobsRuntime} from '../src/systems/npcJobsRuntime.js';
import {traffic} from '../src/systems/traffic.js';
import {save} from '../src/save/saveSystem.js';
import {normalizeRescuedWorkers} from '../src/systems/rescuedWorkerReturn.js';
import {SECTORS} from '../src/data/sectors.js';
import {activityPocketsForSector} from '../src/data/sectorActivityPockets.js';
import {rescuedWorkerMemoryFor,createContactHailOffer,contactHailAvailability} from '../src/data/contactHail.js';
import {world} from '../src/systems/world.js';
const SECTOR='sector_rhea_cinder';
function boot(){
 const storage=new Map();globalThis.localStorage={get length(){return storage.size},key(i){return [...storage.keys()][i]??null},getItem(k){return storage.get(k)??null},setItem(k,v){storage.set(k,String(v))},removeItem(k){storage.delete(k)}};
 const sim=createSimulation({seed:4242,systems:[world,uniqueWrecks,traffic,npcJobsRuntime,save]});
 const {state,bus}=sim;state.mode='flight';state.world.currentSectorId=SECTOR;state.onboarding={active:false,finished:true};
 const player=sim.spawn({type:'ship',team:0,pos:{x:0,z:0},hull:100});state.playerId=player.id;
 const sector=SECTORS.find(s=>s.id===SECTOR);
 assert.equal(sim.registry.get('traffic')._materializeAuthoredActivityCast(sector,activityPocketsForSector(SECTOR)),4);
 const worker=[...state.entities.values()].find(e=>e.data?.activityActorSlotId==='rhea_seam_miner');
 assert.equal(worker.data.defId,'ship_pelican');
 const route=structuredClone(sim.helpers.npcJobs.get(worker.data.jobId).job.route);
 assert.deepEqual(route.map(w=>w.id),['rhea_miner_yard_face','rhea_miner_slag_face']);
 const recordId=worker.data.worldRecordId;
 bus.emit('entity:killed',{id:worker.id});worker.alive=false;state.entities.delete(worker.id);
 bus.emit('survivorPod:ejected',{victimId:worker.id});
 const host=sim.registry.get('uniqueWrecks'), saver=sim.registry.get('save');
 const rec=()=>Object.values(state.player.uniqueWrecks.rescuedWorkers.people)[0];
 const hulls=()=>[...state.entities.values()].filter(e=>e.alive!==false&&e.data?.worldRecordId===rec().worldRecordId);
 const rescue=(outcome='rescued')=>bus.emit('survivorPod:resolved',{id:'rescue:rhea:one',victimId:worker.id,outcome,t:state.simTime});
 const reload=async()=>{assert.equal(saver.save('quick'),true);assert.equal(await saver.load('latest'),true);};
 const due=()=>{state.simTime=Math.max(state.simTime,100);host._rescuedWorkers.sync();};
 return {sim,state,bus,host,rec,hulls,rescue,reload,due,route,recordId,close(){sim.dispose();delete globalThis.localStorage;}};
}

test('full-world casualty preserves original tombstone while rescued person returns in one durable body',async()=>{
 const t=boot();try{
  const original=structuredClone(t.state.world.records.byId[t.recordId]);
  assert.equal(original.outcome,'destroyed');assert.equal(original.alive,false);
  const person=t.rec().personKey;t.rescue();await t.reload();t.due();
  assert.equal(t.rec().outcome,'returned');assert.notEqual(t.rec().worldRecordId,t.recordId);
  assert.deepEqual(structuredClone(t.state.world.records.byId[t.recordId]),original,'original casualty tombstone is untouched');
  assert.equal(t.rec().worldRecordId,`${person}:return`);assert.equal(t.rec().sourceWorldRecordId,t.recordId);
  assert.equal(t.hulls().length,1);assert.equal(t.hulls()[0].data.rescuedWorkerPerson,person);
  assert.deepEqual(t.sim.helpers.npcJobs.get(t.hulls()[0].data.jobId).job.route,t.route);
  assert.equal(t.state.world.records.byId[t.recordId].outcome,'destroyed');assert.equal(t.state.world.records.byId[t.recordId].alive,false);
  const returned=t.rec().worldRecordId;await t.reload();t.due();t.rescue();t.due();
  assert.equal(t.rec().worldRecordId,returned);assert.equal(t.hulls().length,1);
  const hull=t.hulls()[0];t.state.simTime=125;t.bus.emit('entity:killed',{id:hull.id});hull.alive=false;t.state.entities.delete(hull.id);
  assert.equal(t.rec().outcome,'lost');assert.equal(t.state.world.records.byId[returned].outcome,'destroyed');
  await t.reload();t.state.simTime=250;t.due();assert.equal(t.hulls().length,0);assert.equal(t.rec().outcome,'lost');assert.equal(t.state.world.records.byId[t.recordId].alive,false);
 }finally{t.close();}
});
test('world capture and rematerialization preserve the replacement body, never summon an absent resident',()=>{
 const t=boot();try{
  t.rescue();t.due();assert.equal(t.rec().outcome,'returned');const first=t.hulls()[0],id=t.rec().worldRecordId;
  const w=t.sim.registry.get('world');
  w._captureSectorDurableRecords(SECTOR,{reason:'test_return_body'});
  assert.equal(t.state.world.records.byId[id].ai.rescuedWorkerPerson,t.rec().personKey);
  w._despawnEntityIds(new Set([first.id]));assert.equal(t.hulls().length,0);
  t.host._clearRuntime();t.due();assert.equal(t.hulls().length,0,'absent resident belongs to world, not a new spawn');
  w._rematerializeSectorRecords(SECTOR,{},'FULL');assert.equal(t.hulls().length,1);const restored=t.hulls()[0];
  assert.equal(restored.data.ai.rescuedWorkerPerson,t.rec().personKey);t.due();assert.equal(restored.data.rescuedWorkerPerson,t.rec().personKey);
  assert.ok(t.sim.helpers.npcJobs.get(restored.data.jobId));assert.equal(t.rec().worldRecordId,id);
 }finally{t.close();}
});
test('a deterministic return-id collision cannot relabel or seize another body',()=>{
 const t=boot();try{
  t.rescue();const id=`${t.rec().personKey}:return`;
  const foreign=t.sim.spawn({type:'ship',team:2,pos:{x:0,z:0},hull:100,data:{worldRecordId:id,sectorId:SECTOR,defId:'ship_wasp'}});
  const before=JSON.stringify(foreign.data);t.due();assert.equal(t.rec().outcome,'rescued');assert.equal(t.rec().worldRecordId,t.recordId);assert.equal(JSON.stringify(foreign.data),before);
 }finally{t.close();}
});
test('an existing terminal return body never receives another identity or body',()=>{
 const t=boot();try{
  t.rescue();t.due();const id=t.rec().worldRecordId,hull=t.hulls()[0];
  t.state.simTime=120;t.bus.emit('entity:killed',{id:hull.id});hull.alive=false;t.state.entities.delete(hull.id);
  // Older pending data may precede the final-loss owner event; the world tombstone is still final.
  t.rec().outcome='rescued';t.rec().returnedAtS=null;t.rec().lostAtS=null;t.due();
  assert.equal(t.rec().outcome,'lost');assert.equal(t.rec().worldRecordId,id);assert.equal(t.hulls().length,0);
 }finally{t.close();}
});
test('death immediately after world rematerialization cannot create a recursive rescued person',()=>{
 const t=boot();try{
  t.rescue();t.due();const w=t.sim.registry.get('world'),id=t.rec().worldRecordId,person=t.rec().personKey;
  w._captureSectorDurableRecords(SECTOR,{reason:'test_return_body'});w._despawnEntityIds(new Set([t.hulls()[0].id]));
  t.host._clearRuntime();w._rematerializeSectorRecords(SECTOR,{},'FULL');const body=t.hulls()[0];
  assert.equal(body.data.ai.rescuedWorkerPerson,person);
  t.bus.emit('entity:killed',{id:body.id});body.alive=false;t.state.entities.delete(body.id);
  t.bus.emit('survivorPod:ejected',{victimId:body.id});t.bus.emit('survivorPod:resolved',{id:'return-rescue',victimId:body.id,outcome:'rescued',t:110});t.due();
  assert.equal(Object.keys(t.state.player.uniqueWrecks.rescuedWorkers.people).length,1);assert.equal(t.rec().outcome,'lost');assert.equal(t.rec().worldRecordId,id);assert.equal(t.hulls().length,0);
 }finally{t.close();}
});
test('job refusal retains exactly one replacement body across Save and later admission',async()=>{
 const t=boot();try{
  t.rescue();const assign=t.sim.helpers.npcJobs.assign;t.sim.helpers.npcJobs.assign=()=>null;t.due();
  assert.equal(t.rec().outcome,'rescued');assert.equal(t.hulls().length,1);const id=t.rec().worldRecordId;
  await t.reload();t.due();assert.equal(t.hulls().length,1);assert.equal(t.rec().worldRecordId,id);assert.equal(t.rec().outcome,'rescued');
  t.sim.helpers.npcJobs.assign=assign;t.due();assert.equal(t.rec().outcome,'returned');assert.equal(t.hulls().length,1);assert.equal(t.rec().worldRecordId,id);
 }finally{t.close();}
});
test('legitimate already-returned legacy body keeps its existing identity and workplace',async()=>{
 const t=boot();try{
  t.rescue();const record=t.rec();record.worldRecordId='legacy:already-returned:rhea';record.outcome='returned';record.returnedAtS=75;
  const body=t.sim.spawn({type:'ship',team:2,pos:{...t.route[0].pos},hull:100,flags:{persistent:true},data:{defId:'ship_pelican',worldRecordId:record.worldRecordId,sectorId:SECTOR,rescuedWorkerPerson:record.personKey,persistenceOwner:'uniqueWrecks:rescuedWorkers'}});
  record.returnedEntityId=body.id;t.due();assert.equal(t.rec().worldRecordId,'legacy:already-returned:rhea');assert.equal(t.rec().sourceWorldRecordId,undefined);
  assert.equal(t.hulls().length,1);assert.ok(t.sim.helpers.npcJobs.get(body.data.jobId));
  await t.reload();t.due();assert.equal(t.rec().worldRecordId,'legacy:already-returned:rhea');assert.equal(t.hulls().length,1);assert.equal(t.rec().returnedAtS,75);assert.equal(t.state.world.records.byId[t.recordId].outcome,'destroyed');
 }finally{t.close();}
});
test('a foreign durable record at the return identity blocks migration without mutation',()=>{
 const t=boot();try{
  t.rescue();const id=`${t.rec().personKey}:return`;
  const body=t.sim.spawn({type:'ship',team:2,pos:{...t.route[0].pos},hull:100,homeSectorId:SECTOR,data:{worldRecordId:id,sectorId:SECTOR,defId:'ship_wasp'}});
  const w=t.sim.registry.get('world');w._captureSectorDurableRecords(SECTOR,{reason:'foreign_fixture'});w._despawnEntityIds(new Set([body.id]));
  const before=JSON.stringify(t.state.world.records.byId[id]);t.due();assert.equal(t.rec().worldRecordId,t.recordId);assert.equal(t.rec().outcome,'rescued');assert.equal(JSON.stringify(t.state.world.records.byId[id]),before);
 }finally{t.close();}
});

test('foreign live holder after migration cannot create duplicate body',()=>{const t=boot();try{t.rescue();t.sim.helpers.npcJobs.assign=()=>null;t.due();const id=t.rec().worldRecordId;const w=t.sim.registry.get('world');w._despawnEntityIds(new Set([t.hulls()[0].id]));t.host._clearRuntime();const foreign=t.sim.spawn({type:'ship',team:2,pos:{x:0,z:0},hull:100,data:{worldRecordId:id,sectorId:SECTOR,defId:'ship_wasp'}});t.due();assert.equal(t.hulls().length,1,'foreign live holder must block duplicate own hull');assert.equal(foreign.data.rescuedWorkerPerson,undefined);}finally{t.close();}});test('an owned terminal replacement closes pending legacy rescue even without a remembered entity id',()=>{
 const t=boot();try{
  t.rescue();const person=t.rec().personKey,id=`${person}:return`;
  const body=t.sim.spawn({type:'ship',team:2,pos:{...t.route[0].pos},hull:100,homeSectorId:SECTOR,data:{worldRecordId:id,sectorId:SECTOR,defId:'ship_pelican',ai:{rescuedWorkerPerson:person}}});
  // The world records death before the stale person record learns this body's numeric id.
  t.bus.emit('entity:killed',{id:body.id});body.alive=false;t.state.entities.delete(body.id);
  assert.equal(t.rec().returnedEntityId,null);t.due();
  assert.equal(t.rec().worldRecordId,id);assert.equal(t.rec().outcome,'lost');assert.equal(t.hulls().length,0);
 }finally{t.close();}
});
