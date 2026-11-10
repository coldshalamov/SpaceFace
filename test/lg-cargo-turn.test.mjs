// VERB-40 — a loaded hull's turn line uses the live yaw loss.
//
// The old line compared a mass-ratio curve, then compared the loaded yaw with
// the roster median, so the hold was blamed on the frame.

import test from 'node:test';
import assert from 'node:assert/strict';

import { SHIPS } from '../src/data/ships.js';
import { getDerivedStats } from '../src/systems/ships.js';
import { handlingBandModel } from '../src/ui/ship/shipBandModels.js';

function hold(usedMass) {
  return { isPlayer: true, cargo: { usedMass } };
}

function yawOf(shipId, player) {
  return getDerivedStats(shipId, [], player).propulsion.yawAccel;
}

function slowerPct(after, before) {
  return Math.round(Math.abs((after / before - 1) * 100));
}

function agilityWhy(shipId, player) {
  const model = handlingBandModel({ shipId, fittings: [], player });
  const bar = model.bars.find((row) => row.id === 'agility');
  assert.ok(bar && bar.why, shipId);
  return bar.why;
}

// The rejected sentence. It is not what the screen should say.
function rejectedMassPct(ship, player) {
  const feel = (who) => {
    const derived = getDerivedStats(ship.id, [], who);
    return derived.operationalFeelMass != null ? derived.operationalFeelMass : derived.operationalMass;
  };
  const factor = (mass) => 1.4 / (0.4 + Math.max(0.001, mass / ship.mass));
  const loaded = factor(feel(player));
  const dry = factor(feel(null));
  return Math.round(Math.abs((loaded / dry - 1) * 100));
}

test('seed 4242 cargo turn loss is the live yaw drop', () => {
  const hitch = SHIPS.find((row) => row.id === 'ship_kestrel');
  const hitchPlayer = hold(hitch.cargo);
  const hitchDry = yawOf('ship_kestrel', null);
  const hitchLoaded = yawOf('ship_kestrel', hitchPlayer);
  const hitchLive = slowerPct(hitchLoaded, hitchDry);
  const hitchWhy = agilityWhy('ship_kestrel', hitchPlayer);
  assert.ok(hitchLoaded < hitchDry);
  assert.match(hitchWhy, new RegExp(`${hitchLive}% slower than empty`));
  assert.doesNotMatch(hitchWhy, /roster median/);
  const hitchOld = rejectedMassPct(hitch, hitchPlayer);
  assert.ok(Math.abs(hitchLive - hitchOld) >= 15, `hitch live ${hitchLive} rejected ${hitchOld}`);

  const mule = SHIPS.find((row) => row.id === 'ship_mule');
  const mulePlayer = hold(mule.cargo);
  const muleLive = slowerPct(yawOf('ship_mule', mulePlayer), yawOf('ship_mule', null));
  const muleWhy = agilityWhy('ship_mule', mulePlayer);
  assert.match(muleWhy, new RegExp(`${muleLive}% slower than empty`));
  assert.doesNotMatch(muleWhy, /roster median/);
});
