import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PREDICT_GATE_ARM_SECONDS,
  PREDICT_GATE_HOLD_SECONDS,
  predictNextSector,
} from '../src/render/sectorPredict.js';
import { updatePredictedSectorPrewarm } from '../src/render/renderer.js';

function makeGate(id, sectorId, gateTo, pos, extra = {}) {
  return {
    id,
    type: 'station',
    alive: true,
    pos,
    vel: { x: 0, z: 0 },
    radius: 32,
    data: { isGate: true, gateTo, dockRadius: 70, sectorId, ...extra },
  };
}

function makePlayer(pos, vel = { x: 0, z: 0 }) {
  return { id: 'player', isPlayer: true, type: 'ship', alive: true, pos, vel, data: {} };
}

function makeState({ currentSectorId = 'alpha', nav = {}, jumpState = 'IDLE', entities = [] } = {}) {
  const map = new Map();
  for (const entity of entities) map.set(entity.id, entity);
  return {
    mode: 'flight',
    simTime: 0,
    playerId: 'player',
    world: { currentSectorId },
    jump: { state: jumpState },
    entities: map,
    entityList: entities,
    nav: { autoTravel: false, route: null, waypoint: null, autopilot: { active: false }, ...nav },
  };
}

test('predictNextSector follows the engaged route executor leg', () => {
  const state = makeState({
    nav: {
      autoTravel: true,
      route: { legs: [{ from: 'alpha', to: 'beta' }, { from: 'beta', to: 'gamma' }] },
      executor: {
        engaged: true,
        status: 'acquiring',
        legIndex: 0,
        legs: [{ fromSectorId: 'alpha', toSectorId: 'beta', index: 0 }],
      },
    },
  });
  const hit = predictNextSector(state);
  assert.equal(hit.sectorId, 'beta');
  assert.equal(hit.source, 'route-executor');
});

test('predictNextSector skips an arrived executor and falls to the plotted leg', () => {
  const state = makeState({
    nav: {
      autoTravel: true,
      route: { legs: [{ from: 'alpha', to: 'beta' }] },
      executor: { engaged: true, status: 'arrived', legIndex: 0, legs: [{ toSectorId: 'beta' }] },
    },
  });
  const hit = predictNextSector(state);
  assert.equal(hit.sectorId, 'beta');
  assert.equal(hit.source, 'route-plotted');
});

test('predictNextSector reads the autopilot gate entity target', () => {
  const gate = makeGate('g1', 'alpha', 'beta', { x: 9000, z: 0 });
  const state = makeState({
    entities: [gate, makePlayer({ x: 0, z: 0 })],
    nav: { autopilot: { active: true, targetEntityId: 'g1' } },
  });
  const hit = predictNextSector(state);
  assert.equal(hit.sectorId, 'beta');
  assert.equal(hit.source, 'autopilot-gate');
});

test('predictNextSector reads waypoint targetSectorId only while autopilot is active', () => {
  const base = {
    nav: {
      autopilot: { active: true },
      waypoint: { targetSectorId: 'beta' },
    },
  };
  assert.equal(predictNextSector(makeState(base)).sectorId, 'beta');
  const idle = makeState({
    nav: { autopilot: { active: false }, waypoint: { targetSectorId: 'beta' } },
  });
  assert.equal(predictNextSector(idle), null);
});

test('predictNextSector never predicts the current sector', () => {
  const gate = makeGate('g1', 'alpha', 'alpha', { x: 100, z: 0 });
  const state = makeState({
    entities: [gate, makePlayer({ x: 0, z: 0 }, { x: 100, z: 0 })],
  });
  assert.equal(predictNextSector(state), null);
});

test('predictNextSector kinematic gate approach arms on closing', () => {
  // 3000 WU out, closing at 120 WU/s: ballistic enter to the 260 WU capture
  // disc lands ~23 s out — inside the 30 s arm horizon.
  const gate = makeGate('g1', 'alpha', 'beta', { x: 3000, z: 0 });
  const state = makeState({
    entities: [gate, makePlayer({ x: 0, z: 0 }, { x: 120, z: 0 })],
  });
  const hit = predictNextSector(state);
  assert.equal(hit.sectorId, 'beta');
  assert.equal(hit.source, 'gate-approach');
  assert.ok(hit.ttcSeconds > 0 && hit.ttcSeconds <= PREDICT_GATE_ARM_SECONDS);
});

