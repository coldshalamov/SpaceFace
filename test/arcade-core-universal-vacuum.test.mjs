import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyPickupAttraction,
  MAGNET_RANGE,
  playerPickupMagnetRange,
} from '../src/systems/pickupAttraction.js';
import {
  MAGNET_RANGE as MINING_COMPAT_RANGE,
  playerPickupMagnetRange as miningCompatRange,
} from '../src/systems/mining.js';

const DT = 1 / 60;

function pickup(kind) {
  return {
    type: 'pickup',
    pos: { x: 120, z: 0 },
    vel: { x: 0, z: 0 },
    data: { kind },
  };
}

test('ore, material, and credit pickups share one kind-neutral attraction step', () => {
  const player = { pos: { x: 0, z: 0 }, vel: { x: 180, z: 20 } };
  const results = [];
  for (const kind of ['ore', 'salvage_material', 'credit_chip']) {
    const candidate = pickup(kind);
    assert.equal(applyPickupAttraction(
      candidate, player, DT, MAGNET_RANGE, 22, -120, 0, 120,
    ), true);
    results.push(candidate.vel);
  }
  assert.deepEqual(results[1], results[0]);
  assert.deepEqual(results[2], results[0]);
  assert.ok(results[0].x > 0, 'pickup first inherits the fast ship world velocity');
  assert.ok(results[0].x < player.vel.x, 'pickup also closes toward the ship in relative velocity');
});

test('attraction is bounded by range and rejects invalid time without mutation', () => {
  const player = { pos: { x: 0, z: 0 }, vel: { x: 100, z: 0 } };
  const outside = pickup('ore');
  const outsideBefore = { ...outside.vel };
  assert.equal(applyPickupAttraction(
    outside, player, DT, MAGNET_RANGE, 22, -500, 0, 500,
  ), false);
  assert.deepEqual(outside.vel, outsideBefore);

  const paused = pickup('credit_chip');
  const pausedBefore = { ...paused.vel };
  assert.equal(applyPickupAttraction(
    paused, player, 0, MAGNET_RANGE, 22, -120, 0, 120,
  ), false);
  assert.deepEqual(paused.vel, pausedBefore);
});

test('ships-owned derived magnet range wins, with fitted fallback for sparse fixtures', () => {
  const derivedPlayer = {
    id: 1,
    data: { fittings: [], derived: { magnetRange: 780 } },
  };
  const derivedState = { playerId: 1, entities: new Map([[1, derivedPlayer]]) };
  assert.equal(playerPickupMagnetRange(derivedState), 780);

  const fixturePlayer = { id: 1, data: { fittings: ['mod_tractor_beam_m'] } };
  const fixtureState = { playerId: 1, entities: new Map([[1, fixturePlayer]]) };
  assert.equal(playerPickupMagnetRange(fixtureState), 560);

  const barePlayer = { id: 1, data: { fittings: [], derived: { magnetRange: 100 } } };
  const bareState = {
    playerId: 1,
    player: { magnetRange: 9999 },
    entities: new Map([[1, barePlayer]]),
  };
  assert.equal(playerPickupMagnetRange(bareState), MAGNET_RANGE);
});

test('mining compatibility exports point at the pickup-owned policy', () => {
  assert.equal(MINING_COMPAT_RANGE, MAGNET_RANGE);
  const state = {
    playerId: 1,
    entities: new Map([[1, { id: 1, data: { fittings: ['unique_tideline_tractor'] } }]]),
  };
  assert.equal(miningCompatRange(state), playerPickupMagnetRange(state));
});
