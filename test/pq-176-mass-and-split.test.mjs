// PQ-176.00 "mass is the law" + PQ-176.01 "drive and thruster split".
//
// The two failure modes the packet names, refused here: budgets that are UI-only numbers the flight
// model never reads, and mass changes that bypass the propulsion profile by writing velocity or
// drag. Both are checked against the derived propulsion block the kernel actually resolves.

import test from 'node:test';
import assert from 'node:assert/strict';

import { COMBAT_LAB_STARTER_PACKAGES } from '../src/data/combatLabSetups.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import {
  MASS_LOAD_LAW,
  buildSlotList,
  designMassForHull,
  getDerivedStats,
  massLoadFactor,
  outfitBudgetForFittings,
  thrusterScaling,
} from '../src/systems/ships.js';

const HITCH = 'ship_kestrel';
const HORNET = 'ship_hornet';
const STARTER_FIT = ['wpn_pulse_laser_s', 'mod_shield_booster_s', 'mod_engine_ion_m', null, 'mod_mining_laser_s', null];

const MASS_SENTENCE = 'Every module’s mass feeds the flight model so a gun boat flies like one.';
const SPLIT_SENTENCE =
  'Drive owns forward thrust and top speed; manoeuvring thrusters own turn torque, strafe and brake.';

function derivedFor(shipId, fittings, holdMassT = 0) {
  return getDerivedStats(shipId, fittings, { isPlayer: true, cargo: { usedMass: holdMassT } });
}
function fittingsForKit(kitId) {
  const kit = COMBAT_LAB_STARTER_PACKAGES.find((row) => row.id === kitId);
  const shipDef = SHIPS.find((row) => row.id === kit.hullId);
  const out = new Array(buildSlotList(shipDef).length).fill(null);
  for (const entry of kit.loadout) out[entry.slotIndex] = entry.defId;
  return { kit, fittings: out };
}

// --- PQ-176.00 -------------------------------------------------------------------------------

test('the hold reaches the propulsion profile, and it reaches nothing else', () => {
  const empty = derivedFor(HITCH, STARTER_FIT, 0);
  const loaded = derivedFor(HITCH, STARTER_FIT, 200);

  assert.equal(empty.propulsion.mainAccel > loaded.propulsion.mainAccel, true,
    `${MASS_SENTENCE} — a loaded hold must cost forward acceleration`);
  assert.equal(empty.propulsion.reverseAccel > loaded.propulsion.reverseAccel, true,
    `${MASS_SENTENCE} — a loaded hold must cost reverse acceleration`);
  assert.equal(empty.propulsion.yawAccel > loaded.propulsion.yawAccel, true,
    `${MASS_SENTENCE} — a loaded hold must cost turn torque`);

  assert.equal(loaded.propulsion.combatSpeed, empty.propulsion.combatSpeed,
    'mass costs acceleration, never the governed speed the pilot is allowed to reach');
  assert.equal('drag' in loaded.propulsion, false,
    'never add drag: the mass law may not introduce a resistance term into the profile');
  assert.equal(loaded.operationalMass, loaded.dryMass + loaded.cargoMass,
    'operational mass stays hull + modules + current cargo');
});

test('a hull at or under its drive rating is bit-identical to how it always flew', () => {
  for (const shipDef of SHIPS) {
    const bare = getDerivedStats(shipDef.id, [], null);
    assert.equal(bare.massLoadFactor, 1, `${shipDef.id} bare hull keeps its authored acceleration`);
    assert.equal(massLoadFactor(shipDef, designMassForHull(shipDef)), MASS_LOAD_LAW.ceiling,
      `${shipDef.id} at its rating keeps its authored acceleration`);
  }
  const starter = derivedFor(HITCH, STARTER_FIT, 0);
  assert.equal(starter.massLoadFactor, 1, 'the shipped starter fit sits at the Hitch rating');
  assert.equal(starter.propulsion.mainAccel, getDerivedStats(HITCH, [], null).propulsion.mainAccel,
    'a new game flies exactly as it did before this law');
});

test('the overload curve is monotone, floored, and never a bonus', () => {
  const shipDef = SHIPS.find((row) => row.id === HITCH);
  const design = designMassForHull(shipDef);
  assert.equal(massLoadFactor(shipDef, design * 0.25), 1, 'being lighter than the rating buys nothing');
  let previous = 1;
  for (const multiple of [1.1, 1.5, 2, 4, 8, 40]) {
    const factor = massLoadFactor(shipDef, design * multiple);
    assert.ok(factor <= previous, `overload at x${multiple} must not be kinder than at the step before`);
    assert.ok(factor >= MASS_LOAD_LAW.floor, `overload at x${multiple} must never fall through the floor`);
    previous = factor;
  }
});

