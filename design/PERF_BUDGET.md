# SpaceFace — Frame-Time Performance Budget

Status: living doc. Pairs with `src/render/diagnostics.js` (the measurement probe) and ARCHITECTURE
§2.2 (the loop) / §2.4 (the draw pipeline). This is the contract every render-touching PR is measured
against.

---

## 1. Targets

| Tier | Frame budget | Notes |
|------|--------------|-------|
| **Target (desktop)** | **16.7 ms** (60 fps) | The number we ship and tune to. |
| **Floor (low-end / Steam Deck)** | **33.3 ms** (30 fps) | Hard floor. Below this on the floor profile is a release blocker. |

The loop (`src/core/loop.js`) is a fixed-60Hz sim accumulator with a per-frame interpolated render.
Sim cost is **quantized in whole 1/60s steps** (up to `MAX_STEPS = 8`); render cost is whatever the
frame draw takes. A frame that overruns 16.7 ms pushes leftover time into the accumulator and the next
frame runs extra sim steps — so **render overruns amplify into sim-step backlog**. Keeping the render
half inside budget is what keeps the sim from spiraling (the `MAX_STEPS` cap then sheds backlog rather
than locking up, loop.js:24).

`frameDt` is clamped to **0.25 s** (loop.js:11) so a stall/tab-switch can't teleport state.

---

## 2. Budget allocation (60 fps / 16.7 ms)

Per-frame split. "Sim" is the summed cost of all 1/60 steps run this frame (usually 1; up to 8 under
load). The remaining categories are the once-per-frame render phase (`registry.renderUpdate`).

| Category | Budget | Owner(s) | What lives here |
|----------|-------:|----------|-----------------|
| **Sim** | **5.0 ms** | `registry.step` → UPDATE_ORDER | input, ai, flight, weapons, **physics** (integrate + spatial-hash rebuild + broad-phase), combat, mining, economy, world, factions, missions, traffic. |
| **Render** | **7.0 ms** | `render.renderFrame` (renderer.js:156) | mesh reconcile + view interp, camera follow, starfield recenter, scene draw, **bloom** post chain. |
| **VFX** | **2.5 ms** | `vfx.update` (vfx.js:641) | particle integrate, sprite integrate, trail emit, event-light decay. |
| **UI** | **1.2 ms** | `ui.frame` + `feel.frame` (registry.js:63-64) | DOM/CSS overlay reconcile, HUD, camera-feel punch. |
| **Headroom** | **1.0 ms** | — | GC slack, browser compositor, jitter absorption. |

**30 fps floor (33.3 ms)** is *not* "2× everything." The sim is fixed-step, so it costs the same wall
-clock work per second at any frame rate — at 30 fps you simply run ~2 steps/frame. The extra ~16 ms of
floor budget is spent on the **render + vfx** half (bigger draw, particles), which is why the quality
knobs below all target that half.

---

## 3. Known cost centers (found in code)

Ranked roughly by impact. File:line are real anchors at time of writing.

### 3.1 Bloom post chain — `src/render/bloom.js`
- **5 `renderer.render()` calls per frame** when bloom is on: scene→rtScene (bloom.js:204) + bright
  (212) + blur-H (217) + blur-V (222) + composite (228). Each is a full GPU pass; the scene pass is
  full-res HDR (HalfFloat) and **MSAA 4× on WebGL2** (bloom.js:142-143).
- Fast path: at `strength <= 0.0001` or bloom off it falls back to a single direct
  `renderer.render(scene, camera)` (bloom.js:193-197) — pixel-identical, zero extra cost.
- **Measurement caveat (critical):** because these are 5 separate `render()` calls and
  `renderer.info.autoReset` defaults true, draw-call/triangle counts are only comparable **within the
  same bloom state**. Always capture bloom-on and bloom-off separately (see §5). `diagnostics.js` flips
  `autoReset = false` and resets manually so its `render.calls` is the *true* per-frame total across
  all passes.
- Knobs: `settings.video.bloom` (on/off), `bloomStrength`, `bloomThreshold` (live-applied via
  `settings:changed`, renderer.js:77-92). Blur targets are half-res by design (bloom.js:144-148).

### 3.2 Per-frame entity↔mesh reconcile walk — `src/render/renderer.js`
- `renderFrame` calls `reconcileMeshes()` **every frame** (renderer.js:157), which does **two full
  passes over the live set**: one over `this._meshes` (renderer.js:116) and one over `state.entityList`
  (renderer.js:121) to build/dispose on deltas. Then `syncEntityViews` (renderer.js:133) walks
  `entityList` a third time for position/rot/bank interpolation.
- Cost is O(entities) every frame even when nothing spawned/despawned. Cheap per entity, but it is a
  fixed three-walk floor that scales with sector population.

### 3.3 Particle pool integration — `src/render/vfx.js`
- `_integrateParticles` (vfx.js:840) loops over the **entire pool cap every frame** (1500 / 3000 / 4000
  by particle-quality, vfx.js:27) regardless of how many particles are actually live — dead slots are
  still visited to hold them at alpha 0. Cost is proportional to **cap, not load**.
- Each frame also flags **4 BufferAttributes** `needsUpdate` (vfx.js:873-876) → up to 4 GPU buffer
  re-uploads sized to `writeMax`.
