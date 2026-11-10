// inf-drop-in-read — a hull dropping into the sector mid-session is something you can SEE.
//
// Reinforcement squads already arrive THROUGH a lane (SF-053: nose and velocity carry them
// inbound), and the intervention jumper tears out of transit near the pilot — but presentation
// never read that truth, so a fresh wing materialized out of the generic scale ramp exactly like
// every other pop-in. The pure decision layer below turns the spawn truth into one readable
// arrival beat: flash + inbound wake + brake flare, faction-tinted, camera-gated, and silent for
// world materialization at load, tutorial dressing and ordinary traffic.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ARRIVAL_GRACE_S,
  ARRIVAL_MAX_WU,
  ARRIVAL_MIN_WU,
  ARRIVAL_WAKE_COUNT_FULL,
  ARRIVAL_WAKE_COUNT_REDUCED,
  arrivalReadContextOf,
  arrivalReadForSpawn,
} from '../src/render/arrivalRead.js';

const PLAYER = { x: 0, z: 0 };
const T = 1000;

function reinforcementShip(overrides = {}) {
  return {
    id: 4242,
    type: 'ship',
    alive: true,
    radius: 6,
    rot: 0.2,
    pos: { x: 520, z: 0 },
    vel: { x: -130, z: 0 }, // inbound along the lane, toward the anchor behind the player
    data: { ai: { spawnContext: 'sg06_reinforcement' } },
    ...overrides,
  };
}

const OPTS = { simTime: T, sectorEnteredAtT: T - 30, playerPos: PLAYER, playerId: 1, reducedMotion: false };

test('a reinforcement squad arriving down its lane earns the drop-in read, aimed along its velocity', () => {
  const plan = arrivalReadForSpawn(reinforcementShip(), OPTS);
  assert.ok(plan, 'the arrival must read');
  assert.equal(plan.context, 'sg06_reinforcement');
  // atan2(0, -130): flying in the -x direction, the wake streams back down that lane.
  assert.ok(Math.abs(plan.headingRad - Math.PI) < 1e-9);
  assert.equal(plan.speedWu, 130);
  assert.equal(plan.radius, 6);
  assert.equal(plan.sheets, 2);
  assert.equal(plan.wakeCount, ARRIVAL_WAKE_COUNT_FULL);
});

test('world materialization right after sector enter never flashes as an arrival', () => {
  const early = arrivalReadForSpawn(reinforcementShip(), { ...OPTS, sectorEnteredAtT: T });
  assert.equal(early, null, 'same-instant spawn is population, not arrival');
  const inside = arrivalReadForSpawn(reinforcementShip(), { ...OPTS, sectorEnteredAtT: T - ARRIVAL_GRACE_S + 0.1 });
  assert.equal(inside, null, 'inside the grace window is still population');
});

test('after the grace window the same spawn context reads as the arrival it is', () => {
  const plan = arrivalReadForSpawn(reinforcementShip(), { ...OPTS, sectorEnteredAtT: T - ARRIVAL_GRACE_S - 0.01 });
  assert.ok(plan, 'one tick past the grace window, the arrival reads');
});

test('reduced motion halves the counts and the brake gain; it never silences the read', () => {
  const plan = arrivalReadForSpawn(reinforcementShip(), { ...OPTS, reducedMotion: true });
  assert.ok(plan);
  assert.equal(plan.sheets, 1);
  assert.equal(plan.wakeCount, ARRIVAL_WAKE_COUNT_REDUCED);
  assert.ok(plan.brakeOpacity > 0, 'the brake flare keeps a floor');
});

test('traffic, tutorial dressing and world spawns do not carry the read', () => {
  assert.equal(arrivalReadForSpawn(reinforcementShip({ data: { ai: { spawnContext: 'convoy_civilian' } } }), OPTS), null,
    'convoy traffic spawns without the beat');
  assert.equal(arrivalReadForSpawn(reinforcementShip({ data: { ai: { spawnContext: 'tutorial_training' } } }), OPTS), null,
    'onboarding training is dressing, not an arrival');
  assert.equal(arrivalReadForSpawn(reinforcementShip({ data: { ai: { spawnContext: 'berth_worker' } } }), OPTS), null,
    'station workers are not drop-ins');
});

test('the read is camera-gated: too close or too far from the pilot stays silent', () => {
  assert.equal(arrivalReadForSpawn(reinforcementShip({ pos: { x: 10, z: 0 } }), OPTS), null,
    'on top of the pilot is not a readable arrival spot');
  assert.equal(arrivalReadForSpawn(reinforcementShip({ pos: { x: ARRIVAL_MAX_WU + 10, z: 0 } }), OPTS), null,
    'beyond the band the beat would be a sub-pixel glint');
  const near = arrivalReadForSpawn(reinforcementShip({ pos: { x: ARRIVAL_MIN_WU, z: 0 } }), OPTS);
  assert.ok(near, 'the inner band edge still reads');
});

test('the player never wears the arrival beat', () => {
  assert.equal(arrivalReadForSpawn(reinforcementShip({ id: 1 }), OPTS), null);
});

test('a slow warp tear (the intervention jumper) rides its nose heading instead of dead velocity', () => {
  const jumper = reinforcementShip({
    data: { ai: { spawnContext: 'intervention_jumper' } },
    pos: { x: 260, z: -180 },
    vel: { x: 0, z: 0 },
    rot: -1.2,
  });
  const plan = arrivalReadForSpawn(jumper, OPTS);
  assert.ok(plan, 'the jumper arrival reads');
  assert.ok(Math.abs(plan.headingRad - -1.2) < 1e-9, 'heading falls back to the nose');
});

test('non-ships and wrecks never read as arrivals', () => {
  assert.equal(arrivalReadForSpawn(reinforcementShip({ type: 'asteroid' }), OPTS), null);
  assert.equal(arrivalReadForSpawn(reinforcementShip({ type: 'drone' }), OPTS), null);
  assert.equal(arrivalReadForSpawn(reinforcementShip({ alive: false }), OPTS), null);
  assert.equal(arrivalReadForSpawn(null, OPTS), null);
});

test('no camera reference fails closed — no read without a pilot to read it', () => {
  assert.equal(arrivalReadForSpawn(reinforcementShip(), { ...OPTS, playerPos: null }), null);
});

test('the context list itself keeps its contract: only mid-session arrival producers', () => {
  for (const context of ['sg06_reinforcement', 'intervention_jumper', 'intervention_guard',
    'counterweight_pressure', 'opportunist', 'nursery_claim_defense', 'nursery_claim_crew']) {
    assert.equal(arrivalReadContextOf(reinforcementShip({ data: { ai: { spawnContext: context } } })), context);
  }
  assert.equal(arrivalReadContextOf(reinforcementShip({ data: { ai: { spawnContext: 'onboarding_raid' } } })), null);
  assert.equal(arrivalReadContextOf(reinforcementShip({ data: {} })), null);
});
