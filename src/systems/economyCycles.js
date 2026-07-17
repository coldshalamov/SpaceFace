// economyCycles.js — per-station, per-commodity price formula engine.
//
// Each market listing owns a hidden "wave equation" that multiplies the stock-based mid price.
// Formulas are continuous (sine, trend, polynomial, multi-harmonic, etc.) so charts show
// readable motion while a regime holds. Regime identity re-rolls rarely and independently
// per commodity so traders can learn a station's current shape without the board flipping
// all at once.
//
// Design goals (player-facing):
//   • Rare formula changes (err on the long side — skill, not noise).
//   • Within a regime, the curve is predictable enough to plan a haul.
//   • Different commodities desync their re-rolls.
//   • Factors stay in a realistic band; mid prices never go ≤ 0.
//
// Pure math + state helpers only. Economy owns lifecycle (create / tick advance / serialize).

import { COMMODITIES } from '../data/commodities.js';

const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const TAU = Math.PI * 2;

// ── Tunables ────────────────────────────────────────────────────────────────────────────────
// Regime identity lasts a long time so charts are learnable. Motion *inside* a regime is
// separate (frequencies below) and is what the sparkline actually draws.
const REGIME_MIN_S = 1500;       // ~25 min sim — rare end of the band
const REGIME_MAX_S = 5400;       // ~90 min sim
// Soft factor band applied on top of stock mid. Stacked with stock mult, then absolute-clamped.
export const CYCLE_FACTOR_LO = 0.58;
export const CYCLE_FACTOR_HI = 1.72;
// Structural stock, station role, and persistent sector demand establish the strategic price
// level. Formula cycles remain readable and learnable, but contribute only half their authored
// deviation so they no longer drown those persistent signals.
export const CYCLE_WEIGHT = 0.5;
// Final mid vs basePrice (after stock × cycle). Never below 1 credit unit after rounding.
export const CYCLE_MID_LO_MULT = 0.35;
export const CYCLE_MID_HI_MULT = 2.80;

// Wave periods inside a regime (readable on a ~minutes-long chart, not hours).
const PERIOD_LO_S = 240;         // 4 min full cycle
const PERIOD_HI_S = 1200;        // 20 min full cycle

/** Player-facing + news-template keys. New poly families extend the set. */
export const CYCLE_REGIMES = Object.freeze([
  'stable',
  'sine',
  'rising',
  'falling',
  'quadratic',
  'cubic',
  'sqrt',
  'log',
  'volatile',
  'turbulent',
]);

// Relative pick weights — stable/sine dominate; wild families exist but are uncommon.
const REGIME_WEIGHTS = Object.freeze({
  stable: 18,
  sine: 16,
  rising: 12,
  falling: 12,
  quadratic: 10,
  cubic: 8,
  sqrt: 7,
  log: 7,
  volatile: 6,
  turbulent: 4,
});

function lerp(a, b, t) { return a + (b - a) * t; }
function randRange(rng, lo, hi) { return lo + rng() * (hi - lo); }
function randInt(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }

function pickWeighted(rng, weights) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = rng() * total;
  for (const k in weights) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return 'sine';
}

function periodToFreq(periodS) {
  return TAU / Math.max(60, periodS);
}

function volScale(def) {
  const vol = def && def.volatility > 0 ? def.volatility : 0.25;
  return clamp(vol / 0.45, 0.45, 1.35);
}

/**
 * Build a fresh formula for one station+commodity.
 * @param {() => number} rng  deterministic 0..1 stream
 * @param {object|null} def   commodity def (volatility scales amplitude)
 * @param {number} simTime
 */
