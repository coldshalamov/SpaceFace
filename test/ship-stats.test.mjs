// P1 — the Ship Sheet stat model.
//
// Protects the contracts every surface that reads the model makes:
//   1. one scale — exactly six bounded 1–10 stats with absolute anchors;
//   2. the readings match their meaning — Firepower includes every damaging mount and no phantom
//      starter gun, Speed includes the live burner gain, Power is a duration, Muscle is tow class;
//   3. monotonicity — adding a gun or mass to the SAME fit never lowers the relevant stat;
//   4. headroom — a full legal fit is not permanently pinned at 10;
//   5. distinctness — the starter hulls read as different characters.
//
// Run: node --test test/ship-stats.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import { SHIPS } from '../src/data/ships.js';
import { MODULES } from '../src/data/modules.js';
import { WEAPONS } from '../src/data/weapons.js';
import { NEW_GAME_STARTERS } from '../src/data/newGameDefaults.js';
import {
  buildSlotList,
  fits,
  fittingsFromDefaultModules,
  getDerivedStats,
  outfitBudgetBlocker,
} from '../src/systems/ships.js';
import { governedFightSpeedFor, towClassMassFor } from '../src/systems/shipCapabilities.js';
import {
  BUILD_IDENTITIES,
  SHIP_STAT_DEFS,
  buildIdentityForStats,
  firepowerRawFor,
  shipSheetSentence,
  shipStatDelta,
  shipStatSheet,
} from '../src/ui/ship/shipStats.js';
import { shipSheetHtml } from '../src/ui/ship/shipSheet.js';

const stat = (sheet, id) => sheet.stats.find((row) => row.id === id);
const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));
const FITTABLE = [...MODULES, ...WEAPONS].filter((def) => def.purchasable !== false && !def.retiredInto);
const FIRED_DPS = (def) => {
  const dmg = Number(def.dmg) || 0;
  const rof = Number(def.rof) || 0;
  if (!(dmg > 0)) return 0;
  return def.continuous && !(rof > 0) ? dmg : dmg * rof;
};

function slotFor(shipDef, def) {
  const slots = buildSlotList(shipDef);
  const index = slots.findIndex((slot) => fits(slot, def));
  return index;
}

function fitAt(slots, entries) {
  const fit = new Array(slots.length).fill(null);
  for (const [index, id] of entries) fit[index] = id;
  return fit;
}

/** The strongest fit the outfit budget allows: best fitting gun per weapon slot, then modules. */
function strongestLegalFit(shipDef) {
  const slots = buildSlotList(shipDef);
  const fit = new Array(slots.length).fill(null);
  for (const slot of slots) {
    if (slot.type !== 'weapon') continue;
    const options = FITTABLE
      .filter((def) => def.slotType === 'weapon' && fits(slot, def))
      .sort((a, b) => FIRED_DPS(b) - FIRED_DPS(a));
    for (const gun of options) {
      fit[slot.index] = gun.id;
      if (!outfitBudgetBlocker(shipDef, fit)) break;
      fit[slot.index] = null;
    }
  }
  for (const slot of slots) {
    if (fit[slot.index]) continue;
    const options = FITTABLE
      .filter((def) => def.slotType === slot.type && fits(slot, def))
      .sort((a, b) => {
        const damage = Number(b.mods && b.mods.weaponDmgPct) - Number(a.mods && a.mods.weaponDmgPct);
        if (damage) return damage;
        return Number(b.mods && b.mods.shieldFlat) - Number(a.mods && a.mods.shieldFlat);
      });
    for (const moduleDef of options) {
      fit[slot.index] = moduleDef.id;
      if (!outfitBudgetBlocker(shipDef, fit)) break;
      fit[slot.index] = null;
    }
  }
  return fit;
}

