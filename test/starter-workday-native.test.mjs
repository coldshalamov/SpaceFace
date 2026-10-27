import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { snapshotFeatureMaps, restoreFeatureMaps, applyFeatureConfigToMaps } from '../src/data/featureFlags.js';
import { domKeyEvent } from '../src/systems/input.js';
import { starterBuoySpec, registerStarterBuoyTow, isOriginalStarterBuoyTow } from '../src/missions/starterWorkday.js';
import { packagedPropSpec } from '../src/render/visualOverrides.js';
import { authoredPrewarmRequestsForEntities } from '../src/render/partsLibrary.js';

for (const starterStep of [1,2,3]) test(`Pelican starter ${starterStep} sustains native winching and recovers its original buoy after a broken line`, async () => {
  const flags=snapshotFeatureMaps();
  const runtime=createAuthoritativeRuntime({profileId:'production',nodeSafeOnly:true,seed:73319});
  applyFeatureConfigToMaps(runtime.config.features);
  try {
    const s=runtime.state,ships=runtime.getSystem('ships'),world=runtime.getSystem('world'),missions=runtime.getSystem('missions'),physics=runtime.getSystem('physics'),save=runtime.getSystem('save'),input=runtime.getSystem('input');
    s.mode='flight';s.ui.screenStack=[];
    ships.newGame();
    // Scenario profile: a legitimately equipped Pelican after two earlier jobs. This
    // fixture tests the normal third offer/accept owner, not hull purchase or prior rewards.
    s.player.ownedShips[0].defId='ship_pelican';
    s.player.ownedShips[0].fittings=ships.fittingsFromDefaults('ship_pelican',['mod_winch_hd','mod_thruster_stock_s']);
    const player=runtime.spawn(makeShipEntitySpec('ship_pelican',{isPlayer:true,player:s.player,team:0,pos:{x:0,z:0}}));s.playerId=player.id;
    world.enterSector('sector_helios_prime');
    s.missions.starterJobStep={...s.missions.starterJobStep,starter_pelican:starterStep-1};
    const board=missions.ensureBoard('station_helios');
    const offer=board.slots.find(m=>m.params?.starterJobId==='starter_pelican'&&m.params.starterStep===starterStep);
    assert.ok(offer,'ordinary board posts the next Pelican job');assert.equal(offer.params.starterWorkdayVersion,1);
    assert.equal(missions.acceptMission(offer.id),true);
    const mission=s.missions.active.find(m=>m.params?.starterJobId==='starter_pelican'&&m.params.starterStep===starterStep);
    assert.ok(mission);missions._ensureMissionTargets(mission);
    const buoy=s.entities.get(mission.targetEntityIds[0]);
    assert.ok(buoy?.alive);assert.equal(buoy.type,'payload');assert.equal(buoy.data.physicalRole,'slag_core');
    assert.equal(buoy.data.packagedPropFile,'places/place_lane_beacon.glb');const expectedMass=[40,65,90][starterStep-1];assert.equal(buoy.mass,expectedMass);
    const visual=packagedPropSpec(buoy);assert.ok(visual,'actual packaged-prop owner admits the mission payload');
    const prewarm=authoredPrewarmRequestsForEntities([buoy],{assetMode:'release',sectorId:'sector_helios_prime'});
    assert.ok(prewarm.some(p=>String(p.url).endsWith('/places/place_lane_beacon.glb')),'actual visible-body prewarm admits the same beacon');
    const station=s.entityList.find(e=>e.alive&&e.data?.stationId==='station_helios');
    const distance=Math.hypot(buoy.pos.x-station.pos.x,buoy.pos.z-station.pos.z);
    const outward={x:(buoy.pos.x-station.pos.x)/distance,z:(buoy.pos.z-station.pos.z)/distance};
    world.relocatePlayerInSector({x:buoy.pos.x+outward.x*130,z:buoy.pos.z+outward.z*130,heading:Math.atan2(-outward.z,-outward.x)},{reason:'starter-native-initial-player'});
    assert.equal(await physics.prepareBackend(s),true);
    const step=n=>{for(let i=0;i<n;i++)runtime.step(1/60);};step(3);
    const native=physics._sg02.records.get(buoy.id);assert.equal(native.entity,buoy);assert.equal(native.body.isDynamic(),true);assert.ok(Math.abs(native.body.mass()-expectedMass)<0.001);
    const denied=[];runtime.bus.on('tether:latchDenied',p=>denied.push(p));
    const key=(code,pressed)=>domKeyEvent(input,{code,pressed,blocked:false,repeat:false});
    input.ingestLaneDomEvent({type:'mousemove',clientX:320,clientY:240,movementX:1,movementY:0});
    input.ingestLaneDomEvent({type:'cursorProjection',x:buoy.pos.x,z:buoy.pos.z});step(2);
    key('KeyF',true);step(1);key('KeyF',false);step(18);
    console.log('LATCH_STATE',JSON.stringify({step:starterStep,active:s.player.tether.active,target:s.player.tether.targetId,denied}));
    assert.equal(s.player.tether.active,true,'ordinary F admits the native mission payload');assert.equal(s.player.tether.targetId,buoy.id);
    const start={x:buoy.pos.x,z:buoy.pos.z},beforeVelocity={x:buoy.vel.x,z:buoy.vel.z};key('BracketLeft',true);step(60);key('BracketLeft',false);
    assert.equal(s.player.tether.targetId,buoy.id);assert.ok(Math.hypot(buoy.pos.x-start.x,buoy.pos.z-start.z)>0.05,'real native motion occurs while attached');
    const towDelta=(buoy.vel.x-beforeVelocity.x)*outward.x+(buoy.vel.z-beforeVelocity.z)*outward.z;
    assert.ok(towDelta>0.05,`native winch must accelerate authored mass toward the player, measured ${towDelta}`);
    const attachmentId=s.player.tether.attachmentId;
    const kernel=runtime.getSystem('actions')?.kernel||runtime.getSystem('combat')?.kernel;
    // Fault injection through the real attachment/physics owner, not a fabricated event.
    // This verifies recovery after a physics break; it does not claim a natural overload.
    assert.equal(kernel.attachments.breakAttachment(attachmentId,'physics_break',s.playerId).ok,true);
    step(3);assert.equal(s.player.tether.active,false);assert.equal(buoy.alive,true);assert.equal(mission.status,'active');
    step(60);assert.equal(s.rockCore.tier,0,'the broken line grants no global tier');
    input.ingestLaneDomEvent({type:'cursorProjection',x:buoy.pos.x,z:buoy.pos.z});step(2);
    key('KeyF',true);step(1);key('KeyF',false);step(18);
    assert.equal(s.player.tether.active,true);assert.equal(s.player.tether.targetId,buoy.id,'same original body can be caught again');
    console.log('NATIVE_STARTER_FORCE',JSON.stringify({step:starterStep,mass:expectedMass,towDelta,attachmentId,recoveredAttachmentId:s.player.tether.attachmentId}));
    if(starterStep!==3)return;

    assert.equal(runtime.getSystem('combat').onHit({targetId:buoy.id,ownerId:s.playerId,damage:17,damageType:'kinetic',pos:{...buoy.pos}}).ok,true);
    assert.ok(buoy.hull>0&&buoy.hull<buoy.hullMax);
    const credits=s.player.credits,awards=[];runtime.bus.on('economy:grantCredits',p=>awards.push(p));
    const envelope=save.serialize('starter-buoy-native');assert.ok(envelope);
    const remembered={recordId:buoy.data.worldRecordId,identity:buoy.data.identityKey,pos:{...buoy.pos},vel:{...buoy.vel},rot:buoy.rot,angVel:buoy.angVel,hull:buoy.hull,hullMax:buoy.hullMax};
    assert.ok(remembered.recordId);
    assert.equal(save.loadEnvelope(envelope),true);
    const restoredMission=s.missions.active.find(m=>m.id===mission.id);assert.ok(restoredMission);missions._ensureMissionTargets(restoredMission);
    const copies=s.entityList.filter(e=>e.alive&&e.data?.worldRecordId===remembered.recordId);assert.equal(copies.length,1);
    const restored=copies[0];assert.equal(restored.type,'payload');assert.equal(restored.data.identityKey,remembered.identity);assert.equal(restored.hull,remembered.hull);assert.equal(restored.hullMax,remembered.hullMax);
    assert.ok(Math.hypot(restored.pos.x-remembered.pos.x,restored.pos.z-remembered.pos.z)<0.001);assert.deepEqual({...restored.vel},remembered.vel);assert.equal(restored.rot,remembered.rot);assert.equal(restored.angVel,remembered.angVel);
    assert.equal(await physics.prepareBackend(s),true);
    assert.ok(Math.abs(physics._sg02.records.get(restored.id).body.mass()-90)<0.001);
    missions._adoptLiveMissionTargets(restoredMission);missions._ensureMissionTargets(restoredMission);
    if(!s.player.tether?.active){
      input.ingestLaneDomEvent({type:'mousemove',clientX:320,clientY:240,movementX:1,movementY:0});
      input.ingestLaneDomEvent({type:'cursorProjection',x:restored.pos.x,z:restored.pos.z});step(2);key('KeyF',true);step(1);key('KeyF',false);step(18);
    }
    assert.equal(s.player.tether.active,true);assert.equal(s.player.tether.targetId,restored.id,'real line reacquires the same durable body');
    assert.deepEqual(restoredMission.targetEntityIds,[restored.id]);assert.equal(s.player.credits,credits);assert.equal(awards.length,0);
    assert.equal(s.entityList.filter(e=>e.alive&&(e.data?.missionTag===mission.id||e.data?.missionId===mission.id)&&e.data?.physicalRole==='slag_core').length,1);
    console.log('NATIVE_STARTER_CONTINUE',JSON.stringify({mass:90,moved:Math.hypot(remembered.pos.x-start.x,remembered.pos.z-start.z),hull:remembered.hull,recordId:remembered.recordId,bodyCopies:copies.length,rewardEvents:awards.length}));
  } finally {runtime.dispose();restoreFeatureMaps(flags);}
});


