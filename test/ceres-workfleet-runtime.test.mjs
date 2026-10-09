import test from 'node:test';
import assert from 'node:assert/strict';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { CERES_WORKFLEET_CONTRACT as C, ceresWorkfleetPose } from '../src/data/ceresWorkfleet.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { ceresWorkfleetHardwareSpec,ceresWorkfleetWorldPose,driveCeresWorkfleetBody,
  ceresWorkfleetAtPose,ceresWorkfleetSocket } from '../src/systems/ceresWorkfleet.js';
const DT=1/60;
function body(id,boxes,mass,at,dynamic=true){
  const radius=120;
  return {id,type:'wreck',alive:true,hull:1000,pos:{x:at.x,z:at.z},rot:at.rot||0,vel:{x:0,z:0},angVel:0,
    radius,mass,data:{},collides:true,physicsBody:{schemaVersion:1,dynamic,radius,mass,
      inertiaY:mass*1200,material:'wreck',ccd:true,revision:0,collisionProxyManifest:{schemaVersion:1,id:`proof-${id}`,referenceRadius:'radius',
        primitives:boxes.map(b=>({kind:'obb',id:b.id,x:b.center.x/radius,z:b.center.z/radius,hx:b.size.x/2/radius,hz:b.size.z/2/radius,angle:0}))}}};
}
async function nativeHarness(){
  const breaker={id:1,...ceresWorkfleetHardwareSpec('breaker')},head={id:2,...ceresWorkfleetHardwareSpec('cutterHead')},cradle={id:3,...ceresWorkfleetHardwareSpec('cradle')};
  const section=body(4,C.existing.section.boxes,1800,ceresWorkfleetWorldPose(C.existing.section.mountedPose));
  const shell=C.existing.shellBoxes.map((box,i)=>body(10+i,[box],1e9,ceresWorkfleetWorldPose({x:0,z:0,rot:0}),false));
  const other=C.existing.otherSections.map((p,i)=>body(20+i,p.boxes,2200,ceresWorkfleetWorldPose(p.pose),false));
  const entities=[breaker,head,cradle,section,...shell,...other];
  const physics=await createSg02DynamicBodyOwner({publishTelemetry:false,fixedDt:DT});
  physics.syncFromEntities(entities);
  const attach=(name,defId,a,ar,as,b,br,bs)=>{
    const def=ATTACHMENT_DEFS.find(d=>d.id===defId);
    const sourceWorld=ceresWorkfleetSocket(a,ar,as),targetWorld=ceresWorkfleetSocket(b,br,bs);
    return physics.createAttachment({attachmentId:name,defId,ownerId:a.id,targetId:b.id,sourceWorld,targetWorld,
      restLength:Math.hypot(sourceWorld.x-targetWorld.x,sourceWorld.z-targetWorld.z),spring:def.spring,break:def.break,tick:0});
  };
  return {breaker,head,cradle,section,physics,entities,attach};
}
test('native ordinary line extracts original 1800 mass through exact shell with powered head dock',async()=>{
  const h=await nativeHarness();const {breaker,head,section,physics}=h;
  try{
    assert.ok(h.attach('mount','attachment_transport_clamp',head,'cutterHead','SOCKET_Mount',breaker,'breaker','SOCKET_Cutter_Dock'));
    const work=ceresWorkfleetWorldPose(C.route.breakerWorkPose);
    for(let i=0;i<240;i++){
      driveCeresWorkfleetBody(breaker,work);
      driveCeresWorkfleetBody(head,ceresWorkfleetPose({...breaker.pos,rot:breaker.rot},C.assets.breaker.headMountedPose),{speed:5,accel:8,angularSpeed:.3,angularAccel:.6});physics.step(DT);
    }
    assert.ok(ceresWorkfleetAtPose(head,ceresWorkfleetPose({...breaker.pos,rot:breaker.rot},C.assets.breaker.headMountedPose)),JSON.stringify(head.pos));
    physics.cutAttachment({attachmentId:'mount'});
    for(const p of C.route.headPosesInBreaker.slice(1)){
      const local=p;
      const target=ceresWorkfleetPose(work,local);let reached=false;
      for(let i=0;i<3600;i++){
        driveCeresWorkfleetBody(breaker,work);
        driveCeresWorkfleetBody(head,target,{speed:5,accel:8,angularSpeed:.3,angularAccel:.6});physics.step(DT);
        if(ceresWorkfleetAtPose(head,target)){reached=true;break;}
      }
      assert.ok(reached,`head failed at ${JSON.stringify(local)}, measured ${JSON.stringify(head.pos)}`);
    }
    for(const p of C.route.headPosesInBreaker.slice(0,-1).reverse()){
      const local=p;
      const target=ceresWorkfleetPose(work,local);let reached=false;
      for(let i=0;i<3600;i++){
        driveCeresWorkfleetBody(breaker,work);driveCeresWorkfleetBody(head,target,{speed:5,accel:8,angularSpeed:.3,angularAccel:.6});physics.step(DT);
        if(ceresWorkfleetAtPose(head,target)){reached=true;break;}
      }
      assert.ok(reached,'head retract');
    }
    assert.ok(h.attach('mount2','attachment_transport_clamp',head,'cutterHead','SOCKET_Mount',breaker,'breaker','SOCKET_Cutter_Dock'));
    assert.ok(h.attach('tow','tether_standard',breaker,'breaker','SOCKET_Tether_Massline',section,'section','SOCKET_Cut_A'));
    const goal=ceresWorkfleetWorldPose(C.route.extraction.breakerTo);let reached=false,maxX=0,maxYaw=0;
    for(let i=0;i<48000;i++){
      driveCeresWorkfleetBody(breaker,goal,{speed:.5,accel:.1});
      driveCeresWorkfleetBody(head,ceresWorkfleetPose({...breaker.pos,rot:breaker.rot},C.assets.breaker.headMountedPose),{speed:10,accel:8,angularSpeed:.3,angularAccel:.6});
      physics.step(DT);maxX=Math.max(maxX,Math.abs(section.pos.x-(C.sitePlacement.pos.x-80)));maxYaw=Math.max(maxYaw,Math.abs(section.rot));
      if(ceresWorkfleetAtPose(breaker,goal,{position:1,angle:.006,speed:.12,spin:.003})){reached=true;break;}
    }
    console.log('CERES_EXTRACTION',JSON.stringify({reached,breaker:breaker.pos,section:section.pos,vel:section.vel,rot:section.rot,maxX,maxYaw}));
    assert.ok(reached,'carrier and line settle');
    assert.ok(section.pos.z<C.sitePlacement.pos.z-210,'original section clears shell');
    assert.equal(section.mass,1800);assert.equal(breaker.mass,3200);assert.equal(head.mass,60);
    let seated=false;
    for(let i=0;i<24000;i++){
      driveCeresWorkfleetBody(breaker,goal,{speed:.5,accel:.3});
      driveCeresWorkfleetBody(head,ceresWorkfleetPose({...breaker.pos,rot:breaker.rot},C.assets.breaker.headMountedPose),{speed:10,accel:8,angularSpeed:.3,angularAccel:.6});
      if(section.pos.z<C.sitePlacement.pos.z-380)breaker.data.ceresWorkfleetSlideTarget=1;
      const line=physics.attachments.get('tow');
      physics.setAttachmentReel({attachmentId:'tow',restLength:Math.max(18,line.restLength-.5*DT)});
      physics.step(DT);
      const target=ceresWorkfleetWorldPose(C.route.seating.sectionTo);
      if(line.restLength<=18&&breaker.data.ceresWorkfleetSlide>.99&&ceresWorkfleetAtPose(section,target,{position:1,angle:.006,speed:.12,spin:.003})){seated=true;break;}
    }
    console.log('CERES_SEATING',JSON.stringify({seated,breaker:breaker.pos,head:head.pos,section:section.pos,vel:section.vel,rot:section.rot,line:physics.attachments.get('tow').restLength,slide:breaker.data.ceresWorkfleetSlide,blocked:breaker.data.ceresWorkfleetSlideBlocked}));
    assert.ok(seated,'passive section seats within real shoes');
    for(const [index,leg] of C.route.loadedLegs.entries()){
      const target=ceresWorkfleetWorldPose(leg.to);let reached=false;
      for(let i=0;i<36000;i++){
        driveCeresWorkfleetBody(breaker,target,{speed:leg.kind==='rotate'?1:3,accel:.5,angularSpeed:.035,angularAccel:.025});
        driveCeresWorkfleetBody(head,ceresWorkfleetPose({...breaker.pos,rot:breaker.rot},C.assets.breaker.headMountedPose),{speed:10,accel:8,angularSpeed:.3,angularAccel:.6});physics.step(DT);
        if(ceresWorkfleetAtPose(breaker,target,{position:.5,angle:.003,speed:.5,spin:.01})){reached=true;break;}
      }
      console.log('CERES_LEG',index,JSON.stringify({reached,breaker:breaker.pos,rot:breaker.rot,section:section.pos,sectionRot:section.rot,slide:breaker.data.ceresWorkfleetSlide}));
      assert.ok(reached,`loaded leg ${index}`);
    }
    assert.ok(h.attach('receiver','attachment_transport_clamp',h.cradle,'cradle','SOCKET_Service_Head',section,'section','SOCKET_Cut_B'));
    breaker.data.ceresWorkfleetSlideTarget=0;
    const hold=ceresWorkfleetWorldPose(C.route.loadedLegs.at(-1).to);
    for(let i=0;i<2000&&breaker.data.ceresWorkfleetSlide>0;i++){
      driveCeresWorkfleetBody(breaker,hold,{speed:1,accel:.5});
      driveCeresWorkfleetBody(head,ceresWorkfleetPose({...breaker.pos,rot:breaker.rot},C.assets.breaker.headMountedPose),{speed:10,accel:8,angularSpeed:.3,angularAccel:.6});physics.step(DT);
    }
    assert.equal(breaker.data.ceresWorkfleetSlide,0,'opens for transfer');
    physics.cutAttachment({attachmentId:'tow'});
    const withdraw=ceresWorkfleetWorldPose(C.route.carrierWithdrawalTo);let withdrew=false;
    for(let i=0;i<24000;i++){
      driveCeresWorkfleetBody(breaker,withdraw,{speed:3,accel:.5});
      driveCeresWorkfleetBody(head,ceresWorkfleetPose({...breaker.pos,rot:breaker.rot},C.assets.breaker.headMountedPose),{speed:10,accel:8,angularSpeed:.3,angularAccel:.6});physics.step(DT);
      if(ceresWorkfleetAtPose(breaker,withdraw,{position:.5,angle:.003,speed:.5,spin:.01})){withdrew=true;break;}
    }
    assert.ok(withdrew,'carrier withdraws');
    h.cradle.data.ceresWorkfleetSlideTarget=1;
    for(let i=0;i<6000;i++){
      driveCeresWorkfleetBody(breaker,withdraw,{speed:1,accel:.5});
      driveCeresWorkfleetBody(head,ceresWorkfleetPose({...breaker.pos,rot:breaker.rot},C.assets.breaker.headMountedPose),{speed:10,accel:8,angularSpeed:.3,angularAccel:.6});physics.step(DT);
    }
    console.log('CERES_RETAINED',JSON.stringify({section:section.pos,rot:section.rot,vel:section.vel,slide:h.cradle.data.ceresWorkfleetSlide,blocked:h.cradle.data.ceresWorkfleetSlideBlocked,blocker:h.cradle.data.ceresWorkfleetSlideBlocker}));
    assert.ok(ceresWorkfleetAtPose(section,ceresWorkfleetWorldPose(C.route.receiverPose),{position:2,angle:.04,speed:.5,spin:.03}),'original measured body retained at receiver');
    assert.equal(h.cradle.data.ceresWorkfleetSlideBlocker,section.id,'native continuous motor sweep stops only on the original section');
    const inner=70-36*h.cradle.data.ceresWorkfleetSlide;
    const faces=C.existing.section.boxes.flatMap(b=>[-1,1].flatMap(dx=>[-1,1].map(dz=>ceresWorkfleetPose({...section.pos,rot:section.rot},{x:b.center.x+dx*b.size.x/2,z:b.center.z+dz*b.size.z/2}).x-h.cradle.pos.x)));
    assert.ok(Math.min(inner-Math.max(...faces),Math.min(...faces)+inner)<=.25,'last accepted pads physically approach the measured section face');
  }finally{physics.dispose();}
});

