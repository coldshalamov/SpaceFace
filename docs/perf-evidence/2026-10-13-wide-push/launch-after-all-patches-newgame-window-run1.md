# Launch-to-flight main-thread profile

Profile: kept evidence profile `probe-keep-oct13f-000000` (reused: warm GPU program and HTTP caches). New Game seed 47.

**Launch click to flight: 10.1 s.** New Game click to flight: 10.4 s. The profile continues 3.2 s into held-thrust flight.

## Where the time went, by phase

Busy is sampled main-thread time that is not idle. `(program)` is native work outside JavaScript
(Blink, GPU command submission, compositor hand-off). A phase that is mostly idle is waiting on
something off the main thread: driver shader compiles, network, decoding workers, timers.

| phase | wall s | busy s | JS s | (program) s | idle s | GC s | long tasks (n / ms) |
|---|---:|---:|---:|---:|---:|---:|---|
| New Game screen (to Launch click) | 0.29 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 3 / 226 |
| Launch click to first loading stage | 0.69 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 1 / 124 |
| loading: authored-library | 0.66 | 1.61 | 0.26 | 1.35 | 0.02 | 0.00 | 2 / 188 |
| loading: authored-visuals | 1.25 | 1.14 | 0.94 | 0.18 | 0.11 | 0.01 | 1 / 69 |
| loading: gpu-resources | 6.85 | 6.04 | 4.14 | 1.76 | 0.81 | 0.13 | 0 / 0 |
| loading: entering-flight | 0.67 | 0.51 | 0.44 | 0.06 | 0.17 | 0.01 | 2 / 175 |
| first seconds of flight | 3.19 | 2.98 | 1.97 | 0.99 | 0.20 | 0.02 | 0 / 0 |

## Launch click to first loading stage — 0.69 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|

### Self time by source

| ms | share | source |
|---:|---:|---|

## loading: authored-library — 0.66 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 1346.9 | 82.5% | `(program) @ native:0` |
| 40.7 | 2.5% | `getBoundingClientRect @ native:0` |
| 13.5 | 0.8% | `setLaunching @ src/ui/screens/newGame.js:847` |
| 13.5 | 0.8% | `get offsetHeight @ native:0` |
| 13.5 | 0.8% | `getBoundingClientRect @ native:0` |
| 13.0 | 0.8% | `getBoundingClientRect @ native:0` |
| 9.2 | 0.6% | `focus @ native:0` |
| 9.1 | 0.6% | `getBoundingClientRect @ native:0` |
| 9.1 | 0.6% | `getBoundingClientRect @ native:0` |
| 9.0 | 0.6% | `getBoundingClientRect @ native:0` |
| 5.2 | 0.3% | `attachRuntimeDecoders @ src/render/assetLoader.js:1496` |
| 4.6 | 0.3% | `WebGLRenderer.renderBufferDirect @ vendor/three.module.js:17381` |
| 4.6 | 0.3% | `validateRecords @ src/contracts/renderPackage.js:512` |
| 4.6 | 0.3% | `(garbage collector) @ native:0` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 1346.9 | 82.5% | `(program)` |
| 144.0 | 8.8% | `(native)` |
| 22.5 | 1.4% | `(idle)` |
| 18.2 | 1.1% | `src/contracts/renderPackage.js` |
| 13.5 | 0.8% | `src/ui/screens/newGame.js` |
| 13.3 | 0.8% | `vendor/three.module.js` |
| 13.0 | 0.8% | `src/core/simLaneMain.js` |
| 9.0 | 0.6% | `src/render/renderPackageLoader.js` |
| 9.0 | 0.6% | `src/ui/orrery/yardCarousel.js` |
| 5.2 | 0.3% | `src/render/assetLoader.js` |

