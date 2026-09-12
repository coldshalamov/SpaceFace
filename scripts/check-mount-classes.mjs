#!/usr/bin/env node
// PQ-176.02 — mounts gate by size and type; fixed vs turret.
//
// Proves, from the live data and the one live fit rule (`fits` in src/systems/ships.js):
//   A. every shipped fit still fits after the mount law (new game, role-lattice kits, combat-lab
//      packages, the 47-A live scene hulls);
//   B. the Crucible draft never loses a weapon card to the ring rule on a draft hull;
//   C. the twin — one aimed gun on a fixed hardpoint vs the same gun on the turret ring — differs
//      by exactly the authored margin, on the runtime weapon the weapons system fires;
//   D. the refusal sentences the fit screen and the fit intent speak;
//   E. the Shipworks chooser carries the sentence on the default route (source-pinned), and a
//      save that holds a now-illegal mount is repaired on load with the same sentence.
// Numbers are printed so the receipt can quote them.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SHIPS } from '../src/data/ships.js';
import { HARDPOINT_ACCEPTS, TURRET_RING_OUTPUT, WEAPONS } from '../src/data/weapons.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { SHIP_ROLE_PATHS } from '../src/data/shipRoleLattice.js';
import { COMBAT_LAB_STARTER_PACKAGES } from '../src/data/combatLabSetups.js';
import { draftCatalogFor } from '../src/data/survivalDraft.js';
import {
  buildSlotList,
  buildWeaponList,
  fitRefusalText,
  fits,
  fittingsFromDefaultModules,
  getDerivedStats,
  hardpointClassOf,
  mountClassOf,
  mountRefusal,
  sizeFits,
  ships,
} from '../src/systems/ships.js';

const shipById = (id) => SHIPS.find((s) => s.id === id);
const weaponById = (id) => WEAPONS.find((w) => w.id === id);
const log = (...parts) => console.log(parts.join(' '));

log('check:mount-classes');
log(`  ring carries: ${HARDPOINT_ACCEPTS.ring.join(', ')} · fixed carries: ${HARDPOINT_ACCEPTS.fixed.join(', ')} · ring output ${TURRET_RING_OUTPUT}`);
log('  catalog: ' + WEAPONS.map((w) => `${w.id}=${mountClassOf(w)}`).join(' '));

// ---- A. migration: every shipped fit still fits ------------------------------------------------
function assertFitLanded(label, shipId, fittings, expectedWeaponCount) {
  const shipDef = shipById(shipId);
  assert.ok(shipDef, `${label}: unknown hull ${shipId}`);
  const slots = buildSlotList(shipDef);
  let placedWeapons = 0;
  fittings.forEach((defId, index) => {
    if (!defId) return;
    const def = weaponById(defId);
    if (!def) return; // non-weapon modules are outside this packet
    assert.ok(fits(slots[index], def), `${label}: ${defId} no longer fits ${shipId} slot ${index} (${fitRefusalText(slots[index], def)})`);
    placedWeapons += 1;
    log(`  A ${label.padEnd(26)} ${shipId.padEnd(14)} slot${index} ${String(hardpointClassOf(slots[index])).padEnd(5)} ${defId} (${mountClassOf(def)})`);
  });
  assert.equal(placedWeapons, expectedWeaponCount, `${label}: ${expectedWeaponCount} weapons authored, ${placedWeapons} landed`);
}

