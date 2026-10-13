# Launch-to-flight main-thread profile

Profile: kept evidence profile `probe-keep-oct13f-000000` (reused: warm GPU program and HTTP caches). New Game seed 47.

**Launch click to flight: 12.0 s.** New Game click to flight: 12.3 s. The profile continues 30.3 s into held-thrust flight.

## Where the time went, by phase

Busy is sampled main-thread time that is not idle. `(program)` is native work outside JavaScript
(Blink, GPU command submission, compositor hand-off). A phase that is mostly idle is waiting on
something off the main thread: driver shader compiles, network, decoding workers, timers.

| phase | wall s | busy s | JS s | (program) s | idle s | GC s | long tasks (n / ms) |
|---|---:|---:|---:|---:|---:|---:|---|
| New Game screen (to Launch click) | 0.24 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 1 / 100 |
| Launch click to first loading stage | 0.57 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 1 / 161 |
| loading: authored-library | 0.69 | 1.46 | 0.24 | 1.22 | 0.05 | 0.00 | 2 / 262 |
| loading: authored-visuals | 1.75 | 1.70 | 1.45 | 0.23 | 0.05 | 0.02 | 2 / 149 |
| loading: render-pipelines | 0.11 | 0.11 | 0.09 | 0.02 | 0.00 | 0.00 | 0 / 0 |
| loading: gpu-resources | 8.51 | 7.66 | 5.09 | 2.39 | 0.85 | 0.17 | 1 / 55 |
| loading: physics-authority | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0 / 0 |
| loading: entering-flight | 0.41 | 0.36 | 0.28 | 0.07 | 0.05 | 0.00 | 2 / 174 |
| first seconds of flight | 30.26 | 29.12 | 19.81 | 9.19 | 1.14 | 0.12 | 17 / 933 |

## Launch click to first loading stage — 0.57 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|

### Self time by source

| ms | share | source |
|---:|---:|---|

## loading: authored-library — 0.69 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 1223.7 | 81.2% | `(program) @ native:0` |
| 39.8 | 2.6% | `getBoundingClientRect @ native:0` |
| 22.0 | 1.5% | `get offsetHeight @ native:0` |
| 13.4 | 0.9% | `setLaunching @ src/ui/screens/newGame.js:846` |
| 9.1 | 0.6% | `fetch @ native:0` |
| 9.1 | 0.6% | `focus @ native:0` |
| 9.1 | 0.6% | `getBoundingClientRect @ native:0` |
| 9.0 | 0.6% | `getBoundingClientRect @ native:0` |
| 9.0 | 0.6% | `loadResolved @ src/render/renderPackageLoader.js:107` |
| 8.9 | 0.6% | `getBoundingClientRect @ native:0` |
| 8.7 | 0.6% | `getBoundingClientRect @ native:0` |
| 8.7 | 0.6% | `getBoundingClientRect @ native:0` |
| 8.7 | 0.6% | `getBoundingClientRect @ native:0` |
| 4.7 | 0.3% | `(anonymous) @ src/ui/bootVisualizer.js:77` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 1223.7 | 81.2% | `(program)` |
| 150.7 | 10.0% | `(native)` |
| 47.0 | 3.1% | `(idle)` |
| 17.2 | 1.1% | `vendor/three.module.js` |
| 13.4 | 0.9% | `src/ui/screens/newGame.js` |
| 11.3 | 0.7% | `src/render/renderPackageLoader.js` |
| 4.7 | 0.3% | `src/ui/bootVisualizer.js` |
| 4.6 | 0.3% | `src/ui/screenManager.js` |
| 4.6 | 0.3% | `src/render/packageCpuDetach.js` |
| 4.6 | 0.3% | `src/core/eventBus.js` |

