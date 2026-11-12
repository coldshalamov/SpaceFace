#!/usr/bin/env node
// ECON-P3 market intelligence honesty acceptance check.
//
// Contract (src/ui/marketIntelligence.js + test/economy-market-intelligence.test.mjs):
//   Pure view model over player.marketMemory:
//     • age bands / tints / hollow stale fade
//     • best-known visited only + STALE_CAVEAT
//     • survey provenance honesty
//     • trade profit/margin receipt from ledger (no second price formula)
//     • unknown excluded · corrupt fails closed · deterministic
//   Hard no: live unknown market lookup, RNG, DOM mutation, economy price recompute.
//
// Scope: only the pure module is exercised. Does not touch market/starmap/galaxy/localmap/hud/
// economy/world/package/save/registry.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AGE_BAND_FRESH_S,
  AGE_BAND_MID_S,
  AGE_HOLLOW_S,
  STALE_CAVEAT,
  PROVENANCE,
  ageBandFor,
  ageLabelFor,
  quoteProvenance,
  knownStationQuotes,
  bestKnownSell,
  bestKnownBuy,
  bestKnownMarginLane,
  tradeMarginReceipt,
  tradeMarginReceipts,
  marketIntelligence,
} from '../src/ui/marketIntelligence.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULE_PATH = path.join(ROOT, 'src', 'ui', 'marketIntelligence.js');
const TEST_PATH = path.join(ROOT, 'test', 'economy-market-intelligence.test.mjs');
const CMDTY = 'cmdty_ore_iron';

assert.equal(typeof window, 'undefined', 'this check must run headless');

function guarded(fn) {
  const r = Math.random;
  const n = Date.now;
  Math.random = () => { throw new Error('Math.random in market-intelligence path'); };
  Date.now = () => { throw new Error('Date.now in market-intelligence path'); };
  try {
    return fn();
  } finally {
    Math.random = r;
    Date.now = n;
  }
}

let sections = 0;
function ok(label) {
  sections += 1;
  console.log(`  PASS ${label}`);
}

