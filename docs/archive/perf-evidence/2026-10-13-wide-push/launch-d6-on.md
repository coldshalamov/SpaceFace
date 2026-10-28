# Launch-to-flight main-thread profile

Profile: kept evidence profile `probe-keep-oct13f-000000` (reused: warm GPU program and HTTP caches). New Game seed 47.

**Launch click to flight: 11.3 s.** New Game click to flight: 12.2 s. The profile continues 3.3 s into held-thrust flight.

## Where the time went, by phase

Busy is sampled main-thread time that is not idle. `(program)` is native work outside JavaScript
(Blink, GPU command submission, compositor hand-off). A phase that is mostly idle is waiting on
something off the main thread: driver shader compiles, network, decoding workers, timers.

| phase | wall s | busy s | JS s | (program) s | idle s | GC s | long tasks (n / ms) |
|---|---:|---:|---:|---:|---:|---:|---|
| New Game screen (to Launch click) | 0.85 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 1 / 123 |
| Launch click to first loading stage | 0.27 | 1.11 | 0.10 | 1.01 | 0.01 | 0.00 | 1 / 65 |
| loading: authored-library | 0.48 | 0.48 | 0.27 | 0.21 | 0.01 | 0.00 | 1 / 57 |
| loading: authored-visuals | 1.67 | 1.62 | 1.27 | 0.32 | 0.06 | 0.02 | 2 / 148 |
| loading: render-pipelines | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0 / 0 |
| loading: gpu-resources | 8.48 | 7.65 | 4.51 | 2.98 | 0.83 | 0.15 | 0 / 0 |
| loading: physics-authority | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0 / 0 |
| loading: entering-flight | 0.44 | 0.39 | 0.27 | 0.12 | 0.05 | 0.00 | 3 / 230 |
| first seconds of flight | 3.31 | 3.13 | 1.95 | 1.15 | 0.18 | 0.02 | 0 / 0 |

## New Game screen (to Launch click) — 0.85 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|

### Self time by source

| ms | share | source |
|---:|---:|---|

## loading: authored-library — 0.48 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 211.0 | 43.7% | `(program) @ native:0` |
| 52.0 | 10.8% | `getBoundingClientRect @ native:0` |
| 30.2 | 6.2% | `isElementHiddenForAria @ native:3176` |
| 19.1 | 4.0% | `get offsetHeight @ native:0` |
| 13.1 | 2.7% | `getBoundingClientRect @ native:0` |
| 12.9 | 2.7% | `getBoundingClientRect @ native:0` |
| 12.0 | 2.5% | `fetch @ native:0` |
| 11.6 | 2.4% | `getBoundingClientRect @ native:0` |
| 10.2 | 2.1% | `queryRole @ native:5099` |
| 6.5 | 1.3% | `getBoundingClientRect @ native:0` |
| 6.3 | 1.3% | `focus @ native:0` |
| 6.2 | 1.3% | `getBoundingClientRect @ native:0` |
| 5.2 | 1.1% | `fetch @ native:0` |
| 4.5 | 0.9% | `getTextAlternativeInternal @ native:3404` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 234.1 | 48.5% | `(native)` |
| 211.0 | 43.7% | `(program)` |
| 11.2 | 2.3% | `src/render/renderPackageLoader.js` |
| 5.3 | 1.1% | `(idle)` |
| 5.0 | 1.0% | `src/ui/orrery/yardCarousel.js` |
| 3.7 | 0.8% | `src/contracts/renderPackage.js` |
| 2.1 | 0.4% | `src/ui/orrery/hullRing.js` |
| 1.8 | 0.4% | `src/render/assetLoader.js` |
| 1.0 | 0.2% | `src/render/renderPackageDigest.js` |
| 1.0 | 0.2% | `src/ui/orrery/stopDial.js` |

