# Launch-to-flight main-thread profile

Profile: kept evidence profile `probe-keep-oct13f-000000` (reused: warm GPU program and HTTP caches). New Game seed 47.

**Launch click to flight: 12.3 s.** New Game click to flight: 12.6 s. The profile continues 30.2 s into held-thrust flight.

## Where the time went, by phase

Busy is sampled main-thread time that is not idle. `(program)` is native work outside JavaScript
(Blink, GPU command submission, compositor hand-off). A phase that is mostly idle is waiting on
something off the main thread: driver shader compiles, network, decoding workers, timers.

| phase | wall s | busy s | JS s | (program) s | idle s | GC s | long tasks (n / ms) |
|---|---:|---:|---:|---:|---:|---:|---|
| New Game screen (to Launch click) | 0.30 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 2 / 173 |
| Launch click to first loading stage | 0.89 | 1.19 | 0.16 | 1.03 | 0.00 | 0.00 | 2 / 575 |
| loading: authored-library | 0.41 | 0.38 | 0.10 | 0.28 | 0.03 | 0.00 | 1 / 99 |
| loading: authored-visuals | 1.75 | 1.68 | 1.52 | 0.14 | 0.08 | 0.02 | 1 / 94 |
| loading: render-pipelines | 0.15 | 0.15 | 0.10 | 0.05 | 0.00 | 0.00 | 0 / 0 |
| loading: gpu-resources | 8.42 | 7.56 | 4.94 | 2.42 | 0.86 | 0.19 | 0 / 0 |
| loading: physics-authority | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0 / 0 |
| loading: entering-flight | 0.69 | 0.61 | 0.50 | 0.10 | 0.07 | 0.01 | 3 / 246 |
| first seconds of flight | 30.19 | 27.42 | 19.60 | 7.75 | 2.77 | 0.07 | 0 / 0 |

## Launch click to first loading stage — 0.89 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 1034.4 | 86.8% | `(program) @ native:0` |
| 49.2 | 4.1% | `getBoundingClientRect @ native:0` |
| 13.7 | 1.1% | `focus @ native:0` |
| 9.1 | 0.8% | `getBoundingClientRect @ native:0` |
| 9.1 | 0.8% | `get offsetHeight @ native:0` |
| 9.1 | 0.8% | `getBoundingClientRect @ native:0` |
| 9.0 | 0.8% | `getBoundingClientRect @ native:0` |
| 4.6 | 0.4% | `getBoundingClientRect @ native:0` |
| 4.6 | 0.4% | `ring @ src/ui/orrery/yardCarousel.js:110` |
| 4.6 | 0.4% | `getProgram @ vendor/three.module.js:18700` |
| 4.6 | 0.4% | `setProgram @ vendor/three.module.js:18879` |
| 4.5 | 0.4% | `(anonymous) @ src/ui/orrery/hullRing.js:84` |
| 4.5 | 0.4% | `get @ vendor/three.module.js:8300` |
| 4.5 | 0.4% | `getProgramCacheKey @ vendor/three.module.js:8004` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 1034.4 | 86.8% | `(program)` |
| 112.7 | 9.5% | `(native)` |
| 26.9 | 2.3% | `vendor/three.module.js` |
| 4.6 | 0.4% | `src/ui/orrery/yardCarousel.js` |
| 4.5 | 0.4% | `src/ui/orrery/hullRing.js` |
| 4.4 | 0.4% | `src/ui/screens/newGame.js` |
| 3.0 | 0.3% | `src/render/packageCpuDetach.js` |
| 1.6 | 0.1% | `src/systems/mobile/laneTouchSurface.js` |

