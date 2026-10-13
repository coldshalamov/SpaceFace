# Launch-to-flight main-thread profile

Profile: kept evidence profile `probe-keep-oct13f-000000` (reused: warm GPU program and HTTP caches). New Game seed 47.

**Launch click to flight: 10.3 s.** New Game click to flight: 10.5 s. The profile continues 6.2 s into held-thrust flight.

## Where the time went, by phase

Busy is sampled main-thread time that is not idle. `(program)` is native work outside JavaScript
(Blink, GPU command submission, compositor hand-off). A phase that is mostly idle is waiting on
something off the main thread: driver shader compiles, network, decoding workers, timers.

| phase | wall s | busy s | JS s | (program) s | idle s | GC s | long tasks (n / ms) |
|---|---:|---:|---:|---:|---:|---:|---|
| New Game screen (to Launch click) | 0.25 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 2 / 162 |
| Launch click to first loading stage | 0.52 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 2 / 164 |
| loading: authored-library | 0.40 | 1.17 | 0.16 | 1.01 | 0.00 | 0.00 | 1 / 80 |
| loading: authored-visuals | 1.80 | 1.79 | 1.22 | 0.52 | 0.00 | 0.06 | 2 / 187 |
| loading: render-pipelines | 0.10 | 0.10 | 0.07 | 0.02 | 0.00 | 0.00 | 0 / 0 |
| loading: gpu-resources | 6.84 | 6.03 | 4.28 | 1.62 | 0.82 | 0.12 | 0 / 0 |
| loading: physics-authority | 0.02 | 0.01 | 0.01 | 0.00 | 0.01 | 0.00 | 0 / 0 |
| loading: entering-flight | 0.58 | 0.53 | 0.44 | 0.08 | 0.04 | 0.01 | 3 / 219 |
| first seconds of flight | 6.23 | 6.07 | 4.03 | 1.96 | 0.16 | 0.07 | 0 / 0 |

## Launch click to first loading stage — 0.52 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|

### Self time by source

| ms | share | source |
|---:|---:|---|

## loading: authored-library — 0.40 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 1008.8 | 86.4% | `(program) @ native:0` |
| 36.7 | 3.1% | `getBoundingClientRect @ native:0` |
| 13.6 | 1.2% | `get offsetHeight @ native:0` |
| 9.4 | 0.8% | `getBoundingClientRect @ native:0` |
| 9.2 | 0.8% | `getBoundingClientRect @ native:0` |
| 8.9 | 0.8% | `getBoundingClientRect @ native:0` |
| 8.9 | 0.8% | `getBoundingClientRect @ native:0` |
| 4.8 | 0.4% | `fetch @ native:0` |
| 4.7 | 0.4% | `f @ src/ui/orrery/hullRing.js:63` |
| 4.7 | 0.4% | `discover @ src/systems/mobile/bridge.js:131` |
| 4.5 | 0.4% | `draw @ src/ui/orrery/hullRing.js:65` |
| 4.5 | 0.4% | `getBoundingClientRect @ native:0` |
| 4.5 | 0.4% | `build @ src/ui/orrery/yardCarousel.js:213` |
| 4.5 | 0.4% | `build @ src/ui/orrery/yardCarousel.js:213` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 1008.8 | 86.4% | `(program)` |
| 105.1 | 9.0% | `(native)` |
| 16.7 | 1.4% | `vendor/three.module.js` |
| 9.2 | 0.8% | `src/ui/orrery/hullRing.js` |
| 9.1 | 0.8% | `src/ui/orrery/yardCarousel.js` |
| 4.7 | 0.4% | `src/systems/mobile/bridge.js` |
| 4.5 | 0.4% | `src/ui/screens/newGame.js` |
| 4.5 | 0.4% | `src/ui/screenManager.js` |
| 4.4 | 0.4% | `src/render/saveEnvelopeSectorWarm.js` |
| 0.9 | 0.1% | `src/systems/mobile/laneTouchSurface.js` |

