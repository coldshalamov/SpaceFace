// Pure deterministic market model (ECON-BUILD-1). No shared RNG, no writes,
// no wall time. A market price is a closed form of (seed, station, good, t):
//
//   mid(t) = basePrice
//            · restLevel      — role bias: producers rest cheap, consumers dear
//            · dentDeviation  — the player's own trades, ±15%, healing on the
//                              good's recovery half-life
//            · regimeFactor   — six named seeded regimes on a 30-min epoch grid
//            · eventLevel     — seeded regional events + world-caused rows
//            · demandMult     — persistent sector context (unchanged system)
//   buy = mid·(1+spread/2), sell = mid·(1−spread/2); spread carries event
//   spread multipliers and the frontier penalty, as before.
//
// Nothing here ticks: regimes, events, shelves and charts all evaluate at the
// moment a surface asks for them.
import { hash32 } from '../core/rng.js';
import { COMMODITIES } from '../data/commodities.js';
import { ECONOMY_BALANCE as BALANCE } from '../data/economyDerived.js';
import { SECTORS } from '../data/sectors.js';
import { averageBoundedPrice } from './economyMath.js';
import { stationInfo, toleratesContraband } from './stationMarketProfile.js';
import { pressureRecipesForRegion } from './regionalSupply.js';

const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;

export const PRICE_BAND_LO = 0.35;   // final mid clamp vs basePrice
export const PRICE_BAND_HI = 2.80;

// ── deterministic sub-draws ────────────────────────────────────────────────────
// One hash per (kind, epoch) — salt-split into independent uniform floats so no
// shared stream is ever consumed and evaluation order never matters.
function sub01(h, salt) {
  let x = (h ^ Math.imul(salt | 0, 0x9E3779B1)) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7FEB352D) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x846CA68B) >>> 0;
  x ^= x >>> 16;
  // `^=` lands a signed int32 — re-unsigned before the divide or half of every
  // sub-draw comes back negative and pick()/range() corrupt the model.
  return (x >>> 0) / 4294967296;
}
const range = (h, salt, lo, hi) => lo + sub01(h, salt) * (hi - lo);
const pick = (h, salt, n) => Math.min(n - 1, Math.floor(sub01(h, salt) * n));

// ── regimes ────────────────────────────────────────────────────────────────────
export const REGIME_KINDS = Object.freeze(['steady', 'climb', 'slide', 'swing', 'squeeze', 'glut']);
export const REGIME_LABELS = Object.freeze({
  steady: 'Steady', climb: 'Climbing', slide: 'Sliding',
  swing: 'Swing', squeeze: 'Squeeze', glut: 'Glut',
});
export function regimeLabel(kind) { return REGIME_LABELS[kind] || 'Steady'; }

export const REGIME_CELL_S = 1800;          // 30 min epoch grid
const REGIME_MAX_HOLD = 3;                  // a run may span at most 3 cells (90 min)
const BLEND_LO_S = 120, BLEND_HI_S = 300;   // short crossfade when regimes change

const REGIME_WEIGHTS = Object.freeze([      // sums to 100
  ['steady', 26], ['climb', 15], ['slide', 15], ['swing', 18], ['squeeze', 13], ['glut', 13],
]);
const HOLD_CELLS = Object.freeze({          // regime length in epoch cells
  steady: [2, 3], climb: [1, 3], slide: [1, 3],
  swing: [2, 3], squeeze: [1, 2], glut: [1, 2],
});

/** Curve parameters for one regime kind, drawn from a single hash. */
function paramsForKind(h, kind) {
  const params = {};
  switch (kind) {
    case 'steady':
      params.amp = range(h, 3, 0.010, 0.030);
      params.cycles = 2 + pick(h, 4, 3);
      params.phase = range(h, 5, 0, TAU);
      break;
    case 'climb': params.r = range(h, 3, 0.15, 0.45); break;
    case 'slide': params.r = range(h, 3, 0.10, 0.35); break;
    case 'swing':
      params.A = range(h, 3, 0.08, 0.25);
      params.k = 1 + pick(h, 4, 3);
      params.phase = range(h, 5, 0, TAU);
      break;
    case 'squeeze': params.A = range(h, 3, 0.20, 0.80); break;
    case 'glut': params.A = range(h, 3, 0.15, 0.50); break;
  }
  return params;
}

/** The run a cell would start if it owned the epoch — parameters all from one hash. */
function runFor(seed, stationId, goodId, epoch) {
  const h = hash32(seed, 'regime', stationId, goodId, epoch);
  const r = sub01(h, 1);
  let kind = 'steady', acc = 0;
  for (const [k, w] of REGIME_WEIGHTS) { acc += w / 100; if (r < acc) { kind = k; break; } }
  const [loHold, hiHold] = HOLD_CELLS[kind];
  const hold = loHold + pick(h, 2, hiHold - loHold + 1);
  const params = paramsForKind(h, kind);
  const startT = epoch * REGIME_CELL_S;
  return {
    kind, label: regimeLabel(kind), epoch, startT,
    duration: hold * REGIME_CELL_S, hold, params,
    blendS: range(h, 6, BLEND_LO_S, BLEND_HI_S),
  };
}

