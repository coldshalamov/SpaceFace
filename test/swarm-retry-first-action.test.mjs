import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createRunState } from '../src/core/runState.js';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { createDamageRouter, scalarHitToDamagePacket } from '../src/combat/damage.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import { input } from '../src/systems/input.js';
import { runSession, runLifetime } from '../src/systems/runSession.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { noteSwarmPilotAction, swarmPilotHasActed } from '../src/systems/swarmSafety.js';
import { applyDomainPathUpdate, createDomainDiffer } from '../scripts/lib/simReadModel.mjs';

const DT = 1 / 60;
const SEED = 4242;
function fixture(t, ruleset = 'swarm') {
  const state = createGameState(SEED), bus = createBus();
  const owner = Object.create(runSession);
  owner.init({ state, bus });
  t.after(() => owner.destroy());
  const h = { state, bus, owner, ruleset };
  start(h);
  return h;
}
function transition(h, nextPhase) {
  h.bus.emit('run:transitionRequested', { expectedPhase: h.state.run.phase, nextPhase });
  assert.equal(h.state.run.phase, nextPhase);
}
function start(h) {
  h.bus.emit('run:beginRequested', { kind: 'survival', ruleset: h.ruleset || 'swarm',
    seed: SEED, arenaId: 'helios_core' });
  assert.equal(h.state.run.phase, 'loadout');
  transition(h, 'arena_intro'); transition(h, 'wave_intro');
  // Focused wave fixture: the real phase/run owner commits every transition;
  // the wave planner is intentionally absent, so only its wave ordinal is supplied.
  h.state.run.wave = 1;
  transition(h, 'active');
  h.state.mode = 'flight';
}
function retry(h) {
  h.bus.emit('run:endRequested', { outcome: 'defeat', reason: 'test_retry' });
  transition(h, 'inactive');
  start(h);
}
function controls(h) {
  return Object.assign(Object.create(input), {
    _keys: {}, _ndc: { x: 0, y: 0 }, _screen: { x: 0, y: 0, active: false },
    _m0: false, _m1: false, _m2: false, _lastKbmMs: 0,
    helpers: { raycastToPlane: () => ({ x: 100, z: 0 }) },
    bus: h.bus, gamepad: null, touch: null,
  });
}
function pilot(state) {
  const p = { id: 1, type: 'ship', alive: true, team: 0, collides: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, mass: 40,
    hull: 200, hullMax: 200, shield: 0, armorHp: 0, data: {} };
  state.playerId = p.id; state.entities.set(p.id, p); state.entityList.push(p);
  return p;
}

for (const ruleset of ['swarm', 'scored']) {
  test(`${ruleset}: same-seed round-one retry waits for its own pilot action`, t => {
    const h = fixture(t, ruleset);
    assert.equal(swarmPilotHasActed(h.state), false);
    noteSwarmPilotAction(h.state);
    const previous = runLifetime(h.state.run);
    retry(h);
    assert.notEqual(runLifetime(h.state.run), previous);
    assert.equal(h.state.run.seed, SEED);
    assert.equal(swarmPilotHasActed(h.state), false);
    noteSwarmPilotAction(h.state);
    assert.equal(swarmPilotHasActed(h.state), true);
  });
}

test('run wallet, modifier and census clones preserve the current act and earned score', t => {
  const h = fixture(t); noteSwarmPilotAction(h.state);
  const lifetime = runLifetime(h.state.run), original = h.state.run;
  h.bus.emit('run:awardRequested', { credits: 30, score: 4 });
  h.bus.emit('run:spendRequested', { credits: 5 });
  h.bus.emit('run:modifierRecordRequested', { record: { kind: 'test_receipt' } });
  h.bus.emit('run:threatRequested', { threatBudget: 10, spawnedThreat: 2 });
  assert.notEqual(h.state.run, original);
  assert.equal(runLifetime(h.state.run), lifetime);
  assert.equal(h.state.run.credits, 25);
  assert.equal(h.state.run.score, 4);
  assert.equal(swarmPilotHasActed(h.state), true);
  h.bus.emit('run:awardRequested', { score: 6 });
  assert.equal(h.state.run.score, 10, 'reading the latch inside runSession remains cycle-safe');
});

test('pause and same-wave phase transitions preserve the act, next wave does not', t => {
  const h = fixture(t); noteSwarmPilotAction(h.state);
  h.state.mode = 'pause'; h.state.mode = 'flight';
  transition(h, 'draft'); transition(h, 'wave_intro'); transition(h, 'active');
  assert.equal(swarmPilotHasActed(h.state), true);
  transition(h, 'draft'); h.state.run.wave = 2;
  transition(h, 'wave_intro'); transition(h, 'active');
  assert.equal(swarmPilotHasActed(h.state), false);
});

for (const lifecycle of ['save:restoring', 'game:exitToMenu']) {
  test(`${lifecycle} followed by another first round cannot inherit the old act`, t => {
    const h = fixture(t); noteSwarmPilotAction(h.state);
    h.bus.emit(lifecycle, {}); start(h);
    assert.equal(swarmPilotHasActed(h.state), false);
  });
}

test('reinitializing the run owner on the same state creates a fresh readiness lifetime', t => {
  const h = fixture(t); noteSwarmPilotAction(h.state);
  const old = runLifetime(h.state.run);
  h.owner.init({ state: h.state, bus: h.bus });
  assert.notEqual(runLifetime(h.state.run), old);
  assert.equal(swarmPilotHasActed(h.state), false);
});

