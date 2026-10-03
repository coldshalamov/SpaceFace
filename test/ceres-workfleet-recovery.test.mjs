import test from 'node:test';import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';import {createGameState} from '../src/core/gameState.js';
import {PRODUCTION_INIT_ORDER,PRODUCTION_UPDATE_ORDER} from '../src/runtime/authoritativeSystemManifest.js';
import {flightV3} from '../src/systems/flightV3.js';import {physics as physicsSystem} from '../src/core/physics.js';
import {combat} from '../src/systems/combat.js';import {asteroidSites} from '../src/systems/asteroidSites.js';
import {npcJobsRuntime} from '../src/systems/npcJobsRuntime.js';import {traffic} from '../src/systems/traffic.js';import {world} from '../src/systems/world.js';
import {CERES_WORKFLEET_CONTRACT as C,ceresWorkfleetPose as compose} from '../src/data/ceresWorkfleet.js';
import {ceresWorkfleetHardwareSpec,reconcileCeresWorkfleetPresentation,restoreCeresWorkfleetJob,ceresWorkfleetWorldPose as worldPose,
 ceresWorkfleetContactRetained,consumeCeresBreakerControl,consumeCeresHeadControl,stepCeresWorkfleet} from '../src/systems/ceresWorkfleet.js';
import {CERES_RECOVERY_LIMITS as L,planCeresWorkfleetRecovery,restoreCeresWorkfleetRecovery,ceresWorkfleetRecoveryClear} from '../src/systems/ceresWorkfleetRecovery.js';
import {captureEntityRecord,spawnSpecFromRecord} from '../src/world/worldRecords.js';import {save} from '../src/save/saveSystem.js';
import {advanceWorldRecord} from '../src/world/worldCatchup.js';
import {ceresWorkfleetRecordHasCustody} from '../src/data/ceresWorkfleetHardware.js';
import {serializeCombatState} from '../src/combat/persistence.js';
const clone=v=>JSON.parse(JSON.stringify(v)),dt=1/60;
const phaseNames=['recover_turn','recover_approach','recover_seat','recover_return_turn','recover_return'];
const stage=worldPose(C.route.extraction.breakerTo);
function selected(state){const wo={name:'world',init(c){this.state=c.state;},upsertWorldRecord:world.upsertWorldRecord};const modules={flightSlot:flightV3,physics:physicsSystem,combat,asteroidSites,npcJobsRuntime,traffic,world:wo};return createSimulation({state,seed:47,systems:PRODUCTION_INIT_ORDER.filter(id=>modules[id]).map(id=>modules[id]),updateOrder:PRODUCTION_UPDATE_ORDER.filter(id=>modules[id]).map(id=>modules[id])});}
function pose(e){return {pos:{x:e.pos.x,z:e.pos.z},vel:{x:e.vel.x,z:e.vel.z},rot:e.rot,angVel:e.angVel};}
function refs(role){return role==='section'?{kind:'worldSite',siteId:C.siteId,payloadId:'long_plate',worldObjectId:C.identities.payload}:{kind:'worldRecord',recordId:C.identities[role==='breaker'?'worker':role]};}
function initialWire({yaw=0,velocity=0}={}){
 const state=createGameState(47);state.mode='flight';state.world.currentSectorId=C.sectorId;
 const sim=createSimulation({state,seed:47,systems:[asteroidSites]}),sites=sim.registry.get('asteroidSites');sites._syncWorldSites();
 for(const [componentId,verb,amount,requestSequence]of[['long_plate_clamp','repair',24,1],['long_plate','cut',54,2],['long_plate_clamp','cut',18,3]])assert.equal(sites.applyWorldSiteBeamOperation({siteId:C.siteId,componentId,verb,amount,requestStreamId:'player-industrial-beam',requestSequence}).ok,true);
 const siteSave=sites.serialize();sim.dispose();
 // Constructed quiet displaced-state fixture. Only position comes from the historical
 // tick30000 observation; yaw/zero momentum are explicit independent test inputs.
 siteSave.worldById[C.siteId].payloads.long_plate.motion={pos:{x:-12938.895446777344,z:9488.7041015625},vel:{x:velocity,z:0},rot:yaw,angVel:0};
 const records={byId:{},order:[]};for(const [i,role]of['breaker','cutterHead','cradle'].entries()){
  const spec=ceresWorkfleetHardwareSpec(role),p=role==='breaker'?stage:role==='cutterHead'?compose(stage,C.assets.breaker.headMountedPose):{...spec.pos,rot:spec.rot};
  Object.assign(spec,{pos:{x:p.x,z:p.z},rot:p.rot,vel:{x:0,z:0},angVel:0});const record=captureEntityRecord({id:i+1,...spec},{sectorId:C.sectorId,tick:100});records.byId[record.recordId]=record;records.order.push(record.recordId);
 }
 const job={id:'job:ceres:second_measure:long_plate',worker:C.identities.worker,head:C.identities.cutterHead,section:C.identities.payload,cradle:C.identities.cradle,phase:'extract',phaseTick:100,updatedTick:100,index:3,sequence:0,mountId:'att_000004',towId:'att_000005',receiverId:null};
 const byId={att_000004:{id:'att_000004',defId:'attachment_transport_clamp',ownerRef:refs('cutterHead'),targetRef:refs('breaker'),sourceSocketId:'SOCKET_Mount',targetSocketId:'SOCKET_Cutter_Dock',sourceAnchorLocal:{x:-8,z:0},targetAnchorLocal:{x:-46,z:30},restLength:.026060374168755757},att_000005:{id:'att_000005',defId:'tether_standard',ownerRef:refs('breaker'),targetRef:refs('section'),sourceSocketId:'SOCKET_Tether_Massline',targetSocketId:'socket_tether_anchor',sourceAnchorLocal:{x:-46,z:0},targetAnchorLocal:{x:0,z:-55},restLength:211}};
 for(const line of Object.values(byId))Object.assign(line,{state:'active',controlMode:'ceres_workfleet',createdTick:100,brokenTick:null,breakReason:null,lastTension:0,lastImpulse:0});
 return {records,sites:siteSave,jobs:{ceresWorkfleet:job},combat:{attachments:{byId}},tick:100,simTime:100/60};
}
async function restore(wire){
 const state=createGameState(47);state.mode='flight';state.world.currentSectorId=C.sectorId;state.tick=wire.tick;state.simTime=wire.simTime;state.nextEntityId=700;state.world.frameOrigin={x:-12288,z:8192};state.world.frameOriginSeq=1;state.world.records=clone(wire.records);
 const sim=selected(state),sites=sim.registry.get('asteroidSites');sites.deserialize(clone(wire.sites));sites._syncWorldSites();for(const record of Object.values(state.world.records.byId))sim.spawn(spawnSpecFromRecord(record));
 const player=sim.spawn({type:'ship',team:0,pos:{x:C.sitePlacement.pos.x+2000,z:C.sitePlacement.pos.z-900},radius:6,mass:100,hull:100});state.playerId=player.id;
 sim.registry.get('npcJobsRuntime').deserialize(clone(wire.jobs));const saver=Object.assign(Object.create(save),{state,bus:sim.bus,_restoreSequence:1,_runEpoch:1});saver._restoreCombat(clone(wire.combat),new Map());saver._resumeCeresAttachmentRestore();
 const physics=sim.registry.get('physics');await physics.prepareBackend(state);assert.equal(physics._sg02.captureContactImpacts,false,'selected-owner fixture explicitly uses legacy process-default construction flags; full production-scoped acceptance is a separate factory probe');reconcileCeresWorkfleetPresentation({state});
 const bodies=state.entityList.filter(e=>e.alive&&Object.values(C.identities).includes(e.data?.worldRecordId));assert.equal(bodies.length,4);const b=Object.fromEntries(bodies.map(e=>[e.data.ceresWorkfleetRole||'section',e]));
 const owner=sim.registry.get('npcJobsRuntime');
 return {state,sim,sites,saver,physics,owner,b,job:()=>state.npcJobs.ceresWorkfleet,service:sim.registry.get('combat').kernel.attachments,close(){saver.destroy();sim.dispose();}};
}
function capture(h){const records={byId:{},order:[]};for(const e of [h.b.breaker,h.b.cutterHead,h.b.cradle]){const r=captureEntityRecord(e,{sectorId:C.sectorId,tick:h.state.tick});records.byId[r.recordId]=r;records.order.push(r.recordId);}return clone({records,sites:h.sites.serialize(),jobs:h.owner.serialize(),combat:serializeCombatState(h.state),tick:h.state.tick,simTime:h.state.simTime});}
function checkOriginal(h){assert.equal(h.b.section.mass,1800);assert.equal(h.physics._sg02.records.get(h.b.section.id)?.body.mass(),1800);assert.equal(h.physics._sg02.records.get(h.b.section.id)?.colliders.length,5);assert.equal(h.state.entityList.filter(e=>e.alive&&e.data?.worldRecordId===C.identities.payload).length,1);for(const id of ['att_000004','att_000005'])assert.equal(h.service.get(id)?.state,'active');}
let earned;
test('same original section force-reapproaches, seats, returns and preserves every newly persisted stage through fresh-life Continue',async()=>{
 const h=await restore(initialWire()),snapshots=new Map();const original=h.b.section,life=original.occupantGeneration;let maxForce=0,maxHeadError=0;
 try{for(let i=0;i<54000;i++){h.sim.step();const job=h.job();if(phaseNames.includes(job.phase)&&!snapshots.has(job.phase))snapshots.set(job.phase,capture(h));
  const f=h.physics._sg02.records.get(h.b.breaker.id).controlForce;maxForce=Math.max(maxForce,Math.hypot(f?.x||0,f?.z||0));const expected=compose({...h.b.breaker.pos,rot:h.b.breaker.rot},C.assets.breaker.headMountedPose);maxHeadError=Math.max(maxHeadError,Math.hypot(h.b.cutterHead.pos.x-expected.x,h.b.cutterHead.pos.z-expected.z));
  if(['loaded','recovery-interrupted','head-disabled','worker-disabled'].includes(job.phase))break;}
  assert.equal(h.job().phase,'loaded',JSON.stringify(h.job()));assert.equal(original,h.b.section);assert.equal(original.occupantGeneration,life);checkOriginal(h);
  assert.ok(ceresWorkfleetContactRetained(h.b.breaker,h.b.section,h.state,'breaker'));assert.ok(maxForce<=.3*3200+1e-5);assert.ok(maxHeadError<=1);
  assert.deepEqual([...snapshots.keys()],phaseNames);earned=snapshots;console.log('RECOVERY_RUNTIME',JSON.stringify({tick:h.state.tick,maxForce,maxHeadError,phaseTicks:[...snapshots].map(([phase,w])=>[phase,w.tick]),pose:pose(original)}));
 }finally{h.close();}
 for(const [phase,wire]of snapshots){const r=await restore(wire);try{assert.equal(r.job().phase,phase);for(const [role,e]of Object.entries(r.b)){const p=role==='section'?wire.sites.worldById[C.siteId].payloads.long_plate.motion:wire.records.byId[e.data.worldRecordId];assert.deepEqual(pose(e),{pos:{x:p.pos.x,z:p.pos.z},vel:{x:p.vel.x,z:p.vel.z},rot:p.rot,angVel:p.angVel});}checkOriginal(r);
  for(let i=0;i<120;i++)r.sim.step();assert.notEqual(r.job().phase,'recovery-interrupted',JSON.stringify(r.job()));checkOriginal(r);
  const reSaved=capture(r);for(const record of Object.values(reSaved.records.byId)){
   assert.equal(ceresWorkfleetRecordHasCustody(record),true,phase);const advanced=advanceWorldRecord(record,r.state.simTime,r.state.simTime+10);
   assert.deepEqual(advanced.pos,record.pos,`${phase}: coherent constrained catch-up preserves pose`);assert.deepEqual(advanced.vel,record.vel);
   assert.deepEqual(spawnSpecFromRecord(record).data.itinerary.ceresWorkfleet.custody,record.itinerary.ceresWorkfleet.custody);
  }const again=await restore(reSaved);try{assert.equal(again.job().phase,r.job().phase);assert.deepEqual(clone(pose(again.b.section)),clone(pose(r.b.section)));checkOriginal(again);}finally{again.close();}
 }finally{r.close();}}
 // Continue from a genuinely earned recovery seat, then finish the real return rather than only deserializing a phase string.
 const resumed=await restore(snapshots.get('recover_seat'));try{for(let i=0;i<40000&&resumed.job().phase!=='loaded'&&resumed.job().phase!=='recovery-interrupted';i++)resumed.sim.step();assert.equal(resumed.job().phase,'loaded',JSON.stringify(resumed.job()));checkOriginal(resumed);}finally{resumed.close();}
});
test('recovery planner rejects moving, spinning, shell-bound, closed-shoe and unbounded capture targets',async()=>{
 const h=await restore(initialWire());try{assert.ok(planCeresWorkfleetRecovery(h.b,h.state.tick).plan);
  for(const mutate of [b=>b.section.vel.x=.1,b=>b.section.angVel=.001,b=>b.section.pos.z=C.sitePlacement.pos.z-100,b=>b.section.pos.x-=1000,b=>b.breaker.data.ceresWorkfleetSlide=.1,b=>b.breaker.pos.z+=2]){const b=Object.fromEntries(Object.entries(h.b).map(([k,e])=>[k,{...e,pos:{...e.pos},vel:{...e.vel},data:{...e.data}}]));mutate(b);assert.ok(planCeresWorkfleetRecovery(b,h.state.tick).reason);}
  const p=planCeresWorkfleetRecovery(h.b,h.state.tick).plan;for(const mutate of [p=>p.stage.x+=.1,p=>p.returnStage.z++,p=>p.deadlineTick+=L.maxTicks,p=>p.attempt=2,p=>p.start.x+=2,p=>p.returnStart={...p.stage,x:p.stage.x+9},p=>p.plate.rot=NaN]){const bad=clone(p);mutate(bad);assert.equal(restoreCeresWorkfleetRecovery(bad),null);const job=restoreCeresWorkfleetJob({...h.job(),phase:'recover_seat',recovery:bad});assert.equal(job.phase,'recovery-interrupted');assert.equal(job.reason,'recovery-plan-invalid');}
 }finally{h.close();}
});
test('continuous real compound sweep rejects the unsafe signed turn and a middle-of-leg obstruction across rebasing',async()=>{
 const h=await restore(initialWire({yaw:-.2}));try{const p=planCeresWorkfleetRecovery(h.b,h.state.tick);const before=h.physics._sg02.world.bodies.len();const result=ceresWorkfleetRecoveryClear(h.physics._sg02,h.state,h.b,p.plan?.start||p.turnCheck.from,p.plan?.turn||p.turnCheck.to);assert.equal(result.ok,false);assert.equal(result.blocker,C.identities.payload);assert.equal(result.part,'bridle_starboard');assert.equal(h.physics._sg02.world.bodies.len(),before);}finally{h.close();}
 const r=await restore(initialWire());try{const p=planCeresWorkfleetRecovery(r.b,r.state.tick).plan;assert.equal(ceresWorkfleetRecoveryClear(r.physics._sg02,r.state,r.b,p.turn,p.stage).ok,true);
  const midpoint={x:(p.turn.x+p.stage.x)/2,z:(p.turn.z+p.stage.z)/2};const obstruction=r.sim.spawn({type:'wreck',alive:true,hull:100,collides:true,pos:{x:midpoint.x-48.5,z:midpoint.z-69},vel:{x:0,z:0},rot:0,mass:100,radius:2,data:{worldRecordId:'proof:middle-obstruction'},physicsBody:{schemaVersion:1,dynamic:false,mass:100,radius:2,shape:'ball',useMeasuredSkin:false,material:'wreck'}});
  let hit=ceresWorkfleetRecoveryClear(r.physics._sg02,r.state,r.b,p.turn,p.stage);assert.equal(hit.reason,'nearby-native-unresolved');r.physics._sg02.syncFromEntities(r.state.entityList);
  hit=ceresWorkfleetRecoveryClear(r.physics._sg02,r.state,r.b,p.turn,p.stage);assert.equal(hit.ok,false);assert.equal(hit.blocker,'proof:middle-obstruction');r.physics._sg02.setFrameOrigin(C.sitePlacement.pos,2);assert.equal(ceresWorkfleetRecoveryClear(r.physics._sg02,r.state,r.b,p.turn,p.stage).ok,false);assert.equal(obstruction.alive,true);
 }finally{r.close();}
});
test('every persisted recovery stage yields to actual player custody, cut line, obstacle, stale life and timeout without replacement lines',async()=>{
 assert.equal(earned?.size,5);
 for(const [phase,wire]of earned)for(const kind of ['player','cut','late-cut','life','timeout','future-time','obstacle','late-obstacle','reel-obstacle']){
  const h=await restore(wire);try{const original=h.b.section,id=h.job().towId,lineCount=Object.keys(h.state.combat.attachments.byId).length;
   if(kind==='player')h.b.section.data.playerOwned=true;
   if(kind==='late-cut'){stepCeresWorkfleet(h.owner,dt);h.service.cut(id,h.b.breaker.id,'proof_late_cut');assert.equal(consumeCeresBreakerControl(h.b.breaker,h.state),null);assert.equal(consumeCeresHeadControl(h.b.cutterHead,h.state,h.owner),null);}
   if(kind==='cut')h.service.cut(id,h.b.breaker.id,'proof_cut');
   if(kind==='life'){stepCeresWorkfleet(h.owner,dt);h.b.section.occupantGeneration++;}
   if(kind==='timeout')h.state.tick=h.job().recovery.deadlineTick+1;
   if(kind==='future-time'){h.job().recovery.startedTick+=1e12;h.job().recovery.deadlineTick+=1e12;}
   if(kind==='late-obstacle')stepCeresWorkfleet(h.owner,dt);
   if(kind==='obstacle'||kind==='late-obstacle'){const e=h.sim.spawn({type:'wreck',alive:true,hull:100,collides:true,pos:{x:h.b.breaker.pos.x-48.5,z:h.b.breaker.pos.z-69},vel:{x:0,z:0},mass:100,radius:2,data:{worldRecordId:'proof:obstruction'},physicsBody:{schemaVersion:1,dynamic:false,mass:100,radius:2,shape:'ball',material:'wreck'}});h.physics._sg02.syncFromEntities(h.state.entityList);assert.ok(e.alive);if(kind==='late-obstacle'){assert.equal(consumeCeresBreakerControl(h.b.breaker,h.state),null);assert.equal(consumeCeresHeadControl(h.b.cutterHead,h.state,h.owner),null);}}
   const beforeLength=h.service.get(id)?.restLength;
   if(kind==='reel-obstacle'){
    if(phase!=='recover_seat')continue;
    h.sim.spawn({type:'wreck',alive:true,hull:100,collides:true,pos:{x:h.b.section.pos.x,z:h.b.section.pos.z-78},vel:{x:0,z:0},rot:0,mass:100,radius:4,data:{worldRecordId:'proof:reel-obstruction'},physicsBody:{schemaVersion:1,dynamic:false,mass:100,radius:4,shape:'ball',useMeasuredSkin:false,material:'wreck'}});h.physics._sg02.syncFromEntities(h.state.entityList);
   }
   stepCeresWorkfleet(h.owner,dt);if(kind==='reel-obstacle'){assert.equal(h.service.get(id).restLength,beforeLength);assert.equal(h.b.breaker.data.ceresWorkfleetSlideTarget,0);assert.equal(h.job().recoveryBlocker,'proof:reel-obstruction');}
   assert.ok(['player-retained','worker-disabled','recovery-interrupted'].includes(h.job().phase),JSON.stringify({phase,kind,job:h.job()}));assert.equal(consumeCeresBreakerControl(h.b.breaker,h.state),null);assert.equal(h.b.section,original);assert.equal(original.mass,1800);assert.equal(Object.keys(h.state.combat.attachments.byId).length,lineCount,'never recreate cut or claimed custody');
   const saved=capture(h),again=await restore(saved);try{assert.equal(again.job().phase,h.job().phase);assert.equal(again.b.section.mass,1800);assert.equal(Object.keys(again.state.combat.attachments.byId).length<=lineCount,true);}finally{again.close();}
  }finally{h.close();}
 }
});

