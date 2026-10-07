// Row 279 LG-FORECAST-PROOF — the market forecast cone is falsifiable (M4).
//
// Three claims the row makes: each cone stores the band it quotes and the sim event ids
// that moved the price; the market screen prints one line tracing the last move to its
// cause; and on seed 4242 a reader of the cone out-earns a non-reader by >= 30 % over a
// seeded hour while every ticker line names its event.
// Fixed seed 4242: markets, cycles and the spontaneous event stream are deterministic.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { hash32 } from '../src/core/rng.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { SECTORS } from '../src/data/sectors.js';
import { economy } from '../src/systems/economy.js';
import { predictPriceCurve } from '../src/systems/economyCycles.js';
import { lastMoveCause } from '../src/ui/marketDriverPresenter.js';
import { createMarketNews, generateHeadline, tickerEventRef } from '../src/ui/marketNews.js';
import { marketQuoteHtml } from '../src/ui/views/marketPresentation.js';

const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const SEED_NOTE = 'seed 4242: deterministic markets, cycles and event stream';

function boot(seed = 4242) {
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

test('the cone stores the band it quotes and the event ids that moved the price (' + SEED_NOTE + ')', () => {
  const { econ, state } = boot();
  try {
    const [sid, cid] = listings(state)[0];
    const curve = predictPriceCurve(state, sid, cid);
    assert.ok(Array.isArray(curve) && curve.length > 0, 'cone produced steps');
    const last = curve.at(-1);
    assert.deepEqual(curve.band, { lo: last.lo, hi: last.hi, t: last.t, statedRate: curve.statedRate },
      'band stores the quoted horizon envelope');
    assert.ok(Array.isArray(curve.eventIds), 'eventIds attached');
    const onListing = new Set((state.economy.markets[sid][cid].eventMods || []).map((m) => m.eventId));
    for (const id of curve.eventIds) assert.ok(onListing.has(id), `cone event id ${id} is on the listing`);

    const ev = econ.injectEvent({ type: 'shortage', stationId: sid, commodityId: cid, duration: 900 });
    const moved = predictPriceCurve(state, sid, cid);
    assert.ok(moved.eventIds.includes(ev.id), 'the cone names the event that just moved it');
    for (const id of moved.eventIds) assert.match(id, /^evt_/, 'event ids are the sim event ids');

    // Empty cone keeps the same named-prop shape as a live one.
    const empty = predictPriceCurve(state, sid, 'cmdty_not_a_commodity');
    assert.equal(empty.length, 0);
    assert.equal(empty.band, null);
    assert.deepEqual([...empty.eventIds], []);
  } finally { release(); }
});

test('the market screen prints one line tracing the last move to its cause (' + SEED_NOTE + ')', () => {
  const { econ, state } = boot();
  try {
    const [sid, cid] = listings(state)[0];
    const entry = state.economy.markets[sid][cid];
    const def = CMDTY_BY_ID.get(cid);

    // No event: the formula regime is the honest mover.
    const regimeCause = lastMoveCause({ state, stationId: sid, commodity: def, entry });
    assert.ok(regimeCause.text.startsWith('Last move: '), 'always one line');
    assert.equal(regimeCause.eventId, null);

    const ev = econ.injectEvent({ type: 'shortage', stationId: sid, commodityId: cid, duration: 900 });
    const cause = lastMoveCause({ state, stationId: sid, commodity: def, entry });
    assert.equal(cause.eventId, ev.id, 'the line traces the newest moving event');
    assert.equal(
      cause.text,
      `Last move: ${generateHeadline(
        { type: ev.type, stationId: sid, commodityId: cid, eventId: ev.id },
        { seed: hash32(state.meta.seed) >>> 0 },
      )}`,
      'the cause line speaks the same words the ticker does',
    );

    // A market-wide '*' event must not be re-attributed to the viewed listing — the line
    // names "the market" in the identical words the ticker would.
    const evStar = econ.injectEvent({ type: 'boom', stationId: sid, commodityId: '*', duration: 900 });
    const starCause = lastMoveCause({ state, stationId: sid, commodity: def, entry });
    assert.equal(starCause.eventId, evStar.id);
    assert.equal(
      starCause.text,
      `Last move: ${generateHeadline(
        { type: evStar.type, stationId: sid, commodityId: '*', eventId: evStar.id },
        { seed: hash32(state.meta.seed) >>> 0 },
      )}`,
      'a station-wide event keeps its market-wide wording',
    );

    // The default-route screen must actually call the read model — pin the wiring by source.
    const screenSrc = readFileSync(
      new URL('../src/ui/station/screens/market.js', import.meta.url), 'utf8',
    );
    assert.match(
      screenSrc,
      /lastMoveCause\(\{ state, stationId: sid/,
      'the market screen computes the cause line for the viewed listing',
    );

    const html = marketQuoteHtml({
      id: cid, name: def.name, category: def.category, legal: def.legality || 'legal',
      mode: 'buy', buy: 10, sell: 8, avg: def.basePrice, driversSummary: 'test',
      drivers: [], hist: [{ t: 0, mid: 9 }, { t: 1, mid: 10 }], forecast: [],
      now: 1, cause,
    });
    assert.match(html, /sx-mkt-cause/, 'the screen renders the cause line');
    assert.match(html, /data-cause-event="evt_\d+"/, 'the line carries the sim event id');
    assert.ok(html.includes('Last move:'), 'the player reads the trace');
  } finally { release(); }
});

test('a reader of the cone out-earns a non-reader by at least 30 % over a seeded hour (' + SEED_NOTE + ')', () => {
  const { econ, state } = boot();
  try {
    advance(state, econ, 300); // markets settle; cycles differentiate
    const t0 = state.simTime;
    const HOUR = 3600, STEP = 120, MIN_SWING = 0.15, QTY = 50;
    // Reader protocol: read every cone once at the top of the hour and trade only the
    // listings whose predicted trough -> peak mid swing is worth reading (>= 15 %),
    // entering at the cone's predicted trough tick and exiting at its predicted peak.
    // Abstention and timing are both information the cone carries.
    const plans = [];
    for (const [sid, cid] of listings(state)) {
      const curve = predictPriceCurve(state, sid, cid, HOUR / STEP, STEP);
      if (curve.length < 2) continue;
      let loIdx = 0, hiIdx = 0;
      for (let i = 0; i < curve.length; i++) {
        if (curve[i].mid < curve[loIdx].mid) loIdx = i;
      }
      hiIdx = loIdx;
      for (let i = loIdx + 1; i < curve.length; i++) {
        if (curve[i].mid > curve[hiIdx].mid) hiIdx = i;
      }
      const swing = curve[loIdx].mid > 0
        ? (curve[hiIdx].mid - curve[loIdx].mid) / curve[loIdx].mid
        : 0;
      if (hiIdx > loIdx && swing >= MIN_SWING) plans.push({ sid, cid, loIdx, hiIdx });
    }
    assert.ok(plans.length > 0, 'the seeded hour offered readable swings');

    // Non-reader protocol: the identical trades — same listings, same quantity — but
    // never opening the cone: buy at the top of the hour, sell at the end. Holding the
    // basket constant isolates exactly what the forecast contributes.
    const key = (p) => p.sid + '|' + p.cid;
    const tape = new Map(plans.map((p) => [key(p), []]));
    for (let tick = 0; tick <= HOUR / STEP; tick++) {
      for (const p of plans) {
        const e = state.economy.markets[p.sid][p.cid];
        tape.get(key(p)).push({ buy: e.lastBuy, sell: e.lastSell });
      }
      if (tick < HOUR / STEP) advance(state, econ, STEP);
    }

    let readerNet = 0, naiveNet = 0, wins = 0;
    for (const p of plans) {
      const tp = tape.get(key(p));
      // Cone point i sits at t0 + (i+1)*STEP, so predicted index i maps to tape tick i+1.
      const reader = tp[Math.min(p.hiIdx + 1, tp.length - 1)].sell
        - tp[Math.min(p.loIdx + 1, tp.length - 1)].buy;
      const naive = tp[tp.length - 1].sell - tp[0].buy;
      readerNet += reader * QTY;
      naiveNet += naive * QTY;
      if (reader > 0) wins++;
    }
    // "Out-earns by >= 30 %": when the blind basket profits, the reader must take at least
    // 1.3x; when it loses, the reader must bank at least 30 % of what the blind hour
    // forfeited — a bound that still bites, not a ratio that any positive number satisfies.
    const edge = naiveNet !== 0
      ? (readerNet - naiveNet) / Math.abs(naiveNet)
      : (readerNet > 0 ? Infinity : 0);
    const outEarnsByThirty = naiveNet > 0
      ? readerNet >= naiveNet * 1.3
      : readerNet >= Math.abs(naiveNet) * 0.30;
    assert.ok(readerNet > 0,
      `reader earned: ${readerNet} cr over ${plans.length} trades (${wins} wins)`);
    assert.ok(outEarnsByThirty,
      `reader out-earns non-reader by >= 30 %: reader ${readerNet} cr vs non-reader ${naiveNet} cr `
      + `across ${plans.length} identical trades (edge ${(edge * 100).toFixed(1)} %)`);
  } finally { release(); }
});

test('every ticker line names its event (' + SEED_NOTE + ')', () => {
  const { sim, econ, state } = boot();
  try {
    const news = createMarketNews({ state, bus: sim.bus, helpers: {} });
    const [sid, cid] = listings(state)[0];
    const events = [
      econ.injectEvent({ type: 'shortage', stationId: sid, commodityId: cid, duration: 600 }),
      econ.injectEvent({ type: 'boom', stationId: sid, commodityId: '*', duration: 300 }),
    ];
    advance(state, econ, 10);
    const log = state.ui.marketNews.log;
    assert.ok(log.length >= events.filter(Boolean).length, 'the seeded run produced ticker lines');
    const liveIds = new Set((state.economy.econEvents || []).map((e) => e.id));
    for (const rec of log) {
      const ref = tickerEventRef(rec);
      assert.ok(ref, `line "${String(rec.text).slice(0, 60)}" traces to an event`);
      assert.ok(rec.text && rec.text.trim().length > 0, 'the line is text, not an id');
      if (ref.source === 'economy:eventStarted') {
        assert.ok(liveIds.has(ref.eventId),
          `economy line names a live sim event id: ${ref.eventId}`);
      }
    }
    for (const ev of events) {
      if (!ev) continue;
      assert.ok(
        log.some((rec) => ((tickerEventRef(rec) || {}).eventId) === ev.id),
        `event ${ev.id} got its named ticker line`,
      );
    }
    if (news && typeof news.destroy === 'function') news.destroy();
  } finally { release(); }
});
