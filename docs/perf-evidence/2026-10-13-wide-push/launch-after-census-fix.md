# Launch-to-flight main-thread profile

Profile: kept evidence profile `probe-keep-oct13f-000000` (reused: warm GPU program and HTTP caches). New Game seed 47.

**Launch click to flight: 16.5 s.** New Game click to flight: 17.6 s. The profile continues 4.3 s into held-thrust flight.

## Where the time went, by phase

Busy is sampled main-thread time that is not idle. `(program)` is native work outside JavaScript
(Blink, GPU command submission, compositor hand-off). A phase that is mostly idle is waiting on
something off the main thread: driver shader compiles, network, decoding workers, timers.

| phase | wall s | busy s | JS s | (program) s | idle s | GC s | long tasks (n / ms) |
|---|---:|---:|---:|---:|---:|---:|---|
| New Game screen (to Launch click) | 1.06 | 1.05 | 0.12 | 0.93 | 0.01 | 0.01 | 3 / 247 |
| Launch click to first loading stage | 0.41 | 0.41 | 0.38 | 0.03 | 0.00 | 0.00 | 1 / 133 |
| loading: authored-library | 0.49 | 0.48 | 0.27 | 0.21 | 0.01 | 0.00 | 1 / 104 |
| loading: authored-visuals | 1.92 | 1.84 | 1.52 | 0.29 | 0.08 | 0.03 | 3 / 293 |
| loading: render-pipelines | 0.09 | 0.09 | 0.09 | 0.00 | 0.00 | 0.00 | 0 / 0 |
| loading: gpu-resources | 12.87 | 10.18 | 6.88 | 3.12 | 2.69 | 0.17 | 3 / 450 |
| loading: physics-authority | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0 / 0 |
| loading: entering-flight | 0.72 | 0.67 | 0.57 | 0.08 | 0.06 | 0.01 | 3 / 287 |
| first seconds of flight | 4.32 | 4.10 | 2.81 | 1.27 | 0.23 | 0.02 | 6 / 418 |

## New Game screen (to Launch click) — 1.06 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 925.8 | 87.1% | `(program) @ native:0` |
| 44.5 | 4.2% | `getBoundingClientRect @ native:0` |
| 7.9 | 0.7% | `replaceLightNums @ vendor/three.module.js:6675` |
| 5.8 | 0.5% | `isElementHiddenForAria @ native:3176` |
| 5.4 | 0.5% | `(garbage collector) @ native:0` |
| 4.3 | 0.4% | `shaderSource @ native:0` |
| 3.2 | 0.3% | `getAttribute @ native:0` |
| 2.3 | 0.2% | `getBoundingClientRect @ native:0` |
| 2.2 | 0.2% | `querySelectorAll @ native:0` |
| 2.1 | 0.2% | `getExplicitAriaRole @ native:3152` |
| 2.1 | 0.2% | `illustratedSurfaceShader @ src/render/illustratedSurface.js:235` |
| 2.1 | 0.2% | `getTextAlternativeInternal @ native:3404` |
| 2.1 | 0.2% | `unrollLoops @ vendor/three.module.js:6743` |
| 2.0 | 0.2% | `querySelector @ native:0` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 925.8 | 87.1% | `(program)` |
| 85.4 | 8.0% | `(native)` |
| 14.9 | 1.4% | `vendor/three.module.js` |
| 13.7 | 1.3% | `(idle)` |
| 5.4 | 0.5% | `(garbage collector)` |
| 4.1 | 0.4% | `vendor/three.core.js` |
| 2.3 | 0.2% | `src/render/packageCpuDetach.js` |
| 2.1 | 0.2% | `src/render/illustratedSurface.js` |
| 1.3 | 0.1% | `src/render/uiStage.js` |
| 1.2 | 0.1% | `src/core/simLaneMain.js` |

