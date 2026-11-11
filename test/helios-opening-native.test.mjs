import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { createSimulation } from '../src/core/sim.js';
import { advance } from '../src/systems/npcJobs.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { snapshotFeatureMaps, restoreFeatureMaps, applyFeatureConfigToMaps } from '../src/data/featureFlags.js';
import { heliosCuttingCourtesyRead } from '../src/systems/heliosCuttingCourtesy.js';
import { heliosSharedCutRead } from '../src/systems/heliosSharedCut.js';
const DT=1/60;
test('opening producer recovers a drifting face, yields to the pilot and restores its finite work through Save', {timeout:120000}, async()=>{
 const flags=snapshotFeatureMaps(),r=createAuthoritativeRuntime({profileId:'production',nodeSafeOnly:true,seed:8008});
 applyFeatureConfigToMaps(r.config.features);
 try {
  const s=r.state,jobs=r.getSystem('npcJobsRuntime'),world=r.getSystem('world');
  s.mode='flight';s.ui.screenStack=[];r.getSystem('ships').newGame();
  const player=r.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:s.player,team:0,pos:{x:0,z:0}}));s.playerId=player.id;
  world.enterSector('sector_helios_prime');s.onboarding={active:false,finished:true};
  await r.getSystem('physics').prepareBackend(s);
  let worker;
  for(let i=0;i<7200;i++) {
   r.step(DT);worker=s.entityList.find(e=>e.alive&&e.data?.minerShiftActive===true);
   if(i%600===0) {const entry=s.npcJobs.byId['job:'+jobs._heliosStarterMinerRecordId];
    console.log('OPENING_PRODUCER',JSON.stringify({tick:s.tick,time:s.simTime,phase:entry?.job.phase,loop:entry?.job.loopCount,rockId:jobs._heliosStarterRockId}));}
   if(worker)break;
  }
  assert.ok(worker,'ordinary production worker must reach its first live cut in the bounded opening window');
  const rock=s.entities.get(worker.data.minerShiftRockId),entry=s.npcJobs.byId[worker.data.jobId];
  console.log('OPENING_CUT',JSON.stringify({atS:s.simTime,player:player.pos,worker:worker.pos,rock:rock.pos,workerRecord:worker.data.worldRecordId,slot:worker.data.activityActorSlotId,progress:entry.job.progress}));
  const grants=[];r.bus.on('economy:grantCredits',e=>grants.push(e));
  // Placement and aim selection are fixtures. Input, extraction, worker ownership,
  // populated-world physics and persistence below are production owners.
  world.relocatePlayerInSector({x:(worker.pos.x+rock.pos.x)/2,z:(worker.pos.z+rock.pos.z)/2}, {reason:'opening-crossing-fixture'});
  const held={ore:rock.data.oreHP,progress:entry.job.progress,beam:worker.data.minerShiftBeamS};
  for(let i=0;i<30;i++)r.step(DT);
  assert.ok(heliosCuttingCourtesyRead(s,worker));assert.equal(rock.data.oreHP,held.ore);
  assert.equal(entry.job.progress,held.progress);assert.equal(worker.data.minerShiftBeamS,held.beam);
  const dx=rock.pos.x-worker.pos.x,dz=rock.pos.z-worker.pos.z,d=Math.hypot(dx,dz);
  world.relocatePlayerInSector({x:rock.pos.x-dz/d*170,z:rock.pos.z+dx/d*170}, {reason:'opening-mining-fixture'});
  s.input.worldObjectTargetId=rock.id;const input=r.getSystem('input');
  input.ingestLaneDomEvent({type:'cursorProjection',x:rock.pos.x,z:rock.pos.z});
  input.ingestLaneDomEvent({type:'mousedown',button:2,clientX:0,clientY:0});
  for(let i=0;i<20&&!heliosSharedCutRead(s,worker);i++)r.step(DT);
  assert.ok(heliosSharedCutRead(s,worker),'ordinary right-button mining reaches shared-cut ownership');
  const shared={ore:rock.data.oreHP,progress:entry.job.progress,beam:worker.data.minerShiftBeamS};
  for(let i=0;i<12;i++)r.step(DT);
  assert.ok(heliosSharedCutRead(s,worker));assert.equal(worker.data.minerShiftActive,false);
  assert.equal(entry.job.progress,shared.progress);assert.equal(worker.data.minerShiftBeamS,shared.beam);
  assert.ok(rock.data.oreHP<shared.ore);assert.deepEqual(grants,[]);
  input.ingestLaneDomEvent({type:'mouseup',button:2,clientX:0,clientY:0});
  const snapshot={workerRecord:worker.data.worldRecordId,jobId:entry.job.id,ore:rock.data.oreHP,progress:entry.job.progress,beam:worker.data.minerShiftBeamS,rockId:rock.id,resourceBodyId:rock.data.resourceBodyId,credits:s.player.credits};
  const save=r.getSystem('save');assert.ok(save,'production Save owner is present');
  const envelope=JSON.parse(JSON.stringify(save.serialize('helios-opening-proof')));
  assert.equal(save.loadEnvelope(envelope,'helios-opening-proof'),true);
  s.mode='flight';
  const restored=s.npcJobs.byId[snapshot.jobId];
  assert.ok(restored);assert.equal(restored.worldRecordId,snapshot.workerRecord);
  assert.equal(restored.job.progress,snapshot.progress);assert.equal(s.player.credits,snapshot.credits);
  let continued=s.entities.get(restored.entityId);
  assert.ok(continued);assert.equal(continued.data.worldRecordId,snapshot.workerRecord);
  assert.equal(heliosSharedCutRead(s,continued),null);assert.equal(heliosCuttingCourtesyRead(s,continued),null);
  const exactFace=()=>[...s.entityList,...s.world.asteroidField.rocks].find(e=>e.alive!==false&&e.data?.resourceBodyId===snapshot.resourceBodyId);
  let remaining=exactFace();
  console.log('OPENING_CONTINUE_BOUNDARY',JSON.stringify({workerId:continued.id,record:continued.data.worldRecordId,
    rockId:snapshot.rockId,remaining:remaining&&{type:remaining.type,ore:remaining.data?.oreHP,pos:remaining.pos},beam:continued.data.minerShiftBeamS,heliosRecord:jobs._heliosStarterMinerRecordId}));
  assert.ok(remaining&&remaining.type==='asteroid');assert.equal(remaining.data.oreHP,snapshot.ore);
  const oreBeforeContinue=remaining.data.oreHP;
  for(let i=0;i<90;i++)r.step(DT);
  remaining=exactFace();
  assert.equal(jobs._asteroidForFieldWaypoint(s.npcJobs.byId[snapshot.jobId].job.route[1]),remaining);
  continued=s.entities.get(s.npcJobs.byId[snapshot.jobId].entityId);
  console.log('OPENING_CONTINUE_AFTER',JSON.stringify({record:continued?.data.worldRecordId,
    active:continued?.data.minerShiftActive,beam:continued?.data.minerShiftBeamS,phase:s.npcJobs.byId[snapshot.jobId].job.phase,
    progress:s.npcJobs.byId[snapshot.jobId].job.progress,ore:remaining.data.oreHP,heliosRecord:jobs._heliosStarterMinerRecordId}));
  assert.equal(continued?.data.worldRecordId,snapshot.workerRecord);
  assert.ok(s.npcJobs.byId[snapshot.jobId].job.progress>snapshot.progress);
  assert.ok(remaining.data.oreHP<oreBeforeContinue,'original finite face resumes extraction after Continue');
  assert.ok(continued.data.minerShiftBeamS>snapshot.beam&&continued.data.minerShiftBeamS<=6.05);
  assert.equal(s.player.credits,snapshot.credits);assert.deepEqual(grants,[]);
  console.log('OPENING_INTERACTION_SAVE',JSON.stringify({atS:s.simTime,worker:snapshot.workerRecord,oreBefore:shared.ore,oreAfter:snapshot.ore,courtesyHeldS:.5,sharedHeldFrames:12}));

 } finally {r.getSystem('npcJobsRuntime')._sharedCutCleanup?.();r.getSystem('npcJobsRuntime')._cuttingCourtesyCleanup?.();r.dispose();restoreFeatureMaps(flags);}
});

