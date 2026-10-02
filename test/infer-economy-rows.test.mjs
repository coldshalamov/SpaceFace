// NXB-025 — sell your own units of a commodity while its sealed contract units stay put.
// NXB-026 — compare one two-stop freight plan against real capacity, stock, and cost.
import test from 'node:test';
import assert from 'node:assert/strict';

import { cargo, reservedCargoQuantity, sellableCargoQuantity } from '../src/systems/cargo.js';
import {
  compareDockedFreight,
  compareTwoStopFreight,
  economy,
  formatFreightComparison,
} from '../src/systems/economy.js';
import { missions } from '../src/systems/missions.js';

const CHIPS = 'cmdty_microchips';
const FOOD = 'cmdty_food';

function hold(items, extra = {}) {
  return {
    meta: { seed: 25 },
    simTime: 1000,
    tick: 1,
    story: { persistentCargo: [] },
    missions: {
      active: [],
      boards: {},
      completedLog: [],
      receipts: [],
      nextId: 1,
      config: { maxActive: 8 },
    },
    player: {
      credits: 500,
      cargo: {
        items: { ...items },
        capVolume: 80,
        usedVolume: 0,
        usedMass: 0,
      },
      stats: {},
      tradeLedger: [],
      tradeLots: {},
    },
    economy: { markets: { station_test: { [CHIPS]: { stock: 40, lastSell: 10, lastBuy: 12 } } } },
    ui: {},
    nav: {},
    world: { sectors: {} },
    ...extra,
  };
}

function preloaded(id, qty, commodityId = CHIPS) {
  return {
    id,
    type: 'cargo_delivery',
    status: 'active',
    preloadedCargo: true,
    params: { cmdtyId: commodityId, qty, sealedRemaining: qty, sealedDelivered: 0, sealAccounted: true },
  };
}

function busOf() {
  const events = [];
  return {
    events,
    emit(name, payload) { events.push({ name, payload }); },
    on() { return () => {}; },
  };
}

function missionOwner(state) {
  const owner = Object.create(missions);
  owner.state = state;
  owner.bus = busOf();
  owner.helpers = {};
  return owner;
}

function tradeOwner(state) {
  const owner = Object.create(economy);
  owner.state = state;
  owner.bus = busOf();
  owner.quote = (_stationId, _commodityId, side, qty) => (
    { ok: true, side, qty, total: qty * 10, priceImpactPct: 0 }
  );
  owner.registryGet = () => null;
  owner.grantCredits = (total) => { state.player.credits += total; };
  owner.recomputeLivePrices = () => {};
  owner.afterTrade = () => null;
  return owner;
}

test('free units sell and sealed units of the same good do not', () => {
  const state = hold({ [CHIPS]: 7 });
  state.missions.active.push(preloaded('a', 4));
  const owner = tradeOwner(state);
  const beforeReserved = reservedCargoQuantity(state, CHIPS);

  assert.equal(sellableCargoQuantity(state, CHIPS), 3);
  assert.equal(owner.execute('station_test', CHIPS, 'sell', 3).ok, true);
  assert.equal(state.player.cargo.items[CHIPS], 4);
  assert.equal(reservedCargoQuantity(state, CHIPS), beforeReserved);

  const blocked = owner.execute('station_test', CHIPS, 'sell', 1);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'mission_cargo_locked');
  assert.equal(state.player.cargo.items[CHIPS], 4);
  assert.equal(state.player.credits, 530);

  const again = owner.execute('station_test', CHIPS, 'sell', 1);
  assert.deepEqual(
    { ok: again.ok, items: state.player.cargo.items[CHIPS], credits: state.player.credits },
    { ok: false, items: 4, credits: 530 },
  );
});

