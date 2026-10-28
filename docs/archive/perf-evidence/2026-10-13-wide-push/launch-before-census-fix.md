# Launch-to-flight main-thread profile

Profile: kept evidence profile `probe-keep-oct13f-000000` (reused: warm GPU program and HTTP caches). New Game seed 47.

**Launch click to flight: 30.5 s.** New Game click to flight: 32.3 s. The profile continues 4.6 s into held-thrust flight.

## Where the time went, by phase

Busy is sampled main-thread time that is not idle. `(program)` is native work outside JavaScript
(Blink, GPU command submission, compositor hand-off). A phase that is mostly idle is waiting on
something off the main thread: driver shader compiles, network, decoding workers, timers.

| phase | wall s | busy s | JS s | (program) s | idle s | GC s | long tasks (n / ms) |
|---|---:|---:|---:|---:|---:|---:|---|
| New Game screen (to Launch click) | 1.76 | 1.76 | 0.41 | 1.34 | 0.01 | 0.01 | 3 / 372 |
| Launch click to first loading stage | 0.88 | 0.87 | 0.75 | 0.12 | 0.01 | 0.00 | 1 / 568 |
| loading: authored-library | 0.39 | 0.39 | 0.13 | 0.26 | 0.00 | 0.00 | 1 / 82 |
| loading: authored-visuals | 1.66 | 1.61 | 1.37 | 0.22 | 0.05 | 0.02 | 1 / 96 |
| loading: render-pipelines | 0.09 | 0.09 | 0.06 | 0.03 | 0.00 | 0.00 | 0 / 0 |
| loading: gpu-resources | 26.13 | 16.97 | 10.04 | 6.66 | 9.16 | 0.27 | 4 / 229 |
| loading: physics-authority | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0 / 0 |
| loading: entering-flight | 1.35 | 0.91 | 0.61 | 0.31 | 0.43 | 0.00 | 7 / 702 |
| first seconds of flight | 4.65 | 4.45 | 2.96 | 1.46 | 0.20 | 0.03 | 28 / 1926 |

## New Game screen (to Launch click) — 1.76 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 1340.9 | 76.1% | `(program) @ native:0` |
| 99.2 | 5.6% | `getBoundingClientRect @ native:0` |
| 33.8 | 1.9% | `get offsetHeight @ native:0` |
| 28.0 | 1.6% | `getBoundingClientRect @ native:0` |
| 22.7 | 1.3% | `getBoundingClientRect @ native:0` |
| 18.5 | 1.1% | `focus @ native:0` |
| 16.1 | 0.9% | `getBoundingClientRect @ native:0` |
| 13.8 | 0.8% | `getBoundingClientRect @ native:0` |
| 13.8 | 0.8% | `getBoundingClientRect @ native:0` |
| 11.2 | 0.6% | `getBoundingClientRect @ native:0` |
| 6.9 | 0.4% | `replaceLightNums @ vendor/three.module.js:6675` |
| 6.3 | 0.4% | `(garbage collector) @ native:0` |
| 5.6 | 0.3% | `shaderSource @ native:0` |
| 4.8 | 0.3% | `getProgram @ vendor/three.module.js:18700` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 1340.9 | 76.1% | `(program)` |
| 320.1 | 18.2% | `(native)` |
| 30.7 | 1.7% | `vendor/three.module.js` |
| 6.3 | 0.4% | `(garbage collector)` |
| 6.0 | 0.3% | `src/ui/orrery/hullRing.js` |
| 5.3 | 0.3% | `vendor/three.core.js` |
| 5.0 | 0.3% | `(idle)` |
| 5.0 | 0.3% | `src/render/illustratedSurface.js` |
| 4.5 | 0.3% | `src/render/packageCpuDetach.js` |
| 4.1 | 0.2% | `src/ui/screenManager.js` |

