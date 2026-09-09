// PQ-153.00 — confirm the six sectors and their way-of-life columns.
// Pins existing CORE_SECTORS ids only. Does not invent sector ids.
import assert from 'node:assert/strict';
import test from 'node:test';

import { SECTORS } from '../src/data/sectors.js';
import {
  getSectorWayOfLife,
  SECTOR_WAY_OF_LIFE,
  SECTOR_WAY_OF_LIFE_BY_ID,
  WAY_OF_LIFE_COLUMNS,
  WAY_OF_LIFE_OWNER_LOCKED_COUNT,
  WAY_OF_LIFE_SECTOR_IDS,
} from '../src/data/sectorWayOfLife.js';

const EXPECTED_SIX = Object.freeze([
  Object.freeze({ id: 'sector_helios_prime', name: 'Helios Prime' }),
  Object.freeze({ id: 'sector_ceres_belt', name: 'Ceres Belt' }),
  Object.freeze({ id: 'sector_tethys_junction', name: 'Tethys Junction' }),
  Object.freeze({ id: 'sector_vesta_forge', name: 'Vesta Forge' }),
  Object.freeze({ id: 'sector_pallas_drift', name: 'Pallas Drift' }),
  Object.freeze({ id: 'sector_sker_haven', name: 'Sker Haven' }),
]);

const REQUIRED_COLUMNS = Object.freeze([
  'verb',
  'rhythm',
  'law',
  'crime',
  'ships',
  'structures',
  'hazardGeometry',
  'landmark',
  'signatureToy',
]);

function sectorIds() {
  return new Set(SECTORS.map((sector) => sector.id));
}

test('PQ-153.00: the confirmation table names exactly these six existing sectors', () => {
  assert.equal(WAY_OF_LIFE_SECTOR_IDS.length, 6);
  assert.equal(SECTOR_WAY_OF_LIFE.length, 6);
  assert.deepEqual([...WAY_OF_LIFE_SECTOR_IDS], EXPECTED_SIX.map((row) => row.id));

  const live = sectorIds();
  for (const expected of EXPECTED_SIX) {
    assert.ok(live.has(expected.id), `must not invent a sector id: ${expected.id}`);
    const authored = SECTORS.find((sector) => sector.id === expected.id);
    assert.equal(authored.name, expected.name);
    const row = getSectorWayOfLife(expected.id);
    assert.ok(row, `way-of-life row missing for ${expected.id}`);
    assert.equal(row.name, expected.name);
    assert.equal(row.id, expected.id);
  }
});

test('PQ-153.00: every row carries the required way-of-life columns', () => {
  assert.deepEqual([...WAY_OF_LIFE_COLUMNS], [...REQUIRED_COLUMNS]);
  for (const row of SECTOR_WAY_OF_LIFE) {
    assert.equal(typeof row.sentence, 'string');
    assert.ok(row.sentence.length > 8, `${row.id} needs a sentence`);
    for (const column of REQUIRED_COLUMNS) {
      const value = row[column];
      assert.equal(typeof value, 'string', `${row.id}.${column} must be a sentence`);
      assert.ok(value.trim().length > 8, `${row.id}.${column} is empty`);
    }
  }
});

test('PQ-153.00: lookup is by existing id and the last three stay swappable by name', () => {
  assert.equal(WAY_OF_LIFE_OWNER_LOCKED_COUNT, 3);
  assert.equal(SECTOR_WAY_OF_LIFE_BY_ID.sector_helios_prime.name, 'Helios Prime');
  assert.equal(getSectorWayOfLife('sector_io_reach'), null);
  assert.equal(getSectorWayOfLife('sector_not_a_place'), null);

  const locked = WAY_OF_LIFE_SECTOR_IDS.slice(0, WAY_OF_LIFE_OWNER_LOCKED_COUNT);
  const proposed = WAY_OF_LIFE_SECTOR_IDS.slice(WAY_OF_LIFE_OWNER_LOCKED_COUNT);
  assert.deepEqual([...locked], [
    'sector_helios_prime',
    'sector_ceres_belt',
    'sector_tethys_junction',
  ]);
  assert.deepEqual([...proposed], [
    'sector_vesta_forge',
    'sector_pallas_drift',
    'sector_sker_haven',
  ]);
});