// A rejected moving face must end this trip, not strand a worker at an obsolete mark.

function returnFixture() {
 const h=createSimulation({seed:47,systems:[npcJobsRuntime]});
 const s=h.state,o=h.registry.get('npcJobsRuntime');s.world.currentSectorId='sector_helios_prime';
 const e=h.spawn({type:'ship',team:2,pos:{x:800,z:0},hull:100,hullMax:100,data:{worldRecordId:'opening-return',activityActorSlotId:'helios_starter_cutter'}});
 const rock=h.spawn({type:'asteroid',pos:{x:900,z:0},vel:{x:25,z:0},radius:18,data:{fieldId:'f_helios_starter',oreHP:100}});
 const id=o.assign(e,{kind:'miner',sectorId:'sector_helios_prime',route:[{id:'home:station_helios',pos:{x:0,z:0}},{id:'field:'+rock.id,pos:{x:900,z:0}}]});
 const entry=s.npcJobs.byId[id];Object.assign(entry.job,{phase:'approach',routeIndex:1,progress:.5});
 o._heliosStarterMinerRecordId=e.data.worldRecordId;o._heliosStarterRockId=rock.id;e.data.minerShiftRockId=rock.id;
 return {h,s,o,e,rock,id,entry};
}
test('unmoored finite face sends the original cutter home before another rock is commissioned',()=>{
 const {h,s,o,e,rock,id,entry}=returnFixture();try {
  const money=s.player.credits,events=[];h.bus.on('economy:grantCredits',p=>events.push(p));h.bus.on('mining:tick',p=>events.push(p));
  o._ensureHeliosStarterMiner();assert.equal(entry.job.phase,'return');assert.equal(entry.job.routeIndex,1);assert.equal(entry.job.progress,0);
  assert.equal(o._heliosStarterRockId,rock.id);assert.equal(e.data.minerShiftRockId,rock.id);assert.equal(rock.data.oreHP,100);
  const saved=JSON.parse(JSON.stringify(o.serialize()));assert.equal(saved.byId[id].job.phase,'return');assert.equal(saved.byId[id].job.heading,Math.PI);
  o.deserialize(saved);const restored=s.npcJobs.byId[id];assert.equal(restored.job.phase,'return');assert.equal(restored.job.routeIndex,1);assert.equal(restored.worldRecordId,e.data.worldRecordId);
  // No elapsed-away catchup: this is the actual serializer/relink path at the same simulation time.
  assert.equal(o._tryRelink(restored,s.simTime),true);assert.equal(restored.entityId,e.id);assert.equal(restored.job.phase,'return');
  assert.equal(s.player.credits,money);assert.deepEqual(events,[]);
 }finally{h.dispose();}
});
test('unmoored return preserves FLEE, external control, tow assistance and every home-leg phase',()=>{
 for(const phase of ['flee','transit','return','unload','commission','complete']) {
  const f=returnFixture();try {f.entry.job.phase=phase;f.o._ensureHeliosStarterMiner();assert.equal(f.entry.job.phase,phase);}finally{f.h.dispose();}
 }
 for(const key of ['control','towAssist']) {const f=returnFixture();try{f.entry[key]={};f.o._ensureHeliosStarterMiner();assert.equal(f.entry.job.phase,'approach');}finally{f.h.dispose();}}
});
test('unmoored, destroyed, exhausted and absent faces return without changing ore or inventing a replacement',()=>{
 for(const change of [f=>{},f=>f.rock.alive=false,f=>{f.rock.vel.x=0;f.rock.data.oreHP=0;},f=>f.s.entities.delete(f.rock.id)]) {
  const f=returnFixture();try {change(f);const n=f.s.entityList.length,ore=f.rock.data.oreHP;f.o._ensureHeliosStarterMiner();assert.equal(f.entry.job.phase,'return');assert.equal(f.s.entityList.length,n);assert.equal(f.rock.data.oreHP,ore);assert.equal(f.o._heliosStarterRockId,f.rock.id);}finally{f.h.dispose();}
 }
 const f=returnFixture();try {f.rock.vel.x=19.9;f.o._ensureHeliosStarterMiner();assert.equal(f.entry.job.phase,'approach','valid moving face stays this same work trip');}finally{f.h.dispose();}
});
test('unmoored recovery does not redirect authored claim routes or unrelated miners',()=>{
 const f=returnFixture();try {f.entry.job.route[1]={id:'claim-face',targetRef:'field:f_helios_starter',pos:{x:900,z:0}};f.o._ensureHeliosStarterMiner();assert.equal(f.entry.job.phase,'approach');}finally{f.h.dispose();}
 const g=returnFixture();try {g.o._heliosStarterMinerRecordId='other';g.e.data.activityActorSlotId='other';g.o._ensureHeliosStarterMiner();assert.equal(g.entry.job.phase,'approach');}finally{g.h.dispose();}
});

