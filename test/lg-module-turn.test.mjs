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

function yawOf(fittings) {
  return getDerivedStats(HITCH, fittings, null).propulsion.yawAccel;
}

function agilityWhy(fittings) {
  const model = handlingBandModel({ shipId: HITCH, fittings, player: null });
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

function rejectedMassPct(fittings) {
  const hitch = SHIPS.find((row) => row.id === HITCH);
  const feel = (fit) => {
    const derived = getDerivedStats(HITCH, fit, null);
    return derived.operationalFeelMass != null ? derived.operationalFeelMass : derived.operationalMass;
  };
  const factor = (mass) => 1.4 / (0.4 + Math.max(0.001, mass / hitch.mass));
  const loaded = factor(feel(fittings));
  const bare = factor(feel([]));
  return Math.round(Math.abs((loaded / bare - 1) * 100));
}

test('seed 4242 fitted mass takes the turn line only when the yaw moves', () => {
  const bare = yawOf([]);
  const bumper = place('mod_gravity_bumper_s');
  assert.equal(yawOf(bumper), bare);
  const bumperWhy = agilityWhy(bumper);
  assert.match(bumperWhy, /middle of the roster/);
  assert.doesNotMatch(bumperWhy, /fitted modules|slower than bare/);

  const packed = heaviestPack();
  const packedYaw = yawOf(packed);
  assert.ok(packedYaw < bare);
  const live = Math.round(Math.abs((packedYaw / bare - 1) * 100));
  const packedWhy = agilityWhy(packed);
  assert.match(packedWhy, new RegExp(`turn ${live}% slower than bare`));
  const rejected = rejectedMassPct(packed);
  assert.ok(Math.abs(live - rejected) >= 15, `live ${live} rejected ${rejected}`);
});
