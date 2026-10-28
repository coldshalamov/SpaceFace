import test from 'node:test';
import assert from 'node:assert/strict';
import { SECTORS } from '../src/data/sectors.js';
import { traffic } from '../src/systems/traffic.js';
import { PRIORITY_COURIER_SERVICE as C, PRIORITY_COURIER_SERVICE_SCHEMA, PRIORITY_COURIER_ITINERARY_KIND } from '../src/data/laneContacts.js';
import { hullEnvelopeWu } from '../src/data/collisionProxyManifests.js';
import { tallyMarks } from '../src/data/tethysTallyPassage.js';
function routeFixture(destination = 'station_customs', modern = true) {
 const origin = destination === 'station_customs' ? 'station_tethys' : 'station_customs';
 const itinerary = {...(modern ? {countRouteId:'tethys:tally-passage:v1'} : {}),kind:PRIORITY_COURIER_ITINERARY_KIND,schema:PRIORITY_COURIER_SERVICE_SCHEMA,serviceId:C.id,contactId:C.contactId,sectorId:C.sectorId,originStationId:origin,destinationStationId:destination,legSeq:0,departureAt:14,dueAt:100};
 const e = {data:{trafficRole:'courier',itinerary,cargoManifest:{lines:[]}}};
 const stations = [{id:1,data:{stationId:'station_tethys'},pos:{x:1050,z:380}},{id:2,data:{stationId:'station_customs'},pos:{x:-640,z:-1180}}];
 const owner=Object.assign(Object.create(traffic),{state:{world:{currentSectorId:C.sectorId}}});
 return owner._buildJobSpec('courier',e,stations[0],stations[1],stations,C.sectorId);
}
test('customs-bound Kess physically visits the existing scan and count lane',()=>{
 const spec=routeFixture();
 assert.deepEqual(spec.route.slice(1,-1).map(x=>x.id),tallyMarks().map(x=>x.id));
});
test('old saved itineraries retain their direct job and original timetable until the next leg',()=>assert.equal(routeFixture('station_customs',false).route.length,2));
test('the return service is not forced through inbound customs again',()=>assert.equal(routeFixture('station_tethys').route.length,2));