## loading: authored-visuals — 1.75 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 228.2 | 13.1% | `(program) @ native:0` |
| 130.9 | 7.5% | `_createStars @ src/render/spaceBackground.js:2081` |
| 75.6 | 4.3% | `getProgramParameter @ native:0` |
| 58.5 | 3.4% | `texSubImage2D @ native:0` |
| 37.8 | 2.2% | `getProgramParameter @ native:0` |
| 30.8 | 1.8% | `(anonymous) @ src/render/visualFactory.js:4942` |
| 18.9 | 1.1% | `makeHullNormalMap @ src/render/canvasTextures.js:402` |
| 18.4 | 1.1% | `(garbage collector) @ native:0` |
| 18.2 | 1.0% | `querySelector @ native:0` |
| 15.9 | 0.9% | `makeNoiseTexture @ src/render/canvasTextures.js:91` |
| 13.5 | 0.8% | `getProgramParameter @ native:0` |
| 13.4 | 0.8% | `(anonymous) @ src/render/spaceBackground.js:97` |
| 13.4 | 0.8% | `(anonymous) @ src/render/visualFactory.js:605` |
| 12.2 | 0.7% | `makeHullNormalMap @ src/render/canvasTextures.js:402` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 332.6 | 19.0% | `vendor/three.core.js` |
| 266.1 | 15.2% | `(native)` |
| 228.2 | 13.1% | `(program)` |
| 149.7 | 8.6% | `src/render/spaceBackground.js` |
| 102.8 | 5.9% | `src/render/visualFactory.js` |
| 70.3 | 4.0% | `vendor/addons/loaders/GLTFLoader.js` |
| 58.9 | 3.4% | `src/render/canvasTextures.js` |
| 56.0 | 3.2% | `src/render/partsLibrary.js` |
| 51.9 | 3.0% | `src/render/renderer.js` |
| 50.3 | 2.9% | `(idle)` |

## loading: gpu-resources — 8.51 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 2391.4 | 28.1% | `(program) @ native:0` |
| 171.3 | 2.0% | `(garbage collector) @ native:0` |
| 112.2 | 1.3% | `getProgramParameter @ native:0` |
| 71.5 | 0.8% | `get body @ vendor/addons/loaders/GLTFLoader.js:1927` |
| 70.5 | 0.8% | `syncEntityViewsSteps @ src/render/renderer.js:26802` |
| 60.4 | 0.7% | `texSubImage2D @ native:0` |
| 52.7 | 0.6% | `convertBufferAttribute @ vendor/three.core.js:19219` |
| 40.9 | 0.5% | `enqueueGeometryResidencyBatches.urgent @ src/render/startupGpuResidency.js:764` |
| 35.5 | 0.4% | `computePlainFloat32Bounds @ src/render/packageCpuDetach.js:324` |
| 35.3 | 0.4% | `convertBufferAttribute @ vendor/three.core.js:19219` |
| 33.3 | 0.4% | `releaseStatesOfObject @ vendor/three.module.js:2387` |
| 31.8 | 0.4% | `parse @ vendor/addons/loaders/GLTFLoader.js:429` |
| 22.8 | 0.3% | `traverseVisible @ vendor/three.core.js:12780` |
| 22.8 | 0.3% | `fetch @ native:0` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 2391.4 | 28.1% | `(program)` |
| 1056.5 | 12.4% | `vendor/three.core.js` |
| 848.8 | 10.0% | `(idle)` |
| 654.3 | 7.7% | `(native)` |
| 558.3 | 6.6% | `vendor/three.module.js` |
| 313.1 | 3.7% | `src/render/renderer.js` |
| 225.5 | 2.7% | `vendor/addons/loaders/GLTFLoader.js` |
| 197.6 | 2.3% | `src/render/partsLibrary.js` |
| 171.3 | 2.0% | `(garbage collector)` |
| 150.4 | 1.8% | `src/render/startupGpuResidency.js` |

