# Launch-to-flight main-thread profile

Profile: kept evidence profile `probe-keep-oct13f-000000` (reused: warm GPU program and HTTP caches). New Game seed 47.

**Launch click to flight: 12.2 s.** New Game click to flight: 12.5 s. The profile continues 6.2 s into held-thrust flight.

## Where the time went, by phase

Busy is sampled main-thread time that is not idle. `(program)` is native work outside JavaScript
(Blink, GPU command submission, compositor hand-off). A phase that is mostly idle is waiting on
something off the main thread: driver shader compiles, network, decoding workers, timers.

| phase | wall s | busy s | JS s | (program) s | idle s | GC s | long tasks (n / ms) |
|---|---:|---:|---:|---:|---:|---:|---|
| New Game screen (to Launch click) | 0.24 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 2 / 155 |
| Launch click to first loading stage | 0.50 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 2 / 187 |
| loading: authored-library | 0.37 | 1.11 | 0.15 | 0.96 | 0.00 | 0.00 | 1 / 70 |
| loading: authored-visuals | 1.58 | 1.49 | 1.07 | 0.42 | 0.09 | 0.00 | 2 / 155 |
| loading: gpu-resources | 9.23 | 8.07 | 5.77 | 2.16 | 1.16 | 0.14 | 0 / 0 |
| loading: physics-authority | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0 / 0 |
| loading: entering-flight | 0.53 | 0.44 | 0.38 | 0.06 | 0.09 | 0.00 | 3 / 220 |
| first seconds of flight | 6.24 | 6.16 | 4.24 | 1.87 | 0.08 | 0.05 | 2 / 102 |

## Launch click to first loading stage — 0.50 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|

### Self time by source

| ms | share | source |
|---:|---:|---|

## loading: authored-visuals — 1.58 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 419.1 | 26.5% | `(program) @ native:0` |
| 45.5 | 2.9% | `_createStars @ src/render/spaceBackground.js:2081` |
| 30.0 | 1.9% | `(anonymous) @ src/render/visualFactory.js:4942` |
| 27.8 | 1.8% | `getProgramParameter @ native:0` |
| 26.7 | 1.7% | `texSubImage2D @ native:0` |
| 18.1 | 1.1% | `fetch @ native:0` |
| 17.8 | 1.1% | `setLaunching @ src/ui/screens/newGame.js:846` |
| 15.2 | 1.0% | `makeNoiseTexture @ src/render/canvasTextures.js:91` |
| 12.3 | 0.8% | `makeHullNormalMap @ src/render/canvasTextures.js:402` |
| 11.8 | 0.7% | `getProgramParameter @ native:0` |
| 11.4 | 0.7% | `makeHullNormalMap @ src/render/canvasTextures.js:402` |
| 10.6 | 0.7% | `valueNoiseField @ src/render/canvasTextures.js:63` |
| 9.3 | 0.6% | `syncEntityViewsSteps @ src/render/renderer.js:26778` |
| 9.1 | 0.6% | `worker.onmessage @ src/core/simLaneMain.js:1163` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 419.1 | 26.5% | `(program)` |
| 241.4 | 15.3% | `vendor/three.core.js` |
| 138.5 | 8.8% | `(native)` |
| 86.6 | 5.5% | `(idle)` |
| 71.2 | 4.5% | `src/render/visualFactory.js` |
| 69.1 | 4.4% | `src/render/partsLibrary.js` |
| 63.3 | 4.0% | `src/render/spaceBackground.js` |
| 54.1 | 3.4% | `src/render/canvasTextures.js` |
| 51.1 | 3.2% | `src/render/renderer.js` |
| 45.3 | 2.9% | `vendor/three.module.js` |

