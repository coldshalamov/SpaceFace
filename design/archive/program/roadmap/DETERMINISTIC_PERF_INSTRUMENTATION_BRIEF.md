<!-- LIFETIME: DURABLE -->
# Deterministic Performance Instrumentation — build brief

**Status:** not started. This is a handoff brief for a fresh thread.
**Worktree:** `C:\Users\93rob\sf-perf-admission-20260726`
**Branch (only push target):** `claude/perf00-20260727` (tip `3c880520` at time of writing)
**Prerequisite reading:** `design/program/roadmap/PERFORMANCE_MODERNIZATION_PROGRESS.md`

---

## 0. Why this exists — read this before writing any code

Eight quality-preserving optimizations (PERF-C01…C08) shipped on this branch. Every one was a real,
verified redundancy. Their **combined** effect is an estimated ~3% of average frame time. One of them
(PERF-C06, the projection-camera guard) is worth roughly **0.004%** — textbook-correct, fully tested,
and worth nothing.

That is not a failure of the optimizations. It is a failure of *ranking*. Reading code finds
redundancy reliably; it cannot tell you which redundancy is 90% of the problem and which is 0.004%,
because source text carries no magnitudes. Performance is heavy-tailed — one or two causes dominate
and the rest is noise — so an unranked list of correct findings converges on nothing.

Worse: the most expensive events in a real-time renderer are **invisible in source**.

```js
material.needsUpdate = true;   // may trigger a shader recompile: 50-300 ms
renderTarget.setSize(w, h);    // may reallocate VRAM and stall the pipeline
texture.needsUpdate = true;    // may block on a synchronous upload
element.offsetWidth;           // may force a synchronous layout of the document
```

None of those *look* expensive. Static analysis will never flag them. They are the stall classes that
historically caused this project's choppiness — the previously **measured** causes were SwiftShader
software-rendering fallback, a shader-recompile storm from light-visibility toggling, and
dynamic-resolution render-target reallocation. All three are stalls, not slow algorithms.

**The deeper problem this system must solve:** this project has never had a stable baseline. Sometimes
the browser was on software rendering; usually the workstation is running many concurrent coding
agents. When the baseline moves underneath you, you cannot tell whether a change helped, hurt, or did
nothing — so nothing ever converges and every session rediscovers "performance is bad" without ever
closing a cause.

**Therefore the central design constraint is: produce evidence that is valid on a contended machine.**

---

## 1. The two-tier evidence model — the core idea

Split all evidence into two tiers and never let them mix in a claim.

### Tier 1 — Deterministic counters (valid ALWAYS, including under heavy contention)

Counts, sizes, identities and orderings. Not durations.

> "47 shader programs compiled after the first playable frame" means exactly the same thing on an
> idle machine and on a machine running twelve agents. CPU contention cannot change an integer.

Tier 1 is the workhorse. Most of the questions that actually matter are Tier 1 questions:

- Did anything compile a shader after boot? (Healthy answer: **0**.)
- Did any render target get allocated after boot? (Healthy: **0** outside deliberate resolution changes.)
- Did any texture upload during steady flight? (Healthy: **0**.)
- How many draw calls, and how many *program switches* among them? (Healthy: switches ≈ unique programs.)
- How many bytes were uploaded to GPU buffers this frame, and how many were full reallocations?
- How many DOM mutations and forced synchronous layouts happened per frame? (Healthy: **0** forced layouts.)
- How many simulation catch-up steps ran, and how often was backlog shed?

### Tier 2 — Timing (valid ONLY in a broker-owned quiet environment, always labelled)

Frame-time distributions, GPU pass timings, CPU phase spans. These are still worth building — they
are how you eventually confirm a fix — but every artifact carrying them must be stamped with the
environment it was captured in, and must refuse to be promoted to an acceptance claim from a
contended host.

**Hard rule:** a Tier-2 number captured on this workstation is *informational*, never evidence. The
repo already has this concept — see `"informational_contended": true` in the H1 evidence set. Reuse
that exact convention; do not invent a second one.

---

## 2. Non-negotiable invariants

These come from the user and from the existing architecture. Violating any of them fails the packet.

1. **No quality reduction.** Do not gain performance by reducing content, population, effects, draw
   distance, render quality, or default visual quality. This brief is about *measurement*; if you
   find yourself changing what is rendered, you are out of scope.
2. **Determinism is sacred.** The simulation is a deterministic 60 Hz fixed step with a four-step
   foreground catch-up cap and a fractional accumulator remainder. Instrumentation must not perturb
   sim state, sim ordering, or RNG draw counts. The golden 47a telemetry and `check:sim` /
   `check:sim:compare` / `check:replay` hashes must remain byte-identical.
