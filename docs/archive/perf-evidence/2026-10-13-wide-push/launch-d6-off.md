# Launch-to-flight main-thread profile

Profile: kept evidence profile `probe-keep-oct13f-000000` (reused: warm GPU program and HTTP caches). New Game seed 47.

**Launch click to flight: 14.2 s.** New Game click to flight: 15.2 s. The profile continues 3.2 s into held-thrust flight.

## Where the time went, by phase

Busy is sampled main-thread time that is not idle. `(program)` is native work outside JavaScript
(Blink, GPU command submission, compositor hand-off). A phase that is mostly idle is waiting on
something off the main thread: driver shader compiles, network, decoding workers, timers.

| phase | wall s | busy s | JS s | (program) s | idle s | GC s | long tasks (n / ms) |
|---|---:|---:|---:|---:|---:|---:|---|
| New Game screen (to Launch click) | 1.06 | 1.06 | 0.07 | 0.99 | 0.00 | 0.00 | 2 / 189 |
| Launch click to first loading stage | 0.35 | 0.33 | 0.20 | 0.12 | 0.03 | 0.00 | 1 / 109 |
| loading: authored-library | 0.63 | 0.62 | 0.46 | 0.16 | 0.01 | 0.00 | 2 / 190 |
| loading: authored-visuals | 1.38 | 1.35 | 0.97 | 0.33 | 0.03 | 0.05 | 1 / 79 |
| loading: render-pipelines | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0 / 0 |
| loading: gpu-resources | 11.35 | 9.52 | 5.44 | 3.93 | 1.83 | 0.15 | 0 / 0 |
| loading: physics-authority | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0 / 0 |
| loading: entering-flight | 0.47 | 0.41 | 0.28 | 0.13 | 0.06 | 0.00 | 3 / 242 |
| first seconds of flight | 3.25 | 3.06 | 1.87 | 1.17 | 0.18 | 0.02 | 0 / 0 |

## New Game screen (to Launch click) — 1.06 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 991.5 | 93.6% | `(program) @ native:0` |
| 6.5 | 0.6% | `replaceLightNums @ vendor/three.module.js:6675` |
| 3.3 | 0.3% | `getProgram @ vendor/three.module.js:18700` |
| 3.2 | 0.3% | `queryRole @ native:5099` |
| 2.2 | 0.2% | `illustratedSurfaceShader @ src/render/illustratedSurface.js:235` |
| 2.1 | 0.2% | `includeReplacer @ vendor/three.module.js:6714` |
| 2.1 | 0.2% | `shaderSource @ native:0` |
| 2.0 | 0.2% | `parse @ vendor/addons/loaders/GLTFLoader.js:429` |
| 1.6 | 0.2% | `getParameters @ vendor/three.module.js:7667` |
| 1.6 | 0.1% | `WebGLShader @ vendor/three.module.js:6460` |
| 1.4 | 0.1% | `get body @ vendor/addons/loaders/GLTFLoader.js:1927` |
| 1.2 | 0.1% | `addPrimitiveAttributes @ vendor/addons/loaders/GLTFLoader.js:4898` |
| 1.2 | 0.1% | `paint @ src/ui/screens/crucibleLabTelemetry.js:274` |
| 1.2 | 0.1% | `projectObject @ vendor/three.module.js:18323` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 991.5 | 93.6% | `(program)` |
| 20.3 | 1.9% | `(native)` |
| 18.9 | 1.8% | `vendor/three.module.js` |
| 9.0 | 0.8% | `vendor/three.core.js` |
| 7.9 | 0.7% | `vendor/addons/loaders/GLTFLoader.js` |
| 2.2 | 0.2% | `src/render/illustratedSurface.js` |
| 2.2 | 0.2% | `src/render/illustratedHullLayout.js` |
| 1.2 | 0.1% | `src/ui/screens/crucibleLabTelemetry.js` |
| 1.1 | 0.1% | `src/render/packageCpuDetach.js` |
| 1.0 | 0.1% | `src/render/assetResidency.js` |

