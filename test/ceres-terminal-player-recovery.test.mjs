import test from 'node:test';
import assert from 'node:assert/strict';
import { initialRecoveryWire, restore, pose } from './ceres-reacquire-harness.mjs';
import { CERES_WORKFLEET_CONTRACT as C } from '../src/data/ceresWorkfleet.js';
import { stepCeresWorkfleet, consumeCeresBreakerControl, consumeCeresHeadControl,
  reconcileCeresWorkfleetPresentation } from '../src/systems/ceresWorkfleet.js';
import { planCeresWorkfleetRecovery } from '../src/systems/ceresWorkfleetRecovery.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { createSimulation } from '../src/core/sim.js';
import { world } from '../src/systems/world.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { save } from '../src/save/saveSystem.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';

const DT=1/60,REASON='moving-load-outside-thrust-budget';
const clone=value=>JSON.parse(JSON.stringify(value));
const prior=snapshotFeatureMaps();
test.before(()=>applyFeatureConfigToMaps(PRODUCTION_FEATURES));
test.after(()=>restoreFeatureMaps(prior));

// Measured seed48 full production tick22200, ten ticks before its legitimate
// refusal. Restore these original bodies, advancing only the assessment age to
// 600 ticks. This is a native terminal/handoff regression, not an ambient replay.
function measuredWire() {
  const wire=initialRecoveryWire();wire.tick=22200;wire.simTime=370;
  wire.jobs.ceresWorkfleet.extractionMisalignedSince=21600;
  wire.sites.worldById[C.siteId].payloads.long_plate.motion={
    pos:{x:-12889.171325683594,z:9436.8310546875},vel:{x:-.26475846767425537,z:-1.1483837366104126},
    rot:.4748198338516103,angVel:.00019933767907787114};
  const measured={
    breaker:{pos:{x:-12868.029235839844,z:9341.979614257812},vel:{x:.01754186674952507,z:.01202599797397852},rot:1.5707797710724867,angVel:.000015817238818272017,hull:1674.2271999999998},
    cutterHead:{pos:{x:-12898.043640136719,z:9303.979125976562},vel:{x:.008264931850135326,z:.01155094150453806},rot:1.5707804454165037,angVel:.000015820218322915025,hull:120},
    cradle:{pos:{x:-13138,z:9512},vel:{x:0,z:0},rot:0,angVel:0,hull:2314.584000000001},
  };
  for(const [role,record] of Object.entries(measured))Object.assign(wire.records.byId[C.identities[role==='breaker'?'worker':role]],record);
  return wire;
}
async function refused({coldObserver=false}={}) {
  const h=await restore(measuredWire(),{playerPosition:coldObserver?{x:-11378.603698730469,z:9075.345031738281}:{x:-12689.171325683594,z:9436.8310546875}});
  assert.equal(planCeresWorkfleetRecovery(h.b,h.state.tick).reason,REASON);
  stepCeresWorkfleet(h.owner,DT);
  assert.equal(h.job().phase,'recovery-interrupted');assert.equal(h.job().reason,REASON);
  return h;
}
function playerLine(h,role='section',defId='tether_standard',owner=null) {
  const player=owner||h.state.entities.get(h.state.playerId),target=h.b[role];
  h.physics._sg02.syncFromEntities(h.state.entityList);
  const result=h.service.create({defId,ownerId:player.id,targetId:target.id,
    sourceSocketId:defId==='tether_standard'?'socket_tether_spool':'socket_massline',
    targetSocketId:role==='section'?'socket_tether_anchor':'socket_hull'});
  assert.equal(result.ok,true,result.reason);return result.attachment;
}
function unchanged(h,original,life,before) {
  assert.equal(h.b.section,original);assert.equal(original.occupantGeneration,life);
  assert.equal(original.mass,1800);assert.deepEqual(pose(original),before);
  assert.equal(h.physics._sg02.records.get(original.id).entity,original);
  assert.equal(h.physics._sg02.records.get(original.id).colliders.length,5);
  assert.equal(consumeCeresBreakerControl(h.b.breaker,h.state),null);
  assert.equal(consumeCeresHeadControl(h.b.cutterHead,h.state,h.owner),null);
}