/** The run that owns time t: the latest-starting live run covering t's cell. */
export function governingRegime(seed, stationId, goodId, t) {
  const now = Number.isFinite(Number(t)) ? Number(t) : 0;
  const n = Math.floor(now / REGIME_CELL_S);
  for (let k = n - 1; k >= n - (REGIME_MAX_HOLD - 1); k--) {
    if (k < 0) break;
    const run = runFor(seed, stationId, goodId, k);
    if (k + run.hold > n) return run;
  }
  return runFor(seed, stationId, goodId, n);
}

/** Raw regime curve value at t; u clamps at 1 for one-shot families, wraps for periodic.
 *  Exported for the shape contract tests — regimeFactorAt is the production evaluator. */
export function regimeCurveAt(run, t) {
  const p = run.params;
  const u = clamp(((Number(t) || 0) - run.startT) / Math.max(1, run.duration), 0, 1);
  switch (run.kind) {
    case 'steady': return 1 + p.amp * Math.sin(TAU * p.cycles * u + p.phase);
    case 'climb': return 1 + p.r * u;
    case 'slide': return 1 - p.r * u;
    case 'swing': return 1 + p.A * Math.sin(TAU * p.k * u + p.phase);
    case 'squeeze': return 1 + p.A * u * u;
    case 'glut': return 1 - p.A * (1 - Math.exp(-3 * u));
  }
  return 1;
}

export const REGIME_FACTOR_LO = 0.55, REGIME_FACTOR_HI = 1.90;

/**
 * Regime multiplier at t. An imposed run (event aftermath) fades in over its
 * blend window, holds, then fades back out to the cell model; a fresh cell run
 * crossfades from the run it replaced. Both fades keep the curve continuous.
 */
export function regimeFactorAt(seed, stationId, goodId, t, imposed = null) {
  const run = governingRegime(seed, stationId, goodId, t);
  let cell = regimeCurveAt(run, t);
  const sinceStart = (Number(t) || 0) - run.startT;
  if (run.epoch === Math.floor((Number(t) || 0) / REGIME_CELL_S)
    && sinceStart < run.blendS && run.startT > 0) {
    const prev = governingRegime(seed, stationId, goodId, run.startT - 1);
    if (prev !== run) {
      cell = lerp(regimeCurveAt(prev, t), cell, sinceStart / run.blendS);
    }
  }
  if (imposed && Number(t) >= imposed.startT && Number(t) < imposed.startT + imposed.duration) {
    const f = regimeCurveAt(imposed, t);
    const wIn = clamp((t - imposed.startT) / Math.max(1, imposed.blendS), 0, 1);
    const wOut = clamp((imposed.startT + imposed.duration - t) / Math.max(1, imposed.blendS), 0, 1);
    const blended = lerp(cell, f, Math.min(wIn, wOut));
    return clamp(Number.isFinite(blended) ? blended : 1, REGIME_FACTOR_LO, REGIME_FACTOR_HI);
  }
  return clamp(Number.isFinite(cell) ? cell : 1, REGIME_FACTOR_LO, REGIME_FACTOR_HI);
}

/** Build an imposed (event-aftermath) regime run for an ended event. */
export function imposedRunForEvent(ev) {
  if (!ev || !ev.regime || !Number.isFinite(ev.tEnd)) return null;
  const h = hash32(ev.id || 'evt', 'imposed', ev.stationId, ev.goods && ev.goods[0]);
  const hold = 1 + pick(h, 1, 2);                  // 30–60 min aftermath
  const kind = REGIME_KINDS.includes(ev.regime) ? ev.regime : 'steady';
  const run = runFor(hash32(ev.id, 'imposed-seed'), ev.stationId, (ev.goods && ev.goods[0]) || 'x', 0);
  return {
    ...run,
    kind, label: regimeLabel(kind),
    // Params must match the imposed kind — the seeded draw's set is for a
    // different curve family and leaves required keys undefined (NaN factor).
    params: paramsForKind(h, kind),
    startT: ev.tEnd,
    duration: hold * REGIME_CELL_S,
    blendS: run.blendS,
  };
}

// ── events ─────────────────────────────────────────────────────────────────────
export const ECONOMY_EVENT_TYPES = Object.freeze([
  'shortage', 'boom', 'blockade', 'piracy', 'piracy_spike',
  'convoy_lost', 'strike', 'new_mine', 'war_front',
]);

export const EVENT_CELL_S = 480;            // ~8 min regional epoch grid
const EVENT_LOOKBACK_CELLS = 6;             // events span at most 6 cells (~48 min)
const EVENT_PROB = 0.16;                    // ~1 event / 50 min / region

export const EVENT_PROFILES = Object.freeze({
  // levelMultipler scales mid, spreadMultipler widens spread; regime is the
  // aftermath the row flips into when the event ends.
  shortage:    { level: [1.25, 1.60], spread: [1.20, 1.50], regime: 'squeeze' },
  boom:        { level: [0.70, 0.85], spread: [1.00, 1.20], regime: 'glut' },
  blockade:    { level: [1.30, 1.60], spread: [1.40, 1.80], regime: 'squeeze' },
  piracy:      { level: [1.10, 1.30], spread: [1.30, 1.60], regime: 'swing' },
  piracy_spike:{ level: [1.10, 1.30], spread: [1.30, 1.60], regime: 'swing' },
  convoy_lost: { level: [1.20, 1.50], spread: [1.20, 1.60], regime: 'squeeze' },
  strike:      { level: [0.75, 0.90], spread: [1.10, 1.40], regime: 'glut' },
  new_mine:    { level: [0.70, 0.85], spread: [1.00, 1.20], regime: 'glut' },
  war_front:   { level: [1.30, 1.60], spread: [1.30, 1.70], regime: 'climb' },
});
/** The universe of goods a scheduled event can name. Kept wide — the station's
 *  own listing filter already decides which named goods it actually trades. */