## Launch click to first loading stage — 0.41 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 181.9 | 44.5% | `getProgramParameter @ native:0` |
| 32.0 | 7.8% | `(program) @ native:0` |
| 28.8 | 7.0% | `getProgramParameter @ native:0` |
| 22.3 | 5.4% | `get offsetHeight @ native:0` |
| 13.6 | 3.3% | `getBoundingClientRect @ native:0` |
| 12.9 | 3.2% | `getBoundingClientRect @ native:0` |
| 10.9 | 2.7% | `getBoundingClientRect @ native:0` |
| 10.3 | 2.5% | `getBoundingClientRect @ native:0` |
| 9.7 | 2.4% | `focus @ native:0` |
| 8.8 | 2.2% | `getBoundingClientRect @ native:0` |
| 8.7 | 2.1% | `getBoundingClientRect @ native:0` |
| 8.2 | 2.0% | `getBoundingClientRect @ native:0` |
| 6.6 | 1.6% | `bufferData @ native:0` |
| 5.3 | 1.3% | `fetch @ native:0` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 350.4 | 85.7% | `(native)` |
| 32.0 | 7.8% | `(program)` |
| 7.6 | 1.9% | `vendor/three.module.js` |
| 2.2 | 0.5% | `src/ui/orrery/hullRing.js` |
| 1.3 | 0.3% | `src/render/packageCpuDetach.js` |
| 1.3 | 0.3% | `src/render/assetResidency.js` |
| 1.3 | 0.3% | `src/render/asyncAdmission.js` |
| 1.2 | 0.3% | `src/ui/uiRoot.js` |
| 1.2 | 0.3% | `src/render/uiStage.js` |
| 1.1 | 0.3% | `vendor/three.core.js` |

## loading: authored-library — 0.49 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 209.1 | 43.1% | `(program) @ native:0` |
| 91.7 | 18.9% | `getProgramParameter @ native:0` |
| 30.3 | 6.2% | `isElementHiddenForAria @ native:3176` |
| 13.0 | 2.7% | `setLaunching @ src/ui/screens/newGame.js:846` |
| 8.4 | 1.7% | `fetch @ native:0` |
| 7.8 | 1.6% | `queryRole @ native:5099` |
| 4.2 | 0.9% | `elementSafeTagName @ native:2838` |
| 3.2 | 0.7% | `replaceLightNums @ vendor/three.module.js:6675` |
| 3.2 | 0.7% | `validateGeometry @ src/contracts/renderPackage.js:423` |
| 3.2 | 0.7% | `illustratedSurfaceShader @ src/render/illustratedSurface.js:235` |
| 3.1 | 0.6% | `(anonymous) @ src/render/glbPrepass.js:72` |
| 2.8 | 0.6% | `getTextAlternativeInternal @ native:3404` |
| 2.5 | 0.5% | `getProgramCacheKey @ vendor/three.module.js:8004` |
| 2.3 | 0.5% | `upload @ vendor/three.module.js:6425` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 209.1 | 43.1% | `(program)` |
| 174.9 | 36.0% | `(native)` |
| 41.5 | 8.5% | `vendor/three.module.js` |
| 14.1 | 2.9% | `src/ui/screens/newGame.js` |
| 8.2 | 1.7% | `(idle)` |
| 7.7 | 1.6% | `src/contracts/renderPackage.js` |
| 5.1 | 1.0% | `src/render/glbPrepass.js` |
| 3.2 | 0.7% | `src/render/illustratedSurface.js` |
| 3.1 | 0.6% | `src/render/shaderLinkReporter.js` |
| 2.2 | 0.5% | `src/render/packageCpuDetach.js` |

