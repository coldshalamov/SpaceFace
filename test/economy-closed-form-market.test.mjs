// ECON-BUILD-1 — closed-form market model unit suite.
//
// Run: node --test test/economy-closed-form-market.test.mjs
//
// Proves the packet's unit contract against the live seams:
//   - P(good, station, t) is deterministic for a seed and agrees with itself
//     evaluated now or after an hour away.
//   - Each regime's curve has its named shape; an event window moves the price
//     and flips the regime it leaves behind.
//   - A dent recovers on the good's half-life and the total deviation caps.
//   - A never-visited station prices without creating market state.
//   - Best-trade search uses remembered prices with ages, never the live book.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { SECTORS } from '../src/data/sectors.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { economy } from '../src/systems/economy.js';
import { bestKnownSellFor } from '../src/ui/market/tradeLogic.js';
import {
  marketContextFor, marketMidAt, marketAvgMidAt, marketHistoryFor,
  marketForecastFor, marketRegimeStateFor, governingRegime, regimeFactorAt, regimeCurveAt,
  scheduledEventForEpoch, eventsAffecting, appendDent, sectorEventContext,
  shelfUnitsAt, dentDeviationAt, dentHalfLifeS, listingDefFor, marketRowsFor,
  DENT_DEV_LO, DENT_DEV_HI, DENT_CAP, REGIME_CELL_S, EVENT_CELL_S,
} from '../src/economy/marketModel.js';

const SEED = 0x5face;
const HOME_SECTOR = 'sector_helios_prime';
const STATION = 'station_helios';

function installWorld(state, currentSectorId = HOME_SECTOR) {
  state.world.currentSectorId = currentSectorId;
  state.world.sectors = Object.fromEntries(SECTORS.map((s) => [s.id, s]));
}

function bootEconomy(seed = SEED) {
  const sim = createSimulation({ seed, systems: [economy] });
  const state = sim.state;
  installWorld(state);
  state.mode = 'flight';
  state.player.credits = 250_000;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 50_000, capMass: 50_000 };
  state.player.stats = state.player.stats || {};
  return { sim, state, econ: sim.registry.get('economy') };
}

function guarded(fn) {
  const r = Math.random;
  const n = Date.now;
  Math.random = () => { throw new Error('Math.random in closed-form market path'); };
  Date.now = () => { throw new Error('Date.now in closed-form market path'); };
  try { return fn(); } finally { Math.random = r; Date.now = n; }
}

// ── determinism ────────────────────────────────────────────────────────────────

test('P is deterministic: same ctx and t give the same mid twice, across instances', () => guarded(() => {
  const { state } = bootEconomy();
  const ctx = marketContextFor(state, STATION, 'cmdty_ore_iron', null);
  assert.ok(ctx, 'stateless ctx resolves');
  for (const t of [0, 60, 900, 3600, 40000]) {
    assert.equal(marketMidAt(ctx, t), marketMidAt(ctx, t), `mid stable at t=${t}`);
  }
  const { state: state2 } = bootEconomy(SEED);
  const ctx2 = marketContextFor(state2, STATION, 'cmdty_ore_iron', null);
  for (const t of [0, 900, 40000]) {
    assert.equal(marketMidAt(ctx2, t), marketMidAt(ctx, t), `mid identical across sims at t=${t}`);
  }
}));

test('an hour away changes nothing about the function — eval now or later agrees', () => guarded(() => {
  const { state } = bootEconomy();
  const ctx = marketContextFor(state, STATION, 'cmdty_fuel_cells', null);
  const future = marketMidAt(ctx, 3600);
  state.simTime = 3600;
  const ctxLater = marketContextFor(state, STATION, 'cmdty_fuel_cells', null);
  assert.equal(marketMidAt(ctxLater, state.simTime), future,
    'the mid evaluated ahead of time equals the mid evaluated at that time');
}));

// ── regimes ────────────────────────────────────────────────────────────────────

