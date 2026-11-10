<!-- LIFETIME: DURABLE -->
# Deterministic Perf Instrumentation — handoff for Phases 3-6

**Status:** Phases 1 and 2 are DONE, committed and pushed. This file is the continuation brief.
**Branch (only push target):** `claude/perf00-20260727`, tip `103729bf`, in sync with `origin`.
**Prerequisite reading, in order:**
1. `DETERMINISTIC_PERF_INSTRUMENTATION_BRIEF.md` — the governing brief. §2 invariants and §9 traps still bind.
2. `PERF_INSTRUMENTATION_INVENTORY.md` — the §3 inventory, plus two corrections to the brief.
3. `PERFORMANCE_MODERNIZATION_PROGRESS.md` — the two `PERF-I01` / `PERF-I02` lines.

Do not re-derive any of the above. Do not rebuild anything in §1 below.

---

## 0. What the last session established, so you do not re-measure it

> **Post-boot shader compiles in idle flight: 0.** 301 frames, reproduced across three runs.

Steady-state choppiness is **not** shader compilation. That hypothesis is closed, not untested — the
same detector first watched the boot ramp climb to 71-74 programs, and the probe fails the run if that
ramp is implausibly small, so the zero is not vacuous.

Under scripted stimulus the count was 10, then 4, then 3. **Treat that spread as the reason to build
the §5 scenario harness, not as a measurement.** In particular the sprite cache thrash reached 8
recompiles only in run 1 (which was also the slowest chunk); runs 2 and 3 saw 1 each. The defect is
real, its magnitude is not established.

Post-boot compiles fall into two classes, separated by the `gl.linkProgram` stack:

| Stack signature | Class | Meaning |
|---|---|---|
| `WebGLRenderer.render` → `renderBufferDirect` → `setProgram` | **DRAW-TIME MISS** | An object entered the frame with no compiled program; THREE linked it synchronously *inside the frame being drawn*. The worst case. |
| `traverse` → `prepareMaterial` | **precompile** | `precompilePipelines` / `renderer.compileAsync` running after the boot boundary. Deliberate work landing late. |

`scripts/probe-shader-compile-timeline.mjs` already classifies these (`classifyLink`).

---

## 1. The substrate you inherit — read the API before writing anything

| Thing | Path | Use it for |
|---|---|---|
| Counter core | `src/core/perfCounters.js` | `createPerfCounters()`, `COUNTER_FIELDS`, `DETERMINISTIC_FIELDS`, `UNSOURCED_FIELDS`, `perfCountersRequested()`, `diffDeterministicCounters()` |
| GL wrappers | `src/render/glInstrumentation.js` | `installGlInstrumentation(gl, counters)` → `{wrapped, uninstall}` |
| Live handle | `window.__SPACEFACE_PERF__` | `.tier1` (the counter set), `.getCounterSnapshot()`. **Not** `SF_DEBUG`-gated — unlike `window.SF` |
| Install point | `src/render/renderer.js` ~688 | Right after `new THREE.WebGLRenderer(...)`, gated on `perfCountersRequested()` |
| Frame boundary | `src/core/presentationRunner.js` ~421/441/491 | `perf.tier1?.beginFrame()` / `recordStepsThisFrame` / `endFrame()` |
| Probe | `scripts/probe-shader-compile-timeline.mjs` | `npm run probe:shader-timeline`. Boots to flight, finds the boot boundary by quiescence, runs frame-counted phases, cross-validates |
| Gate | `check:perf-counters` | Chained into `check` before `check:gate-reachability`; verified absent from the orphan list |
| Tests | `test/perf-counters.test.mjs` | 17 tests, 5 mutation-proven guards |

**Opting in:** `window.__SPACEFACE_PERF_COUNTERS__ = true` before boot (Playwright `addInitScript`), or
`?perfCounters=1`. Read **once**, at renderer construction — the GL wrappers are install-on-enable, so
there is no mid-session start.

