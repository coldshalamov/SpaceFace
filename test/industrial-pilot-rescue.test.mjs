import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { combat } from '../src/systems/combat.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
let flags;test.before(()=>{flags=snapshotFeatureMaps();applyFeatureConfigToMaps(PRODUCTION_FEATURES);});test.after(()=>restoreFeatureMaps(flags));
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { economy } from '../src/systems/economy.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { industrialDisasters, normalizeIndustrialDisasters, createIndustrialDisastersSystem } from '../src/features/industrialDisasters/runtime.js';
import { SITE, SCENARIO_IDS, getScenario, sitePoint } from '../src/features/industrialDisasters/scenarios.js';
import { createCrisisRecord, summarizeIndustrialCrisis, normalizeCrisisRecord, stepIndustrialCrisis } from '../src/features/industrialDisasters/causality.js';
import { captureIndustrialDisasters, restoreIndustrialDisasters, validateIndustrialDisastersSave } from '../src/features/industrialDisasters/saveAdapter.js';
import { normalizeIndustrialPhysicalSnapshot } from '../src/features/industrialDisasters/physicalSite.js';
import { industrialDecision, commandForIndustrialChoice, installIndustrialDisasterPresentation } from '../src/features/industrialDisasters/presentation.js';

// Focused-explicit evidence: real entity lifetime, Rapier, combat damage, economy and
// feature owners. These are not production-manifest, DOM keyboard-route or GPU acceptance tests.
// Fixture selection is a saved section before first native admission. Once admitted, no test
// writes an actor pose/velocity or direct impulse: only ordinary flight and cable input are used.
async function boot({ scenarioId = 'drift', saved = null, preview = true, toolSystems = [],
  playerOffset = { x: 0, z: 150 }, presentationRequired = false, nativeSnapshot = null, beforeTicks = null } = {}) {
  const sim = createSimulation({ seed: 8205, systems: [ships, economy, flightV3, physics, combat, tetherGameplay, industrialDisasters] });
  const { state, bus } = sim;
  state.mode = 'flight'; state.timeScale = 1; state.run = { kind: 'adventure' };
  state.world.currentSectorId = SITE.sectorId;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  sim.registry.get('ships').newGame();
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: state.player,
    pos: sitePoint(playerOffset), fittings: [] }));
  player.rot = -Math.PI/2;
  state.input = { moveZ: 0, moveX: 0, turnIntent: 0, brake: false, boost: false,
    aimWorld: sitePoint({x:-65,z:0}), aimIntentActive: true, actions: {} };
  state.playerId = player.id;
  const owner = sim.registry.get('industrialDisasters');
  if (presentationRequired) owner.requirePresentation();
  const ctx = { state, registry: sim.registry };
  if (saved) assert.equal(restoreIndustrialDisasters(saved, ctx).ok, true);
  else if (scenarioId !== 'drift') {
    const initial = owner.serialize();
    initial.site.discovered = true;
    initial.site.crisis = createCrisisRecord(scenarioId, 1);
    initial.site.crisis.phase = 'preview';
    owner.deserialize(initial);
  }
  const grants = [], reputation = [], prompts = [], events = [];
  bus.on('economy:grantCredits', (event) => grants.push(event));
  bus.on('faction:repDelta', (event) => reputation.push(event));
  bus.on('encounter:offer', (event) => prompts.push(event));
  bus.on('industrialDisasters:event', (event) => events.push(event));
  const presentation = installIndustrialDisasterPresentation({ state, bus, getReadModel: () => owner.readModel() });
  if (nativeSnapshot) sim.registry.get('physics').deserialize(nativeSnapshot, { deferNative: true });
  const prepared = await sim.registry.get('physics').prepareBackend(state);
  if (nativeSnapshot) {
    assert.equal(sim.registry.get('physics').hasResolvedSg02Owner(), true,
      'deferred native restore initializes its owner before releasing admission');
    sim.registry.get('physics').completeRestore({});
    bus.emit('save:loaded');
  } else assert.equal(prepared, true, 'the real default Rapier owner admitted');
  beforeTicks?.(owner);
  sim.runTicks(4);
  assert.equal(state.physicsRuntime?.diagnostics?.sg02Ready, true);
  const h = { sim, state, bus, owner, ctx, grants, reputation, prompts, events, presentation,
    bodies: () => owner.physical.bodies(), record: () => owner.site.crisis,
    close() { presentation.dispose(); owner.destroy(); sim.dispose(); } };
  h.command = (action, extra = {}) => {
    const request = { action, ...extra };
    bus.emit('industrialDisasters:command', request);
    return request.result;
  };
  if (!preview && h.record().phase === 'preview') {
    assert.equal(h.command('accept').ok, true);
    sim.runTicks(2);
  }
  return h;
}


