// Deep-anomaly discovery plates — the frontier anomalies the scan/triangulation loop drives the
// player to now record an authored discovery plate in the exploration journal instead of the
// generic "triangulated, then flown down to the source" fallback.
import assert from 'node:assert/strict';
import test from 'node:test';

import { SECTORS } from '../src/data/sectors.js';
import { explorationDiscoveryPlates } from '../src/world/explorationJournal.js';

const ANOMALIES = [
  { sectorId: 'sector_veil_nebula', poiId: 'poi_anomaly', title: 'The Resonance Obelisk', mustMention: /door that forgot its other side/i },
  { sectorId: 'sector_orcus_shadow', poiId: 'poi_orcus_anomaly', title: 'The Orcus Signal', mustMention: /they measure/i },
  { sectorId: 'sector_triton_wake', poiId: 'poi_triton_anomaly', title: 'The Wake Anomaly', mustMention: /Tide-Locked Watcher/i },
];

test('each deep anomaly carries an authored discovery plate on its POI record', () => {
  for (const a of ANOMALIES) {
    const sector = SECTORS.find((s) => s.id === a.sectorId);
    assert.ok(sector, `${a.sectorId} exists`);
    const poi = (sector.pois || []).find((p) => p.id === a.poiId);
    assert.ok(poi, `${a.poiId} exists`);
    assert.ok(poi.discoveryPlate, `${a.poiId} has a discovery plate`);
    assert.equal(poi.discoveryPlate.title, a.title);
    assert.ok(typeof poi.discoveryPlate.body === 'string' && poi.discoveryPlate.body.length > 80,
      `${a.poiId} plate body is authored prose, not a stub`);
  }
});

test('a found anomaly records the authored body in the exploration journal, not the fallback line', () => {
  const discovery = {};
  for (const a of ANOMALIES) {
    discovery[a.sectorId] = {
      pois: { [a.poiId]: { investigated: true, investigatedAt: 1200 } },
    };
  }
  const state = { world: { discovery } };
  const plates = explorationDiscoveryPlates(state);
  for (const a of ANOMALIES) {
    const plate = plates.find((p) => p.sectorId === a.sectorId && p.poiId === a.poiId);
    assert.ok(plate, `journal produced a plate for ${a.poiId}`);
    assert.equal(plate.title, a.title);
    assert.match(plate.body, a.mustMention,
      `${a.poiId} journal body is the authored plate, not the triangulation fallback`);
    assert.doesNotMatch(plate.body, /Triangulated in .* from \d+ distinct bearings/);
  }
});