**The boot boundary is the probe's call, not the runtime's.** `markBootBoundary()` is exposed on
`__SPACEFACE_PERF__.tier1`; the quiescence predicate lives in the harness. Do not move it into shipped
code — that bakes a moving definition into the product.

### Two properties you must not break

**Zero cost when off** means the wrappers are *never installed*, not that a boolean is read. Keep it
that way; `test/perf-counters.test.mjs` drives 5,000 disabled frames and asserts the event list, the
histogram and every total are untouched.

**`totals` accumulates at record time, not in `endFrame()`.** This is not stylistic. Measured last
session: **70 of 91 shader links (77%) happen outside any frame pair** — the boot ramp links before
the first rAF ever runs, and `compileAsync` resolves between frames. Accumulating in `endFrame()` let
`beginFrame()`'s reset discard all of it, and the failure read as *good news* (a smaller number, no
error). `offFrame` is reported separately because the distinction is diagnostic: off-frame = async
compile, in-frame = draw-time stall.

---

## 2. The reference capture — your regression baseline

Headless SwiftShader (`ANGLE … SwiftShader driver`, `tier=software`), 934 frames observed, boot
boundary at frame 317, 616 post-boot frames. **Counts only; no timing is claimed.**

| field | totals | postBoot | offFrame | peak/frame |
|---|---:|---:|---:|---:|
| shaderLinks | 91 | 3 | 70 | 13 |
| shaderCompiles | 182 | 6 | 140 | 26 |
| renderTargetAllocations | 13 | **0** | 10 | 2 |
| renderTargetResizes | 2 | **0** | 1 | 1 |
| textureUploads | 223 | 3 | 206 | 8 |
| textureSubUploads | 44 | 3 | 30 | 6 |
| mipmapGenerations | 59 | 3 | 46 | 7 |
| bufferFullUploads | 459 | 105 | 82 | **135** |
| bufferPartialUploads | 41871 | 32587 | 2 | 105 |
| bufferUploadBytes | 53,237,612 | 40,565,970 | 2,484,998 | 4,425,906 |
| drawCalls | 28964 | 23024 | 97 | 105 |
| drawInstancedCalls | 9940 | 7683 | 9 | 23 |
| programSwitches | 19053 | 14826 | 106 | 56 |
| textureBinds | 51283 | 41252 | 647 | 204 |

`stepsPerFrameHistogram: {"0":190, "1":3, "2":196, "3":231, "4":314}`

Readings already taken:
- **Two zero-budgets are already met** — post-boot render-target allocations and resizes are both 0.
- **`dynamicBufferRanges` is working**: post-boot partial:full = 32587:105.
- **Draw calls are not the problem**: ~37/frame post-boot, consistent with the earlier investigation
  that falsified the draw-call theory at 54.
- The DOM row is absent because family H has no producer. See `UNSOURCED_FIELDS`.

---

## 3. Open leads — measured, unexplained, ranked

**Lead A — one boot frame issued 135 full `bufferData` uploads.** Necessarily pre-boundary, because
post-boot `bufferFullUploads` totals only 105 across all 616 frames. A boot cost, not the in-flight
stall. **Cheapest thread available**: the counter already fired and `snapshot().events` plus
`peakPerFrame` narrow it to one frame. Chase this before building anything new.

**Lead B — a reproducible 1-2 minute stall on first weapons fire.** The first scripted-stimulus chunk
took 129 s / 135.8 s / 57.5 s for 75 frames across three runs, against 15-20 fps everywhere else. Only
2-3 shader compiles land in that window, so compilation does not explain it. Suspects are families C
and D, both now instrumented. **This is a timing observation on a contended software-rendering host —
informational, not evidence.** Confirm with counters, not with the stopwatch.

**Lead C — the sim sits at its catch-up cap.** Only **3 frames of 934 ran the healthy 1 step**; 314
hit the `MAX_CATCHUP_STEPS` 4-cap, beyond which whole ticks are *shed*. Heavily confounded: at the
15-20 fps this host delivers, 3-4 steps is the arithmetic consequence of a 50 ms frame, not an
independent defect. **Re-measure on real hardware before treating it as one.** The counter now exists
to do that.

