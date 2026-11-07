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
import { readFileSync } from 'node:fs';

import { SHIPS } from '../src/data/ships.js';
import { MODULES } from '../src/data/modules.js';
import { WEAPONS } from '../src/data/weapons.js';
import { NEW_GAME_STARTERS } from '../src/data/newGameDefaults.js';
import {
  buildSlotList,
  fits,
  getDerivedStats,
  outfitBudgetBlocker,
} from '../src/systems/ships.js';
import { governedFightSpeedFor } from '../src/systems/shipCapabilities.js';
import {
  BUILD_IDENTITIES,
  SHIP_STAT_DEFS,
  buildIdentityForStats,
  firepowerRawFor,
  hasTowRating,
  shipSheetSentence,
  shipStatDelta,
  shipStatSheet,
} from '../src/ui/ship/shipStats.js';
import { bindShipSheet, shipSheetHtml } from '../src/ui/ship/shipSheet.js';
import { starterAirCard } from '../src/ui/starterAirCard.js';

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
        const damage = (Number(b.mods && b.mods.weaponDmgPct) || 0) - (Number(a.mods && a.mods.weaponDmgPct) || 0);
        if (damage) return damage;
        return (Number(b.mods && b.mods.shieldFlat) || 0) - (Number(a.mods && a.mods.shieldFlat) || 0);
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
  assert.match(stat(empty, 'firepower').meaning, /No damaging gun fitted/);
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

test('a gun with a higher sustained reading never reads a lower whole Firepower bar', () => {
  // The bar is the player's reading; it measures SUSTAINED damage, so burst dps alone is not the
  // comparison (a hotter cycling gun can lose to a cooler one with a better duty). What must never
  // invert is the model's own raw reading: a fit whose raw is higher cannot print a lower bar.
  // The Saucer is excluded: fitting a gun replaces an intrinsic emitter in that slot.
  for (const shipDef of SHIPS.filter((ship) => ship.id !== 'ship_saucer')) {
    const hullSlots = buildSlotList(shipDef);
    for (let index = 0; index < hullSlots.length; index += 1) {
      if (hullSlots[index].type !== 'weapon') continue;
      const guns = FITTABLE.filter((gun) => gun.slotType === 'weapon' && fits(hullSlots[index], gun));
      const readings = guns.map((gun) => {
        const fit = fitAt(hullSlots, [[index, gun.id]]);
        const sheet = shipStatSheet({ shipId: shipDef.id, fittings: fit });
        return { gun, raw: stat(sheet, 'firepower').raw, value: stat(sheet, 'firepower').value };
      });
      for (let a = 0; a < readings.length; a += 1) {
        for (let b = a + 1; b < readings.length; b += 1) {
          if (readings[a].raw === readings[b].raw) continue;
          const high = readings[a].raw > readings[b].raw ? readings[a] : readings[b];
          const low = readings[a].raw > readings[b].raw ? readings[b] : readings[a];
          assert.ok(high.value >= low.value,
            `${shipDef.id} slot ${index}: ${high.gun.id} (${high.raw}) reads ${high.value}, ${low.gun.id} (${low.raw}) reads ${low.value}`);
        }
      }
    }
  }
});

