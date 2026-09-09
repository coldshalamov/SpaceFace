import test from 'node:test';
import assert from 'node:assert/strict';

import { isUnsellableCargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';

function stateWith(active = [], persistentCargo = []) {
  return {
    missions: { active },
    story: { persistentCargo },
  };
}

test('persistent story cargo remains unsellable without an active mission', () => {
  const state = stateWith([], ['cmdty_story_core']);
  assert.equal(isUnsellableCargo(state, 'cmdty_story_core'), true);
  assert.equal(isUnsellableCargo(state, 'cmdty_food'), false);
});

test('only active preloaded contract freight locks its exact commodity', () => {
  const state = stateWith([
    {
      id: 'sealed-delivery',
      status: 'active',
      preloadedCargo: true,
      params: { cmdtyId: 'cmdty_microchips' },
    },
    {
      id: 'finished-delivery',
      status: 'completed',
      preloadedCargo: true,
      params: { cmdtyId: 'cmdty_food' },
    },
  ]);

  assert.equal(isUnsellableCargo(state, 'cmdty_microchips'), true);
  assert.equal(isUnsellableCargo(state, 'cmdty_food'), false);
  assert.equal(isUnsellableCargo(state, 'cmdty_water'), false);
});

test('ordinary haul and trade cargo remains sellable', () => {
  const active = [{
    id: 'bulk-haul',
    type: 'bulk_trade',
    status: 'active',
    preloadedCargo: false,
    params: { cmdtyId: 'cmdty_ore' },
  }];
  const state = stateWith(active);
  const before = JSON.stringify(state);

  assert.equal(isUnsellableCargo(state, 'cmdty_ore'), false);
  assert.equal(isUnsellableCargo(state, 'cmdty_food'), false);
  assert.equal(JSON.stringify(state), before, 'the sellability check must be read-only');
});

function tradeHarness({ preloadedCargo }) {
  const commodityId = 'cmdty_microchips';
  const state = {
    meta: { seed: 1 },
    simTime: 0,
    story: { persistentCargo: [] },
    missions: {
      active: [{
        id: 'delivery',
        status: 'active',
        preloadedCargo,
        params: { cmdtyId: commodityId },
      }],
    },
    player: {
      credits: 100,
      cargo: { items: { [commodityId]: 4 }, capVolume: 40, usedVolume: 4, usedMass: 4 },
      stats: {},
      tradeLedger: [],
      tradeLots: {},
    },
    economy: {
      markets: { station_test: { [commodityId]: { stock: 20 } } },
    },
  };
  const system = {
    ...economy,
    state,
    quote(_stationId, _commodityId, side, qty) {
      return { ok: true, side, qty, total: qty * 10, priceImpactPct: 0 };
    },
    registryGet() { return null; },
    grantCredits(total) { state.player.credits += total; },
    recomputeLivePrices() {},
    afterTrade() {},
  };
  return { commodityId, state, system };
}

test('economy rejects sealed cargo at the shared sell-intent boundary', () => {
  const { commodityId, state, system } = tradeHarness({ preloadedCargo: true });
  const before = structuredClone(state);

  const result = system.execute('station_test', commodityId, 'sell', 2);

  assert.deepEqual(result, { ok: false, reason: 'mission_cargo_locked' });
  assert.deepEqual(state, before, 'a rejected live-route sale must be transactional');
});

test('economy still sells ordinary mission haul cargo', () => {
  const { commodityId, state, system } = tradeHarness({ preloadedCargo: false });

  const result = system.execute('station_test', commodityId, 'sell', 2);

  assert.equal(result.ok, true);
  assert.equal(result.qty, 2);
  assert.equal(state.player.cargo.items[commodityId], 2);
  assert.equal(state.player.credits, 120);
});

test('live sell intent explains the sealed-cargo rejection', () => {
  const { commodityId, system } = tradeHarness({ preloadedCargo: true });
  const emitted = [];
  system.bus = { emit: (name, payload) => emitted.push({ name, payload }) };
  system.dockedStationId = () => 'station_test';

  const result = system.handleTrade(commodityId, 'sell', 2);

  assert.deepEqual(result, { ok: false, reason: 'mission_cargo_locked' });
  assert.equal(
    emitted.find((entry) => entry.name === 'toast')?.payload?.text,
    'Sealed contract cargo cannot be sold',
  );
  assert.equal(
    emitted.find((entry) => entry.name === 'economy:tradeFailed')?.payload?.reason,
    'mission_cargo_locked',
  );
});