3. **Do not change `PRODUCTION_UPDATE_ORDER` or the runtime manifest hash.** See
   `src/runtime/authoritativeSystemManifest.js`. Adding a system to the update order changes
   `manifestHash`, which is baked into evidence fingerprints. Instrumentation belongs on the
   presentation side or behind an explicitly excluded diagnostic seam.
4. **Zero cost when off.** This is a performance tool; it must not be a performance problem. Default
   OFF. When off, the cost must be one boolean read per call site — no allocation, no closure
   creation, no string building, no array push. Prove this with a test.
5. **Browser and Electron parity.** Both routes must produce the same counters for the same scenario.
6. **WebGL2 compatibility.** No WebGPU-only APIs.
7. **Source-only asset checkpoints.** Do not modify authored GLBs, release manifests, or dirty
   production place assets.

---

## 3. Inventory FIRST — do not build a second copy of anything

A previous multi-agent sweep on this repo nearly shipped a **second, incompatible dirty-range
mechanism** because it scanned the wrong branch and did not check what already existed. Do not repeat
that. Before writing a line, read and catalogue:

| Existing asset | Path | What it already does |
|---|---|---|
| Perf runtime | `src/core/perfRuntime.js` | `renderWorkEnabled`, `recordRenderWork` CPU spans |
| GPU timers | `src/render/gpuTimers.js` | `createGpuTimers`, `EXT_disjoint_timer_query_webgl2` |
| Dirty GPU ranges | `src/render/dynamicBufferRanges.js` | Owner registry, update ranges, upload acknowledgement, rich diagnostics (646 lines) |
| GPU tier detection | `src/render/adaptiveQuality.js` | `detectGpu`, `createAdaptiveResolution` |
| Shader precompile | `src/render/precompile.js` | `precompilePipelines` |
| Renderer diagnostics | `src/render/renderer.js` | `_hlodDiagnostics`, `_entityViewDiagnostics`, `_publishAssetResidencyDiagnostics`, `startupGpuResidency`, `_contextRecovery` |
| Equivalence harness | `scripts/lib/performanceEquivalence.mjs` | Scenario equivalence contracts |
| Scenario manifest | `scripts/lib/performanceScenarioManifest.mjs` | Declared scenarios |
| Validation broker | `scripts/lib/validationBroker.mjs`, `scripts/validation-broker-cli.mjs` | Claim issuance, launch counts, acceptance vs diagnostic modes, timeout + process-tree cleanup |
| Live probes | `scripts/probe-performance-profile.mjs` (`check:perf`), `scripts/probe-raf-control.mjs` (`check:perf:control`) | Headed timing capture |
| Perf gates | `scripts/check-performance-attribution.mjs`, `check-perf-budget-contract.mjs`, `check-perf-summary.mjs`, `check-render-hotpath-contract.mjs` | Existing contracts |
| Packet gate | `package.json` → `check:perf-packets` | The eight PERF-C tests, chained into CI |

**Your job is to unify and extend this into one coherent instrument, not to start over.** If a counter
already exists somewhere, route it into the new report rather than re-measuring it. Write an explicit
"what I reused vs what I added" section in your final report.

---

## 4. The counter taxonomy — what to instrument

Each entry below states: *what*, *how to capture*, and *the healthy value*. Healthy values become
budgets in §7.

### A. Shader program compilation — HIGHEST PRIORITY

The single most likely explanation for unexplained multi-frame hitches.

- **Capture:** diff `renderer.info.programs` length across frames; for each newly acquired program,
  record its `cacheKey`, the material `type`/`name`/`uuid`, and the frame index. Three.js builds the
  cache key from defines, lights count, fog, shadow map type, envMap presence, morph/skinning,
  clipping planes, vertexColors, tone mapping and colour space — record which of those differ from the
  nearest existing program so the *cause* is attributable, not just the count.
- **Also record:** every site that sets `material.needsUpdate = true` after boot, and every change to
  `scene.fog`, visible light count, `renderer.shadowMap.type`, or `renderer.toneMapping` — these are
  the whole-scene recompile triggers.
- **Healthy:** `0` compiles after the first playable frame. Anything above 0 is a guaranteed hitch and
  the cheapest available fix.

### B. Render target allocation and resize

- **Capture:** wrap/observe `WebGLRenderTarget` construction, `setSize`, and `dispose`. Record
  dimensions, format, sample count, and the owner. Correlate with dynamic-resolution scale changes.
