// VERB-45 — the agility mark sits halfway when the yaw is the roster middle.
//
// The sentence already says the Hitch is in the middle. The mark was still a
// short bar, because the Saucer's yaw pinned the min-max scale.

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

function agility(built) {
  return built.bars.find((row) => row.id === 'agility');
}

test('seed 4242 the agility mark matches the middle of the roster', () => {
  const hitch = model('Hitch');
  const shown = agility(hitch);
  const axis = hitch.profile.axes.find((row) => row.id === 'agility');
  assert.match(shown.why, /middle of the roster/);
  assert.ok(shown.bar >= 45 && shown.bar <= 55, `shown ${shown.bar}`);
  assert.ok(axis.bar < 30, `old scale ${axis.bar} is no longer short`);

  const mule = agility(model('Mule'));
  assert.match(mule.why, /slower/);
  assert.ok(mule.bar < shown.bar, `mule ${mule.bar} hitch ${shown.bar}`);
});
