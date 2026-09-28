// W4 lane microbenchmark: seedPriceHistory inner kernel — baseline vs hoisted-JS vs wasm batch.
// Replicates pricePointAt/applyCycleToMid/cycleFactorAt semantics bit-exactly (0/25600 mid
// mismatches, Object.is-compared) — the wasm variant imports Math.sin/Math.log so the libm
// calls are literally the same functions the JS path uses.
// Usage: node scripts/w4-wasm-kernel-bench.mjs   (requires devDep wabt)
import { performance } from 'node:perf_hooks';
import wabtInit from 'wabt';

import { applyPersistentDemand } from '../src/economy/demandModel.js';
import { applyCycleToMid } from '../src/systems/economyCycles.js';

const round = Math.round;
const HISTORY_POINT_LIMIT = 64;
const HISTORY_SAMPLE_S = 15;
const HISTORY_SPAN_S = HISTORY_SAMPLE_S * (HISTORY_POINT_LIMIT - 1);

// Copied verbatim from systems/economy.js — priceMult for economyMidPrice.
const PRICE_MULT_LO = 0.25, PRICE_MULT_HI = 4;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
function priceMult(stock, baseEq, elasticity) {
  return clamp(Math.pow(Math.max(stock, 1) / baseEq, -elasticity), PRICE_MULT_LO, PRICE_MULT_HI);
}
function economyMidPrice(def, stock, baseEq) {
  return def.basePrice * priceMult(stock, baseEq, def.elasticity);
}

// ---------- baseline: exact pricePointAt from economy.js:469 ----------
function pricePointAt(entry, def, cycle, t, origin) {
  const stockMid = economyMidPrice(def, entry.stock, entry.baseEq);
  const persistentMid = applyPersistentDemand(stockMid, entry && entry.demandMult);
  const mid = Math.max(1, round(cycle
    ? applyCycleToMid(def.basePrice, persistentMid, cycle, t)
    : persistentMid));
  const point = { t: Number(t) || 0, mid };
  if (origin === 'modelled' || origin === 'observed') {
    Object.defineProperty(point, 'origin', { value: origin, enumerable: false, writable: true });
  }
  return point;
}
function seedBaseline(entry, def, cycle, simTime) {
  const now = Number(simTime) || 0;
  const history = [];
  for (let i = 0; i < HISTORY_POINT_LIMIT; i++) {
    const t = now - HISTORY_SPAN_S + i * HISTORY_SAMPLE_S;
    history.push(pricePointAt(entry, def, cycle, t, 'modelled'));
  }
  return history;
}

// ---------- variant B: hoisted invariants (stockMid/persistentMid per listing) ----------
function seedHoisted(entry, def, cycle, simTime) {
  const now = Number(simTime) || 0;
  const stockMid = economyMidPrice(def, entry.stock, entry.baseEq);
  const persistentMid = applyPersistentDemand(stockMid, entry && entry.demandMult);
  const basePrice = def.basePrice;
  const history = [];
  for (let i = 0; i < HISTORY_POINT_LIMIT; i++) {
    const t = now - HISTORY_SPAN_S + i * HISTORY_SAMPLE_S;
    const mid = Math.max(1, round(cycle ? applyCycleToMid(basePrice, persistentMid, cycle, t) : persistentMid));
    const point = { t, mid };
    Object.defineProperty(point, 'origin', { value: 'modelled', enumerable: false, writable: true });
    history.push(point);
  }
  return history;
}

// ---------- variant C: hoisted + prototype-origin points ----------
const MODELLED_PROTO = Object.freeze(
  Object.defineProperty(Object.create(null), 'origin', { value: 'modelled', enumerable: false }));
function makeModelledPoint(t, mid) {
  const p = Object.create(MODELLED_PROTO);
  p.t = t; p.mid = mid;
  return p;
}
function seedHoistedProto(entry, def, cycle, simTime) {
  const now = Number(simTime) || 0;
  const stockMid = economyMidPrice(def, entry.stock, entry.baseEq);
  const persistentMid = applyPersistentDemand(stockMid, entry && entry.demandMult);
  const basePrice = def.basePrice;
  const history = [];
  for (let i = 0; i < HISTORY_POINT_LIMIT; i++) {
    const t = now - HISTORY_SPAN_S + i * HISTORY_SAMPLE_S;
    const mid = Math.max(1, round(cycle ? applyCycleToMid(basePrice, persistentMid, cycle, t) : persistentMid));
    history.push(makeModelledPoint(t, mid));
  }
  return history;
}