import { TETHYS_TALLY, tallyPauseId } from '../src/data/tethysTallyPassage.js';
import { tallyKegRecordId, tallyClearance, tallyPassageTarget, tallyAdvanceDt, sweptCorridorDistance } from '../src/systems/tethysTallyPassage.js';
import { insertFarActor, promoteFarActor, catchUpFarRecord, serializeFarActorTable, restoreFarActorTable } from '../src/world/farActorTable.js';
function physicalFixture() {
 const spec=routeFixture(),marks=tallyMarks();
 const itinerary={kind:PRIORITY_COURIER_ITINERARY_KIND,schema:PRIORITY_COURIER_SERVICE_SCHEMA,serviceId:C.id,contactId:C.contactId,sectorId:C.sectorId,originStationId:'station_tethys',destinationStationId:'station_customs',legSeq:0,departureAt:14,dueAt:120};
 const e={id:10,type:'ship',alive:true,radius:16,pos:{...marks[1].pos},vel:{x:0,z:0},data:{defId:'ship_kestrel',trafficRole:'courier',homeSectorId:C.sectorId,worldRecordId:'wr_kess',namedLaneContactId:C.contactId,itinerary}};
 const state={meta:{seed:4242},mode:'flight',settings:{gameplay:{physicsBackend:'custom'}},simTime:50,world:{currentSectorId:C.sectorId,records:{byId:{}}},entities:new Map([[e.id,e]]),entityList:[e]};
 const keg={id:11,type:'wreck',alive:true,radius:12,pos:{x:(marks[1].pos.x+marks[2].pos.x)/2,z:marks[1].pos.z},vel:{x:0,z:0},data:{worldRecordId:tallyKegRecordId(state),oneOffId:TETHYS_TALLY.oneOffId,identityKey:`worldOneOff:${TETHYS_TALLY.oneOffId}`,homeSectorId:C.sectorId}};
 state.entities.set(keg.id,keg);state.entityList.push(keg);
 for(const [i,id] of ['station_tethys','station_customs'].entries()){const station={id,type:'station',alive:true,radius:100,pos:{...spec.route[i===0?0:4].pos},data:{stationId:id}};state.entities.set(id,station);state.entityList.push(station);}
 const entry={entityId:e.id,worldRecordId:e.data.worldRecordId,job:{...spec,phase:'transit',routeIndex:2,progress:.8,speed:96}};
 return {state,e,keg,entry,owner:{state}};
}
test('actual swept hull corridor blocks, not a point-radius proximity trigger',()=>{
 const h=physicalFixture();assert.equal(tallyClearance(h.owner,h.e).reason,'obstructed');
 h.keg.pos.z+=60;assert.equal(tallyClearance(h.owner,h.e).reason,'clear');
 h.keg.vel.z=-100;assert.equal(tallyClearance(h.owner,h.e).reason,'obstructed','moving back across hull corridor blocks');
 assert.equal(sweptCorridorDistance({x:0,z:0},{x:10,z:0},{x:5,z:-5},{x:5,z:5}),0);
});
test('unknown identity/native source is not successful clearance; live keg outranks stale tombstone',()=>{
 const h=physicalFixture();h.state.world.records.byId[h.keg.data.worldRecordId]={alive:false,outcome:'destroyed'};
 assert.equal(tallyClearance(h.owner,h.e).reason,'obstructed');
 h.keg.data.oneOffId='another';assert.equal(tallyClearance(h.owner,h.e).reason,'unobserved');
 h.state.entities.delete(h.keg.id);assert.equal(tallyClearance(h.owner,h.e).reason,'removed');
 delete h.state.world.records.byId[h.keg.data.worldRecordId];assert.equal(tallyClearance(h.owner,h.e).clear,false);
 const q=physicalFixture();q.state.settings.gameplay.physicsBackend='rapier-dynamic';assert.equal(tallyPassageTarget(q.owner,q.entry,q.e).blocked,true,'no native body is not a physical arrival');
 q.state.settings.gameplay.physicsBackend='unknown';assert.equal(tallyClearance(q.owner,q.e).reason,'unobserved');
});
test('clock waits for real passage and exact actor/leg authority',()=>{
 const h=physicalFixture(),target=tallyPassageTarget(h.owner,h.entry,h.e);
 assert.equal(target.holdClock,true);assert.equal(tallyAdvanceDt(h.entry.job,target,1000),0);
 assert.equal(h.e.data.itinerary.tallyPassage.firstHeldAt,50);
 h.entry.control={owner:'other'};assert.equal(tallyPassageTarget(h.owner,h.entry,h.e).blocked,true);delete h.entry.control;
 h.entry.job.payload.priorityCourierService.legSeq=1;assert.equal(tallyPassageTarget(h.owner,h.entry,h.e).blocked,true);
});
test('corrupt route endpoints and missing waypoint poses fail closed',()=>{
 const h=physicalFixture();h.entry.job.route[4].pos={...h.e.pos};assert.equal(tallyPassageTarget(h.owner,h.entry,h.e).blocked,true);
 const q=physicalFixture();q.entry.job.route[1].pos=null;assert.equal(tallyPassageTarget(q.owner,q.entry,q.e).blocked,true);
});
test('station arrival holds outside both physical envelopes rather than aiming into the station spine',()=>{
 const h=physicalFixture();h.entry.job.routeIndex=3;
 const target=tallyPassageTarget(h.owner,h.entry,h.e);
 assert.ok(target.stopRadius>=hullEnvelopeWu(h.e)+hullEnvelopeWu(h.state.entityList.find(e=>e.data?.stationId==='station_customs'))+16);
 assert.equal(target.stopRadius,target.reach-4);
});
test('far serialization preserves same finite leg and pauses at latest shelf pose, not the station chord',()=>{
 const h=physicalFixture();tallyPassageTarget(h.owner,h.entry,h.e);
 h.e.pos.x+=2;const snapshot={...h.e.pos},before=structuredClone(h.e.data.itinerary);
 const row=insertFarActor(h.state,h.e,51);assert.deepEqual(row.data.itinerary,before);
 assert.equal(row.intent.routeId,tallyPauseId(h.e));assert.deepEqual(row.intent.parameters.from,snapshot);
 const saved=JSON.parse(JSON.stringify(serializeFarActorTable(h.state.world.farActors)));
 h.state.entities.delete(h.e.id);restoreFarActorTable(h.state,saved);
 const restored=h.state.world.farActors.byId.get(h.e.id);catchUpFarRecord(restored,1000,h.state.world.farActors);
 assert.deepEqual(restored.pos,snapshot);assert.deepEqual(restored.data.itinerary,before);
 const promoted=promoteFarActor(h.state,h.e.id,{spawnEntity(spec){const e={...spec,id:20,alive:true};h.state.entities.set(e.id,e);return e;}});
 assert.ok(promoted);assert.deepEqual(promoted.data.itinerary,before);assert.equal(promoted.data.worldRecordId,'wr_kess');
});