export function createCycle(rng, def, simTime) {
  if (typeof rng !== 'function') rng = () => 0.5;
  // A market can be established before the pilot's clock begins. Preserve that negative
  // start time so its initial history samples the same live formula rather than flattening
  // every point to t=0.
  simTime = Number.isFinite(Number(simTime)) ? Number(simTime) : 0;
  const regime = pickWeighted(rng, REGIME_WEIGHTS);
  const vs = volScale(def);
  const period = randRange(rng, PERIOD_LO_S, PERIOD_HI_S);
  const frequency = periodToFreq(period);
  const phase = rng() * TAU;
  // Floor amplitude so integer-credit mids still move on the chart for cheap goods
  // (~±1.5 cr swing minimum at base). High-priced goods use the percent band only.
  const base = def && def.basePrice > 0 ? def.basePrice : 50;
  // Compensate the authored minimum for CYCLE_WEIGHT so cheap one-credit listings still cross an
  // integer boundary on the chart after the short-term overlay is demoted.
  const minReadableAmp = clamp(1.5 / (base * CYCLE_WEIGHT), 0.02, 0.20);

  // Amplitude budget scales with commodity volatility; families further modulate it.
  let amp = Math.max(minReadableAmp, randRange(rng, 0.06, 0.18) * vs);
  let bias = randRange(rng, -0.04, 0.04);
  let slope = 0;           // per-second linear term
  let a = 0;               // u^2 / poly
  let b = 0;               // u^1
  let c = 0;               // u^3 or log/sqrt gain
  let pivot = 0.5;         // parabola vertex along regime [0,1]
  let amp2 = 0;
  let freq2 = frequency * 1.7;
  let phase2 = rng() * TAU;
  let amp3 = 0;
  let freq3 = frequency * 2.6;
  let phase3 = rng() * TAU;

  switch (regime) {
    case 'stable':
      amp = Math.max(minReadableAmp, randRange(rng, 0.04, 0.10) * vs);
      bias = randRange(rng, -0.02, 0.02);
      break;
    case 'sine':
      amp = Math.max(minReadableAmp, randRange(rng, 0.09, 0.22) * vs);
      bias = randRange(rng, -0.03, 0.03);
      break;
    case 'rising':
      amp = Math.max(minReadableAmp * 0.7, randRange(rng, 0.05, 0.12) * vs);
      bias = randRange(rng, 0.02, 0.08);
      // Over a full regime, climb roughly +8%..+28% of base (plus small wave).
      slope = randRange(rng, 0.08, 0.28) * vs / Math.max(REGIME_MIN_S, 1);
      break;
    case 'falling':
      amp = Math.max(minReadableAmp * 0.7, randRange(rng, 0.05, 0.12) * vs);
      bias = randRange(rng, -0.08, -0.02);
      slope = -randRange(rng, 0.08, 0.28) * vs / Math.max(REGIME_MIN_S, 1);
      break;
    case 'quadratic':
      // Bowl or hill — can reverse mid-regime without a formula change.
      pivot = randRange(rng, 0.25, 0.75);
      a = randRange(rng, 0.12, 0.40) * vs * (rng() < 0.5 ? 1 : -1);
      b = randRange(rng, -0.12, 0.12) * vs;
      amp = Math.max(minReadableAmp * 0.5, randRange(rng, 0.03, 0.08) * vs);
      break;
    case 'cubic':
      // Inflection / S-curve over the regime window.
      c = randRange(rng, 0.14, 0.42) * vs * (rng() < 0.5 ? 1 : -1);
      a = randRange(rng, -0.18, 0.18) * vs;
      b = randRange(rng, -0.10, 0.10) * vs;
      amp = Math.max(minReadableAmp * 0.5, randRange(rng, 0.03, 0.07) * vs);
      break;
    case 'sqrt':
      // Fast early move, then eases (or reverse with negative gain).
      c = randRange(rng, 0.12, 0.34) * vs * (rng() < 0.55 ? 1 : -1);
      amp = Math.max(minReadableAmp * 0.5, randRange(rng, 0.03, 0.07) * vs);
      bias = randRange(rng, -0.03, 0.03);
      break;
    case 'log':
      // Saturating climb/drop — classic "news then settle".
      c = randRange(rng, 0.12, 0.36) * vs * (rng() < 0.55 ? 1 : -1);
      // log gain k in ln(1 + k*u)
      a = randRange(rng, 2.5, 8.0);
      amp = Math.max(minReadableAmp * 0.5, randRange(rng, 0.03, 0.06) * vs);
      bias = randRange(rng, -0.03, 0.03);
      break;
    case 'volatile':
      amp = Math.max(minReadableAmp, randRange(rng, 0.14, 0.28) * vs);
      amp2 = randRange(rng, 0.05, 0.12) * vs;
      freq2 = periodToFreq(randRange(rng, PERIOD_LO_S * 0.45, PERIOD_HI_S * 0.55));
      bias = randRange(rng, -0.05, 0.05);
      break;
    case 'turbulent':
      amp = Math.max(minReadableAmp, randRange(rng, 0.12, 0.24) * vs);
      amp2 = randRange(rng, 0.06, 0.14) * vs;
      amp3 = randRange(rng, 0.03, 0.09) * vs;
      freq2 = periodToFreq(randRange(rng, 180, 600));
      freq3 = periodToFreq(randRange(rng, 90, 360));
      bias = randRange(rng, -0.06, 0.06);
      break;
    default:
      break;
  }

  const duration = randRange(rng, REGIME_MIN_S, REGIME_MAX_S);
  // Stagger: small per-create jitter so a station's board does not flip in lockstep.
  const stagger = randRange(rng, 0, REGIME_MIN_S * 0.35);

  return {
    cmdtyId: def && def.id || null,
    regime,
    family: regime,
    phase,
    frequency,
    amplitude: amp,
    bias,
    slope,
    a,
    b,
    c,
    pivot,
    amp2,
    freq2,
    phase2,
    amp3,
    freq3,
    phase3,
    regimeStartT: simTime,
    regimeEndT: simTime + duration + stagger,
  };
}