export const MARKET_GOOD_POOL = Object.freeze(COMMODITIES.map((c) => c.id));

const SCHED_EVENT_KINDS = Object.freeze([
  ['shortage', 24], ['boom', 16], ['convoy_lost', 16], ['blockade', 14],
  ['piracy', 12], ['strike', 10], ['new_mine', 8],
]);

/** Which listing bucket a scheduled type names — the news invite stays honest. */
const EVENT_GOOD_ROLE = Object.freeze({
  boom: 'produce', new_mine: 'produce',
  shortage: 'consume', blockade: 'consume', convoy_lost: 'consume',
  strike: 'consume', war_front: 'consume',
});

/**
 * The scheduled event (if any) a region draws for one epoch cell — pure.
 * `stations` is the sector's station list (ids), `goodIds` the tradeable pool.
 * Optional `extras` = { stationGoods, security }: role-matched listing buckets
 * keep the named good on the berth's own book, and the sector's authored
 * security weights the piracy draws — both deterministic inputs.
 */
export function scheduledEventForEpoch(seed, sectorId, epoch, stations, goodIds, extras = null) {
  const h = hash32(seed, 'events', sectorId, epoch);
  if (sub01(h, 1) >= EVENT_PROB || !stations.length || !goodIds.length) return null;
  const r = sub01(h, 2);
  const security = extras && Number.isFinite(extras.security)
    ? Math.max(0, Math.min(1, extras.security)) : 0.5;
  const piracyFactor = 0.25 + (1 - security) * 1.5;
  const weightOf = (k) => (k === 'piracy' || k === 'piracy_spike' ? piracyFactor : 1);
  let type = 'shortage', acc = 0, total = 0;
  for (const [k, w] of SCHED_EVENT_KINDS) total += w * weightOf(k);
  for (const [k, w] of SCHED_EVENT_KINDS) { acc += w * weightOf(k) / total; if (r < acc) { type = k; break; } }
  const profile = EVENT_PROFILES[type];
  const stationId = stations[pick(h, 3, stations.length)];
  // A surplus alert names what the berth makes; a supply alert names what it
  // needs. A station with no matching line trades its ordinary book instead —
  // the event fires regardless, it just never names an untraded good.
  const buckets = extras && extras.stationGoods && extras.stationGoods[stationId];
  const role = EVENT_GOOD_ROLE[type] || 'listed';
  const pool = buckets
    ? ((buckets[role] && buckets[role].length ? buckets[role]
      : (buckets.listed.length ? buckets.listed : goodIds)))
    : goodIds;
  const goodCount = 1 + pick(h, 4, Math.min(3, pool.length));
  const goods = [];
  for (let i = 0; pool.length && goods.length < goodCount; i++) {
    const cid = pool[pick(h, 10 + i, pool.length)];
    if (!goods.includes(cid)) goods.push(cid);
  }
  const durCells = 2 + pick(h, 5, EVENT_LOOKBACK_CELLS - 1);
  const tStart = epoch * EVENT_CELL_S + Math.floor(sub01(h, 6) * EVENT_CELL_S * 0.6);
  return {
    id: `sched:${sectorId}:${epoch}`, type, cause: type,
    stationId, sectorId, goods,
    tStart, tEnd: tStart + durCells * EVENT_CELL_S,
    levelMult: range(h, 7, profile.level[0], profile.level[1]),
    spreadMult: range(h, 8, profile.spread[0], profile.spread[1]),
    regime: profile.regime,
    scheduled: true,
  };
}

/**
 * Active + recently-ended events affecting one (station, good) at t.
 * `dynamicEvents` is the persisted world/player-caused row list. Returns
 * {levelMult, spreadMult, active[], imposedRun|null}.
 */
export function eventsAffecting(seed, sectorId, stationId, goodId, t, dynamicEvents, stations, goodPool, extras = null) {
  const now = Number(t) || 0;
  const epoch = Math.floor(now / EVENT_CELL_S);
  const levelLo = now - EVENT_LOOKBACK_CELLS * EVENT_CELL_S;
  let levelMult = 1, spreadMult = 1;
  const active = [];
  let latestEnded = null;
  const consider = (ev) => {
    if (!ev || ev.stationId !== stationId) return;
    const goods = ev.goods || (ev.commodityId ? [ev.commodityId] : null);
    if (goods && goods !== '*' && !goods.includes(goodId) && !goods.includes('*')) return;
    if (now >= ev.tStart && now < ev.tEnd) {
      active.push(ev);
      levelMult *= Number(ev.levelMult) || 1;
      spreadMult *= Number(ev.spreadMult) || 1;
    } else if (now >= ev.tEnd && (!latestEnded || ev.tEnd > latestEnded.tEnd)) {
      latestEnded = ev;
    }
  };
  if (sectorId && Array.isArray(stations) && stations.length && Array.isArray(goodPool)) {
    for (let j = epoch; j >= 0 && j * EVENT_CELL_S >= levelLo; j--) {
      consider(scheduledEventForEpoch(seed, sectorId, j, stations, goodPool, extras));
    }
  }
  for (const ev of (dynamicEvents || [])) consider(ev);
  const imposed = latestEnded && (now - latestEnded.tEnd) <= 2 * REGIME_CELL_S
    ? imposedRunForEvent(latestEnded) : null;
  return { levelMult, spreadMult, active, imposed };
}

