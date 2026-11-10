# Wave-4 Lane Report — Worker-Side Sim Partition (REJECTED — no kernel clears cost × isolation)

Lane question: *can a deterministic sim kernel (economy ticks, AI planners, discovery scan)
move off the main thread while the golden stays bit-identical and the wall-clock improves?*

Branch: `devin/1790659780-w4-workersim` off `origin/master` (b34f91e92).

## Verdict — REJECT (no candidate clears both conjuncts)

The lane gate is conjunctive: kernel ≳5 ms per invocation **and** isolated state, under
provable determinism (worker output bit-identical, replay-order preserved). Measured:

- **Economy `econTick` is the only kernel over the time bar** (~19.2 ms per invocation,
  ~2× per 720-tick run, plus ~30 ms/run in the `save:loaded` → `refreshAllPersistentDemand`
  reseed) — and it fails isolation catastrophically: `quote()`/`execute()` are a public
  synchronous trade API that lazily mutates economy state **on read paths** (including rng
  draws), and ~10 listener families exchange same-tick bus traffic with it.
- **Every other candidate is 16–250× under the time bar**: physics.update 0.31 ms/tick,
  flight 0.08, scenarioRuntime 0.05, discovery/classify ~0.06, combat 0.02, weapons 0.011;
  AI planners emit zero frames in the 47a golden (no AI ships) and ~0.11 ms/tick in the
  sibling production probe.

This lane *is* the corpus's pending measurement: PERF_CORPUS_CLOSURE gates the phase-14
worker transport behind "PQ-067 — spike must prove copy < savings." The copy/savings
measurement is now done; the answer is no for every candidate at 47a scale.

## Kernel census (self-time)

`node --cpu-prof` on the real golden command
(`run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --hash --repeat 20 --reload-at 600`,
21 × 720 = 15,120 sim ticks profiled, node v24.0.1):

| Frame | self ms | belongs to |
|---|---|---|
| `pricePointAt` (economy.js:498) | 1205.5 | economy kernel (recompute + seed) |
| `sanitize` (simSnapshot.js:323) | 655.0 | harness: golden snapshot |
| `clonePlain` (scenarioRuntime.js:830) | 542.1 | harness: evidence snapshot |
| `computeTranslationControl` (flightDynamics.js:410) | 522.6 | flight kernel |
| (garbage collector) | 475.9 | — |
| `__wrap` + wasm + `__destroy_into_raw` (rapier.mjs) | ~700 | physics kernel |
| `classifyWorld` (activityRuntime.js:849) | 344.8 | discovery scan |
| `safeStringify` (saveSystem.js:4770) | 325.9 | harness: save serialize |
| `_stepFixed` (sg02DynamicBodyOwner.js:682) | 248.8 | physics kernel |
| `rawCycleFactorAt` (economyCycles.js:318) | 236.0 | economy kernel |
| `priceMult` (economy.js:419) | 228.5 | economy kernel |
| `step` self (sim.js:159) | 165.1 | orchestration |
| `sweepProjectiles` (physics.js:717) | 153.2 | physics kernel |
| `ensureActivityClassified` (activityRuntime.js:1112) | 144.0 | discovery scan |
| `canonicalStringify` (simSnapshot.js:263) | 130.7 | harness: golden hash |
| `writePhysicsTelemetry` (physicsAuthority.js:175) | 127.5 | telemetry |
| `seedPriceHistory` (economy.js:1234) | 103.9 | economy kernel |

Top self frames decompose into three classes: **sim kernels** (economy, flight, physics,
discovery), **harness machinery** (snapshot+hash+save ≈ 1,650 ms — the measurement path
itself, not offloadable sim work), and **loader/GC** (~860 ms compile+realm+GC, startup).

Inclusive per-invocation budget (all 21 runs):

| Kernel | inclusive total | invocations | per invocation | verdict |
|---|---|---|---|---|
| `econTick` | 805.9 ms | 42 (2/run) | **~19.2 ms** | over time bar, fails isolation |
| `save:loaded` → `refreshAllPersistentDemand` | 632.9 ms | 21 | ~30.1 ms | same state object, same failure |
| `physics.update` | ~4,671 ms | 15,120 | 0.31 ms | 16× under bar |
| `flight.update` | 1,212.6 ms | 15,120 | 0.08 ms | 63× under |
| `scenarioRuntime.update` | 759.5 ms | 15,120 | 0.05 ms | 100× under |
| `combat.update` | 326.2 ms | 15,120 | 0.02 ms | 250× under |
| `weapons.update` | 168.8 ms | 15,120 | 0.011 ms | 450× under |
| `classifyWorld`/`ensureActivityClassified` (discovery) | ~1,623 ms | bursty | ~0.11 ms avg | ~45× under; poseTable SoA lives on `w4-integrate`, not master |
| tacticalAI / aiPorts / aiEncounter | 0 frames | 0 | — | absent from golden; ~0.11 ms/tick in sibling w4-jobsys probe |