## loading: gpu-resources — 9.23 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 2157.1 | 23.4% | `(program) @ native:0` |
| 139.5 | 1.5% | `(garbage collector) @ native:0` |
| 103.4 | 1.1% | `getProgramParameter @ native:0` |
| 81.4 | 0.9% | `syncEntityViewsSteps @ src/render/renderer.js:26778` |
| 73.1 | 0.8% | `traverse @ vendor/three.core.js:12758` |
| 67.2 | 0.7% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:595` |
| 65.4 | 0.7% | `traverse @ vendor/three.core.js:12758` |
| 48.8 | 0.5% | `traverse @ vendor/three.core.js:12758` |
| 46.3 | 0.5% | `convertBufferAttribute @ vendor/three.core.js:19219` |
| 45.1 | 0.5% | `parse @ vendor/addons/loaders/GLTFLoader.js:429` |
| 44.9 | 0.5% | `traverse @ vendor/three.core.js:12758` |
| 44.2 | 0.5% | `(anonymous) @ src/render/visualFactory.js:2113` |
| 43.9 | 0.5% | `texSubImage2D @ native:0` |
| 40.7 | 0.4% | `traverse @ vendor/three.core.js:12758` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 2157.1 | 23.4% | `(program)` |
| 1448.3 | 15.7% | `vendor/three.core.js` |
| 1163.3 | 12.6% | `(idle)` |
| 702.3 | 7.6% | `vendor/three.module.js` |
| 686.9 | 7.4% | `(native)` |
| 363.1 | 3.9% | `src/render/openingGpuAdmission.js` |
| 270.5 | 2.9% | `src/render/renderer.js` |
| 186.2 | 2.0% | `src/render/partsLibrary.js` |
| 160.8 | 1.7% | `vendor/addons/loaders/GLTFLoader.js` |
| 139.5 | 1.5% | `(garbage collector)` |

## loading: entering-flight — 0.53 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 60.4 | 11.3% | `(program) @ native:0` |
| 39.2 | 7.4% | `traverse @ vendor/three.core.js:12758` |
| 22.5 | 4.2% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:595` |
| 18.3 | 3.4% | `traverse @ vendor/three.core.js:12758` |
| 17.9 | 3.4% | `traverse @ vendor/three.core.js:12758` |
| 17.9 | 3.4% | `(anonymous) @ src/render/openingGpuAdmission.js:573` |
| 17.7 | 3.3% | `compose @ vendor/three.core.js:10827` |
| 9.1 | 1.7% | `traverse @ vendor/three.core.js:12758` |
| 9.0 | 1.7% | `isDrawable @ src/render/openingGpuAdmission.js:112` |
| 9.0 | 1.7% | `syncEntityViewsSteps @ src/render/renderer.js:26778` |
| 8.8 | 1.6% | `traverse @ vendor/three.core.js:12758` |
| 8.7 | 1.6% | `yieldFn @ src/render/compilePresentSlice.js:339` |
| 8.6 | 1.6% | `projectObject @ vendor/three.module.js:18323` |
| 8.4 | 1.6% | `traverse @ vendor/three.core.js:12758` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 138.8 | 26.1% | `vendor/three.core.js` |
| 90.0 | 16.9% | `(idle)` |
| 62.5 | 11.7% | `src/render/openingGpuAdmission.js` |
| 60.4 | 11.3% | `(program)` |
| 43.4 | 8.2% | `vendor/three.module.js` |
| 38.2 | 7.2% | `src/render/renderer.js` |
| 22.3 | 4.2% | `(native)` |
| 17.7 | 3.3% | `src/render/compilePresentSlice.js` |
| 9.2 | 1.7% | `src/render/openingSubmissionPlan.js` |
| 8.5 | 1.6% | `src/render/presentationWorld.js` |

