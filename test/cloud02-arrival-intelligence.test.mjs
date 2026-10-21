// CLOUD-02 — "Arrive somewhere, not anywhere": the sector postcard's news line belongs to the
// place actually entered, and the card carries at most one truthful known-local next action.
//
// Pins:
// 1. A newer headline about another sector never speaks over an older local one.
// 2. Headlines without verifiable provenance (no sectorId, unresolvable stationId) earn no slot.
// 3. Next action: local contract → player's own charted bearing → public station service.
// 4. buildPostcard stays pure: no nav/course or state mutation, unknown sectors degrade bare.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPostcard } from '../src/ui/sectorPostcard.js';
import { createGameState } from '../src/core/gameState.js';

const HELIOS = 'sector_helios_prime';
const CERES = 'sector_ceres_belt';

function stateWithLog(log) {
  const state = createGameState({ seed: 4242 });
  state.ui = state.ui || {};
  state.ui.marketNews = { log };
  return state;
}

test('CLOUD-02: the newest global item belonging elsewhere never outranks older local news', () => {
  const state = stateWithLog([
    { text: 'Ore futures spike at Ceres Refinery', kind: 'market', t: 30, stationId: 'station_ceres' },
    { text: 'Contract desk floods at Helios Station', kind: 'market', t: 10, stationId: 'station_helios' },
  ]);
  const card = buildPostcard(state, HELIOS);
  assert.equal(card.rumor, 'Contract desk floods at Helios Station',
    'the older Helios line beats the foreign Ceres headline');
  // And the same log answers Ceres' own card with its own news — provenance, not recency.
  assert.equal(buildPostcard(state, CERES).rumor, 'Ore futures spike at Ceres Refinery');
});

test('CLOUD-02: explicit sectorId provenance counts; unprovenanced prose never does', () => {
  const state = stateWithLog([
    { text: 'Something stirs out among the rocks', kind: 'rumor', t: 99 },
    { text: 'A watch post burned at Helios Prime', kind: 'deed', t: 5, sectorId: HELIOS },
  ]);
  assert.equal(buildPostcard(state, HELIOS).rumor, 'A watch post burned at Helios Prime');
});

test('CLOUD-02: a foreign-sector station and malformed records resolve to no rumor', () => {
  const state = stateWithLog([
    { text: 'Ore futures spike at Ceres Refinery', kind: 'market', t: 30, stationId: 'station_ceres' },
    null,
    { text: 42 },
    'garbage',
    { text: '' },
    { text: 'Unattributed hearsay', t: 3 },
  ]);
  const card = buildPostcard(state, HELIOS);
  assert.equal(card.rumor, null, 'no local provenance → no rumor line');
});

test('CLOUD-02: a live contract whose destination is here leads the next-action line', () => {
  const state = stateWithLog([]);
  state.world = state.world || {};
  state.world.currentSectorId = HELIOS;
  state.missions = {
    active: [
      { id: 'm-other', status: 'active', type: 'patrol_clear', title: 'Sweep Ceres',
        destSectorId: CERES, params: {} },
      { id: 'm-here', status: 'active', type: 'smuggling_run', title: 'Quiet Freight',
        destSectorId: HELIOS, destStationId: 'station_helios', params: {} },
    ],
  };
  const card = buildPostcard(state, HELIOS);
  assert.equal(card.nextAction, 'Quiet Freight — turn in at Helios Station.');
});

test('CLOUD-02: the player\'s own charted bearing outranks generic station services', () => {
  const state = stateWithLog([]);
  state.missions = { active: [] };
  state.world = state.world || {};
  state.world.surveyFix = {
    [CERES]: { sectorId: CERES, poiId: 'poi_ceres_vault', mark: { x: 12, z: 34 }, searchRadius: 900 },
  };
  assert.equal(buildPostcard(state, CERES).nextAction,
    'Your charted bearing still waits in this sector.');
  // A bearing on Ceres is not Helios' business.
  assert.notEqual(buildPostcard(state, HELIOS).nextAction,
    'Your charted bearing still waits in this sector.');
});

test('CLOUD-02: with no contract or mark, the card offers the sector\'s public service', () => {
  const state = stateWithLog([]);
  state.missions = { active: [] };
  const card = buildPostcard(state, HELIOS);
  assert.equal(card.nextAction, 'Helios Station keeps a contract desk.');
});

test('CLOUD-02: unknown sector degrades to a bare name card with no news or action', () => {
  const state = stateWithLog([
    { text: 'Contract desk floods at Helios Station', kind: 'market', t: 10, stationId: 'station_helios' },
  ]);
  const card = buildPostcard(state, 'sector_nowhere');
  assert.equal(card.name, 'nowhere');
  assert.equal(card.rumor, null);
  assert.equal(card.nextAction, null);
});

test('CLOUD-02: building the card mutates nothing — nav waypoint and state survive verbatim', () => {
  const state = stateWithLog([
    { text: 'Contract desk floods at Helios Station', kind: 'market', t: 10, stationId: 'station_helios' },
  ]);
  state.nav.waypoint = { reason: 'survey-fix', pos: { x: 1, z: 2 } };
  const before = JSON.stringify(state.nav);
  buildPostcard(state, HELIOS);
  assert.equal(JSON.stringify(state.nav), before, 'no course is set, no nav touched');
});