test('offset native solids and allowed held-pose margins never disappear from the recovery query',async()=>{
 const h=await restore(initialWire());try{
  const blocker=h.sim.spawn({type:'wreck',alive:true,hull:100,collides:true,pos:{x:stage.x+500,z:stage.z-80},vel:{x:0,z:0},rot:0,mass:100,radius:1,data:{worldRecordId:'proof:offset-solid'},physicsBody:{schemaVersion:1,dynamic:false,mass:100,radius:1,material:'wreck',collisionProxyManifest:{schemaVersion:1,id:'proof:offset-solid',referenceRadius:'radius',primitives:[{kind:'obb',x:-500,z:0,hx:5,hz:5,angle:0}]}}});
  assert.equal(ceresWorkfleetRecoveryClear(h.physics._sg02,h.state,h.b,stage,stage).reason,'nearby-native-unresolved');h.physics._sg02.syncFromEntities(h.state.entityList);
  const hit=ceresWorkfleetRecoveryClear(h.physics._sg02,h.state,h.b,stage,stage);assert.equal(hit.ok,false);assert.equal(hit.blocker,'proof:offset-solid');assert.equal(blocker.alive,true);
 }finally{h.close();}
 const wire=clone(earned.get('recover_return_turn')),carrier=wire.records.byId[C.identities.worker],load=compose({...carrier.pos,rot:carrier.rot},C.assets.breaker.loadPose);
 wire.sites.worldById[C.siteId].payloads.long_plate.motion={pos:{x:load.x+Math.cos(carrier.rot)*.9,z:load.z+Math.sin(carrier.rot)*.9},vel:{x:0,z:0},rot:load.rot,angVel:0};
 const r=await restore(wire);try{
  const at={...r.b.breaker.pos,rot:r.b.breaker.rot},p=compose(at,{x:83,z:0,rot:0}),before=pose(r.b.section);
  r.sim.spawn({type:'wreck',alive:true,hull:100,collides:true,pos:{x:p.x,z:p.z},vel:{x:0,z:0},rot:0,mass:100,radius:.3,data:{worldRecordId:'proof:load-margin'},physicsBody:{schemaVersion:1,dynamic:false,mass:100,radius:.3,shape:'ball',useMeasuredSkin:false,material:'wreck'}});r.physics._sg02.syncFromEntities(r.state.entityList);
  const hit=ceresWorkfleetRecoveryClear(r.physics._sg02,r.state,r.b,at,at,{loaded:true});assert.equal(hit.ok,false);assert.equal(hit.blocker,'proof:load-margin');assert.deepEqual(pose(r.b.section),before);
 }finally{r.close();}
});
test('unregistered planar polygon override cannot hide behind a tiny primitive radius',async()=>{
 const h=await restore(initialWire());try{
  h.sim.spawn({type:'wreck',alive:true,hull:100,collides:true,pos:{x:stage.x+500,z:stage.z-80},vel:{x:0,z:0},rot:0,mass:100,radius:1,data:{worldRecordId:'proof:unregistered-polygon'},physicsBody:{schemaVersion:1,dynamic:false,mass:100,radius:1,material:'wreck',collisionProxyManifest:{schemaVersion:1,id:'proof:unregistered-polygon',referenceRadius:'radius',primitives:[{kind:'circle',x:0,z:0,r:1}],planarPolygon:[{x:-505,z:-5},{x:-495,z:-5},{x:-495,z:5},{x:-505,z:5}]}}});
  const result=ceresWorkfleetRecoveryClear(h.physics._sg02,h.state,h.b,stage,stage);assert.equal(result.ok,false);assert.equal(result.reason,'nearby-native-unresolved');assert.equal(result.blocker,'proof:unregistered-polygon');
 }finally{h.close();}
});