## Launch click to first loading stage — 0.88 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 284.7 | 32.3% | `getProgramParameter @ native:0` |
| 122.2 | 13.9% | `bufferData @ native:0` |
| 119.5 | 13.6% | `(program) @ native:0` |
| 115.4 | 13.1% | `getProgramParameter @ native:0` |
| 59.0 | 6.7% | `isElementHiddenForAria @ native:3176` |
| 10.1 | 1.2% | `queryRole @ native:5099` |
| 9.5 | 1.1% | `fetch @ native:0` |
| 6.3 | 0.7% | `fetch @ native:0` |
| 6.1 | 0.7% | `getTextAlternativeInternal @ native:3404` |
| 5.6 | 0.6% | `shaderSource @ native:0` |
| 4.1 | 0.5% | `includeReplacer @ vendor/three.module.js:6714` |
| 4.1 | 0.5% | `getCSSContent @ native:3248` |
| 3.8 | 0.4% | `elementSafeTagName @ native:2838` |
| 3.3 | 0.4% | `getAttribute @ native:0` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 662.6 | 75.3% | `(native)` |
| 119.5 | 13.6% | `(program)` |
| 39.0 | 4.4% | `vendor/three.module.js` |
| 12.4 | 1.4% | `(idle)` |
| 7.5 | 0.9% | `src/render/shaderLinkReporter.js` |
| 6.6 | 0.7% | `vendor/three.core.js` |
| 6.1 | 0.7% | `src/contracts/renderPackage.js` |
| 5.7 | 0.6% | `src/render/renderPackageLoader.js` |
| 3.4 | 0.4% | `src/render/packageCpuDetach.js` |
| 2.0 | 0.2% | `src/render/uiStage.js` |

## loading: authored-visuals — 1.66 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 216.3 | 13.1% | `(program) @ native:0` |
| 178.1 | 10.8% | `texSubImage2D @ native:0` |
| 124.1 | 7.5% | `getProgramParameter @ native:0` |
| 116.6 | 7.0% | `getProgramParameter @ native:0` |
| 60.1 | 3.6% | `_createStars @ src/render/spaceBackground.js:2076` |
| 28.4 | 1.7% | `(anonymous) @ src/render/visualFactory.js:4942` |
| 28.2 | 1.7% | `getProgramParameter @ native:0` |
| 21.3 | 1.3% | `(garbage collector) @ native:0` |
| 13.1 | 0.8% | `makeNoiseTexture @ src/render/canvasTextures.js:91` |
| 13.0 | 0.8% | `parse @ vendor/addons/loaders/GLTFLoader.js:429` |
| 12.2 | 0.7% | `TorusGeometry @ vendor/three.core.js:36432` |
| 11.4 | 0.7% | `get body @ vendor/addons/loaders/GLTFLoader.js:1927` |
| 11.2 | 0.7% | `getProgramParameter @ native:0` |
| 9.5 | 0.6% | `makeHullNormalMap @ src/render/canvasTextures.js:402` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 523.0 | 31.6% | `(native)` |
| 216.3 | 13.1% | `(program)` |
| 172.7 | 10.4% | `vendor/three.core.js` |
| 92.3 | 5.6% | `src/render/visualFactory.js` |
| 74.5 | 4.5% | `vendor/addons/loaders/GLTFLoader.js` |
| 74.0 | 4.5% | `src/render/spaceBackground.js` |
| 50.5 | 3.0% | `(idle)` |
| 50.1 | 3.0% | `src/render/renderer.js` |
| 41.6 | 2.5% | `src/render/partsLibrary.js` |
| 39.8 | 2.4% | `src/render/canvasTextures.js` |