**Lead D — sprite program cache thrash.** A byte-identical cacheKey re-linked inside
`WebGLRenderer.render`. Identical cacheKey means THREE released the earlier program (`usedTimes → 0`)
and recompiled from scratch. The material *is* cached in `visualFactory.getMaterial` (`haloSpriteMaterial`
→ `getMaterial('halo:'+color, …)`), so something disposes it. Find the disposer — a `linkProgram`
wrapper that also captures a stack will name it, which is how the two classes above were separated.

---

## 4. Phase 3 — volume counters

### 3a. Family H producer (DOM / layout) — do this first

Highest value of the three, because the HUD is DOM on the game thread and PERF-C05 was exactly this
failure mode (a roster rebuilding ~5 Hz because its cache guard hashed a continuously changing value).

- **Install point:** `document.getElementById('hud')` — see `src/ui/hud.js:806`, `src/ui/uiRoot.js:327`.
- **Build:** a `MutationObserver` on the HUD root, `subtree: true`, counting per frame **by type and
  by target**. Feed `counters.countDomMutation(type)`. Also a `PerformanceObserver` for `longtask` →
  `countLongTask()`.
- **Layout reads:** count reads of `offsetWidth/Height/Top/Left`, `clientWidth/Height`,
  `scrollWidth/Height`, `getBoundingClientRect()`, `getComputedStyle()`. Install-on-enable, and
  **restore on uninstall**.
- **Scope cut, deliberate and already reasoned in the inventory §3:** ship raw layout-read counts, NOT
  the read-after-write "forced synchronous layout" refinement. Exact detection needs `defineProperty`
  surgery on `Element.prototype.innerHTML` / `Node.prototype.textContent` / `className` to maintain a
  dirty flag, and getting that subtly wrong breaks the game silently. Mutation-counts-by-target already
  catches PERF-C05's actual failure mode: mutation count scaling with *frame count* instead of with
  *state changes*.
- **Delete the wired fields from `UNSOURCED_FIELDS` in the same commit.** The test in
  `test/perf-counters.test.mjs` checks the list is coherent, but nothing forces you to update it —
  that discipline is on you, and skipping it restores exactly the vacuous zero the list prevents.

### 3b. Family F (scene graph)

Counting wrappers on `THREE.Object3D.prototype.updateMatrixWorld` and `.traverse`. The importmap
(`index.html:17`) maps `three` to a single `./vendor/three.module.js`, so a module importing `three`
patches the same object the game uses.

**This is the one place you must patch a prototype rather than shadow an instance.** That is a real
leak risk: it affects every Object3D in the process, including other tests in the same page. Make
`uninstall()` mandatory and prove it in a test. It is also the heaviest hook — `updateMatrixWorld` is
called for every object every frame — so expect it to distort Tier-2 even more than the GL wrappers.

Healthy value: traversals bounded by *transitions*, not by frame count. PERF-C01 established that
pattern; this counter proves it still holds.

### 3c. Family G (allocation)

`counters.sampleHeap(usedBytes)` already exists and is already segregated as `nondeterministic`. It
needs one caller: `performance.memory?.usedJSHeapSize` once per frame in `presentationRunner.frame()`,
guarded — `performance.memory` is Chromium-only.

**Do not add it to `DETERMINISTIC_FIELDS`.** GC scheduling is at the VM's discretion; this is the
counter the brief mis-filed as Tier 1.

---

## 5. The §5 deterministic scenario harness — the real blocker

Phase 5's budgets are worthless without this, because a counter is only meaningful against a fixed,
reproducible scenario. The 10 → 4 → 3 stimulus spread is the proof.

**The seam already exists. Do not build a second frame pump.**

```
src/main.js:200        startLoop(state, registry, { presentationJournal })
src/core/loop.js:27    startLoop passes deps straight through, unchanged
src/core/presentationRunner.js:48-61
                       deps.requestFrame / deps.cancelFrame / deps.nowMs / deps.perfNow
```

