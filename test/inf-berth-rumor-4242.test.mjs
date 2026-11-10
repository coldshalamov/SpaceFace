// A berth arrival speaks the rumor for the sector the ship is in.
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDockArrival, leftoverRumorLine } from '../src/ui/dockArrival.js';

const CERES_RUMOR = 'Raiders working the Ceres lane.';
const HELIOS_RUMOR = 'A skiff is cutting the Helios chord.';
const HELIOS_LOCAL = 'Helios fuel deliveries are late.';

function stateWith(log) {
  return {
    meta: { seed: 4242 },
    player: { heat: 0, cargo: { usedVolume: 0, items: {} } },
    missions: { active: [] },
    world: { currentSectorId: 'sector_helios_prime' },
    ui: { marketNews: { log, lastCard: null } },
    stationLife: { traffic: [] },
    pirateRumor: { zones: {} },
  };
}

const HELIOS = { id: 'station_helios', name: 'Helios Station', services: ['trade'] };

test('a Helios berth does not repeat a Ceres pirate rumor (seed 4242)', () => {
  const state = stateWith([
    {
      kind: 'piracy',
      source: 'pirateRumor:headline',
      sectorId: 'sector_ceres_belt',
      text: CERES_RUMOR,
      stationId: null,
    },
    { stationId: 'station_helios', text: HELIOS_LOCAL },
  ]);
  assert.equal(leftoverRumorLine(state, 'station_helios'), null);
  const view = buildDockArrival(state, HELIOS);
  assert.equal(view.news, HELIOS_LOCAL);
  assert.equal(String(view.news).includes('Ceres'), false);
});

test('a pirate rumor for the sector the ship is in still reaches the berth (seed 4242)', () => {
  const state = stateWith([
    {
      kind: 'piracy',
      source: 'pirateRumor:headline',
      sectorId: 'sector_ceres_belt',
      text: CERES_RUMOR,
      stationId: null,
    },
    {
      kind: 'piracy',
      source: 'pirateRumor:headline',
      sectorId: 'sector_helios_prime',
      text: HELIOS_RUMOR,
      stationId: null,
    },
  ]);
  assert.equal(leftoverRumorLine(state, 'station_helios'), HELIOS_RUMOR);
  assert.equal(buildDockArrival(state, HELIOS).news, HELIOS_RUMOR);
});
