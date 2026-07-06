// economyCycles.js — hidden regional price cycles that make market charts readable and
// partially predictable. Cycles are per-station, per-commodity, seeded/deterministic, and mutate
// their regime infrequently so the player can learn the current wave and plan trades.
//
// This module is pure math + state helpers; it never touches the bus or sim directly.
// The economy system owns the lifecycle (create on market init, advance on tick).

import { COMMODITIES } from '../data/commodities.js';

const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const TAU = Math.PI * 2;

// Tunables. Frequencies are very slow (cycles measured in minutes of sim time).
const REGIME_MIN_S = 180;        // min seconds before a cycle can re-roll
const REGIME_MAX_S = 420;        // max seconds before a cycle will re-roll
const FREQUENCY_LO = 0.0004;     // rad/s  -> period ~4.4 min
const FREQUENCY_HI = 0.0018;     // rad/s  -> period ~58 s
const AMPLITUDE_LO = 0.07;       // ±7% of base price
const AMPLITUDE_HI = 0.32;       // ±32% of base price
const BIAS_LO = -0.12;
const BIAS_HI = 0.12;
const FACTOR_CLAMP = [0.62, 1.52];

export const CYCLE_REGIMES = Object.freeze([
  'stable',      // low amplitude, readable
  'volatile',    // high amplitude, fast
  'rising',      // positive bias
  'falling',     // negative bias
  'turbulent',   // mixed
]);

const REGIME_PRESETS = {
  stable:   { ampRange: [0.07, 0.14], freqRange: [0.0005, 0.0009], biasRange: [-0.04, 0.04] },
  volatile: { ampRange: [0.20, 0.34], freqRange: [0.0012, 0.0020], biasRange: [-0.08, 0.08] },
  rising:   { ampRange: [0.10, 0.20], freqRange: [0.0006, 0.0011], biasRange: [0.06, 0.14] },
  falling:  { ampRange: [0.10, 0.20], freqRange: [0.0006, 0.0011], biasRange: [-0.14, -0.06] },
  turbulent:{ ampRange: [0.14, 0.26], freqRange: [0.0009, 0.0016], biasRange: [-0.10, 0.10] },
};

function lerp(a, b, t) { return a + (b - a) * t; }
function randRange(rng, lo, hi) { return lo + rng() * (hi - lo); }
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

/** Build or reset a cycle for a station+commodity. Uses the commodity volatility to weight amplitude. */
export function createCycle(rng, def, simTime) {
  simTime = Math.max(0, Number(simTime) || 0);
  const regime = pick(rng, CYCLE_REGIMES);
  const preset = REGIME_PRESETS[regime];
  const vol = def && def.volatility > 0 ? def.volatility : 0.25;
  // Higher-volatility commodities get larger amplitudes.
  const volAmp = lerp(preset.ampRange[0], preset.ampRange[1], clamp(vol / 0.6, 0, 1));
  const amp = randRange(rng, preset.ampRange[0], volAmp);
  const freq = randRange(rng, preset.freqRange[0], preset.freqRange[1]);
  const bias = randRange(rng, preset.biasRange[0], preset.biasRange[1]);
  const phase = rng() * TAU;
  return {
    regime,
    phase,
    frequency: freq,
    amplitude: amp,
    bias,
    regimeStartT: simTime,
    regimeEndT: simTime + randRange(rng, REGIME_MIN_S, REGIME_MAX_S),
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

/** Get (or lazily create) the cycle for a station+commodity. */
export function getCycle(state, stationId, cmdtyId, rng, simTime) {
  const stationCycles = ensureStationCycles(state, stationId);
  if (!stationCycles) return null;
  let c = stationCycles[cmdtyId];
  if (!c) {
    const def = CMDTY_BY_ID.get(cmdtyId);
    c = createCycle(rng, def, simTime);
    stationCycles[cmdtyId] = c;
  }
  return c;
}

/** Compute the cycle multiplier at a given simTime. Pure. */
export function cycleFactorAt(cycle, simTime) {
  if (!cycle) return 1;
  const elapsed = Math.max(0, simTime - cycle.regimeStartT);
  const angle = cycle.phase + cycle.frequency * elapsed;
  const raw = 1 + cycle.bias + cycle.amplitude * Math.sin(angle);
  return clamp(raw, FACTOR_CLAMP[0], FACTOR_CLAMP[1]);
}

/** Maybe re-roll the cycle if its regime has expired. Mutates the cycle object. */
export function maybeAdvanceRegime(cycle, rng, simTime) {
  if (!cycle || simTime < cycle.regimeEndT) return cycle;
  const def = CMDTY_BY_ID.get(cycle.cmdtyId);
  const next = createCycle(rng, def, simTime);
  // Preserve cmdtyId if it was stashed.
  if (cycle.cmdtyId) next.cmdtyId = cycle.cmdtyId;
  return next;
}

/** Predict future mid-price curve from current market state. Returns array of {t, mid}. */
export function predictPriceCurve(state, stationId, cmdtyId, steps = 24, stepS = 5) {
  const econ = state && state.economy;
  const market = econ && econ.markets && econ.markets[stationId];
  const entry = market && market[cmdtyId];
  const def = CMDTY_BY_ID.get(cmdtyId);
  if (!entry || !def) return [];
  const cycle = getCycle(state, stationId, cmdtyId, null, state.simTime || 0);
  const out = [];
  const now = Math.max(0, state.simTime || 0);
  for (let i = 1; i <= steps; i++) {
    const t = now + i * stepS;
    // Hold current equilibrium; events may change by then but prediction is "if the current
    // regime holds". That is exactly what makes the chart skill-based.
    const factor = cycleFactorAt(cycle, t);
    const eq = entry.equilibrium * factor;
    const mid = def.basePrice * Math.pow(Math.max(eq, 1) / entry.baseEq, -def.elasticity);
    out.push({ t, mid: Math.round(mid) });
  }
  return out;
}

/** Human-readable label for a cycle regime. */
export function regimeLabel(regime) {
  switch (regime) {
    case 'stable': return 'Stable demand';
    case 'volatile': return 'Volatile pricing';
    case 'rising': return 'Rising demand';
    case 'falling': return 'Cooling demand';
    case 'turbulent': return 'Turbulent market';
    default: return 'Cyclic pricing';
  }
}

/** Cycle data for serialization (lightweight). */
export function serializeCycles(state) {
  const cycles = state && state.economy && state.economy.cycles;
  if (!cycles) return {};
  const out = {};
  for (const sid in cycles) {
    const station = cycles[sid];
    const sOut = {};
    for (const cid in station) {
      const c = station[cid];
      sOut[cid] = {
        cmdtyId: c.cmdtyId || cid,
        regime: c.regime,
        phase: c.phase,
        frequency: c.frequency,
        amplitude: c.amplitude,
        bias: c.bias,
        regimeStartT: c.regimeStartT,
        regimeEndT: c.regimeEndT,
      };
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
    for (const cid in data[sid]) {
      cycles[sid][cid] = { ...data[sid][cid], cmdtyId: data[sid][cid].cmdtyId || cid };
    }
  }
}