test('the six regimes each produce their named curve family', () => guarded(() => {
  // Find a real (station, good) run of each kind inside a day of cells.
  const seen = new Map();
  outer:
  for (const good of COMMODITIES.slice(0, 24)) {
    for (let epoch = 0; epoch < 48; epoch++) {
      const run = governingRegime(SEED, STATION, good.id, epoch * REGIME_CELL_S + 1);
      if (!seen.has(run.kind)) seen.set(run.kind, { good, epoch, run });
      if (seen.size === 6) break outer;
    }
  }
  for (const kind of ['steady', 'climb', 'slide', 'swing', 'squeeze', 'glut']) {
    assert.ok(seen.has(kind), `a real run of '${kind}' exists in the sample window`);
  }
  for (const [kind, { good, epoch, run }] of seen) {
    const ts = [0.1, 0.4, 0.9].map((u) => run.startT + u * run.duration);
    const vals = ts.map((t) => regimeCurveAt(run, t));
    switch (kind) {
      case 'steady':
        assert.ok(vals.every((v) => Math.abs(v - 1) <= 0.05), 'steady wobbles within ±5%');
        break;
      case 'climb':
        assert.ok(vals[2] > vals[0], 'climb ends above its start');
        break;
      case 'slide':
        assert.ok(vals[2] < vals[0], 'slide ends below its start');
        break;
      case 'swing': {
        // A multi-cycle sine must cross its own midline inside the run.
        const grid = [];
        for (let i = 0; i <= 40; i++) {
          grid.push(regimeCurveAt(run, run.startT + (i / 40) * run.duration));
        }
        const lo = Math.min(...grid), hi = Math.max(...grid);
        assert.ok(hi - lo > 0.05, 'swing visibly oscillates inside the run');
        break;
      }
      case 'squeeze':
        assert.ok(vals[2] > vals[1] && vals[1] >= vals[0] - 1e-9, 'squeeze accelerates upward');
        break;
      case 'glut':
        assert.ok(vals[2] < vals[0], 'glut decays to a floor');
        break;
    }
    void good; void epoch;
  }
}));

test('regime epochs are seeded, not rolled — no shared RNG, no state', () => guarded(() => {
  const a = governingRegime(SEED, STATION, 'cmdty_food', 5400);
  const b = governingRegime(SEED, STATION, 'cmdty_food', 5400);
  assert.deepEqual(a, b, 'same epoch resolves the same run');
  const c = governingRegime(SEED + 1, STATION, 'cmdty_food', 5400);
  assert.notDeepEqual({ kind: c.kind, params: c.params }, { kind: a.kind, params: a.params },
    'a different world seed draws a different run');
}));

// ── events ─────────────────────────────────────────────────────────────────────

test('a scheduled event window multiplies the price while live and ends cleanly', () => guarded(() => {
  const { state } = bootEconomy();
  // Find a real scheduled event in the first week of cells — drawn with the same
  // sector extras the production ctx passes, so type and goods match the price path.
  const stations = SECTORS.find((s) => s.id === HOME_SECTOR).stations.map((s) => s.id);
  const goods = COMMODITIES.map((c) => c.id);
  const extras = sectorEventContext(state, HOME_SECTOR);
  let ev = null;
  for (let j = 0; j < 2000 && !ev; j++) {
    const cand = scheduledEventForEpoch(SEED, HOME_SECTOR, j, stations, goods, extras);
    if (cand && cand.stationId && cand.goods.length) ev = cand;
  }
  assert.ok(ev, 'the seeded calendar produces an event');
  const good = ev.goods[0];
  const before = marketMidAt(marketContextFor(state, ev.stationId, good, null), ev.tStart - 1);
  const during = marketMidAt(marketContextFor(state, ev.stationId, good, null), ev.tStart + 1);
  const after = marketMidAt(marketContextFor(state, ev.stationId, good, null),
    ev.tEnd + 4 * REGIME_CELL_S);
  const evMid = eventsAffecting(SEED, HOME_SECTOR, ev.stationId, good, ev.tStart + 1,
    [], stations, goods, extras);
  assert.ok(evMid.active.length === 1 && evMid.levelMult > 1 - 1e-9, 'event is live inside its window');
  if (evMid.levelMult > 1.01) {
    assert.ok(during >= before * 1.01, 'the event lifts the mid while live');
  } else {
    assert.ok(during <= before * 0.99, 'a glut-class event drops the mid while live');
  }
  const quiet = eventsAffecting(SEED, HOME_SECTOR, ev.stationId, good, ev.tEnd + 4 * REGIME_CELL_S,
    [], stations, goods, extras);
  assert.equal(quiet.active.length, 0, 'event is gone after its window');
  assert.ok(after > 0, 'price still resolves after the event ends');
}));