## loading: entering-flight — 0.41 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 67.9 | 16.7% | `(program) @ native:0` |
| 37.4 | 9.2% | `withOnlySubjectsDrawable @ src/render/openingGpuAdmission.js:549` |
| 30.6 | 7.5% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:597` |
| 17.4 | 4.3% | `syncEntityViewsSteps @ src/render/renderer.js:26802` |
| 9.1 | 2.2% | `projectObject @ vendor/three.module.js:18323` |
| 8.7 | 2.1% | `getProgram @ vendor/three.module.js:18700` |
| 7.7 | 1.9% | `deriveCensus @ src/render/renderer.js:18043` |
| 4.7 | 1.1% | `projectObject @ vendor/three.module.js:18323` |
| 4.6 | 1.1% | `update @ vendor/three.module.js:4908` |
| 4.6 | 1.1% | `(garbage collector) @ native:0` |
| 4.6 | 1.1% | `_sleepNpcJobSignatures @ src/render/vfx.js:7382` |
| 4.6 | 1.1% | `classifyWorld @ src/world/activityRuntime.js:1568` |
| 4.6 | 1.1% | `traverseVisible @ vendor/three.core.js:12780` |
| 4.6 | 1.1% | `(anonymous) @ src/render/renderer.js:27950` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 72.1 | 17.7% | `src/render/openingGpuAdmission.js` |
| 67.9 | 16.7% | `(program)` |
| 67.5 | 16.6% | `src/render/renderer.js` |
| 55.6 | 13.7% | `vendor/three.module.js` |
| 51.3 | 12.6% | `(idle)` |
| 30.2 | 7.4% | `vendor/three.core.js` |
| 8.7 | 2.1% | `src/world/activityRuntime.js` |
| 8.6 | 2.1% | `(native)` |
| 6.4 | 1.6% | `src/render/startupGpuResidency.js` |
| 4.6 | 1.1% | `(garbage collector)` |

## first seconds of flight — 30.26 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 9189.3 | 30.4% | `(program) @ native:0` |
| 332.9 | 1.1% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 286.0 | 0.9% | `upload @ vendor/three.module.js:6425` |
| 258.9 | 0.9% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |
| 251.6 | 0.8% | `classifyWorld @ src/world/activityRuntime.js:1568` |
| 248.0 | 0.8% | `WebGLRenderer.renderBufferDirect @ vendor/three.module.js:17381` |
| 203.7 | 0.7% | `setProgram @ vendor/three.module.js:18879` |
| 199.6 | 0.7% | `syncEntityViewsSteps @ src/render/renderer.js:26802` |
| 171.7 | 0.6% | `sfTransformSignatureClean @ vendor/three.module.js:116` |
| 168.8 | 0.6% | `refreshUniformsCommon @ vendor/three.module.js:15342` |
| 167.1 | 0.6% | `bindVertexArray @ native:0` |
| 153.4 | 0.5% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |
| 152.5 | 0.5% | `now @ src/render/renderer.js:4156` |
| 143.2 | 0.5% | `unreadyDrawGuard @ src/render/bloom.js:1091` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 9189.3 | 30.4% | `(program)` |
| 5744.9 | 19.0% | `vendor/three.module.js` |
| 2012.7 | 6.7% | `vendor/three.core.js` |
| 1926.1 | 6.4% | `(native)` |
| 1289.7 | 4.3% | `src/render/renderer.js` |
| 1137.0 | 3.8% | `(idle)` |
| 690.0 | 2.3% | `src/world/activityRuntime.js` |
| 663.9 | 2.2% | `src/render/vfx.js` |
| 551.8 | 1.8% | `src/render/packageCpuDetach.js` |
| 534.5 | 1.8% | `src/core/simLaneMain.js` |

## Long tasks from New Game to the end of the profile

| at s (after Launch) | duration ms | during |
|---:|---:|---|
| -0.2 | 100 | New Game screen (to Launch click) |
| 0.4 | 161 | Launch click to first loading stage |
| 0.6 | 72 | loading: authored-library |
| 1.0 | 190 | loading: authored-library |
| 1.6 | 99 | loading: authored-visuals |
| 1.7 | 50 | loading: authored-visuals |
| 3.2 | 55 | loading: gpu-resources |
| 11.9 | 65 | loading: entering-flight |
| 11.9 | 109 | loading: entering-flight |
| 12.2 | 53 | first seconds of flight |
| 12.6 | 52 | first seconds of flight |
| 13.2 | 50 | first seconds of flight |
| 18.3 | 51 | first seconds of flight |
| 21.2 | 53 | first seconds of flight |
| 21.7 | 50 | first seconds of flight |
| 23.6 | 52 | first seconds of flight |
| 23.7 | 69 | first seconds of flight |
| 23.9 | 56 | first seconds of flight |
| 23.9 | 70 | first seconds of flight |
| 24.0 | 63 | first seconds of flight |
| 24.2 | 53 | first seconds of flight |
| 24.3 | 53 | first seconds of flight |
| 24.6 | 51 | first seconds of flight |
| 24.7 | 50 | first seconds of flight |
| 24.8 | 50 | first seconds of flight |
| 41.3 | 57 | first seconds of flight |

## Loading-screen smoothness (what the player sees)

Frame gaps are the page's own requestAnimationFrame cadence; stall ms is time beyond one 60 Hz frame. The
boot ring and the backdrop video render off the main thread, so a stall here is the DOM/labels/progress
freezing while they keep moving. Long animation frames (LoAF) name the scripts that held the frame.

| window | fps | frames | p50 ms | p95 ms | worst ms | >33 | >50 | >100 | stall ms | LoAF n / blocking ms | video dropped / played |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| New Game screen (to Launch click) | 16.6 | 4 | 17.0 | 150.0 | 150 | 1 | 1 | 1 | 134 | 1 / 96 | 0 / 0 |
| Launch click to first loading stage | 17.5 | 10 | 16.7 | 250.0 | 250 | 1 | 1 | 1 | 268 | 2 / 179 | 0 / 1 |
| loading: authored-library | 5.8 | 4 | 150.1 | 300.4 | 300 | 3 | 3 | 3 | 517 | 4 / 244 | 0 / 0 |
| loading: authored-visuals | 22.8 | 40 | 33.3 | 133.4 | 167 | 14 | 11 | 4 | 1050 | 9 / 244 | 2 / 36 |
| loading: render-pipelines | 37.0 | 4 | 16.7 | 16.7 | 17 | 0 | 0 | 0 | 0 | 1 / 10 | 0 / 0 |
| loading: gpu-resources | 45.6 | 388 | 16.7 | 50.0 | 117 | 22 | 19 | 6 | 1952 | 19 / 64 | 2 / 223 |
| loading: physics-authority | 1000.0 | 1 | 0.0 | 0.0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 0 / 0 |
| loading: entering-flight | 37.0 | 15 | 16.7 | 150.0 | 150 | 1 | 1 | 1 | 133 | 2 / 121 | 0 / 0 |
| first seconds of flight | 39.3 | 1190 | 16.7 | 50.0 | 150 | 152 | 79 | 2 | 10367 | 41 / 273 | 1 / 14 |

### Long animation frames in New Game screen (to Launch click): who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 93 | 1 | 82 | `BUTTON.onclick @ src/ui/kit/dom.js` |
| 19 | 2 | 18 | `ResizeObserverCallback @ src/ui/orrery/stopDial.js` |
| 10 | 1 | 9 | `ResizeObserverCallback @ src/ui/orrery/hullRing.js` |
| 6 | 1 | 6 | `ResizeObserverCallback @ src/ui/orrery/lampKey.js` |

### Long animation frames in Launch click to first loading stage: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 161 | 1 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 34 | 1 | 0 | `FrameRequestCallback @ src/render/partsLibrary.js` |
| 29 | 1 | 0 | `frame @ src/core/presentationRunner.js` |
| 6 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-library: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 236 | 4 | 0 | `frame @ src/core/presentationRunner.js` |
| 216 | 7 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 81 | 4 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-visuals: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 283 | 9 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 210 | 8 | 0 | `frame @ src/core/presentationRunner.js` |
| 125 | 5 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 18 | 3 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |
| 18 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |

### Long animation frames in loading: render-pipelines: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 73 | 3 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 5 | 1 | 0 | `fire @ src/core/backgroundPost.js` |

### Long animation frames in loading: gpu-resources: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 286 | 20 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 133 | 3 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 113 | 16 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |
| 79 | 6 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 50 | 6 | 0 | `frame @ src/core/presentationRunner.js` |

### Long animation frames in loading: entering-flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 129 | 2 | 48 | `frame @ src/core/presentationRunner.js` |
| 78 | 2 | 23 | `Worker.onmessage @ src/core/simLaneMain.js` |

### Long animation frames in first seconds of flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 1308 | 41 | 0 | `frame @ src/core/presentationRunner.js` |
| 176 | 5 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 132 | 6 | 2 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 85 | 8 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

## Flight cadence by two-second bucket

| seconds into flight | fps | p95 ms | worst ms | frames > 50 ms |
|---|---:|---:|---:|---:|
| 0-2 | 23.0 | 66.7 | 83 | 14 |
| 2-4 | 31.5 | 50.0 | 50 | 2 |
| 4-6 | 33.0 | 49.4 | 50 | 3 |
| 6-8 | 28.0 | 66.6 | 67 | 6 |
| 8-10 | 26.0 | 66.6 | 67 | 10 |
| 10-12 | 22.0 | 66.6 | 133 | 13 |
| 12-14 | 22.5 | 83.3 | 100 | 19 |
| 14-16 | 36.0 | 50.0 | 83 | 5 |
| 16-18 | 47.5 | 33.4 | 66 | 2 |
| 18-20 | 52.5 | 33.4 | 34 | 0 |
| 20-22 | 51.0 | 33.3 | 33 | 0 |
| 22-24 | 44.5 | 33.4 | 67 | 1 |
| 24-26 | 57.0 | 33.3 | 33 | 0 |
| 26-28 | 59.5 | 16.8 | 33 | 0 |
| 28-30 | 55.5 | 16.7 | 150 | 1 |
| 30-32 | 42.6 | 66.7 | 67 | 1 |

## Fetched between Launch and flight

297 requests; 137.11 MB of bodies; 89.15 MB actually transferred. Delivery: 204 over the network, 46 revalidated (304), 47 straight from cache.

| type | requests | body MB | transferred MB |
|---|---:|---:|---:|
| glb | 115 | 123.46 | 78.61 |
| json | 168 | 11.93 | 8.82 |
| png | 11 | 1.72 | 1.73 |
| svg | 3 | 0.00 | 0.00 |

| largest bodies | MB | transferred MB | fetch ms |
|---|---:|---:|---:|
| `assets/ships/release/render-packages/helios-trade-hub/render.glb` | 5.36 | 0.00 | 82 |
| `assets/ships/release/render-packages/jump-ring/render.glb` | 3.51 | 0.00 | 47 |
| `assets/ships/release/render-packages/military/render.glb` | 3.00 | 0.00 | 46 |
| `assets/ships/release/render-packages/volatiles-tanker/render.glb` | 2.59 | 2.59 | 420 |
| `assets/ships/release/render-packages/helios-cradle-dmc/render.glb` | 2.52 | 2.52 | 414 |
| `assets/ships/release/render-packages/helios-cradle/render.glb` | 2.52 | 2.52 | 42 |
| `assets/ships/release/render-packages/rescue-lifter/render.glb` | 2.49 | 2.49 | 417 |
| `assets/ships/release/render-packages/yard-tug/render.glb` | 2.41 | 2.41 | 41 |
| `assets/ships/release/render-packages/helios-arclight/render.glb` | 2.36 | 2.36 | 455 |
| `assets/ships/release/render-packages/ore-barge/render.glb` | 2.31 | 2.31 | 462 |
| `assets/ships/release/render-packages/wasp-free-militia/render.glb` | 2.12 | 2.12 | 468 |
| `assets/ships/release/render-packages/wasp-mts-escort/render.glb` | 2.12 | 2.12 | 481 |
| `assets/ships/release/render-packages/wasp-quiet-ghost/render.glb` | 2.12 | 2.12 | 323 |
| `assets/ships/release/render-packages/wasp-scn-patrol/render.glb` | 2.12 | 2.12 | 40 |
| `assets/ships/release/render-packages/helios-span-reach/render.glb` | 2.07 | 2.07 | 377 |

## Renderer resources

| moment | programs | geometries | textures | JS heap MB |
|---|---:|---:|---:|---:|
| entering flight | 149 | 2357 | 129 | 805 |
| end of profile | 148 | 2356 | 129 | 914 |

Dispose-registration probe renders: 1 at flight, 1 at end of profile (once per context generation is right).

## Draws that waited on a driver link

35 waits of 1 ms or more across 35 programs (1794 draw-path calls), 0.6 s on the main thread, longest 58 ms.

| shader family | waits (>= 1 ms) | total ms |
|---|---:|---:|
| ShaderMaterial | 7 | 117 |
| MeshStandardMaterial | 5 | 83 |
| Material_Emissive_Amber | 2 | 66 |
| MeshDepthMaterial | 2 | 48 |
| BackgroundCubeMaterial | 1 | 39 |
| Material_Ceramic_ice | 2 | 24 |
| SF_Shared_canopy_none_native | 2 | 24 |
| SF_Shared_mechanical_dark | 1 | 24 |
| MeshBasicMaterial | 2 | 22 |
| SphericalGaussianBlur | 1 | 19 |
| Material_Warning | 1 | 19 |
| Material_Emissive_Amber_beacon | 1 | 17 |

- 58 ms `Material_Emissive_Amber` — at timedBlockingFirstUse (http://127.0.0.1:60222/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:60222/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:60222/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:60222/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:60222/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:60222/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:60222/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:60222/vendor/three.
- 41 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:60222/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:60222/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:60222/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:60222/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:60222/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:60222/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:60222/vendor/three.module.js:18616:6) | at renderTransmissionPass (http://127.0.0.1:60222/ve
- 39 ms `BackgroundCubeMaterial` — at timedBlockingFirstUse (http://127.0.0.1:60222/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:60222/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:60222/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:60222/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:60222/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:60222/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:60222/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:60222/vendor/three.
- 29 ms `MeshDepthMaterial` — at timedBlockingFirstUse (http://127.0.0.1:60222/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:60222/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:60222/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:60222/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:60222/src/render/bloom.js:1142:18) | at renderShadowCaster (http://127.0.0.1:60222/vendor/three.module.js:9860:15) | at http://127.0.0.1:60222/vendor/three.module.js:9814:42 | at eachShadowCaster (http://127.0.0.1:60222/vendor/three.module
- 27 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:60222/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:60222/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:60222/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:60222/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:60222/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:60222/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:60222/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:60222/vendor/three.
- 24 ms `SF_Shared_mechanical_dark` — at timedBlockingFirstUse (http://127.0.0.1:60222/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:60222/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:60222/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:60222/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:60222/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:60222/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:60222/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:60222/vendor/three.
- 23 ms `MeshStandardMaterial` — at timedBlockingFirstUse (http://127.0.0.1:60222/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:60222/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:60222/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:60222/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:60222/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:60222/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:60222/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:60222/vendor/three.
- 19 ms `MeshDepthMaterial` — at timedBlockingFirstUse (http://127.0.0.1:60222/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:60222/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:60222/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:60222/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:60222/src/render/bloom.js:1142:18) | at renderShadowCaster (http://127.0.0.1:60222/vendor/three.module.js:9860:15) | at http://127.0.0.1:60222/vendor/three.module.js:9814:42 | at eachShadowCaster (http://127.0.0.1:60222/vendor/three.module

Opening work still pending when flight began: `387:missing:wreck`, `390:missing:payload`, `391:missing:payload`, `392:missing:payload`.

## Opening cook ledger

The opening cook began 3.1 s after Launch; flight began at 12.0 s. `t` is ms from the cook's start to the end of the step.

| step | ms | outcome | t ms | detail |
|---|---:|---|---:|---|
| opening.rockSurfaceLibrary | 0 | resolved | 1 |  |
| opening.firstPresentAdmission | 0 | resolved | 1 |  |
| opening.residency | 370 | resolved | 438 | subjects=86 textureRefs=31 textures=31 |
| opening.postResources | 6 | resolved | 444 | route=bloom |
| opening.capturedPipelineDrain | 70 | resolved | 514 | captured=10 stillPending=0 |
| opening.receipt | 10 | resolved | 525 |  |
| wait.prepareOpeningGpuResources | 525 | resolved | 525 |  |
| live.meshBuilds1 | 0 | resolved | 683 | queued=0 passes=0 built=0 buildMs=0 yields=0 left=0 |
| lane | 0 | sample | 1028 | queued=1 flushed=1 settled=73 upgradeJobs=5 upgradeInFlight=2 upgradeCompiling=5 meshBuilds=0 |
| live.openingComposition | 1228 | resolved | 1911 | pending=0 |
| live.upgradeQueueIdle | 1228 | resolved | 1911 | pending=0 inFlight=0 compiling=false |
| live.pendingPipelines | 0 | skipped | 1911 | captured=0 |
| live.rocksAndLeftoverMeshes | 3 | resolved | 1914 | firstFlightEntities=47 |
| live.meshBuilds2 | 34 | resolved | 1947 | queued=8 passes=2 built=0 buildMs=0 yields=2 left=0 |
| cook.programs | 0 | resolved | 1995 | method=first-flight-hulls |
| lane | 0 | sample | 2048 | queued=12 flushed=1 settled=84 upgradeJobs=4 upgradeInFlight=2 upgradeCompiling=2 meshBuilds=0 |
| cook.touchCompile | 156 | resolved | 2214 | issued=588 unlinked=0 yields=8 |
| cook.touch | 635 | resolved | 2913 | subjects=588 firstPicture=94 touched=588 notReady=0 noProgram=0 switched=1 touchMs=222 maxTouchMs=2 yields=34 |
| lane | 0 | sample | 3028 | queued=0 flushed=0 settled=101 upgradeJobs=1 upgradeInFlight=2 upgradeCompiling=4 meshBuilds=0 |
| lane | 0 | sample | 4029 | queued=0 flushed=0 settled=103 upgradeJobs=0 upgradeInFlight=1 upgradeCompiling=5 meshBuilds=0 |
| lane | 0 | sample | 5029 | queued=0 flushed=0 settled=103 upgradeJobs=0 upgradeInFlight=1 upgradeCompiling=4 meshBuilds=0 |
| cook.buffers | 2531 | resolved | 5535 | roots=94 textures=203 yields=31 |
| cook.layers | 262 | resolved | 5797 | roots=174 yields=43 |
| lane | 0 | sample | 6023 | queued=27 flushed=1 settled=116 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.crucibleWarm | 228 | resolved | 6031 | progress={"profile":"opening","records":40,"instantiated":40,"packageInstances":40,"paletteSubjects":313,"chunkPromotions":0,"shi |
| lane | 0 | sample | 7002 | queued=0 flushed=17 settled=127 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.rockPools | 940 | resolved | 7136 | roots=53 units=1862 issued=1862 issueDedupeSkips=1763 touched=1862 hiddenTouchSkips=1788 yields=8 issueMs=186 drainMs=677 touchMs=51 |
| live.cook | 5189 | resolved | 7136 |  |
| live.leftoverUpgradeIdle | 0 | resolved | 7136 | pending=0 inFlight=0 compiling=false |
| live.materialSettle | 698 | resolved | 7834 | unbound=600 names=Physical racing wakes/Next checkpoint/Draft pace beacon/Massline anchors and crossing refuges/L6_comet/L0-L2_deep-field-composite/L3_stars/L4_flares/DeepField_helios-ecliptic-dust/DeepField_helios-left-drift/DeepField_helios-outer-shepherd/DeepFieldStructure_helios-derelict-hauler |
| live.postOpeningPipelines | 393 | resolved | 8261 |  |
| lane | 0 | sample | 8276 | queued=0 flushed=0 settled=144 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| live.parkWarmRoots | 103 | resolved | 8364 | roots=1 nodes=129 stampedGeometries=663 |
| live.firstFramePoolCensus | 568 | resolved | 8402 |  |
| live.finalPipelineSeal | 0 | resolved | 8402 | queuedPipelines=0 |
| wait.prepareLiveSectorBeforeFlight | 7977 | resolved | 8502 |  |
| opening.compositionTail | 1 | resolved | 8504 |  |

## Top-level entry points (inclusive)

The owner of the frame. Anything here that is not the game's own presentation frame is work
the in-engine hitch classifier cannot see.

| ms | share | entry |
|---:|---:|---|
| 17927.4 | 41.3% | `frame @ src/core/presentationRunner.js:1060` |
| 13475.1 | 31.0% | `(program) @ native:0` |
| 2241.7 | 5.2% | `(idle) @ native:0` |
| 1206.8 | 2.8% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 635.2 | 1.5% | `fire @ src/render/compilePresentSlice.js:361` |
| 542.3 | 1.2% | `enqueueGeometryResidencyBatches.urgent @ src/render/startupGpuResidency.js:764` |
| 449.9 | 1.0% | `state.render.cookLiveSceneGpu @ src/render/renderer.js:15830` |
| 406.5 | 0.9% | `upgradeBoundary @ src/render/partsLibrary.js:9162` |
| 382.9 | 0.9% | `compileSubjectColorAndDepth @ src/render/renderer.js:12116` |
| 382.2 | 0.9% | `buildComposedShipAsync @ src/render/partsLibrary.js:11436` |
| 361.3 | 0.8% | `touchExactTargetSubjects @ src/render/renderer.js:12132` |
| 350.3 | 0.8% | `(garbage collector) @ native:0` |

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
