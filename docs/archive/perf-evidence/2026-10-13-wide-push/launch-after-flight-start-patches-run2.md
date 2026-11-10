# Launch-to-flight main-thread profile

Profile: kept evidence profile `probe-keep-oct13f-000000` (reused: warm GPU program and HTTP caches). New Game seed 47.

**Launch click to flight: 11.0 s.** New Game click to flight: 11.2 s. The profile continues 6.2 s into held-thrust flight.

## Where the time went, by phase

Busy is sampled main-thread time that is not idle. `(program)` is native work outside JavaScript
(Blink, GPU command submission, compositor hand-off). A phase that is mostly idle is waiting on
something off the main thread: driver shader compiles, network, decoding workers, timers.

| phase | wall s | busy s | JS s | (program) s | idle s | GC s | long tasks (n / ms) |
|---|---:|---:|---:|---:|---:|---:|---|
| New Game screen (to Launch click) | 0.24 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 2 / 152 |
| Launch click to first loading stage | 0.52 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 2 / 191 |
| loading: authored-library | 0.38 | 1.14 | 0.14 | 1.00 | 0.00 | 0.00 | 1 / 75 |
| loading: authored-visuals | 1.54 | 1.48 | 1.03 | 0.44 | 0.06 | 0.01 | 2 / 160 |
| loading: render-pipelines | 0.09 | 0.09 | 0.08 | 0.01 | 0.00 | 0.00 | 0 / 0 |
| loading: gpu-resources | 7.81 | 6.86 | 4.66 | 2.02 | 0.96 | 0.18 | 1 / 51 |
| loading: entering-flight | 0.67 | 0.28 | 0.18 | 0.10 | 0.39 | 0.00 | 1 / 99 |
| first seconds of flight | 6.18 | 5.72 | 3.91 | 1.78 | 0.45 | 0.04 | 0 / 0 |

## Launch click to first loading stage — 0.52 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|

### Self time by source

| ms | share | source |
|---:|---:|---|

## loading: authored-visuals — 1.54 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 436.7 | 28.5% | `(program) @ native:0` |
| 66.7 | 4.4% | `texSubImage2D @ native:0` |
| 46.0 | 3.0% | `_createStars @ src/render/spaceBackground.js:2081` |
| 32.4 | 2.1% | `(anonymous) @ src/render/visualFactory.js:4942` |
| 20.8 | 1.4% | `makeHullNormalMap @ src/render/canvasTextures.js:402` |
| 17.5 | 1.1% | `makeNoiseTexture @ src/render/canvasTextures.js:91` |
| 13.7 | 0.9% | `(garbage collector) @ native:0` |
| 13.5 | 0.9% | `getProgramParameter @ native:0` |
| 13.3 | 0.9% | `fetch @ native:0` |
| 13.2 | 0.9% | `validateRenderPackage @ src/contracts/renderPackage.js:69` |
| 12.1 | 0.8% | `makeHullNormalMap @ src/render/canvasTextures.js:402` |
| 9.1 | 0.6% | `buildExemplars @ src/render/renderer.js:21571` |
| 9.1 | 0.6% | `build @ src/render/visualFactory.js:6386` |
| 9.1 | 0.6% | `(anonymous) @ src/render/spaceBackground.js:97` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 436.7 | 28.5% | `(program)` |
| 245.7 | 16.0% | `vendor/three.core.js` |
| 127.6 | 8.3% | `(native)` |
| 78.2 | 5.1% | `src/render/visualFactory.js` |
| 64.0 | 4.2% | `src/render/renderer.js` |
| 61.6 | 4.0% | `src/render/canvasTextures.js` |
| 59.8 | 3.9% | `src/render/spaceBackground.js` |
| 57.3 | 3.7% | `(idle)` |
| 39.2 | 2.6% | `vendor/three.module.js` |
| 38.4 | 2.5% | `src/render/partsLibrary.js` |

