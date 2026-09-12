// PQ-176.02 "mounts gate by size and type; fixed vs turret".
//
// The failure modes this leaf invites, refused here: a mount rule that lives in the chooser instead
// of the one fit rule (so presets, the Crucible draft and the lab schema disagree with the screen);
// an output margin that exists as a screen number the weapons system never fires; and a save that
// keeps a weapon the law now refuses, firing nothing and saying nothing.

import test from 'node:test';
import assert from 'node:assert/strict';

import { SHIPS } from '../src/data/ships.js';
import { HARDPOINT_ACCEPTS, TURRET_RING_OUTPUT, WEAPONS } from '../src/data/weapons.js';
import {
  buildSlotList,
  buildWeaponList,
  fitRefusalText,
  fits,
  getDerivedStats,
  hardpointClassOf,
  mountClassOf,
  mountOutputFactor,
  mountRefusal,
  ships,
} from '../src/systems/ships.js';

const hornet = SHIPS.find((s) => s.id === 'ship_hornet');
const slots = buildSlotList(hornet);
const RING = slots.findIndex((slot) => hardpointClassOf(slot) === 'ring');
const FRONT = slots.findIndex((slot) => hardpointClassOf(slot) === 'fixed');
const weapon = (id) => WEAPONS.find((w) => w.id === id);

test('every weapon has exactly one mount class and the ring carries only what a cradle can swing', () => {
  assert.ok(RING >= 0 && FRONT >= 0, 'the Hornet has a ring and a fixed hardpoint');
  for (const def of WEAPONS) {
    assert.ok(HARDPOINT_ACCEPTS.fixed.includes(mountClassOf(def)), `${def.id} has a mount class`);
  }
  assert.equal(mountClassOf(weapon('wpn_flak_turret_s')), 'turret');
  assert.equal(mountClassOf(weapon('wpn_missile_rack_m')), 'launcher');
  assert.equal(mountClassOf(weapon('wpn_vector_mine_m')), 'launcher');
  assert.equal(mountClassOf(weapon('wpn_railgun_m')), 'spinal');
  assert.equal(mountClassOf(weapon('wpn_siege_lance_l')), 'spinal');
  assert.equal(mountClassOf(weapon('wpn_beam_laser_m')), 'gun', 'a hitscan beam is still an aimed gun');
  assert.equal(mountClassOf({ slotType: 'weapon', tracking: 'homing' }), 'launcher', 'an unlisted def derives from tracking');
  assert.equal(mountClassOf({ slotType: 'shield' }), null);
  assert.equal(hardpointClassOf(slots[RING]), 'ring');
  assert.equal(hardpointClassOf(slots[FRONT]), 'fixed');
  assert.equal(hardpointClassOf(slots.find((slot) => slot.type === 'shield')), null);
});

test('the one fit rule refuses by size then by mount class, with a sentence', () => {
  assert.equal(fits(slots[RING], weapon('wpn_autocannon_m')), true, 'an aimed gun rides the ring');
  assert.equal(fits(slots[RING], weapon('wpn_flak_turret_s')), true, 'a smaller turret rides the ring');
  assert.equal(fits(slots[RING], weapon('wpn_missile_rack_m')), false, 'a launcher does not');
  assert.equal(fits(slots[RING], weapon('wpn_railgun_m')), false, 'a spinal gun does not');
  assert.equal(fits(slots[FRONT], weapon('wpn_missile_rack_m')), true, 'the fixed hardpoint takes the launcher');
  assert.equal(fits(slots[FRONT], weapon('wpn_flak_turret_s')), true, 'and a pintle turret');
  assert.match(mountRefusal(slots[RING], weapon('wpn_missile_rack_m')),
    /Missile Rack M does not fit a turret ring: it is a launcher, and a ring carries only guns and turrets. Fit it on a fixed hardpoint./);
  assert.match(mountRefusal(slots[RING], weapon('wpn_railgun_m')), /Railgun M does not fit a turret ring: it is a spinal gun/);
  assert.match(mountRefusal(slots[RING], weapon('wpn_torpedo_l')), /Torpedo L does not fit here: it needs a size L hardpoint and this turret ring is size M/);
  assert.equal(mountRefusal(slots[RING], weapon('wpn_autocannon_m')), null);
  assert.equal(fitRefusalText(slots[FRONT], weapon('wpn_autocannon_m')), null, 'a legal fit has no sentence');
  const shieldSlot = slots.find((slot) => slot.type === 'shield');
  assert.equal(fits(shieldSlot, weapon('wpn_autocannon_m')), false);
  assert.match(fitRefusalText(shieldSlot, weapon('wpn_autocannon_m')), /does not fit this slot/);
  const mule = buildSlotList(SHIPS.find((s) => s.id === 'ship_mule'));
  assert.equal(fits(mule[0], weapon('wpn_flak_turret_s')), true, 'the Mule rear deterrent stays legal');
});