So a deterministic pump is injected by adding `requestFrame` and `nowMs` overrides at the single
`startLoop` call site, driving **synthetic monotonic timestamps** rather than wall-clock rAF.

That matters beyond reproducibility: `drawCalls`, `programSwitches` and `textureBinds` are
culling-dependent and therefore deterministic *only* under a synthetic pump. They are excluded from
`DETERMINISTIC_FIELDS` today for exactly that reason. If you build the pump, you may be able to promote
them — but promote them only after demonstrating identity across two runs, never on the argument that
they ought to be stable.

Scenarios to declare, per the brief: `boot-to-first-playable`, `idle-flight`, `combat`,
`asteroid-field-dense`, `station-dock`, `sector-transition`. Reuse
`scripts/lib/performanceScenarioManifest.mjs` (`validatePerformanceScenarioManifest` /
`compilePerformanceScenarioManifest`) — it is a validator, and **the manifest document does not exist
yet**; you are writing the first one. Reuse `scripts/lib/validationBroker.mjs` for launch/claim
handling rather than a parallel launcher.

**Acceptance for the harness itself, before collecting a single real measurement:** run the same
scenario twice on the same commit and assert every field in `DETERMINISTIC_FIELDS` is identical.
`diffDeterministicCounters(a, b)` already implements the comparison. If it is not identical, the
harness is not deterministic yet and nothing built on it can be trusted.

---

## 6. Phase 4 — Tier 2 timing

**Tier 1 and Tier 2 cannot share a run.** `apply(this, arguments)` wrappers on `drawElements` and
`bufferSubData` deoptimise the hottest calls in the frame. Counts survive that — an integer does not
care that it was expensive to obtain — but timings taken alongside are not merely contended, they are
**instrument-distorted**, which is worse because it is invisible.

So: two passes per scenario, and the report must record which instrumentation was live and refuse to
populate `tier2` while GL wrapping is on.

- Reuse `createGpuTimers(gl)` (`src/render/gpuTimers.js`, `EXT_disjoint_timer_query_webgl2`) for
  per-pass spans: shadow, main scene, bloom levels, composite. Record origin-linked completed-query
  counts so partial data is detectable. The renderer already has `_gpuTimers` /
  `state.render.gpuTimers` lifecycle (`src/render/renderer.js` ~838).
- **Frame time is a distribution, never an average**: p50/p95/p99/p99.9/max plus a count of hitches
  over 2× median. `perfRuntime`'s `reportStat` currently gives p95 only — extend it.
- Stamp every Tier-2 artifact with `"informational_contended": true` unless the broker granted a quiet
  host. **Reuse that exact key** — it already exists in the H1 evidence set. Do not invent a second
  convention.
- Nothing captured on this workstation is acceptance evidence. Many agents run concurrently.

---

## 7. Phase 5 — budgets and the CI gate

Set the unambiguous zero-budgets now; **do not invent ratio thresholds before you have data from a
deterministic scenario.**

Already measurable and already passing on the reference capture:

- post-boot `renderTargetAllocations` = **0** (outside declared resolution changes)
- post-boot `renderTargetResizes` = **0**
- post-boot DRAW-TIME-MISS shader links = **0** — note this is the *class*, not the raw count;
  `precompile`-class links after the boundary are a different (lower-severity) finding
- backlog-shed events during idle flight = **0**
- forced synchronous layouts per frame = **0** — only after 3a wires a producer

Ratio budgets to add **after** the first clean deterministic capture: upload bytes vs logical bytes
changed (cross-check against `getDynamicBufferOwnerDiagnostics`), program switches vs unique programs.

**Wiring, and the PERF-C04a lesson:** add the script to `package.json`, chain it into `check` ahead of
`check:gate-reachability`, then run `npm run check:gate-reachability` and confirm the new name is
**absent from the orphan list** in `scratch/gate-reachability/report.json`. `declared` and `reachable`
in that report are counts, not lists — absence from `orphanList` is the check. Eight packet tests sat
unreferenced by any script until this was discovered.

