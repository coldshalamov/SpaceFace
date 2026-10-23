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
const SECTOR='sector_rhea_cinder';
function boot(){
 const storage=new Map();globalThis.localStorage={get length(){return storage.size},key(i){return [...storage.keys()][i]??null},getItem(k){return storage.get(k)??null},setItem(k,v){storage.set(k,String(v))},removeItem(k){storage.delete(k)}};
 const sim=createSimulation({seed:4242,systems:[uniqueWrecks,traffic,npcJobsRuntime,save]});
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
 const hulls=()=>[...state.entities.values()].filter(e=>e.alive!==false&&e.data?.worldRecordId===recordId);
 const rescue=(outcome='rescued')=>bus.emit('survivorPod:resolved',{id:'rescue:rhea:one',victimId:worker.id,outcome,t:state.simTime});
 const reload=async()=>{assert.equal(saver.save('quick'),true);assert.equal(await saver.load('latest'),true);};
 const due=()=>{state.simTime=Math.max(state.simTime,100);host._rescuedWorkers.sync();};
 return {sim,state,bus,host,rec,hulls,rescue,reload,due,route,recordId,close(){sim.dispose();delete globalThis.localStorage;}};
}
function offer(t,hull){t.state.player.targetId=hull.id;t.state.mode='flight';t.state.ui.docked=false;Object.assign(t.state.entities.get(t.state.playerId).pos,hull.pos);const availability=contactHailAvailability(t.state);assert.equal(availability.enabled,true);return createContactHailOffer(t.state,availability,'rhea-hail',t.state.simTime+10);}
const timeFields=['rescuedAtS','returnDueAtS','returnedAtS','lostAtS','closedAtS','hailAcknowledgedAtS'];
for(const [label,value,expected] of [['null',null,null],['absent',undefined,null],['zero',0,0],['legacy numeric string','12.5',12.5],['legacy false',false,0],['legacy empty string','',0]]){
 test(`nullable worker event normalization preserves ${label}`,()=>{
  const raw=Object.fromEntries(timeFields.map(k=>[k,value]));
  const normalized=normalizeRescuedWorkers({people:{person:raw}}).people.person;
  for(const key of timeFields)assert.equal(normalized[key],expected,key);
 });
}
test('actual Rhea pending return survives repeated Save/Continue and preserves its one workplace',async()=>{
 const t=boot();try{
  const returns=[];t.bus.on('rescuedWorker:returned',p=>returns.push(p));t.rescue();const key=t.rec().personKey,due=t.rec().returnDueAtS;
  await t.reload();await t.reload();assert.equal(t.rec().returnedAtS,null);assert.equal(t.rec().returnDueAtS,due);
  t.state.world.currentSectorId='sector_io_reach';t.due();assert.equal(t.hulls().length,0,'no return in a foreign sector');
  t.state.world.currentSectorId=SECTOR;t.due();assert.equal(t.hulls().length,1);assert.equal(t.rec().outcome,'returned');assert.equal(t.rec().personKey,key);
  assert.deepEqual(t.sim.helpers.npcJobs.get(t.hulls()[0].data.jobId).job.route,t.route);
  t.rescue();t.due();assert.equal(t.hulls().length,1,'no duplicate after repeated receipt/sync');assert.equal(returns.length,1,'one return announcement after repeated loads/receipts/sync');
 }finally{t.close();}
});
test('save while adrift still schedules the later rescue instead of fabricating epoch-zero return',async()=>{
 const t=boot();try{await t.reload();assert.equal(t.rec().returnDueAtS,null);t.state.simTime=25;t.rescue();assert.ok(t.rec().returnDueAtS>=70);t.due();assert.equal(t.rec().outcome,'returned');assert.equal(t.hulls().length,1);}finally{t.close();}
});
test('returned worker keeps first remembered hail through Save, then acknowledgement survives another Continue',async()=>{
 const t=boot();try{
  t.rescue();t.due();assert.ok(rescuedWorkerMemoryFor(t.state,t.hulls()[0]));
  await t.reload();assert.equal(t.hulls().length,1);const hull=t.hulls()[0];assert.equal(t.rec().hailAcknowledgedAtS,null);assert.ok(rescuedWorkerMemoryFor(t.state,hull));
  const first=offer(t,hull);assert.match(first.lines.join(' '),/YOU PULLED MY POD/);
  // Continue remaps entity ids; use the actual rematerialized same-record hull.
  t.bus.emit('contactHail:offer',first);const ack=t.rec().hailAcknowledgedAtS;assert.equal(ack,t.state.simTime);
  await t.reload();assert.equal(t.rec().hailAcknowledgedAtS,ack);assert.equal(rescuedWorkerMemoryFor(t.state,t.hulls()[0]),null);
  assert.doesNotMatch(offer(t,t.hulls()[0]).lines.join(' '),/YOU PULLED MY POD/);
 }finally{t.close();}
});
test('a returned worker saved before final death records one loss and cannot resurrect',async()=>{
 const t=boot();try{
  t.rescue();t.due();await t.reload();assert.equal(t.rec().lostAtS,null);assert.equal(t.hulls().length,1);const hull=t.hulls()[0];
  t.state.simTime=120;t.bus.emit('entity:killed',{id:hull.id});hull.alive=false;t.state.entities.delete(hull.id);
  assert.equal(t.rec().outcome,'lost');assert.equal(t.rec().lostAtS,120);
  await t.reload();t.state.simTime=200;t.due();assert.equal(t.rec().outcome,'lost');assert.equal(t.rec().lostAtS,120);assert.equal(t.hulls().length,0);
  t.bus.emit('survivorPod:ejected',{victimId:hull.id});t.bus.emit('survivorPod:resolved',{id:'second-rescue',victimId:hull.id,outcome:'rescued',t:200});t.due();assert.equal(t.rec().outcome,'lost');assert.equal(t.hulls().length,0);
 }finally{t.close();}
});
for(const outcome of ['ransomed','abandoned','captured'])test(`${outcome} remains closed across Continue`,async()=>{const t=boot();try{t.rescue(outcome);await t.reload();t.due();assert.equal(t.hulls().length,0);assert.equal(t.rec().outcome,outcome==='captured'?'ransomed':outcome);}finally{t.close();}});

for(const value of [null,undefined,0,'3',false,''])test(`workplace optional phases retain intended defaults/legacy value ${String(value)}`,()=>{
 const phases=['commissionS','departS','approachS','workS','loadS','unloadS','dwellS'];
 const work={kind:'miner',route:[{id:'a'},{id:'b'}],speed:value,...Object.fromEntries(phases.map(k=>[k,value]))};
 const n=normalizeRescuedWorkers({people:{person:{workplace:work}}}).people.person.workplace;
 assert.equal(n.speed,value==null?60:Number(value));
 for(const phase of phases)assert.equal(n[phase],value==null?null:Number(value),phase);
});
for(const [label,timestamp,expected] of [['null',null,25],['zero',0,0],['numeric string','7',7]])test(`rescue receipt ${label} timestamp retains intended meaning`,()=>{
 const t=boot();try{t.state.simTime=25;t.bus.emit('survivorPod:resolved',{id:'rescue:rhea:timestamp',victimId:t.rec().victimId,outcome:'rescued',t:timestamp});assert.equal(t.rec().rescuedAtS,expected);assert.ok(t.rec().returnDueAtS>=70);}finally{t.close();}
});