/** All currently-active events for one station (news surfaces, snapshot cards). */
export function activeStationEvents(seed, sectorId, stationId, t, dynamicEvents, stations, goodPool, extras = null) {
  const now = Number(t) || 0;
  const epoch = Math.floor(now / EVENT_CELL_S);
  const levelLo = now - EVENT_LOOKBACK_CELLS * EVENT_CELL_S;
  const out = [];
  const push = (ev) => {
    if (!ev || ev.stationId !== stationId) return;
    if (now >= ev.tStart && now < ev.tEnd) out.push(ev);
  };
  if (sectorId && Array.isArray(stations) && Array.isArray(goodPool)) {
    for (let j = epoch; j >= 0 && j * EVENT_CELL_S >= levelLo; j--) {
      push(scheduledEventForEpoch(seed, sectorId, j, stations, goodPool, extras));
    }
  }
  for (const ev of (dynamicEvents || [])) push(ev);
  out.sort((a, b) => a.tStart - b.tStart || String(a.id).localeCompare(String(b.id)));
  return out;
}

// ── dents ──────────────────────────────────────────────────────────────────────
export const DENT_CAP = 8;                  // bounded recent-dent list per listing
export const DENT_DEV_LO = 0.85;            // total live dent caps the residual at ±15%
export const DENT_DEV_HI = 1.15;
const DENT_EPSILON = 0.25;                  // prune rows whose live impact fell below this

/** The good's own recovery half-life is the dent's healing clock (≈2–26 min live data). */
export function dentHalfLifeS(goodId) {
  const h = BALANCE.commodities[goodId] && BALANCE.commodities[goodId].recoveryHalfLifeS;
  return Number.isFinite(h) && h > 0 ? h : (BALANCE.market.halfLifeS || 900);
}

/** Live residual units one dent still holds at t. */
function dentResidual(dent, halfS, t) {
  const age = (Number(t) || 0) - (Number(dent.t) || 0);
  if (age <= 0) return Number(dent.q) || 0;
  return (Number(dent.q) || 0) * Math.pow(2, -age / halfS);
}

/**
 * Physical shelf units: rest fill plus the decayed residue of every dent.
 * Selling pushes the shelf up, buying strips it; both heal toward rest.
 */
export function shelfUnitsAt(entry, goodId, t) {
  // eq 0 is a real state (quarantined/refused liquidation books): the shelf rests
  // empty, and only delivered dents — healing like any other pressure — raise it.
  const eq = Math.max(0, Number(entry && (entry.eq ?? entry.equilibrium)) || 0);
  const dents = entry && entry.dents;
  if (!dents || !dents.length) return eq;
  const halfS = dentHalfLifeS(goodId);
  let stock = eq;
  for (const d of dents) stock += dentResidual(d, halfS, t);
  return Math.max(0, stock);
}

/** The ±15% residual price deviation the live dents still carry at t. */
export function dentDeviationAt(entry, goodId, elasticity, t) {
  const eq = Math.max(1, Number(entry && (entry.eq ?? entry.equilibrium)) || 1);
  const shelf = shelfUnitsAt(entry, goodId, t);
  const el = Number(elasticity) || 0;
  return clamp(Math.pow(Math.max(shelf, 1) / eq, -el), DENT_DEV_LO, DENT_DEV_HI);
}

/**
 * Append one signed dent (+ sold to the station, − bought/stripped). The list
 * prunes dead rows, then folds the oldest into a single exact-residual row so
 * the list never exceeds DENT_CAP. Mutates the entry — writer paths only.
 */
export function appendDent(entry, goodId, t, qty) {
  const q = Number(qty);
  if (!entry || !Number.isFinite(q) || q === 0) return entry;
  const now = Number(t) || 0;
  if (!Array.isArray(entry.dents)) entry.dents = [];
  entry.dents.push({ t: now, q });
  const halfS = dentHalfLifeS(goodId);
  entry.dents = entry.dents.filter((d) => Math.abs(dentResidual(d, halfS, now)) >= DENT_EPSILON);
  if (entry.dents.length > DENT_CAP) {
    const excess = entry.dents.length - DENT_CAP + 1;
    const folded = entry.dents.splice(0, excess);
    let residual = 0;
    for (const d of folded) residual += dentResidual(d, halfS, now);
    if (Math.abs(residual) >= DENT_EPSILON) entry.dents.unshift({ t: now, q: residual });
  }
  return entry;
}

/** Fold every dent into one exact-residual row (migration + compaction helper). */
export function flattenDents(entry, goodId, t) {
  const dents = entry && entry.dents;
  if (!dents || !dents.length) { if (entry) entry.dents = []; return entry; }
  const halfS = dentHalfLifeS(goodId);
  let residual = 0;
  for (const d of dents) residual += dentResidual(d, halfS, t);
  entry.dents = Math.abs(residual) >= DENT_EPSILON ? [{ t: Number(t) || 0, q: residual }] : [];
  return entry;
}