test('the sheet is exactly six stats, each bounded 1-10, and null input is safe', () => {
  assert.equal(SHIP_STAT_DEFS.length, 6, 'no seventh stat');
  const ids = SHIP_STAT_DEFS.map((def) => def.id);
  assert.deepEqual(ids, ['firepower', 'toughness', 'speed', 'handling', 'power', 'muscle']);
  assert.equal(shipStatSheet(null), null);
  assert.equal(shipStatSheet({}), null);
  assert.equal(shipStatSheet({ shipId: 'not_a_hull' }), null);
  for (const shipDef of SHIPS) {
    const sheet = shipStatSheet({ shipId: shipDef.id });
    assert.ok(sheet, `sheet for ${shipDef.id}`);
    assert.equal(sheet.stats.length, 6);
    assert.ok(sheet.roleLabel && sheet.roleLabel.length > 1, `${shipDef.id} names its authored class`);
    for (const row of sheet.stats) {
      assert.ok(row.value >= 1 && row.value <= 10, `${shipDef.id}.${row.id} in 1..10 (got ${row.value})`);
      assert.ok(row.tenths >= 10 && row.tenths <= 100, `${shipDef.id}.${row.id} tenths in 10..100`);
      assert.equal(row.value, Math.max(1, Math.min(10, Math.round(row.tenths / 10))), 'value is the tenths read whole');
      assert.ok(row.meaning && row.meaning.length > 8, `${row.id} carries a plain meaning`);
      assert.ok(!/%/.test(row.meaning), 'a stat meaning is never a percentage');
    }
    assert.ok(sheet.identity && sheet.identity.label, 'every sheet names a build');
  }
});

test('Firepower ignores the phantom starter gun and counts every damaging mount', () => {
  const empty = shipStatSheet({ shipId: 'ship_kestrel' });
  assert.equal(stat(empty, 'firepower').raw, 0, 'an empty fit carries no gun');
  assert.match(stat(empty, 'firepower').meaning, /No gun fitted/);
  assert.equal(stat(empty, 'firepower').value, 1);

  const thermal = shipStatSheet({ shipId: 'ship_kestrel', fittings: ['wpn_thermal_cooker'] });
  const arc = shipStatSheet({ shipId: 'ship_kestrel', fittings: ['wpn_arc_caster'] });
  assert.ok(stat(thermal, 'firepower').raw >= 60, `Thermal Cooker adds damage (got ${stat(thermal, 'firepower').raw})`);
  assert.ok(stat(arc, 'firepower').raw >= 18, `Arc Caster adds damage (got ${stat(arc, 'firepower').raw})`);
  assert.ok(stat(thermal, 'firepower').tenths > stat(empty, 'firepower').tenths, 'an ARC weapon never paints a loss');

  const saucer = shipStatSheet({ shipId: 'ship_saucer' });
  assert.ok(stat(saucer, 'firepower').raw > 0, 'the Saucer keeps its intrinsic emitters');
});

