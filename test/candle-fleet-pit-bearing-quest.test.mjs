// The Candle Fleet's dark plinth — the starter sector's landmark filing. The quest row must
// tell the physical truth (its probe target is the authored memorial anchor), gate on the
// memorial's real discovery record, and leave the offered row exactly as the board validator
// expects. The full accept/pulse/pay flow runs through the real owners in
// infer-landmark-payoffs.test.mjs; this file holds the placement and gating truths.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { SECTORS } from '../src/data/sectors.js';
import { SECTOR_ANCHORS as sectorAnchors } from '../src/data/sectorAnchors.js';
import {
  CANDLE_FLEET_PIT_BEARING,
  buildLandmarkQuestOffers,
  validateLandmarkQuestOffer,
} from '../src/data/landmarkMissions.js';

test('the dark plinth quest targets the authored memorial anchor, nowhere else', () => {
  const sector = SECTORS.find((row) => row.id === CANDLE_FLEET_PIT_BEARING.sectorId);
  assert.ok(sector, 'the starter sector carries the quest');
  const poi = sector.pois.find((row) => row.id === CANDLE_FLEET_PIT_BEARING.poiId);
  assert.ok(poi, 'poi_memorial is the quest source');
  assert.equal(poi.scannerSignalKind, 'archive');
  assert.equal(poi.repeatableScannerSignal, true, 'the return filing needs a retakeable pulse');
  assert.equal(poi.flavorTargetRef, CANDLE_FLEET_PIT_BEARING.targetRef);

  const anchor = sectorAnchors[CANDLE_FLEET_PIT_BEARING.sectorId].pois
    .find((row) => row.id === CANDLE_FLEET_PIT_BEARING.poiId);
  assert.ok(anchor, 'the memorial has an authored anchor');
  assert.deepEqual(CANDLE_FLEET_PIT_BEARING.targetLocalPos, anchor.pos,
    'the probe range is measured from where the Fleet actually stands');

  const station = sector.stations.find((row) => row.id === CANDLE_FLEET_PIT_BEARING.stationId);
  assert.ok(station, 'station_helios posts the filing');
  assert.ok(station.services.includes('missions'));
});

test('the filing posts once the memorial is read, and only then', () => {
  const state = createGameState(4242);
  // A fresh run has never seen the Fleet: nothing is offered yet.
  assert.deepEqual(buildLandmarkQuestOffers(state, { poiId: 'poi_memorial' }), []);

  state.world.discovery[CANDLE_FLEET_PIT_BEARING.sectorId] = {
    charted: false,
    pois: { poi_memorial: { discovered: true, identified: true, identifiedAt: 12 } },
    fieldsDepleted: {},
  };
  const offers = buildLandmarkQuestOffers(state, { poiId: 'poi_memorial' });
  assert.equal(offers.length, 1, 'the read memorial posts exactly one filing');
  assert.equal(validateLandmarkQuestOffer(offers[0]), true);
  assert.equal(offers[0].stationId, 'station_helios');
  assert.equal(offers[0].type, 'recon_scan');
  assert.equal(offers[0].params.landmarkProbe.signalKind, 'archive');
  assert.ok(offers[0].reward_cr > 0, 'the station pays for the course, not the candles');

  // Filing the artifact is durable completion: no resurrection.
  state.world.discovery[CANDLE_FLEET_PIT_BEARING.sectorId].pois.poi_memorial.landmarkArtifact = {
    id: CANDLE_FLEET_PIT_BEARING.artifact.id,
  };
  assert.deepEqual(buildLandmarkQuestOffers(state, { poiId: 'poi_memorial' }), []);
});
