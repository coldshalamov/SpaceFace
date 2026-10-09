// FB-052 — a lost courier is a line and a marker, and delivery clears the marker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createMarketNews } from '../src/ui/marketNews.js';
import { wreckEcologyMarkers } from '../src/ui/wreckEcologyMarkers.js';

test('four worksite lines and a courier marker that clears', () => {
  const state = { simTime: 0, meta: { seed: 4242 }, ui: {}, world: { currentSectorId: 'sector_ceres_belt' } };
  const bus = createBus();
  createMarketNews({ state, bus, helpers: { voice: { say: () => false } } });
  bus.emit('site:courierLost', { courierId: 'c1', sectorId: 'sector_ceres_belt', x: 10, z: 20 });
  bus.emit('site:laneSpilled', { siteId: 'site-1' });
  bus.emit('site:podBuilt', { siteId: 'site-1' });
  bus.emit('site:courierDelivered', { courierId: 'c1', sectorId: 'sector_ceres_belt' });
  assert.equal(state.ui.marketNews.log.length, 4);
  assert.equal(wreckEcologyMarkers(state, 'sector_ceres_belt').some((row) => row.kind === 'courier_lost'), false);
});