const newGameWeapons = NEW_GAME.fittedModules.filter((id) => weaponById(id)).length;
assertFitLanded('new game', NEW_GAME.shipId, fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules), newGameWeapons);
for (const [shipId, path] of Object.entries(SHIP_ROLE_PATHS)) {
  const ids = [];
  for (const entry of path.kit) for (let n = 0; n < entry.count; n += 1) ids.push(entry.defId);
  assertFitLanded(`lattice ${path.id}`, shipId, fittingsFromDefaultModules(shipId, ids), ids.filter((id) => weaponById(id)).length);
}
for (const pkg of COMBAT_LAB_STARTER_PACKAGES) {
  const slots = buildSlotList(shipById(pkg.hullId));
  const fittings = new Array(slots.length).fill(null);
  for (const entry of pkg.loadout) fittings[entry.slotIndex] = entry.defId;
  assertFitLanded(`lab ${pkg.id}`, pkg.hullId, fittings, pkg.loadout.filter((e) => weaponById(e.defId)).length);
}
assertFitLanded('47-A wasp', 'ship_wasp', fittingsFromDefaultModules('ship_wasp', ['wpn_pulse_laser_s']), 1);
assertFitLanded('47-A mule', 'ship_mule', fittingsFromDefaultModules('ship_mule', ['wpn_pulse_laser_s']), 1);

// ---- B. the Crucible draft keeps every weapon card on the draft hulls ----------------------------
const draftHulls = [...new Set(COMBAT_LAB_STARTER_PACKAGES.map((pkg) => pkg.hullId))];
const draftWeapons = [...new Set(draftCatalogFor('swarm').concat(draftCatalogFor('arc')).map((o) => o.defId))]
  .map(weaponById).filter(Boolean);
for (const hullId of draftHulls) {
  const slots = buildSlotList(shipById(hullId));
  for (const def of draftWeapons) {
    const sizeOnly = slots.filter((slot) => slot.type === 'weapon' && sizeFits(slot, def)).length;
    const legal = slots.filter((slot) => fits(slot, def)).length;
    if (sizeOnly > 0) {
      assert.ok(legal > 0, `B: ${def.id} lost its last slot on ${hullId} to the ring rule`);
    }
  }
  log(`  B ${hullId}: ${draftWeapons.length} draft weapons, none lose their last slot`);
}
// Ironback's only weapon slot is its ring: launchers and spinal guns cannot ride the barge (by law).
const ironback = buildSlotList(shipById('ship_ironback'));
const barredFromBarge = WEAPONS.filter((w) => sizeFits(ironback[0], w) && !fits(ironback[0], w)).map((w) => w.id);
log(`  B ironback ring refuses: ${barredFromBarge.join(', ') || '(none)'}`);
assert.ok(barredFromBarge.includes('wpn_missile_rack_m') && barredFromBarge.includes('wpn_railgun_m'));