test('a distant dormant canonical compact hull or capsule is bounded without native promotion, while offset or malformed hulls remain closed',async()=>{
 const h=await restore(initialWire());try{
  const rock=h.sim.spawn({type:'asteroid',alive:true,collides:true,hull:100,pos:{x:-12129.085242085368,z:7687.391835539731},vel:{x:0,z:0},rot:0,radius:13.967000960372388,mass:100,data:{typeId:'ast_metallic',authoredGeologySkin:true,placeId:'place_asteroid_rock_a',placeTargetRadius:13.967000960372388,collisionProxy:'skin:place_asteroid_rock_a'},physicsBody:{radius:19.134791315710174}});
  const ship=h.sim.spawn({type:'ship',alive:true,collides:true,hull:100,pos:{x:stage.x+2000,z:stage.z},vel:{x:0,z:0},rot:0,radius:10,mass:100,data:{proportions:{length:4,halfWidth:2}},physicsBody:{radius:10,shape:'capsule',centerOfMass:{x:25,z:5}}});
  const bodies=h.physics._sg02.records.size,p=planCeresWorkfleetRecovery(h.b,h.state.tick).plan;
  assert.equal(h.physics._sg02.records.has(rock.id),false);assert.equal(h.physics._sg02.records.has(ship.id),false);
  assert.equal(ceresWorkfleetRecoveryClear(h.physics._sg02,h.state,h.b,p.turn,p.stage).ok,true);assert.equal(h.physics._sg02.records.size,bodies,'query never promotes far actors');
  for(const [key,points]of[['compactHull',[{x:-505,z:-5},{x:-495,z:-5},{x:-495,z:5},{x:-505,z:5}]],['planarPolygon',[{x:-505,z:-5},{x:-495,z:-5},{x:-495,z:5},{x:-505,z:5}]],['compactHull',[{x:NaN,z:0},{x:1,z:0},{x:0,z:1}]]]){
   const e=h.sim.spawn({type:'wreck',alive:true,collides:true,hull:100,pos:{x:stage.x+500,z:stage.z-80},vel:{x:0,z:0},rot:0,radius:1,mass:100,data:{worldRecordId:`proof:${key}`},physicsBody:{radius:1,shape:'ball',collisionProxyManifest:{schemaVersion:1,id:`proof:${key}`,referenceRadius:'radius',primitives:[{kind:'circle',x:0,z:0,r:1}],[key]:points}}});
   const result=ceresWorkfleetRecoveryClear(h.physics._sg02,h.state,h.b,stage,stage);assert.equal(result.ok,false);assert.equal(result.reason,'nearby-native-unresolved');e.alive=false;
  }
 }finally{h.close();}
});

