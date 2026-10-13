# Launch-to-flight main-thread profile

Profile: kept evidence profile `probe-keep-oct13f-000000` (reused: warm GPU program and HTTP caches). New Game seed 47.

**Launch click to flight: 11.1 s.** New Game click to flight: 11.3 s. The profile continues 6.3 s into held-thrust flight.

## Where the time went, by phase

Busy is sampled main-thread time that is not idle. `(program)` is native work outside JavaScript
(Blink, GPU command submission, compositor hand-off). A phase that is mostly idle is waiting on
something off the main thread: driver shader compiles, network, decoding workers, timers.

| phase | wall s | busy s | JS s | (program) s | idle s | GC s | long tasks (n / ms) |
|---|---:|---:|---:|---:|---:|---:|---|
| New Game screen (to Launch click) | 0.23 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 1 / 97 |
| Launch click to first loading stage | 0.49 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 1 / 114 |
| loading: authored-library | 0.34 | 1.06 | 0.08 | 0.98 | 0.00 | 0.00 | 1 / 67 |
| loading: authored-visuals | 1.53 | 1.42 | 1.04 | 0.38 | 0.10 | 0.01 | 2 / 159 |
| loading: gpu-resources | 7.45 | 6.63 | 4.50 | 1.93 | 0.82 | 0.19 | 0 / 0 |
| loading: physics-authority | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0 / 0 |
| loading: entering-flight | 1.27 | 1.04 | 0.86 | 0.16 | 0.23 | 0.02 | 3 / 231 |
| first seconds of flight | 6.26 | 6.07 | 3.99 | 2.03 | 0.19 | 0.05 | 3 / 159 |

## Launch click to first loading stage — 0.49 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|

### Self time by source

| ms | share | source |
|---:|---:|---|

## loading: authored-visuals — 1.53 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 375.2 | 24.6% | `(program) @ native:0` |
| 93.3 | 6.1% | `getProgramParameter @ native:0` |
| 48.7 | 3.2% | `_createStars @ src/render/spaceBackground.js:2081` |
| 44.8 | 2.9% | `texSubImage2D @ native:0` |
| 23.0 | 1.5% | `(anonymous) @ src/render/visualFactory.js:4942` |
| 18.2 | 1.2% | `get offsetHeight @ native:0` |
| 17.7 | 1.2% | `fetch @ native:0` |
| 14.9 | 1.0% | `getProgramParameter @ native:0` |
| 14.8 | 1.0% | `makeNoiseTexture @ src/render/canvasTextures.js:91` |
| 13.4 | 0.9% | `setLaunching @ src/ui/screens/newGame.js:846` |
| 11.2 | 0.7% | `(garbage collector) @ native:0` |
| 9.6 | 0.6% | `set @ vendor/three.core.js:4864` |
| 9.5 | 0.6% | `getBoundingClientRect @ native:0` |
| 9.1 | 0.6% | `fetch @ native:0` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 375.2 | 24.6% | `(program)` |
| 296.5 | 19.4% | `(native)` |
| 213.2 | 14.0% | `vendor/three.core.js` |
| 103.2 | 6.8% | `(idle)` |
| 56.0 | 3.7% | `src/render/visualFactory.js` |
| 48.7 | 3.2% | `src/render/spaceBackground.js` |
| 45.1 | 3.0% | `src/render/canvasTextures.js` |
| 35.2 | 2.3% | `vendor/three.module.js` |
| 33.7 | 2.2% | `src/render/partsLibrary.js` |
| 25.9 | 1.7% | `vendor/addons/loaders/GLTFLoader.js` |