## loading: authored-visuals — 1.25 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 181.6 | 14.6% | `(program) @ native:0` |
| 94.2 | 7.6% | `getProgramParameter @ native:0` |
| 53.1 | 4.3% | `_createStars @ src/render/spaceBackground.js:2081` |
| 45.0 | 3.6% | `texSubImage2D @ native:0` |
| 23.0 | 1.9% | `parse @ vendor/addons/loaders/GLTFLoader.js:429` |
| 18.8 | 1.5% | `(anonymous) @ src/render/visualFactory.js:4942` |
| 15.3 | 1.2% | `makeNoiseTexture @ src/render/canvasTextures.js:91` |
| 14.5 | 1.2% | `makeHullNormalMap @ src/render/canvasTextures.js:402` |
| 9.8 | 0.8% | `makeHullNormalMap @ src/render/canvasTextures.js:402` |
| 9.5 | 0.8% | `(garbage collector) @ native:0` |
| 9.2 | 0.7% | `digest @ native:0` |
| 9.2 | 0.7% | `replaceLightNums @ vendor/three.module.js:6675` |
| 9.1 | 0.7% | `buildExemplars @ src/render/renderer.js:21571` |
| 9.0 | 0.7% | `clone @ vendor/three.core.js:19439` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 209.9 | 16.9% | `(native)` |
| 181.6 | 14.6% | `(program)` |
| 160.7 | 12.9% | `vendor/three.core.js` |
| 108.4 | 8.7% | `(idle)` |
| 62.0 | 5.0% | `src/render/spaceBackground.js` |
| 61.1 | 4.9% | `src/render/visualFactory.js` |
| 55.9 | 4.5% | `vendor/addons/loaders/GLTFLoader.js` |
| 53.1 | 4.3% | `src/render/renderer.js` |
| 48.0 | 3.9% | `src/render/canvasTextures.js` |
| 42.9 | 3.5% | `vendor/three.module.js` |

## loading: gpu-resources — 6.85 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 1762.0 | 25.7% | `(program) @ native:0` |
| 134.3 | 2.0% | `(garbage collector) @ native:0` |
| 94.7 | 1.4% | `getProgramParameter @ native:0` |
| 48.3 | 0.7% | `releaseStatesOfObject @ vendor/three.module.js:2387` |
| 45.6 | 0.7% | `get body @ vendor/addons/loaders/GLTFLoader.js:1927` |
| 41.1 | 0.6% | `texSubImage2D @ native:0` |
| 36.2 | 0.5% | `fetch @ native:0` |
| 33.2 | 0.5% | `(anonymous) @ src/render/visualFactory.js:2113` |
| 32.6 | 0.5% | `syncEntityViewsSteps @ src/render/renderer.js:26802` |
| 31.9 | 0.5% | `parse @ vendor/addons/loaders/GLTFLoader.js:429` |
| 31.2 | 0.5% | `traverseVisible @ vendor/three.core.js:12780` |
| 28.7 | 0.4% | `convertBufferAttribute @ vendor/three.core.js:19219` |
| 27.8 | 0.4% | `replaceLightNums @ vendor/three.module.js:6675` |
| 25.9 | 0.4% | `convertBufferAttribute @ vendor/three.core.js:19219` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 1762.0 | 25.7% | `(program)` |
| 916.3 | 13.4% | `vendor/three.core.js` |
| 809.4 | 11.8% | `(idle)` |
| 533.0 | 7.8% | `(native)` |
| 495.3 | 7.2% | `vendor/three.module.js` |
| 262.5 | 3.8% | `src/render/renderer.js` |
| 194.8 | 2.8% | `vendor/addons/loaders/GLTFLoader.js` |
| 147.7 | 2.2% | `src/render/partsLibrary.js` |
| 134.3 | 2.0% | `(garbage collector)` |
| 116.1 | 1.7% | `src/render/startupGpuResidency.js` |

