import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { SECTORS, surveyDataPrice } from '../src/data/sectors.js';
import { economy } from '../src/systems/economy.js';
import { world } from '../src/systems/world.js';

const SOURCE_SECTOR = 'sector_ceres_belt';
const SOURCE_STATION = 'station_ceres';
const SURVEY_SECTOR = 'sector_hyperion_cut';
const IRON = 'cmdty_ore_iron';

function boot() {
  const sim = createSimulation({ seed: 0x51a7, systems: [economy, world], updateOrder: [] });
  sim.state.world.currentSectorId = SOURCE_SECTOR;
  sim.state.player.credits = 50_000;
  sim.state.simTime = 123;
  return sim;
}

test('buying survey data seeds only that sector as one-time survey-grade market memory', () => {
  const sim = boot();
  const state = sim.state;
  const target = SECTORS.find((sector) => sector.id === SURVEY_SECTOR);
  const price = surveyDataPrice(target);
  const creditsBefore = state.player.credits;

  try {
    assert.equal(state.player.marketMemory.station_hyperion_cut, undefined);
    sim.bus.emit('ui:purchaseSurveyData', {
      sectorId: SURVEY_SECTOR,
      stationId: SOURCE_STATION,
    });

    assert.equal(state.player.credits, creditsBefore - price,
      'world still charges through the economy credit owner');
    assert.equal(state.world.discovery[SURVEY_SECTOR].source, 'survey');
    assert.equal(state.world.discovery[SURVEY_SECTOR].surveyedAt, 123);

    const targetStationIds = target.stations.map((station) => station.id).sort();
    assert.deepEqual(Object.keys(state.player.marketMemory).sort(), targetStationIds,
      'the packet reveals exactly the purchased sector stations');
    assert.equal(state.player.marketMemory.station_sker, undefined,
      'an unpurchased remote market remains unknown');

    for (const stationId of targetStationIds) {
      const memory = state.player.marketMemory[stationId];
      const market = state.economy.markets[stationId];
      assert.ok(memory && market, `${stationId} should have one retained survey snapshot`);
      assert.deepEqual(Object.keys(memory).sort(), Object.keys(market).sort());
      assert.equal(memory[IRON].source, 'survey');
      assert.equal(memory[IRON].seenAt, 123);
      assert.equal(memory[IRON].buy, market[IRON].lastBuy);
      assert.equal(memory[IRON].sell, market[IRON].lastSell);
    }
  } finally {
    sim.dispose();
    economy._instance = null;
  }
});

test('a direct dock observation supersedes survey provenance and cannot be downgraded', () => {
  const sim = boot();
  const state = sim.state;

  try {
    sim.bus.emit('map:sectorCharted', { sectorId: SURVEY_SECTOR, source: 'survey' });
    const stationId = 'station_hyperion_cut';
    assert.equal(state.player.marketMemory[stationId][IRON].source, 'survey');

    state.simTime = 180;
    sim.bus.emit('dock:docked', { stationId });
    const docked = structuredClone(state.player.marketMemory[stationId][IRON]);
    assert.equal(docked.source, undefined, 'direct observations use the existing dock provenance');
    assert.equal(docked.seenAt, 180);

    state.simTime = 240;
    sim.bus.emit('map:sectorCharted', { sectorId: SURVEY_SECTOR, source: 'survey' });
    assert.deepEqual(state.player.marketMemory[stationId][IRON], docked,
      'a replayed survey event must not overwrite stronger dock knowledge');
  } finally {
    sim.dispose();
    economy._instance = null;
  }
});