## loading: gpu-resources — 7.45 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 1932.6 | 25.9% | `(program) @ native:0` |
| 193.3 | 2.6% | `(garbage collector) @ native:0` |
| 158.7 | 2.1% | `bufferData @ native:0` |
| 117.7 | 1.6% | `getProgramParameter @ native:0` |
| 60.1 | 0.8% | `syncEntityViewsSteps @ src/render/renderer.js:26802` |
| 41.2 | 0.6% | `texSubImage2D @ native:0` |
| 40.6 | 0.5% | `get body @ vendor/addons/loaders/GLTFLoader.js:1927` |
| 39.0 | 0.5% | `compressedTexSubImage2D @ native:0` |
| 36.0 | 0.5% | `fetch @ native:0` |
| 31.8 | 0.4% | `follow @ src/render/camera.js:1791` |
| 31.3 | 0.4% | `parse @ vendor/addons/loaders/GLTFLoader.js:429` |
| 28.9 | 0.4% | `digest @ native:0` |
| 28.5 | 0.4% | `(anonymous) @ src/render/visualFactory.js:2113` |
| 27.1 | 0.4% | `fetch @ native:0` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 1932.6 | 25.9% | `(program)` |
| 847.2 | 11.4% | `vendor/three.core.js` |
| 822.0 | 11.0% | `(idle)` |
| 729.0 | 9.8% | `(native)` |
| 519.4 | 7.0% | `vendor/three.module.js` |
| 276.8 | 3.7% | `src/render/renderer.js` |
| 193.3 | 2.6% | `(garbage collector)` |
| 185.5 | 2.5% | `vendor/addons/loaders/GLTFLoader.js` |
| 163.7 | 2.2% | `src/render/partsLibrary.js` |
| 119.0 | 1.6% | `src/contracts/renderPackage.js` |

