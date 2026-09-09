// PROFESSIONAL-MARKET-INTELLIGENCE-UI — pure presenter unit tests.
// Headless only. No DOM, no headed launch, no economy mutation.
import assert from 'node:assert/strict';

import {
  INTEL_CHIP_CAP,
  presentCommodityIntel,
  presentIntelChips,
  presentInspectorRows,
} from '../src/ui/marketIntelPresenter.js';
import { STALE_CAVEAT } from '../src/ui/marketIntelligence.js';

const CMDTY = 'cmdty_ore_iron';
const HERE = 'station_helios';
const THERE = 'station_ceres';

function guarded(fn) {
  const r = Math.random;
  const n = Date.now;
  Math.random = () => { throw new Error('Math.random in market-intel presenter'); };
  Date.now = () => { throw new Error('Date.now in market-intel presenter'); };
  try {
    return fn();
  } finally {
    Math.random = r;
    Date.now = n;
  }
}

function baseState(overrides = {}) {
  return {
    simTime: 120,
    player: {
      credits: 50000,
      cargo: { capVolume: 40, usedVolume: 5, items: { [CMDTY]: 2 } },
      marketMemory: {
        [HERE]: { [CMDTY]: { buy: 100, sell: 110, seenAt: 100, source: 'dock' } },
        [THERE]: { [CMDTY]: { buy: 140, sell: 200, seenAt: 90, source: 'dock' } },
      },
      tradeLedger: [],
    },
    world: { currentSectorId: 'sector_helios_prime' },
    ui: {},
    ...overrides,
  };
}

function testFiveSecondFieldsPresent() {
  const state = baseState();
  const view = presentCommodityIntel({
    state,
    commodityId: CMDTY,
    stationId: HERE,
    liveBuy: 105,
    liveSell: 115,
    qty: 10,
    quoteUnit: 112,
    priceImpactPct: 8,
    side: 'buy',
    route: {
      destStation: THERE,
      destName: 'Ceres Exchange',
      sellThere: 200,
      intelLabel: 'price memory',
    },
  });

  assert.equal(view.honest, true);
  assert.ok(view.age, 'age');
  assert.ok(view.confidence, 'confidence');
  assert.equal(view.source.label, 'visited dock');
  assert.ok(view.knownVsLive, 'known-vs-live');
  assert.ok(view.risk, 'risk');
  assert.ok(view.cargoFit, 'cargo fit');
  assert.ok(view.margin, 'expected margin');
  assert.ok(view.diminishing, 'diminishing returns');
  assert.equal(view.route.label, 'Ceres Exchange');
  assert.equal(view.margin.perUnit, 88, 'bulk unit average is used for expected margin');
  assert.ok(view.chips.length > 0, 'chips for strip');
  assert.ok(view.chips.length <= INTEL_CHIP_CAP, 'chip budget');
  assert.ok(view.inspectorRows.length >= 5, 'inspector rows scannable');
  assert.ok(view.ariaSummary.length > 0, 'a11y summary');

  const ids = new Set(view.chips.map((c) => c.id));
  assert.ok(ids.has('age'), 'age chip');
  assert.ok(ids.has('conf'), 'confidence chip');
  assert.ok(ids.has('kvl') || ids.has('margin'), 'price or margin chip');
}

function testKnownVsLiveDelta() {
  const state = baseState();
  const view = presentCommodityIntel({
    state,
    commodityId: CMDTY,
    stationId: HERE,
    liveBuy: 100,
    liveSell: 130, // +20 vs known sell 110
    qty: 1,
    side: 'buy',
  });
  assert.equal(view.knownVsLive.status, 'live_high');
  assert.equal(view.knownVsLive.sellDelta, 20);
  assert.match(view.knownVsLive.line, /live/);
  assert.match(view.knownVsLive.line, /known/);
}

function testNoOmniscience() {
  const state = baseState();
  // Unvisited forge must not invent live-or-known for margin path through presenter memory.
  state.economy = {
    markets: {
      station_forge: { [CMDTY]: { lastBuy: 1, lastSell: 9999 } },
    },
  };
  const view = presentCommodityIntel({
    state,
    commodityId: CMDTY,
    stationId: HERE,
    liveBuy: 100,
    liveSell: 110,
    qty: 5,
    side: 'buy',
  });
  // Margin from known lane only (helios buy 100 / ceres sell 200 or lane).
  assert.ok(view.margin && view.margin.perUnit > 0, 'margin from memory lane');
  assert.equal(view.margin.caveat, STALE_CAVEAT);
  assert.ok(!JSON.stringify(view).includes('station_forge'), 'unvisited forge absent');
}

function testWrongOriginLaneIsNotPresentedAsHere() {
  const state = baseState();
  state.player.marketMemory.station_other = {
    [CMDTY]: { buy: 1, sell: 2, seenAt: 115, source: 'dock' },
  };
  const view = presentCommodityIntel({
    state,
    commodityId: CMDTY,
    stationId: HERE,
    liveBuy: 250,
    liveSell: 260,
    quoteUnit: 255,
    qty: 5,
    side: 'buy',
  });
  assert.equal(view.margin.show, false, 'global lane from another origin is not this market margin');
  assert.equal(view.route.show, false);
}