function ensureCyclesContainer(state) {
  const econ = state && state.economy;
  if (!econ) return null;
  if (!econ.cycles || typeof econ.cycles !== 'object' || Array.isArray(econ.cycles)) {
    econ.cycles = {};
  }
  return econ.cycles;
}

function ensureStationCycles(state, stationId) {
  const cycles = ensureCyclesContainer(state);
  if (!cycles) return null;
  if (!cycles[stationId]) cycles[stationId] = {};
  return cycles[stationId];
}

/** Migrate a save/legacy cycle into the current formula shape. */
export function normalizeCycle(raw, cmdtyId) {
  if (!raw || typeof raw !== 'object') return null;
  const regime = CYCLE_REGIMES.includes(raw.regime)
    ? raw.regime
    : (CYCLE_REGIMES.includes(raw.family) ? raw.family : 'sine');
  // A new campaign starts with each market already partway through a regime, so its
  // opening chart has a truthful, readable past. Those pre-campaign seconds are
  // intentionally negative relative to the pilot's playtime clock and must survive
  // a save/load round trip.
  const regimeStartT = Number.isFinite(Number(raw.regimeStartT)) ? Number(raw.regimeStartT) : 0;
  return {
    cmdtyId: raw.cmdtyId || cmdtyId || null,
    regime,
    family: raw.family || regime,
    phase: Number(raw.phase) || 0,
    frequency: Number(raw.frequency) > 0 ? Number(raw.frequency) : periodToFreq(600),
    amplitude: Number.isFinite(raw.amplitude) ? raw.amplitude : 0.1,
    bias: Number.isFinite(raw.bias) ? raw.bias : 0,
    slope: Number.isFinite(raw.slope) ? raw.slope : 0,
    a: Number.isFinite(raw.a) ? raw.a : 0,
    b: Number.isFinite(raw.b) ? raw.b : 0,
    c: Number.isFinite(raw.c) ? raw.c : 0,
    pivot: Number.isFinite(raw.pivot) ? clamp(raw.pivot, 0, 1) : 0.5,
    amp2: Number.isFinite(raw.amp2) ? raw.amp2 : 0,
    freq2: Number.isFinite(raw.freq2) ? raw.freq2 : (Number(raw.frequency) || periodToFreq(400)) * 1.7,
    phase2: Number.isFinite(raw.phase2) ? raw.phase2 : 0,
    amp3: Number.isFinite(raw.amp3) ? raw.amp3 : 0,
    freq3: Number.isFinite(raw.freq3) ? raw.freq3 : (Number(raw.frequency) || periodToFreq(300)) * 2.4,
    phase3: Number.isFinite(raw.phase3) ? raw.phase3 : 0,
    regimeStartT,
    regimeEndT: Math.max(
      regimeStartT + REGIME_MIN_S,
      Number(raw.regimeEndT) || (regimeStartT + REGIME_MIN_S),
    ),
  };
}

/** Get (or lazily create) the cycle for a station+commodity. */
export function getCycle(state, stationId, cmdtyId, rng, simTime) {
  const stationCycles = ensureStationCycles(state, stationId);
  if (!stationCycles) return null;
  let c = stationCycles[cmdtyId];
  if (!c) {
    const def = CMDTY_BY_ID.get(cmdtyId);
    c = createCycle(typeof rng === 'function' ? rng : () => 0.5, def, simTime);
    c.cmdtyId = cmdtyId;
    stationCycles[cmdtyId] = c;
  } else if (c.family == null && c.slope == null && c.a == null) {
    // One-shot migrate of very old {phase,frequency,amplitude,bias} blobs.
    c = normalizeCycle(c, cmdtyId);
    stationCycles[cmdtyId] = c;
  }
  return c;
}