import { tethysTallyNativeFixture } from './fixtures/tethys-tally-native.mjs';
function currentKess(h){return h.state.entityList.find(e=>e.alive!==false&&e.data?.namedLaneContactId===C.contactId);}
function fly(h,goal,reach=25){
 const p=h.state.entities.get(h.state.playerId),dx=goal.x-p.pos.x,dz=goal.z-p.pos.z,d=Math.hypot(dx,dz);
 const a=Math.atan2(dz,dx)-p.rot,err=Math.atan2(Math.sin(a),Math.cos(a));
 h.state.input={...h.state.input,moveZ:d>reach&&Math.abs(err)<.3?.6:0,moveX:0,turnIntent:Math.max(-1,Math.min(1,err*2)),brake:d<reach,boost:false,fire:false};
 h.step();return d<reach+5&&Math.hypot(p.vel.x,p.vel.z)<8;
}
test('production authored roster admits exactly one Kess without replacing its eight residents',async t=>{
 for(const seed of [4242,1,19]){
  const h=await tethysTallyNativeFixture({native:false,seed});
  try {
   const residents=h.state.traffic.freighters.filter(r=>r.authoredActivityCast).map(r=>r.id);
   assert.equal(residents.length,8);assert.ok(currentKess(h));
   const before=h.state.traffic.freighters.length;
   for(let i=0;i<3;i++)h.owner._onSectorEnter({sector:SECTORS.find(s=>s.id===C.sectorId),continuous:true});
   assert.equal(h.state.traffic.freighters.length,before);
   assert.deepEqual(h.state.traffic.freighters.filter(r=>r.authoredActivityCast).map(r=>r.id),residents);
   assert.equal(h.state.entityList.filter(e=>e.alive!==false&&e.data?.namedLaneContactId===C.contactId).length,1);
  }finally{h.close();}
 }
});
test('native ordinary flight waits for original keg, Continue retains hold, player collision clears same object and service delivers once',{timeout:300000},async t=>{
 const h=await tethysTallyNativeFixture();t.after(()=>h.close());
 let k=currentKess(h);const id=k.data.worldRecordId;
 let keg=h.state.entityList.find(e=>e.data?.oneOffId===TETHYS_TALLY.oneOffId);const kegId=keg.data.worldRecordId,original={...keg.pos};
 for(let i=0;i<60*160&&!k.data.itinerary?.tallyPassage?.firstHeldAt;i++)fly(h,k.pos,300);
 assert.equal(k.data.itinerary.tallyPassage.reason,'obstructed');assert.ok(k.data.itinerary.tallyPassage.firstHeldAt);
 const job=h.state.npcJobs.byId[k.data.jobId].job,progress=job.progress,heldAt=k.data.itinerary.tallyPassage.firstHeldAt;
 h.state.input={...h.state.input,moveX:0,moveZ:0,turnIntent:0,brake:true};
 h.step(60);assert.equal(job.progress,progress,JSON.stringify({row:k.data.itinerary.tallyPassage,keg:keg.pos,player:h.state.entities.get(h.state.playerId).pos}));assert.equal(keg.data.worldRecordId,kegId);
 const save=h.sim.registry.get('save'),saved=JSON.parse(JSON.stringify(save.serialize('tethys-count-hold')));delete saved.checksum;
 assert.equal(save.loadEnvelope(saved),true);h.physics._finishNativeRestore();h.state.mode='flight';assert.equal(await h.physics.prepareBackend(h.state),true);h.step(2);
 k=currentKess(h);keg=h.state.entityList.find(e=>e.data?.oneOffId===TETHYS_TALLY.oneOffId);
 assert.equal(k.data.worldRecordId,id);assert.equal(keg.data.worldRecordId,kegId);assert.equal(k.data.itinerary.tallyPassage.firstHeldAt,heldAt);
 assert.equal(h.state.npcJobs.byId[k.data.jobId].job.routeIndex,2);assert.equal(k.data.itinerary.legSeq,0);
 const customs=h.state.entityList.find(e=>e.data?.stationId==='station_customs');let arrivals=0,arrivalSeparation=0;
 h.sim.bus.on('freight:arrival',p=>{if(p.freighterKey===id){arrivals++;arrivalSeparation=Math.hypot(k.pos.x-customs.pos.x,k.pos.z-customs.pos.z);}});
 let aligned=false;for(let i=0;i<60*45&&!aligned;i++)aligned=fly(h,{x:original.x,z:original.z+120},20);
 assert.equal(aligned,true,'ordinary helm reaches a collision approach, no pose/impulse injection');
 for(let i=0;i<60*80&&arrivals===0;i++)fly(h,{x:original.x,z:original.z-300},20);
 assert.equal(arrivals,1);
 const berthPose={...k.pos},berthSave=JSON.parse(JSON.stringify(save.serialize('tethys-exterior-berth')));delete berthSave.checksum;
 assert.equal(save.loadEnvelope(berthSave),true);h.physics._finishNativeRestore();h.state.mode='flight';assert.equal(await h.physics.prepareBackend(h.state),true);
 k=currentKess(h);keg=h.state.entityList.find(e=>e.data?.worldRecordId===kegId);
 assert.equal(k.data.worldRecordId,id);assert.ok(Math.hypot(k.pos.x-berthPose.x,k.pos.z-berthPose.z)<.001,'ordinary berth Continue must not require overlap safety displacement');
 for(let i=0;i<60*20&&k.data.itinerary.legSeq===0;i++)fly(h,{x:original.x,z:original.z-300},20);
 assert.equal(arrivals,1);assert.ok(arrivalSeparation>hullEnvelopeWu(k)+hullEnvelopeWu(customs),'delivery berth remains outside both physical hulls');assert.equal(k.data.itinerary.legSeq,1);assert.equal(k.data.itinerary.previousTallyPassage.reason,'clear');assert.ok(k.data.itinerary.previousTallyPassage.delayS>0);
 assert.equal(keg.data.worldRecordId,kegId);assert.equal(keg.alive,true);assert.ok(Math.hypot(keg.pos.x-original.x,keg.pos.z-original.z)>60);
 assert.equal(keg.data.cargoManifest,undefined,'moving an impounded prop does not mint cargo custody');
 assert.equal(h.state.entityList.filter(e=>e.alive!==false&&e.data?.namedLaneContactId===C.contactId).length,1);
});

