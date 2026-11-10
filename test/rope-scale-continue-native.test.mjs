import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { snapshotFeatureMaps, restoreFeatureMaps, applyFeatureConfigToMaps } from '../src/data/featureFlags.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { domKeyEvent } from '../src/systems/input.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { physicalMassT, registerMassScaleTow, isOriginalMassScaleTow } from '../src/systems/cargoCustody.js';
import { createSimulation } from '../src/core/sim.js';

test('Rope recovery admission rejects recycled, failed, foreign and non-original bodies', () => {
  const r=createSimulation({seed:4242});
  try {
    const s=r.state,mission={id:'audit-original',sourceOfferId:'eco_mass_scale_weight_audit_station_helios',type:'tow_recovery',status:'active',destStationId:'station_helios',params:{massDeclaration:{version:1,kind:'weight_audit',declaredMassT:20,targetSlot:0}},targetEntityIds:[]};
    s.missions.active=[mission];
    const original=r.spawn({type:'asteroid',radius:16,mass:40,hull:100,hullMax:100,data:{physicalRole:'slag_core',missionId:mission.id,missionTag:mission.id,missionTargetSlot:0,identityKey:`mission:${mission.id}:0`,worldRecordId:'original-audit-record'}});mission.targetEntityIds=[original.id];
    assert.equal(isOriginalMassScaleTow(s,original),false,'saved fields alone do not grant admission');
    assert.equal(registerMassScaleTow(s,original,mission),true);assert.equal(isOriginalMassScaleTow(s,original),true);
    mission.status='failed';assert.equal(isOriginalMassScaleTow(s,original),false);mission.status='active';
    mission.sourceOfferId='foreign-contract';assert.equal(isOriginalMassScaleTow(s,original),false);mission.sourceOfferId='eco_mass_scale_weight_audit_station_helios';
    mission.params.massDeclaration.version=2;assert.equal(isOriginalMassScaleTow(s,original),false);mission.params.massDeclaration.version=1;
    original.data.worldRecordId='foreign-record';assert.equal(isOriginalMassScaleTow(s,original),false);original.data.worldRecordId='original-audit-record';
    const replacement=r.spawn({type:'asteroid',radius:16,mass:40,hull:100,data:{...original.data}}),replacementId=replacement.id;
    assert.equal(isOriginalMassScaleTow(s,replacement),false,'non-original live body with copied data');
    s.entities.delete(replacementId);replacement.id=original.id;s.entities.set(original.id,replacement);
    assert.equal(isOriginalMassScaleTow(s,original),false,'old object no longer occupies the ID');
    assert.equal(isOriginalMassScaleTow(s,replacement),false,'a recycled ID has no original lease');
    s.entities.set(original.id,original);replacement.id=replacementId;s.entities.set(replacementId,replacement);
    const generic=r.spawn({type:'asteroid',radius:16,mass:40,hull:100,data:{}});assert.equal(registerMassScaleTow(s,generic,mission),false);assert.equal(isOriginalMassScaleTow(s,generic),false);
    mission.targetEntityIds=[];assert.equal(isOriginalMassScaleTow(s,original),false,'withdrawn original is not current mission custody');
  } finally {r.dispose();}
});