- **Healthy:** `0` after boot except at deliberate resolution/quality changes, and those should be
  bounded and coalesced rather than per-frame.

### C. Texture uploads and mipmap generation

- **Capture:** count `texture.needsUpdate = true` transitions that reach an actual upload; record
  texture dimensions, format, `generateMipmaps`, and whether it was a first upload or a re-upload.
  Canvas-sourced textures (`canvasTextures.js`, HUD gauges) are prime suspects.
- **Healthy:** `0` uploads during steady flight. Boot uploads are expected but should be counted and
  budgeted.

### D. Buffer uploads

- **Capture:** full `bufferData` reallocations vs partial `bufferSubData` ranges, bytes each, per
  owner. `dynamicBufferRanges.js` already tracks `logicalBytesChanged`, `requestedUploadBytes`,
  `uploadRangeCount`, `partialUploads`, `forceFullUploads` — surface those; do not duplicate.
- **Healthy:** partial uploads dominate; `requestedUploadBytes` should track `logicalBytesChanged`
  closely. A large gap means you are uploading untouched memory.

### E. Draw calls and state changes

- **Capture:** `renderer.info.render.calls`, `.triangles`, `.lines`, `.points`; plus program switch
  count, texture bind count, and blend/depth state changes between draws.
- **Healthy:** program switches ≈ number of distinct programs actually used (if switches greatly
  exceed unique programs, sorting is thrashing). Note: a previous investigation on this project
  **falsified** the draw-call theory at 54 calls — so treat a low call count as expected and look
  elsewhere unless it has regressed.

### F. Scene-graph and culling work

- **Capture:** `updateMatrixWorld` invocations per frame, `traverse` invocations per frame, objects
  frustum-tested vs objects drawn, and per-frame LOD/HLOD transitions (`_hlodDiagnostics` already has
  `shadowPolicyRefreshes`).
- **Healthy:** traversals should be bounded by transitions, not by frame count — PERF-C01 established
  that pattern; this counter proves it holds.

### G. Allocation and garbage collection

- **Capture:** per-frame delta of `performance.memory.usedJSHeapSize` (Chromium only; degrade
  gracefully). Allocation *rate* per frame is fairly stable and therefore semi-deterministic; a GC
  shows as a sawtooth drop. Record allocation bytes/frame and detected collection events.
- **Optionally:** a dev-only counting wrapper around hot-path constructors to attribute allocation to
  a subsystem. Must be behind the same OFF-by-default flag and must not exist in production paths.
- **Healthy:** flat or near-flat steady-state allocation during idle flight. A rising sawtooth is
  frame-pacing debt.

### H. DOM, layout and style — SPECIFIC TO THIS GAME, HIGH PRIORITY

This game's HUD is DOM, on the same main thread as the game loop. That is a permanent structural tax
and a recurring stall class. PERF-C05 was exactly this failure mode (a roster rebuilding itself five
times a second because its cache guard hashed a value that changes continuously).

- **Capture:** a `MutationObserver` over the HUD root counting mutations per frame by type
  (childList / attributes / characterData) and by target; plus a **forced synchronous layout
  detector** — instrument reads of `offsetWidth/offsetHeight/offsetTop/offsetLeft`,
  `clientWidth/clientHeight`, `scrollWidth/scrollHeight`, `getBoundingClientRect()`,
  `getComputedStyle()` that occur *after* a write in the same frame.
- **Also:** `PerformanceObserver` for `longtask` and `layout-shift` entries.
- **Healthy:** `0` forced synchronous layouts per frame. DOM mutations bounded by actual state
  changes, never by frame count.

### I. Main-loop scheduling

- **Capture:** simulation steps per rendered frame (histogram, not average), `shedBacklog` events,
  `shedSteps`, presentation ticks skipped, accumulator remainder distribution. Most of this is
  already produced by `src/core/simulationRunner.js` — surface it.
- **Healthy:** 1 step per frame in steady state. Frequent 4-step frames or any backlog shedding means
  the sim is not keeping up and everything downstream is being starved.

### J. GPU pass timings — Tier 2

- **Capture:** via the existing `createGpuTimers`, per-pass spans (shadow pass, main scene, bloom
  levels, composite). Record origin-linked completed query counts so partial data is detectable.
- **Rule:** these are Tier 2. Stamp them contended unless the broker says otherwise.

---

## 5. The deterministic scenario harness — what makes counters comparable

Counters alone are not enough. A count is only meaningful against a **fixed, reproducible scenario**.

Build a scripted scenario runner:

- **Fixed seed**, fixed sector, fixed starting state, fixed scripted input sequence, fixed frame
  count. No wall-clock dependence, no `Math.random()` in the driver, no real-time waits — advance by
  a deterministic frame pump.
- Scenarios should cover distinct load shapes, at minimum: `boot-to-first-playable`, `idle-flight`,
  `combat`, `asteroid-field-dense`, `station-dock`, `sector-transition`.
- Because the sim is deterministic and the scenario is scripted, **the counters are reproducible
  run-to-run on any machine**. That is the property that makes the whole system work: a counter delta
  between two commits is a real regression, not noise, and is therefore **bisectable**.
- Reuse `scripts/lib/performanceScenarioManifest.mjs` and the broker
  (`scripts/lib/validationBroker.mjs`) rather than inventing a parallel launcher. The broker already
  handles claims, launch counts, diagnostic vs acceptance modes, timeouts and process-tree cleanup.

**Acceptance test for the harness itself:** run the same scenario twice on the same commit and assert
every Tier-1 counter is *identical*. If it is not, the harness is not deterministic yet and nothing
built on it can be trusted. Do this before collecting a single real measurement.

---

## 6. The report artifact

One JSON schema, versioned, machine-diffable. Sketch:

```jsonc
{
  "schema": "spaceface.perfCounters.v1",
  "scenarioId": "idle-flight",
  "seed": 1234567,
  "frames": 600,
  "commit": "<sha>",
  "manifestHash": "<hash>",
  "runtime": "browser" | "electron",
  "gpu": { "tier": "...", "renderer": "...", "software": false },
  "environment": { "contended": true, "informational_contended": true },
  "tier1": {
    "shaderPrograms": { "postBootCompiles": 0, "byCacheKeyDelta": [...] },
    "renderTargets": { "postBootAllocations": 0, "resizes": [...] },
    "textures": { "postBootUploads": 0, "bytes": 0, "mipmapGenerations": 0 },
    "buffers": { "fullUploads": 0, "partialUploads": 0, "logicalBytes": 0, "requestedBytes": 0 },
    "draw": { "calls": 0, "programSwitches": 0, "uniquePrograms": 0, "triangles": 0 },
    "sceneGraph": { "updateMatrixWorld": 0, "traversals": 0, "frustumTested": 0, "drawn": 0 },
    "allocation": { "bytesPerFrameMean": 0, "collectionsDetected": 0 },
    "dom": { "mutationsPerFrame": 0, "forcedLayouts": 0, "longTasks": 0 },
    "loop": { "stepsPerFrameHistogram": {}, "shedBacklogEvents": 0 }
  },
  "tier2": {
    "frameTimeMs": { "p50": 0, "p95": 0, "p99": 0, "p999": 0, "max": 0, "hitchesOver2xMedian": 0 },
    "gpuPassMs": { "shadow": 0, "scene": 0, "bloom": 0, "composite": 0 }
  }
}
```

Requirements:
- **Frame-time is a distribution, never an average.** p50/p95/p99/p99.9/max plus a hitch count above
  2× median. An average hides exactly the spikes that make a game feel bad.
- Every Tier-2 field must be omitted or flagged when captured contended.
- A `diff` tool that compares two reports and prints only changed counters, so a regression is one
  command away.

---

## 7. Budgets — turn measurement into a contract

Once counters are stable, express the healthy values from §4 as budgets and gate them. This fits the
repo's existing culture of gates and receipts, and it is what stops performance regressing silently
between features.

Start with the unambiguous zero-budgets:

- post-boot shader compiles: **0**
- post-boot render-target allocations outside declared resolution changes: **0**
- texture uploads during steady flight: **0**
- forced synchronous layouts per frame: **0**
- backlog-shed events during idle flight: **0**

Then add ratio budgets (upload bytes vs logical bytes changed; program switches vs unique programs)
once you have real numbers to set them from. **Do not invent thresholds before you have data** — set
zero-budgets now, ratio budgets after the first clean capture.

Wire the gate into the CI matrix the same way `check:perf-packets` was wired: add the script to
`package.json`, chain it into the `check` script ahead of `check:gate-reachability`, then verify with
`npm run check:gate-reachability` that it is **declared and not in the orphan list**. A gate that
exists but is unreachable protects nothing — eight packet tests sat unreferenced by any script until
this was discovered.

---

## 8. Build phases and acceptance criteria

**Phase 1 — Substrate and harness (build this before any counter).**
- Inventory pass (§3) written up.
- OFF-by-default instrumentation seam with a proven zero-cost-when-off test.
- Deterministic scenario runner + report schema.
- *Acceptance:* same scenario twice on the same commit produces byte-identical Tier-1 output;
  `check:sim`, `check:sim:compare`, `check:replay`, `check:baseline` all unchanged.