// ---------- variant D: wasm batch series eval ----------
// Param layout (f64 slots at byte 0): cycle scalars 0..17, blend flags 18..20, blendFrom 21..38,
// constants 40..44. Out mids written as f64 at OUT_BYTE.
const P = {
  regimeStartT: 0, regimeEndT: 1, amp: 2, bias: 3, phase: 4, freq: 5,
  slope: 6, a: 7, b: 8, c: 9, pivot: 10, amp2: 11, phase2: 12, freq2: 13,
  amp3: 14, phase3: 15, freq3: 16, family: 17,
  hasBlend: 18, blendStartT: 19, blendEndT: 20, blendFrom: 21, // 18 slots -> 21..38
  weight: 40, factorLo: 41, factorHi: 42, midLoMult: 43, midHiMult: 44,
};
const PARAM_F64 = 45;
const OUT_BYTE = PARAM_F64 * 8; // 360

const FAMILY_CODE = {
  stable: 0, sine: 0, rising: 1, falling: 1, quadratic: 2,
  cubic: 3, sqrt: 4, log: 5, volatile: 6, turbulent: 7,
};

const WAT = `
(module
  (import "env" "sin" (func $sin (param f64) (result f64)))
  (import "env" "log" (func $log (param f64) (result f64)))
  (memory (export "memory") 1)
  (func $p (param $base i32) (param $idx i32) (result f64)
    (f64.load (i32.shl (i32.add (local.get $base) (local.get $idx)) (i32.const 3))))
  (func $finite (param $x f64) (result i32)
    (i32.and
      (f64.eq (local.get $x) (local.get $x))
      (f64.le (f64.abs (local.get $x)) (f64.const inf))))
  (func $clamp (param $v f64) (param $lo f64) (param $hi f64) (result f64)
    (if (result f64) (f64.lt (local.get $v) (local.get $lo))
      (then (local.get $lo))
      (else (if (result f64) (f64.gt (local.get $v) (local.get $hi))
        (then (local.get $hi)) (else (local.get $v))))))
  (func $term (param $fam i32) (param $p i32) (param $elapsed f64) (param $u f64)
              (param $amp f64) (param $wave f64) (result f64)
    (local $x f64) (local $k f64)
    (if (i32.eq (local.get $fam) (i32.const 1))
      (then (return (f64.add (f64.mul (call $p (local.get $p) (i32.const 6)) (local.get $elapsed))
                             (f64.mul (local.get $amp) (local.get $wave))))))
    (if (i32.eq (local.get $fam) (i32.const 2))
      (then
        (local.set $x (f64.sub (local.get $u) (call $p (local.get $p) (i32.const 10))))
        ;; JS a*x*x is left-assoc: (a*x)*x
        (return (f64.add
          (f64.add (f64.mul (f64.mul (call $p (local.get $p) (i32.const 7)) (local.get $x)) (local.get $x))
                   (f64.mul (call $p (local.get $p) (i32.const 8)) (local.get $x)))
          (f64.mul (local.get $amp) (local.get $wave))))))
    (if (i32.eq (local.get $fam) (i32.const 3))
      (then
        (local.set $x (f64.sub (local.get $u) (f64.const 0.5)))
        ;; JS c*x*x*x is ((c*x)*x)*x; a*x*x is (a*x)*x
        (return (f64.add
          (f64.add
            (f64.add (f64.mul (f64.mul (f64.mul (call $p (local.get $p) (i32.const 9)) (local.get $x)) (local.get $x)) (local.get $x))
                     (f64.mul (f64.mul (call $p (local.get $p) (i32.const 7)) (local.get $x)) (local.get $x)))
            (f64.mul (call $p (local.get $p) (i32.const 8)) (local.get $x)))
          (f64.mul (local.get $amp) (local.get $wave))))))
    (if (i32.eq (local.get $fam) (i32.const 4))
      (then (return (f64.add
        (f64.mul (call $p (local.get $p) (i32.const 9)) (f64.sqrt (f64.max (f64.const 0) (local.get $u))))
        (f64.mul (local.get $amp) (local.get $wave))))))
    (if (i32.eq (local.get $fam) (i32.const 5))
      (then
        (local.set $k (if (result f64) (f64.gt (call $p (local.get $p) (i32.const 7)) (f64.const 0))
          (then (call $p (local.get $p) (i32.const 7))) (else (f64.const 4))))
        ;; JS gain * log(x) / log(y) is left-assoc: (gain * log(x)) / log(y)
        (return (f64.add
          (f64.div
            (f64.mul (call $p (local.get $p) (i32.const 9))
              (call $log (f64.add (f64.const 1) (f64.mul (local.get $k) (f64.max (f64.const 0) (local.get $u))))))
            (call $log (f64.add (f64.const 1) (local.get $k))))
          (f64.mul (local.get $amp) (local.get $wave))))))
    (if (i32.eq (local.get $fam) (i32.const 6))
      (then (return (f64.add
        (f64.mul (local.get $amp) (local.get $wave))
        (f64.mul (call $p (local.get $p) (i32.const 11))
          (call $sin (f64.add (call $p (local.get $p) (i32.const 12))
            (f64.mul (call $p (local.get $p) (i32.const 13)) (local.get $elapsed)))))))))
    (if (i32.eq (local.get $fam) (i32.const 7))
      (then (return (f64.add
        (f64.add (f64.mul (local.get $amp) (local.get $wave))
          (f64.mul (call $p (local.get $p) (i32.const 11))
            (call $sin (f64.add (call $p (local.get $p) (i32.const 12))
              (f64.mul (call $p (local.get $p) (i32.const 13)) (local.get $elapsed))))))
        (f64.mul (call $p (local.get $p) (i32.const 14))
          (call $sin (f64.add (call $p (local.get $p) (i32.const 15))
            (f64.mul (call $p (local.get $p) (i32.const 16)) (local.get $elapsed)))))))))
    (f64.mul (local.get $amp) (local.get $wave)))
  (func $rawFactor (param $p i32) (param $t f64) (result f64)
    (local $start f64) (local $end f64) (local $elapsed f64) (local $u f64)
    (local $amp f64) (local $wave f64)
    (local $fam i32)
    (local.set $start (call $p (local.get $p) (i32.const 0)))
    (local.set $end (f64.max (f64.add (local.get $start) (f64.const 1)) (call $p (local.get $p) (i32.const 1))))
    (local.set $elapsed (f64.max (f64.const 0) (f64.sub (local.get $t) (local.get $start))))
    (local.set $u (f64.div (local.get $elapsed) (f64.sub (local.get $end) (local.get $start))))
    (local.set $amp (call $p (local.get $p) (i32.const 2)))
    (local.set $wave (call $sin (f64.add (call $p (local.get $p) (i32.const 4)) (f64.mul (call $p (local.get $p) (i32.const 5)) (local.get $elapsed)))))
    (local.set $fam (i32.trunc_f64_s (call $p (local.get $p) (i32.const 17))))
    ;; raw = 1 + bias + term   (term computed in one nested expr to keep JS add grouping)
    (f64.add
      (f64.add (f64.const 1) (call $p (local.get $p) (i32.const 3)))
      (call $term (local.get $fam) (local.get $p) (local.get $elapsed) (local.get $u)
            (local.get $amp) (local.get $wave))))
  (func $factor (param $p i32) (param $t f64) (result f64)
    (local $raw f64) (local $f f64) (local $oldRaw f64) (local $oldF f64)
    (local $blended i32) (local $bs f64) (local $be f64)
    (local.set $raw (call $rawFactor (local.get $p) (local.get $t)))
    (if (i32.eqz (call $finite (local.get $raw))) (then (return (f64.const 1))))
    (local.set $f (call $clamp
      (f64.add (f64.const 1) (f64.mul (f64.sub (local.get $raw) (f64.const 1)) (call $p (local.get $p) (i32.const 40))))
      (call $p (local.get $p) (i32.const 41))
      (call $p (local.get $p) (i32.const 42))))
    ;; blendRegimeFactor
    (local.set $bs (call $p (local.get $p) (i32.const 19)))
    (local.set $be (call $p (local.get $p) (i32.const 20)))
    (local.set $blended
      (i32.and (f64.gt (call $p (local.get $p) (i32.const 18)) (f64.const 0.5))
        (i32.and (f64.gt (local.get $be) (local.get $bs))
          (i32.and (f64.ge (local.get $t) (local.get $bs))
                   (f64.le (local.get $t) (local.get $be))))))
    (if (local.get $blended)
      (then
        (local.set $oldRaw (call $rawFactor (i32.add (local.get $p) (i32.const 21)) (local.get $t)))
        (if (call $finite (local.get $oldRaw))
          (then
            (local.set $oldF (call $clamp
              (f64.add (f64.const 1) (f64.mul (f64.sub (local.get $oldRaw) (f64.const 1)) (call $p (local.get $p) (i32.const 40))))
              (call $p (local.get $p) (i32.const 41))
              (call $p (local.get $p) (i32.const 42))))
            (local.set $f (f64.add (local.get $oldF)
              (f64.mul (f64.sub (local.get $f) (local.get $oldF))
                (f64.div (f64.sub (local.get $t) (local.get $bs))
                         (f64.sub (local.get $be) (local.get $bs))))))))))
    (local.get $f))
  (func (export "series")
      (param $t0 f64) (param $dt f64) (param $count i32) (param $base f64) (param $stock f64)
    (local $i i32) (local $t f64) (local $mid f64) (local $lo f64) (local $hi f64)
    (local.set $lo (f64.mul (local.get $base) (call $p (i32.const 0) (i32.const 43))))
    (local.set $hi (f64.mul (local.get $base) (call $p (i32.const 0) (i32.const 44))))
    (loop $again
      (if (i32.lt_s (local.get $i) (local.get $count))
        (then
          (local.set $t (f64.add (local.get $t0) (f64.mul (f64.convert_i32_s (local.get $i)) (local.get $dt))))
          (local.set $mid (call $clamp
            (f64.mul (local.get $stock) (call $factor (i32.const 0) (local.get $t)))
            (local.get $lo) (local.get $hi)))
          (if (i32.or (f64.le (local.get $mid) (f64.const 0))
                      (i32.eqz (call $finite (local.get $mid))))
            (then (local.set $mid (local.get $base))))
          (f64.store (i32.add (i32.const ${OUT_BYTE}) (i32.shl (local.get $i) (i32.const 3))) (local.get $mid))
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $again)))))
)
`;

