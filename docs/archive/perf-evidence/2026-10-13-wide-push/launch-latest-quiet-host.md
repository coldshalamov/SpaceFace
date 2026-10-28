# Launch-to-flight main-thread profile

Profile: kept evidence profile `probe-keep-oct13f-000000` (reused: warm GPU program and HTTP caches). New Game seed 47.

**Launch click to flight: 14.3 s.** New Game click to flight: 15.5 s. The profile continues 10.3 s into held-thrust flight.

## Where the time went, by phase

Busy is sampled main-thread time that is not idle. `(program)` is native work outside JavaScript
(Blink, GPU command submission, compositor hand-off). A phase that is mostly idle is waiting on
something off the main thread: driver shader compiles, network, decoding workers, timers.

| phase | wall s | busy s | JS s | (program) s | idle s | GC s | long tasks (n / ms) |
|---|---:|---:|---:|---:|---:|---:|---|
| New Game screen (to Launch click) | 1.26 | 1.13 | 0.22 | 0.91 | 0.13 | 0.00 | 2 / 253 |
| Launch click to first loading stage | 0.40 | 0.39 | 0.25 | 0.14 | 0.01 | 0.00 | 1 / 103 |
| loading: authored-library | 0.41 | 0.41 | 0.26 | 0.14 | 0.00 | 0.00 | 1 / 79 |
| loading: authored-visuals | 1.89 | 1.86 | 1.45 | 0.36 | 0.03 | 0.05 | 2 / 213 |
| loading: render-pipelines | 0.03 | 0.03 | 0.02 | 0.01 | 0.00 | 0.00 | 0 / 0 |
| loading: gpu-resources | 10.22 | 9.24 | 6.48 | 2.61 | 0.98 | 0.15 | 1 / 50 |
| loading: physics-authority | 0.02 | 0.02 | 0.01 | 0.00 | 0.00 | 0.00 | 0 / 0 |
| loading: entering-flight | 1.29 | 1.02 | 0.85 | 0.16 | 0.27 | 0.01 | 4 / 335 |
| first seconds of flight | 10.26 | 10.18 | 6.69 | 3.40 | 0.08 | 0.09 | 0 / 0 |

## New Game screen (to Launch click) — 1.26 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 908.8 | 72.0% | `(program) @ native:0` |
| 63.1 | 5.0% | `getBoundingClientRect @ native:0` |
| 21.9 | 1.7% | `getBoundingClientRect @ native:0` |
| 16.3 | 1.3% | `getBoundingClientRect @ native:0` |
| 11.8 | 0.9% | `getBoundingClientRect @ native:0` |
| 9.0 | 0.7% | `getBoundingClientRect @ native:0` |
| 6.3 | 0.5% | `replaceLightNums @ vendor/three.module.js:6675` |
| 5.5 | 0.4% | `getAriaRole @ native:3159` |
| 5.0 | 0.4% | `getBoundingClientRect @ native:0` |
| 4.9 | 0.4% | `shaderSource @ native:0` |
| 3.4 | 0.3% | `isElementHiddenForAria @ native:3176` |
| 3.1 | 0.2% | `checkVisibility @ native:0` |
| 2.3 | 0.2% | `postMessage @ native:0` |
| 2.1 | 0.2% | `getAttribute @ native:0` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 908.8 | 72.0% | `(program)` |
| 168.8 | 13.4% | `(native)` |
| 129.8 | 10.3% | `(idle)` |
| 16.6 | 1.3% | `vendor/three.module.js` |
| 8.4 | 0.7% | `vendor/three.core.js` |
| 4.2 | 0.3% | `vendor/addons/loaders/GLTFLoader.js` |
| 3.2 | 0.3% | `src/ui/uiRoot.js` |
| 3.2 | 0.3% | `src/ui/orrery/hullRing.js` |
| 2.3 | 0.2% | `src/render/packageCpuDetach.js` |
| 2.1 | 0.2% | `src/render/illustratedSurface.js` |

