import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthoritativeRuntime} from '../src/runtime/createAuthoritativeRuntime.js';
import {makeShipEntitySpec} from '../src/systems/ships.js';
import {domKeyEvent} from '../src/systems/input.js';
import {spawnSpecFromRecord} from '../src/world/worldRecords.js';
import {initialRecoveryWire} from './ceres-reacquire-harness.mjs';
import {CERES_WORKFLEET_CONTRACT as C} from '../src/data/ceresWorkfleet.js';
import {ceresWorkfleetWorldPose,reconcileCeresWorkfleetPresentation} from '../src/systems/ceresWorkfleet.js';
import {applyFeatureConfigToMaps, snapshotFeatureMaps, restoreFeatureMaps} from '../src/data/featureFlags.js';
const clone=v=>JSON.parse(JSON.stringify(v));
// The original plate and Class IV are staged prerequisites, not an earned-route claim.
// After fixture initialization the pilot uses raw F/W/A/D and offered winch actions;
// no body pose, velocity, mass, or class is overwritten to produce the swing.
test('staged Class IV native swing transfers and survives full Continue with both lines', async t => {
  const features = snapshotFeatureMaps();
  let rt;
  try {
    const wire=initialRecoveryWire();
    rt=createAuthoritativeRuntime({profileId:'production',nodeSafeOnly:true,seed:47});
    applyFeatureConfigToMaps(rt.config.features);
    const s=rt.state;s.mode='flight';s.run.kind='adventure';s.ui.screenStack=[];
    const cradle=ceresWorkfleetWorldPose({x:-200,z:-365,rot:0});
    wire.jobs.ceresWorkfleet.phase='player-retained';wire.jobs.ceresWorkfleet.towId=null;wire.jobs.ceresWorkfleet.mountId=null;
    wire.sites.worldById[C.siteId].payloads.long_plate.motion={pos:{x:cradle.x,z:cradle.z},vel:{x:0,z:0},rot:0,angVel:0};
    s.world.currentSectorId=C.sectorId;s.world.records=clone(wire.records);
    const ships=rt.getSystem('ships');ships.newGame();
    const p=rt.spawn(makeShipEntitySpec('ship_pelican',{isPlayer:true,player:s.player,team:0,pos:{x:cradle.x,z:cradle.z-120},fittings:[]}));s.playerId=p.id;
    s.lineProgression={schemaVersion:1,tonnageLoggedT:80000,classIndex:4,grantedClassSteps:0,trialClassSteps:0,highestHeldMassT:1800,recordStamps:[],stamps:{},winchHeat:0};
    const sites=rt.getSystem('asteroidSites');sites.deserialize(clone(wire.sites));sites._syncWorldSites();
    for(const record of Object.values(s.world.records.byId))rt.spawn(spawnSpecFromRecord(record));
    rt.getSystem('npcJobsRuntime').deserialize(clone(wire.jobs));
    const physics=rt.getSystem('physics');await physics.prepareBackend(s);reconcileCeresWorkfleetPresentation({state:s});
    const input=rt.getSystem('input'),step=n=>{for(let i=0;i<n;i++)rt.step(1/60);};
    const plate=()=>s.entityList.find(e=>e.alive&&e.data?.worldRecordId===C.identities.payload);
    const key=(code,pressed)=>domKeyEvent(input,{code,pressed,blocked:false,repeat:false});
    input.ingestLaneDomEvent({type:'viewport',width:640,height:480});
    step(3);
    input.ingestLaneDomEvent({type:'mousemove',clientX:320,clientY:240,movementX:1,movementY:0});
    input.ingestLaneDomEvent({type:'cursorProjection',x:plate().pos.x,z:plate().pos.z});step(2);
    
    key('KeyF',true);step(1);key('KeyF',false);step(12);
    assert.equal(s.player.tether.active,true);assert.equal(s.player.tether.targetId,plate().id);
    const action=name=>{const offer=s.ceresWinchingOffer;assert.ok(offer?.choices.some(c=>c.id===name&&!c.disabled),JSON.stringify({name,offer}));rt.bus.emit('ceresWinching:action',{action:name,offerId:offer.id,playerLife:offer.playerLife});};
    action('anchor:0');assert.equal(s.npcJobs.ceresAnchorSwing.anchorIndex,0);
    const service=rt.getSystem('combat').kernel.attachments, id=s.npcJobs.ceresAnchorSwing.lineId;
    assert.ok(service.get(id));
    const pose=e=>({x:e.pos.x,z:e.pos.z,vx:e.vel.x,vz:e.vel.z,rot:e.rot,angVel:e.angVel});
    const start=pose(plate()), anchor=()=>s.entities.get(service.get(id).ownerId);
    const anchorStart=pose(anchor());
    action('close');key('KeyW',true);
    for(let i=0;i<1800;i++) {
      const a=anchor(), l=plate(), player=s.entities.get(s.playerId);
      const bearing=Math.atan2(l.pos.z-a.pos.z,l.pos.x-a.pos.x), desired=bearing+Math.PI/2;
      const err=Math.atan2(Math.sin(desired-player.rot),Math.cos(desired-player.rot));
      key('KeyD',err>.04);key('KeyA',err<-.04);step(1);
    }
    key('KeyW',false);key('KeyD',false);key('KeyA',false);step(3);
    assert.deepEqual(pose(anchor()),anchorStart);
    const moved = Math.hypot(plate().pos.x-start.x,plate().pos.z-start.z);
    const sweep = s.npcJobs.ceresAnchorSwing.sweeps[0];
    assert.ok(moved > 100, `Native original movement ${moved} WU must exceed 100`);
    assert.ok(sweep >= 1.2, `Observed sweep ${sweep} rad must reach 1.2`);
    assert.equal(s.player.tether.active, true);
    assert.equal(s.player.tether.targetId, plate().id);
    action('controls');action('anchors');
    const transferPose = pose(plate());
    action('anchor:1');assert.deepEqual(pose(plate()), transferPose, 'Transfer preserves instantaneous original motion');assert.equal(s.npcJobs.ceresAnchorSwing.anchorIndex,1);assert.equal(s.npcJobs.ceresAnchorSwing.lineId,id);
    const saver=rt.getSystem('save'), before=pose(plate()), length=service.get(id).restLength;
    const envelope=clone(saver.serialize('ceres-anchor-native-swing'));
    assert.equal(saver.loadEnvelope(envelope,'ceres-anchor-native-swing'),true);
    s.mode='flight';s.ui.docked=false;s.ui.screenStack=[];sites._syncWorldSites(C.sectorId);await physics.prepareBackend(s);reconcileCeresWorkfleetPresentation({state:s});
    const restored=rt.getSystem('combat').kernel.attachments;
    assert.ok(restored.get(id));assert.equal(restored.get(id).restLength,length);assert.deepEqual(pose(plate()),before);
    assert.ok(Object.values(s.combat.attachments.byId).some(a=>a.state==='active'&&a.ownerId===s.playerId&&a.targetId===plate().id&&a.defId==='tether_standard'));
    step(18);const castoff=pose(plate());action('release');assert.equal(restored.get(id).state,'broken');assert.deepEqual(pose(plate()),castoff);
    t.diagnostic(`Native staged swing ${sweep.toFixed(5)} rad; original moved ${moved.toFixed(2)} WU; transferred/restored anchor length ${length.toFixed(5)} WU; both lines and cast-off momentum preserved.`);
  } finally {
    try { rt?.dispose(); } finally { restoreFeatureMaps(features); }
  }
});