## loading: gpu-resources — 7.81 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 2016.0 | 25.8% | `(program) @ native:0` |
| 184.3 | 2.4% | `(garbage collector) @ native:0` |
| 178.0 | 2.3% | `getProgramParameter @ native:0` |
| 65.0 | 0.8% | `syncEntityViewsSteps @ src/render/renderer.js:26802` |
| 44.8 | 0.6% | `digest @ native:0` |
| 44.7 | 0.6% | `texSubImage2D @ native:0` |
| 42.0 | 0.5% | `parse @ vendor/addons/loaders/GLTFLoader.js:429` |
| 41.6 | 0.5% | `get body @ vendor/addons/loaders/GLTFLoader.js:1927` |
| 36.6 | 0.5% | `fetch @ native:0` |
| 35.3 | 0.5% | `withOnlySubjectsDrawable @ src/render/openingGpuAdmission.js:549` |
| 35.1 | 0.4% | `fetch @ native:0` |
| 32.6 | 0.4% | `releaseStatesOfObject @ vendor/three.module.js:2387` |
| 32.6 | 0.4% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:597` |
| 31.1 | 0.4% | `computePlainFloat32Bounds @ src/render/packageCpuDetach.js:324` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 2016.0 | 25.8% | `(program)` |
| 956.3 | 12.2% | `(idle)` |
| 891.3 | 11.4% | `vendor/three.core.js` |
| 694.4 | 8.9% | `(native)` |
| 573.2 | 7.3% | `vendor/three.module.js` |
| 287.0 | 3.7% | `src/render/renderer.js` |
| 214.5 | 2.7% | `src/render/partsLibrary.js` |
| 185.7 | 2.4% | `vendor/addons/loaders/GLTFLoader.js` |
| 184.3 | 2.4% | `(garbage collector)` |
| 155.6 | 2.0% | `src/contracts/renderPackage.js` |

## loading: entering-flight — 0.67 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 103.5 | 15.5% | `(program) @ native:0` |
| 15.1 | 2.3% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:597` |
| 13.0 | 1.9% | `withOnlySubjectsDrawable @ src/render/openingGpuAdmission.js:549` |
| 4.9 | 0.7% | `(anonymous) @ src/render/renderer.js:18263` |
| 4.7 | 0.7% | `projectObject @ vendor/three.module.js:18323` |
| 4.7 | 0.7% | `post @ src/ui/orrery/bootRingWorker.js:163` |
| 4.6 | 0.7% | `sync @ src/render/phaseBlinkPresentation.js:840` |
| 4.6 | 0.7% | `syncFlightCursor @ src/ui/uiRoot.js:891` |
| 4.6 | 0.7% | `presentedCompressedUploadUnsafe @ src/render/packageCpuDetach.js:890` |
| 4.6 | 0.7% | `projectObject @ vendor/three.module.js:18323` |
| 4.6 | 0.7% | `(anonymous) @ src/render/openingGpuAdmission.js:773` |
| 4.6 | 0.7% | `_updateSpeedLines @ src/render/feel.js:841` |
| 4.6 | 0.7% | `unreadyDrawGuard @ src/render/bloom.js:1091` |
| 4.6 | 0.7% | `getProgramParameter @ native:0` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 388.0 | 57.9% | `(idle)` |
| 103.5 | 15.5% | `(program)` |
| 32.7 | 4.9% | `src/render/openingGpuAdmission.js` |
| 31.6 | 4.7% | `vendor/three.module.js` |
| 17.4 | 2.6% | `(native)` |
| 16.5 | 2.5% | `src/render/renderer.js` |
| 13.5 | 2.0% | `src/render/startupGpuResidency.js` |
| 9.1 | 1.4% | `src/render/bloom.js` |
| 9.1 | 1.4% | `vendor/three.core.js` |
| 7.7 | 1.1% | `src/render/packageCpuDetach.js` |