---

## 8. Phase 6 — diff and bisect

- A diff tool over two report JSONs that prints **only changed counters**, so a regression is one
  command away. `diffDeterministicCounters()` is the core; wrap it in a CLI and extend it to the
  non-deterministic fields with an explicit "informational" label.
- A bisect recipe: because the sim is deterministic and the scenario is scripted, a Tier-1 counter
  delta between two commits is a real regression and is therefore bisectable. Write the recipe down —
  `git bisect run` against a single-scenario counter threshold.

---

## 9. Traps learned in the Phase 1-2 session — additive to the brief's §9

1. **A counter can fail toward good news.** The `endFrame()` accumulation bug produced smaller numbers
   and no error. Before trusting any new counter, ask: *if this hook were dead, what would the report
   say?* If the answer is "the same thing a healthy system says", you need a positive control.
2. **Prefer intrinsic positive controls to synthetic ones.** For shader compiles it is the boot ramp:
   the detector must first observe 0 → ~71 programs, so a post-boot zero cannot be vacuous. Copy that
   shape — find a phase where the counter *must* move.
3. **Mutation patches must be CRLF-aware in this worktree.** A `\n`-anchored multi-line replace matches
   nothing, the test then "passes", and you conclude the guard is load-bearing when you never removed
   it. **Always assert the patch applied** before reading the test result. This bit once already.
4. **Cross-validate a new instrument against an independent one.** The production GL seam had only ever
   met a fake context; running it alongside the probe's own page-level wrapper and getting 91/91 and
   3/3 is what makes it trustworthy. Build the second instrument even though it is redundant.
5. **`declared` / `reachable` in the gate-reachability report are integers, not arrays.** Check
   `orphanList`.
6. **`acquireVisualProbeServer` returns `close()`, not `release()`.** `check-shader-compile.mjs`
   optional-chains `release?.()`, so it never closes its server — harmless only because it
   `process.exit`s.
7. **Name collisions in `perfRuntime.js`.** It already has a local `counters` (spatial-hash / VFX) and
   `getReport()` returns a `counters` block. The Tier-1 set is deliberately `perfRuntime.tier1`.
8. **Match the surrounding defensive idiom in `presentationRunner.frame()`.** A throw from the
   `finally` block escapes the `catch` and kills the rAF loop outright. The new calls use `?.` for that
   reason.
9. **Boot is slow, steady flight is not.** Headless boot-to-flight runs at ~2 fps while idle flight is
   15-20 fps on the same host. A timeout sized for steady state will fail during boot and look like a
   broken predicate. Size frame waits generously (`--frame-wait-timeout-ms`, default 900 s) and always
   measure phases in **frames**, never milliseconds.

---

## 10. First actions

1. Read §1 and §2 here; do not rebuild the substrate.
2. `cd C:\Users\93rob\sf-perf-admission-20260726`, confirm branch `claude/perf00-20260727`,
   `git fetch origin`, integrate `origin/master` if behind. Push nothing but this branch.
3. Run `npm run probe:shader-timeline` once to reproduce §2 and confirm the seam still cross-validates.
   If production and page-wrapper counts disagree, stop and fix that before anything else.
4. Chase **Lead A** (the 135-upload boot frame). It is the cheapest open thread and needs no new code.
5. Build **3a** (family H producer), deleting its fields from `UNSOURCED_FIELDS` in the same commit.
6. Then the **§5 scenario harness** on `deps.requestFrame` / `deps.nowMs`, and prove it deterministic
   *before* collecting a measurement.

Commit and push after every phase. Append one line to `PERFORMANCE_MODERNIZATION_PROGRESS.md` per
phase. Use path-limited `git add -- <paths>` and `git commit -- <paths>`: concurrent agents edit this
worktree, and never clear a "stale" `index.lock`.
