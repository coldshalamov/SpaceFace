import test from 'node:test';
import assert from 'node:assert/strict';
import { economy } from '../src/systems/economy.js';
import { quietBerthLine } from '../src/ui/dockArrival.js';

test('quiet comparison uses the previous physical arrival and current effective snapshot, not remote intel', () => {
  const state = { simTime: 0, player: {}, economy: { markets: { station_helios: { ore: { lastMid: 7, lastBuy: 10, lastSell: 4, stock: 1 } } }, marketIntel: {} } };
  const owner = { state, recordMarketMemory: economy.recordMarketMemory };
  const snap = options => economy.snapshotIntel.call(owner, 'station_helios', options);
  snap({ source: 'uplink' });
  assert.equal(quietBerthLine(state, 'station_helios'), null);
  snap({ arrival: true });
  assert.equal(quietBerthLine(state, 'station_helios'), null);
  state.simTime = 1800;
  state.economy.markets.station_helios.ore.lastBuy = 12;
  snap({ source: 'uplink' });
  snap({ arrival: true });
  assert.match(quietBerthLine(state, 'station_helios'), /prices have crept.*3 days ago/);
  state.simTime = 5000;
  snap();
  assert.match(quietBerthLine(state, 'station_helios'), /3 days ago/, 'refresh cannot alter the arrival comparison');
});

test('conditioned prices are compared on the same basis on both arrivals', () => {
  const state = { simTime: 10, player: {}, economy: {
    markets: { station_helios: { ore: { lastMid: 10, lastBuy: 20, lastSell: 10, stock: 1 } } },
    marketIntel: {}, stationConditions: { station_helios: { strikeUntil: 1000, strikeKills: 2 } },
  } };
  const owner = { state, recordMarketMemory: economy.recordMarketMemory };
  economy.snapshotIntel.call(owner, 'station_helios', { arrival: true });
  state.simTime = 11;
  economy.snapshotIntel.call(owner, 'station_helios', { arrival: true });
  assert.match(quietBerthLine(state, 'station_helios'), /boards have not moved/);
});