## first seconds of flight — 6.18 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 1775.2 | 28.7% | `(program) @ native:0` |
| 70.3 | 1.1% | `upload @ vendor/three.module.js:6425` |
| 65.7 | 1.1% | `setProgram @ vendor/three.module.js:18879` |
| 57.0 | 0.9% | `syncEntityViewsSteps @ src/render/renderer.js:26802` |
| 49.1 | 0.8% | `syncSize @ src/ui/capitalBossOverlayMount.js:42` |
| 41.6 | 0.7% | `(garbage collector) @ native:0` |
| 41.3 | 0.7% | `bindVertexArray @ native:0` |
| 40.6 | 0.7% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 40.4 | 0.7% | `classifyWorld @ src/world/activityRuntime.js:1568` |
| 36.0 | 0.6% | `fetch @ native:0` |
| 35.9 | 0.6% | `getBindingState @ vendor/three.module.js:1873` |
| 35.4 | 0.6% | `now @ src/render/renderer.js:4156` |
| 32.8 | 0.5% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |
| 31.9 | 0.5% | `refreshUniformsCommon @ vendor/three.module.js:15342` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 1775.2 | 28.7% | `(program)` |
| 967.2 | 15.7% | `vendor/three.module.js` |
| 455.0 | 7.4% | `(idle)` |
| 338.6 | 5.5% | `(native)` |
| 296.9 | 4.8% | `vendor/three.core.js` |
| 262.3 | 4.2% | `src/render/renderer.js` |
| 131.3 | 2.1% | `src/render/packageCpuDetach.js` |
| 131.2 | 2.1% | `src/world/activityRuntime.js` |
| 118.4 | 1.9% | `src/render/vfx.js` |
| 81.4 | 1.3% | `src/render/bloom.js` |

## Long tasks from New Game to the end of the profile

| at s (after Launch) | duration ms | during |
|---:|---:|---|
| -0.2 | 96 | New Game screen (to Launch click) |
| -0.1 | 56 | New Game screen (to Launch click) |
| 0.0 | 56 | Launch click to first loading stage |
| 0.4 | 135 | Launch click to first loading stage |
| 0.5 | 75 | loading: authored-library |
| 0.9 | 98 | loading: authored-visuals |
| 1.2 | 62 | loading: authored-visuals |
| 3.5 | 51 | loading: gpu-resources |
| 10.4 | 99 | loading: entering-flight |

## Loading-screen smoothness (what the player sees)

Frame gaps are the page's own requestAnimationFrame cadence; stall ms is time beyond one 60 Hz frame. The
boot ring and the backdrop video render off the main thread, so a stall here is the DOM/labels/progress
freezing while they keep moving. Long animation frames (LoAF) name the scripts that held the frame.

| window | fps | frames | p50 ms | p95 ms | worst ms | >33 | >50 | >100 | stall ms | LoAF n / blocking ms | video dropped / played |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| New Game screen (to Launch click) | 16.7 | 4 | 16.7 | 133.3 | 133 | 1 | 1 | 1 | 117 | 2 / 90 | 0 / 0 |
| Launch click to first loading stage | 15.4 | 8 | 33.4 | 166.6 | 167 | 2 | 2 | 1 | 266 | 3 / 156 | 5 / 2 |
| loading: authored-library | 7.9 | 3 | 183.4 | 183.4 | 183 | 2 | 2 | 1 | 217 | 3 / 99 | 0 / 0 |
| loading: authored-visuals | 28.0 | 43 | 16.7 | 100.0 | 150 | 7 | 6 | 3 | 685 | 7 / 162 | 8 / 30 |
| loading: render-pipelines | 56.2 | 5 | 16.7 | 33.4 | 33 | 0 | 0 | 0 | 17 | 1 / 0 | 0 / 0 |
| loading: gpu-resources | 48.4 | 378 | 16.7 | 49.6 | 117 | 22 | 16 | 3 | 1356 | 14 / 47 | 5 / 215 |
| loading: entering-flight | 25.5 | 17 | 33.4 | 116.6 | 117 | 5 | 3 | 1 | 383 | 2 / 105 | 0 / 9 |
| first seconds of flight | 21.7 | 134 | 33.4 | 116.7 | 300 | 55 | 30 | 10 | 3879 | 20 / 41 | 0 / 0 |

### Long animation frames in New Game screen (to Launch click): who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 88 | 1 | 76 | `BUTTON.onclick @ src/ui/kit/dom.js` |
| 17 | 1 | 9 | `BUTTON.onclick @ src/ui/screens/newGame.js` |
| 16 | 2 | 15 | `ResizeObserverCallback @ src/ui/orrery/stopDial.js` |
| 8 | 1 | 7 | `ResizeObserverCallback @ src/ui/orrery/hullRing.js` |
| 6 | 1 | 6 | `ResizeObserverCallback @ src/ui/orrery/lampKey.js` |