## Launch click to first loading stage — 0.40 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 143.1 | 35.6% | `(program) @ native:0` |
| 54.1 | 13.5% | `isElementHiddenForAria @ native:3176` |
| 27.6 | 6.9% | `get offsetHeight @ native:0` |
| 24.2 | 6.0% | `getBoundingClientRect @ native:0` |
| 16.3 | 4.1% | `focus @ native:0` |
| 13.2 | 3.3% | `getBoundingClientRect @ native:0` |
| 10.7 | 2.7% | `fetch @ native:0` |
| 9.3 | 2.3% | `getTextAlternativeInternal @ native:3404` |
| 7.3 | 1.8% | `queryRole @ native:5099` |
| 7.3 | 1.8% | `fetch @ native:0` |
| 6.6 | 1.6% | `getAriaRole @ native:3159` |
| 3.6 | 0.9% | `validateNode @ src/contracts/renderPackage.js:394` |
| 3.3 | 0.8% | `validateRecords @ src/contracts/renderPackage.js:512` |
| 2.5 | 0.6% | `getBoundingClientRect @ native:0` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 210.8 | 52.4% | `(native)` |
| 143.1 | 35.6% | `(program)` |
| 12.0 | 3.0% | `src/contracts/renderPackage.js` |
| 11.4 | 2.8% | `(idle)` |
| 5.5 | 1.4% | `src/render/renderPackageLoader.js` |
| 2.2 | 0.5% | `src/render/assetResidency.js` |
| 2.1 | 0.5% | `src/ui/orrery/svg.js` |
| 2.0 | 0.5% | `src/ui/orrery/yardCarousel.js` |
| 1.5 | 0.4% | `src/ui/station/screens/events.js` |
| 1.3 | 0.3% | `src/ui/orrery/hullRing.js` |

## loading: authored-library — 0.41 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 143.8 | 35.1% | `(program) @ native:0` |
| 78.5 | 19.2% | `getProgramParameter @ native:0` |
| 24.9 | 6.1% | `getProgramParameter @ native:0` |
| 22.8 | 5.6% | `bufferData @ native:0` |
| 14.5 | 3.5% | `setLaunching @ src/ui/screens/newGame.js:846` |
| 7.8 | 1.9% | `replaceLightNums @ vendor/three.module.js:6675` |
| 5.1 | 1.3% | `cloneUniforms @ vendor/three.core.js:37307` |
| 4.1 | 1.0% | `illustratedSurfaceShader @ src/render/illustratedSurface.js:235` |
| 4.1 | 1.0% | `shaderSource @ native:0` |
| 3.5 | 0.9% | `querySelector @ native:0` |
| 3.1 | 0.8% | `compressedTexSubImage2D @ native:0` |
| 2.9 | 0.7% | `getBoundingClientRect @ native:0` |
| 2.1 | 0.5% | `(anonymous) @ src/render/uiStage.js:1151` |
| 2.1 | 0.5% | `WebGLRenderer.renderBufferDirect @ vendor/three.module.js:17381` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 156.7 | 38.2% | `(native)` |
| 143.8 | 35.1% | `(program)` |
| 58.2 | 14.2% | `vendor/three.module.js` |
| 14.5 | 3.5% | `src/ui/screens/newGame.js` |
| 9.1 | 2.2% | `vendor/three.core.js` |
| 5.1 | 1.3% | `src/render/illustratedSurface.js` |
| 4.6 | 1.1% | `src/render/packageCpuDetach.js` |
| 4.1 | 1.0% | `src/render/shaderLinkReporter.js` |
| 3.1 | 0.8% | `(idle)` |
| 3.0 | 0.7% | `src/render/glbPrepass.js` |

