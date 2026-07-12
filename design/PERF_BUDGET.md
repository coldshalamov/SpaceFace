# SpaceFace — Frame-Time Performance Budget

Status: living doc. Pairs with `src/render/diagnostics.js` (in-game probe),
`scripts/probe-performance-profile.mjs` (quality-preserving browser profiler),
`design/PERF_TRIAGE.md` (baseline bottleneck evidence), and ARCHITECTURE §2.2 (loop) /
§2.4 (draw pipeline). This is the contract every render-touching PR is measured against.

Enforced by `npm run check:perf-budget` (`scripts/check-perf-budget-contract.mjs`).

---

## 1. Targets

| Tier | Frame budget | Notes |
|------|--------------|-------|
| **Target (desktop)** | **16.7 ms** (60 fps) | The number we ship and tune to. |
| **Floor (low-end PC/browser)** | **33.3 ms** (30 fps) | Hard floor. Below this on the floor profile is a release blocker. |

The loop (`src/core/loop.js`) is a fixed-60Hz sim accumulator with a per-frame interpolated render.

- `LOOP_FIXED_DT = 1 / 60` (loop.js:6)
- `MAX_CATCHUP_STEPS = 4` (loop.js:7) — at most four 1/60 s sim steps per rendered frame
- `advanceFixedTimestep()` sheds overdue whole-step backlog when the accumulator still holds ≥ one
  step after the cap while preserving the sub-step interpolation remainder (`shedBacklog: true`)

Sim cost is **quantized in whole 1/60 s steps** (usually 1; up to **4** under load). Render cost is
whatever the frame draw takes. A frame that overruns 16.7 ms pushes leftover time into the accumulator
and the next frame may run extra sim steps — so **render overruns amplify into sim-step backlog**.
Keeping the render half inside budget is what keeps the sim from spiraling (`MAX_CATCHUP_STEPS` then
sheds backlog rather than locking up).

`frameDt` is clamped to **0.25 s** (loop.js:44) so a stall/tab-switch can't teleport state.

**Measurement bar:** average FPS alone is insufficient. Gate on **p95 / p99 frame time**, **hitch count**
(frames >32 ms), and phase p95s from `npm run check:perf` / `__THREE_GAME_DIAGNOSTICS__`.

---

## 2. Budget allocation (60 fps / 16.7 ms)

Per-frame split. "Sim" is the summed cost of all 1/60 steps run this frame (usually 1; up to 4 under
load). The remaining categories are the once-per-frame render phase (`registry.renderUpdate`).

| Category | Budget | Owner(s) | What lives here |
|----------|-------:|----------|-----------------|
| **Sim** | **5.0 ms** | `registry.step` → UPDATE_ORDER | input, ai, flight, weapons, **physics** (integrate + spatial-hash layer rebuild + broad-phase), combat, mining, economy, world, factions, missions, traffic. |
| **Render** | **7.0 ms** | `render.renderFrame` (renderer.js:1188) | mesh reconcile + view interp, camera follow, starfield recenter, scene draw, **bloom** post chain. |
| **VFX** | **2.5 ms** | `vfx.update` | active-list particle/sprite integrate, trail emit, event-light decay. |
| **UI** | **1.2 ms** | `ui.frame` + `feel.frame` (registry.js) | DOM/CSS overlay reconcile, HUD, camera-feel punch. |
| **Headroom** | **1.0 ms** | — | GC slack, browser compositor, jitter absorption. |

**30 fps floor (33.3 ms)** is *not* "2× everything." The sim is fixed-step, so it costs the same wall
-clock work per second at any frame rate — at 30 fps you simply run ~2 steps/frame. The extra ~16 ms of
floor budget is spent on the **render + vfx** half (bigger draw, particles), which is why structural
optimizations target invisible work on that half — not default quality reduction.

---

## 3. Non-negotiable optimization doctrine

