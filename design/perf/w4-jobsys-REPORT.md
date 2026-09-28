# Wave-4 Lane Report — Cooperative Job Scheduler / Work Deferral

Lane question: *is there synchronous main-thread work each frame that could be budgeted
across frames or moved to a worker?*

Branch: `devin/1790605974-w4-jobsys` off `origin/master` (369faae3).

## Verdict

The codebase already implements a cooperative scheduler — time-sliced admission yields
(`COMPILE_PRESENT_SLICE_MS=4`, `ADMISSION_SLICE_TARGET_MS=3`/`HARD_MS=8`,
`createSlicedYield`), bounded background dispatch (`postTaskAtBackgroundPriorityBounded`,
48 ms starvation bound), post-present arming (`armCallbackAfterPresent`), emit slicing
(`drainEmitSlice`), post-present leftover drains (`drainAfterPresentCompile`), calendar-clock
straddle (~46 `tick % 30` cohorts), activity tiers (S0–S4), worker pools for meshopt /
KTX2 / GLB-prepass / SHA-256, HUD cadence clocks, and DOM-write memoization. After profiling,
**no synchronous per-frame chunk above noise remained that was both deferrable and
non-order-dependent — except one pacing defect**: sliced flight admissions resume one
~4 ms slice per *present*, so on degraded cadence a multi-subject serial compile chain
(a convoy batch) is starved for tens of presents while the post-present idle window sits
unspent. This lane patches that pacing minimally and safely (zero behavior change on a
healthy cadence — verified by construction, not by measurement).

Everything else measured is either (a) order-bound deterministic sim (the golden hash
gates it; physics-offload is the documented phase-14 gate PQ-067), (b) the presented
draw itself (OffscreenCanvas transfer is the gated architectural seam), (c) visible
animation (pose sync, HUD), or (d) already cadence/signature-gated residue:
residency polls at 100/250 ms cadences, `plateBox` getBoundingClientRect behind a
500 ms budget, `meshSpatialKeyMatches` memos around `queryAsteroidField`/`queryFarActors`,
write-layer memoization (`_sfText`/`_sfStyle`/`_sfLagQx`), tier1-gated `performance.memory`
sampling.

## Research citations

- **React Scheduler** — deadline + expiration lanes: `shouldYield`/`frameDeadline` and
  per-lane task queues (facebook/react `Scheduler.js`): the pattern of *yield points that
  let the render beat interleave* is exactly what `createSlicedYield`/`yieldToNextPresent`
  implement here.
- **`isInputPending` → `scheduler.yield()`** (MDN/Chrome "optimize long tasks"): the modern
  continuation-primitive — used by `postTaskAtBackgroundPriority` (prefers
  `scheduler.yield()`, falls back to `postTask({priority:'background'})`, then `setTimeout`).
- **WICG `scheduler.postTask` priorities** (user-blocking / user-visible / background):
  the repo's admission lanes map directly — ambient admission = background+bounded,
  on-glass deadline = urgent/`unSliced` lane.
- **`requestIdleCallback` `IdleDeadline.timeRemaining()`** ≤50 ms budget + `didTimeout`
  fallback: the same contract as `drainAfterPresentCompile(remainMs)` /
  `postTaskAtBackgroundPriorityBounded(cb, 48)`.
- **Destiny job-graph (Tatarchuk, GDC 2015)**, **Naughty Dog fibers (Gyrling)**,
  **Chase–Lev work-stealing**, **Unity CooperativeScheduler**: game's "job system" answer —
  for a JS game the browser event loop is the scheduler; fibers aren't available, so the
  honest analogue is macrotask-bounded cooperative slicing, which is what exists.
- **three.js OffscreenCanvas/transferables** guidance + `simWorker.js`/`simWorkerHost.js`
  seam: gated on the measured copy-cost spike (PQ-067 in the corpus closure doc) — not
  justified at current workload; reopening it was explicitly deferred by the wave-3
  closure decision this lane confirms.

## Profile evidence

Probe (`node scripts/probe-frame-solid.mjs --headless --cpu-profile`), GPU-throttled CI box
(~10× slow, frame mean ~147 ms), custom cpuprofile aggregation:

- JS `frame()` attributed ≈ 10.0 s of 83.8 s wall; `(program)`/native ≈ 72 s; GC 331 ms;
  all background admission ≈ 0.5 s already off-frame.
