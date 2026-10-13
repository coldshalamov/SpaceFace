# Launch-to-flight main-thread profile

Profile: kept evidence profile `probe-keep-oct13f-000000` (reused: warm GPU program and HTTP caches). New Game seed 47.

**Launch click to flight: 12.1 s.** New Game click to flight: 12.4 s. The profile continues 6.2 s into held-thrust flight.

## Where the time went, by phase

Busy is sampled main-thread time that is not idle. `(program)` is native work outside JavaScript
(Blink, GPU command submission, compositor hand-off). A phase that is mostly idle is waiting on
something off the main thread: driver shader compiles, network, decoding workers, timers.

| phase | wall s | busy s | JS s | (program) s | idle s | GC s | long tasks (n / ms) |
|---|---:|---:|---:|---:|---:|---:|---|
| New Game screen (to Launch click) | 0.27 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 3 / 218 |
| Launch click to first loading stage | 0.49 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 2 / 174 |
| loading: authored-library | 0.35 | 1.11 | 0.06 | 1.05 | 0.00 | 0.00 | 1 / 70 |
| loading: authored-visuals | 1.60 | 1.49 | 1.05 | 0.43 | 0.10 | 0.01 | 2 / 153 |
| loading: render-pipelines | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0 / 0 |
| loading: gpu-resources | 9.02 | 7.92 | 5.81 | 1.97 | 1.10 | 0.14 | 0 / 0 |
| loading: physics-authority | 0.02 | 0.01 | 0.01 | 0.00 | 0.00 | 0.00 | 0 / 0 |
| loading: entering-flight | 0.61 | 0.58 | 0.50 | 0.08 | 0.04 | 0.00 | 5 / 423 |
| first seconds of flight | 6.22 | 6.01 | 4.03 | 1.94 | 0.21 | 0.04 | 2 / 102 |

## Launch click to first loading stage — 0.49 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|

### Self time by source

| ms | share | source |
|---:|---:|---|

## loading: authored-visuals — 1.60 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 427.8 | 26.8% | `(program) @ native:0` |
| 55.6 | 3.5% | `_createStars @ src/render/spaceBackground.js:2081` |
| 41.1 | 2.6% | `texSubImage2D @ native:0` |
| 24.5 | 1.5% | `makeNoiseTexture @ src/render/canvasTextures.js:91` |
| 21.3 | 1.3% | `makeHullNormalMap @ src/render/canvasTextures.js:402` |
| 18.7 | 1.2% | `(anonymous) @ src/render/visualFactory.js:4942` |
| 18.2 | 1.1% | `getProgramParameter @ native:0` |
| 18.1 | 1.1% | `getBoundingClientRect @ native:0` |
| 17.6 | 1.1% | `get offsetHeight @ native:0` |
| 13.2 | 0.8% | `setLaunching @ src/ui/screens/newGame.js:846` |
| 13.1 | 0.8% | `TorusGeometry @ vendor/three.core.js:36432` |
| 11.7 | 0.7% | `(garbage collector) @ native:0` |
| 10.4 | 0.7% | `querySelector @ native:0` |
| 9.4 | 0.6% | `get body @ vendor/addons/loaders/GLTFLoader.js:1927` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 427.8 | 26.8% | `(program)` |
| 219.7 | 13.8% | `(native)` |
| 200.3 | 12.5% | `vendor/three.core.js` |
| 102.4 | 6.4% | `(idle)` |
| 66.2 | 4.1% | `src/render/visualFactory.js` |
| 65.4 | 4.1% | `src/render/spaceBackground.js` |
| 58.0 | 3.6% | `src/render/canvasTextures.js` |
| 53.2 | 3.3% | `vendor/three.module.js` |
| 52.4 | 3.3% | `src/render/renderer.js` |
| 40.6 | 2.5% | `src/contracts/renderPackage.js` |

