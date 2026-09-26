import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { SECTORS } from '../src/data/sectors.js';
import { economy } from '../src/systems/economy.js';
import { world } from '../src/systems/world.js';
import { quoteProvenance, knownStationQuotes } from '../src/ui/marketIntelligence.js';
import { describeTradeIntel, computeBestTrades } from '../src/ui/market/tradeLogic.js';

// INFERENCE-25 (WF-06): the Market Data Uplink was sold, shipped fitted on starter builds, and
// billed continuous power while its own catalog admitted it changed nothing. A fitted uplink now
// streams live exchange quotes from every station in the current sector, tagged 'uplink' so the
// intel surfaces can say "market uplink" instead of pretending the player berthed there.

const SECTOR_ID = 'sector_hyperion_cut';
const IRON = 'cmdty_ore_iron';
const UPLINK = 'mod_market_data_s';

function boot(fittings = []) {
  const sim = createSimulation({ seed: 0x51a7, systems: [economy, world], updateOrder: [] });
  const state = sim.state;
  state.world.currentSectorId = SECTOR_ID;
  state.simTime = 123;
  state.entities.set(state.playerId, { id: state.playerId, data: { fittings } });
  return sim;
}

function sectorStationIds() {
  return SECTORS.find((s) => s.id === SECTOR_ID).stations.map((st) => st.id).sort();
}

test('no module fitted: entering a sector and ticking the economy writes no remote intel', () => {
  const sim = boot([]);
  const state = sim.state;
  try {
    sim.bus.emit('sector:enter', { sectorId: SECTOR_ID });
    economy._instance.econTick(5, state);
    assert.equal(Object.keys(state.economy.marketIntel).length, 0);
    assert.equal(Object.keys(state.player.marketMemory || {}).length, 0,
      'remote markets stay unknown without the uplink');
  } finally {
    sim.dispose();
    economy._instance = null;
  }
});

test('a fitted uplink streams every sector station live, tagged market-uplink provenance', () => {
  const sim = boot([UPLINK]);
  const state = sim.state;
  try {
    sim.bus.emit('sector:enter', { sectorId: SECTOR_ID });
    economy._instance.econTick(5, state);
    const ids = sectorStationIds();
    assert.deepEqual(Object.keys(state.economy.marketIntel).sort(), ids,
      'every station in the sector has a live intel row');
    assert.deepEqual(Object.keys(state.player.marketMemory).sort(), ids,
      'player memory carries the same stations');
    for (const stationId of ids) {
      const intel = state.economy.marketIntel[stationId];
      const memory = state.player.marketMemory[stationId];
      const market = state.economy.markets[stationId];
      assert.equal(intel.source, 'uplink', `${stationId} intel carries uplink provenance`);
      assert.equal(intel.seenAtT, 123);
      assert.equal(memory[IRON].source, 'uplink');
      assert.equal(memory[IRON].seenAt, 123);
      assert.equal(memory[IRON].buy, market[IRON].lastBuy);
      assert.equal(memory[IRON].sell, market[IRON].lastSell);
    }
  } finally {
    sim.dispose();
    economy._instance = null;
  }
});

test('uplink rows resolve as "market uplink" and reach the quote surfaces', () => {
  const sim = boot([UPLINK]);
  const state = sim.state;
  try {
    sim.bus.emit('sector:enter', { sectorId: SECTOR_ID });
    economy._instance.econTick(5, state);
    const stationId = sectorStationIds()[0];
    const quote = state.player.marketMemory[stationId][IRON];
    assert.deepEqual(quoteProvenance(quote), { source: 'uplink', label: 'market uplink' });
    const quotes = knownStationQuotes(state.player.marketMemory, IRON, state.simTime);
    assert.ok(quotes.some((q) => q.stationId === stationId),
      'the fail-closed provenance gate admits uplink rows, not bypasses them');
  } finally {
    sim.dispose();
    economy._instance = null;
  }
});

test('the docked berth keeps dock provenance; survey cannot downgrade a feed row', () => {
  const sim = boot([UPLINK]);
  const state = sim.state;
  try {
    sim.bus.emit('sector:enter', { sectorId: SECTOR_ID });
    economy._instance.econTick(5, state);
    const dockedId = sectorStationIds()[0];
    sim.bus.emit('dock:docked', { stationId: dockedId });
    state.simTime = 180;
    economy._instance.econTick(5, state);
    assert.equal(state.player.marketMemory[dockedId][IRON].source, undefined,
      'a real visit outranks the feed — dock rows keep untagged dock provenance');
    for (const stationId of sectorStationIds()) {
      if (stationId === dockedId) continue;
      assert.equal(state.player.marketMemory[stationId][IRON].source, 'uplink',
        `${stationId} stays feed-tagged while the berth reads as a visit`);
    }
    const dockedMemory = structuredClone(state.player.marketMemory[dockedId][IRON]);
    sim.bus.emit('map:sectorCharted', { sectorId: SECTOR_ID, source: 'survey' });
    assert.deepEqual(state.player.marketMemory[dockedId][IRON], dockedMemory,
      'a survey packet must not overwrite stronger live knowledge');
  } finally {
    sim.dispose();
    economy._instance = null;
  }
});