- In-frame totals: `drawPreparedFrame` 2536 ms (the presented GL calls themselves);
  `registry.step` 4403 ms (sim — physics.update 1246, tacticalAI 647, flightV3 463);
  `prepareFrame` 1500 ms; `runFeelAndUi` 1027 ms (hud.frame 885 — cadence clocks +
  memoized writers already).
- Self-time leaders: `queryAsteroidField` 314 ms (already spatial-key memoized),
  `updateMatrixWorld` 242 ms self / measured **0.04–0.09 ms steady-state per frame**
  (scene census: 376 nodes — recursion-inflated totals mislead; not a target),
  `getBoundingClientRect` 174 ms (plateBox — already 500 ms-gated), `get memory` 58 ms
  (tier1-gated diagnostic read).
- Scene census (probe-scene-walk): 376 nodes total; `matrixWorldAutoUpdate` already off
  for static subtrees; single `scene.updateMatrixWorld()` per frame is sub-0.1 ms.

**The starvation defect**: baseline probe run attributed `asset:compiling-pipelines` to 70
offender-frames (wreck 364: 60 stuck frames — a serial compile chain resuming once per
~147 ms present for ~4 ms of work each time).

## Patch

- `src/render/startupGpuResidency.js` — `yieldToNextPresent(options)` gains
  `options.boundMs` (default 48, the existing starved-rAF unstick; every current caller
  unchanged). The unstick arm is now `setTimeout(fire, boundMs)`.
- `src/render/renderer.js` — new `FLIGHT_ADMISSION_PRESENT_BOUND_MS = 24` and
  `admissionPaceYield = () => yieldToNextPresent({ boundMs: 24 })`, used by the two
  live-flight yield sites: the sliced pipeline-compile yield in `compileForCurrentTarget`
  and the residency sliced yield in the GPU-residency admission lane.
- `test/post-paint-yield.test.mjs` — pins `boundMs`: the bound arm dispatches the bounded
  task when no present arrives in time while the rAF arm stays armed.

Semantics: slice resume races next-present vs `boundMs`. At ≥~40 fps rAF always wins →
byte-identical behavior to today. Below ~40 fps each slice waits ≤24 ms instead of up to a
whole present. Never resumes inside a display callback (the rAF arm still dispatches via
`postTaskAtBackgroundPriorityBounded` — the resumed task runs post-present like today).
Compiles are provably non-order-dependent: per-program, dedupe-safe (the admission
tracker's quiet-window batch already coalesced them), and invisible to the sim hash.

## Metrics

- **Golden 47a** (`run --seed 47 --ticks 720 --hash --repeat 20 --reload-at 600`):
  `sha256 == baselineSha256 == cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885`,
  `deterministic: true`, exit 0. Identical by construction (no sim-path edit).
- **Slice-drain microbenchmark** (real `compileSubjectsAcrossPresents` + real
  `yieldToNextPresent`, stubbed 100 ms present cadence, ~2 ms fake compiles):
  HEAD 12.9 slices/s → patched 19.9 slices/s (**~1.55×** measured at this cadence; the
  bound ratio predicts ~2× at the box's 147 ms presents; at 60 fps the values are
  identical — rAF wins every race).
- **Probe A/B** (2 runs each way; box variance is high — missing-frame mass migrates
  between admission lanes run to run):
  - baseline: 93/72 and 93/67 missing/stuck; compiling-pipelines attribution 70 then 12.
  - patched: 295/186 and 54/21; compiling-pipelines attribution 64 then **1**;
    `pipelineHeldRoots` mean 0.2–0.3 in patched runs.
  Totals are dominated by a different lane (decode `noMesh`: worker-side decode jobs,
  maxMs up to 22.8 s) — honest statement: within-box noise on totals; the paced lane's
  attribution trended down (64 → 1) with the cleanest patched run also the overall
  best (54/21).
- **check:baseline**: 14/16 — the 2 failures are preexisting on HEAD:
  `ui-screen-imports` (`industry.js` imports unexported `buildDuration` — fails on a
  clean HEAD tree) and `pq020-ceres-topology` (`structuralCostDigest` mismatch — a
  headless world-structure check that never loads the renderer).
- **Unit tests**: `post-paint-yield` (2/2 incl. new), `shader-admission-slice`,
  `startup-yield-present`, `authored-pipeline-yield` — all pass.

## Zero visible quality change

No draw-path, sim-path, or content change; the only behavioral delta is *when* already-queued
background admission work resumes — strictly within the same bounded-slice contract
(~4 ms slices, background priority, starvation bound, never inside a present). On a healthy
60 fps cadence the code path is instruction-identical (rAF always wins the race).
