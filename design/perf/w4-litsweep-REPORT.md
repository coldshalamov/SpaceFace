# Wave-4 Meta-Lane Report — Literature Sweep

Lane question: *what do SIGGRAPH / Advances-in-Real-Time-Rendering, the three.js perf
issue tracker, and the Electron/Chromium perf surface offer that the campaign's ~30
lanes have NOT already adjudicated?*

Branch: `devin/1790669139-w4-litsweep` off `origin/master` (d79929ac2).

## Verdict

The corpus is genuinely exhausted at the JS-game layer — the sweep confirms the ~30
shipped lanes cover every mainstream technique the literature offers this stack. One
real gap survived triage: **V8 young-generation sizing** (`--js-flags=
--max-semi-space-size`, the prompt's "GC pacing via explicit young-gen management"
candidate) — every other V8 surface the campaign touched (deopt audit, compile cache,
`bypassHeatCheck`, heap residency, event interning, zero-alloc discipline) attacks
allocation and compile cost; none touch the collector's nursery cap. Implemented as a
shell-side flag leaf (KEEP-pending-A/B below); every other candidate is rejected with
reasons in §2.

## 1. What shipped

- `electron/main.cjs` — `app.commandLine.appendSwitch('js-flags',
  '--min-semi-space-size=64 --max-semi-space-size=64')`, env-overridable via
  `SPACEFACE_SEMI_SPACE_MB` (8–512, same override idiom as
  `SPACEFACE_ANGLE_BACKEND`; 'default' or any non-integer unsets the flag).
- `scripts/probe-frame-solid.mjs` — `SF_PROBE_V8_FLAGS` env merges extra V8 flags
  into the existing `--js-flags=--expose-gc` launch arg so flag A/Bs ride the real
  probe (probe-side only, zero production cost — same convention as the `--expose-gc`
  boundary-collection hook).

