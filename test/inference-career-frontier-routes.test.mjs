// Careers walk the whole map — the hunter warrant arc lives in the north (Cinder Claim →
// Sker approach → Coalition evidence return) and the convoy screen arc lives in the south
// (Dione Customs toll picket → the cleared run → the toll-lane pack on the southern front).
// The catalog's own validator (3 arcs per career, unique stage sequences) must stay green.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REPEATABLE_CAREER_CONTRACTS,
  validateCareerContractCatalog,
} from '../src/data/careerContracts.js';
import { SECTORS } from '../src/data/sectors.js';

const SECTOR_IDS = new Set(SECTORS.map((s) => s.id));

function stageSectorIds() {
  const rows = [];
  for (const entry of REPEATABLE_CAREER_CONTRACTS) {
    for (const part of entry.stages) rows.push(part.destSectorId);
  }
  return rows;
}

test('the catalog validator stays green after the frontier re-routes', () => {
  const result = validateCareerContractCatalog();
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test('the hunter warrant arc walks the north: Cinder Claim to the Sker approach', () => {
  const arc = REPEATABLE_CAREER_CONTRACTS.find((c) => c.id === 'hunter_warrant_ladder');
  assert.ok(arc);
  assert.equal(arc.startStationId, 'station_rhea_cinder');
  assert.equal(arc.stages[0].boardStationId, 'station_rhea_cinder');
  assert.equal(arc.stages[0].destSectorId, 'sector_rhea_cinder');
  assert.equal(arc.stages[1].destSectorId, 'sector_sker_haven', 'the warrant follows the raid cell down the Sker approach');
  assert.equal(arc.stages[2].destStationId, 'station_coalition', 'evidence closes at Coalition HQ');
});

test('the hunter screen arc walks the south: the Customs picket and the cleared run', () => {
  const arc = REPEATABLE_CAREER_CONTRACTS.find((c) => c.id === 'hunter_convoy_screen');
  assert.ok(arc);
  assert.equal(arc.startStationId, 'station_dione_customs');
  assert.ok(arc.stages.every((s) => s.destSectorId === 'sector_dione_lane'), 'the whole screen rotation lives on the southern front');
  assert.equal(arc.stages[0].destStationId, 'station_dione');
  assert.equal(arc.stages[2].destStationId, 'station_dione_customs');
});

test('every re-routed board and sector id is real', () => {
  for (const entry of REPEATABLE_CAREER_CONTRACTS) {
    for (const part of entry.stages) {
      if (part.destSectorId) {
        assert.ok(
          SECTOR_IDS.has(part.destSectorId),
          `unknown dest sector ${part.destSectorId}`,
        );
      }
    }
  }
  // The two new homes must be real stations in the frontier cards.
  const north = REPEATABLE_CAREER_CONTRACTS.find((c) => c.id === 'hunter_warrant_ladder');
  const south = REPEATABLE_CAREER_CONTRACTS.find((c) => c.id === 'hunter_convoy_screen');
  assert.equal(north.stages[0].boardStationId, 'station_rhea_cinder');
  assert.equal(south.stages[0].boardStationId, 'station_dione_customs');
  const stationIds = new Set(SECTORS.flatMap((s) => (s.stations || []).map((st) => st.id)));
  for (const entry of REPEATABLE_CAREER_CONTRACTS) {
    for (const part of entry.stages) {
      if (part.boardStationId) assert.ok(stationIds.has(part.boardStationId), `unknown board station ${part.boardStationId}`);
      if (part.destStationId) assert.ok(stationIds.has(part.destStationId), `unknown dest station ${part.destStationId}`);
    }
  }
  const allDestSectors = stageSectorIds();
  assert.ok(allDestSectors.includes('sector_rhea_cinder'), 'the north is on the career map');
  assert.ok(allDestSectors.includes('sector_sker_haven'), 'the Sker approach is on the career map');
  assert.ok(allDestSectors.includes('sector_dione_lane'), 'the south is on the career map');
});
