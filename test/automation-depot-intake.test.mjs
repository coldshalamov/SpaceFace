import test from 'node:test';
import assert from 'node:assert/strict';

import { addCargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';

const STATION = 'station_helios';
const ORE = 'cmdty_ore_iron';

function makeBus() {
  const handlers = new Map();
  return {
    on(event, handler) {
      const list = handlers.get(event) || [];
      list.push(handler);
      handlers.set(event, list);
    },
    emit(event, payload) {
      for (const handler of [...(handlers.get(event) || [])]) handler(payload);
    },
  };
}

function bootEconomy(seed = 17707) {
  const state = {
    mode: 'flight',
    simTime: 12,
    meta: { seed },
    player: {
      credits: 100_000,
      cargo: { items: {}, capVolume: 1_000, usedVolume: 0, usedMass: 0 },
      marketMemory: {},
      tradeLedger: [],
      tradeLots: {},
      stats: {},
    },
    story: { flags: {}, persistentCargo: [] },
    missions: { active: [] },
    factions: { faction_scn: { rep: 0 } },
    economy: {},
    conflicts: {},
    sectorSim: { field: { nodes: {} } },
    world: { currentSectorId: 'sector_helios_prime', sectors: {} },
    ui: {},
    nav: {},
    entities: new Map(),
    entityList: [],
  };
  const econ = { ...economy };
  econ.init({ state, bus: makeBus(), helpers: {}, registry: { get: () => null } });
  econ.newGame();
  return { state, econ };
}

function listing(state) {
  return state.economy.markets[STATION][ORE];
}

function deliver(econ, qty) {
  econ.bus.emit('economy:applyTradePressure', { stationId: STATION, good: ORE, vol: qty });
}

function consume(econ, qty) {
  econ.bus.emit('economy:applyTradePressure', { stationId: STATION, good: ORE, vol: -qty });
}

test('PQ-177.07 competing programmed deliveries cannot exceed real receiving headroom', () => {
  const { state, econ } = bootEconomy();
  const creditsBefore = state.player.credits;
  const probe = econ.quoteAutomationIntake(STATION, ORE, 1_000_000);
  const stockBefore = listing(state).stock;
  assert.equal(probe.ok, true);
  assert.ok(probe.fillable > 0, 'a resting Helios iron book has standing-order room');
  assert.equal(probe.fillable, Math.max(0, Math.floor(probe.intakeTarget - probe.stock)));
  assert.equal(probe.stock, stockBefore);
  assert.equal(listing(state).stock, stockBefore, 'the intake quote does not add stock');
  assert.equal(state.player.credits, creditsBefore, 'the intake quote is not a credit writer');

  const headroom = probe.fillable;
  const firstWant = Math.floor(headroom / 2) + 1;
  const secondWant = headroom;
  assert.ok(firstWant + secondWant > headroom);

  const first = econ.quoteAutomationIntake(STATION, ORE, firstWant);
  assert.equal(first.ok, true);
  assert.equal(first.fillable, firstWant);
  assert.equal(listing(state).stock, stockBefore);
  deliver(econ, first.fillable);
  assert.equal(state.player.credits, creditsBefore, 'trade pressure does not pay the player');

  const second = econ.quoteAutomationIntake(STATION, ORE, secondWant);
  const accepted = first.fillable + (second.fillable || 0);
  assert.ok(accepted <= headroom);
  assert.equal(accepted, headroom);
  assert.equal(second.ok, true);
  assert.equal(second.fillable, headroom - first.fillable);
  assert.equal(second.reason, null);
});

test('PQ-177.07 a partial standing-order quote uses the exact real sell total', () => {
  const { state, econ } = bootEconomy();
  const probe = econ.quoteAutomationIntake(STATION, ORE, 1_000_000);
  const headroom = probe.fillable;
  assert.ok(headroom >= 2, 'need room to prove a partial fill');
  const want = headroom + 17;
  const partial = econ.quoteAutomationIntake(STATION, ORE, want);
  assert.equal(partial.ok, true);
  assert.equal(partial.fillable, headroom);
  const live = econ.quote(STATION, ORE, 'sell', partial.fillable);
  assert.equal(live.ok, true);
  assert.equal(partial.total, live.total);
  assert.equal(partial.unitAvg, live.unitAvg);
  assert.equal(listing(state).stock, probe.stock);
});

test('PQ-177.07 a saturated valid depot refuses with demand_saturation and keeps the book', () => {
  const { state, econ } = bootEconomy();
  const probe = econ.quoteAutomationIntake(STATION, ORE, 1_000_000);
  deliver(econ, probe.fillable);
  const stockAfter = listing(state).stock;
  const sat = econ.quoteAutomationIntake(STATION, ORE, 40);
  assert.equal(sat.ok, false);
  assert.equal(sat.reason, 'demand_saturation');
  assert.equal(sat.fillable, 0);
  assert.equal(sat.unitAvg, 0);
  assert.equal(sat.total, 0);
  assert.ok(sat.intakeTarget >= 1);
  assert.equal(sat.stock, stockAfter);
  assert.equal(listing(state).stock, stockAfter, 'a refused intake quote does not dump the load');
});

test('PQ-177.07 saturation recovers after real buy/consumption pressure', () => {
  const { econ } = bootEconomy();
  const probe = econ.quoteAutomationIntake(STATION, ORE, 1_000_000);
  deliver(econ, probe.fillable);
  const sat = econ.quoteAutomationIntake(STATION, ORE, 12);
  assert.equal(sat.ok, false);
  assert.equal(sat.reason, 'demand_saturation');

  consume(econ, 8);
  const reopened = econ.quoteAutomationIntake(STATION, ORE, 12);
  assert.equal(reopened.ok, true);
  assert.equal(reopened.fillable, 8);
  assert.equal(reopened.reason, null);
});

test('PQ-177.07 untraded and mission-locked standing-order deliveries fail without a fallback price', () => {
  const { state, econ } = bootEconomy();

  const missing = econ.quoteAutomationIntake(STATION, 'cmdty_does_not_exist', 6);
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'untraded');
  assert.equal(missing.fillable, 0);
  assert.equal(missing.unitAvg, 0);
  assert.equal(missing.total, 0);

  const contraband = econ.quoteAutomationIntake(STATION, 'cmdty_narcotics', 6);
  assert.equal(contraband.ok, false);
  assert.equal(contraband.reason, 'untraded');
  assert.equal(contraband.unitAvg, 0);
  assert.equal(contraband.total, 0);

  state.missions.active = [{
    id: 'sealed-delivery',
    status: 'active',
    preloadedCargo: true,
    params: { cmdtyId: ORE },
  }];
  const locked = econ.quoteAutomationIntake(STATION, ORE, 6);
  assert.equal(locked.ok, false);
  assert.equal(locked.reason, 'mission_cargo_locked');
  assert.equal(locked.fillable, 0);
  assert.equal(locked.unitAvg, 0);
  assert.equal(locked.total, 0);
  assert.ok(locked.intakeTarget >= 1);
});

test('PQ-177.07 a player can still sell by hand when programmed intake is saturated', () => {
  const { state, econ } = bootEconomy();
  const probe = econ.quoteAutomationIntake(STATION, ORE, 1_000_000);
  deliver(econ, probe.fillable);
  const sat = econ.quoteAutomationIntake(STATION, ORE, 4);
  assert.equal(sat.reason, 'demand_saturation');

  const manualQuote = econ.quote(STATION, ORE, 'sell', 4);
  assert.equal(manualQuote.ok, true);
  assert.ok(manualQuote.total > 0);

  const added = addCargo(state, ORE, 4);
  assert.equal(added, 4);
  const creditsBefore = state.player.credits;
  const sold = econ.execute(STATION, ORE, 'sell', 4);
  assert.equal(sold.ok, true);
  assert.equal(sold.qty, 4);
  assert.ok(state.player.credits > creditsBefore);
  assert.equal(state.player.cargo.items[ORE] || 0, 0);
});
