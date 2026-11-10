import {readFileSync} from 'node:fs';
import {PRODUCTION_FEATURES} from '../src/runtime/runtimeProfiles.js';
import {snapshotFeatureMaps,applyFeatureConfigToMaps,restoreFeatureMaps} from '../src/data/featureFlags.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';import {createGameState} from '../src/core/gameState.js';
import {PRODUCTION_INIT_ORDER,PRODUCTION_UPDATE_ORDER} from '../src/runtime/authoritativeSystemManifest.js';
import {flightV3} from '../src/systems/flightV3.js';import {physics as physicsSystem} from '../src/core/physics.js';
import {combat} from '../src/systems/combat.js';import {asteroidSites} from '../src/systems/asteroidSites.js';
import {npcJobsRuntime} from '../src/systems/npcJobsRuntime.js';import {traffic} from '../src/systems/traffic.js';import {world} from '../src/systems/world.js';
import {CERES_WORKFLEET_CONTRACT as C} from '../src/data/ceresWorkfleet.js';
import {ceresWorkfleetHardwareSpec,reconcileCeresWorkfleetPresentation,ceresWorkfleetWorldPose as worldPose,
 ceresWorkfleetReceiverTransferReady,stepCeresWorkfleet} from '../src/systems/ceresWorkfleet.js';
import {captureEntityRecord,spawnSpecFromRecord} from '../src/world/worldRecords.js';import {save} from '../src/save/saveSystem.js';
import {serializeCombatState} from '../src/combat/persistence.js';
const clone=v=>JSON.parse(JSON.stringify(v));
function selected(state){const wo={name:'world',init(c){this.state=c.state;},upsertWorldRecord:world.upsertWorldRecord};const modules={flightSlot:flightV3,physics:physicsSystem,combat,asteroidSites,npcJobsRuntime,traffic,world:wo};return createSimulation({state,seed:47,systems:PRODUCTION_INIT_ORDER.filter(id=>modules[id]).map(id=>modules[id]),updateOrder:PRODUCTION_UPDATE_ORDER.filter(id=>modules[id]).map(id=>modules[id])});}
function pose(e){return {pos:{x:e.pos.x,z:e.pos.z},vel:{x:e.vel.x,z:e.vel.z},rot:e.rot,angVel:e.angVel};}
function refs(role){return role==='section'?{kind:'worldSite',siteId:C.siteId,payloadId:'long_plate',worldObjectId:C.identities.payload}:{kind:'worldRecord',recordId:C.identities[role==='breaker'?'worker':role]};}
function initialWire(){
 const state=createGameState(47);state.mode='flight';state.world.currentSectorId=C.sectorId;
 const sim=createSimulation({state,seed:47,systems:[asteroidSites]}),sites=sim.registry.get('asteroidSites');sites._syncWorldSites();
 for(const [componentId,verb,amount,requestSequence]of[['long_plate_clamp','repair',24,1],['long_plate','cut',54,2],['long_plate_clamp','cut',18,3]])assert.equal(sites.applyWorldSiteBeamOperation({siteId:C.siteId,componentId,verb,amount,requestStreamId:'player-industrial-beam',requestSequence}).ok,true);
 const siteSave=sites.serialize();sim.dispose();
 const job={id:'job:ceres:second_measure:long_plate',worker:C.identities.worker,head:C.identities.cutterHead,section:C.identities.payload,cradle:C.identities.cradle,phase:'unshoe',phaseTick:52830,updatedTick:54000,index:5,sequence:0,mountId:null,towId:null,receiverId:null};
 return {records:{byId:{},order:[]},sites:siteSave,jobs:{ceresWorkfleet:job},combat:{},tick:54000,simTime:900};
}
async function restore(wire){
 const state=createGameState(47);state.mode='flight';state.world.currentSectorId=C.sectorId;state.tick=wire.tick;state.simTime=wire.simTime;state.nextEntityId=700;state.world.frameOrigin={x:-12288,z:8192};state.world.frameOriginSeq=1;state.world.records=clone(wire.records);
 const sim=selected(state),sites=sim.registry.get('asteroidSites');sites.deserialize(clone(wire.sites));sites._syncWorldSites();for(const record of Object.values(state.world.records.byId))sim.spawn(spawnSpecFromRecord(record));
 const player=sim.spawn({type:'ship',team:0,pos:{x:C.sitePlacement.pos.x+2000,z:C.sitePlacement.pos.z-900},radius:6,mass:100,hull:100});state.playerId=player.id;
 sim.registry.get('npcJobsRuntime').deserialize(clone(wire.jobs));const saver=Object.assign(Object.create(save),{state,bus:sim.bus,_restoreSequence:1,_runEpoch:1});saver._restoreCombat(clone(wire.combat),new Map());saver._resumeCeresAttachmentRestore();
 const physics=sim.registry.get('physics');await physics.prepareBackend(state);assert.equal(physics._sg02.captureContactImpacts,true,'reduced fixture uses production contact consequences');reconcileCeresWorkfleetPresentation({state});
 const bodies=state.entityList.filter(e=>e.alive&&Object.values(C.identities).includes(e.data?.worldRecordId));assert.equal(bodies.length,4);const b=Object.fromEntries(bodies.map(e=>[e.data.ceresWorkfleetRole||'section',e]));
 const owner=sim.registry.get('npcJobsRuntime');
 return {state,sim,sites,saver,physics,owner,b,job:()=>state.npcJobs.ceresWorkfleet,service:sim.registry.get('combat').kernel.attachments,close(){saver.destroy();sim.dispose();}};
}
function capture(h){const records={byId:{},order:[]};for(const e of [h.b.breaker,h.b.cutterHead,h.b.cradle]){const r=captureEntityRecord(e,{sectorId:C.sectorId,tick:h.state.tick});records.byId[r.recordId]=r;records.order.push(r.recordId);}return clone({records,sites:h.sites.serialize(),jobs:h.owner.serialize(),combat:serializeCombatState(h.state),tick:h.state.tick,simTime:h.state.simTime});}

