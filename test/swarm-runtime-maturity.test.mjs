// Public materialization/AI/lifecycle seams plus adversarial geometry. No new balancing goldens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { materializeWaveBatch } from '../src/systems/waveMaterialization.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { WAVE_CLEARED_SEAM } from '../src/systems/survivalRun.js';
import { swarmArena, quietWellCenter, SWARM_DEBRIS_TAG, SWARM_DEBRIS_TARGET } from '../src/systems/swarmArena.js';
import { applyAIFiringIntent } from '../src/systems/aiFireIntent.js';
import { findSwarmArrival, swarmPlacementIsClear, sweptDiscsOverlap } from '../src/systems/swarmSafety.js';
import { resetSwarmPressureState, createSwarmPressureState, noteSwarmPressureKills,
  swarmReinforceDecision, SWARM_BREATH_TICKS } from '../src/data/swarmMode.js';

const DT = 1 / 60;
function room(seed = 4242, wave = 1) {
  resetSwarmPressureState();
  const state = createGameState(seed);
  state.run = Object.assign(createRunState({ kind: 'survival', ruleset: 'swarm', seed }), { wave, phase: 'active' });
  state.mode = 'flight';
  const bus = createBus();
  const events = [];
  const emit = bus.emit.bind(bus);
  bus.emit = (event, payload) => { events.push({ event, payload }); emit(event, payload); };
  const player = { id: state.nextEntityId++, type: 'ship', alive: true, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, radius: 8, mass: 400, data: {} };
  state.playerId = player.id;
  state.entities.set(player.id, player);
  state.entityList.push(player);
  const budget = makeBudgetApi(state);
  bus.on('entity:destroyed', p => budget.releaseEntity(p.id, p.entity));
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const e = { ...spec, id: state.nextEntityId++, alive: true, pos: { ...spec.pos }, vel: { ...spec.vel } };
      state.entities.set(e.id, e); state.entityList.push(e); return e;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (!entity) return;
      entity.alive = false; state.entities.delete(id);
      state.entityList = state.entityList.filter(e => e !== entity);
      bus.emit('entity:destroyed', { id, entity });
    },
  };
  return { state, bus, helpers, events, budget, player };
}
function obstacle(h, type, x, z, radius = 35, vx = 0, vz = 0) {
  return h.helpers.spawnEntity({ type, pos: { x, z }, radius, vel: { x: vx, z: vz }, mass: 100, data: {} });
}
const request = seed => ({ ownerId: 'survival-wave:1', count: 8, enemyId: 'wasp_swarmer',
  wave: 1, seed, swarm: true, distance: 165, gateGroup: 'front' });
function plan(count = 6) {
  return { ok: true, swarm: { killTarget: count, concurrent: 10, rewardReferenceKills: count,
    spawnDistance: 165, reinforceGapTicks: 12, reinforceBatch: 3, durationTicks: 3600 },
    completionRules: { durationTicks: 3600, blockingRoles: [] },
    schedule: [{ atTick: 0, count, enemyId: 'wasp_swarmer', role: 'chaff', gateGroup: 'front' }] };
}
function owner(h, blueprint = plan()) {
  const sys = Object.create(survivalWave); sys.init(h);
  h.bus.emit('run:wavePlanned', { wave: h.state.run.wave, plan: blueprint });
  h.bus.emit('run:waveStarted', { wave: h.state.run.wave });
  return sys;
}
function tick(h, sys, n = 1) {
  for (let i = 0; i < n; i++) { h.state.simTime += DT; h.state.tick++; sys.update(); }
}
const held = (e, now) => Math.max(Number(e.data.ai.swarmFireHoldUntil) || 0,
  Number(e.data.ai.arrivalHoldUntil) || 0) > now;