## loading: authored-library — 0.63 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 172.3 | 27.4% | `bufferData @ native:0` |
| 158.8 | 25.2% | `(program) @ native:0` |
| 115.8 | 18.4% | `getProgramParameter @ native:0` |
| 25.8 | 4.1% | `getProgramParameter @ native:0` |
| 23.0 | 3.6% | `isElementHiddenForAria @ native:3176` |
| 8.8 | 1.4% | `fetch @ native:0` |
| 5.3 | 0.8% | `replaceLightNums @ vendor/three.module.js:6675` |
| 5.2 | 0.8% | `validateRecords @ src/contracts/renderPackage.js:512` |
| 4.2 | 0.7% | `queryRole @ native:5099` |
| 3.8 | 0.6% | `checkVisibility @ native:0` |
| 3.7 | 0.6% | `createVertexArray @ native:0` |
| 3.4 | 0.5% | `nowMs @ src/render/shaderLinkReporter.js:209` |
| 3.2 | 0.5% | `illustratedSurfaceShader @ src/render/illustratedSurface.js:235` |
| 3.1 | 0.5% | `elementSafeTagName @ native:2838` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 384.6 | 61.1% | `(native)` |
| 158.8 | 25.2% | `(program)` |
| 40.7 | 6.5% | `vendor/three.module.js` |
| 8.6 | 1.4% | `src/contracts/renderPackage.js` |
| 7.9 | 1.3% | `(idle)` |
| 7.6 | 1.2% | `src/render/shaderLinkReporter.js` |
| 4.4 | 0.7% | `src/render/packageCpuDetach.js` |
| 4.3 | 0.7% | `src/render/renderPackageLoader.js` |
| 3.2 | 0.5% | `src/render/illustratedSurface.js` |
| 3.0 | 0.5% | `vendor/three.core.js` |

## loading: authored-visuals — 1.38 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 333.3 | 24.1% | `(program) @ native:0` |
| 63.0 | 4.6% | `_createStars @ src/render/spaceBackground.js:2081` |
| 52.3 | 3.8% | `getProgramParameter @ native:0` |
| 50.4 | 3.7% | `(garbage collector) @ native:0` |
| 31.1 | 2.3% | `texSubImage2D @ native:0` |
| 25.6 | 1.9% | `(anonymous) @ src/render/visualFactory.js:4942` |
| 21.3 | 1.5% | `getProgramParameter @ native:0` |
| 11.4 | 0.8% | `makeNoiseTexture @ src/render/canvasTextures.js:91` |
| 10.5 | 0.8% | `getProgramParameter @ native:0` |
| 9.0 | 0.6% | `parse @ vendor/addons/loaders/GLTFLoader.js:429` |
| 8.6 | 0.6% | `makeHullNormalMap @ src/render/canvasTextures.js:402` |
| 8.4 | 0.6% | `makeHullNormalMap @ src/render/canvasTextures.js:402` |
| 8.3 | 0.6% | `setLaunching @ src/ui/screens/newGame.js:846` |
| 7.4 | 0.5% | `fetch @ native:0` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 333.3 | 24.1% | `(program)` |
| 189.6 | 13.7% | `vendor/three.core.js` |
| 165.7 | 12.0% | `(native)` |
| 83.9 | 6.1% | `src/render/visualFactory.js` |
| 74.0 | 5.4% | `src/render/spaceBackground.js` |
| 58.2 | 4.2% | `vendor/addons/loaders/GLTFLoader.js` |
| 50.4 | 3.7% | `(garbage collector)` |
| 47.3 | 3.4% | `src/render/canvasTextures.js` |
| 43.0 | 3.1% | `src/render/renderer.js` |
| 37.4 | 2.7% | `src/render/partsLibrary.js` |