test('receiver handoff retains both lines through disturbed open-shoe motion and physically secures through typed Continue',async()=>{
const prior=snapshotFeatureMaps();applyFeatureConfigToMaps(PRODUCTION_FEATURES);
try{
 const wire=initialWire();
 const sample=JSON.parse(readFileSync(new URL('./fixtures/ceres-handoff/current-pr216-open-shoes.json',import.meta.url),'utf8'));assert.equal(sample.phase,'unshoe');
 wire.tick=sample.tick;wire.simTime=sample.tick/60;
 wire.sites.worldById[C.siteId].payloads.long_plate.motion={pos:{x:sample.section.pos.x,z:sample.section.pos.z},vel:{x:sample.section.vel.x,z:sample.section.vel.z},rot:sample.section.rot,angVel:sample.section.angVel};
 const roles=new Map([[sample.section.id,'section']]);
 for(const observed of sample.hardware){
  const role=observed.role;roles.set(observed.id,role);const spec=ceresWorkfleetHardwareSpec(role);
  Object.assign(spec,{pos:{x:observed.pos.x,z:observed.pos.z},vel:{x:observed.vel.x,z:observed.vel.z},rot:observed.rot,angVel:observed.angVel});
  // Deliberate reconstruction at the open-shoe boundary; motion is the observed sample.
  const slide=0;spec.data.ceresWorkfleetSlide=slide;spec.data.itinerary.ceresWorkfleet.slide=slide;
  const rec=captureEntityRecord({id:observed.id,...spec},{sectorId:C.sectorId,tick:sample.tick});wire.records.byId[rec.recordId]=rec;wire.records.order.push(rec.recordId);
 }
 const byId={};for(const line of sample.lines){const row=clone(line);row.ownerRef=refs(roles.get(row.ownerId));row.targetRef=refs(roles.get(row.targetId));delete row.ownerId;delete row.targetId;delete row.controllerId;byId[row.id]=row;}
 const find=role=>sample.lines.find(l=>roles.get(l.ownerId)===role).id;
 wire.combat={attachments:{byId}};Object.assign(wire.jobs.ceresWorkfleet,{phase:'unshoe',phaseTick:52830,index:C.route.loadedLegs.length,mountId:find('cutterHead'),towId:find('breaker'),receiverId:find('cradle')});
 const h=await restore(wire);let last='unshoe';try{
  const original=h.b.section,life=original.occupantGeneration;
  let transferred=false;
  h.sim.bus.on('tether:broken',e=>{if(e.reason==='ceres_receiver_transfer'){assert.equal(ceresWorkfleetReceiverTransferReady(h.b.breaker,original),true,'opening shoes never authorizes a moving/misaligned transfer');transferred=true;}});
  for(let i=0;i<18000;i++){h.sim.step();if(h.job().phase!==last)last=h.job().phase;if(['secured','worker-disabled','head-disabled','section-destroyed'].includes(last))break;}
  assert.equal(original.mass,1800);assert.equal(original.occupantGeneration,life);assert.equal(h.job().phase,'secured');assert.equal(transferred,true);assert.ok(Math.hypot(original.pos.x-h.b.cradle.pos.x,original.pos.z-h.b.cradle.pos.z)<=2);
  const continued=await restore(capture(h));try{for(let i=0;i<240;i++)continued.sim.step();assert.equal(continued.job().phase,'secured');assert.equal(continued.b.section.mass,1800);assert.ok(Math.hypot(continued.b.section.pos.x-continued.b.cradle.pos.x,continued.b.section.pos.z-continued.b.cradle.pos.z)<=2);}finally{continued.close();}
 }finally{h.close();}
}finally{restoreFeatureMaps(prior);}
});

