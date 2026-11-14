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
import { createCrisisRecord, summarizeIndustrialCrisis, normalizeCrisisRecord, stepIndustrialCrisis } from '../src/features/industrialDisasters/causality.js';
import { captureIndustrialDisasters, restoreIndustrialDisasters, validateIndustrialDisastersSave } from '../src/features/industrialDisasters/saveAdapter.js';
import { normalizeIndustrialPhysicalSnapshot } from '../src/features/industrialDisasters/physicalSite.js';
import { industrialDecision, commandForIndustrialChoice, installIndustrialDisasterPresentation } from '../src/features/industrialDisasters/presentation.js';

// Focused-explicit evidence: real entity lifetime, Rapier, combat damage, economy, factions and
// feature owners. These are not production-manifest, DOM keyboard-route or GPU acceptance tests.
// Fixture selection is a saved section before first native admission. Once admitted, no test
// writes an actor pose/velocity: all interventions use native impulses or the existing cable owner.
async function boot({ scenarioId = 'drift', saved = null, preview = true, toolSystems = [],
  playerOffset = { x: 0, z: 150 }, presentationRequired = false, nativeSnapshot = null, beforeTicks = null } = {}) {
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


test('native player line yields one healthy evacuation pod, survives cold restore and resumes on cut', async () => {
  const h = await boot({ scenarioId: 'corridor', preview: false, toolSystems: [actions, tetherGameplay], playerOffset: { x: -65, z: -65 } });
  let cold;
  try {
    const target = h.bodies().crewA;
    const sample = () => stepIndustrialCrisis(h.record(), { dt: SIM_DT, bodies: h.bodies(), links: h.owner.physical.links() });
    assert.ok(sample().intents.some(i => i.type === 'drive' && i.role === 'crewA'));
    h.state.input.aimWorld = { ...target.pos }; h.state.input.aimIntentActive = true;
    h.state.player.targetId = target.id; h.state.input.actions = { tetherFire: true };
    h.sim.step(); h.state.input.actions = {}; h.sim.step();
    assert.equal(h.state.player.tether.targetId, target.id);
    const held = sample();
    assert.ok(!held.intents.some(i => i.type === 'drive' && i.role === 'crewA'), 'crew must yield autonomous thrust to the actual player line');
    assert.equal(h.owner.physical.links().playerTowRole, 'crewA');
    assert.equal(h.owner.physical.step([{ type: 'drive', role: 'crewA', goal: sitePoint(SITE.safeBerth), speed: 8 }], SIM_DT, h.record()).applied, 0, 'stale drive intents also yield at the native impulse boundary');
    assert.ok(held.intents.some(i => i.type === 'drive' && i.role === 'crewB'));
    assert.equal(h.record().status.crewA, 'at-risk', 'a tow is not a rescue receipt');
    assert.equal(h.events.filter(e => e.id === 'tow-handoff:crewA').length, 1);
    const start = { ...target.pos };
    const tug = h.state.entities.get(h.state.playerId);
    for (let i = 0; i < 90; i++) { towTick(tug, sitePoint({ x: -65, z: -120 }), 10); h.sim.step(); }
    assert.ok(Math.hypot(target.pos.x - start.x, target.pos.z - start.z) > 1, 'original pod physically follows the alternate-route tug');
    assert.equal(h.bodies().crewA, target, 'no replacement pod');
    assert.equal(h.grants.length, 0);
    const saved = captureIndustrialDisasters(h.ctx);
    const player = h.state.entities.get(h.state.playerId);
    const firstRestored = [];
    cold = await boot({ saved, toolSystems: [actions, tetherGameplay], playerOffset: { x: player.pos.x - SITE.anchor.x, z: player.pos.z - SITE.anchor.z }, beforeTicks(owner) {
      const step = owner.physical.step;
      owner.physical = { ...owner.physical, step(intents, dt, record) {
        const liveTow = owner.physical.links().playerTowRole;
        const result = step.call(this, intents, dt, record);
        firstRestored.push({ liveTow, intents, result });
        return result;
      } };
    } });
    assert.equal(firstRestored[0].liveTow, 'crewA');
    assert.ok(firstRestored[0].intents.some(i => i.type === 'drive' && i.role === 'crewA'), 'fixture exercises pre-start stale links');
    assert.equal(firstRestored[0].result.applied, firstRestored[0].intents.filter(i => i.role !== 'crewA').length, 'first restored native turn rejects the stale pod impulse');
    assert.equal(cold.owner.physical.links().playerTowRole, 'crewA');
    assert.ok(!stepIndustrialCrisis(cold.record(), { dt: SIM_DT, bodies: cold.bodies(), links: cold.owner.physical.links() }).intents.some(i => i.type === 'drive' && i.role === 'crewA'));
    assert.equal(cold.events.filter(e => e.id === 'tow-handoff:crewA').length, 0, 'saved handoff is not spoken again');
    cold.state.input.actions = { massline: { cut: true } }; cold.sim.step(); cold.state.input.actions = {}; cold.sim.step();
    assert.equal(cold.owner.physical.links().playerTowRole, null);
    assert.ok(stepIndustrialCrisis(cold.record(), { dt: SIM_DT, bodies: cold.bodies(), links: cold.owner.physical.links() }).intents.some(i => i.type === 'drive' && i.role === 'crewA'));
    assert.equal(cold.grants.length, 0);
  } finally { cold?.close(); h.close(); }
});

function scene(status = 'at-risk') {
  const record = createCrisisRecord('drift'); record.phase = 'recovery'; record.status.crewA = status;
  const bodies = Object.fromEntries(getScenario('drift').bodies.map(d => [d.role, { alive: true, pos: sitePoint(d.offset), vel: { x: 0, z: 0 }, radius: d.radius }]));
  return { record, bodies };
}
test('original towed pod still earns only actual refuge arrival, then stays controllable on its line', () => {
  const { record, bodies } = scene(); bodies.crewA.pos = sitePoint(SITE.safeBerth);
  const result = stepIndustrialCrisis(record, { dt: SIM_DT, bodies, links: { playerTowRole: 'crewA' } });
  assert.equal(record.status.crewA, 'safe');
  assert.ok(!result.intents.some(i => i.role === 'crewA'));
  assert.equal(result.events.filter(e => e.id === 'recovered:crewA').length, 1);
  const again = stepIndustrialCrisis(record, { dt: SIM_DT, bodies, links: {} });
  assert.equal(again.events.filter(e => e.id === 'recovered:crewA').length, 0);
  assert.ok(again.intents.some(i => i.role === 'crewA' && i.speed === 0));
});
test('stranded and lost crew do not gain working thrusters after release', () => {
  for (const status of ['stranded', 'lost']) {
    const { record, bodies } = scene(status); if (status === 'lost') record.losses.crewA = true;
    const held = stepIndustrialCrisis(record, { dt: SIM_DT, bodies, links: { playerTowRole: 'crewA' } });
    const free = stepIndustrialCrisis(record, { dt: SIM_DT, bodies, links: {} });
    assert.ok(!held.intents.some(i => i.role === 'crewA'));
    assert.ok(!free.intents.some(i => i.role === 'crewA'));
    assert.equal(record.status.crewA, status);
  }
});
