// The Den's board: three landmark quests on the Smuggler's Archipelago terrain.
//
// The archipelago (poi_den_arch_*) and the Quiet Bell exist as scannable terrain; these quests
// are the story that plays on them through the ordinary landmark-quest owner: investigate the
// wreck, the offer posts at the named station, the scan files an artifact. Pure data asserts —
// buildLandmarkQuestOffers/validateLandmarkQuestOffer are the live builders missionBoardOps uses.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEN_TOLL_REGISTER,
  DEN_SPLIT_MANIFEST,
  DEN_BELL_ROLL,
  buildLandmarkQuestOffers,
  validateLandmarkQuestOffer,
} from '../src/data/landmarkMissions.js';
import * as SectorData from '../src/data/sectors.js';

const QUESTS = [DEN_TOLL_REGISTER, DEN_SPLIT_MANIFEST, DEN_BELL_ROLL];

function pallasRow() {
  for (const value of Object.values(SectorData)) {
    if (!Array.isArray(value)) continue;
    const row = value.find((entry) => entry && entry.id === 'sector_pallas_drift');
    if (row) return row;
  }
  return null;
}

function stateWithFound(...poiIds) {
  const pois = {};
  for (const poiId of poiIds) pois[poiId] = { investigated: true };
  return { world: { discovery: { sector_pallas_drift: { pois } } } };
}

test('the three den quests target live terrain at the authored positions', () => {
  const row = pallasRow();
  assert.ok(row, 'pallas sector row resolves');
  const stations = new Set((row.stations || []).map((s) => s.id));
  for (const quest of QUESTS) {
    const poi = (row.pois || []).find((p) => p.id === quest.poiId);
    assert.ok(poi, quest.id + ' poi exists in the sector');
    assert.ok(stations.has(quest.stationId), quest.id + ' station exists');
    assert.equal(quest.targetLocalPos.x, poi.pos.x, quest.id + ' x matches the poi');
    assert.equal(quest.targetLocalPos.z, poi.pos.z, quest.id + ' z matches the poi');
    assert.ok(quest.maxRangeWu > 0 && quest.maxRangeWu <= 300);
    assert.ok(quest.artifact && quest.artifact.id && quest.artifact.body);
    assert.equal(quest.sectorId, 'sector_pallas_drift');
  }
  const fingerprints = new Set(QUESTS.map((q) => q.causeFingerprint));
  assert.equal(fingerprints.size, QUESTS.length, 'distinct cause fingerprints');
});

test('investigated terrain posts exactly the den quests, undiscovered posts none', () => {
  const found = buildLandmarkQuestOffers(
    stateWithFound('poi_den_arch_d', 'poi_den_arch_c', 'poi_pallas_quiet_bell'),
    { sectorId: 'sector_pallas_drift' },
  );
  assert.equal(found.length, 3);
  for (const offer of found) {
    assert.equal(validateLandmarkQuestOffer(offer), true, offer.id + ' validates');
    assert.equal(offer.type, 'recon_scan');
  }
  const ids = found.map((o) => o.id).sort();
  assert.deepEqual(ids, ['landmark_den_bell_roll', 'landmark_den_split_manifest', 'landmark_den_toll_register']);
  const silent = buildLandmarkQuestOffers({ world: {} }, { sectorId: 'sector_pallas_drift' });
  assert.equal(silent.length, 0, 'the board does not post before the terrain is found');
});