// ---- C. the twin ---------------------------------------------------------------------------------
const hornet = shipById('ship_hornet');
const hornetSlots = buildSlotList(hornet);
const ringIndex = hornetSlots.findIndex((slot) => hardpointClassOf(slot) === 'ring');
const fixedIndex = hornetSlots.findIndex((slot) => hardpointClassOf(slot) === 'fixed');
assert.ok(ringIndex >= 0 && fixedIndex >= 0, 'the Hornet authors both a ring and a fixed hardpoint');
const player = { isPlayer: true, researchedNodes: [] };
function runtimeWeapon(gunId, slotIndex) {
  const fittings = new Array(hornetSlots.length).fill(null);
  fittings[slotIndex] = gunId;
  const weapons = buildWeaponList(hornet, fittings, true, getDerivedStats(hornet.id, fittings, player));
  assert.equal(weapons.length, 1, `${gunId} on slot ${slotIndex} yields one runtime weapon`);
  return weapons[0];
}
for (const gunId of ['wpn_autocannon_m', 'wpn_pulse_laser_m', 'wpn_plasma_cannon_m']) {
  const def = weaponById(gunId);
  const fixed = runtimeWeapon(gunId, fixedIndex);
  const ring = runtimeWeapon(gunId, ringIndex);
  const ratio = fixed.dmg / ring.dmg;
  assert.equal(fixed.hardpointClass, 'fixed');
  assert.equal(ring.hardpointClass, 'ring');
  assert.equal(fixed.mountOutput, 1);
  assert.equal(ring.mountOutput, TURRET_RING_OUTPUT);
  assert.ok(Math.abs(ratio - 1 / TURRET_RING_OUTPUT) < 1e-9, `${gunId}: fixed/ring dmg ratio ${ratio}`);
  // weapons.js aims any `facing: turret` mount at the target with a lead solution (no aim skill).
  assert.equal(ring.facing, 'turret', 'the ring aims the gun itself');
  assert.notEqual(fixed.facing, 'turret', 'the fixed twin is aimed by the pilot');
  if (def.splashDmg != null) {
    assert.ok(Math.abs(fixed.splashDmg / ring.splashDmg - 1 / TURRET_RING_OUTPUT) < 1e-9, `${gunId}: splash pays the same margin`);
  }
  const marginPct = Math.round((ratio - 1) * 1000) / 10;
  log(`  C ${gunId.padEnd(22)} fixed ${fixed.dmg} dmg × ${fixed.rof}/s = ${(fixed.dmg * fixed.rof).toFixed(1)} dps · ring ${ring.dmg} dmg = ${(ring.dmg * ring.rof).toFixed(1)} dps · fixed out-damages ring by ${marginPct} %`);
}
// Knock is output too: the concussion cannon (the gun shipped on a ring in web_weaver) shoves less there.
{
  const def = weaponById('wpn_concussion_cannon_m');
  const fixed = runtimeWeapon(def.id, fixedIndex);
  const ring = runtimeWeapon(def.id, ringIndex);
  assert.equal(fixed.impulsePerHit, undefined, 'a fixed mount leaves the authored impulse to the weapons system');
  assert.ok(Math.abs(ring.impulsePerHit / def.impulsePerHit - TURRET_RING_OUTPUT) < 1e-9, 'ring knock pays the margin');
  assert.ok(Math.abs(ring.tumbleTorque / def.tumbleTorque - TURRET_RING_OUTPUT) < 1e-9, 'ring tumble pays the margin');
  log(`  C ${def.id.padEnd(22)} knock fixed ${def.impulsePerHit} · ring ${ring.impulsePerHit} · tumble fixed ${def.tumbleTorque} · ring ${ring.tumbleTorque}`);
}
const flakOnRing = runtimeWeapon('wpn_flak_turret_s', ringIndex);
assert.equal(flakOnRing.mountOutput, 1, 'a dedicated turret is authored for the ring and pays nothing');
const rackOnFixed = runtimeWeapon('wpn_missile_rack_m', fixedIndex);
assert.equal(rackOnFixed.mountOutput, 1, 'a launcher on a fixed hardpoint pays nothing');
log(`  C flak on ring output ${flakOnRing.mountOutput} · rack on fixed output ${rackOnFixed.mountOutput}`);

// ---- D. the sentences ----------------------------------------------------------------------------
const ring = hornetSlots[ringIndex];
const front = hornetSlots[fixedIndex];
const sentences = {
  launcherOnRing: mountRefusal(ring, weaponById('wpn_missile_rack_m')),
  spinalOnRing: mountRefusal(ring, weaponById('wpn_railgun_m')),
  tooBigForRing: mountRefusal(ring, weaponById('wpn_torpedo_l')),
  tooBigForFront: fitRefusalText(front, weaponById('wpn_torpedo_l')),
  gunOnRing: mountRefusal(ring, weaponById('wpn_autocannon_m')),
  turretOnFront: mountRefusal(front, weaponById('wpn_flak_turret_s')),
  launcherOnFront: mountRefusal(front, weaponById('wpn_missile_rack_m')),
};
assert.match(sentences.launcherOnRing, /Missile Rack M does not fit a turret ring: it is a launcher, and a ring carries only guns and turrets/);
assert.match(sentences.spinalOnRing, /Railgun M does not fit a turret ring: it is a spinal gun, and a ring carries only guns and turrets/);
assert.match(sentences.tooBigForRing, /Torpedo L does not fit here: it needs a size L hardpoint and this turret ring is size M/);
assert.match(sentences.tooBigForFront, /Torpedo L does not fit here: it needs a size L hardpoint and this fixed hardpoint is size M/);
assert.equal(sentences.gunOnRing, null);
assert.equal(sentences.turretOnFront, null);
assert.equal(sentences.launcherOnFront, null);
for (const [key, text] of Object.entries(sentences)) log(`  D ${key.padEnd(16)} ${text === null ? '(legal)' : text}`);