## loading: gpu-resources — 9.02 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 1967.3 | 21.8% | `(program) @ native:0` |
| 144.1 | 1.6% | `(garbage collector) @ native:0` |
| 131.6 | 1.5% | `getProgramParameter @ native:0` |
| 113.0 | 1.3% | `traverse @ vendor/three.core.js:12758` |
| 93.5 | 1.0% | `bufferData @ native:0` |
| 76.0 | 0.8% | `traverse @ vendor/three.core.js:12758` |
| 59.1 | 0.7% | `syncEntityViewsSteps @ src/render/renderer.js:26778` |
| 54.4 | 0.6% | `fetch @ native:0` |
| 46.5 | 0.5% | `releaseStatesOfObject @ vendor/three.module.js:2387` |
| 45.6 | 0.5% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:595` |
| 43.8 | 0.5% | `traverse @ vendor/three.core.js:12758` |
| 40.6 | 0.4% | `texSubImage2D @ native:0` |
| 34.5 | 0.4% | `computePlainFloat32Bounds @ src/render/packageCpuDetach.js:324` |
| 31.2 | 0.3% | `digest @ native:0` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 1967.3 | 21.8% | `(program)` |
| 1418.2 | 15.7% | `vendor/three.core.js` |
| 1104.0 | 12.2% | `(idle)` |
| 808.9 | 9.0% | `(native)` |
| 709.0 | 7.9% | `vendor/three.module.js` |
| 315.7 | 3.5% | `src/render/renderer.js` |
| 292.0 | 3.2% | `src/render/openingGpuAdmission.js` |
| 204.9 | 2.3% | `src/render/partsLibrary.js` |
| 174.4 | 1.9% | `vendor/addons/loaders/GLTFLoader.js` |
| 144.1 | 1.6% | `(garbage collector)` |

## loading: entering-flight — 0.61 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 78.4 | 12.7% | `(program) @ native:0` |
| 40.1 | 6.5% | `traverse @ vendor/three.core.js:12758` |
| 22.6 | 3.7% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:595` |
| 22.4 | 3.6% | `traverse @ vendor/three.core.js:12758` |
| 17.7 | 2.9% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:595` |
| 17.4 | 2.8% | `traverse @ vendor/three.core.js:12758` |
| 14.5 | 2.3% | `traverse @ vendor/three.core.js:12758` |
| 13.3 | 2.1% | `withOnlySubjectsDrawable @ src/render/openingGpuAdmission.js:549` |
| 13.1 | 2.1% | `compose @ vendor/three.core.js:10827` |
| 11.5 | 1.9% | `yieldToBrowser @ src/render/startupGpuResidency.js:1017` |
| 9.1 | 1.5% | `traverse @ vendor/three.core.js:12758` |
| 9.1 | 1.5% | `subjectsForCompileRoots @ src/render/renderer.js:18091` |
| 9.0 | 1.5% | `openingCompileIssueKey @ src/render/renderer.js:1696` |
| 9.0 | 1.5% | `collectInstancePoolCompileRootsAndSubjectsSteps @ src/render/latePipelineAdmission.js:389` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 175.9 | 28.5% | `vendor/three.core.js` |
| 78.4 | 12.7% | `(program)` |
| 75.3 | 12.2% | `src/render/renderer.js` |
| 72.1 | 11.7% | `src/render/openingGpuAdmission.js` |
| 54.4 | 8.8% | `vendor/three.module.js` |
| 36.7 | 5.9% | `(idle)` |
| 25.1 | 4.1% | `src/render/startupGpuResidency.js` |
| 18.2 | 3.0% | `src/render/openingSubmissionPlan.js` |
| 15.8 | 2.6% | `(native)` |
| 9.2 | 1.5% | `src/world/activityRuntime.js` |

## first seconds of flight — 6.22 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 1937.5 | 31.2% | `(program) @ native:0` |
| 98.9 | 1.6% | `syncSize @ src/ui/capitalBossOverlayMount.js:42` |
| 65.4 | 1.1% | `classifyWorld @ src/world/activityRuntime.js:1568` |
| 58.4 | 0.9% | `upload @ vendor/three.module.js:6425` |
| 56.6 | 0.9% | `withOnlySubjectsDrawable @ src/render/openingGpuAdmission.js:549` |
| 52.8 | 0.8% | `setProgram @ vendor/three.module.js:18879` |
| 46.4 | 0.7% | `syncEntityViewsSteps @ src/render/renderer.js:26778` |
| 42.6 | 0.7% | `(garbage collector) @ native:0` |
| 40.0 | 0.6% | `bindVertexArray @ native:0` |
| 36.6 | 0.6% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:595` |
| 33.4 | 0.5% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |
| 31.9 | 0.5% | `get body @ vendor/addons/loaders/GLTFLoader.js:1927` |
| 31.6 | 0.5% | `getBoundingClientRect @ native:0` |
| 31.3 | 0.5% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 1937.5 | 31.2% | `(program)` |
| 951.9 | 15.3% | `vendor/three.module.js` |
| 384.3 | 6.2% | `(native)` |
| 341.5 | 5.5% | `vendor/three.core.js` |
| 273.9 | 4.4% | `src/render/renderer.js` |
| 208.4 | 3.4% | `(idle)` |
| 140.4 | 2.3% | `src/world/activityRuntime.js` |
| 123.7 | 2.0% | `src/render/openingGpuAdmission.js` |
| 103.0 | 1.7% | `src/render/vfx.js` |
| 99.0 | 1.6% | `src/ui/capitalBossOverlayMount.js` |