for(const defId of ['tether_standard','attachment_massline'])test(`${defId} takes the original load after a valid refusal without restarting recovery`,async()=>{
  const h=await refused();
  try {
    const original=h.b.section,life=original.occupantGeneration,before=clone(pose(original));
    const line=playerLine(h,'section',defId),rows=Object.keys(h.state.combat.attachments.byId),events=[];
    h.sim.bus.on('ceresWorkfleet:interrupted',event=>events.push(event));
    for(let i=0;i<3;i++)stepCeresWorkfleet(h.owner,DT);
    assert.equal(h.job().phase,'player-retained');assert.equal(h.job().reason,REASON);
    assert.equal(h.service.get(h.job().towId).state,'broken');
    assert.equal(h.service.get(h.job().towId).breakReason,'ceres_yield_player');
    assert.equal(h.service.get(h.job().mountId).state,'active');assert.equal(line.state,'active');
    assert.deepEqual(Object.keys(h.state.combat.attachments.byId),rows);assert.equal(events.length,1);
    assert.equal(h.job().recovery,null);assert.equal(h.b.breaker.data.ceresWorkfleetSlideTarget,0);
    for(const e of Object.values(h.b))assert.equal(e.data.jobId,undefined);
    unchanged(h,original,life,before);
  }finally{h.close();}
});

test('unclaimed refusal remains terminal and permits the unattached cradle to leave native residency',async()=>{
  const h=await refused({coldObserver:true});
  try {
    const original=h.b.section,life=original.occupantGeneration;
    for(let i=0;i<130;i++)h.sim.step();
    assert.equal(h.job().phase,'recovery-interrupted');assert.equal(h.job().reason,REASON);
    assert.equal(h.physics._sg02.records.has(h.b.cradle.id),false);
    assert.equal(h.b.cradle.alive,true);assert.equal(h.b.section,original);assert.equal(original.occupantGeneration,life);
    for(const id of [h.job().towId,h.job().mountId])assert.equal(h.service.get(id).state,'active');
  }finally{h.close();}
});

for(const kind of ['broken','stale-owner','stale-target','missing-owner','foreign-controller','industrial-row','hostile-only','claimed-npc-owner'])test(`terminal handoff rejects ${kind} without releasing a physical coupling`,async()=>{
  const h=await refused();
  try {
    let owner=null;
    if(kind==='hostile-only'||kind==='claimed-npc-owner')owner=h.sim.spawn({type:'ship',team:1,pos:{x:-12689,z:9460},mass:100,radius:6,hull:100,data:kind==='claimed-npc-owner'?{playerOwned:true}:{}});
    const line=playerLine(h,'section','tether_standard',owner);
    if(kind==='broken')h.service.cut(line.id,h.state.playerId,'player-release');
    if(kind==='stale-owner')h.state.entities.get(h.state.playerId).occupantGeneration++;
    if(kind==='stale-target')h.b.section.occupantGeneration++;
    if(kind==='missing-owner')h.state.entities.delete(h.state.playerId);
    if(kind==='foreign-controller')line.controllerId=h.b.breaker.id;
    if(kind==='industrial-row')line.controlMode='ceres_workfleet';
    stepCeresWorkfleet(h.owner,DT);
    assert.equal(h.job().phase,'recovery-interrupted');assert.equal(h.job().reason,REASON);
    assert.equal(h.service.get(h.job().towId).state,'active');assert.equal(h.service.get(h.job().mountId).state,'active');
  }finally{h.close();}
});

