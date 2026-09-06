#!/usr/bin/env node
// T8h backend gate: Market Chart.
//
// Proves the shipped market-chart path has real data behind it:
// - economy ticks record per-station/per-commodity price history
// - forecasts come from the live hidden cycle state
// - the Market screen wires history, forecast, regime, trend, event log, canvas, and tooltip
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMMODITIES } from '../src/data/commodities.js';
import { economy, getCycle as liveCycleFor } from '../src/systems/economy.js';
import { cycleFactorAt, maybeAdvanceRegime, predictPriceCurve, rawCycleFactorAt, regimeLabel } from '../src/systems/economyCycles.js';
import { initPriceHistory, getPriceHistory, loadHistory } from '../src/ui/priceHistory.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MARKET_SOURCE = readFileSync(join(ROOT, 'src/ui/market/tradeLogic.js'), 'utf8');
const STATION_MARKET_SOURCE = readFileSync(join(ROOT, 'src/ui/station/screens/market.js'), 'utf8');
const STATION_APP_SOURCE = readFileSync(join(ROOT, 'src/ui/station/stationApp.js'), 'utf8');

assert.equal(typeof window, 'undefined', 'this check must run headless');

guarded(testRealEconomyHistoryAndForecast);
guarded(testSeededStationMarketHistory);
guarded(testRingBufferSeededOnFreshGame);
testMarketScreenChartSourceContract();
testStationMarketSourceContract();

console.log('PASS  check:market-chart');

function testRealEconomyHistoryAndForecast() {
  const { state, bus, econ, stationId, commodityId } = bootEconomyChartFixture();
  const def = COMMODITIES.find((c) => c.id === commodityId);
  assert.ok(def, 'fixture commodity must exist in COMMODITIES');

  const cycle = liveCycleFor(stationId, commodityId);
  assert.ok(cycle, 'live economy wrapper exposes the station commodity cycle');
  assert.ok(Number.isFinite(cycleFactorAt(cycle, state.simTime)), 'cycle factor is finite at now');
  assert.notEqual(regimeLabel(cycle.regime), 'Cyclic pricing', 'chart regime label resolves a shipped regime');

  const firstForecast = predictPriceCurve(state, stationId, commodityId, 24, 5);
  const secondForecast = predictPriceCurve(state, stationId, commodityId, 24, 5);
  assert.deepEqual(secondForecast, firstForecast, 'forecast curve is deterministic for unchanged state');
  assert.equal(firstForecast.length, 24, 'chart forecast has the shipped 24 future points');
  assert.deepEqual(firstForecast.slice(0, 3).map((p) => p.t), [5, 10, 15],
    'forecast timestamps start at now+5s and step by 5s');
  assert.ok(firstForecast.every((p) => Number.isFinite(p.mid) && p.mid > 0),
    'forecast mids are finite positive prices');

  // Seed one live event and one stock-pressure bump; priceHistory should capture both the event
  // marker and a changing mid-price, not a static decorative sparkline.
  state.economy.econEvents.push({
    id: 'chart_event_1',
    type: 'shortage',
    stationId,
    commodityId,
    durationRemainingS: 45,
  });
  for (let i = 0; i < 12; i++) {
    if (i === 3) bus.emit('economy:applyTradePressure', { stationId, commodityId, vol: -500 });
    state.simTime += 5;
    econ.econTick(5, state);
  }

  const history = getPriceHistory(stationId, commodityId);
  assert.ok(history.length >= 12, `price history records economy ticks; got ${history.length}`);
  assert.ok(history.some((p) => (p.events || []).includes('chart_event_1')),
    'price history captures active economic event ids for the chart event log');
  assert.ok(new Set(history.map((p) => p.mid)).size > 1,
    'price history changes after real stock pressure and drift');
  for (let i = 0; i < history.length; i++) {
    const p = history[i];
    assert.ok(Number.isFinite(p.t) && p.t >= 0, `history[${i}] has a finite timestamp`);
    assert.ok(Number.isFinite(p.mid) && p.mid > 0, `history[${i}] has a finite mid`);
    assert.ok(Number.isFinite(p.buy) && p.buy > p.sell, `history[${i}] has buy above sell`);
    assert.ok(Number.isFinite(p.sell) && p.sell > 0, `history[${i}] has a positive sell`);
  }

  const aged = getPriceHistory(stationId, commodityId, 15);
  assert.ok(aged.length > 0 && aged.length < history.length,
    'age-filtered history returns the recent chart window, not the full buffer');

  const afterForecast = predictPriceCurve(state, stationId, commodityId, 24, 5);
  assert.equal(afterForecast.length, 24, 'forecast still renders after live economy movement');
  assert.notDeepEqual(afterForecast, firstForecast,
    'forecast reacts to changed market/cycle time instead of being static copy');

  economy._instance = null;
}

