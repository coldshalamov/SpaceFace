# Launch-to-flight main-thread profile

Profile: kept evidence profile `probe-keep-oct13f-000000` (reused: warm GPU program and HTTP caches). New Game seed 47.

**Launch click to flight: 14.0 s.** New Game click to flight: 14.3 s. The profile continues 6.2 s into held-thrust flight.

## Where the time went, by phase

Busy is sampled main-thread time that is not idle. `(program)` is native work outside JavaScript
(Blink, GPU command submission, compositor hand-off). A phase that is mostly idle is waiting on
something off the main thread: driver shader compiles, network, decoding workers, timers.

| phase | wall s | busy s | JS s | (program) s | idle s | GC s | long tasks (n / ms) |
|---|---:|---:|---:|---:|---:|---:|---|
| New Game screen (to Launch click) | 0.27 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 1 / 114 |
| Launch click to first loading stage | 0.57 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 1 / 198 |
| loading: authored-library | 0.36 | 1.20 | 0.07 | 1.13 | 0.00 | 0.00 | 1 / 74 |
| loading: authored-visuals | 2.07 | 1.99 | 1.57 | 0.40 | 0.09 | 0.02 | 2 / 169 |
| loading: render-pipelines | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0 / 0 |
| loading: gpu-resources | 10.21 | 9.12 | 6.05 | 2.88 | 1.08 | 0.19 | 1 / 53 |
| loading: physics-authority | 0.02 | 0.01 | 0.00 | 0.01 | 0.01 | 0.00 | 0 / 0 |
| loading: entering-flight | 0.80 | 0.69 | 0.57 | 0.10 | 0.11 | 0.01 | 2 / 157 |
| first seconds of flight | 6.23 | 6.07 | 3.90 | 2.08 | 0.16 | 0.08 | 3 / 180 |

## Launch click to first loading stage — 0.57 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|

### Self time by source

| ms | share | source |
|---:|---:|---|

## loading: authored-visuals — 2.07 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 397.2 | 19.2% | `(program) @ native:0` |
| 148.0 | 7.1% | `getProgramParameter @ native:0` |
| 68.0 | 3.3% | `texSubImage2D @ native:0` |
| 52.5 | 2.5% | `_createStars @ src/render/spaceBackground.js:2081` |
| 44.0 | 2.1% | `getProgramParameter @ native:0` |
| 39.5 | 1.9% | `getProgramParameter @ native:0` |
| 29.6 | 1.4% | `(anonymous) @ src/render/visualFactory.js:4942` |
| 22.9 | 1.1% | `(garbage collector) @ native:0` |
| 18.1 | 0.9% | `makeHullNormalMap @ src/render/canvasTextures.js:402` |
| 13.7 | 0.7% | `setLaunching @ src/ui/screens/newGame.js:846` |
| 13.6 | 0.7% | `(anonymous) @ src/render/spaceBackground.js:97` |
| 13.2 | 0.6% | `getBoundingClientRect @ native:0` |
| 13.1 | 0.6% | `makeNoiseTexture @ src/render/canvasTextures.js:91` |
| 13.1 | 0.6% | `get offsetHeight @ native:0` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 479.7 | 23.2% | `(native)` |
| 397.2 | 19.2% | `(program)` |
| 290.3 | 14.0% | `vendor/three.core.js` |
| 86.1 | 4.2% | `vendor/three.module.js` |
| 85.8 | 4.1% | `(idle)` |
| 72.2 | 3.5% | `src/render/spaceBackground.js` |
| 69.7 | 3.4% | `src/render/visualFactory.js` |
| 59.7 | 2.9% | `src/render/partsLibrary.js` |
| 50.4 | 2.4% | `src/render/canvasTextures.js` |
| 45.3 | 2.2% | `src/render/renderer.js` |