test('cold activity catch-up is queried at its canonical current pose before any recovery command is consumed',async()=>{
 const h=await restore(initialWire());try{
  for(let i=0;i<605;i++)h.sim.step();assert.equal(h.job().phase,'recover_approach');
  h.state.tick=33379;h.state.simTime=556.3166666664894; // observed query clock, within this one attempt's deadline
  stepCeresWorkfleet(h.owner,dt);
  // Observed field f_ceres_3 slot9: dormant pose and velocity before tick33379.
  const rock=h.sim.spawn({type:'asteroid',alive:true,collides:true,hull:100,pos:{x:-12404.976837158203,z:9255.316772460938},vel:{x:-28.487411499023438,z:-1.2783476114273071},rot:.77,angVel:-.36,radius:13.303167707286775,mass:732.126708291471,data:{typeId:'ast_metallic',collisionProxy:'skin:ast_metallic',fieldId:'f_ceres_3',asteroidSlotId:'9'},physicsBody:{radius:18.224,radiusScale:1,dynamic:true,shape:'ball'}});
  rock.activity={simTier:'S3_DORMANT',lastExactT:h.state.simTime-18.2,lastObservedT:h.state.simTime};
  const before=clone(pose(rock)),stamp=clone(rock.activity),nativeCount=h.physics._sg02.records.size;
  const carrier={...h.b.breaker.pos,rot:h.b.breaker.rot},result=ceresWorkfleetRecoveryClear(h.physics._sg02,h.state,h.b,carrier,carrier);
  assert.equal(result.ok,false);assert.equal(result.reason,'nearby-native-unresolved');assert.equal(result.blocker,rock.id);
  assert.equal(consumeCeresBreakerControl(h.b.breaker,h.state),null);assert.equal(consumeCeresHeadControl(h.b.cutterHead,h.state,h.owner),null);
  assert.deepEqual(clone(pose(rock)),before);assert.deepEqual(rock.activity,stamp);assert.equal(h.physics._sg02.records.size,nativeCount,'query never promotes a cold peer');
  stepCeresWorkfleet(h.owner,dt);assert.equal(h.job().phase,'recovery-interrupted');assert.equal(h.job().reason,'recovery-nearby-native-unresolved');checkOriginal(h);
 }finally{h.close();}
});
test('cold current-pose checks do not obstruct a moving-away peer or double-project an exact body',async()=>{
 const h=await restore(initialWire());try{
  const p=planCeresWorkfleetRecovery(h.b,h.state.tick).plan;
  const rock=h.sim.spawn({type:'asteroid',alive:true,collides:true,hull:100,pos:{x:stage.x,z:stage.z},vel:{x:30,z:0},rot:0,angVel:0,radius:12,mass:100,data:{typeId:'ast_metallic'},physicsBody:{radius:12,shape:'ball'}});
  rock.activity={simTier:'S3_DORMANT',lastExactT:0};h.state.simTime=30;
  assert.equal(ceresWorkfleetRecoveryClear(h.physics._sg02,h.state,h.b,p.turn,p.stage).ok,true,'canonical catch-up puts the departed peer900WU away');
  rock.activity.simTier='S0_EXACT';
  assert.equal(ceresWorkfleetRecoveryClear(h.physics._sg02,h.state,h.b,p.turn,p.stage).ok,false,'an exact but missing native body is checked at its real current pose');
  rock.pos.x+=900;rock.vel.x=-30;
  assert.equal(ceresWorkfleetRecoveryClear(h.physics._sg02,h.state,h.b,p.turn,p.stage).ok,true,'exact pose must not be projected backward through the well');
 }finally{h.close();}
});