test('unmoored recovery never takes a recycled, mismatched, virtual or corrupt worker',()=>{
 for(const change of [f=>f.entry.entityRef={},f=>f.entry.job.materialized=false,f=>f.entry.job.corrupt=true,
  f=>f.e.data.worldRecordId='other',f=>f.e.data.jobId='other',f=>f.e.occupantGeneration=0,
  f=>f.e.type='payload',f=>f.e.team=1,f=>f.entry.sectorId='sector_ceres_belt',f=>f.e.homeSectorId='sector_ceres_belt',
  f=>f.e.data.activityActorSlotId='other',f=>f.s.entities.set(f.e.id,{...f.e,data:{...f.e.data}})]) {
  const f=returnFixture();try{change(f);f.o._ensureHeliosStarterMiner();assert.equal(f.entry.job.phase,'approach');}finally{f.h.dispose();}
 }
});

test('unmoored empty return never posts ore, including restored and repeated unload, while later cycles retain normal settlement',()=>{
 for(const restore of [false,true]) {
  const {h,s,o,e,rock,id,entry}=returnFixture();try {
   const events=[];for(const type of ['npcjobs:lotPosted','npcjobs:work','mining:tick','economy:grantCredits'])h.bus.on(type,p=>events.push({type,...p}));
   const existing={lotId:'earlier-real-lot',kind:'ore',postedBy:'other',postedAt:0,sectorId:'sector_helios_prime'};
   s.npcJobs.lots['sector_helios_prime']=existing;o._ensureHeliosStarterMiner();
   let job=entry.job;
   if(restore){const saved=JSON.parse(JSON.stringify(o.serialize()));o.deserialize(saved);job=s.npcJobs.byId[id].job;}
   for(let i=0;i<6000&&job.loopCount===0;i++)advance(job,1/60,o._sink);
   assert.equal(job.loopCount,1);assert.deepEqual(s.npcJobs.lots['sector_helios_prime'],existing);assert.deepEqual(events,[]);assert.equal(rock.data.oreHP,100);
   // Repeated synchronous unload calls while this aborted loop is current stay closed.
   job.loopCount=0;o._noteHandoffIntent({event:'npcjobs:unload',kind:'miner',jobId:id});assert.deepEqual(events,[]);job.loopCount=1;
   for(let i=0;i<10000&&job.loopCount===1;i++)advance(job,1/60,o._sink);
   assert.equal(job.loopCount,2);assert.equal(events.filter(x=>x.type==='npcjobs:work').length,1);
   assert.equal(events.filter(x=>x.type==='npcjobs:lotPosted').length,1,'the pre-existing normal later cycle remains unchanged');
  }finally{h.dispose();}
 }
});


