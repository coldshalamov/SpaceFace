// VERB-43 — the stop words follow the flown stop.
//
// The brake bar used to be reverse acceleration, and the Saucer's number pinned
// every other hull at the bottom. A Hornet that stops well inside the roster
// was told it stops badly.

import test from 'node:test';
import assert from 'node:assert/strict';

import { SHIPS } from '../src/data/ships.js';
import { getDerivedStats } from '../src/systems/ships.js';
import { handlingBandModel } from '../src/ui/ship/shipBandModels.js';

function idOf(name) {
  const ship = SHIPS.find((row) => row.name === name);
  assert.ok(ship, name);
  return ship.id;
}

function model(name) {
  const built = handlingBandModel({ shipId: idOf(name), fittings: [], player: null });
  assert.ok(built, name);
  return built;
}

function brake(built) {
  const bar = built.bars.find((row) => row.id === 'brake');
  assert.ok(bar);
  return bar;
}

function reverseOf(name) {
  const propulsion = getDerivedStats(idOf(name), [], null).propulsion;
  for (const key of ['reverseAccel', 'maxBrakeAccel', 'brakeAccel', 'rcsReverseAccel']) {
    if (Number.isFinite(propulsion[key]) && propulsion[key] > 0) return propulsion[key];
  }
  return 0;
}

test('seed 4242 the stop words follow the stop you fly', () => {
  const hornetRev = reverseOf('Hornet');
  const saucerRev = reverseOf('Saucer');
  assert.ok(hornetRev > 0 && hornetRev < saucerRev * 0.2, `hornet ${hornetRev} saucer ${saucerRev}`);

  const hornet = model('Hornet');
  assert.match(hornet.crestSentence, /Stops clean/);
  assert.doesNotMatch(hornet.crestSentence, /Stops badly/);
  assert.ok(brake(hornet).bar >= 55);

  const hawser = model('Hawser');
  assert.match(hawser.crestSentence, /Stops badly/);
  assert.ok(brake(hawser).bar < 55);

  const ranger = model('Ranger');
  assert.doesNotMatch(ranger.crestSentence, /Stops clean|Stops badly/);
  assert.equal(brake(ranger).bar, 0);
  assert.equal(brake(ranger).why, '');
});