// ── the price function ─────────────────────────────────────────────────────────
/** Rest-fill price multiplier: the stock term evaluated at the listing's own
 *  equilibrium — produce rests cheap (~0.8), consume rests dear (~1.36). */
export function restLevelMult(def, eq, baseEq) {
  const el = Number(def && def.elasticity) || 0;
  const b = Number(baseEq) > 0 ? Number(baseEq) : 1;
  return clamp(Math.pow(Math.max(1, Number(eq) || 1) / b, -el),
    BALANCE.market.priceLo, BALANCE.market.priceHi);
}

/**
 * P(good, station, t) — the closed-form mid.
 * ctx: { seed, stationId, sectorId, goodId, baseEq, eq, demandMult, dents,
 *        events, stations, goodPool }
 */
export function marketMidAt(ctx, t) {
  const def = CMDTY_BY_ID.get(ctx.goodId);
  const base = Math.max(1, Number(ctx.basePrice != null ? ctx.basePrice : (def && def.basePrice)) || 1);
  const eq = Math.max(1, Number(ctx.eq) || 1);
  const baseEq = Math.max(1, Number(ctx.baseEq) || 1);
  const el = Number(ctx.elasticity != null ? ctx.elasticity : (def && def.elasticity)) || 0;
  const demand = Number(ctx.demandMult) || 1;
  const rest = restLevelMult(def || { elasticity: el }, eq, baseEq);
  const dev = ctx.dents && ctx.dents.length
    ? dentDeviationAt({ eq, dents: ctx.dents }, ctx.goodId, el, t)
    : 1;
  const ev = eventsAffecting(
    ctx.seed, ctx.sectorId, ctx.stationId, ctx.goodId, t,
    ctx.events, ctx.stations, ctx.goodPool, ctx);
  const regime = regimeFactorAt(ctx.seed, ctx.stationId, ctx.goodId, t, ev.imposed);
  const mid = base * rest * dev * regime * ev.levelMult * demand;
  return clamp(mid, base * PRICE_BAND_LO, base * PRICE_BAND_HI);
}

/**
 * Average mid over a shelf interval [sLo, sHi] — the trade integral. The price
 * curve inside a trade is base·rest·regime·event·demand · (s/eq)^-el clamped to
 * the dent band, so the same bounded-price integral prices every lot exactly.
 */
export function marketAvgMidAt(ctx, t, sLo, sHi) {
  const def = CMDTY_BY_ID.get(ctx.goodId);
  const base = Math.max(1, Number(ctx.basePrice != null ? ctx.basePrice : (def && def.basePrice)) || 1);
  const eq = Math.max(1, Number(ctx.eq) || 1);
  const baseEq = Math.max(1, Number(ctx.baseEq) || 1);
  const el = Number(ctx.elasticity != null ? ctx.elasticity : (def && def.elasticity)) || 0;
  const demand = Number(ctx.demandMult) || 1;
  const rest = restLevelMult(def || { elasticity: el }, eq, baseEq);
  const ev = eventsAffecting(ctx.seed, ctx.sectorId, ctx.stationId, ctx.goodId, t,
    ctx.events, ctx.stations, ctx.goodPool, ctx);
  const regime = regimeFactorAt(ctx.seed, ctx.stationId, ctx.goodId, t, ev.imposed);
  const avg = averageBoundedPrice(
    base * rest * regime * ev.levelMult * demand, eq, el, sLo, sHi, DENT_DEV_LO, DENT_DEV_HI);
  return clamp(avg, base * PRICE_BAND_LO, base * PRICE_BAND_HI);
}

/** Event spread multiplier for one (station, good) at t — feeds spreadOf(). */
export function eventSpreadAt(ctx, t) {
  const ev = eventsAffecting(ctx.seed, ctx.sectorId, ctx.stationId, ctx.goodId, t,
    ctx.events, ctx.stations, ctx.goodPool, ctx);
  return ev.spreadMult;
}

/**
 * Player-facing regime state for the chart header: name, elapsed, and whether
 * an event is currently moving this listing.
 */
export function regimeStateAt(ctx, t) {
  const run = governingRegime(ctx.seed, ctx.stationId, ctx.goodId, t);
  const ev = eventsAffecting(ctx.seed, ctx.sectorId, ctx.stationId, ctx.goodId, t,
    ctx.events, ctx.stations, ctx.goodPool, ctx);
  const imposed = ev.imposed && t >= ev.imposed.startT && t < ev.imposed.startT + ev.imposed.duration
    ? ev.imposed : null;
  const live = imposed || run;
  return {
    kind: live.kind, label: regimeLabel(live.kind),
    elapsed: Math.max(0, (Number(t) || 0) - live.startT),
    duration: live.duration,
    imposed: !!imposed,
    eventActive: ev.active.length > 0,
    events: ev.active,
  };
}

/**
 * Chart backfill by pure evaluation: sample the closed form on the display grid
 * and add the regime/event edges inside the window so shape breaks stay sharp.
 */