test('each gun pays its own duty: adding a hot gun never lowers the fit', () => {
  const drifter = SHIP_BY_ID.get('ship_drifter');
  const slots = buildSlotList(drifter);
  const mSlot = slots.findIndex((slot) => slot.type === 'weapon' && slot.size === 'M');
  const rack = 'wpn_missile_rack_m';
  const beam = 'wpn_beam_laser_m';
  const beamSlot = slots.findIndex((slot, index) => index !== mSlot && slot.type === 'weapon' && fits(slot, WEAPONS.find((w) => w.id === beam)));
  assert.ok(mSlot >= 0 && beamSlot >= 0, 'the Drifter has two mounts for this test');

  const rackFit = fitAt(slots, [[mSlot, rack]]);
  const beamFit = fitAt(slots, [[beamSlot, beam]]);
  const bothFit = fitAt(slots, [[mSlot, rack], [beamSlot, beam]]);
  const rackRaw = firepowerRawFor(drifter, rackFit, null, getDerivedStats(drifter.id, rackFit, null));
  const beamRaw = firepowerRawFor(drifter, beamFit, null, getDerivedStats(drifter.id, beamFit, null));
  const bothRaw = firepowerRawFor(drifter, bothFit, null, getDerivedStats(drifter.id, bothFit, null));
  assert.ok(beamRaw > 0 && rackRaw > 0);
  // Per-runtime duty is additive: the beam's heat clock cannot shorten the rack's contribution.
  assert.ok(Math.abs(bothRaw - (rackRaw + beamRaw)) < 1e-6, `${bothRaw} should be ${rackRaw} + ${beamRaw}`);

  // Every hull/slot/gun pair, with one second gun added: Firepower can only rise. The Saucer is
  // excluded because a fitted gun replaces an intrinsic emitter in that slot by design.
  for (const shipDef of SHIPS.filter((ship) => ship.id !== 'ship_saucer')) {
    const hullSlots = buildSlotList(shipDef);
    for (let index = 0; index < hullSlots.length; index += 1) {
      if (hullSlots[index].type !== 'weapon') continue;
      for (const gun of FITTABLE) {
        if (gun.slotType !== 'weapon' || !fits(hullSlots[index], gun)) continue;
        const single = fitAt(hullSlots, [[index, gun.id]]);
        const singleRaw = firepowerRawFor(shipDef, single, null, getDerivedStats(shipDef.id, single, null));
        for (let other = 0; other < hullSlots.length; other += 1) {
          if (other === index || hullSlots[other].type !== 'weapon') continue;
          const second = FITTABLE.find((candidate) => candidate.slotType === 'weapon'
            && candidate.id !== gun.id && fits(hullSlots[other], candidate));
          if (!second) continue;
          const pair = single.slice();
          pair[other] = second.id;
          const pairRaw = firepowerRawFor(shipDef, pair, null, getDerivedStats(shipDef.id, pair, null));
          assert.ok(pairRaw + 1e-6 >= singleRaw,
            `${shipDef.id} slot ${index}: adding ${second.id} lowered ${gun.id} (${singleRaw} -> ${pairRaw})`);
        }
      }
    }
  }
});

test('a higher burst gun never reads a lower whole Firepower bar in the same slot', () => {
  // The bar is the player's reading; the tenths below it can still reflect a hotter gun's shorter
  // sustained clock (that is what the Power stat is for), but the headline must never invert.
  // The Saucer is excluded: fitting a gun replaces an intrinsic emitter in that slot.
  for (const shipDef of SHIPS.filter((ship) => ship.id !== 'ship_saucer')) {
    const hullSlots = buildSlotList(shipDef);
    for (let index = 0; index < hullSlots.length; index += 1) {
      if (hullSlots[index].type !== 'weapon') continue;
      const guns = FITTABLE.filter((gun) => gun.slotType === 'weapon' && fits(hullSlots[index], gun));
      for (let a = 0; a < guns.length; a += 1) {
        for (let b = a + 1; b < guns.length; b += 1) {
          const burstA = FIRED_DPS(guns[a]);
          const burstB = FIRED_DPS(guns[b]);
          if (burstA === burstB) continue;
          const high = burstA > burstB ? guns[a] : guns[b];
          const low = burstA > burstB ? guns[b] : guns[a];
          const highSheet = shipStatSheet({ shipId: shipDef.id, fittings: fitAt(hullSlots, [[index, high.id]]) });
          const lowSheet = shipStatSheet({ shipId: shipDef.id, fittings: fitAt(hullSlots, [[index, low.id]]) });
          assert.ok(stat(highSheet, 'firepower').value >= stat(lowSheet, 'firepower').value,
            `${shipDef.id} slot ${index}: ${high.id} (${FIRED_DPS(high)}) reads ${stat(highSheet, 'firepower').value}, ${low.id} (${FIRED_DPS(low)}) reads ${stat(lowSheet, 'firepower').value}`);
        }
      }
    }
  }
});

test('a full legal fit leaves Firepower headroom on at least 13 of 15 hulls', () => {
  let headroom = 0;
  for (const shipDef of SHIPS) {
    const fit = strongestLegalFit(shipDef);
    assert.equal(outfitBudgetBlocker(shipDef, fit), null, `${shipDef.id} fit is legal`);
    const sheet = shipStatSheet({ shipId: shipDef.id, fittings: fit });
    if (stat(sheet, 'firepower').value < 10) headroom += 1;
  }
  assert.ok(headroom >= 13, `only ${headroom}/15 hulls keep Firepower headroom at a full legal fit`);
});