## Long tasks from New Game to the end of the profile

| at s (after Launch) | duration ms | during |
|---:|---:|---|
| -0.2 | 110 | New Game screen (to Launch click) |
| -0.1 | 50 | New Game screen (to Launch click) |
| -0.1 | 58 | New Game screen (to Launch click) |
| 0.0 | 56 | Launch click to first loading stage |
| 0.4 | 118 | Launch click to first loading stage |
| 0.5 | 70 | loading: authored-library |
| 0.8 | 96 | loading: authored-visuals |
| 1.1 | 57 | loading: authored-visuals |
| 11.5 | 61 | loading: entering-flight |
| 11.6 | 176 | loading: entering-flight |
| 11.8 | 68 | loading: entering-flight |
| 12.0 | 68 | loading: entering-flight |
| 12.0 | 50 | loading: entering-flight |
| 15.8 | 50 | first seconds of flight |
| 17.3 | 52 | first seconds of flight |

## Loading-screen smoothness (what the player sees)

Frame gaps are the page's own requestAnimationFrame cadence; stall ms is time beyond one 60 Hz frame. The
boot ring and the backdrop video render off the main thread, so a stall here is the DOM/labels/progress
freezing while they keep moving. Long animation frames (LoAF) name the scripts that held the frame.

| window | fps | frames | p50 ms | p95 ms | worst ms | >33 | >50 | >100 | stall ms | LoAF n / blocking ms | video dropped / played |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| New Game screen (to Launch click) | 18.4 | 5 | 66.6 | 150.0 | 150 | 2 | 2 | 1 | 183 | 2 / 115 | 0 / 0 |
| Launch click to first loading stage | 14.3 | 7 | 49.9 | 183.3 | 183 | 3 | 2 | 1 | 267 | 3 / 135 | 5 / 2 |
| loading: authored-library | 8.6 | 3 | 166.7 | 166.7 | 167 | 2 | 2 | 1 | 217 | 3 / 100 | 0 / 0 |
| loading: authored-visuals | 32.0 | 51 | 16.7 | 83.3 | 150 | 10 | 6 | 2 | 650 | 8 / 199 | 7 / 23 |
| loading: render-pipelines | 0.0 | 0 | 0.0 | 0.0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 0 / 0 |
| loading: gpu-resources | 45.9 | 414 | 16.7 | 50.0 | 117 | 26 | 20 | 6 | 2055 | 25 / 33 | 4 / 245 |
| loading: physics-authority | 58.8 | 1 | 0.0 | 0.0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 0 / 0 |
| loading: entering-flight | 14.6 | 9 | 66.7 | 216.7 | 217 | 5 | 4 | 2 | 467 | 4 / 251 | 1 / 6 |
| first seconds of flight | 20.8 | 129 | 33.4 | 83.5 | 400 | 67 | 38 | 4 | 4030 | 18 / 11 | 0 / 4 |

### Long animation frames in New Game screen (to Launch click): who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 99 | 1 | 85 | `BUTTON.onclick @ src/ui/kit/dom.js` |
| 20 | 2 | 18 | `ResizeObserverCallback @ src/ui/orrery/stopDial.js` |
| 19 | 1 | 13 | `BUTTON.onclick @ src/ui/screens/newGame.js` |
| 9 | 1 | 8 | `ResizeObserverCallback @ src/ui/orrery/hullRing.js` |
| 8 | 1 | 8 | `ResizeObserverCallback @ src/ui/orrery/lampKey.js` |