async function buildWasm() {
  const wabt = await wabtInit();
  const mod = wabt.parseWat('kernel.wat', WAT);
  const { buffer } = mod.toBinary({ write_debug_names: false });
  const { instance } = await WebAssembly.instantiate(buffer, {
    env: { sin: Math.sin, log: Math.log },
  });
  const mem = instance.exports.memory;
  const params = new Float64Array(mem.buffer, 0, PARAM_F64);
  const out = new Float64Array(mem.buffer, OUT_BYTE, 256);
  return { instance, params, out, mem };
}

// JS-side flatten: same coercions as rawCycleFactorAt's Number(x)||0 reads.
function flattenCycle(cycle, params, dst = 0) {
  const num = (v) => Number(v) || 0;
  const start = Number.isFinite(Number(cycle.regimeStartT)) ? Number(cycle.regimeStartT) : 0;
  const end = Math.max(start + 1, Number(cycle.regimeEndT) || (start + 1500));
  const freq = Number(cycle.frequency) > 0 ? Number(cycle.frequency) : TAU / Math.max(60, 600);
  params[dst + 0] = start; params[dst + 1] = end;
  params[dst + 2] = num(cycle.amplitude); params[dst + 3] = num(cycle.bias);
  params[dst + 4] = num(cycle.phase); params[dst + 5] = freq;
  params[dst + 6] = num(cycle.slope); params[dst + 7] = num(cycle.a);
  params[dst + 8] = num(cycle.b); params[dst + 9] = num(cycle.c);
  params[dst + 10] = Number.isFinite(cycle.pivot) ? cycle.pivot : 0.5;
  params[dst + 11] = num(cycle.amp2); params[dst + 12] = num(cycle.phase2);
  params[dst + 13] = Number(cycle.freq2) || freq * 1.7;
  params[dst + 14] = num(cycle.amp3); params[dst + 15] = num(cycle.phase3);
  params[dst + 16] = num(cycle.freq3); params[dst + 17] = FAMILY_CODE[cycle.family || cycle.regime] ?? 0;
}
const TAU = Math.PI * 2;
const REGIME_MIN_S = 1500;
const CYCLE_WEIGHT = 0.35, CYCLE_FACTOR_LO = 0.88, CYCLE_FACTOR_HI = 1.12;
const CYCLE_MID_LO_MULT = 0.35, CYCLE_MID_HI_MULT = 2.80;