test('published Rope original moving core survives full Continue and earns only fresh native dwell', async () => {
  const flags=snapshotFeatureMaps(),r=createAuthoritativeRuntime({profileId:'production',nodeSafeOnly:true,seed:4242});
  applyFeatureConfigToMaps(r.config.features);
  try {
    const s=r.state,ships=r.getSystem('ships'),world=r.getSystem('world'),mis=r.getSystem('missions'),physics=r.getSystem('physics'),save=r.getSystem('save'),input=r.getSystem('input'),telemetry=r.getSystem('masslineTelemetry');
    s.mode='flight';s.ui.screenStack=[];ships.newGame();s.onboarding={active:false,finished:true};
    const player=r.spawn(makeShipEntitySpec(NEW_GAME.shipId,{isPlayer:true,player:s.player,team:0,fittings:ships.fittingsFromDefaults(NEW_GAME.shipId,NEW_GAME.fittedModules||[]),pos:{x:0,z:0}}));s.playerId=player.id;s.player.credits=1000000;
    world.enterSector('sector_helios_prime');
    const offerId='eco_mass_scale_weight_audit_station_helios';
    for(let i=0;i<4;i++){
      r.bus.emit('dock:docked',{stationId:'station_helios'});
      if(s.missions.boards?.station_helios?.slots?.some(row=>row?.id===offerId))break;
    }
    assert.equal(mis.acceptMission(offerId),true,'ordinary Helios offer accepts');
    let mission=s.missions.active.find(m=>m.sourceOfferId===offerId);assert.ok(mission);mis._ensureMissionTargets(mission);
    let core=s.entities.get(mission.targetEntityIds[0]);assert.equal(core.type,'asteroid');assert.equal(core.data.physicalRole,'slag_core');
    const recordId=core.data.worldRecordId,identity=core.data.identityKey;assert.ok(recordId);assert.ok(identity);
    const station=s.entityList.find(e=>e.alive&&e.data?.stationId==='station_helios');
    const length=Math.hypot(core.pos.x-station.pos.x,core.pos.z-station.pos.z),out={x:(core.pos.x-station.pos.x)/length,z:(core.pos.z-station.pos.z)/length};
    // Initial scenario setup uses the actual relocation owner; this is not a flight-from-berth claim.
    world.relocatePlayerInSector({x:core.pos.x+130*out.x,z:core.pos.z+130*out.z,heading:Math.atan2(-out.z,-out.x)},{reason:'rope-save-native-initial-player'});
    assert.equal(await physics.prepareBackend(s),true);
    const step=n=>{for(let i=0;i<n;i++)r.step(1/60);};step(3);
    const events=[],awards=[],denied=[];r.bus.on('tether:massWeighed',p=>events.push(p));r.bus.on('economy:grantCredits',p=>awards.push(p));r.bus.on('tether:latchDenied',p=>denied.push(p));
    const key=(code,pressed)=>domKeyEvent(input,{code,pressed,blocked:false,repeat:false});
    const aim=()=>{input.ingestLaneDomEvent({type:'mousemove',clientX:320,clientY:240,movementX:1,movementY:0});input.ingestLaneDomEvent({type:'cursorProjection',x:core.pos.x,z:core.pos.z});};
    const catchCore=()=>{aim();step(2);key('KeyF',true);step(1);key('KeyF',false);step(18);assert.equal(s.player.tether.active,true,JSON.stringify({denied,tether:s.player.tether,core:{id:core.id,radius:core.radius,pos:core.pos},player:s.entities.get(s.playerId)?.pos,input:s.input.actions}));assert.equal(s.player.tether.targetId,core.id);};
    const coast=()=>{
      const p=s.entities.get(s.playerId),pm=physics._sg02.records.get(p.id).body.mass(),cm=physics._sg02.records.get(core.id).body.mass();
      const tangent={x:-out.z,z:out.x};
      assert.equal(queuePhysicsImpulse(core,{x:tangent.x*cm*3.5,y:0,z:tangent.z*cm*3.5}),true);
      assert.equal(queuePhysicsImpulse(p,{x:tangent.x*pm*3.5,y:0,z:tangent.z*pm*3.5}),true);
    };
    const pullStep=()=>{assert.equal(queuePhysicsImpulse(s.entities.get(s.playerId),{x:2*out.x,y:0,z:2*out.z}),true);step(1);};
    r.bus.emit('dock:undocked',{stationId:'station_helios'});catchCore();coast();
    const start={...core.pos};
    for(let i=0;i<240&&!(telemetry._weigh?.dwellS>=0.20);i++)pullStep();
    assert.ok(telemetry._weigh?.dwellS>=0.20&&telemetry._weigh.dwellS<0.5,'actual native line reaches unfinished qualifying dwell');
    assert.equal(events.length,0);assert.ok(Math.hypot(core.pos.x-start.x,core.pos.z-start.z)>0.1,'native forces move the original');
    assert.ok(core.hull>0,'the original physical core remains alive');
    const remembered={recordId,identity,pos:{...core.pos},vel:{...core.vel},rot:core.rot,angVel:core.angVel,hull:core.hull,hullMax:core.hullMax,nativeMass:physics._sg02.records.get(core.id).body.mass(),partialDwell:telemetry._weigh.dwellS};
    const custody=()=>JSON.stringify({items:s.player.cargo.items,usedVolume:s.player.cargo.usedVolume,usedMass:s.player.cargo.usedMass});
    const credits=s.player.credits,cargo=custody(),first=save.serialize('rope-native-partial');assert.ok(first);
    assert.equal(save.loadEnvelope(first),true,'full save-system Continue accepts');
    mission=s.missions.active.find(m=>m.id===mission.id);assert.ok(mission);mis._adoptLiveMissionTargets(mission);mis._ensureMissionTargets(mission);
    const copies=s.entityList.filter(e=>e.alive&&e.data?.worldRecordId===recordId);assert.equal(copies.length,1,'exactly one original durable body');core=copies[0];
    assert.deepEqual(mission.targetEntityIds,[core.id],'current mission owner adopts original, not a replacement');
    assert.equal(core.type,'asteroid');assert.equal(core.data.identityKey,identity);assert.equal(core.hull,remembered.hull);assert.equal(core.hullMax,remembered.hullMax);
    assert.ok(Math.hypot(core.pos.x-remembered.pos.x,core.pos.z-remembered.pos.z)<0.001);assert.deepEqual({...core.vel},remembered.vel);assert.equal(core.rot,remembered.rot);assert.equal(core.angVel,remembered.angVel);
    assert.equal(telemetry._weigh,null,'private unfinished dwell never crosses Continue');assert.equal(events.length,0);assert.equal(await physics.prepareBackend(s),true);
    assert.ok(Math.abs(physics._sg02.records.get(core.id).body.mass()-remembered.nativeMass)<0.001,'native body mass survives');
    if(!s.player.tether?.active)catchCore();else assert.equal(s.player.tether.targetId,core.id);
    let qualified=0;
    for(let i=0;i<300&&events.length===0;i++){
      pullStep();if(telemetry._weigh?.dwellS>0)qualified++;
      if(telemetry._weigh?.dwellS<0.5-1e-9)assert.equal(events.length,0,'pre-save dwell cannot complete the new observation early');
    }
    assert.equal(events.length,1,'fresh real native dwell earns one slip');assert.ok(qualified>=30);assert.equal(events[0].measuredMassT,physicalMassT(core));assert.ok(Math.abs(events[0].measuredMassT-remembered.nativeMass)<0.001);
    const slipId=events[0].slipId;assert.ok(s.economyContracts.massScale.slips[slipId]);
    const earned=save.serialize('rope-native-earned');assert.ok(earned);assert.equal(save.loadEnvelope(earned),true);
    mission=s.missions.active.find(m=>m.id===mission.id);mis._adoptLiveMissionTargets(mission);mis._ensureMissionTargets(mission);
    const final=s.entityList.filter(e=>e.alive&&e.data?.worldRecordId===recordId);assert.equal(final.length,1);core=final[0];assert.deepEqual(mission.targetEntityIds,[core.id]);
    assert.ok(s.economyContracts.massScale.slips[slipId]);assert.equal(s.player.credits,credits);assert.equal(custody(),cargo);assert.equal(awards.length,0);assert.equal(events.length,1);
    console.log('ROPE_NATIVE_CONTINUE',JSON.stringify({recordId,identity,partialDwell:remembered.partialDwell,hull:remembered.hull,moved:Math.hypot(remembered.pos.x-start.x,remembered.pos.z-start.z),nativeMass:remembered.nativeMass,slipId,bodyCopies:final.length,measurements:events.length,rewards:awards.length,qualifiedPostContinueTicks:qualified}));
  } finally {r.dispose();restoreFeatureMaps(flags);}
});