test('an aimed gun on the ring aims itself and pays the authored margin on the fired weapon', () => {
  const runtime = (gunId, slotIndex) => {
    const fittings = new Array(slots.length).fill(null);
    fittings[slotIndex] = gunId;
    const list = buildWeaponList(hornet, fittings, true, getDerivedStats(hornet.id, fittings, { isPlayer: true }));
    assert.equal(list.length, 1);
    return list[0];
  };
  const fixed = runtime('wpn_autocannon_m', FRONT);
  const ring = runtime('wpn_autocannon_m', RING);
  assert.equal(fixed.mountOutput, 1);
  assert.equal(ring.mountOutput, TURRET_RING_OUTPUT);
  assert.ok(Math.abs(fixed.dmg / ring.dmg - 1 / TURRET_RING_OUTPUT) < 1e-9,
    `fixed ${fixed.dmg} vs ring ${ring.dmg}: the fixed twin out-damages the ring by the authored margin`);
  assert.equal(fixed.rof, ring.rof, 'the margin is output, not rate');
  const shoveFixed = runtime('wpn_concussion_cannon_m', FRONT);
  const shoveRing = runtime('wpn_concussion_cannon_m', RING);
  const shove = weapon('wpn_concussion_cannon_m');
  assert.equal(shoveFixed.impulsePerHit, undefined, 'a fixed mount keeps the authored knock (weapons.js reads the def)');
  assert.ok(Math.abs(shoveRing.impulsePerHit / shove.impulsePerHit - TURRET_RING_OUTPUT) < 1e-9, 'knock pays the margin on the ring');
  assert.ok(Math.abs(shoveRing.tumbleTorque / shove.tumbleTorque - TURRET_RING_OUTPUT) < 1e-9, 'tumble pays the margin on the ring');
  // weapons.js: a `facing: turret` mount is lead-solved at the target; a fixed mount gimbals toward the aim.
  assert.equal(ring.facing, 'turret', 'the ring tracks the target itself');
  assert.notEqual(fixed.facing, 'turret');
  assert.ok(fixed.gimbalArc > 0, 'the fixed mount gimbals toward the aim');
  assert.equal(runtime('wpn_flak_turret_s', RING).mountOutput, 1, 'a dedicated turret is authored for the ring');
  const rack = runtime('wpn_missile_rack_m', FRONT);
  assert.equal(rack.mountOutput, 1, 'a launcher on a fixed hardpoint pays nothing');
  assert.equal(rack.splashDmg, weapon('wpn_missile_rack_m').splashDmg, 'and keeps its authored splash');
  assert.equal(mountOutputFactor(weapon('wpn_autocannon_m'), slots[FRONT]), 1);
  assert.equal(mountOutputFactor(weapon('wpn_autocannon_m'), slots[RING]), TURRET_RING_OUTPUT);
});

function stubSystem(fittings) {
  const toasts = [];
  const sys = Object.create(ships);
  sys.state = {
    tick: 3,
    simTime: 0,
    playerId: 1,
    entities: new Map(),
    player: {
      credits: 0,
      activeShipIndex: 0,
      ownedShips: [{ defId: hornet.id, fittings }],
      moduleInventory: [],
      researchedNodes: ['tech_guided_ordnance'],
    },
  };
  sys.bus = { emit(name, payload) { if (name === 'toast') toasts.push(payload); }, on() {} };
  return { sys, toasts };
}

test('the fit intent refuses an illegal mount with the sentence and leaves the slot alone', () => {
  const { sys, toasts } = stubSystem(new Array(slots.length).fill(null));
  assert.equal(sys.fitModule({ shipIndex: 0, slotIndex: RING, defId: 'wpn_missile_rack_m' }), false);
  assert.equal(toasts.length, 1);
  assert.match(toasts[0].text, /Missile Rack M does not fit a turret ring: it is a launcher/);
  assert.equal(sys.state.player.ownedShips[0].fittings[RING], null);
  assert.equal(sys.fitModule({ shipIndex: 0, slotIndex: FRONT, defId: 'wpn_missile_rack_m' }), true);
  assert.equal(sys.state.player.ownedShips[0].fittings[FRONT], 'wpn_missile_rack_m');
});

test('a save holding a now-illegal mount is repaired on load: inventory, sentence, nothing else moved', () => {
  const legacy = new Array(slots.length).fill(null);
  legacy[RING] = 'wpn_missile_rack_m';
  legacy[FRONT] = 'wpn_autocannon_m';
  const { sys, toasts } = stubSystem(legacy);
  assert.equal(sys.reconcileIllegalFittings(), 1);
  assert.equal(sys.state.player.ownedShips[0].fittings[RING], null);
  assert.equal(sys.state.player.ownedShips[0].fittings[FRONT], 'wpn_autocannon_m');
  assert.deepEqual(sys.state.player.moduleInventory.map((m) => m.defId), ['wpn_missile_rack_m']);
  assert.match(toasts[0].text, /It is in your inventory\.$/);
  assert.equal(sys.reconcileIllegalFittings(), 0, 'idempotent');
  // The weapon list the runtime fires never carries an illegal mount even before the repair runs.
  const fired = buildWeaponList(hornet, legacy, true, getDerivedStats(hornet.id, legacy, { isPlayer: true }));
  assert.deepEqual(fired.map((w) => w.defId), ['wpn_autocannon_m']);
});
