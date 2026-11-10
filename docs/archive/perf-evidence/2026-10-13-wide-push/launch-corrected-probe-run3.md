# Launch-to-flight main-thread profile

Profile: kept evidence profile `probe-keep-oct13f-000000` (reused: warm GPU program and HTTP caches). New Game seed 47.

**Launch click to flight: 12.5 s.** New Game click to flight: 12.8 s. The profile continues 6.2 s into held-thrust flight.

## Where the time went, by phase

Busy is sampled main-thread time that is not idle. `(program)` is native work outside JavaScript
(Blink, GPU command submission, compositor hand-off). A phase that is mostly idle is waiting on
something off the main thread: driver shader compiles, network, decoding workers, timers.

| phase | wall s | busy s | JS s | (program) s | idle s | GC s | long tasks (n / ms) |
|---|---:|---:|---:|---:|---:|---:|---|
| New Game screen (to Launch click) | 0.24 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 1 / 95 |
| Launch click to first loading stage | 0.51 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 2 / 166 |
| loading: authored-library | 0.67 | 1.41 | 0.21 | 1.19 | 0.01 | 0.00 | 2 / 180 |
| loading: authored-visuals | 1.43 | 1.39 | 1.03 | 0.33 | 0.04 | 0.02 | 1 / 63 |
| loading: render-pipelines | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0 / 0 |
| loading: gpu-resources | 8.79 | 7.70 | 5.57 | 1.99 | 1.09 | 0.14 | 0 / 0 |
| loading: physics-authority | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0 / 0 |
| loading: entering-flight | 1.11 | 0.98 | 0.84 | 0.13 | 0.13 | 0.01 | 3 / 226 |
| first seconds of flight | 6.22 | 6.00 | 3.94 | 2.04 | 0.21 | 0.03 | 0 / 0 |

## Launch click to first loading stage — 0.51 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|

### Self time by source

| ms | share | source |
|---:|---:|---|

## loading: authored-library — 0.67 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 1192.6 | 84.2% | `(program) @ native:0` |
| 40.5 | 2.9% | `getBoundingClientRect @ native:0` |
| 18.5 | 1.3% | `get offsetHeight @ native:0` |
| 13.4 | 0.9% | `setLaunching @ src/ui/screens/newGame.js:846` |
| 9.1 | 0.6% | `getBoundingClientRect @ native:0` |
| 9.0 | 0.6% | `getBoundingClientRect @ native:0` |
| 9.0 | 0.6% | `getBoundingClientRect @ native:0` |
| 8.9 | 0.6% | `focus @ native:0` |
| 8.7 | 0.6% | `getBoundingClientRect @ native:0` |
| 8.6 | 0.6% | `fetch @ native:0` |
| 8.6 | 0.6% | `querySelector @ native:0` |
| 4.7 | 0.3% | `remove @ native:0` |
| 4.6 | 0.3% | `update @ vendor/three.module.js:452` |
| 4.6 | 0.3% | `getBoundingClientRect @ native:0` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 1192.6 | 84.2% | `(program)` |
| 148.2 | 10.5% | `(native)` |
| 16.9 | 1.2% | `vendor/three.module.js` |
| 13.4 | 0.9% | `src/ui/screens/newGame.js` |
| 9.2 | 0.7% | `(idle)` |
| 8.7 | 0.6% | `src/ui/orrery/hullRing.js` |
| 8.7 | 0.6% | `src/render/renderPackageLoader.js` |
| 4.6 | 0.3% | `src/contracts/renderPackage.js` |
| 4.6 | 0.3% | `src/render/assetResidency.js` |
| 4.5 | 0.3% | `src/ui/loadingPresenter.js` |