## loading: gpu-resources — 10.21 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 2881.6 | 28.2% | `(program) @ native:0` |
| 188.4 | 1.8% | `(garbage collector) @ native:0` |
| 85.1 | 0.8% | `bufferData @ native:0` |
| 79.0 | 0.8% | `enqueueGeometryResidencyBatches.urgent @ src/render/startupGpuResidency.js:764` |
| 72.2 | 0.7% | `get body @ vendor/addons/loaders/GLTFLoader.js:1927` |
| 71.6 | 0.7% | `syncEntityViewsSteps @ src/render/renderer.js:26802` |
| 66.9 | 0.7% | `getProgramParameter @ native:0` |
| 62.3 | 0.6% | `releaseStatesOfObject @ vendor/three.module.js:2387` |
| 53.1 | 0.5% | `compressedTexSubImage2D @ native:0` |
| 49.8 | 0.5% | `texSubImage2D @ native:0` |
| 42.7 | 0.4% | `(anonymous) @ src/render/visualFactory.js:2113` |
| 40.6 | 0.4% | `convertBufferAttribute @ vendor/three.core.js:19219` |
| 40.1 | 0.4% | `fetch @ native:0` |
| 39.8 | 0.4% | `parse @ vendor/addons/loaders/GLTFLoader.js:429` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 2881.6 | 28.2% | `(program)` |
| 1159.5 | 11.4% | `vendor/three.core.js` |
| 1084.3 | 10.6% | `(idle)` |
| 746.7 | 7.3% | `(native)` |
| 709.7 | 7.0% | `vendor/three.module.js` |
| 428.6 | 4.2% | `src/render/renderer.js` |
| 251.7 | 2.5% | `vendor/addons/loaders/GLTFLoader.js` |
| 202.3 | 2.0% | `src/render/partsLibrary.js` |
| 189.6 | 1.9% | `src/render/startupGpuResidency.js` |
| 188.4 | 1.8% | `(garbage collector)` |