## loading: authored-visuals — 1.89 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 358.7 | 19.0% | `(program) @ native:0` |
| 204.4 | 10.8% | `getProgramParameter @ native:0` |
| 67.3 | 3.6% | `_createStars @ src/render/spaceBackground.js:2081` |
| 45.6 | 2.4% | `(garbage collector) @ native:0` |
| 32.7 | 1.7% | `texSubImage2D @ native:0` |
| 27.3 | 1.4% | `(anonymous) @ src/render/visualFactory.js:4942` |
| 15.3 | 0.8% | `parse @ vendor/addons/loaders/GLTFLoader.js:429` |
| 11.0 | 0.6% | `get body @ vendor/addons/loaders/GLTFLoader.js:1927` |
| 10.5 | 0.6% | `makeNoiseTexture @ src/render/canvasTextures.js:91` |
| 9.7 | 0.5% | `makeHullNormalMap @ src/render/canvasTextures.js:402` |
| 9.1 | 0.5% | `fetch @ native:0` |
| 8.3 | 0.4% | `Object3D @ vendor/three.core.js:11757` |
| 8.0 | 0.4% | `getProgramParameter @ native:0` |
| 7.4 | 0.4% | `worker.onmessage @ src/core/simLaneMain.js:1163` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 358.7 | 19.0% | `(program)` |
| 333.3 | 17.7% | `(native)` |
| 316.5 | 16.8% | `vendor/three.core.js` |
| 83.3 | 4.4% | `src/render/visualFactory.js` |
| 75.4 | 4.0% | `src/render/spaceBackground.js` |
| 63.9 | 3.4% | `vendor/addons/loaders/GLTFLoader.js` |
| 62.5 | 3.3% | `src/render/partsLibrary.js` |
| 61.4 | 3.3% | `vendor/three.module.js` |
| 57.8 | 3.1% | `src/render/renderer.js` |
| 49.4 | 2.6% | `src/render/canvasTextures.js` |