## loading: authored-visuals — 1.92 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 292.7 | 15.2% | `(program) @ native:0` |
| 76.3 | 4.0% | `_createStars @ src/render/spaceBackground.js:2076` |
| 65.5 | 3.4% | `getProgramParameter @ native:0` |
| 51.9 | 2.7% | `texSubImage2D @ native:0` |
| 27.8 | 1.4% | `(anonymous) @ src/render/visualFactory.js:4942` |
| 26.9 | 1.4% | `(garbage collector) @ native:0` |
| 15.0 | 0.8% | `getTexture @ src/render/visualFactory.js:304` |
| 14.8 | 0.8% | `makeNoiseTexture @ src/render/canvasTextures.js:91` |
| 10.8 | 0.6% | `makeHullNormalMap @ src/render/canvasTextures.js:402` |
| 10.7 | 0.6% | `getProgramParameter @ native:0` |
| 10.5 | 0.5% | `TorusGeometry @ vendor/three.core.js:36432` |
| 10.4 | 0.5% | `get body @ vendor/addons/loaders/GLTFLoader.js:1927` |
| 10.3 | 0.5% | `parse @ vendor/addons/loaders/GLTFLoader.js:429` |
| 9.9 | 0.5% | `convertBufferAttribute @ vendor/three.core.js:19219` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 392.3 | 20.4% | `vendor/three.core.js` |
| 292.7 | 15.2% | `(program)` |
| 232.5 | 12.1% | `(native)` |
| 99.3 | 5.2% | `src/render/visualFactory.js` |
| 95.0 | 4.9% | `src/render/spaceBackground.js` |
| 78.9 | 4.1% | `(idle)` |
| 73.2 | 3.8% | `src/render/partsLibrary.js` |
| 64.6 | 3.4% | `vendor/addons/loaders/GLTFLoader.js` |
| 54.0 | 2.8% | `vendor/three.module.js` |
| 51.8 | 2.7% | `src/render/renderer.js` |

