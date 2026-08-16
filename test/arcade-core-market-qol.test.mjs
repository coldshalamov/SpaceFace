import assert from 'node:assert/strict';
import test from 'node:test';

import { economy } from '../src/systems/economy.js';

function createBus() {
  const listeners = new Map();
  const emitted = [];
  return {
    emitted,
    on(name, handler) {
      const row = listeners.get(name) || [];
      row.push(handler);
      listeners.set(name, row);
    },
    emit(name, payload) {
      emitted.push({ name, payload });
      for (const handler of listeners.get(name) || []) handler(payload);
    },
  };
}

function boot({ credits = 100 } = {}) {
  const state = {
    meta: { seed: 5402 },
    simTime: 12,
    world: { currentSectorId: 'sector_helios_prime' },
    ui: {},
    story: { persistentCargo: [] },
    missions: { active: [] },
    player: {
      credits,
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 80 },
      stats: {},
      marketMemory: {},
      tradeLedger: [],
      tradeLots: {},
    },
    economy: {
      markets: {
        station_helios: {
          cmdty_scrap_metal: { stock: 100 },
        },
      },
      cycles: {},
      econEvents: [],
      econClock: { accumulator: 0, lastTickT: 0, ticksElapsed: 0 },
      marketIntel: {},
    },
  };
  const bus = createBus();
  const system = { ...economy };
  system.init({ state, bus, helpers: {}, registry: { get: () => null } });
  system.ensureStationMarkets = () => {};
  system.snapshotIntel = () => {};
  system.refreshAllPersistentDemand = () => {};
  system.recomputeLivePrices = () => {};
  system.recordLivePriceHistory = () => {};
  const settlements = [];
  system.afterTrade = (...args) => { settlements.push(args); return {}; };
  system.addToCargo = (_cargo, owner, commodityId, qty) => {
    owner.player.cargo.items[commodityId] = (owner.player.cargo.items[commodityId] || 0) + qty;
    owner.player.cargo.usedVolume += qty;
    return qty;
  };
  system.removeFromCargo = (_cargo, owner, commodityId, qty) => {
    const removed = Math.min(qty, owner.player.cargo.items[commodityId] || 0);
    owner.player.cargo.items[commodityId] = (owner.player.cargo.items[commodityId] || 0) - removed;
    owner.player.cargo.usedVolume -= removed;
    return removed;
  };
  system.chargeCredits = (amount) => { state.player.credits -= amount; };
  bus.emit('dock:docked', { stationId: 'station_helios' });
  return { state, bus, system, settlements };
}

test('buy-back restores newest sale lots at their exact realized credits and settles once', () => {
  const run = boot();
  run.system._noteDockedSale('station_helios', 'cmdty_scrap_metal', 2, 20);
  run.system._noteDockedSale('station_helios', 'cmdty_scrap_metal', 1, 30);

  run.bus.emit('ui:buyBack', { commodityId: 'cmdty_scrap_metal', qty: 1 });
  assert.equal(run.state.player.credits, 70, 'the newest 30-credit sale lot is repurchased first');
  assert.equal(run.state.player.cargo.items.cmdty_scrap_metal, 1);
  assert.deepEqual(run.system.buyBackOffers().map(({ qty, total }) => ({ qty, total })), [{ qty: 2, total: 20 }]);

  run.bus.emit('ui:buyBack', { commodityId: 'cmdty_scrap_metal', qty: 99 });
  assert.equal(run.state.player.credits, 50, 'the complete older lot costs its exact realized 20 credits');
  assert.equal(run.state.player.cargo.items.cmdty_scrap_metal, 3);
  assert.equal(run.settlements.length, 2);

  run.bus.emit('ui:buyBack', { commodityId: 'cmdty_scrap_metal', qty: 1 });
  assert.equal(run.state.player.credits, 50, 'an exhausted offer cannot settle twice');
  assert.equal(run.state.player.cargo.items.cmdty_scrap_metal, 3);
  assert.equal(run.settlements.length, 2);
});

test('buy-back failures are transactional and dock/load boundaries discard the offer', () => {
  const run = boot({ credits: 29 });
  run.system._noteDockedSale('station_helios', 'cmdty_scrap_metal', 1, 30);
  const before = structuredClone({
    credits: run.state.player.credits,
    cargo: run.state.player.cargo,
    stock: run.state.economy.markets.station_helios.cmdty_scrap_metal.stock,
  });
  run.bus.emit('ui:buyBack', { commodityId: 'cmdty_scrap_metal', qty: 1 });
  assert.deepEqual({
    credits: run.state.player.credits,
    cargo: run.state.player.cargo,
    stock: run.state.economy.markets.station_helios.cmdty_scrap_metal.stock,
  }, before);
  assert.equal(run.settlements.length, 0);

  run.state.player.credits = 100;
  run.bus.emit('dock:undocked', {});
  assert.deepEqual(run.system.buyBackOffers(), []);
  run.bus.emit('dock:docked', { stationId: 'station_helios' });
  run.system._noteDockedSale('station_helios', 'cmdty_scrap_metal', 1, 30);
  run.bus.emit('save:loaded', {});
  assert.deepEqual(run.system.buyBackOffers(), [], 'save/load is a new dock session for buy-back');
  run.system._noteDockedSale('station_helios', 'cmdty_scrap_metal', 1, 30);
  run.bus.emit('dock:docked', { stationId: 'station_tethys' });
  assert.deepEqual(run.system.buyBackOffers(), [], 'moving to another station clears the previous offer');
});

test('sell-all-junk selects only explicit junk and retains valuable or protected cargo', () => {
  const run = boot();
  Object.assign(run.state.player.cargo.items, {
    cmdty_scrap_metal: 4,
    cmdty_salvage_electronics: 2,
    cmdty_classified_salvage: 1,
    cmdty_ore_iron: 3,
  });
  const calls = [];
  run.system.execute = (stationId, commodityId, side, qty) => {
    calls.push({ stationId, commodityId, side, qty });
    run.state.player.cargo.items[commodityId] -= qty;
    return { ok: true, qty, total: qty * 8 };
  };
  run.bus.emit('ui:sellAllJunk', {});
  assert.deepEqual(calls, [{
    stationId: 'station_helios', commodityId: 'cmdty_scrap_metal', side: 'sell', qty: 4,
  }]);
  assert.equal(run.state.player.cargo.items.cmdty_scrap_metal, 0);
  assert.equal(run.state.player.cargo.items.cmdty_salvage_electronics, 2);
  assert.equal(run.state.player.cargo.items.cmdty_classified_salvage, 1);
  assert.equal(run.state.player.cargo.items.cmdty_ore_iron, 3);

  run.state.player.cargo.items.cmdty_scrap_metal = 5;
  run.state.story.persistentCargo = ['cmdty_scrap_metal'];
  calls.length = 0;
  run.bus.emit('ui:sellAllJunk', {});
  assert.deepEqual(calls, [], 'protected junk never reaches the trade writer');
  assert.equal(run.state.player.cargo.items.cmdty_scrap_metal, 5);
});