These rules apply to **every** render, VFX, UI, physics, and asset PR. Violations are release blockers
unless explicitly labeled **diagnostic-only** (probe isolation variants, never player-facing defaults).

### Forbidden as default "fixes"

- Turning down `renderScale`, `pixelRatioCap`, `bloom`, `shadows`, or `particleQuality` to pass perf gates.
- Shipping "make assets small and shitty" — low-poly/low-res hero meshes with no LOD plan.
- Disabling authored visuals, procedural fallbacks, or bloom/shadows/particles in default play.
- Claiming a win from average FPS while **p95/p99/hitches** regress.

`scripts/probe-performance-profile.mjs` sets `qualityPreserving.settingsOverridesApplied: false` and
lists forbidden shortcuts (`renderScale`, `pixelRatioCap`, `bloom`, `shadows`, `particleQuality`,
`physicsSimplification`). Follow that probe's contract.

### Required instead (quality-preserving optimization)

Remove **invisible work** before removing visible quality:

| Technique | Where it applies |
|-----------|------------------|
| **Batching / instancing** | Authored static batches, repeated props, asteroid fields |
| **Material role sharing** | Export + runtime canonical roles (`SF_Shared_*`, `SF_Mutable_*`) |
| **LOD / HLOD / impostors** | Hero ships, stations, dense fields at distance |
| **Culling** | Frustum, distance, off-screen sim (sectorSim), radar adaptive paths |
| **Compression** | Texture/basis, mesh quantization in export pipeline |
| **Precompile / warm-up gates** | `pipelinePrecompile`, shader/program cache before flight entry |
| **Cadence reduction** | AI/scanner/HUD updates at fixed Hz, not every rAF when safe |
| **Profiler evidence** | Before/after `check:perf`, `check:hitch-budget`, diagnostics snapshot |

New visual assets need a **LOD + culling + material-sharing strategy** documented in the asset brief —
not an arbitrary "keep triangles under N" budget that trades away authored quality.

### Hot-path discipline

- **No per-frame allocation** in sim, render, VFX, or UI reconcile hot paths (reuse buffers, stamps,
  active lists, pre-sized arrays).
- **No render-target allocation** during normal gameplay frames (resize only on settings/viewport change
  or explicit diagnostic bisect — never per-frame dynamic RT churn).
- **Moving DOM/HUD overlays** must use **`transform`** (and `opacity` where needed), not `left`/`top`
  layout thrash. Animate on compositor-friendly properties only.
- **Hidden fullscreen overlays** must be `display: none` or **unmounted** — not `opacity: 0` /
  `visibility: hidden` with active `filter`/`backdrop-filter` still compositing. Enforced in
  `check:ui:perf` / `probe-performance-profile.mjs` compositor shell budgets.

### Measurement required

Every render/VFX/UI/physics PR that claims a perf win must attach **before/after** evidence:

1. `npm run check:perf` summary (or `__THREE_GAME_DIAGNOSTICS__.getReport()` snapshot)
2. **p95 and hitch count**, not just average frame time
3. Same machine, same window size, same scenario, same default video settings
4. Screenshot pair in `.devshots/` when the change is visual

---

## 4. Known cost centers (found in code)

Ranked roughly by impact. Anchors verified against the working tree.

### 4.1 Bloom post chain — `src/render/bloom.js`

- **Multiple `renderer.render()` calls per frame** when bloom is on: scene capture + bright extract +
  blur passes + composite. Scene pass is full-res HDR; MSAA may apply on WebGL2 targets.
- Fast path: at `strength <= 0.0001` or bloom off → single direct `renderer.render(scene, camera)` —
  pixel-identical, zero extra cost.
- **Measurement caveat:** draw-call/triangle counts are only comparable **within the same bloom state**.
  `diagnostics.js` accumulates `render.calls` across all passes in a frame.
