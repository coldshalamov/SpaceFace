# W4 — WASM/Rust hot-kernel revisit: measured verdict

Wave-4 lane. Requirement: MEASURE first, then implement. Verdict up front:

**The only >5% self-time kernel that is a pure numeric loop is the market price-history
seed (`pricePointAt`), and its cost is not arithmetic — it is object-shape churn
(`Object.defineProperty` + `{t, mid}` literal per point). WASM beats the JS kernel
~5.5x in isolation, but ~70% of that win is captured by a pure-JS structural fix
(prototype-inherited `origin` + per-point math hoisting), and the kernel lives on
an init/burst path (market construction, save-load reseed) — never per-frame. Shipped:
the JS restructure (−83% kernel self-time in the golden sim profile, golden hash
byte-identical). NOT shipped: the wasm module — retained with a 5-variant bench as
measured evidence; it does not clear the PQ-083/PQ-091 "per-frame authority, zero
visible change" bar for a sub-millisecond init-path saving.**

## 1. RESEARCH — when WASM beats JIT'd JS in V8

- **Tight FP loops over pre-filled typed arrays are where wasm can win**, but modern
  V8 (Ignition/Sparkplug/Maglev/TurboFan) narrows the gap to near-parity for
  monomorphic numeric JS — Jangda et al., *"Not So Fast: Analyzing the Performance
  of WebAssembly vs. Native Code"* (USENIX ATC'19): wasm ~1.3x JS on SPEC CPU
  workloads, and wasm itself ~45-55% slower than native due to bounds checks and
  call overhead; JS↔wasm call + memory-copy marshaling is a first-order cost.
- The Ostrich suite (McGill, *Numerical computing on the web*; Sidi Mohamed et al.)
  benchmarks exactly this shape — V8 wasm vs JS on kernels like FFT/convolution:
  wasm wins cluster around kernels with regular array access and few transitions;
  JIT'd JS ties where the hot loop already vectorizes/escapes the interpreter.
- ASE'21 *"To JIT or not to JIT"* measured that JIT tiers affect JS execution speed
  but not wasm execution — wasm's win is deterministic-code, not a free lunch.
- **Already in this repo:** `PERF_METHODS_2026-09-26.md` §6 adjudicated the
  Rust/WASM port vs the live-game profile — "no JS island clears the bar; physics
  is already WASM (Rapier)". Rapier's own self-cost in the 47a profile below
  (`wasm-function[37]` + `__wrap` + `__destroy_into_raw` ≈ 361 ms / 5.5%) is the
  price of marshaling + `__destroy_into_raw` bookkeeping — exactly the boundary
  overhead the research warns about.

Conclusion drawn from research + prior repo verdict: a wasm port only pays when
(a) the kernel is a tight numeric loop, (b) it runs often enough to matter, and
(c) batching amortizes the JS↔wasm boundary. This lane measured whether such a
kernel exists.

## 2. MEASURE — self-time instrumentation

`probe-frame-solid.mjs` requires Playwright (a devDep, not installed on this
prod-deps box) — skipped per the lane's "and/or" clause; `--cpu-prof` on the
deterministic sim gives strictly better function-level truth for kernel hunting.

Method: `node --cpu-prof --cpu-prof-dir=.devshots/cpu --cpu-prof-name=w4-sim.cpuprofile
scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json
--repeat 20 --reload-at 600`, then `scripts/w4-profile-selftime.mjs` aggregates
hitCount×sampleInterval per `functionName @ url:line`.

Top self-time, BEFORE (6,636 ms sampled, 1,019 nodes):

| self ms | % | function @ location | numeric loop? |
|---|---|---|---|
| 544 | 8.2% | `pricePointAt` @ economy.js:469 | **YES — sole qualifying kernel** |
| 358 | 5.4% | `sanitize` @ simSnapshot.js:324 | no — recursive structural serializer |
| 262 | 3.9% | `clonePlain` @ scenarioRuntime.js:831 | no — structural clone |
| 238 | 3.6% | (garbage collector) | — |
| 229 | 3.5% | `computeTranslationControl` @ flightDynamics.js:411 | hot but branchy/stateful, and prior lanes own it |
| 190 | 2.9% | `__wrap` @ rapier.mjs | boundary glue, not a loop |
| 180 | 2.7% | `safeStringify` | — |
| 169 | 2.5% | `classifyWorld` | — |
| 127 | 1.9% | `rawCycleFactorAt` @ economyCycles.js:319 | real FP loop but <5% |
| 126 | 1.9% | `seedPriceHistory` | sibling of kernel |
| 98 | 1.5% | `priceMult` | folded into kernel family |