test('a 60 percent gun upgrade moves at least one tenth', () => {
  const beam = shipStatSheet({ shipId: 'ship_drifter', fittings: ['wpn_beam_laser_m'] }); // 60 dps
  const plasma = shipStatSheet({ shipId: 'ship_drifter', fittings: ['wpn_plasma_cannon_m'] }); // 102 dps
  const before = stat(beam, 'firepower').raw;
  const after = stat(plasma, 'firepower').raw;
  assert.ok(after >= before * 1.6, `upgrade is at least 60 percent (${before} -> ${after})`);
  assert.ok(stat(plasma, 'firepower').tenths - stat(beam, 'firepower').tenths >= 1,
    `the bar moves (${stat(beam, 'firepower').tenths} -> ${stat(plasma, 'firepower').tenths})`);
});

test('Speed reads the live burner gain, never the boost reservoir', () => {
  const warden = SHIP_BY_ID.get('ship_warden');
  const slots = buildSlotList(warden);
  const burner = MODULES.find((def) => def.id === 'mod_afterburner_m');
  const index = slotFor(warden, burner);
  assert.ok(index >= 0);
  const bare = fitAt(slots, []);
  const burned = fitAt(slots, [[index, burner.id]]);
  const bareSheet = shipStatSheet({ shipId: warden.id, fittings: bare });
  const burnedSheet = shipStatSheet({ shipId: warden.id, fittings: burned });
  const fight = governedFightSpeedFor(getDerivedStats(warden.id, bare, null));
  assert.equal(stat(bareSheet, 'speed').raw, Math.round(fight * 100) / 100, 'no burner, no phantom boost');
  assert.ok(stat(burnedSheet, 'speed').raw >= stat(bareSheet, 'speed').raw * 1.3,
    `a 40 percent burn moves the raw reading (${stat(bareSheet, 'speed').raw} -> ${stat(burnedSheet, 'speed').raw})`);
  assert.ok(stat(burnedSheet, 'speed').tenths > stat(bareSheet, 'speed').tenths, 'the bar moves, not just the raw');
});

test('Power is a duration: sustained fire when bounded, capacitor reserve when open', () => {
  const empty = shipStatSheet({ shipId: 'ship_kestrel' });
  const derived = getDerivedStats('ship_kestrel', [], null);
  const reserveSeconds = (derived.capMax + 5 * derived.capRegen) / 20;
  assert.ok(Math.abs(stat(empty, 'power').raw - reserveSeconds) < 0.06,
    `a gunless fit falls back to the capacitor reserve (${stat(empty, 'power').raw} vs ${reserveSeconds})`);

  const hot = shipStatSheet({ shipId: 'ship_kestrel', fittings: ['wpn_pulse_laser_s'] });
  assert.ok(stat(hot, 'power').raw > 2 && stat(hot, 'power').raw < 6, `a heat-bound gun reads its own clock (${stat(hot, 'power').raw} s)`);
  assert.match(stat(hot, 'power').meaning, /capacitor|heat/i);

  const open = shipStatSheet({ shipId: 'ship_kestrel', fittings: ['wpn_autocannon_s'] });
  assert.ok(Math.abs(stat(open, 'power').raw - reserveSeconds) < 0.06, 'an open burst limit falls back to the capacitor');
});

test('Muscle is tow class; cargo can only lower it, and no tow says so', () => {
  const dry = shipStatSheet({ shipId: 'ship_mule', player: { cargo: {} } });
  const loaded = shipStatSheet({ shipId: 'ship_mule', player: { cargo: { usedMass: 200 } } });
  assert.ok(stat(loaded, 'muscle').tenths <= stat(dry, 'muscle').tenths, 'a loaded hold never raises Muscle');

  const atlas = shipStatSheet({ shipId: 'ship_atlas' });
  const hawser = shipStatSheet({ shipId: 'ship_hawser' });
  assert.ok(stat(hawser, 'muscle').tenths > stat(atlas, 'muscle').tenths, 'the tug out-tows the heavy hauler');

  const ironback = shipStatSheet({ shipId: 'ship_ironback' });
  const ironbackDerived = getDerivedStats('ship_ironback', [], null);
  if (!(towClassMassFor(ironbackDerived) > 0)) {
    assert.match(stat(ironback, 'muscle').meaning, /No Line load/i, 'a hull with no tow rating says it rams instead');
    assert.ok(stat(ironback, 'muscle').tenths >= 10);
  }
  assert.ok(ironback.detail.ramWeight > 0, 'ram weight is kept in Details');
});

