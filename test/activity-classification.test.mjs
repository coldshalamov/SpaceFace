import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PIN_REASON,
  PRESENTATION_TIER,
  SIM_TIER,
  classifyActivity,
  physicsReachWu,
  resolvePins,
  resolvePresentationTier,
  resolveSimTier,
} from '../src/world/activityClassification.js';

test('player and glass visibility pin exact simulation', () => {
  const player = { id: 1, isPlayer: true, pos: { x: 0, z: 0 } };
  const classified = classifyActivity(player, {
    playerId: 1,
    visibleOnGlass: true,
    onGlass: true,
    origin: { x: 0, z: 0 },
    physicsReachWu: 40,
  });
  assert.equal(classified.simTier, SIM_TIER.S0_EXACT);
  assert.equal(classified.presentationTier, PRESENTATION_TIER.R0_GLASS);
  assert.ok(classified.pins.includes(PIN_REASON.PLAYER));
  assert.ok(classified.pins.includes(PIN_REASON.VISIBLE_ON_GLASS));
});

test('off-screen pursuer can be exact while not drawn', () => {
  const pirate = { id: 2, pos: { x: 400, z: 0 }, data: {} };
  const classified = classifyActivity(pirate, {
    playerId: 1,
    hostileAggro: true,
    onGlass: false,
    onRunway: true,
    origin: { x: 0, z: 0 },
    physicsReachWu: 50,
  });
  assert.equal(classified.simTier, SIM_TIER.S0_EXACT);
  assert.equal(classified.presentationTier, PRESENTATION_TIER.R1_RUNWAY);
  assert.equal(classified.pins.includes(PIN_REASON.VISIBLE_ON_GLASS), false);
});

test('far itinerary traffic is abstract not deleted', () => {
  const hauler = {
    id: 3,
    pos: { x: 3000, z: 0 },
    data: { itinerary: { routeId: 'lane_a' } },
  };
  const classified = classifyActivity(hauler, {
    playerId: 1,
    origin: { x: 0, z: 0 },
    physicsReachWu: 80,
    hasItinerary: true,
  });
  assert.equal(classified.simTier, SIM_TIER.S2_ABSTRACT);
  assert.equal(classified.presentationTier, PRESENTATION_TIER.R3_UNLOADED);
});

test('after grace, inside exit radius stays near', () => {
  const ship = { id: 8, pos: { x: 100, z: 0 }, data: {} };
  const kept = resolveSimTier(ship, [], {
    origin: { x: 0, z: 0 },
    physicsReachWu: 50,
    priorSimTier: SIM_TIER.S1_NEAR,
    graceUntilT: 1,
    simTime: 9,
  });
  assert.equal(kept, SIM_TIER.S1_NEAR);
});

test('beyond the exit radius the classifier is dormant; grace lives on the stamp', () => {
  const ship = { id: 4, pos: { x: 200, z: 0 }, data: {} };
  const beyond = resolveSimTier(ship, [], {
    origin: { x: 0, z: 0 },
    physicsReachWu: 50,
    priorSimTier: SIM_TIER.S1_NEAR,
    graceUntilT: 10,
    simTime: 9,
  });
  assert.equal(beyond, SIM_TIER.S3_DORMANT);
});

test('mission pin is explicit data not a guessed radius', () => {
  const pins = resolvePins({ id: 5, data: { missionId: 'm1' }, pos: { x: 9999, z: 0 } }, { playerId: 1 });
  assert.ok(pins.includes(PIN_REASON.MISSION_CRITICAL));
  const job = resolvePins({ id: 6, data: { jobId: 'job_1' }, pos: { x: 9999, z: 0 } }, { playerId: 1 });
  assert.ok(job.includes(PIN_REASON.MISSION_CRITICAL));
});

test('tether flag on the entity is an explicit pin', () => {
  const pins = resolvePins({ id: 7, data: {}, flags: { tethered: true }, pos: { x: 9999, z: 0 } }, {});
  assert.ok(pins.includes(PIN_REASON.TETHER_OR_ATTACHMENT_COMPONENT));
});

test('physics reach uses look-ahead not camera size alone', () => {
  const reach = physicsReachWu({
    glassDiagonalWu: 180,
    maxRelativeSpeedWu: 160,
    collisionLookaheadS: 0.75,
    largestColliderRadiusWu: 12,
    safetyPadWu: 24,
  });
  assert.equal(reach, 180 + 160 * 0.75 + 12 + 24);
});

test('presentation runway is independent of exact sim', () => {
  assert.equal(resolvePresentationTier({ onRunway: true }), PRESENTATION_TIER.R1_RUNWAY);
  assert.equal(resolvePresentationTier({ mapOrRadar: true }), PRESENTATION_TIER.R2_METADATA);
});