### Long animation frames in Launch click to first loading stage: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 135 | 1 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 34 | 1 | 0 | `FrameRequestCallback @ src/render/partsLibrary.js` |
| 32 | 1 | 0 | `frame @ src/core/presentationRunner.js` |
| 10 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-library: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 164 | 6 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 124 | 3 | 0 | `frame @ src/core/presentationRunner.js` |
| 36 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-visuals: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 256 | 7 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 120 | 4 | 0 | `frame @ src/core/presentationRunner.js` |
| 82 | 2 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 17 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 12 | 2 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |

### Long animation frames in loading: render-pipelines: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 54 | 3 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |

### Long animation frames in loading: gpu-resources: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 247 | 17 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 63 | 11 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |
| 52 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 39 | 4 | 0 | `frame @ src/core/presentationRunner.js` |
| 8 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: entering-flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 121 | 2 | 52 | `frame @ src/core/presentationRunner.js` |
| 71 | 2 | 23 | `Worker.onmessage @ src/core/simLaneMain.js` |

### Long animation frames in first seconds of flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 571 | 20 | 0 | `frame @ src/core/presentationRunner.js` |
| 60 | 5 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 30 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 27 | 2 | 2 | `Worker.onmessage @ src/core/simLaneMain.js` |

## Fetched between Launch and flight

303 requests; 142.41 MB of bodies; 89.15 MB actually transferred. Delivery: 204 over the network, 47 revalidated (304), 52 straight from cache.

| type | requests | body MB | transferred MB |
|---|---:|---:|---:|
| glb | 120 | 128.86 | 78.61 |
| json | 169 | 11.83 | 8.82 |
| png | 11 | 1.72 | 1.73 |
| svg | 3 | 0.00 | 0.00 |

| largest bodies | MB | transferred MB | fetch ms |
|---|---:|---:|---:|
| `assets/ships/release/render-packages/helios-trade-hub/render.glb` | 5.36 | 0.00 | 79 |
| `assets/ships/release/render-packages/candle-fleet/render.glb` | 4.88 | 0.00 | 74 |
| `assets/ships/release/render-packages/volatiles-tanker/render.glb` | 2.59 | 2.59 | 277 |
| `assets/ships/release/render-packages/helios-cradle-dmc/render.glb` | 2.52 | 2.52 | 321 |
| `assets/ships/release/render-packages/helios-cradle/render.glb` | 2.52 | 2.52 | 44 |
| `assets/ships/release/render-packages/rescue-lifter/render.glb` | 2.49 | 2.49 | 298 |
| `assets/ships/release/render-packages/yard-tug/render.glb` | 2.41 | 2.41 | 14 |
| `assets/ships/release/render-packages/helios-arclight/render.glb` | 2.36 | 2.36 | 317 |
| `assets/ships/release/render-packages/ore-barge/render.glb` | 2.31 | 2.31 | 317 |
| `assets/ships/release/render-packages/wasp-free-militia/render.glb` | 2.12 | 2.12 | 280 |
| `assets/ships/release/render-packages/wasp-mts-escort/render.glb` | 2.12 | 2.12 | 302 |
| `assets/ships/release/render-packages/wasp-quiet-ghost/render.glb` | 2.12 | 2.12 | 246 |
| `assets/ships/release/render-packages/wasp-scn-patrol/render.glb` | 2.12 | 2.12 | 13 |
| `assets/ships/release/render-packages/helios-span-reach/render.glb` | 2.07 | 2.07 | 280 |
| `assets/ships/release/render-packages/helios-span-dmc/render.glb` | 2.07 | 2.07 | 278 |

## Renderer resources

| moment | programs | geometries | textures | JS heap MB |
|---|---:|---:|---:|---:|
| entering flight | 148 | 2336 | 118 | 891 |
| end of profile | 148 | 2353 | 118 | 1100 |

Dispose-registration probe renders: 1 at flight, 1 at end of profile (once per context generation is right).

## Draws that waited on a driver link

34 waits of 1 ms or more across 34 programs (2010 draw-path calls), 0.5 s on the main thread, longest 45 ms.

| shader family | waits (>= 1 ms) | total ms |
|---|---:|---:|
| ShaderMaterial | 7 | 74 |
| MeshStandardMaterial | 4 | 71 |
| MeshDepthMaterial | 2 | 57 |
| Material_Emissive_Amber | 2 | 51 |
| PMREMGGXConvolution | 1 | 36 |
| SF_Station_OpaqueDepthPrepass | 1 | 27 |
| SpriteMaterial | 1 | 24 |
| Material_Ceramic_ice | 2 | 20 |
| SF_Shared_canopy_none_native | 2 | 19 |
| CubemapFromEquirect | 1 | 17 |
| Material_Warning | 1 | 16 |
| PointsMaterial | 1 | 14 |