import { createSimulation } from '../src/core/sim.js';
import { createGameState } from '../src/core/gameState.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { physics as physicsSystem } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { traffic } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';
import { CERES_SHIPBREAK_SITE_ID } from '../src/data/ceresShipbreak.js';
import { reconcileCeresWorkfleetPresentation } from '../src/systems/ceresWorkfleet.js';

async function productionOrderedHarness(){
  const state=createGameState(47);state.mode='flight';state.world.currentSectorId=C.sectorId;
  // Use world record authority without unrelated sector scatter; the normal sector/site producer
  // and brace receipt are exercised separately. Never reorder flight behind jobs to ease this test.
  const recordOwner={name:'world',init(ctx){this.state=ctx.state;},upsertWorldRecord:world.upsertWorldRecord};
  const modules={flightSlot:flightV3,physics:physicsSystem,combat,asteroidSites,npcJobsRuntime,traffic,world:recordOwner};
  const sim=createSimulation({state,seed:47,systems:PRODUCTION_INIT_ORDER.filter(id=>modules[id]).map(id=>modules[id]),
    updateOrder:PRODUCTION_UPDATE_ORDER.filter(id=>modules[id]).map(id=>modules[id])});
  const player=sim.spawn({type:'ship',team:0,alive:true,pos:{x:C.sitePlacement.pos.x+500,z:C.sitePlacement.pos.z-500},
    radius:6,mass:100,hull:100,hullMax:100,flags:{persistent:true},data:{}});state.playerId=player.id;
  // Borrow the real coordinate-owner boundary too: a record-only stub must not
  // leave a Ceres fixture solving 13,000WU from the origin while production rebases.
  world._tickFrameOrigin.call({bus:sim.bus},state);
  const sites=sim.registry.get('asteroidSites');sites._syncWorldSites(C.sectorId);
  const physics=sim.registry.get('physics');await physics.prepareBackend(state);
  sites.applyWorldSiteBeamOperation({siteId:CERES_SHIPBREAK_SITE_ID,componentId:'long_plate_clamp',verb:'repair',amount:24,
    requestStreamId:'player-industrial-beam',requestSequence:state.tick});
  reconcileCeresWorkfleetPresentation({state});
  return {sim,state,sites,physics};
}
test('selected-owner brace cycle follows production flight-before-jobs order',async()=>{
  const h=await productionOrderedHarness();let prior='';
  try{
    assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('flightSlot')<PRODUCTION_UPDATE_ORDER.indexOf('physics'));
    assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('physics')<PRODUCTION_UPDATE_ORDER.indexOf('npcJobsRuntime'));
    for(let i=0;i<85000;i++){
      h.sim.step();
      const job=h.state.npcJobs?.ceresWorkfleet;
      if(job?.phase!==prior){prior=job?.phase;console.log('CERES_PRODUCTION_PHASE',i,prior);}
      if(job?.phase==='secured'||['player-retained','section-destroyed','worker-disabled','head-disabled','recovery-interrupted'].includes(job?.phase))break;
    }
    const job=h.state.npcJobs.ceresWorkfleet;
    const bodies=[...h.state.entities.values()].filter(e=>e.alive&&e.data?.ceresWorkfleetRole);
    console.log('CERES_PRODUCTION_RESULT',JSON.stringify({job,bodies:bodies.map(e=>({id:e.id,role:e.data.ceresWorkfleetRole,pos:e.pos,vel:e.vel,rot:e.rot,slide:e.data.ceresWorkfleetSlide,blocked:e.data.ceresWorkfleetSlideBlocked,blocker:e.data.ceresWorkfleetSlideBlocker})),payload:h.sites.getWorldSite(C.siteId)?.payloads.long_plate}));
    if(job.phase==='pads'){const b=Object.fromEntries(bodies.map(e=>[e.data.ceresWorkfleetRole,e]));const section=h.state.entityList.find(e=>e.alive&&e.data?.worldRecordId===C.identities.payload);console.log('RETAIN_DEBUG',h.sites.retainCeresWorkfleetSection({jobId:job.id,workerId:b.breaker.id,headId:b.cutterHead.id,sectionId:section.id,cradleId:b.cradle.id}),section.mass,section.angVel);}
    assert.equal(job.phase,'secured');
    assert.equal(bodies.length,3);
    assert.equal(h.sites.getWorldSite(C.siteId).payloads.long_plate.status,'released','receiver retains original body');
    assert.equal(h.sites.getWorldSite(C.siteId).payloads.long_plate.retained.receiverWorldRecordId,C.identities.cradle);
    assert.equal(h.state.entityList.filter(e=>e.alive&&e.data?.worldRecordId===C.identities.payload).length,1);
  }finally{h.sim.dispose();}
});