## loading: gpu-resources — 10.22 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 2605.1 | 25.5% | `(program) @ native:0` |
| 154.9 | 1.5% | `bufferData @ native:0` |
| 153.0 | 1.5% | `(garbage collector) @ native:0` |
| 76.6 | 0.7% | `syncEntityViewsSteps @ src/render/renderer.js:26772` |
| 65.8 | 0.6% | `traverse @ vendor/three.core.js:12758` |
| 54.1 | 0.5% | `texSubImage2D @ native:0` |
| 50.8 | 0.5% | `parse @ vendor/addons/loaders/GLTFLoader.js:429` |
| 45.2 | 0.4% | `releaseStatesOfObject @ vendor/three.module.js:2387` |
| 44.7 | 0.4% | `traverse @ vendor/three.core.js:12758` |
| 44.5 | 0.4% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:595` |
| 42.6 | 0.4% | `get body @ vendor/addons/loaders/GLTFLoader.js:1927` |
| 37.8 | 0.4% | `traverse @ vendor/three.core.js:12758` |
| 35.6 | 0.3% | `convertBufferAttribute @ vendor/three.core.js:19219` |
| 33.0 | 0.3% | `traverse @ vendor/three.core.js:12758` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 2605.1 | 25.5% | `(program)` |
| 1584.7 | 15.5% | `vendor/three.core.js` |
| 979.3 | 9.6% | `(idle)` |
| 837.6 | 8.2% | `(native)` |
| 691.8 | 6.8% | `vendor/three.module.js` |
| 406.7 | 4.0% | `src/render/renderer.js` |
| 305.1 | 3.0% | `src/render/openingGpuAdmission.js` |
| 229.5 | 2.2% | `vendor/addons/loaders/GLTFLoader.js` |
| 216.6 | 2.1% | `src/render/partsLibrary.js` |
| 156.7 | 1.5% | `src/contracts/renderPackage.js` |

## loading: entering-flight — 1.29 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 159.3 | 12.3% | `(program) @ native:0` |
| 56.5 | 4.4% | `syncSize @ src/ui/capitalBossOverlayMount.js:42` |
| 30.8 | 2.4% | `getBoundingClientRect @ native:0` |
| 29.2 | 2.3% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:595` |
| 27.5 | 2.1% | `traverse @ vendor/three.core.js:12758` |
| 25.1 | 1.9% | `withOnlySubjectsDrawable @ src/render/openingGpuAdmission.js:549` |
| 13.8 | 1.1% | `traverse @ vendor/three.core.js:12758` |
| 12.6 | 1.0% | `syncEntityViewsSteps @ src/render/renderer.js:26772` |
| 10.5 | 0.8% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:595` |
| 9.6 | 0.7% | `traverse @ vendor/three.core.js:12758` |
| 8.7 | 0.7% | `traverse @ vendor/three.core.js:12758` |
| 8.3 | 0.6% | `(garbage collector) @ native:0` |
| 7.6 | 0.6% | `traverse @ vendor/three.core.js:12758` |
| 7.5 | 0.6% | `syncEntityViews @ src/render/renderer.js:26744` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 273.3 | 21.1% | `(idle)` |
| 159.3 | 12.3% | `(program)` |
| 148.1 | 11.4% | `vendor/three.core.js` |
| 110.9 | 8.6% | `vendor/three.module.js` |
| 98.2 | 7.6% | `src/render/openingGpuAdmission.js` |
| 94.4 | 7.3% | `(native)` |
| 66.9 | 5.2% | `src/render/renderer.js` |
| 56.5 | 4.4% | `src/ui/capitalBossOverlayMount.js` |
| 42.0 | 3.2% | `src/render/startupGpuResidency.js` |
| 32.8 | 2.5% | `src/render/openingSubmissionPlan.js` |

## first seconds of flight — 10.26 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 3396.8 | 33.1% | `(program) @ native:0` |
| 117.1 | 1.1% | `setProgram @ vendor/three.module.js:18879` |
| 101.5 | 1.0% | `classifyWorld @ src/world/activityRuntime.js:1568` |
| 94.0 | 0.9% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 89.9 | 0.9% | `(garbage collector) @ native:0` |
| 88.6 | 0.9% | `syncEntityViewsSteps @ src/render/renderer.js:26772` |
| 85.4 | 0.8% | `upload @ vendor/three.module.js:6425` |
| 74.5 | 0.7% | `refreshUniformsCommon @ vendor/three.module.js:15342` |
| 73.9 | 0.7% | `now @ src/render/renderer.js:4144` |
| 72.9 | 0.7% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |
| 62.0 | 0.6% | `WebGLRenderer.renderBufferDirect @ vendor/three.module.js:17381` |
| 51.9 | 0.5% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |
| 47.3 | 0.5% | `unreadyDrawGuard @ src/render/bloom.js:1091` |
| 46.0 | 0.4% | `needsUpdate @ vendor/three.module.js:1952` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 3396.8 | 33.1% | `(program)` |
| 1810.3 | 17.6% | `vendor/three.module.js` |
| 638.1 | 6.2% | `(native)` |
| 620.4 | 6.0% | `vendor/three.core.js` |
| 516.1 | 5.0% | `src/render/renderer.js` |
| 272.9 | 2.7% | `src/world/activityRuntime.js` |
| 213.2 | 2.1% | `src/render/vfx.js` |
| 165.8 | 1.6% | `src/render/packageCpuDetach.js` |
| 144.8 | 1.4% | `vendor/addons/loaders/GLTFLoader.js` |
| 134.3 | 1.3% | `src/core/simLaneMain.js` |

## Long tasks from New Game to the end of the profile

| at s (after Launch) | duration ms | during |
|---:|---:|---|
| -1.0 | 167 | New Game screen (to Launch click) |
| -0.8 | 86 | New Game screen (to Launch click) |
| 0.3 | 103 | Launch click to first loading stage |
| 0.4 | 79 | loading: authored-library |
| 0.8 | 128 | loading: authored-visuals |
| 1.6 | 85 | loading: authored-visuals |
| 2.8 | 50 | loading: gpu-resources |
| 13.2 | 75 | loading: entering-flight |
| 13.3 | 135 | loading: entering-flight |
| 13.4 | 68 | loading: entering-flight |
| 13.5 | 57 | loading: entering-flight |

## Loading-screen smoothness (what the player sees)

Frame gaps are the page's own requestAnimationFrame cadence; stall ms is time beyond one 60 Hz frame. The
boot ring and the backdrop video render off the main thread, so a stall here is the DOM/labels/progress
freezing while they keep moving. Long animation frames (LoAF) name the scripts that held the frame.

| window | fps | frames | p50 ms | p95 ms | worst ms | >33 | >50 | >100 | stall ms | LoAF n / blocking ms | video dropped / played |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| New Game screen (to Launch click) | 14.3 | 18 | 33.4 | 250.0 | 250 | 7 | 4 | 3 | 866 | 8 / 378 | 0 / 0 |
| Launch click to first loading stage | 37.3 | 15 | 16.7 | 33.5 | 34 | 1 | 0 | 0 | 33 | 1 / 128 | 0 / 0 |
| loading: authored-library | 7.3 | 3 | 150.0 | 150.0 | 150 | 2 | 2 | 2 | 233 | 3 / 154 | 0 / 0 |
| loading: authored-visuals | 19.6 | 37 | 33.3 | 216.6 | 233 | 11 | 9 | 3 | 1132 | 11 / 431 | 0 / 31 |
| loading: render-pipelines | 29.4 | 1 | 0.0 | 0.0 | 0 | 0 | 0 | 0 | 0 | 1 / 6 | 0 / 0 |
| loading: gpu-resources | 43.9 | 449 | 16.7 | 50.0 | 133 | 33 | 22 | 9 | 2735 | 24 / 112 | 1 / 274 |
| loading: physics-authority | 58.8 | 1 | 0.0 | 0.0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 0 / 0 |
| loading: entering-flight | 27.8 | 36 | 33.3 | 100.0 | 200 | 7 | 6 | 1 | 683 | 3 / 175 | 0 / 23 |
| first seconds of flight | 30.1 | 309 | 33.3 | 50.0 | 150 | 77 | 36 | 1 | 5077 | 16 / 28 | 0 / 0 |

### Long animation frames in New Game screen (to Launch click): who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 223 | 1 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 158 | 1 | 138 | `BUTTON.onclick @ src/ui/kit/dom.js` |
| 33 | 2 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 30 | 2 | 27 | `ResizeObserverCallback @ src/ui/orrery/stopDial.js` |
| 22 | 1 | 15 | `BUTTON.onclick @ src/ui/screens/newGame.js` |
| 20 | 1 | 20 | `ResizeObserverCallback @ src/ui/orrery/lampKey.js` |
| 18 | 1 | 16 | `ResizeObserverCallback @ src/ui/orrery/hullRing.js` |
| 5 | 1 | 2 | `ResizeObserverCallback @ src/ui/orrery/yardCarousel.js` |

### Long animation frames in Launch click to first loading stage: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 104 | 1 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 35 | 1 | 0 | `frame @ src/core/presentationRunner.js` |
| 32 | 1 | 0 | `FrameRequestCallback @ src/render/partsLibrary.js` |
| 14 | 2 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-library: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 159 | 6 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 158 | 3 | 0 | `frame @ src/core/presentationRunner.js` |
| 53 | 2 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 5 | 1 | 0 | `FrameRequestCallback @ src/render/partsLibrary.js` |

### Long animation frames in loading: authored-visuals: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 446 | 9 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 205 | 8 | 0 | `frame @ src/core/presentationRunner.js` |
| 174 | 3 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 15 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 5 | 1 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |

### Long animation frames in loading: render-pipelines: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 68 | 3 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 8 | 1 | 0 | `fire @ src/core/backgroundPost.js` |
| 7 | 1 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |

### Long animation frames in loading: gpu-resources: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 420 | 24 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 163 | 4 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 124 | 19 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |
| 52 | 5 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 49 | 2 | 0 | `checkProgramsReady @ src/render/bloom.js` |
| 45 | 4 | 0 | `frame @ src/core/presentationRunner.js` |
| 44 | 2 | 0 | `TimerHandler:setTimeout @ (inline)` |
| 29 | 1 | 0 | `FrameRequestCallback @ src/render/partsLibrary.js` |

### Long animation frames in loading: entering-flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 207 | 3 | 57 | `frame @ src/core/presentationRunner.js` |
| 76 | 1 | 31 | `Worker.onmessage @ src/core/simLaneMain.js` |

### Long animation frames in first seconds of flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 401 | 16 | 0 | `frame @ src/core/presentationRunner.js` |
| 81 | 4 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 26 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 24 | 1 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |

## Fetched between Launch and flight

287 requests; 117.99 MB of bodies; 89.25 MB actually transferred. Delivery: 206 over the network, 56 revalidated (304), 25 straight from cache.

| type | requests | body MB | transferred MB |
|---|---:|---:|---:|
| glb | 94 | 103.75 | 78.65 |
| json | 179 | 12.52 | 8.87 |
| png | 11 | 1.72 | 1.73 |
| svg | 3 | 0.00 | 0.00 |

| largest bodies | MB | transferred MB | fetch ms |
|---|---:|---:|---:|
| `assets/ships/release/render-packages/volatiles-tanker/render.glb` | 2.59 | 2.59 | 325 |
| `assets/ships/release/render-packages/helios-cradle-dmc/render.glb` | 2.52 | 2.52 | 370 |
| `assets/ships/release/render-packages/helios-cradle/render.glb` | 2.52 | 2.52 | 44 |
| `assets/ships/release/render-packages/rescue-lifter/render.glb` | 2.49 | 2.49 | 313 |
| `assets/ships/release/render-packages/yard-tug/render.glb` | 2.41 | 2.41 | 87 |
| `assets/ships/release/render-packages/helios-arclight/render.glb` | 2.36 | 2.36 | 307 |
| `assets/ships/release/render-packages/ore-barge/render.glb` | 2.31 | 2.31 | 311 |
| `assets/ships/release/render-packages/wasp-free-militia/render.glb` | 2.12 | 2.12 | 340 |
| `assets/ships/release/render-packages/wasp-mts-escort/render.glb` | 2.12 | 2.12 | 349 |
| `assets/ships/release/render-packages/wasp-quiet-ghost/render.glb` | 2.12 | 2.12 | 293 |
| `assets/ships/release/render-packages/wasp-scn-patrol/render.glb` | 2.12 | 2.12 | 130 |
| `assets/ships/release/render-packages/helios-span-reach/render.glb` | 2.07 | 2.07 | 343 |
| `assets/ships/release/render-packages/helios-span-dmc/render.glb` | 2.07 | 2.07 | 337 |
| `assets/ships/release/render-packages/helios-span-mts/render.glb` | 2.07 | 2.07 | 339 |
| `assets/ships/release/render-packages/helios-span/render.glb` | 2.07 | 2.07 | 70 |

## Renderer resources

| moment | programs | geometries | textures | JS heap MB |
|---|---:|---:|---:|---:|
| entering flight | 149 | 2303 | 138 | 905 |
| end of profile | 149 | 2344 | 138 | 980 |

Dispose-registration probe renders: 1 at flight, 1 at end of profile (once per context generation is right).

## Draws that waited on a driver link

35 waits of 1 ms or more across 35 programs (2066 draw-path calls), 0.6 s on the main thread, longest 86 ms.

| shader family | waits (>= 1 ms) | total ms |
|---|---:|---:|
| ShaderMaterial | 7 | 142 |
| Material_Warning | 1 | 86 |
| SF_StartupGeometryResidency | 1 | 78 |
| Material_Emissive_Amber | 2 | 63 |
| MeshStandardMaterial | 4 | 58 |
| MeshDepthMaterial | 2 | 30 |
| Material_Ceramic_ice | 2 | 27 |
| SF_Shared_mechanical_dark | 1 | 21 |
| SF_Shared_canopy_none_native | 2 | 18 |
| MeshBasicMaterial | 2 | 15 |
| SF_Station_OpaqueDepthPrepass | 1 | 14 |
| Material_Stone | 1 | 13 |

- 86 ms `Material_Warning` — at timedBlockingFirstUse (http://127.0.0.1:57085/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:57085/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:57085/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:57085/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:57085/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:57085/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:57085/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:57085/vendor/three.
- 77 ms `SF_StartupGeometryResidency` — at timedBlockingFirstUse (http://127.0.0.1:57085/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:57085/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:57085/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:57085/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:57085/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:57085/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:57085/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:57085/vendor/three.
- 73 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:57085/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:57085/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:57085/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:57085/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:57085/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:57085/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:57085/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:57085/vendor/three.
- 53 ms `Material_Emissive_Amber` — at timedBlockingFirstUse (http://127.0.0.1:57085/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:57085/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:57085/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:57085/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:57085/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:57085/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:57085/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:57085/vendor/three.
- 25 ms `MeshDepthMaterial` — at timedBlockingFirstUse (http://127.0.0.1:57085/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:57085/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:57085/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:57085/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:57085/src/render/bloom.js:1142:18) | at renderShadowCaster (http://127.0.0.1:57085/vendor/three.module.js:9860:15) | at http://127.0.0.1:57085/vendor/three.module.js:9814:42 | at eachShadowCaster (http://127.0.0.1:57085/vendor/three.module
- 24 ms `MeshStandardMaterial` — at timedBlockingFirstUse (http://127.0.0.1:57085/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:57085/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:57085/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:57085/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:57085/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:57085/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:57085/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:57085/vendor/three.
- 22 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:57085/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:57085/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:57085/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:57085/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:57085/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:57085/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:57085/vendor/three.module.js:18616:6) | at renderTransmissionPass (http://127.0.0.1:57085/ve
- 21 ms `SF_Shared_mechanical_dark` — at timedBlockingFirstUse (http://127.0.0.1:57085/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:57085/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:57085/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:57085/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:57085/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:57085/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:57085/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:57085/vendor/three.

Opening work still pending when flight began: `387:missing:wreck`, `390:missing:payload`, `391:missing:payload`, `392:missing:payload`.

## Opening cook ledger

The opening cook began 2.7 s after Launch; flight began at 14.3 s. `t` is ms from the cook's start to the end of the step.

| step | ms | outcome | t ms | detail |
|---|---:|---|---:|---|
| opening.rockSurfaceLibrary | 0 | resolved | 2 |  |
| opening.firstPresentAdmission | 0 | resolved | 2 |  |
| opening.residency | 17 | resolved | 90 | subjects=86 textureRefs=31 textures=31 |
| opening.postResources | 20 | resolved | 110 | route=bloom |
| lane | 0 | sample | 1033 | queued=0 flushed=43 settled=35 upgradeJobs=2 upgradeInFlight=2 upgradeCompiling=2 meshBuilds=0 |
| opening.capturedPipelineDrain | 1461 | resolved | 1571 | captured=40 stillPending=10 |
| opening.receipt | 6 | resolved | 1577 |  |
| wait.prepareOpeningGpuResources | 1578 | resolved | 1578 |  |
| live.meshBuilds1 | 0 | resolved | 1712 | queued=0 passes=0 built=0 buildMs=0 yields=0 left=0 |
| live.openingComposition | 234 | resolved | 1947 | pending=0 |
| live.upgradeQueueIdle | 234 | resolved | 1947 | pending=0 inFlight=0 compiling=false |
| live.pendingPipelines | 0 | skipped | 1947 | captured=0 |
| live.rocksAndLeftoverMeshes | 5 | resolved | 1951 | firstFlightEntities=47 |
| live.meshBuilds2 | 52 | resolved | 2004 | queued=8 passes=3 built=0 buildMs=1 yields=3 left=0 |
| cook.programs | 0 | resolved | 2091 | method=first-flight-hulls |
| lane | 0 | sample | 2165 | queued=12 flushed=1 settled=84 upgradeJobs=4 upgradeInFlight=2 upgradeCompiling=2 meshBuilds=0 |
| cook.touchCompile | 331 | resolved | 2550 | issued=588 unlinked=0 yields=16 |
| lane | 0 | sample | 3104 | queued=0 flushed=1 settled=98 upgradeJobs=3 upgradeInFlight=2 upgradeCompiling=3 meshBuilds=0 |
| lane | 0 | sample | 4023 | queued=0 flushed=0 settled=103 upgradeJobs=0 upgradeInFlight=1 upgradeCompiling=1 meshBuilds=0 |
| cook.touch | 1677 | resolved | 4320 | subjects=588 firstPicture=70 touched=588 notReady=0 noProgram=0 switched=1 touchMs=585 maxTouchMs=6 yields=81 |
| lane | 0 | sample | 5071 | queued=0 flushed=0 settled=104 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 6056 | queued=0 flushed=0 settled=104 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.buffers | 2108 | resolved | 6542 | roots=94 textures=230 yields=65 |
| cook.layers | 99 | resolved | 6641 | roots=174 yields=70 |
| cook.crucibleWarm | 364 | resolved | 7012 | progress={"profile":"opening","records":39,"instantiated":39,"packageInstances":39,"paletteSubjects":344,"chunkPromotions":0,"shi |
| lane | 0 | sample | 7014 | queued=23 flushed=0 settled=121 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 8001 | queued=0 flushed=15 settled=129 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.rockPools | 1106 | resolved | 8259 | roots=53 units=1850 issued=1850 issueDedupeSkips=1740 touched=1850 hiddenTouchSkips=1776 yields=12 issueMs=275 drainMs=706 touchMs=57 |
| live.cook | 6255 | resolved | 8259 |  |
| live.leftoverUpgradeIdle | 0 | resolved | 8259 | pending=0 inFlight=0 compiling=false |
| lane | 0 | sample | 9011 | queued=0 flushed=0 settled=144 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| live.materialSettle | 1397 | resolved | 9656 | unbound=338 names=Physical racing wakes/Next checkpoint/Draft pace beacon/Massline anchors and crossing refuges/L6_comet/L0-L2_deep-field-composite/L3_stars/L4_flares/DeepField_helios-ecliptic-dust/DeepField_helios-left-drift/DeepField_helios-outer-shepherd/DeepFieldStructure_helios-derelict-hauler |
| live.postOpeningPipelines | 330 | resolved | 10019 |  |
| live.parkWarmRoots | 27 | resolved | 10046 | roots=1 nodes=129 stampedGeometries=615 |
| live.firstFramePoolCensus | 404 | resolved | 10061 |  |
| live.finalPipelineSeal | 0 | resolved | 10061 | queuedPipelines=0 |
| lane | 0 | sample | 10077 | queued=0 flushed=0 settled=144 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| wait.prepareLiveSectorBeforeFlight | 8636 | resolved | 10214 |  |
| opening.compositionTail | 1 | resolved | 10216 |  |

## Top-level entry points (inclusive)

The owner of the frame. Anything here that is not the game's own presentation frame is work
the in-engine hitch classifier cannot see.

| ms | share | entry |
|---:|---:|---|
| 7949.7 | 30.0% | `(program) @ native:0` |
| 7435.8 | 28.1% | `frame @ src/core/presentationRunner.js:1060` |
| 1514.4 | 5.7% | `(idle) @ native:0` |
| 920.0 | 3.5% | `state.render.cookLiveSceneGpu @ src/render/renderer.js:15800` |
| 662.6 | 2.5% | `admitOpeningUnitsAcrossSlices @ src/render/openingGpuAdmission.js:830` |
| 646.2 | 2.4% | `(anonymous) @ src/render/renderer.js:12840` |
| 603.1 | 2.3% | `fire @ src/render/compilePresentSlice.js:361` |
| 494.2 | 1.9% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 349.7 | 1.3% | `(anonymous) @ src/render/renderPackageLoader.js:324` |
| 307.3 | 1.2% | `(garbage collector) @ native:0` |
| 291.8 | 1.1% | `(anonymous) @ src/render/renderer.js:12649` |
| 272.8 | 1.0% | `buildComposedShipAsync @ src/render/partsLibrary.js:11436` |

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