## loading: authored-library — 0.41 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 277.5 | 68.1% | `(program) @ native:0` |
| 17.4 | 4.3% | `fetch @ native:0` |
| 9.4 | 2.3% | `getBoundingClientRect @ native:0` |
| 9.1 | 2.2% | `setLaunching @ src/ui/screens/newGame.js:846` |
| 4.8 | 1.2% | `getBoundingClientRect @ native:0` |
| 4.7 | 1.2% | `(anonymous) @ src/ui/introSignalRemixBoot.js:100` |
| 4.6 | 1.1% | `validateRecords @ src/contracts/renderPackage.js:512` |
| 4.5 | 1.1% | `remove @ native:0` |
| 4.5 | 1.1% | `frame @ src/core/presentationRunner.js:1060` |
| 4.5 | 1.1% | `drive @ src/systems/mobile/laneTouchSurface.js:77` |
| 4.5 | 1.1% | `play @ native:0` |
| 4.5 | 1.1% | `loadResolved @ src/render/renderPackageLoader.js:107` |
| 4.5 | 1.1% | `addEventListener @ native:0` |
| 4.5 | 1.1% | `get offsetHeight @ native:0` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 277.5 | 68.1% | `(program)` |
| 58.4 | 14.3% | `(native)` |
| 29.6 | 7.3% | `(idle)` |
| 13.6 | 3.3% | `src/ui/screens/newGame.js` |
| 4.7 | 1.2% | `src/ui/introSignalRemixBoot.js` |
| 4.6 | 1.1% | `src/contracts/renderPackage.js` |
| 4.5 | 1.1% | `src/core/presentationRunner.js` |
| 4.5 | 1.1% | `src/systems/mobile/laneTouchSurface.js` |
| 4.5 | 1.1% | `src/render/renderPackageLoader.js` |
| 3.2 | 0.8% | `scripts/lib/simCommandChannel.mjs` |

## loading: authored-visuals — 1.75 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 195.3 | 11.1% | `texSubImage2D @ native:0` |
| 138.2 | 7.9% | `(program) @ native:0` |
| 98.7 | 5.6% | `getProgramParameter @ native:0` |
| 78.3 | 4.5% | `_createStars @ src/render/spaceBackground.js:2081` |
| 36.9 | 2.1% | `(anonymous) @ src/render/visualFactory.js:4942` |
| 25.5 | 1.5% | `getProgramParameter @ native:0` |
| 21.2 | 1.2% | `makeNoiseTexture @ src/render/canvasTextures.js:91` |
| 18.9 | 1.1% | `(garbage collector) @ native:0` |
| 13.6 | 0.8% | `(anonymous) @ src/render/spaceBackground.js:97` |
| 13.4 | 0.8% | `parse @ vendor/addons/loaders/GLTFLoader.js:429` |
| 13.2 | 0.8% | `convertBufferAttribute @ vendor/three.core.js:19219` |
| 11.1 | 0.6% | `makeHullNormalMap @ src/render/canvasTextures.js:402` |
| 10.7 | 0.6% | `valueNoiseField @ src/render/canvasTextures.js:63` |
| 10.7 | 0.6% | `fetch @ native:0` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 407.0 | 23.2% | `(native)` |
| 351.8 | 20.1% | `vendor/three.core.js` |
| 138.2 | 7.9% | `(program)` |
| 107.6 | 6.1% | `src/render/spaceBackground.js` |
| 94.1 | 5.4% | `src/render/visualFactory.js` |
| 76.5 | 4.4% | `src/render/partsLibrary.js` |
| 76.5 | 4.4% | `(idle)` |
| 66.8 | 3.8% | `src/render/canvasTextures.js` |
| 64.0 | 3.6% | `vendor/three.module.js` |
| 45.6 | 2.6% | `src/render/renderer.js` |

