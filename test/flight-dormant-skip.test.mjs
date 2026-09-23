import assert from 'node:assert/strict';
import test from 'node:test';

import { SIM_TIER } from '../src/world/activityClassification.js';
import { entityNeedsFlightStep } from '../src/world/activityRuntime.js';
import { npcFlightNeedsCommand } from '../src/systems/flightV3.js';
import { flight } from '../src/systems/flight.js';

test('entityNeedsFlightStep keeps exact/near and unclassified craft', () => {
  assert.equal(entityNeedsFlightStep({ alive: true }), true, 'no activity stamp → keep prior behavior');
  assert.equal(entityNeedsFlightStep({
    alive: true,
    activity: { simTier: SIM_TIER.S0_EXACT },
  }), true);
  assert.equal(entityNeedsFlightStep({
    alive: true,
    activity: { simTier: SIM_TIER.S1_NEAR },
  }), true);
  assert.equal(entityNeedsFlightStep({
    alive: true,
    activity: { simTier: SIM_TIER.S3_DORMANT, pinnedExact: true },
  }), true);
});

test('entityNeedsFlightStep shelves abstract/dormant/aggregate unless intent is live', () => {
  const dormant = {
    alive: true,
    activity: { simTier: SIM_TIER.S3_DORMANT },
    vel: { x: 12, z: 0 },
    data: {},
  };
  assert.equal(entityNeedsFlightStep(dormant), false);
  // Residual velocity alone must not keep a shelved actor on the 60 Hz integrator.
  assert.equal(npcFlightNeedsCommand(dormant), true, 'V3 motion gate alone would still step');
  dormant.data.intent = { moveX: 0.5, moveZ: 0 };
  assert.equal(entityNeedsFlightStep(dormant), true, 'wake-edge intent still steps');
});

test('legacy flight.update skips continuous drag on dormant ships', () => {
  const dormant = {
    id: 2,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 40, z: 0 },
    rot: 0,
    maxSpeed: 100,
    activity: { simTier: SIM_TIER.S3_DORMANT },
    data: {},
    flags: {},
  };
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    maxSpeed: 100,
    flags: { docked: true },
    boost: { energy: 0, max: 0, drainRate: 0, regenRate: 0, dashCdT: 0, dashCd: 1, dashCost: 1, dashImpulse: 0 },
  };
  const state = {
    mode: 'docked',
    playerId: 1,
    tick: 10,
    entities: new Map([[1, player], [2, dormant]]),
    entityList: [player, dormant],
    entityIndex: { __spacefaceEntityIndexV1: true, shipLike: [player, dormant] },
    input: {},
    ui: { screenStack: [] },
  };
  const before = dormant.vel.x;
  const sys = Object.create(flight);
  sys.state = state;
  sys.bus = { emit() {} };
  sys._diag = {};
  sys._publishDiagnostics = () => {};
  sys._cancelPlayerBoost = () => {};
  sys.update(1 / 60, state);
  assert.equal(dormant.vel.x, before, 'dormant velocity unchanged without intent');
});
