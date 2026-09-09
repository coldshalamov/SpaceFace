import assert from 'node:assert/strict';
import test from 'node:test';

import { economy } from '../src/systems/economy.js';
import { priceModForState } from '../src/systems/factions.js';
import { stationSurchargeWaiverLabel, unitPrice } from '../src/ui/market/tradeLogic.js';

function makeBus() {
  const handlers = new Map();
  return {
    on(event, handler) {
      const list = handlers.get(event) || [];
      list.push(handler);
      handlers.set(event, list);
      return () => handlers.set(event, (handlers.get(event) || []).filter((entry) => entry !== handler));
    },
    emit(event, payload) {
      for (const handler of [...(handlers.get(event) || [])]) handler(payload);
    },
  };
}

function bootEconomy(rep = -500) {
  const state = {
    mode: 'flight',
    simTime: 0,
    meta: { seed: 0x47a },
    player: {
      credits: 100_000,
      cargo: { items: {}, capVolume: 1_000, usedVolume: 0 },
      marketMemory: {},
      tradeLedger: [],
      tradeLots: {},
    },
    story: { flags: {} },
    factions: { faction_scn: { rep } },
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

test('Choice A removes only hostile-standing station buy surcharges', () => {
  const state = {
    factions: { faction_scn: { rep: -500 } },
    story: { flags: {} },
  };

  const hostile = priceModForState(state, 'faction_scn');
  assert.equal(hostile.buy, 1.2);
  assert.equal(hostile.sell, 0.85);
  assert.equal(hostile.surchargeWaived, false);

  state.story.flags.surcharges_cleared = true;
  const waived = priceModForState(state, 'faction_scn');
  assert.equal(waived.buy, 1, 'the waiver removes the above-base markup, not the base price');
  assert.equal(waived.sell, hostile.sell, 'the waiver does not improve hostile sell proceeds');
  assert.equal(waived.surchargeWaived, true);

  state.factions.faction_scn.rep = 500;
  const allied = priceModForState(state, 'faction_scn');
  assert.equal(allied.buy, 0.85, 'earned ally discounts survive the waiver');
  assert.equal(allied.sell, 1.1, 'earned ally sell bonuses survive the waiver');
  assert.equal(allied.surchargeWaived, false);
});

test('market quote, transaction-facing unit price, and visible waiver status share Choice A truth', () => {
  const { state, econ } = bootEconomy(-500);
  const stationId = 'station_helios';
  const commodityId = 'cmdty_food';

  const hostileBuy = econ.quote(stationId, commodityId, 'buy', 6);
  const hostileSell = econ.quote(stationId, commodityId, 'sell', 6);
  assert.equal(hostileBuy.ok, true);
  assert.equal(hostileBuy.standingPriceMultiplier, 1.2);
  assert.equal(hostileBuy.stationSurchargeWaived, false);

  state.story.flags.surcharges_cleared = true;
  const waivedBuy = econ.quote(stationId, commodityId, 'buy', 6);
  const waivedSell = econ.quote(stationId, commodityId, 'sell', 6);
  assert.equal(waivedBuy.ok, true);
  assert.equal(waivedBuy.standingPriceMultiplier, 1);
  assert.equal(waivedBuy.stationSurchargeWaived, true);
  assert.ok(waivedBuy.total < hostileBuy.total, 'Choice A lowers the actual executable buy total');
  assert.equal(waivedSell.total, hostileSell.total, 'Choice A leaves sell proceeds unchanged');

  const ctx = { state, registry: { get: (name) => name === 'economy' ? econ : null } };
  const oneUnit = econ.quote(stationId, commodityId, 'buy', 1);
  assert.equal(unitPrice(ctx, stationId, commodityId, 'buy'), oneUnit.unitAvg);
  assert.equal(stationSurchargeWaiverLabel(state), 'CONCORD AUXILIARY · STATION SURCHARGES WAIVED');

  const creditsBefore = state.player.credits;
  const executable = econ.quote(stationId, commodityId, 'buy', 2);
  const bought = econ.execute(stationId, commodityId, 'buy', 2);
  assert.equal(bought.ok, true);
  assert.equal(bought.total, executable.total, 'the sole credits writer charges the displayed quote');
  assert.equal(state.player.credits, creditsBefore - executable.total);

  economy._instance = null;
});
