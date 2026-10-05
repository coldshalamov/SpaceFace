// VERB-44 — the turn words follow the circle you fly.
//
// The crest used the yaw bar. The Saucer's yaw pinned that bar, so a Bastion
// flying a few dozen metres was called wide.

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

test('seed 4242 the turn words follow the circle you fly', () => {
  const bastion = model('Bastion');
  // The displayed agility mark later moved to the roster middle. The old wide
  // band is the profile scale the crest used to read.
  const bastionAgility = bastion.profile.axes.find((row) => row.id === 'agility');
  assert.ok(bastionAgility.bar < 34, `old yaw scale ${bastionAgility.bar} is no longer the wide band`);
  assert.match(bastion.crestSentence, /Turns hard/);
  assert.doesNotMatch(bastion.crestSentence, /Turns wide/);

  const hitch = model('Hitch');
  assert.match(hitch.crestSentence, /Turns steadily/);
  assert.doesNotMatch(hitch.crestSentence, /Turns wide|Turns hard/);

  const hawser = model('Hawser');
  assert.match(hawser.crestSentence, /Turns wide/);

  const ranger = model('Ranger');
  assert.doesNotMatch(ranger.crestSentence, /Turns hard|Turns steadily|Turns wide/);
});