## loading: authored-visuals — 1.80 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 515.2 | 28.6% | `(program) @ native:0` |
| 91.4 | 5.1% | `getProgramParameter @ native:0` |
| 63.6 | 3.5% | `_createStars @ src/render/spaceBackground.js:2081` |
| 55.5 | 3.1% | `(garbage collector) @ native:0` |
| 40.7 | 2.3% | `texSubImage2D @ native:0` |
| 35.6 | 2.0% | `(anonymous) @ src/render/visualFactory.js:4942` |
| 17.8 | 1.0% | `makeHullNormalMap @ src/render/canvasTextures.js:402` |
| 17.7 | 1.0% | `fetch @ native:0` |
| 12.7 | 0.7% | `makeNoiseTexture @ src/render/canvasTextures.js:91` |
| 11.6 | 0.6% | `makeHullNormalMap @ src/render/canvasTextures.js:402` |
| 8.9 | 0.5% | `follow @ src/render/camera.js:1791` |
| 8.9 | 0.5% | `bake @ src/render/thruster/retroMounts.js:69` |
| 8.8 | 0.5% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 8.7 | 0.5% | `querySelector @ native:0` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 515.2 | 28.6% | `(program)` |
| 246.2 | 13.7% | `(native)` |
| 229.7 | 12.8% | `vendor/three.core.js` |
| 93.7 | 5.2% | `src/render/visualFactory.js` |
| 70.9 | 3.9% | `src/render/partsLibrary.js` |
| 68.4 | 3.8% | `src/render/spaceBackground.js` |
| 56.6 | 3.1% | `src/render/canvasTextures.js` |
| 55.5 | 3.1% | `(garbage collector)` |
| 53.0 | 2.9% | `vendor/three.module.js` |
| 38.5 | 2.1% | `vendor/addons/loaders/GLTFLoader.js` |

## loading: gpu-resources — 6.84 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 1620.5 | 23.7% | `(program) @ native:0` |
| 126.4 | 1.8% | `getProgramParameter @ native:0` |
| 123.1 | 1.8% | `(garbage collector) @ native:0` |
| 46.4 | 0.7% | `texSubImage2D @ native:0` |
| 44.8 | 0.7% | `parse @ vendor/addons/loaders/GLTFLoader.js:429` |
| 43.3 | 0.6% | `syncEntityViewsSteps @ src/render/renderer.js:26802` |
| 42.0 | 0.6% | `updateShipPitchPresentation @ src/render/shipPitchPresentation.js:176` |
| 40.0 | 0.6% | `enqueueGeometryResidencyBatches.urgent @ src/render/startupGpuResidency.js:764` |
| 36.3 | 0.5% | `convertBufferAttribute @ vendor/three.core.js:19219` |
| 35.7 | 0.5% | `getParameters @ vendor/three.module.js:7667` |
| 27.1 | 0.4% | `fetch @ native:0` |
| 26.8 | 0.4% | `fetch @ native:0` |
| 26.3 | 0.4% | `(anonymous) @ src/render/visualFactory.js:2113` |
| 24.2 | 0.4% | `convertBufferAttribute @ vendor/three.core.js:19219` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 1620.5 | 23.7% | `(program)` |
| 933.2 | 13.6% | `vendor/three.core.js` |
| 815.3 | 11.9% | `(idle)` |
| 522.9 | 7.6% | `(native)` |
| 511.8 | 7.5% | `vendor/three.module.js` |
| 236.0 | 3.4% | `src/render/renderer.js` |
| 178.6 | 2.6% | `src/render/partsLibrary.js` |
| 149.2 | 2.2% | `src/render/startupGpuResidency.js` |
| 147.5 | 2.2% | `vendor/addons/loaders/GLTFLoader.js` |
| 134.9 | 2.0% | `src/contracts/renderPackage.js` |

