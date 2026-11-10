// INF-016 — moving-target predictions must not pretend certainty.
//
// A target changing course cannot leave a false release-ready marker: the straight-line
// geometry stays on the existing solver (reachability agrees), but the timed interception
// degrades — no release authorization, stale cache invalidated, distinct degraded cue.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { masslineThrow, assessTargetTurn } from '../src/systems/masslineThrow.js';
import { solveThrowSolution } from '../src/combat/tetherFireControl.js';
import { applyFeatureConfigToMaps, PRODUCTION_FEATURES } from '../src/data/featureFlags.js';

applyFeatureConfigToMaps(PRODUCTION_FEATURES);

const PLAYER_ID = 8;

test('INF-016: steady course keeps the solver read with no degradation', () => {
  let track = null;
  let out = { degraded: true };
  for (let tick = 0; tick < 20; tick += 1) {
    out = assessTargetTurn(track, 5, { x: 60, z: 0 }, tick);
    track = out.track;
  }
  assert.equal(out.degraded, false, 'a straight-line target is never degraded');
  assert.equal(out.turnRate, 0);
});

test('INF-016: a turning target degrades; a slow drifter does not', () => {
  let track = null;
  let out = { degraded: false };
  for (let tick = 0; tick < 20; tick += 1) {
    const a = tick * 0.06;
    out = assessTargetTurn(track, 5, { x: 60 * Math.cos(a), z: 60 * Math.sin(a) }, tick);
    track = out.track;
  }
  assert.equal(out.degraded, true, 'a 3.4 rad/s turn must degrade the read');
  assert.ok(out.turnRate > 1, 'turn rate names the maneuver');

  let slow = null;
  let slowOut = { degraded: true };
  for (let tick = 0; tick < 20; tick += 1) {
    const a = tick * 0.06;
    slowOut = assessTargetTurn(slow, 6, { x: 5 * Math.cos(a), z: 5 * Math.sin(a) }, tick);
    slow = slowOut.track;
  }
  assert.equal(slowOut.degraded, false, 'low-speed heading noise is not a maneuver');

  const switched = assessTargetTurn(track, 7, { x: 60, z: 0 }, 21);
  assert.equal(switched.degraded, false, 'a new target starts with no history against it');
});

test('INF-016: a turning course cannot leave a release-ready marker', () => {
  const h = createHarness();
  const held = makeHostile(200, { x: 0, z: 140 }, { x: 90, z: 0 });
  const freighter = makeTrader(300, { x: 900, z: 0 }, { x: -60, z: 0 });
  h.add(held, freighter);
  h.latch(held.id);
  h.state.player.targetId = freighter.id;

  const system = startThrowSystem(h.state);
  let runtime = stepThrowSystem(system, h.state);
  assert.ok(runtime.solution, 'precondition: a latched target publishes a solution read');
  assert.equal(runtime.solution.degraded, false, 'precondition: steady course is not degraded');
  assert.equal(runtime.solution.reachable, runtime.solution.valid,
    'reachability rides the straight-line solver verdict');

  // The straight-line read agrees with the existing solver on current endpoints.
  const direct = solveThrowSolution(
    { pos: held.pos, vel: held.vel, radius: held.radius },
    { pos: freighter.pos, vel: freighter.vel, radius: freighter.radius },
  );
  assert.equal(runtime.solution.valid, direct.valid);
  assert.ok(Math.abs(runtime.solution.interceptAngle - direct.interceptAngle) < 1e-9,
    'degradation never re-aims the geometry');

  // The target turns hard for a third of a second.
  for (let i = 0; i < 20; i += 1) {
    const a = (i + 1) * 0.06;
    freighter.vel.x = -60 * Math.cos(a);
    freighter.vel.z = 60 * Math.sin(a);
    h.state.tick += 1;
    h.state.simTime = h.state.tick / 60;
    runtime = stepThrowSystem(system, h.state);
  }
  assert.equal(runtime.solution.degraded, true, 'the turn trips degraded confidence');
  assert.equal(runtime.solution.onSolution, false, 'no release-ready marker from a pre-turn course');
  assert.equal(runtime.solution.valid, true, 'the geometry itself stays reachable');
  assert.equal((h.state.__thrown || []).length, 0, 'a degraded read authorizes no throw');
  assert.ok(runtime.solution.turnRate > 1);

  // The course steadies again: the read recovers on current truth.
  for (let i = 0; i < 20; i += 1) {
    h.state.tick += 1;
    h.state.simTime = h.state.tick / 60;
    runtime = stepThrowSystem(system, h.state);
  }
  assert.equal(runtime.solution.degraded, false, 'a steady course clears the degradation');
  system.destroy();
});

function createHarness() {
  const state = createGameState(0x5a);
  state.mode = 'flight';
  state.tick = 100;
  state.simTime = 100 / 60;
  state.playerId = PLAYER_ID;
  state.entities.clear();
  state.entityList = state.entityList || [];
  state.entityList.length = 0;

  const player = {
    id: PLAYER_ID, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, maxSpeed: 120, radius: 8, mass: 200,
    flags: {}, cap: 100,
    data: { weapons: [], combat: {}, derived: { cap: 100 } },
  };
  state.entities.set(PLAYER_ID, player);
  state.entityList.push(player);

  state.player.tether = { active: false, targetId: null, phase: 'slack', restLength: 0 };
  state.player.targetId = null;
  state.input.autoFire = true;
  state.input.actions = state.input.actions || {};
  state.input.aimWorld = { x: 0, z: 0 };

  const harness = { state, busEmit: () => {} };
  harness.add = (...entities) => {
    for (const e of entities) {
      state.entities.set(e.id, e);
      state.entityList.push(e);
    }
  };
  harness.latch = (targetId, extra = {}) => {
    state.player.tether = {
      active: true, targetId, phase: 'slack', restLength: 0, strain: 0, attachmentId: null, ...extra,
    };
  };
  return harness;
}

function startThrowSystem(state) {
  const system = Object.create(masslineThrow);
  system.init({
    state,
    bus: {
      on: () => () => {},
      emit: (name, payload) => {
        if (name === 'massline:throw') (state.__thrown = state.__thrown || []).push(payload);
      },
    },
    helpers: {},
    registry: { get: () => null },
  });
  return system;
}

function stepThrowSystem(system, state, armed = true) {
  state.input.actions.throwArm = armed;
  system.update(1 / 60, state);
  return state.massline2.throw;
}

function makeHostile(id, pos, vel) {
  return {
    id, type: 'ship', alive: true, team: 1,
    pos: { ...pos }, vel: { ...vel }, rot: 0, angVel: 0, maxSpeed: 120, radius: 10, mass: 500,
    data: { combat: {}, ai: { huntPlayer: true } },
  };
}

function makeTrader(id, pos, vel) {
  return {
    id, type: 'ship', alive: true, team: 3,
    pos: { ...pos }, vel: { ...vel }, rot: 0, angVel: 0, maxSpeed: 60, radius: 16, mass: 4200,
    data: { combat: {}, ai: { archetype: 'trader', passive: true } },
  };
}
