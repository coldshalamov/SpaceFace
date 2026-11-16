// NXI-098 — a sealed held lot stays on the sell list, and Sell does not take it.
import test from 'node:test';
import assert from 'node:assert/strict';

import { isUnsellableCargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import {
  createMarketHistoryBackfill,
  createMarketScreen,
  marketPriceHistorySeries,
} from '../src/ui/station/screens/market.js';
import { installSimCommandSink, uninstallSimCommandSink } from '../src/core/simLaneCommands.js';
import { installDom, dispatch } from './helpers/mini-dom.mjs';

const CHIPS = 'cmdty_microchips';
const FOOD = 'cmdty_food';
const STATION = 'station_test';


function listing(buy, sell) {
  return { stock: 20, buy, sell, lastBuy: buy, lastSell: sell };
}

function holdState(chipsQty, foodQty) {
  const items = { [CHIPS]: chipsQty };
  if (foodQty > 0) items[FOOD] = foodQty;
  return {
    meta: { seed: 98 },
    simTime: 0,
    mode: 'station',
    story: { persistentCargo: [] },
    missions: {
      active: [{
        id: 'delivery',
        status: 'active',
        preloadedCargo: true,
        params: { cmdtyId: CHIPS },
      }],
    },
    player: {
      credits: 5000,
      cargo: { items, capVolume: 80, usedVolume: 10, usedMass: 10 },
      stats: {},
      tradeLedger: [],
      tradeLots: {},
    },
    economy: {
      markets: {
        [STATION]: {
          [CHIPS]: listing(40, 30),
          [FOOD]: listing(12, 8),
        },
      },
    },
    ui: { dockedStationId: STATION },
    world: { sectors: {} },
  };
}

function sealedRefusal(state) {
  const emitted = [];
  const system = {
    ...economy,
    state: structuredClone(state),
    bus: { emit(name, payload) { emitted.push({ name, payload }); } },
    dockedStationId() { return STATION; },
    quote(_stationId, commodityId, side, qty) {
      return { ok: true, side, qty, total: qty * 10, commodityId };
    },
    registryGet() { return null; },
    grantCredits() {},
    recomputeLivePrices() {},
    afterTrade() {},
  };
  system.handleTrade(CHIPS, 'sell', 1);
  const toast = emitted.find((entry) => entry.name === 'toast');
  assert.ok(toast && toast.payload && toast.payload.text, 'the economy refusal is the note the counter shows');
  return toast.payload.text;
}

function openSell(state) {
  const emitted = [];
  const bus = {
    emit(name, payload) { emitted.push({ name, payload }); },
    on() { return () => {}; },
  };
  const screen = createMarketScreen({
    state,
    bus,
    registry: {
      get(name) {
        if (name !== 'economy') return null;
        return {
          quote(_stationId, commodityId, side, qty) {
            return { ok: true, side, qty, total: qty * 10, commodityId, partial: false, priceImpactPct: 0 };
          },
        };
      },
    },
  });
  document.body.appendChild(screen.el);
  screen.onShow({ tradeMode: 'sell', state });
  return { screen, emitted };
}

function openSellWithEventBus(state, quoteState, tradeMode = 'sell') {
  const emitted = [];
  const handlers = new Map();
  const bus = {
    emit(name, payload) {
      emitted.push({ name, payload });
      for (const handler of [...(handlers.get(name) || [])]) handler(payload);
    },
    on(name, handler) {
      const list = handlers.get(name) || [];
      list.push(handler);
      handlers.set(name, list);
      return () => handlers.set(name, (handlers.get(name) || []).filter((entry) => entry !== handler));
    },
    off(name, handler) {
      handlers.set(name, (handlers.get(name) || []).filter((entry) => entry !== handler));
    },
  };
  const screen = createMarketScreen({
    state,
    bus,
    registry: {
      get(name) {
        if (name !== 'economy') return null;
        return {
          quote(_stationId, commodityId, side, qty) {
            return { ok: true, side, qty, total: quoteState.total, commodityId, partial: false, priceImpactPct: 0 };
          },
        };
      },
    },
  });
  document.body.appendChild(screen.el);
  screen.onShow({ tradeMode, state });
  return { screen, emitted, bus };
}

function row(screen, id) {
  return screen.el.querySelector(`[data-cmdty="${id}"]`);
}

test('NXI-098: a sealed hold stays listed and its sell control does not fire', () => {
  const dom = installDom();
  try {
    const chipsQty = 4;
    const foodQty = 3;
    const state = holdState(chipsQty, foodQty);
    assert.equal(isUnsellableCargo(state, CHIPS), true);
    assert.equal(isUnsellableCargo(state, FOOD), false);
    const refusal = sealedRefusal(state);
    const { screen, emitted } = openSell(state);
    const chips = row(screen, CHIPS);
    const food = row(screen, FOOD);
    assert.ok(chips, 'the sealed lot is on the sell list');
    assert.ok(food, 'a sellable neighbor stays on the sell list');
    const held = chips.querySelector('.sx-mkt-row__held').textContent;
    assert.ok(held.includes(String(chipsQty)), held);
    assert.ok(held.includes('u'), held);

    chips.click();
    const sealedGo = screen.el.querySelector('[data-go]');
    const sealedNote = screen.el.querySelector('.sx-trade__note');
    assert.equal(sealedGo.disabled, true);
    assert.equal(sealedNote.textContent, refusal);
    sealedGo.click();
    assert.equal(emitted.some((entry) => entry.name === 'ui:sell'), false);
    const sealedSale = screen.el.querySelector('[data-sale-line]');
    assert.equal(sealedSale.getAttribute('data-sale-qty'), '0');
    assert.equal(sealedSale.textContent.includes('If sold'), false);
    const holdArc = screen.el.querySelector('.orr-mkt-holdarc');
    assert.ok(holdArc, 'the hold graphic stays on the counter');
    assert.ok(holdArc.textContent.includes(String(state.player.cargo.usedVolume)));
    assert.ok(holdArc.textContent.includes(String(state.player.cargo.capVolume)));
    const fewer = screen.el.querySelector('[data-q="-1"]');
    const more = screen.el.querySelector('[data-q="1"]');
    assert.ok(fewer, 'Fewer stays on a sealed lot');
    assert.ok(more, 'More stays on a sealed lot');
    more.click();
    assert.equal(screen.el.querySelector('[data-sale-line]').getAttribute('data-sale-qty'), '0');
    assert.equal(screen.el.querySelector('.sx-qty__in').value, '0');
    fewer.click();
    assert.equal(screen.el.querySelector('[data-sale-line]').getAttribute('data-sale-qty'), '0');
    assert.equal(screen.el.querySelector('.sx-qty__in').value, '0');
    assert.equal(emitted.some((entry) => entry.name === 'ui:sell'), false);
    const typed = screen.el.querySelector('.sx-qty__in');
    typed.value = String(chipsQty);
    dispatch(typed, 'input');
    assert.equal(typed.value, '0');
    assert.equal(screen.el.querySelector('[data-sale-line]').getAttribute('data-sale-qty'), '0');
    assert.equal(screen.el.querySelector('[data-sale-line]').textContent.includes('If sold'), false);
    assert.ok(screen.el.querySelector('.orr-mkt-holdarc').textContent.includes(String(state.player.cargo.usedVolume)));
    assert.equal(emitted.some((entry) => entry.name === 'ui:sell'), false);

    food.click();
    const foodGo = screen.el.querySelector('[data-go]');
    const foodNote = screen.el.querySelector('.sx-trade__note');
    assert.notEqual(foodNote.textContent, refusal);
    assert.equal(foodGo.disabled, false);
    const before = state.player.cargo.items[FOOD];
    foodGo.click();
    const sold = emitted.filter((entry) => entry.name === 'ui:sell');
    assert.equal(sold.length, 1);
    assert.equal(sold[0].payload.commodityId, FOOD);
    assert.equal(sold[0].payload.qty, before);
    assert.equal(state.player.cargo.items[CHIPS], chipsQty);
    assert.equal(state.player.cargo.items[FOOD], foodQty);
  } finally {
    dom.restore();
  }
});

test('NXI-098: a hold that is only sealed cargo is not described as empty', () => {
  const dom = installDom();
  try {
    const chipsQty = 6;
    const state = holdState(chipsQty, 0);
    const refusal = sealedRefusal(state);
    const { screen, emitted } = openSell(state);
    const chips = row(screen, CHIPS);
    assert.ok(chips, 'the only sealed lot is still a row');
    assert.ok(chips.querySelector('.sx-mkt-row__held').textContent.includes(String(chipsQty)));
    assert.equal(screen.el.textContent.includes('Your hold is empty.'), false);
    chips.click();
    assert.equal(screen.el.querySelector('[data-go]').disabled, true);
    assert.equal(screen.el.querySelector('.sx-trade__note').textContent, refusal);
    screen.el.querySelector('[data-go]').click();
    assert.equal(emitted.some((entry) => entry.name === 'ui:sell'), false);
    assert.equal(screen.el.querySelector('[data-sale-line]').getAttribute('data-sale-qty'), '0');
    assert.equal(screen.el.querySelector('[data-sale-line]').textContent.includes('If sold'), false);
    assert.ok(screen.el.querySelector('.orr-mkt-holdarc').textContent.includes(String(state.player.cargo.usedVolume)));
    screen.el.querySelector('[data-q="1"]').click();
    screen.el.querySelector('[data-q="-1"]').click();
    assert.equal(screen.el.querySelector('[data-sale-line]').getAttribute('data-sale-qty'), '0');
    assert.equal(screen.el.querySelector('.sx-qty__in').value, '0');
    assert.equal(emitted.some((entry) => entry.name === 'ui:sell'), false);
  } finally {
    dom.restore();
  }
});

test('NXI-098: a worker price refusal refreshes the next sell terms from the authority', () => {
  const dom = installDom();
  try {
    const state = holdState(0, 1);
    const quoteState = { total: 30 };
    const { screen, emitted, bus } = openSellWithEventBus(state, quoteState);
    const food = row(screen, FOOD);
    assert.ok(food, 'the sellable row is listed');
    food.click();
    assert.equal(screen.el.querySelector('[data-go]').disabled, false);

    // The facade remains at 30 while the worker reports the exact live total 29.
    bus.emit('economy:tradeFailed', {
      stationId: STATION, commodityId: FOOD, side: 'sell', qty: 1,
      reason: 'price_changed', expectedTotal: 30, liveTotal: 29,
    });
    assert.match(screen.el.querySelector('[data-trade-total]').getAttribute('aria-label'), /29/);

    screen.el.querySelector('[data-go]').click();
    const sell = emitted.find((entry) => entry.name === 'ui:sell');
    assert.equal(sell && sell.payload.expectedTotal, 29,
      'the retry binds to the worker refusal, not the stale facade total');
    screen.dispose();
  } finally {
    dom.restore();
  }
});

test('NXI-098: quantity planning probes do not clear an authoritative buy refusal', () => {
  const dom = installDom();
  try {
    const state = holdState(0, 0);
    const quoteState = { total: 30 };
    const { screen, emitted, bus } = openSellWithEventBus(state, quoteState, 'buy');
    const food = row(screen, FOOD);
    assert.ok(food, 'the buy register lists the selected lot');
    food.click();
    assert.equal(screen.el.querySelector('[data-go]').disabled, false);

    // The refusal is authoritative at 31, while the main facade still quotes 30.
    // Rendering the buy limit probes larger quantities before repainting quantity 1.
    bus.emit('economy:tradeFailed', {
      stationId: STATION, commodityId: FOOD, side: 'buy', qty: 1,
      reason: 'price_changed', expectedTotal: 30, liveTotal: 31,
    });
    assert.match(screen.el.querySelector('[data-trade-total]').getAttribute('aria-label'), /31/);

    screen.el.querySelector('[data-go]').click();
    const buy = emitted.find((entry) => entry.name === 'ui:buy');
    assert.equal(buy && buy.payload.expectedTotal, 31,
      'the retry keeps the worker refusal after quantity-limit planning probes');
    screen.dispose();
  } finally {
    dom.restore();
  }
});

test('market history backfill is lifecycle-scoped, bounded on failure, and never fabricates a flat chart', async () => {
  const state = holdState(0, 0);
  const entry = state.economy.markets[STATION][FOOD];
  const def = { basePrice: 10 };
  const requests = [];
  const scheduled = new Map();
  let nextScheduleId = 0;
  let backfill;
  let activeContext = 'world-a';
  backfill = createMarketHistoryBackfill({
    request(_op, args) {
      return new Promise((resolve, reject) => requests.push({ args, resolve, reject }));
    },
    scheduleRefresh(callback, delay) {
      const id = ++nextScheduleId;
      scheduled.set(id, { callback, delay });
      return id;
    },
    cancelRefresh(id) {
      scheduled.delete(id);
    },
    onChange() {
      // The production screen re-enters ensure from its render callback. Keeping that seam here
      // makes the retry assertion exercise the same bounded automatic retry.
      backfill.ensure(state, STATION, activeContext);
    },
  });

  backfill.reset(STATION, 'world-a');
  backfill.ensure(state, STATION, 'world-a');
  assert.equal(backfill.status, 'inflight');
  assert.equal(backfill.chartState(STATION, FOOD, entry), 'loading');
  assert.deepEqual(marketPriceHistorySeries(backfill.pointsFor(STATION, FOOD, entry), entry, def, 100), [],
    'pending history stays empty instead of becoming [current,current]');
  requests[0].resolve({ ok: true, result: { histories: { [FOOD]: [{ t: 40, mid: 12 }, { t: 100, mid: 18 }] } } });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(marketPriceHistorySeries(backfill.pointsFor(STATION, FOOD, entry), entry, def, 100).map((p) => p.mid), [12, 18]);
  assert.equal(requests.length, 1, 'a confirmed response does not trigger an early duplicate request');
  assert.equal(scheduled.size, 1, 'one visible refresh is armed after the confirmed response');
  const firstRefresh = scheduled.entries().next().value;
  scheduled.delete(firstRefresh[0]);
  assert.equal(firstRefresh[1].delay, 15_000, 'refresh follows the economy history sample cadence');
  firstRefresh[1].callback();
  assert.equal(requests.length, 2, 'the scheduled cadence starts one coalesced refresh');
  assert.equal(backfill.status, 'inflight');
  assert.equal(backfill.chartState(STATION, FOOD, entry), 'confirmed',
    'the last confirmed series remains visible while a refresh is pending');
  assert.deepEqual(marketPriceHistorySeries(backfill.pointsFor(STATION, FOOD, entry), entry, def, 100).map((p) => p.mid), [12, 18]);
  backfill.ensure(state, STATION, activeContext);
  assert.equal(requests.length, 2, 'renders during a pending refresh do not queue another RPC');
  requests[1].resolve({ ok: true, result: { histories: { [FOOD]: [{ t: 40, mid: 22 }, { t: 100, mid: 28 }] } } });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(marketPriceHistorySeries(backfill.pointsFor(STATION, FOOD, entry), entry, def, 100).map((p) => p.mid), [22, 28],
    'a changed station history replaces the prior series after the refresh ACK');
  const secondRefresh = scheduled.entries().next().value;
  scheduled.delete(secondRefresh[0]);
  secondRefresh[1].callback();
  assert.equal(requests.length, 3, 'the next cadence starts one more refresh after the changed ACK');
  assert.deepEqual(marketPriceHistorySeries(backfill.pointsFor(STATION, FOOD, entry), entry, def, 100).map((p) => p.mid), [22, 28]);

  // Reopening the same station is a new generation and must fetch again.
  activeContext = 'world-a';
  backfill.reset(STATION, 'world-a');
  assert.equal(scheduled.size, 0, 'reopening cancels the prior visible refresh timer');
  backfill.ensure(state, STATION, 'world-a');
  assert.equal(requests.length, 4);
  assert.equal(backfill.chartState(STATION, FOOD, entry), 'loading');

  // A Continue/new-world reset invalidates both the in-flight refresh and the reopened station
  // request. Their late ACKs cannot populate the new station cache, even though the station id
  // is unchanged.
  activeContext = 'world-b';
  await Promise.resolve();
  backfill.reset(STATION, 'world-b');
  backfill.ensure(state, STATION, 'world-b');
  assert.equal(requests.length, 5);
  requests[2].resolve({ ok: true, result: { histories: { [FOOD]: [{ t: 40, mid: 91 }, { t: 100, mid: 99 }] } } });
  await Promise.resolve();
  assert.equal(backfill.chartState(STATION, FOOD, entry), 'loading');
  assert.deepEqual(backfill.pointsFor(STATION, FOOD, entry), undefined,
    'late ACK from the replaced refresh does not mutate the new cache');
  requests[3].resolve({ ok: true, result: { histories: { [FOOD]: [{ t: 40, mid: 81 }, { t: 100, mid: 89 }] } } });
  await Promise.resolve();
  assert.equal(backfill.chartState(STATION, FOOD, entry), 'loading');
  assert.deepEqual(backfill.pointsFor(STATION, FOOD, entry), undefined,
    'late ACK from the reopened generation does not mutate the new cache');
  requests[4].resolve({ ok: true, result: { histories: { [FOOD]: [{ t: 40, mid: 31 }, { t: 100, mid: 36 }] } } });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(backfill.pointsFor(STATION, FOOD, entry).map((p) => p.mid), [31, 36]);

  // Retry one transient failure, then stop after the bounded second attempt.
  activeContext = 'world-c';
  backfill.reset(STATION, 'world-c');
  backfill.ensure(state, STATION, 'world-c');
  assert.equal(requests.length, 6);
  requests[5].reject(new Error('worker unavailable'));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(requests.length, 7, 'one retry is issued after the first failure');
  requests[6].reject(new Error('worker still unavailable'));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(requests.length, 7, 'retry budget is bounded');
  assert.equal(backfill.status, 'failed');

  // The real screen exposes the pending state in the existing chart slot, then replaces it with
  // the authoritative values when the worker response arrives.
  const dom = installDom();
  const laneRequests = [];
  installSimCommandSink((_descriptor) => new Promise((resolve, reject) => laneRequests.push({ resolve, reject })));
  try {
    const screenState = holdState(0, 0);
    const { screen } = openSellWithEventBus(screenState, { total: 30 }, 'buy');
    assert.equal(laneRequests.length, 1);
    const loading = screen.el.querySelector('[data-market-history="loading"]');
    assert.ok(loading, 'pending chart has a loading marker');
    assert.equal(loading.textContent, 'Loading price history…');
    laneRequests[0].resolve({ ok: true, result: { histories: {
      [CHIPS]: [{ t: 1, mid: 44 }, { t: 2, mid: 49 }],
      [FOOD]: [{ t: 1, mid: 12 }, { t: 2, mid: 18 }],
    } } });
    await Promise.resolve();
    await Promise.resolve();
    const chart = screen.el.querySelector('.sx-mkt-chart');
    assert.equal(chart.getAttribute('data-history-mids'), '44,49',
      'the selected instrument paints returned samples rather than a flat quote');
    screen.onShow({ state: screenState });
    assert.equal(laneRequests.length, 2, 'same-station onShow starts a fresh history request');
    assert.ok(screen.el.querySelector('[data-market-history="loading"]'),
      'same-station reopen does not reuse the prior generation while pending');
    screen.dispose();
  } finally {
    uninstallSimCommandSink();
    dom.restore();
  }
});


test('Market holds the exact worker order until its own terminal response', async () => {
  const dom = installDom();
  let screen;
  const calls = [];
  try {
    const state = holdState(0, 1);
    installSimCommandSink(request => {
      if (request.kind === 'rpc' && request.op === 'economyTrade') {
        calls.push(request);
        return new Promise(() => {});
      }
      return Promise.resolve({ok: true, result: {histories: {}}});
    });
    const opened = openSellWithEventBus(state, { total: 30 });
    screen = opened.screen;
    row(screen, FOOD).click();
    screen.el.querySelector('[data-go]').click();
    assert.equal(calls.length, 1);
    const id = calls[0].args.intentId;
    assert.ok(id);
    assert.equal(state.ui.marketTradeExpectation.intentId, id);
    await new Promise(resolve => setTimeout(resolve, 110));
    assert.equal(screen.el.querySelector('[data-go]').disabled, true);
    opened.bus.emit('economy:tradeFailed', {intentId:'market:older', stationId:STATION,
      commodityId:FOOD, side:'sell', qty:1, reason:'price_changed', liveTotal:25, expectedTotal:30});
    assert.equal(state.ui.marketTradeExpectation.intentId, id);
    assert.equal(screen.el.querySelector('[data-go]').disabled, true);
    opened.bus.emit('economy:tradeFailed', {intentId:id, stationId:STATION,
      commodityId:FOOD, side:'sell', qty:1, reason:'price_changed', liveTotal:29, expectedTotal:30});
    assert.equal(state.ui.marketTradeExpectation, null);
    assert.match(screen.el.querySelector('[data-trade-total]').getAttribute('aria-label'), /29/);
    assert.equal(state.player.credits, 5000, 'the UI never mutates the wallet');
    assert.equal(state.player.cargo.items[FOOD], 1, 'a refusal moves no cargo');
  } finally {
    screen?.dispose();
    uninstallSimCommandSink();
    dom.restore();
  }
});


test('unknown Market outcome retries the same worker intent without a second UI trade', async () => {
  const dom = installDom();
  let screen;
  const calls = [];
  try {
    const state = holdState(0, 1);
    installSimCommandSink(request => {
      if (request.kind !== 'rpc' || request.op !== 'economyTrade') return Promise.resolve({ok:true, result:{histories:{}}});
      calls.push(request);
      if (calls.length === 1) return Promise.reject(new Error('reply lost'));
      return Promise.resolve({ok:true, result:{ok:true, result:{ok:true, duplicate:true, qty:1, total:30}}});
    });
    const opened = openSellWithEventBus(state, {total:30});
    screen = opened.screen;
    row(screen, FOOD).click();
    screen.el.querySelector('[data-go]').click();
    await Promise.resolve(); await Promise.resolve();
    assert.match(screen.el.querySelector('.sx-trade__note').textContent, /result is unknown/i);
    const retry = screen.el.querySelector('[data-go]');
    assert.equal(retry.disabled, false);
    retry.click();
    await Promise.resolve(); await Promise.resolve();
    assert.equal(calls.length, 2);
    assert.equal(calls[0].args.intentId, calls[1].args.intentId);
    assert.deepEqual(calls[0].args, calls[1].args);
    const receipt = opened.emitted.find(e => e.name === 'station:marketTradeReceiptRecovered');
    assert.equal(receipt?.payload.intentId, calls[0].args.intentId);
    assert.equal(receipt?.payload.qty, 1);
    assert.equal(state.player.credits, 5000);
    assert.equal(state.player.cargo.items[FOOD], 1);
  } finally {
    screen?.dispose(); uninstallSimCommandSink(); dom.restore();
  }
});