test('mixed head claim and hostile section line yield only the claimed head, even without the unrelated cradle',async()=>{
  const h=await refused();
  try {
    const hostile=h.sim.spawn({type:'ship',team:1,pos:{x:-12689,z:9460},mass:100,radius:6,hull:100});
    const foreign=playerLine(h,'section','tether_standard',hostile),player=playerLine(h,'cutterHead');
    h.state.entities.delete(h.b.cradle.id);
    stepCeresWorkfleet(h.owner,DT);
    assert.equal(h.job().phase,'player-retained');assert.equal(h.job().reason,REASON);
    assert.equal(h.service.get(h.job().mountId).state,'broken');assert.equal(h.service.get(h.job().towId).state,'active');
    assert.equal(foreign.state,'active');assert.equal(player.state,'active');
    assert.equal(h.b.breaker.data.ceresWorkfleetSlideDisabled,true,'a claim on the head does not open load shoes');
  }finally{h.close();}
});

test('terminal handoff never cuts a stale or relabeled industrial tow row',async()=>{
  for(const kind of ['stale-owner','stale-target','other-target','foreign-mode']) {
    const h=await refused();
    try {
      const line=playerLine(h),tow=h.service.get(h.job().towId);
      if(kind==='stale-owner')tow.ownerGeneration--;
      if(kind==='stale-target')tow.targetGeneration--;
      if(kind==='other-target')tow.targetId=h.b.cutterHead.id;
      if(kind==='foreign-mode')tow.controlMode='ordinary';
      stepCeresWorkfleet(h.owner,DT);
      assert.equal(h.job().phase,'player-retained');assert.equal(tow.state,'active',kind);assert.equal(line.state,'active');
    }finally{h.close();}
  }
});

for(const firstRole of ['cutterHead','breaker','cradle'])test(`a later section claim after ${firstRole} yields its tow exactly once`,async()=>{
  const h=await refused();
  try {
    const original=h.b.section,life=original.occupantGeneration,before=clone(pose(original)),events=[];
    h.sim.bus.on('ceresWorkfleet:interrupted',event=>events.push(event));
    const first=playerLine(h,firstRole);stepCeresWorkfleet(h.owner,DT);
    assert.equal(h.job().phase,'player-retained');assert.equal(h.service.get(h.job().towId).state,'active');
    const updatedTick=h.job().updatedTick;
    assert.equal(h.service.cut(first.id,h.state.playerId,'player-release').ok,true);
    h.state.tick++;stepCeresWorkfleet(h.owner,DT);
    const second=playerLine(h);h.state.tick++;stepCeresWorkfleet(h.owner,DT);
    assert.equal(second.state,'active');assert.equal(h.service.get(h.job().towId).state,'broken');
    assert.equal(h.service.get(h.job().mountId).state,firstRole==='cutterHead'?'broken':'active');
    assert.equal(h.job().updatedTick,updatedTick);assert.equal(h.job().reason,REASON);assert.equal(events.length,1);
    const worldOwner=h.sim.registry.get('world'),upsert=worldOwner.upsertWorldRecord;let writes=0;
    worldOwner.upsertWorldRecord=function(...args){writes++;return upsert.apply(this,args);};
    for(let i=0;i<4;i++){h.state.tick++;stepCeresWorkfleet(h.owner,DT);}
    assert.equal(writes,0,'unchanged player custody never recaptures hardware');assert.equal(events.length,1);
    assert.equal(h.job().updatedTick,updatedTick);unchanged(h,original,life,before);
  }finally{h.close();}
});

