// ECON-P3 market intelligence honesty — pure view-model unit tests.
//
// Contract (src/ui/marketIntelligence.js):
//   unknown stations excluded · stale fades · deterministic · survey/trade honest · corrupt fails closed
//   no live market lookup · no Math.random · no DOM · no second price formula
import assert from 'node:assert/strict';

import {
  AGE_BAND_FRESH_S,
  AGE_BAND_MID_S,
  AGE_HOLLOW_S,
  STALE_CAVEAT,
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

const CMDTY = 'cmdty_ore_iron';

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

function mem(stations) {
  return stations;
}

// ── age bands / stale fade ───────────────────────────────────────────────────────────────────

function testAgeBandsAndStaleFade() {
  const fresh = ageBandFor(30);
  assert.equal(fresh.key, 'fresh');
  assert.equal(fresh.color, 'cyan');
  assert.equal(fresh.italic, false);
  assert.equal(fresh.hollow, false);
  assert.ok(fresh.fade > 0.9, 'fresh quotes are solid');

  const mid = ageBandFor(AGE_BAND_FRESH_S + 1);
  assert.equal(mid.key, 'mid');
  assert.equal(mid.color, 'white');
  assert.equal(mid.italic, false);

  // SPEC3-11: >15 min hollow (stale fade)
  const hollow = ageBandFor(AGE_HOLLOW_S);
  assert.equal(hollow.hollow, true, '≥15 min renders hollow');
  assert.ok(hollow.fade < 1, 'stale fade drops opacity weight');

  const old = ageBandFor(AGE_BAND_MID_S + 60);
  assert.equal(old.key, 'old');
  assert.equal(old.color, 'gray');
  assert.equal(old.italic, true);
  assert.equal(old.hollow, true);
  assert.equal(old.fade, 0, 'fully aged quotes fade to 0 weight');

  assert.equal(ageLabelFor(30), 'fresh');
  assert.equal(ageLabelFor(14 * 60), '14 min');
  assert.equal(ageLabelFor(65 * 60), '65 min');
}

// ── unknown excluded (visited only; no live unknown lookup) ──────────────────────────────────

function testUnknownExcludedVisitedOnly() {
  const memory = mem({
    station_helios: { [CMDTY]: { buy: 171, sell: 180, seenAt: 0 } },
    station_ceres: { [CMDTY]: { buy: 190, sell: 212, seenAt: 0 } },
    // station_forge is live-warmed in real game but NEVER in marketMemory — must not appear
  });

  const quotes = knownStationQuotes(memory, CMDTY, 0);
  const ids = quotes.map((q) => q.stationId).sort();
  assert.deepEqual(ids, ['station_ceres', 'station_helios'],
    'only memory stations render; unknown live markets excluded');

  const best = bestKnownSell(memory, CMDTY, 0);
  assert.equal(best.stationId, 'station_ceres');
  assert.equal(best.sell, 212);
  assert.equal(best.staleCaveat, STALE_CAVEAT);

  // Live markets bag must be ignored when present on a state object
  const state = {
    simTime: 0,
    player: { marketMemory: memory },
    economy: {
      markets: {
        station_forge: { [CMDTY]: { buy: 1, sell: 9999 } },
        station_helios: { [CMDTY]: { buy: 1, sell: 1 } }, // contradicting live
      },
    },
  };
  const intel = marketIntelligence(state, CMDTY);
  assert.equal(intel.quotes.length, 2, 'live markets never pollute intelligence');
  assert.equal(intel.bestSell.sell, 212, 'uses memory sell, not live recompute');
  assert.ok(!intel.quotes.some((q) => q.stationId === 'station_forge'),
    'unvisited forge excluded even with live market entry');
}

// ── stale fades on known quotes ──────────────────────────────────────────────────────────────

function testStaleFadesOnQuotes() {
  const memory = mem({
    station_helios: { [CMDTY]: { buy: 100, sell: 110, seenAt: 0 } },
  });
  const fresh = knownStationQuotes(memory, CMDTY, 30)[0];
  assert.equal(fresh.band.key, 'fresh');
  assert.equal(fresh.band.hollow, false);

  const aged = knownStationQuotes(memory, CMDTY, 20 * 60)[0];
  assert.equal(aged.band.hollow, true, '20 min memory is hollow');
  assert.equal(aged.ageLabel, '20 min');
  assert.ok(aged.band.fade < fresh.band.fade, 'stale fade reduces weight vs fresh');

  const old = knownStationQuotes(memory, CMDTY, 70 * 60)[0];
  assert.equal(old.band.key, 'old');
  assert.equal(old.band.italic, true);
  assert.equal(old.band.color, 'gray');
}

// ── survey provenance honesty ────────────────────────────────────────────────────────────────

function testSurveyProvenanceHonest() {
  assert.deepEqual(quoteProvenance({ buy: 1, sell: 2 }), { source: 'dock', label: 'visited dock' });
  assert.deepEqual(quoteProvenance({ source: 'survey', buy: 1, sell: 2 }),
    { source: 'survey', label: 'survey packet' });
  assert.equal(quoteProvenance({ source: 'omniscient_hack' }), null,
    'unknown provenance fails closed');
  assert.equal(quoteProvenance(null), null);

  const memory = mem({
    station_helios: { [CMDTY]: { buy: 100, sell: 110, seenAt: 0, source: 'dock' } },
    station_ash: {
      [CMDTY]: { buy: 80, sell: 200, seenAt: 0, source: 'survey' },
    },
    station_bad: {
      [CMDTY]: { buy: 50, sell: 500, seenAt: 0, source: 'telepathy' },
    },
  });
  const quotes = knownStationQuotes(memory, CMDTY, 0);
  assert.equal(quotes.length, 2, 'corrupt provenance excluded');
  const survey = quotes.find((q) => q.stationId === 'station_ash');
  assert.ok(survey, 'survey quote included');
  assert.equal(survey.provenance.source, 'survey');
  assert.equal(survey.provenance.label, 'survey packet');
  assert.ok(!quotes.some((q) => q.stationId === 'station_bad'),
    'unknown source never surfaces as intel');
}

// ── trade profit/margin receipt honesty (no second formula) ──────────────────────────────────

function testTradeReceiptHonest() {
  const sellEntry = {
    stationId: 'station_ceres',
    commodityId: CMDTY,
    side: 'sell',
    qty: 10,
    unit: 212,
    buyUnit: 180,
    marginPerUnit: 32,
    profit: 320,
    total: 2120,
    seenAt: 100,
  };
  const receipt = tradeMarginReceipt(sellEntry);
  assert.ok(receipt);
  assert.equal(receipt.honest, true);
  assert.equal(receipt.marginPerUnit, 32, 'uses ledger margin, not recomputed');
  assert.equal(receipt.profit, 320, 'uses ledger profit, not basePrice formula');
  assert.equal(receipt.buyUnit, 180);

  // Even if a second formula would disagree, we trust the ledger
  const weird = tradeMarginReceipt({
    ...sellEntry,
    marginPerUnit: 99,
    profit: 990,
    // unit/buyUnit would imply 32 — still report 99
  });
  assert.equal(weird.marginPerUnit, 99, 'never recompute margin from unit − buyUnit');
  assert.equal(weird.profit, 990);

  const buyEntry = tradeMarginReceipt({
    stationId: 'station_helios',
    commodityId: CMDTY,
    side: 'buy',
    qty: 5,
    unit: 171,
    buyUnit: 171,
    marginPerUnit: 0,
    profit: 0,
    total: 855,
    seenAt: 50,
  });
  assert.equal(buyEntry.side, 'buy');
  assert.equal(buyEntry.profit, 0);

  assert.equal(tradeMarginReceipt(null), null);
  assert.equal(tradeMarginReceipt({ side: 'sell', qty: 0, unit: 1 }), null);
  assert.equal(tradeMarginReceipt({ side: 'yeet', qty: 1, unit: 1, commodityId: CMDTY }), null);

  const rows = tradeMarginReceipts([sellEntry, { broken: true }, buyEntry], 10);
  assert.equal(rows.length, 2, 'corrupt ledger rows skipped');
}

// ── best-known lane + stale caveat ───────────────────────────────────────────────────────────

function testBestKnownLaneAndCaveat() {
  const memory = mem({
    station_helios: { [CMDTY]: { buy: 100, sell: 110, seenAt: 0 } },
    station_ceres: { [CMDTY]: { buy: 150, sell: 220, seenAt: 0 } },
    station_tethys: { [CMDTY]: { buy: 90, sell: 100, seenAt: 0 } },
  });
  const lane = bestKnownMarginLane(memory, CMDTY, 0);
  assert.ok(lane);
  assert.equal(lane.buyStationId, 'station_tethys', 'cheapest known buy');
  assert.equal(lane.sellStationId, 'station_ceres', 'highest known sell');
  assert.equal(lane.buy, 90);
  assert.equal(lane.sell, 220);
  assert.equal(lane.marginPerUnit, 130, 'display arithmetic sell − buy only');
  assert.equal(lane.caveat, STALE_CAVEAT);
  assert.equal(lane.honest, true);

  assert.equal(bestKnownBuy(memory, CMDTY, 0).stationId, 'station_tethys');
  assert.equal(bestKnownSell(memory, CMDTY, 0).stationId, 'station_ceres');

  // Single station → no lane
  assert.equal(bestKnownMarginLane(mem({
    station_helios: { [CMDTY]: { buy: 10, sell: 20, seenAt: 0 } },
  }), CMDTY, 0), null);

  // Empty / missing commodity
  assert.equal(bestKnownMarginLane(memory, 'cmdty_never_seen', 0), null);
  assert.deepEqual(knownStationQuotes(memory, 'cmdty_never_seen', 0), []);
}

// ── corrupt fails closed ─────────────────────────────────────────────────────────────────────

function testCorruptFailsClosed() {
  assert.deepEqual(knownStationQuotes(null, CMDTY, 0), []);
  assert.deepEqual(knownStationQuotes([], CMDTY, 0), []);
  assert.deepEqual(knownStationQuotes({ station_x: null }, CMDTY, 0), []);
  assert.deepEqual(knownStationQuotes({ station_x: { [CMDTY]: 'nope' } }, CMDTY, 0), []);
  assert.deepEqual(knownStationQuotes({ station_x: { [CMDTY]: { buy: 'x', sell: 'y' } } }, CMDTY, 0), []);
  assert.equal(bestKnownSell(undefined, CMDTY, 0), null);
  assert.equal(bestKnownBuy(null, null, 0), null);

  const intel = marketIntelligence(null, CMDTY);
  assert.deepEqual(intel.quotes, []);
  assert.equal(intel.bestSell, null);
  assert.equal(intel.lane, null);
  assert.equal(intel.caveat, STALE_CAVEAT);

  assert.ok(marketIntelligence({ player: { marketMemory: 42 } }, CMDTY));
  assert.deepEqual(
    marketIntelligence({ player: { marketMemory: { a: 1 } }, simTime: -9 }, CMDTY).quotes,
    [],
  );

  // Throws never escape
  const toxic = {
    get player() { throw new Error('boom'); },
  };
  const safe = marketIntelligence(toxic, CMDTY);
  assert.deepEqual(safe.quotes, []);
}

// ── determinism ──────────────────────────────────────────────────────────────────────────────

function testDeterminism() {
  const memory = mem({
    station_b: { [CMDTY]: { buy: 120, sell: 200, seenAt: 10 } },
    station_a: { [CMDTY]: { buy: 100, sell: 180, seenAt: 10, source: 'survey' } },
  });
  const state = {
    simTime: 700,
    player: {
      marketMemory: memory,
      tradeLedger: [
        {
          stationId: 'station_b', commodityId: CMDTY, side: 'sell', qty: 2,
          unit: 200, buyUnit: 100, marginPerUnit: 100, profit: 200, total: 400, seenAt: 600,
        },
      ],
    },
  };
  const a = marketIntelligence(state, CMDTY);
  const b = marketIntelligence(state, CMDTY);
  assert.deepEqual(a, b, 'identical inputs → identical intelligence view');
  assert.equal(a.quotes[0].stationId, 'station_a', 'station ids sorted deterministically');
  assert.equal(a.bestSell.stationId, 'station_b');
  assert.equal(a.lane.marginPerUnit, 100);
  assert.equal(a.receipts[0].profit, 200);
  assert.equal(a.caveat, STALE_CAVEAT);
}

// ── run ──────────────────────────────────────────────────────────────────────────────────────

assert.equal(typeof window, 'undefined', 'tests must run headless');

guarded(testAgeBandsAndStaleFade);
guarded(testUnknownExcludedVisitedOnly);
guarded(testStaleFadesOnQuotes);
guarded(testSurveyProvenanceHonest);
guarded(testTradeReceiptHonest);
guarded(testBestKnownLaneAndCaveat);
guarded(testCorruptFailsClosed);
guarded(testDeterminism);

console.log('economy-market-intelligence.test: OK');