test('an ordinary early player clearance leaves the unobstructed physical courier on its honest timetable',{timeout:180000},async t=>{
 const h=await tethysTallyNativeFixture();t.after(()=>h.close());const k=currentKess(h);
 const keg=h.state.entityList.find(e=>e.data?.oneOffId===TETHYS_TALLY.oneOffId),origin={...keg.pos},due=k.data.itinerary.dueAt;
 let aligned=false;for(let i=0;i<60*70&&!aligned;i++)aligned=fly(h,{x:origin.x,z:origin.z+120},20);
 assert.equal(aligned,true);
 for(let i=0;i<60*100&&k.data.itinerary.legSeq===0;i++)fly(h,{x:origin.x,z:origin.z-300},20);
 assert.equal(k.data.itinerary.legSeq,1);assert.equal(k.data.itinerary.previousTallyPassage.delayS,0);
 assert.ok(h.state.simTime<=due,`ordinary unblocked arrival ${h.state.simTime} must meet ${due}`);
});

import { createContactHailResponse } from '../src/data/contactHail.js';
test('ordinary Hail distinguishes obstructed, unobserved and removed without ownership claims',()=>{
 const h=physicalFixture();tallyPassageTarget(h.owner,h.entry,h.e);h.e.data.priorityCourierState='COUNT_HOLD';
 const offer={targetId:h.e.id,kind:'trader',requestId:'tally-status'};
 let line=()=>createContactHailResponse(h.state,offer,'status').lines.join(' ');
 assert.match(line(),/DISPUTED KEG IN THE HULL CORRIDOR/);
 h.e.data.itinerary.tallyPassage.reason='unobserved';assert.match(line(),/POSITION UNCONFIRMED/);
 h.e.data.itinerary.tallyPassage.reason='removed';assert.match(line(),/BODY REMOVED/);assert.match(line(),/No safe placement or cargo release/);
});