import { createWorldSiteRecord, applyWorldSiteOperation, normalizeWorldSiteRecord } from '../src/systems/worldSiteKernel.js';
import { CERES_SHIPBREAK_MANIFEST as manifest } from '../src/data/ceresShipbreak.js';
import { captureEntityRecord, spawnSpecFromRecord } from '../src/world/worldRecords.js';
import { authorizeCeresBreakerControl, consumeCeresBreakerControl, validateCeresWorkfleetOperation,
  stepCeresWorkfleet, clearCeresWorkfleetControls, CERES_WORKFLEET_JOB_ID } from '../src/systems/ceresWorkfleet.js';
import { ensureCombatState } from '../src/combat/runtime.js';

test('world records restore only exact canonical hardware at the measured first native pose',()=>{
  for(const role of ['breaker','cradle','cutterHead']){
    const e={id:40,...ceresWorkfleetHardwareSpec(role)};e.pos.x+=.3;e.vel={x:1,z:-2};e.rot+=.02;e.angVel=.01;
    e.data.itinerary.ceresWorkfleet.slide=.45;e.hull-=1;
    const record=captureEntityRecord(e,{sectorId:C.sectorId,tick:100});const restored=spawnSpecFromRecord(record);
    assert.equal(restored.mass,e.mass);assert.equal(restored.radius,e.radius);assert.equal(restored.physicsBody.dynamic,e.physicsBody.dynamic);
    assert.deepEqual(restored.pos,{x:e.pos.x,z:e.pos.z});assert.deepEqual(restored.vel,e.vel);assert.equal(restored.rot,e.rot);
    assert.equal(restored.angVel,e.angVel);assert.equal(restored.hull,e.hull);assert.equal(restored.data.ceresWorkfleetSlide,.45);
    assert.notEqual(restored.flags.persistent,true,'world records remain sole hardware pose owner');
    for(const change of [r=>r.itinerary.ceresWorkfleet.role='fake',r=>r.itinerary.kind='other',r=>r.itinerary.ceresWorkfleet.slide=2,
      r=>r.vel.x=NaN,r=>r.hull=0,r=>r.alive=false,r=>r.type='fx',r=>r.rot=Infinity]) {
      const bad=structuredClone(record);change(bad);assert.equal(spawnSpecFromRecord(bad),null,'malformed exact identity never degrades into generic shell');
    }
    const legacy=structuredClone(record);legacy.recordId='ordinary:record';legacy.itinerary=null;
    assert.ok(spawnSpecFromRecord(legacy),'ordinary legacy records are unchanged');
  }
});
test('NPC and player seam cursors stay independent through interleaving and Continue',()=>{
  let r=createWorldSiteRecord(manifest);
  for(const [stream,seq] of [['player-industrial-beam',3],['ceres-second-measure-cutter',4]]) {
    const result=applyWorldSiteOperation(manifest,r,{operationId:'cut_long_plate_seam',amount:1,requestStreamId:stream,requestSequence:seq,tick:seq});
    assert.ok(result.ok);r=result.record;
  }
  r=normalizeWorldSiteRecord(manifest,r);
  for(const [stream,seq] of [['player-industrial-beam',3],['ceres-second-measure-cutter',4]]) {
    const result=applyWorldSiteOperation(manifest,r,{operationId:'cut_long_plate_seam',amount:1,requestStreamId:stream,requestSequence:seq,tick:4});
    assert.equal(result.duplicate,true);assert.equal(result.record.components.long_plate.progress.cut_long_plate_seam,2);
  }
  assert.equal(applyWorldSiteOperation(manifest,r,{operationId:'cut_crossbeam_seam',amount:1,requestStreamId:'ceres-second-measure-cutter',requestSequence:5,tick:5}).ok,false);
});
function operationFixture(){
  const state=createGameState(47);state.mode='flight';state.world.currentSectorId=C.sectorId;ensureCombatState(state);
  const breaker={id:1,occupantGeneration:1,...ceresWorkfleetHardwareSpec('breaker')};
  const head={id:2,occupantGeneration:2,...ceresWorkfleetHardwareSpec('cutterHead')};
  const at=ceresWorkfleetPose(ceresWorkfleetWorldPose(C.route.breakerWorkPose),C.route.headPosesInBreaker.at(-1));
  head.pos={x:at.x,z:at.z};head.rot=at.rot;
  const section=body(3,C.existing.section.boxes,1800,ceresWorkfleetWorldPose(C.existing.section.mountedPose));
  section.occupantGeneration=3;section.data={worldRecordId:C.identities.payload,worldSiteId:C.siteId,worldSitePayloadId:'long_plate',worldSiteStructural:true,persistenceOwner:'asteroidSites',worldSitePresentationAdmitted:true};
  state.entities=new Map([breaker,head,section].map(e=>[e.id,e]));state.entityList=[...state.entities.values()];state.entityIndex=null;
  const job={id:CERES_WORKFLEET_JOB_ID,worker:C.identities.worker,head:C.identities.cutterHead,section:C.identities.payload,cradle:C.identities.cradle,phase:'head_cut'};
  state.npcJobs={byId:{},ceresWorkfleet:job};reconcileCeresWorkfleetPresentation({state});
  const request={jobId:job.id,siteId:C.siteId,workerId:breaker.id,headId:head.id,sectionId:section.id,operationId:'cut_long_plate_seam'};
  return {state,job,breaker,head,section,request};
}
test('NPC operations require the healthy unique physical head, exact section, work socket and clear beam',()=>{
  const h=operationFixture();assert.equal(validateCeresWorkfleetOperation(h.state,h.request),true);
  for(const mutate of [h=>h.head.hull--,h=>h.head.pos.x+=10,h=>h.head.rot+=.05,h=>h.head.alive=false,
    h=>h.section.data.worldSitePayloadId='crossbeam',h=>h.request.sectionId=999,h=>h.request.operationId='cut_crossbeam_seam',h=>h.job.phase='loaded']) {
    const f=operationFixture();mutate(f);assert.equal(validateCeresWorkfleetOperation(f.state,f.request),false);
  }
  const f=operationFixture();const focus=ceresWorkfleetSocket(f.head,'cutterHead','SOCKET_Cut');
  const obstacle=body(80,[{id:'block',center:{x:0,z:0},size:{x:1,z:1}}],100,{x:focus.x,z:focus.z+1});
  f.state.entities.set(obstacle.id,obstacle);assert.equal(validateCeresWorkfleetOperation(f.state,f.request),false);
  f.state.entities.delete(obstacle.id);assert.equal(validateCeresWorkfleetOperation(f.state,f.request),true,'actual clear approach recovers without fabricated work');
});
function fixtureCouplings(f){
 f.job.mountId='mount';f.job.towId='tow';
 f.state.combat.attachments.byId.mount={id:'mount',state:'active',ownerId:f.head.id,targetId:f.breaker.id,ownerGeneration:f.head.occupantGeneration,targetGeneration:f.breaker.occupantGeneration};
 f.state.combat.attachments.byId.tow={id:'tow',state:'active',ownerId:f.breaker.id,targetId:f.section.id,ownerGeneration:f.breaker.occupantGeneration,targetGeneration:f.section.occupantGeneration};
}
test('breaker flight lease is bounded, one-sample, same-life, exact-job and player-override safe',()=>{
  const f=operationFixture();f.job.phase='extract';fixtureCouplings(f);
  const target=ceresWorkfleetWorldPose(C.route.extraction.breakerTo);
  assert.equal(authorizeCeresBreakerControl(f.breaker,f.state,f.job,target,{speed:999,accel:999,angularSpeed:999}),true);
  const c=consumeCeresBreakerControl(f.breaker,f.state);assert.ok(c);assert.ok(Math.hypot(c.force.x,c.force.z)<=1600.000001);
  assert.equal(consumeCeresBreakerControl(f.breaker,f.state),null);
  for(const mutate of [f=>f.state.tick+=2,f=>f.breaker.occupantGeneration++,f=>f.head.occupantGeneration++,
    f=>f.state.playerId=f.breaker.id,f=>f.job.phase='player-retained',f=>f.state.npcJobs.ceresWorkfleet={...f.job},
    f=>f.breaker.data.intent={...f.breaker.data.intent},f=>f.head.hull--]) {
    const f=operationFixture();f.job.phase='extract';fixtureCouplings(f);authorizeCeresBreakerControl(f.breaker,f.state,f.job,target);mutate(f);
    assert.equal(consumeCeresBreakerControl(f.breaker,f.state),null);
  }
});