/** Drop // and block comments so discipline notes do not false-positive purity scans. */
function codeOnly(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// ── 1. source purity (static) ────────────────────────────────────────────────────────────────
function testSourcePurity() {
  const src = readFileSync(MODULE_PATH, 'utf8');
  const code = codeOnly(src);
  assert.doesNotMatch(code, /\bMath\.random\b/, 'module must not call Math.random');
  assert.doesNotMatch(code, /\bDate\.now\b/, 'module must not call Date.now');
  assert.doesNotMatch(code, /\bdocument\b/, 'module must not touch document/DOM');
  assert.doesNotMatch(code, /\bwindow\b/, 'module must not touch window');
  assert.doesNotMatch(code, /from\s+['"].*economy/, 'must not import economy (no live price path)');
  assert.doesNotMatch(code, /from\s+['"].*starmap|from\s+['"].*localmap|from\s+['"].*galaxyMap|from\s+['"].*market\.js/,
    'must not import dirty UI map/market surfaces');
  assert.doesNotMatch(code, /economy\.markets|state\.economy\.markets/,
    'must not look up live unknown markets');
  assert.doesNotMatch(code, /basePrice\s*\*|predictPriceCurve|\.quote\(/,
    'must not re-run economy pricing formula');
  assert.match(src, /STALE_CAVEAT/, 'exports honest stale caveat');
  assert.match(src, /export function knownStationQuotes/, 'exports known quotes builder');
  assert.match(src, /export function bestKnownMarginLane/, 'exports best-known lane');
  assert.match(src, /export function tradeMarginReceipt/, 'exports trade receipt');
  assert.match(src, /export function marketIntelligence/, 'exports composite view model');
  ok('source purity: no RNG/DOM/live-market/second-formula');
}

// ── 2. age bands + stale fade ────────────────────────────────────────────────────────────────
function testAgeBands() {
  assert.equal(AGE_BAND_FRESH_S, 600);
  assert.equal(AGE_BAND_MID_S, 3600);
  assert.equal(AGE_HOLLOW_S, 900);
  assert.equal(ageBandFor(0).key, 'fresh');
  assert.equal(ageBandFor(0).color, 'cyan');
  assert.equal(ageBandFor(601).key, 'mid');
  assert.equal(ageBandFor(900).hollow, true, '>=15 min hollow');
  assert.equal(ageBandFor(3601).key, 'old');
  assert.equal(ageBandFor(3601).italic, true);
  assert.equal(ageBandFor(3601).fade, 0);
  assert.equal(ageLabelFor(45), 'fresh');
  assert.equal(ageLabelFor(120), '2 min');
  ok('age bands / hollow stale fade');
}

// ── 3. unknown excluded ──────────────────────────────────────────────────────────────────────
function testUnknownExcluded() {
  const memory = {
    station_helios: { [CMDTY]: { buy: 171, sell: 180, seenAt: 0 } },
    station_ceres: { [CMDTY]: { buy: 190, sell: 212, seenAt: 0 } },
  };
  const quotes = knownStationQuotes(memory, CMDTY, 0);
  assert.deepEqual(quotes.map((q) => q.stationId).sort(), ['station_ceres', 'station_helios']);
  assert.equal(bestKnownSell(memory, CMDTY, 0).sell, 212);
  assert.equal(bestKnownBuy(memory, CMDTY, 0).buy, 171);

  const state = {
    simTime: 100,
    player: { marketMemory: memory },
    economy: { markets: { station_forge: { [CMDTY]: { buy: 1, sell: 9999 } } } },
  };
  const intel = marketIntelligence(state, CMDTY);
  assert.equal(intel.quotes.length, 2);
  assert.ok(!intel.quotes.some((q) => q.stationId === 'station_forge'));
  assert.equal(intel.bestSell.sell, 212);
  assert.equal(intel.caveat, STALE_CAVEAT);
  ok('unknown/live stations excluded; memory-only best-known');
}

// ── 4. survey provenance + trade receipt honesty ─────────────────────────────────────────────
function testSurveyAndTradeHonest() {
  assert.equal(PROVENANCE.survey, 'survey');
  assert.equal(quoteProvenance({ source: 'survey' }).label, 'survey packet');
  assert.equal(quoteProvenance({ source: 'oracle' }), null);

  const memory = {
    station_helios: { [CMDTY]: { buy: 100, sell: 110, seenAt: 0, source: 'dock' } },
    station_ash: { [CMDTY]: { buy: 80, sell: 200, seenAt: 0, source: 'survey' } },
  };
  const quotes = knownStationQuotes(memory, CMDTY, 0);
  assert.equal(quotes.find((q) => q.stationId === 'station_ash').provenance.source, 'survey');

  // ash buy 80 / sell 200; helios buy 100 / sell 110
  // best pairwise (A!=B): buy helios@100 -> sell ash@200 = +100
  const lane = bestKnownMarginLane(memory, CMDTY, 0);
  assert.equal(lane.buyStationId, 'station_helios');
  assert.equal(lane.sellStationId, 'station_ash');
  assert.equal(lane.marginPerUnit, 100);
  assert.equal(lane.caveat, STALE_CAVEAT);

  const receipt = tradeMarginReceipt({
    stationId: 'station_helios',
    commodityId: CMDTY,
    side: 'sell',
    qty: 4,
    unit: 200,
    buyUnit: 80,
    marginPerUnit: 120,
    profit: 480,
    total: 800,
    seenAt: 50,
  });
  assert.equal(receipt.profit, 480);
  assert.equal(receipt.marginPerUnit, 120);
  assert.equal(receipt.honest, true);

  // Ledger disagree with unit-buyUnit arithmetic still trusted
  assert.equal(tradeMarginReceipt({
    stationId: 'x', commodityId: CMDTY, side: 'sell', qty: 1,
    unit: 10, buyUnit: 1, marginPerUnit: 999, profit: 999, total: 10, seenAt: 0,
  }).marginPerUnit, 999);

  assert.deepEqual(tradeMarginReceipts(null), []);
  assert.equal(tradeMarginReceipt({ side: 'sell' }), null);
  ok('survey provenance + trade receipt honesty (no second formula)');
}

// ── 5. corrupt fails closed + determinism ────────────────────────────────────────────────────
function testCorruptAndDeterminism() {
  assert.deepEqual(knownStationQuotes(null, CMDTY, 0), []);
  assert.equal(bestKnownSell({}, CMDTY, 0), null);
  assert.equal(bestKnownMarginLane({
    station_a: { [CMDTY]: { buy: 'no', sell: NaN } },
  }, CMDTY, 0), null);

  const toxic = { get player() { throw new Error('nope'); } };
  assert.deepEqual(marketIntelligence(toxic, CMDTY).quotes, []);

  const state = {
    simTime: 900,
    player: {
      marketMemory: {
        station_z: { [CMDTY]: { buy: 50, sell: 90, seenAt: 0 } },
        station_a: { [CMDTY]: { buy: 40, sell: 100, seenAt: 0 } },
      },
      tradeLedger: [
        {
          stationId: 'station_a', commodityId: CMDTY, side: 'sell', qty: 1,
          unit: 100, buyUnit: 40, marginPerUnit: 60, profit: 60, total: 100, seenAt: 800,
        },
      ],
    },
  };
  assert.deepEqual(marketIntelligence(state, CMDTY), marketIntelligence(state, CMDTY));
  const intel = marketIntelligence(state, CMDTY);
  assert.equal(intel.quotes[0].stationId, 'station_a');
  assert.equal(intel.lane.marginPerUnit, 50);
  assert.equal(intel.receipts[0].profit, 60);
  assert.equal(intel.quotes[0].band.hollow, true, '900s age is hollow');
  ok('corrupt fails closed + deterministic');
}

// ── 6. unit test suite green ─────────────────────────────────────────────────────────────────
function testUnitSuite() {
  const result = spawnSync(process.execPath, [TEST_PATH], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error(result.stdout || '');
    console.error(result.stderr || '');
  }
  assert.equal(result.status, 0, 'test/economy-market-intelligence.test.mjs must pass');
  assert.match(result.stdout || '', /OK/, 'unit suite reports OK');
  ok('unit suite green');
}

// ── run ──────────────────────────────────────────────────────────────────────────────────────
testSourcePurity();
guarded(testAgeBands);
guarded(testUnknownExcluded);
guarded(testSurveyAndTradeHonest);
guarded(testCorruptAndDeterminism);
testUnitSuite();

console.log(`[check-economy-market-intelligence] PASS — ${sections} sections green`);