test('an injected event row moves the same listing through the same funnel', () => guarded(() => {
  const { state } = bootEconomy();
  const cid = 'cmdty_ore_iron';
  const t0 = 100;
  const ctxQuiet = marketContextFor(state, STATION, cid, null);
  const quietMid = marketMidAt(ctxQuiet, t0);
  state.economy.econEvents.push({
    id: 'test_evt', type: 'blockade', cause: 'blockade', stationId: STATION,
    sectorId: HOME_SECTOR, goods: [cid], tStart: t0 - 10, tEnd: t0 + 600,
    levelMult: 1.5, spreadMult: 1.4,
  });
  const ctxHot = marketContextFor(state, STATION, cid, null);
  const hotMid = marketMidAt(ctxHot, t0);
  assert.ok(hotMid > quietMid * 1.2, 'injected blockade lifts the mid');
  const state3 = marketRegimeStateFor(state, STATION, cid, t0);
  assert.equal(state3.eventActive, true, 'regime state flags the live event');
}));

test('an ended event leaves its named aftermath regime', () => guarded(() => {
  const { state } = bootEconomy();
  const cid = 'cmdty_ore_iron';
  const t0 = 100;
  state.economy.econEvents.push({
    id: 'test_evt_end', type: 'blockade', cause: 'blockade', stationId: STATION,
    sectorId: HOME_SECTOR, goods: [cid], tStart: t0 - 700, tEnd: t0 - 10,
    levelMult: 1.5, spreadMult: 1.4, regime: 'squeeze',
  });
  const info = eventsAffecting(SEED, HOME_SECTOR, STATION, cid, t0,
    state.economy.econEvents, [STATION], [cid]);
  assert.ok(info.imposed, 'ended event imposes an aftermath run');
  assert.equal(info.imposed.kind, 'squeeze', 'blockade aftermath is the squeeze regime');
}));

// ── dents ──────────────────────────────────────────────────────────────────────

test('a dent moves the shelf and price, then both heal on the half-life', () => guarded(() => {
  const { state } = bootEconomy();
  const cid = 'cmdty_ore_iron';
  const entry = { eq: 40, dents: [] };
  const t0 = 500;
  appendDent(entry, cid, t0, -20); // a player buy strips 20 units
  const shelfAfter = shelfUnitsAt(entry, cid, t0);
  assert.ok(shelfAfter < 21, `shelf stripped (got ${shelfAfter})`);
  const devAfter = dentDeviationAt(entry, cid, 0.5, t0);
  assert.ok(devAfter > 1, 'stripped shelf lifts the deviation');
  const half = dentHalfLifeS(cid);
  const healed = shelfUnitsAt(entry, cid, t0 + half);
  assert.ok(Math.abs(healed - 30) < 1.5, `one half-life returns half the dent (got ${healed})`);
  const gone = shelfUnitsAt(entry, cid, t0 + half * 6);
  assert.ok(Math.abs(gone - 40) < 2, 'six half-lives heal the dent away');
}));

test('the dent deviation is capped and the dent list stays bounded', () => guarded(() => {
  const { state } = bootEconomy();
  const cid = 'cmdty_food';
  const entry = { eq: 30, dents: [] };
  for (let i = 0; i < 30; i++) appendDent(entry, cid, i * 10, -100);
  assert.ok(entry.dents.length <= DENT_CAP, `dent list capped at ${DENT_CAP}`);
  const dev = dentDeviationAt(entry, cid, 0.5, 300);
  assert.ok(dev <= DENT_DEV_HI && dev >= DENT_DEV_LO, 'deviation bounded inside the band');
  assert.equal(shelfUnitsAt(entry, cid, 300), 0, 'shelf cannot go negative');
}));

