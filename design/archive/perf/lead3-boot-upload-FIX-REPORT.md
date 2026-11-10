# Performance Fix Report: Boot Upload Spike (`bufferFullUploads`)

## 1. Mechanism — confirmed with one correction

**Confirmed (Rank 1 core):** `src/render/precompile.js` builds synthetic staging meshes, compiles
shader programs against them, then `disposeObject(staging)` frees every staged geometry/material.

**Correction:** Three.js `renderer.compile` / `compileAsync` only links programs via
`prepareMaterial` — it does **not** upload `BufferAttribute` payloads (`gl.bufferData`). Buffer
uploads happen on the first real draw (`WebGLObjects.update` → `WebGLAttributes.update`).

So the hitch is not “compile uploaded staging buffers, dispose freed them, real scene re-uploaded
the same bytes.” It is:

1. Staging probes sit in the live scene graph during precompile.
2. Any full-scene warm draw that still includes staging (or a later first flight draw of resident
   content that was never drawn) pays `bufferData` for every attribute in one frame.
3. `disposeObject(staging)` then frees any GPU buffers that *did* get allocated for throwaway
   probes, so that work cannot amortize the first flight frame.
4. Resident content (player hull, space background, aux pools, weapons) still needs its first
   `bufferData` on first draw unless warmed **after** staging is detached.

Production path at call time: `preparePipelines` → `compileScenePipelinesForRenderTarget` (compile
only). `options.warmPostProcess` exists on `state.render` but is **not** passed into precompile
from `renderer.js` (another agent owns that file).

## 2. Exact change

**File:** `src/render/precompile.js` only.

| Location | Change |
|---|---|
| `precompileNow` (~L63–L200) | After staging shader work, **detach** staging (+ canopy keep-alive root) from the scene **before** any resident warm. Then call `warmResidentSceneGpuBuffers(...)` when `includeGlobalPipelines && stillCurrent`. Return `residentBufferWarm` on the receipt. `finally` still disposes staging; skips double-remove if already detached. |
| `warmResidentSceneGpuBuffers` (new, after `precompileNow`) | Yield once; optional `compileAsync(scene)` only when no host `preparePipelines` hook; prefer `options.warmPostProcess()`; else one `renderer.render(scene, camera)` with render-target save/restore. Staging must already be out of the graph. |

**Intentional non-edits (constraint):**

- Did **not** touch `src/render/renderer.js`. Recommended follow-up there (for the other agent):

```diff
 state.render.pipelinePrecompileReady = precompileGlobalPipelines(renderer, scene, cam.obj, {
   incremental: true,
   preparePipelines: compileForCurrentTarget,
   video: state.settings && state.settings.video,
   yieldToMain: yieldToBrowser,
+  warmPostProcess: state.render.warmPostProcess,
 }).catch(/* ... */);
```

  Same `warmPostProcess` pass-through on the context-restore precompile call (~L896). That path arms
  dynamic buffers and uses bloom/render-graph; the precompile fallback uses straight `renderer.render`.

- No `PRODUCTION_UPDATE_ORDER` / manifest changes.
- Zero intentional visual change (warm draw runs under the loading shell; canvas is covered).

## 3. Verification

```
npm run check:perf-counters   → 29/29 pass
npm run check:perf-packets    → 39/39 pass
node --test test/space-background-boot-tier-single-build.test.mjs → PASS
node --test test/authored-precompile-residency.test.mjs test/render-target-pipeline-warmup.test.mjs → 14/14 pass
```

## 4. Follow-up confirmation (do not run here)

Real proof that `peakPerFrame.bufferFullUploads` dropped requires the ~30 min shader-timeline probe
that writes `.devshots/perf/shader-compile-timeline.json` (`spaceface.perfCounters.v1`).

Compare before/after:

- `productionCounters.peakPerFrame.bufferFullUploads` (was **175**)
- `productionCounters.peakPerFrame.bufferUploadBytes` (was **~4.36 MB**)
- Pre-boot in-frame full uploads (`totals - postBoot - offFrame`; was **309** across 19 frames)

Command / workflow is whatever the perf lane already uses to capture
`shader-compile-timeline.json` (same probe that produced the spike report). Do not treat unit checks
above as substitute evidence for the boot upload peak.