## loading: gpu-resources — 12.87 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 3123.1 | 24.3% | `(program) @ native:0` |
| 392.4 | 3.0% | `isLeftoverProgramKeyNoise @ src/render/illustratedSurface.js:119` |
| 174.8 | 1.4% | `(garbage collector) @ native:0` |
| 134.0 | 1.0% | `traverse @ vendor/three.core.js:12758` |
| 98.0 | 0.8% | `syncEntityViewsSteps @ src/render/renderer.js:26754` |
| 75.1 | 0.6% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:595` |
| 73.7 | 0.6% | `traverse @ vendor/three.core.js:12758` |
| 63.5 | 0.5% | `getProgramParameter @ native:0` |
| 63.0 | 0.5% | `traverse @ vendor/three.core.js:12758` |
| 50.6 | 0.4% | `traverse @ vendor/three.core.js:12758` |
| 44.1 | 0.3% | `parse @ vendor/addons/loaders/GLTFLoader.js:429` |
| 43.9 | 0.3% | `releaseStatesOfObject @ vendor/three.module.js:2387` |
| 37.7 | 0.3% | `convertBufferAttribute @ vendor/three.core.js:19219` |
| 35.0 | 0.3% | `convertBufferAttribute @ vendor/three.core.js:19219` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 3123.1 | 24.3% | `(program)` |
| 2687.7 | 20.9% | `(idle)` |
| 1673.1 | 13.0% | `vendor/three.core.js` |
| 710.6 | 5.5% | `(native)` |
| 652.3 | 5.1% | `vendor/three.module.js` |
| 514.5 | 4.0% | `src/render/illustratedSurface.js` |
| 405.0 | 3.1% | `src/render/renderer.js` |
| 387.4 | 3.0% | `src/render/openingGpuAdmission.js` |
| 243.7 | 1.9% | `src/render/partsLibrary.js` |
| 190.3 | 1.5% | `vendor/addons/loaders/GLTFLoader.js` |

## loading: entering-flight — 0.72 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 83.4 | 11.5% | `(program) @ native:0` |
| 39.9 | 5.5% | `traverse @ vendor/three.core.js:12758` |
| 27.6 | 3.8% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:595` |
| 23.1 | 3.2% | `withOnlySubjectsDrawable @ src/render/openingGpuAdmission.js:549` |
| 20.2 | 2.8% | `traverse @ vendor/three.core.js:12758` |
| 13.7 | 1.9% | `traverse @ vendor/three.core.js:12758` |
| 13.6 | 1.9% | `traverse @ vendor/three.core.js:12758` |
| 10.7 | 1.5% | `traverse @ vendor/three.core.js:12758` |
| 10.0 | 1.4% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:595` |
| 9.3 | 1.3% | `(garbage collector) @ native:0` |
| 9.2 | 1.3% | `compose @ vendor/three.core.js:10827` |
| 8.3 | 1.1% | `traverse @ vendor/three.core.js:12758` |
| 7.4 | 1.0% | `illustratedSurfaceShader @ src/render/illustratedSurface.js:235` |
| 7.4 | 1.0% | `projectObject @ vendor/three.module.js:18323` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 172.7 | 23.9% | `vendor/three.core.js` |
| 97.3 | 13.5% | `vendor/three.module.js` |
| 93.7 | 13.0% | `src/render/openingGpuAdmission.js` |
| 83.4 | 11.5% | `(program)` |
| 56.2 | 7.8% | `(idle)` |
| 47.9 | 6.6% | `src/render/renderer.js` |
| 30.6 | 4.2% | `(native)` |
| 25.7 | 3.6% | `src/render/startupGpuResidency.js` |
| 20.8 | 2.9% | `src/render/openingSubmissionPlan.js` |
| 12.7 | 1.8% | `src/render/illustratedSurface.js` |

## first seconds of flight — 4.32 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 1272.6 | 29.4% | `(program) @ native:0` |
| 108.9 | 2.5% | `toBlob @ native:0` |
| 57.1 | 1.3% | `getBoundingClientRect @ native:0` |
| 53.8 | 1.2% | `texSubImage2D @ native:0` |
| 38.9 | 0.9% | `syncEntityViewsSteps @ src/render/renderer.js:26754` |
| 36.7 | 0.8% | `setProgram @ vendor/three.module.js:18879` |
| 35.7 | 0.8% | `classifyWorld @ src/world/activityRuntime.js:1568` |
| 32.6 | 0.8% | `upload @ vendor/three.module.js:6425` |
| 32.0 | 0.7% | `getBoundingClientRect @ native:0` |
| 30.0 | 0.7% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 22.1 | 0.5% | `bindVertexArray @ native:0` |
| 21.9 | 0.5% | `refreshUniformsCommon @ vendor/three.module.js:15342` |
| 20.2 | 0.5% | `setValueM4 @ vendor/three.module.js:5587` |
| 19.8 | 0.5% | `frame @ src/ui/hud.js:5465` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 1272.6 | 29.4% | `(program)` |
| 587.4 | 13.6% | `vendor/three.module.js` |
| 498.9 | 11.5% | `(native)` |
| 228.6 | 5.3% | `(idle)` |
| 224.4 | 5.2% | `vendor/three.core.js` |
| 214.1 | 5.0% | `src/render/renderer.js` |
| 87.5 | 2.0% | `src/world/activityRuntime.js` |
| 79.2 | 1.8% | `src/render/vfx.js` |
| 62.2 | 1.4% | `src/render/packageCpuDetach.js` |
| 59.6 | 1.4% | `vendor/addons/loaders/GLTFLoader.js` |

## Long tasks from New Game to the end of the profile

| at s (after Launch) | duration ms | during |
|---:|---:|---|
| -0.9 | 131 | New Game screen (to Launch click) |
| -0.8 | 61 | New Game screen (to Launch click) |
| -0.3 | 55 | New Game screen (to Launch click) |
| 0.3 | 133 | Launch click to first loading stage |
| 0.4 | 104 | loading: authored-library |
| 0.9 | 146 | loading: authored-visuals |
| 1.3 | 97 | loading: authored-visuals |
| 1.4 | 50 | loading: authored-visuals |
| 2.9 | 61 | loading: gpu-resources |
| 4.4 | 50 | loading: gpu-resources |
| 10.9 | 339 | loading: gpu-resources |
| 16.0 | 81 | loading: entering-flight |
| 16.0 | 143 | loading: entering-flight |
| 16.2 | 63 | loading: entering-flight |
| 16.5 | 56 | first seconds of flight |
| 16.7 | 80 | first seconds of flight |
| 16.8 | 63 | first seconds of flight |
| 17.2 | 64 | first seconds of flight |
| 17.8 | 62 | first seconds of flight |
| 19.0 | 93 | first seconds of flight |

## Loading-screen smoothness (what the player sees)

Frame gaps are the page's own requestAnimationFrame cadence; stall ms is time beyond one 60 Hz frame. The
boot ring and the backdrop video render off the main thread, so a stall here is the DOM/labels/progress
freezing while they keep moving. Long animation frames (LoAF) name the scripts that held the frame.

| window | fps | frames | p50 ms | p95 ms | worst ms | >33 | >50 | >100 | stall ms | LoAF n / blocking ms | video dropped / played |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| New Game screen (to Launch click) | 16.0 | 17 | 33.3 | 399.9 | 400 | 6 | 3 | 2 | 766 | 5 / 477 | 0 / 0 |
| Launch click to first loading stage | 36.7 | 15 | 16.7 | 33.3 | 33 | 0 | 0 | 0 | 33 | 1 / 179 | 0 / 0 |
| loading: authored-library | 6.2 | 3 | 183.3 | 183.3 | 183 | 2 | 2 | 2 | 283 | 3 / 191 | 0 / 0 |
| loading: authored-visuals | 22.4 | 43 | 33.3 | 116.6 | 150 | 17 | 11 | 3 | 983 | 11 / 211 | 3 / 44 |
| loading: render-pipelines | 55.6 | 5 | 16.7 | 16.7 | 17 | 0 | 0 | 0 | 0 | 1 / 18 | 0 / 0 |
| loading: gpu-resources | 47.8 | 615 | 16.7 | 50.0 | 333 | 34 | 26 | 6 | 2624 | 20 / 342 | 3 / 345 |
| loading: physics-authority | 1000.0 | 1 | 0.0 | 0.0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 0 / 0 |
| loading: entering-flight | 24.9 | 18 | 16.7 | 200.0 | 200 | 6 | 3 | 2 | 400 | 4 / 171 | 0 / 12 |
| first seconds of flight | 25.0 | 108 | 33.3 | 83.2 | 100 | 40 | 25 | 2 | 2480 | 18 / 147 | 0 / 6 |

### Long animation frames in New Game screen (to Launch click): who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 385 | 1 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 122 | 1 | 107 | `BUTTON.onclick @ src/ui/kit/dom.js` |
| 29 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 24 | 2 | 22 | `ResizeObserverCallback @ src/ui/orrery/stopDial.js` |
| 21 | 1 | 14 | `BUTTON.onclick @ src/ui/screens/newGame.js` |
| 11 | 1 | 10 | `ResizeObserverCallback @ src/ui/orrery/hullRing.js` |
| 9 | 1 | 9 | `ResizeObserverCallback @ src/ui/orrery/lampKey.js` |

### Long animation frames in Launch click to first loading stage: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 134 | 1 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 48 | 1 | 0 | `FrameRequestCallback @ src/render/partsLibrary.js` |
| 39 | 1 | 0 | `frame @ src/core/presentationRunner.js` |
| 7 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-library: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 194 | 6 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 189 | 3 | 0 | `frame @ src/core/presentationRunner.js` |
| 58 | 3 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-visuals: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 310 | 9 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 223 | 8 | 0 | `frame @ src/core/presentationRunner.js` |
| 134 | 7 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 12 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 5 | 1 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |

### Long animation frames in loading: render-pipelines: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 77 | 3 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 8 | 1 | 0 | `fire @ src/core/backgroundPost.js` |

### Long animation frames in loading: gpu-resources: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 412 | 30 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 373 | 6 | 0 | `frame @ src/core/presentationRunner.js` |
| 92 | 2 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 57 | 10 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |
| 56 | 2 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 32 | 2 | 0 | `checkProgramsReady @ src/render/bloom.js` |

### Long animation frames in loading: entering-flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 221 | 4 | 61 | `frame @ src/core/presentationRunner.js` |
| 81 | 1 | 34 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 6 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in first seconds of flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 546 | 18 | 0 | `frame @ src/core/presentationRunner.js` |
| 112 | 3 | 0 | `capture @ src/ui/screens/flightFootage.js` |
| 18 | 3 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 16 | 1 | 0 | `guarded @ src/render/renderer.js` |
| 7 | 1 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 5 | 1 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |

## Fetched between Launch and flight

271 requests; 112.20 MB of bodies; 89.15 MB actually transferred. Delivery: 204 over the network, 45 revalidated (304), 22 straight from cache.

| type | requests | body MB | transferred MB |
|---|---:|---:|---:|
| glb | 90 | 98.74 | 78.61 |
| json | 167 | 11.73 | 8.82 |
| png | 11 | 1.72 | 1.73 |
| svg | 3 | 0.00 | 0.00 |

| largest bodies | MB | transferred MB | fetch ms |
|---|---:|---:|---:|
| `assets/ships/release/render-packages/volatiles-tanker/render.glb` | 2.59 | 2.59 | 304 |
| `assets/ships/release/render-packages/helios-cradle-dmc/render.glb` | 2.52 | 2.52 | 358 |
| `assets/ships/release/render-packages/helios-cradle/render.glb` | 2.52 | 2.52 | 44 |
| `assets/ships/release/render-packages/rescue-lifter/render.glb` | 2.49 | 2.49 | 267 |
| `assets/ships/release/render-packages/yard-tug/render.glb` | 2.41 | 2.41 | 61 |
| `assets/ships/release/render-packages/helios-arclight/render.glb` | 2.36 | 2.36 | 250 |
| `assets/ships/release/render-packages/ore-barge/render.glb` | 2.31 | 2.31 | 244 |
| `assets/ships/release/render-packages/wasp-free-militia/render.glb` | 2.12 | 2.12 | 292 |
| `assets/ships/release/render-packages/wasp-mts-escort/render.glb` | 2.12 | 2.12 | 308 |
| `assets/ships/release/render-packages/wasp-quiet-ghost/render.glb` | 2.12 | 2.12 | 240 |
| `assets/ships/release/render-packages/wasp-scn-patrol/render.glb` | 2.12 | 2.12 | 115 |
| `assets/ships/release/render-packages/helios-span-reach/render.glb` | 2.07 | 2.07 | 290 |
| `assets/ships/release/render-packages/helios-span-dmc/render.glb` | 2.07 | 2.07 | 295 |
| `assets/ships/release/render-packages/helios-span-mts/render.glb` | 2.07 | 2.07 | 289 |
| `assets/ships/release/render-packages/helios-span/render.glb` | 2.07 | 2.07 | 47 |

## Renderer resources

| moment | programs | geometries | textures | JS heap MB |
|---|---:|---:|---:|---:|
| entering flight | 148 | 2347 | 130 | 831 |
| end of profile | 148 | 2370 | 132 | 973 |

Dispose-registration probe renders: 1 at flight, 1 at end of profile (once per context generation is right).

## Draws that waited on a driver link

37 waits of 1 ms or more across 37 programs (2055 draw-path calls), 0.7 s on the main thread, longest 162 ms.

| shader family | waits (>= 1 ms) | total ms |
|---|---:|---:|
| ShaderMaterial | 8 | 171 |
| Material_Stone | 1 | 162 |
| MeshStandardMaterial | 5 | 69 |
| Material_Emissive_Amber | 2 | 56 |
| MeshDepthMaterial | 2 | 37 |
| SphericalGaussianBlur | 1 | 29 |
| SF_Shared_mechanical_dark | 1 | 28 |
| Material_Ceramic_ice | 2 | 26 |
| MeshBasicMaterial | 2 | 25 |
| SF_Shared_canopy_none_native | 2 | 23 |
| Material_Warning | 1 | 18 |
| SF_Shared_none_none_native | 1 | 12 |

- 162 ms `Material_Stone` — at timedBlockingFirstUse (http://127.0.0.1:58637/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:58637/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:58637/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:58637/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:58637/src/render/bloom.js:1133:18) | at renderObject (http://127.0.0.1:58637/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:58637/vendor/three.module.js:18616:6) | at renderTransmissionPass (http://127.0.0.1:58637/ve
- 70 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:58637/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:58637/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:58637/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:58637/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:58637/src/render/bloom.js:1133:18) | at renderObject (http://127.0.0.1:58637/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:58637/vendor/three.module.js:18616:6) | at renderTransmissionPass (http://127.0.0.1:58637/ve
- 59 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:58637/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:58637/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:58637/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:58637/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:58637/src/render/bloom.js:1133:18) | at renderObject (http://127.0.0.1:58637/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:58637/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:58637/vendor/three.
- 48 ms `Material_Emissive_Amber` — at timedBlockingFirstUse (http://127.0.0.1:58637/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:58637/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:58637/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:58637/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:58637/src/render/bloom.js:1133:18) | at renderObject (http://127.0.0.1:58637/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:58637/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:58637/vendor/three.
- 29 ms `MeshDepthMaterial` — at timedBlockingFirstUse (http://127.0.0.1:58637/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:58637/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:58637/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:58637/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:58637/src/render/bloom.js:1133:18) | at renderShadowCaster (http://127.0.0.1:58637/vendor/three.module.js:9860:15) | at http://127.0.0.1:58637/vendor/three.module.js:9814:42 | at eachShadowCaster (http://127.0.0.1:58637/vendor/three.module
- 29 ms `SphericalGaussianBlur` — at timedBlockingFirstUse (http://127.0.0.1:58637/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:58637/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:58637/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:58637/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:58637/src/render/bloom.js:1133:18) | at renderObject (http://127.0.0.1:58637/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:58637/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:58637/vendor/three.
- 28 ms `SF_Shared_mechanical_dark` — at timedBlockingFirstUse (http://127.0.0.1:58637/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:58637/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:58637/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:58637/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:58637/src/render/bloom.js:1133:18) | at renderObject (http://127.0.0.1:58637/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:58637/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:58637/vendor/three.
- 20 ms `MeshBasicMaterial` — at timedBlockingFirstUse (http://127.0.0.1:58637/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:58637/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:58637/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:58637/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:58637/src/render/bloom.js:1133:18) | at renderObject (http://127.0.0.1:58637/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:58637/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:58637/vendor/three.

Opening work still pending when flight began: `392:missing:wreck`, `395:missing:payload`, `396:missing:payload`, `397:missing:payload`.

## Opening cook ledger

The opening cook began 2.9 s after Launch; flight began at 16.5 s. `t` is ms from the cook's start to the end of the step.

| step | ms | outcome | t ms | detail |
|---|---:|---|---:|---|
| opening.rockSurfaceLibrary | 0 | resolved | 2 |  |
| opening.firstPresentAdmission | 0 | resolved | 2 |  |
| opening.residency | 54 | resolved | 126 | subjects=86 textureRefs=31 textures=31 |
| opening.postResources | 6 | resolved | 133 | route=bloom |
| lane | 0 | sample | 1039 | queued=0 flushed=53 settled=22 upgradeJobs=5 upgradeInFlight=2 upgradeCompiling=2 meshBuilds=0 |
| lane | 0 | sample | 2005 | queued=0 flushed=52 settled=30 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 3009 | queued=0 flushed=43 settled=39 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| opening.capturedPipelineDrain | 3005 | timeout | 3138 | captured=54 stillPending=43 |
| opening.receipt | 3 | resolved | 3141 |  |
| wait.prepareOpeningGpuResources | 3141 | resolved | 3141 |  |
| live.meshBuilds1 | 0 | resolved | 3171 | queued=0 passes=0 built=0 buildMs=0 yields=0 left=0 |
| live.openingComposition | 16 | resolved | 3188 | pending=0 |
| live.upgradeQueueIdle | 17 | resolved | 3188 | pending=0 inFlight=0 compiling=false |
| live.pendingPipelines | 704 | resolved | 3892 | captured=43 remaining=0 |
| live.rocksAndLeftoverMeshes | 4 | resolved | 3896 | firstFlightEntities=46 |
| live.meshBuilds2 | 88 | resolved | 3985 | queued=7 passes=2 built=0 buildMs=0 yields=2 left=0 |
| cook.programs | 0 | resolved | 4037 | method=first-flight-hulls |
| lane | 0 | sample | 4105 | queued=12 flushed=1 settled=84 upgradeJobs=3 upgradeInFlight=2 upgradeCompiling=2 meshBuilds=0 |
| cook.touchCompile | 444 | resolved | 4561 | issued=584 unlinked=0 yields=10 |
| lane | 0 | sample | 5026 | queued=0 flushed=4 settled=98 upgradeJobs=0 upgradeInFlight=1 upgradeCompiling=5 meshBuilds=0 |
| cook.touch | 913 | resolved | 5525 | subjects=584 firstPicture=94 touched=584 notReady=0 noProgram=0 switched=2 touchMs=359 maxTouchMs=5 yields=51 |
| lane | 0 | sample | 6124 | queued=0 flushed=0 settled=103 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.buffers | 886 | resolved | 6508 | roots=93 textures=227 yields=17 |
| lane | 0 | sample | 7031 | queued=0 flushed=0 settled=103 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.layers | 782 | resolved | 7290 | roots=174 yields=59 |
| cook.crucibleWarm | 383 | resolved | 7679 | progress={"profile":"opening","records":40,"instantiated":40,"packageInstances":40,"paletteSubjects":295,"chunkPromotions":0,"shi |
| lane | 0 | sample | 8034 | queued=2 flushed=9 settled=132 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 9008 | queued=0 flushed=11 settled=132 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.rockPools | 2221 | resolved | 10002 | roots=52 units=1832 issued=1832 issueDedupeSkips=1736 touched=1832 hiddenTouchSkips=1759 yields=10 issueMs=241 drainMs=1849 touchMs=73 |
| live.cook | 6017 | resolved | 10002 |  |
| live.leftoverUpgradeIdle | 0 | resolved | 10002 | pending=0 inFlight=0 compiling=false |
| lane | 0 | sample | 10011 | queued=0 flushed=0 settled=143 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 11027 | queued=0 flushed=0 settled=143 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 12014 | queued=0 flushed=0 settled=143 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| live.materialSettle | 2309 | resolved | 12311 | unbound=412 names=Physical racing wakes/Next checkpoint/Draft pace beacon/Massline anchors and crossing refuges/L6_comet/L0-L2_deep-field-composite/L3_stars/L4_flares/DeepField_helios-ecliptic-dust/DeepField_helios-left-drift/DeepField_helios-outer-shepherd/DeepFieldStructure_helios-derelict-hauler |
| live.postOpeningPipelines | 332 | resolved | 12687 |  |
| live.parkWarmRoots | 31 | resolved | 12718 | roots=1 nodes=129 stampedGeometries=653 |
| live.firstFramePoolCensus | 430 | resolved | 12741 |  |
| live.finalPipelineSeal | 0 | resolved | 12741 | queuedPipelines=0 |
| wait.prepareLiveSectorBeforeFlight | 9722 | resolved | 12864 |  |
| opening.compositionTail | 1 | resolved | 12865 |  |

## Top-level entry points (inclusive)

The owner of the frame. Anything here that is not the game's own presentation frame is work
the in-engine hitch classifier cannot see.

| ms | share | entry |
|---:|---:|---|
| 6157.7 | 27.2% | `(program) @ native:0` |
| 4301.6 | 19.0% | `frame @ src/core/presentationRunner.js:1060` |
| 3078.6 | 13.6% | `(idle) @ native:0` |
| 1136.4 | 5.0% | `admitOpeningUnitsAcrossSlices @ src/render/openingGpuAdmission.js:830` |
| 609.3 | 2.7% | `state.render.cookLiveSceneGpu @ src/render/renderer.js:15782` |
| 495.8 | 2.2% | `(anonymous) @ src/render/renderer.js:9457` |
| 494.0 | 2.2% | `(anonymous) @ src/render/renderer.js:12837` |
| 439.8 | 1.9% | `fire @ src/render/compilePresentSlice.js:361` |
| 387.7 | 1.7% | `prepareForFirstDraw @ src/render/uiStage.js:1120` |
| 318.3 | 1.4% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 296.1 | 1.3% | `buildComposedShipAsync @ src/render/partsLibrary.js:11436` |
| 265.2 | 1.2% | `driveAuthoredBuildStepsAsync @ src/render/partsLibrary.js:11513` |

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