// --- PQ-176.01 -------------------------------------------------------------------------------

test('the thruster bay is the last slot, so an older save still lines up', () => {
  for (const shipDef of SHIPS) {
    const slots = buildSlotList(shipDef);
    assert.equal(slots[slots.length - 1].type, 'thruster',
      `${shipDef.id} must carry its thruster bay last or every saved fittings index moves`);
    assert.ok(shipDef.thrusterId, `${shipDef.id} authors a stock manoeuvring set`);
    assert.ok(MODULES.some((row) => row.id === shipDef.thrusterId && row.slotType === 'thruster'),
      `${shipDef.id} names a real thruster part`);
  }
  // A pre-split save is one entry short. It must resolve to the stock set, not to nothing.
  const shortFit = STARTER_FIT.slice(0, 6);
  const legacy = getDerivedStats(HITCH, shortFit, null);
  const current = getDerivedStats(HITCH, shortFit.concat([null]), null);
  assert.equal(legacy.propulsion.yawAccel, current.propulsion.yawAccel,
    'a save written before the bay existed flies identically to one written after it');
});

test('the stock manoeuvring set is exactly neutral on every hull', () => {
  for (const shipDef of SHIPS) {
    const stock = thrusterScaling(shipDef, []);
    assert.equal(stock.turn, 1, `${shipDef.id} stock bay must not change turn torque`);
    assert.equal(stock.strafe, 1, `${shipDef.id} stock bay must not change strafe`);
    assert.equal(stock.brake, 1, `${shipDef.id} stock bay must not change brake`);
    assert.equal(stock.fitted, false, 'nothing is fitted, so this is the hull’s own set');
  }
});

test('the drive moves forward thrust and the speed above the cap, and nothing else', () => {
  const stock = getDerivedStats(HORNET, new Array(8).fill(null), null);
  const bigDrive = new Array(8).fill(null);
  bigDrive[4] = 'mod_engine_warp_l';
  const driven = getDerivedStats(HORNET, bigDrive, null);

  const forward = (d) => d.propulsion.mainAccel ?? d.propulsion.maxAccel;
  const fightCap = (d) => d.propulsion.combatSpeed ?? d.propulsion.maxSpeed;
  assert.ok(forward(driven) > forward(stock), `${SPLIT_SENTENCE} — the drive must move forward thrust`);
  assert.ok(driven.propulsion.travelCeiling > stock.propulsion.travelCeiling,
    `${SPLIT_SENTENCE} — the drive must move the travel ceiling, which is where top speed lives`);
  assert.ok(driven.propulsion.boostMaxSpeed > stock.propulsion.boostMaxSpeed,
    `${SPLIT_SENTENCE} — the drive must move the boost ceiling`);
  // FEEL_CONTRACT B3 measures the screen crossing at the GOVERNED cap and the camera only opens
  // above it. A purchasable drive that lifts the cap hands the camera a ship it cannot hold, so
  // the drive's speed authority stops at the cap and starts again above it.
  assert.equal(fightCap(driven), fightCap(stock),
    `${SPLIT_SENTENCE} — no drive may raise the governed fight cap (FEEL_CONTRACT B3)`);
  assert.equal(driven.propulsion.precisionSpeed, stock.propulsion.precisionSpeed,
    `${SPLIT_SENTENCE} — a bigger drive does not make precision mode faster`);
  assert.equal(driven.propulsion.yawAccel, stock.propulsion.yawAccel,
    `${SPLIT_SENTENCE} — the drive must NOT move turn torque`);
  assert.equal(driven.propulsion.maxYawRate, stock.propulsion.maxYawRate,
    `${SPLIT_SENTENCE} — the drive must NOT move the yaw-rate ceiling`);
});