`sim.step` inclusive 8,572.9 ms over 15,120 ticks ≈ 0.57 ms/tick — the whole sim is
sub-millisecond per tick; only the two economy spikes (econTick, save:loaded reseed)
and the per-run snapshot+reload path carry any per-invocation mass.

## Serialization cost model (measured, this box)

Real economy payload captured in-sim at the first econTick (tick 301) via a temporary
env-gated probe (reverted): **177,635 cloneable bytes, 6,223 object nodes** —
`markets` 135.7 KB / 6,123 nodes (2 stations, 90 listings, each with a ~64-row `{t,mid}`
history) + `cycles` 41.7 KB / 93 nodes. `state.economy.rng` is a function → raw
`structuredClone(state.economy)` throws `DataCloneError`; transport needs an explicit
projection regardless.

Measured on `worker_threads` with that real payload (60 RT iterations):

| Transport step | median | p90 | note |
|---|---|---|---|
| `structuredClone` (main, in-sim GC pressure) | 6.10 ms | — | standalone re-bench: 2.70 ms |
| `postMessage` send (sync portion) | 0.99 ms | 1.07 | includes serializer run |
| Full RT send→worker-deserialize→reply | 3.11 ms | 3.82 | one direction of state only |
| Atomics SAB signal RT | 0.057 ms | 0.506 | jitter too big for per-tick pacing |

Literature anchors for the shape: clone cost tracks **object count, not bytes** —
~0.7 ms/MB for flat typed arrays vs ~9.4–11 ms for 20k flat objects and ~26 ms for a
50k-node tree; `Transferable` bypass ≈ 0.02 ms/MB. The economy payload is the worst
shape (many small objects, Map-like nesting, string keys). SAB+Atomics removes the copy
but requires a hand-packed layout the current nested state does not have — that is the
phase-14/15 SoA rewrite, gated on `entityList` being emptied first.

## Why each candidate fails

### Economy — over the time bar, fails isolation (fatal)