## loading: gpu-resources — 11.35 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 3931.3 | 34.6% | `(program) @ native:0` |
| 151.2 | 1.3% | `(garbage collector) @ native:0` |
| 112.0 | 1.0% | `getProgramParameter @ native:0` |
| 62.9 | 0.6% | `getProgramParameter @ native:0` |
| 60.3 | 0.5% | `syncEntityViewsSteps @ src/render/renderer.js:26772` |
| 59.2 | 0.5% | `traverse @ vendor/three.core.js:12758` |
| 52.9 | 0.5% | `texSubImage2D @ native:0` |
| 46.5 | 0.4% | `releaseStatesOfObject @ vendor/three.module.js:2387` |
| 41.3 | 0.4% | `parse @ vendor/addons/loaders/GLTFLoader.js:429` |
| 38.6 | 0.3% | `fetch @ native:0` |
| 33.7 | 0.3% | `traverse @ vendor/three.core.js:12758` |
| 32.1 | 0.3% | `fetch @ native:0` |
| 32.0 | 0.3% | `convertBufferAttribute @ vendor/three.core.js:19219` |
| 29.8 | 0.3% | `get body @ vendor/addons/loaders/GLTFLoader.js:1927` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 3931.3 | 34.6% | `(program)` |
| 1826.0 | 16.1% | `(idle)` |
| 1343.3 | 11.8% | `vendor/three.core.js` |
| 712.9 | 6.3% | `(native)` |
| 647.0 | 5.7% | `vendor/three.module.js` |
| 316.4 | 2.8% | `src/render/renderer.js` |
| 234.0 | 2.1% | `src/render/openingGpuAdmission.js` |
| 185.3 | 1.6% | `vendor/addons/loaders/GLTFLoader.js` |
| 154.4 | 1.4% | `src/render/partsLibrary.js` |
| 151.2 | 1.3% | `(garbage collector)` |

## loading: entering-flight — 0.47 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 129.4 | 27.8% | `(program) @ native:0` |
| 47.4 | 10.2% | `traverse @ vendor/three.core.js:12758` |
| 26.9 | 5.8% | `traverse @ vendor/three.core.js:12758` |
| 24.2 | 5.2% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:595` |
| 13.7 | 2.9% | `traverse @ vendor/three.core.js:12758` |
| 13.5 | 2.9% | `traverse @ vendor/three.core.js:12758` |
| 11.9 | 2.6% | `traverse @ vendor/three.core.js:12758` |
| 11.4 | 2.4% | `(anonymous) @ src/render/openingGpuAdmission.js:573` |
| 8.8 | 1.9% | `traverse @ vendor/three.core.js:12758` |
| 5.4 | 1.2% | `isDrawable @ src/render/openingGpuAdmission.js:112` |
| 5.3 | 1.1% | `projectObject @ vendor/three.module.js:18323` |
| 4.7 | 1.0% | `traverse @ vendor/three.core.js:12758` |
| 4.2 | 0.9% | `traverse @ vendor/three.core.js:12758` |
| 3.2 | 0.7% | `(anonymous) @ src/render/openingGpuAdmission.js:573` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 141.6 | 30.4% | `vendor/three.core.js` |
| 129.4 | 27.8% | `(program)` |
| 58.6 | 12.6% | `src/render/openingGpuAdmission.js` |
| 55.2 | 11.8% | `(idle)` |
| 34.9 | 7.5% | `vendor/three.module.js` |
| 11.3 | 2.4% | `src/render/renderer.js` |
| 6.2 | 1.3% | `(native)` |
| 3.2 | 0.7% | `src/render/illustratedSurface.js` |
| 2.5 | 0.5% | `src/render/compilePresentSlice.js` |
| 2.5 | 0.5% | `src/ui/uiRoot.js` |

## first seconds of flight — 3.25 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 1170.5 | 36.0% | `(program) @ native:0` |
| 50.3 | 1.6% | `syncSize @ src/ui/capitalBossOverlayMount.js:42` |
| 28.6 | 0.9% | `withOnlySubjectsDrawable @ src/render/openingGpuAdmission.js:549` |
| 25.8 | 0.8% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:595` |
| 23.7 | 0.7% | `getBoundingClientRect @ native:0` |
| 23.5 | 0.7% | `(garbage collector) @ native:0` |
| 23.1 | 0.7% | `syncEntityViewsSteps @ src/render/renderer.js:26772` |
| 19.4 | 0.6% | `upload @ vendor/three.module.js:6425` |
| 16.9 | 0.5% | `setProgram @ vendor/three.module.js:18879` |
| 15.9 | 0.5% | `frame @ src/ui/hud.js:5465` |
| 12.4 | 0.4% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |
| 11.6 | 0.4% | `needsUpdate @ vendor/three.module.js:1952` |
| 11.5 | 0.4% | `setTexture2D @ vendor/three.module.js:11810` |
| 11.0 | 0.3% | `illustratedSurfaceShader @ src/render/illustratedSurface.js:235` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 1170.5 | 36.0% | `(program)` |
| 409.5 | 12.6% | `vendor/three.module.js` |
| 191.6 | 5.9% | `vendor/three.core.js` |
| 186.9 | 5.8% | `(native)` |
| 182.3 | 5.6% | `(idle)` |
| 156.6 | 4.8% | `src/render/renderer.js` |
| 76.5 | 2.4% | `src/render/openingGpuAdmission.js` |
| 53.5 | 1.6% | `src/render/packageCpuDetach.js` |
| 50.3 | 1.6% | `src/ui/capitalBossOverlayMount.js` |
| 48.0 | 1.5% | `src/render/vfx.js` |