import { advanceWorldRecord, advanceWorldRecordInto } from '../src/world/worldCatchup.js';
test('only exact active custody freezes the joint work assembly during offsector catch-up',()=>{
  const e={id:99,...ceresWorkfleetHardwareSpec('cutterHead')};e.vel={x:2,z:3};
  const record=captureEntityRecord(e,{sectorId:C.sectorId,tick:100});
  const custody={jobId:CERES_WORKFLEET_JOB_ID,worker:C.identities.worker,head:C.identities.cutterHead,cradle:C.identities.cradle,
    section:C.identities.payload,phase:'loaded',active:true};
  record.itinerary.ceresWorkfleet.custody=custody;
  for(const into of [false,true]) {
    const source=structuredClone(record),before=structuredClone(source);
    const out=into?advanceWorldRecordInto(source,0,60):advanceWorldRecord(source,0,60);
    assert.deepEqual(out.pos,before.pos);assert.deepEqual(out.vel,before.vel);assert.equal(out.rot,before.rot);
    assert.equal(out.lastObservedT,60);
  }
  for(const change of [r=>r.itinerary.ceresWorkfleet.custody=null,r=>r.itinerary.ceresWorkfleet.custody.phase='player-retained',
    r=>r.itinerary.ceresWorkfleet.custody.active=false,r=>r.itinerary.ceresWorkfleet.custody.worker='forged']) {
    const free=structuredClone(record);change(free);const out=advanceWorldRecord(free,0,60);
    assert.equal(out.pos.x,free.pos.x+120);assert.equal(out.pos.z,free.pos.z+180,'free material keeps ordinary ballistic motion');
  }
});

