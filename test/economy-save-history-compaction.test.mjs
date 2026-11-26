import assert from 'node:assert/strict';

import { COMMODITIES } from '../src/data/commodities.js';
import { economy } from '../src/systems/economy.js';
import { marketHistoryFor } from '../src/economy/marketModel.js';

// ECON-BUILD-1 — price history is no longer a persisted ring: it is the closed
// form evaluated at past times, reconstructed on demand. What persists per listing
// is the v2 anchor row — equilibrium/baseEq/role, dents, demand, and the last
// stamped quote — so a save/load boundary reproduces the uninterrupted book
// bit-for-bit. Legacy shapes still migrate: object rows' saved `stock` deviation
// becomes one fresh dent, and stamp-less rows re-price on load.

const commodityId = COMMODITIES[0].id;

function makeState({ knownStation = true } = {}) {
  return {
    meta: { seed: 47 },
    simTime: 2200,
    content: { commodities: COMMODITIES },
    player: { marketMemory: knownStation ? { station_ceres: {} } : {} },
    economy: {
      markets: {
        station_ceres: {
          [commodityId]: {
            stock: 700,
            equilibrium: 720,
            baseEq: 720,
            role: 'none',
            dents: [{ t: 2100, q: -20 }],
            lastMid: 40, lastBuy: 44, lastSell: 36,
            demandMult: 1,
            demandDrivers: [],
          },
        },
      },
      econEvents: [],
      econClock: { accumulator: 0, lastTickT: 0, ticksElapsed: 0 },
      marketIntel: {},
      rngSeed: 123,
    },
  };
}

economy.state = makeState();
economy._nextEventId = 1;
economy._installRngFunction();

economy.state.economy.marketIntel.station_ceres = {
  seenAtT: 2190,
  snapshot: { [commodityId]: { mid: 44, demandDrivers: [{ id: 'fixture', mult: 1.1 }] } },
};
economy.state.economy.econEvents.push({
  id: 'evt_fixture', type: 'shortage', mods: [{ field: 'spread', mult: 1.2 }],
});

const serialized = economy.serialize();
serialized.marketIntel.station_ceres.snapshot[commodityId].demandDrivers[0].mult = 99;
serialized.econEvents[0].mods[0].mult = 99;
assert.equal(economy.state.economy.marketIntel.station_ceres.snapshot[commodityId].demandDrivers[0].mult, 1.1,
  'snapshot-owned economy serialization must not retain nested market-intel references');
assert.equal(economy.state.economy.econEvents[0].mods[0].mult, 1.2,
  'snapshot-owned economy serialization must not retain nested event references');
assert.ok(Array.isArray(serialized.markets.station_ceres),
  'market entries persist as compact rows instead of one property-heavy object per commodity');
assert.equal(serialized.marketRows, 2, 'the anchor-row format is versioned');
const marketRow = serialized.markets.station_ceres.find((row) => row[0] === commodityId);
assert.ok(marketRow, 'compact market rows retain the commodity identity');
assert.equal(marketRow.length, 10, 'v2 anchors pack eq/baseEq/role/dents/demand/quote/stock');
assert.deepEqual(marketRow.slice(1, 4), [720, 720, 0], 'equilibrium, baseEq and role code persist');
assert.deepEqual(marketRow[4], [2100, -20], 'a live dent persists as one flat [t, q] pair');
assert.deepEqual(marketRow.slice(6, 10), [40, 44, 36, 700],
  'the stamped quote and stock mirror round-trip, so reload stays bit-identical');

economy.state = makeState({ knownStation: false });
economy._installRngFunction();
const unvisited = economy.serialize();
const unvisitedRow = unvisited.markets.station_ceres.find((row) => row[0] === commodityId);
assert.equal(unvisitedRow.length, 10,
  'no derived chart history is persisted — not even for an unvisited station');
assert.ok(!JSON.stringify(unvisited.markets).includes('"mid"'),
  'derived history points never reach the save');

// History is the closed form evaluated at past times: a cold restore and a prewarmed
// restore ask the same function and get the same trace, no RNG consumed either way.
economy.state = makeState({ knownStation: false });
economy._installRngFunction();
economy.deserialize(structuredClone(unvisited));
const coldHistory = marketHistoryFor(economy.state, 'station_ceres', commodityId, { spanS: 2400, stepS: 300 });
const coldSeed = economy.state.economy.rngSeed;
economy.state = makeState({ knownStation: false });
economy.newGame();
economy.deserialize(structuredClone(unvisited));
const warmHistory = marketHistoryFor(economy.state, 'station_ceres', commodityId, { spanS: 2400, stepS: 300 });
assert.ok(coldHistory.length >= 2, 'an omitted history is reconstructed on demand');
assert.deepEqual(warmHistory, coldHistory,
  'restoring the same omitted history is independent of pre-load market warmup');
assert.equal(economy.state.economy.rngSeed, unvisited.rngSeed,
  'history reconstruction consumes no saved RNG');

// The persisted quote survives Continue untouched — restoring must not re-stamp a
// row whose stamps were saved, or a mid-load quote would drift from what the player saw.
economy.state = makeState({ knownStation: false });
economy._installRngFunction();
economy.deserialize(structuredClone(serialized));
const restoredEntry = economy.state.economy.markets.station_ceres[commodityId];
assert.deepEqual(
  [restoredEntry.lastMid, restoredEntry.lastBuy, restoredEntry.lastSell, restoredEntry.stock],
  [40, 44, 36, 700],
  'the saved quote and shelf mirror come back untouched',
);
assert.deepEqual(restoredEntry.dents, [{ t: 2100, q: -20 }], 'the dent survives the round trip');

// Early v2 rows (no stamp tail) and legacy object rows still load by re-pricing and
// migrating the saved stock deviation into one fresh dent.
const earlyV2 = structuredClone(serialized);
earlyV2.markets.station_ceres[0].length = 6;
economy.deserialize(earlyV2);
const repriced = economy.state.economy.markets.station_ceres[commodityId];
assert.ok([repriced.lastMid, repriced.lastBuy, repriced.lastSell]
  .every((p) => Number.isSafeInteger(p) && p > 0),
  'stamp-less rows reconstruct usable prices on load');

const legacy = structuredClone(serialized);
legacy.marketRows = 0;
legacy.markets = {
  station_ceres: {
    [commodityId]: { stock: 700, equilibrium: 720, baseEq: 720, role: 'none' },
  },
};
economy.deserialize(legacy);
const migrated = economy.state.economy.markets.station_ceres[commodityId];
assert.ok(Array.isArray(migrated.dents) && migrated.dents.length === 1
  && migrated.dents[0].q === -20,
  'a legacy saved stock deviation migrates to one fresh dent');
assert.ok(migrated.lastSell > 0, 'the migrated listing is priced');

// Malformed saved quotes recompute the complete tuple instead of serving -1.
const malformed = structuredClone(serialized);
malformed.markets.station_ceres[0][8] = -1;
economy.deserialize(malformed);
const fixed = economy.state.economy.markets.station_ceres[commodityId];
assert.ok(fixed.lastSell > 0, 'a malformed saved sell quote recomputes');

console.log('economy-save-history-compaction: PASS');