## loading: authored-visuals — 1.43 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 331.7 | 23.2% | `(program) @ native:0` |
| 137.2 | 9.6% | `getProgramParameter @ native:0` |
| 49.4 | 3.5% | `_createStars @ src/render/spaceBackground.js:2081` |
| 44.9 | 3.1% | `texSubImage2D @ native:0` |
| 22.4 | 1.6% | `(anonymous) @ src/render/visualFactory.js:4942` |
| 20.9 | 1.5% | `(garbage collector) @ native:0` |
| 18.6 | 1.3% | `(anonymous) @ src/render/glbPrepass.js:72` |
| 17.8 | 1.2% | `makeNoiseTexture @ src/render/canvasTextures.js:91` |
| 13.3 | 0.9% | `buildMorrowVisual @ src/render/characters/morrowModel.js:118` |
| 13.2 | 0.9% | `(anonymous) @ src/render/spaceBackground.js:97` |
| 10.3 | 0.7% | `makeHullNormalMap @ src/render/canvasTextures.js:402` |
| 10.2 | 0.7% | `makeHullNormalMap @ src/render/canvasTextures.js:402` |
| 9.1 | 0.6% | `replaceClippingPlaneNums @ vendor/three.module.js:6694` |
| 9.1 | 0.6% | `fetch @ native:0` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 331.7 | 23.2% | `(program)` |
| 234.1 | 16.3% | `vendor/three.core.js` |
| 232.0 | 16.2% | `(native)` |
| 62.6 | 4.4% | `src/render/spaceBackground.js` |
| 54.5 | 3.8% | `src/render/visualFactory.js` |
| 50.8 | 3.5% | `src/render/canvasTextures.js` |
| 46.3 | 3.2% | `vendor/three.module.js` |
| 45.0 | 3.1% | `(idle)` |
| 43.6 | 3.0% | `src/render/renderer.js` |
| 40.6 | 2.8% | `src/render/partsLibrary.js` |

