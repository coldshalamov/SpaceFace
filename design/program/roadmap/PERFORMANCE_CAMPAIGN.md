<!-- LIFETIME: DURABLE -->
# Performance campaign — the complete path to optimal

The full ordered program from where the game is now to as fast as it can be. Every phase states the
**question it answers**, the **work**, and the **exit condition**. Do not start a phase before its
predecessor's exit condition is met — the ordering exists because later phases waste effort when
earlier answers are unknown.

`MAKE_THE_GAME_FAST.md` is Phase 1 of this document. This is the whole campaign.

---

## The method that makes a busy machine irrelevant

The blocker on this project has been that the dev machine runs coding agents while it measures, so
absolute millisecond numbers are polluted. The way through is not a quiet machine. It is this:

> **Absolute timings are polluted by contention. Ratios and A/B comparisons are not.**

If an agent is stealing 30% of the CPU, it steals it from *both arms* of a comparison. So
"frame time halved when I halved the resolution" is a valid finding on a loaded machine, while
"the frame took 14.2 ms" is not. Nearly every question below is answerable as a ratio.

Three classes of evidence, in descending robustness:

| Class | Contention-proof? | Example |
|---|---|---|
| **Counts** | Fully | draw calls, shader links, uploads, mutations |
| **A/B ratios** | Yes, if both arms run under the same load | frame time at 100% vs 50% resolution |
| **Absolute times** | No | "the render phase takes 8 ms" |

Use counts first, ratios second, and absolute times only to publish a final result on a quiet host.

A second, equally important confound: **headless testing here is SwiftShader software rendering.**
Counts transfer to real hardware; anything derived from frame rate does not. Phases 0 and 6 must run
headed on the real GPU.

---

## Phase 0 — Establish which resource is actually saturated

**Question: is this game CPU-bound, GPU-fill-bound, or hitch-bound — and in which scenarios?**

Nothing downstream is worth doing before this is answered, because the fix lists are disjoint. This
is hours of work, not days, and it needs **no new code** — every lever already exists.

**0.1 Confirm the GPU is real.** A headed session on the user's machine, reading the tier the renderer
logs (`[render] GPU: … | tier: … | pixelRatio: …`, `renderer.js:1173`). This project has already been
burned by a measured 2-3 fps that was browser software rendering. If a real session says `software`,
that is the entire performance problem — fix GPU acquisition and stop.

**0.2 The resolution ratio test — the single most informative experiment available.**
`renderScale` and `pixelRatioCap` are existing settings (`renderer.js:1386`). Run the same scenario at
100% and 50% render scale.
- Frame time scales with pixel count → **fill-rate / GPU bound.** Go to Phase 3-GPU.
- Frame time barely moves → **CPU bound.** Go to Phase 3-CPU.
This is a ratio, so a loaded machine does not invalidate it.

**0.3 Feature-ablation ratios.** Same scenario, toggling one thing at a time: bloom off
(`settings.video.bloom`), shadows off, VFX off, post-processing off, dynamic resolution off. Each
gives the marginal cost of one subsystem **as a ratio**. The bloom pyramid plus an HDR composite at
full resolution is the classic fill-rate killer in a scene this small, and `renderer.js:1159` already
records the suspicion that a weak GPU cannot shade full-res HDR + bloom composite in time.

**0.4 Split CPU from GPU.** Run the sim with rendering suppressed, and render a static scene with the
sim suspended. Two ratios that bracket the answer.

**Exit condition:** one sentence per scenario of the form *"in `combat_vfx_burst` the game is
GPU-fill-bound; bloom is 40% of frame time."* Write them into this file. **Do not proceed without
this.** Everything after here is chosen by that sentence.

### Phase 0 exit — measured 2026-07-29, headed on the real GPU

**0.1 — The GPU is real.** The headed session runs `ANGLE (Intel, Intel(R) Graphics (0x00007D45)
Direct3D11)`, hardware tier — not SwiftShader. The software-rendering theory is retired for this
machine.

**Scenario sentences** (probe scenario `crowded-flight`; the 16 declared scenarios are not yet
wired — that is Phase 2.3, and no sentence below pretends otherwise):

- In `crowded-flight` under active stimulus the game is **CPU-bound in the JS frame callback**:
  halving render scale leaves rAF p95 unchanged (33.3 → 33.5 ms) while GPU frame time falls
  9.4 → 6.1 ms; callback p95 (21–32 ms) exceeds both the GPU time and the 16.7 ms budget.
  **Phase 3-CPU applies. Phase 3-GPU is not the binding constraint on this hardware.**
