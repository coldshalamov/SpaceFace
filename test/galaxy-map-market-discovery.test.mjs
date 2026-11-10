import assert from 'node:assert/strict';
import test from 'node:test';

import { COMMODITIES } from '../src/data/commodities.js';
import {
  bestKnownSectorMarket,
  galaxyMapScreen,
  marketIntelCommodityOptions,
  selectedMarketCommodityOnOpen,
} from '../src/ui/galaxyMap.js';

const IRON = 'cmdty_ore_iron';
const WEAPONS = 'cmdty_weapons';
const NARCOTICS = 'cmdty_narcotics';

function quote({ buy, sell, seenAt = 0, drivers = [] }) {
  return {
    buy,
    sell,
    seenAt,
    source: 'dock',
    demandMult: drivers.length ? 1.22 : 1,
    demandDrivers: drivers,
  };
}

test('Market Intel includes a remembered restricted commodity without exposing unknown contraband', () => {
  const state = {
    player: {
      marketMemory: {
        station_foundry: {
          [WEAPONS]: quote({ buy: 290, sell: 330 }),
          [NARCOTICS]: { buy: 'corrupt', sell: 'corrupt', source: 'dock' },
        },
      },
    },
  };

  const ids = marketIntelCommodityOptions(state, COMMODITIES).map((commodity) => commodity.id);
  assert.ok(ids.includes(IRON), 'ordinary legal commodities remain available');
  assert.ok(ids.includes(WEAPONS), 'remembered restricted Weapon Systems become selectable intel');
  assert.ok(!ids.includes(NARCOTICS), 'corrupt memory does not surface contraband as known intel');
});

test('opening the map on a trade route follows the waypoint commodity', () => {
  const state = {
    nav: { waypoint: { kind: 'trade', commodityId: WEAPONS } },
    player: { marketMemory: {} },
  };

  assert.equal(selectedMarketCommodityOnOpen(state, IRON, COMMODITIES), WEAPONS);
  assert.equal(
    selectedMarketCommodityOnOpen({ nav: { waypoint: { kind: 'mission', commodityId: WEAPONS } } }, IRON, COMMODITIES),
    IRON,
    'non-trade objectives must not silently retarget Market Intel',
  );

  const prior = galaxyMapScreen._selectedCommodity;
  try {
    galaxyMapScreen._selectedCommodity = IRON;
    galaxyMapScreen.onShow({ state });
    assert.equal(
      galaxyMapScreen._selectedCommodity,
      WEAPONS,
      'the real map onShow path synchronizes its Market Intel selection',
    );
  } finally {
    galaxyMapScreen.onHide();
    galaxyMapScreen._selectedCommodity = prior;
  }
});

test('sector Market Intel selects the best remembered secondary station and preserves its demand cause', () => {
  const warDriver = {
    id: 'war-footing',
    label: 'War footing',
    shortLabel: 'War · military up',
    explanation: 'Active faction war raises local demand for Weapon Systems.',
    direction: 'up',
  };
  const blockadeDriver = {
    id: 'blockade-relief',
    label: 'Blockade pressure',
    shortLabel: 'Blockade · supply up',
    explanation: 'Disrupted lanes increase local demand for Weapon Systems.',
    direction: 'up',
  };
  const sector = {
    id: 'sector_test',
    stations: [
      { id: 'station_primary', name: 'Primary Exchange' },
      { id: 'station_secondary', name: 'Forward Arsenal' },
    ],
  };
  const state = {
    simTime: 1_200,
    player: {
      marketMemory: {
        station_primary: { [WEAPONS]: quote({ buy: 300, sell: 315, seenAt: 1_150 }) },
        station_secondary: { [WEAPONS]: quote({ buy: 370, sell: 480, seenAt: 600, drivers: [warDriver, blockadeDriver] }) },
      },
    },
    // A spectacular live quote at an unknown station must remain invisible.
    economy: {
      markets: {
        station_unknown: { [WEAPONS]: { lastBuy: 1, lastSell: 9_999 } },
      },
    },
  };

  const intel = bestKnownSectorMarket(state, sector, WEAPONS);
  assert.ok(intel);
  assert.equal(intel.stationId, 'station_secondary');
  assert.equal(intel.stationName, 'Forward Arsenal');
  assert.equal(intel.sell, 480);
  assert.equal(intel.ageS, 600);
  assert.equal(intel.ageLabel, '10 min');
  assert.match(intel.demandReason, /war/i);
  assert.match(intel.demandReason, /blockade/i);
  assert.equal(intel.demandDirection, 'up');
  assert.ok(!JSON.stringify(intel).includes('9999'), 'unknown live market data never enters the readout');
});

test('sector Market Intel fails closed when no station quote is remembered', () => {
  const sector = {
    id: 'sector_unknown',
    stations: [{ id: 'station_unknown', name: 'Unknown Exchange' }],
  };
  const state = {
    simTime: 100,
    player: { marketMemory: {} },
    economy: { markets: { station_unknown: { [IRON]: { lastBuy: 1, lastSell: 9_999 } } } },
  };

  assert.equal(bestKnownSectorMarket(state, sector, IRON), null);
});