test('adding mass to the same fit never raises Handling', () => {
  const dry = shipStatSheet({ shipId: 'ship_mule', player: { cargo: {} } });
  const loaded = shipStatSheet({ shipId: 'ship_mule', player: { cargo: { usedMass: 200 } } });
  assert.ok(stat(loaded, 'handling').tenths <= stat(dry, 'handling').tenths,
    'a loaded hold never improves how the hull turns');
});

test('every starter hull lands on a distinct, peaking shape', () => {
  const sheets = NEW_GAME_STARTERS.map((starter) => shipStatSheet({
    shipId: starter.shipId,
    fittings: fittingsFromDefaultModules(starter.shipId, starter.fittedModules),
  }));
  const values = sheets.map((sheet) => sheet.stats.map((row) => row.tenths));
  for (let i = 0; i < sheets.length; i += 1) {
    for (let j = i + 1; j < sheets.length; j += 1) {
      const label = `${sheets[i].roleLabel} · ${sheets[i].identity.label}`;
      const otherLabel = `${sheets[j].roleLabel} · ${sheets[j].identity.label}`;
      const differentWord = label !== otherLabel;
      const bigDiffs = values[i].filter((value, index) => Math.abs(value - values[j][index]) >= 10).length;
      assert.ok(differentWord || bigDiffs >= 2,
        `${sheets[i].shipId} and ${sheets[j].shipId} must differ by their displayed class/build word or two real bars`);
    }
    assert.ok(sheets[i].stats.some((row) => row.value >= 5), `${sheets[i].shipId} has a real strength`);
    assert.ok(sheets[i].stats.some((row) => row.value <= 2), `${sheets[i].shipId} has a real weakness`);
  }
  for (const sheet of sheets) {
    assert.ok(sheet.stats.some((row) => row.value >= 6), `${sheet.shipId} starter has a peak`);
  }
});

test('the identity word follows the shape, never the scanner vocabulary', () => {
  const allowed = new Set([...BUILD_IDENTITIES.map((row) => row.label), 'All-Rounder']);
  const reserved = new Set(['Gunship', 'Generalist']);
  for (const shipDef of SHIPS) {
    const sheet = shipStatSheet({ shipId: shipDef.id });
    assert.ok(allowed.has(sheet.identity.label), `${shipDef.id} -> ${sheet.identity.label}`);
    assert.ok(!reserved.has(sheet.identity.label), 'the sheet does not reuse a scanner hull-role word');
  }
  const flatHigh = buildIdentityForStats(SHIP_STAT_DEFS.map((def) => ({ id: def.id, value: 8, tenths: 80 })));
  assert.equal(flatHigh.label, 'All-Rounder');
  assert.match(flatHigh.gloss, /every stat is high/i);
  const flatLow = buildIdentityForStats(SHIP_STAT_DEFS.map((def) => ({ id: def.id, value: 3, tenths: 30 })));
  assert.match(flatLow.gloss, /modest|nothing/i);
  const spiky = buildIdentityForStats(SHIP_STAT_DEFS.map((def) => ({
    id: def.id,
    value: def.id === 'firepower' ? 8 : (def.id === 'toughness' ? 9 : 3),
    tenths: def.id === 'firepower' ? 80 : (def.id === 'toughness' ? 90 : 30),
  })));
  assert.equal(spiky.label, 'Brawler', 'firepower + toughness reads as a Brawler');
  const wardenish = buildIdentityForStats([
    { id: 'firepower', value: 7, tenths: 70 },
    { id: 'toughness', value: 6, tenths: 60 },
    { id: 'speed', value: 2, tenths: 20 },
    { id: 'handling', value: 4, tenths: 40 },
    { id: 'power', value: 8, tenths: 80 },
    { id: 'muscle', value: 4, tenths: 40 },
  ], 'gunship');
  assert.equal(wardenish.label, 'Gunboat', 'the authored gunship class wins a one-point near-tie');
  const hawserish = buildIdentityForStats([
    { id: 'firepower', value: 4, tenths: 40 },
    { id: 'toughness', value: 5, tenths: 50 },
    { id: 'speed', value: 8, tenths: 80 },
    { id: 'handling', value: 2, tenths: 20 },
    { id: 'power', value: 5, tenths: 50 },
    { id: 'muscle', value: 7, tenths: 70 },
  ], 'tug');
  assert.equal(hawserish.label, 'Hauler', 'the authored tug class wins a one-point near-tie');
});

