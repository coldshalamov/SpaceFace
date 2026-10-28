# Launch-to-flight main-thread profile

Profile: kept evidence profile `probe-keep-oct13f-000000` (reused: warm GPU program and HTTP caches). New Game seed 47.

**Launch click to flight: 11.2 s.** New Game click to flight: 11.4 s. The profile continues 3.2 s into held-thrust flight.

## Where the time went, by phase

Busy is sampled main-thread time that is not idle. `(program)` is native work outside JavaScript
(Blink, GPU command submission, compositor hand-off). A phase that is mostly idle is waiting on
something off the main thread: driver shader compiles, network, decoding workers, timers.

| phase | wall s | busy s | JS s | (program) s | idle s | GC s | long tasks (n / ms) |
|---|---:|---:|---:|---:|---:|---:|---|
| New Game screen (to Launch click) | 0.29 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 3 / 232 |
| Launch click to first loading stage | 0.61 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 1 / 93 |
| loading: authored-library | 0.45 | 1.34 | 0.21 | 1.13 | 0.00 | 0.00 | 1 / 90 |
| loading: authored-visuals | 1.64 | 1.54 | 1.09 | 0.44 | 0.10 | 0.02 | 2 / 218 |
| loading: render-pipelines | 0.07 | 0.06 | 0.05 | 0.01 | 0.00 | 0.00 | 0 / 0 |
| loading: gpu-resources | 7.43 | 6.58 | 4.54 | 1.84 | 0.85 | 0.21 | 0 / 0 |
| loading: entering-flight | 0.96 | 0.88 | 0.70 | 0.16 | 0.09 | 0.01 | 3 / 234 |
| first seconds of flight | 3.20 | 2.90 | 1.93 | 0.96 | 0.29 | 0.02 | 0 / 0 |

## Launch click to first loading stage — 0.61 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|

### Self time by source

| ms | share | source |
|---:|---:|---|

## loading: authored-library — 0.45 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 1134.1 | 84.7% | `(program) @ native:0` |
| 35.7 | 2.7% | `getBoundingClientRect @ native:0` |
| 25.8 | 1.9% | `get offsetHeight @ native:0` |
| 13.7 | 1.0% | `setLaunching @ src/ui/screens/newGame.js:847` |
| 13.6 | 1.0% | `getBoundingClientRect @ native:0` |
| 13.6 | 1.0% | `getBoundingClientRect @ native:0` |
| 9.0 | 0.7% | `getBoundingClientRect @ native:0` |
| 9.0 | 0.7% | `getBoundingClientRect @ native:0` |
| 9.0 | 0.7% | `focus @ native:0` |
| 8.7 | 0.7% | `getBoundingClientRect @ native:0` |
| 4.9 | 0.4% | `setMask @ vendor/three.module.js:10018` |
| 4.6 | 0.3% | `setTimeout @ native:0` |
| 4.6 | 0.3% | `setProgram @ vendor/three.module.js:18879` |
| 4.6 | 0.3% | `emit @ src/core/eventBus.js:418` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 1134.1 | 84.7% | `(program)` |
| 142.1 | 10.6% | `(native)` |
| 13.7 | 1.0% | `src/ui/screens/newGame.js` |
| 12.9 | 1.0% | `vendor/three.module.js` |
| 8.6 | 0.6% | `src/ui/orrery/arcRail.js` |
| 4.6 | 0.3% | `src/core/eventBus.js` |
| 4.6 | 0.3% | `src/ui/map/mapParityBridge.js` |
| 4.5 | 0.3% | `src/ui/orrery/yardCarousel.js` |
| 4.5 | 0.3% | `src/ui/starterAirCard.js` |
| 4.5 | 0.3% | `src/ui/screens/flightFootage.js` |

