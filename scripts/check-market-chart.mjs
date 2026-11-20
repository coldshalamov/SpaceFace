#!/usr/bin/env node
// T8h backend gate: Market Chart.
//
// Proves the shipped market-chart path has real data behind it:
// - economy-owned market history feeds the shipped station chart
// - forecasts come from the live hidden cycle state
// - the Market screen wires history, forecast, regime, trend, event log, canvas, and tooltip
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMMODITIES } from '../src/data/commodities.js';
import { settleCredits } from '../src/economy/economyMath.js';
import { economy, getCycle as liveCycleFor } from '../src/systems/economy.js';
import { predictPriceCurve, regimeLabel } from '../src/systems/economyCycles.js';
import { marketHistoryFor, marketRegimeStateFor, regimeFactorAt } from '../src/economy/marketModel.js';
import {
  createMarketHistoryBackfill,
  marketPriceHistory,
  marketPriceHistorySeries,
  maxAffordableQuantity,
} from '../src/ui/station/screens/market.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MARKET_SOURCE = readFileSync(join(ROOT, 'src/ui/market/tradeLogic.js'), 'utf8');
const STATION_MARKET_SOURCE = readFileSync(join(ROOT, 'src/ui/station/screens/market.js'), 'utf8');
const MARKET_PRESENTATION_SOURCE = readFileSync(join(ROOT, 'src/ui/views/marketPresentation.js'), 'utf8');
const STATION_APP_SOURCE = readFileSync(join(ROOT, 'src/ui/station/stationApp.js'), 'utf8');

assert.equal(typeof window, 'undefined', 'this check must run headless');

guarded(testRealEconomyHistoryAndForecast);
guarded(testSeededStationMarketHistory);
guarded(testBulkQuoteMatchesExecutedTrade);
testMarketScreenChartSourceContract();
await testMarketHistoryAuthorityContract();
testStationMarketSourceContract();

console.log('PASS  check:market-chart');

function testRealEconomyHistoryAndForecast() {
  const { state, bus, econ, stationId, commodityId } = bootEconomyChartFixture();
  const def = COMMODITIES.find((c) => c.id === commodityId);
  assert.ok(def, 'fixture commodity must exist in COMMODITIES');

  const cycle = liveCycleFor(stationId, commodityId);
  assert.ok(cycle && cycle.regime, 'live economy wrapper exposes the listing regime (compat)');
  const regimeState = marketRegimeStateFor(state, stationId, commodityId, state.simTime);
  assert.ok(regimeState && regimeState.kind, 'closed form resolves a live regime for the listing');
  assert.notEqual(regimeLabel(regimeState.kind), 'Cyclic pricing', 'chart regime label resolves a shipped regime');

  const firstForecast = predictPriceCurve(state, stationId, commodityId, 24, 5);
  const secondForecast = predictPriceCurve(state, stationId, commodityId, 24, 5);
  assert.deepEqual(secondForecast, firstForecast, 'forecast curve is deterministic for unchanged state');
  assert.equal(firstForecast.length, 24, 'chart forecast has the shipped 24 future points');
  assert.deepEqual(firstForecast.slice(0, 3).map((p) => p.t), [5, 10, 15],
    'forecast timestamps start at now+5s and step by 5s');
  assert.ok(firstForecast.every((p) => Number.isFinite(p.mid) && p.mid > 0),
    'forecast mids are finite positive prices');

  // The event log is sourced from current economy events; the chart's actual price series is the
  // closed-form listing history and must move with live stock pressure (dents).
  state.economy.econEvents.push({
    id: 'chart_event_1',
    type: 'shortage',
    stationId,
    goods: [commodityId],
    tStart: 40,
    tEnd: 40 + 240,
    levelMult: 1.4,
    spreadMult: 1.3,
  });
  for (let i = 0; i < 12; i++) {
    if (i === 3) bus.emit('economy:applyTradePressure', { stationId, commodityId, vol: -500 });
    state.simTime += 5;
    econ.econTick(5, state);
  }

  const entry = state.economy.markets[stationId][commodityId];
  const history = marketHistoryFor(state, stationId, commodityId);
  assert.ok(history.length >= 60, `economy-owned history retains its bounded past; got ${history.length}`);
  assert.ok(new Set(history.map((p) => p.mid)).size > 1,
    'price history changes after real stock pressure and drift');
  assert.ok(entry.lastBuy > entry.lastSell && entry.lastSell > 0,
    'the current listing quote keeps a positive bid-ask spread separate from compact history');
  for (let i = 0; i < history.length; i++) {
    const p = history[i];
    assert.ok(Number.isFinite(p.t), `history[${i}] has a finite timestamp`);
    assert.ok(Number.isFinite(p.mid) && p.mid > 0, `history[${i}] has a finite mid`);
  }

  const chartSeries = marketPriceHistorySeries(history, entry, def, state.simTime);
  const trend = marketPriceHistory(history, entry, def, state.simTime);
  assert.ok(chartSeries.length > 0 && chartSeries.length <= history.length,
    'the visible chart selects a bounded window of recorded economy samples');
  assert.deepEqual(trend, chartSeries.map((point) => point.mid),
    'the row trend and expanded chart read the same authoritative samples');

  const afterForecast = predictPriceCurve(state, stationId, commodityId, 24, 5);
  assert.equal(afterForecast.length, 24, 'forecast still renders after live economy movement');
  assert.notDeepEqual(afterForecast, firstForecast,
    'forecast reacts to changed market/cycle time instead of being static copy');

  economy._instance = null;
}