test('predictNextSector kinematic leg refuses fly-bys and retreats', () => {
  const gate = makeGate('g1', 'alpha', 'beta', { x: 2000, z: 0 });
  // Passing parallel to the gate: the ballistic path never enters the disc.
  const flyBy = makeState({
    entities: [gate, makePlayer({ x: 0, z: 2000 }, { x: 120, z: 0 })],
  });
  assert.equal(predictNextSector(flyBy), null);
  // Flying away from it.
  const retreat = makeState({
    entities: [gate, makePlayer({ x: 0, z: 0 }, { x: -120, z: 0 })],
  });
  assert.equal(predictNextSector(retreat), null);
});

test('predictNextSector kinematic leg ignores gates outside the current sector', () => {
  const gate = makeGate('g1', 'gamma', 'beta', { x: 2000, z: 0 });
  const state = makeState({
    entities: [gate, makePlayer({ x: 0, z: 0 }, { x: 120, z: 0 })],
  });
  assert.equal(predictNextSector(state), null);
});

test('predictNextSector holds a kinematic prediction on the long horizon', () => {
  // Decelerating far out: 2500 WU at 20 WU/s enters the disc in ~112 s — beyond the
  // 30 s arm horizon but inside the 120 s hold horizon only for the held sector.
  const gate = makeGate('g1', 'alpha', 'beta', { x: 2500, z: 0 });
  const state = makeState({
    entities: [gate, makePlayer({ x: 0, z: 0 }, { x: 20, z: 0 })],
  });
  assert.equal(predictNextSector(state), null);
  const held = predictNextSector(state, { heldSectorId: 'beta' });
  assert.equal(held.sectorId, 'beta');
  assert.ok(held.ttcSeconds <= PREDICT_GATE_HOLD_SECONDS);
});

test('predictNextSector prefers declared intent over kinematics', () => {
  const gate = makeGate('g1', 'alpha', 'gamma', { x: 2000, z: 0 });
  const state = makeState({
    entities: [gate, makePlayer({ x: 0, z: 0 }, { x: 120, z: 0 })],
    nav: { autopilot: { active: true }, waypoint: { targetSectorId: 'beta' } },
  });
  const hit = predictNextSector(state);
  assert.equal(hit.sectorId, 'beta');
  assert.equal(hit.source, 'waypoint-sector');
});

function makeOwner(state, { requests = [{ url: '/x.glb', slot: 'a' }, { url: '/y.glb', slot: 'b' }] } = {}) {
  const calls = [];
  const released = [];
  const owner = {
    state,
    _incomingSectorPrewarm: null,
    _authoredSectorPrewarmPending: null,
    _currentSectorPrewarm: null,
    _predictedSectorWarm: null,
    _sectorPrewarmRequests(sectorId) {
      calls.push({ kind: 'census', sectorId });
      return requests;
    },
    _assetResidency: {
      releaseOwner(warmOwner, reason) {
        released.push({ owner: warmOwner, reason });
        return 0;
      },
    },
    calls,
    released,
  };
  return owner;
}

test('updatePredictedSectorPrewarm warms the predicted sector census', () => {
  const state = makeState({
    nav: {
      autoTravel: true,
      route: { legs: [{ from: 'alpha', to: 'beta' }] },
    },
  });
  const owner = makeOwner(state);
  updatePredictedSectorPrewarm(owner);
  assert.equal(owner.calls.length, 1);
  assert.equal(owner.calls[0].sectorId, 'beta');
  const warm = owner._predictedSectorWarm;
  assert.ok(warm);
  assert.equal(warm.sectorId, 'beta');
  assert.equal(warm.active, true);
  assert.equal(warm.requestCount, 2);
  assert.equal(warm.source, 'route-plotted');
  assert.equal(warm.owner.type, 'predicted-sector-warm');
  // Never touches the authored record slots.
  assert.equal(owner._incomingSectorPrewarm, null);
  // Steady state: same prediction, no churn.
  updatePredictedSectorPrewarm(owner);
  assert.equal(owner.calls.length, 1);
  assert.equal(owner.released.length, 0);
});

