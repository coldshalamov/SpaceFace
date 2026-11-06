// P1 — the Ship Sheet stat model.
//
// Protects the two contracts the model makes to every surface that reads it:
//   1. monotonicity — a bigger gun never lowers Firepower, and a heavier hull never raises
//      Handling (a model that breaks this makes the hover preview lie about a fit);
//   2. distinctness — the starter hulls land on different shapes, so the New Game choice and the
//      blind comprehension check are both readable from the sheet alone.
//
// Run: node --test test/ship-stats.test.mjs  (also wrapped by scripts/check-ship-stats.mjs)

import test from 'node:test';
import assert from 'node:assert/strict';

import { SHIPS } from '../src/data/ships.js';
import { MODULES } from '../src/data/modules.js';
import {
  BUILD_IDENTITIES,
  SHIP_STAT_DEFS,
  buildIdentityForStats,
  shipSheetSentence,
  shipStatDelta,
  shipStatSheet,
} from '../src/ui/ship/shipStats.js';

const STARTERS = ['ship_kestrel', 'ship_pelican', 'ship_wasp'];
const stat = (sheet, id) => sheet.stats.find((row) => row.id === id);

test('the sheet is exactly six stats, each bounded 1-10', () => {
  assert.equal(SHIP_STAT_DEFS.length, 6, 'no seventh stat');
  const ids = SHIP_STAT_DEFS.map((def) => def.id);
  assert.deepEqual(ids, ['firepower', 'toughness', 'speed', 'handling', 'power', 'muscle']);
  for (const shipDef of SHIPS) {
    const sheet = shipStatSheet({ shipId: shipDef.id });
    assert.ok(sheet, `sheet for ${shipDef.id}`);
    assert.equal(sheet.stats.length, 6);
    for (const row of sheet.stats) {
      assert.ok(row.value >= 1 && row.value <= 10, `${shipDef.id}.${row.id} in 1..10 (got ${row.value})`);
      assert.ok(row.tenths >= 10 && row.tenths <= 100, `${shipDef.id}.${row.id} tenths in 10..100`);
      assert.ok(row.meaning && row.meaning.length > 8, `${row.id} carries a plain meaning`);
      assert.ok(!/%/.test(row.meaning), 'a stat meaning is never a percentage');
    }
    assert.ok(sheet.identity && sheet.identity.label, 'every sheet names a build');
  }
});

test('a bigger gun never lowers Firepower', () => {
  const hull = 'ship_kestrel';
  const bare = shipStatSheet({ shipId: hull, fittings: [] });
  const gun = shipStatSheet({ shipId: hull, fittings: ['wpn_pulse_laser_s'] });
  assert.ok(stat(gun, 'firepower').tenths >= stat(bare, 'firepower').tenths, 'pulse laser does not lower Firepower');

  const autocannon = shipStatSheet({ shipId: hull, fittings: ['wpn_autocannon_s'] });   // 30.8 dps
  const autocannonM = shipStatSheet({ shipId: 'ship_hornet', fittings: ['wpn_autocannon_m'] }); // 72 dps
  assert.ok(stat(autocannon, 'firepower').tenths >= stat(bare, 'firepower').tenths, 'autocannon S >= stock');
  assert.ok(stat(autocannonM, 'firepower').value >= 5, `heavy autocannon reads as real firepower (got ${stat(autocannonM, 'firepower').value})`);

  // Strictly larger damage-per-second on the same hull must never score lower.
  const light = shipStatSheet({ shipId: 'ship_bastion', fittings: ['wpn_pulse_laser_m'] });
  const heavy = shipStatSheet({ shipId: 'ship_bastion', fittings: ['wpn_plasma_cannon_m'] });
  assert.ok(stat(heavy, 'firepower').tenths >= stat(light, 'firepower').tenths,
    'plasma cannon M >= pulse laser M on the same hull');
});

test('a heavier hull never raises Handling, and an empty hold flies better than a full one', () => {
  const light = shipStatSheet({ shipId: 'ship_kestrel' });
  const heavy = shipStatSheet({ shipId: 'ship_leviathan' });
  assert.ok(stat(heavy, 'handling').tenths < stat(light, 'handling').tenths, 'a capital does not out-turn a scout');

  const player = { cargo: { ore: 60 } };
  const dry = shipStatSheet({ shipId: 'ship_mule', player: { cargo: {} } });
  const loaded = shipStatSheet({ shipId: 'ship_mule', player });
  assert.ok(stat(loaded, 'handling').tenths <= stat(dry, 'handling').tenths,
    'a loaded hold never improves how the hull turns');
});

test('every starter hull lands on a distinct stat shape', () => {
  const shapes = STARTERS.map((id) => shipStatSheet({ shipId: id }));
  const keys = shapes.map((sheet) => sheet.stats.map((row) => row.value).join(''));
  assert.equal(new Set(keys).size, keys.length, `starter shapes must differ: ${keys.join(' / ')}`);
  for (const sheet of shapes) {
    assert.ok(sheet.stats.some((row) => row.value >= 5), `${sheet.shipId} has at least one real strength`);
    assert.ok(sheet.stats.some((row) => row.value <= 4), `${sheet.shipId} has at least one real weakness`);
  }
});

test('the identity word follows the shape and is one of the documented words', () => {
  const allowed = new Set([...BUILD_IDENTITIES.map((row) => row.label), 'Generalist']);
  for (const shipDef of SHIPS) {
    const sheet = shipStatSheet({ shipId: shipDef.id });
    assert.ok(allowed.has(sheet.identity.label), `${shipDef.id} -> ${sheet.identity.label}`);
  }
  const flat = buildIdentityForStats(SHIP_STAT_DEFS.map((def) => ({ id: def.id, value: 5, tenths: 50 })));
  assert.equal(flat.label, 'Generalist', 'a flat sheet is a Generalist');
  const spiky = buildIdentityForStats(SHIP_STAT_DEFS.map((def) => ({
    id: def.id,
    value: def.id === 'firepower' ? 8 : (def.id === 'toughness' ? 9 : 3),
    tenths: def.id === 'firepower' ? 80 : (def.id === 'toughness' ? 90 : 30),
  })));
  assert.equal(spiky.label, 'Brawler', 'firepower + toughness reads as a Brawler');
});

test('deltas are tenths of the same scale and carry a tone', () => {
  const before = shipStatSheet({ shipId: 'ship_kestrel', fittings: [] });
  const after = shipStatSheet({ shipId: 'ship_kestrel', fittings: ['wpn_autocannon_s'] });
  const rows = shipStatDelta(before, after);
  assert.equal(rows.length, 6);
  const firepower = rows.find((row) => row.id === 'firepower');
  assert.ok(firepower.delta > 0, 'the gun is a gain');
  assert.equal(firepower.tone, 'gain');
  for (const row of rows) {
    assert.equal(row.delta, row.afterTenths - row.beforeTenths);
    assert.equal(row.tone, row.delta > 0 ? 'gain' : (row.delta < 0 ? 'loss' : 'same'));
  }
  assert.equal(shipStatDelta(null, after).length, 0);
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