function testMarketScreenChartSourceContract() {
  // Visible chart checks belong to the shipped Station Market. Trade-route helpers live in
  // market/tradeLogic and intentionally contain no DOM/chart implementation.
  const checks = [
    [/export function createMarketScreen\(ctx\)/, 'exports the shipped Station Market screen'],
    [/entry && Array\.isArray\(entry\.history\)/, 'reads economy-owned listing history'],
    [/function buildChart\(hist, avg, gradientId, label\)/, 'builds the selected commodity chart'],
    [/linearGradient id="\$\{gradientId\}"/, 'gives each chart a distinct gradient id'],
    [/class="sx-mkt-brush"/, 'renders the visible compare-interval brush'],
    [/createVirtualList\(\{[\s\S]*selectionFollowsFocus: true/, 'keeps the commodity rail keyboard-selectable'],
    [/const go = ev\.target\.closest\('\[data-go\]'\);/, 'keeps the visible buy/sell control wired'],
  ];
  for (const [pattern, label] of checks) {
    if (!pattern.test(STATION_MARKET_SOURCE)) {
      throw new Error(`station market chart source contract failed: ${label}`);
    }
  }
}
function testSeededStationMarketHistory() {
  const { state, bus, econ, stationId } = bootEconomyChartFixture();
  const market = state.economy.markets[stationId];
  const ids = Object.keys(market);
  assert.ok(ids.length >= 3, 'fixture should expose multiple tradable commodities');

  const signatures = ids.map((id) => {
    const entry = market[id];
    assert.equal(entry.history.length, 64, `new ${id} listing has a full seeded history`);
    assert.equal(entry.history.at(-1).mid, entry.lastMid,
      `${id} history ends at the currently quoted market mid`);
    assert.ok(entry.history.every((p) => Number.isFinite(p.t) && p.mid > 0),
      `${id} history contains finite positive quotes`);
    const signature = entry.history.map((p) => p.mid).join(',');
    assert.ok(new Set(entry.history.map((p) => p.mid)).size > 1,
      `${id} opening history has visible integer-price movement`);
    return signature;
  });
  assert.ok(new Set(signatures).size > 1,
    'new-game commodities start with distinct formula-derived histories, not one decorative graph');

  // Only a market the pilot has actually inspected carries its exact lived trace into the save.
  // The serialized representation is packed [t, mid, ...] to keep autosaves compact; deserialize
  // restores the normal object-per-point runtime shape.
  state.player.marketMemory[stationId] = {};
  const saved = econ.serialize();
  const savedRow = saved.markets[stationId].find((row) => row[0] === ids[0]);
  const packedHistory = savedRow && savedRow[6];
  assert.ok(Array.isArray(packedHistory) && packedHistory.length === market[ids[0]].history.length * 2,
    'an inspected market saves its exact timeline in the packed history representation');

  const restoredState = {
    mode: 'flight', simTime: state.simTime, meta: { seed: state.meta.seed },
    player: { credits: 10000, cargo: { items: {}, capacity: 100, used: 0 } },
    economy: {}, world: { currentSectorId: 'sector_helios_prime' }, ui: {}, nav: {},
  };
  const restored = { ...economy };
  restored.init({ state: restoredState, bus: makeBus(), helpers: {}, registry: { get: () => null } });
  restored.deserialize(structuredClone(saved));
  assert.deepEqual(restoredState.economy.markets[stationId][ids[0]].history, market[ids[0]].history,
    'loading a save keeps the existing market timeline instead of bootstrapping a generic one');

  const currentCycle = liveCycleFor(stationId, ids[0]);
  const invalid = {
    ...currentCycle,
    family: 'falling', regime: 'falling', amplitude: 0, bias: 0, slope: -2,
    regimeStartT: state.simTime - 1, regimeEndT: state.simTime + 600,
  };
  assert.ok(rawCycleFactorAt(invalid, state.simTime) <= 0,
    'fixture forces a formula that would make a price non-positive');
  assert.notEqual(maybeAdvanceRegime(invalid, () => 0.5, state.simTime), invalid,
    'a non-positive formula re-rolls immediately instead of relying on a display clamp');

  economy._instance = null;
}

function testRingBufferSeededOnFreshGame() {
  // Regression: a freshly started game used to leave the UI price-history ring buffer empty until
  // enough live economy ticks accrued, so every chart fed by getPriceHistory drew a flat line right
  // after starting. The real boot emits game:new on the bus once the world is warm; the recorder
  // must backfill the buffer from the economy's seeded entry.history so the first dock has a past.
  const { state, bus, stationId, commodityId } = bootEconomyChartFixture();
  bus.emit('game:new');
  const ring = getPriceHistory(stationId, commodityId);
  assert.equal(ring.length, 64,
    'ring buffer is seeded from entry.history on game:new, before any economy tick');
  assert.ok(new Set(ring.map((p) => p.mid)).size > 1,
    'seeded ring buffer shows visible price movement, not a flat line');
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    assert.ok(Number.isFinite(p.t) && p.t >= 0, `seeded[${i}] keeps the t>=0 ring-buffer invariant`);
    assert.ok(Number.isFinite(p.buy) && p.buy > p.sell, `seeded[${i}] keeps buy above sell`);
    assert.ok(Number.isFinite(p.sell) && p.sell > 0, `seeded[${i}] keeps a positive sell`);
  }

  // marketOpened is the immediate-open path (screen shown before the first 5s tick): it must also
  // seed a buffer that was empty after a reset.
  loadHistory({});
  bus.emit('economy:marketOpened', { stationId });
  const reopened = getPriceHistory(stationId, commodityId);
  assert.equal(reopened.length, 64, 'opening the market seeds an empty buffer before the first tick');

  economy._instance = null;
}

function testStationMarketSourceContract() {
  assert.doesNotMatch(STATION_MARKET_SOURCE, /synthesize a gentle series/i,
    'the shipped Station Market must not fabricate one shared fallback chart');
  assert.match(STATION_MARKET_SOURCE, /entry && Array\.isArray\(entry\.history\)/,
    'the shipped Station Market reads the economy-owned price history');
  assert.match(STATION_MARKET_SOURCE, /linearGradient id="\$\{gradientId\}"/,
    'each Station Market chart owns a distinct SVG gradient id');
  assert.match(STATION_MARKET_SOURCE, /cargoOnly = mode === 'sell'/,
    'the cargo handoff can filter the market to sellable hold contents');
  assert.match(STATION_APP_SOURCE, /data-handoff-mode/,
    'the Station shell carries the handoff sell intent into the Market');
  assert.match(STATION_APP_SOURCE, /screen\.onShow\(\{ \.\.\.ctx, \.\.\.options \}\)/,
    'the Station shell forwards handoff options to an already-open Market');
}

function bootEconomyChartFixture() {
  loadHistory({});
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
  initPriceHistory(bus, state);
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