function seedWasm(entry, def, cycle, simTime, wasm) {
  const { instance, params, out } = wasm;
  const now = Number(simTime) || 0;
  const stockMid = economyMidPrice(def, entry.stock, entry.baseEq);
  const persistentMid = applyPersistentDemand(stockMid, entry && entry.demandMult);
  const base = Math.max(1, Number(def.basePrice) || 1);
  const stock = Number.isFinite(persistentMid) && persistentMid > 0 ? persistentMid : base;
  const history = [];
  if (!cycle) {
    for (let i = 0; i < HISTORY_POINT_LIMIT; i++) {
      const t = now - HISTORY_SPAN_S + i * HISTORY_SAMPLE_S;
      const mid = Math.max(1, round(stock));
      const point = { t, mid };
      Object.defineProperty(point, 'origin', { value: 'modelled', enumerable: false, writable: true });
      history.push(point);
    }
    return history;
  }
  flattenCycle(cycle, params, 0);
  params[P.hasBlend] = 0;
  const bf = cycle.blendFrom;
  const bs = Number(cycle.blendStartT), be = Number(cycle.blendEndT);
  if (bf && be > bs) {
    params[P.hasBlend] = 1;
    params[P.blendStartT] = bs; params[P.blendEndT] = be;
    flattenCycle(bf, params, P.blendFrom);
  }
  params[P.weight] = CYCLE_WEIGHT; params[P.factorLo] = CYCLE_FACTOR_LO;
  params[P.factorHi] = CYCLE_FACTOR_HI;
  params[P.midLoMult] = CYCLE_MID_LO_MULT; params[P.midHiMult] = CYCLE_MID_HI_MULT;
  instance.exports.series(now - HISTORY_SPAN_S, HISTORY_SAMPLE_S, HISTORY_POINT_LIMIT, base, stock);
  for (let i = 0; i < HISTORY_POINT_LIMIT; i++) {
    const t = now - HISTORY_SPAN_S + i * HISTORY_SAMPLE_S;
    const mid = Math.max(1, round(out[i]));
    const point = { t, mid };
    Object.defineProperty(point, 'origin', { value: 'modelled', enumerable: false, writable: true });
    history.push(point);
  }
  return history;
}