## loading: gpu-resources — 8.79 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 1986.6 | 22.6% | `(program) @ native:0` |
| 153.8 | 1.7% | `traverse @ vendor/three.core.js:12758` |
| 144.8 | 1.6% | `(garbage collector) @ native:0` |
| 121.7 | 1.4% | `getProgramParameter @ native:0` |
| 75.1 | 0.9% | `syncEntityViewsSteps @ src/render/renderer.js:26778` |
| 64.6 | 0.7% | `traverse @ vendor/three.core.js:12758` |
| 59.2 | 0.7% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:595` |
| 45.0 | 0.5% | `texSubImage2D @ native:0` |
| 43.6 | 0.5% | `traverse @ vendor/three.core.js:12758` |
| 41.1 | 0.5% | `get body @ vendor/addons/loaders/GLTFLoader.js:1927` |
| 40.0 | 0.5% | `traverse @ vendor/three.core.js:12758` |
| 37.0 | 0.4% | `(anonymous) @ src/render/visualFactory.js:2113` |
| 36.2 | 0.4% | `digest @ native:0` |
| 32.5 | 0.4% | `traverse @ vendor/three.core.js:12758` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 1986.6 | 22.6% | `(program)` |
| 1492.7 | 17.0% | `vendor/three.core.js` |
| 1091.8 | 12.4% | `(idle)` |
| 649.1 | 7.4% | `(native)` |
| 621.3 | 7.1% | `vendor/three.module.js` |
| 284.6 | 3.2% | `src/render/renderer.js` |
| 277.2 | 3.2% | `src/render/openingGpuAdmission.js` |
| 180.3 | 2.1% | `vendor/addons/loaders/GLTFLoader.js` |
| 165.3 | 1.9% | `src/render/partsLibrary.js` |
| 144.8 | 1.6% | `(garbage collector)` |

## loading: entering-flight — 1.11 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 131.1 | 11.7% | `(program) @ native:0` |
| 40.6 | 3.6% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:595` |
| 38.8 | 3.5% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:595` |
| 28.5 | 2.6% | `withOnlySubjectsDrawable @ src/render/openingGpuAdmission.js:549` |
| 27.3 | 2.4% | `traverse @ vendor/three.core.js:12758` |
| 22.4 | 2.0% | `getBoundingClientRect @ native:0` |
| 22.2 | 2.0% | `traverse @ vendor/three.core.js:12758` |
| 21.9 | 2.0% | `traverse @ vendor/three.core.js:12758` |
| 18.1 | 1.6% | `isDrawable @ src/render/openingGpuAdmission.js:112` |
| 18.1 | 1.6% | `traverse @ vendor/three.core.js:12758` |
| 14.5 | 1.3% | `getParameters @ vendor/three.module.js:7667` |
| 13.6 | 1.2% | `traverse @ vendor/three.core.js:12758` |
| 13.6 | 1.2% | `(garbage collector) @ native:0` |
| 9.3 | 0.8% | `postNow @ src/render/renderer.js:17956` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 187.8 | 16.8% | `vendor/three.core.js` |
| 176.0 | 15.8% | `src/render/openingGpuAdmission.js` |
| 132.7 | 11.9% | `(idle)` |
| 131.1 | 11.7% | `(program)` |
| 124.3 | 11.1% | `vendor/three.module.js` |
| 65.7 | 5.9% | `(native)` |
| 57.6 | 5.2% | `src/render/renderer.js` |
| 38.5 | 3.4% | `src/render/startupGpuResidency.js` |
| 25.9 | 2.3% | `src/render/openingSubmissionPlan.js` |
| 17.8 | 1.6% | `src/render/illustratedSurface.js` |

## first seconds of flight — 6.22 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 2035.4 | 32.8% | `(program) @ native:0` |
| 100.2 | 1.6% | `setProgram @ vendor/three.module.js:18879` |
| 57.6 | 0.9% | `syncSize @ src/ui/capitalBossOverlayMount.js:42` |
| 53.5 | 0.9% | `WebGLRenderer.renderBufferDirect @ vendor/three.module.js:17381` |
| 51.4 | 0.8% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 50.6 | 0.8% | `sfTransformSignatureClean @ vendor/three.module.js:116` |
| 50.3 | 0.8% | `now @ src/render/renderer.js:4144` |
| 37.1 | 0.6% | `classifyWorld @ src/world/activityRuntime.js:1568` |
| 36.3 | 0.6% | `upload @ vendor/three.module.js:6425` |
| 34.4 | 0.6% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |
| 31.8 | 0.5% | `syncEntityViews @ src/render/renderer.js:26750` |
| 31.8 | 0.5% | `detachedPresentedDrawBlocked @ src/render/packageCpuDetach.js:728` |
| 30.5 | 0.5% | `sfTransformSignatureClean @ vendor/three.module.js:116` |
| 28.8 | 0.5% | `unreadyDrawGuard @ src/render/bloom.js:1091` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 2035.4 | 32.8% | `(program)` |
| 949.3 | 15.3% | `vendor/three.module.js` |
| 397.2 | 6.4% | `(native)` |
| 369.8 | 6.0% | `vendor/three.core.js` |
| 239.7 | 3.9% | `src/render/renderer.js` |
| 213.5 | 3.4% | `(idle)` |
| 133.8 | 2.2% | `src/world/activityRuntime.js` |
| 116.2 | 1.9% | `src/render/vfx.js` |
| 110.0 | 1.8% | `src/render/packageCpuDetach.js` |
| 89.8 | 1.4% | `vendor/addons/loaders/GLTFLoader.js` |

## Long tasks from New Game to the end of the profile

| at s (after Launch) | duration ms | during |
|---:|---:|---|
| -0.2 | 95 | New Game screen (to Launch click) |
| 0.0 | 61 | Launch click to first loading stage |
| 0.4 | 105 | Launch click to first loading stage |
| 0.5 | 77 | loading: authored-library |
| 1.0 | 103 | loading: authored-library |
| 1.4 | 63 | loading: authored-visuals |
| 11.5 | 112 | loading: entering-flight |
| 11.6 | 60 | loading: entering-flight |
| 11.7 | 54 | loading: entering-flight |

## Loading-screen smoothness (what the player sees)

Frame gaps are the page's own requestAnimationFrame cadence; stall ms is time beyond one 60 Hz frame. The
boot ring and the backdrop video render off the main thread, so a stall here is the DOM/labels/progress
freezing while they keep moving. Long animation frames (LoAF) name the scripts that held the frame.

| window | fps | frames | p50 ms | p95 ms | worst ms | >33 | >50 | >100 | stall ms | LoAF n / blocking ms | video dropped / played |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| New Game screen (to Launch click) | 16.9 | 4 | 16.7 | 133.2 | 133 | 1 | 1 | 1 | 117 | 2 / 85 | 0 / 0 |
| Launch click to first loading stage | 17.6 | 9 | 33.3 | 183.3 | 183 | 3 | 2 | 1 | 267 | 4 / 128 | 5 / 2 |
| loading: authored-library | 6.0 | 4 | 183.2 | 200.6 | 201 | 3 | 3 | 3 | 500 | 3 / 237 | 0 / 0 |
| loading: authored-visuals | 35.6 | 51 | 16.8 | 83.3 | 133 | 7 | 6 | 1 | 567 | 7 / 122 | 26 / 31 |
| loading: render-pipelines | 0.0 | 0 | 0.0 | 0.0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 0 / 0 |
| loading: gpu-resources | 46.5 | 409 | 16.7 | 50.0 | 133 | 25 | 19 | 6 | 1857 | 19 / 58 | 0 / 233 |
| loading: physics-authority | 0.0 | 0 | 0.0 | 0.0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 0 / 0 |
| loading: entering-flight | 25.1 | 28 | 33.3 | 83.4 | 150 | 9 | 6 | 1 | 649 | 4 / 136 | 1 / 14 |
| first seconds of flight | 25.3 | 157 | 33.3 | 82.6 | 100 | 58 | 33 | 1 | 3563 | 20 / 10 | 0 / 0 |

### Long animation frames in New Game screen (to Launch click): who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 87 | 1 | 74 | `BUTTON.onclick @ src/ui/kit/dom.js` |
| 19 | 1 | 13 | `BUTTON.onclick @ src/ui/screens/newGame.js` |
| 15 | 2 | 14 | `ResizeObserverCallback @ src/ui/orrery/stopDial.js` |
| 8 | 1 | 7 | `ResizeObserverCallback @ src/ui/orrery/hullRing.js` |
| 7 | 1 | 6 | `ResizeObserverCallback @ src/ui/orrery/lampKey.js` |

### Long animation frames in Launch click to first loading stage: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 105 | 1 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 37 | 1 | 0 | `FrameRequestCallback @ src/render/partsLibrary.js` |
| 31 | 1 | 0 | `frame @ src/core/presentationRunner.js` |
| 14 | 2 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-library: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 316 | 9 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 133 | 3 | 0 | `frame @ src/core/presentationRunner.js` |
| 35 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-visuals: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 201 | 3 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 92 | 4 | 0 | `frame @ src/core/presentationRunner.js` |
| 61 | 5 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 10 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 7 | 1 | 0 | `fire @ src/core/backgroundPost.js` |
| 6 | 1 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |

### Long animation frames in loading: gpu-resources: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 420 | 30 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 123 | 19 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |
| 75 | 2 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 56 | 3 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 39 | 4 | 0 | `frame @ src/core/presentationRunner.js` |
| 26 | 1 | 0 | `checkProgramsReady @ src/render/bloom.js` |

### Long animation frames in loading: entering-flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 212 | 4 | 58 | `frame @ src/core/presentationRunner.js` |
| 76 | 2 | 23 | `Worker.onmessage @ src/core/simLaneMain.js` |

### Long animation frames in first seconds of flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 461 | 20 | 0 | `frame @ src/core/presentationRunner.js` |
| 48 | 7 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 28 | 2 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 20 | 2 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |

## Fetched between Launch and flight

299 requests; 142.17 MB of bodies; 89.15 MB actually transferred. Delivery: 204 over the network, 47 revalidated (304), 48 straight from cache.

| type | requests | body MB | transferred MB |
|---|---:|---:|---:|
| glb | 116 | 128.59 | 78.61 |
| json | 169 | 11.85 | 8.82 |
| png | 11 | 1.72 | 1.73 |
| svg | 3 | 0.00 | 0.00 |

| largest bodies | MB | transferred MB | fetch ms |
|---|---:|---:|---:|
| `assets/ships/release/render-packages/helios-trade-hub/render.glb` | 5.36 | 0.00 | 90 |
| `assets/ships/release/render-packages/candle-fleet/render.glb` | 4.88 | 0.00 | 86 |
| `assets/ships/release/render-packages/jump-ring/render.glb` | 3.51 | 0.00 | 59 |
| `assets/ships/release/render-packages/military/render.glb` | 3.00 | 0.00 | 56 |
| `assets/ships/release/render-packages/volatiles-tanker/render.glb` | 2.59 | 2.59 | 336 |
| `assets/ships/release/render-packages/helios-cradle-dmc/render.glb` | 2.52 | 2.52 | 409 |
| `assets/ships/release/render-packages/helios-cradle/render.glb` | 2.52 | 2.52 | 44 |
| `assets/ships/release/render-packages/rescue-lifter/render.glb` | 2.49 | 2.49 | 361 |
| `assets/ships/release/render-packages/yard-tug/render.glb` | 2.41 | 2.41 | 35 |
| `assets/ships/release/render-packages/helios-arclight/render.glb` | 2.36 | 2.36 | 311 |
| `assets/ships/release/render-packages/ore-barge/render.glb` | 2.31 | 2.31 | 274 |
| `assets/ships/release/render-packages/wasp-free-militia/render.glb` | 2.12 | 2.12 | 339 |
| `assets/ships/release/render-packages/wasp-mts-escort/render.glb` | 2.12 | 2.12 | 376 |
| `assets/ships/release/render-packages/wasp-quiet-ghost/render.glb` | 2.12 | 2.12 | 274 |
| `assets/ships/release/render-packages/wasp-scn-patrol/render.glb` | 2.12 | 2.12 | 27 |

## Renderer resources

| moment | programs | geometries | textures | JS heap MB |
|---|---:|---:|---:|---:|
| entering flight | 149 | 2380 | 133 | 861 |
| end of profile | 149 | 2407 | 133 | 1206 |

Dispose-registration probe renders: 1 at flight, 1 at end of profile (once per context generation is right).

## Draws that waited on a driver link

35 waits of 1 ms or more across 35 programs (2178 draw-path calls), 0.9 s on the main thread, longest 195 ms.

| shader family | waits (>= 1 ms) | total ms |
|---|---:|---:|
| MeshDistanceMaterial | 1 | 195 |
| ShaderMaterial | 7 | 156 |
| MeshDepthMaterial | 2 | 99 |
| Material_Warning | 1 | 82 |
| Material_Emissive_Amber | 2 | 64 |
| SF_Station_OpaqueDepthPrepass | 1 | 45 |
| MeshStandardMaterial | 3 | 34 |
| Material_Ceramic_ice | 2 | 26 |
| SF_StartupGeometryResidency | 1 | 19 |
| SF_Shared_canopy_none_native | 2 | 18 |
| MeshBasicMaterial | 2 | 17 |
| Material_Emissive_Amber_beacon | 1 | 17 |

- 195 ms `MeshDistanceMaterial` — at timedBlockingFirstUse (http://127.0.0.1:60580/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:60580/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:60580/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:60580/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:60580/src/render/bloom.js:1142:18) | at renderShadowCaster (http://127.0.0.1:60580/vendor/three.module.js:9860:15) | at http://127.0.0.1:60580/vendor/three.module.js:9814:42 | at eachShadowCaster (http://127.0.0.1:60580/vendor/three.module
- 82 ms `Material_Warning` — at timedBlockingFirstUse (http://127.0.0.1:60580/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:60580/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:60580/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:60580/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:60580/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:60580/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:60580/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:60580/vendor/three.
- 76 ms `MeshDepthMaterial` — at timedBlockingFirstUse (http://127.0.0.1:60580/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:60580/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:60580/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:60580/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:60580/src/render/bloom.js:1142:18) | at renderShadowCaster (http://127.0.0.1:60580/vendor/three.module.js:9860:15) | at http://127.0.0.1:60580/vendor/three.module.js:9814:42 | at eachShadowCaster (http://127.0.0.1:60580/vendor/three.module
- 54 ms `Material_Emissive_Amber` — at timedBlockingFirstUse (http://127.0.0.1:60580/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:60580/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:60580/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:60580/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:60580/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:60580/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:60580/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:60580/vendor/three.
- 45 ms `SF_Station_OpaqueDepthPrepass` — at timedBlockingFirstUse (http://127.0.0.1:60580/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:60580/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:60580/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:60580/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:60580/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:60580/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:60580/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:60580/vendor/three.
- 39 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:60580/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:60580/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:60580/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:60580/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:60580/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:60580/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:60580/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:60580/vendor/three.
- 37 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:60580/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:60580/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:60580/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:60580/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:60580/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:60580/vendor/three.module.js:18647:11) | at renderQuadObject (http://127.0.0.1:60580/vendor/three.module.js:18694:5) | at WebGLRenderer.renderQuadPass (http://127.0.0.1
- 23 ms `MeshDepthMaterial` — at timedBlockingFirstUse (http://127.0.0.1:60580/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:60580/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:60580/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:60580/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:60580/src/render/bloom.js:1142:18) | at renderShadowCaster (http://127.0.0.1:60580/vendor/three.module.js:9860:15) | at http://127.0.0.1:60580/vendor/three.module.js:9814:42 | at eachShadowCaster (http://127.0.0.1:60580/vendor/three.module

Opening work still pending when flight began: `398:missing:wreck`, `401:missing:payload`, `402:missing:payload`, `403:missing:payload`.

## Opening cook ledger

The opening cook began 2.6 s after Launch; flight began at 12.5 s. `t` is ms from the cook's start to the end of the step.

| step | ms | outcome | t ms | detail |
|---|---:|---|---:|---|
| opening.rockSurfaceLibrary | 0 | resolved | 1 |  |
| opening.firstPresentAdmission | 0 | resolved | 2 |  |
| opening.residency | 24 | resolved | 73 | subjects=88 textureRefs=32 textures=32 |
| opening.postResources | 4 | resolved | 77 | route=bloom |
| opening.capturedPipelineDrain | 115 | resolved | 191 | captured=16 stillPending=0 |
| opening.receipt | 6 | resolved | 198 |  |
| wait.prepareOpeningGpuResources | 198 | resolved | 198 |  |
| live.meshBuilds1 | 0 | resolved | 361 | queued=0 passes=0 built=0 buildMs=0 yields=0 left=0 |
| lane | 0 | sample | 1089 | queued=0 flushed=0 settled=81 upgradeJobs=0 upgradeInFlight=1 upgradeCompiling=1 meshBuilds=0 |
| live.openingComposition | 819 | resolved | 1180 | pending=0 |
| live.upgradeQueueIdle | 819 | resolved | 1180 | pending=0 inFlight=0 compiling=false |
| live.pendingPipelines | 0 | skipped | 1180 | captured=0 |
| live.rocksAndLeftoverMeshes | 3 | resolved | 1183 | firstFlightEntities=46 |
| live.meshBuilds2 | 34 | resolved | 1217 | queued=7 passes=2 built=0 buildMs=0 yields=2 left=0 |
| cook.programs | 0 | resolved | 1263 | method=first-flight-hulls |
| cook.touchCompile | 191 | resolved | 1525 | issued=597 unlinked=0 yields=10 |
| lane | 0 | sample | 2039 | queued=0 flushed=15 settled=84 upgradeJobs=2 upgradeInFlight=2 upgradeCompiling=3 meshBuilds=0 |
| cook.touch | 1181 | resolved | 2768 | subjects=597 firstPicture=94 touched=597 notReady=0 noProgram=0 switched=2 touchMs=401 maxTouchMs=3 yields=61 |
| lane | 0 | sample | 3115 | queued=0 flushed=0 settled=103 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.buffers | 1069 | resolved | 3941 | roots=93 textures=230 yields=21 |
| lane | 0 | sample | 4024 | queued=0 flushed=0 settled=103 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.layers | 752 | resolved | 4693 | roots=174 yields=64 |
| lane | 0 | sample | 5025 | queued=21 flushed=0 settled=122 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.crucibleWarm | 389 | resolved | 5090 | progress={"profile":"opening","records":42,"instantiated":42,"packageInstances":42,"paletteSubjects":349,"chunkPromotions":0,"shi |
| lane | 0 | sample | 6002 | queued=0 flushed=10 settled=133 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.rockPools | 951 | resolved | 6139 | roots=52 units=1916 issued=1916 issueDedupeSkips=1820 touched=1916 hiddenTouchSkips=1843 yields=8 issueMs=153 drainMs=717 touchMs=45 |
| live.cook | 4921 | resolved | 6139 |  |
| live.leftoverUpgradeIdle | 0 | resolved | 6139 | pending=0 inFlight=0 compiling=false |
| lane | 0 | sample | 7005 | queued=0 flushed=0 settled=143 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 8004 | queued=0 flushed=0 settled=143 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| live.materialSettle | 2160 | resolved | 8299 | unbound=632 names=Physical racing wakes/Next checkpoint/Draft pace beacon/Massline anchors and crossing refuges/L6_comet/L0-L2_deep-field-composite/L3_stars/L4_flares/DeepField_helios-ecliptic-dust/DeepField_helios-left-drift/DeepField_helios-outer-shepherd/DeepFieldStructure_helios-derelict-hauler |
| live.postOpeningPipelines | 358 | resolved | 8692 |  |
| live.parkWarmRoots | 28 | resolved | 8720 | roots=1 nodes=129 stampedGeometries=688 |
| live.firstFramePoolCensus | 435 | resolved | 8734 |  |
| live.finalPipelineSeal | 0 | resolved | 8735 | queuedPipelines=0 |
| wait.prepareLiveSectorBeforeFlight | 8590 | resolved | 8789 |  |
| opening.compositionTail | 1 | resolved | 8790 |  |

## Top-level entry points (inclusive)

The owner of the frame. Anything here that is not the game's own presentation frame is work
the in-engine hitch classifier cannot see.

| ms | share | entry |
|---:|---:|---|
| 5932.1 | 29.8% | `(program) @ native:0` |
| 4759.8 | 23.9% | `frame @ src/core/presentationRunner.js:1060` |
| 1644.1 | 8.3% | `(idle) @ native:0` |
| 988.5 | 5.0% | `admitOpeningUnitsAcrossSlices @ src/render/openingGpuAdmission.js:830` |
| 664.7 | 3.3% | `state.render.cookLiveSceneGpu @ src/render/renderer.js:15806` |
| 422.2 | 2.1% | `(anonymous) @ src/render/renderer.js:12840` |
| 412.3 | 2.1% | `fire @ src/render/compilePresentSlice.js:361` |
| 371.8 | 1.9% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 260.5 | 1.3% | `load @ src/render/renderPackageLoader.js:85` |
| 254.3 | 1.3% | `(anonymous) @ src/render/renderPackageLoader.js:324` |
| 236.5 | 1.2% | `enqueueGeometryResidencyBatches.urgent @ src/render/startupGpuResidency.js:764` |
| 229.1 | 1.2% | `buildComposedShipAsync @ src/render/partsLibrary.js:11436` |

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