## loading: gpu-resources — 26.13 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 6661.3 | 25.5% | `(program) @ native:0` |
| 403.4 | 1.5% | `machineTranslatePart @ src/localization/pipeline.js:483` |
| 274.8 | 1.1% | `(garbage collector) @ native:0` |
| 208.3 | 0.8% | `syncEntityViewsSteps @ src/render/renderer.js:26754` |
| 189.1 | 0.7% | `getProgramParameter @ native:0` |
| 126.2 | 0.5% | `getProgramParameter @ native:0` |
| 115.9 | 0.4% | `translateMessage @ src/localization/pipeline.js:523` |
| 81.7 | 0.3% | `update @ src/render/vfx.js:12396` |
| 75.4 | 0.3% | `translateWord @ src/localization/pipeline.js:469` |
| 75.1 | 0.3% | `_updateSpeedLines @ src/render/feel.js:841` |
| 72.8 | 0.3% | `releaseStatesOfObject @ vendor/three.module.js:2387` |
| 65.4 | 0.3% | `updateShipPitchPresentation @ src/render/shipPitchPresentation.js:176` |
| 59.3 | 0.2% | `follow @ src/render/camera.js:1791` |
| 56.4 | 0.2% | `get body @ vendor/addons/loaders/GLTFLoader.js:1927` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 9155.9 | 35.0% | `(idle)` |
| 6661.3 | 25.5% | `(program)` |
| 1748.1 | 6.7% | `vendor/three.core.js` |
| 1229.2 | 4.7% | `(native)` |
| 948.4 | 3.6% | `src/render/renderer.js` |
| 674.8 | 2.6% | `src/localization/pipeline.js` |
| 655.3 | 2.5% | `vendor/three.module.js` |
| 291.6 | 1.1% | `src/render/vfx.js` |
| 274.8 | 1.1% | `(garbage collector)` |
| 255.9 | 1.0% | `vendor/addons/loaders/GLTFLoader.js` |