## first seconds of flight — 6.24 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 1872.5 | 30.0% | `(program) @ native:0` |
| 85.0 | 1.4% | `setProgram @ vendor/three.module.js:18879` |
| 67.4 | 1.1% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:595` |
| 56.9 | 0.9% | `syncSize @ src/ui/capitalBossOverlayMount.js:42` |
| 46.3 | 0.7% | `syncEntityViewsSteps @ src/render/renderer.js:26778` |
| 46.0 | 0.7% | `(garbage collector) @ native:0` |
| 40.7 | 0.7% | `withOnlySubjectsDrawable @ src/render/openingGpuAdmission.js:549` |
| 39.4 | 0.6% | `now @ src/render/renderer.js:4144` |
| 38.6 | 0.6% | `bindVertexArray @ native:0` |
| 37.8 | 0.6% | `sfTransformSignatureClean @ vendor/three.module.js:116` |
| 36.1 | 0.6% | `projectObject @ vendor/three.module.js:18323` |
| 34.9 | 0.6% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 34.1 | 0.5% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |
| 31.7 | 0.5% | `classifyWorld @ src/world/activityRuntime.js:1568` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 1872.5 | 30.0% | `(program)` |
| 1067.8 | 17.1% | `vendor/three.module.js` |
| 487.3 | 7.8% | `(native)` |
| 347.2 | 5.6% | `vendor/three.core.js` |
| 311.4 | 5.0% | `src/render/renderer.js` |
| 139.3 | 2.2% | `src/render/openingGpuAdmission.js` |
| 91.3 | 1.5% | `src/render/vfx.js` |
| 85.8 | 1.4% | `src/world/activityRuntime.js` |
| 77.9 | 1.2% | `(idle)` |
| 77.3 | 1.2% | `src/render/packageCpuDetach.js` |

## Long tasks from New Game to the end of the profile

| at s (after Launch) | duration ms | during |
|---:|---:|---|
| -0.2 | 99 | New Game screen (to Launch click) |
| -0.1 | 56 | New Game screen (to Launch click) |
| 0.0 | 58 | Launch click to first loading stage |
| 0.4 | 129 | Launch click to first loading stage |
| 0.5 | 70 | loading: authored-library |
| 0.9 | 99 | loading: authored-visuals |
| 1.2 | 56 | loading: authored-visuals |
| 11.8 | 113 | loading: entering-flight |
| 11.9 | 55 | loading: entering-flight |
| 12.0 | 52 | loading: entering-flight |
| 14.0 | 51 | first seconds of flight |
| 14.5 | 51 | first seconds of flight |

## Loading-screen smoothness (what the player sees)

Frame gaps are the page's own requestAnimationFrame cadence; stall ms is time beyond one 60 Hz frame. The
boot ring and the backdrop video render off the main thread, so a stall here is the DOM/labels/progress
freezing while they keep moving. Long animation frames (LoAF) name the scripts that held the frame.

| window | fps | frames | p50 ms | p95 ms | worst ms | >33 | >50 | >100 | stall ms | LoAF n / blocking ms | video dropped / played |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| New Game screen (to Launch click) | 20.8 | 5 | 50.0 | 150.0 | 150 | 2 | 2 | 1 | 167 | 2 / 93 | 0 / 0 |
| Launch click to first loading stage | 12.0 | 6 | 33.5 | 183.2 | 183 | 3 | 2 | 1 | 266 | 2 / 146 | 6 / 1 |
| loading: authored-library | 8.1 | 3 | 133.3 | 133.3 | 133 | 2 | 2 | 2 | 217 | 3 / 114 | 0 / 0 |
| loading: authored-visuals | 31.6 | 50 | 16.7 | 100.0 | 167 | 11 | 6 | 3 | 668 | 8 / 99 | 23 / 31 |
| loading: gpu-resources | 45.8 | 423 | 16.7 | 50.0 | 200 | 29 | 21 | 5 | 2087 | 18 / 91 | 6 / 250 |
| loading: physics-authority | 0.0 | 0 | 0.0 | 0.0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 0 / 0 |
| loading: entering-flight | 18.8 | 10 | 50.0 | 150.1 | 150 | 6 | 4 | 1 | 366 | 4 / 112 | 0 / 6 |
| first seconds of flight | 24.7 | 154 | 33.4 | 66.7 | 117 | 70 | 32 | 1 | 3645 | 20 / 17 | 0 / 2 |

### Long animation frames in New Game screen (to Launch click): who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 90 | 1 | 79 | `BUTTON.onclick @ src/ui/kit/dom.js` |
| 23 | 1 | 14 | `BUTTON.onclick @ src/ui/screens/newGame.js` |
| 15 | 2 | 14 | `ResizeObserverCallback @ src/ui/orrery/stopDial.js` |
| 8 | 1 | 8 | `ResizeObserverCallback @ src/ui/orrery/lampKey.js` |
| 7 | 1 | 6 | `ResizeObserverCallback @ src/ui/orrery/hullRing.js` |

### Long animation frames in Launch click to first loading stage: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 130 | 1 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 31 | 1 | 0 | `frame @ src/core/presentationRunner.js` |
| 30 | 1 | 0 | `FrameRequestCallback @ src/render/partsLibrary.js` |

### Long animation frames in loading: authored-library: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 159 | 6 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 129 | 3 | 0 | `frame @ src/core/presentationRunner.js` |
| 38 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-visuals: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 239 | 8 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 122 | 5 | 0 | `frame @ src/core/presentationRunner.js` |
| 81 | 6 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 15 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 11 | 2 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |
| 6 | 1 | 0 | `checkProgramsReady @ src/render/bloom.js` |
| 6 | 1 | 0 | `fire @ src/core/backgroundPost.js` |

### Long animation frames in loading: gpu-resources: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 474 | 34 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 69 | 12 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |
| 33 | 3 | 0 | `frame @ src/core/presentationRunner.js` |
| 31 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 15 | 2 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 8 | 1 | 0 | `checkProgramsReady @ src/render/bloom.js` |

### Long animation frames in loading: entering-flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 215 | 4 | 58 | `frame @ src/core/presentationRunner.js` |
| 58 | 2 | 19 | `Worker.onmessage @ src/core/simLaneMain.js` |

### Long animation frames in first seconds of flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 517 | 20 | 0 | `frame @ src/core/presentationRunner.js` |
| 62 | 8 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 25 | 3 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |

## Fetched between Launch and flight

267 requests; 128.73 MB of bodies; 89.15 MB actually transferred. Delivery: 204 over the network, 24 revalidated (304), 39 straight from cache.

| type | requests | body MB | transferred MB |
|---|---:|---:|---:|
| glb | 107 | 116.94 | 78.61 |
| json | 146 | 10.06 | 8.81 |
| png | 11 | 1.72 | 1.73 |
| svg | 3 | 0.00 | 0.00 |

| largest bodies | MB | transferred MB | fetch ms |
|---|---:|---:|---:|
| `assets/ships/release/render-packages/helios-trade-hub/render.glb` | 5.36 | 0.00 | 83 |
| `assets/ships/release/render-packages/candle-fleet/render.glb` | 4.88 | 0.00 | 94 |
| `assets/ships/release/render-packages/jump-ring/render.glb` | 3.51 | 0.00 | 49 |
| `assets/ships/release/render-packages/military/render.glb` | 3.00 | 0.00 | 48 |
| `assets/ships/release/render-packages/volatiles-tanker/render.glb` | 2.59 | 2.59 | 340 |
| `assets/ships/release/render-packages/helios-cradle-dmc/render.glb` | 2.52 | 2.52 | 434 |
| `assets/ships/release/render-packages/helios-cradle/render.glb` | 2.52 | 2.52 | 41 |
| `assets/ships/release/render-packages/rescue-lifter/render.glb` | 2.49 | 2.49 | 324 |
| `assets/ships/release/render-packages/yard-tug/render.glb` | 2.41 | 2.41 | 35 |
| `assets/ships/release/render-packages/helios-arclight/render.glb` | 2.36 | 2.36 | 307 |
| `assets/ships/release/render-packages/ore-barge/render.glb` | 2.31 | 2.31 | 313 |
| `assets/ships/release/render-packages/wasp-free-militia/render.glb` | 2.12 | 2.12 | 339 |
| `assets/ships/release/render-packages/wasp-mts-escort/render.glb` | 2.12 | 2.12 | 370 |
| `assets/ships/release/render-packages/wasp-quiet-ghost/render.glb` | 2.12 | 2.12 | 327 |
| `assets/ships/release/render-packages/wasp-scn-patrol/render.glb` | 2.12 | 2.12 | 38 |

## Renderer resources

| moment | programs | geometries | textures | JS heap MB |
|---|---:|---:|---:|---:|
| entering flight | 149 | 2358 | 141 | 845 |
| end of profile | 149 | 2367 | 141 | 1087 |

Dispose-registration probe renders: 1 at flight, 1 at end of profile (once per context generation is right).

## Draws that waited on a driver link

33 waits of 1 ms or more across 33 programs (2132 draw-path calls), 0.6 s on the main thread, longest 155 ms.

| shader family | waits (>= 1 ms) | total ms |
|---|---:|---:|
| SF_StartupGeometryResidency | 1 | 155 |
| ShaderMaterial | 7 | 132 |
| MeshStandardMaterial | 3 | 33 |
| BackgroundCubeMaterial | 1 | 29 |
| MeshDepthMaterial | 2 | 25 |
| Material_Ceramic_ice | 2 | 22 |
| SF_Station_OpaqueDepthPrepass | 1 | 21 |
| SF_Shared_canopy_none_native | 2 | 20 |
| MeshBasicMaterial | 2 | 17 |
| Material_Emissive_Amber_beacon | 1 | 16 |
| CubemapFromEquirect | 1 | 15 |
| SF_Shared_hull_textured_hull | 1 | 15 |

- 155 ms `SF_StartupGeometryResidency` — at timedBlockingFirstUse (http://127.0.0.1:58125/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:58125/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:58125/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:58125/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:58125/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:58125/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:58125/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:58125/vendor/three.
- 65 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:58125/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:58125/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:58125/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:58125/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:58125/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:58125/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:58125/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:58125/vendor/three.
- 29 ms `BackgroundCubeMaterial` — at timedBlockingFirstUse (http://127.0.0.1:58125/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:58125/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:58125/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:58125/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:58125/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:58125/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:58125/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:58125/vendor/three.
- 21 ms `SF_Station_OpaqueDepthPrepass` — at timedBlockingFirstUse (http://127.0.0.1:58125/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:58125/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:58125/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:58125/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:58125/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:58125/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:58125/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:58125/vendor/three.
- 20 ms `MeshDepthMaterial` — at timedBlockingFirstUse (http://127.0.0.1:58125/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:58125/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:58125/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:58125/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:58125/src/render/bloom.js:1142:18) | at renderShadowCaster (http://127.0.0.1:58125/vendor/three.module.js:9860:15) | at http://127.0.0.1:58125/vendor/three.module.js:9814:42 | at eachShadowCaster (http://127.0.0.1:58125/vendor/three.module
- 18 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:58125/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:58125/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:58125/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:58125/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:58125/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:58125/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:58125/vendor/three.module.js:18616:6) | at renderTransmissionPass (http://127.0.0.1:58125/ve
- 16 ms `Material_Emissive_Amber_beacon` — at timedBlockingFirstUse (http://127.0.0.1:58125/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:58125/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:58125/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:58125/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:58125/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:58125/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:58125/vendor/three.module.js:18616:6) | at renderTransmissionPass (http://127.0.0.1:58125/ve
- 15 ms `CubemapFromEquirect` — at timedBlockingFirstUse (http://127.0.0.1:58125/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:58125/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:58125/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:58125/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:58125/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:58125/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:58125/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:58125/vendor/three.

Opening work still pending when flight began: `382:missing:wreck`, `385:missing:payload`, `386:missing:payload`, `387:missing:payload`.

## Opening cook ledger

The opening cook began 2.5 s after Launch; flight began at 12.2 s. `t` is ms from the cook's start to the end of the step.

| step | ms | outcome | t ms | detail |
|---|---:|---|---:|---|
| opening.rockSurfaceLibrary | 0 | resolved | 1 |  |
| opening.firstPresentAdmission | 0 | resolved | 1 |  |
| opening.residency | 33 | resolved | 91 | subjects=87 textureRefs=31 textures=31 |
| opening.postResources | 4 | resolved | 95 | route=bloom |
| opening.capturedPipelineDrain | 273 | resolved | 369 | captured=17 stillPending=0 |
| opening.receipt | 4 | resolved | 373 |  |
| wait.prepareOpeningGpuResources | 373 | resolved | 373 |  |
| live.meshBuilds1 | 0 | resolved | 523 | queued=0 passes=0 built=0 buildMs=0 yields=0 left=0 |
| lane | 0 | sample | 1011 | queued=0 flushed=0 settled=77 upgradeJobs=2 upgradeInFlight=2 upgradeCompiling=2 meshBuilds=0 |
| live.openingComposition | 844 | resolved | 1367 | pending=0 |
| live.upgradeQueueIdle | 844 | resolved | 1367 | pending=0 inFlight=0 compiling=false |
| live.pendingPipelines | 0 | skipped | 1367 | captured=0 |
| live.rocksAndLeftoverMeshes | 3 | resolved | 1370 | firstFlightEntities=47 |
| live.meshBuilds2 | 34 | resolved | 1404 | queued=8 passes=2 built=0 buildMs=0 yields=2 left=0 |
| cook.programs | 0 | resolved | 1460 | method=first-flight-hulls |
| cook.touchCompile | 267 | resolved | 1825 | issued=601 unlinked=0 yields=14 |
| lane | 0 | sample | 2023 | queued=0 flushed=15 settled=83 upgradeJobs=3 upgradeInFlight=2 upgradeCompiling=3 meshBuilds=0 |
| lane | 0 | sample | 3043 | queued=0 flushed=0 settled=103 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.touch | 1380 | resolved | 3286 | subjects=601 firstPicture=95 touched=601 notReady=0 noProgram=0 switched=2 touchMs=486 maxTouchMs=6 yields=72 |
| lane | 0 | sample | 4055 | queued=0 flushed=0 settled=103 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.buffers | 1008 | resolved | 4418 | roots=94 textures=227 yields=20 |
| lane | 0 | sample | 5016 | queued=0 flushed=0 settled=103 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.layers | 718 | resolved | 5136 | roots=174 yields=62 |
| cook.crucibleWarm | 333 | resolved | 5475 | progress={"profile":"opening","records":43,"instantiated":43,"packageInstances":43,"paletteSubjects":419,"chunkPromotions":0,"shi |
| lane | 0 | sample | 6002 | queued=0 flushed=18 settled=125 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.rockPools | 959 | resolved | 6533 | roots=53 units=1931 issued=1931 issueDedupeSkips=1825 touched=1931 hiddenTouchSkips=1854 yields=9 issueMs=169 drainMs=693 touchMs=45 |
| live.cook | 5129 | resolved | 6533 |  |
| live.leftoverUpgradeIdle | 0 | resolved | 6533 | pending=0 inFlight=0 compiling=false |
| lane | 0 | sample | 7005 | queued=0 flushed=0 settled=143 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| lane | 0 | sample | 8006 | queued=0 flushed=0 settled=143 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| live.materialSettle | 2173 | resolved | 8706 | unbound=647 names=Physical racing wakes/Next checkpoint/Draft pace beacon/Massline anchors and crossing refuges/L6_comet/L0-L2_deep-field-composite/L3_stars/L4_flares/DeepField_helios-ecliptic-dust/DeepField_helios-left-drift/DeepField_helios-outer-shepherd/DeepFieldStructure_helios-derelict-hauler |
| live.postOpeningPipelines | 400 | resolved | 9145 |  |
| live.parkWarmRoots | 25 | resolved | 9170 | roots=1 nodes=129 stampedGeometries=664 |
| live.firstFramePoolCensus | 481 | resolved | 9187 |  |
| live.finalPipelineSeal | 0 | resolved | 9187 | queuedPipelines=0 |
| lane | 0 | sample | 9195 | queued=0 flushed=0 settled=143 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| wait.prepareLiveSectorBeforeFlight | 8852 | resolved | 9225 |  |
| opening.compositionTail | 1 | resolved | 9227 |  |

## Top-level entry points (inclusive)

The owner of the frame. Anything here that is not the game's own presentation frame is work
the in-engine hitch classifier cannot see.

| ms | share | entry |
|---:|---:|---|
| 5751.5 | 29.5% | `(program) @ native:0` |
| 4776.5 | 24.5% | `frame @ src/core/presentationRunner.js:1060` |
| 1427.1 | 7.3% | `(idle) @ native:0` |
| 1015.5 | 5.2% | `admitOpeningUnitsAcrossSlices @ src/render/openingGpuAdmission.js:830` |
| 779.5 | 4.0% | `state.render.cookLiveSceneGpu @ src/render/renderer.js:15806` |
| 423.8 | 2.2% | `fire @ src/render/compilePresentSlice.js:361` |
| 396.8 | 2.0% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 255.2 | 1.3% | `compileSubjectColorAndDepth @ src/render/renderer.js:12104` |
| 254.2 | 1.3% | `(anonymous) @ src/render/renderPackageLoader.js:324` |
| 250.4 | 1.3% | `(anonymous) @ src/render/renderer.js:12840` |
| 246.1 | 1.3% | `touchExactTargetSubjects @ src/render/renderer.js:12120` |
| 244.4 | 1.3% | `buildComposedShipAsync @ src/render/partsLibrary.js:11436` |

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