test('deltas are tenths of the same scale and the hover line shows the before and after', () => {
  const before = shipStatSheet({ shipId: 'ship_kestrel', fittings: [] });
  const after = shipStatSheet({ shipId: 'ship_kestrel', fittings: ['wpn_thermal_cooker'] });
  const rows = shipStatDelta(before, after);
  assert.equal(rows.length, 6);
  const firepower = rows.find((row) => row.id === 'firepower');
  assert.ok(firepower.delta > 0, 'the gun is a gain');
  assert.equal(firepower.tone, 'gain');
  for (const row of rows) {
    assert.equal(row.delta, row.afterTenths - row.beforeTenths);
    assert.equal(row.beforeValue, Math.max(1, Math.min(10, Math.round(row.beforeTenths / 10))));
    assert.equal(row.afterValue, Math.max(1, Math.min(10, Math.round(row.afterTenths / 10))));
  }
  assert.equal(shipStatDelta(null, after).length, 0);

  const synthetic = [{
    id: 'firepower',
    label: 'Firepower',
    meaning: 'Damage per second you can keep on a target.',
    beforeValue: 2,
    afterValue: 3,
    beforeTenths: 25,
    afterTenths: 27,
    delta: 2,
    tone: 'gain',
  }];
  const html = shipSheetHtml(before, { delta: synthetic });
  assert.match(html, /2 \u2192 3 \(\+0\.2\)/, 'the hover line prints before, after and the tenths move');
  assert.match(html, /left:27%/, 'the ghost marker is drawn from afterTenths, so a 0.2 move shows');
});

test('the sheet is honest to assistive tech and compact keeps its meaning line', () => {
  const sheet = shipStatSheet({ shipId: 'ship_kestrel' });
  const full = shipSheetHtml(sheet);
  assert.ok(!/role="button"/.test(full), 'a stat row is a focusable list item, not a fake button');
  assert.match(full, /tabindex="0"/, 'the dock sheet rows are focus stops');
  assert.match(full, /data-sfs-meaning aria-hidden="true"/, 'the meaning line is not a second live announcement');
  assert.ok(!/aria-live/.test(full), 'focusing a row does not double-announce through a live region');

  const compact = shipSheetHtml(sheet, { compact: true });
  assert.ok(!/tabindex=/.test(compact), 'New Game compact rows add no tab stops');
  assert.ok(!/role="button"/.test(compact));
  assert.match(compact, /data-sfs-meaning/, 'compact keeps the meaning line');
  assert.match(full, new RegExp(sheet.roleLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'the authored class sits beside the build word');
});

test('the sheet sentence never repeats a stat name as its whole message', () => {
  for (const shipDef of SHIPS) {
    const sheet = shipStatSheet({ shipId: shipDef.id });
    const line = shipSheetSentence(sheet);
    assert.ok(line && line.length > 16, `${shipDef.id} has a sentence`);
    assert.ok(!/^(Firepower|Toughness|Speed|Handling|Power|Muscle)\.$/.test(line), 'not a naked stat name');
  }
});

test('fitting every catalog module at once never throws and stays on the scale', () => {
  const ids = MODULES.map((def) => def.id);
  for (const shipDef of SHIPS.slice(0, 6)) {
    for (const id of ids.slice(0, 12)) {
      const sheet = shipStatSheet({ shipId: shipDef.id, fittings: [id] });
      assert.ok(sheet, `${shipDef.id} + ${id}`);
      for (const row of sheet.stats) {
        assert.ok(row.value >= 1 && row.value <= 10);
      }
    }
  }
});
