// The dash tank refills on the same reactor multiplier as the gun capacitor.
import test from 'node:test';
import assert from 'node:assert/strict';

import { flightV3 } from '../src/systems/flightV3.js';

function step(capRegen) {
  const flight = Object.create(flightV3);
  const ship = {
    id: 1,
    boost: {
      energy: 0, max: 100, regenRate: 18, drainRate: 40,
      dashImpulse: 0, dashCost: 28, dashCd: 3, dashCdT: 0,
      burnDurS: 0, burnCdS: 0,
    },
  };
  const state = capRegen == null ? {} : {
    combat: { entities: { 1: { multipliers: { capRegen } } } },
  };
  flight._stepPlayerBoost(ship, false, 1, state);
  return ship.boost.energy;
}

test('a healthy reactor refills the dash tank at the authored rate', () => {
  assert.equal(step(1), 18);
  assert.equal(step(null), 18);
});

test('a dead reactor refills the dash tank at the gun capacitor rate', () => {
  assert.equal(step(0.2), 3.6);
});
