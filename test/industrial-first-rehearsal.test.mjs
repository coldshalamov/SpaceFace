import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { queuePhysicsImpulse, physicsBodyNativeReady } from '../src/core/physicsAuthority.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { actions } from '../src/systems/actions.js';
import { fields } from '../src/systems/fields.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { industrialDisasters, normalizeIndustrialDisasters, createIndustrialDisastersSystem } from '../src/features/industrialDisasters/runtime.js';
import { SITE, SCENARIO_IDS, getScenario, sitePoint } from '../src/features/industrialDisasters/scenarios.js';
import { createCrisisRecord, summarizeIndustrialCrisis, normalizeCrisisRecord } from '../src/features/industrialDisasters/causality.js';
import { captureIndustrialDisasters, restoreIndustrialDisasters, validateIndustrialDisastersSave } from '../src/features/industrialDisasters/saveAdapter.js';
import { normalizeIndustrialPhysicalSnapshot } from '../src/features/industrialDisasters/physicalSite.js';
import { industrialDecision, commandForIndustrialChoice, installIndustrialDisasterPresentation } from '../src/features/industrialDisasters/presentation.js';

// Focused-explicit evidence: real entity lifetime, Rapier, combat damage, economy, factions and
// feature owners. These are not production-manifest, DOM keyboard-route or GPU acceptance tests.
// Fixture selection is a saved section before first native admission. Once admitted, no test
// writes an actor pose/velocity: all interventions use native impulses or the existing cable owner.
async function boot({ scenarioId = 'drift', saved = null, preview = true, toolSystems = [],
  playerOffset = { x: 0, z: 150 }, presentationRequired = false, nativeSnapshot = null } = {}) {
  const sim = createSimulation({ seed: 8205, systems: [...toolSystems, physics, economy, factions, industrialDisasters] });
  const { state, bus } = sim;
  state.mode = 'flight'; state.timeScale = 1; state.run = { kind: 'adventure' };
  state.world.currentSectorId = SITE.sectorId;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const player = sim.spawn({ type: 'ship', isPlayer: true, team: 0,
    pos: sitePoint(playerOffset), vel: { x: 0, z: 0 },
    radius: 5, mass: 20, hull: 100, hullMax: 100,
    data: { combatProfileId: 'combat_profile_standard_ship' } });
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

function kick(body, vx, vz) {
  assert.ok(physicsBodyNativeReady(body), 'intervention starts on an admitted native body');
  assert.equal(queuePhysicsImpulse(body, { x: vx * body.mass, z: vz * body.mass },
    { source: 'industrial-focused-fixture', reason: 'physical-intervention' }), true);
}

function runUntil(h, predicate, seconds = 90, eachTick = null) {
  const count = Math.ceil(seconds / SIM_DT);
  for (let i = 0; i < count; i++) {
    if (predicate()) return i * SIM_DT;
    eachTick?.(i);
    h.sim.step(SIM_DT);
  }
  assert.ok(predicate(), `condition did not resolve after ${seconds}s: ${JSON.stringify({
    phase: h.record().phase, status: h.record().status, losses: h.record().losses,
  })}`);
  return seconds;
}

// Controlled test tug: acceleration is sent through the same impulse membrane as real tools.
// Speed/force are bounded and native contact constraints remain active during the entire tow.
function towTick(body, goal, maxSpeed = 10) {
  const dx = goal.x - body.pos.x, dz = goal.z - body.pos.z;
  const d = Math.hypot(dx, dz), v = Math.min(maxSpeed, d);
  let x = ((d ? dx / d * v : 0) - body.vel.x) * body.mass;
  let z = ((d ? dz / d * v : 0) - body.vel.z) * body.mass;
  const j = Math.hypot(x, z), cap = body.mass * 25 * SIM_DT;
  if (j > cap) { x *= cap / j; z *= cap / j; }
  queuePhysicsImpulse(body, { x, z }, { source: 'industrial-focused-fixture', reason: 'tow', continuous: true, dt: SIM_DT });
}

function recover(h, roles) {
  const berth = sitePoint(SITE.safeBerth);
  runUntil(h, () => roles.every((role) => ['safe', 'recovered'].includes(h.record().status[role])), 70,
    () => { for (const role of roles) { const body = h.bodies()[role]; if (body) towTick(body, berth); } });
}


test('ordinary first offer enters unpaid physical practice then restores the original emergency hold',async()=>{
 const h=await boot();try{
 const original=JSON.parse(JSON.stringify(captureIndustrialDisasters(h.ctx).site.crisis));
 const offer=industrialDecision(h.owner.readModel());assert.ok(offer.options.some(o=>o.id==='drill:drift'));
 const request=commandForIndustrialChoice('drill:drift');assert.equal(h.command(request.action,{scenarioId:request.scenarioId}).ok,true);
 assert.equal(h.owner.site.drill,true);assert.equal(h.command('next').ok,false);
 assert.match(industrialDecision(h.owner.readModel()).title,/PRACTICE/);
 assert.equal(h.command('accept').ok,true);h.sim.runTicks(2);
 kick(h.bodies().transport,0,7);runUntil(h,()=>h.record().phase==='settled',45);
 assert.equal(h.grants.length,0);assert.equal(h.owner.site.completed.length,0);assert.equal(h.owner.site.history.length,0);
 assert.equal(h.command('finishDrill').ok,true);assert.equal(h.record().phase,'preview');
 assert.equal(h.record().cycle,original.cycle);assert.deepEqual(h.record().losses,original.losses);
 assert.equal(h.owner.site.drill,false);assert.equal(h.command('finishDrill').ok,false);
 assert.equal(h.command('accept').ok,true);h.sim.runTicks(2);kick(h.bodies().transport,0,7);
 runUntil(h,()=>h.record().phase==='settled',45);assert.equal(h.grants.length,1);
 }finally{h.close();}
});
test('active first rehearsal can end through explicit decision; live incident cannot be erased into practice',async()=>{
 const h=await boot();try{
 assert.equal(h.command('drill',{scenarioId:'cascade'}).ok,false);
 assert.equal(h.command('drill',{scenarioId:'drift'}).ok,true);
 assert.equal(h.command('drill',{scenarioId:'drift'}).ok,false);
 assert.equal(h.command('accept').ok,true);h.sim.runTicks(2);
 const decision=industrialDecision(h.owner.readModel());assert.ok(decision.options.some(o=>o.id==='finishDrill'));
 const hull=h.state.entities.get(h.state.playerId).hull;
 assert.equal(h.command('finishDrill').ok,true);assert.equal(h.state.entities.get(h.state.playerId).hull,hull);
 assert.equal(h.command('accept').ok,true);h.sim.runTicks(2);
 assert.equal(h.command('drill',{scenarioId:'drift'}).ok,false);assert.equal(industrialDecision(h.owner.readModel()),null);
 }finally{h.close();}
});
test('saved initial rehearsal cold-restores both practice and held original without paid receipts',async()=>{
 const h=await boot();let cold;try{
 const cycle=h.record().cycle;
 assert.equal(h.command('drill',{scenarioId:'drift'}).ok,true);assert.equal(h.command('accept').ok,true);h.sim.runTicks(4);
 const saved=JSON.parse(JSON.stringify(captureIndustrialDisasters(h.ctx)));
 cold=await boot({saved});assert.equal(cold.owner.site.drill,true);
 assert.equal(cold.command('finishDrill').ok,true);assert.equal(cold.record().phase,'preview');assert.equal(cold.record().cycle,cycle);
 assert.equal(cold.grants.length,0);assert.equal(cold.owner.site.completed.length,0);
 }finally{cold?.close();h.close();}
});
test('real player line blocks scene replacement until cut; menu or docking cannot start rehearsal',async()=>{
 const h=await boot({toolSystems:[actions,tetherGameplay],playerOffset:{x:-115,z:-100}});try{
 h.state.mode='menu';assert.equal(h.command('drill',{scenarioId:'drift'}).ok,false);h.state.mode='flight';
 h.state.ui.docked=true;assert.equal(h.command('drill',{scenarioId:'drift'}).ok,false);h.state.ui.docked=false;
 const original=h.bodies().transport;
 h.state.input.aimWorld={...original.pos};h.state.input.aimIntentActive=true;h.state.input.actions={tetherFire:true};h.sim.step();h.state.input.actions={};h.sim.runTicks(2);
 assert.equal(h.owner.physical.canSuspend(),false);
 assert.equal(h.command('drill',{scenarioId:'drift'}).reason,'release_tethers');
 assert.equal(h.bodies().transport,original);assert.equal(h.owner.site.drill,false);
 h.state.input.actions={massline:{cut:true}};h.sim.runTicks(2);h.state.input.actions={};
 assert.equal(h.owner.physical.canSuspend(),true);
 assert.equal(h.command('drill',{scenarioId:'drift'}).ok,true);
 }finally{h.close();}
});

test('worker projection exposes practice and ending it does not refund unrelated real spending',async()=>{
 const {encodeIndustrialDisasterStatus,decodeIndustrialDisasterStatus}=await import('../src/features/industrialDisasters/workerAdapter.js');
 const h=await boot();try{
 h.state.player.credits=20; // starting-wallet fixture; debit below is canonical
 assert.equal(h.command('drill',{scenarioId:'drift'}).ok,true);
 const wire=JSON.parse(JSON.stringify(encodeIndustrialDisasterStatus(h.owner.readModel(),h.state)));
 const projected=decodeIndustrialDisasterStatus(wire);
 assert.equal(projected.drill,true);const menu=industrialDecision(projected);
 assert.match(menu.title,/Ship damage and supplies remain real/);
 assert.ok(menu.options.some(o=>o.id==='finishDrill'));
 h.sim.registry.get('economy').chargeCredits(7,'fixture:ordinary-cost-during-practice');
 assert.equal(h.state.player.credits,13);
 assert.equal(h.command('finishDrill').ok,true);assert.equal(h.state.player.credits,13);
 }finally{h.close();}
});
