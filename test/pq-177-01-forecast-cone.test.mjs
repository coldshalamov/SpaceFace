// PQ-177.01 — forecast cone calibration, quote freshness, and the net sale.
// The stated rate is whatever predictPriceCurve prints. These two seeds were not
// used to choose it. Do not retune prices to move the fraction.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSimulation } from '../src/core/sim.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { SECTORS } from '../src/data/sectors.js';
import { ECONOMY_BALANCE as BALANCE } from '../src/data/economyDerived.js';
import { economy } from '../src/systems/economy.js';
import { predictPriceCurve } from '../src/systems/economyCycles.js';
import { marketQuoteHtml, rememberedSurveyFreshness } from '../src/ui/views/marketPresentation.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const HAUL_S = BALANCE.market.referenceHaulS;
const HELD_OUT = [17701011, 17701012];
const IRON = 'cmdty_ore_iron';
const RATE_TOLERANCE = 0.02;

function boot(seed) {
  const sim = createSimulation({ seed, systems: [economy], updateOrder: [economy] });
  const econ = sim.registry.get('economy');
  sim.state.world.currentSectorId = 'sector_helios_prime';
  econ.newGame();
  for (const sec of SECTORS) {
    if (sec.id === 'sector_helios_prime' || sec.id === 'sector_ceres_belt') {
      for (const st of sec.stations || []) econ.ensureMarket(st.id, st.type, st.size);
    }
  }
  return { sim, econ, state: sim.state };
}

function release() {
  economy._instance = null;
}

function listings(state) {
  const rows = [];
  for (const sid of Object.keys(state.economy.markets)) {
    for (const cid of Object.keys(state.economy.markets[sid])) rows.push([sid, cid]);
  }
  return rows;
}

function advance(state, econ, seconds) {
  const target = state.simTime + seconds;
  while (state.simTime < target - 1e-6) {
    const dt = Math.min(5, target - state.simTime);
    state.simTime += dt;
    econ.update(dt, state);
  }
}

function containArrival(seed, horizonS, useDefaultCurve) {
  const { sim, econ, state } = boot(seed);
  try {
    const rows = [];
    let stated = null;
    for (const [sid, cid] of listings(state)) {
      const curve = useDefaultCurve
        ? predictPriceCurve(state, sid, cid)
        : predictPriceCurve(state, sid, cid, 1, horizonS);
      const point = curve.at(-1);
      if (!point) continue;
      assert.ok(point.lo <= point.mid && point.mid <= point.hi, `${sid} ${cid} band contains its own mid`);
      assert.equal(curve.statedRate, point.statedRate);
      stated = curve.statedRate;
      rows.push({ sid, cid, lo: point.lo, hi: point.hi, t: point.t });
    }
    assert.ok(rows.length > 0, 'forecast covered listings');
    const arrival = useDefaultCurve ? rows[0].t - state.simTime : horizonS;
    advance(state, econ, arrival);
    let contained = 0;
    for (const row of rows) {
      const got = state.economy.markets[row.sid][row.cid].lastMid;
      if (got >= row.lo && got <= row.hi) contained += 1;
    }
    return { contained, total: rows.length, stated, arrival };
  } finally {
    sim.dispose();
    release();
  }
}

test('held-out seeds land inside the stated cone at the stated rate', () => {
  for (const seed of HELD_OUT) {
    const chart = containArrival(seed, 0, true);
    const haul = containArrival(seed, HAUL_S, false);
    const chartRate = chart.contained / chart.total;
    const haulRate = haul.contained / haul.total;
    console.log(`PQ-177.01 seed ${seed} chart ${chart.contained}/${chart.total} haul ${haul.contained}/${haul.total} stated ${chart.stated}`);
    assert.equal(chart.stated, haul.stated);
    assert.ok(chart.stated > 0 && chart.stated <= 1, 'the cone states a rate');
    assert.ok(Math.abs(chartRate - chart.stated) <= RATE_TOLERANCE,
      `chart arrival ${chart.contained}/${chart.total} is not the stated ${chart.stated}`);
    assert.ok(Math.abs(haulRate - haul.stated) <= RATE_TOLERANCE,
      `haul arrival ${haul.contained}/${haul.total} is not the stated ${haul.stated}`);
  }
});

