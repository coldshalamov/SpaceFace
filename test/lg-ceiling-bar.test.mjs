// VERB-46 — the top-speed mark sits halfway when the ceiling is the roster middle.
//
// The sentence already says the drive sets the ceiling. The mark was still a short
// bar, because the Hawser's ceiling pinned the min-max scale.

import test from 'node:test';
import assert from 'node:assert/strict';

import { SHIPS } from '../src/data/ships.js';
import { handlingBandModel } from '../src/ui/ship/shipBandModels.js';

function model(name) {
  const ship = SHIPS.find((row) => row.name === name);
  assert.ok(ship, name);
  const built = handlingBandModel({ shipId: ship.id, fittings: [], player: null });
  assert.ok(built, name);
  return built;
}

function topSpeed(built) {
  return built.bars.find((row) => row.id === 'topSpeed');
}

test('seed 4242 the top-speed mark matches the middle ceiling', () => {
  const hitch = model('Hitch');
  const shown = topSpeed(hitch);
  const axis = hitch.profile.axes.find((row) => row.id === 'topSpeed');
  assert.match(shown.why, /sets your ceiling/);
  assert.doesNotMatch(shown.why, /Mass costs|ceiling holds/);
  assert.ok(shown.bar >= 45 && shown.bar <= 55, `shown ${shown.bar}`);
  assert.ok(axis.bar < 35, `old scale ${axis.bar} is no longer short`);

  const rangerBuilt = model('Ranger');
  const ranger = topSpeed(rangerBuilt);
  const rangerAxis = rangerBuilt.profile.axes.find((row) => row.id === 'topSpeed');
  assert.ok(rangerAxis.raw > 0 && rangerAxis.raw < axis.raw, `ranger ceiling ${rangerAxis.raw} hitch ${axis.raw}`);
  assert.ok(ranger.bar < shown.bar, `ranger ${ranger.bar} hitch ${shown.bar}`);
});