## Long tasks from New Game to the end of the profile

| at s (after Launch) | duration ms | during |
|---:|---:|---|
| -1.0 | 125 | New Game screen (to Launch click) |
| -0.8 | 64 | New Game screen (to Launch click) |
| 0.2 | 109 | Launch click to first loading stage |
| 0.4 | 75 | loading: authored-library |
| 0.8 | 115 | loading: authored-library |
| 1.2 | 79 | loading: authored-visuals |
| 13.9 | 66 | loading: entering-flight |
| 14.0 | 124 | loading: entering-flight |
| 14.1 | 52 | loading: entering-flight |
| 19.5 | 53 | outside the profile |
| 20.7 | 58 | outside the profile |
| 20.9 | 57 | outside the profile |
| 21.9 | 60 | outside the profile |
| 23.0 | 80 | outside the profile |
| 25.1 | 81 | outside the profile |
| 25.3 | 79 | outside the profile |

## Loading-screen smoothness (what the player sees)

Frame gaps are the page's own requestAnimationFrame cadence; stall ms is time beyond one 60 Hz frame. The
boot ring and the backdrop video render off the main thread, so a stall here is the DOM/labels/progress
freezing while they keep moving. Long animation frames (LoAF) name the scripts that held the frame.

| window | fps | frames | p50 ms | p95 ms | worst ms | >33 | >50 | >100 | stall ms | LoAF n / blocking ms | video dropped / played |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| New Game screen (to Launch click) | 17.0 | 18 | 33.3 | 399.9 | 400 | 6 | 5 | 2 | 750 | 3 / 482 | 0 / 0 |
| Launch click to first loading stage | 34.0 | 12 | 16.7 | 33.4 | 33 | 0 | 0 | 0 | 34 | 1 / 129 | 0 / 0 |
| loading: authored-library | 6.4 | 4 | 150.0 | 233.3 | 233 | 3 | 3 | 3 | 467 | 4 / 164 | 0 / 0 |
| loading: authored-visuals | 29.7 | 41 | 16.7 | 100.0 | 117 | 11 | 8 | 1 | 700 | 8 / 98 | 1 / 28 |
| loading: render-pipelines | 0.0 | 0 | 0.0 | 0.0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 0 / 0 |
| loading: gpu-resources | 46.5 | 527 | 16.7 | 33.4 | 117 | 26 | 19 | 7 | 2484 | 20 / 58 | 1 / 310 |
| loading: physics-authority | 0.0 | 0 | 0.0 | 0.0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 0 / 0 |
| loading: entering-flight | 30.0 | 14 | 16.7 | 166.7 | 167 | 1 | 1 | 1 | 150 | 3 / 129 | 0 / 0 |
| first seconds of flight | 26.2 | 85 | 33.3 | 50.1 | 100 | 29 | 17 | 1 | 1814 | 11 / 0 | 1 / 14 |

### Long animation frames in New Game screen (to Launch click): who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 394 | 1 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 113 | 1 | 97 | `BUTTON.onclick @ src/ui/kit/dom.js` |
| 24 | 2 | 22 | `ResizeObserverCallback @ src/ui/orrery/stopDial.js` |
| 14 | 1 | 13 | `ResizeObserverCallback @ src/ui/orrery/hullRing.js` |
| 10 | 1 | 10 | `ResizeObserverCallback @ src/ui/orrery/lampKey.js` |

### Long animation frames in Launch click to first loading stage: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 109 | 1 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 31 | 1 | 0 | `frame @ src/core/presentationRunner.js` |
| 30 | 1 | 0 | `FrameRequestCallback @ src/render/partsLibrary.js` |

### Long animation frames in loading: authored-library: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 246 | 9 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 157 | 4 | 0 | `frame @ src/core/presentationRunner.js` |
| 56 | 4 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-visuals: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 192 | 6 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 134 | 4 | 0 | `frame @ src/core/presentationRunner.js` |
| 115 | 7 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 13 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 12 | 2 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |
| 5 | 1 | 0 | `fire @ src/core/backgroundPost.js` |