## loading: entering-flight — 1.35 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 306.8 | 22.8% | `(program) @ native:0` |
| 32.2 | 2.4% | `getProgramParameter @ native:0` |
| 24.3 | 1.8% | `withOnlySubjectsDrawable @ src/render/openingGpuAdmission.js:549` |
| 21.6 | 1.6% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:595` |
| 14.4 | 1.1% | `syncEntityViewsSteps @ src/render/renderer.js:26754` |
| 12.2 | 0.9% | `materialTextures @ src/render/startupGpuResidency.js:106` |
| 9.0 | 0.7% | `setProgram @ vendor/three.module.js:18879` |
| 8.7 | 0.6% | `getParameters @ vendor/three.module.js:7667` |
| 7.5 | 0.6% | `projectObject @ vendor/three.module.js:18323` |
| 7.5 | 0.6% | `projectObject @ vendor/three.module.js:18323` |
| 7.0 | 0.5% | `projectObject @ vendor/three.module.js:18323` |
| 6.9 | 0.5% | `WebGLRenderer.renderBufferDirect @ vendor/three.module.js:17381` |
| 6.3 | 0.5% | `updateCraftMicroMotion @ src/render/shipMicroMotion.js:1335` |
| 6.3 | 0.5% | `createVertexArray @ native:0` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 434.4 | 32.2% | `(idle)` |
| 306.8 | 22.8% | `(program)` |
| 146.0 | 10.8% | `vendor/three.module.js` |
| 92.8 | 6.9% | `(native)` |
| 53.1 | 3.9% | `src/render/renderer.js` |
| 53.0 | 3.9% | `src/render/openingGpuAdmission.js` |
| 51.9 | 3.8% | `src/render/startupGpuResidency.js` |
| 30.5 | 2.3% | `src/render/openingSubmissionPlan.js` |
| 23.6 | 1.8% | `vendor/three.core.js` |
| 9.7 | 0.7% | `src/render/packageCpuDetach.js` |

## first seconds of flight — 4.65 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 1457.1 | 31.4% | `(program) @ native:0` |
| 162.2 | 3.5% | `toBlob @ native:0` |
| 128.0 | 2.8% | `getBoundingClientRect @ native:0` |
| 80.9 | 1.7% | `texSubImage2D @ native:0` |
| 57.1 | 1.2% | `getBoundingClientRect @ native:0` |
| 37.6 | 0.8% | `syncEntityViewsSteps @ src/render/renderer.js:26754` |
| 36.5 | 0.8% | `WebGLRenderer.renderBufferDirect @ vendor/three.module.js:17381` |
| 30.3 | 0.7% | `upload @ vendor/three.module.js:6425` |
| 28.5 | 0.6% | `(garbage collector) @ native:0` |
| 25.8 | 0.6% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 24.5 | 0.5% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |
| 23.6 | 0.5% | `setProgram @ vendor/three.module.js:18879` |
| 22.9 | 0.5% | `now @ src/render/renderer.js:4141` |
| 22.5 | 0.5% | `syncEntityViews @ src/render/renderer.js:26726` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 1457.1 | 31.4% | `(program)` |
| 737.9 | 15.9% | `(native)` |
| 581.6 | 12.5% | `vendor/three.module.js` |
| 201.0 | 4.3% | `(idle)` |
| 199.6 | 4.3% | `src/render/renderer.js` |
| 191.0 | 4.1% | `vendor/three.core.js` |
| 78.9 | 1.7% | `src/render/vfx.js` |
| 75.5 | 1.6% | `src/world/activityRuntime.js` |
| 60.2 | 1.3% | `vendor/addons/loaders/GLTFLoader.js` |
| 56.7 | 1.2% | `src/ui/hud.js` |

## Long tasks from New Game to the end of the profile

| at s (after Launch) | duration ms | during |
|---:|---:|---|
| -1.6 | 232 | New Game screen (to Launch click) |
| -1.4 | 87 | New Game screen (to Launch click) |
| -0.1 | 53 | New Game screen (to Launch click) |
| 0.3 | 568 | Launch click to first loading stage |
| 0.9 | 82 | loading: authored-library |
| 1.9 | 96 | loading: authored-visuals |
| 3.1 | 51 | loading: gpu-resources |
| 8.1 | 53 | loading: gpu-resources |
| 9.7 | 54 | loading: gpu-resources |
| 26.6 | 71 | loading: gpu-resources |
| 29.5 | 131 | loading: entering-flight |
| 29.6 | 245 | loading: entering-flight |
| 29.9 | 94 | loading: entering-flight |
| 30.0 | 52 | loading: entering-flight |
| 30.1 | 67 | loading: entering-flight |
| 30.2 | 50 | loading: entering-flight |
| 30.4 | 63 | loading: entering-flight |
| 30.5 | 93 | first seconds of flight |
| 30.6 | 115 | first seconds of flight |
| 30.7 | 97 | first seconds of flight |
| 30.9 | 71 | first seconds of flight |
| 31.1 | 51 | first seconds of flight |
| 31.2 | 56 | first seconds of flight |
| 31.3 | 68 | first seconds of flight |
| 31.3 | 56 | first seconds of flight |
| 31.4 | 51 | first seconds of flight |
| 31.5 | 58 | first seconds of flight |
| 31.5 | 73 | first seconds of flight |
| 31.6 | 68 | first seconds of flight |
| 31.8 | 65 | first seconds of flight |
| 31.9 | 61 | first seconds of flight |
| 32.0 | 122 | first seconds of flight |
| 32.2 | 61 | first seconds of flight |
| 32.3 | 64 | first seconds of flight |
| 32.4 | 56 | first seconds of flight |
| 32.6 | 52 | first seconds of flight |
| 32.6 | 50 | first seconds of flight |
| 32.7 | 54 | first seconds of flight |
| 33.1 | 53 | first seconds of flight |
| 33.3 | 108 | first seconds of flight |
| 33.8 | 52 | first seconds of flight |
| 33.9 | 50 | first seconds of flight |
| 34.4 | 52 | first seconds of flight |
| 34.5 | 50 | first seconds of flight |
| 34.7 | 119 | first seconds of flight |
| 35.2 | 50 | outside the profile |

## Loading-screen smoothness (what the player sees)

Frame gaps are the page's own requestAnimationFrame cadence; stall ms is time beyond one 60 Hz frame. The
boot ring and the backdrop video render off the main thread, so a stall here is the DOM/labels/progress
freezing while they keep moving. Long animation frames (LoAF) name the scripts that held the frame.

| window | fps | frames | p50 ms | p95 ms | worst ms | >33 | >50 | >100 | stall ms | LoAF n / blocking ms | video dropped / played |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| New Game screen (to Launch click) | 11.9 | 21 | 33.3 | 550.0 | 550 | 9 | 8 | 3 | 1383 | 9 / 881 | 0 / 2 |
| Launch click to first loading stage | 15.9 | 14 | 16.7 | 33.4 | 33 | 0 | 0 | 0 | 34 | 1 / 594 | 0 / 0 |
| loading: authored-library | 7.6 | 3 | 150.0 | 150.0 | 150 | 2 | 2 | 1 | 200 | 3 / 117 | 0 / 0 |
| loading: authored-visuals | 22.3 | 37 | 33.3 | 116.8 | 133 | 11 | 7 | 2 | 733 | 7 / 152 | 1 / 41 |
| loading: render-pipelines | 45.5 | 4 | 16.8 | 33.6 | 34 | 1 | 0 | 0 | 17 | 1 / 7 | 0 / 0 |
| loading: gpu-resources | 51.9 | 1355 | 16.7 | 33.3 | 266 | 42 | 31 | 10 | 3411 | 33 / 374 | 10 / 706 |
| loading: physics-authority | 0.0 | 0 | 0.0 | 0.0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 0 / 0 |
| loading: entering-flight | 23.0 | 31 | 16.7 | 166.7 | 367 | 9 | 7 | 2 | 816 | 8 / 455 | 3 / 30 |
| first seconds of flight | 14.2 | 66 | 66.7 | 133.3 | 200 | 57 | 48 | 9 | 3431 | 43 / 555 | 0 / 0 |

### Long animation frames in New Game screen (to Launch click): who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 640 | 1 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 219 | 1 | 195 | `BUTTON.onclick @ src/ui/kit/dom.js` |
| 46 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 37 | 2 | 34 | `ResizeObserverCallback @ src/ui/orrery/stopDial.js` |
| 23 | 1 | 16 | `BUTTON.onclick @ src/ui/screens/newGame.js` |
| 15 | 1 | 14 | `ResizeObserverCallback @ src/ui/orrery/hullRing.js` |
| 12 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 12 | 1 | 12 | `ResizeObserverCallback @ src/ui/orrery/lampKey.js` |

### Long animation frames in Launch click to first loading stage: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 568 | 1 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 35 | 1 | 0 | `FrameRequestCallback @ src/render/partsLibrary.js` |
| 33 | 1 | 0 | `frame @ src/core/presentationRunner.js` |
| 6 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-library: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 279 | 9 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 67 | 3 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 43 | 3 | 0 | `frame @ src/core/presentationRunner.js` |
| 14 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |

### Long animation frames in loading: authored-visuals: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 246 | 6 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 132 | 5 | 0 | `frame @ src/core/presentationRunner.js` |
| 27 | 3 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 25 | 4 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 22 | 4 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |

### Long animation frames in loading: render-pipelines: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 109 | 4 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 14 | 1 | 0 | `fire @ src/core/backgroundPost.js` |

### Long animation frames in loading: gpu-resources: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 1001 | 57 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 221 | 5 | 0 | `checkProgramsReady @ src/render/bloom.js` |
| 141 | 23 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |
| 135 | 3 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 85 | 8 | 0 | `frame @ src/core/presentationRunner.js` |
| 31 | 1 | 0 | `TimerHandler:setTimeout @ (inline)` |
| 20 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: entering-flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 523 | 8 | 135 | `frame @ src/core/presentationRunner.js` |
| 139 | 2 | 61 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 36 | 1 | 0 | `capture @ src/ui/screens/flightFootage.js` |
| 21 | 1 | 0 | `poll @ src/ui/screens/flightFootage.js` |
| 20 | 1 | 0 | `guarded @ src/render/renderer.js` |
| 17 | 2 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in first seconds of flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 1555 | 43 | 0 | `frame @ src/core/presentationRunner.js` |
| 198 | 3 | 0 | `capture @ src/ui/screens/flightFootage.js` |
| 146 | 17 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 11 | 2 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 5 | 1 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |

## Fetched between Launch and flight

254 requests; 104.70 MB of bodies; 89.20 MB actually transferred. Delivery: 205 over the network, 34 revalidated (304), 15 straight from cache.

| type | requests | body MB | transferred MB |
|---|---:|---:|---:|
| glb | 83 | 92.22 | 78.61 |
| json | 157 | 10.76 | 8.86 |
| png | 11 | 1.72 | 1.73 |
| svg | 3 | 0.00 | 0.00 |

| largest bodies | MB | transferred MB | fetch ms |
|---|---:|---:|---:|
| `assets/ships/release/render-packages/volatiles-tanker/render.glb` | 2.59 | 2.59 | 391 |
| `assets/ships/release/render-packages/helios-cradle-dmc/render.glb` | 2.52 | 2.52 | 532 |
| `assets/ships/release/render-packages/helios-cradle/render.glb` | 2.52 | 2.52 | 48 |
| `assets/ships/release/render-packages/rescue-lifter/render.glb` | 2.49 | 2.49 | 403 |
| `assets/ships/release/render-packages/yard-tug/render.glb` | 2.41 | 2.41 | 34 |
| `assets/ships/release/render-packages/helios-arclight/render.glb` | 2.36 | 2.36 | 416 |
| `assets/ships/release/render-packages/ore-barge/render.glb` | 2.31 | 2.31 | 382 |
| `assets/ships/release/render-packages/wasp-free-militia/render.glb` | 2.12 | 2.12 | 446 |
| `assets/ships/release/render-packages/wasp-mts-escort/render.glb` | 2.12 | 2.12 | 463 |
| `assets/ships/release/render-packages/wasp-quiet-ghost/render.glb` | 2.12 | 2.12 | 292 |
| `assets/ships/release/render-packages/wasp-scn-patrol/render.glb` | 2.12 | 2.12 | 63 |
| `assets/ships/release/render-packages/helios-span-reach/render.glb` | 2.07 | 2.07 | 405 |
| `assets/ships/release/render-packages/helios-span-dmc/render.glb` | 2.07 | 2.07 | 415 |
| `assets/ships/release/render-packages/helios-span-mts/render.glb` | 2.07 | 2.07 | 449 |
| `assets/ships/release/render-packages/helios-span/render.glb` | 2.07 | 2.07 | 46 |

## Renderer resources

| moment | programs | geometries | textures | JS heap MB |
|---|---:|---:|---:|---:|
| entering flight | 138 | 1881 | 119 | 803 |
| end of profile | 138 | 1882 | 121 | 932 |

Dispose-registration probe renders: 1 at flight, 1 at end of profile (once per context generation is right).

## Draws that waited on a driver link

41 waits of 1 ms or more across 41 programs (1877 draw-path calls), 1.7 s on the main thread, longest 228 ms.

| shader family | waits (>= 1 ms) | total ms |
|---|---:|---:|
| ShaderMaterial | 8 | 374 |
| MeshStandardMaterial | 7 | 264 |
| PMREM.Background | 1 | 228 |
| SF_StartupGeometryResidency | 1 | 187 |
| MeshDepthMaterial | 2 | 154 |
| Material_Emissive_Amber | 2 | 112 |
| Material_Ceramic_ice | 2 | 50 |
| PointsMaterial | 1 | 47 |
| Material_Stone | 1 | 42 |
| MeshPhysicalMaterial | 2 | 33 |
| CubemapFromEquirect | 1 | 28 |
| SF_Shared_mechanical_dark | 1 | 24 |

- 228 ms `PMREM.Background` — at timedBlockingFirstUse (http://127.0.0.1:62356/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:62356/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:62356/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:62356/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:62356/src/render/bloom.js:1133:18) | at renderObject (http://127.0.0.1:62356/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:62356/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:62356/vendor/three.
- 187 ms `SF_StartupGeometryResidency` — at timedBlockingFirstUse (http://127.0.0.1:62356/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:62356/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:62356/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:62356/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:62356/src/render/bloom.js:1133:18) | at renderObject (http://127.0.0.1:62356/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:62356/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:62356/vendor/three.
- 178 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:62356/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:62356/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:62356/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:62356/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:62356/src/render/bloom.js:1133:18) | at renderObject (http://127.0.0.1:62356/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:62356/vendor/three.module.js:18616:6) | at renderTransmissionPass (http://127.0.0.1:62356/ve
- 172 ms `MeshStandardMaterial` — at timedBlockingFirstUse (http://127.0.0.1:62356/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:62356/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:62356/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:62356/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:62356/src/render/bloom.js:1133:18) | at renderObject (http://127.0.0.1:62356/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:62356/vendor/three.module.js:18616:6) | at renderTransmissionPass (http://127.0.0.1:62356/ve
- 124 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:62356/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:62356/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:62356/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:62356/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:62356/src/render/bloom.js:1133:18) | at renderObject (http://127.0.0.1:62356/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:62356/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:62356/vendor/three.
- 115 ms `MeshDepthMaterial` — at timedBlockingFirstUse (http://127.0.0.1:62356/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:62356/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:62356/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:62356/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:62356/src/render/bloom.js:1133:18) | at renderShadowCaster (http://127.0.0.1:62356/vendor/three.module.js:9860:15) | at http://127.0.0.1:62356/vendor/three.module.js:9814:42 | at eachShadowCaster (http://127.0.0.1:62356/vendor/three.module
- 102 ms `Material_Emissive_Amber` — at timedBlockingFirstUse (http://127.0.0.1:62356/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:62356/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:62356/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:62356/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:62356/src/render/bloom.js:1133:18) | at renderObject (http://127.0.0.1:62356/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:62356/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:62356/vendor/three.
- 47 ms `PointsMaterial` — at timedBlockingFirstUse (http://127.0.0.1:62356/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:62356/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:62356/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:62356/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:62356/src/render/bloom.js:1133:18) | at renderObject (http://127.0.0.1:62356/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:62356/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:62356/vendor/three.

Opening work still pending when flight began: `381:missing:wreck`, `384:missing:payload`, `385:missing:payload`, `386:missing:payload`.

## Opening cook ledger

The opening cook began 3.0 s after Launch; flight began at 30.5 s. `t` is ms from the cook's start to the end of the step.

| step | ms | outcome | t ms | detail |
|---|---:|---|---:|---|
| opening.rockSurfaceLibrary | 1 | resolved | 2 |  |
| opening.firstPresentAdmission | 0 | resolved | 4 |  |
| opening.residency | 42 | resolved | 162 | subjects=88 textureRefs=32 textures=32 |
| opening.postResources | 11 | resolved | 173 | route=bloom |
| lane | 0 | sample | 1009 | queued=0 flushed=57 settled=19 upgradeJobs=5 upgradeInFlight=2 upgradeCompiling=2 meshBuilds=0 |
| lane | 0 | sample | 2004 | queued=0 flushed=51 settled=32 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 3005 | queued=0 flushed=47 settled=36 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| opening.capturedPipelineDrain | 3003 | timeout | 3176 | captured=54 stillPending=47 |
| opening.receipt | 4 | resolved | 3180 |  |
| wait.prepareOpeningGpuResources | 3180 | resolved | 3181 |  |
| live.meshBuilds1 | 0 | resolved | 3209 | queued=0 passes=0 built=0 buildMs=0 yields=0 left=0 |
| live.openingComposition | 23 | resolved | 3233 | pending=0 |
| live.upgradeQueueIdle | 23 | resolved | 3233 | pending=0 inFlight=0 compiling=false |
| lane | 0 | sample | 4006 | queued=0 flushed=43 settled=40 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 5007 | queued=0 flushed=36 settled=47 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| live.pendingPipelines | 1885 | resolved | 5117 | captured=47 remaining=0 |
| live.rocksAndLeftoverMeshes | 5 | resolved | 5123 | firstFlightEntities=47 |
| live.meshBuilds2 | 201 | resolved | 5324 | queued=8 passes=3 built=0 buildMs=1 yields=3 left=0 |
| cook.programs | 0 | resolved | 5407 | method=first-flight-hulls |
| lane | 0 | sample | 6019 | queued=0 flushed=15 settled=85 upgradeJobs=3 upgradeInFlight=2 upgradeCompiling=3 meshBuilds=0 |
| cook.touchCompile | 707 | resolved | 6255 | issued=598 unlinked=0 yields=19 |
| lane | 0 | sample | 7004 | queued=0 flushed=6 settled=99 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=6 meshBuilds=0 |
| lane | 0 | sample | 8011 | queued=0 flushed=0 settled=105 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 9004 | queued=0 flushed=0 settled=105 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 10012 | queued=0 flushed=0 settled=105 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 11012 | queued=0 flushed=0 settled=105 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 12011 | queued=0 flushed=0 settled=105 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 13015 | queued=0 flushed=0 settled=105 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 14013 | queued=0 flushed=0 settled=105 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 15014 | queued=0 flushed=0 settled=105 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 16013 | queued=0 flushed=0 settled=105 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 17010 | queued=0 flushed=0 settled=105 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 18013 | queued=0 flushed=0 settled=105 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.touch | 755 | resolved | 18593 | subjects=598 firstPicture=70 touched=598 notReady=0 noProgram=0 switched=2 touchMs=367 maxTouchMs=2 yields=45 |
| lane | 0 | sample | 19187 | queued=0 flushed=0 settled=105 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 20031 | queued=0 flushed=0 settled=105 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 21036 | queued=0 flushed=0 settled=105 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.buffers | 2595 | resolved | 21290 | roots=94 textures=227 yields=83 |
| cook.layers | 241 | resolved | 21531 | roots=174 yields=95 |
| cook.crucibleWarm | 43 | resolved | 21587 | progress={"profile":"opening","records":41,"instantiated":1,"packageInstances":1,"paletteSubjects":43,"chunkPromotions":0,"shipKi |
| lane | 0 | sample | 22027 | queued=18 flushed=16 settled=111 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 23006 | queued=0 flushed=34 settled=111 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.rockPools | 1836 | resolved | 23528 | roots=53 units=538 issued=538 issueDedupeSkips=483 touched=538 hiddenTouchSkips=461 yields=8 issueMs=194 drainMs=1309 touchMs=275 |
| live.cook | 18204 | resolved | 23528 |  |
| live.leftoverUpgradeIdle | 0 | resolved | 23528 | pending=0 inFlight=0 compiling=false |
| live.materialSettle | 196 | resolved | 23724 | unbound=586 names=Physical racing wakes/Next checkpoint/Draft pace beacon/Massline anchors and crossing refuges/L0-L2_deep-field-composite/L3_stars/L4_flares/DeepField_helios-ecliptic-dust/DeepField_helios-left-drift/DeepField_helios-outer-shepherd/DeepFieldStructure_helios-derelict-hauler/DeepFieldStructure_helios-relay-mast |
| lane | 0 | sample | 24040 | queued=0 flushed=0 settled=145 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 25006 | queued=0 flushed=0 settled=145 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| live.postOpeningPipelines | 1865 | resolved | 25650 |  |
| live.parkWarmRoots | 4 | resolved | 25654 | roots=1 nodes=129 |
| live.firstFramePoolCensus | 1961 | resolved | 25685 |  |
| live.finalPipelineSeal | 0 | resolved | 25685 | queuedPipelines=0 |
| lane | 0 | sample | 26009 | queued=0 flushed=0 settled=145 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| wait.prepareLiveSectorBeforeFlight | 22941 | resolved | 26122 |  |
| opening.compositionTail | 2 | resolved | 26125 |  |

## Top-level entry points (inclusive)

The owner of the frame. Anything here that is not the game's own presentation frame is work
the in-engine hitch classifier cannot see.

| ms | share | entry |
|---:|---:|---|
| 10708.1 | 28.3% | `(program) @ native:0` |
| 9872.1 | 26.1% | `(idle) @ native:0` |
| 6139.9 | 16.2% | `frame @ src/core/presentationRunner.js:1060` |
| 748.5 | 2.0% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 732.9 | 1.9% | `state.render.cookLiveSceneGpu @ src/render/renderer.js:15782` |
| 690.2 | 1.8% | `window.requestIdleCallback.timeout @ src/localization/gameLocalization.js:238` |
| 645.8 | 1.7% | `prepareForFirstDraw @ src/render/uiStage.js:1120` |
| 604.9 | 1.6% | `fire @ src/render/compilePresentSlice.js:361` |
| 571.3 | 1.5% | `touchExactTargetSubjects @ src/render/renderer.js:12117` |
| 524.0 | 1.4% | `(anonymous) @ src/render/renderer.js:12837` |
| 375.4 | 1.0% | `enqueueGeometryResidencyBatches.urgent @ src/render/startupGpuResidency.js:755` |
| 333.3 | 0.9% | `(garbage collector) @ native:0` |

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
| boot-ring-layer | 300x150 | 0x0 | block | true |
| sf-capital-boss-overlay | 1833x974 | 1466x779 | block | true |
