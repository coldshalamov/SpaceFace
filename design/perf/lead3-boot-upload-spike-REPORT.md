# Performance Report: Boot Upload Spike Analysis (`bufferFullUploads`)

## 1. Executive Summary & Telemetry Evidence

Analysis of `.devshots/perf/shader-compile-timeline.json` (`spaceface.perfCounters.v1`) confirms a severe burst of full GPU buffer uploads (`bufferData`) occurring during the boot phase prior to the boot boundary (`bootBoundaryFrame: 283`).

### Quoted Telemetry Counters (`productionCounters`)
* **`peakPerFrame.bufferFullUploads`**: `175` (Worst single frame full uploads; average per-frame is ~0.1 post-boot).
* **`peakPerFrame.bufferPartialUploads`**: `115`
* **`peakPerFrame.bufferUploadBytes`**: `4,362,886` bytes (~4.36 MB uploaded in a single frame peak).
* **Co-located `peakPerFrame` metrics**:
  * `textureBinds`: `180`
  * `drawCalls`: `83` (`drawInstancedCalls`: `25`)
  * `programSwitches`: `50`
  * `textureUploads`: `8` (`textureSubUploads`: `6`)
  * `mipmapGenerations`: `7`
  * `shaderLinks`: `13`
* **Lifecycle Totals**:
  * `totals.bufferFullUploads`: `503`
  * `postBoot.bufferFullUploads`: `112`
  * `offFrame.bufferFullUploads`: `82`
  * Pre-boot in-frame uploads (`totals` - `postBoot` - `offFrame`): `309` across `19` non-zero frames.

> [!WARNING]
> **Missing Telemetry Evidence**: `productionCounters.events` records event streams ONLY for `shaderLink`, `renderTargetAllocation`, and `renderTargetResize`. Per-frame time-series counters for `bufferFullUploads` are **not** emitted in `spaceface.perfCounters.v1`. Furthermore, `peakPerFrame` records aggregate max scalar values without attaching the specific `frame` index. While telemetry proves the 175-upload peak lands in boot (frame `< 283`), identifying the exact frame index requires adding `countBufferUpload` event tracing to `src/core/perfCounters.js:284`.

---

## 2. Boot Boundary Context

* **Boot Boundary Frame**: `283` (`postBootFrames`: 1216 out of 1499 total observed frames).
* **Timing**: The peak frame occurred in the pre-boot window (`frame < 283`).
* **Frame Activity**: During this peak frame, 175 full buffer allocations were executed alongside 83 draw calls (25 instanced), 180 texture binds, 50 program switches, and 115 partial buffer updates, creating a synchronous GPU driver allocation stall.

---

## 3. Ranked Hypotheses & Source Code Producers

### Rank 1: Staging Disposal & First-Frame Un-batched Buffer Uploads
* **File & Lines**: [`src/render/precompile.js:137-166`](file:///C:/Users/93rob/sf-perf-admission-20260726/src/render/precompile.js#L137-L166), [`src/render/renderer.js:680-720`](file:///C:/Users/93rob/sf-perf-admission-20260726/src/render/renderer.js#L680-L720)
* **Mechanism**: `precompilePipelines()` compiles shaders on temporary staging meshes and calls `disposeObject(staging)` upon completion. Disposing staging geometries frees their GPU buffer handles. On the subsequent initial render pass of actual scene objects (player ship, weapons, background), Three.js must allocate GPU memory (`gl.bufferData`) for every `BufferAttribute` (position, normal, uv, color, index) across all scene meshes simultaneously on one frame.

### Rank 2: Dynamic Buffer Pool Initialization & Initial Full Flush
* **File & Lines**: [`src/render/dynamicBufferRanges.js:480-518`](file:///C:/Users/93rob/sf-perf-admission-20260726/src/render/dynamicBufferRanges.js#L480-L518), [`src/render/combat/instancedSpritePool.js:80-140`](file:///C:/Users/93rob/sf-perf-admission-20260726/src/render/combat/instancedSpritePool.js#L80-L140), [`src/render/vfx.js:200-350`](file:///C:/Users/93rob/sf-perf-admission-20260726/src/render/vfx.js#L200-L350)
* **Mechanism**: Newly registered dynamic buffer owners start with `forceFull: true` (`forceReason: 'initial'`). On the first frame where these pools become visible, `publishBinding()` forces a full-array `bufferData` upload across all instanced particle, projectile, and trail attributes rather than a partial `bufferSubData` update.

### Rank 3: Space Background & Parallax Multi-Attribute Geometry Assembly
* **File & Lines**: [`src/render/spaceBackground.js:150-300`](file:///C:/Users/93rob/sf-perf-admission-20260726/src/render/spaceBackground.js#L150-L300), [`src/render/parallaxLayers.js:60-120`](file:///C:/Users/93rob/sf-perf-admission-20260726/src/render/parallaxLayers.js#L60-L120), [`src/render/starfield.js:50-120`](file:///C:/Users/93rob/sf-perf-admission-20260726/src/render/starfield.js#L50-L120)
* **Mechanism**: Celestial layers, starfield point clouds, nebulae planes, and parallax quad meshes construct multiple geometries with custom attribute arrays during boot. When first drawn together, their combined attributes generate a multi-buffer upload spike.

### Rank 4: Impostor Bakes & Asteroid Pool Admission
* **File & Lines**: [`src/render/planetSiteVisual.js:100-250`](file:///C:/Users/93rob/sf-perf-admission-20260726/src/render/planetSiteVisual.js#L100-L250), [`src/render/asteroidInstancePool.js:80-180`](file:///C:/Users/93rob/sf-perf-admission-20260726/src/render/asteroidInstancePool.js#L80-L180)
* **Mechanism**: Instantiating planet site visual meshes and asteroid field instance pools during sector admission creates multiple multi-attribute geometries uploaded during a single boot frame.

---

## 4. Proposed Fix Directions

1. **Pre-allocate and Warm Under Loading Screen**:
   * Issue a warm-up `renderer.render(scene, camera)` pass while hidden behind the loading screen overlay before declaring boot completion. This forces initial `gl.bufferData` reallocations to complete before gameplay frames begin.
2. **Reuse Warm-Up Geometries & Avoid Eager Disposal**:
   * Modify `src/render/precompile.js` to retain initialized buffer attributes for persistent scene objects instead of calling `disposeObject()`, avoiding buffer destruction and re-creation.
3. **Stagger Buffer Admission Across Frames**:
   * Time-slice the addition of VFX pools, parallax layers, and asteroid instances across 5-10 loading frames rather than instantiating all systems on a single frame.
4. **Pre-allocate Fixed Buffer Capacities**:
   * Ensure particle/instanced pools pre-allocate maximum VRAM size once with `gl.bufferData` during loading, strictly using `bufferSubData` (`dynamicBufferRanges.js`) for runtime updates.