test('two contracts reserve and release only their own units', () => {
  const state = hold({ [CHIPS]: 9 });
  state.missions.active.push(preloaded('a', 4), preloaded('b', 3));
  const owner = missionOwner(state);

  assert.equal(sellableCargoQuantity(state, CHIPS), 2);
  assert.equal(owner.deliverSealedPortion('a', 5).ok, false, 'cannot turn in the sibling contract too');
  assert.equal(state.player.cargo.items[CHIPS], 9);

  const part = owner.deliverSealedPortion('a', 1);
  assert.equal(part.ok, true);
  assert.equal(part.remaining, 3);
  assert.equal(state.player.cargo.items[CHIPS], 8);
  assert.equal(reservedCargoQuantity(state, CHIPS), 6);

  assert.equal(owner.abandonMission('a'), true);
  assert.equal(state.player.cargo.items[CHIPS], 5, 'cancel removes only the remaining claim');
  assert.equal(state.missions.active.map((row) => row.id).join(','), 'b');
  assert.equal(reservedCargoQuantity(state, CHIPS), 3);
  assert.equal(sellableCargoQuantity(state, CHIPS), 2);

  assert.equal(owner.abandonMission('a'), false);
  assert.equal(state.player.cargo.items[CHIPS], 5, 'a second cancel does not release the other contract');
  assert.equal(owner.abandonMission('b'), true);
  assert.equal(state.player.cargo.items[CHIPS], 2);
  assert.equal(sellableCargoQuantity(state, CHIPS), 2);
});

test('accepted, delivered, and removed units reconcile across resume', () => {
  const state = hold({});
  state.missions.boards.station_test = {
    slots: [{
      id: 'offer-seal',
      type: 'cargo_delivery',
      stationId: 'station_test',
      preloadedCargo: true,
      reward_cr: 100,
      collateral_cr: 0,
      params: { cmdtyId: CHIPS, qty: 4 },
      title: 'Seal the chips',
    }],
  };
  const owner = missionOwner(state);
  assert.equal(owner.acceptMission('offer-seal'), true);
  const mission = state.missions.active[0];
  assert.equal(state.player.cargo.items[CHIPS], 4);
  assert.equal(mission.params.sealedRemaining, 4);
  assert.equal(mission.params.sealedDelivered, 0);
  assert.equal(sellableCargoQuantity(state, CHIPS), 0);

  state.player.cargo.items[CHIPS] += 3;
  const seller = tradeOwner(state);
  assert.equal(seller.execute('station_test', CHIPS, 'sell', 3).qty, 3);
  assert.equal(owner.deliverSealedPortion(mission.id, 2).remaining, 2);

  const saved = JSON.parse(JSON.stringify({
    items: state.player.cargo.items,
    active: state.missions.active,
  }));
  const resumed = hold(saved.items);
  resumed.missions.active = saved.active;
  assert.equal(sellableCargoQuantity(resumed, CHIPS), 0);
  assert.equal(reservedCargoQuantity(resumed, CHIPS), 2);
  const resumedOwner = missionOwner(resumed);
  const rest = resumedOwner.deliverSealedPortion(saved.active[0].id, 2);
  assert.equal(rest.ok, true);
  assert.equal(rest.remaining, 0);
  assert.equal(resumed.player.cargo.items[CHIPS] || 0, 0);
  assert.equal(resumedOwner.deliverSealedPortion(saved.active[0].id, 2).ok, false, 'a repeated confirmation does not deliver the same units twice');
  assert.equal(resumed.player.cargo.items[CHIPS] || 0, 0);

  const held = 0;
  const bought = 3;
  const accepted = 4;
  const sold = 3;
  const delivered = 4;
  assert.equal(held + sold + delivered, accepted + bought);
});

test('an old save with a known quantity does not invent delivery, and a missing quantity stays fully sealed', () => {
  const known = hold({ [CHIPS]: 6 });
  known.missions.active.push({
    id: 'old',
    status: 'active',
    preloadedCargo: true,
    params: { cmdtyId: CHIPS, qty: 4 },
  });
  assert.equal(sellableCargoQuantity(known, CHIPS), 2);
  assert.equal(known.missions.active[0].params.sealedDelivered, undefined);

  const ambiguous = hold({ [CHIPS]: 4 });
  ambiguous.missions.active.push({
    id: 'older',
    status: 'active',
    preloadedCargo: true,
    params: { cmdtyId: CHIPS },
  });
  assert.equal(sellableCargoQuantity(ambiguous, CHIPS), 0);
  const dumped = Object.create(cargo);
  dumped.state = ambiguous;
  dumped.bus = busOf();
  dumped.helpers = { spawnEntity() { throw new Error('sealed units must stay aboard'); } };
  ambiguous.playerId = 1;
  ambiguous.entities = new Map([[1, {
    id: 1, pos: { x: 0, z: 0 }, rot: 0, vel: { x: 0, z: 0 }, radius: 6,
  }]]);
  assert.equal(dumped.jettison(CHIPS, 1), 0);
  assert.equal(ambiguous.player.cargo.items[CHIPS], 4);
});