- Knobs: `settings.video.bloom`, `bloomStrength`, `bloomThreshold` (live via `settings:changed`).
  Blur targets are half-res by design.

### 4.2 Entity↔mesh reconcile — `src/render/renderer.js`

- `reconcileMeshes()` (renderer.js:832) is **delta-driven**: removes dead meshes, queues missing builds,
  drains the queue under `RUNTIME_MESH_BUILD_BUDGET` per frame. Not a full rebuild every frame.
- `syncEntityViews` still walks live entities for position/rot/bank interpolation each frame — O(entities)
  view sync remains a scaling floor.
- Initial sector load can burst mesh builds; `main.js` gates flight until authored assets settle.

### 4.3 Particle and sprite integration — `src/render/vfx.js`

- **Active-list integration:** `_integrateParticles` (vfx.js:2594) iterates only `_activeParticles`
  (`_liveCount` slots), not the full pool cap. Early-outs when `_liveCount <= 0`.
- `_integrateSprites` (vfx.js:2642) iterates only `_activeSprites` (`_liveSpriteCount`).
- Retire uses swap-remove on the active lists (vfx.js:399-438) — O(1) removal, no full-cap scan.
- GPU upload: up to four `BufferAttribute.needsUpdate` per frame sized to `_pDrawMax` (live span).
- `_emitTrails` (vfx.js:2466) still walks `entityList` on a cadence for thrust/damage trails.
- Event-light pool: bounded dynamic `PointLight`s — per-fragment cost when active; gated by distance
  and quality settings.
- `settings.video.particleQuality` sets pool **cap** and `QUALITY_BURST` spawn multiplier — changing
  the default quality level is **not** a perf fix; cap exists for player settings only.

### 4.4 Spatial hash — `src/core/spatialHash.js`

Layered broad-phase grid used by physics (`src/core/physics.js`) and proximity queries.

**Current design (not the legacy string-key + per-query Set model):**

- **Static layer** (`_staticBuckets`) cached by `staticVersion` — rebuilt only when static colliders change.
- **Dynamic layer** (`buckets`) rebuilt per sim step for moving colliders via `rebuildLayers()`.
- **Nested `Map` keys:** `cx` (number) → `Map<cz, Entity[]>` — not string-concat cell keys.
- **Active bucket arrays** (`_activeBuckets`, `_staticActiveBuckets` + parallel `cellX`/`cellZ` arrays)
  track populated cells for fast iteration and adaptive query paths.
- **Stamp-based entity deduplication:** radius queries reuse `_seenIds` + monotonic `_queryStamp` instead of allocating fresh collections each call.
- **Adaptive query:** rectangular cell scan vs active-bucket scan based on visit count (`scanActive`).
- **Diagnostics:** `diagnostics.rebuilds`, `dynamicRebuilds`, `queries`, `candidates`, `activeBuckets`;
  `flushPerfCounters()` feeds `perfRuntime.recordSpatialHash()` for `check:perf` budgets.
- **Contract:** `npm run check:spatial-hash` — static + runtime guard against legacy string-key cells,
  per-query `Set` allocation, and missing layered/stamp diagnostics.

### 4.6 Release runtime assets — `assets/ships/release/parts/`

`npm run check:runtime-assets` inspects release GLBs with `@gltf-transform/core` and fails only on
**structural real-time hazards** (missing hull LOD chains, uncompressed release textures, duplicate
material signatures, missing normals on lit meshes, extreme small-part material explosion). It does
**not** fail because an asset is detailed — fix with LODs, KTX2 compression, and material sharing.

Remaining cost: dynamic layer rebuild frequency, query rate from AI/physics/sensors, and candidate volume
in dense sectors — optimize with cadence and index structure, not by deleting colliders.

### 4.5 Renderer construction flags — `src/render/renderer.js`

- `antialias: true` + `preserveDrawingBuffer: true` — `preserveDrawingBuffer` can tax some GPUs
  (needed for screenshots). Worth profiling on floor hardware.