### Long animation frames in loading: gpu-resources: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 449 | 30 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 87 | 7 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 66 | 3 | 0 | `checkProgramsReady @ src/render/bloom.js` |
| 65 | 11 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |
| 44 | 6 | 0 | `frame @ src/core/presentationRunner.js` |
| 41 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 26 | 1 | 0 | `Worker.onmessage @ src/render/glbPrepass.js` |
| 7 | 1 | 0 | `Response.arrayBuffer.then @ src/render/renderPackageLoader.js` |

### Long animation frames in loading: entering-flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 153 | 3 | 51 | `frame @ src/core/presentationRunner.js` |
| 66 | 1 | 27 | `Worker.onmessage @ src/core/simLaneMain.js` |

### Long animation frames in first seconds of flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 264 | 11 | 0 | `frame @ src/core/presentationRunner.js` |

## Fetched between Launch and flight

275 requests; 117.84 MB of bodies; 89.15 MB actually transferred. Delivery: 204 over the network, 49 revalidated (304), 22 straight from cache.

| type | requests | body MB | transferred MB |
|---|---:|---:|---:|
| glb | 90 | 103.79 | 78.61 |
| json | 171 | 12.32 | 8.82 |
| png | 11 | 1.72 | 1.73 |
| svg | 3 | 0.00 | 0.00 |

| largest bodies | MB | transferred MB | fetch ms |
|---|---:|---:|---:|
| `assets/ships/release/render-packages/jump-ring/render.glb` | 3.51 | 0.00 | 82 |
| `assets/ships/release/render-packages/volatiles-tanker/render.glb` | 2.59 | 2.59 | 321 |
| `assets/ships/release/render-packages/helios-cradle-dmc/render.glb` | 2.52 | 2.52 | 422 |
| `assets/ships/release/render-packages/helios-cradle/render.glb` | 2.52 | 2.52 | 40 |
| `assets/ships/release/render-packages/rescue-lifter/render.glb` | 2.49 | 2.49 | 276 |
| `assets/ships/release/render-packages/yard-tug/render.glb` | 2.41 | 2.41 | 13 |
| `assets/ships/release/render-packages/helios-arclight/render.glb` | 2.36 | 2.36 | 253 |
| `assets/ships/release/render-packages/ore-barge/render.glb` | 2.31 | 2.31 | 253 |
| `assets/ships/release/render-packages/wasp-free-militia/render.glb` | 2.12 | 2.12 | 383 |
| `assets/ships/release/render-packages/wasp-mts-escort/render.glb` | 2.12 | 2.12 | 330 |
| `assets/ships/release/render-packages/wasp-quiet-ghost/render.glb` | 2.12 | 2.12 | 217 |
| `assets/ships/release/render-packages/wasp-scn-patrol/render.glb` | 2.12 | 2.12 | 58 |
| `assets/ships/release/render-packages/helios-span-reach/render.glb` | 2.07 | 2.07 | 334 |
| `assets/ships/release/render-packages/helios-span-dmc/render.glb` | 2.07 | 2.07 | 338 |
| `assets/ships/release/render-packages/helios-span-mts/render.glb` | 2.07 | 2.07 | 302 |

## Renderer resources

| moment | programs | geometries | textures | JS heap MB |
|---|---:|---:|---:|---:|
| entering flight | 149 | 2402 | 134 | 878 |
| end of profile | 149 | 2555 | 134 | 1057 |

Dispose-registration probe renders: 1 at flight, 1 at end of profile (once per context generation is right).

## Draws that waited on a driver link

37 waits of 1 ms or more across 37 programs (2094 draw-path calls), 0.6 s on the main thread, longest 91 ms.

| shader family | waits (>= 1 ms) | total ms |
|---|---:|---:|
| SF_StartupGeometryResidency | 1 | 91 |
| ShaderMaterial | 7 | 84 |
| Material_Emissive_Amber | 3 | 58 |
| MeshStandardMaterial | 4 | 44 |
| Material_Stone | 1 | 40 |
| MeshDepthMaterial | 2 | 33 |
| Material_Ceramic_ice | 2 | 25 |
| BackgroundCubeMaterial | 1 | 23 |
| PMREM.Background | 1 | 22 |
| SF_Shared_canopy_none_native | 2 | 21 |
| PointsMaterial | 1 | 16 |
| SF_Shared_mechanical_dark | 1 | 15 |