import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import {snapshotFeatureMaps,applyFeatureConfigToMaps,restoreFeatureMaps} from '../src/data/featureFlags.js';
function withProductionFeatures(runtime,fn){const prior=snapshotFeatureMaps();applyFeatureConfigToMaps(runtime.config.features);try{return fn();}finally{restoreFeatureMaps(prior);}}
async function prepareProductionNative(runtime){const prior=snapshotFeatureMaps();applyFeatureConfigToMaps(runtime.config.features);try{const ok=await runtime.getSystem('physics').prepareBackend(runtime.state);assert.equal(runtime.getSystem('physics')._sg02.captureContactImpacts,true);assert.ok(runtime.getSystem('physics')._sg02._eventQueue);return ok;}finally{restoreFeatureMaps(prior);}}

import { makeShipEntitySpec } from '../src/systems/ships.js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const productionProofSourceHashes=()=>Object.fromEntries([
  '../src/systems/ceresWorkfleet.js','../src/data/ceresWorkfleet.js','../src/data/ceresWorkfleetHardware.js',
  '../src/systems/flightV3.js','../src/systems/worldSiteRuntime.js','../src/systems/salvageActions.js',
].map(path=>[path,createHash('sha256').update(readFileSync(new URL(path,import.meta.url))).digest('hex')]));
test('complete production factory commissions the public site worker and yields real cargo to player custody',async()=>{
  const sourceHashes=productionProofSourceHashes();
  const runtime=createAuthoritativeRuntime({profileId:'production',nodeSafeOnly:true,seed:47});
  try {
    const state=runtime.state;state.mode='flight';state.ui.screenStack=[];
    const player=withProductionFeatures(runtime,()=>runtime.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:state.player,pos:{x:0,z:0}})));state.playerId=player.id;
    const w=runtime.getSystem('world');withProductionFeatures(runtime,()=>w.enterSector(C.sectorId));
    withProductionFeatures(runtime,()=>w.relocatePlayerInSector({x:C.sitePlacement.pos.x-260,z:C.sitePlacement.pos.z-160,heading:0},{reason:'ceres-workfleet-production-proof'}));
    const sites=runtime.getSystem('asteroidSites');assert.ok(sites.getWorldSite(C.siteId),'ordinary sector producer creates Second Measure');
    assert.equal(await prepareProductionNative(runtime),true);
    const brace=withProductionFeatures(runtime,()=>sites.applyWorldSiteBeamOperation({siteId:C.siteId,componentId:'long_plate_clamp',verb:'repair',amount:24,
      requestStreamId:'player-industrial-beam',requestSequence:state.tick}));assert.equal(brace.ok,true);
    let sawThrust=false,maxTravel=0;
    for(let i=0;i<7600;i++) {
      runtime.step(DT);
      const worker=state.entityList.find(e=>e.alive&&e.data?.worldRecordId===C.identities.worker);
      if(worker){maxTravel=Math.max(maxTravel,Math.hypot(worker.pos.x-(C.sitePlacement.pos.x-80),worker.pos.z-(C.sitePlacement.pos.z-220)));
        sawThrust ||= worker._flightFrame?.driveState==='thrust';}
      if(state.npcJobs?.ceresWorkfleet?.phase==='extract'&&maxTravel>2)break;
    }
    let job=state.npcJobs?.ceresWorkfleet,section=state.entityList.find(e=>e.alive&&e.data?.worldRecordId===C.identities.payload);
    assert.deepEqual(productionProofSourceHashes(),sourceHashes,'production proof source must stay immutable during the probe');
    console.log('CERES_FULL_PRODUCTION',JSON.stringify({profile:runtime.config.profileId,evidence:runtime.config.evidenceClass,
      fingerprint:runtime.fingerprint,selectedSlots:runtime.manifest.selectedSlots,sourceHashes,tick:state.tick,phase:job?.phase,maxTravel,sawThrust,section:{pos:section?.pos,vel:section?.vel,rot:section?.rot,mass:section?.mass,nativeRecord:runtime.getSystem('physics')._sg02?.records.has(section?.id),salvagePool:section?.data?.salvagePool},
      native:runtime.getSystem('physics')._diag.backend,registry:runtime.manifest.authoritativeUpdateOrder.map(s=>s.name)}));
    assert.equal(job.phase,'extract');assert.ok(maxTravel>2);assert.ok(sawThrust);
    assert.deepEqual(section.data.salvagePool,{});assert.equal(section.data.salvageAction,undefined);
    assert.equal(runtime.getSystem('physics')._sg02.records.has(section.id),true,'released site body enters layered native dynamic membership');
    assert.equal(state.entityList.find(e=>e.alive&&e.data?.worldRecordId===C.identities.worker).data.ai.passive,true);
    assert.equal(sites.getWorldSite(C.siteId).completedOperations.cut_long_plate_seam.requestStreamId,'ceres-second-measure-cutter');
    const oldSection=section,oldTowId=job.towId;
    const envelope=withProductionFeatures(runtime,()=>runtime.getSystem('save').serialize('ceres-production-mid-tow'));
    assert.equal(withProductionFeatures(runtime,()=>runtime.getSystem('save').loadEnvelope(JSON.parse(JSON.stringify(envelope)),'ceres-production-mid-tow')),true);
    state.mode='flight';state.ui.screenStack=[];await prepareProductionNative(runtime);
    for(let i=0;i<120;i++)runtime.step(DT);
    job=state.npcJobs.ceresWorkfleet;section=state.entityList.find(e=>e.alive&&e.data?.worldRecordId===C.identities.payload);
    assert.notEqual(section,oldSection);assert.equal(job.phase,'extract');assert.equal(job.towId,oldTowId);
    const service=runtime.getSystem('combat').kernel.attachments;
    assert.equal(service.get(oldTowId).state,'active');assert.equal(service.get(oldTowId).targetId,section.id);
    const currentPlayer=state.entities.get(state.playerId);
    const playerLine=withProductionFeatures(runtime,()=>service.create({defId:'tether_standard',ownerId:currentPlayer.id,targetId:section.id}));assert.equal(playerLine.ok,true);
    runtime.step(DT);assert.equal(job.phase,'player-retained');
    assert.equal(service.get(playerLine.attachment.id).state,'active','player attachment remains owned by the player');
    assert.equal(service.get(job.towId).state,'broken','worker yields its own line');
    assert.equal(state.entityList.filter(e=>e.alive&&e.data?.worldRecordId===C.identities.payload).length,1);
    assert.equal(state.entityList.filter(e=>e.alive&&e.data?.ceresWorkfleetRole).length,3);
  }finally{runtime.dispose();}
});