### Long animation frames in Launch click to first loading stage: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 119 | 1 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 33 | 1 | 0 | `frame @ src/core/presentationRunner.js` |
| 29 | 1 | 0 | `FrameRequestCallback @ src/render/partsLibrary.js` |
| 7 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-library: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 146 | 6 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 124 | 3 | 0 | `frame @ src/core/presentationRunner.js` |
| 33 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-visuals: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 337 | 4 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 74 | 3 | 0 | `frame @ src/core/presentationRunner.js` |
| 72 | 7 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 18 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 6 | 1 | 0 | `fire @ src/core/backgroundPost.js` |
| 5 | 1 | 0 | `checkProgramsReady @ src/render/bloom.js` |

### Long animation frames in loading: gpu-resources: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 505 | 46 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 81 | 14 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |
| 68 | 3 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 52 | 6 | 0 | `frame @ src/core/presentationRunner.js` |
| 42 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 40 | 3 | 0 | `checkProgramsReady @ src/render/bloom.js` |
| 31 | 1 | 0 | `TimerHandler:setTimeout @ (inline)` |
| 16 | 1 | 0 | `FrameRequestCallback @ src/render/partsLibrary.js` |

### Long animation frames in loading: entering-flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 301 | 4 | 100 | `frame @ src/core/presentationRunner.js` |
| 106 | 2 | 33 | `Worker.onmessage @ src/core/simLaneMain.js` |

### Long animation frames in first seconds of flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 469 | 18 | 0 | `frame @ src/core/presentationRunner.js` |
| 32 | 4 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 17 | 1 | 0 | `guarded @ src/render/renderer.js` |
| 6 | 1 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |

## Fetched between Launch and flight

273 requests; 129.09 MB of bodies; 89.15 MB actually transferred. Delivery: 204 over the network, 28 revalidated (304), 41 straight from cache.

| type | requests | body MB | transferred MB |
|---|---:|---:|---:|
| glb | 109 | 116.84 | 78.61 |
| json | 150 | 10.52 | 8.81 |
| png | 11 | 1.72 | 1.73 |
| svg | 3 | 0.00 | 0.00 |

| largest bodies | MB | transferred MB | fetch ms |
|---|---:|---:|---:|
| `assets/ships/release/render-packages/helios-trade-hub/render.glb` | 5.36 | 0.00 | 73 |
| `assets/ships/release/render-packages/jump-ring/render.glb` | 3.51 | 0.00 | 50 |
| `assets/ships/release/render-packages/military/render.glb` | 3.00 | 0.00 | 50 |
| `assets/ships/release/render-packages/volatiles-tanker/render.glb` | 2.59 | 2.59 | 325 |
| `assets/ships/release/render-packages/helios-cradle-dmc/render.glb` | 2.52 | 2.52 | 370 |
| `assets/ships/release/render-packages/helios-cradle/render.glb` | 2.52 | 2.52 | 42 |
| `assets/ships/release/render-packages/rescue-lifter/render.glb` | 2.49 | 2.49 | 356 |
| `assets/ships/release/render-packages/yard-tug/render.glb` | 2.41 | 2.41 | 13 |
| `assets/ships/release/render-packages/helios-arclight/render.glb` | 2.36 | 2.36 | 303 |
| `assets/ships/release/render-packages/ore-barge/render.glb` | 2.31 | 2.31 | 303 |
| `assets/ships/release/render-packages/wasp-free-militia/render.glb` | 2.12 | 2.12 | 315 |
| `assets/ships/release/render-packages/wasp-mts-escort/render.glb` | 2.12 | 2.12 | 314 |
| `assets/ships/release/render-packages/wasp-quiet-ghost/render.glb` | 2.12 | 2.12 | 309 |
| `assets/ships/release/render-packages/wasp-scn-patrol/render.glb` | 2.12 | 2.12 | 21 |
| `assets/ships/release/render-packages/helios-span-reach/render.glb` | 2.07 | 2.07 | 301 |

## Renderer resources

| moment | programs | geometries | textures | JS heap MB |
|---|---:|---:|---:|---:|
| entering flight | 149 | 2355 | 131 | 807 |
| end of profile | 149 | 2358 | 131 | 1041 |

Dispose-registration probe renders: 1 at flight, 1 at end of profile (once per context generation is right).

## Draws that waited on a driver link