test('cold ordinary bodies leave native layers while attached retained bodies stay live and are queried at their actual native pose',async()=>{
 const h=await restore(initialWire());try{
  const peers=[900,930,960].map((x,i)=>h.sim.spawn({type:'wreck',alive:true,collides:true,hull:100,pos:{x:stage.x+x,z:stage.z},vel:{x:-30,z:0},rot:0,angVel:0,radius:3,mass:100,data:{worldRecordId:`proof:cold-native:${i}`},physicsBody:{radius:3,mass:100,dynamic:true,shape:'ball',useMeasuredSkin:false}}));
  for(const e of peers)e.activity={simTier:'S3_DORMANT',lastExactT:0};h.state.simTime=30;
  const n=h.physics._sg02;n.syncFromEntities(h.state.entityList);
  assert.ok(n.createAttachment({attachmentId:'proof:retained-cold-line',defId:'tether_standard',ownerId:peers[0].id,targetId:peers[1].id,sourceWorld:peers[0].pos,targetWorld:peers[1].pos,restLength:30}));
  const statics=[...n.records.values()].filter(r=>!r.spec.dynamic).map(r=>r.entity),dynamics=[...n.dynamicRecords].filter(r=>!peers.includes(r.entity)).map(r=>r.entity);
  n.syncFromEntityLayers(statics,dynamics,1);
  assert.equal(n.records.has(peers[2].id),false,'ordinary unpinned dormant peer is removed');
  for(const e of peers.slice(0,2)){const rec=n.records.get(e.id);assert.ok(rec);assert.equal(rec.body.isEnabled(),true);assert.equal(n.dynamicRecords.has(rec),true);}
  const before=peers[0].pos.x;n.step(dt,h.state.tick);
  assert.ok(Math.abs(peers[0].pos.x-(before-.5))<.002,'retained native dynamics continue to step and publish current kinematics');
  const p=planCeresWorkfleetRecovery(h.b,h.state.tick).plan;peers[2].alive=false;
  assert.equal(ceresWorkfleetRecoveryClear(n,h.state,h.b,p.turn,p.stage).ok,true,'valid retained native pose wins over stale activity time');
  n.cutAttachment({attachmentId:'proof:retained-cold-line'});n.syncFromEntityLayers(statics,dynamics,1);
  assert.equal(n.records.has(peers[0].id),false);assert.equal(n.records.has(peers[1].id),false);
 }finally{h.close();}
});