**Phase 2 — The stall counters (A, B, C, H).** Shader compiles, render targets, texture uploads, DOM
forced layouts. These are the highest-probability causes.
- *Acceptance:* run every scenario, publish the counts. **This is the deliverable that answers the
  actual question.** If post-boot shader compiles are non-zero, stop and report immediately — that is
  very likely the entire choppiness problem.

**Phase 3 — The volume counters (D, E, F, G, I).** Buffer uploads, draw/state, scene graph,
allocation, loop scheduling.

**Phase 4 — Tier 2 timing (J) + distribution reporting.** Frame-time histogram, GPU pass spans, hitch
counter, broker-gated acceptance capture.

**Phase 5 — Budgets and CI gate (§7).**

**Phase 6 — Diff tooling and a bisect recipe** so any future regression is attributable to a commit.

Commit and push after every phase. Append one line to
`design/program/roadmap/PERFORMANCE_MODERNIZATION_PROGRESS.md` per phase.

---

## 9. Traps specific to this repository

Learned the hard way; ignoring these costs hours.

1. **Mutation-test every assertion.** A test that passes both before and after the change it claims to
   cover is worse than no test. This branch shipped `assert.equal(harness._shadowSettingOn, true)`
   against a hardcoded harness field neither function under test reads — literally
   `assert.equal(true, true)` wearing a message about the thing it failed to check. Method: back the
   production file up to the scratchpad, delete the guard, confirm the test **fails**, restore, confirm
   `git diff` is clean. Report which assertions carry the weight.
2. **Never `assert.equal` two DOM nodes or cyclic objects.** On failure `node:assert` deep-inspects
   both operands to build a diff; on this repo's DOM shim that took 112 seconds and then died with
   `RangeError: Array buffer allocation failed`, which reads as CI infrastructure flake. Use
   `assert.ok(a === b, msg)`.
3. **Beware vacuous cache guards.** PERF-C05's bug was a guard that hashed `Math.round(distance)` —
   a value that changes every sample while moving — so the guard never fired in the only situation it
   mattered. When you add a counter that reports "cache hit rate", verify the guard actually fires in
   the *live* case, not just in a synthetic one.
4. **Untracked files get deleted in this environment.** `git add -N -- <path>` immediately after
   creating any new file.
5. **Concurrent agents may be editing this worktree.** Always use path-limited staging and commits:
   `git add -- <paths>` then `git commit -m "..." -- <paths>`. Never bare `git stash` / `git stash pop`.
   Never clear a "stale" `index.lock` — age is not liveness, and doing so once swept another agent's
   staged files into the wrong commit.
6. **Do not run whole-tree gates while another agent is mid-edit.** `check:bundle` builds everything;
   a half-written file produces a meaningless failure.
7. **CRLF warnings on commit are normal here** and are not a code defect; `git diff --check` is the
   real signal.
8. **Isolated worktrees branch off master, not this branch.** An agent working in
   `isolation: "worktree"` will produce a commit whose parent lacks C01–C08, and cherry-picking it
   back conflicts — one such commit tried to restore a function PERF-C01 had deleted. Prefer working
   directly in the perf worktree with path-limited commits, or expect to hand-reconcile.
9. **Verify claims against THIS branch.** A prior sweep scanned the primary repo at master and
   "discovered" three optimizations that were already shipped here, and prescribed an implementation
   that would have built a second, incompatible dirty-range mechanism alongside
   `dynamicBufferRanges.js`.
10. **Do not claim timing numbers from this workstation.** Many coding agents run concurrently; the
    load is not static. Tier 1 only, unless the broker grants a quiet host.

---

## 10. First actions for the new thread

1. Read `design/program/roadmap/PERFORMANCE_MODERNIZATION_PROGRESS.md` and this file.
2. `cd C:\Users\93rob\sf-perf-admission-20260726`, confirm branch `claude/perf00-20260727`, `git fetch
   origin`, integrate `origin/master` if behind, and push nothing else.
3. Do the §3 inventory pass and write up "reuse vs add" **before** designing anything.
4. Build Phase 1. Prove the harness is deterministic (same counts twice) before collecting data.
5. Build Phase 2 and report the numbers. Expect the answer to be there.

The single most valuable sentence you can produce is:

> "Post-boot shader compiles in scenario X: N."

If N is not zero, that is very likely the whole problem, and it will be a small fix.