35 waits of 1 ms or more across 35 programs (2151 draw-path calls), 0.7 s on the main thread, longest 225 ms.

| shader family | waits (>= 1 ms) | total ms |
|---|---:|---:|
| SF_StartupGeometryResidency | 1 | 225 |
| ShaderMaterial | 7 | 136 |
| MeshStandardMaterial | 4 | 43 |
| MeshDepthMaterial | 2 | 25 |
| Material_Ceramic_ice | 2 | 24 |
| CubemapFromEquirect | 1 | 22 |
| SF_Shared_canopy_none_native | 2 | 20 |
| SF_Shared_mechanical_dark | 1 | 20 |
| MeshBasicMaterial | 2 | 19 |
| PMREMGGXConvolution | 1 | 15 |
| SF_Shared_hull_textured_hull | 1 | 15 |
| PMREM.Background | 1 | 14 |

- 225 ms `SF_StartupGeometryResidency` — at timedBlockingFirstUse (http://127.0.0.1:64713/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:64713/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:64713/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:64713/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:64713/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:64713/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:64713/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:64713/vendor/three.
- 50 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:64713/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:64713/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:64713/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:64713/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:64713/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:64713/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:64713/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:64713/vendor/three.
- 31 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:64713/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:64713/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:64713/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:64713/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:64713/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:64713/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:64713/vendor/three.module.js:18616:6) | at renderTransmissionPass (http://127.0.0.1:64713/ve
- 22 ms `CubemapFromEquirect` — at timedBlockingFirstUse (http://127.0.0.1:64713/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:64713/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:64713/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:64713/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:64713/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:64713/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:64713/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:64713/vendor/three.
- 20 ms `MeshDepthMaterial` — at timedBlockingFirstUse (http://127.0.0.1:64713/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:64713/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:64713/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:64713/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:64713/src/render/bloom.js:1142:18) | at renderShadowCaster (http://127.0.0.1:64713/vendor/three.module.js:9860:15) | at http://127.0.0.1:64713/vendor/three.module.js:9814:42 | at eachShadowCaster (http://127.0.0.1:64713/vendor/three.module
- 20 ms `SF_Shared_mechanical_dark` — at timedBlockingFirstUse (http://127.0.0.1:64713/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:64713/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:64713/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:64713/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:64713/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:64713/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:64713/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:64713/vendor/three.
- 17 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:64713/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:64713/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:64713/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:64713/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:64713/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:64713/vendor/three.module.js:18647:11) | at renderQuadObject (http://127.0.0.1:64713/vendor/three.module.js:18694:5) | at WebGLRenderer.renderQuadPass (http://127.0.0.1
- 15 ms `SF_Shared_hull_textured_hull` — at timedBlockingFirstUse (http://127.0.0.1:64713/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:64713/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:64713/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:64713/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:64713/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:64713/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:64713/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:64713/vendor/three.

Opening work still pending when flight began: `391:missing:wreck`, `394:missing:payload`, `395:missing:payload`, `396:missing:payload`.

## Opening cook ledger

The opening cook began 2.4 s after Launch; flight began at 12.1 s. `t` is ms from the cook's start to the end of the step.

| step | ms | outcome | t ms | detail |
|---|---:|---|---:|---|
| opening.rockSurfaceLibrary | 0 | resolved | 1 |  |
| opening.firstPresentAdmission | 0 | resolved | 1 |  |
| opening.residency | 24 | resolved | 74 | subjects=87 textureRefs=32 textures=32 |
| opening.postResources | 3 | resolved | 77 | route=bloom |
| lane | 0 | sample | 1004 | queued=0 flushed=40 settled=42 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| opening.capturedPipelineDrain | 1093 | resolved | 1170 | captured=48 stillPending=11 |
| opening.receipt | 3 | resolved | 1173 |  |
| wait.prepareOpeningGpuResources | 1173 | resolved | 1173 |  |
| live.meshBuilds1 | 0 | resolved | 1275 | queued=0 passes=0 built=0 buildMs=0 yields=0 left=0 |
| live.openingComposition | 17 | resolved | 1291 | pending=0 |
| live.upgradeQueueIdle | 17 | resolved | 1291 | pending=0 inFlight=0 compiling=false |
| live.pendingPipelines | 29 | resolved | 1320 | captured=6 remaining=0 |
| live.rocksAndLeftoverMeshes | 3 | resolved | 1323 | firstFlightEntities=48 |
| live.meshBuilds2 | 53 | resolved | 1376 | queued=9 passes=3 built=0 buildMs=0 yields=3 left=0 |
| cook.programs | 0 | resolved | 1421 | method=first-flight-hulls |
| cook.touchCompile | 165 | resolved | 1666 | issued=597 unlinked=0 yields=9 |
| lane | 0 | sample | 2023 | queued=0 flushed=16 settled=84 upgradeJobs=3 upgradeInFlight=2 upgradeCompiling=4 meshBuilds=0 |
| lane | 0 | sample | 3027 | queued=0 flushed=0 settled=105 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.touch | 1399 | resolved | 3120 | subjects=597 firstPicture=96 touched=597 notReady=0 noProgram=0 switched=1 touchMs=469 maxTouchMs=4 yields=74 |
| lane | 0 | sample | 4045 | queued=0 flushed=0 settled=105 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.buffers | 946 | resolved | 4151 | roots=95 textures=224 yields=19 |
| cook.layers | 838 | resolved | 4989 | roots=174 yields=62 |
| lane | 0 | sample | 5023 | queued=39 flushed=1 settled=105 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.crucibleWarm | 369 | resolved | 5364 | progress={"profile":"opening","records":42,"instantiated":42,"packageInstances":42,"paletteSubjects":350,"chunkPromotions":0,"shi |
| lane | 0 | sample | 6005 | queued=0 flushed=15 settled=130 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.rockPools | 1065 | resolved | 6521 | roots=54 units=1912 issued=1912 issueDedupeSkips=1809 touched=1912 hiddenTouchSkips=1834 yields=10 issueMs=218 drainMs=736 touchMs=55 |
| live.cook | 5145 | resolved | 6521 |  |
| live.leftoverUpgradeIdle | 0 | resolved | 6521 | pending=0 inFlight=0 compiling=false |
| lane | 0 | sample | 7011 | queued=0 flushed=0 settled=145 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 8012 | queued=0 flushed=0 settled=145 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| live.materialSettle | 1773 | resolved | 8294 | unbound=337 names=Physical racing wakes/Next checkpoint/Draft pace beacon/Massline anchors and crossing refuges/L6_comet/L0-L2_deep-field-composite/L3_stars/L4_flares/DeepField_helios-ecliptic-dust/DeepField_helios-left-drift/DeepField_helios-outer-shepherd/DeepFieldStructure_helios-derelict-hauler |
| live.postOpeningPipelines | 526 | resolved | 8869 |  |
| live.parkWarmRoots | 26 | resolved | 8896 | roots=1 nodes=129 stampedGeometries=662 |
| live.firstFramePoolCensus | 625 | resolved | 8919 |  |
| live.finalPipelineSeal | 0 | resolved | 8919 | queuedPipelines=0 |
| wait.prepareLiveSectorBeforeFlight | 7845 | resolved | 9018 |  |
| opening.compositionTail | 1 | resolved | 9021 |  |

## Top-level entry points (inclusive)

The owner of the frame. Anything here that is not the game's own presentation frame is work
the in-engine hitch classifier cannot see.

| ms | share | entry |
|---:|---:|---|
| 5555.8 | 28.5% | `(program) @ native:0` |
| 4397.2 | 22.5% | `frame @ src/core/presentationRunner.js:1060` |
| 2103.2 | 10.8% | `(idle) @ native:0` |
| 913.1 | 4.7% | `admitOpeningUnitsAcrossSlices @ src/render/openingGpuAdmission.js:830` |
| 727.7 | 3.7% | `state.render.cookLiveSceneGpu @ src/render/renderer.js:15806` |
| 436.8 | 2.2% | `(anonymous) @ src/render/renderer.js:12840` |
| 418.7 | 2.1% | `fire @ src/render/compilePresentSlice.js:361` |
| 335.9 | 1.7% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 294.1 | 1.5% | `touchExactTargetSubjects @ src/render/renderer.js:12120` |
| 229.9 | 1.2% | `enqueueGeometryResidencyBatches.urgent @ src/render/startupGpuResidency.js:764` |
| 211.3 | 1.1% | `(anonymous) @ src/render/renderPackageLoader.js:324` |
| 209.7 | 1.1% | `load @ src/render/renderPackageLoader.js:85` |

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