// ---- E. the route: the fit intent refuses with the sentence; a loaded save is repaired ----------
function stubSystem(fittings) {
  const toasts = [];
  const events = [];
  const sys = Object.create(ships);
  sys.state = {
    tick: 7,
    simTime: 0,
    playerId: 1,
    entities: new Map(),
    player: {
      credits: 0,
      activeShipIndex: 0,
      ownedShips: [{ defId: hornet.id, fittings }],
      moduleInventory: [],
      researchedNodes: ['tech_guided_ordnance', 'tech_kinetic_drivers'],
    },
  };
  sys.bus = {
    emit(name, payload) { events.push({ name, payload }); if (name === 'toast') toasts.push(payload); },
    on() {},
  };
  return { sys, toasts, events };
}
{
  const { sys, toasts } = stubSystem(new Array(hornetSlots.length).fill(null));
  const ok = sys.fitModule({ shipIndex: 0, slotIndex: ringIndex, defId: 'wpn_missile_rack_m' });
  assert.equal(ok, false, 'the fit intent refuses a launcher on the ring');
  assert.equal(toasts.length, 1);
  assert.match(toasts[0].text, /Missile Rack M does not fit a turret ring: it is a launcher/);
  assert.equal(sys.state.player.ownedShips[0].fittings[ringIndex], null);
  log(`  E fit intent refused: "${toasts[0].text}"`);
  const okFront = sys.fitModule({ shipIndex: 0, slotIndex: fixedIndex, defId: 'wpn_missile_rack_m' });
  assert.equal(okFront, true, 'the same launcher fits the fixed hardpoint');
}
{
  const legacy = new Array(hornetSlots.length).fill(null);
  legacy[ringIndex] = 'wpn_missile_rack_m';
  legacy[fixedIndex] = 'wpn_autocannon_m';
  const { sys, toasts } = stubSystem(legacy);
  const moved = sys.reconcileIllegalFittings();
  assert.equal(moved, 1, 'the one illegal mount in the save is moved');
  assert.equal(sys.state.player.ownedShips[0].fittings[ringIndex], null);
  assert.equal(sys.state.player.ownedShips[0].fittings[fixedIndex], 'wpn_autocannon_m', 'legal mounts are untouched');
  assert.deepEqual(sys.state.player.moduleInventory.map((m) => m.defId), ['wpn_missile_rack_m']);
  assert.match(toasts[0].text, /does not fit a turret ring: it is a launcher.*It is in your inventory/);
  log(`  E legacy save repaired: "${toasts[0].text}"`);
}
const shipworksSource = readFileSync(new URL('../src/ui/station/screens/shipworks.js', import.meta.url), 'utf8');
assert.match(shipworksSource, /data-refused-module=/, 'the chooser lists refused weapons instead of hiding them');
assert.match(shipworksSource, /mountRefusal\(slot, d\)/, 'the chooser speaks the refusal sentence from the one fit rule');
assert.match(shipworksSource, /data-ring-law/, 'a ring slot explains its law once, above the list');
assert.match(shipworksSource, /mountOutputFactor\(def, slot\)/, 'the DPS on a row is the DPS on this mount');
const guidanceSource = readFileSync(new URL('../src/ui/station/outfittingGuidance.js', import.meta.url), 'utf8');
assert.match(guidanceSource, /const hasSlot = safeSlots\.some\(\(s\) => fits\(s, def\)\)/, 'purchase guidance uses the one fit rule');

log('check:mount-classes PASS');