## loading: gpu-resources — 8.42 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 2423.8 | 28.8% | `(program) @ native:0` |
| 194.2 | 2.3% | `(garbage collector) @ native:0` |
| 67.9 | 0.8% | `syncEntityViewsSteps @ src/render/renderer.js:26802` |
| 50.3 | 0.6% | `texSubImage2D @ native:0` |
| 45.2 | 0.5% | `fetch @ native:0` |
| 43.6 | 0.5% | `get body @ vendor/addons/loaders/GLTFLoader.js:1927` |
| 39.5 | 0.5% | `parse @ vendor/addons/loaders/GLTFLoader.js:429` |
| 34.8 | 0.4% | `getParameters @ vendor/three.module.js:7667` |
| 33.9 | 0.4% | `enqueueGeometryResidencyBatches.urgent @ src/render/startupGpuResidency.js:764` |
| 31.6 | 0.4% | `bufferData @ native:0` |
| 31.1 | 0.4% | `digest @ native:0` |
| 28.4 | 0.3% | `convertBufferAttribute @ vendor/three.core.js:19219` |
| 27.3 | 0.3% | `bake @ src/render/thruster/retroMounts.js:69` |
| 27.1 | 0.3% | `convertBufferAttribute @ vendor/three.core.js:19219` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 2423.8 | 28.8% | `(program)` |
| 1088.0 | 12.9% | `vendor/three.core.js` |
| 860.8 | 10.2% | `(idle)` |
| 566.8 | 6.7% | `(native)` |
| 530.8 | 6.3% | `vendor/three.module.js` |
| 290.4 | 3.4% | `src/render/renderer.js` |
| 194.2 | 2.3% | `(garbage collector)` |
| 193.7 | 2.3% | `src/contracts/renderPackage.js` |
| 182.1 | 2.2% | `vendor/addons/loaders/GLTFLoader.js` |
| 166.3 | 2.0% | `src/render/partsLibrary.js` |