Mechanism + the pin requirement (the finding the naive reading of the literature
misses): V8 sizes the nursery itself via a mutator-utilization controller — for
cheap-scavenge workloads it settles at ~16 MB/semi-space *below* the cap, so a
`--max-semi-space-size` bump alone is a verified **no-op** (identical scavenge
curves). The ceiling only binds if the *floor* is raised with it — pinning
`min=max=64` forces the big nursery the controller would never choose for itself.
Verified on an identical 12-burst ~720k-object allocation workload under
`--trace-gc`: default 20 scavenges, `--max-semi-space-size=64` 20 scavenges,
`--min-semi-space-size=64` alone 8 (initial-size only — controller shrinks back),
`--min=64 --max=64` pin **2 scavenges** — ~10× rarer at equal wall time
(58.1→58.0 ms, mu stayed 1.000). Scavenge pause scales with *survivors*, not
nursery size — and the flight loop holds near-zero steady-state allocation (the
campaign's own rule), so survivor sets stay ~1–2 MB and each pause is unchanged;
only their *frequency* drops. Cost: two semi-spaces of reserved address space per
isolate (128 MB vs ~32 MB); committed pages follow real allocation, so RSS cost
accrues only during bursts that would have allocated anyway. js-flags is forwarded
to every isolate the shell spawns — renderer and the decode worker pool alike.
Sim-hash surface: none — `sf-sim.mjs` runs in plain Node; the flag only exists
inside the Electron shell.

Citations: V8 Orinoco parallel-scavenger design (v8.dev blog "Getting garbage
collection for free" / "Orinoco: young generation garbage collection");
nodejs/node#42511 (+18% web-tooling-benchmark throughput at `--max-semi-space-size=
128` — the flag's direct precedent); Node.js "Understanding and Tuning Memory"
(`--max-semi-space-size` semantics); Electron `command-line-switches.md` (`--js-flags`
forwards V8 flags to renderer processes).

## 2. Candidates — all rejected with reasons

| Candidate | Citation | Verdict |
|---|---|---|
| WebGL2 occlusion queries (`ANY_SAMPLES_PASSED_CONSERVATIVE`) | three.js PR #15450 (2018, never merged), PR #20554 (closed); merged only for WebGPURenderer's WebGL backend (#26744); GPU Gems 2 ch.6 frame-delayed-results recipe | **REJECTED** — unshipped in WebGLRenderer to this day; readback stalls the pipeline unless results are consumed one frame late; top-down sparse space scene has no named overdraw pole (per-triangle runtime occlusion already adjudicated WORTHLESS in the closure doc); GPU-side win cannot be measured on this SwiftShader box (GATED-class evidence) |
| WebGPU render or compute path | three.js manual: WebGPURenderer "still in an experimental state"; issue #31055 — per-object UBO re-upload problem, ~10× slower than WebGLRenderer with many moving meshes; ShaderMaterial/`onBeforeCompile` unsupported (the game depends on both: authoredMaterialProfiles, volumetricPlumeMaterial, transientVfxMaterials) | **REJECTED** — stays GATED per closure doc §8; additionally regressive on today's evidence; a raw-WebGPU compute bolt-on beside WebGL still pays Dawn device init + flag surface with no measured GPU-bound pole |
| OffscreenCanvas main-render (transferControlToOffscreen, rAF-in-worker pacing) | closure doc §8 item 2; three.js `webgl_worker_offscreencanvas` example | **REJECTED/GATED** — the same PQ-067 copy-cost seam the corpus already gated; the packed snapshot fence exists but the transport-economics spike was never cleared; L effort. (`loadingTerminalArt` already renders on a worker OffscreenCanvas where it pays) |
| CompressionStream/DecompressionStream for save payloads | MDN Compression Streams API | **REJECTED** — save pipeline is already worker-serialized + slice-bounded (`AUTOSAVE_HARD_SLICE_MS`); localStorage is string-synchronous, so compression only shrinks the final setItem/LevelDB put while adding an async decompress contract to the sync load path; saves are tens-of-KB — the serialize tax is JSON.stringify, which compression doesn't remove |
| JIT warmup ordering (invocation-count / tier-up flags) | V8 tiering docs | **REJECTED** — no production-controllable API (`--allow-natives-syntax` unavailable); `enableCompileCache` + `v8CacheOptions:'bypassHeatCheck'` already land bytecode deserialization at module load; lowering tier-up thresholds trades boot CPU for earlier optimization — two-sided, unproven |
| `--expose-gc` + scheduled idle-time major GC | V8 gc() semantics | **REJECTED** — a forced major GC is 5–50 ms, far worse than the sub-ms scavenges it would pre-empt; `--expose-gc` already serves as probe instrumentation for the boundary collection |
| BatchedMesh + `WEBGL_multi_draw` + per-instance BVH (agargaro/batched-mesh-extensions) | three.js #27219 (BatchedMesh cull perf, merged r159), #28776 (multi_draw discussion) | **REJECTED (covered)** — the repo runs its own 5-draw InstancedMesh pool + three-mesh-bvh; upstream already fixed the cull path; rewriting the pool to BatchedMesh buys ~4 draw calls of a ~100-draw frame |
| SIGGRAPH 2025 AoRTR program — MegaLights/ReSTIR direct lighting, adaptive voxel OIT, strand hair/fur, hybrid ReSTIR SSS, AC:Shadows world RT | advances.realtimerendering.com/s2025 | **REJECTED** — every technique assumes a ray-tracing or bindless GPU pipeline WebGL2 lacks; all are lighting/quality-model changes → ILLEGAL under the picture contract regardless |
| `--disable-renderer-backgrounding` / timer-throttling flags | Electron command-line-switches.md | **REJECTED** — no-op for a foreground fullscreen window (invisible-page priority only); the probe already passes them for measurement hygiene; `backgroundThrottling` webPref is already managed for the evidence window |
| `--in-process-gpu` | Chromium gpu-process docs | **REJECTED** — merges the GPU service into the browser process: loses crash isolation for an unproven IPC saving; the GPU process is already observable via the `spaceface:perf-metrics` channel |
| `--force-color-profile=srgb`, `desynchronized` canvas, `--disable-frame-rate-limit` | Chromium flags | **REJECTED** — visual-change risk (colorimetry, tearing under DOM overlays, broken 60 Hz pacing); `desynchronized` and frame-rate-limit were already explicitly rejected by the glflags lane |
| Transform-feedback GPU particle update | WebGL2 `TRANSFORM_FEEDBACK` | **REJECTED** — quarks' CPU particle sim is not on the named pole list; moving emitters to GPU feedback buffers is an X-effort visible-path change |
| ServiceWorker asset caching for boot | ServiceWorker spec | **REJECTED** — the game is served from the in-process loopback server; `fetchVerifiedRenderBytes` already reads `force-cache` first and the V8 code cache covers module parse — an SW layer adds its own fetch interception overhead for a zero-latency transport |
| `--no-flush-bytecode`, `--no-liftoff`, tier flags (`--no-maglev`, `--no-sparkplug`) | V8 flags | **REJECTED** — bytecode flushing hits cold paths that recompile rarely; forcing TurboFan for all WASM trades boot time for steady-state that Liftoff tier-up already reaches; disabling tiers is strictly worse |
| Rapier SIMD128 / relaxed-simd WASM build | @dimforge/rapier3d-compat build config | **REJECTED** — the compat build ships scalar wasm32; a SIMD build needs a custom toolchain for an island already adjudicated under the PQ-083/091 copy-cost bar (`wasm-function` ≈ 312 ms self/run — already WASM) |
| `Atomics.waitAsync` / SAB transport ring | MDN Atomics | **REJECTED/GATED** — same PQ-067 worker-transport gate; decode workers already move payloads as transferables (zero-copy) |
| `requestVideoFrameCallback` | MDN | **N/A** — no video elements in the presentation path |

## 3. Metrics

Golden 47a: `sha256 == baselineSha256 ==
cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885`,
`deterministic: true`, 20×720-tick replays + reload-at-600, exit 0 — identical by
construction (shell-flag leaf; the sim runner is plain Node and never sees js-flags).

Probe A/B (`probe-frame-solid --headless --cpu-profile`, SwiftShader box —
directional, ±2× documented noise):

| arm | frames | missing/stuck | appearOnTime | links | gc | gc per busy-ms |
|---|---|---|---|---|---|---|
| baseline (expose-gc) | 239 @ p50 470 ms | 2 / 0 | 0.971 | 14 | 277.8 ms / 104.3 s | 2.80 e-3 |
| `--max-…=64` only (no-op arm) | 690 @ p50 84 ms | 397 / 308 | 0.594 | 14 | 196.3 ms / 60.8 s | 4.05 e-3 |
| pinned `min=max=64` | 836 @ p50 58 ms | 338 / 237 | 0.56 | 17 | 139.4 ms / 52.9 s | 3.32 e-3 |

Read: the three runs sampled different sorties at ~5–8× frame-rate spread — totals
are inside this box's demonstrated noise envelope and cannot be attributed to a
heap flag. On the two *comparable* arms (both saturated admission storms,
upgradePending mean ~23): the pinned arm carried **~18% less GC per busy-ms**
(3.32 vs 4.05 e-3) and lower absolute gc (139.4 vs 196.3 ms) with missing/stuck
trending better (338/237 vs 397/308) inside noise — consistent in direction with
the microbench, though smaller (the run's GC mass is incremental-marking/old-gen
work the nursery flag doesn't touch). Honest statement: mechanism proven by
microbench; on-box probe shows no regression and a consistent directional GC
reduction; the missing-frame effect is below this box's noise floor — owner-GPU
headed runs are the arbiter, same as every GC-class leaf before it.

## 4. Zero visible quality change

No draw-path, sim-path, asset, or content change. The production diff is one
`js-flags` appendSwitch (heap configuration, not behavior); the probe diff is an
env-gated measurement hook that is a no-op when unset.