test('the trade board says uplink, never scanned, for feed rows', () => {
  const sim = boot([UPLINK]);
  const state = sim.state;
  try {
    sim.bus.emit('sector:enter', { sectorId: SECTOR_ID });
    economy._instance.econTick(5, state);
    const hereId = sectorStationIds()[0];
    const trades = computeBestTrades(state, hereId);
    const uplinkTrades = trades.filter((trade) => trade.intelSource === 'uplink');
    assert.ok(uplinkTrades.length > 0,
      'feed-sourced destinations reach the trade board as uplink, not scanned');
    for (const trade of uplinkTrades) {
      assert.equal(trade.intelLabel, 'uplink · fresh',
        `${trade.destStation} must not masquerade as a dock scan`);
    }
    assert.equal(describeTradeIntel(state, { intelSource: 'uplink', seenAtT: state.simTime }),
      'uplink · fresh');
    assert.equal(describeTradeIntel(state, { intelSource: 'scanned', seenAtT: state.simTime }),
      'scan · fresh');
  } finally {
    sim.dispose();
    economy._instance = null;
  }
});

test('a berth the player physically made keeps dock provenance under the feed', () => {
  const sim = boot([UPLINK]);
  const state = sim.state;
  try {
    const dockedId = sectorStationIds()[0];
    sim.bus.emit('sector:enter', { sectorId: SECTOR_ID });
    sim.bus.emit('dock:docked', { stationId: dockedId });
    economy._instance.econTick(5, state);
    sim.bus.emit('dock:undocked', { stationId: dockedId });
    state.simTime += 10;
    economy._instance.econTick(5, state);
    assert.equal(state.player.marketMemory[dockedId][IRON].source, undefined,
      'the visit is the stronger fact — the feed refreshes quotes, not provenance');
    assert.equal(state.player.marketMemory[dockedId][IRON].seenAt, 133,
      'the quotes still refresh under the feed');
  } finally {
    sim.dispose();
    economy._instance = null;
  }
});

test('a dead hull does not keep streaming the sector', () => {
  const sim = boot([UPLINK]);
  const state = sim.state;
  try {
    sim.bus.emit('sector:enter', { sectorId: SECTOR_ID });
    economy._instance.econTick(5, state);
    const stationId = sectorStationIds()[0];
    assert.equal(state.player.marketMemory[stationId][IRON].seenAt, 123);
    state.entities.get(state.playerId).alive = false;
    state.simTime += 30;
    economy._instance.econTick(5, state);
    assert.equal(state.player.marketMemory[stationId][IRON].seenAt, 123,
      'the feed dies with the ship that carries it');
  } finally {
    sim.dispose();
    economy._instance = null;
  }
});

test('ripping the module out stops the feed; retained rows age honestly', () => {
  const sim = boot([UPLINK]);
  const state = sim.state;
  try {
    sim.bus.emit('sector:enter', { sectorId: SECTOR_ID });
    economy._instance.econTick(5, state);
    const stationId = sectorStationIds()[0];
    assert.equal(state.player.marketMemory[stationId][IRON].seenAt, 123);
    state.entities.get(state.playerId).data.fittings = [];
    state.simTime += 30;
    economy._instance.econTick(5, state);
    assert.equal(state.player.marketMemory[stationId][IRON].seenAt, 123,
      'no new uplink write once the module is gone');
    assert.equal(state.player.marketMemory[stationId][IRON].source, 'uplink',
      'the last feed row persists and fades like anything not looked at lately');
  } finally {
    sim.dispose();
    economy._instance = null;
  }
});

test('uplink provenance survives the economy save round-trip', () => {
  const sim = boot([UPLINK]);
  const state = sim.state;
  try {
    sim.bus.emit('sector:enter', { sectorId: SECTOR_ID });
    economy._instance.econTick(5, state);
    const snapshot = economy._instance.serialize();
    sim.dispose();
    economy._instance = null;

    const sim2 = createSimulation({ seed: 0x51a7, systems: [economy, world], updateOrder: [] });
    try {
      economy._instance.deserialize(snapshot);
      const stationId = sectorStationIds()[0];
      assert.equal(sim2.state.economy.marketIntel[stationId].source, 'uplink',
        'intel provenance round-trips through serialize/deserialize');
    } finally {
      sim2.dispose();
      economy._instance = null;
    }
  } finally {
    economy._instance = null;
  }
});
