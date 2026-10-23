// Actual Rhea traffic placement, job owner and Save/Continue; casualty/pod receipts are
// explicit scalar inputs. The actual world owner preserves the original hull's tombstone
// and gives the same rescued person one replacement body. No native combat/rescue flight claimed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {uniqueWrecks} from '../src/systems/uniqueWrecks.js';
import {npcJobsRuntime} from '../src/systems/npcJobsRuntime.js';
import {traffic} from '../src/systems/traffic.js';
import {save} from '../src/save/saveSystem.js';
import {rheaShiftBroadcast} from '../src/data/rheaShiftBroadcast.js';
import {stationBroadcast} from '../src/systems/stationBroadcast.js';
import {VoiceQueue} from '../src/ui/voiceArbiter.js';
import {world} from '../src/systems/world.js';
import {SECTORS} from '../src/data/sectors.js';
import {activityPocketsForSector} from '../src/data/sectorActivityPockets.js';
import {rescuedWorkerMemoryFor,createContactHailOffer,contactHailAvailability} from '../src/data/contactHail.js';
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
const STATION='station_rhea_cinder';
const projection=t=>rheaShiftBroadcast(t.state,STATION);
function returned(){const t=boot();t.rescue();t.due();return t;}
function radio(t){
 const p=t.state.entities.get(t.state.playerId);
 const station=t.sim.spawn({type:'station',pos:{...p.pos},data:{stationId:STATION,stationTypeId:'mining'}});
 const calls=[],b=Object.create(stationBroadcast);
 b.init({state:t.state,bus:t.bus,registry:{get:()=>null},helpers:{voice:{say:m=>{calls.push(m);return true;}}}});
 return {b,calls,station};
}
test('real authored rescued miner is heard only after its original job returns',()=>{
 const t=boot();try{assert.equal(projection(t),null);t.rescue();assert.equal(projection(t),null);t.due();assert.match(projection(t).text,/back on the yard-to-slag run/);assert.deepEqual(t.sim.helpers.npcJobs.get(t.hulls()[0].data.jobId).job.route,t.route);}finally{t.close();}
});
test('real Save/Continue pending return, current shift and later final loss remain distinct',async()=>{
 const t=boot();try{t.rescue();await t.reload();assert.equal(projection(t),null);t.due();const fact=projection(t);assert.ok(fact);await t.reload();assert.equal(projection(t),null,'wait for restored live identity/job owner admission');t.due();assert.deepEqual(projection(t),fact);const h=t.hulls()[0];t.state.simTime+=20;t.bus.emit('entity:killed',{id:h.id});h.alive=false;t.state.entities.delete(h.id);const loss=projection(t);assert.match(loss.text,/has been lost/);await t.reload();t.due();assert.deepEqual(projection(t),loss);assert.equal(t.hulls().length,0);}finally{t.close();}
});
for(const outcome of ['adrift','rescued','ransomed','abandoned'])test(`closed or pending ${outcome} never describes a working return`,()=>{const t=returned();try{t.rec().outcome=outcome;assert.equal(projection(t),null);}finally{t.close();}});
for(const field of ['rescuedAtS','returnedAtS'])for(const value of [null,undefined,NaN,Infinity,-1,'100',10000])test(`${field} rejects ${String(value)}`,()=>{const t=returned();try{t.rec()[field]=value;assert.equal(projection(t),null);}finally{t.close();}});
test('genuine zero event times remain eligible',()=>{const t=returned();try{t.rec().rescuedAtS=0;t.rec().returnedAtS=0;assert.ok(projection(t));}finally{t.close();}});
for(const change of ['dead','wrong person','wrong record','wrong sector','missing job','virtual job','foreign job','corrupt job','changed route','changed kind'])test(`work witness rejects ${change}`,()=>{
 const t=returned();try{const h=t.hulls()[0],entry=t.state.npcJobs.byId[h.data.jobId];
 if(change==='dead')h.alive=false;
 if(change==='wrong person')h.data.rescuedWorkerPerson='other';
 if(change==='wrong record')h.data.worldRecordId='other';
 if(change==='wrong sector')h.data.sectorId='sector_io_reach';
 if(change==='missing job')delete t.state.npcJobs.byId[h.data.jobId];
 if(change==='virtual job')entry.entityId=null;
 if(change==='foreign job')entry.worldRecordId='other';
 if(change==='corrupt job')entry.job.corrupt=true;
 if(change==='changed route')entry.job.route=entry.job.route.map((x,i)=>i?x:{...x,pos:{x:x.pos.x+1,z:x.pos.z}});
 if(change==='changed kind')entry.job.kind='hauler';
 assert.equal(projection(t),null);
 }finally{t.close();}
});
test('loss needs prior return and real loss timestamp, not absence or epoch-coerced null',()=>{const t=returned();try{const r=t.rec();r.outcome='lost';r.lostAtS=null;assert.equal(projection(t),null);r.lostAtS=t.state.simTime+1;assert.equal(projection(t),null);r.lostAtS=t.state.simTime;r.returnedAtS=null;assert.equal(projection(t),null);}finally{t.close();}});
test('projection stays local and read-only without RNG or economy access',()=>{const t=returned();try{const before=JSON.stringify(t.state.player.uniqueWrecks);t.state.rng=()=>{throw Error('shared RNG touched')};assert.ok(projection(t));assert.equal(JSON.stringify(t.state.player.uniqueWrecks),before);assert.equal(rheaShiftBroadcast(t.state,'station_helios'),null);t.state.world.currentSectorId='sector_io_reach';assert.equal(projection(t),null);}finally{t.close();}});
test('ordinary cadence keeps three generic buckets, then recurs without one-shot state',()=>{const t=returned();const r=radio(t);try{t.state.simTime=160;r.b._tick();assert.match(r.calls.at(-1).text,/rescued seam miner/);r.b._tick();assert.equal(r.calls.length,1);for(const n of [180,200,220]){t.state.simTime=n;r.b._tick();assert.doesNotMatch(r.calls.at(-1).text,/rescued seam miner/);}t.state.simTime=240;r.b._tick();assert.match(r.calls.at(-1).text,/rescued seam miner/);assert.equal(r.calls.length,5);}finally{r.b.destroy();t.close();}});
test('queued recap validity follows actor/job truth and station proximity',()=>{const t=returned();const r=radio(t);try{t.state.simTime=160;r.b._tick();const msg=r.calls.at(-1);assert.equal(msg.valid(),true);const h=t.hulls()[0],job=t.state.npcJobs.byId[h.data.jobId];job.entityId=null;assert.equal(msg.valid(),false);job.entityId=h.id;assert.equal(msg.valid(),true);t.state.entities.get(t.state.playerId).pos.x+=2000;assert.equal(msg.valid(),false);}finally{r.b.destroy();t.close();}});
test('queued return does not survive final loss and loss recap is remembered history',()=>{const t=returned();const r=radio(t);try{t.state.simTime=160;r.b._tick();const msg=r.calls.at(-1),h=t.hulls()[0];t.bus.emit('entity:killed',{id:h.id});h.alive=false;t.state.entities.delete(h.id);assert.equal(msg.valid(),false);t.state.simTime=240;r.b._tick();assert.match(r.calls.at(-1).text,/has been lost/);assert.doesNotMatch(r.calls.at(-1).text,/today|you killed/i);}finally{r.b.destroy();t.close();}});test('absent hull and recycled entity id never count as a return',()=>{const t=returned();try{const h=t.hulls()[0];t.state.entities.delete(h.id);assert.equal(projection(t),null);t.state.entities.set(h.id,{...h,data:{...h.data,rescuedWorkerPerson:'other'}});assert.equal(projection(t),null);assert.equal(t.rec().outcome,'returned');}finally{t.close();}});
test('current terminal or foreign world record suppresses working claims',()=>{const t=returned();try{const id=t.rec().worldRecordId;t.state.world.records={byId:{[id]:{alive:false}}};assert.equal(projection(t),null);t.state.world.records.byId[id]={alive:true,sectorId:'sector_io_reach'};assert.equal(projection(t),null);}finally{t.close();}});
test('bounded lookup never scans all entities or repairs index',()=>{const t=returned();try{t.state.entities.values=()=>{throw Error('whole-scene scan')};const index=t.state.entityIndex.byWorldRecordId;const before=[...index];assert.ok(projection(t));assert.deepEqual([...index],before);}finally{t.close();}});
test('queued recap respects later combat, onboarding, restore and mode changes',()=>{const t=returned();const r=radio(t);try{t.state.simTime=160;r.b._tick();const msg=r.calls.at(-1);assert.equal(msg.valid(),true);t.state.onboarding.active=true;t.state.onboarding.finished=false;assert.equal(msg.valid(),false);t.state.onboarding.finished=true;r.b._restoring=true;assert.equal(msg.valid(),false);r.b._restoring=false;t.state.mode='station';assert.equal(msg.valid(),false);t.state.mode='flight';t.bus.emit('combat:damage',{targetId:t.state.playerId});assert.equal(msg.valid(),false);t.state.simTime+=13;assert.equal(msg.valid(),true);}finally{r.b.destroy();t.close();}});
test('missing truth falls back to unchanged ordinary station chatter',()=>{const t=boot();const r=radio(t);try{t.state.simTime=160;r.b._tick();assert.equal(r.calls.length,1);assert.doesNotMatch(r.calls[0].text,/rescued|has been lost/);assert.equal(r.calls[0].valid,undefined);}finally{r.b.destroy();t.close();}});
test('revisit reprojects current work rather than carrying a queued station claim',()=>{const t=returned();const r=radio(t);try{t.state.simTime=160;r.b._tick();const msg=r.calls.at(-1);t.state.world.currentSectorId='sector_io_reach';assert.equal(msg.valid(),false);assert.equal(projection(t),null);t.state.world.currentSectorId=SECTOR;assert.ok(projection(t));t.state.simTime=240;r.b._tick();assert.match(r.calls.at(-1).text,/rescued seam miner/);}finally{r.b.destroy();t.close();}});
test('actual VoiceQueue drops invalidated recap before delivery and retracts a stale active recap',()=>{const t=returned();const r=radio(t);try{t.state.simTime=160;r.b._tick();const msg=r.calls.at(-1),q=new VoiceQueue();q.enqueue({channel:'story',text:'Mission owns the floor',ttl:1},0);q.step(0);q.enqueue(msg,0);const hull=t.hulls()[0];hull.alive=false;assert.equal(q.step(1001),null);assert.equal(q.pending.length,0);hull.alive=true;q.enqueue(msg,1002);assert.equal(q.step(1002)?.id,msg.id);t.state.mode='station';q.step(1003);assert.equal(q.active,null);}finally{r.b.destroy();t.close();}});
test('station radio connects actual world rescue, Save, admitted replacement shift and final loss without reviving the casualty',async()=>{
 const t=boot();let radioState;
 try{
  const original=structuredClone(t.state.world.records.byId[t.recordId]);
  assert.equal(original.alive,false);assert.equal(original.outcome,'destroyed');
  t.rescue();await t.reload();assert.equal(projection(t),null);
  t.due();assert.notEqual(t.rec().worldRecordId,t.recordId);assert.equal(t.rec().sourceWorldRecordId,t.recordId);
  assert.equal(t.state.world.records.byId[t.rec().worldRecordId].alive,true);
  const shift=projection(t);assert.match(shift.text,/back on the yard-to-slag run/);
  radioState=radio(t);t.state.simTime=160;radioState.b._tick();assert.equal(radioState.calls.at(-1).text,shift.text);
  await t.reload();t.due();assert.deepEqual(projection(t),shift);
  const current=t.hulls()[0];assert.equal(current.data.worldRecordId,t.rec().worldRecordId);
  assert.deepEqual(t.sim.helpers.npcJobs.get(current.data.jobId).job.route,t.route);
  t.state.simTime=240;t.bus.emit('entity:killed',{id:current.id});current.alive=false;t.state.entities.delete(current.id);
  assert.equal(t.rec().outcome,'lost');assert.equal(t.state.world.records.byId[t.rec().worldRecordId].alive,false);
  const loss=projection(t);assert.match(loss.text,/has been lost/);assert.equal(radioState.calls[0].valid(),false);
  await t.reload();t.due();assert.deepEqual(projection(t),loss);assert.equal(t.hulls().length,0);
  radioState.b.destroy();radioState=radio(t);t.state.simTime=Math.ceil(t.state.simTime/80)*80;
  radioState.b._tick();assert.equal(radioState.calls.at(-1).text,loss.text);
  assert.equal(radioState.calls.at(-1).valid(),true);
  assert.deepEqual(structuredClone(t.state.world.records.byId[t.recordId]),original);
 }finally{radioState?.b.destroy();t.close();}
});
test('world-resident absence is quiet until actual rematerialization and original job re-admission',()=>{
 const t=returned();try{
  const w=t.sim.registry.get('world'),id=t.rec().worldRecordId,first=t.hulls()[0];assert.ok(projection(t));
  w._captureSectorDurableRecords(SECTOR,{reason:'radio_shift_test'});w._despawnEntityIds(new Set([first.id]));t.host._clearRuntime();
  t.due();assert.equal(t.hulls().length,0);assert.equal(projection(t),null,'absence is neither a working shift nor a final loss');
  w._rematerializeSectorRecords(SECTOR,{},'FULL');t.due();assert.equal(t.hulls().length,1);assert.equal(t.hulls()[0].data.worldRecordId,id);assert.ok(projection(t));
 }finally{t.close();}
});