test('jettison refuses an amount that would include sealed units and dumps a free amount of the selected lot', () => {
  const state = hold({ [CHIPS]: 5, [FOOD]: 2 });
  state.missions.active.push(preloaded('a', 3));
  state.player.cargo.selectedId = CHIPS;
  state.playerId = 1;
  state.entities = new Map([[1, {
    id: 1, pos: { x: 0, z: 0 }, rot: 0, vel: { x: 0, z: 0 }, radius: 6, factionId: 'player',
  }]]);
  const pods = [];
  const owner = Object.create(cargo);
  owner.init({
    state,
    bus: busOf(),
    helpers: { spawnEntity(spec) { pods.push(spec); return spec; } },
  });
  assert.equal(owner.jettison(CHIPS, 3), 0);
  assert.equal(state.player.cargo.items[CHIPS], 5);
  assert.equal(owner.jettison(CHIPS, 2), 2);
  assert.equal(state.player.cargo.items[CHIPS], 3);
  assert.equal(state.player.cargo.items[FOOD], 2);
  assert.equal(pods.length, 1);
  assert.equal(pods[0].data.commodityId, CHIPS);
});

test('a two-stop plan is capped by credits, stock, and volume, and fees count once', () => {
  const plan = {
    credits: 100,
    capVolume: 10,
    usedVolume: 6,
    operatingCost: 40,
    direct: { units: 2, sell: 15, certainty: 'quoted' },
    leg1: { buy: 10, sell: 10, stock: 100, volume: 1, qty: 4.9, buyCertainty: 'quoted', sellCertainty: 'estimate' },
    leg2: { buy: 10, sell: 25, stock: 3, volume: 1, buyCertainty: 'estimate', sellCertainty: 'estimate' },
  };
  const frozen = structuredClone(plan);
  const result = compareTwoStopFreight(plan);
  assert.deepEqual(plan, frozen);
  assert.equal(result.settled, false);
  assert.equal(result.guaranteed, false);
  assert.equal(result.selectable, true);
  assert.equal(result.feesCounted, 1);
  assert.equal(result.leg1.units, 4, 'the load is rounded down before it is priced');
  assert.equal(result.leg1.cost, 40);
  assert.equal(result.beforeSale.loadAboard, 4);
  assert.equal(result.beforeSale.freeVolume, 0, 'the first load is still aboard before it sells');
  assert.equal(result.leg2.units, 3, 'stock, not the vanished-hold fantasy, caps the second buy');
  assert.ok(result.leg2.units < 10, 'clearing the hold before the sale would have bought more');
  assert.equal(result.limitingLeg, 2);
  assert.equal(result.limitingInput, 'stock');
  assert.equal(result.direct.proceeds, 30);
  assert.equal(result.direct.certainty, 'quoted');
  assert.equal(result.leg1.sellCertainty, 'estimate');
  assert.notEqual(result.net, result.direct.proceeds);

  const tightCredits = compareTwoStopFreight({
    ...plan,
    capVolume: 100,
    usedVolume: 0,
    leg1: { ...plan.leg1, qty: null, stock: 100 },
    leg2: { ...plan.leg2, stock: 100 },
  });
  assert.equal(tightCredits.leg1.units, 6, 'fees come off the credits once, then the buy');
  assert.equal(tightCredits.leg2.units, 6, 'the second buy spends what the sale actually returns');
  assert.notEqual(tightCredits.leg2.units, 2, 'the fee is not charged a second time');
  assert.notEqual(tightCredits.leg2.units, 10, 'capital tied up in the first load is not spent again');
});

