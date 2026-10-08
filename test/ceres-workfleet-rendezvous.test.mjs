import test from 'node:test';
import assert from 'node:assert/strict';
import {initialRecoveryWire,restore,capture} from './ceres-reacquire-harness.mjs';
import {CERES_WORKFLEET_CONTRACT as C,ceresWorkfleetPose as compose} from '../src/data/ceresWorkfleet.js';
import {planCeresWorkfleetRecovery,restoreCeresWorkfleetRecovery,ceresWorkfleetRendezvous,ceresWorkfleetRecoveryClear} from '../src/systems/ceresWorkfleetRecovery.js';
import {consumeCeresBreakerControl,stepCeresWorkfleet,ceresWorkfleetContactRetained,ceresWorkfleetWorldPose} from '../src/systems/ceresWorkfleet.js';
import {PRODUCTION_FEATURES} from '../src/runtime/runtimeProfiles.js';
import {snapshotFeatureMaps,applyFeatureConfigToMaps,restoreFeatureMaps} from '../src/data/featureFlags.js';
import {createAuthoritativeRuntime} from '../src/runtime/createAuthoritativeRuntime.js';
import {makeShipEntitySpec} from '../src/systems/ships.js';
const features=snapshotFeatureMaps();
test.before(()=>applyFeatureConfigToMaps(PRODUCTION_FEATURES));
test.after(()=>restoreFeatureMaps(features));

test('moving original native plate rendezvous seats and returns within its one finite deadline', async () => {
  const h=await restore(initialRecoveryWire({velocity:.1}));
  const original=h.b.section,life=original.occupantGeneration;
  let maximumForce=0,planDeadline=null,seatSnapshot=null;
  const phases=[];
  try {
    const admitted=planCeresWorkfleetRecovery(h.b,h.state.tick).plan;
    assert.equal(admitted.schemaVersion,2,'old absolute-drift planner refused this moving plate');
    assert.ok(restoreCeresWorkfleetRecovery(admitted));
    for(let i=0;i<54000;i++){
      h.sim.step();const job=h.job();
      if(phases.at(-1)!==job.phase)phases.push(job.phase);
      if(job.recovery){planDeadline??=job.recovery.deadlineTick;assert.equal(job.recovery.deadlineTick,planDeadline);}
      const f=h.physics._sg02.records.get(h.b.breaker.id)?.controlForce;
      maximumForce=Math.max(maximumForce,Math.hypot(f?.x||0,f?.z||0));
      if(job.phase==='recover_seat'&&!seatSnapshot)seatSnapshot=capture(h);
      if(['loaded','recovery-interrupted','worker-disabled','head-disabled'].includes(job.phase))break;
    }
    console.log('CERES_RENDEZVOUS',JSON.stringify({phase:h.job().phase,tick:h.state.tick,reason:h.job().reason,phases,maximumForce,plan:h.job().recovery,section:{pos:original.pos,vel:original.vel,rot:original.rot}}));
    assert.equal(h.job().phase,'loaded',JSON.stringify(h.job()));
    assert.equal(h.b.section,original);assert.equal(original.occupantGeneration,life);
    assert.equal(original.mass,1800);assert.equal(h.physics._sg02.records.get(original.id).body.mass(),1800);
    assert.equal(h.physics._sg02.records.get(original.id).colliders.length,5);
    assert.ok(maximumForce<=.3*3200+1e-5);assert.ok(h.state.tick<=planDeadline);
    assert.ok(ceresWorkfleetContactRetained(h.b.breaker,original,h.state,'breaker'));
    assert.ok(seatSnapshot);
  } finally {h.close();}
  const resumed=await restore(seatSnapshot);
  try {
    assert.equal(resumed.job().recovery.deadlineTick,planDeadline);
    for(let i=0;i<54000&& !['loaded','recovery-interrupted'].includes(resumed.job().phase);i++)resumed.sim.step();
    assert.equal(resumed.job().phase,'loaded',JSON.stringify(resumed.job()));
    assert.equal(resumed.job().recovery.deadlineTick,planDeadline);
    assert.equal(resumed.b.section.mass,1800);
  } finally {resumed.close();}
});

test('moving-mouth authority and stale consumed motion refuse without parking or renewing the load', async () => {
  const h=await restore(initialRecoveryWire({velocity:.1}));
  try {
    const plan=planCeresWorkfleetRecovery(h.b,h.state.tick).plan;
    assert.ok(plan);const before={pos:{...h.b.section.pos},vel:{...h.b.section.vel}};
    h.b.section.angVel=.01;
    assert.equal(ceresWorkfleetRendezvous(h.b,plan,'recover_approach',h.state.tick).reason,'moving-load-outside-thrust-budget');
    assert.deepEqual({...h.b.section.pos},before.pos);assert.deepEqual({...h.b.section.vel},before.vel);
    h.b.section.angVel=0;
    for(let i=0;i<605;i++)h.sim.step();
    assert.ok(['recover_turn','recover_approach'].includes(h.job().phase),JSON.stringify(h.job()));
    const deadline=h.job().recovery.deadlineTick;
    stepCeresWorkfleet(h.owner,1/60);
    h.b.section.angVel=.01;
    assert.equal(consumeCeresBreakerControl(h.b.breaker,h.state),null);
    assert.equal(h.job().recovery.deadlineTick,deadline);
    assert.equal(h.b.section.mass,1800);
  } finally {h.close();}
});

