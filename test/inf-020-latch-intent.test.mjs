// INF-020 — hold and throw-arm read one latch intent.
//
// The hold half (tetherFire) latches the line; the arm half (throwArm) is gated on live
// latch state in input and re-checked against the live tether every tick in the throw
// system. Latch expiry resets the whole throw runtime — queued snaps, arm authorization,
// and the HUD mirror — so an armed throw can never outlive its latch, and a stale held
// arm after re-latch is not a fresh press.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { masslineThrow } from '../src/systems/masslineThrow.js';
import { applyFeatureConfigToMaps, PRODUCTION_FEATURES } from '../src/data/featureFlags.js';

applyFeatureConfigToMaps(PRODUCTION_FEATURES);

const PLAYER_ID = 8;

test('INF-020: an unlatched arm is not a throw and not an armed cue', () => {
  const h = createHarness();
  const held = makeHostile(200, { x: 0, z: 140 }, { x: 90, z: 0 });
  h.add(held);
  const system = startThrowSystem(h.state);
  try {
    h.state.input.actions.throwArm = true;
    system.update(1 / 60, h.state);
    const runtime = h.state.massline2.throw;
    assert.equal(runtime.armed, false, 'no latch, no arm');
    assert.equal(thrown(h.state).length, 0, 'the throw never fires from rejected input');
  } finally {
    system.destroy();
  }
});

test('INF-020: latch expiry strands no armed throw, and a stale held arm is not a press', () => {
  const h = createHarness();
  const held = makeHostile(200, { x: 0, z: 140 }, { x: 90, z: 0 });
  const freighter = makeTrader(300, { x: 900, z: 0 }, { x: -60, z: 0 });
  h.add(held, freighter);
  h.latch(held.id);
  h.state.player.targetId = freighter.id;
  const system = startThrowSystem(h.state);
  try {
    h.state.input.actions.throwArm = true;
    system.update(1 / 60, h.state);

    // The latch expires mid-arm (break, cut, or target loss — all land here).
    h.state.player.tether = { active: false, targetId: null, phase: 'slack', restLength: 0 };
    h.state.input.actions.throwArm = false;
    h.state.tick += 1;
    h.state.simTime = h.state.tick / 60;
    system.update(1 / 60, h.state);
    const runtime = h.state.massline2.throw;
    assert.equal(runtime.armed, false, 'expiry clears the armed cue the HUD reads');
    assert.equal(runtime.solution, null, 'expiry clears the solution mirror too');
    const throwsAfterExpiry = thrown(h.state).length;

    // Re-latch the same payload with the arm input still physically held (the input gate
    // normally clears this; the throw system must reject it even if the gate ever fails).
    h.latch(held.id);
    h.state.input.actions.throwArm = true;
    h.state.tick += 1;
    h.state.simTime = h.state.tick / 60;
    system.update(1 / 60, h.state);
    assert.equal(thrown(h.state).length, throwsAfterExpiry,
      'a stale held arm after re-latch fires nothing without a fresh press');
  } finally {
    system.destroy();
  }
});

function thrown(state) {
  return state.__thrown || [];
}

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

  const harness = { state };
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
