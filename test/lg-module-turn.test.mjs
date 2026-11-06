// VERB-41 — fitted modules only take the turn line when the yaw number moved.
//
// A mass curve called a 5 t bumper a 16% turn loss while the yaw stayed put.
// A fit that does cross the drive rating names the yaw drop, not that curve.

import test from 'node:test';
import assert from 'node:assert/strict';

import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { buildSlotList, fits, getDerivedStats } from '../src/systems/ships.js';
import { handlingBandModel } from '../src/ui/ship/shipBandModels.js';

const HITCH = 'ship_kestrel';

function yawOf(fittings, player = null) {
  return getDerivedStats(HITCH, fittings, player).propulsion.yawAccel;
}

function agilityWhy(fittings, player = null) {
  const model = handlingBandModel({ shipId: HITCH, fittings, player });
  const bar = model.bars.find((row) => row.id === 'agility');
  assert.ok(bar && bar.why);
  return bar.why;
}

function place(modId) {
  const hitch = SHIPS.find((row) => row.id === HITCH);
  const slots = buildSlotList(hitch);
  const mod = MODULES.find((row) => row.id === modId);
  const fittings = new Array(slots.length).fill(null);
  const at = slots.findIndex((slot) => fits(slot, mod));
  assert.ok(at >= 0, modId);
  fittings[at] = modId;
  return fittings;
}

function heaviestPack() {
  const hitch = SHIPS.find((row) => row.id === HITCH);
  const slots = buildSlotList(hitch);
  const fittings = new Array(slots.length).fill(null);
  for (const slot of slots) {
    if (slot.type === 'thruster' || slot.type === 'engine') continue;
    const mod = MODULES
      .filter((row) => row && row.mass > 0 && !(row.mods && row.mods.turnMult) && fits(slot, row))
      .sort((a, b) => b.mass - a.mass)[0];
    if (mod) fittings[slot.index] = mod.id;
  }
  return fittings;
}

function rejectedMassPct(fittings, player = null) {
  const hitch = SHIPS.find((row) => row.id === HITCH);
  const feel = (fit, forPlayer) => {
    const derived = getDerivedStats(HITCH, fit, forPlayer === undefined ? player : forPlayer);
    return derived.operationalFeelMass != null ? derived.operationalFeelMass : derived.operationalMass;
  };
  const factor = (mass) => 1.4 / (0.4 + Math.max(0.001, mass / hitch.mass));
  const loaded = factor(feel(fittings));
  const bare = factor(feel([], null));
  return Math.round(Math.abs((loaded / bare - 1) * 100));
}

test('seed 4242 fitted mass takes the turn line only when the yaw moves', () => {
  const bare = yawOf([]);
  const bumper = place('mod_gravity_bumper_s');
  assert.equal(yawOf(bumper), bare);
  const bumperWhy = agilityWhy(bumper);
  assert.match(bumperWhy, /middle of the roster/);
  assert.doesNotMatch(bumperWhy, /fitted modules|slower than bare/);

  // The heaviest legal module pack sits inside the hitch's 35 t drive rating, so it
  // keeps ceiling accel — the hold is what pushes an ordinary fit over the rating.
  const packed = heaviestPack();
  assert.equal(yawOf(packed), bare);
  const laden = { cargo: { usedMass: 12 } };
  const ladenYaw = yawOf(packed, laden);
  assert.ok(ladenYaw < bare);
  const live = Math.round(Math.abs((ladenYaw / bare - 1) * 100));
  const ladenWhy = agilityWhy(packed, laden);
  assert.match(ladenWhy, new RegExp(`turn ${live}% slower than empty`));
  const rejected = rejectedMassPct(packed, laden);
  assert.ok(Math.abs(live - rejected) >= 15, `live ${live} rejected ${rejected}`);
});