// ── stateless pricing ──────────────────────────────────────────────────────────

test('a never-visited station quotes without minting market rows', () => guarded(() => {
  const { state, econ } = bootEconomy();
  const remote = 'station_ceres';
  const cid = 'cmdty_ore_iron';
  delete state.economy.markets[remote];
  const quote = econ.quote(remote, cid, 'buy', 5);
  assert.ok(quote.ok, `stateless station quotes (got ${quote.reason || 'ok'})`);
  assert.ok(quote.unitAvg > 0, 'quote has a price');
  assert.equal(state.economy.markets[remote], undefined, 'the read created no market row');
  const rows = marketRowsFor(state, remote);
  assert.ok(rows[cid] && rows[cid].transient === true, 'the listing book is transient');
}));

test('settlement materializes exactly the one row its dent must live on', () => guarded(() => {
  const { state, econ } = bootEconomy();
  const remote = 'station_ceres';
  const cid = 'cmdty_ore_iron';
  delete state.economy.markets[remote];
  state.player.credits = 1_000_000;
  const res = econ.execute(remote, cid, 'buy', 2);
  assert.equal(res.ok, true, `buy settles (got ${res.reason || 'ok'})`);
  const market = state.economy.markets[remote];
  assert.ok(market, 'settlement created the market shell');
  assert.equal(Object.keys(market).length, 1, 'only the traded listing materialized');
  assert.ok(market[cid].dents.length === 1 && market[cid].dents[0].q < 0, 'the dent persists the trade');
}));

// ── remembered prices drive route search ───────────────────────────────────────

test('best-trade search reads remembered prices with ages, never the live book', () => guarded(() => {
  const { sim, state, econ } = bootEconomy();
  const cid = 'cmdty_ore_iron';
  // Visit helios and ceres; never visit forge.
  econ.ensureMarket('station_helios');
  econ.ensureMarket('station_ceres');
  econ.ensureMarket('station_forge');
  state.simTime = 10;
  sim.bus.emit('dock:docked', { stationId: 'station_helios' });
  state.simTime = 20;
  sim.bus.emit('dock:docked', { stationId: 'station_ceres' });
  const mem = state.player.marketMemory;
  assert.ok(mem.station_helios && mem.station_ceres, 'visits record memory');
  assert.equal(mem.station_forge, undefined, 'unvisited station stays unknown');
  const best = bestKnownSellFor(state, cid, 'station_helios');
  assert.ok(best, 'a best-known sell exists');
  assert.equal(best.sell, Math.max(mem.station_helios[cid].sell, mem.station_ceres[cid].sell),
    'best-known equals the best REMEMBERED sell');
  assert.notEqual(best.stationId, 'station_forge', 'forge never enters remembered search');
  assert.ok(Number.isFinite(mem[best.stationId][cid].seenAt), 'the remembered price carries an age');
}));

// ── history + forecast read the same formula ───────────────────────────────────

test('history and forecast evaluate the same closed form', () => guarded(() => {
  const { state } = bootEconomy();
  state.simTime = 1200;
  const cid = 'cmdty_fuel_cells';
  const ctx = marketContextFor(state, STATION, cid, null);
  const hist = marketHistoryFor(state, STATION, cid);
  const fc = marketForecastFor(state, STATION, cid, 6, 30);
  assert.equal(hist.at(-1).mid, Math.max(1, Math.round(marketMidAt(ctx, 1200))),
    'history ends at the live mid');
  assert.equal(fc[0].mid, Math.max(1, Math.round(marketMidAt(ctx, 1230))),
    'forecast begins at the formula ahead');
  assert.equal(fc.length, 6, 'forecast returns exactly the requested steps');
}));