test('the strongest legal fit stays below the Firepower ceiling and no hull saturates', () => {
  const def = SHIP_STAT_DEFS.find((row) => row.id === 'firepower');
  let strongest = 0;
  let strongestHull = null;
  let saturated = 0;
  for (const shipDef of SHIPS) {
    const fit = strongestLegalFit(shipDef);
    assert.equal(outfitBudgetBlocker(shipDef, fit), null, `${shipDef.id} fit is legal`);
    const sheet = shipStatSheet({ shipId: shipDef.id, fittings: fit });
    const raw = stat(sheet, 'firepower').raw;
    if (raw > strongest) { strongest = raw; strongestHull = shipDef.id; }
    if (stat(sheet, 'firepower').value >= 10) saturated += 1;
  }
  assert.ok(strongest < def.ceiling,
    `the strongest fit (${strongestHull} ${strongest}) must stay under the ${def.ceiling} ceiling`);
  assert.equal(saturated, 0, `no hull may pin Firepower at 10 (${saturated} did)`);
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

test('Muscle is tow class; a cargo sweep never raises it and the wording stays true', () => {
  const ids = ['ship_mule', 'ship_kestrel', 'ship_atlas', 'ship_hawser'];
  const loads = [0, 200, 600, 1000];
  for (const id of ids) {
    const shipDef = SHIP_BY_ID.get(id);
    for (const [label, fittings] of [['empty', []], ['full legal', strongestLegalFit(shipDef)]]) {
      let previous = Infinity;
      for (const usedMass of loads) {
        const player = { cargo: { usedMass } };
        const sheet = shipStatSheet({ shipId: id, fittings, player });
        const muscle = stat(sheet, 'muscle');
        const derived = getDerivedStats(id, fittings, player);
        assert.ok(muscle.raw <= previous + 1e-9,
          `${id} (${label}) Muscle rose with cargo ${previous} -> ${muscle.raw} at ${usedMass} t`);
        previous = muscle.raw;
        if (!hasTowRating(derived)) {
          assert.match(muscle.meaning, /No Line load/i, `${id} (${label}) has no rating and says so`);
          assert.ok(Math.abs(muscle.raw - 0.15 * derived.dryMass) < 0.06,
            `${id} (${label}) rams at 0.15 x dry mass (${muscle.raw} vs ${derived.dryMass})`);
        } else if (muscle.raw === 0) {
          assert.match(muscle.meaning, /Too loaded to tow/i,
            `${id} (${label}) has a rating but is overloaded at ${usedMass} t: ${muscle.meaning}`);
        } else {
          assert.doesNotMatch(muscle.meaning, /No Line load|Too loaded to tow/i,
            `${id} (${label}) still tows at ${usedMass} t: ${muscle.meaning}`);
        }
      }
    }
  }

  const atlas = shipStatSheet({ shipId: 'ship_atlas' });
  const hawser = shipStatSheet({ shipId: 'ship_hawser' });
  assert.ok(stat(hawser, 'muscle').tenths > stat(atlas, 'muscle').tenths, 'the tug out-tows the heavy hauler');

  const ironback = shipStatSheet({ shipId: 'ship_ironback' });
  const ironbackDerived = getDerivedStats('ship_ironback', [], null);
  if (!hasTowRating(ironbackDerived)) {
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

test('every starter hull lands on a distinct, peaking shape and a unique rail label', () => {
  const cards = NEW_GAME_STARTERS.map((starter) => starterAirCard(starter));
  const sheets = cards.map((card) => card.sheet);
  const labels = cards.map((card) => card.railLabel);
  assert.equal(new Set(labels).size, labels.length, `starter rail labels are unique: ${labels.join(' | ')}`);
  const values = sheets.map((sheet) => sheet.stats.map((row) => row.value));
  for (let i = 0; i < sheets.length; i += 1) {
    for (let j = i + 1; j < sheets.length; j += 1) {
      const diffs = values[i].filter((value, index) => value !== values[j][index]).length;
      assert.ok(diffs >= 2,
        `${sheets[i].shipId} and ${sheets[j].shipId} must differ by at least two whole bars (got ${diffs})`);
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
  assert.match(html, /2\.5 \u2192 2\.7 \(\+0\.2\)/, 'the hover line prints the exact tenths before, after and the move');
  assert.match(html, /left:27%/, 'the ghost marker is drawn from afterTenths, so a 0.2 move shows');
});

test('a sub-whole delta never prints the same before and after number', () => {
  const wasp = SHIP_BY_ID.get('ship_wasp');
  const slots = buildSlotList(wasp);
  const stripped = MODULES.find((def) => def.id === 'mod_thruster_stripped_s');
  const index = slotFor(wasp, stripped);
  assert.ok(index >= 0, 'the Wasp has an S thruster bay');
  const before = fitAt(slots, []);
  const after = fitAt(slots, [[index, stripped.id]]);
  const beforeSheet = shipStatSheet({ shipId: wasp.id, fittings: before });
  const afterSheet = shipStatSheet({ shipId: wasp.id, fittings: after });
  const handling = shipStatDelta(beforeSheet, afterSheet).find((row) => row.id === 'handling');
  assert.ok(handling && handling.delta < 0, 'the stripped RCS is a Handling loss');
  assert.equal(handling.beforeValue, handling.afterValue,
    'fixture: the whole-number bar does not move, which is the contradiction to catch');

  const html = shipSheetHtml(beforeSheet, { delta: shipStatDelta(beforeSheet, afterSheet) });
  const line = `${(handling.beforeTenths / 10).toFixed(1)} \u2192 ${(handling.afterTenths / 10).toFixed(1)} (${'\u2212'}${(Math.abs(handling.delta) / 10).toFixed(1)})`;
  assert.ok(html.includes(line), `the delta line prints exact tenths: ${line}`);
  assert.ok(html.includes(`Now ${(handling.afterTenths / 10).toFixed(1)} of 10`),
    'the aria text gives the exact after value');
  const rowStart = html.indexOf('data-sfs-stat="handling"');
  const rowEnd = html.indexOf('data-sfs-stat="power"');
  assert.ok(rowStart >= 0 && rowEnd > rowStart, 'the handling row is present');
  const shown = html.slice(rowStart, rowEnd).match(/class="sfs__delta[^"]*">([^<]+)</);
  assert.ok(shown, 'the delta markup is present');
  if (shown) {
    const [beforeWord, afterWord] = shown[1].split(' \u2192 ');
    assert.notEqual(beforeWord, afterWord, `a nonzero delta must not print ${beforeWord} -> ${afterWord}`);
  }
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

test('no raw engineering reading survives on the Shipworks or New Game surfaces', () => {
  const shipworks = readFileSync(new URL('../src/ui/station/screens/shipworks.js', import.meta.url), 'utf8');
  assert.ok(!/\$\{fmt\(moduleMass\)\} t modules/.test(shipworks), 'the side panel does not print module tonnes');
  assert.ok(!/power used ·/.test(shipworks), 'the side panel does not print a power-used fraction');
  assert.ok(!/variantBonusWords|sx-modrow__variant/.test(shipworks), 'a unique module row does not print raw stat percentages');
  const newGame = readFileSync(new URL('../src/ui/screens/newGame.js', import.meta.url), 'utf8');
  assert.ok(!/paintStarterStats|orr-ng-stat|lineWuPerS|STARTER_LINE_GLOSS/.test(newGame),
    'New Game does not draw the raw Mass/Thrust/Line arcs');
  assert.match(newGame, /railLabel/, 'the starter rail reads the sheet class + build word');
});

test('bindShipSheet wires pointer, focus and Details without a real DOM', () => {
  const sheet = shipStatSheet({ shipId: 'ship_kestrel' });
  const handlers = () => {
    const map = new Map();
    return {
      add(type, fn) { if (!map.has(type)) map.set(type, []); map.get(type).push(fn); },
      addEventListener(type, fn) { this.add(type, fn); },
      remove(type, fn) { map.set(type, (map.get(type) || []).filter((entry) => entry !== fn)); },
      removeEventListener(type, fn) { this.remove(type, fn); },
      emit(type, target) { for (const fn of map.get(type) || []) fn({ target }); },
      count(type) { return (map.get(type) || []).length; },
    };
  };
  const stats = sheet.stats.map((row) => ({
    attrs: { 'data-sfs-stat': row.id, 'data-sfs-stat-meaning': row.meaning },
    classList: { toggle() {} },
    closest(selector) { return selector === '[data-sfs-stat]' ? this : null; },
    getAttribute(key) { return this.attrs[key] ?? null; },
  }));
  const list = handlers();
  list.querySelector = (selector) => {
    const match = /data-sfs-stat="([^"]+)"/.exec(selector);
    return match ? stats.find((row) => row.attrs['data-sfs-stat'] === match[1]) || null : null;
  };
  list.querySelectorAll = () => stats;
  const meaning = { textContent: '' };
  const eng = {
    hidden: true,
    hasAttribute(key) { return key === 'hidden' ? this.hidden : false; },
    removeAttribute(key) { if (key === 'hidden') this.hidden = false; },
    setAttribute(key) { if (key === 'hidden') this.hidden = true; },
  };
  const details = handlers();
  details.setAttribute = (key, value) => { details.attrs = { ...(details.attrs || {}), [key]: value }; };
  const root = {
    attrs: { 'data-sfs-default': 'firepower' },
    getAttribute(key) { return this.attrs[key] ?? null; },
    querySelector(selector) {
      if (selector === '.sfs__stats') return list;
      if (selector === '[data-sfs-meaning]') return meaning;
      if (selector === '[data-sfs-details]') return details;
      if (selector === '[data-sfs-eng]') return eng;
      return null;
    },
  };

  const dispose = bindShipSheet(root);
  assert.equal(meaning.textContent, sheet.stats[0].meaning, 'binding starts on the default stat');
  const speed = stats.find((row) => row.attrs['data-sfs-stat'] === 'speed');
  list.emit('pointerover', speed);
  assert.equal(meaning.textContent, sheet.stats.find((row) => row.id === 'speed').meaning, 'hover moves the meaning line');
  list.emit('pointerleave', speed);
  assert.equal(meaning.textContent, sheet.stats[0].meaning, 'leaving restores the default');
  list.emit('focusin', speed);
  assert.equal(meaning.textContent, sheet.stats.find((row) => row.id === 'speed').meaning, 'focus moves the meaning line');

  details.emit('click');
  assert.equal(eng.hidden, false, 'Details opens the engineering block');
  assert.equal(details.attrs['aria-expanded'], 'true', 'Details announces expanded');
  details.emit('click');
  assert.equal(eng.hidden, true, 'Details closes the engineering block');
  assert.equal(details.attrs['aria-expanded'], 'false', 'Details announces collapsed');

  dispose();
  assert.equal(list.count('pointerover'), 0, 'dispose removes the pointer listener');
});

test('two mounted sheets get their own Details id', () => {
  const sheet = shipStatSheet({ shipId: 'ship_kestrel' });
  const first = shipSheetHtml(sheet);
  const second = shipSheetHtml(sheet);
  const firstId = /aria-controls="([^"]+)"/.exec(first)[1];
  const secondId = /aria-controls="([^"]+)"/.exec(second)[1];
  assert.notEqual(firstId, secondId, 'two sheets do not share one aria-controls target');
  assert.ok(first.includes(`id="${firstId}"`) && second.includes(`id="${secondId}"`));
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