- In settled idle flight (the same session's diagnostic-variant windows) the game **already holds
  a locked 60 fps** after the corruption fix below — 150/150 one-vsync frames in nearly every
  2.5 s window, including windows that *add* GPU work. The live problem is **transient hitches
  under stimulus**, not steady-state throughput: Phase 1 is the front line.
- The 0.4 bracket: render-suppressed (`webgl-submit-noop`) callback p95 ≈ **6.7 ms**; sim-paused
  render-only ≈ **6.1 ms**. Each half fits the budget alone; stacked they leave ~4 ms of headroom,
  so any spike class blows a frame — measured spikes: **physics 48.6 ms max single tick** (avg
  0.89 ms), autosave blocking slice 16.3 ms, plus GC of a high allocation rate.
- No single sim system dominates the steady cost (top: tacticalAI p95 1.5 ms) — the callback cost
  is breadth × the 4-step catch-up amplifier: `simFrame` p95 12.5 ms under stimulus collapses to
  4.7 ms once frames fit the vsync budget. Every saving compounds by unwinding catch-up steps.
- GPU ablation deltas for the record (GPU-timer averages; frame times were vsync-masked and
  variant windows are sequence-confounded, so these are indicative): shadows ≈ 4.6 ms, canopy
  transmission ≈ 6 ms, bloom ≈ 2.5 ms of a ~9.4 ms GPU frame. Real costs, worth Phase 3-GPU
  attention only after the CPU spikes are dead or on weaker GPUs.

**Root cause fixed during Phase 0** (commit `75c693b2`): the spatial grid's `INVALID_INDEX = -1`
sentinel collided with legitimate cell coordinate -1 (positions in [-cellSize, 0) on either axis —
gameplay orbits the origin). `removeFromGrid` skipped real unlinks, chains corrupted into
self-cycles, and every visibility query pushed candidates until V8 threw `RangeError: Invalid
array length` — a per-frame error storm with GB-scale allocation churn. After the fix, frame
errors 7 → 0, hitches 76 → 51, rAF p95 50 → 33.3 ms under the same stimulus, and settled flight
locks to 60 fps. Evidence: `.devshots/perf/phase0/*.{json,md}`, regression tests in
`test/presentation-world-origin-cell-corruption.test.mjs`.

---

## Phase 1 — Kill the hitches (independent of throughput)

**Question: what makes individual frames catastrophically long?**

Smoothness and average frame rate are different problems with different fixes. A game at a steady
40 fps feels better than one averaging 60 with a 300 ms freeze every few seconds. Hitches are usually
cheaper to fix and more perceptible, so they come first.

This is `MAKE_THE_GAME_FAST.md`. In short:

1. **Draw-time shader links** — a program linked inside `renderBufferDirect → setProgram` blocks the
   main thread 50-300 ms. Root cause narrowed to sprite materials being disposed and recreated
   (`spaceBackground.js` ~1793/1862/2178). Confirmed reproducible across four probe runs.
2. **Spike frames** — `bufferFullUploads` averages 0.1/frame with one frame at **135**. The evidence
   file already names the frame.
3. **GC pauses** — the heap sampler now exists (family G). A sawtooth means per-frame allocation;
   the fix is pooling on the hot path.
4. **Asset-streaming stalls** — texture uploads and decodes landing mid-flight rather than at load.

**Exit condition:** `POST-BOOT SHADER COMPILES` is 0 with no `DRAW-TIME-MISS` stacks; no frame does
more than ~2× the median work in any counter. Both are **counts**, so contention-proof.

---

## Phase 2 — Attribute cost to subsystems, across the whole game

**Question: what does each system cost, in each scenario?**

Most of the attribution layer already exists and does not need rebuilding:

- `perfRuntime.getReport()` returns **per-system** timings (`systems`), **per-phase**
  (`sim`, `simFrame`, `presentation`, `render`, `vfx`, `feel`, `ui`, `admission`), `renderWork`,
  frame-interval and dispatch-lag stats, and `loop.backlogCauseCounts`.
- `createGpuTimers(gl)` (`src/render/gpuTimers.js`, `EXT_disjoint_timer_query_webgl2`) gives
  **per-GPU-pass** spans; the renderer already owns the lifecycle (`_gpuTimers`).
- `perfCounters` gives per-frame volumes with peaks.

**2.1 Extend frame time to a distribution.** `reportStat` returns p95 only. Smoothness lives in
p99/p99.9/max and a hitch count over 2× median. An average hides exactly the spikes that matter.
Additive change; `getReport()`'s existing shape is pinned by gates.

**2.2 Wire the GPU pass timers into the report** — shadow, main scene, each bloom level, composite.
Record completed-query counts so partial data is detectable; a timer that returned nothing must never
read as "0 ms".

**2.3 Cover the whole game.** This is the "entire game" part and the largest single piece of work.
Sixteen scenarios are already declared in `scripts/lib/performanceClosureContracts.mjs`
(`PERFORMANCE_SCENARIO_IDS`): `flight_steady`, `mining_tether_active`, `docked_market_ui`,
`context_recover_steady`, `fleet_full_render_10/25/50`, `fleet_transparent_heavy`,
`station_arrival_approach`, `station_visible_steady`, `combat_vfx_burst`, `jump_asset_admission`,
`autosave_under_load`, `map_open`, `map_interaction_steady`, `map_to_flight_transition`.

Roughly none are wired to counters today. Each needs a repeatable route that reaches the state and
holds it. **Reuse `src/testing/lab/`** — `chromiumHost.js` (`runChromiumLabScenario`,
`repeatChromiumLabScenario`), `runScenario.js`, `inputTape.js` already exist. Do not build a second
harness; `repeatChromiumLabScenario` is already the run-it-twice primitive.

Note the scenario definitions carry `primaryCapable` and `leaseGate` flags — some are not runnable on
an arbitrary host. Say so rather than faking a run.

**2.4 Make runs comparable.** A deterministic pump injected at the existing seam
(`main.js:200` → `loop.js:29` → `presentationRunner`'s `deps.requestFrame` / `deps.nowMs`) so two
runs of one scenario produce identical deterministic counters. **Scope this to what comparison
needs.** It is a tool for answering "did my fix work", not a deliverable in itself.

**Exit condition:** a cost table — scenario × subsystem × (CPU ms distribution, GPU ms, counts).
That table is the map for Phase 3 and the thing that has never existed.

---

## Phase 3 — The optimization passes, ordered by the Phase 2 table

Work strictly in descending measured cost. Do not optimise anything that is not near the top of the
table, however satisfying it would be.

### 3-GPU (if fill-bound — likely, given only 37 draw calls/frame)

1. **Post-processing chain cost.** Bloom is a multi-level pyramid plus an HDR composite. Levers:
   render bloom at half or quarter resolution, cut pyramid levels, cheaper blur kernel, skip
   bloom when the frame has no bright pixels. Usually the single biggest win in a scene this small.
2. **Overdraw.** Transparent particles, plumes, and sprites shading the same pixels repeatedly. Count
   fragments per pixel; reduce particle counts, cap billboard sizes, sort front-to-back for opaques.
3. **Shader complexity.** Instruction count in the hottest fragment shaders. Move per-pixel work to
   per-vertex or precomputed textures where the look survives.
4. **Shadows.** Map resolution, cascade count, caster policy, and update frequency — shadow maps
   rarely need to be re-rendered every frame for slow-moving casters.
5. **Resolution policy.** Dynamic resolution exists (`_adaptive`); confirm its trigger and floor are
   right, and that it is not reallocating render targets while adapting (a measured stall class).
6. **LOD.** Distance-based mesh and material tiers, so far objects are cheap.

### 3-CPU-render (if submit-bound)

7. **Material batching and sort order.** Measured 22.6 program switches against 36.7 draw calls —
   nearly every other draw changes shader. Sorting draws by material cuts state changes without
   changing a pixel.
8. **Instancing and merging.** Repeated objects (asteroids, debris, stars) into instanced draws.
9. **Culling.** Frustum culling effectiveness, plus distance culling and portal/sector culling.
   Measure objects tested vs drawn.
10. **Matrix updates.** `updateMatrixWorld` runs for every object every frame; static objects should
    be `matrixAutoUpdate = false`. This is family F, not yet instrumented.

### 3-CPU-sim (if sim-bound)

11. **Per-system budgets** from the `systems` table — the top 3 systems get attention, the rest do not.
12. **Spatial structures.** Broad-phase for collision/proximity queries; a known prior debt here.
13. **Amortisation.** Not every system needs to run every frame. Stagger AI, economy, and world
    updates across frames on a rotation.
14. **Entity LOD.** Distant NPCs tick at reduced rates.

### 3-UI

15. **DOM mutation batching.** Family H now measures this. The failure mode to look for is mutation
    count scaling with *frame count* instead of with *state changes* — that is PERF-C05 exactly.
16. **Layout thrash.** Layout reads interleaved with writes force synchronous layout.

### 3-Memory

17. **Pooling on the hot path** — vectors, quaternions, event objects, particle records.
18. **Avoid per-frame array/closure allocation** in update loops.

### 3-Assets

19. **Texture compression** (KTX2/Basis) — cuts upload time, GPU memory, and bandwidth.
20. **Atlasing** to cut texture binds (58.4/frame measured).
21. **Precompile completeness** — every material variant compiled before it is first drawn. Phase 1
    proves this by the zero-draw-time-link count.

---

## Phase 4 — Reordering and separating the code

**Question: what work can leave the critical path entirely?**

This is the structural tier, and it is where the largest remaining wins live once the obvious cuts are
made. It is also the riskiest, so it comes after the cheap wins.

22. **Update-order review.** `PRODUCTION_UPDATE_ORDER` is hash-pinned, so changes here are a
    deliberate, gated act — never a side effect. Look for systems that could run later, less often,
    or on stale data without a visible difference.
23. **Time-slicing.** Long operations (world generation, save serialisation, pathfinding) split
    across frames with a budget per frame rather than run to completion.
24. **Workers.** Move genuinely parallel work off the main thread. Saves already have worker paths
    (`saveStats.workerDispatch`). Candidates: procedural generation, pathfinding, physics broad-phase.
25. **Idle-time work.** `requestIdleCallback` for anything that does not need to be ready this frame.
26. **Async asset pipelines.** Decode and upload off the critical path; never let a texture upload
    land mid-flight.
27. **Interpolation vs simulation rate.** The sim is a fixed 60 Hz step with a 4-step catch-up cap.
    If it is a real cost on real hardware, a lower sim rate with render interpolation is available —
    but verify on real hardware first, since 3-4 catch-up steps is the *arithmetic consequence* of a
    50 ms software-rendered frame, not necessarily a defect.

---

## Phase 5 — Lock the wins in

**Question: how do we stop this rotting back?**

28. **Zero-budgets as gates**, in `check`: post-boot draw-time shader links = 0, post-boot render
    target allocations = 0, resizes = 0, backlog-shed events in idle flight = 0, forced layouts = 0.
    Each needs a **positive control** — a test feeding a violating snapshot and asserting the gate
    fails. A budget that cannot fail is not a gate.
29. **Ratio budgets**, only after Phase 2's table exists: upload bytes vs logical bytes changed,
    program switches vs unique programs, objects drawn vs objects tested.
30. **A counter diff CLI** so a regression between two commits is one command, exiting non-zero on a
    deterministic-field change.
31. **A bisect recipe.** Because the sim is deterministic and scenarios are scripted, a Tier-1 counter
    delta between two commits is a real regression and is bisectable. Document the traps: an all-zero
    snapshot (scenario never ran) will confidently name an innocent commit.

---

## Phase 6 — Verify it is actually faster to a human

**Question: did any of this make the game feel better?**

32. **A headed run on the real GPU, on a quiet machine.** This is the only step that genuinely
    requires it, and it is a final confirmation of work already validated by counts and ratios — not
    a prerequisite for doing the work.
33. **Frame-time distribution against a target**: 60 fps sustained, p99 under one frame, zero hitches
    over 2× median.
34. **The player check.** Fly the game. If it does not feel smoother, the table was read wrong; go
    back to Phase 2 rather than adding more fixes.

---

## Effort shape

| Phase | Size | Needs a quiet machine? |
|---|---|---|
| 0 — bottleneck class | hours | headed + real GPU, but ratios tolerate load |
| 1 — hitches | days | no (counts) |
| 2 — attribution + 16 scenarios | the big one | no (counts + ratios) |
| 3 — optimisation passes | proportional to the table | no (ratios) |
| 4 — restructuring | days, higher risk | no |
| 5 — gates | days | no |
| 6 — final verification | hours | **yes** |

## Standing rules

- **No quality reduction.** Not a lever; the user has ruled it out. Optimisation means the same image
  for less work, not a worse image.
- **Do not change `PRODUCTION_UPDATE_ORDER` or the manifest hash** except as a deliberate, gated act
  in Phase 4.
- Fix in descending measured cost. An unmeasured optimisation is a guess.
- Prefer deleting work to speeding work up.
- Concurrent agents edit this worktree: path-limited `git add -- <paths>` / `git commit -m "..." --
  <paths>`; never clear a "stale" `index.lock`. The worktree is CRLF.
