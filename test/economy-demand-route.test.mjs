import assert from 'node:assert/strict';
import test from 'node:test';

import { computeBestTrades } from '../src/ui/screens/market.js';

test('best-trade output preserves the persistent demand reason behind a destination premium', () => {
  const state = {
    simTime: 120,
    player: {
      credits: 10000,
      cargo: { items: {}, capVolume: 40, usedVolume: 0 },
      marketMemory: {},
    },
    economy: {
      markets: {
        station_helios: {
          cmdty_weapons: { lastBuy: 100, lastSell: 90, stock: 500, role: 'none' },
        },
      },
      marketIntel: {
        station_ceres: {
          seenAtT: 120,
          snapshot: {
            cmdty_weapons: { sell: 118, demandMult: 1, demandDrivers: [] },
          },
        },
        station_reach: {
          seenAtT: 120,
          snapshot: {
            cmdty_weapons: {
              sell: 145,
              demandMult: 1.26,
              demandDrivers: [
                { id: 'war-footing', label: 'War footing', shortLabel: 'War · weapons up', direction: 'up' },
                { id: 'blockade-relief', label: 'Blockade pressure', shortLabel: 'Blockade · supply up', direction: 'up' },
              ],
            },
          },
        },
      },
    },
  };

  const routes = computeBestTrades(state, 'station_helios');
  assert.equal(routes[0].destStation, 'station_reach');
  assert.equal(routes[0].destinationDemand.multiplier, 1.26);
  assert.match(routes[0].destinationDemand.label, /war/i);
  assert.match(routes[0].destinationDemand.label, /blockade/i);
  assert.equal(routes[0].destinationDemand.direction, 'up');
});