- Pixel ratio from `settings.video.pixelRatioCap` × `renderScale` — large fill-rate lever, but changing
  defaults to pass CI is forbidden (diagnostic bisect only).

---

## 5. Metrics exposed (`window.__THREE_GAME_DIAGNOSTICS__`)

Created by `installDiagnostics(renderer, opts)`; `update(frameDt)` runs **once per frame, last in
`renderUpdate`** (after the draw). `getReport()` returns:

```
{
  fps, fpsAvg, fpsEma,
  frameMs: { last, avg, min, max, p95 },
  samples,
  render:  { calls, triangles, points, lines },
  memory:  { geometries, textures, programs },
  counts:  { particles, sprites, entities, lights }
}
```

`opts` getters (optional): `particles`, `sprites`, `entities`, `lights`.

Overlay: off by default. `setOverlay(true)` / `toggleOverlay()` — throttled ~5 Hz FPS/calls/tris HUD.

---

## 6. Before/after capture protocol (REQUIRED for any render PR)

Any PR touching `render/`, `vfx.js`, `bloom.js`, the loop, UI compositor surfaces, or physics broad-phase
must attach before/after numbers.

**Preferred gate:** `npm run check:perf` (headed crowded-flight probe with diagnostic variants).
**Fast local:** `__THREE_GAME_DIAGNOSTICS__.getReport()` snapshots.
**Hitch audit:** `npm run check:hitch-budget` for spike histograms and phase attribution.

**Setup**

1. Same machine, same browser, plugged in, fixed window size (probe default: 1830×973).
2. Same save / sector / camera. Note default `particleQuality`, `renderScale`, `pixelRatioCap`, FOV.
3. Warm up ≥5 s after entering flight (shader compile, texture upload, pipeline precompile).

**Capture** — bloom ON and bloom OFF as **separate rows** (draw counts not comparable across states):

4. Stress moment ~7–10 s (crowded flight, combat, warp).
5. Record: rAF p95, diagnostic p95, hitches >32 ms, phase p95s, render.calls peak, heap growth.

**Report table**

| metric | before | after | Δ |
|--------|-------:|------:|---:|
| rAF p95 |  |  |  |
| diagnostic p95 |  |  |  |
| hitches >32 ms |  |  |  |
| frameMs.p99 |  |  |  |
| phase.render p95 |  |  |  |
| phase.simFrame p95 |  |  |  |
| render.calls peak |  |  |  |
| render.triangles peak |  |  |  |
| memory.geometries |  |  |  |
| memory.textures |  |  |  |
| memory.programs |  |  |  |
| counts.particles (live) |  |  |  |

**Pass criteria**

- rAF **p95** ≤ 16.7 ms on target profile, ≤ 33.3 ms on floor profile.
- **Hitch count** (frames >32 ms) does not increase vs baseline.
- p95 does not regress >~5% without explicit justification.
- `memory.geometries` / `memory.textures` return to baseline after stress — steady climb = leak.
- `memory.programs` stable — per-frame climb = shader recompile in a hot path.

Regressions need explicit justification or a structural fix before merge. Never "fix" by lowering default
quality settings.

---

## 7. Related docs and checks

| Artifact | Role |
|----------|------|
| `design/PERF_TRIAGE.md` | Latest bottleneck classification with probe evidence |
| `npm run check:perf-budget` | This doc stays aligned with code (contract check) |
| `npm run check:perf` | Quality-preserving strict profiler + diagnostic variants |
| `npm run check:gpu-path` | Fast hardware vs software WebGL path check (`state.render.gpu` + UNMASKED_RENDERER) |
| `npm run check:perf:control` | rAF environment floor (blank / WebGL-clear) |
| `npm run check:hitch-budget` | Long-run hitch histogram + spike attribution |
| `npm run check:ui:perf` | UI frame-sleep, radar perf, compositor shell rules |