- 45 ms `Material_Emissive_Amber` — at timedBlockingFirstUse (http://127.0.0.1:54053/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:54053/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:54053/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:54053/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:54053/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:54053/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:54053/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:54053/vendor/three.
- 39 ms `MeshDepthMaterial` — at timedBlockingFirstUse (http://127.0.0.1:54053/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:54053/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:54053/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:54053/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:54053/src/render/bloom.js:1142:18) | at renderShadowCaster (http://127.0.0.1:54053/vendor/three.module.js:9860:15) | at http://127.0.0.1:54053/vendor/three.module.js:9814:42 | at eachShadowCaster (http://127.0.0.1:54053/vendor/three.module
- 37 ms `MeshStandardMaterial` — at timedBlockingFirstUse (http://127.0.0.1:54053/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:54053/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:54053/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:54053/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:54053/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:54053/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:54053/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:54053/vendor/three.
- 35 ms `PMREMGGXConvolution` — at timedBlockingFirstUse (http://127.0.0.1:54053/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:54053/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:54053/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:54053/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:54053/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:54053/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:54053/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:54053/vendor/three.
- 27 ms `SF_Station_OpaqueDepthPrepass` — at timedBlockingFirstUse (http://127.0.0.1:54053/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:54053/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:54053/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:54053/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:54053/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:54053/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:54053/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:54053/vendor/three.
- 24 ms `SpriteMaterial` — at timedBlockingFirstUse (http://127.0.0.1:54053/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:54053/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:54053/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:54053/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:54053/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:54053/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:54053/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:54053/vendor/three.
- 18 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:54053/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:54053/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:54053/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:54053/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:54053/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:54053/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:54053/vendor/three.module.js:18616:6) | at renderTransmissionPass (http://127.0.0.1:54053/ve
- 18 ms `MeshDepthMaterial` — at timedBlockingFirstUse (http://127.0.0.1:54053/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:54053/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:54053/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:54053/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:54053/src/render/bloom.js:1142:18) | at renderShadowCaster (http://127.0.0.1:54053/vendor/three.module.js:9860:15) | at http://127.0.0.1:54053/vendor/three.module.js:9814:42 | at eachShadowCaster (http://127.0.0.1:54053/vendor/three.module

Opening work still pending when flight began: `400:missing:wreck`, `403:missing:payload`, `404:missing:payload`, `405:missing:payload`.

## Opening cook ledger

The opening cook began 2.5 s after Launch; flight began at 11.0 s. `t` is ms from the cook's start to the end of the step.

| step | ms | outcome | t ms | detail |
|---|---:|---|---:|---|
| opening.rockSurfaceLibrary | 0 | resolved | 1 |  |
| opening.firstPresentAdmission | 0 | resolved | 1 |  |
| opening.residency | 276 | resolved | 332 | subjects=87 textureRefs=32 textures=32 |
| opening.postResources | 4 | resolved | 336 | route=bloom |
| opening.capturedPipelineDrain | 34 | resolved | 370 | captured=12 stillPending=0 |
| opening.receipt | 3 | resolved | 374 |  |
| wait.prepareOpeningGpuResources | 374 | resolved | 374 |  |
| live.meshBuilds1 | 0 | resolved | 507 | queued=0 passes=0 built=0 buildMs=0 yields=0 left=0 |
| lane | 0 | sample | 1050 | queued=0 flushed=0 settled=81 upgradeJobs=0 upgradeInFlight=1 upgradeCompiling=9 meshBuilds=0 |
| live.openingComposition | 762 | resolved | 1269 | pending=0 |
| live.upgradeQueueIdle | 762 | resolved | 1269 | pending=0 inFlight=0 compiling=false |
| live.pendingPipelines | 0 | skipped | 1269 | captured=0 |
| live.rocksAndLeftoverMeshes | 2 | resolved | 1271 | firstFlightEntities=47 |
| live.meshBuilds2 | 37 | resolved | 1308 | queued=8 passes=2 built=0 buildMs=0 yields=2 left=0 |
| cook.programs | 1 | resolved | 1354 | method=first-flight-hulls |
| cook.touchCompile | 152 | resolved | 1580 | issued=595 unlinked=0 yields=8 |
| lane | 0 | sample | 2040 | queued=1 flushed=1 settled=98 upgradeJobs=3 upgradeInFlight=1 upgradeCompiling=3 meshBuilds=0 |
| cook.touch | 683 | resolved | 2318 | subjects=595 firstPicture=94 touched=595 notReady=0 noProgram=0 switched=1 touchMs=204 maxTouchMs=4 yields=37 |
| lane | 0 | sample | 3047 | queued=0 flushed=0 settled=103 upgradeJobs=0 upgradeInFlight=1 upgradeCompiling=4 meshBuilds=0 |
| lane | 0 | sample | 4012 | queued=0 flushed=0 settled=104 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=1 meshBuilds=0 |
| cook.buffers | 2041 | resolved | 4453 | roots=94 textures=203 yields=39 |
| cook.layers | 257 | resolved | 4710 | roots=174 yields=50 |
| cook.crucibleWarm | 187 | resolved | 4906 | progress={"profile":"opening","records":41,"instantiated":41,"packageInstances":41,"paletteSubjects":296,"chunkPromotions":0,"shi |
| lane | 0 | sample | 5035 | queued=22 flushed=1 settled=121 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.rockPools | 934 | resolved | 5923 | roots=53 units=1803 issued=1803 issueDedupeSkips=1720 touched=1803 hiddenTouchSkips=1729 yields=7 issueMs=159 drainMs=689 touchMs=62 |
| live.cook | 4616 | resolved | 5924 |  |
| live.leftoverUpgradeIdle | 0 | resolved | 5924 | pending=0 inFlight=0 compiling=false |
| lane | 0 | sample | 6002 | queued=0 flushed=0 settled=144 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| live.materialSettle | 663 | resolved | 6587 | unbound=608 names=Physical racing wakes/Next checkpoint/Draft pace beacon/Massline anchors and crossing refuges/L0-L2_deep-field-composite/L3_stars/L4_flares/DeepField_helios-ecliptic-dust/DeepField_helios-left-drift/DeepField_helios-outer-shepherd/DeepFieldStructure_helios-derelict-hauler/DeepFieldStructure_helios-relay-mast |
| lane | 0 | sample | 7001 | queued=0 flushed=0 settled=144 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| live.postOpeningPipelines | 966 | resolved | 7596 |  |
| live.parkWarmRoots | 80 | resolved | 7676 | roots=1 nodes=129 stampedGeometries=641 |
| live.firstFramePoolCensus | 1125 | resolved | 7712 |  |
| live.finalPipelineSeal | 0 | resolved | 7712 | queuedPipelines=0 |
| wait.prepareLiveSectorBeforeFlight | 7436 | resolved | 7810 |  |
| opening.compositionTail | 1 | resolved | 7811 |  |

## Top-level entry points (inclusive)

The owner of the frame. Anything here that is not the game's own presentation frame is work
the in-engine hitch classifier cannot see.

| ms | share | entry |
|---:|---:|---|
| 5466.5 | 29.9% | `(program) @ native:0` |
| 4293.6 | 23.5% | `frame @ src/core/presentationRunner.js:1060` |
| 2296.2 | 12.5% | `(idle) @ native:0` |
| 431.0 | 2.4% | `state.render.cookLiveSceneGpu @ src/render/renderer.js:15830` |
| 401.7 | 2.2% | `fire @ src/render/compilePresentSlice.js:361` |
| 395.5 | 2.2% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 335.9 | 1.8% | `touchExactTargetSubjects @ src/render/renderer.js:12132` |
| 328.0 | 1.8% | `enqueueGeometryResidencyBatches.urgent @ src/render/startupGpuResidency.js:764` |
| 295.5 | 1.6% | `(anonymous) @ src/render/renderer.js:12852` |
| 268.9 | 1.5% | `buildComposedShipAsync @ src/render/partsLibrary.js:11436` |
| 244.1 | 1.3% | `(garbage collector) @ native:0` |
| 221.6 | 1.2% | `driveAuthoredBuildStepsAsync @ src/render/partsLibrary.js:11513` |

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
