// The four INFERENCE landmark POIs (Metronome, Tide-Locked Watcher, Ringworld Arc, Vault Maw) must
// merge into SECTORS with a live anchor position, an anchor that exists, and a flavorTargetRef the
// authored landmark-lore pack actually defines — the "charts, scannable, readable" claims, pinned.
import assert from 'node:assert/strict';

import { SECTORS } from '../src/data/sectors.js';
import landmarkLorePack from '../src/data/flavor/080-landmark-lore.js';

const LORE_TARGETS = new Set(landmarkLorePack.entries.map((entry) => entry.targetRef));

const LANDMARK_POIS = [
  { poiId: 'poi_eris_metronome', sectorId: 'sector_eris_margin', ref: 'landmark_c12_metronome' },
  { poiId: 'poi_triton_watcher', sectorId: 'sector_triton_wake', ref: 'landmark_c15_tide_locked_watcher' },
  { poiId: 'poi_sedna_ringworld', sectorId: 'sector_sedna_dark', ref: 'landmark_c11_ringworld_arc' },
  { poiId: 'poi_vault_maw', sectorId: 'sector_ashfall_reach', ref: 'landmark_c4_vault_maw' },
];

for (const { poiId, sectorId, ref } of LANDMARK_POIS) {
  const sector = SECTORS.find((s) => s.id === sectorId);
  assert.ok(sector, `${sectorId} exists`);
  const poi = sector.pois.find((p) => p.id === poiId);
  assert.ok(poi, `${poiId} merges into ${sectorId} after anchor application`);
  assert.ok(Number.isFinite(poi.pos?.x) && Number.isFinite(poi.pos?.z), `${poiId} carries an anchor position`);
  assert.equal(poi.flavorTargetRef, ref, `${poiId} targets its authored landmark ref`);
  assert.ok(LORE_TARGETS.has(ref), `${ref} is defined in the authored landmark-lore pack`);
  assert.ok(poi.discoveryPlate && poi.discoveryPlate.title && poi.discoveryPlate.body.length > 40,
    `${poiId} carries a real discovery plate`);
  assert.equal(poi.scannerSignalKind, 'archive', `${poiId} is scannable as an archive signal`);
  assert.ok(poi.landmark === true, `${poiId} charts as a landmark`);

  const loreEntry = landmarkLorePack.entries.find((entry) => entry.targetRef === ref);
  assert.ok(loreEntry, `${ref} lore entry exists`);
  assert.equal(loreEntry.location?.poiId, poiId, `${poiId} mapped to lore entry location for physical proximity identification`);
}
