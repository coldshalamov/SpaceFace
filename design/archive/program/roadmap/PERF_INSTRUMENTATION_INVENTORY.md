<!-- LIFETIME: DURABLE -->
# Deterministic Perf Instrumentation — §3 inventory: reuse vs add

Companion to `DETERMINISTIC_PERF_INSTRUMENTATION_BRIEF.md`. Written **before** any design work, as
§3 and §10.3 require, because a previous multi-agent sweep on this repo nearly shipped a second,
incompatible dirty-range mechanism by not doing this.

Branch `claude/perf00-20260727` at `0f36f386`. At that commit the branch, `origin/master` and the
primary checkout are all the same SHA — the perf work is merged and pushed, so master and this
branch are not divergent and claims verified here are claims about master.

---

## 1. What already exists

| Asset | Path | What it already does | Verdict |
|---|---|---|---|
| Perf runtime | `src/core/perfRuntime.js` (671) | Ring-buffer stats (`RING_N=180`) for frame/callback/phase spans; **loop counters**; spatial-hash, VFX-trail and VFX-subsystem counters; save timings; `getReport()` | **Extend** — this is the counter home |
| Frame seam | `src/core/presentationRunner.js:402-493` | `perf.beginFrame(...)` at frame open, `perf.recordFrameCallback(...)` in `finally` | **Reuse as the per-frame boundary** |
| Scheduler seam | `src/core/presentationRunner.js:44-63` | `deps.requestFrame` / `deps.cancelFrame` / `deps.nowMs` / `deps.perfNow` are all injectable | **Reuse — do NOT build a second frame pump** |
| Boot-to-flight harness | `scripts/check-shader-compile.mjs:130-151` | Playwright recipe: wait for `window.SF`, skip splash, New Game → Launch, wait `state.mode === 'flight'` | **Reuse verbatim** |
| Probe server | `scripts/lib/visualProbeServer.mjs` | `acquireVisualProbeServer({root})` → ephemeral loopback game server | **Reuse** |
| GPU timers | `src/render/gpuTimers.js` (332) | `createGpuTimers(gl)`, `EXT_disjoint_timer_query_webgl2`, label pool | **Reuse for Tier 2 (J) only** |
| Dirty GPU ranges | `src/render/dynamicBufferRanges.js` (646) | Owner registry, update ranges, upload acknowledgement; already tracks `logicalBytesChanged`, `requestedUploadBytes`, `uploadRangeCount`, `partialUploads`, `forceFullUploads` | **Route into the report — do NOT re-measure (D)** |
| GPU tier detection | `src/render/adaptiveQuality.js` | `detectGpu(renderer)` → `state.render.gpu` (tier, software flag) | **Reuse for the report's `gpu` block** |
| Shader precompile | `src/render/precompile.js` (552) | `precompilePipelines` via `renderer.compileAsync` over ship archetypes, weapons, enemies, VFX salvo, wormhole; per-sector and global variants | **Context for (A) — see §3** |
| Validation broker | `scripts/lib/validationBroker.mjs` + CLI | Claims, launch counts, acceptance vs diagnostic modes, timeouts, process-tree cleanup | **Reuse for Tier-2 gating** |
| Scenario manifest | `scripts/lib/performanceScenarioManifest.mjs` | `validatePerformanceScenarioManifest` / `compilePerformanceScenarioManifest` — a schema validator, **not** a scenario list | **Reuse the validator; the manifest document does not exist yet** |
| Packet gate | `package.json` → `check:perf-packets` | The eight PERF-C tests, chained into CI (added by PERF-C04a) | **Pattern to copy for the budget gate** |

### Two facts that change the design

**`window.__SPACEFACE_PERF__` is not debug-gated.** `perfRuntime.js:669` publishes it whenever
`window` exists. `window.SF` by contrast is gated on `SF_DEBUG` (`src/main.js:40`), which is false in
a production bundle. Invariant #5 demands browser/Electron parity, so **new counters must be reachable
through `__SPACEFACE_PERF__`, never through `SF`.** Probes may use `SF` for driving; evidence must not
depend on it.

**The OFF-by-default pattern already exists and is proven.** `systemTimingEnabled` and
`renderWorkEnabled` are private booleans with `isX()`/`setX()` accessors, and both `recordSystem` and
`recordRenderWork` return early on a single boolean read before touching a ring. New counters follow
this exact shape rather than inventing a flag convention.

---

## 2. What is genuinely missing

§4 of the brief lists ten counter families (A–J). Measured against the table above:

| Family | Status | Note |
|---|---|---|
| **I. Main-loop scheduling** | **~90% already shipped** | `perfRuntime.loop` already has `stepsThisFrame`, `maxStepsThisFrame`, `multiStepFrames`, `shedBacklogFrames`, `shedStepsTotal`, `accumulatorS`, plus a `backlogCause` classifier with per-cause counts. Only the **steps-per-frame histogram** is missing (today there is a max and a multi-step count, not a distribution). |
| **D. Buffer uploads** | **Data exists, not surfaced** | `getDynamicBufferOwnerDiagnostics` has the numbers; needs routing into the report, not re-measurement. |
| **J. GPU pass timings** | **Mechanism exists** | `createGpuTimers` is built; needs Tier-2 labelling and broker gating. |
| **A. Shader compiles** | **Missing** | `check:shader-compile` counts programs **once**, after a 2.5 s wall-clock wait, and asks only "did they link?". Nothing tracks acquisition over time. |
| **B. Render-target allocation** | **Missing** | |
| **C. Texture uploads** | **Missing** | |
| **E. Draw calls / state changes** | **Missing** | `renderer.info.render` is available but unsampled. |
| **F. Scene-graph work** | **Missing** | |
| **G. Allocation / GC** | **Missing** | |
| **H. DOM / layout** | **Missing** | The highest-value missing family after A, because the HUD is DOM on the game thread and PERF-C05 was exactly this failure mode. |