## loading: authored-visuals — 1.67 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 324.5 | 19.4% | `(program) @ native:0` |
| 220.8 | 13.2% | `getProgramParameter @ native:0` |
| 54.7 | 3.3% | `getProgramParameter @ native:0` |
| 37.9 | 2.3% | `_createStars @ src/render/spaceBackground.js:2081` |
| 27.5 | 1.6% | `getProgramParameter @ native:0` |
| 20.0 | 1.2% | `texSubImage2D @ native:0` |
| 19.9 | 1.2% | `(garbage collector) @ native:0` |
| 17.8 | 1.1% | `(anonymous) @ src/render/visualFactory.js:4942` |
| 14.9 | 0.9% | `bufferData @ native:0` |
| 10.5 | 0.6% | `parse @ vendor/addons/loaders/GLTFLoader.js:429` |
| 10.4 | 0.6% | `setLaunching @ src/ui/screens/newGame.js:846` |
| 9.9 | 0.6% | `makeNoiseTexture @ src/render/canvasTextures.js:91` |
| 9.4 | 0.6% | `shaderSource @ native:0` |
| 8.7 | 0.5% | `makeHullNormalMap @ src/render/canvasTextures.js:402` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 434.0 | 25.9% | `(native)` |
| 324.5 | 19.4% | `(program)` |
| 219.9 | 13.1% | `vendor/three.core.js` |
| 82.8 | 4.9% | `vendor/three.module.js` |
| 61.8 | 3.7% | `src/render/visualFactory.js` |
| 56.2 | 3.4% | `(idle)` |
| 47.8 | 2.9% | `vendor/addons/loaders/GLTFLoader.js` |
| 45.9 | 2.7% | `src/render/spaceBackground.js` |
| 38.5 | 2.3% | `src/render/partsLibrary.js` |
| 36.1 | 2.2% | `src/render/canvasTextures.js` |

## loading: gpu-resources — 8.48 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 2975.5 | 35.1% | `(program) @ native:0` |
| 155.0 | 1.8% | `(garbage collector) @ native:0` |
| 89.6 | 1.1% | `getProgramParameter @ native:0` |
| 64.4 | 0.8% | `traverse @ vendor/three.core.js:12758` |
| 46.7 | 0.6% | `traverse @ vendor/three.core.js:12758` |
| 42.7 | 0.5% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:595` |
| 39.8 | 0.5% | `texSubImage2D @ native:0` |
| 38.1 | 0.4% | `syncEntityViewsSteps @ src/render/renderer.js:26772` |
| 37.5 | 0.4% | `traverse @ vendor/three.core.js:12758` |
| 37.1 | 0.4% | `releaseStatesOfObject @ vendor/three.module.js:2387` |
| 36.0 | 0.4% | `get body @ vendor/addons/loaders/GLTFLoader.js:1927` |
| 33.0 | 0.4% | `parse @ vendor/addons/loaders/GLTFLoader.js:429` |
| 33.0 | 0.4% | `traverse @ vendor/three.core.js:12758` |
| 32.0 | 0.4% | `convertBufferAttribute @ vendor/three.core.js:19219` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 2975.5 | 35.1% | `(program)` |
| 1313.1 | 15.5% | `vendor/three.core.js` |
| 830.1 | 9.8% | `(idle)` |
| 537.9 | 6.3% | `(native)` |
| 485.6 | 5.7% | `vendor/three.module.js` |
| 256.3 | 3.0% | `src/render/openingGpuAdmission.js` |
| 207.0 | 2.4% | `src/render/renderer.js` |
| 164.3 | 1.9% | `vendor/addons/loaders/GLTFLoader.js` |
| 155.0 | 1.8% | `(garbage collector)` |
| 143.7 | 1.7% | `src/render/partsLibrary.js` |

## loading: entering-flight — 0.44 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 119.7 | 27.0% | `(program) @ native:0` |
| 38.5 | 8.7% | `traverse @ vendor/three.core.js:12758` |
| 37.3 | 8.4% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:595` |
| 23.4 | 5.3% | `traverse @ vendor/three.core.js:12758` |
| 18.9 | 4.3% | `traverse @ vendor/three.core.js:12758` |
| 18.3 | 4.1% | `traverse @ vendor/three.core.js:12758` |
| 16.4 | 3.7% | `traverse @ vendor/three.core.js:12758` |
| 7.5 | 1.7% | `traverse @ vendor/three.core.js:12758` |
| 7.5 | 1.7% | `isDrawable @ src/render/openingGpuAdmission.js:112` |
| 6.5 | 1.5% | `isDrawable @ src/render/openingGpuAdmission.js:112` |
| 6.4 | 1.4% | `(anonymous) @ src/render/openingGpuAdmission.js:573` |
| 4.5 | 1.0% | `projectObject @ vendor/three.module.js:18323` |
| 4.3 | 1.0% | `traverse @ vendor/three.core.js:12758` |
| 3.2 | 0.7% | `traverse @ vendor/three.core.js:12758` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 140.8 | 31.7% | `vendor/three.core.js` |
| 119.7 | 27.0% | `(program)` |
| 74.1 | 16.7% | `src/render/openingGpuAdmission.js` |
| 53.9 | 12.1% | `(idle)` |
| 21.7 | 4.9% | `vendor/three.module.js` |
| 8.5 | 1.9% | `src/render/renderer.js` |
| 4.9 | 1.1% | `(native)` |
| 2.2 | 0.5% | `src/render/compilePresentSlice.js` |
| 2.2 | 0.5% | `src/ui/uiRoot.js` |
| 1.9 | 0.4% | `src/render/vfx.js` |