test('updatePredictedSectorPrewarm retracts when the prediction drops', () => {
  const state = makeState({
    nav: { autoTravel: true, route: { legs: [{ from: 'alpha', to: 'beta' }] } },
  });
  const owner = makeOwner(state);
  updatePredictedSectorPrewarm(owner);
  const warm = owner._predictedSectorWarm;
  state.nav.route = null;
  state.nav.autoTravel = false;
  updatePredictedSectorPrewarm(owner);
  assert.equal(warm.active, false);
  assert.equal(owner._predictedSectorWarm, null);
  assert.equal(owner.released.length, 1);
  assert.equal(owner.released[0].reason, 'predicted-sector-warm-retracted');
  assert.equal(owner.released[0].owner.type, 'predicted-sector-warm');
});

test('updatePredictedSectorPrewarm supersedes when the prediction moves', () => {
  const state = makeState({
    nav: { autoTravel: true, route: { legs: [{ from: 'alpha', to: 'beta' }] } },
  });
  const owner = makeOwner(state);
  updatePredictedSectorPrewarm(owner);
  const stale = owner._predictedSectorWarm;
  state.nav.route = { legs: [{ from: 'alpha', to: 'gamma' }] };
  updatePredictedSectorPrewarm(owner);
  assert.equal(stale.active, false);
  assert.equal(owner.released.length, 1);
  assert.equal(owner.released[0].reason, 'predicted-sector-warm-retracted');
  assert.equal(owner._predictedSectorWarm.sectorId, 'gamma');
  assert.equal(owner._predictedSectorWarm.active, true);
});

test('updatePredictedSectorPrewarm never warms a sector a record already owns', () => {
  const state = makeState({
    nav: { autoTravel: true, route: { legs: [{ from: 'alpha', to: 'beta' }] } },
  });
  const owner = makeOwner(state);
  owner._incomingSectorPrewarm = { sectorId: 'beta', active: true, stageBoundaries: true };
  updatePredictedSectorPrewarm(owner);
  assert.equal(owner.calls.length, 0);
  assert.equal(owner._predictedSectorWarm, null);
  owner._incomingSectorPrewarm = null;
  owner._currentSectorPrewarm = { sectorId: 'beta', active: true };
  updatePredictedSectorPrewarm(owner);
  assert.equal(owner._predictedSectorWarm, null);
});

test('updatePredictedSectorPrewarm is absorbed once an authored record claims the sector', () => {
  const state = makeState({
    nav: { autoTravel: true, route: { legs: [{ from: 'alpha', to: 'beta' }] } },
  });
  const owner = makeOwner(state);
  updatePredictedSectorPrewarm(owner);
  const warm = owner._predictedSectorWarm;
  // chargeStart creates the authored record for the same sector.
  owner._incomingSectorPrewarm = { sectorId: 'beta', active: true, stageBoundaries: true };
  updatePredictedSectorPrewarm(owner);
  assert.equal(warm.active, false);
  assert.equal(owner._predictedSectorWarm, null);
  assert.equal(owner.released.length, 1);
  assert.equal(owner.released[0].reason, 'predicted-sector-warm-absorbed');
});

test('updatePredictedSectorPrewarm does nothing off the flight mode or without seams', () => {
  const state = makeState({
    nav: { autoTravel: true, route: { legs: [{ from: 'alpha', to: 'beta' }] } },
  });
  state.mode = 'station';
  const owner = makeOwner(state);
  updatePredictedSectorPrewarm(owner);
  assert.equal(owner.calls.length, 0);
  state.mode = 'flight';
  const bare = { state };
  updatePredictedSectorPrewarm(bare);
  assert.equal(bare._predictedSectorWarm, undefined);
});