test('an unrelated replacement with the same seed, wave and token cannot inherit the act', t => {
  const h = fixture(t); noteSwarmPilotAction(h.state);
  h.state.run = structuredClone(h.state.run);
  assert.equal(swarmPilotHasActed(h.state), false);
  noteSwarmPilotAction(h.state);
  assert.equal(swarmPilotHasActed(h.state), true);
});

test('an unowned fixture is stable until the actual run record is replaced', () => {
  const state = createGameState(SEED);
  state.run = Object.assign(createRunState({ kind: 'survival', ruleset: 'swarm', seed: SEED }),
    { phase: 'active', wave: 1 });
  noteSwarmPilotAction(state);
  state.run.credits += 1;
  assert.equal(swarmPilotHasActed(state), true);
  state.run = structuredClone(state.run);
  assert.equal(swarmPilotHasActed(state), false);
});

test('real domain wire preserves facade readiness across counters but retires it on the next run token', t => {
  const h = fixture(t), differ = createDomainDiffer(), domains = new Map();
  const mirrored = createGameState(SEED);
  function transfer(tick) {
    const diff = differ.diff(h.state, tick);
    for (const u of JSON.parse(JSON.stringify(diff.updates))) applyDomainPathUpdate(domains, u);
    mirrored.run = domains.get('run');
  }
  transfer(0);
  const facade = mirrored.run;
  assert.ok(facade.retireToken > 0);
  noteSwarmPilotAction(mirrored);
  noteSwarmPilotAction(h.state);
  h.bus.emit('run:awardRequested', { credits: 3 });
  transfer(60);
  assert.equal(mirrored.run, facade);
  assert.equal(swarmPilotHasActed(mirrored), true);
  const oldToken = facade.retireToken;
  retry(h); transfer(120);
  assert.equal(mirrored.run, facade, 'wire keeps the root facade in place');
  assert.notEqual(facade.retireToken, oldToken);
  assert.equal(swarmPilotHasActed(mirrored), false);
});

test('retry damage protection ends through actual rebound input rather than an injected action latch', t => {
  const h = fixture(t), player = pilot(h.state);
  const enemy = { id: 2, type: 'ship', alive: true, team: 1, radius: 8,
    pos: { x: 100, z: 0 }, vel: { x: 30, z: 4 }, hull: 50, hullMax: 50,
    armorHp: 0, shield: 0, data: { runCohort: 'survival', ai: {} } };
  h.state.entities.set(enemy.id, enemy); h.state.entityList.push(enemy);
  const route = createDamageRouter({ state: h.state, bus: h.bus, catalog: createCombatCatalog(),
    helpers: { combatPhysics: { applyImpulse() { return true; } } } }, { schedule() {} });
  const hit = { attackerId: player.id, targetId: enemy.id,
    packet: scalarHitToDamagePacket({ damage: 10, damageType: 'kinetic' }) };
  noteSwarmPilotAction(h.state); retry(h);
  const host = controls(h); h.state.settings.controls.bindings = { forward: ['KeyO'] };
  host.update(DT, h.state);
  assert.equal(route(hit).reason, 'swarm_waiting_for_input');
  assert.equal(enemy.hull, 50);
  host._keys.KeyO = true; host.update(DT, h.state);
  assert.ok(Math.hypot(h.state.input.moveX || 0, h.state.input.moveZ || 0) > 0);
  assert.equal(swarmPilotHasActed(h.state), true);
  assert.equal(route(hit).ok, true);
  assert.ok(enemy.hull < 50);
});

test('native retry holds the real opening reserve until fresh input, then ordinary combat releases it', async t => {
  const sim = createSimulation({ seed: SEED, systems: [runSession, swarmArena, physics] });
  t.after(() => sim.dispose());
  const h = { state: sim.state, bus: sim.bus };
  h.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  h.state.render.sectorShellAdmission = false;
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 40, hull: 200, hullMax: 200, collides: true, data: {} });
  h.state.playerId = player.id;
  start(h); noteSwarmPilotAction(h.state); retry(h);
  assert.equal(await sim.registry.get('physics').prepareBackend(h.state), true);
  h.bus.emit('run:wavePlanned', { wave: 1, plan: { swarm: {}, openingLesson: { holdTicks: 600 } } });
  h.bus.emit('run:waveStarted', { wave: 1 }); h.bus.emit('run:openingLessonReleased', {});
  const engine = sim.registry.get('swarmArena')._brood;
  for (let i = 0; i < 185 && !engine.view.aliveCount; i++) sim.step(DT);
  assert.equal(engine.view.aliveCount, 3);
  const initialX = engine._bodies.px[0];
  for (let i = 0; i < 420; i++) sim.step(DT);
  assert.equal(swarmPilotHasActed(h.state), false);
  assert.equal(engine.view.pendingCount, 97);
  assert.notEqual(engine._bodies.px[0], initialX, 'waiting preserves live body motion');
  const host = controls(h); host._keys.KeyW = true; host.update(DT, h.state);
  assert.equal(swarmPilotHasActed(h.state), true);
  // After seven idle seconds the live trio may already contact real scenery.
  // Once play starts their ordinary deaths may legitimately release before 6s.
  for (let i = 0; i < 360 && engine.view.pendingCount === 97; i++) sim.step(DT);
  assert.ok(engine.view.pendingCount < 97);
  assert.ok(engine.view.aliveCount > 3);
});