test('a missing future price is unknown, and changing quantity keeps the same price basis', () => {
  const base = {
    credits: 500,
    capVolume: 40,
    usedVolume: 4,
    operatingCost: 0,
    leg1: { buy: 8, sell: 9, stock: 20, volume: 1, qty: 5, stale: true, sellCertainty: 'estimate' },
    leg2: { buy: 4, sell: null, stock: 12, volume: 1, buyCertainty: 'estimate' },
  };
  const unknown = compareTwoStopFreight(base);
  assert.equal(unknown.net, null);
  assert.equal(unknown.profitText, 'unknown');
  assert.equal(unknown.uncertainty, 'stale');
  assert.match(formatFreightComparison(unknown), /unknown/);
  assert.equal(formatFreightComparison(unknown).includes('estimate 0'), false);
  assert.equal(formatFreightComparison(unknown).includes('not guaranteed'), true);

  const smaller = compareTwoStopFreight({ ...base, leg1: { ...base.leg1, qty: 2 }, leg2: { ...base.leg2, sell: 7, qty: 2 } });
  const larger = compareTwoStopFreight({ ...base, leg1: { ...base.leg1, qty: 5 }, leg2: { ...base.leg2, sell: 7, qty: 9 } });
  assert.deepEqual(smaller.basis, larger.basis);
  assert.equal(smaller.leg1.units, 2);
  assert.equal(larger.leg1.units, 5);
  assert.notEqual(smaller.leg2.units, larger.leg2.units);
});

test('the live sale is the market price, not the freight estimate', () => {
  const state = hold({ [FOOD]: 2 });
  state.economy.markets.station_test[FOOD] = { stock: 20, lastSell: 10, lastBuy: 12 };
  const estimate = compareTwoStopFreight({
    credits: state.player.credits,
    capVolume: 80,
    usedVolume: 0,
    operatingCost: 15,
    direct: { units: 2, sell: 90, certainty: 'quoted' },
    leg1: { buy: 12, sell: 40, stock: 8, volume: 1, buyCertainty: 'quoted', sellCertainty: 'estimate' },
    leg2: { buy: 5, sell: 9, stock: 4, volume: 1 },
  });
  const owner = tradeOwner(state);
  const sale = owner.execute('station_test', FOOD, 'sell', 2);
  assert.equal(sale.ok, true);
  assert.equal(sale.total, 20);
  assert.notEqual(sale.total, estimate.net);
  assert.notEqual(sale.total, estimate.direct.proceeds);
  assert.equal(estimate.settled, false);
  assert.equal(state.player.credits, 520);
});

test('the docked comparison names the limiting leg without promising the forecast', () => {
  const state = hold({ [CHIPS]: 2 });
  state.simTime = 5000;
  state.player.marketMemory = {
    station_customs: {
      [FOOD]: { buy: 6, sell: 7, stock: 2, seenAt: 100 },
    },
    station_forge: {
      [FOOD]: { buy: 4, sell: 14, stock: 9, seenAt: 100 },
    },
  };
  state.economy.markets.station_test[CHIPS] = { stock: 30, lastBuy: 11, lastSell: 9 };
  state.economy.markets.station_customs = { [FOOD]: { stock: 4, lastBuy: 6, lastSell: 7 } };
  const trade = {
    cmdtyId: CHIPS,
    destStation: 'station_customs',
    buyHere: 11,
    sellThere: 20,
    seenAtT: 100,
  };
  const result = compareDockedFreight(state, 'station_test', trade);
  assert.ok(result);
  assert.equal(result.guaranteed, false);
  assert.equal(result.leg1.buyCertainty, 'quoted');
  assert.equal(result.leg1.sellCertainty, 'estimate');
  assert.equal(result.uncertainty, 'stale');
  const line = formatFreightComparison(result);
  assert.match(line, /leg \d limited by /);
  assert.match(line, /not guaranteed/);
  assert.match(line, /fees .+ once/);
  assert.equal(line.includes('+0 cr'), false);
});