- 91 ms `SF_StartupGeometryResidency` — at timedBlockingFirstUse (http://127.0.0.1:54286/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:54286/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:54286/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:54286/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:54286/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:54286/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:54286/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:54286/vendor/three.
- 41 ms `Material_Emissive_Amber` — at timedBlockingFirstUse (http://127.0.0.1:54286/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:54286/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:54286/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:54286/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:54286/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:54286/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:54286/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:54286/vendor/three.
- 40 ms `Material_Stone` — at timedBlockingFirstUse (http://127.0.0.1:54286/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:54286/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:54286/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:54286/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:54286/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:54286/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:54286/vendor/three.module.js:18616:6) | at renderTransmissionPass (http://127.0.0.1:54286/ve
- 37 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:54286/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:54286/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:54286/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:54286/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:54286/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:54286/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:54286/vendor/three.module.js:18616:6) | at renderTransmissionPass (http://127.0.0.1:54286/ve
- 26 ms `MeshDepthMaterial` — at timedBlockingFirstUse (http://127.0.0.1:54286/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:54286/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:54286/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:54286/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:54286/src/render/bloom.js:1142:18) | at renderShadowCaster (http://127.0.0.1:54286/vendor/three.module.js:9860:15) | at http://127.0.0.1:54286/vendor/three.module.js:9814:42 | at eachShadowCaster (http://127.0.0.1:54286/vendor/three.module
- 22 ms `BackgroundCubeMaterial` — at timedBlockingFirstUse (http://127.0.0.1:54286/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:54286/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:54286/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:54286/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:54286/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:54286/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:54286/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:54286/vendor/three.
- 22 ms `PMREM.Background` — at timedBlockingFirstUse (http://127.0.0.1:54286/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:54286/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:54286/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:54286/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:54286/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:54286/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:54286/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:54286/vendor/three.
- 16 ms `MeshStandardMaterial` — at timedBlockingFirstUse (http://127.0.0.1:54286/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:54286/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:54286/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:54286/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:54286/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:54286/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:54286/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:54286/vendor/three.

Opening work still pending when flight began: `386:missing:wreck`, `389:missing:payload`, `390:missing:payload`, `391:missing:payload`.

## Opening cook ledger

The opening cook began 2.4 s after Launch; flight began at 14.2 s. `t` is ms from the cook's start to the end of the step.

| step | ms | outcome | t ms | detail |
|---|---:|---|---:|---|
| opening.rockSurfaceLibrary | 0 | resolved | 1 |  |
| opening.firstPresentAdmission | 0 | resolved | 1 |  |
| opening.residency | 30 | resolved | 83 | subjects=87 textureRefs=32 textures=32 |
| opening.postResources | 3 | resolved | 86 | route=bloom |
| lane | 0 | sample | 1041 | queued=0 flushed=42 settled=37 upgradeJobs=1 upgradeInFlight=2 upgradeCompiling=2 meshBuilds=0 |
| lane | 0 | sample | 2010 | queued=0 flushed=44 settled=38 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| opening.capturedPipelineDrain | 2734 | resolved | 2820 | captured=41 stillPending=11 |
| opening.receipt | 6 | resolved | 2826 |  |
| wait.prepareOpeningGpuResources | 2826 | resolved | 2826 |  |
| live.meshBuilds1 | 0 | resolved | 2992 | queued=0 passes=0 built=0 buildMs=0 yields=0 left=0 |
| live.openingComposition | 10 | resolved | 3002 | pending=0 |
| live.upgradeQueueIdle | 10 | resolved | 3002 | pending=0 inFlight=0 compiling=false |
| lane | 0 | sample | 3028 | queued=0 flushed=3 settled=79 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| live.pendingPipelines | 36 | resolved | 3038 | captured=5 remaining=0 |
| live.rocksAndLeftoverMeshes | 4 | resolved | 3042 | firstFlightEntities=47 |
| live.meshBuilds2 | 62 | resolved | 3104 | queued=9 passes=6 built=3 buildMs=3 yields=3 left=0 |
| cook.programs | 0 | resolved | 3164 | method=first-flight-hulls |
| cook.touchCompile | 221 | resolved | 3457 | issued=594 unlinked=0 yields=11 |
| lane | 0 | sample | 4045 | queued=0 flushed=1 settled=98 upgradeJobs=3 upgradeInFlight=2 upgradeCompiling=3 meshBuilds=0 |
| cook.touch | 1153 | resolved | 4670 | subjects=594 firstPicture=94 touched=594 notReady=0 noProgram=0 switched=2 touchMs=393 maxTouchMs=6 yields=58 |
| lane | 0 | sample | 5100 | queued=0 flushed=0 settled=103 upgradeJobs=0 upgradeInFlight=1 upgradeCompiling=1 meshBuilds=0 |
| lane | 0 | sample | 6031 | queued=0 flushed=0 settled=104 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=1 meshBuilds=0 |
| lane | 0 | sample | 7034 | queued=0 flushed=0 settled=104 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=1 meshBuilds=0 |
| cook.buffers | 2328 | resolved | 7093 | roots=94 textures=221 yields=71 |
| cook.layers | 147 | resolved | 7240 | roots=174 yields=78 |
| cook.crucibleWarm | 453 | resolved | 7701 | progress={"profile":"opening","records":40,"instantiated":40,"packageInstances":40,"paletteSubjects":349,"chunkPromotions":0,"shi |
| lane | 0 | sample | 8046 | queued=7 flushed=4 settled=133 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 9005 | queued=0 flushed=11 settled=133 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.rockPools | 1389 | resolved | 9307 | roots=53 units=1919 issued=1919 issueDedupeSkips=1814 touched=1919 hiddenTouchSkips=1842 yields=12 issueMs=291 drainMs=975 touchMs=68 |
| live.cook | 6203 | resolved | 9307 |  |
| live.leftoverUpgradeIdle | 0 | resolved | 9307 | pending=0 inFlight=0 compiling=false |
| lane | 0 | sample | 10009 | queued=0 flushed=0 settled=144 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| live.materialSettle | 1511 | resolved | 10818 | unbound=335 names=Physical racing wakes/Next checkpoint/Draft pace beacon/Massline anchors and crossing refuges/L6_comet/L0-L2_deep-field-composite/L3_stars/L4_flares/DeepField_helios-ecliptic-dust/DeepField_helios-left-drift/DeepField_helios-outer-shepherd/DeepFieldStructure_helios-derelict-hauler |
| live.postOpeningPipelines | 355 | resolved | 11207 |  |
| live.parkWarmRoots | 29 | resolved | 11237 | roots=1 nodes=129 stampedGeometries=702 |
| live.firstFramePoolCensus | 440 | resolved | 11258 |  |
| live.finalPipelineSeal | 0 | resolved | 11258 | queuedPipelines=0 |
| lane | 0 | sample | 11264 | queued=0 flushed=0 settled=144 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| wait.prepareLiveSectorBeforeFlight | 8515 | resolved | 11342 |  |
| opening.compositionTail | 1 | resolved | 11344 |  |

## Top-level entry points (inclusive)

The owner of the frame. Anything here that is not the game's own presentation frame is work
the in-engine hitch classifier cannot see.

| ms | share | entry |
|---:|---:|---|
| 7187.7 | 37.1% | `(program) @ native:0` |
| 2880.3 | 14.9% | `frame @ src/core/presentationRunner.js:1060` |
| 2134.3 | 11.0% | `(idle) @ native:0` |
| 672.0 | 3.5% | `admitOpeningUnitsAcrossSlices @ src/render/openingGpuAdmission.js:830` |
| 651.0 | 3.4% | `state.render.cookLiveSceneGpu @ src/render/renderer.js:15800` |
| 428.3 | 2.2% | `fire @ src/render/compilePresentSlice.js:361` |
| 399.6 | 2.1% | `prepareForFirstDraw @ src/render/uiStage.js:1120` |
| 397.1 | 2.1% | `(anonymous) @ src/render/renderer.js:12840` |
| 308.1 | 1.6% | `(anonymous) @ src/render/renderer.js:12649` |
| 296.8 | 1.5% | `enqueueGeometryResidencyBatches.urgent @ src/render/startupGpuResidency.js:764` |
| 233.3 | 1.2% | `(anonymous) @ src/render/renderPackageLoader.js:324` |
| 231.2 | 1.2% | `(garbage collector) @ native:0` |

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