function testMarketScreenChartSourceContract() {
  // Visible chart checks belong to the shipped Station Market. The register, quote and chart markup
  // moved to the market presentation read model (market.js renders marketQuoteHtml); trade-route
  // helpers live in market/tradeLogic and intentionally contain no DOM/chart implementation.
  const checks = [
    [/export function createMarketScreen\(ctx\)/, 'exports the shipped Station Market screen', STATION_MARKET_SOURCE],
    [/createMarketHistoryBackfill\(/, 'owns a station-scoped history cache', STATION_MARKET_SOURCE],
    [/return entry && entry\.history;/, 'keeps the authoritative listing history fallback', STATION_MARKET_SOURCE],
    [/marketQuoteHtml\(\{ id: r\.id/, 'renders the selected commodity through the market read model', STATION_MARKET_SOURCE],
    // Frontend Task C §1.3: the chart is a dense-register sparkline — the history as a hairline with
    // the last point marked; no gradient fill, no brush chrome.
    [/export function buildChart\(history, average, gradientId, label/, 'builds the selected commodity chart', MARKET_PRESENTATION_SOURCE],
    [/class="sx-mkt-chart"/, 'renders the selected commodity sparkline', MARKET_PRESENTATION_SOURCE],
    [/data-history-line/, 'plots the live history as the chart line', MARKET_PRESENTATION_SOURCE],
    [/sx-mkt-instrument__dot" style="left:\$\{px\(end\.x\)\}/, 'marks the latest sample', MARKET_PRESENTATION_SOURCE],
    // Selection follows focus over the register rows (Arrow / Home / End / PageUp / PageDown).
    [/selectCommodity\(rows\[next\]\.getAttribute\('data-cmdty'\), \{ focus: true \}\)/, 'keeps the commodity register keyboard-selectable', STATION_MARKET_SOURCE],
    [/const go = ev\.target\.closest\('\[data-go\]'\);/, 'keeps the visible buy/sell control wired', STATION_MARKET_SOURCE],
  ];
  for (const [pattern, label, source] of checks) {
    if (!pattern.test(source)) {
      throw new Error(`station market chart source contract failed: ${label}`);
    }
  }
}

async function testMarketHistoryAuthorityContract() {
  const pending = [];
  const requests = [];
  const backfill = createMarketHistoryBackfill({
    request(operation, args) {
      requests.push({ operation, args });
      return new Promise((resolve) => pending.push(resolve));
    },
    refreshMs: 0,
  });
  const inline = [{ t: 0, mid: 11 }, { t: 5, mid: 12 }];
  const authoritative = [{ t: 0, mid: 9 }, { t: 5, mid: 14 }, { mid: 20 }];
  const entry = { history: inline, lastMid: 12 };
  const snapshot = { economy: { markets: { station_helios: { cmdty_food: entry } } } };

  backfill.ensure(snapshot, 'station_helios', 'chart-contract');
  assert.deepEqual(requests, [{ operation: 'marketHistory', args: { stationId: 'station_helios' } }],
    'the visible station requests authoritative history through the lane RPC');
  assert.deepEqual(backfill.pointsFor('station_helios', 'cmdty_food', entry), inline,
    'the cache uses the live listing history while the authority request is pending');
  assert.equal(backfill.status, 'inflight');

  pending.shift()({ result: { histories: { cmdty_food: authoritative } } });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(backfill.status, 'done');
  assert.deepEqual(backfill.pointsFor('station_helios', 'cmdty_food', entry), authoritative,
    'a successful RPC replaces the inline fallback with the authoritative ring');
  assert.deepEqual(marketPriceHistory(authoritative, entry, {}, 5), [9, 14, 20],
    'the row trend uses finite authoritative samples');
  assert.deepEqual(marketPriceHistorySeries(authoritative, entry, {}, 5), authoritative,
    'the expanded chart keeps recorded sample objects and does not fabricate points');

  backfill.reset();
  backfill.ensure(snapshot, 'station_helios', 'chart-contract');
  pending.shift()({ histories: { cmdty_food: [] } });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(backfill.pointsFor('station_helios', 'cmdty_food', entry), [],
    'an explicit empty authority response cannot resurrect stale inline history');
  assert.equal(backfill.chartState('station_helios', 'cmdty_food', entry), 'unavailable',
    'empty authoritative history remains visibly unavailable');
}

function testBulkQuoteMatchesExecutedTrade() {
  const { state, econ, stationId, commodityId } = bootEconomyChartFixture();
  // The chart fixture predates the cargo-volume authority. Execution uses the current live shape.
  state.player.cargo.capVolume = 100;
  state.player.cargo.usedVolume = 0;
  const qty = 5;
  const buyQuote = econ.quote(stationId, commodityId, 'buy', qty);
  assert.equal(buyQuote.ok, true, 'fixture supplies a live buy quote');
  const capacity = Math.floor(state.economy.markets[stationId][commodityId].stock - 1);
  const quote = (n) => econ.quote(stationId, commodityId, 'buy', n);
  assert.equal(maxAffordableQuantity({ limit: capacity, credits: buyQuote.total, quote }), qty,
    'Max uses the quantity integral and reaches exactly the affordable purchase');
  assert.ok(maxAffordableQuantity({ limit: capacity, credits: buyQuote.total - 1, quote }) < qty,
    'Max steps down when one credit short instead of leaving Confirm disabled');
  assert.equal(maxAffordableQuantity({ limit: 2, credits: 1000000, quote }), 2,
    'Max cannot exceed physical stock or hold capacity');
  // Settlement rounds against the trader (buy ceil / sell floor) so split lots cannot shave
  // the consideration; the quote's displayed total is that settled figure, not a symmetric round.
  assert.equal(buyQuote.total, settleCredits(buyQuote.unitAvg * qty, 'buy'),
    'quantity quote owns the conservatively settled transaction total');
  const beforeBuy = state.player.credits;
  const bought = econ.execute(stationId, commodityId, 'buy', qty);
  assert.equal(bought.ok, true, 'quoted purchase executes');
  assert.equal(bought.qty, qty, 'quoted purchase does not clip a physically available quantity');
  assert.equal(bought.total, buyQuote.total, 'buy receipt total is the selected quantity quote');
  assert.equal(beforeBuy - state.player.credits, buyQuote.total, 'buy debit equals the shown authority quote');

  const sellQuote = econ.quote(stationId, commodityId, 'sell', qty);
  assert.equal(sellQuote.ok, true, 'fixture supplies a live sell quote');
  const beforeSell = state.player.credits;
  const sold = econ.execute(stationId, commodityId, 'sell', qty);
  assert.equal(sold.ok, true, 'quoted sale executes');
  assert.equal(sold.qty, qty, 'quoted sale does not clip held quantity');
  assert.equal(sold.total, sellQuote.total, 'sell receipt total is the selected quantity quote');
  assert.equal(state.player.credits - beforeSell, sellQuote.total, 'sell credit equals the shown authority quote');

  economy._instance = null;
}
function testSeededStationMarketHistory() {
  const { state, bus, econ, stationId } = bootEconomyChartFixture();
  const market = state.economy.markets[stationId];
  const ids = Object.keys(market);
  assert.ok(ids.length >= 3, 'fixture should expose multiple tradable commodities');

  const signatures = ids.map((id) => {
    const entry = market[id];
    const history = marketHistoryFor(state, stationId, id);
    assert.equal(history.length, 64, `new ${id} listing has a full closed-form history`);
    assert.equal(history.at(-1).mid, Math.max(1, Math.round(entry.lastMid)),
      `${id} history ends at the currently quoted market mid`);
    assert.ok(history.every((p) => Number.isFinite(p.t) && p.mid > 0),
      `${id} history contains finite positive quotes`);
    return history.map((p) => p.mid).join(',');
  });
  assert.ok(new Set(signatures).size > 1,
    'new-game commodities start with distinct formula-derived histories, not one decorative graph');
  // A 'steady' listing may honestly sit on one integer mid for the 16-min
  // window — that is the regime, not a dead chart. Most of the book must still
  // show the formula moving.
  const moving = ids.filter((id, i) => new Set(signatures[i].split(',')).size > 1);
  assert.ok(moving.length >= Math.ceil(ids.length / 2),
    `most listings show visible price movement; got ${moving.length}/${ids.length}`);

  // The save carries the market anchors (rest level, live dents, demand) — the
  // timeline itself is the closed form and reproduces identically after load.
  bus.emit('economy:applyTradePressure', { stationId, commodityId: ids[0], vol: -300 });
  const preSave = marketHistoryFor(state, stationId, ids[0]);
  state.player.marketMemory[stationId] = {};
  const saved = econ.serialize();
  assert.equal(saved.marketRows, 2, 'save declares the anchor-row market format');
  const savedRow = saved.markets[stationId].find((row) => row[0] === ids[0]);
  assert.ok(savedRow && savedRow.length === 6,
    'a market row saves [cid, eq, baseEq, role, dents, demandMult]');
  assert.ok(Array.isArray(savedRow[4]) && savedRow[4].length >= 2,
    'a live dent travels in the save row');

  const restoredState = {
    mode: 'flight', simTime: state.simTime, meta: { seed: state.meta.seed },
    player: { credits: 10000, cargo: { items: {}, capacity: 100, used: 0 } },
    economy: {}, world: { currentSectorId: 'sector_helios_prime' }, ui: {}, nav: {},
  };
  const restored = { ...economy };
  restored.init({ state: restoredState, bus: makeBus(), helpers: {}, registry: { get: () => null } });
  restored.deserialize(structuredClone(saved));
  const restoredEntry = restoredState.economy.markets[stationId][ids[0]];
  assert.ok(restoredEntry && restoredEntry.dents.length > 0,
    'loading a save restores the live dent');
  assert.deepEqual(marketHistoryFor(restoredState, stationId, ids[0]), preSave,
    'loading a save reproduces the exact market timeline from the anchors');

  const currentCycle = liveCycleFor(stationId, ids[0]);
  assert.ok(currentCycle && currentCycle.regime, 'compat getCycle resolves a regime word');
  const factor = regimeFactorAt(state.meta.seed, stationId, ids[0], state.simTime);
  assert.ok(Number.isFinite(factor) && factor >= 0.55 && factor <= 1.9,
    'the regime factor stays inside its shipped band so mids can never go non-positive');

  economy._instance = null;
}

function testStationMarketSourceContract() {
  assert.doesNotMatch(STATION_MARKET_SOURCE, /synthesize a gentle series/i,
    'the shipped Station Market must not fabricate one shared fallback chart');
  assert.match(STATION_MARKET_SOURCE, /return entry && entry\.history;/,
    'the shipped Station Market keeps the economy-owned listing history fallback');
  assert.match(MARKET_PRESENTATION_SOURCE, /data-chart="\$\{escapeHtml\(gradientId\)\}"/,
    'each Station Market sparkline is keyed to its commodity');
  assert.match(STATION_MARKET_SOURCE, /cargoOnly = mode === 'sell'/,
    'the cargo handoff can filter the market to sellable hold contents');
  assert.match(STATION_APP_SOURCE, /data-handoff-mode/,
    'the Station shell carries the handoff sell intent into the Market');
  assert.match(STATION_APP_SOURCE, /screen\.onShow\(\{ \.\.\.ctx, \.\.\.options \}\)/,
    'the Station shell forwards handoff options to an already-open Market');
}

function bootEconomyChartFixture() {
  const bus = makeBus();
  const state = {
    mode: 'flight',
    simTime: 0,
    meta: { seed: 0x5face },
    player: {
      credits: 10000,
      cargo: { items: {}, capacity: 100, used: 0 },
    },
    economy: {},
    world: { currentSectorId: 'sector_helios_prime' },
    ui: {},
    nav: {},
  };
  const econ = { ...economy };
  econ.init({ state, bus, helpers: {}, registry: { get: () => null } });
  econ.newGame();
  const stationId = 'station_helios';
  const commodityId = 'cmdty_food';
  assert.ok(state.economy.markets[stationId], 'home-sector market warmed on new game');
  assert.ok(state.economy.markets[stationId][commodityId], 'fixture commodity exists in the home market');
  return { state, bus, econ, stationId, commodityId };
}

function makeBus() {
  const handlers = new Map();
  return {
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off(evt, fn) {
      const list = handlers.get(evt) || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    emit(evt, payload) {
      for (const fn of (handlers.get(evt) || []).slice()) fn(payload);
    },
  };
}

function guarded(fn) {
  const oldRandom = Math.random;
  const oldNow = Date.now;
  Math.random = () => { throw new Error('Math.random in market-chart backend path'); };
  Date.now = () => { throw new Error('Date.now in market-chart backend path'); };
  try {
    return fn();
  } finally {
    Math.random = oldRandom;
    Date.now = oldNow;
  }
}