test('receiver release gate rejects unsettled and laterally drifting cargo without changing any kinematics',()=>{
 const target=worldPose(C.route.receiverPose),carrier=worldPose(C.route.loadedLegs.at(-1).to);
 const create=()=>({breaker:{...ceresWorkfleetHardwareSpec('breaker'),pos:{x:carrier.x,z:carrier.z},rot:carrier.rot},
  section:{type:'wreck',mass:1800,pos:{x:target.x,z:target.z},rot:target.rot,vel:{x:0,z:0},angVel:0,data:{worldRecordId:C.identities.payload,worldSiteId:C.siteId,worldSitePayloadId:'long_plate',worldSiteStructural:true,persistenceOwner:'asteroidSites'}}});
 const good=create();assert.equal(ceresWorkfleetReceiverTransferReady(good.breaker,good.section),true);
 for(const mutate of [h=>h.section.pos.x+=1.1,h=>h.section.rot+=.004,h=>h.section.vel.x=.011,h=>h.section.vel.z=.06,h=>h.section.angVel=.001,h=>h.breaker.vel.x=.06,h=>h.breaker.pos.x+=.6]){
  const h=create();mutate(h);const before=clone(h);assert.equal(ceresWorkfleetReceiverTransferReady(h.breaker,h.section),false);assert.deepEqual(clone(h),before);
 }
});