- `_emitTrails` (vfx.js:737) walks `entityList` every ~16 ms emitting trail + damage-smoke particles
  per thrusting/wounded ship.
- Event-light pool: up to `_LIGHT_NPOOL = 6` dynamic `PointLight`s (vfx.js:668) — each active light is
  a per-fragment cost on every lit material; gated to player-proximate events and disabled on
  low/motion-reduce (vfx.js:673-674).
- Knob: `settings.video.particleQuality` (low/med/high) sets both cap and a spawn-burst multiplier
  (`QUALITY_BURST`, vfx.js:38).

### 3.4 Spatial hash rebuild + queries — `src/core/spatialHash.js`
- Rebuilt **every sim step** (physics.js:19 → spatialHash.js:27): `clear()` + re-`insert()` every
  colliding entity, large bodies spanning multiple cells (spatialHash.js:17-24).
- Uses **string keys** `cx + ',' + cz` (spatialHash.js:19, 44) and a fresh per-bucket `[]` — string
  concat + Map churn each rebuild.
- `queryRadius` lazily allocates a `Set` for dedupe per call (spatialHash.js:39) and is called per
  colliding entity in broad-phase (physics.js:54) and from `coreSystem` proximity (coreSystem.js:30).
  This is the main sim-side **GC pressure** source.

### 3.5 Renderer construction flags — `src/render/renderer.js`
- `antialias: true` + `preserveDrawingBuffer: true` (renderer.js:24). `preserveDrawingBuffer` forces the
  driver to keep the backbuffer between frames (needed for screenshots) and can disable fast clears on
  some GPUs — a fixed per-frame tax worth re-checking on the floor profile.
- Pixel ratio is capped & scaled from `settings.video.pixelRatioCap` / `renderScale`
  (renderer.js:188-196) — the single biggest fill-rate lever for the floor.

---

## 4. Metrics exposed (`window.__THREE_GAME_DIAGNOSTICS__`)

Created by `installDiagnostics(renderer, opts)`; the lead calls `update(frameDt)` **once per frame, last
in `renderUpdate`** (after the draw — renderer.info is meaningless before it). `getReport()` returns a
plain snapshot:

```
{
  fps, fpsAvg, fpsEma,
  frameMs: { last, avg, min, max, p95 },   // milliseconds, rolling over last ~180 frames
  samples,                                  // ring-buffer fill
  render:  { calls, triangles, points, lines },   // TRUE per-frame totals (accumulated across bloom passes)
  memory:  { geometries, textures, programs },
  counts:  { particles, sprites, entities, lights }  // from opts getters, 0 if not provided
}
```

`opts` getters (all optional; called only if functions): `particles`, `sprites`, `entities`, `lights`.
Suggested wiring: `particles: () => SF.registry.get('vfx')._liveCount`,
`entities: () => SF.state.entityList.length`.

Overlay: off by default. `__THREE_GAME_DIAGNOSTICS__.setOverlay(true)` (or `toggleOverlay()`) lazily
appends a fixed-position `<div>` showing FPS / calls / tris, throttled to ~5 Hz. Does **not** modify
index.html.

---

## 5. Before/after capture protocol (REQUIRED for any render PR)

Any PR that touches `render/`, `vfx.js`, `bloom.js`, the loop, or anything in the draw path must attach
before/after numbers captured with `__THREE_GAME_DIAGNOSTICS__`.

**Setup**
1. Same machine, same browser, plugged in (no power-saver throttle), fixed window size.
2. Same save / sector / camera zoom on both runs. Note `particleQuality`, `renderScale`,
   `pixelRatioCap`, and FOV.
3. Let it warm up ~5 s after entering the sector (shader compile, texture upload settle).

**Capture — and capture bloom ON and bloom OFF as separate rows.** Draw-call/triangle counts are only
comparable within the same bloom state (§3.1). For each state:
4. Drive a representative stress moment (a firefight with explosions, or jump warp) for ~10 s so the
   particle pool and event lights are exercised.
5. Snapshot: `JSON.stringify(__THREE_GAME_DIAGNOSTICS__.getReport(), null, 2)`.

**Report table** (paste before vs after, ×2 for bloom on/off):

| metric | before | after | Δ |
|--------|-------:|------:|---:|
| frameMs.avg |  |  |  |
| frameMs.p95 |  |  |  |
| frameMs.max |  |  |  |
| fpsAvg |  |  |  |
| render.calls |  |  |  |
| render.triangles |  |  |  |
| memory.geometries |  |  |  |
| memory.textures |  |  |  |
| memory.programs |  |  |  |
| counts.particles (peak) |  |  |  |

**Pass criteria**
- `frameMs.avg` stays ≤ 16.7 ms on the target profile and ≤ 33.3 ms on the floor profile.
- `frameMs.p95` does not regress by more than ~5% vs the baseline (p95 catches hitches the avg hides).
- `memory.geometries` / `memory.textures` return to baseline after the stress moment ends — a steady
  climb that never settles is a **leak** (un-disposed geometry/material; cross-check `disposeObject`,
  renderer.js:204).
- `memory.programs` is stable (a per-frame climb means shader recompiles in a hot path).

Regressions outside these bounds need an explicit justification (a feature that's worth the ms) or a
fix before merge.