export function priceHistoryPoints(ctx, tNow, spanS, stepS, limit, observedTs = null) {
  const now = Number(tNow) || 0;
  const step = Math.max(1, Number(stepS) || 15);
  const span = Math.max(step, Number(spanS) || step * 63);
  const max = Math.max(2, Number(limit) || 64);
  const start = now - span;
  const times = new Set();
  for (let t = start; t <= now; t += step) times.add(Math.round(t * 10) / 10);
  times.add(now);
  // Keep the kink where each regime epoch flips inside the window.
  const firstEpoch = Math.floor(start / REGIME_CELL_S);
  for (let k = firstEpoch; k * REGIME_CELL_S <= now; k++) {
    const edge = k * REGIME_CELL_S;
    if (edge > start && edge < now) times.add(edge);
  }
  if (sectorHasEvents(ctx)) {
    for (const ev of stationEventRows(ctx, start, now)) {
      if (ev.tStart > start && ev.tStart < now) times.add(ev.tStart);
      if (ev.tEnd > start && ev.tEnd < now) times.add(ev.tEnd);
    }
  }
  // 'observed' is a recorded sighting (docked intel / market memory), not a tick
  // sample: a point within half a step of a stamped observation reads as seen,
  // the rest of the backfill is honestly the model's reconstruction.
  const obs = Array.isArray(observedTs)
    ? observedTs.filter((t) => Number.isFinite(t) && t >= start - step && t <= now + step) : [];
  const sorted = [...times].sort((a, b) => a - b);
  const points = sorted.map((t) => ({
    t,
    mid: Math.max(1, Math.round(marketMidAt(ctx, t))),
    origin: obs.some((o) => Math.abs(o - t) <= step / 2 + 1e-6) ? 'observed' : 'modelled',
  }));
  return points.length > max ? points.slice(points.length - max) : points;
}

function sectorHasEvents(ctx) {
  return !!(ctx && (Array.isArray(ctx.events) && ctx.events.length
    || (ctx.sectorId && Array.isArray(ctx.stations) && ctx.stations.length)));
}

/** All event rows (scheduled + dynamic) for the station inside [tLo, tHi]. */
export function stationEventRows(ctx, tLo, tHi) {
  const rows = [];
  if (ctx.sectorId && Array.isArray(ctx.stations) && Array.isArray(ctx.goodPool)) {
    const j0 = Math.max(0, Math.floor(tLo / EVENT_CELL_S));
    const j1 = Math.floor(tHi / EVENT_CELL_S);
    for (let j = j0; j <= j1; j++) {
      const ev = scheduledEventForEpoch(ctx.seed, ctx.sectorId, j, ctx.stations, ctx.goodPool, ctx);
      if (ev && ev.stationId === ctx.stationId && ev.tEnd > tLo && ev.tStart < tHi) rows.push(ev);
    }
  }
  for (const ev of (ctx.events || [])) {
    if (ev && ev.stationId === ctx.stationId && ev.tEnd > tLo && ev.tStart < tHi) rows.push(ev);
  }
  rows.sort((a, b) => a.tStart - b.tStart || String(a.id).localeCompare(String(b.id)));
  return rows;
}

/** Forward curve for the forecast cone — same closed form evaluated ahead. */
export function forecastCurvePoints(ctx, tNow, steps, stepS) {
  const n = Math.max(1, Number(steps) || 24);
  const dt = Math.max(1, Number(stepS) || 5);
  const now = Number(tNow) || 0;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = now + (i + 1) * dt;
    out[i] = { t, mid: Math.max(1, Math.round(marketMidAt(ctx, t))) };
  }
  return out;
}

// ── listing definition (the stateless market book) ─────────────────────────────
// What a station would trade if it had a book at all — pure data. The economy
// owner uses this for both minting and every never-visited price read.
export const MARKET_SIZE_FACTOR = Object.freeze({ S: 0.5, M: 1, L: 2 });

export function roleFor(def, stationType) {
  if (!def || !stationType) return 'none';
  if ((def.producedBy || []).includes(stationType)) return 'produce';
  if ((def.consumedBy || []).includes(stationType)) return 'consume';
  return 'none';
}

export function equilibriumForListing(info, goodId, role, baseEq) {
  const authored = Number(info && info.marketEquilibriumFactors
    && info.marketEquilibriumFactors[goodId]);
  if (Number.isFinite(authored) && authored > 0) return baseEq * clamp(authored, 0.01, 4);
  const factor = BALANCE.market.roleFactor && BALANCE.market.roleFactor[role];
  return role === 'none' || !Number.isFinite(factor) ? baseEq : baseEq * factor;
}

/**
 * One listing's static definition. Returns null when the good would never be
 * listed at this berth (tier gate, legality gate, noMarketSeed). `producedHere`
 * lifts the shallow-tier gate exactly as minting did.
 */
export function listingDefFor(def, info, stationId, { producedHere = false } = {}) {
  if (!def || !info) return null;
  if (def.legality === 'contraband' || def.legality === 'illegal') {
    if (!toleratesContraband(info) && info.type !== 'blackmarket') return null;
  }
  if (def.noMarketSeed === true) return null;
  const stationTier = Math.max(0, Number(info.tier) || 0);
  const marketTier = Math.max(0, Number(def.marketTier) || 0);
  if (marketTier > stationTier && !producedHere) return null;
  const baseEq = (BALANCE.commodities[def.id] && BALANCE.commodities[def.id].baseEq
    || BALANCE.market.baseEqDefault) * (MARKET_SIZE_FACTOR[info.size] || 1);
  const role = roleFor(def, info.type);
  return { cid: def.id, role, baseEq, eq: equilibriumForListing(info, def.id, role, baseEq) };
}

