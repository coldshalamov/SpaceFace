// BP-12 packet PRICE_FORECAST_CONE ("Where Air Is About To Be Cheap") acceptance check.
//
// Contract (src/ui/priceForecast.js):
//   - forecastArrow is PURE: rising/falling/steady from the sign of trend.pricePressure, gated to
//     |trend| > FORECAST_THRESHOLD. Below the gate → steady.
//   - The label is ALWAYS a FORECAST (confidence:'forecast'), never a guarantee (the failure mode:
//     presenting trend as certainty).
//   - One arrow per sector; the wired module annotates the current sector (always, steady if calm)
//     + visible neighbors (only those with material movement — no clutter).
//   - Deterministic per field digest; routes through sectorSignalFor (field wins).
//   - Never speaks (voice:none); never touches prices (economy owns them).
import assert from 'node:assert/strict';

import {
  priceForecastSystem, forecastArrow, forecastFor, FORECAST_THRESHOLD,
} from '../src/ui/priceForecast.js';
import { SECTORS } from '../src/data/sectors.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');

function guarded(fn) {
  const r = Math.random, n = Date.now;
  Math.random = () => { throw new Error('Math.random in price-forecast path'); };
  Date.now = () => { throw new Error('Date.now in price-forecast path'); };
  try { return fn(); } finally { Math.random = r; Date.now = n; }
}

testRisingFallingSteady();
guarded(testBelowThresholdIsSteady);
guarded(testForecastLabelNotGuarantee);
guarded(testMissingSignalNull);
guarded(testForecastForFieldWins);
guarded(testDeterminism);
testWiredModuleCurrentAndNeighborsNoClutter();

console.log('Price-forecast checks OK');

function signal(trendPrice) {
  return { sectorId: 'sector_x', driver: { danger: 'structural_baseline', pricePressure: 'market_balance', influence: 'territorial_anchor' }, trend: { danger: 0, pricePressure: trendPrice, influence: 0 } };
}

// ── 1. rising/falling/steady from the sign ──────────────────────────────────────────────────
function testRisingFallingSteady() {
  const rising = forecastArrow(signal(FORECAST_THRESHOLD * 5));
  assert.equal(rising.direction, 'rising');
  assert.equal(rising.glyph, '▲');
  const falling = forecastArrow(signal(-FORECAST_THRESHOLD * 5));
  assert.equal(falling.direction, 'falling');
  assert.equal(falling.glyph, '▼');
}

// ── 2. below threshold → steady (no clutter from micro-movements) ────────────────────────────
function testBelowThresholdIsSteady() {
  const tiny = forecastArrow(signal(FORECAST_THRESHOLD * 0.5));
  assert.equal(tiny.direction, 'steady', '|trend| below threshold → steady (no false arrow)');
  assert.equal(forecastArrow(signal(0)).direction, 'steady');
}

// ── 3. label is a FORECAST, never a guarantee ────────────────────────────────────────────────
function testForecastLabelNotGuarantee() {
  for (const t of [FORECAST_THRESHOLD * 5, -FORECAST_THRESHOLD * 5, 0]) {
    const a = forecastArrow(signal(t));
    assert.equal(a.confidence, 'forecast', 'always labeled a forecast, never a guarantee');
    assert.ok(/forecast|steady/i.test(a.label), `label reads as a forecast: "${a.label}"`);
  }
}

// ── 4. missing signal → null ────────────────────────────────────────────────────────────────
function testMissingSignalNull() {
  assert.equal(forecastArrow(null), null);
  assert.equal(forecastArrow({}), null, 'no trend → null');
}

// ── 5. forecastFor routes through sectorSignalFor (field wins) ───────────────────────────────
function testForecastForFieldWins() {
  const sectorId = SECTORS[0].id;
  const state = {
    simTime: 100, meta: { seed: 7 }, world: { sectors: {}, currentSectorId: sectorId },
    sectorSim: {
      field: { version: 1, epochDays: 3, nodes: { [sectorId]: {
        danger: 0.3, pricePressure: 0.2, influence: {}, dominantFactionId: 'faction_mts',
        trend: { danger: 0, pricePressure: 0.01, influence: 0 },
        driver: { danger: 'structural_baseline', pricePressure: 'meridian_transmission', influence: 'territorial_anchor' },
      } } },
      sectors: { [sectorId]: { drift: { security: 0.5, enemyDensity: 0 } } },
      meta: {},
    },
  };
  const f = forecastFor(state, sectorId);
  assert.ok(f, 'resolves a real sector');
  assert.equal(f.direction, 'rising', 'field node trend wins → rising');
  assert.ok(/rising/i.test(f.label));
}

// ── 6. determinism ──────────────────────────────────────────────────────────────────────────
function testDeterminism() {
  const sig = signal(0.01);
  assert.deepStrictEqual(forecastArrow(sig), forecastArrow(sig));
}

// ── 7. wired module: current always + neighbors only material; no clutter; never speaks ──────
function testWiredModuleCurrentAndNeighborsNoClutter() {
  const handlers = new Map();
  const voiceCalls = [];
  const bus = {
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, []); handlers.get(evt).push(fn); },
    off(evt, fn) { const l = handlers.get(evt) || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    emit(evt, p) { for (const fn of (handlers.get(evt) || []).slice()) fn(p); },
  };
  // Pick a sector that HAS neighbors so the neighbor path is exercised.
  const sector = SECTORS.find((s) => (s.neighbors || []).length >= 2) || SECTORS[0];
  const sectorId = sector.id;
  const node = (trendPP) => ({
    danger: 0.3, pricePressure: trendPP, influence: {}, dominantFactionId: 'faction_scn',
    trend: { danger: 0, pricePressure: trendPP, influence: 0 },
    driver: { danger: 'structural_baseline', pricePressure: 'market_balance', influence: 'territorial_anchor' },
  });
  const state = {
    simTime: 100, meta: { seed: 7 }, world: { sectors: {}, currentSectorId: sectorId },
    sectorSim: { field: { version: 1, epochDays: 3, nodes: {} }, sectors: {}, meta: {} },
  };
  state.sectorSim.field.nodes[sectorId] = node(0.01); // current rising
  const neighbors = sector.neighbors || [];
  if (neighbors[0]) state.sectorSim.field.nodes[neighbors[0]] = node(-0.01); // falling → shown
  if (neighbors[1]) state.sectorSim.field.nodes[neighbors[1]] = node(0.0001); // calm → omitted

  const sys = { ...priceForecastSystem };
  sys.init({ bus, state, helpers: { voice: { say(m) { voiceCalls.push(m); return true; } } } });
  bus.emit('sector:enter', { sectorId });
  assert.ok(state.ui.priceForecast, 'sector:enter refreshes state.ui.priceForecast');
  assert.equal(state.ui.priceForecast.current.direction, 'rising', 'current sector always shown');
  // neighbors array omits the calm one (no clutter)
  const shown = state.ui.priceForecast.neighbors.map((n) => n.sectorId);
  if (neighbors[1]) assert.ok(!shown.includes(neighbors[1]), 'calm neighbor omitted (no clutter)');
  if (neighbors[0]) assert.ok(shown.includes(neighbors[0]), 'falling neighbor shown');
  assert.equal(voiceCalls.length, 0, 'never speaks (voice:none)');
  sys.destroy();
}
