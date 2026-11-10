// SEED-SC — six frontier landmarks post a paid local filing once the player has read the site.
// The board uses buildLandmarkQuestOffers (missions._reconcileLandmarkQuestOffers). Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { SECTORS } from '../src/data/sectors.js';
import { SECTOR_ANCHORS as sectorAnchors } from '../src/data/sectorAnchors.js';
import {
  KEPLER_SURPLUS_MOVE,
  ORCUS_SHRINE_READINGS,
  HAUMEA_FRACTURE_READING,
  NEREID_SAME_SHIFT_ICE,
  PROTEUS_WELL_SOUNDING,
  EUNOMIA_LICENSED_PLATE,
  buildLandmarkQuestOffers,
  validateLandmarkQuestOffer,
} from '../src/data/landmarkMissions.js';

const JOBS = [
  KEPLER_SURPLUS_MOVE,
  ORCUS_SHRINE_READINGS,
  HAUMEA_FRACTURE_READING,
  NEREID_SAME_SHIFT_ICE,
  PROTEUS_WELL_SOUNDING,
  EUNOMIA_LICENSED_PLATE,
];

test('seed 4242: each frontier landmark posts one filing only after the site is read', () => {
  const fresh = createGameState(4242);
  for (const quest of JOBS) {
    const sector = SECTORS.find((row) => row.id === quest.sectorId);
    assert.ok(sector, `${quest.id} names a live sector`);
    const poi = sector.pois.find((row) => row.id === quest.poiId);
    assert.ok(poi, `${quest.id} names a live point of interest`);
    assert.equal(poi.name, quest.poiLabel, `${quest.id} uses the place's own name`);
    const anchor = sectorAnchors[quest.sectorId].pois.find((row) => row.id === quest.poiId);
    assert.ok(anchor, `${quest.id} has an authored anchor`);
    assert.deepEqual(quest.targetLocalPos, anchor.pos, `${quest.id} is measured from the landmark`);
    const station = sector.stations.find((row) => row.id === quest.stationId);
    assert.ok(station, `${quest.id} posts at a live station`);

    assert.deepEqual(buildLandmarkQuestOffers(fresh, { poiId: quest.poiId }), [],
      `${quest.poiLabel} stays off the board until it has been read`);

    const state = createGameState(4242);
    state.world.discovery[quest.sectorId] = {
      charted: false,
      pois: { [quest.poiId]: { discovered: true, identified: true, identifiedAt: 12 } },
      fieldsDepleted: {},
    };
    const offers = buildLandmarkQuestOffers(state, { poiId: quest.poiId });
    assert.equal(offers.length, 1, `${quest.poiLabel} posts exactly one filing`);
    assert.equal(validateLandmarkQuestOffer(offers[0]), true);
    assert.equal(offers[0].stationId, quest.stationId);
    assert.equal(offers[0].destSectorId, quest.sectorId);
    assert.equal(offers[0].type, 'recon_scan');
    assert.equal(offers[0].title, quest.title);
    assert.ok(offers[0].reward_cr > 0);

    state.world.discovery[quest.sectorId].pois[quest.poiId].landmarkArtifact = {
      id: quest.artifact.id,
    };
    assert.deepEqual(buildLandmarkQuestOffers(state, { poiId: quest.poiId }), [],
      `filing ${quest.artifact.title} takes the job off the board`);
  }
});

test('the Eunomia plate files at the fence and leaves the black market in place', () => {
  const sector = SECTORS.find((row) => row.id === EUNOMIA_LICENSED_PLATE.sectorId);
  const station = sector.stations.find((row) => row.id === EUNOMIA_LICENSED_PLATE.stationId);
  assert.ok(station.services.includes('black_market'));
  assert.equal(station.services.includes('missions'), false);
  assert.equal(EUNOMIA_LICENSED_PLATE.factionId, 'faction_understory');
  const state = createGameState(4242);
  state.world.discovery[EUNOMIA_LICENSED_PLATE.sectorId] = {
    charted: false,
    pois: {
      [EUNOMIA_LICENSED_PLATE.poiId]: { discovered: true, identified: true, identifiedAt: 12 },
    },
    fieldsDepleted: {},
  };
  const offers = buildLandmarkQuestOffers(state, { poiId: EUNOMIA_LICENSED_PLATE.poiId });
  assert.equal(offers.length, 1);
  assert.equal(offers[0].stationId, 'station_eunomia');
  assert.equal(offers[0].factionId, 'faction_understory');
});