## loading: entering-flight — 0.58 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 83.6 | 14.5% | `(program) @ native:0` |
| 52.3 | 9.0% | `withOnlySubjectsDrawable @ src/render/openingGpuAdmission.js:549` |
| 39.4 | 6.8% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:597` |
| 13.5 | 2.3% | `illustratedSurfaceShader @ src/render/illustratedSurface.js:235` |
| 9.5 | 1.7% | `projectObject @ vendor/three.module.js:18323` |
| 9.2 | 1.6% | `projectObject @ vendor/three.module.js:18323` |
| 9.1 | 1.6% | `(garbage collector) @ native:0` |
| 9.1 | 1.6% | `postNow @ src/render/renderer.js:17980` |
| 9.1 | 1.6% | `traverseVisible @ vendor/three.core.js:12780` |
| 8.9 | 1.5% | `projectObject @ vendor/three.module.js:18323` |
| 8.6 | 1.5% | `syncEntityViewsSteps @ src/render/renderer.js:26802` |
| 8.5 | 1.5% | `traverseVisible @ vendor/three.core.js:12780` |
| 8.3 | 1.4% | `compose @ vendor/three.core.js:10827` |
| 8.0 | 1.4% | `projectObject @ vendor/three.module.js:18323` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 124.5 | 21.5% | `vendor/three.module.js` |
| 96.5 | 16.7% | `src/render/openingGpuAdmission.js` |
| 83.6 | 14.5% | `(program)` |
| 55.1 | 9.5% | `vendor/three.core.js` |
| 49.2 | 8.5% | `src/render/renderer.js` |
| 44.8 | 7.8% | `(idle)` |
| 22.6 | 3.9% | `src/render/illustratedSurface.js` |
| 22.5 | 3.9% | `src/render/startupGpuResidency.js` |
| 9.1 | 1.6% | `(garbage collector)` |
| 8.8 | 1.5% | `src/render/camera.js` |

## first seconds of flight — 6.23 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 1965.0 | 31.6% | `(program) @ native:0` |
| 74.9 | 1.2% | `(garbage collector) @ native:0` |
| 65.3 | 1.0% | `syncEntityViewsSteps @ src/render/renderer.js:26802` |
| 51.4 | 0.8% | `upload @ vendor/three.module.js:6425` |
| 50.5 | 0.8% | `syncSize @ src/ui/capitalBossOverlayMount.js:42` |
| 48.2 | 0.8% | `setProgram @ vendor/three.module.js:18879` |
| 40.6 | 0.7% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 39.9 | 0.6% | `restorePresentedCompressedMips @ src/render/packageCpuDetach.js:829` |
| 39.5 | 0.6% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |
| 36.7 | 0.6% | `now @ src/render/renderer.js:4156` |
| 36.3 | 0.6% | `refreshUniformsCommon @ vendor/three.module.js:15342` |
| 28.6 | 0.5% | `sfTransformSignatureClean @ vendor/three.module.js:116` |
| 28.3 | 0.5% | `classifyWorld @ src/world/activityRuntime.js:1568` |
| 27.8 | 0.4% | `digest @ native:0` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 1965.0 | 31.6% | `(program)` |
| 947.8 | 15.2% | `vendor/three.module.js` |
| 410.6 | 6.6% | `vendor/three.core.js` |
| 374.7 | 6.0% | `(native)` |
| 298.8 | 4.8% | `src/render/renderer.js` |
| 155.9 | 2.5% | `(idle)` |
| 116.5 | 1.9% | `src/render/vfx.js` |
| 93.5 | 1.5% | `src/render/packageCpuDetach.js` |
| 85.8 | 1.4% | `src/world/activityRuntime.js` |
| 79.5 | 1.3% | `vendor/addons/loaders/GLTFLoader.js` |

## Long tasks from New Game to the end of the profile

| at s (after Launch) | duration ms | during |
|---:|---:|---|
| -0.2 | 101 | New Game screen (to Launch click) |
| -0.1 | 61 | New Game screen (to Launch click) |
| 0.0 | 53 | Launch click to first loading stage |
| 0.4 | 111 | Launch click to first loading stage |
| 0.5 | 80 | loading: authored-library |
| 0.9 | 114 | loading: authored-visuals |
| 1.3 | 73 | loading: authored-visuals |
| 9.8 | 107 | loading: entering-flight |
| 9.9 | 55 | loading: entering-flight |
| 10.0 | 57 | loading: entering-flight |

## Loading-screen smoothness (what the player sees)

Frame gaps are the page's own requestAnimationFrame cadence; stall ms is time beyond one 60 Hz frame. The
boot ring and the backdrop video render off the main thread, so a stall here is the DOM/labels/progress
freezing while they keep moving. Long animation frames (LoAF) name the scripts that held the frame.

| window | fps | frames | p50 ms | p95 ms | worst ms | >33 | >50 | >100 | stall ms | LoAF n / blocking ms | video dropped / played |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| New Game screen (to Launch click) | 20.3 | 5 | 66.4 | 133.3 | 133 | 2 | 2 | 1 | 167 | 2 / 100 | 0 / 0 |
| Launch click to first loading stage | 19.2 | 10 | 16.8 | 166.7 | 167 | 3 | 2 | 1 | 250 | 4 / 137 | 4 / 3 |
| loading: authored-library | 7.4 | 3 | 150.4 | 150.4 | 150 | 2 | 2 | 1 | 217 | 3 / 134 | 0 / 0 |
| loading: authored-visuals | 27.3 | 49 | 16.7 | 116.7 | 183 | 11 | 9 | 3 | 883 | 7 / 240 | 25 / 41 |
| loading: render-pipelines | 38.8 | 4 | 16.6 | 17.1 | 17 | 0 | 0 | 0 | 0 | 1 / 0 | 0 / 0 |
| loading: gpu-resources | 46.9 | 321 | 16.7 | 50.0 | 134 | 17 | 14 | 5 | 1509 | 14 / 90 | 1 / 180 |
| loading: physics-authority | 52.6 | 1 | 0.0 | 0.0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 0 / 0 |
| loading: entering-flight | 19.0 | 11 | 50.5 | 133.4 | 133 | 5 | 5 | 1 | 383 | 5 / 132 | 1 / 6 |
| first seconds of flight | 27.9 | 174 | 33.3 | 50.1 | 183 | 47 | 19 | 3 | 3295 | 9 / 20 | 0 / 2 |

### Long animation frames in New Game screen (to Launch click): who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 91 | 1 | 78 | `BUTTON.onclick @ src/ui/kit/dom.js` |
| 17 | 2 | 15 | `ResizeObserverCallback @ src/ui/orrery/stopDial.js` |
| 17 | 1 | 10 | `BUTTON.onclick @ src/ui/screens/newGame.js` |
| 7 | 1 | 7 | `ResizeObserverCallback @ src/ui/orrery/lampKey.js` |
| 7 | 1 | 7 | `ResizeObserverCallback @ src/ui/orrery/hullRing.js` |

### Long animation frames in Launch click to first loading stage: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 111 | 1 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 38 | 1 | 0 | `FrameRequestCallback @ src/render/partsLibrary.js` |
| 33 | 1 | 0 | `frame @ src/core/presentationRunner.js` |
| 6 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-library: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 169 | 6 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 147 | 3 | 0 | `frame @ src/core/presentationRunner.js` |
| 40 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-visuals: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 324 | 6 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 109 | 5 | 0 | `frame @ src/core/presentationRunner.js` |
| 49 | 2 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 22 | 4 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 17 | 1 | 0 | `FrameRequestCallback @ src/render/partsLibrary.js` |
| 7 | 1 | 0 | `checkProgramsReady @ src/render/bloom.js` |
| 5 | 1 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |

### Long animation frames in loading: render-pipelines: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 65 | 3 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 7 | 1 | 0 | `fire @ src/core/backgroundPost.js` |

### Long animation frames in loading: gpu-resources: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 307 | 17 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 87 | 15 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |
| 69 | 2 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 27 | 3 | 0 | `frame @ src/core/presentationRunner.js` |

### Long animation frames in loading: entering-flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 242 | 5 | 55 | `frame @ src/core/presentationRunner.js` |
| 88 | 3 | 21 | `Worker.onmessage @ src/core/simLaneMain.js` |

### Long animation frames in first seconds of flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 196 | 9 | 0 | `frame @ src/core/presentationRunner.js` |
| 42 | 1 | 0 | `Response.arrayBuffer.then @ src/render/renderPackageLoader.js` |
| 21 | 2 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 15 | 1 | 0 | `guarded @ src/render/renderer.js` |
| 13 | 2 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |

## Fetched between Launch and flight

272 requests; 131.45 MB of bodies; 89.15 MB actually transferred. Delivery: 204 over the network, 28 revalidated (304), 40 straight from cache.

| type | requests | body MB | transferred MB |
|---|---:|---:|---:|
| glb | 108 | 119.33 | 78.61 |
| json | 150 | 10.39 | 8.81 |
| png | 11 | 1.72 | 1.73 |
| svg | 3 | 0.00 | 0.00 |

| largest bodies | MB | transferred MB | fetch ms |
|---|---:|---:|---:|
| `assets/ships/release/render-packages/helios-trade-hub/render.glb` | 5.36 | 0.00 | 73 |
| `assets/ships/release/render-packages/candle-fleet/render.glb` | 4.88 | 0.00 | 88 |
| `assets/ships/release/render-packages/jump-ring/render.glb` | 3.51 | 0.00 | 81 |
| `assets/ships/release/render-packages/military/render.glb` | 3.00 | 0.00 | 53 |
| `assets/ships/release/render-packages/volatiles-tanker/render.glb` | 2.59 | 2.59 | 292 |
| `assets/ships/release/render-packages/helios-cradle-dmc/render.glb` | 2.52 | 2.52 | 345 |
| `assets/ships/release/render-packages/helios-cradle/render.glb` | 2.52 | 2.52 | 38 |
| `assets/ships/release/render-packages/rescue-lifter/render.glb` | 2.49 | 2.49 | 310 |
| `assets/ships/release/render-packages/yard-tug/render.glb` | 2.41 | 2.41 | 45 |
| `assets/ships/release/render-packages/helios-arclight/render.glb` | 2.36 | 2.36 | 300 |
| `assets/ships/release/render-packages/ore-barge/render.glb` | 2.31 | 2.31 | 295 |
| `assets/ships/release/render-packages/wasp-free-militia/render.glb` | 2.12 | 2.12 | 304 |
| `assets/ships/release/render-packages/wasp-mts-escort/render.glb` | 2.12 | 2.12 | 315 |
| `assets/ships/release/render-packages/wasp-quiet-ghost/render.glb` | 2.12 | 2.12 | 250 |
| `assets/ships/release/render-packages/wasp-scn-patrol/render.glb` | 2.12 | 2.12 | 20 |

## Renderer resources

| moment | programs | geometries | textures | JS heap MB |
|---|---:|---:|---:|---:|
| entering flight | 149 | 2384 | 130 | 890 |
| end of profile | 149 | 2404 | 134 | 1011 |

Dispose-registration probe renders: 1 at flight, 1 at end of profile (once per context generation is right).

## Draws that waited on a driver link

32 waits of 1 ms or more across 32 programs (1867 draw-path calls), 0.4 s on the main thread, longest 33 ms.

| shader family | waits (>= 1 ms) | total ms |
|---|---:|---:|
| ShaderMaterial | 7 | 108 |
| MeshStandardMaterial | 3 | 35 |
| Material_Emissive_Amber_beacon | 1 | 33 |
| Material_Ceramic_ice | 2 | 30 |
| MeshDepthMaterial | 2 | 26 |
| SF_Shared_canopy_none_native | 2 | 20 |
| SphericalGaussianBlur | 1 | 15 |
| SF_Shared_hull_textured_hull | 1 | 15 |
| PMREMGGXConvolution | 1 | 14 |
| Material_Stone | 1 | 14 |
| MeshBasicMaterial | 2 | 13 |
| SF_Shared_none_none_native | 1 | 11 |

- 33 ms `Material_Emissive_Amber_beacon` — at timedBlockingFirstUse (http://127.0.0.1:58755/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:58755/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:58755/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:58755/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:58755/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:58755/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:58755/vendor/three.module.js:18616:6) | at renderTransmissionPass (http://127.0.0.1:58755/ve
- 29 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:58755/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:58755/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:58755/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:58755/vendor/three.module.js:17387:20) | at renderObject (http://127.0.0.1:58755/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:58755/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:58755/vendor/three.module.js:18461:41) | at WebGLRenderer.render (http://127.0.0.1:58755/vendor/three.module.js:18024:6) | at SpaceB
- 24 ms `MeshDepthMaterial` — at timedBlockingFirstUse (http://127.0.0.1:58755/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:58755/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:58755/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:58755/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:58755/src/render/bloom.js:1142:18) | at renderShadowCaster (http://127.0.0.1:58755/vendor/three.module.js:9860:15) | at http://127.0.0.1:58755/vendor/three.module.js:9814:42 | at eachShadowCaster (http://127.0.0.1:58755/vendor/three.module
- 23 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:58755/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:58755/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:58755/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:58755/vendor/three.module.js:17387:20) | at renderObject (http://127.0.0.1:58755/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:58755/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:58755/vendor/three.module.js:18459:36) | at WebGLRenderer.render (http://127.0.0.1:58755/vendor/three.module.js:18024:6) | at SpaceB
- 23 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:58755/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:58755/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:58755/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:58755/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:58755/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:58755/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:58755/vendor/three.module.js:18616:6) | at renderTransmissionPass (http://127.0.0.1:58755/ve
- 21 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:58755/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:58755/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:58755/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:58755/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:58755/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:58755/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:58755/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:58755/vendor/three.
- 17 ms `MeshStandardMaterial` — at timedBlockingFirstUse (http://127.0.0.1:58755/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:58755/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:58755/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:58755/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:58755/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:58755/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:58755/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:58755/vendor/three.
- 15 ms `SphericalGaussianBlur` — at timedBlockingFirstUse (http://127.0.0.1:58755/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:58755/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:58755/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:58755/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:58755/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:58755/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:58755/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:58755/vendor/three.

Opening work still pending when flight began: `398:missing:wreck`, `401:missing:payload`, `402:missing:payload`, `403:missing:payload`.

## Opening cook ledger

The opening cook began 2.8 s after Launch; flight began at 10.3 s. `t` is ms from the cook's start to the end of the step.

| step | ms | outcome | t ms | detail |
|---|---:|---|---:|---|
| opening.rockSurfaceLibrary | 0 | resolved | 1 |  |
| opening.firstPresentAdmission | 0 | resolved | 2 |  |
| opening.residency | 94 | resolved | 155 | subjects=85 textureRefs=31 textures=31 |
| opening.postResources | 3 | resolved | 159 | route=bloom |
| opening.capturedPipelineDrain | 56 | resolved | 215 | captured=11 stillPending=0 |
| opening.receipt | 6 | resolved | 221 |  |
| wait.prepareOpeningGpuResources | 221 | resolved | 221 |  |
| live.meshBuilds1 | 0 | resolved | 382 | queued=0 passes=0 built=0 buildMs=0 yields=0 left=0 |
| live.openingComposition | 581 | resolved | 962 | pending=0 |
| live.upgradeQueueIdle | 581 | resolved | 962 | pending=0 inFlight=0 compiling=false |
| live.pendingPipelines | 0 | skipped | 963 | captured=0 |
| live.rocksAndLeftoverMeshes | 3 | resolved | 965 | firstFlightEntities=46 |
| live.meshBuilds2 | 34 | resolved | 999 | queued=7 passes=2 built=0 buildMs=0 yields=2 left=0 |
| cook.programs | 0 | resolved | 1051 | method=first-flight-hulls |
| lane | 0 | sample | 1123 | queued=12 flushed=1 settled=84 upgradeJobs=3 upgradeInFlight=2 upgradeCompiling=2 meshBuilds=0 |
| cook.touchCompile | 183 | resolved | 1320 | issued=610 unlinked=0 yields=9 |
| lane | 0 | sample | 2020 | queued=0 flushed=0 settled=101 upgradeJobs=0 upgradeInFlight=2 upgradeCompiling=5 meshBuilds=0 |
| cook.touch | 847 | resolved | 2226 | subjects=610 firstPicture=94 touched=610 notReady=0 noProgram=0 switched=1 touchMs=254 maxTouchMs=3 yields=44 |
| lane | 0 | sample | 3039 | queued=0 flushed=0 settled=103 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=5 meshBuilds=0 |
| lane | 0 | sample | 4001 | queued=0 flushed=0 settled=103 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.buffers | 1879 | resolved | 4232 | roots=93 textures=200 yields=35 |
| cook.layers | 145 | resolved | 4377 | roots=174 yields=42 |
| cook.crucibleWarm | 216 | resolved | 4598 | progress={"profile":"opening","records":42,"instantiated":42,"packageInstances":42,"paletteSubjects":402,"chunkPromotions":0,"shi |
| lane | 0 | sample | 5005 | queued=6 flushed=15 settled=122 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.rockPools | 859 | resolved | 5554 | roots=52 units=1945 issued=1945 issueDedupeSkips=1846 touched=1945 hiddenTouchSkips=1872 yields=7 issueMs=151 drainMs=639 touchMs=43 |
| live.cook | 4555 | resolved | 5554 |  |
| live.leftoverUpgradeIdle | 0 | resolved | 5554 | pending=0 inFlight=0 compiling=false |
| lane | 0 | sample | 6003 | queued=0 flushed=0 settled=143 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| live.materialSettle | 660 | resolved | 6214 | unbound=606 names=Physical racing wakes/Next checkpoint/Draft pace beacon/Massline anchors and crossing refuges/L6_comet/L0-L2_deep-field-composite/L3_stars/L4_flares/DeepField_helios-ecliptic-dust/DeepField_helios-left-drift/DeepField_helios-outer-shepherd/DeepFieldStructure_helios-derelict-hauler |
| live.postOpeningPipelines | 338 | resolved | 6585 |  |
| live.parkWarmRoots | 118 | resolved | 6703 | roots=1 nodes=129 stampedGeometries=691 |
| live.firstFramePoolCensus | 535 | resolved | 6748 |  |
| live.finalPipelineSeal | 0 | resolved | 6748 | queuedPipelines=0 |
| wait.prepareLiveSectorBeforeFlight | 6617 | resolved | 6838 |  |
| opening.compositionTail | 1 | resolved | 6841 |  |

## Top-level entry points (inclusive)

The owner of the frame. Anything here that is not the game's own presentation frame is work
the in-engine hitch classifier cannot see.

| ms | share | entry |
|---:|---:|---|
| 5487.6 | 31.2% | `(program) @ native:0` |
| 4526.7 | 25.7% | `frame @ src/core/presentationRunner.js:1060` |
| 1033.9 | 5.9% | `(idle) @ native:0` |
| 523.7 | 3.0% | `state.render.cookLiveSceneGpu @ src/render/renderer.js:15830` |
| 379.1 | 2.2% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 378.4 | 2.2% | `fire @ src/render/compilePresentSlice.js:361` |
| 369.5 | 2.1% | `(anonymous) @ src/render/renderer.js:12852` |
| 368.3 | 2.1% | `enqueueGeometryResidencyBatches.urgent @ src/render/startupGpuResidency.js:764` |
| 337.2 | 1.9% | `touchExactTargetSubjects @ src/render/renderer.js:12132` |
| 271.8 | 1.5% | `(garbage collector) @ native:0` |
| 244.2 | 1.4% | `(anonymous) @ src/render/renderPackageLoader.js:324` |
| 226.4 | 1.3% | `load @ src/render/renderPackageLoader.js:85` |

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