for (const type of ['asteroid', 'wreck', 'station', 'ship', 'drone']) {
  test(`arrival includes both radii and respects ${type} occupancy`, () => {
    const h = room(); obstacle(h, type, 100, 0, 30);
    assert.equal(swarmPlacementIsClear(h.state, { x: 142, z: 0 }, 20), false);
    const open = findSwarmArrival(h.state, { x: 142, z: 0 }, 20);
    assert.ok(open); assert.ok(swarmPlacementIsClear(h.state, open, 20));
  });
}
test('swept clearance catches a crossing asteroid, not only endpoint overlap', () => {
  const body = { pos: { x: 100, z: -100 }, vel: { x: 0, z: 400 }, radius: 15 };
  assert.equal(sweptDiscsOverlap({ x: 100, z: 0 }, 12, body), true);
  assert.equal(sweptDiscsOverlap({ x: 100, z: 0 }, 12, body, { horizon: 0 }), false);
});
test('the pilot trajectory is protected too; disabled collision decorations are not obstacles', () => {
  const h = room(); h.player.vel.x = 400;
  assert.equal(swarmPlacementIsClear(h.state, { x: 100, z: 0 }, 10), false);
  h.player.vel.x = 0;
  const e = obstacle(h, 'station', 100, 0, 100); e.collides = false;
  assert.equal(swarmPlacementIsClear(h.state, { x: 100, z: 0 }, 10), true);
});
test('blocked gates fail closed and release every reserved slot', () => {
  const h = room(); obstacle(h, 'asteroid', 0, 0, 2000);
  const before = h.state.entities.size;
  const receipt = materializeWaveBatch(h, request(42));
  assert.equal(receipt.admitted, 0); assert.equal(receipt.deferred, 8);
  assert.equal(h.budget.current(), 0); assert.equal(h.state.entities.size, before);
});
test('failed budget binding rolls back bodies without kill or award receipts', () => {
  const h = room(); h.helpers.spawnBudget = { ...h.budget, bindEntity: () => false };
  const receipt = materializeWaveBatch(h, request(42));
  assert.equal(receipt.admitted, 0); assert.equal(h.budget.current(), 0);
  assert.equal(h.state.entities.size, 1);
  assert.equal(h.events.filter(e => e.event === 'entity:killed' || e.event === 'run:awardRequested').length, 0);
});
test('every admitted hull is armed late at the materialization seam itself', () => {
  const h = room(); h.state.simTime = 7.123;
  const receipt = materializeWaveBatch(h, request(9));
  assert.ok(receipt.admitted > 0);
  for (const id of receipt.spawnedIds) {
    const e = h.state.entities.get(id); assert.ok(held(e, h.state.simTime));
    applyAIFiringIntent({ entityId: id }, h.state);
    assert.equal(e.data.intent.fire, false);
    assert.equal(e.data.intent.fireBlockReason, 'swarm_fire_hold');
  }
});
test('100 seeded crowded arrivals are collision-clear, bounded and reproducible', () => {
  function simulate(seed) {
    const h = room(seed);
    obstacle(h, 'asteroid', -30, -155, 36, 35, 0);
    obstacle(h, 'wreck', 60, -165, 22, -10, 20);
    obstacle(h, 'station', -100, -190, 45);
    const receipt = materializeWaveBatch(h, request(seed));
    const rows = receipt.spawnedIds.map(id => h.state.entities.get(id));
    assert.ok(rows.length > 0, `no admissions for seed ${seed}`);
    for (const e of rows) {
      h.state.entities.delete(e.id);
      assert.ok(swarmPlacementIsClear(h.state, e.pos, e.radius, { velocity: e.vel }), `unsafe seed ${seed}`);
      h.state.entities.set(e.id, e);
      assert.ok(Math.hypot(e.pos.x, e.pos.z) < 430, 'never hides a ship outside the readable gate band');
    }
    return rows.map(e => [e.pos.x, e.pos.z, e.radius]);
  }
  for (let seed = 1; seed <= 100; seed++) assert.deepEqual(simulate(seed), simulate(seed));
});
test('a geometry-starved finite wave stays active, retries its actual recipe, and clears only on defeat', () => {
  const h = room(); const rock = obstacle(h, 'asteroid', 0, 0, 2000);
  const sys = owner(h, plan(6)); tick(h, sys, 120);
  assert.equal(sys._admittedTotal, 0); assert.equal(sys._plannedBodies, 6);
  assert.equal(h.events.filter(e => e.event === WAVE_CLEARED_SEAM).length, 0);
  h.helpers.removeEntity(rock.id); tick(h, sys, 30);
  assert.equal(sys._admittedTotal, 6); assert.equal(sys._cohort.size, 6);
  for (const id of [...sys._cohort.keys()]) h.helpers.removeEntity(id);
  tick(h, sys);
  assert.equal(h.events.filter(e => e.event === WAVE_CLEARED_SEAM).length, 1);
  sys.destroy();
});
test('immutable wave plans can be spaced without corrupting the planner or replay recipe', () => {
  const h = room(4242, 2); const p = plan(6);
  p.schedule = [0, 4, 8].map((atTick, i) => Object.freeze({ ...p.schedule[0], atTick, count: 2, packageIndex: i }));
  Object.freeze(p.schedule); Object.freeze(p.swarm); Object.freeze(p);
  const before = JSON.stringify(p); const sys = owner(h, p);
  assert.equal(JSON.stringify(p), before);
  assert.notEqual(sys._pending[0].entry.atTick, p.schedule[1].atTick);
  sys.destroy();
});
test('duplicate start/planned events cannot zero progress or spawn a second opening', () => {
  const h = room(); const p = plan(); const sys = owner(h, p); tick(h, sys, 12);
  const snapshot = [sys._cursor, sys._admittedTotal, sys._cohort.size, h.budget.current()];
  h.bus.emit('run:waveStarted', { wave: 1 });
  h.bus.emit('run:wavePlanned', { wave: 1, plan: p });
  assert.deepEqual([sys._cursor, sys._admittedTotal, sys._cohort.size, h.budget.current()], snapshot);
  sys.destroy();
});
test('a destruction receipt for a still-live member cannot produce a phantom clear', () => {
  const h = room(); const sys = owner(h, plan(1)); const id = [...sys._cohort.keys()][0];
  sys._onEntityDestroyed({ id, entity: h.state.entities.get(id) }); tick(h, sys);
  assert.equal(sys._cohort.size, 1); assert.equal(sys._resolved, 0); assert.equal(sys._cleared, false);
  sys.destroy();
});
test('a dead player at the same boundary as the last enemy never receives a wave clear', () => {
  const h = room(); const sys = owner(h, plan(1));
  h.helpers.removeEntity([...sys._cohort.keys()][0]); h.player.alive = false; tick(h, sys);
  assert.equal(h.events.filter(e => e.event === WAVE_CLEARED_SEAM).length, 0); sys.destroy();
});
test('the two-shooter cap holds on EVERY tick across fractional arrival grace expiry', () => {
  const h = room(); h.state.simTime = 10.123; const sys = owner(h, plan(6));
  for (let i = 0; i < 300; i++) {
    tick(h, sys);
    const firing = [...sys._cohort.keys()].filter(id => !held(h.state.entities.get(id), h.state.simTime));
    assert.ok(firing.length <= 2, `burst of ${firing.length} on tick ${i}`);
  }
  assert.equal([...sys._cohort.keys()].filter(id => !held(h.state.entities.get(id), h.state.simTime)).length, 2);
  sys.destroy();
});
test('roster admission never deletes a longer encounter-owned hold', () => {
  const h = room(); const sys = owner(h, plan(6)); const e = h.state.entities.get([...sys._cohort.keys()][0]);
  e.data.ai.arrivalHoldUntil = 99;
  tick(h, sys, 210); assert.equal(e.data.ai.arrivalHoldUntil, 99); assert.ok(held(e, h.state.simTime));
  sys.destroy();
});
test('quiet well search returns no field when every authored bearing contains solids', () => {
  const h = room(); obstacle(h, 'asteroid', 0, 0, 500);
  assert.equal(quietWellCenter(h.state, { x: 0, z: 0 }, { x: -24, z: 108 }, 96), null);
});
test('a sleeping teaching well rechecks occupancy before waking', () => {
  const h = room(); const sys = Object.create(swarmArena); Object.assign(sys, h, { _ids: [], _wellIds: [] });
  const registered = [], updates = [];
  sys._fieldsSystem = () => ({ registerEnvironmental: s => { registered.push(s); return s; },
    updateExternal: (id, patch) => updates.push({ id, patch }) });
  sys.helpers = null; // the lesson rock is not part of this well activation test
  sys._installOpeningLesson({ well: { x: -24, z: 108, radius: 96, strength: 90 } });
  assert.equal(registered.length, 1); const c = registered[0].center;
  obstacle(h, 'wreck', c.x, c.z, 30); sys._wakeLessonWell();
  assert.equal(updates.length, 0, 'no autonomous pull through newly occupied furniture');
});
test('debris top-up cannot materialize cover into a hull covering the combat area', () => {
  const h = room(); obstacle(h, 'ship', 0, 0, 2000);
  const sys = Object.create(swarmArena); Object.assign(sys, h, { _ids: [] });
  sys._syncOpticLattice = () => {};
  let spawned = 0; sys._spawnDebrisRock = () => { spawned++; };
  sys._topUp(h.state.run, 1); assert.equal(spawned, 0); assert.equal(sys._terrainRetry, true);
});
test('material variety fallback respects a one-rock remaining terrain budget', () => {
  const h = room();
  for (let i = 0; i < SWARM_DEBRIS_TARGET - 1; i++) {
    const a = i * Math.PI * 2 / (SWARM_DEBRIS_TARGET - 1);
    const e = obstacle(h, 'asteroid', Math.cos(a) * 350, Math.sin(a) * 350, 2);
    e.data[SWARM_DEBRIS_TAG] = true;
  }
  const sys = Object.create(swarmArena); Object.assign(sys, h, { _ids: [] });
  sys._syncOpticLattice = () => {};
  let spawned = 0; sys._spawnDebrisRock = () => ++spawned + 1000;
  sys._topUp(h.state.run, 1); assert.equal(spawned, 1, 'missing material families cannot overfill the room');
});
test('a full wipe earns exactly the authored breath; fresh starvation still fills', () => {
  const bag = createSwarmPressureState(); noteSwarmPressureKills(6, bag);
  assert.equal(swarmReinforceDecision(bag, 10, { alive: 0 }).count, 0);
  for (let i = 1; i < SWARM_BREATH_TICKS; i++) assert.equal(swarmReinforceDecision(bag, 10, { alive: 0 }).count, 0);
  assert.ok(swarmReinforceDecision(bag, 10, { alive: 0 }).count > 0);
  assert.ok(swarmReinforceDecision(createSwarmPressureState(), 10, { alive: 0 }).count > 0);
});