import { salvageActions } from '../src/systems/salvageActions.js';
import { createBus } from '../src/core/eventBus.js';
test('generic salvage annotation never invents commodity rewards for finite structural hardware',()=>{
  const f=operationFixture();f.section.data.persistenceOwner='asteroidSites';f.section.data.salvagePool={};
  const cradle={id:4,...ceresWorkfleetHardwareSpec('cradle')};
  const owner=Object.create(salvageActions);owner.init({state:f.state,bus:createBus(),helpers:{}});
  for(const e of [f.section,f.head,cradle]){assert.equal(owner._annotate(e),null);assert.deepEqual(e.data.salvagePool,{});assert.equal(e.data.salvageAction,undefined);}
  const ordinary={id:5,type:'wreck',alive:true,pos:{x:0,z:0},data:{}};owner._annotate(ordinary);
  assert.ok(Object.values(ordinary.data.salvagePool).some(q=>q>0),'ordinary wreck source remains unchanged');
});
test('hardware Continue preserves player custody and rejects terminal or foreign-owner records',()=>{
  const e={id:80,...ceresWorkfleetHardwareSpec('breaker')};const record=captureEntityRecord(e,{sectorId:C.sectorId});
  record.playerOwned=true;const claimed=spawnSpecFromRecord(record);assert.equal(claimed.playerOwned,true);assert.equal(claimed.data.playerOwned,true);
  for(const change of [r=>r.outcome='defeated',r=>r.outcome='destroyed',r=>r.persistenceOwner='foreign',r=>r.extra={persistenceOwner:'foreign'}]){
    const bad=structuredClone(record);change(bad);assert.equal(spawnSpecFromRecord(bad),null);
  }
});

test('published workfleet thrust clears on expired, cancelled and idle leases',()=>{
  const f=operationFixture();f.job.phase='extract';fixtureCouplings(f);const target=ceresWorkfleetWorldPose(C.route.extraction.breakerTo);
  authorizeCeresBreakerControl(f.breaker,f.state,f.job,target);const control=consumeCeresBreakerControl(f.breaker,f.state);
  assert.ok(control);assert.equal(f.breaker._flightFrame.driveState,'thrust');assert.ok(f.breaker.data.ceresWorkfleetActuation.linearFraction>0);
  f.state.tick++;assert.equal(consumeCeresBreakerControl(f.breaker,f.state),null);assert.equal(f.breaker._flightFrame.driveState,'idle');
  authorizeCeresBreakerControl(f.breaker,f.state,f.job,target);consumeCeresBreakerControl(f.breaker,f.state);
  clearCeresWorkfleetControls(f.state);assert.equal(f.breaker.data.ceresWorkfleetActuation.linearFraction,0);assert.equal(f.head._flightFrame.driveState,'idle');
});


import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { readCeresWorkfleetActuation } from '../src/core/ceresWorkfleetActuation.js';
test('head demand is consumed only by the current pre-physics owner and cannot light from a queued or stale lease',()=>{
  const f=operationFixture(),target={x:f.head.pos.x+10,z:f.head.pos.z,rot:f.head.rot};
  driveCeresWorkfleetBody(f.head,target,{speed:5,accel:8,angularSpeed:.3,angularAccel:.6},f.state);
  assert.equal(consumePhysicsCommand(f.head)?.control??null,null);assert.equal(readCeresWorkfleetActuation(f.head,f.state),null);
  reconcileCeresWorkfleetPresentation({state:f.state});assert.ok(consumePhysicsCommand(f.head)?.control);
  assert.ok(readCeresWorkfleetActuation(f.head,f.state));
  for(const change of [f=>f.state.tick+=2,f=>f.head.occupantGeneration++,f=>f.job.phase='head-disabled',
    f=>f.head.data.playerOwned=true,f=>f.state.render={},
    f=>{f.state.combat.entities={[f.head.id]:{capabilities:{power:false}}};}]) {
    const f=operationFixture();driveCeresWorkfleetBody(f.head,target,{speed:5,accel:8},f.state);change(f);
    reconcileCeresWorkfleetPresentation({state:f.state});assert.equal(consumePhysicsCommand(f.head)?.control??null,null);
    assert.equal(readCeresWorkfleetActuation(f.head,f.state),null);
  }
});