test('actual Continue before and after player recovery preserves refusal, custody and the finite body',async()=>{
  const source=await refused();
  const destination=createSimulation({seed:47,systems:[world,asteroidSites,npcJobsRuntime,save]});
  let physics;
  try {
    const original=source.b.section,originalPose=clone(pose(original));
    const worldOwner=Object.assign(Object.create(world),{state:source.state,bus:source.sim.bus,helpers:source.sim.helpers,registry:source.sim.registry});
    const saver=Object.assign(Object.create(save),{state:source.state,bus:source.sim.bus,helpers:source.sim.helpers,
      registry:{get:name=>name==='world'?worldOwner:source.sim.registry.get(name)}});
    let envelope=saver.serialize('ceres-terminal-player-recovery'),playerLineId;
    const destinationSave=destination.registry.get('save');
    for(let pass=0;pass<2;pass++) {
      assert.equal(destinationSave.loadEnvelope(clone(envelope),'ceres-terminal-player-recovery'),true);
      const state=destination.state;state.mode='flight';state.ui.screenStack=[];
      const finite=state.entityList.filter(e=>e.alive&&Object.values(C.identities).includes(e.data?.worldRecordId));
      assert.equal(finite.length,4);
      const b=Object.fromEntries(finite.map(e=>[e.data.ceresWorkfleetRole||'section',e]));
      assert.notEqual(b.section.occupantGeneration,original.occupantGeneration);
      assert.equal(b.section.mass,1800);assert.deepEqual(pose(b.section),originalPose);
      assert.equal(state.npcJobs.ceresWorkfleet.phase,pass===0?'recovery-interrupted':'player-retained');
      assert.equal(state.npcJobs.ceresWorkfleet.reason,REASON);
      reconcileCeresWorkfleetPresentation({state});
      physics=await createSg02DynamicBodyOwner({publishTelemetry:false,fixedDt:DT});physics.syncFromEntities(state.entityList);
      const service=createAttachmentService({state,catalog:createCombatCatalog(),helpers:{combatPhysics:physics},bus:destination.bus});
      assert.ok(service.reconcilePhysics().recreated>=1);
      const owner={state,bus:destination.bus,registry:{get:name=>name==='combat'?{kernel:{attachments:service}}:destination.registry.get(name)}};
      const h={state,sim:destination,b,physics:{_sg02:physics},service,owner,job:()=>state.npcJobs.ceresWorkfleet};
      if(pass===0) {
        assert.equal(service.get(h.job().towId).state,'active');
        const line=playerLine(h);playerLineId=line.id;
        stepCeresWorkfleet(h.owner,DT);
        assert.equal(service.get(h.job().towId).state,'broken');
      }else assert.equal(service.get(h.job().towId),null);
      for(let i=0;i<3;i++)stepCeresWorkfleet(owner,DT);
      assert.equal(h.job().phase,'player-retained');assert.equal(h.job().reason,REASON);
      const line=service.get(playerLineId);assert.equal(line.state,'active');assert.ok(line.physicsHandle);
      assert.equal(line.ownerId,state.playerId);assert.equal(line.targetId,b.section.id);
      assert.deepEqual(pose(b.section),originalPose);
      assert.equal(physics.records.get(b.section.id).colliders.length,5);
      envelope=destinationSave.serialize('ceres-terminal-player-recovery');physics.dispose();physics=null;
    }
  }finally{physics?.dispose();destination.registry.get('save').destroy();destination.dispose();source.close();}
});

// Additional custody boundaries use the same measured refusal and real native
// attachment service, not a second toy simulation or a relaxed force envelope.
for(const kind of ['dead-player','dead-load','pending-line','missing-player-generation','missing-load-generation'])test(`terminal handoff rejects ${kind} without renewing its stopped job`,async()=>{
  const h=await refused();
  try {
    const line=playerLine(h),player=h.state.entities.get(h.state.playerId);
    if(kind==='dead-player'){player.alive=false;player.hull=0;}
    if(kind==='dead-load'){h.b.section.alive=false;h.b.section.hull=0;}
    if(kind==='pending-line')line.state='pending';
    if(kind==='missing-player-generation')delete player.occupantGeneration;
    if(kind==='missing-load-generation')delete h.b.section.occupantGeneration;
    const updatedTick=h.job().updatedTick;
    stepCeresWorkfleet(h.owner,DT);
    assert.equal(h.job().phase,'recovery-interrupted');assert.equal(h.job().reason,REASON);
    assert.equal(h.job().updatedTick,updatedTick);
    assert.equal(h.service.get(h.job().towId).state,'active');assert.equal(h.service.get(h.job().mountId).state,'active');
  }finally{h.close();}
});