// ── state-driven context assembly ──────────────────────────────────────────────
// The one place both lanes build the eval context from live state: the minted
// entry supplies dents/equilibrium when present; everything else resolves from
// the pure listing definition, so a never-visited market prices identically.

/** A sector's scheduled-event context: station ids, good pool, role buckets, security. */
const _sectorCtxCache = new WeakMap();
export function sectorEventContext(state, sectorId) {
  let bySector = state && _sectorCtxCache.get(state);
  if (!bySector) { bySector = new Map(); if (state) _sectorCtxCache.set(state, bySector); }
  if (bySector.has(sectorId)) return bySector.get(sectorId);
  const registry = state && state.content && state.content.sectors;
  const sec = registry
    ? (Array.isArray(registry) ? registry.find((s) => s && s.id === sectorId) : registry[sectorId])
    : SECTORS.find((s) => s && s.id === sectorId);
  const stationIds = sec && Array.isArray(sec.stations)
    ? sec.stations.map((s) => s && s.id).filter(Boolean) : [];
  // Role buckets per berth: a scheduled alert names a good the station actually
  // lists, preferring the bucket the type speaks about (produce/consume).
  const stationGoods = {};
  for (const sid of stationIds) {
    const info = stationInfo(state, sid);
    const bucket = { listed: [], produce: [], consume: [] };
    if (info) {
      for (const def of COMMODITIES) {
        const ldef = listingDefFor(def, info, sid,
          { producedHere: producedAtStation(state, info, sid, def) });
        if (!ldef) continue;
        bucket.listed.push(def.id);
        if (ldef.role === 'produce') bucket.produce.push(def.id);
        else if (ldef.role === 'consume') bucket.consume.push(def.id);
      }
    }
    stationGoods[sid] = bucket;
  }
  const ctx = {
    stationIds,
    goodPool: stationIds.length ? MARKET_GOOD_POOL : [],
    stationGoods,
    security: sec && Number.isFinite(sec.security) ? sec.security : 0.5,
  };
  bySector.set(sectorId, ctx);
  return ctx;
}

/**
 * Build the eval context for one (station, good). `entry` may be null — the
 * pure listing definition supplies role/equilibrium/baseEq, so the closed form
 * answers for a market that has never been minted.
 */
export function marketContextFor(state, stationId, goodId, entry) {
  const info = stationInfo(state, stationId);
  const def = CMDTY_BY_ID.get(goodId);
  if (!def || !info) return null;
  const sectorId = info.sectorId || null;
  const { stationIds, goodPool, stationGoods, security } = sectorId
    ? sectorEventContext(state, sectorId)
    : { stationIds: [], goodPool: [], stationGoods: {}, security: 0.5 };
  const ldef = (!entry || !Number.isFinite(entry.eq ?? entry.equilibrium))
    ? listingDefFor(def, info, stationId, { producedHere: producedAtStation(state, info, stationId, def) })
    : null;
  const eq = entry && Number.isFinite(entry.eq ?? entry.equilibrium)
    ? (entry.eq ?? entry.equilibrium)
    : (ldef ? ldef.eq : 0);
  const baseEq = entry && Number.isFinite(entry.baseEq) && entry.baseEq > 0
    ? entry.baseEq : (ldef ? ldef.baseEq : BALANCE.market.baseEqDefault);
  return {
    seed: state && state.meta && state.meta.seed,
    stationId, sectorId, goodId,
    baseEq, eq,
    dents: entry ? entry.dents : null,
    demandMult: Number(entry && entry.demandMult) || 1,
    events: (state && state.economy && state.economy.econEvents) || [],
    stations: stationIds, goodPool, stationGoods, security,
  };
}

/** Every listing a station would show — minted rows plus the stateless book. */
export function marketRowsFor(state, stationId) {
  const info = stationInfo(state, stationId);
  const market = (state && state.economy && state.economy.markets
    && state.economy.markets[stationId]) || null;
  const out = {};
  for (const def of COMMODITIES) {
    const entry = market && market[def.id];
    if (entry) { out[def.id] = entry; continue; }
    const ldef = listingDefFor(def, info, stationId,
      { producedHere: producedAtStation(state, info, stationId, def) });
    if (ldef) {
      out[def.id] = { eq: ldef.eq, equilibrium: ldef.eq, baseEq: ldef.baseEq, role: ldef.role,
        dents: [], stock: ldef.eq, lastMid: 0, lastBuy: 0, lastSell: 0,
        demandMult: 1, demandDrivers: [], transient: true };
    }
  }
  return out;
}

function producedAtStation(state, info, stationId, def) {
  if (!def || !info || !info.sectorId) return false;
  if ((Number(def.marketTier) || 0) > 2) return false;
  for (const recipe of pressureRecipesForRegion(info.sectorId)) {
    if (recipe.role === 'produce' && recipe.stationId === stationId && recipe.commodityId === def.id) return true;
  }
  return false;
}

// ── live event enumeration (normalized, old-shape compatible) ──────────────────
/**
 * Every event live at `atT` — scheduled rows from the world seed plus the
 * persisted dynamic rows — normalized to the shape econEvents consumers already
 * read ({ id, type, stationId, commodityId, startT, duration }).
 */