// Variant E: wasm batch mids + prototype-origin assembly — the decisive A/B against the
// pure-JS structural fix.
function seedWasmProto(entry, def, cycle, simTime, wasm) {
  const { instance, params, out } = wasm;
  const now = Number(simTime) || 0;
  const stockMid = economyMidPrice(def, entry.stock, entry.baseEq);
  const persistentMid = applyPersistentDemand(stockMid, entry && entry.demandMult);
  const base = Math.max(1, Number(def.basePrice) || 1);
  const stock = Number.isFinite(persistentMid) && persistentMid > 0 ? persistentMid : base;
  const history = [];
  if (!cycle) {
    for (let i = 0; i < HISTORY_POINT_LIMIT; i++) {
      const t = now - HISTORY_SPAN_S + i * HISTORY_SAMPLE_S;
      history.push(makeModelledPoint(t, Math.max(1, round(stock))));
    }
    return history;
  }
  flattenCycle(cycle, params, 0);
  params[P.hasBlend] = 0;
  const bf = cycle.blendFrom;
  const bs = Number(cycle.blendStartT), be = Number(cycle.blendEndT);
  if (bf && be > bs) {
    params[P.hasBlend] = 1;
    params[P.blendStartT] = bs; params[P.blendEndT] = be;
    flattenCycle(bf, params, P.blendFrom);
  }
  params[P.weight] = CYCLE_WEIGHT; params[P.factorLo] = CYCLE_FACTOR_LO;
  params[P.factorHi] = CYCLE_FACTOR_HI;
  params[P.midLoMult] = CYCLE_MID_LO_MULT; params[P.midHiMult] = CYCLE_MID_HI_MULT;
  instance.exports.series(now - HISTORY_SPAN_S, HISTORY_SAMPLE_S, HISTORY_POINT_LIMIT, base, stock);
  for (let i = 0; i < HISTORY_POINT_LIMIT; i++) {
    const t = now - HISTORY_SPAN_S + i * HISTORY_SAMPLE_S;
    history.push(makeModelledPoint(t, Math.max(1, round(out[i]))));
  }
  return history;
}