- **Synchronous mutating public API**: `quote(stationId, commodityId, side, qty)` and
  `execute()` are called live by the UI between ticks (documented "public trade API; UI
  calls quote() live"). Reads lazily mutate: `ensureMarket` builds missing markets and
  `getCycleCore(() => this._rng())` draws from the economy-private rng stream *on read
  paths*. A worker-resident economy must answer these reads mid-tick via async IPC —
  delivery order then depends on event-loop/OS scheduling → replay order unprovable.
- **Same-tick bus traffic in both directions**: `grantCredits` / `chargeCredits` /
  `payBounty` / `marketOpened` / `applyTradePressure` arrive as commands; `economy:tick`
  and `economy:tradeCompleted` go out to uniqueWrecks, missions, story, factions, claims,
  onboarding, sectorSim, and ui/priceHistory — ~10 listener families reading state
  wholesale. Economy is the sole credits writer, so every money mutation round-trips.
- **No overlap to harvest**: economy runs near the end of the system order; in an
  econTick tick only missions+story trail it (~0.09 ms combined). The only
  contract-preserving form is **block the main thread on the reply at the same tick
  point** → adds ~3–6 ms transport+deser overhead against zero overlap → net regression.
  The alternative — apply the result one tick later — changes emit ordering and the
  sim trajectory → golden hash moves → lane contract forbids it.
- Honest non-worker alternative (flagged, not implemented — also moves the hash, so it
  is a separate lane's call): `seedPriceHistory`/`refreshAllPersistentDemand` reseed
  ~30 ms/run inside `save:loaded` and inside the live tick; the campaign's proven
  cohort-straddle slicing pattern could amortize that on the main thread.

### Physics — 0.31 ms/tick, 16× under; state not cloneable

Rapier's WASM world cannot cross `postMessage` at all; offload means hosting the entire
`stepWorld` in the worker and streaming all inputs/results per tick (the architecture
Rapier's own docs suggest for render-bound web apps). Transport alone exceeds the kernel
by an order of magnitude, and every downstream same-tick reader (flight, combat,
scenarioRuntime predicates) would need the result synchronously anyway.

### AI planners — absent from golden, ~45× under in production

tacticalAI/aiPorts/aiEncounter emit zero frames in 47a (no AI ships). The sibling
w4-jobsys production probe puts tacticalAI at ~0.11 ms/tick. Isolation is the *most
plausible* of any candidate (worker-resident AI state fed a packed pose snapshot is
exactly the phase-15 shape), but the kernel is ~45× below the bar — revisit only when
actor counts push per-tick AI past ~5 ms, which is the documented PQ-067 precondition.

### Discovery scan — ~45× under; SoA not on master

`classifyWorld`/`ensureActivityClassified` ≈ 1.6 s inclusive across 15,120 ticks
(~0.11 ms/tick, bursty). The `poseTable` SoA this lane was pointed at exists only on
`origin/devin/1790650280-w4-integrate` (commit `0edf3b7e4`), not on master — and the
scan it accelerates is already sub-ms here.

### Harness serialization — not sim work

`sanitize`/`canonicalStringify`/`safeStringify`/`clonePlain` (~1.65 s combined self) are
the golden snapshot/hash/save machinery plus scenario evidence copies. Hashing *is* the
measurement; cloning for a worker pays the same clone twice.

## Determinism analysis

- ECMA-262 leaves `Math.*` precision implementation-defined but deterministic per engine;
  `worker_threads` and Electron `Worker`s run the same V8 build as the main thread, so a
  same-input kernel is bit-identical per thread. FP is not the blocker — **ordering is**.
- `postMessage` delivery is event-loop-scheduled: applying worker output "when it
  arrives" makes downstream rng draws and emit order a function of OS scheduling →
  replay-order violation by construction. The only bit-identical application points are
  fixed points in the tick, i.e. blocking waits — which erase the overlap that justified
  the worker. This matches the lockstep literature: threaded deterministic sims diverge
  on ordering, not arithmetic (Stray Pixels' *Wizard with a Gun* divergence postmortem;
  Photon's lockstep write-ups).
- SAB+Atomics (the existing `src/core/simWorker*.js` phase-14 seam) removes copy cost but
  not the ordering problem — a completion flag still has to be awaited at a fixed tick
  point. `crossOriginIsolated` is already satisfied in both contexts (gameServer.cjs
  sets COOP `same-origin` + COEP `credentialless`; Electron loads via that same server;
  node has SAB natively), so transport is *available* — it just does not pay.

## Research

- **Structured-clone benchmarks** (javascript-web-workers.com, "Speed up your web app
  with web workers" measurement series): ~0.7 ms/MB flat typed arrays; ~9.4–11 ms for
  20k flat objects; ~26 ms for a 50k-node tree; ~48 ms for a 100k-entry Map;
  `Transferable` ~0.02 ms/MB. Object-count-bound — confirmed in-situ above.
- **Stray Pixels, "Engineering Wizard with a Gun — State Divergences"**: shipping a
  deterministic lockstep game with multithreaded internals — divergences traced to
  container iteration order and scheduling, not float math; ordering must be pinned.
- **Photon / Bannermen lockstep articles**: deterministic replay requires inputs gated
  to fixed tick boundaries; results applied on arrival violate the model.
- **MDN `Math` / ECMA-262**: implementation-dependent precision — bit-identical only
  within one engine build; satisfied here (same V8 on both threads) but worth pinning
  in any future worker contract test.
- **MDN SharedArrayBuffer / crossOriginIsolated**: SAB requires COOP+COEP; already set
  on `scripts/lib/gameServer.cjs` responses (the same server Electron uses), so the
  SAB seam is legal in both hosts — cost, not capability, is the blocker.
- **Rapier.js docs**: recommend worker offload for render-bound web apps; this sim host
  is authoritative (also runs headless in node), so offload pushes the authority across
  an IPC boundary every tick — backwards for a 0.31 ms/tick kernel.

## No patch — what a compliant version would require

A bit-identical econTick offload needs: async or pre-snapshot versions of
`quote`/`execute`/`ensureMarket`/`getCycleCore` (touches every UI caller and the
rng-on-read semantics), all credits-mutating bus commands routed through the worker
boundary in-tick, listener fan-out frozen into the payload, and application at a fixed
tick point. That blocking shape costs ~+3–6 ms per econTick over the ~19 ms kernel with
~0.09 ms of same-tick work to overlap — a regression; the deferred shape moves the hash.
Production scale does not rescue it: kernel and payload grow together (~2:1 ratio).

## Metrics

- **Golden 47a**: `sha256 == cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885`,
  `deterministic: true`, exit 0 — zero code change on the branch (probe reverted);
  ~13.2 s wall for the 20-repeat command.
- **A/B wall-clock**: N/A — no patch.
- Reproduction artifacts (`.prof/`, uncommitted scratch): `sim47a.cpuprofile`,
  `econ-state.json` (the real 177,635-byte payload), `worker-rt-bench.mjs` (transport
  bench, ~60 RT iterations).

## Revisit conditions

Reopen when any of: (a) a kernel exceeds ~5 ms/invocation with isolated state —
most plausibly tacticalAI once actor counts grow, or economy *if* the quote/read paths
are first refactored to pure snapshots; (b) the PQ-067 gate's preconditions land
(`entityList` emptied → far-actor SoA + SAB triple-buffer make the payload the
cheap shape); or (c) the deterministic-async contract is renegotiated so deferred
application is legal (it is not, under the current golden).