## loading: entering-flight — 0.80 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 101.1 | 12.7% | `(program) @ native:0` |
| 57.8 | 7.2% | `withOnlySubjectsDrawable @ src/render/openingGpuAdmission.js:549` |
| 31.2 | 3.9% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:597` |
| 16.5 | 2.1% | `projectObject @ vendor/three.module.js:18323` |
| 14.1 | 1.8% | `traverseVisible @ vendor/three.core.js:12780` |
| 13.8 | 1.7% | `contentHashForProducerManifest @ src/render/openingSubmissionPlan.js:105` |
| 13.8 | 1.7% | `(garbage collector) @ native:0` |
| 13.2 | 1.7% | `illustratedSurfaceShader @ src/render/illustratedSurface.js:235` |
| 10.2 | 1.3% | `(anonymous) @ src/render/renderer.js:18263` |
| 9.5 | 1.2% | `setProgram @ vendor/three.module.js:18879` |
| 9.4 | 1.2% | `subjectsForCompileRoots @ src/render/renderer.js:18115` |
| 9.3 | 1.2% | `projectObject @ vendor/three.module.js:18323` |
| 9.2 | 1.2% | `touchScenePipelines @ src/render/bloom.js:2324` |
| 9.0 | 1.1% | `classifyWorld @ src/world/activityRuntime.js:1568` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 145.6 | 18.3% | `vendor/three.module.js` |
| 108.7 | 13.6% | `(idle)` |
| 101.1 | 12.7% | `(program)` |
| 101.1 | 12.7% | `src/render/openingGpuAdmission.js` |
| 95.1 | 11.9% | `vendor/three.core.js` |
| 63.1 | 7.9% | `src/render/renderer.js` |
| 36.5 | 4.6% | `(native)` |
| 22.4 | 2.8% | `src/render/illustratedSurface.js` |
| 16.3 | 2.0% | `src/render/openingSubmissionPlan.js` |
| 15.1 | 1.9% | `src/render/startupGpuResidency.js` |

## first seconds of flight — 6.23 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 2083.4 | 33.4% | `(program) @ native:0` |
| 90.2 | 1.4% | `setProgram @ vendor/three.module.js:18879` |
| 88.6 | 1.4% | `syncEntityViewsSteps @ src/render/renderer.js:26802` |
| 84.9 | 1.4% | `(garbage collector) @ native:0` |
| 49.3 | 0.8% | `syncSize @ src/ui/capitalBossOverlayMount.js:42` |
| 48.8 | 0.8% | `upload @ vendor/three.module.js:6425` |
| 45.0 | 0.7% | `now @ src/render/renderer.js:4156` |
| 40.7 | 0.7% | `rebuildPinFacts @ src/world/activityRuntime.js:566` |
| 39.7 | 0.6% | `detachedPresentedDrawBlocked @ src/render/packageCpuDetach.js:728` |
| 32.4 | 0.5% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |
| 32.4 | 0.5% | `updateShipPitchPresentation @ src/render/shipPitchPresentation.js:176` |
| 32.4 | 0.5% | `classifyWorld @ src/world/activityRuntime.js:1568` |
| 31.5 | 0.5% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 31.4 | 0.5% | `multiplyMatrices @ vendor/three.core.js:10385` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 2083.4 | 33.4% | `(program)` |
| 854.7 | 13.7% | `vendor/three.module.js` |
| 413.7 | 6.6% | `vendor/three.core.js` |
| 363.7 | 5.8% | `(native)` |
| 313.9 | 5.0% | `src/render/renderer.js` |
| 159.3 | 2.6% | `(idle)` |
| 116.1 | 1.9% | `src/world/activityRuntime.js` |
| 112.1 | 1.8% | `src/render/packageCpuDetach.js` |
| 103.4 | 1.7% | `vendor/addons/loaders/GLTFLoader.js` |
| 93.2 | 1.5% | `src/render/vfx.js` |

## Long tasks from New Game to the end of the profile

| at s (after Launch) | duration ms | during |
|---:|---:|---|
| -0.2 | 114 | New Game screen (to Launch click) |
| 0.4 | 198 | Launch click to first loading stage |
| 0.6 | 74 | loading: authored-library |
| 0.9 | 110 | loading: authored-visuals |
| 1.3 | 59 | loading: authored-visuals |
| 4.2 | 53 | loading: gpu-resources |
| 13.3 | 103 | loading: entering-flight |
| 13.4 | 54 | loading: entering-flight |
| 16.3 | 51 | first seconds of flight |
| 16.4 | 78 | first seconds of flight |
| 16.6 | 51 | first seconds of flight |

## Loading-screen smoothness (what the player sees)

Frame gaps are the page's own requestAnimationFrame cadence; stall ms is time beyond one 60 Hz frame. The
boot ring and the backdrop video render off the main thread, so a stall here is the DOM/labels/progress
freezing while they keep moving. Long animation frames (LoAF) name the scripts that held the frame.

| window | fps | frames | p50 ms | p95 ms | worst ms | >33 | >50 | >100 | stall ms | LoAF n / blocking ms | video dropped / played |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| New Game screen (to Launch click) | 18.6 | 5 | 50.0 | 166.7 | 167 | 2 | 2 | 1 | 183 | 2 / 111 | 0 / 0 |
| Launch click to first loading stage | 12.2 | 7 | 66.6 | 183.3 | 183 | 3 | 3 | 1 | 300 | 2 / 218 | 6 / 9 |
| loading: authored-library | 8.4 | 3 | 133.3 | 133.3 | 133 | 2 | 2 | 2 | 200 | 3 / 108 | 0 / 0 |
| loading: authored-visuals | 24.1 | 50 | 17.0 | 166.0 | 183 | 11 | 9 | 5 | 1135 | 10 / 282 | 20 / 44 |
| loading: render-pipelines | 0.0 | 0 | 0.0 | 0.0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 0 / 0 |
| loading: gpu-resources | 44.7 | 456 | 16.7 | 50.0 | 133 | 30 | 20 | 7 | 2508 | 24 / 125 | 2 / 272 |
| loading: physics-authority | 47.6 | 1 | 0.0 | 0.0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 0 / 0 |
| loading: entering-flight | 23.8 | 19 | 33.4 | 133.3 | 133 | 7 | 4 | 1 | 483 | 5 / 101 | 1 / 11 |
| first seconds of flight | 26.3 | 164 | 33.3 | 66.7 | 100 | 61 | 24 | 1 | 3462 | 16 / 31 | 0 / 0 |

### Long animation frames in New Game screen (to Launch click): who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 105 | 1 | 92 | `BUTTON.onclick @ src/ui/kit/dom.js` |
| 21 | 1 | 14 | `BUTTON.onclick @ src/ui/screens/newGame.js` |
| 18 | 2 | 17 | `ResizeObserverCallback @ src/ui/orrery/stopDial.js` |
| 10 | 1 | 9 | `ResizeObserverCallback @ src/ui/orrery/hullRing.js` |
| 6 | 1 | 6 | `ResizeObserverCallback @ src/ui/orrery/lampKey.js` |

### Long animation frames in Launch click to first loading stage: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 198 | 1 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 34 | 1 | 0 | `frame @ src/core/presentationRunner.js` |
| 31 | 1 | 0 | `FrameRequestCallback @ src/render/partsLibrary.js` |
| 7 | 1 | 0 | `fire @ src/core/backgroundPost.js` |

### Long animation frames in loading: authored-library: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 153 | 6 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 134 | 3 | 0 | `frame @ src/core/presentationRunner.js` |
| 42 | 2 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-visuals: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 454 | 11 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 167 | 7 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 139 | 6 | 0 | `frame @ src/core/presentationRunner.js` |
| 38 | 2 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 22 | 2 | 0 | `checkProgramsReady @ src/render/bloom.js` |
| 13 | 2 | 0 | `fire @ src/core/backgroundPost.js` |
| 9 | 1 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |

### Long animation frames in loading: gpu-resources: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 362 | 19 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 152 | 24 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |
| 121 | 8 | 0 | `frame @ src/core/presentationRunner.js` |
| 80 | 2 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 44 | 4 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 5 | 1 | 0 | `checkProgramsReady @ src/render/bloom.js` |

### Long animation frames in loading: entering-flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 214 | 5 | 52 | `frame @ src/core/presentationRunner.js` |
| 65 | 2 | 19 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 13 | 1 | 0 | `guarded @ src/render/renderer.js` |
| 6 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in first seconds of flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 446 | 16 | 0 | `frame @ src/core/presentationRunner.js` |
| 53 | 7 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 24 | 2 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 6 | 1 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |

## Fetched between Launch and flight

275 requests; 132.24 MB of bodies; 89.15 MB actually transferred. Delivery: 204 over the network, 28 revalidated (304), 43 straight from cache.

| type | requests | body MB | transferred MB |
|---|---:|---:|---:|
| glb | 111 | 119.81 | 78.61 |
| json | 150 | 10.71 | 8.81 |
| png | 11 | 1.72 | 1.73 |
| svg | 3 | 0.00 | 0.00 |

| largest bodies | MB | transferred MB | fetch ms |
|---|---:|---:|---:|
| `assets/ships/release/render-packages/helios-trade-hub/render.glb` | 5.36 | 0.00 | 104 |
| `assets/ships/release/render-packages/candle-fleet/render.glb` | 4.88 | 0.00 | 59 |
| `assets/ships/release/render-packages/jump-ring/render.glb` | 3.51 | 0.00 | 64 |
| `assets/ships/release/render-packages/volatiles-tanker/render.glb` | 2.59 | 2.59 | 382 |
| `assets/ships/release/render-packages/helios-cradle-dmc/render.glb` | 2.52 | 2.52 | 491 |
| `assets/ships/release/render-packages/helios-cradle/render.glb` | 2.52 | 2.52 | 58 |
| `assets/ships/release/render-packages/rescue-lifter/render.glb` | 2.49 | 2.49 | 379 |
| `assets/ships/release/render-packages/yard-tug/render.glb` | 2.41 | 2.41 | 53 |
| `assets/ships/release/render-packages/helios-arclight/render.glb` | 2.36 | 2.36 | 385 |
| `assets/ships/release/render-packages/ore-barge/render.glb` | 2.31 | 2.31 | 383 |
| `assets/ships/release/render-packages/wasp-free-militia/render.glb` | 2.12 | 2.12 | 423 |
| `assets/ships/release/render-packages/wasp-mts-escort/render.glb` | 2.12 | 2.12 | 432 |
| `assets/ships/release/render-packages/wasp-quiet-ghost/render.glb` | 2.12 | 2.12 | 351 |
| `assets/ships/release/render-packages/wasp-scn-patrol/render.glb` | 2.12 | 2.12 | 30 |
| `assets/ships/release/render-packages/helios-span-reach/render.glb` | 2.07 | 2.07 | 429 |

## Renderer resources

| moment | programs | geometries | textures | JS heap MB |
|---|---:|---:|---:|---:|
| entering flight | 149 | 2384 | 118 | 864 |
| end of profile | 149 | 2411 | 118 | 1016 |

Dispose-registration probe renders: 1 at flight, 1 at end of profile (once per context generation is right).

## Draws that waited on a driver link

34 waits of 1 ms or more across 34 programs (1783 draw-path calls), 0.6 s on the main thread, longest 51 ms.

| shader family | waits (>= 1 ms) | total ms |
|---|---:|---:|
| ShaderMaterial | 7 | 129 |
| Material_Emissive_Amber | 2 | 61 |
| MeshStandardMaterial | 4 | 59 |
| BackgroundCubeMaterial | 1 | 46 |
| CubemapFromEquirect | 1 | 42 |
| PMREMGGXConvolution | 1 | 38 |
| Material_Ceramic_ice | 2 | 25 |
| MeshDepthMaterial | 2 | 24 |
| SF_Shared_hull_textured_hull | 1 | 24 |
| SF_Shared_canopy_none_native | 2 | 19 |
| Material_Warning | 1 | 18 |
| SphericalGaussianBlur | 1 | 17 |

- 51 ms `Material_Emissive_Amber` — at timedBlockingFirstUse (http://127.0.0.1:60583/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:60583/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:60583/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:60583/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:60583/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:60583/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:60583/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:60583/vendor/three.
- 46 ms `BackgroundCubeMaterial` — at timedBlockingFirstUse (http://127.0.0.1:60583/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:60583/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:60583/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:60583/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:60583/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:60583/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:60583/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:60583/vendor/three.
- 42 ms `CubemapFromEquirect` — at timedBlockingFirstUse (http://127.0.0.1:60583/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:60583/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:60583/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:60583/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:60583/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:60583/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:60583/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:60583/vendor/three.
- 38 ms `PMREMGGXConvolution` — at timedBlockingFirstUse (http://127.0.0.1:60583/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:60583/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:60583/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:60583/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:60583/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:60583/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:60583/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:60583/vendor/three.
- 33 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:60583/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:60583/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:60583/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:60583/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:60583/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:60583/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:60583/vendor/three.module.js:18616:6) | at renderTransmissionPass (http://127.0.0.1:60583/ve
- 32 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:60583/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:60583/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:60583/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:60583/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:60583/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:60583/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:60583/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:60583/vendor/three.
- 29 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:60583/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:60583/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:60583/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:60583/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:60583/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:60583/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:60583/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:60583/vendor/three.
- 25 ms `MeshStandardMaterial` — at timedBlockingFirstUse (http://127.0.0.1:60583/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:60583/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:60583/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:60583/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:60583/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:60583/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:60583/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:60583/vendor/three.

Opening work still pending when flight began: `391:missing:wreck`, `394:missing:payload`, `395:missing:payload`, `396:missing:payload`.

## Opening cook ledger

The opening cook began 3.0 s after Launch; flight began at 14.0 s. `t` is ms from the cook's start to the end of the step.

| step | ms | outcome | t ms | detail |
|---|---:|---|---:|---|
| opening.rockSurfaceLibrary | 0 | resolved | 1 |  |
| opening.firstPresentAdmission | 0 | resolved | 2 |  |
| opening.residency | 119 | resolved | 183 | subjects=85 textureRefs=31 textures=31 |
| opening.postResources | 3 | resolved | 187 | route=bloom |
| opening.capturedPipelineDrain | 63 | resolved | 250 | captured=14 stillPending=1 |
| opening.receipt | 4 | resolved | 254 |  |
| wait.prepareOpeningGpuResources | 254 | resolved | 254 |  |
| live.meshBuilds1 | 0 | resolved | 410 | queued=0 passes=0 built=0 buildMs=0 yields=0 left=0 |
| lane | 0 | sample | 1001 | queued=0 flushed=0 settled=81 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=2 meshBuilds=0 |
| live.openingComposition | 705 | resolved | 1115 | pending=0 |
| live.upgradeQueueIdle | 705 | resolved | 1116 | pending=0 inFlight=0 compiling=false |
| live.pendingPipelines | 0 | skipped | 1116 | captured=0 |
| live.rocksAndLeftoverMeshes | 6 | resolved | 1122 | firstFlightEntities=47 |
| live.meshBuilds2 | 90 | resolved | 1212 | queued=8 passes=5 built=2 buildMs=3 yields=3 left=0 |
| cook.programs | 0 | resolved | 1296 | method=first-flight-hulls |
| cook.touchCompile | 254 | resolved | 1685 | issued=605 unlinked=0 yields=12 |
| lane | 0 | sample | 2028 | queued=0 flushed=1 settled=97 upgradeJobs=3 upgradeInFlight=2 upgradeCompiling=3 meshBuilds=0 |
| cook.touch | 1084 | resolved | 2829 | subjects=605 firstPicture=70 touched=605 notReady=0 noProgram=0 switched=0 touchMs=352 maxTouchMs=9 yields=54 |
| lane | 0 | sample | 3047 | queued=0 flushed=0 settled=102 upgradeJobs=0 upgradeInFlight=1 upgradeCompiling=6 meshBuilds=0 |
| lane | 0 | sample | 4060 | queued=0 flushed=0 settled=102 upgradeJobs=0 upgradeInFlight=1 upgradeCompiling=6 meshBuilds=0 |
| lane | 0 | sample | 5012 | queued=0 flushed=0 settled=103 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=4 meshBuilds=0 |
| lane | 0 | sample | 6000 | queued=0 flushed=0 settled=103 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=1 meshBuilds=0 |
| cook.buffers | 3788 | resolved | 6750 | roots=94 textures=203 yields=57 |
| lane | 0 | sample | 7002 | queued=0 flushed=0 settled=103 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.layers | 480 | resolved | 7229 | roots=174 yields=74 |
| cook.crucibleWarm | 395 | resolved | 7634 | progress={"profile":"opening","records":43,"instantiated":43,"packageInstances":43,"paletteSubjects":350,"chunkPromotions":0,"shi |
| lane | 0 | sample | 8009 | queued=1 flushed=11 settled=131 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.rockPools | 1135 | resolved | 8883 | roots=53 units=1915 issued=1915 issueDedupeSkips=1830 touched=1915 hiddenTouchSkips=1838 yields=11 issueMs=244 drainMs=817 touchMs=49 |
| live.cook | 7671 | resolved | 8883 |  |
| live.leftoverUpgradeIdle | 0 | resolved | 8883 | pending=0 inFlight=0 compiling=false |
| lane | 0 | sample | 9003 | queued=0 flushed=0 settled=143 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| live.materialSettle | 660 | resolved | 9543 | unbound=508 names=Physical racing wakes/Next checkpoint/Draft pace beacon/Massline anchors and crossing refuges/L6_comet/L0-L2_deep-field-composite/L3_stars/L4_flares/DeepField_helios-ecliptic-dust/DeepField_helios-left-drift/DeepField_helios-outer-shepherd/DeepFieldStructure_helios-derelict-hauler |
| live.postOpeningPipelines | 343 | resolved | 9919 |  |
| lane | 0 | sample | 10000 | queued=0 flushed=0 settled=143 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| live.parkWarmRoots | 108 | resolved | 10027 | roots=1 nodes=129 stampedGeometries=689 |
| live.firstFramePoolCensus | 526 | resolved | 10069 |  |
| live.finalPipelineSeal | 0 | resolved | 10069 | queuedPipelines=0 |
| wait.prepareLiveSectorBeforeFlight | 9947 | resolved | 10202 |  |
| opening.compositionTail | 1 | resolved | 10204 |  |

## Top-level entry points (inclusive)

The owner of the frame. Anything here that is not the game's own presentation frame is work
the in-engine hitch classifier cannot see.

| ms | share | entry |
|---:|---:|---|
| 6924.3 | 32.2% | `(program) @ native:0` |
| 5139.6 | 23.9% | `frame @ src/core/presentationRunner.js:1060` |
| 1455.0 | 6.8% | `(idle) @ native:0` |
| 648.1 | 3.0% | `state.render.cookLiveSceneGpu @ src/render/renderer.js:15830` |
| 618.5 | 2.9% | `enqueueGeometryResidencyBatches.urgent @ src/render/startupGpuResidency.js:764` |
| 575.7 | 2.7% | `fire @ src/render/compilePresentSlice.js:361` |
| 534.1 | 2.5% | `(anonymous) @ src/render/renderer.js:12852` |
| 407.4 | 1.9% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 314.6 | 1.5% | `(garbage collector) @ native:0` |
| 308.9 | 1.4% | `touchExactTargetSubjects @ src/render/renderer.js:12132` |
| 302.9 | 1.4% | `(anonymous) @ src/render/renderPackageLoader.js:324` |
| 259.8 | 1.2% | `load @ src/render/renderPackageLoader.js:85` |

## Canvas census at the end of the profile

A canvas that is still `connected` with a zero client size is not in layout and cannot be seen.
If its backing store is large, or grows between runs, it is an orphaned render surface.

| id / class | backing store | client | display | connected |
|---|---|---|---|---|
| gl-canvas | 1832x973 | 1466x779 | block | true |
| sf-radar-semantic-canvas | 260x260 | 208x208 | block | true |
| sf-fx-flickergrid | 560x260 | 0x0 | inline | true |
| sf-speed-lines | 1466x779 | 1466x779 | block | true |
| orr-cr-drift | 1x1 | 0x0 | block | true |
| (none) | 2x2 | 0x0 | block | true |
| sf-range__canvas | 300x150 | 0x0 | block | true |
| (none) | 300x150 | 0x0 | block | true |
| (none) | 2x2 | 0x0 | block | true |
| ast-canvas | 300x150 | 0x0 | block | true |
| aw-empty-rock | 1600x900 | 0x0 | block | true |
| orr-base__lattice | 800x400 | 0x0 | block | true |
| boot-terminal-canvas | 300x150 | 0x0 | block | true |
| boot-ring-layer | 220x260 | 0x0 | block | true |
| sf-capital-boss-overlay | 1833x974 | 1466x779 | block | true |