## loading: authored-visuals — 1.64 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 436.7 | 26.6% | `(program) @ native:0` |
| 63.4 | 3.9% | `_createStars @ src/render/spaceBackground.js:2081` |
| 46.2 | 2.8% | `(anonymous) @ src/render/visualFactory.js:4942` |
| 31.1 | 1.9% | `texSubImage2D @ native:0` |
| 26.1 | 1.6% | `makeNoiseTexture @ src/render/canvasTextures.js:91` |
| 18.1 | 1.1% | `fetch @ native:0` |
| 16.9 | 1.0% | `parse @ vendor/addons/loaders/GLTFLoader.js:429` |
| 15.7 | 1.0% | `(garbage collector) @ native:0` |
| 15.4 | 0.9% | `makeHullNormalMap @ src/render/canvasTextures.js:402` |
| 9.9 | 0.6% | `makeHullNormalMap @ src/render/canvasTextures.js:402` |
| 9.6 | 0.6% | `postMessage @ native:0` |
| 9.1 | 0.6% | `addUV @ vendor/three.core.js:35147` |
| 9.1 | 0.6% | `get @ vendor/addons/loaders/GLTFLoader.js:582` |
| 9.1 | 0.6% | `get body @ vendor/addons/loaders/GLTFLoader.js:1927` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 436.7 | 26.6% | `(program)` |
| 243.9 | 14.8% | `vendor/three.core.js` |
| 113.7 | 6.9% | `(native)` |
| 102.5 | 6.2% | `(idle)` |
| 91.5 | 5.6% | `src/render/visualFactory.js` |
| 77.2 | 4.7% | `src/render/spaceBackground.js` |
| 66.5 | 4.0% | `src/render/canvasTextures.js` |
| 64.8 | 3.9% | `src/render/partsLibrary.js` |
| 57.7 | 3.5% | `vendor/addons/loaders/GLTFLoader.js` |
| 36.2 | 2.2% | `src/render/renderer.js` |

## loading: gpu-resources — 7.43 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 1835.8 | 24.7% | `(program) @ native:0` |
| 206.1 | 2.8% | `(garbage collector) @ native:0` |
| 169.7 | 2.3% | `bufferData @ native:0` |
| 161.3 | 2.2% | `getProgramParameter @ native:0` |
| 49.7 | 0.7% | `texSubImage2D @ native:0` |
| 39.5 | 0.5% | `get body @ vendor/addons/loaders/GLTFLoader.js:1927` |
| 32.6 | 0.4% | `syncEntityViewsSteps @ src/render/renderer.js:26802` |
| 31.6 | 0.4% | `parse @ vendor/addons/loaders/GLTFLoader.js:429` |
| 30.4 | 0.4% | `convertBufferAttribute @ vendor/three.core.js:19219` |
| 30.3 | 0.4% | `convertBufferAttribute @ vendor/three.core.js:19219` |
| 29.8 | 0.4% | `getX @ vendor/three.core.js:17085` |
| 29.2 | 0.4% | `update @ src/render/vfx.js:12397` |
| 28.8 | 0.4% | `releaseStatesOfObject @ vendor/three.module.js:2387` |
| 24.8 | 0.3% | `fetch @ native:0` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 1835.8 | 24.7% | `(program)` |
| 937.3 | 12.6% | `vendor/three.core.js` |
| 851.5 | 11.5% | `(idle)` |
| 782.1 | 10.5% | `(native)` |
| 536.4 | 7.2% | `vendor/three.module.js` |
| 217.1 | 2.9% | `src/render/renderer.js` |
| 206.1 | 2.8% | `(garbage collector)` |
| 175.5 | 2.4% | `vendor/addons/loaders/GLTFLoader.js` |
| 161.4 | 2.2% | `src/render/partsLibrary.js` |
| 116.8 | 1.6% | `src/contracts/renderPackage.js` |