// ---------- harness ----------
function lcg(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

function makeCycle(rng, family, withBlend = false) {
  const cycle = {
    family, amplitude: 0.05 + rng() * 0.3, bias: (rng() - 0.5) * 0.1,
    phase: rng() * TAU, frequency: TAU / (480 + rng() * 960),
    regimeStartT: Math.floor(rng() * 1000) - 500,
    regimeEndT: 1500 + rng() * 3900,
    slope: (rng() - 0.5) * 0.0005, a: rng() * 2 - 1, b: rng() * 2 - 1,
    c: rng() * 0.5, pivot: rng(),
    amp2: rng() * 0.1, phase2: rng() * TAU, freq2: TAU / (180 + rng() * 420),
    amp3: rng() * 0.08, phase3: rng() * TAU, freq3: TAU / (90 + rng() * 270),
  };
  if (withBlend) {
    cycle.blendFrom = makeCycle(rng, 'sine');
    cycle.blendStartT = cycle.regimeStartT + 100;
    cycle.blendEndT = cycle.blendStartT + 600;
  }
  return cycle;
}

async function main() {
  const wasm = await buildWasm();
  const rng = lcg(47);
  const families = ['sine', 'rising', 'falling', 'quadratic', 'cubic', 'sqrt', 'log', 'volatile', 'turbulent'];
  const cases = [];
  for (let i = 0; i < 400; i++) {
    const def = { basePrice: 1 + Math.floor(rng() * 4000), elasticity: 0.2 + rng() * 1.2 };
    const entry = { stock: rng() * 800 + 5, baseEq: 400 + rng() * 400, demandMult: 0.8 + rng() * 0.6 };
    const family = families[i % families.length];
    const cycle = makeCycle(rng, family, i % 9 === 0);
    cases.push({ entry, def, cycle, simTime: 3000 + rng() * 6000 });
  }

  // Correctness: bitwise-compare mids across variants.
  let mismatches = 0;
  for (const c of cases) {
    const a = seedBaseline(c.entry, c.def, c.cycle, c.simTime).map((p) => p.mid);
    const b = seedHoisted(c.entry, c.def, c.cycle, c.simTime).map((p) => p.mid);
    const d = seedWasm(c.entry, c.def, c.cycle, c.simTime, wasm).map((p) => p.mid);
    const e = seedWasmProto(c.entry, c.def, c.cycle, c.simTime, wasm).map((p) => p.mid);
    for (let i = 0; i < a.length; i++) {
      if (!Object.is(a[i], b[i])) { mismatches++; if (mismatches < 5) console.log('B mismatch', c.def.basePrice, i, a[i], b[i]); }
      if (!Object.is(a[i], d[i])) { mismatches++; if (mismatches < 5) console.log('WASM mismatch', c.cycle.family, i, a[i], d[i]); }
      if (!Object.is(a[i], e[i])) { mismatches++; if (mismatches < 5) console.log('WASM+P mismatch', c.cycle.family, i, a[i], e[i]); }
    }
  }
  console.log(`correctness: ${cases.length} cases x 64 pts, mismatches=${mismatches}`);

  const REPS = 40; // 400 listings x 40 = 1.6M points per variant
  function time(name, fn) {
    // warmup
    for (const c of cases.slice(0, 100)) fn(c);
    const t0 = performance.now();
    let acc = 0;
    for (let r = 0; r < REPS; r++) for (const c of cases) acc += fn(c)[31].mid;
    const ms = performance.now() - t0;
    const pts = REPS * cases.length * HISTORY_POINT_LIMIT;
    console.log(`${name.padEnd(18)} ${ms.toFixed(0).padStart(6)} ms   ${(ms * 1e6 / pts).toFixed(1).padStart(7)} ns/pt   (acc=${acc})`);
    return ms;
  }

  time('baseline', (c) => seedBaseline(c.entry, c.def, c.cycle, c.simTime));
  time('hoisted', (c) => seedHoisted(c.entry, c.def, c.cycle, c.simTime));
  time('hoisted+proto', (c) => seedHoistedProto(c.entry, c.def, c.cycle, c.simTime));
  time('wasm-batch', (c) => seedWasm(c.entry, c.def, c.cycle, c.simTime, wasm));
  time('wasm+proto', (c) => seedWasmProto(c.entry, c.def, c.cycle, c.simTime, wasm));
  // second pass to smooth JIT ordering effects
  console.log('--- pass 2 ---');
  time('baseline', (c) => seedBaseline(c.entry, c.def, c.cycle, c.simTime));
  time('hoisted', (c) => seedHoisted(c.entry, c.def, c.cycle, c.simTime));
  time('hoisted+proto', (c) => seedHoistedProto(c.entry, c.def, c.cycle, c.simTime));
  time('wasm-batch', (c) => seedWasm(c.entry, c.def, c.cycle, c.simTime, wasm));
  time('wasm+proto', (c) => seedWasmProto(c.entry, c.def, c.cycle, c.simTime, wasm));
}

main().catch((e) => { console.error(e); process.exit(1); });
