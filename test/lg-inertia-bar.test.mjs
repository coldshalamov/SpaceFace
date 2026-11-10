// VERB-47 — the inertia mark sits halfway when the mass is the roster middle.
//
// The sentence already says how many tonnes are moving. The mark was still a
// short bar, because the Leviathan's mass pinned the min-max scale.

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

function inertia(built) {
  return built.bars.find((row) => row.id === 'inertia');
}

test('seed 4242 the inertia mark matches the middle mass', () => {
  const hawserBuilt = model('Hawser');
  const shown = inertia(hawserBuilt);
  const axis = hawserBuilt.profile.axes.find((row) => row.id === 'inertia');
  assert.match(shown.why, /68 t moving/);
  assert.ok(shown.bar >= 45 && shown.bar <= 55, `shown ${shown.bar}`);
  assert.ok(axis.bar < 20, `old scale ${axis.bar} is no longer short`);

  const hitchBuilt = model('Hitch');
  const hitch = inertia(hitchBuilt);
  const hitchAxis = hitchBuilt.profile.axes.find((row) => row.id === 'inertia');
  assert.ok(hitchAxis.raw > 0 && hitchAxis.raw < axis.raw, `hitch mass ${hitchAxis.raw} hawser ${axis.raw}`);
  assert.ok(hitch.bar < shown.bar, `hitch ${hitch.bar} hawser ${shown.bar}`);
});