test('native prediction refuses a legal slow rotation that closes the actual mouth before the next segment',async()=>{
  const wire=initialRecoveryWire({spin:.002});
  const stage=ceresWorkfleetWorldPose(C.route.extraction.breakerTo);
  const plate=compose(stage,{...C.assets.breaker.loadPose,z:C.assets.breaker.loadPose.z+5.95});
  wire.sites.worldById[C.siteId].payloads.long_plate.motion.pos={x:plate.x,z:plate.z};
  const h=await restore(wire);
  try {
    const from={...h.b.breaker.pos,rot:h.b.breaker.rot};
    const now=ceresWorkfleetRecoveryClear(h.physics._sg02,h.state,h.b,from,from);
    const next=ceresWorkfleetRecoveryClear(h.physics._sg02,h.state,h.b,from,from,{movingSeconds:1});
    assert.equal(now.ok,true,JSON.stringify(now));
    assert.equal(next.ok,false,'current-pose-only clearance would admit this rotating collision');
    assert.equal(next.blocker,C.identities.payload);
    assert.equal(h.b.section.angVel,.002,'query never damps the rotating load');
  }finally{h.close();}
});

test('seed49 production route recovers its naturally moving plate without parking or replacing it', async () => {
  const runtime=createAuthoritativeRuntime({profileId:'production',nodeSafeOnly:true,seed:49});
  const state=runtime.state,phaseTicks=[];
  const external=fn=>{const prior=snapshotFeatureMaps();applyFeatureConfigToMaps(runtime.config.features);try{return fn();}finally{restoreFeatureMaps(prior);}};
  let deadline=null,sawMovingRecovery=false;
  try {
    state.mode='flight';state.ui.screenStack=[];
    const player=external(()=>runtime.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:state.player,pos:{x:0,z:0}})));
    state.playerId=player.id;
    const world=runtime.getSystem('world');external(()=>world.enterSector(C.sectorId));
    external(()=>world.relocatePlayerInSector({x:C.sitePlacement.pos.x-600,z:C.sitePlacement.pos.z-160,heading:-Math.PI/2},{reason:'ceres-rendezvous'}));
    const sites=runtime.getSystem('asteroidSites'),original=state.entityList.find(e=>e.alive&&e.data?.worldRecordId===C.identities.payload);
    assert.ok(original);const life=original.occupantGeneration;
    const prior=snapshotFeatureMaps();applyFeatureConfigToMaps(runtime.config.features);
    try {assert.equal(await runtime.getSystem('physics').prepareBackend(state),true);}finally{restoreFeatureMaps(prior);}
    assert.equal(external(()=>sites.applyWorldSiteBeamOperation({siteId:C.siteId,componentId:'long_plate_clamp',verb:'repair',amount:24,
      requestStreamId:'player-industrial-beam',requestSequence:state.tick})).ok,true);
    const route=[[-600,-950],[1600,-950],[2200,-950],[2200,-100],[1400,-100],[1400,-950]].map(([x,z])=>({x:x+C.sitePlacement.pos.x,z:z+C.sitePlacement.pos.z}));
    let routeIndex=-1,lastPhase=null;
    for(let i=0;i<85000;i++){
      runtime.step(1/60);const job=state.npcJobs?.ceresWorkfleet,phase=job?.phase;
      if(phase!==lastPhase){phaseTicks.push([state.tick,phase]);lastPhase=phase;console.log('CERES_NATURAL_PHASE',state.tick,phase,job?.blockedReason||'');}
      if(job?.recovery?.schemaVersion===2){
        sawMovingRecovery=true;deadline??=job.recovery.deadlineTick;assert.equal(job.recovery.deadlineTick,deadline);
      }
      if(routeIndex<0&&phase==='extract')routeIndex=0;
      if(routeIndex>=0&&(!state.nav.autopilot?.active||state.nav.autopilot?.label!=='Ceres observation route')){
        external(()=>runtime.bus.emit('ui:setCourse',{pos:route[routeIndex],label:'Ceres observation route',arrivalRadius:36,autopilot:true}));
        routeIndex=routeIndex===route.length-1?2:routeIndex+1;
      }
      if(state.tick%12000===0)console.log('CERES_NATURAL_PROGRESS',state.tick,phase);
      if(['secured','recovery-interrupted','section-destroyed','player-retained','worker-disabled','head-disabled'].includes(phase)||state.mode!=='flight')break;
    }
    const job=state.npcJobs.ceresWorkfleet;
    console.log('CERES_NATURAL_RESULT',JSON.stringify({tick:state.tick,phase:job.phase,reason:job.reason,phaseTicks,sawMovingRecovery,deadline,
      section:{id:original.id,mass:original.mass,pos:original.pos,vel:original.vel,angVel:original.angVel}}));
    assert.equal(job.phase,'secured',JSON.stringify(job));
    assert.equal(sawMovingRecovery,true,'a quiet successful route does not exercise the repaired moving capture');
    assert.equal(state.entities.get(original.id),original);assert.equal(original.occupantGeneration,life);assert.equal(original.mass,1800);
    assert.equal(runtime.getSystem('physics')._sg02.records.get(original.id).body.mass(),1800);
    assert.equal(sites.getWorldSite(C.siteId).payloads.long_plate.retained.receiverWorldRecordId,C.identities.cradle);
  } finally {runtime.dispose();}
});