function remappedFaceFixture() {
 const f=returnFixture();f.s.mode='flight';f.e.data.trafficRole='miner';f.rock.vel.x=0;
 Object.assign(f.rock.data,{homeSectorId:'sector_helios_prime',asteroidSlotId:'original-face',sourceSeed:47});
 assert.equal(f.o._commissionHeliosStarterMiner(f.e),true);
 Object.assign(f.entry.job,{phase:'work',routeIndex:1,progress:.1});
 const saved=JSON.parse(JSON.stringify(f.o.serialize()));
 const originalData={...f.rock.data,oreHP:73};f.rock.data.asteroidSlotId='different-face';
 const original=f.h.spawn({type:'asteroid',pos:{x:900,z:0},vel:{x:0,z:0},radius:18,data:originalData});
 f.o.deserialize(saved);const entry=f.s.npcJobs.byId[f.id];assert.equal(f.o._tryRelink(entry,f.s.simTime),true);
 return {...f,entry,original};
}
test('Continue remaps only the exact durable face and preserves this worker and remaining work',()=>{
 const f=remappedFaceFixture();try {
  f.o._ensureHeliosStarterMiner();assert.equal(f.o._heliosStarterMinerRecordId,f.e.data.worldRecordId);
  assert.equal(f.o._heliosStarterRockId,f.original.id);assert.equal(f.entry.job.route[1].id,'field:'+f.original.id);
  assert.equal(f.entry.job.progress,.1);assert.equal(f.entry.job.phase,'work');assert.equal(f.original.data.oreHP,73);
  assert.equal(f.rock.data.oreHP,100,'numeric id replacement is untouched');
 }finally{f.h.dispose();}
});
test('Continue never substitutes an absent, depleted, foreign-seed or ambiguous durable face',()=>{
 for(const change of [f=>f.original.alive=false,f=>f.original.data.oreHP=0,
   f=>{delete f.e.data.activityActorSlotId;f.original.alive=false;},
   f=>{delete f.e.data.activityActorSlotId;f.original.data.oreHP=0;},f=>f.original.data.sourceSeed=48,
   f=>f.h.spawn({type:'asteroid',pos:{x:910,z:0},data:{...f.original.data}})]) {
  const f=remappedFaceFixture();try {
   change(f);f.o._ensureHeliosStarterMiner();assert.equal(f.o._heliosStarterMinerRecordId,f.e.data.worldRecordId);
   assert.equal(f.o._heliosStarterRockId,null);f.o._ensureHeliosStarterMiner();
   assert.equal(f.entry.job.phase,'return');assert.equal(f.rock.data.oreHP,100);
  }finally{f.h.dispose();}
 }
});
test('Continue retains its worker and work clock while exact-face promotion is temporarily rejected',()=>{
 const f=remappedFaceFixture();try {
  delete f.e.data.activityActorSlotId;
  const promote=f.o._promoteStarterRock;f.o._promoteStarterRock=()=>null;
  f.o._ensureHeliosStarterMiner();assert.equal(f.entry.heliosFacePending,true);
  f.h.runTicks(10);assert.equal(f.o._heliosStarterMinerRecordId,f.e.data.worldRecordId);
  assert.equal(f.entry.job.progress,.1);assert.equal(f.original.data.oreHP,73);
  f.o._promoteStarterRock=promote;f.o._ensureHeliosStarterMiner();
  assert.equal(f.entry.heliosFacePending,false);assert.equal(f.o._heliosStarterRockId,f.original.id);
 }finally{f.h.dispose();}
});
test('legacy Continue does not treat a reused numeric field id as proof of the same face',()=>{
 const f=returnFixture();try {
  f.e.data.trafficRole='miner';f.rock.vel.x=0;
  const saved=JSON.parse(JSON.stringify(f.o.serialize()));f.o.deserialize(saved);
  const entry=f.s.npcJobs.byId[f.id];assert.equal(f.o._tryRelink(entry,f.s.simTime),true);
  f.o._ensureHeliosStarterMiner();f.o._ensureHeliosStarterMiner();
  assert.equal(f.o._heliosStarterMinerRecordId,f.e.data.worldRecordId);assert.equal(entry.job.phase,'return');
  assert.equal(f.rock.data.oreHP,100);
 }finally{f.h.dispose();}
});

test('Continue remap rejects corrupt bindings, recycled association and externally owned workers',()=>{
 for(const change of [f=>f.entry.job.payload.heliosWorkFace.version=2,
  f=>f.entry.job.payload.heliosWorkFace.jobId='other',f=>f.entry.job.payload.heliosWorkFace.worldRecordId='other',
  f=>f.entry.entityRef={},f=>f.e.data.jobId='other',f=>f.e.occupantGeneration=0,
  f=>f.e.team=1,f=>f.e.data.sectorId='sector_ceres_belt',f=>f.entry.control={},f=>f.entry.towAssist={}]) {
  const f=remappedFaceFixture();try {
   change(f);assert.equal(f.o._commissionHeliosStarterMiner(f.e),false);
   assert.equal(f.entry.job.phase,'work');assert.equal(f.entry.job.progress,.1);
   assert.equal(f.entry.job.route[1].id,'field:'+f.rock.id);assert.equal(f.original.data.oreHP,73);
  }finally{f.h.dispose();}
 }
});