/** Evaluate the hidden formula before its safety band is applied. */
export function rawCycleFactorAt(cycle, simTime) {
  if (!cycle) return 1;
  const start = Number.isFinite(Number(cycle.regimeStartT)) ? Number(cycle.regimeStartT) : 0;
  const end = Math.max(start + 1, Number(cycle.regimeEndT) || (start + REGIME_MIN_S));
  const duration = end - start;
  const elapsed = Math.max(0, (Number(simTime) || 0) - start);
  // Normalized progress. Forecast past regimeEnd continues the same equation ("if it holds").
  const u = elapsed / duration;
  const family = cycle.family || cycle.regime || 'sine';
  const amp = Number(cycle.amplitude) || 0;
  const bias = Number(cycle.bias) || 0;
  const phase = Number(cycle.phase) || 0;
  const freq = Number(cycle.frequency) > 0 ? Number(cycle.frequency) : periodToFreq(600);
  const wave = Math.sin(phase + freq * elapsed);

  let raw = 1 + bias;

  switch (family) {
    case 'stable':
    case 'sine':
      raw += amp * wave;
      break;
    case 'rising':
    case 'falling':
      raw += (Number(cycle.slope) || 0) * elapsed + amp * wave;
      break;
    case 'quadratic': {
      const pivot = Number.isFinite(cycle.pivot) ? cycle.pivot : 0.5;
      const x = u - pivot;
      raw += (Number(cycle.a) || 0) * x * x + (Number(cycle.b) || 0) * x + amp * wave;
      break;
    }
    case 'cubic': {
      // Centered cubic so early/late extremes differ (S-curve / inflection art).
      const x = u - 0.5;
      raw += (Number(cycle.c) || 0) * x * x * x
        + (Number(cycle.a) || 0) * x * x
        + (Number(cycle.b) || 0) * x
        + amp * wave;
      break;
    }
    case 'sqrt': {
      const gain = Number(cycle.c) || 0;
      raw += gain * Math.sqrt(Math.max(0, u)) + amp * wave;
      break;
    }
    case 'log': {
      const gain = Number(cycle.c) || 0;
      const k = Number(cycle.a) > 0 ? Number(cycle.a) : 4;
      raw += gain * Math.log(1 + k * Math.max(0, u)) / Math.log(1 + k) + amp * wave;
      break;
    }
    case 'volatile':
      raw += amp * wave
        + (Number(cycle.amp2) || 0) * Math.sin((Number(cycle.phase2) || 0) + (Number(cycle.freq2) || freq * 1.7) * elapsed);
      break;
    case 'turbulent':
      raw += amp * wave
        + (Number(cycle.amp2) || 0) * Math.sin((Number(cycle.phase2) || 0) + (Number(cycle.freq2) || freq * 1.7) * elapsed)
        + (Number(cycle.amp3) || 0) * Math.sin((Number(cycle.phase3) || 0) + (Number(cycle.freq3) || freq * 2.4) * elapsed);
      break;
    default:
      raw += amp * wave;
      break;
  }

  return raw;
}

/**
 * Evaluate the hidden formula → dimensionless price factor (~1).
 * Pure. Never returns non-finite or ≤ 0 values.
 */
export function cycleFactorAt(cycle, simTime) {
  const raw = rawCycleFactorAt(cycle, simTime);
  if (!Number.isFinite(raw)) return 1;
  const weighted = 1 + (raw - 1) * CYCLE_WEIGHT;
  return clamp(weighted, CYCLE_FACTOR_LO, CYCLE_FACTOR_HI);
}

/**
 * Apply stock mid × cycle factor, then absolute band vs basePrice.
 * Guarantees a positive finite mid (never ≤ 0).
 */
export function applyCycleToMid(basePrice, stockMid, cycle, simTime) {
  const base = Math.max(1, Number(basePrice) || 1);
  const stock = Number.isFinite(stockMid) && stockMid > 0 ? stockMid : base;
  const factor = cycleFactorAt(cycle, simTime);
  const raw = stock * factor;
  const lo = base * CYCLE_MID_LO_MULT;
  const hi = base * CYCLE_MID_HI_MULT;
  const mid = clamp(raw, lo, hi);
  return mid > 0 && Number.isFinite(mid) ? mid : base;
}

/** Maybe re-roll the formula if its regime has expired. Returns next cycle object. */
export function maybeAdvanceRegime(cycle, rng, simTime) {
  if (!cycle) return cycle;
  // A formula that would make a price non-positive is never allowed to linger
  // behind the display clamp. Re-roll immediately, then keep normal regime
  // changes deliberately infrequent.
  const raw = rawCycleFactorAt(cycle, simTime);
  if (simTime < cycle.regimeEndT && Number.isFinite(raw) && raw > 0) return cycle;
  const def = CMDTY_BY_ID.get(cycle.cmdtyId);
  const next = createCycle(typeof rng === 'function' ? rng : () => 0.5, def, simTime);
  if (cycle.cmdtyId) next.cmdtyId = cycle.cmdtyId;
  return next;
}