## loading: entering-flight — 0.67 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 63.2 | 9.4% | `(program) @ native:0` |
| 38.7 | 5.8% | `withOnlySubjectsDrawable @ src/render/openingGpuAdmission.js:549` |
| 13.7 | 2.0% | `traverseVisible @ vendor/three.core.js:12780` |
| 9.2 | 1.4% | `(garbage collector) @ native:0` |
| 9.1 | 1.3% | `getParameters @ vendor/three.module.js:7667` |
| 9.1 | 1.3% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:597` |
| 9.1 | 1.3% | `illustratedSurfaceShader @ src/render/illustratedSurface.js:235` |
| 9.1 | 1.3% | `follow @ src/render/camera.js:1791` |
| 9.0 | 1.3% | `materialTextures @ src/render/startupGpuResidency.js:106` |
| 8.8 | 1.3% | `yieldFn @ src/render/compilePresentSlice.js:339` |
| 8.7 | 1.3% | `getUniformLocation @ native:0` |
| 7.2 | 1.1% | `subjectsForCompileRoots @ src/render/renderer.js:18115` |
| 5.5 | 0.8% | `getProgram @ vendor/three.module.js:18700` |
| 5.1 | 0.8% | `traverseVisible @ vendor/three.core.js:12780` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 165.2 | 24.5% | `(idle)` |
| 90.9 | 13.5% | `vendor/three.core.js` |
| 69.0 | 10.3% | `vendor/three.module.js` |
| 63.2 | 9.4% | `(program)` |
| 57.5 | 8.5% | `src/render/openingGpuAdmission.js` |
| 44.1 | 6.6% | `src/render/renderer.js` |
| 24.9 | 3.7% | `(native)` |
| 18.7 | 2.8% | `src/render/startupGpuResidency.js` |
| 13.5 | 2.0% | `src/render/bloom.js` |
| 13.2 | 2.0% | `src/render/illustratedSurface.js` |

## first seconds of flight — 3.19 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 987.1 | 31.0% | `(program) @ native:0` |
| 53.1 | 1.7% | `syncSize @ src/ui/capitalBossOverlayMount.js:42` |
| 27.2 | 0.9% | `classifyWorld @ src/world/activityRuntime.js:1568` |
| 27.1 | 0.8% | `withOnlySubjectsDrawable @ src/render/openingGpuAdmission.js:549` |
| 26.9 | 0.8% | `fetch @ native:0` |
| 22.3 | 0.7% | `unreadyDrawGuard @ src/render/bloom.js:1091` |
| 21.4 | 0.7% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 18.1 | 0.6% | `(garbage collector) @ native:0` |
| 17.8 | 0.6% | `getBoundingClientRect @ native:0` |
| 17.8 | 0.6% | `get body @ vendor/addons/loaders/GLTFLoader.js:1927` |
| 17.7 | 0.6% | `sfTransformSignatureClean @ vendor/three.module.js:116` |
| 16.4 | 0.5% | `updateCraftMicroMotion @ src/render/shipMicroMotion.js:1335` |
| 15.8 | 0.5% | `sfTransformSignatureClean @ vendor/three.module.js:116` |
| 13.7 | 0.4% | `setup @ vendor/three.module.js:1816` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 987.1 | 31.0% | `(program)` |
| 396.7 | 12.5% | `vendor/three.module.js` |
| 240.9 | 7.6% | `(native)` |
| 204.3 | 6.4% | `(idle)` |
| 157.5 | 4.9% | `vendor/three.core.js` |
| 134.2 | 4.2% | `src/render/renderer.js` |
| 53.1 | 1.7% | `src/ui/capitalBossOverlayMount.js` |
| 52.3 | 1.6% | `src/world/activityRuntime.js` |
| 52.2 | 1.6% | `src/render/bloom.js` |
| 48.5 | 1.5% | `src/render/openingGpuAdmission.js` |

## Long tasks from New Game to the end of the profile

| at s (after Launch) | duration ms | during |
|---:|---:|---|
| -0.3 | 108 | New Game screen (to Launch click) |
| -0.1 | 51 | New Game screen (to Launch click) |
| -0.1 | 67 | New Game screen (to Launch click) |
| 0.6 | 124 | Launch click to first loading stage |
| 0.7 | 84 | loading: authored-library |
| 1.2 | 104 | loading: authored-library |
| 1.6 | 69 | loading: authored-visuals |
| 9.6 | 61 | loading: entering-flight |
| 9.7 | 114 | loading: entering-flight |

## Loading-screen smoothness (what the player sees)

Frame gaps are the page's own requestAnimationFrame cadence; stall ms is time beyond one 60 Hz frame. The
boot ring and the backdrop video render off the main thread, so a stall here is the DOM/labels/progress
freezing while they keep moving. Long animation frames (LoAF) name the scripts that held the frame.

| window | fps | frames | p50 ms | p95 ms | worst ms | >33 | >50 | >100 | stall ms | LoAF n / blocking ms | video dropped / played |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| New Game screen (to Launch click) | 13.6 | 4 | 16.7 | 166.7 | 167 | 1 | 1 | 1 | 150 | 2 / 129 | 0 / 0 |
| Launch click to first loading stage | 20.4 | 14 | 16.7 | 200.0 | 200 | 4 | 3 | 1 | 333 | 4 / 154 | 6 / 3 |
| loading: authored-library | 6.1 | 4 | 166.6 | 216.7 | 217 | 3 | 3 | 2 | 417 | 3 / 197 | 0 / 0 |
| loading: authored-visuals | 28.9 | 36 | 33.2 | 100.0 | 100 | 7 | 4 | 1 | 566 | 7 / 87 | 0 / 29 |
| loading: gpu-resources | 48.5 | 332 | 16.7 | 33.6 | 117 | 19 | 15 | 2 | 1286 | 14 / 55 | 0 / 182 |
| loading: entering-flight | 31.3 | 21 | 16.7 | 166.6 | 167 | 5 | 4 | 1 | 333 | 2 / 117 | 0 / 6 |
| first seconds of flight | 28.9 | 92 | 33.3 | 50.2 | 100 | 21 | 11 | 1 | 1648 | 4 / 0 | 0 / 4 |

### Long animation frames in New Game screen (to Launch click): who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 100 | 1 | 86 | `BUTTON.onclick @ src/ui/kit/dom.js` |
| 22 | 1 | 12 | `BUTTON.onclick @ src/ui/screens/newGame.js` |
| 19 | 2 | 17 | `ResizeObserverCallback @ src/ui/orrery/stopDial.js` |
| 9 | 1 | 9 | `ResizeObserverCallback @ src/ui/orrery/lampKey.js` |
| 9 | 1 | 8 | `ResizeObserverCallback @ src/ui/orrery/hullRing.js` |

### Long animation frames in Launch click to first loading stage: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 125 | 1 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 45 | 4 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 38 | 1 | 0 | `FrameRequestCallback @ src/render/partsLibrary.js` |
| 36 | 1 | 0 | `frame @ src/core/presentationRunner.js` |

### Long animation frames in loading: authored-library: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 284 | 9 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 140 | 3 | 0 | `frame @ src/core/presentationRunner.js` |
| 41 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-visuals: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 203 | 6 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 105 | 5 | 0 | `frame @ src/core/presentationRunner.js` |
| 47 | 2 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 6 | 1 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |

### Long animation frames in loading: gpu-resources: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 268 | 17 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 39 | 7 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |
| 36 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 35 | 4 | 0 | `frame @ src/core/presentationRunner.js` |
| 30 | 2 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: entering-flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 130 | 2 | 50 | `frame @ src/core/presentationRunner.js` |
| 67 | 2 | 24 | `Worker.onmessage @ src/core/simLaneMain.js` |

### Long animation frames in first seconds of flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 86 | 4 | 0 | `frame @ src/core/presentationRunner.js` |
| 7 | 1 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 5 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

## Fetched between Launch and flight

292 requests; 141.14 MB of bodies; 89.24 MB actually transferred. Delivery: 206 over the network, 37 revalidated (304), 49 straight from cache.

| type | requests | body MB | transferred MB |
|---|---:|---:|---:|
| glb | 118 | 127.88 | 78.65 |
| json | 160 | 11.54 | 8.86 |
| png | 11 | 1.72 | 1.73 |
| svg | 3 | 0.00 | 0.00 |

| largest bodies | MB | transferred MB | fetch ms |
|---|---:|---:|---:|
| `assets/ships/release/render-packages/helios-trade-hub/render.glb` | 5.36 | 0.00 | 57 |
| `assets/ships/release/render-packages/candle-fleet/render.glb` | 4.88 | 0.00 | 63 |
| `assets/ships/release/render-packages/jump-ring/render.glb` | 3.51 | 0.00 | 58 |
| `assets/ships/release/render-packages/military/render.glb` | 3.00 | 0.00 | 49 |
| `assets/ships/release/render-packages/volatiles-tanker/render.glb` | 2.59 | 2.59 | 269 |
| `assets/ships/release/render-packages/helios-cradle-dmc/render.glb` | 2.52 | 2.52 | 338 |
| `assets/ships/release/render-packages/helios-cradle/render.glb` | 2.52 | 2.52 | 131 |
| `assets/ships/release/render-packages/rescue-lifter/render.glb` | 2.49 | 2.49 | 278 |
| `assets/ships/release/render-packages/yard-tug/render.glb` | 2.41 | 2.41 | 26 |
| `assets/ships/release/render-packages/helios-arclight/render.glb` | 2.36 | 2.36 | 273 |
| `assets/ships/release/render-packages/ore-barge/render.glb` | 2.31 | 2.31 | 266 |
| `assets/ships/release/render-packages/wasp-free-militia/render.glb` | 2.12 | 2.12 | 280 |
| `assets/ships/release/render-packages/wasp-mts-escort/render.glb` | 2.12 | 2.12 | 304 |
| `assets/ships/release/render-packages/wasp-quiet-ghost/render.glb` | 2.12 | 2.12 | 281 |
| `assets/ships/release/render-packages/wasp-scn-patrol/render.glb` | 2.12 | 2.12 | 59 |

## Renderer resources

| moment | programs | geometries | textures | JS heap MB |
|---|---:|---:|---:|---:|
| entering flight | 149 | 2348 | 119 | 803 |
| end of profile | 149 | 2360 | 119 | 958 |

Dispose-registration probe renders: 1 at flight, 1 at end of profile (once per context generation is right).

## Draws that waited on a driver link

33 waits of 1 ms or more across 33 programs (1779 draw-path calls), 0.5 s on the main thread, longest 82 ms.

| shader family | waits (>= 1 ms) | total ms |
|---|---:|---:|
| ShaderMaterial | 7 | 181 |
| Material_Emissive_Amber | 2 | 66 |
| MeshDepthMaterial | 2 | 55 |
| Material_Warning | 1 | 38 |
| MeshStandardMaterial | 3 | 37 |
| Material_Ceramic_ice | 2 | 24 |
| SF_Shared_canopy_none_native | 2 | 23 |
| Material_Emissive_Amber_beacon | 1 | 14 |
| SF_Shared_mechanical_dark | 1 | 13 |
| MeshBasicMaterial | 2 | 12 |
| Material_Stone | 1 | 11 |
| CubemapFromEquirect | 1 | 11 |

- 82 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:65338/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:65338/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:65338/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:65338/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:65338/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:65338/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:65338/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:65338/vendor/three.
- 55 ms `Material_Emissive_Amber` — at timedBlockingFirstUse (http://127.0.0.1:65338/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:65338/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:65338/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:65338/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:65338/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:65338/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:65338/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:65338/vendor/three.
- 54 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:65338/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:65338/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:65338/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:65338/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:65338/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:65338/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:65338/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:65338/vendor/three.
- 38 ms `Material_Warning` — at timedBlockingFirstUse (http://127.0.0.1:65338/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:65338/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:65338/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:65338/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:65338/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:65338/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:65338/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:65338/vendor/three.
- 29 ms `MeshDepthMaterial` — at timedBlockingFirstUse (http://127.0.0.1:65338/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:65338/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:65338/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:65338/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:65338/src/render/bloom.js:1142:18) | at renderShadowCaster (http://127.0.0.1:65338/vendor/three.module.js:9860:15) | at http://127.0.0.1:65338/vendor/three.module.js:9814:42 | at eachShadowCaster (http://127.0.0.1:65338/vendor/three.module
- 26 ms `MeshDepthMaterial` — at timedBlockingFirstUse (http://127.0.0.1:65338/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:65338/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:65338/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:65338/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:65338/src/render/bloom.js:1142:18) | at renderShadowCaster (http://127.0.0.1:65338/vendor/three.module.js:9860:15) | at http://127.0.0.1:65338/vendor/three.module.js:9814:42 | at eachShadowCaster (http://127.0.0.1:65338/vendor/three.module
- 21 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:65338/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:65338/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:65338/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:65338/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:65338/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:65338/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:65338/vendor/three.module.js:18616:6) | at renderTransmissionPass (http://127.0.0.1:65338/ve
- 18 ms `MeshStandardMaterial` — at timedBlockingFirstUse (http://127.0.0.1:65338/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:65338/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:65338/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:65338/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:65338/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:65338/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:65338/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:65338/vendor/three.

Opening work still pending when flight began: `388:missing:wreck`, `391:missing:payload`, `392:missing:payload`, `393:missing:payload`.

## Opening cook ledger

The opening cook began 2.6 s after Launch; flight began at 10.1 s. `t` is ms from the cook's start to the end of the step.

| step | ms | outcome | t ms | detail |
|---|---:|---|---:|---|
| opening.rockSurfaceLibrary | 0 | resolved | 1 |  |
| opening.firstPresentAdmission | 0 | resolved | 1 |  |
| opening.residency | 75 | resolved | 122 | subjects=87 textureRefs=32 textures=32 |
| opening.postResources | 3 | resolved | 126 | route=bloom |
| opening.capturedPipelineDrain | 150 | resolved | 276 | captured=28 stillPending=1 |
| opening.receipt | 3 | resolved | 280 |  |
| wait.prepareOpeningGpuResources | 280 | resolved | 280 |  |
| live.meshBuilds1 | 0 | resolved | 360 | queued=0 passes=0 built=0 buildMs=0 yields=0 left=0 |
| lane | 0 | sample | 1013 | queued=0 flushed=1 settled=81 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=5 meshBuilds=0 |
| live.openingComposition | 794 | resolved | 1153 | pending=0 |
| live.upgradeQueueIdle | 794 | resolved | 1153 | pending=0 inFlight=0 compiling=false |
| live.pendingPipelines | 0 | skipped | 1153 | captured=0 |
| live.rocksAndLeftoverMeshes | 2 | resolved | 1156 | firstFlightEntities=47 |
| live.meshBuilds2 | 53 | resolved | 1209 | queued=8 passes=3 built=0 buildMs=0 yields=3 left=0 |
| cook.programs | 0 | resolved | 1257 | method=first-flight-hulls |
| cook.touchCompile | 132 | resolved | 1469 | issued=593 unlinked=0 yields=8 |
| lane | 0 | sample | 2018 | queued=0 flushed=1 settled=100 upgradeJobs=1 upgradeInFlight=2 upgradeCompiling=5 meshBuilds=0 |
| cook.touch | 599 | resolved | 2120 | subjects=593 firstPicture=94 touched=593 notReady=0 noProgram=0 switched=0 touchMs=215 maxTouchMs=4 yields=33 |
| lane | 0 | sample | 3021 | queued=0 flushed=0 settled=102 upgradeJobs=0 upgradeInFlight=2 upgradeCompiling=6 meshBuilds=0 |
| lane | 0 | sample | 4008 | queued=0 flushed=0 settled=104 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=3 meshBuilds=0 |
| cook.buffers | 1985 | resolved | 4223 | roots=94 textures=203 yields=30 |
| cook.layers | 216 | resolved | 4439 | roots=174 yields=40 |
| cook.crucibleWarm | 215 | resolved | 4659 | progress={"profile":"opening","records":41,"instantiated":41,"packageInstances":41,"paletteSubjects":431,"chunkPromotions":0,"shi |
| lane | 0 | sample | 5004 | queued=8 flushed=13 settled=123 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.rockPools | 886 | resolved | 5643 | roots=53 units=1903 issued=1903 issueDedupeSkips=1817 touched=1903 hiddenTouchSkips=1826 yields=9 issueMs=169 drainMs=626 touchMs=61 |
| live.cook | 4434 | resolved | 5643 |  |
| live.leftoverUpgradeIdle | 0 | resolved | 5643 | pending=0 inFlight=0 compiling=false |
| lane | 0 | sample | 6010 | queued=0 flushed=0 settled=144 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| live.materialSettle | 600 | resolved | 6243 | unbound=554 names=Physical racing wakes/Next checkpoint/Draft pace beacon/Massline anchors and crossing refuges/L6_comet/L0-L2_deep-field-composite/L3_stars/L4_flares/DeepField_helios-ecliptic-dust/DeepField_helios-left-drift/DeepField_helios-outer-shepherd/DeepFieldStructure_helios-derelict-hauler |
| live.postOpeningPipelines | 335 | resolved | 6612 |  |
| live.parkWarmRoots | 84 | resolved | 6696 | roots=1 nodes=129 stampedGeometries=640 |
| live.firstFramePoolCensus | 493 | resolved | 6737 |  |
| live.finalPipelineSeal | 0 | resolved | 6737 | queuedPipelines=0 |
| wait.prepareLiveSectorBeforeFlight | 6564 | resolved | 6844 |  |
| opening.compositionTail | 1 | resolved | 6846 |  |

## Top-level entry points (inclusive)

The owner of the frame. Anything here that is not the game's own presentation frame is work
the in-engine hitch classifier cannot see.

| ms | share | entry |
|---:|---:|---|
| 4668.1 | 32.0% | `(program) @ native:0` |
| 2977.9 | 20.4% | `frame @ src/core/presentationRunner.js:1060` |
| 1318.8 | 9.0% | `(idle) @ native:0` |
| 479.5 | 3.3% | `state.render.cookLiveSceneGpu @ src/render/renderer.js:15830` |
| 379.6 | 2.6% | `fire @ src/render/compilePresentSlice.js:361` |
| 311.8 | 2.1% | `(anonymous) @ src/render/renderer.js:12852` |
| 305.7 | 2.1% | `touchExactTargetSubjects @ src/render/renderer.js:12132` |
| 274.2 | 1.9% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 262.1 | 1.8% | `enqueueGeometryResidencyBatches.urgent @ src/render/startupGpuResidency.js:764` |
| 203.2 | 1.4% | `buildComposedShipAsync @ src/render/partsLibrary.js:11436` |
| 193.6 | 1.3% | `buildExemplars @ src/render/renderer.js:21571` |
| 180.3 | 1.2% | `(garbage collector) @ native:0` |

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