test('damaged or foreign coupling is never reported as player custody and does not mint a replacement',()=>{
  for(const cause of ['subsystem_disabled','physics_break','npc-custody','npc-breaker-custody','player-custody']) {
    const f=operationFixture();f.job.phase='extract';fixtureCouplings(f);f.job.mountId='mount';f.job.towId='tow';
    f.state.sites={worldById:{[C.siteId]:{completedOperations:{brace_long_plate:{}},payloads:{long_plate:{}}}}};
    const cradle={id:4,occupantGeneration:4,...ceresWorkfleetHardwareSpec('cradle')};f.state.entities.set(4,cradle);
    const foreign={id:5,type:'ship',alive:true,data:{worldRecordId:'ambient:salvor'}};f.state.entities.set(5,foreign);
    if(cause==='player-custody')f.state.playerId=5;
    reconcileCeresWorkfleetPresentation({state:f.state});
    const lines=new Map([['mount',f.state.combat.attachments.byId.mount],['tow',f.state.combat.attachments.byId.tow]]);
    if(cause.endsWith('custody'))lines.set('foreign',{id:'foreign',state:'active',ownerId:5,targetId:cause==='npc-breaker-custody'?1:3});
    else Object.assign(lines.get('tow'),{state:'broken',breakReason:cause});
    f.state.combat.attachments.byId=Object.fromEntries(lines);
    const service={get:id=>lines.get(id),listForEntity:id=>[...lines.values()].filter(a=>a.ownerId===id||a.targetId===id),
      cut(id){lines.get(id).state='broken';},create(){assert.fail('lost coupling must not be recreated');}};
    const owner={state:f.state,registry:{get:name=>name==='combat'?{kernel:{attachments:service}}:null}};
    stepCeresWorkfleet(owner,DT);
    assert.equal(f.job.phase,cause.startsWith('npc-')?'extract':cause==='player-custody'?'player-retained':'worker-disabled');
    assert.equal(cause.startsWith('npc-')?f.job.blockedReason:f.job.reason,cause.startsWith('npc-')?'foreign-custody':cause==='player-custody'?'player-retained':`tow-coupling-${cause}`);
    assert.equal(lines.get('tow').state,cause.startsWith('npc-')?'active':'broken');if(cause.endsWith('custody'))assert.equal(lines.get('foreign').state,'active');
    assert.equal(f.state.entities.get(3),f.section);assert.equal(f.section.mass,1800);assert.equal(f.section.alive,true);
    if(cause.startsWith('npc-')) {
      assert.equal(consumeCeresBreakerControl(f.breaker,f.state),null,'snared worker has no consumable propulsion lease');
      lines.get('foreign').state='broken';
      const mounted=ceresWorkfleetPose({...f.breaker.pos,rot:f.breaker.rot},C.assets.breaker.headMountedPose);
      f.head.pos={x:mounted.x,z:mounted.z};f.head.rot=mounted.rot;
      f.section.pos.x+=5;stepCeresWorkfleet(owner,DT);
      assert.equal(f.job.blockedReason,'recovery-pose-outside-route','free but unsafe assembly cannot re-enter a zero-slack corridor');
      f.section.pos.x-=5;stepCeresWorkfleet(owner,DT);
      assert.equal(f.job.phase,'extract');assert.equal(f.job.blockedReason,null);assert.equal(f.breaker.data.ceresWorkfleetSlideDisabled,false);
      assert.ok(consumeCeresBreakerControl(f.breaker,f.state),'measured safe unclaimed assembly resumes with its original line');
    }
    stepCeresWorkfleet(owner,DT);assert.equal(f.job.towId,'tow','job keeps evidence of the original coupling');
  }
});

import { syncCeresWorkfleetActivity } from '../src/systems/ceresWorkfleet.js';
test('activity ownership pins only the live three-body job and never persists or steals a stale pin',()=>{
  const f=operationFixture();const cradle={id:4,occupantGeneration:4,...ceresWorkfleetHardwareSpec('cradle')};f.state.entities.set(4,cradle);
  f.state.sites={worldById:{[C.siteId]:{completedOperations:{brace_long_plate:{}},payloads:{long_plate:{}}}}};
  const owner={state:f.state};syncCeresWorkfleetActivity(owner);
  for(const e of [f.breaker,f.head,cradle])assert.equal(e.data.jobId,f.job.id);
  assert.equal(f.section.data.jobId,undefined,'the site-owned section is not given a foreign activity owner');
  const r=captureEntityRecord(f.breaker,{sectorId:C.sectorId});assert.equal(r.jobId,null);assert.equal(spawnSpecFromRecord(r).data.jobId,undefined);
  f.head.occupantGeneration++;syncCeresWorkfleetActivity(owner);assert.equal(f.head.data.jobId,undefined);syncCeresWorkfleetActivity(owner);assert.equal(f.head.data.jobId,undefined);
  f.breaker.data.jobId='another-job';syncCeresWorkfleetActivity(owner);assert.equal(f.breaker.data.jobId,'another-job');
  clearCeresWorkfleetControls(f.state);assert.equal(cradle.data.jobId,undefined);assert.equal(f.breaker.data.jobId,'another-job');
  f.state.npcJobs.ceresWorkfleet={...f.job};syncCeresWorkfleetActivity(owner);assert.equal(f.head.data.jobId,f.job.id,'restored validated job can acquire a fresh life');
  f.state.npcJobs.ceresWorkfleet.phase='secured';syncCeresWorkfleetActivity(owner);assert.equal(f.head.data.jobId,undefined);assert.equal(cradle.data.jobId,undefined);
});

import { ceresWorkfleetExtractionReady } from '../src/systems/ceresWorkfleet.js';
test('extraction cannot reel a displaced section into the cab back or across a rail',()=>{
  const f=operationFixture(),at=ceresWorkfleetWorldPose(C.route.extraction.breakerTo),goal=ceresWorkfleetWorldPose(C.route.extraction.sectionTo);
  f.breaker.pos={x:at.x,z:at.z};f.breaker.rot=at.rot;f.section.pos={x:goal.x,z:goal.z};
  assert.equal(ceresWorkfleetExtractionReady(f.breaker,f.section),true);
  f.section.pos.z=f.breaker.pos.z-145;assert.equal(ceresWorkfleetExtractionReady(f.breaker,f.section),false,'actual failed factory cab-aft contact is not seating');
  f.section.pos={x:goal.x+5,z:goal.z};assert.equal(ceresWorkfleetExtractionReady(f.breaker,f.section),false);
  f.section.pos={x:goal.x,z:goal.z};f.section.rot=.2;assert.equal(ceresWorkfleetExtractionReady(f.breaker,f.section),false);
});

