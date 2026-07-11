#!/usr/bin/env node
// PROFESSIONAL-MARKET-INTELLIGENCE-UI-GROK-001 acceptance (static/headless only).
//
// Contract:
//   • Pure presenter maps age/conf/known-vs-live/cause/risk/cargo/margin/diminishing
//   • market.js wires strip + inspector; emits intents only (ui:buy / ui:sell / nav)
//   • No omniscience; no second price formula; no package.json / economy / goldens edits
//   • Headless only — never launches a headed runtime or local game host
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  INTEL_CHIP_CAP,
  presentCommodityIntel,
  presentIntelChips,
  presentInspectorRows,
} from '../src/ui/marketIntelPresenter.js';
import { STALE_CAVEAT } from '../src/ui/marketIntelligence.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRESENTER = path.join(ROOT, 'src', 'ui', 'marketIntelPresenter.js');
const MARKET = path.join(ROOT, 'src', 'ui', 'screens', 'market.js');
const UNIT = path.join(ROOT, 'test', 'market-intel-presenter.test.mjs');
const CMDTY = 'cmdty_ore_iron';

assert.equal(typeof window, 'undefined', 'check must run headless');

let sections = 0;
function ok(label) {
  sections += 1;
  console.log(`  PASS ${label}`);
}

function codeOnly(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function guarded(fn) {
  const r = Math.random;
  const n = Date.now;
  Math.random = () => { throw new Error('Math.random in market-intel-ui path'); };
  Date.now = () => { throw new Error('Date.now in market-intel-ui path'); };
  try { return fn(); } finally { Math.random = r; Date.now = n; }
}

// ── 1. presenter purity ──────────────────────────────────────────────────────────────────────
function testPresenterPurity() {
  const src = readFileSync(PRESENTER, 'utf8');
  const code = codeOnly(src);
  assert.doesNotMatch(code, /\bMath\.random\b/);
  assert.doesNotMatch(code, /\bDate\.now\b/);
  assert.doesNotMatch(code, /\bdocument\b/);
  assert.doesNotMatch(code, /\bwindow\b/);
  assert.doesNotMatch(code, /from\s+['"].*systems\/economy/);
  assert.doesNotMatch(code, /economy\.markets|state\.economy\.markets/);
  assert.doesNotMatch(code, /\.quote\(|predictPriceCurve|basePrice\s*\*/);
  assert.match(src, /export function presentCommodityIntel/);
  assert.match(src, /STALE_CAVEAT/);
  ok('presenter purity: no RNG/DOM/live-market/second-formula');
}

// ── 2. market screen wiring (static) ─────────────────────────────────────────────────────────
function testMarketWiring() {
  const src = readFileSync(MARKET, 'utf8');
  assert.match(src, /marketIntelPresenter/);
  assert.match(src, /presentCommodityIntel/);
  assert.match(src, /data-intel-strip/);
  assert.match(src, /data-intel-inspector/);
  assert.match(src, /data-intel-chip/);
  assert.match(src, /renderIntelStrip/);
  assert.match(src, /renderIntelInspector/);
  assert.doesNotMatch(src, /chipRow\.style|toneColor\(/);
  // Still intent-only trade verbs
  assert.match(src, /ui:buy/);
  assert.match(src, /ui:sell/);
  // Purpose essay not on default chrome (hidden)
  assert.match(src, /st-cmdty-purpose" hidden/);
  // Must not import locked / out-of-scope surfaces
  assert.doesNotMatch(src, /from\s+['"].*stationHub/);
  assert.doesNotMatch(src, /from\s+['"].*missionLog/);
  assert.doesNotMatch(src, /from\s+['"].*systems\/input/);
  ok('market.js wires strip+inspector; intents only; purpose hidden');
}

// ── 3. five-second field contract ────────────────────────────────────────────────────────────
function testFiveSecondContract() {
  const state = {
    simTime: 200,
    player: {
      credits: 20000,
      cargo: { capVolume: 50, usedVolume: 0, items: {} },
      marketMemory: {
        station_helios: { [CMDTY]: { buy: 100, sell: 110, seenAt: 180, source: 'dock' } },
        station_ceres: { [CMDTY]: { buy: 150, sell: 220, seenAt: 100, source: 'dock' } },
      },
      tradeLedger: [],
    },
    world: { currentSectorId: 'sector_helios_prime' },
    ui: {
      causeLedger: {
        lines: {
          pricePressure: 'Freight pressure lifted local ore quotes.',
          danger: null,
          influence: null,
        },
      },
    },
  };
  const view = presentCommodityIntel({
    state,
    commodityId: CMDTY,
    stationId: 'station_helios',
    liveBuy: 108,
    liveSell: 118,
    qty: 12,
    quoteUnit: 112,
    priceImpactPct: 10,
    side: 'buy',
    def: { id: CMDTY, name: 'Iron Ore', legality: 'legal', volPerU: 1 },
    route: {
      destStation: 'station_ceres',
      destName: 'Ceres Exchange',
      sellThere: 220,
      intelLabel: 'price memory',
    },
  });

  const fields = ['age', 'confidence', 'source', 'knownVsLive', 'cause', 'route', 'risk', 'cargoFit', 'margin', 'diminishing'];
  for (const f of fields) {
    assert.ok(view[f] != null, `field ${f} present`);
  }
  assert.ok(view.chips.length <= INTEL_CHIP_CAP);
  assert.ok(view.chips.length >= 3, 'compact three-chip five-second scan');
  assert.equal(view.cause.line, 'Freight pressure lifted local ore quotes.');
  assert.ok(view.inspectorRows.some((r) => r.id === 'cause'));
  assert.ok(view.inspectorRows.some((r) => r.id === 'kvl'));
  assert.ok(view.inspectorRows.some((r) => r.id === 'source'));
  assert.ok(view.inspectorRows.some((r) => r.id === 'route'));
  assert.ok(view.margin.perUnit > 0);
  assert.equal(view.margin.caveat, STALE_CAVEAT);
  assert.ok(view.diminishing.severity > 0);
  assert.ok(presentIntelChips(view).length > 0);
  assert.ok(presentInspectorRows(view).length >= 5);
  ok('five-second fields: age/conf/kvl/cause/risk/cargo/margin/diminish');
}

// ── 4. honesty + fail closed ─────────────────────────────────────────────────────────────────
function testHonesty() {
  const state = {
    simTime: 0,
    player: {
      cargo: { capVolume: 10, usedVolume: 0, items: {} },
      marketMemory: {
        station_helios: { [CMDTY]: { buy: 50, sell: 60, seenAt: 0 } },
      },
    },
    economy: {
      markets: {
        station_forge: { [CMDTY]: { lastSell: 99999 } },
      },
    },
  };
  const view = presentCommodityIntel({
    state,
    commodityId: CMDTY,
    stationId: 'station_helios',
    liveBuy: 50,
    liveSell: 60,
    qty: 1,
  });
  assert.ok(!JSON.stringify(view.chips).includes('99999'));
  assert.ok(!JSON.stringify(view.inspectorRows).includes('station_forge'));
  assert.deepEqual(presentCommodityIntel(null).chips, []);
  ok('honesty: memory-only; corrupt fails closed');
}

// ── 5. unit suite ────────────────────────────────────────────────────────────────────────────
function testUnitSuite() {
  const result = spawnSync(process.execPath, [UNIT], { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stdout || '');
    console.error(result.stderr || '');
  }
  assert.equal(result.status, 0, 'market-intel-presenter unit suite must pass');
  assert.match(result.stdout || '', /OK/);
  ok('unit suite green');
}

// ── 6. no headed surfaces in this packet ─────────────────────────────────────────────────────
function testNoHeaded() {
  const presenterCode = codeOnly(readFileSync(PRESENTER, 'utf8'));
  const marketCode = codeOnly(readFileSync(MARKET, 'utf8'));
  const checkCode = codeOnly(readFileSync(fileURLToPath(import.meta.url), 'utf8'));
  // Reject real headed launch seams (not comment prose).
  const headed = /\bpuppeteer\b|\bplaywright\b|\belectron\b|server\.js|localhost:\d+/i;
  assert.doesNotMatch(presenterCode, headed);
  assert.doesNotMatch(marketCode, headed);
  assert.doesNotMatch(checkCode, headed);
  ok('check is static/headless only');
}

testPresenterPurity();
testMarketWiring();
guarded(testFiveSecondContract);
guarded(testHonesty);
testUnitSuite();
testNoHeaded();

console.log(`[check-market-intel-ui] PASS — ${sections} sections green`);