test('starter recovery exception refuses generic, failed, foreign and recycled occupants', () => {
  const mission={id:'known-starter',status:'active',type:'tow_recovery',destSectorId:'sector_helios_prime',targetEntityIds:[1],params:{starterJobId:'starter_pelican',starterStep:1,starterWorkdayVersion:1,requiredModule:'mod_winch_hd'}};
  const entity={...starterBuoySpec(mission,p=>({...p})),id:1,alive:true,occupantGeneration:7,homeSectorId:'sector_helios_prime'};
  Object.assign(entity.data,{physicalRole:'slag_core',missionId:mission.id,missionTargetSlot:0,worldRecordId:'known-record',identityKey:`mission:${mission.id}:0`});
  const state={entities:new Map([[1,entity]]),world:{currentSectorId:'sector_helios_prime'},missions:{active:[mission]},player:{ownedShips:[{defId:'ship_pelican',fittings:['mod_winch_hd']}],activeShipIndex:0}};
  assert.equal(registerStarterBuoyTow(state,entity,mission),true);assert.equal(isOriginalStarterBuoyTow(state,entity),true);
  mission.status='failed';assert.equal(isOriginalStarterBuoyTow(state,entity),false);mission.status='active';
  state.world.currentSectorId='sector_ceres_belt';assert.equal(isOriginalStarterBuoyTow(state,entity),false);state.world.currentSectorId='sector_helios_prime';
  entity.data.starterWorkdayVersion=2;assert.equal(isOriginalStarterBuoyTow(state,entity),false);entity.data.starterWorkdayVersion=1;
  const successor={...entity,occupantGeneration:8,data:{...entity.data}};state.entities.set(1,successor);
  assert.equal(isOriginalStarterBuoyTow(state,entity),false);assert.equal(isOriginalStarterBuoyTow(state,successor),false);
  state.entities.set(1,entity);entity.occupantGeneration=8;assert.equal(isOriginalStarterBuoyTow(state,entity),false);entity.occupantGeneration=7;
  const identity=entity.data.identityKey;entity.data.identityKey='foreign';assert.equal(isOriginalStarterBuoyTow(state,entity),false);entity.data.identityKey=identity;
  const fitting=state.player.ownedShips[0].fittings;state.player.ownedShips[0].fittings=[];assert.equal(isOriginalStarterBuoyTow(state,entity),false);state.player.ownedShips[0].fittings=fitting;
  const generic={...entity,id:2,data:{...entity.data}};state.entities.set(2,generic);assert.equal(isOriginalStarterBuoyTow(state,generic),false);
  assert.equal(isOriginalStarterBuoyTow(state,entity),true);
});