## loading: entering-flight — 0.96 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 161.6 | 16.7% | `(program) @ native:0` |
| 45.8 | 4.7% | `withOnlySubjectsDrawable @ src/render/openingGpuAdmission.js:549` |
| 40.2 | 4.2% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:597` |
| 13.7 | 1.4% | `traverseVisible @ vendor/three.core.js:12780` |
| 13.7 | 1.4% | `compose @ vendor/three.core.js:10827` |
| 13.6 | 1.4% | `(garbage collector) @ native:0` |
| 13.5 | 1.4% | `projectObject @ vendor/three.module.js:18323` |
| 13.4 | 1.4% | `traverseVisible @ vendor/three.core.js:12780` |
| 13.4 | 1.4% | `getParameters @ vendor/three.module.js:7667` |
| 13.3 | 1.4% | `traverseVisible @ vendor/three.core.js:12780` |
| 13.2 | 1.4% | `cloneUniforms @ vendor/three.core.js:37307` |
| 9.8 | 1.0% | `setProgram @ vendor/three.module.js:18879` |
| 9.0 | 0.9% | `traverseVisible @ vendor/three.core.js:12780` |
| 9.0 | 0.9% | `projectObject @ vendor/three.module.js:18323` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 161.6 | 16.7% | `(program)` |
| 152.9 | 15.8% | `vendor/three.module.js` |
| 147.3 | 15.3% | `vendor/three.core.js` |
| 98.5 | 10.2% | `src/render/openingGpuAdmission.js` |
| 89.3 | 9.2% | `(idle)` |
| 64.0 | 6.6% | `src/render/renderer.js` |
| 44.7 | 4.6% | `(native)` |
| 38.5 | 4.0% | `src/render/startupGpuResidency.js` |
| 18.6 | 1.9% | `src/render/openingSubmissionPlan.js` |
| 13.6 | 1.4% | `(garbage collector)` |

## first seconds of flight — 3.20 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 956.0 | 29.9% | `(program) @ native:0` |
| 49.2 | 1.5% | `syncSize @ src/ui/capitalBossOverlayMount.js:42` |
| 35.8 | 1.1% | `setProgram @ vendor/three.module.js:18879` |
| 33.2 | 1.0% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 33.0 | 1.0% | `syncEntityViewsSteps @ src/render/renderer.js:26802` |
| 31.1 | 1.0% | `classifyWorld @ src/world/activityRuntime.js:1568` |
| 23.3 | 0.7% | `now @ src/render/renderer.js:4156` |
| 22.5 | 0.7% | `getBoundingClientRect @ native:0` |
| 19.0 | 0.6% | `(garbage collector) @ native:0` |
| 18.3 | 0.6% | `fetch @ native:0` |
| 18.2 | 0.6% | `upload @ vendor/three.module.js:6425` |
| 17.9 | 0.6% | `setValueM4 @ vendor/three.module.js:5587` |
| 15.3 | 0.5% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |
| 13.9 | 0.4% | `update @ src/render/vfx.js:12397` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 956.0 | 29.9% | `(program)` |
| 415.3 | 13.0% | `vendor/three.module.js` |
| 289.2 | 9.1% | `(idle)` |
| 188.6 | 5.9% | `(native)` |
| 172.0 | 5.4% | `vendor/three.core.js` |
| 157.0 | 4.9% | `src/render/renderer.js` |
| 79.9 | 2.5% | `src/world/activityRuntime.js` |
| 49.2 | 1.5% | `vendor/addons/loaders/GLTFLoader.js` |
| 49.2 | 1.5% | `src/ui/capitalBossOverlayMount.js` |
| 42.9 | 1.3% | `src/render/packageCpuDetach.js` |

## Long tasks from New Game to the end of the profile

| at s (after Launch) | duration ms | during |
|---:|---:|---|
| -0.3 | 92 | New Game screen (to Launch click) |
| -0.2 | 62 | New Game screen (to Launch click) |
| -0.1 | 78 | New Game screen (to Launch click) |
| 0.5 | 93 | Launch click to first loading stage |
| 0.6 | 90 | loading: authored-library |
| 1.1 | 113 | loading: authored-visuals |
| 1.4 | 105 | loading: authored-visuals |
| 10.4 | 65 | loading: entering-flight |
| 10.5 | 113 | loading: entering-flight |
| 10.6 | 56 | loading: entering-flight |

## Loading-screen smoothness (what the player sees)

Frame gaps are the page's own requestAnimationFrame cadence; stall ms is time beyond one 60 Hz frame. The
boot ring and the backdrop video render off the main thread, so a stall here is the DOM/labels/progress
freezing while they keep moving. Long animation frames (LoAF) name the scripts that held the frame.

| window | fps | frames | p50 ms | p95 ms | worst ms | >33 | >50 | >100 | stall ms | LoAF n / blocking ms | video dropped / played |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| New Game screen (to Launch click) | 14.0 | 4 | 33.4 | 150.0 | 150 | 1 | 1 | 1 | 150 | 2 / 127 | 0 / 0 |
| Launch click to first loading stage | 14.8 | 9 | 50.1 | 233.3 | 233 | 4 | 4 | 1 | 367 | 4 / 128 | 7 / 2 |
| loading: authored-library | 6.7 | 3 | 149.6 | 149.6 | 150 | 2 | 2 | 2 | 233 | 3 / 157 | 0 / 0 |
| loading: authored-visuals | 21.9 | 36 | 32.6 | 116.7 | 250 | 10 | 8 | 3 | 916 | 7 / 336 | 5 / 20 |
| loading: render-pipelines | 30.8 | 2 | 33.4 | 33.4 | 33 | 0 | 0 | 0 | 17 | 0 / 0 | 0 / 0 |
| loading: gpu-resources | 47.6 | 354 | 16.7 | 50.0 | 117 | 24 | 16 | 3 | 1538 | 15 / 58 | 1 / 198 |
| loading: entering-flight | 32.3 | 31 | 16.8 | 66.7 | 167 | 5 | 4 | 1 | 433 | 2 / 121 | 1 / 15 |
| first seconds of flight | 27.2 | 87 | 33.3 | 66.6 | 83 | 27 | 14 | 0 | 1582 | 6 / 0 | 0 / 0 |

### Long animation frames in New Game screen (to Launch click): who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 83 | 1 | 71 | `BUTTON.onclick @ src/ui/kit/dom.js` |
| 26 | 2 | 24 | `ResizeObserverCallback @ src/ui/orrery/stopDial.js` |
| 24 | 1 | 15 | `BUTTON.onclick @ src/ui/screens/newGame.js` |
| 12 | 1 | 12 | `ResizeObserverCallback @ src/ui/orrery/lampKey.js` |
| 10 | 1 | 9 | `ResizeObserverCallback @ src/ui/orrery/hullRing.js` |

### Long animation frames in Launch click to first loading stage: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 94 | 1 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 41 | 1 | 0 | `FrameRequestCallback @ src/render/partsLibrary.js` |
| 38 | 1 | 0 | `frame @ src/core/presentationRunner.js` |
| 13 | 2 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-library: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 184 | 6 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 151 | 3 | 0 | `frame @ src/core/presentationRunner.js` |
| 55 | 2 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-visuals: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 391 | 7 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 147 | 5 | 0 | `frame @ src/core/presentationRunner.js` |
| 57 | 2 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 19 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 17 | 3 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |
| 6 | 1 | 0 | `fire @ src/core/backgroundPost.js` |

### Long animation frames in loading: gpu-resources: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 321 | 20 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 67 | 11 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |
| 41 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 26 | 3 | 0 | `frame @ src/core/presentationRunner.js` |

### Long animation frames in loading: entering-flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 135 | 2 | 50 | `frame @ src/core/presentationRunner.js` |
| 65 | 1 | 25 | `Worker.onmessage @ src/core/simLaneMain.js` |

### Long animation frames in first seconds of flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 117 | 6 | 0 | `frame @ src/core/presentationRunner.js` |
| 12 | 2 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

## Fetched between Launch and flight

276 requests; 129.30 MB of bodies; 89.24 MB actually transferred. Delivery: 206 over the network, 27 revalidated (304), 43 straight from cache.

| type | requests | body MB | transferred MB |
|---|---:|---:|---:|
| glb | 112 | 117.06 | 78.65 |
| json | 150 | 10.51 | 8.86 |
| png | 11 | 1.72 | 1.73 |
| svg | 3 | 0.00 | 0.00 |

| largest bodies | MB | transferred MB | fetch ms |
|---|---:|---:|---:|
| `assets/ships/release/render-packages/helios-trade-hub/render.glb` | 5.36 | 0.00 | 197 |
| `assets/ships/release/render-packages/jump-ring/render.glb` | 3.51 | 0.00 | 150 |
| `assets/ships/release/render-packages/military/render.glb` | 3.00 | 0.00 | 142 |
| `assets/ships/release/render-packages/volatiles-tanker/render.glb` | 2.59 | 2.59 | 259 |
| `assets/ships/release/render-packages/helios-cradle-dmc/render.glb` | 2.52 | 2.52 | 340 |
| `assets/ships/release/render-packages/helios-cradle/render.glb` | 2.52 | 2.52 | 40 |
| `assets/ships/release/render-packages/rescue-lifter/render.glb` | 2.49 | 2.49 | 274 |
| `assets/ships/release/render-packages/yard-tug/render.glb` | 2.41 | 2.41 | 37 |
| `assets/ships/release/render-packages/helios-arclight/render.glb` | 2.36 | 2.36 | 309 |
| `assets/ships/release/render-packages/ore-barge/render.glb` | 2.31 | 2.31 | 299 |
| `assets/ships/release/render-packages/wasp-free-militia/render.glb` | 2.12 | 2.12 | 300 |
| `assets/ships/release/render-packages/wasp-mts-escort/render.glb` | 2.12 | 2.12 | 305 |
| `assets/ships/release/render-packages/wasp-quiet-ghost/render.glb` | 2.12 | 2.12 | 234 |
| `assets/ships/release/render-packages/wasp-scn-patrol/render.glb` | 2.12 | 2.12 | 27 |
| `assets/ships/release/render-packages/helios-span-reach/render.glb` | 2.07 | 2.07 | 299 |

## Renderer resources

| moment | programs | geometries | textures | JS heap MB |
|---|---:|---:|---:|---:|
| entering flight | 149 | 2395 | 140 | 850 |
| end of profile | 149 | 2398 | 140 | 1035 |

Dispose-registration probe renders: 1 at flight, 1 at end of profile (once per context generation is right).

## Draws that waited on a driver link

35 waits of 1 ms or more across 35 programs (1786 draw-path calls), 0.7 s on the main thread, longest 163 ms.

| shader family | waits (>= 1 ms) | total ms |
|---|---:|---:|
| MeshDepthMaterial | 2 | 196 |
| ShaderMaterial | 7 | 112 |
| MeshStandardMaterial | 4 | 65 |
| Material_Ceramic_ice | 2 | 37 |
| PointsMaterial | 1 | 31 |
| Material_Emissive_Amber_beacon | 1 | 25 |
| SpriteMaterial | 1 | 22 |
| Material_Emissive_Amber | 2 | 22 |
| SF_Shared_canopy_none_native | 2 | 22 |
| SF_Shared_mechanical_dark | 1 | 21 |
| Material_BrushedMetal | 1 | 19 |
| Material_Stone | 1 | 18 |

- 163 ms `MeshDepthMaterial` — at timedBlockingFirstUse (http://127.0.0.1:63051/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:63051/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:63051/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:63051/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:63051/src/render/bloom.js:1142:18) | at renderShadowCaster (http://127.0.0.1:63051/vendor/three.module.js:9860:15) | at http://127.0.0.1:63051/vendor/three.module.js:9814:42 | at eachShadowCaster (http://127.0.0.1:63051/vendor/three.module
- 33 ms `MeshDepthMaterial` — at timedBlockingFirstUse (http://127.0.0.1:63051/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:63051/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:63051/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:63051/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:63051/src/render/bloom.js:1142:18) | at renderShadowCaster (http://127.0.0.1:63051/vendor/three.module.js:9860:15) | at http://127.0.0.1:63051/vendor/three.module.js:9814:42 | at eachShadowCaster (http://127.0.0.1:63051/vendor/three.module
- 31 ms `PointsMaterial` — at timedBlockingFirstUse (http://127.0.0.1:63051/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:63051/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:63051/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:63051/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:63051/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:63051/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:63051/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:63051/vendor/three.
- 29 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:63051/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:63051/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:63051/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:63051/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:63051/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:63051/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:63051/vendor/three.module.js:18616:6) | at renderTransmissionPass (http://127.0.0.1:63051/ve
- 26 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:63051/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:63051/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:63051/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:63051/vendor/three.module.js:17387:20) | at renderObject (http://127.0.0.1:63051/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:63051/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:63051/vendor/three.module.js:18459:36) | at WebGLRenderer.render (http://127.0.0.1:63051/vendor/three.module.js:18024:6) | at SpaceB
- 25 ms `Material_Emissive_Amber_beacon` — at timedBlockingFirstUse (http://127.0.0.1:63051/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:63051/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:63051/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:63051/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:63051/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:63051/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:63051/vendor/three.module.js:18616:6) | at renderTransmissionPass (http://127.0.0.1:63051/ve
- 24 ms `MeshStandardMaterial` — at timedBlockingFirstUse (http://127.0.0.1:63051/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:63051/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:63051/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:63051/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:63051/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:63051/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:63051/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:63051/vendor/three.
- 22 ms `SpriteMaterial` — at timedBlockingFirstUse (http://127.0.0.1:63051/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:63051/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:63051/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:63051/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:63051/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:63051/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:63051/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:63051/vendor/three.

Opening work still pending when flight began: `381:missing:wreck`, `384:missing:payload`, `385:missing:payload`, `386:missing:payload`.

## Opening cook ledger

The opening cook began 2.9 s after Launch; flight began at 11.2 s. `t` is ms from the cook's start to the end of the step.

| step | ms | outcome | t ms | detail |
|---|---:|---|---:|---|
| opening.rockSurfaceLibrary | 0 | resolved | 1 |  |
| opening.firstPresentAdmission | 0 | resolved | 2 |  |
| opening.residency | 110 | resolved | 162 | subjects=87 textureRefs=31 textures=31 |
| opening.postResources | 3 | resolved | 166 | route=bloom |
| opening.capturedPipelineDrain | 783 | resolved | 949 | captured=38 stillPending=8 |
| opening.receipt | 5 | resolved | 954 |  |
| wait.prepareOpeningGpuResources | 954 | resolved | 954 |  |
| lane | 0 | sample | 1055 | queued=0 flushed=4 settled=75 upgradeJobs=1 upgradeInFlight=2 upgradeCompiling=2 meshBuilds=0 |
| live.meshBuilds1 | 0 | resolved | 1067 | queued=0 passes=0 built=0 buildMs=0 yields=0 left=0 |
| live.openingComposition | 391 | resolved | 1458 | pending=0 |
| live.upgradeQueueIdle | 391 | resolved | 1458 | pending=0 inFlight=0 compiling=false |
| live.pendingPipelines | 0 | skipped | 1458 | captured=0 |
| live.rocksAndLeftoverMeshes | 3 | resolved | 1461 | firstFlightEntities=47 |
| live.meshBuilds2 | 33 | resolved | 1495 | queued=8 passes=2 built=0 buildMs=0 yields=2 left=0 |
| cook.programs | 0 | resolved | 1550 | method=first-flight-hulls |
| cook.touchCompile | 191 | resolved | 1815 | issued=602 unlinked=0 yields=10 |
| lane | 0 | sample | 2021 | queued=0 flushed=1 settled=98 upgradeJobs=3 upgradeInFlight=2 upgradeCompiling=3 meshBuilds=0 |
| cook.touch | 582 | resolved | 2454 | subjects=602 firstPicture=94 touched=602 notReady=0 noProgram=0 switched=1 touchMs=200 maxTouchMs=3 yields=33 |
| lane | 0 | sample | 3075 | queued=0 flushed=0 settled=101 upgradeJobs=1 upgradeInFlight=2 upgradeCompiling=4 meshBuilds=0 |
| lane | 0 | sample | 4013 | queued=0 flushed=0 settled=103 upgradeJobs=0 upgradeInFlight=1 upgradeCompiling=3 meshBuilds=0 |
| cook.buffers | 2014 | resolved | 4562 | roots=94 textures=200 yields=37 |
| cook.layers | 245 | resolved | 4807 | roots=174 yields=48 |
| lane | 0 | sample | 5010 | queued=28 flushed=0 settled=116 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.crucibleWarm | 223 | resolved | 5038 | progress={"profile":"opening","records":43,"instantiated":43,"packageInstances":43,"paletteSubjects":402,"chunkPromotions":0,"shi |
| lane | 0 | sample | 6016 | queued=0 flushed=0 settled=144 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.rockPools | 880 | resolved | 6036 | roots=53 units=1966 issued=1966 issueDedupeSkips=1856 touched=1966 hiddenTouchSkips=1889 yields=9 issueMs=173 drainMs=638 touchMs=43 |
| live.cook | 4542 | resolved | 6037 |  |
| live.leftoverUpgradeIdle | 0 | resolved | 6037 | pending=0 inFlight=0 compiling=false |
| live.materialSettle | 639 | resolved | 6675 | unbound=400 names=Physical racing wakes/Next checkpoint/Draft pace beacon/Massline anchors and crossing refuges/L0-L2_deep-field-composite/L3_stars/L4_flares/DeepField_helios-ecliptic-dust/DeepField_helios-left-drift/DeepField_helios-outer-shepherd/DeepFieldStructure_helios-derelict-hauler/DeepFieldStructure_helios-relay-mast |
| live.postOpeningPipelines | 357 | resolved | 7076 |  |
| lane | 0 | sample | 7091 | queued=0 flushed=0 settled=144 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| live.parkWarmRoots | 105 | resolved | 7180 | roots=1 nodes=129 stampedGeometries=704 |
| live.firstFramePoolCensus | 548 | resolved | 7223 |  |
| live.finalPipelineSeal | 0 | resolved | 7223 | queuedPipelines=0 |
| wait.prepareLiveSectorBeforeFlight | 6384 | resolved | 7339 |  |
| opening.compositionTail | 1 | resolved | 7340 |  |

## Top-level entry points (inclusive)

The owner of the frame. Anything here that is not the game's own presentation frame is work
the in-engine hitch classifier cannot see.

| ms | share | entry |
|---:|---:|---|
| 4838.2 | 31.0% | `(program) @ native:0` |
| 3052.8 | 19.6% | `frame @ src/core/presentationRunner.js:1060` |
| 1442.9 | 9.2% | `(idle) @ native:0` |
| 554.2 | 3.6% | `(anonymous) @ src/render/renderer.js:12852` |
| 476.9 | 3.1% | `state.render.cookLiveSceneGpu @ src/render/renderer.js:15830` |
| 374.0 | 2.4% | `fire @ src/render/compilePresentSlice.js:361` |
| 333.7 | 2.1% | `touchExactTargetSubjects @ src/render/renderer.js:12132` |
| 310.7 | 2.0% | `enqueueGeometryResidencyBatches.urgent @ src/render/startupGpuResidency.js:764` |
| 270.7 | 1.7% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 263.0 | 1.7% | `(garbage collector) @ native:0` |
| 249.0 | 1.6% | `buildComposedShipAsync @ src/render/partsLibrary.js:11436` |
| 217.9 | 1.4% | `buildExemplars @ src/render/renderer.js:21571` |

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