test('the manoeuvring bay moves turning, strafe and brake and leaves the drive alone', () => {
  const stock = getDerivedStats(HORNET, new Array(8).fill(null), null);
  const bay = new Array(8).fill(null);
  bay[7] = 'mod_thruster_vernier_m';
  const nimble = getDerivedStats(HORNET, bay, null);

  assert.ok(nimble.propulsion.yawAccel > stock.propulsion.yawAccel,
    `${SPLIT_SENTENCE} — the bay must move turn torque`);
  assert.ok(nimble.propulsion.maxYawRate > stock.propulsion.maxYawRate,
    `${SPLIT_SENTENCE} — a stronger bay holds a tighter arc`);
  assert.ok(nimble.propulsion.maxBrakeAccel > stock.propulsion.maxBrakeAccel,
    `${SPLIT_SENTENCE} — the bay must move braking`);
  assert.equal(nimble.propulsion.maxSpeed, stock.propulsion.maxSpeed,
    `${SPLIT_SENTENCE} — the bay must NOT move top speed`);
  assert.equal(nimble.propulsion.travelCeiling, stock.propulsion.travelCeiling,
    `${SPLIT_SENTENCE} — the bay must NOT move the travel ceiling either`);
});

test('the two split kits are legal, launchable, and two different ships', () => {
  const bolt = fittingsForKit('hornet_fast_clumsy');
  const hinge = fittingsForKit('hornet_nimble_slow');
  assert.equal(bolt.kit.hullId, hinge.kit.hullId, 'the comparison is two builds of ONE hull');
  for (const build of [bolt, hinge]) {
    const budget = outfitBudgetForFittings(build.kit.hullId, build.fittings);
    assert.equal(budget.fits, true, `${build.kit.id} must sit inside every nested budget`);
  }
  const b = getDerivedStats(bolt.kit.hullId, bolt.fittings, null);
  const h = getDerivedStats(hinge.kit.hullId, hinge.fittings, null);
  const capB = b.propulsion.combatSpeed ?? b.propulsion.maxSpeed;
  const capH = h.propulsion.combatSpeed ?? h.propulsion.maxSpeed;
  assert.equal(capB, capH,
    `the two kits must fight at the SAME governed cap — speed is bought above it, not at it`);
  const burnB = b.propulsion.boostMaxSpeed ?? capB;
  const burnH = h.propulsion.boostMaxSpeed ?? capH;
  assert.ok((burnB - burnH) / burnH >= 0.25,
    `Bolt must be at least a quarter faster on the burn (${burnB} vs ${burnH})`);
  assert.ok((b.propulsion.travelCeiling - h.propulsion.travelCeiling) / h.propulsion.travelCeiling >= 0.25,
    `Bolt must carry at least a quarter more travel ceiling (${b.propulsion.travelCeiling} vs ${h.propulsion.travelCeiling})`);
  assert.ok((h.propulsion.yawAccel - b.propulsion.yawAccel) / b.propulsion.yawAccel >= 0.25,
    `Hinge must turn at least a quarter harder (${h.propulsion.yawAccel} vs ${b.propulsion.yawAccel})`);
});

// FEEL_CONTRACT B3: "at cruise the hull needs >= 1.2 s to cross the visible depth", and the camera
// only opens ABOVE the governed cap. That makes the cap the one speed a shop must never sell: a
// drive that lifts it re-breaks PQ-137.03 on every kit already in the game, silently, at purchase
// time. This sweeps the whole engine catalog against every hull so the next drive tier cannot.
test('no engine in the catalog raises the governed fight cap on any hull', () => {
  const engines = MODULES.filter((mod) => mod.slotType === 'engine');
  assert.ok(engines.length >= 3, 'the sweep must actually see the engine catalog');
  const cap = (d) => d.propulsion.combatSpeed ?? d.propulsion.maxSpeed;
  for (const shipDef of SHIPS) {
    const slots = buildSlotList(shipDef);
    const engineSlot = slots.findIndex((slot) => slot.type === 'engine');
    if (engineSlot < 0) continue;
    const bare = getDerivedStats(shipDef.id, new Array(slots.length).fill(null), null);
    const bareCap = cap(bare);
    for (const engine of engines) {
      const fittings = new Array(slots.length).fill(null);
      fittings[engineSlot] = engine.id;
      const fitted = getDerivedStats(shipDef.id, fittings, null);
      assert.equal(cap(fitted), bareCap,
        `${engine.id} moves ${shipDef.id} governed cap from ${bareCap} to ${cap(fitted)} — `
        + 'FEEL_CONTRACT B3 measures the screen crossing at that cap, so it is not for sale');
      assert.ok(fitted.propulsion.travelCeiling >= bare.propulsion.travelCeiling,
        `${engine.id} must never LOWER ${shipDef.id} travel ceiling`);
    }
  }
});