export function economyLiveEvents(state, atT) {
  const econ = state && state.economy;
  const now = Number.isFinite(atT) ? atT : ((state && state.simTime) || 0);
  const seed = state && state.meta && state.meta.seed;
  const epoch = Math.floor(now / EVENT_CELL_S);
  const out = [];
  const seen = new Set();
  const push = (ev) => {
    if (!ev || seen.has(ev.id)) return;
    // Legacy rows carry startT+duration; live rows carry tStart/tEnd. Both are live events.
    const tStart = Number.isFinite(ev.tStart) ? ev.tStart : Number(ev.startT);
    const tEnd = Number.isFinite(ev.tEnd) ? ev.tEnd
      : (Number.isFinite(tStart) ? tStart + (Number(ev.duration) || 0) : NaN);
    if (!(now >= tStart && now < tEnd)) return;
    seen.add(ev.id);
    const goods = Array.isArray(ev.goods) ? ev.goods : (ev.commodityId ? [ev.commodityId] : []);
    out.push({
      ...ev, goods, tStart, tEnd,
      commodityId: goods.length === 1 ? goods[0] : (goods.length ? '*' : (ev.commodityId || '*')),
      startT: tStart, duration: tEnd - tStart,
    });
  };
  for (const ev of (econ && econ.econEvents) || []) push(ev);
  const registry = state && state.content && state.content.sectors;
  const sectors = registry
    ? (Array.isArray(registry) ? registry : Object.values(registry))
    : SECTORS;
  for (const sec of sectors) {
    if (!sec || !sec.id || !Array.isArray(sec.stations)) continue;
    const { stationIds, goodPool, stationGoods, security } = sectorEventContext(state, sec.id);
    if (!stationIds.length) continue;
    for (let j = epoch; j >= 0 && j * EVENT_CELL_S > now - EVENT_LOOKBACK_CELLS * EVENT_CELL_S; j--) {
      push(scheduledEventForEpoch(seed, sec.id, j, stationIds, goodPool, { stationGoods, security }));
    }
  }
  out.sort((a, b) => a.tStart - b.tStart || String(a.id).localeCompare(String(b.id)));
  return out;
}

/** Active events for one station at `atT`, normalized like economyLiveEvents. */
export function stationLiveEvents(state, stationId, atT) {
  const now = Number.isFinite(atT) ? atT : ((state && state.simTime) || 0);
  return economyLiveEvents(state, now).filter((ev) => ev.stationId === stationId);
}

/** Chart backfill by closed form — same grid the old 64-point ring kept. */
export function marketHistoryFor(state, stationId, commodityId, opts = null) {
  const market = state && state.economy && state.economy.markets
    && state.economy.markets[stationId];
  const entry = market && market[commodityId];
  const ctx = marketContextFor(state, stationId, commodityId, entry || null);
  if (!ctx) return [];
  const now = (state && state.simTime) || 0;
  // Observation times the player actually carries: docked intel and remembered sights.
  const observedTs = [];
  const intel = state && state.economy && state.economy.marketIntel
    && state.economy.marketIntel[stationId];
  if (intel && Number.isFinite(intel.seenAtT)) observedTs.push(intel.seenAtT);
  const mem = state && state.player && state.player.marketMemory
    && state.player.marketMemory[stationId];
  const memRow = mem && mem[commodityId];
  if (memRow && Number.isFinite(memRow.seenAt)) observedTs.push(memRow.seenAt);
  return priceHistoryPoints(ctx, now,
    opts && opts.spanS || 15 * 63, opts && opts.stepS || 15, opts && opts.limit || 64,
    observedTs);
}

/** Forward cone for the forecast surfaces — pure eval ahead of `tNow`. */
export function marketForecastFor(state, stationId, commodityId, steps = 24, stepS = 5) {
  const market = state && state.economy && state.economy.markets
    && state.economy.markets[stationId];
  const entry = market && market[commodityId];
  const ctx = marketContextFor(state, stationId, commodityId, entry || null);
  if (!ctx) return [];
  return forecastCurvePoints(ctx, (state && state.simTime) || 0, steps, stepS);
}

/** Player-facing regime/event state for one listing (chart header + mover line). */
export function marketRegimeStateFor(state, stationId, commodityId, atT) {
  const market = state && state.economy && state.economy.markets
    && state.economy.markets[stationId];
  const entry = market && market[commodityId];
  const ctx = marketContextFor(state, stationId, commodityId, entry || null);
  if (!ctx) return null;
  return regimeStateAt(ctx, Number.isFinite(atT) ? atT : ((state && state.simTime) || 0));
}

/** Restock ETA helper — seconds until the shelf reaches `threshold` units. */
export function shelfRestockSeconds(entry, goodId, t, threshold = 2) {
  const stock = shelfUnitsAt(entry, goodId, t);
  if (stock >= threshold) return { soldOut: false, restockSeconds: null };
  const eq = Math.max(0, Number(entry && (entry.eq ?? entry.equilibrium)) || 0);
  if (!(eq > threshold)) return { soldOut: true, restockSeconds: null };
  const halfS = dentHalfLifeS(goodId);
  const now = Number(t) || 0;
  let lo = now, hi = now + halfS * 8;
  if (shelfUnitsAt(entry, goodId, hi) < threshold) return { soldOut: true, restockSeconds: null };
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (shelfUnitsAt(entry, goodId, m) >= threshold) hi = m; else lo = m;
  }
  return { soldOut: true, restockSeconds: Math.ceil(hi - now) };
}
