/**
 * PQ-206.02 — Degenerate flee-cell egress bound.
 *
 * Pins the two repairs that bound the "kite 10k WU" cell without removing authored flee:
 *   1. `stepEgressExits` (src/ai/egressExit.js): a hull under a live flee order that has stacked
 *      960 WU of separation from the player commits to the engine's ordinary despawnAt sweep;
 *      re-closing inside the bound or the order ending releases our stamp (and only ours).
 *   2. wingMorale scatter expiry restores `ai.fsm`: the `until` hold used to clear every field
 *      except the one effectiveActivityForAI reads at every decision gate, leaving survivors
 *      forced-flee forever instead of re-pressing after the shock.
 *
 * RUN: `node --test test/pq206-02-egress-exit.test.mjs`
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  stepEgressExits, fleeOrderActive, EGRESS_DISTANCE_WU, EGRESS_FADE_S, EGRESS_SCAN_TICKS,
} from '../src/ai/egressExit.js';
import { wingMorale } from '../src/systems/wingMorale.js';
import { effectiveActivityForAI } from '../src/ai/doctrine.js';

function makeBus() {
  const emitted = [];
  return { emitted, emit: (name, payload) => emitted.push({ name, payload }), on: () => {}, off: () => {}, queue: (name, payload) => emitted.push({ name, payload }) };
}

function ship(id, { pos = { x: 0, z: 0 }, ai = {}, data = {}, team = 1 } = {}) {
  return { id, type: 'ship', alive: true, team, pos, prevPos: { ...pos }, data: { ...data, ai: { ...ai } } };
}

function makeState({ playerPos = { x: 0, z: 0 }, entities = [], tick = 30, simTime = 100, live = {} } = {}) {
  const map = new Map();
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: playerPos, data: {} };
  map.set(1, player);
  for (const e of entities) map.set(e.id, e);
  return {
    playerId: 1,
    entities: map,
    entityList: [player, ...entities],
    tick,
    simTime,
    ui: {},
    encounterDirector: { live },
  };
}

test('a fleeing hostile past 960 WU commits to the despawn sweep', () => {
  const bus = makeBus();
  const hostile = ship(2, { pos: { x: EGRESS_DISTANCE_WU + 40, z: 0 }, ai: { forceFlee: true, hostileTeams: [0] } });
  const state = makeState({ entities: [hostile] });
  stepEgressExits(state, state.entityList, bus);
  assert.ok(Number.isFinite(hostile.data.despawnAt), 'fleeing hull at the egress bound schedules its exit');
  assert.equal(hostile.data.despawnAt, state.simTime + EGRESS_FADE_S);
  assert.equal(hostile.data._egressExitAt, hostile.data.despawnAt);
  const ev = bus.emitted.find((e) => e.name === 'ai:egressExit');
  assert.ok(ev, 'the exit emits the observability seam');
  assert.equal(ev.payload.entityId, 2);
});

test('the stamp releases when the pilot closes back inside the bound', () => {
  const bus = makeBus();
  const hostile = ship(2, { pos: { x: 1200, z: 0 }, ai: { forceFlee: true } });
  const state = makeState({ entities: [hostile] });
  stepEgressExits(state, state.entityList, bus);
  assert.ok(hostile.data.despawnAt != null);
  hostile.pos = { x: 300, z: 0 }; // pilot chased it back inside the bound
  state.tick += EGRESS_SCAN_TICKS;
  stepEgressExits(state, state.entityList, bus);
  assert.equal(hostile.data.despawnAt, undefined, 'our stamp releases — the pilot can finish this fight');
  assert.equal(hostile.data._egressExitAt, undefined);
});

test('the stamp releases when the flee order ends before the fade fires', () => {
  const hostile = ship(2, { pos: { x: 1200, z: 0 }, ai: { forceFlee: true, fsm: 'flee' } });
  const state = makeState({ entities: [hostile] });
  stepEgressExits(state, state.entityList, makeBus());
  assert.ok(hostile.data.despawnAt != null);
  delete hostile.data.ai.forceFlee;
  delete hostile.data.ai.fsm; // hold expired; the hull re-commits
  state.tick += EGRESS_SCAN_TICKS;
  stepEgressExits(state, state.entityList, makeBus());
  assert.equal(hostile.data.despawnAt, undefined);
});

test('foreign despawnAt stamps are never written over or released', () => {
  const foreign = ship(2, { pos: { x: 1500, z: 0 }, ai: { forceFlee: true }, data: { despawnAt: 5000 } });
  const state = makeState({ entities: [foreign], simTime: 100 });
  stepEgressExits(state, state.entityList, makeBus());
  assert.equal(foreign.data.despawnAt, 5000, 'an authored despawn clock is foreign-owned');
  // Flee ends — our system must not clear a stamp it did not write.
  delete foreign.data.ai.forceFlee;
  state.tick += EGRESS_SCAN_TICKS;
  stepEgressExits(state, state.entityList, makeBus());
  assert.equal(foreign.data.despawnAt, 5000);
});

test('protected hulls never egress: moraleImmune, arena survival, encounter-owned, player team', () => {
  const cases = [
    ship(10, { pos: { x: 2000, z: 0 }, ai: { forceFlee: true, moraleImmune: true } }),
    ship(11, { pos: { x: 2000, z: 0 }, ai: { forceFlee: true }, data: { runCohort: 'survival' } }),
    ship(12, { pos: { x: 2000, z: 0 }, ai: { fsm: 'flee' }, team: 0 }),
    ship(13, { pos: { x: 2000, z: 0 }, ai: { forceFlee: true }, data: { encounter: { id: 'enc_x' } } }),
  ];
  const state = makeState({ entities: cases });
  stepEgressExits(state, state.entityList, makeBus());
  for (const e of cases) assert.equal(e.data.despawnAt, undefined, `entity ${e.id} must not egress`);
});

test('encounter roster membership is protected even without a data marker', () => {
  const scripted = ship(20, { pos: { x: 2000, z: 0 }, ai: { forceFlee: true } });
  const state = makeState({ entities: [scripted], live: { enc_1: { phase: 'conflict', ids: [20] } } });
  stepEgressExits(state, state.entityList, makeBus());
  assert.equal(scripted.data.despawnAt, undefined);
});

test('the scan is cadence-gated: off-tick calls do not stamp or release', () => {
  const hostile = ship(2, { pos: { x: 1200, z: 0 }, ai: { forceFlee: true } });
  const state = makeState({ entities: [hostile], tick: 31 }); // 31 % 15 !== 0
  stepEgressExits(state, state.entityList, makeBus());
  assert.equal(hostile.data.despawnAt, undefined);
});

test('fleeOrderActive covers every live stamp shape', () => {
  assert.equal(fleeOrderActive({ forceFlee: true }), true);
  assert.equal(fleeOrderActive({ fsm: 'flee' }), true);
  assert.equal(fleeOrderActive({ activity: { kind: 'flee' } }), true);
  assert.equal(fleeOrderActive({ activity: { kind: 'disengage' } }), true);
  assert.equal(fleeOrderActive({ fsm: 'attack' }), false);
  assert.equal(fleeOrderActive(null), false);
});

test('wingMorale scatter expiry restores fsm so the survivor re-presses', () => {
  const bus = makeBus();
  const state = makeState({ simTime: 10 });
  const leader = ship(2, { ai: { squadId: 'sq_1', preferredRole: 'leader' }, data: { role: 'leader' } });
  const wingmate = ship(3, { ai: { squadId: 'sq_1', preferredRole: 'escort' }, data: { role: 'escort' } });
  for (const e of [leader, wingmate]) state.entities.set(e.id, e);
  state.entityList.push(leader, wingmate);

  const sys = Object.create(wingMorale);
  sys.init({ state, bus, helpers: {} });
  sys._onEntityKilled({ id: leader.id, pos: { x: 0, z: 0 } });

  const ai = wingmate.data.ai;
  assert.equal(ai.forceFlee, true, 'scatter stamps the survival flee');
  assert.equal(ai.fsm, 'flee');
  assert.equal(effectiveActivityForAI(ai).kind, 'flee', 'the forced order reads at the gate');

  state.simTime = ai._wingMoraleUntil + 0.01; // hold expires
  sys.update(1 / 60, state);
  assert.equal(ai.forceFlee, undefined, 'flee hold released');
  assert.equal(ai.fsm, undefined, 'fsm must restore — authored scatter is a shock, not a rout');
  assert.notEqual((effectiveActivityForAI(ai) || {}).kind, 'flee', 'the hull can re-press');
});

test('scatter expiry leaves a foreign fsm untouched', () => {
  const bus = makeBus();
  const state = makeState({ simTime: 10 });
  const leader = ship(2, { ai: { squadId: 'sq_2', preferredRole: 'leader' }, data: { role: 'leader' } });
  const wingmate = ship(3, { ai: { squadId: 'sq_2', preferredRole: 'escort' }, data: { role: 'escort' } });
  for (const e of [leader, wingmate]) state.entities.set(e.id, e);
  state.entityList.push(leader, wingmate);

  const sys = Object.create(wingMorale);
  sys.init({ state, bus, helpers: {} });
  sys._onEntityKilled({ id: leader.id, pos: { x: 0, z: 0 } });

  const ai = wingmate.data.ai;
  delete ai._wingMoraleUntil; // another owner re-stamped the flee without our marker
  state.simTime += 30;
  sys.update(1 / 60, state);
  assert.equal(ai.fsm, 'flee', 'only the scatter-owned stamp expires');
});