**Nothing in this repo counts a GL operation.** That is the single real gap, and it is why one
mechanism covers most of it.

---

## 3. What I am adding, and why it is one mechanism rather than eight

**WebGL-context instrumentation, installed on the live context object.**

Families A, B, C, D and E are all *GL calls*. Rather than eight subsystem-specific hooks, wrap the
context returned by `renderer.getContext()` at `src/render/renderer.js:688` (immediately after
`new THREE.WebGLRenderer(...)`, before `detectGpu`):

| Wrapped call | Answers |
|---|---|
| `linkProgram` / `compileShader` | **A** — exact, ordered, cannot miss a program created and disposed inside one frame |
| `createFramebuffer`, `renderbufferStorage`, `texStorage2D` | **B** |
| `texImage2D`, `texSubImage2D`, `generateMipmap` | **C** |
| `bufferData` vs `bufferSubData` + byte lengths | **D** (cross-checked against `dynamicBufferRanges`) |
| `drawArrays*`/`drawElements*`, `useProgram`, `bindTexture` | **E** |

Why this over per-subsystem hooks:

- It is **complete by construction**. It catches work THREE does internally — the render-target
  reallocation behind `setSize`, the upload behind `texture.needsUpdate` — which per-call-site hooks
  miss precisely because those call sites do not look expensive. That invisibility is the brief's
  stated reason this system exists.
- It is **zero cost when off in the strongest sense**: the wrappers are *installed on enable*, so
  when disabled there is no call site at all, not merely a boolean read.
- It is instance shadowing (`gl.drawElements = wrapper`), not prototype patching, so it cannot leak
  into another context or another test.

Added on top, not via GL:

- **F** — counting wrappers on `THREE.Object3D.prototype.updateMatrixWorld` / `.traverse`. The
  importmap (`index.html:17`) maps `three` to a single `./vendor/three.module.js` instance, so an
  instrumentation module importing `three` patches the same object the game uses. Heaviest hook;
  **deferred to Phase 3**.
- **G** — `performance.memory.usedJSHeapSize` delta per frame. **Explicitly not deterministic** (see
  §4).
- **H** — `MutationObserver` over the HUD root counting mutations per frame by type and target, plus
  counts of layout-forcing reads, plus `PerformanceObserver` longtask entries.

### Deliberate scope cut in H

The brief asks for a *forced synchronous layout* detector — a layout read that happens after a write
in the same frame. Doing that exactly requires `defineProperty` surgery on `Element.prototype`
`innerHTML`, `Node.prototype.textContent` and `className` to maintain a dirty flag. Getting that
subtly wrong breaks the game silently, and the payoff is an ordering refinement on top of a count I
can get safely. Phases 1–2 therefore ship **mutation counts by target** and **raw layout-read
counts**. This still catches PERF-C05's actual failure mode — a roster rebuilding ~5 Hz shows up as
mutation count scaling with frame count instead of with state changes — which is the thing that
mattered. The read-after-write refinement is deferred and recorded here so it is not silently
dropped.

---

## 4. Correcting the brief: the determinism assertion needs an allowlist

§5 says "assert every Tier-1 counter is *identical*" between two runs. Taken literally that gate can
never pass, and a future session would spend hours concluding the harness is broken when the
specification is:

- **G (allocation/GC) is not deterministic.** GC scheduling is at the VM's discretion.
  `usedJSHeapSize` deltas vary run to run on an identical workload. The brief files this under Tier 1;
  it is not a Tier-1 counter by the brief's own definition ("CPU contention cannot change an
  integer" — contention *can* change this one).
- **E (draw calls, program switches) is culling-dependent**, so it is deterministic only if the frame
  pump drives synthetic monotonic timestamps rather than wall-clock rAF.
- **C (texture uploads)** includes canvas-sourced HUD textures, which can vary with font and DOM
  timing.

The report schema therefore carries an explicit `deterministic` allowlist, the equality gate asserts
byte-identity over **that set only**, and every other counter is emitted with `nondeterministic: true`
so no future reader mistakes it for a bisectable signal.

## 5. Correcting the brief: Tier 1 and Tier 2 cannot share a run

§6's schema puts `tier1` and `tier2` in one document, which invites capturing both at once. They
cannot be: `apply(this, arguments)` wrappers on `drawElements` and `bufferSubData` deoptimise the
hottest calls in the frame. Counts stay valid — that is the entire Tier-1 argument — but timings
captured alongside them are not merely contended, they are **instrument-distorted**, which is worse
because it is invisible. The report records which instrumentation was live, and refuses to populate
`tier2` while GL wrapping is on.

---

## 6. Standing trap: a zero-budget counter can fail silently

Most budgets in §7 are zero-budgets, and a dead hook reports the same `0` as a healthy system. Brief
trap #1 (mutation-test every assertion) applies to counters, not only to tests. **No counter's number
goes into a report before it has a positive control.**

Where possible the positive control is intrinsic rather than synthetic. For (A) it is the boot ramp:
the same detector must first observe programs climb from 0 to ~46-70, so a post-boot `0` cannot be
vacuous. `scripts/probe-shader-compile-timeline.mjs` fails the run outright if the ramp it observed
is implausibly small, mirroring how `check:shader-compile` guards its own vacuity with
`MIN_EXPECTED_PROGRAMS`.