`pricePointAt` at 8.2% is the only function that is both >5% self-time AND a pure
numeric loop. (Caller chain: `seedPriceHistory` ← `ensureMarket` at market build
and `reseedSyntheticPriceHistories` at save-load — an init/burst path, not
per-frame. The sim's init-heavy profile is why it surfaces at 8.2%.)

## 3. IMPLEMENT — A/B self-time, 5 variants

`scripts/w4-wasm-kernel-bench.mjs` replicates the kernel exactly (imports the real
`applyPersistentDemand` / `applyCycleToMid`; 400 synthetic cycle shapes × 64 points;
correctness = bitwise `Object.is` over all 25,600 mids — **0 mismatches** for every
variant). The WAT module is hand-authored in the same file, compiled at runtime via
`wabt` (new devDep). It imports `Math.sin`/`Math.log` — the same libm calls JS uses
— and keeps JS add/mul grouping so f64 IEEE-754 evaluation order is preserved.

ns/point, warm (pass 2; ~1.6M points per variant):

| variant | ns/pt | vs baseline |
|---|---|---|
| baseline (`pricePointAt` verbatim) | 281 | 1.0x |
| hoisted math only | 230 | −18% |
| wasm batch mids + per-point defineProperty | 187 | −33% |
| hoisted + prototype `origin` (**= shipped**) | 77 | −73% |
| wasm batch + prototype `origin` | 51 | −82% |

Read of the decomposition:
- ~60% of baseline cost is **object assembly**: `{t, mid}` literal +
  `Object.defineProperty(origin)` per point. Prototype-inherited `origin`
  (non-enumerable on a null-proto proto, `enumerable:false`/`writable:true` —
  same shape) collapses it to two own-property writes.
- ~20% is per-point math recomputation (`base`, `stock`, `base*mult` bounds) —
  hoisting eliminates it.
- wasm's margin over hoisted JS (~187 vs ~230, and ~51 vs ~77 on top of the
  structural fix) is real — the batch amortizes the JS↔wasm boundary once per
  listing — but it is **~0.6 ms absolute** on a path that fires at market-build /
  save-load, not per frame. Below the bar.

## 4. LANDED CHANGE

`src/systems/economy.js`:
- `PRICE_POINT_PROTOS` — two frozen null-proto prototypes carrying non-enumerable
  writable `origin` ('modelled'/'observed'); `makePricePoint(t, mid, origin)`
  `Object.create(proto)` + own `t`/`mid` writes. Preserves the exact serialized
  shape (`origin` still non-enumerable → invisible to `serializeHistory`,
  still truthy-readable at market.js:267).
- `pricePointsBackfill(entry, def, cycle, t0, sampleS, count, origin)` — the
  backfill loop with hoisted `stockMid`/`persistentMid`/`base`/`midLo`/`midHi`.
- `pricePointAt` kept (delegates to `makePricePoint`) — same math, still used by
  `recordPriceHistory`; `seedPriceHistory` now calls `pricePointsBackfill`.

In-situ self-time, AFTER (6,430 ms sampled): `pricePointAt` exits the top of the
profile; the kernel family (`pricePointsBackfill` 72 + `makePricePoint` ~11 +
`seedPriceHistory` ~10 + `applyCycleToMid` ~8 ms) totals ~100 ms vs ~770 ms
before — **−83% kernel self-time**; run total 6,636→6,430 ms (−3%).

## 5. VERIFY — golden

`node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json
--expect test/47a.telemetry.expected.json --hash --repeat 20 --reload-at 600`
before AND after the change: envelope sha256 `cc9419388b2608d697345bb94a786c41
20cfc21e04365f437e15c4c4c0a4e885` == expected `baselineSha256` — **byte-identical**
(the lane brief's quoted baseline `f3583c50...` does not match the committed
expected envelope; cc9419388b is authoritative on origin/master).

## 6. Verdict vs PERF_METHODS §6

Consistent with §6's adjudication: no JS island clears the bar. This lane adds the
measured nuance: **even where wasm wins (~5.5x on the qualifying kernel, ~30% on
top of the best JS restructure), the absolute win is sub-millisecond on an
init/burst path.** wasm is not landed; the module + bench are committed as
reproducible evidence. Revisit remains gated on a >5% self-time kernel that is
both pure-numeric AND per-frame — current profile's per-frame numeric candidates
(`computeTranslationControl` 3.5%, `rawCycleFactorAt` 2.4%) are below threshold.
