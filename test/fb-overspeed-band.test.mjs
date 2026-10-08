// FB-008 — the speed gauge shows overspeed the kernel deliberately preserves.
// Seed 4242. The band is |vel| − governed combat speed. The 100% mark does not move.
// Below the governed speed the band is zero.

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveGovernedCombatSpeed } from '../src/core/flight/propulsionCatalog.js';
import { overspeedBand, velocityRailModel } from '../src/ui/views/velocityRail.js';

const SEED = 4242;

test('FB-008: a seed-4242 exit above governed speed is a band, and decay clears it', () => {
  const governed = 140;
  const ship = {
    id: 1,
    combatSpeed: governed,
    maxSpeed: 172,
    vel: { x: governed + 26, z: 0 },
  };
  const state = { seed: SEED, tick: 0, simTime: 0 };
  const reference = resolveGovernedCombatSpeed(ship, state, ship.maxSpeed);
  assert.equal(reference, governed, 'the gauge keys off governed combat speed, not legacy maxSpeed');
  const speed = Math.hypot(ship.vel.x, ship.vel.z);
  const above = velocityRailModel(speed, reference);
  assert.equal(above.overspeed, overspeedBand(speed, reference));
  assert.equal(above.overspeed, 26);
  assert.equal(above.fraction, 1, 'the 100% mark stays the governed speed');
  assert.equal(above.aboveReference, true);

  ship.vel.x = governed - 8;
  const decayed = Math.hypot(ship.vel.x, ship.vel.z);
  const below = velocityRailModel(decayed, reference);
  assert.equal(below.overspeed, 0);
  assert.ok(below.fraction < 1);
});
