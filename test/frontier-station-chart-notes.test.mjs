import test from 'node:test';
import assert from 'node:assert/strict';

import { FRONTIER_SECTORS } from '../src/data/frontierRegions/index.js';
import { SECTORS } from '../src/data/sectors.js';

const frontierIds = new Set(FRONTIER_SECTORS.map((sector) => sector.id));
const liveFrontier = SECTORS.filter((sector) => frontierIds.has(sector.id));

test('every live frontier station carries a concise, distinct chart identity', () => {
  assert.equal(liveFrontier.length, FRONTIER_SECTORS.length, 'all authored frontier sectors are live');

  const notes = new Set();
  let stationCount = 0;
  for (const sector of liveFrontier) {
    for (const station of sector.stations || []) {
      stationCount += 1;
      assert.equal(typeof station.chartNote, 'string', `${station.id} has no chart note`);
      assert.ok(station.chartNote.trim().length >= 24, `${station.id} chart note is not informative`);
      assert.ok(station.chartNote.length <= 96, `${station.id} chart note is too long for the inspector`);
      assert.ok(!notes.has(station.chartNote), `${station.id} reuses another station's chart identity`);
      notes.add(station.chartNote);
    }
  }

  assert.equal(stationCount, 17, 'frontier station inventory changed; review chart identity coverage');
});

test('multi-station frontier sectors distinguish their economic and social roles', () => {
  const station = (sectorId, stationId) => liveFrontier
    .find((sector) => sector.id === sectorId)
    ?.stations.find((entry) => entry.id === stationId);

  assert.match(station('sector_hyperion_cut', 'station_hyperion_cut').chartNote, /ore|alloy/i);
  assert.match(station('sector_hyperion_cut', 'station_hyperion_claim').chartNote, /claim|seam/i);
  assert.match(station('sector_nereid_shoal', 'station_nereid').chartNote, /open docks|freight/i);
  assert.match(station('sector_nereid_shoal', 'station_nereid_claim').chartNote, /ice|ore/i);
  assert.match(station('sector_dione_lane', 'station_dione').chartNote, /freight|convoy/i);
  assert.match(station('sector_dione_lane', 'station_dione_customs').chartNote, /toll|scanner/i);
});
