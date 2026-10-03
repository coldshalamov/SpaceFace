// FB-034 — a day card names a real change, and a frozen digest stays quiet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createMarketNews } from '../src/ui/marketNews.js';

function boot() {
  const state = {
    simTime: 0,
    meta: { seed: 4242 },
    world: {
      sectorState: {
        helios: { id: 'sector_helios_prime', owner: 'faction_scn', threat: 1 },
      },
    },
    ui: {},
  };
  const bus = createBus();
  const news = createMarketNews({ state, bus, helpers: { voice: { say: () => false } } });
  return { state, bus, news };
}

test('three changed days publish three cards and a repeated digest publishes none', () => {
  const { state, bus } = boot();
  const log = () => state.ui.marketNews.log;
  bus.emit('sectorsim:tick', { digest: 1, dayCounter: 1 });
  assert.equal(log().length, 0);
  state.world.sectorState.helios.owner = 'faction_dmc';
  bus.emit('sectorsim:tick', { digest: 2, dayCounter: 2 });
  state.world.sectorState.helios.threat = 3;
  bus.emit('sectorsim:tick', { digest: 3, dayCounter: 3 });
  state.world.sectorState.helios.owner = 'faction_mts';
  bus.emit('sectorsim:tick', { digest: 4, dayCounter: 4 });
  assert.equal(log().length, 3);
  bus.emit('sectorsim:tick', { digest: 4, dayCounter: 4 });
  assert.equal(log().length, 3);
  assert.ok(log().every((row) => row.sourceRef));
});