/**
 * Predict future mid-price curve from current market state.
 * Holds stock/events constant; only the cycle equation evolves — the skill bet.
 * Returns array of { t, mid }.
 */
export function predictPriceCurve(state, stationId, cmdtyId, steps = 24, stepS = 5) {
  const econ = state && state.economy;
  const market = econ && econ.markets && econ.markets[stationId];
  const entry = market && market[cmdtyId];
  const def = CMDTY_BY_ID.get(cmdtyId);
  if (!entry || !def) return [];
  const cycle = getCycle(state, stationId, cmdtyId, null, state.simTime || 0);
  const stockMid = def.basePrice * Math.pow(
    Math.max(entry.stock, 1) / Math.max(entry.baseEq, 1),
    -(def.elasticity > 0 ? def.elasticity : 0.4),
  ) * (Number(entry.demandMult) > 0 ? Number(entry.demandMult) : 1);
  const out = [];
  const now = Math.max(0, state.simTime || 0);
  for (let i = 1; i <= steps; i++) {
    const t = now + i * stepS;
    const mid = applyCycleToMid(def.basePrice, stockMid, cycle, t);
    out.push({ t, mid: Math.max(1, Math.round(mid)) });
  }
  return out;
}

/** Human-readable label for a cycle regime / family. */
export function regimeLabel(regime) {
  switch (regime) {
    case 'stable': return 'Stable demand';
    case 'sine': return 'Cyclic demand';
    case 'rising': return 'Rising demand';
    case 'falling': return 'Cooling demand';
    case 'quadratic': return 'Curved demand';
    case 'cubic': return 'Inflecting market';
    case 'sqrt': return 'Easing curve';
    case 'log': return 'Saturating demand';
    case 'volatile': return 'Volatile pricing';
    case 'turbulent': return 'Turbulent market';
    default: return 'Cyclic pricing';
  }
}

/** Cycle data for serialization (lightweight, full formula params). */
export function serializeCycles(state) {
  const cycles = state && state.economy && state.economy.cycles;
  if (!cycles) return {};
  const out = {};
  for (const sid in cycles) {
    const station = cycles[sid];
    const sOut = [];
    for (const cid in station) {
      const c = normalizeCycle(station[cid], cid);
      if (!c) continue;
      // A populated galaxy owns more than a thousand cycles. Compact positional rows avoid
      // allocating and structured-cloning ~20 named properties for every entry during autosave.
      // deserializeCycles still accepts the original object map indefinitely.
      sOut.push([
        c.cmdtyId || cid, c.regime, c.family,
        c.phase, c.frequency, c.amplitude, c.bias, c.slope,
        c.a, c.b, c.c, c.pivot,
        c.amp2, c.freq2, c.phase2,
        c.amp3, c.freq3, c.phase3,
        c.regimeStartT, c.regimeEndT,
      ]);
    }
    out[sid] = sOut;
  }
  return out;
}

export function deserializeCycles(state, data) {
  const cycles = ensureCyclesContainer(state);
  if (!cycles) return;
  for (const sid in data || {}) {
    cycles[sid] = {};
    const station = data[sid];
    if (Array.isArray(station)) {
      for (const row of station) {
        if (!Array.isArray(row) || !row[0]) continue;
        const cid = row[0];
        cycles[sid][cid] = normalizeCycle({
          cmdtyId: cid, regime: row[1], family: row[2],
          phase: row[3], frequency: row[4], amplitude: row[5], bias: row[6], slope: row[7],
          a: row[8], b: row[9], c: row[10], pivot: row[11],
          amp2: row[12], freq2: row[13], phase2: row[14],
          amp3: row[15], freq3: row[16], phase3: row[17],
          regimeStartT: row[18], regimeEndT: row[19],
        }, cid);
      }
      continue;
    }
    for (const cid in station || {}) {
      cycles[sid][cid] = normalizeCycle(station[cid], cid);
    }
  }
}

// Test / debug helpers (not required by runtime).
export const _test = Object.freeze({
  REGIME_MIN_S,
  REGIME_MAX_S,
  PERIOD_LO_S,
  PERIOD_HI_S,
  pickWeighted,
  periodToFreq,
});
