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
import { cycleFactorAt, predictPriceCurve, regimeLabel } from '../src/systems/economyCycles.js';
import { initPriceHistory, getPriceHistory, loadHistory } from '../src/ui/priceHistory.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MARKET_SOURCE = readFileSync(join(ROOT, 'src/ui/screens/market.js'), 'utf8');

assert.equal(typeof window, 'undefined', 'this check must run headless');

guarded(testRealEconomyHistoryAndForecast);
testMarketScreenChartSourceContract();

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
  const checks = [
    [/import \{ getPriceHistory \} from '\.\.\/priceHistory\.js';/, 'imports real price history'],
    [/import \{ drawSparkline \} from '\.\.\/sparkline\.js';/, 'imports row sparkline renderer'],
    [/import \{ getCycle \} from '\.\.\/\.\.\/systems\/economy\.js';/, 'imports live economy cycle wrapper'],
    [/import \{ predictPriceCurve, regimeLabel \} from '\.\.\/\.\.\/systems\/economyCycles\.js';/, 'imports forecast cycle helpers'],
    [/chartModal\.id = 'market-chart-modal';/, 'creates the chart modal by id'],
    [/class="st-expanded-chart"/, 'modal owns an expanded chart canvas'],
    [/class="st-chart-tooltip"/, 'modal owns an interactive chart tooltip'],
    [/class="st-modal-event-log"/, 'modal owns an economic event log'],
    [/if \(!btn\) \{\s*openChartModal\(cmdtyId\);\s*return;\s*\}/s, 'clicking a commodity card opens the chart'],
    [/chartModal\.querySelector\('\.st-modal-title'\)\.textContent = def\.name \+ ' Historical Pricing & Forecast';/, 'chart names history plus forecast'],
    [/const cycle = getCycle\(stationId, cmdtyId\);/, 'chart reads the live cycle regime'],
    [/regimeLabel\(cycle\.regime\)/, 'chart renders a human regime label'],
    [/const pred = predictPriceCurve\(state, stationId, cmdtyId, 24, 5\);/, 'chart renders the shipped 24x5s forecast window'],
    [/const hist = getPriceHistory\(stationId, cmdtyId\);/, 'chart uses recorded history'],
    [/if \(change > 0\.04\).*Rising/s, 'chart labels material rising forecasts only'],
    [/else if \(change < -0\.04\).*Falling/s, 'chart labels material falling forecasts only'],
    [/activeEvents\.filter\(e => e\.stationId === stationId && \(e\.commodityId === '\*' \|\| e\.commodityId === cmdtyId\)\)/, 'event log filters to matching station and commodity'],
    [/drawExpandedChart\(canvas, hist, pred, def\.basePrice\);/, 'chart draws history plus forecast against base price'],
    [/setupChartTooltip\(canvas, hist, pred, def\.basePrice\);/, 'chart wires interactive tooltips to the same data'],
    [/drawSparkline\(spark, history, \{ upColor: '#f2a83b', downColor: '#8fb0c0' \}\);/, 'commodity rows use the same price history'],
    [/ctx\.fillText\('BASE', W - padRight, basePriceY - 8\);/, 'expanded chart labels the base-price baseline'],
    [/Future price prediction line[\s\S]*ctx\.setLineDash\(\[4, 4\]\);/, 'forecast line is visually distinct from observed history'],
  ];
  for (const [pattern, label] of checks) {
    if (!pattern.test(MARKET_SOURCE)) {
      throw new Error(`market chart source contract failed: ${label}`);
    }
  }
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