## loading: entering-flight — 1.27 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 160.9 | 12.7% | `(program) @ native:0` |
| 90.0 | 7.1% | `withOnlySubjectsDrawable @ src/render/openingGpuAdmission.js:549` |
| 66.5 | 5.2% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:597` |
| 22.6 | 1.8% | `getBoundingClientRect @ native:0` |
| 19.6 | 1.5% | `(garbage collector) @ native:0` |
| 13.4 | 1.1% | `illustratedSurfaceShader @ src/render/illustratedSurface.js:235` |
| 13.2 | 1.0% | `bufferData @ native:0` |
| 13.1 | 1.0% | `getParameters @ vendor/three.module.js:7667` |
| 10.7 | 0.8% | `restorePresentedCompressedMips @ src/render/packageCpuDetach.js:829` |
| 9.0 | 0.7% | `retainTextureUploadLease @ src/render/imageSourceDedupe.js:50` |
| 8.9 | 0.7% | `compose @ vendor/three.core.js:10827` |
| 8.7 | 0.7% | `getParameters @ vendor/three.module.js:7667` |
| 8.7 | 0.7% | `traverseVisible @ vendor/three.core.js:12780` |
| 8.3 | 0.7% | `projectObject @ vendor/three.module.js:18323` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 228.4 | 18.0% | `(idle)` |
| 168.9 | 13.3% | `src/render/openingGpuAdmission.js` |
| 160.9 | 12.7% | `(program)` |
| 154.4 | 12.2% | `vendor/three.module.js` |
| 109.8 | 8.7% | `vendor/three.core.js` |
| 78.3 | 6.2% | `(native)` |
| 65.9 | 5.2% | `src/render/renderer.js` |
| 47.3 | 3.7% | `src/render/startupGpuResidency.js` |
| 26.7 | 2.1% | `src/render/openingSubmissionPlan.js` |
| 19.6 | 1.5% | `(garbage collector)` |

## first seconds of flight — 6.26 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 2027.0 | 32.4% | `(program) @ native:0` |
| 74.0 | 1.2% | `classifyWorld @ src/world/activityRuntime.js:1568` |
| 70.2 | 1.1% | `setProgram @ vendor/three.module.js:18879` |
| 53.7 | 0.9% | `syncSize @ src/ui/capitalBossOverlayMount.js:42` |
| 53.3 | 0.9% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 50.3 | 0.8% | `get body @ vendor/addons/loaders/GLTFLoader.js:1927` |
| 48.9 | 0.8% | `syncEntityViewsSteps @ src/render/renderer.js:26802` |
| 45.1 | 0.7% | `(garbage collector) @ native:0` |
| 41.4 | 0.7% | `setValueM4 @ vendor/three.module.js:5587` |
| 41.4 | 0.7% | `WebGLRenderer.renderBufferDirect @ vendor/three.module.js:17381` |
| 36.1 | 0.6% | `fetch @ native:0` |
| 32.6 | 0.5% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |
| 31.8 | 0.5% | `getBindingState @ vendor/three.module.js:1873` |
| 30.8 | 0.5% | `now @ src/render/renderer.js:4156` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 2027.0 | 32.4% | `(program)` |
| 935.0 | 14.9% | `vendor/three.module.js` |
| 439.1 | 7.0% | `(native)` |
| 362.0 | 5.8% | `vendor/three.core.js` |
| 277.0 | 4.4% | `src/render/renderer.js` |
| 198.9 | 3.2% | `src/world/activityRuntime.js` |
| 193.2 | 3.1% | `(idle)` |
| 142.9 | 2.3% | `src/render/vfx.js` |
| 107.7 | 1.7% | `vendor/addons/loaders/GLTFLoader.js` |
| 104.8 | 1.7% | `src/render/packageCpuDetach.js` |

## Long tasks from New Game to the end of the profile

| at s (after Launch) | duration ms | during |
|---:|---:|---|
| -0.2 | 97 | New Game screen (to Launch click) |
| 0.4 | 114 | Launch click to first loading stage |
| 0.5 | 67 | loading: authored-library |
| 0.8 | 84 | loading: authored-visuals |
| 1.2 | 75 | loading: authored-visuals |
| 10.0 | 60 | loading: entering-flight |
| 10.1 | 120 | loading: entering-flight |
| 10.2 | 51 | loading: entering-flight |
| 11.7 | 52 | first seconds of flight |
| 12.1 | 54 | first seconds of flight |
| 13.8 | 53 | first seconds of flight |

## Loading-screen smoothness (what the player sees)

Frame gaps are the page's own requestAnimationFrame cadence; stall ms is time beyond one 60 Hz frame. The
boot ring and the backdrop video render off the main thread, so a stall here is the DOM/labels/progress
freezing while they keep moving. Long animation frames (LoAF) name the scripts that held the frame.

| window | fps | frames | p50 ms | p95 ms | worst ms | >33 | >50 | >100 | stall ms | LoAF n / blocking ms | video dropped / played |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| New Game screen (to Launch click) | 17.3 | 4 | 16.7 | 133.4 | 133 | 1 | 1 | 1 | 117 | 1 / 87 | 0 / 0 |
| Launch click to first loading stage | 14.2 | 7 | 33.4 | 233.3 | 233 | 2 | 1 | 1 | 283 | 2 / 126 | 6 / 3 |
| loading: authored-library | 8.8 | 3 | 99.9 | 99.9 | 100 | 2 | 2 | 0 | 133 | 3 / 81 | 0 / 0 |
| loading: authored-visuals | 28.8 | 44 | 16.7 | 100.1 | 200 | 6 | 6 | 3 | 716 | 7 / 318 | 10 / 19 |
| loading: gpu-resources | 46.4 | 346 | 16.7 | 50.0 | 117 | 23 | 17 | 3 | 1620 | 15 / 36 | 5 / 197 |
| loading: physics-authority | 1000.0 | 1 | 0.0 | 0.0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 0 / 0 |
| loading: entering-flight | 31.5 | 40 | 33.3 | 66.7 | 167 | 8 | 5 | 1 | 600 | 3 / 119 | 0 / 26 |
| first seconds of flight | 23.8 | 149 | 33.4 | 82.8 | 117 | 73 | 44 | 3 | 3730 | 30 / 20 | 0 / 0 |

### Long animation frames in New Game screen (to Launch click): who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 88 | 1 | 77 | `BUTTON.onclick @ src/ui/kit/dom.js` |
| 16 | 2 | 15 | `ResizeObserverCallback @ src/ui/orrery/stopDial.js` |
| 8 | 1 | 8 | `ResizeObserverCallback @ src/ui/orrery/hullRing.js` |
| 6 | 1 | 6 | `ResizeObserverCallback @ src/ui/orrery/lampKey.js` |

### Long animation frames in Launch click to first loading stage: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 114 | 1 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 29 | 1 | 0 | `FrameRequestCallback @ src/render/partsLibrary.js` |
| 29 | 1 | 0 | `frame @ src/core/presentationRunner.js` |
| 9 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-library: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 130 | 5 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 118 | 3 | 0 | `frame @ src/core/presentationRunner.js` |
| 43 | 2 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-visuals: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 321 | 4 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 207 | 7 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 96 | 3 | 0 | `frame @ src/core/presentationRunner.js` |
| 15 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 7 | 1 | 0 | `fire @ src/core/backgroundPost.js` |

### Long animation frames in loading: gpu-resources: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 267 | 21 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 50 | 9 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |
| 37 | 3 | 0 | `frame @ src/core/presentationRunner.js` |
| 34 | 3 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: entering-flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 166 | 3 | 53 | `frame @ src/core/presentationRunner.js` |
| 60 | 1 | 23 | `Worker.onmessage @ src/core/simLaneMain.js` |

### Long animation frames in first seconds of flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 776 | 30 | 0 | `frame @ src/core/presentationRunner.js` |
| 71 | 10 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 10 | 1 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 7 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |

## Fetched between Launch and flight

291 requests; 138.74 MB of bodies; 89.24 MB actually transferred. Delivery: 206 over the network, 39 revalidated (304), 46 straight from cache.

| type | requests | body MB | transferred MB |
|---|---:|---:|---:|
| glb | 115 | 125.51 | 78.65 |
| json | 162 | 11.50 | 8.86 |
| png | 11 | 1.72 | 1.73 |
| svg | 3 | 0.00 | 0.00 |

| largest bodies | MB | transferred MB | fetch ms |
|---|---:|---:|---:|
| `assets/ships/release/render-packages/helios-trade-hub/render.glb` | 5.36 | 0.00 | 44 |
| `assets/ships/release/render-packages/candle-fleet/render.glb` | 4.88 | 0.00 | 55 |
| `assets/ships/release/render-packages/jump-ring/render.glb` | 3.51 | 0.00 | 219 |
| `assets/ships/release/render-packages/military/render.glb` | 3.00 | 0.00 | 47 |
| `assets/ships/release/render-packages/volatiles-tanker/render.glb` | 2.59 | 2.59 | 289 |
| `assets/ships/release/render-packages/helios-cradle-dmc/render.glb` | 2.52 | 2.52 | 357 |
| `assets/ships/release/render-packages/helios-cradle/render.glb` | 2.52 | 2.52 | 47 |
| `assets/ships/release/render-packages/rescue-lifter/render.glb` | 2.49 | 2.49 | 275 |
| `assets/ships/release/render-packages/yard-tug/render.glb` | 2.41 | 2.41 | 21 |
| `assets/ships/release/render-packages/helios-arclight/render.glb` | 2.36 | 2.36 | 256 |
| `assets/ships/release/render-packages/ore-barge/render.glb` | 2.31 | 2.31 | 256 |
| `assets/ships/release/render-packages/wasp-free-militia/render.glb` | 2.12 | 2.12 | 285 |
| `assets/ships/release/render-packages/wasp-mts-escort/render.glb` | 2.12 | 2.12 | 316 |
| `assets/ships/release/render-packages/wasp-quiet-ghost/render.glb` | 2.12 | 2.12 | 216 |
| `assets/ships/release/render-packages/wasp-scn-patrol/render.glb` | 2.12 | 2.12 | 12 |

## Renderer resources

| moment | programs | geometries | textures | JS heap MB |
|---|---:|---:|---:|---:|
| entering flight | 149 | 2368 | 133 | 846 |
| end of profile | 149 | 2384 | 133 | 1046 |

Dispose-registration probe renders: 1 at flight, 1 at end of profile (once per context generation is right).

## Draws that waited on a driver link

34 waits of 1 ms or more across 34 programs (1793 draw-path calls), 0.4 s on the main thread, longest 52 ms.

| shader family | waits (>= 1 ms) | total ms |
|---|---:|---:|
| ShaderMaterial | 7 | 87 |
| Material_Emissive_Amber | 2 | 59 |
| MeshStandardMaterial | 4 | 49 |
| Material_Warning | 1 | 44 |
| MeshDepthMaterial | 2 | 28 |
| SF_Shared_canopy_none_native | 2 | 23 |
| SF_Shared_mechanical_dark | 1 | 22 |
| Material_Ceramic_ice | 2 | 20 |
| CubemapFromEquirect | 1 | 18 |
| SF_Station_OpaqueDepthPrepass | 1 | 14 |
| Material_Stone | 1 | 12 |
| MeshBasicMaterial | 2 | 11 |

- 52 ms `Material_Emissive_Amber` — at timedBlockingFirstUse (http://127.0.0.1:50334/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:50334/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:50334/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:50334/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:50334/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:50334/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:50334/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:50334/vendor/three.
- 44 ms `Material_Warning` — at timedBlockingFirstUse (http://127.0.0.1:50334/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:50334/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:50334/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:50334/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:50334/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:50334/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:50334/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:50334/vendor/three.
- 40 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:50334/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:50334/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:50334/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:50334/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:50334/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:50334/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:50334/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:50334/vendor/three.
- 23 ms `MeshDepthMaterial` — at timedBlockingFirstUse (http://127.0.0.1:50334/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:50334/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:50334/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:50334/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:50334/src/render/bloom.js:1142:18) | at renderShadowCaster (http://127.0.0.1:50334/vendor/three.module.js:9860:15) | at http://127.0.0.1:50334/vendor/three.module.js:9814:42 | at eachShadowCaster (http://127.0.0.1:50334/vendor/three.module
- 22 ms `SF_Shared_mechanical_dark` — at timedBlockingFirstUse (http://127.0.0.1:50334/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:50334/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:50334/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:50334/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:50334/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:50334/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:50334/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:50334/vendor/three.
- 18 ms `CubemapFromEquirect` — at timedBlockingFirstUse (http://127.0.0.1:50334/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:50334/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:50334/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:50334/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:50334/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:50334/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:50334/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:50334/vendor/three.
- 18 ms `MeshStandardMaterial` — at timedBlockingFirstUse (http://127.0.0.1:50334/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:50334/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:50334/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:50334/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:50334/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:50334/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:50334/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:50334/vendor/three.
- 16 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:50334/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:50334/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:50334/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:50334/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:50334/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:50334/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:50334/vendor/three.module.js:18616:6) | at renderTransmissionPass (http://127.0.0.1:50334/ve

Opening work still pending when flight began: `381:missing:wreck`, `384:missing:payload`, `385:missing:payload`, `386:missing:payload`.

## Opening cook ledger

The opening cook began 2.4 s after Launch; flight began at 11.1 s. `t` is ms from the cook's start to the end of the step.

| step | ms | outcome | t ms | detail |
|---|---:|---|---:|---|
| opening.rockSurfaceLibrary | 0 | resolved | 1 |  |
| opening.firstPresentAdmission | 0 | resolved | 2 |  |
| opening.residency | 155 | resolved | 206 | subjects=87 textureRefs=32 textures=32 |
| opening.postResources | 3 | resolved | 209 | route=bloom |
| lane | 0 | sample | 1020 | queued=1 flushed=25 settled=56 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| opening.capturedPipelineDrain | 817 | resolved | 1026 | captured=38 stillPending=10 |
| opening.receipt | 6 | resolved | 1032 |  |
| wait.prepareOpeningGpuResources | 1032 | resolved | 1032 |  |
| live.meshBuilds1 | 0 | resolved | 1109 | queued=0 passes=0 built=0 buildMs=0 yields=0 left=0 |
| live.openingComposition | 17 | resolved | 1126 | pending=0 |
| live.upgradeQueueIdle | 17 | resolved | 1126 | pending=0 inFlight=0 compiling=false |
| live.pendingPipelines | 8 | resolved | 1134 | captured=2 remaining=0 |
| live.rocksAndLeftoverMeshes | 4 | resolved | 1138 | firstFlightEntities=47 |
| live.meshBuilds2 | 44 | resolved | 1181 | queued=9 passes=3 built=0 buildMs=0 yields=3 left=0 |
| cook.programs | 0 | resolved | 1226 | method=first-flight-hulls |
| cook.touchCompile | 143 | resolved | 1444 | issued=599 unlinked=0 yields=8 |
| lane | 0 | sample | 2021 | queued=0 flushed=0 settled=101 upgradeJobs=1 upgradeInFlight=2 upgradeCompiling=5 meshBuilds=0 |
| cook.touch | 613 | resolved | 2124 | subjects=599 firstPicture=94 touched=599 notReady=0 noProgram=0 switched=1 touchMs=227 maxTouchMs=4 yields=33 |
| lane | 0 | sample | 3026 | queued=1 flushed=0 settled=101 upgradeJobs=1 upgradeInFlight=1 upgradeCompiling=5 meshBuilds=0 |
| lane | 0 | sample | 4007 | queued=0 flushed=0 settled=104 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=6 meshBuilds=0 |
| cook.buffers | 2287 | resolved | 4491 | roots=94 textures=200 yields=29 |
| cook.layers | 266 | resolved | 4758 | roots=174 yields=40 |
| lane | 0 | sample | 5002 | queued=26 flushed=0 settled=118 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.crucibleWarm | 279 | resolved | 5042 | progress={"profile":"opening","records":42,"instantiated":42,"packageInstances":42,"paletteSubjects":333,"chunkPromotions":0,"shi |
| lane | 0 | sample | 6001 | queued=0 flushed=15 settled=129 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.rockPools | 908 | resolved | 6119 | roots=53 units=1899 issued=1899 issueDedupeSkips=1797 touched=1899 hiddenTouchSkips=1822 yields=8 issueMs=157 drainMs=671 touchMs=48 |
| live.cook | 4937 | resolved | 6119 |  |
| live.leftoverUpgradeIdle | 0 | resolved | 6119 | pending=0 inFlight=0 compiling=false |
| live.materialSettle | 624 | resolved | 6742 | unbound=330 names=Physical racing wakes/Next checkpoint/Draft pace beacon/Massline anchors and crossing refuges/L6_comet/L0-L2_deep-field-composite/L3_stars/L4_flares/DeepField_helios-ecliptic-dust/DeepField_helios-left-drift/DeepField_helios-outer-shepherd/DeepFieldStructure_helios-derelict-hauler |
| live.postOpeningPipelines | 447 | resolved | 7227 |  |
| lane | 0 | sample | 7238 | queued=0 flushed=0 settled=144 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| live.parkWarmRoots | 87 | resolved | 7315 | roots=1 nodes=129 stampedGeometries=678 |
| live.firstFramePoolCensus | 622 | resolved | 7364 |  |
| live.finalPipelineSeal | 0 | resolved | 7365 | queuedPipelines=0 |
| wait.prepareLiveSectorBeforeFlight | 6417 | resolved | 7450 |  |
| opening.compositionTail | 1 | resolved | 7451 |  |

## Top-level entry points (inclusive)

The owner of the frame. Anything here that is not the game's own presentation frame is work
the in-engine hitch classifier cannot see.

| ms | share | entry |
|---:|---:|---|
| 5699.7 | 31.0% | `(program) @ native:0` |
| 4626.0 | 25.1% | `frame @ src/core/presentationRunner.js:1060` |
| 1511.7 | 8.2% | `(idle) @ native:0` |
| 564.5 | 3.1% | `(anonymous) @ src/render/renderer.js:12852` |
| 466.4 | 2.5% | `state.render.cookLiveSceneGpu @ src/render/renderer.js:15830` |
| 455.0 | 2.5% | `fire @ src/render/compilePresentSlice.js:361` |
| 398.2 | 2.2% | `touchExactTargetSubjects @ src/render/renderer.js:12132` |
| 386.0 | 2.1% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 300.4 | 1.6% | `enqueueGeometryResidencyBatches.urgent @ src/render/startupGpuResidency.js:764` |
| 269.3 | 1.5% | `(garbage collector) @ native:0` |
| 217.7 | 1.2% | `(anonymous) @ src/render/renderPackageLoader.js:324` |
| 187.6 | 1.0% | `compileSubjectColorAndDepth @ src/render/renderer.js:12116` |

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