const clamp=(v,l,h)=>Math.max(l,Math.min(h,v));
test('stock starter rescues original shelter pod, returns for medical consignment and retains honest mixed outcome', async()=>{
 const h=await boot({scenarioId:'corridor',preview:false,playerOffset:{x:-65,z:-65}});
 try{
 const pod=h.bodies().crewA, player=h.state.entities.get(h.state.playerId), start={...pod.pos};
 h.state.input.aimWorld={...pod.pos};h.state.input.actions.tetherFire=true;h.sim.step();h.state.input.actions.tetherFire=false;h.sim.step();
 assert.equal(h.owner.physical.links().playerTowRole,'crewA');
 const goals=[{x:-65,z:-110},{x:145,z:-110},{x:145,z:100}];let leg=0;
 for(let i=0;i<60*180;i++){
   const g=sitePoint(goals[leg]),dx=g.x-player.pos.x,dz=g.z-player.pos.z,d=Math.hypot(dx,dz);
   const v=Math.min(8,d*.3),ex=dx/(d||1)*v-player.vel.x,ez=dz/(d||1)*v-player.vel.z,cf=Math.cos(player.rot),sf=Math.sin(player.rot);
   const desired=Math.atan2(dz,dx),turn=Math.atan2(Math.sin(desired-player.rot),Math.cos(desired-player.rot));
   Object.assign(h.state.input,{turnIntent:clamp(turn*1.2-player.angVel*.4,-1,1),moveZ:clamp((ex*cf+ez*sf)*.07,-.2,.2),moveX:clamp((-ex*sf+ez*cf)*.07,-.2,.2),brake:d<8,aimIntentActive:false});
   h.sim.step();
   assert.equal(h.owner.physical.links().playerTowRole,'crewA');
   assert.equal(h.bodies().crewA,pod);
   if(d<10&&leg<goals.length-1)leg++;
   if(i%600===0)console.log(JSON.stringify({t:h.state.simTime,leg,ship:player.pos,pod:pod.pos,status:h.record().status.crewA,line:h.owner.physical.links().playerTowRole}));
   if(h.record().status.crewA==='safe'){console.log('RESCUE_TIME',h.state.simTime);break;}
 }

 assert.equal(h.record().status.crewA,'safe');
 h.state.input.actions={massline:{cut:true}};h.sim.step();h.state.input.actions={};h.sim.step();
 assert.equal(h.owner.physical.links().playerTowRole,null);
 const cargo=h.bodies().cargoA, berth=sitePoint(SITE.safeBerth);
 const fly=(g,stop,max=120)=>{for(let i=0;i<60*max;i++){
 const goal=typeof g==='function'?g():g,dx=goal.x-player.pos.x,dz=goal.z-player.pos.z,d=Math.hypot(dx,dz),v=Math.min(8,d*.3);
 const ex=dx/(d||1)*v-player.vel.x,ez=dz/(d||1)*v-player.vel.z,cf=Math.cos(player.rot),sf=Math.sin(player.rot);
 const desired=Math.atan2(dz,dx),turn=Math.atan2(Math.sin(desired-player.rot),Math.cos(desired-player.rot));
 Object.assign(h.state.input,{turnIntent:clamp(turn*1.2-player.angVel*.4,-1,1),moveZ:clamp((ex*cf+ez*sf)*.07,-.2,.2),moveX:clamp((-ex*sf+ez*cf)*.07,-.2,.2),brake:d<8,aimIntentActive:false});
 h.sim.step();if(stop(d))return true;}return false;};
 assert.ok(fly(()=>({x:cargo.pos.x+45,z:cargo.pos.z+45}),d=>d<8&&Math.hypot(player.vel.x,player.vel.z)<2));
 h.state.input.moveZ=0;h.state.input.moveX=0;h.state.input.brake=true;
 h.state.input.aimWorld={...cargo.pos};h.state.input.aimIntentActive=true;h.state.input.actions={tetherFire:true};h.sim.step();h.state.input.actions={};h.sim.step();
 assert.equal(h.state.player.tether.targetId,cargo.id);
 const dx=berth.x-cargo.pos.x,dz=berth.z-cargo.pos.z,len=Math.hypot(dx,dz);
 assert.ok(fly({x:berth.x+dx/len*65,z:berth.z+dz/len*65},()=>{assert.equal(h.state.player.tether.targetId,cargo.id);assert.equal(h.bodies().cargoA,cargo);return h.record().status.cargoA==='safe';}));
 console.log(JSON.stringify({medicalRecoveryTime:h.state.simTime,ship:player.pos,cargo:cargo.pos,hull:cargo.hull,status:h.record().status}));
 for(let i=0;i<60*120&&h.record().phase!=='settled';i++)h.sim.step();
 console.log(JSON.stringify({final:h.record().status,phase:h.record().phase,time:h.state.simTime,podHull:pod.hull,cargoHull:cargo.hull,grants:h.grants}));
 // Assert emitted settlement amount, not a wallet balance or faction reputation mutation.
 assert.equal(h.record().phase,'settled');assert.equal(h.grants.length,1);assert.equal(h.grants[0].amount,380);
 assert.equal(pod.hull,100);assert.equal(cargo.hull,100);assert.equal(h.record().status.crewB,'lost');
 assert.equal(h.bodies().crewA,pod);assert.equal(h.bodies().cargoA,cargo);
 h.state.input.actions={massline:{cut:true}};h.sim.step();h.state.input.actions={};h.sim.step();
 const saved=captureIndustrialDisasters(h.ctx), finalHistory=JSON.parse(JSON.stringify(h.owner.site.history));
 const cold=await boot({saved,playerOffset:{x:145,z:100}});
 try {cold.sim.runTicks(120);assert.equal(cold.record().phase,'settled');assert.equal(cold.record().status.crewA,'safe');
 assert.equal(cold.record().status.crewB,'lost');assert.equal(cold.record().status.cargoA,'safe');
 assert.equal(cold.grants.length,0);assert.deepEqual(cold.owner.site.history,finalHistory);
 assert.equal(cold.events.filter(e=>e.id==='tow-handoff:crewA').length,0);
 }finally{cold.close();}

 }finally{h.close();}
});