for(const kind of ['disabled','controlLease'])test(`${kind} alone is not player ownership after refusal`,async()=>{
  const h=await refused();
  try {
    h.b.section.data[kind]=kind==='disabled'?true:{ownerId:h.b.breaker.id};
    stepCeresWorkfleet(h.owner,DT);
    assert.equal(h.job().phase,'recovery-interrupted');assert.equal(h.job().reason,REASON);
    assert.equal(h.service.get(h.job().towId).state,'active');assert.equal(h.service.get(h.job().mountId).state,'active');
    assert.equal(consumeCeresBreakerControl(h.b.breaker,h.state),null);
    assert.equal(consumeCeresHeadControl(h.b.cutterHead,h.state,h.owner),null);
  }finally{h.close();}
});

for(const location of ['data','entity'])test(`explicit ${location} ownership recovers the original load without a new rope`,async()=>{
  const h=await refused();
  try {
    const section=h.b.section,life=section.occupantGeneration,before=clone(pose(section));
    (location==='data'?section.data:section).playerOwned=true;
    stepCeresWorkfleet(h.owner,DT);
    assert.equal(h.job().phase,'player-retained');assert.equal(h.job().reason,REASON);
    assert.equal(h.service.get(h.job().towId).state,'broken');assert.equal(h.service.get(h.job().mountId).state,'active');
    assert.equal(h.state.entities.get(section.id),section);
    unchanged(h,section,life,before);
  }finally{h.close();}
});

test('simultaneous owned head and load yield their couplings once without changing any body',async()=>{
  const h=await refused();
  try {
    const bodies=Object.values(h.b).map(entity=>({entity,life:entity.occupantGeneration,mass:entity.mass,before:clone(pose(entity))})),events=[];
    h.sim.bus.on('ceresWorkfleet:interrupted',event=>events.push(event));
    h.b.section.data.playerOwned=true;h.b.cutterHead.data.playerOwned=true;
    stepCeresWorkfleet(h.owner,DT);
    const updatedTick=h.job().updatedTick;
    assert.equal(h.service.get(h.job().towId).breakReason,'ceres_yield_player');
    assert.equal(h.service.get(h.job().mountId).breakReason,'ceres_yield_head');
    for(let i=0;i<8;i++){h.state.tick++;stepCeresWorkfleet(h.owner,DT);}
    assert.equal(events.length,1);assert.equal(h.job().updatedTick,updatedTick);
    assert.equal(h.job().phase,'player-retained');assert.equal(h.job().reason,REASON);
    for(const snapshot of bodies){
      assert.equal(h.state.entities.get(snapshot.entity.id),snapshot.entity);
      assert.equal(snapshot.entity.occupantGeneration,snapshot.life);assert.equal(snapshot.entity.mass,snapshot.mass);
      assert.deepEqual(pose(snapshot.entity),snapshot.before);
    }
    assert.equal(consumeCeresBreakerControl(h.b.breaker,h.state),null);
    assert.equal(consumeCeresHeadControl(h.b.cutterHead,h.state,h.owner),null);
  }finally{h.close();}
});

test('releasing the player rope never resurrects the stopped tow or its deadline',async()=>{
  const h=await refused();
  try {
    const line=playerLine(h);line.controllerId=h.state.playerId;
    stepCeresWorkfleet(h.owner,DT);assert.equal(h.job().phase,'player-retained');
    const updatedTick=h.job().updatedTick,towId=h.job().towId;
    assert.equal(h.service.cut(line.id,h.state.playerId,'player-release').ok,true);
    for(let i=0;i<8;i++){h.state.tick++;stepCeresWorkfleet(h.owner,DT);}
    assert.equal(h.job().phase,'player-retained');assert.equal(h.job().reason,REASON);
    assert.equal(h.job().updatedTick,updatedTick);assert.equal(h.job().towId,towId);
    assert.equal(h.service.get(towId).state,'broken');assert.equal(h.job().recovery,null);
    assert.equal(consumeCeresBreakerControl(h.b.breaker,h.state),null);
    assert.equal(consumeCeresHeadControl(h.b.cutterHead,h.state,h.owner),null);
  }finally{h.close();}
});
