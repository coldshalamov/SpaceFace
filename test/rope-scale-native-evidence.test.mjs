// Focused physical acceptance. Fixture positions are staged before Rapier body creation;
// this is NOT evidence of manual player flight from the authored spawn to the berth.
// The loaded-line projection and evidence event are never written by this test.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { actions } from '../src/systems/actions.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { weapons } from '../src/systems/weapons.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { masslineTelemetry } from '../src/systems/masslineTelemetry.js';
import { missions } from '../src/systems/missions.js';
import { economy } from '../src/systems/economy.js';
import { economyContracts } from '../src/systems/economyContracts.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { story } from '../src/systems/story.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { createUiInput } from '../src/ui/input.js';
import { commitDockedUiState } from '../src/ui/dockStateCommit.js';
import { physicalMassT } from '../src/systems/cargoCustody.js';
import { resolveCollisionProxyManifest, resolveDockAnchor, collisionProxyIdForStation } from '../src/data/collisionProxyManifests.js';
import { SECTORS } from '../src/data/sectors.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';

test('native Rapier line earns one audit slip and native berth settlement pays only the mission', async () => {
  const sim = createSimulation({seed:4242, systems:[actions,flightV3,weapons,physics,combat,tetherGameplay,
    masslineTelemetry,missions,economy,economyContracts,lawSecurity,story]});
  const {state,bus,registry}=sim;
  const oldDocument=globalThis.document,oldWindow=globalThis.window;
  let uiInput;
  const uiDocument={addEventListener(){},removeEventListener(){}};
  const uiWindow={addEventListener(){},removeEventListener(){}};
  globalThis.document=uiDocument;globalThis.window=uiWindow;
  uiInput=createUiInput({state,bus},{isOpen:()=>false,popScreen(){}});
  globalThis.document=oldDocument;globalThis.window=oldWindow;
  try {
    state.mode='flight';
    state.settings.gameplay.physicsBackend='rapier-dynamic';
    state.settings.gameplay.flightBackend='v3';
    state.settings.gameplay.aiBackend='legacy';
    state.world.currentSectorId='sector_helios_prime';
    state.onboarding={active:false,finished:true};
    const player=sim.spawn(makeShipEntitySpec(NEW_GAME.shipId,{team:0,factionId:'faction_free',
      isPlayer:true,player:state.player,fittings:fittingsFromDefaultModules(NEW_GAME.shipId,NEW_GAME.fittedModules||[]),
      pos:{x:0,z:0},rot:Math.PI/2}));
    state.playerId=player.id; state.player.credits=1000000;
    const events=[];
    for(const evt of ['tether:latchDenied','tether:attached','tether:massWeighed','customs:massSlipFiled','mission:completed',
      'economy:grantCredits','law:incidentReceipt','ambientComms:register'])bus.on(evt,p=>events.push({evt,p}));
    const offerId='eco_mass_scale_weight_audit_station_helios';
    const mis=registry.get('missions');
    for(let i=0;i<4;i++){
      bus.emit('dock:docked',{stationId:'station_helios'});
      if(state.missions.boards?.station_helios?.slots?.some(s=>s?.id===offerId))break;
    }
    assert.equal(mis.acceptMission(offerId),true);
    const mission=state.missions.active.find(m=>m.sourceOfferId===offerId);
    const target=state.entities.get(mission.targetEntityIds[0]);
    assert.equal(target.mass,40);
    // Catalog-equivalent Helios compound body staged at origin. Fixture positioning is
    // at the real external dock anchor, not evidence of flying the recovery route.
    const catalog=SECTORS.flatMap(s=>s.stations||[]).find(s=>s.id==='station_helios');
    const station=sim.spawn({type:'station',pos:{x:0,z:0},radius:42,mass:1e6,hull:1e6,hullMax:1e6,
      collides:true,factionId:catalog.factionId,data:{stationId:catalog.id,stationTypeId:catalog.type,
        dockRadius:90,placeScale:90/14,collisionRadius:42,
        collisionProxy:collisionProxyIdForStation(catalog.id)||'station_ring_hub',corridorBearingDeg:0,
        services:catalog.services,factionId:catalog.factionId,name:catalog.name,size:'L',
        sectorId:'sector_helios_prime',homeSectorId:'sector_helios_prime'}});
    assert.equal(mis._liveStation('station_helios')?.id,station.id);
    const anchor=resolveDockAnchor(station,resolveCollisionProxyManifest(station),player);
    assert.ok(anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.z));
    player.pos.x=anchor.x;player.pos.z=anchor.z;
    const outward=Math.hypot(anchor.x,anchor.z);
    target.pos.x=anchor.x+80*anchor.x/outward;target.pos.z=anchor.z+80*anchor.z/outward;
    target.vel.x=0;target.vel.z=0;
    player.vel.x=0;player.vel.z=1;
    assert.equal(await registry.get('physics').prepareBackend(state,{}),true);
    assert.equal(state.physicsRuntime.diagnostics.sg02Ready,true);
    // Exercise the current >=2 WU/s moving-load law, not the old PR's near-zero-speed observer.
    // A finite matched coast impulse goes through the native command writer at the actual masses;
    // fixture motion is controlled setup, not a claim of flying this recovery route by hand.
    const owner=registry.get('physics')._sg02;
    const targetMass=owner.records.get(target.id).body.mass();
    const playerMass=owner.records.get(player.id).body.mass();
    const tangent={x:-anchor.z/outward,z:anchor.x/outward};
    assert.equal(queuePhysicsImpulse(target,{x:tangent.x*targetMass*3.5,y:0,z:tangent.z*targetMass*3.5}),true);
    assert.equal(queuePhysicsImpulse(player,{x:tangent.x*playerMass*3.5,y:0,z:tangent.z*playerMass*3.5}),true);
    bus.emit('dock:undocked',{stationId:'station_helios'});
    // Exercise the actual cursor-aim latch input; tetherGameplay owns both attachment and mirror.
    state.input.tetherMode='cursor';
    state.input.aimIntentActive=true;
    state.input.aimWorld={x:target.pos.x,z:target.pos.z};
    state.input.actions={...(state.input.actions||{}),tetherFire:true};
    sim.step(SIM_DT);
    state.input.actions.tetherFire=false;
    assert.equal(events.filter(e=>e.evt==='tether:attached'&&e.p.targetId===target.id).length,1);
    sim.step(SIM_DT); // first post-latch gameplay observation publishes the real line mirror
    assert.equal(state.player.tether?.targetId,target.id,'native input latched the real mission body');
    assert.ok(state.player.tether?.attachmentId,'native attachment identity is present');
    const credits=state.player.credits;
    const cargo=JSON.stringify(state.player.cargo);
    const trace=[];
    for(let i=0;i<180;i++){
      assert.equal(queuePhysicsImpulse(player,{x:-2*anchor.x/outward,y:0,z:-2*anchor.z/outward}),true);
      sim.step(SIM_DT);
      const tel=state.player.masslineTelemetry;
      trace.push({t:state.simTime,phase:tel?.phase,strain:tel?.strain,speed:tel?.targetSpeed,
        target:state.player.tether?.targetId,dwell:registry.get('masslineTelemetry')._weigh?.dwellS,missionStatus:mission.status,slips:Object.keys(state.economyContracts.massScale?.slips||{}).length});
      if(events.some(e=>e.evt==='tether:massWeighed'))break;
    }
    console.log('NATIVE_TRACE',JSON.stringify({first:trace.slice(0,3),last:trace.slice(-3),loaded:trace.filter(t=>t.phase==='loaded'||t.phase==='overload').length,maxDwell:Math.max(...trace.map(t=>t.dwell||0)),targetIds:mission.targetEntityIds}));
    const measured=events.filter(e=>e.evt==='tether:massWeighed');
    assert.equal(measured.length,1,'actual loaded-line dwell earns exactly one event');
    assert.equal(measured[0].p.measuredMassT,physicalMassT(target),'read the native body mass, not the pre-physics spawn hint');
    assert.ok(measured[0].p.measuredMassT>20);
    const nativeBody=registry.get('physics')._sg02.records.get(target.id)?.body;
    assert.ok(nativeBody && nativeBody.mass()>0,'real Rapier body is present');
    assert.ok(Math.abs(nativeBody.mass()-measured[0].p.measuredMassT)<1e-4,
      `earned mass equals native truth: measured=${measured[0].p.measuredMassT}, entity=${target.mass}, physicsBody=${target.physicsBody?.mass}, native=${nativeBody.mass()}`);
    assert.ok(Math.hypot(nativeBody.linvel().x,nativeBody.linvel().z)>0,'real native target is moving');
    assert.equal(measured[0].p.declaredMassT,20);
    assert.equal(state.player.credits,credits,'measurement has no wallet effect');
    assert.equal(JSON.stringify(state.player.cargo),cargo,'measurement moves no cargo');
    assert.ok(mis._missionBerthPos(mission),'completion has a real live berth, not sector-only fallback');
    assert.equal(mis._entityNearDestBerth(target,mission),true,'physics-driven target remains at berth');
    bus.on('dock:docked',p=>commitDockedUiState(state,p,bus));
    assert.equal(state.ui.dockInRange,true,'real physics range admits the command');
    const priorJump=state.jump;
    state.jump={...(priorJump||{}),state:'CHARGING'};
    uiInput.doDock();
    assert.equal(events.filter(e=>e.evt==='mission:completed'&&e.p.missionId===mission.id).length,0,
      'real dock command refuses while jump owns the transition');
    assert.equal(events.filter(e=>e.evt==='customs:massSlipFiled').length,0);
    state.jump=priorJump;
    uiInput.doDock();
    assert.equal(state.ui.docked,true,'ordinary command commits validated docking');
    assert.equal(events.filter(e=>e.evt==='mission:completed'&&e.p.missionId===mission.id).length,1);
    assert.equal(events.filter(e=>e.evt==='economy:grantCredits'&&e.p.reason==='mission:'+mission.id).length,1);
    assert.equal(events.filter(e=>e.evt==='customs:massSlipFiled').length,1);
    assert.equal(events.filter(e=>e.evt==='ambientComms:register'&&e.p.id==='mass_scale_47a_weight_slip').length,1);
    assert.equal(state.player.credits,credits+mission.reward_cr,'exact native mission payout reaches the wallet');
    const paid=state.player.credits;
    bus.emit('dock:docked',{stationId:'station_helios'});
    assert.equal(state.player.credits,paid,'repeat docking cannot duplicate mission reward');
    assert.equal(events.filter(e=>e.evt==='customs:massSlipFiled').length,1,'repeat docking cannot duplicate filing');
  } finally {globalThis.document=uiDocument;globalThis.window=uiWindow;uiInput?.dispose();sim.dispose();globalThis.document=oldDocument;globalThis.window=oldWindow;}
});
