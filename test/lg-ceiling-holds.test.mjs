// VERB-39 — a loaded hull's top-speed line follows the published ceilings.
//
// Cargo cuts push. It does not move the travel ceiling or the fight cap. The
// old line invented a percent from a mass ratio the kernel never applies to speed.

import test from 'node:test';
import assert from 'node:assert/strict';

import { SHIPS } from '../src/data/ships.js';
import { buildSlotList, getDerivedStats } from '../src/systems/ships.js';
import { handlingBandModel } from '../src/ui/ship/shipBandModels.js';

function hold(usedMass) {
  return { isPlayer: true, cargo: { usedMass } };
}

function speeds(stats) {
  const propulsion = stats.propulsion;
  return {
    travel: propulsion.travelCeiling,
    fight: propulsion.combatSpeed != null ? propulsion.combatSpeed : propulsion.maxSpeed,
    push: propulsion.mainAccel != null ? propulsion.mainAccel : propulsion.maxAccel,
  };
}

function bars(shipId, player, fittings = []) {
  const model = handlingBandModel({ shipId, fittings, player });
  assert.ok(model, shipId);
  return model.bars;
}

function why(rows, id) {
  const bar = rows.find((row) => row.id === id);
  assert.ok(bar, id);
  return bar.why;
}

test('seed 4242 a loaded hull keeps the ceiling it published', () => {
  for (const shipId of ['ship_kestrel', 'ship_mule']) {
    const ship = SHIPS.find((row) => row.id === shipId);
    const player = hold(ship.cargo);
    const empty = speeds(getDerivedStats(shipId, [], null));
    const loaded = speeds(getDerivedStats(shipId, [], player));
    assert.equal(loaded.travel, empty.travel, `${shipId} travel ceiling moved`);
    assert.equal(loaded.fight, empty.fight, `${shipId} fight speed moved`);
    assert.ok(loaded.push < empty.push * 0.995, `${shipId} push did not fall`);

    const loadedBars = bars(shipId, player);
    const top = why(loadedBars, 'topSpeed');
    assert.match(top, /ceiling holds/);
    assert.doesNotMatch(top, /Mass costs/);
    assert.doesNotMatch(top, /push/);
    assert.match(why(loadedBars, 'inertia'), /of your push/);
  }

  const emptyTop = why(bars('ship_kestrel', null), 'topSpeed');
  assert.match(emptyTop, /sets your ceiling/);
  assert.doesNotMatch(emptyTop, /Mass costs|ceiling holds/);

  const hitch = SHIPS.find((row) => row.id === 'ship_kestrel');
  const fittings = new Array(buildSlotList(hitch).length).fill(null);
  const engineAt = buildSlotList(hitch).findIndex((slot) => slot.type === 'engine');
  assert.ok(engineAt >= 0);
  fittings[engineAt] = 'mod_engine_fusion_m';
  const player = hold(hitch.cargo);
  const driven = getDerivedStats('ship_kestrel', fittings, player);
  assert.notEqual(driven.propulsion.driveSpeedMult, 1);
  const driveWhy = why(bars('ship_kestrel', player, fittings), 'topSpeed');
  const fight = Math.round(speeds(driven).fight);
  assert.match(driveWhy, new RegExp(`You still fight at ${fight}`));
  assert.match(driveWhy, /buys the run/);
  assert.doesNotMatch(driveWhy, /ceiling holds|Mass costs/);
});
