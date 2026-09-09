import assert from 'node:assert/strict';

import { COMMODITIES } from '../src/data/commodities.js';
import { economy } from '../src/systems/economy.js';
import { deserializeCycles, serializeCycles } from '../src/systems/economyCycles.js';

const commodityId = COMMODITIES[0].id;
const history = Array.from({ length: 64 }, (_, index) => ({
  t: 1200 + index * 15,
  mid: 40 + (index % 9),
}));

function makeState(serializedHistory = history, { knownStation = true } = {}) {
  return {
    meta: { seed: 47 },
    simTime: 2200,
    content: { commodities: COMMODITIES },
    player: { marketMemory: knownStation ? { station_test: {} } : {} },
    economy: {
      markets: {
        station_test: {
          [commodityId]: {
            stock: 700,
            equilibrium: 720,
            baseEq: 720,
            role: 'none',
            eventMods: [],
            history: serializedHistory,
          },
        },
      },
      cycles: {},
      econEvents: [],
      econClock: { accumulator: 0, lastTickT: 0, ticksElapsed: 0 },
      marketIntel: {},
      rngSeed: 123,
    },
  };
}

economy.state = makeState();
economy._nextEventId = 1;
economy._eventAccumulator = 0;
economy._installRngFunction();

economy.state.economy.marketIntel.station_test = {
  seenAtT: 2190,
  snapshot: { [commodityId]: { mid: 44, demandDrivers: [{ id: 'fixture', mult: 1.1 }] } },
};
economy.state.economy.econEvents.push({
  id: 'evt_fixture', type: 'shortage', mods: [{ field: 'spread', mult: 1.2 }],
});

const serialized = economy.serialize();
serialized.marketIntel.station_test.snapshot[commodityId].demandDrivers[0].mult = 99;
serialized.econEvents[0].mods[0].mult = 99;
assert.equal(economy.state.economy.marketIntel.station_test.snapshot[commodityId].demandDrivers[0].mult, 1.1,
  'snapshot-owned economy serialization must not retain nested market-intel references');
assert.equal(economy.state.economy.econEvents[0].mods[0].mult, 1.2,
  'snapshot-owned economy serialization must not retain nested event references');
assert.ok(Array.isArray(serialized.markets.station_test),
  'market entries persist as compact rows instead of one property-heavy object per commodity');
const marketRow = serialized.markets.station_test.find((row) => row[0] === commodityId);
assert.ok(marketRow, 'compact market rows retain the commodity identity');
const packed = marketRow[6];
assert.equal(Array.isArray(packed), true);
assert.equal(packed.length, history.length * 2,
  'history persists as one flat numeric sequence instead of allocating one object per point');
assert.deepEqual(packed.slice(0, 6), [1200, 40, 1215, 41, 1230, 42]);
assert.ok(JSON.stringify(packed).length < JSON.stringify(history).length * 0.55,
  'the persisted price trace materially reduces save size and worker clone cost');

economy.state = makeState(history, { knownStation: false });
economy._installRngFunction();
const unvisited = economy.serialize();
const unvisitedRow = unvisited.markets.station_test.find((row) => row[0] === commodityId);
assert.equal(unvisitedRow.length, 6,
  'derived chart history is not persisted for a station the player has never visited');

economy.state = makeState([]);
economy._installRngFunction();
economy.deserialize(serialized);
assert.deepEqual(economy.state.economy.markets.station_test[commodityId].history, history,
  'packed history restores to the existing runtime point shape without data loss');

const legacy = structuredClone(serialized);
legacy.markets = {
  station_test: {
    [commodityId]: {
      stock: 700,
      equilibrium: 720,
      baseEq: 720,
      role: 'none',
      eventMods: [],
      history,
    },
  },
};
economy.state = makeState([]);
economy._installRngFunction();
economy.deserialize(legacy);
assert.deepEqual(economy.state.economy.markets.station_test[commodityId].history, history,
  'older object-per-point saves remain load-compatible');

console.log('economy-save-history-compaction: PASS');

const cycleState = {
  economy: {
    cycles: {
      station_test: {
        [commodityId]: {
          cmdtyId: commodityId,
          regime: 'turbulent', family: 'turbulent', phase: 0.25, frequency: 0.01,
          amplitude: 0.2, bias: 0.03, slope: 0, a: 0, b: 0, c: 0, pivot: 0.5,
          amp2: 0.08, freq2: 0.017, phase2: 0.4,
          amp3: 0.04, freq3: 0.024, phase3: 0.8,
          regimeStartT: 100, regimeEndT: 1700,
        },
      },
    },
  },
};
const packedCycles = serializeCycles(cycleState);
assert.ok(Array.isArray(packedCycles.station_test),
  'economic cycles persist as compact rows instead of 20-property objects');
const restoredCycleState = { economy: { cycles: {} } };
deserializeCycles(restoredCycleState, packedCycles);
assert.equal(restoredCycleState.economy.cycles.station_test[commodityId].family, 'turbulent');
assert.equal(restoredCycleState.economy.cycles.station_test[commodityId].amp3, 0.04);