## first seconds of flight — 3.31 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 1151.9 | 34.8% | `(program) @ native:0` |
| 50.8 | 1.5% | `syncSize @ src/ui/capitalBossOverlayMount.js:42` |
| 40.0 | 1.2% | `withOnlySubjectsDrawable @ src/render/openingGpuAdmission.js:549` |
| 29.6 | 0.9% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:595` |
| 23.6 | 0.7% | `syncEntityViewsSteps @ src/render/renderer.js:26772` |
| 21.4 | 0.6% | `(garbage collector) @ native:0` |
| 21.3 | 0.6% | `getBoundingClientRect @ native:0` |
| 19.5 | 0.6% | `now @ src/render/renderer.js:4144` |
| 19.3 | 0.6% | `classifyWorld @ src/world/activityRuntime.js:1568` |
| 16.7 | 0.5% | `upload @ vendor/three.module.js:6425` |
| 15.4 | 0.5% | `setProgram @ vendor/three.module.js:18879` |
| 13.9 | 0.4% | `illustratedSurfaceShader @ src/render/illustratedSurface.js:235` |
| 11.6 | 0.4% | `get body @ vendor/addons/loaders/GLTFLoader.js:1927` |
| 11.3 | 0.3% | `compose @ vendor/three.core.js:10827` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 1151.9 | 34.8% | `(program)` |
| 424.9 | 12.9% | `vendor/three.module.js` |
| 210.4 | 6.4% | `vendor/three.core.js` |
| 203.3 | 6.1% | `(native)` |
| 180.0 | 5.4% | `(idle)` |
| 143.0 | 4.3% | `src/render/renderer.js` |
| 94.3 | 2.9% | `src/render/openingGpuAdmission.js` |
| 57.9 | 1.8% | `src/world/activityRuntime.js` |
| 50.8 | 1.5% | `src/ui/capitalBossOverlayMount.js` |
| 50.7 | 1.5% | `src/render/vfx.js` |

## Long tasks from New Game to the end of the profile

| at s (after Launch) | duration ms | during |
|---:|---:|---|
| -0.7 | 123 | New Game screen (to Launch click) |
| 0.2 | 65 | Launch click to first loading stage |
| 0.3 | 57 | loading: authored-library |
| 0.8 | 71 | loading: authored-visuals |
| 1.0 | 77 | loading: authored-visuals |
| 11.1 | 60 | loading: entering-flight |
| 11.2 | 115 | loading: entering-flight |
| 11.3 | 55 | loading: entering-flight |
| 16.6 | 56 | outside the profile |
| 17.8 | 51 | outside the profile |
| 19.3 | 55 | outside the profile |
| 20.1 | 54 | outside the profile |
| 21.1 | 59 | outside the profile |
| 21.3 | 72 | outside the profile |
| 22.4 | 79 | outside the profile |
| 22.6 | 89 | outside the profile |
| 23.6 | 60 | outside the profile |
| 24.2 | 57 | outside the profile |
| 24.8 | 57 | outside the profile |
| 25.5 | 50 | outside the profile |
| 25.7 | 61 | outside the profile |
| 26.0 | 60 | outside the profile |

## Loading-screen smoothness (what the player sees)

Frame gaps are the page's own requestAnimationFrame cadence; stall ms is time beyond one 60 Hz frame. The
boot ring and the backdrop video render off the main thread, so a stall here is the DOM/labels/progress
freezing while they keep moving. Long animation frames (LoAF) name the scripts that held the frame.

| window | fps | frames | p50 ms | p95 ms | worst ms | >33 | >50 | >100 | stall ms | LoAF n / blocking ms | video dropped / played |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| New Game screen (to Launch click) | 18.8 | 16 | 33.3 | 183.4 | 183 | 5 | 4 | 3 | 583 | 4 / 233 | 0 / 0 |
| Launch click to first loading stage | 44.3 | 12 | 16.7 | 16.7 | 17 | 0 | 0 | 0 | 0 | 1 / 68 | 0 / 0 |
| loading: authored-library | 6.2 | 3 | 250.0 | 250.0 | 250 | 2 | 2 | 1 | 300 | 3 / 184 | 0 / 0 |
| loading: authored-visuals | 32.9 | 55 | 16.7 | 100.0 | 100 | 14 | 8 | 2 | 700 | 10 / 123 | 4 / 32 |
| loading: render-pipelines | 0.0 | 0 | 0.0 | 0.0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 0 / 0 |
| loading: gpu-resources | 45.9 | 389 | 16.7 | 49.9 | 117 | 20 | 18 | 7 | 1902 | 19 / 62 | 2 / 233 |
| loading: physics-authority | 0.0 | 0 | 0.0 | 0.0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 0 / 0 |
| loading: entering-flight | 33.9 | 15 | 16.7 | 166.7 | 167 | 2 | 2 | 1 | 200 | 2 / 118 | 0 / 0 |
| first seconds of flight | 25.4 | 84 | 33.3 | 66.7 | 83 | 29 | 13 | 0 | 1881 | 14 / 0 | 0 / 11 |

### Long animation frames in New Game screen (to Launch click): who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 162 | 1 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 115 | 1 | 102 | `BUTTON.onclick @ src/ui/kit/dom.js` |
| 22 | 2 | 20 | `ResizeObserverCallback @ src/ui/orrery/stopDial.js` |
| 8 | 1 | 7 | `ResizeObserverCallback @ src/ui/orrery/hullRing.js` |
| 5 | 1 | 5 | `ResizeObserverCallback @ src/ui/orrery/lampKey.js` |

### Long animation frames in Launch click to first loading stage: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 66 | 1 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 44 | 1 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 25 | 1 | 0 | `frame @ src/core/presentationRunner.js` |
| 22 | 1 | 0 | `FrameRequestCallback @ src/render/partsLibrary.js` |
| 6 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-library: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 239 | 6 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 104 | 3 | 0 | `frame @ src/core/presentationRunner.js` |
| 28 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-visuals: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 288 | 7 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 113 | 8 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 93 | 3 | 0 | `frame @ src/core/presentationRunner.js` |
| 17 | 2 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 7 | 1 | 0 | `fire @ src/core/backgroundPost.js` |
| 7 | 1 | 0 | `checkProgramsReady @ src/render/bloom.js` |

### Long animation frames in loading: gpu-resources: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 375 | 30 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 88 | 15 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |
| 45 | 1 | 0 | `TimerHandler:setTimeout @ (inline)` |
| 38 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 26 | 1 | 0 | `checkProgramsReady @ src/render/bloom.js` |
| 24 | 3 | 0 | `frame @ src/core/presentationRunner.js` |

### Long animation frames in loading: entering-flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 133 | 2 | 50 | `frame @ src/core/presentationRunner.js` |
| 61 | 1 | 22 | `Worker.onmessage @ src/core/simLaneMain.js` |

### Long animation frames in first seconds of flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 324 | 14 | 0 | `frame @ src/core/presentationRunner.js` |
| 16 | 2 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 15 | 1 | 0 | `guarded @ src/render/renderer.js` |
| 13 | 2 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 7 | 1 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |

## Fetched between Launch and flight

253 requests; 109.91 MB of bodies; 89.15 MB actually transferred. Delivery: 204 over the network, 34 revalidated (304), 15 straight from cache.

| type | requests | body MB | transferred MB |
|---|---:|---:|---:|
| glb | 83 | 97.03 | 78.61 |
| json | 156 | 11.15 | 8.81 |
| png | 11 | 1.72 | 1.73 |
| svg | 3 | 0.00 | 0.00 |

| largest bodies | MB | transferred MB | fetch ms |
|---|---:|---:|---:|
| `assets/ships/release/render-packages/helios-trade-hub/render.glb` | 5.36 | 0.00 | 30 |
| `assets/ships/release/render-packages/volatiles-tanker/render.glb` | 2.59 | 2.59 | 321 |
| `assets/ships/release/render-packages/helios-cradle-dmc/render.glb` | 2.52 | 2.52 | 374 |
| `assets/ships/release/render-packages/helios-cradle/render.glb` | 2.52 | 2.52 | 45 |
| `assets/ships/release/render-packages/rescue-lifter/render.glb` | 2.49 | 2.49 | 297 |
| `assets/ships/release/render-packages/yard-tug/render.glb` | 2.41 | 2.41 | 19 |
| `assets/ships/release/render-packages/helios-arclight/render.glb` | 2.36 | 2.36 | 328 |
| `assets/ships/release/render-packages/ore-barge/render.glb` | 2.31 | 2.31 | 307 |
| `assets/ships/release/render-packages/wasp-free-militia/render.glb` | 2.12 | 2.12 | 357 |
| `assets/ships/release/render-packages/wasp-mts-escort/render.glb` | 2.12 | 2.12 | 330 |
| `assets/ships/release/render-packages/wasp-quiet-ghost/render.glb` | 2.12 | 2.12 | 318 |
| `assets/ships/release/render-packages/wasp-scn-patrol/render.glb` | 2.12 | 2.12 | 64 |
| `assets/ships/release/render-packages/helios-span-reach/render.glb` | 2.07 | 2.07 | 337 |
| `assets/ships/release/render-packages/helios-span-dmc/render.glb` | 2.07 | 2.07 | 329 |
| `assets/ships/release/render-packages/helios-span-mts/render.glb` | 2.07 | 2.07 | 290 |

## Renderer resources

| moment | programs | geometries | textures | JS heap MB |
|---|---:|---:|---:|---:|
| entering flight | 149 | 2381 | 126 | 815 |
| end of profile | 153 | 2590 | 126 | 1286 |

Dispose-registration probe renders: 1 at flight, 1 at end of profile (once per context generation is right).

## Draws that waited on a driver link

37 waits of 1 ms or more across 37 programs (2098 draw-path calls), 0.7 s on the main thread, longest 115 ms.

| shader family | waits (>= 1 ms) | total ms |
|---|---:|---:|
| Material_Emissive_Amber | 3 | 128 |
| SF_StartupGeometryResidency | 1 | 115 |
| ShaderMaterial | 7 | 92 |
| SF_Shared_hull_textured_hull | 1 | 65 |
| MeshStandardMaterial | 4 | 62 |
| MeshDepthMaterial | 2 | 33 |
| Material_Warning | 1 | 23 |
| Material_Ceramic_ice | 2 | 21 |
| PMREM.Background | 1 | 18 |
| SF_Shared_canopy_none_native | 2 | 17 |
| SphericalGaussianBlur | 1 | 12 |
| PMREMGGXConvolution | 1 | 11 |

- 115 ms `SF_StartupGeometryResidency` — at timedBlockingFirstUse (http://127.0.0.1:54550/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:54550/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:54550/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:54550/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:54550/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:54550/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:54550/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:54550/vendor/three.
- 114 ms `Material_Emissive_Amber` — at timedBlockingFirstUse (http://127.0.0.1:54550/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:54550/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:54550/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:54550/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:54550/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:54550/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:54550/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:54550/vendor/three.
- 65 ms `SF_Shared_hull_textured_hull` — at timedBlockingFirstUse (http://127.0.0.1:54550/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:54550/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:54550/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:54550/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:54550/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:54550/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:54550/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:54550/vendor/three.
- 54 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:54550/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:54550/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:54550/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:54550/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:54550/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:54550/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:54550/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:54550/vendor/three.
- 28 ms `MeshDepthMaterial` — at timedBlockingFirstUse (http://127.0.0.1:54550/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:54550/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:54550/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:54550/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:54550/src/render/bloom.js:1142:18) | at renderShadowCaster (http://127.0.0.1:54550/vendor/three.module.js:9860:15) | at http://127.0.0.1:54550/vendor/three.module.js:9814:42 | at eachShadowCaster (http://127.0.0.1:54550/vendor/three.module
- 24 ms `MeshStandardMaterial` — at timedBlockingFirstUse (http://127.0.0.1:54550/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:54550/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:54550/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:54550/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:54550/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:54550/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:54550/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:54550/vendor/three.
- 23 ms `Material_Warning` — at timedBlockingFirstUse (http://127.0.0.1:54550/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:54550/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:54550/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:54550/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:54550/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:54550/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:54550/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:54550/vendor/three.
- 19 ms `MeshStandardMaterial` — at timedBlockingFirstUse (http://127.0.0.1:54550/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:54550/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:54550/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:54550/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:54550/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:54550/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:54550/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:54550/vendor/three.

Opening work still pending when flight began: `402:missing:wreck`, `405:missing:payload`, `406:missing:payload`, `407:missing:payload`.

## Opening cook ledger

The opening cook began 2.4 s after Launch; flight began at 11.3 s. `t` is ms from the cook's start to the end of the step.

| step | ms | outcome | t ms | detail |
|---|---:|---|---:|---|
| opening.rockSurfaceLibrary | 0 | resolved | 1 |  |
| opening.firstPresentAdmission | 0 | resolved | 2 |  |
| opening.residency | 27 | resolved | 75 | subjects=87 textureRefs=31 textures=31 |
| opening.postResources | 4 | resolved | 79 | route=bloom |
| lane | 0 | sample | 1020 | queued=0 flushed=20 settled=60 upgradeJobs=0 upgradeInFlight=2 upgradeCompiling=2 meshBuilds=0 |
| opening.capturedPipelineDrain | 948 | resolved | 1027 | captured=34 stillPending=8 |
| opening.receipt | 7 | resolved | 1034 |  |
| wait.prepareOpeningGpuResources | 1035 | resolved | 1035 |  |
| live.meshBuilds1 | 0 | resolved | 1134 | queued=0 passes=0 built=0 buildMs=0 yields=0 left=0 |
| live.openingComposition | 173 | resolved | 1308 | pending=0 |
| live.upgradeQueueIdle | 174 | resolved | 1308 | pending=0 inFlight=0 compiling=false |
| live.pendingPipelines | 0 | skipped | 1308 | captured=0 |
| live.rocksAndLeftoverMeshes | 5 | resolved | 1312 | firstFlightEntities=47 |
| live.meshBuilds2 | 29 | resolved | 1341 | queued=8 passes=2 built=0 buildMs=0 yields=2 left=0 |
| cook.programs | 0 | resolved | 1391 | method=first-flight-hulls |
| cook.touchCompile | 263 | resolved | 1729 | issued=607 unlinked=0 yields=13 |
| lane | 0 | sample | 2013 | queued=0 flushed=15 settled=84 upgradeJobs=3 upgradeInFlight=2 upgradeCompiling=3 meshBuilds=0 |
| lane | 0 | sample | 3026 | queued=0 flushed=0 settled=104 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.touch | 1289 | resolved | 3100 | subjects=607 firstPicture=94 touched=607 notReady=0 noProgram=0 switched=2 touchMs=479 maxTouchMs=5 yields=68 |
| lane | 0 | sample | 4068 | queued=0 flushed=0 settled=104 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.buffers | 1034 | resolved | 4263 | roots=94 textures=227 yields=20 |
| lane | 0 | sample | 5029 | queued=0 flushed=0 settled=104 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.layers | 806 | resolved | 5069 | roots=174 yields=63 |
| cook.crucibleWarm | 258 | resolved | 5333 | progress={"profile":"opening","records":41,"instantiated":41,"packageInstances":41,"paletteSubjects":419,"chunkPromotions":0,"shi |
| lane | 0 | sample | 6005 | queued=0 flushed=20 settled=124 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.rockPools | 1019 | resolved | 6439 | roots=53 units=1945 issued=1945 issueDedupeSkips=1847 touched=1945 hiddenTouchSkips=1868 yields=8 issueMs=195 drainMs=685 touchMs=59 |
| live.cook | 5098 | resolved | 6439 |  |
| live.leftoverUpgradeIdle | 0 | resolved | 6439 | pending=0 inFlight=0 compiling=false |
| lane | 0 | sample | 7008 | queued=0 flushed=0 settled=144 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| live.materialSettle | 1498 | resolved | 7937 | unbound=340 names=Physical racing wakes/Next checkpoint/Draft pace beacon/Massline anchors and crossing refuges/L6_comet/L0-L2_deep-field-composite/L3_stars/L4_flares/DeepField_helios-ecliptic-dust/DeepField_helios-left-drift/DeepField_helios-outer-shepherd/DeepFieldStructure_helios-derelict-hauler |
| live.postOpeningPipelines | 373 | resolved | 8348 |  |
| live.parkWarmRoots | 26 | resolved | 8374 | roots=1 nodes=129 stampedGeometries=681 |
| live.firstFramePoolCensus | 453 | resolved | 8391 |  |
| live.finalPipelineSeal | 0 | resolved | 8391 | queuedPipelines=0 |
| lane | 0 | sample | 8397 | queued=0 flushed=0 settled=144 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| wait.prepareLiveSectorBeforeFlight | 7439 | resolved | 8474 |  |
| opening.compositionTail | 1 | resolved | 8475 |  |

## Top-level entry points (inclusive)

The owner of the frame. Anything here that is not the game's own presentation frame is work
the in-engine hitch classifier cannot see.

| ms | share | entry |
|---:|---:|---|
| 6126.4 | 37.4% | `(program) @ native:0` |
| 2506.5 | 15.3% | `frame @ src/core/presentationRunner.js:1060` |
| 1141.1 | 7.0% | `(idle) @ native:0` |
| 761.4 | 4.7% | `state.render.cookLiveSceneGpu @ src/render/renderer.js:15800` |
| 692.1 | 4.2% | `admitOpeningUnitsAcrossSlices @ src/render/openingGpuAdmission.js:830` |
| 539.2 | 3.3% | `(anonymous) @ src/render/renderer.js:12840` |
| 377.2 | 2.3% | `fire @ src/render/compilePresentSlice.js:361` |
| 255.2 | 1.6% | `buildComposedShipAsync @ src/render/partsLibrary.js:11436` |
| 229.1 | 1.4% | `touchExactTargetSubjects @ src/render/renderer.js:12120` |
| 208.2 | 1.3% | `enqueueGeometryResidencyBatches.urgent @ src/render/startupGpuResidency.js:764` |
| 204.8 | 1.3% | `(garbage collector) @ native:0` |
| 202.3 | 1.2% | `(anonymous) @ src/render/renderer.js:12649` |

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