function receiverSlackWire() {
 const sample=JSON.parse(readFileSync(new URL('./fixtures/ceres-handoff/current935-receiver-slack.json',import.meta.url),'utf8'));
 const wire=initialWire();wire.tick=sample.tick;wire.simTime=sample.tick/60;
 wire.sites.worldById[C.siteId].payloads.long_plate.motion={pos:{x:sample.section.pos.x,z:sample.section.pos.z},vel:{x:sample.section.vel.x,z:sample.section.vel.z},rot:sample.section.rot,angVel:sample.section.angVel};
 const roles=new Map([[sample.section.id,'section']]);
 for(const observed of sample.hardware){
  const role=observed.role;roles.set(observed.id,role);const spec=ceresWorkfleetHardwareSpec(role);
  Object.assign(spec,{pos:{x:observed.pos.x,z:observed.pos.z},vel:{x:observed.vel.x,z:observed.vel.z},rot:observed.rot,angVel:observed.angVel});
  spec.data.ceresWorkfleetSlide=observed.slide;spec.data.itinerary.ceresWorkfleet.slide=observed.slide;
  const rec=captureEntityRecord({id:observed.id,...spec},{sectorId:C.sectorId,tick:sample.tick});wire.records.byId[rec.recordId]=rec;wire.records.order.push(rec.recordId);
 }
 const byId={};for(const line of sample.lines){const row=clone(line);row.ownerRef=refs(roles.get(row.ownerId));row.targetRef=refs(roles.get(row.targetId));delete row.ownerId;delete row.targetId;delete row.controllerId;byId[row.id]=row;}
 wire.combat={attachments:{byId}};Object.assign(wire.jobs.ceresWorkfleet,{phase:'pads',phaseTick:59518,index:C.route.loadedLegs.length,
  mountId:sample.lines.find(l=>roles.get(l.ownerId)==='cutterHead').id,towId:null,receiverId:sample.lines.find(l=>roles.get(l.ownerId)==='cradle').id});
 return wire;
}
const receiverError=h=>Math.hypot(h.b.section.pos.x-h.b.cradle.pos.x,h.b.section.pos.z-h.b.cradle.pos.z);
function stepReceiverWinch(h){
 const line=h.service.get(h.job().receiverId),before=line.restLength;
 h.sim.step();
 assert.ok(line.restLength>=6.5,'existing socket and keeper geometry set the physical rest-length floor');
 assert.ok(before-line.restLength<=1/60+1e-12,'take-up uses the existing1WU/s winch, never an instantaneous rest-length snap');
 assert.equal(h.b.section.mass,1800);assert.equal(h.physics._sg02.records.get(h.b.section.id)?.entity,h.b.section);
}
test('receiver takes up measured post-field slack through repeated typed Saves without minting custody or repairing motion',async()=>{
 const prior=snapshotFeatureMaps();applyFeatureConfigToMaps(PRODUCTION_FEATURES);let h;
 try{
  h=await restore(receiverSlackWire());assert.ok(receiverError(h)>2);
  const receiverId=h.job().receiverId;let maxTension=0;
  for(let i=0;i<2400&&h.job().phase!=='secured';i++){
   stepReceiverWinch(h);maxTension=Math.max(maxTension,h.service.get(receiverId).lastTension||0);
   if([8,17,40].includes(i)){
    const before=clone(pose(h.b.section)),wire=capture(h),length=h.service.get(receiverId).restLength;
    h.close();h=await restore(wire);assert.deepEqual(clone(pose(h.b.section)),before,'Save restores real pose and momentum unchanged');
    assert.equal(h.job().receiverId,receiverId);assert.equal(h.service.get(receiverId).restLength,length);
   }
  }
  assert.equal(h.job().phase,'secured');assert.ok(receiverError(h)<=2);assert.equal(h.service.get(receiverId).restLength,6.5);
  assert.ok(maxTension<400,'regression control remains a small physical take-up under the unchanged clamp law');
  for(let i=0;i<1200;i++)stepReceiverWinch(h);
  assert.equal(h.job().phase,'secured');assert.ok(receiverError(h)<=2);
 }finally{h?.close();restoreFeatureMaps(prior);}
});
test('foreign pad obstruction stalls receiver take-up and removing it resumes the same original line',async()=>{
 const prior=snapshotFeatureMaps();applyFeatureConfigToMaps(PRODUCTION_FEATURES);let h;
 try{
  h=await restore(receiverSlackWire());
  const obstacle=h.sim.spawn({type:'wreck',team:0,pos:{x:h.b.cradle.pos.x-35.5,z:h.b.cradle.pos.z},radius:.5,mass:100,hull:100,collides:true,
   data:{worldRecordId:'test:receiver-obstruction',missionPinned:true},physicsBody:{schemaVersion:1,dynamic:false,radius:.5,mass:100,shape:'ball',useMeasuredSkin:false,material:'wreck'}});
  const id=h.job().receiverId;for(let i=0;i<4;i++)stepReceiverWinch(h);
  const stopped=h.service.get(id).restLength;
  for(let i=0;i<240;i++)stepReceiverWinch(h);
  assert.equal(h.job().phase,'pads');assert.equal(h.job().blockedReason,'receiver-seating-obstructed',JSON.stringify({slide:h.b.cradle.data.ceresWorkfleetSlide,blocker:h.b.cradle.data.ceresWorkfleetSlideBlocker,obstacle:{id:obstacle.id,alive:obstacle.alive,pos:obstacle.pos,body:obstacle.physicsBody,native:!!h.physics._sg02.records.get(obstacle.id)},rest:h.service.get(id).restLength}));assert.equal(h.service.get(id).restLength,stopped);
  assert.ok(receiverError(h)>2);assert.equal(obstacle.hull,100);
  obstacle.alive=false;
  for(let i=0;i<2400&&h.job().phase!=='secured';i++)stepReceiverWinch(h);
  assert.equal(h.job().phase,'secured');assert.equal(h.job().receiverId,id);assert.ok(receiverError(h)<=2);
 }finally{h?.close();restoreFeatureMaps(prior);}
});
test('cut or stale receiver custody never creates a replacement or runs the winch',async()=>{
 const prior=snapshotFeatureMaps();applyFeatureConfigToMaps(PRODUCTION_FEATURES);
 try{for(const mode of ['cut','stale-target','lost-cradle']){
  const h=await restore(receiverSlackWire());try{
   const id=h.job().receiverId,line=h.service.get(id),length=line.restLength,count=Object.keys(h.state.combat.attachments.byId).length;
   if(mode==='cut')h.service.cut(id,h.b.cradle.id,'receiver-endpoint-break');
   else if(mode==='stale-target'){line.targetGeneration++;stepCeresWorkfleet(h.owner,1/60);assert.equal(line.restLength,length,'direct job tick rejects stale endpoint before native retirement');}
   else {h.b.cradle.hull=0;h.b.cradle.alive=false;}
   for(let i=0;i<120;i++)h.sim.step();
   assert.equal(Object.keys(h.state.combat.attachments.byId).length,count,mode);
   assert.equal(line.restLength,length,mode);assert.notEqual(h.job().phase,'secured',mode);
   assert.equal(h.b.section.mass,1800);
  }finally{h.close();}
 }}finally{restoreFeatureMaps(prior);}
});