function testAgeConfidenceAndStale() {
  const state = baseState({ simTime: 70 * 60 });
  state.player.marketMemory[HERE][CMDTY].seenAt = 0;
  const view = presentCommodityIntel({
    state,
    commodityId: CMDTY,
    stationId: HERE,
    liveBuy: 100,
    liveSell: 110,
    qty: 1,
  });
  assert.equal(view.age.key, 'old');
  assert.equal(view.age.hollow, true);
  assert.equal(view.confidence.key, 'low');
}

function testRouteAgeUsesDestinationIntel() {
  const state = baseState({ simTime: 2000 });
  state.player.marketMemory[HERE][CMDTY].seenAt = 1999;
  state.player.marketMemory[THERE][CMDTY].seenAt = 0;
  const view = presentCommodityIntel({
    state,
    commodityId: CMDTY,
    stationId: HERE,
    liveBuy: 100,
    liveSell: 110,
    quoteUnit: 100,
    qty: 5,
    side: 'buy',
    route: { destStation: THERE, destName: 'Ceres Exchange', sellThere: 200, intelLabel: 'price memory' },
  });
  assert.equal(view.age.hollow, true, 'route age follows destination quote, not fresh local dock');
  assert.notEqual(view.confidence.key, 'high');
}

function testCargoFitAndDiminishing() {
  const state = baseState();
  state.player.cargo = { capVolume: 10, usedVolume: 9, items: {} };
  const tight = presentCommodityIntel({
    state,
    commodityId: CMDTY,
    stationId: HERE,
    liveBuy: 100,
    liveSell: 110,
    qty: 20,
    priceImpactPct: 18,
    side: 'buy',
  });
  assert.equal(tight.cargoFit.fits, false);
  assert.equal(tight.cargoFit.tone, 'warn');
  assert.ok(tight.diminishing.severity > 0);
  assert.match(tight.diminishing.label, /flood|soft|\+/);

  const flat = presentCommodityIntel({
    state: baseState(),
    commodityId: CMDTY,
    stationId: HERE,
    liveBuy: 100,
    liveSell: 110,
    qty: 1,
    priceImpactPct: 0.2, // percent points from economy.quote
    side: 'buy',
  });
  assert.equal(flat.diminishing.severity, 0);
  assert.equal(flat.diminishing.short, 'flat');
}

function testRiskLegality() {
  const state = baseState();
  const legal = presentCommodityIntel({
    state,
    commodityId: CMDTY,
    stationId: HERE,
    liveBuy: 10,
    liveSell: 12,
    qty: 1,
    def: { id: CMDTY, name: 'Iron', legality: 'legal', volPerU: 1 },
  });
  assert.equal(legal.risk.show, true);
  assert.equal(legal.risk.chip, false);

  const contra = presentCommodityIntel({
    state,
    commodityId: 'cmdty_x',
    stationId: HERE,
    liveBuy: 10,
    liveSell: 12,
    qty: 1,
    def: { id: 'cmdty_x', name: 'X', legality: 'contraband', volPerU: 1 },
  });
  assert.equal(contra.risk.show, true);
  assert.equal(contra.risk.tone, 'danger');
  assert.ok(contra.chips.some((c) => c.id === 'risk'));
}

function testCorruptFailsClosed() {
  const empty = presentCommodityIntel(null);
  assert.deepEqual(empty.chips, []);
  assert.equal(empty.honest, true);

  const toxic = presentCommodityIntel({
    state: { get player() { throw new Error('boom'); } },
    commodityId: CMDTY,
    stationId: HERE,
  });
  assert.deepEqual(toxic.chips, []);
  assert.ok(Array.isArray(presentIntelChips(null)));
  assert.ok(Array.isArray(presentInspectorRows(null)));
}

function testDeterminism() {
  const state = baseState();
  const a = presentCommodityIntel({
    state, commodityId: CMDTY, stationId: HERE,
    liveBuy: 105, liveSell: 115, qty: 8, priceImpactPct: 6, side: 'buy',
  });
  const b = presentCommodityIntel({
    state, commodityId: CMDTY, stationId: HERE,
    liveBuy: 105, liveSell: 115, qty: 8, priceImpactPct: 6, side: 'buy',
  });
  assert.deepEqual(a, b);
  assert.deepEqual(presentIntelChips(a), presentIntelChips(b));
  assert.deepEqual(presentInspectorRows(a), presentInspectorRows(b));
}

function testLiveOnlyWhenNoMemoryHere() {
  const state = baseState();
  delete state.player.marketMemory[HERE];
  const view = presentCommodityIntel({
    state,
    commodityId: CMDTY,
    stationId: HERE,
    liveBuy: 88,
    liveSell: 99,
    qty: 2,
  });
  assert.equal(view.knownVsLive.status, 'live');
  assert.match(view.knownVsLive.short, /live/);
}

assert.equal(typeof window, 'undefined', 'tests must run headless');

guarded(testFiveSecondFieldsPresent);
guarded(testKnownVsLiveDelta);
guarded(testNoOmniscience);
guarded(testWrongOriginLaneIsNotPresentedAsHere);
guarded(testAgeConfidenceAndStale);
guarded(testRouteAgeUsesDestinationIntel);
guarded(testCargoFitAndDiminishing);
guarded(testRiskLegality);
guarded(testCorruptFailsClosed);
guarded(testDeterminism);
guarded(testLiveOnlyWhenNoMemoryHere);

console.log('market-intel-presenter.test: OK');