import { ceresWorkfleetSectionInOpenWell,ceresWorkfleetSeatAlignmentTarget } from '../src/systems/ceresWorkfleet.js';
test('seating re-approach requires the complete original outline and bounded measured staging geometry',()=>{
  const stage=ceresWorkfleetWorldPose(C.route.extraction.breakerTo);
  const breaker={...ceresWorkfleetHardwareSpec('breaker'),pos:{x:stage.x,z:stage.z},rot:stage.rot,vel:{x:0,z:0},angVel:0};
  const at=local=>{const p=ceresWorkfleetPose(stage,local);return {pos:{x:p.x,z:p.z},rot:p.rot,vel:{x:0,z:0},angVel:0};};
  const seated=at(C.assets.breaker.loadPose);assert.equal(ceresWorkfleetSectionInOpenWell(breaker,seated),true);
  const measured=at({x:27.25,z:0,rot:-Math.PI/2-.0246}),before=structuredClone({breaker,measured});
  const target=ceresWorkfleetSeatAlignmentTarget(breaker,measured);assert.ok(target);
  const expected=ceresWorkfleetPose(target,C.assets.breaker.loadPose);
  assert.ok(Math.hypot(expected.x-measured.pos.x,expected.z-measured.pos.z)<1e-8);
  assert.ok(Math.abs(expected.rot-measured.rot)<1e-8);
  assert.deepEqual({breaker,measured},before,'only a force target is returned; neither physical pose is written');
  assert.equal(ceresWorkfleetAtPose(measured,ceresWorkfleetPose({...breaker.pos,rot:breaker.rot},C.assets.breaker.loadPose),{position:1,angle:.006,speed:.5,spin:.03}),false,'unaligned geometry still fails the unchanged final seating test');
  for(const local of [{x:-145,z:0,rot:-Math.PI/2},{x:40,z:0,rot:-Math.PI/2},
    {x:27.25,z:4.01,rot:-Math.PI/2},{x:27.25,z:-4.01,rot:-Math.PI/2},{x:27.25,z:0,rot:-Math.PI/2-.08}]) {
    const section=at(local);assert.equal(ceresWorkfleetSectionInOpenWell(breaker,section),false,JSON.stringify(local));
    assert.equal(ceresWorkfleetSeatAlignmentTarget(breaker,section),null);
  }
  for(const section of [{...measured,vel:{x:.51,z:0}},{...measured,angVel:.031},at({x:28,z:0,rot:-Math.PI/2-.06})])
    assert.equal(ceresWorkfleetSeatAlignmentTarget(breaker,section),null);
  const offset={...breaker,pos:{x:breaker.pos.x+20,z:breaker.pos.z}};
  const remote={...seated,pos:{x:seated.pos.x+20,z:seated.pos.z}};
  assert.equal(ceresWorkfleetSectionInOpenWell(offset,remote),true);
  assert.equal(ceresWorkfleetSeatAlignmentTarget(offset,remote),null,'geometry does not authorize a new remote staging route');
});

import { consumeCeresHeadControl } from '../src/systems/ceresWorkfleet.js';
function seatingAuthorityFixture(){
  const f=operationFixture(),stage=ceresWorkfleetWorldPose(C.route.extraction.breakerTo);
  f.job.phase='seat';f.job.mountId='mount';f.job.towId='tow';
  f.breaker.pos={x:stage.x,z:stage.z};f.breaker.rot=stage.rot;
  const at=ceresWorkfleetPose(stage,{x:27.25,z:0,rot:-Math.PI/2-.0246});f.section.pos={x:at.x,z:at.z};f.section.rot=at.rot;
  const mounted=ceresWorkfleetPose(stage,C.assets.breaker.headMountedPose);f.head.pos={x:mounted.x,z:mounted.z};f.head.rot=mounted.rot;
  const cradle={id:4,occupantGeneration:4,...ceresWorkfleetHardwareSpec('cradle')};f.state.entities.set(4,cradle);
  f.state.sites={worldById:{[C.siteId]:{completedOperations:{brace_long_plate:{}},payloads:{long_plate:{}}}}};
  const rows=f.state.combat.attachments.byId;
  rows.mount={id:'mount',state:'active',ownerId:2,targetId:1,ownerGeneration:2,targetGeneration:1,restLength:.026};rows.tow={id:'tow',state:'active',ownerId:1,targetId:3,ownerGeneration:1,targetGeneration:3,restLength:18};
  const service={get:id=>rows[id],listForEntity:id=>Object.values(rows).filter(a=>a.ownerId===id||a.targetId===id),reel(){},
    cut(id){rows[id].state='broken';},create(){assert.fail('alignment cannot invent an attachment');}};
  f.owner={state:f.state,registry:{get:name=>name==='combat'?{kernel:{attachments:service}}:null}};
  reconcileCeresWorkfleetPresentation(f.owner);return f;
}
test('measured alignment never commands outside, moving or player-controlled cargo',()=>{
  const valid=seatingAuthorityFixture(),before=structuredClone({b:valid.breaker.pos,s:valid.section.pos,h:valid.head.pos});
  stepCeresWorkfleet(valid.owner,DT);const request=consumeCeresBreakerControl(valid.breaker,valid.state);
  assert.ok(request.force.x<0,'the real carrier requests bounded lateral correction');assert.ok(Math.hypot(request.force.x,request.force.z)<=960.000001);
  assert.deepEqual({b:valid.breaker.pos,s:valid.section.pos,h:valid.head.pos},before);assert.equal(valid.section.mass,1800);
  for(const change of [f=>f.section.pos.x+=5,f=>f.section.vel.x=.51]){
    const f=seatingAuthorityFixture();change(f);stepCeresWorkfleet(f.owner,DT);
    assert.equal(f.job.blockedReason,'seating-realignment-clearance');assert.deepEqual(consumeCeresBreakerControl(f.breaker,f.state).force,{x:0,y:0,z:0});
  }
  const claimed=seatingAuthorityFixture();claimed.section.data.playerOwned=true;stepCeresWorkfleet(claimed.owner,DT);
  assert.equal(claimed.job.phase,'player-retained');assert.equal(consumeCeresBreakerControl(claimed.breaker,claimed.state),null);
});
test('alignment flight samples revoke on source ownership, occupant life or incoming custody changes',()=>{
  for(const mutate of [f=>f.breaker.occupantGeneration++,f=>f.head.occupantGeneration++,f=>f.section.occupantGeneration++,
    f=>f.breaker.data.persistenceOwner='foreign',f=>f.head.data.persistenceOwner='foreign',f=>f.section.data.persistenceOwner='foreign',
    f=>f.section.data.playerOwned=true,f=>f.state.entities.set(f.section.id,{...f.section}),
    f=>{f.state.playerId=5;f.state.combat.attachments.byId.player={id:'player',state:'active',ownerId:5,targetId:f.section.id};}]){
    const f=seatingAuthorityFixture();stepCeresWorkfleet(f.owner,DT);mutate(f);
    assert.equal(consumeCeresBreakerControl(f.breaker,f.state),null);assert.equal(consumeCeresHeadControl(f.head,f.state,f.owner),null);
  }
});
test('repeated measured alignment cannot creep its staging reference along with the cargo',()=>{
  const stage=ceresWorkfleetWorldPose(C.route.extraction.breakerTo);
  for(let offset=0;offset<=20;offset++){
    const breaker={pos:{x:stage.x+offset,z:stage.z},rot:stage.rot,vel:{x:0,z:0},angVel:0};
    const at=ceresWorkfleetPose({...breaker.pos,rot:breaker.rot},C.assets.breaker.loadPose);
    const section={pos:{x:at.x,z:at.z},rot:at.rot,vel:{x:0,z:0},angVel:0};
    const target=ceresWorkfleetSeatAlignmentTarget(breaker,section);
    if(offset<=8){assert.ok(target);assert.ok(Math.hypot(target.x-stage.x,target.z-stage.z)<=8);}
    else assert.equal(target,null);
  }
});
