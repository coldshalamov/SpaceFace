import test from 'node:test';
import assert from 'node:assert/strict';

import { ai, clearReinforcementArrival } from '../src/systems/ai.js';

// INF-028 — caller-anchored reinforcements arrive fair and physical.
//
// The reaver-style call rolls a ring position around the dying caller, then waits 1.5-2.5 s
// while everyone keeps flying — a boosting player can cross the whole ring in that window, so
// the call-time point is re-checked against the player's LIVE position at spawn and pushed out
// to a clearance floor. Fresh arrivals additionally hold fire for their ingress beat, so the
// earliest damaging action always follows the call-time warning, never the spawn tick.

function makePlayer() {
  return {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 14,
    hull: 140, hullMax: 140, data: {},
  };
}

function makeState(player, pendings, simTime = 100) {
  return {
    mode: 'flight',
    tick: 600,
    simTime,
    rng: () => 0.5,
    playerId: 1,
    entities: new Map([[1, player]]),
    entityList: [player],
    combat: {
      threatTables: new Map(),
      pendingReinforcements: pendings,
    },
    meta: { seed: 7 },
  };
}

function initAi(state, captured) {
  const bus = { on() { return () => {}; }, emit() {} };
  ai.init({ state, bus, helpers: { spawnEntity: (spec) => { captured.push(spec); return { id: 50 + captured.length }; } } });
}

test('spawn-time clearance slides arrivals out of the player bubble', () => {
  assert.deepEqual(clearReinforcementArrival({ x: 500, z: 0 }, { x: 0, z: 0 }), { x: 500, z: 0 });
  assert.deepEqual(clearReinforcementArrival({ x: 30, z: 0 }, { x: 0, z: 0 }), { x: 120, z: 0 });
  assert.deepEqual(clearReinforcementArrival({ x: 0, z: -60 }, { x: 0, z: 0 }), { x: 0, z: -120 });
  // Degenerate overlap resolves deterministically instead of dividing by zero.
  assert.deepEqual(clearReinforcementArrival({ x: 0, z: 0 }, { x: 0, z: 0 }), { x: 120, z: 0 });
  // Missing positions pass through: nothing to clear against.
  const pos = { x: 30, z: 0 };
  assert.equal(clearReinforcementArrival(pos, null), pos);
  // Boundary is inclusive: exactly at the floor holds its lane.
  assert.deepEqual(clearReinforcementArrival({ x: 120, z: 0 }, { x: 0, z: 0 }), { x: 120, z: 0 });
});

test('the legacy call path spawns clear of a fast player and holds fire on arrival', () => {
  const player = makePlayer();
  const captured = [];
  const state = makeState(player, [
    { typeId: 'wasp_swarmer', level: 1, pos: { x: 30, z: 0 }, spawnAt: 99 },
    { typeId: 'wasp_swarmer', level: 1, pos: { x: 500, z: 0 }, spawnAt: 99 },
  ]);
  initAi(state, captured);
  ai.update(1 / 60, state);
  assert.equal(captured.length, 2);
  // The queue drains newest-first; order the captures by lane before asserting.
  const lanes = captured
    .map((spec) => ({ x: spec.pos.x, z: spec.pos.z }))
    .sort((a, b) => a.x - b.x);
  assert.deepEqual(lanes[0], { x: 120, z: 0 });
  assert.deepEqual(lanes[1], { x: 500, z: 0 });
  for (const spec of captured) {
    assert.equal(spec.data.ai.arrivalHoldUntil, 102, 'guns stay silent for the ingress beat');
    assert.equal(spec.data.reinforcements, null, 'arrivals never chain-call');
  }
  assert.equal(state.combat.pendingReinforcements.length, 0, 'due packages leave the queue');
});

function makeArrival() {
  const npc = {
    id: 2, type: 'ship', alive: true, team: 1,
    pos: { x: 300, z: 0 }, vel: { x: 0, z: 0 }, rot: Math.PI, radius: 12,
    hull: 55, hullMax: 55, data: {},
  };
  npc.data.ai = {
    archetype: 'swarmer', fsm: 'attack', _t: 0, _lostT: 0, _retarget: 999, _wanderAng: Math.PI,
    arrivalHoldUntil: 102,
  };
  npc.data.combat = { targetId: 1, lockTarget: null, lockProgress: 0 };
  npc.data.weapons = [{ projSpeed: 340 }];
  npc.data.intent = { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0 };
  return npc;
}

test('a fresh arrival steers but holds fire; the beat ends in real gunnery', () => {
  const player = makePlayer();
  const npc = makeArrival();
  const state = makeState(player, [], 100);
  state.entities.set(2, npc);
  state.entityList.push(npc);
  initAi(state, []);
  ai._think(npc, npc.data, state, player, 1 / 60);
  assert.equal(npc.data.intent.fire, false, 'silent while the ingress beat runs');
  assert.equal(npc.data.ai.arrivalHoldUntil, 102, 'the marker survives the beat it measures');
  state.simTime = 102.5;
  ai._think(npc, npc.data, state, player, 1 / 60);
  assert.equal(npc.data.intent.fire, true, 'a lined-up shot breaks the silence after the beat');
  assert.equal(npc.data.ai.arrivalHoldUntil, undefined, 'the marker self-clears on expiry');
});

test('ordinary hulls never carry the arrival marker', () => {
  const player = makePlayer();
  const npc = makeArrival();
  delete npc.data.ai.arrivalHoldUntil;
  const state = makeState(player, [], 100);
  state.entities.set(2, npc);
  state.entityList.push(npc);
  initAi(state, []);
  ai._think(npc, npc.data, state, player, 1 / 60);
  assert.equal(npc.data.intent.fire, true, 'no marker, no hold: established gunnery untouched');
});
