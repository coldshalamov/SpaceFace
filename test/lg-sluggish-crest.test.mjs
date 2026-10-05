// VERB-42 — "Sluggish under load" follows the flight, not the catalog mass ratio.
//
// A 5 t bumper leaves a Hitch's yaw, stop, and turn circle where they were.
// The crest still called that sluggish. Cargo that really widens the turn still is.

import test from 'node:test';
import assert from 'node:assert/strict';

import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { buildSlotList, fits, getDerivedStats } from '../src/systems/ships.js';
import { handlingBandModel } from '../src/ui/ship/shipBandModels.js';

const HITCH = 'ship_kestrel';

function fittingsWith(modId) {
  const hitch = SHIPS.find((row) => row.id === HITCH);
  const slots = buildSlotList(hitch);
  const mod = MODULES.find((row) => row.id === modId);
  const fittings = new Array(slots.length).fill(null);
  const at = slots.findIndex((slot) => fits(slot, mod));
  assert.ok(at >= 0, modId);
  fittings[at] = modId;
  return fittings;
}

function crest(fittings, player = null) {
  const model = handlingBandModel({ shipId: HITCH, fittings, player });
  assert.ok(model && model.crestSentence);
  return model.crestSentence;
}

function yaw(fittings, player = null) {
  return getDerivedStats(HITCH, fittings, player).propulsion.yawAccel;
}

test('seed 4242 sluggish means the ship actually flies worse', () => {
  const bareFit = new Array(buildSlotList(SHIPS.find((row) => row.id === HITCH)).length).fill(null);
  const bumper = fittingsWith('mod_gravity_bumper_s');
  assert.equal(yaw(bumper), yaw(bareFit));
  const bumperCrest = crest(bumper);
  const bareCrest = crest(bareFit);
  assert.doesNotMatch(bumperCrest, /Sluggish under load/);
  assert.doesNotMatch(bareCrest, /Sluggish under load/);
  assert.match(bumperCrest, /turn radius is \d+ m/);

  const player = { isPlayer: true, cargo: { usedMass: 80 } };
  assert.ok(yaw(bareFit, player) < yaw(bareFit));
  assert.match(crest(bareFit, player), /Sluggish under load/);
});