test('a player can tell a stale survey from a fresh quote', () => {
  const { sim, state } = boot(HELD_OUT[0]);
  try {
    state.simTime = 2000;
    state.player.marketMemory.station_ceres = {
      [IRON]: { buy: 12, sell: 10, seenAt: 0, source: 'survey' },
    };
    const survey = rememberedSurveyFreshness(state, IRON);
    assert.equal(survey && survey.text, 'stale survey');
    const staleHtml = marketQuoteHtml({
      id: IRON, name: 'Iron Ore', buy: 20, sell: 18, avg: 14,
      hist: [{ t: 1980, mid: 18, origin: 'observed' }],
      quoteAge: 'fresh', quoteSource: 'live', survey,
    });
    assert.match(staleHtml, /data-quote-age="fresh"[^>]*>fresh quote</);
    assert.match(staleHtml, /data-survey-age="stale"[^>]*>stale survey</);
    assert.notEqual(
      staleHtml.includes('fresh quote'),
      false,
    );
    state.player.marketMemory.station_ceres[IRON].seenAt = state.simTime;
    const freshSurvey = rememberedSurveyFreshness(state, IRON);
    assert.equal(freshSurvey.text, 'fresh survey');
    assert.notEqual(freshSurvey.text, 'fresh quote');
    sim.dispose();
  } finally {
    release();
  }
});

test('a modelled past and an observed sample are different marks', () => {
  const { sim, econ, state } = boot(HELD_OUT[0]);
  try {
    const entry = state.economy.markets.station_ceres[IRON];
    assert.ok(entry.history.length > 2);
    assert.ok(entry.history.every((point) => point.origin === 'modelled'), 'a fresh listing backfills a modelled past');
    const before = state.simTime;
    advance(state, econ, 20);
    assert.ok(state.simTime > before);
    const observed = entry.history.filter((point) => point.origin === 'observed');
    const modelled = entry.history.filter((point) => point.origin === 'modelled');
    assert.ok(observed.length >= 1, 'a later tick is observed');
    assert.ok(modelled.length >= 1, 'the backfill remains modelled');
    const forecast = predictPriceCurve(state, 'station_ceres', IRON);
    const html = marketQuoteHtml({
      id: IRON, name: 'Iron Ore', buy: entry.lastBuy, sell: entry.lastSell, avg: 14,
      hist: entry.history, forecast, now: state.simTime,
      quoteAge: 'fresh', quoteSource: 'live',
    });
    assert.match(html, /data-modelled[^>]*>Modelled past</);
    assert.match(html, /data-observed[^>]*>Observed</);
    assert.match(html, /data-history-origin="mixed"/);
    assert.match(html, /data-forecast-band/);
    assert.match(html, new RegExp(`data-stated-rate="${forecast.statedRate}"`));
    assert.match(html, />Forecast</);
    const lo = html.match(/data-forecast-lo="([^"]*)"/);
    const hi = html.match(/data-forecast-hi="([^"]*)"/);
    assert.ok(lo && hi && lo[1] !== hi[1], 'the cone is a band, not a line filled to the floor');
    sim.dispose();
  } finally {
    release();
  }
});

test('the contemplated sale is the whole quote after slippage, net of travel and operating cost', () => {
  const { sim, econ, state } = boot(HELD_OUT[1]);
  try {
    const entry = state.economy.markets.station_helios[IRON];
    const qty = 20;
    const batch = econ.quote('station_helios', IRON, 'sell', qty);
    const one = econ.quote('station_helios', IRON, 'sell', 1);
    assert.ok(batch.ok && one.ok);
    assert.notEqual(Math.round(batch.total), Math.round(one.total * qty), 'slippage moves the batch off unit times quantity');
    const travel = 40;
    const operating = 15;
    const html = marketQuoteHtml({
      id: IRON, name: 'Iron Ore', mode: 'sell', sell: entry.lastSell,
      saleQty: qty,
      saleQuote: { ...batch, travelCost: travel, operatingCost: operating },
    });
    const attr = (name) => Number(html.match(new RegExp(`${name}="([^"]*)"`))[1]);
    assert.equal(attr('data-sale-gross'), Math.round(batch.total));
    assert.equal(attr('data-sale-travel'), travel);
    assert.equal(attr('data-sale-operating'), operating);
    assert.equal(attr('data-sale-net'), Math.round(batch.total) - travel - operating);
    assert.equal(attr('data-sale-credits'), attr('data-sale-net'));
    assert.match(html, /after slippage/);
    assert.match(html, /travel/);
    assert.match(html, /operating/);
    const screen = readFileSync(join(ROOT, 'src/ui/station/screens/market.js'), 'utf8');
    assert.match(screen, /quoteSource: 'live'/);
    assert.match(screen, /rememberedSurveyFreshness\(state, r\.id\)/);
    assert.match(screen, /travelCost: 0, operatingCost: 0/);
    assert.match(screen, /point\.origin === 'modelled' \|\| point\.origin === 'observed'/);
    assert.match(screen, /economy\.quote\(sid,/);
    sim.dispose();
  } finally {
    release();
  }
});

const def = COMMODITIES.find((row) => row.id === IRON);
assert.ok(def, 'iron ore exists');