test('ordinary residency and Continue preserve the one courier while native world traffic may clear the keg',{timeout:240000},async t=>{
 const h=await tethysTallyNativeFixture({residency:true});t.after(()=>h.close());let k=currentKess(h);
 const id=k.data.worldRecordId,keg=h.state.entityList.find(e=>e.data?.oneOffId===TETHYS_TALLY.oneOffId),kegId=keg.data.worldRecordId,origin={...keg.pos};
 for(let i=0;i<60*160&&!k.data.itinerary?.tallyPassage?.firstHeldAt;i++)fly(h,k.pos,300);
 assert.ok(k.data.itinerary.tallyPassage.firstHeldAt);const holdPose={...k.pos};let away=false;
 for(let i=0;i<60*60&&!away;i++)away=fly(h,{x:holdPose.x,z:holdPose.z+2400},200);
 assert.equal(away,true);assert.equal(h.state.entities.get(k.id),k,'existing job pin retains exact hull, not a fake shelf');
 assert.equal([...h.state.world.farActors.byId.values()].some(r=>r.data?.worldRecordId===id),false);
 const save=h.sim.registry.get('save'),saved=JSON.parse(JSON.stringify(save.serialize('tethys-away')));delete saved.checksum;
 const before=structuredClone(k.data.itinerary),pose={...k.pos};
 assert.equal(save.loadEnvelope(saved),true);
 h.physics._finishNativeRestore();h.state.mode='flight';assert.equal(await h.physics.prepareBackend(h.state),true);
 k=currentKess(h);assert.equal(k.data.worldRecordId,id);assert.deepEqual(k.data.itinerary,before);assert.ok(Math.hypot(k.pos.x-pose.x,k.pos.z-pose.z)<.001,JSON.stringify({before:pose,after:k.pos,native:k.data.abstractIntent,phase:h.state.npcJobs.byId[k.data.jobId]?.job?.phase}));
 const source=h.state.entityList.find(e=>e.data?.worldRecordId===kegId);assert.ok(source&&source.alive);
 let returned=false;for(let i=0;i<60*60&&!returned;i++)returned=fly(h,holdPose,300);assert.equal(returned,true);
 if(k.data.itinerary.legSeq===0 && !tallyClearance(h.sim.registry.get('npcJobsRuntime'),k).clear){
   assert.equal(h.state.npcJobs.byId[k.data.jobId].job.routeIndex,2,'a still-obstructed original keg cannot certify passage while away');
   const approach={...source.pos};let aligned=false;
   for(let i=0;i<60*60&&!aligned;i++)aligned=fly(h,{x:approach.x,z:approach.z+120},20);assert.equal(aligned,true);
   for(let i=0;i<60*100&&k.data.itinerary.legSeq===0;i++)fly(h,{x:approach.x,z:approach.z-300},20);
 }else for(let i=0;i<60*100&&k.data.itinerary.legSeq===0;i++)fly(h,holdPose,300);
 assert.equal(k.data.itinerary.legSeq,1,JSON.stringify({pose:k.pos,vel:k.vel,it:k.data.itinerary,job:h.state.npcJobs.byId[k.data.jobId]?.job,player:h.state.entities.get(h.state.playerId)?.pos}));assert.equal(k.data.itinerary.previousTallyPassage.reason,'clear');
 assert.ok(Math.hypot(source.pos.x-origin.x,source.pos.z-origin.z)>40,'a physical displacement, not disappearance, opened this lane');
 assert.equal(h.state.entityList.filter(e=>e.alive!==false&&e.data?.namedLaneContactId===C.contactId).length,1);
});