## loading: entering-flight — 0.69 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 97.8 | 14.3% | `(program) @ native:0` |
| 61.7 | 9.0% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:597` |
| 46.3 | 6.8% | `withOnlySubjectsDrawable @ src/render/openingGpuAdmission.js:549` |
| 14.1 | 2.1% | `materialTextures @ src/render/startupGpuResidency.js:106` |
| 9.5 | 1.4% | `(garbage collector) @ native:0` |
| 9.1 | 1.3% | `updateMatrix @ vendor/three.core.js:12821` |
| 9.0 | 1.3% | `traverseVisible @ vendor/three.core.js:12780` |
| 8.3 | 1.2% | `projectObject @ vendor/three.module.js:18323` |
| 6.7 | 1.0% | `multiplyMatrices @ vendor/three.core.js:10385` |
| 4.9 | 0.7% | `(anonymous) @ vendor/three.module.js:17588` |
| 4.8 | 0.7% | `WebGLRenderer.renderBufferDirect @ vendor/three.module.js:17381` |
| 4.7 | 0.7% | `openingCompileIssueKey @ src/render/renderer.js:1696` |
| 4.7 | 0.7% | `traverse @ vendor/three.core.js:12758` |
| 4.7 | 0.7% | `collectInstancePoolCompileRootsAndSubjectsSteps @ src/render/latePipelineAdmission.js:389` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 120.0 | 17.5% | `src/render/openingGpuAdmission.js` |
| 108.4 | 15.8% | `vendor/three.module.js` |
| 97.8 | 14.3% | `(program)` |
| 73.3 | 10.7% | `(idle)` |
| 72.5 | 10.6% | `vendor/three.core.js` |
| 45.6 | 6.7% | `src/render/renderer.js` |
| 37.9 | 5.5% | `src/render/startupGpuResidency.js` |
| 17.9 | 2.6% | `(native)` |
| 17.3 | 2.5% | `src/render/packageCpuDetach.js` |
| 9.5 | 1.4% | `(garbage collector)` |

## first seconds of flight — 30.19 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 7750.2 | 25.7% | `(program) @ native:0` |
| 411.6 | 1.4% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 394.5 | 1.3% | `setProgram @ vendor/three.module.js:18879` |
| 356.3 | 1.2% | `upload @ vendor/three.module.js:6425` |
| 354.8 | 1.2% | `WebGLRenderer.renderBufferDirect @ vendor/three.module.js:17381` |
| 303.1 | 1.0% | `refreshUniformsCommon @ vendor/three.module.js:15342` |
| 282.7 | 0.9% | `syncEntityViewsSteps @ src/render/renderer.js:26802` |
| 248.6 | 0.8% | `bindVertexArray @ native:0` |
| 222.3 | 0.7% | `classifyWorld @ src/world/activityRuntime.js:1568` |
| 216.3 | 0.7% | `unreadyDrawGuard @ src/render/bloom.js:1091` |
| 209.5 | 0.7% | `needsUpdate @ vendor/three.module.js:1952` |
| 205.4 | 0.7% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |
| 202.5 | 0.7% | `detachedPresentedDrawBlocked @ src/render/packageCpuDetach.js:728` |
| 175.1 | 0.6% | `setValueM4 @ vendor/three.module.js:5587` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 7750.2 | 25.7% | `(program)` |
| 6761.2 | 22.4% | `vendor/three.module.js` |
| 2772.8 | 9.2% | `(idle)` |
| 2275.6 | 7.5% | `vendor/three.core.js` |
| 1888.5 | 6.3% | `(native)` |
| 1259.8 | 4.2% | `src/render/renderer.js` |
| 690.3 | 2.3% | `src/render/packageCpuDetach.js` |
| 607.2 | 2.0% | `src/world/activityRuntime.js` |
| 558.1 | 1.8% | `src/core/simLaneMain.js` |
| 461.1 | 1.5% | `src/render/vfx.js` |

## Long tasks from New Game to the end of the profile

| at s (after Launch) | duration ms | during |
|---:|---:|---|
| -0.2 | 120 | New Game screen (to Launch click) |
| -0.0 | 53 | New Game screen (to Launch click) |
| 0.0 | 58 | Launch click to first loading stage |
| 0.4 | 517 | Launch click to first loading stage |
| 0.9 | 99 | loading: authored-library |
| 1.5 | 94 | loading: authored-visuals |
| 11.8 | 66 | loading: entering-flight |
| 11.9 | 125 | loading: entering-flight |
| 12.0 | 55 | loading: entering-flight |

## Loading-screen smoothness (what the player sees)

Frame gaps are the page's own requestAnimationFrame cadence; stall ms is time beyond one 60 Hz frame. The
boot ring and the backdrop video render off the main thread, so a stall here is the DOM/labels/progress
freezing while they keep moving. Long animation frames (LoAF) name the scripts that held the frame.

| window | fps | frames | p50 ms | p95 ms | worst ms | >33 | >50 | >100 | stall ms | LoAF n / blocking ms | video dropped / played |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| New Game screen (to Launch click) | 16.4 | 5 | 33.2 | 166.8 | 167 | 1 | 1 | 1 | 167 | 2 / 114 | 0 / 0 |
| Launch click to first loading stage | 5.6 | 5 | 83.3 | 200.0 | 200 | 3 | 3 | 1 | 300 | 2 / 559 | 6 / 3 |
| loading: authored-library | 7.3 | 3 | 150.0 | 150.0 | 150 | 2 | 1 | 1 | 167 | 3 / 41 | 0 / 0 |
| loading: authored-visuals | 30.8 | 54 | 16.7 | 83.3 | 167 | 13 | 9 | 1 | 816 | 8 / 154 | 30 / 42 |
| loading: render-pipelines | 20.4 | 3 | 99.9 | 99.9 | 100 | 2 | 1 | 0 | 100 | 2 / 0 | 0 / 0 |
| loading: gpu-resources | 44.8 | 377 | 16.7 | 50.0 | 117 | 26 | 21 | 6 | 2087 | 19 / 108 | 1 / 221 |
| loading: physics-authority | 0.0 | 0 | 0.0 | 0.0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 0 / 0 |
| loading: entering-flight | 29.1 | 20 | 16.7 | 166.7 | 167 | 6 | 4 | 1 | 350 | 3 / 133 | 1 / 16 |
| first seconds of flight | 41.9 | 1264 | 16.7 | 33.5 | 183 | 87 | 39 | 5 | 9098 | 33 / 22 | 0 / 2 |

### Long animation frames in New Game screen (to Launch click): who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 112 | 1 | 89 | `BUTTON.onclick @ src/ui/kit/dom.js` |
| 19 | 1 | 12 | `BUTTON.onclick @ src/ui/screens/newGame.js` |
| 17 | 2 | 15 | `ResizeObserverCallback @ src/ui/orrery/stopDial.js` |
| 8 | 1 | 8 | `ResizeObserverCallback @ src/ui/orrery/lampKey.js` |
| 7 | 1 | 7 | `ResizeObserverCallback @ src/ui/orrery/hullRing.js` |

### Long animation frames in Launch click to first loading stage: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 517 | 1 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 51 | 1 | 0 | `FrameRequestCallback @ src/render/partsLibrary.js` |
| 32 | 1 | 0 | `frame @ src/core/presentationRunner.js` |

### Long animation frames in loading: authored-library: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 135 | 4 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 55 | 3 | 0 | `frame @ src/core/presentationRunner.js` |
| 43 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-visuals: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 225 | 8 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 178 | 6 | 0 | `frame @ src/core/presentationRunner.js` |
| 23 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 15 | 1 | 0 | `FrameRequestCallback @ src/render/partsLibrary.js` |
| 10 | 2 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 6 | 1 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |

### Long animation frames in loading: render-pipelines: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 56 | 3 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 8 | 1 | 0 | `frame @ src/core/presentationRunner.js` |
| 5 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: gpu-resources: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 355 | 20 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 143 | 21 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |
| 67 | 6 | 0 | `frame @ src/core/presentationRunner.js` |
| 57 | 5 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 16 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |

### Long animation frames in loading: entering-flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 177 | 3 | 59 | `frame @ src/core/presentationRunner.js` |
| 66 | 1 | 25 | `Worker.onmessage @ src/core/simLaneMain.js` |

### Long animation frames in first seconds of flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 602 | 33 | 0 | `frame @ src/core/presentationRunner.js` |
| 94 | 3 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |

## Flight cadence by two-second bucket

| seconds into flight | fps | p95 ms | worst ms | frames > 50 ms |
|---|---:|---:|---:|---:|
| 0-2 | 39.5 | 50.0 | 50 | 2 |
| 2-4 | 39.5 | 33.4 | 50 | 1 |
| 4-6 | 37.5 | 50.0 | 183 | 4 |
| 6-8 | 45.0 | 33.4 | 67 | 1 |
| 8-10 | 41.0 | 50.0 | 83 | 6 |
| 10-12 | 42.0 | 50.0 | 67 | 4 |
| 12-14 | 47.0 | 33.4 | 50 | 1 |
| 14-16 | 37.0 | 83.3 | 100 | 7 |
| 16-18 | 33.0 | 83.4 | 117 | 8 |
| 18-20 | 40.0 | 33.4 | 83 | 2 |
| 20-22 | 41.0 | 33.4 | 67 | 1 |
| 22-24 | 44.5 | 33.4 | 34 | 0 |
| 24-26 | 46.0 | 33.4 | 50 | 1 |
| 26-28 | 46.0 | 33.4 | 33 | 0 |
| 28-30 | 50.5 | 33.4 | 33 | 0 |
| 30-32 | 26.3 | 83.3 | 83 | 1 |

## Fetched between Launch and flight

290 requests; 139.35 MB of bodies; 89.24 MB actually transferred. Delivery: 206 over the network, 38 revalidated (304), 46 straight from cache.

| type | requests | body MB | transferred MB |
|---|---:|---:|---:|
| glb | 115 | 126.36 | 78.65 |
| json | 161 | 11.26 | 8.86 |
| png | 11 | 1.72 | 1.73 |
| svg | 3 | 0.00 | 0.00 |

| largest bodies | MB | transferred MB | fetch ms |
|---|---:|---:|---:|
| `assets/ships/release/render-packages/helios-trade-hub/render.glb` | 5.36 | 0.00 | 76 |
| `assets/ships/release/render-packages/candle-fleet/render.glb` | 4.88 | 0.00 | 95 |
| `assets/ships/release/render-packages/military/render.glb` | 3.00 | 0.00 | 49 |
| `assets/ships/release/render-packages/volatiles-tanker/render.glb` | 2.59 | 2.59 | 482 |
| `assets/ships/release/render-packages/helios-cradle-dmc/render.glb` | 2.52 | 2.52 | 506 |
| `assets/ships/release/render-packages/helios-cradle/render.glb` | 2.52 | 2.52 | 45 |
| `assets/ships/release/render-packages/rescue-lifter/render.glb` | 2.49 | 2.49 | 465 |
| `assets/ships/release/render-packages/yard-tug/render.glb` | 2.41 | 2.41 | 23 |
| `assets/ships/release/render-packages/helios-arclight/render.glb` | 2.36 | 2.36 | 490 |
| `assets/ships/release/render-packages/ore-barge/render.glb` | 2.31 | 2.31 | 498 |
| `assets/ships/release/render-packages/wasp-free-militia/render.glb` | 2.12 | 2.12 | 511 |
| `assets/ships/release/render-packages/wasp-mts-escort/render.glb` | 2.12 | 2.12 | 522 |
| `assets/ships/release/render-packages/wasp-quiet-ghost/render.glb` | 2.12 | 2.12 | 358 |
| `assets/ships/release/render-packages/wasp-scn-patrol/render.glb` | 2.12 | 2.12 | 15 |
| `assets/ships/release/render-packages/helios-span-reach/render.glb` | 2.07 | 2.07 | 455 |

## Renderer resources

| moment | programs | geometries | textures | JS heap MB |
|---|---:|---:|---:|---:|
| entering flight | 149 | 2356 | 120 | 831 |
| end of profile | 149 | 2553 | 120 | 954 |

Dispose-registration probe renders: 1 at flight, 1 at end of profile (once per context generation is right).

## Draws that waited on a driver link

32 waits of 1 ms or more across 32 programs (1863 draw-path calls), 0.6 s on the main thread, longest 118 ms.

| shader family | waits (>= 1 ms) | total ms |
|---|---:|---:|
| ShaderMaterial | 7 | 199 |
| PMREMGGXConvolution | 1 | 56 |
| MeshDepthMaterial | 2 | 47 |
| MeshStandardMaterial | 3 | 34 |
| Material_Ceramic_ice | 2 | 28 |
| CubemapFromEquirect | 1 | 27 |
| SF_Shared_canopy_none_native | 2 | 21 |
| MeshBasicMaterial | 2 | 19 |
| Material_Emissive_Amber_beacon | 1 | 18 |
| SF_Shared_hull_textured_hull | 1 | 17 |
| SphericalGaussianBlur | 1 | 16 |
| Material_Stone | 1 | 13 |

- 118 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:53273/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:53273/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:53273/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:53273/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:53273/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:53273/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:53273/vendor/three.module.js:18616:6) | at renderTransmissionPass (http://127.0.0.1:53273/ve
- 55 ms `PMREMGGXConvolution` — at timedBlockingFirstUse (http://127.0.0.1:53273/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:53273/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:53273/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:53273/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:53273/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:53273/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:53273/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:53273/vendor/three.
- 42 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:53273/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:53273/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:53273/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:53273/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:53273/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:53273/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:53273/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:53273/vendor/three.
- 28 ms `MeshDepthMaterial` — at timedBlockingFirstUse (http://127.0.0.1:53273/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:53273/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:53273/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:53273/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:53273/src/render/bloom.js:1142:18) | at renderShadowCaster (http://127.0.0.1:53273/vendor/three.module.js:9860:15) | at http://127.0.0.1:53273/vendor/three.module.js:9814:42 | at eachShadowCaster (http://127.0.0.1:53273/vendor/three.module
- 27 ms `CubemapFromEquirect` — at timedBlockingFirstUse (http://127.0.0.1:53273/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:53273/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:53273/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:53273/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:53273/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:53273/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:53273/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:53273/vendor/three.
- 19 ms `MeshDepthMaterial` — at timedBlockingFirstUse (http://127.0.0.1:53273/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:53273/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:53273/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:53273/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:53273/src/render/bloom.js:1142:18) | at renderShadowCaster (http://127.0.0.1:53273/vendor/three.module.js:9860:15) | at http://127.0.0.1:53273/vendor/three.module.js:9814:42 | at eachShadowCaster (http://127.0.0.1:53273/vendor/three.module
- 18 ms `Material_Emissive_Amber_beacon` — at timedBlockingFirstUse (http://127.0.0.1:53273/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:53273/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:53273/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:53273/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:53273/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:53273/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:53273/vendor/three.module.js:18616:6) | at renderTransmissionPass (http://127.0.0.1:53273/ve
- 17 ms `SF_Shared_hull_textured_hull` — at timedBlockingFirstUse (http://127.0.0.1:53273/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:53273/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:53273/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:53273/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:53273/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:53273/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:53273/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:53273/vendor/three.

Opening work still pending when flight began: `397:missing:wreck`, `400:missing:payload`, `401:missing:payload`, `402:missing:payload`.

## Opening cook ledger

The opening cook began 3.2 s after Launch; flight began at 12.3 s. `t` is ms from the cook's start to the end of the step.

| step | ms | outcome | t ms | detail |
|---|---:|---|---:|---|
| opening.rockSurfaceLibrary | 0 | resolved | 1 |  |
| opening.firstPresentAdmission | 0 | resolved | 1 |  |
| opening.residency | 106 | resolved | 152 | subjects=86 textureRefs=31 textures=31 |
| opening.postResources | 5 | resolved | 156 | route=bloom |
| opening.capturedPipelineDrain | 32 | resolved | 189 | captured=8 stillPending=0 |
| opening.receipt | 6 | resolved | 195 |  |
| wait.prepareOpeningGpuResources | 195 | resolved | 195 |  |
| live.meshBuilds1 | 0 | resolved | 319 | queued=0 passes=0 built=0 buildMs=0 yields=0 left=0 |
| lane | 0 | sample | 1007 | queued=0 flushed=0 settled=82 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=5 meshBuilds=0 |
| live.openingComposition | 880 | resolved | 1199 | pending=0 |
| live.upgradeQueueIdle | 880 | resolved | 1199 | pending=0 inFlight=0 compiling=false |
| live.pendingPipelines | 0 | skipped | 1199 | captured=0 |
| live.rocksAndLeftoverMeshes | 3 | resolved | 1202 | firstFlightEntities=47 |
| live.meshBuilds2 | 33 | resolved | 1235 | queued=8 passes=2 built=0 buildMs=0 yields=2 left=0 |
| cook.programs | 0 | resolved | 1303 | method=first-flight-hulls |
| cook.touchCompile | 242 | resolved | 1673 | issued=597 unlinked=0 yields=13 |
| lane | 0 | sample | 2027 | queued=0 flushed=1 settled=98 upgradeJobs=3 upgradeInFlight=2 upgradeCompiling=3 meshBuilds=0 |
| cook.touch | 804 | resolved | 2522 | subjects=597 firstPicture=70 touched=597 notReady=0 noProgram=0 switched=0 touchMs=289 maxTouchMs=2 yields=42 |
| lane | 0 | sample | 3207 | queued=1 flushed=0 settled=101 upgradeJobs=1 upgradeInFlight=1 upgradeCompiling=5 meshBuilds=0 |
| lane | 0 | sample | 4021 | queued=0 flushed=0 settled=103 upgradeJobs=0 upgradeInFlight=1 upgradeCompiling=4 meshBuilds=0 |
| lane | 0 | sample | 5000 | queued=0 flushed=0 settled=104 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=2 meshBuilds=0 |
| cook.buffers | 2652 | resolved | 5300 | roots=94 textures=194 yields=36 |
| cook.layers | 402 | resolved | 5702 | roots=174 yields=50 |
| cook.crucibleWarm | 245 | resolved | 5953 | progress={"profile":"opening","records":42,"instantiated":42,"packageInstances":42,"paletteSubjects":313,"chunkPromotions":0,"shi |
| lane | 0 | sample | 6002 | queued=22 flushed=0 settled=122 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 7005 | queued=0 flushed=18 settled=126 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.rockPools | 1030 | resolved | 7095 | roots=53 units=1853 issued=1853 issueDedupeSkips=1762 touched=1853 hiddenTouchSkips=1779 yields=10 issueMs=209 drainMs=737 touchMs=52 |
| live.cook | 5860 | resolved | 7095 |  |
| live.leftoverUpgradeIdle | 0 | resolved | 7095 | pending=0 inFlight=0 compiling=false |
| live.materialSettle | 706 | resolved | 7801 | unbound=550 names=Physical racing wakes/Next checkpoint/Draft pace beacon/Massline anchors and crossing refuges/L6_comet/L0-L2_deep-field-composite/L3_stars/L4_flares/DeepField_helios-ecliptic-dust/DeepField_helios-left-drift/DeepField_helios-outer-shepherd/DeepFieldStructure_helios-derelict-hauler |
| live.postOpeningPipelines | 371 | resolved | 8219 |  |
| lane | 0 | sample | 8233 | queued=0 flushed=0 settled=144 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| live.parkWarmRoots | 94 | resolved | 8314 | roots=1 nodes=129 stampedGeometries=662 |
| live.firstFramePoolCensus | 550 | resolved | 8351 |  |
| live.finalPipelineSeal | 0 | resolved | 8351 | queuedPipelines=0 |
| wait.prepareLiveSectorBeforeFlight | 8226 | resolved | 8422 |  |
| opening.compositionTail | 1 | resolved | 8423 |  |

## Top-level entry points (inclusive)

The owner of the frame. Anything here that is not the game's own presentation frame is work
the in-engine hitch classifier cannot see.

| ms | share | entry |
|---:|---:|---|
| 19346.9 | 44.3% | `frame @ src/core/presentationRunner.js:1060` |
| 12013.0 | 27.5% | `(program) @ native:0` |
| 3848.3 | 8.8% | `(idle) @ native:0` |
| 1367.0 | 3.1% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 625.1 | 1.4% | `state.render.cookLiveSceneGpu @ src/render/renderer.js:15830` |
| 497.1 | 1.1% | `enqueueGeometryResidencyBatches.urgent @ src/render/startupGpuResidency.js:764` |
| 370.7 | 0.8% | `touchExactTargetSubjects @ src/render/renderer.js:12132` |
| 356.1 | 0.8% | `fire @ src/render/compilePresentSlice.js:361` |
| 307.3 | 0.7% | `buildComposedShipAsync @ src/render/partsLibrary.js:11436` |
| 291.5 | 0.7% | `(garbage collector) @ native:0` |
| 266.2 | 0.6% | `compileSubjectColorAndDepth @ src/render/renderer.js:12116` |
| 259.3 | 0.6% | `(anonymous) @ src/render/renderer.js:12852` |

## Canvas census at the end of the profile

A canvas that is still `connected` with a zero client size is not in layout and cannot be seen.
If its backing store is large, or grows between runs, it is an orphaned render surface.

| id / class | backing store | client | display | connected |
|---|---|---|---|---|
| gl-canvas | 1832x973 | 1466x779 | block | true |
| sf-radar-semantic-canvas | 260x260 | 208x208 | block | true |
| sf-fx-flickergrid | 560x260 | 0x0 | inline | true |
| sf-speed-lines | 300x150 | 300x150 | block | true |
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
