# Launch-to-flight main-thread profile

Profile: kept evidence profile `probe-keep-oct13f-000000` (reused: warm GPU program and HTTP caches). New Game seed 47.

**Launch click to flight: 10.9 s.** New Game click to flight: 11.2 s. The profile continues 3.3 s into held-thrust flight.

## Where the time went, by phase

Busy is sampled main-thread time that is not idle. `(program)` is native work outside JavaScript
(Blink, GPU command submission, compositor hand-off). A phase that is mostly idle is waiting on
something off the main thread: driver shader compiles, network, decoding workers, timers.

| phase | wall s | busy s | JS s | (program) s | idle s | GC s | long tasks (n / ms) |
|---|---:|---:|---:|---:|---:|---:|---|
| New Game screen (to Launch click) | 0.28 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 3 / 228 |
| Launch click to first loading stage | 0.52 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 2 / 151 |
| loading: authored-library | 0.40 | 1.19 | 0.10 | 1.10 | 0.00 | 0.00 | 1 / 79 |
| loading: authored-visuals | 1.54 | 1.46 | 1.01 | 0.43 | 0.08 | 0.02 | 2 / 155 |
| loading: render-pipelines | 0.10 | 0.09 | 0.08 | 0.01 | 0.00 | 0.00 | 0 / 0 |
| loading: gpu-resources | 8.11 | 7.07 | 4.86 | 2.05 | 1.05 | 0.16 | 0 / 0 |
| loading: physics-authority | 0.01 | 0.01 | 0.01 | 0.00 | 0.00 | 0.00 | 0 / 0 |
| loading: entering-flight | 0.26 | 0.26 | 0.24 | 0.01 | 0.00 | 0.00 | 2 / 196 |
| first seconds of flight | 3.25 | 3.07 | 2.05 | 0.99 | 0.18 | 0.03 | 4 / 237 |

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
| 429.9 | 27.9% | `(program) @ native:0` |
| 50.6 | 3.3% | `_createStars @ src/render/spaceBackground.js:2081` |
| 36.5 | 2.4% | `(anonymous) @ src/render/visualFactory.js:4942` |
| 31.5 | 2.0% | `texSubImage2D @ native:0` |
| 21.0 | 1.4% | `(garbage collector) @ native:0` |
| 18.1 | 1.2% | `setLaunching @ src/ui/screens/newGame.js:847` |
| 17.4 | 1.1% | `fetch @ native:0` |
| 13.6 | 0.9% | `get offsetHeight @ native:0` |
| 13.5 | 0.9% | `makeNoiseTexture @ src/render/canvasTextures.js:91` |
| 13.0 | 0.8% | `makeHullNormalMap @ src/render/canvasTextures.js:402` |
| 11.4 | 0.7% | `makeHullNormalMap @ src/render/canvasTextures.js:402` |
| 9.4 | 0.6% | `getBoundingClientRect @ native:0` |
| 9.3 | 0.6% | `attachRuntimeDecoders @ src/render/assetLoader.js:1496` |
| 9.1 | 0.6% | `validateRecords @ src/contracts/renderPackage.js:512` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 429.9 | 27.9% | `(program)` |
| 189.1 | 12.3% | `vendor/three.core.js` |
| 161.1 | 10.5% | `(native)` |
| 95.6 | 6.2% | `src/render/visualFactory.js` |
| 84.1 | 5.5% | `(idle)` |
| 59.3 | 3.8% | `src/render/spaceBackground.js` |
| 56.3 | 3.7% | `src/render/renderer.js` |
| 48.1 | 3.1% | `src/render/canvasTextures.js` |
| 41.5 | 2.7% | `src/render/partsLibrary.js` |
| 38.7 | 2.5% | `src/contracts/renderPackage.js` |

## loading: gpu-resources — 8.11 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 2047.1 | 25.2% | `(program) @ native:0` |
| 163.7 | 2.0% | `(garbage collector) @ native:0` |
| 142.0 | 1.8% | `getProgramParameter @ native:0` |
| 56.0 | 0.7% | `syncEntityViewsSteps @ src/render/renderer.js:26802` |
| 53.8 | 0.7% | `fetch @ native:0` |
| 45.0 | 0.6% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:597` |
| 40.9 | 0.5% | `releaseStatesOfObject @ vendor/three.module.js:2387` |
| 40.6 | 0.5% | `bufferData @ native:0` |
| 40.2 | 0.5% | `parse @ vendor/addons/loaders/GLTFLoader.js:429` |
| 39.8 | 0.5% | `texSubImage2D @ native:0` |
| 39.7 | 0.5% | `(anonymous) @ src/render/visualFactory.js:2113` |
| 36.7 | 0.5% | `withOnlySubjectsDrawable @ src/render/openingGpuAdmission.js:549` |
| 36.2 | 0.4% | `get body @ vendor/addons/loaders/GLTFLoader.js:1927` |
| 35.3 | 0.4% | `replaceLightNums @ vendor/three.module.js:6675` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 2047.1 | 25.2% | `(program)` |
| 1045.8 | 12.9% | `(idle)` |
| 975.2 | 12.0% | `vendor/three.core.js` |
| 674.1 | 8.3% | `(native)` |
| 559.1 | 6.9% | `vendor/three.module.js` |
| 311.2 | 3.8% | `src/render/renderer.js` |
| 178.6 | 2.2% | `src/render/openingGpuAdmission.js` |
| 173.9 | 2.1% | `src/render/partsLibrary.js` |
| 163.7 | 2.0% | `(garbage collector)` |
| 157.1 | 1.9% | `src/contracts/renderPackage.js` |

## first seconds of flight — 3.25 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 986.7 | 30.4% | `(program) @ native:0` |
| 98.1 | 3.0% | `withOnlySubjectsDrawable @ src/render/openingGpuAdmission.js:549` |
| 76.5 | 2.4% | `syncSize @ src/ui/capitalBossOverlayMount.js:42` |
| 36.3 | 1.1% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:597` |
| 31.5 | 1.0% | `(garbage collector) @ native:0` |
| 26.9 | 0.8% | `syncEntityViewsSteps @ src/render/renderer.js:26802` |
| 23.8 | 0.7% | `setProgram @ vendor/three.module.js:18879` |
| 22.2 | 0.7% | `getBoundingClientRect @ native:0` |
| 17.7 | 0.5% | `refreshUniformsCommon @ vendor/three.module.js:15342` |
| 17.7 | 0.5% | `bufferData @ native:0` |
| 13.7 | 0.4% | `get body @ vendor/addons/loaders/GLTFLoader.js:1927` |
| 13.6 | 0.4% | `setAttribute @ native:0` |
| 13.5 | 0.4% | `classifyWorld @ src/world/activityRuntime.js:1568` |
| 13.5 | 0.4% | `_updateEnergyPlume @ src/render/vfx.js:14131` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 986.7 | 30.4% | `(program)` |
| 378.9 | 11.7% | `vendor/three.module.js` |
| 241.8 | 7.4% | `(native)` |
| 181.9 | 5.6% | `(idle)` |
| 161.6 | 5.0% | `src/render/openingGpuAdmission.js` |
| 147.7 | 4.5% | `src/render/renderer.js` |
| 146.8 | 4.5% | `vendor/three.core.js` |
| 76.5 | 2.4% | `src/ui/capitalBossOverlayMount.js` |
| 55.0 | 1.7% | `src/render/vfx.js` |
| 49.5 | 1.5% | `src/render/startupGpuResidency.js` |

## Long tasks from New Game to the end of the profile

| at s (after Launch) | duration ms | during |
|---:|---:|---|
| -0.3 | 101 | New Game screen (to Launch click) |
| -0.1 | 50 | New Game screen (to Launch click) |
| -0.1 | 77 | New Game screen (to Launch click) |
| 0.0 | 55 | Launch click to first loading stage |
| 0.4 | 96 | Launch click to first loading stage |
| 0.5 | 79 | loading: authored-library |
| 0.9 | 98 | loading: authored-visuals |
| 1.2 | 57 | loading: authored-visuals |
| 10.7 | 52 | loading: entering-flight |
| 10.8 | 144 | loading: entering-flight |
| 10.9 | 73 | first seconds of flight |
| 11.1 | 58 | first seconds of flight |
| 11.8 | 55 | first seconds of flight |
| 11.9 | 51 | first seconds of flight |

## Loading-screen smoothness (what the player sees)

Frame gaps are the page's own requestAnimationFrame cadence; stall ms is time beyond one 60 Hz frame. The
boot ring and the backdrop video render off the main thread, so a stall here is the DOM/labels/progress
freezing while they keep moving. Long animation frames (LoAF) name the scripts that held the frame.

| window | fps | frames | p50 ms | p95 ms | worst ms | >33 | >50 | >100 | stall ms | LoAF n / blocking ms | video dropped / played |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| New Game screen (to Launch click) | 14.1 | 4 | 16.8 | 150.0 | 150 | 1 | 1 | 1 | 133 | 2 / 122 | 0 / 0 |
| Launch click to first loading stage | 17.4 | 9 | 33.4 | 183.3 | 183 | 3 | 3 | 1 | 283 | 4 / 119 | 6 / 10 |
| loading: authored-library | 7.6 | 3 | 150.1 | 150.1 | 150 | 2 | 2 | 2 | 233 | 3 / 114 | 0 / 0 |
| loading: authored-visuals | 33.1 | 51 | 16.7 | 83.3 | 133 | 8 | 7 | 2 | 600 | 6 / 166 | 6 / 23 |
| loading: render-pipelines | 20.6 | 2 | 33.3 | 33.3 | 33 | 0 | 0 | 0 | 17 | 2 / 3 | 0 / 0 |
| loading: gpu-resources | 44.4 | 360 | 16.7 | 50.0 | 117 | 26 | 19 | 8 | 2007 | 20 / 49 | 6 / 221 |
| loading: physics-authority | 71.4 | 1 | 0.0 | 0.0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 0 / 0 |
| loading: entering-flight | 19.5 | 5 | 16.7 | 183.4 | 183 | 1 | 1 | 1 | 167 | 2 / 158 | 0 / 0 |
| first seconds of flight | 22.5 | 73 | 33.7 | 83.3 | 100 | 37 | 25 | 1 | 1964 | 17 / 45 | 0 / 12 |

### Long animation frames in New Game screen (to Launch click): who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 92 | 1 | 79 | `BUTTON.onclick @ src/ui/kit/dom.js` |
| 24 | 1 | 15 | `BUTTON.onclick @ src/ui/screens/newGame.js` |
| 18 | 2 | 17 | `ResizeObserverCallback @ src/ui/orrery/stopDial.js` |
| 8 | 1 | 8 | `ResizeObserverCallback @ src/ui/orrery/lampKey.js` |
| 8 | 1 | 7 | `ResizeObserverCallback @ src/ui/orrery/hullRing.js` |

### Long animation frames in Launch click to first loading stage: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 96 | 1 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 36 | 1 | 0 | `FrameRequestCallback @ src/render/partsLibrary.js` |
| 31 | 1 | 0 | `frame @ src/core/presentationRunner.js` |
| 9 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-library: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 173 | 6 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 128 | 3 | 0 | `frame @ src/core/presentationRunner.js` |
| 50 | 2 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-visuals: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 252 | 5 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 85 | 4 | 0 | `frame @ src/core/presentationRunner.js` |
| 16 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 15 | 1 | 0 | `FrameRequestCallback @ src/render/partsLibrary.js` |
| 8 | 1 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |

### Long animation frames in loading: render-pipelines: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 54 | 2 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 53 | 3 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 6 | 1 | 0 | `fire @ src/core/backgroundPost.js` |

### Long animation frames in loading: gpu-resources: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 406 | 31 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 107 | 18 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |
| 51 | 6 | 0 | `frame @ src/core/presentationRunner.js` |
| 40 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |

### Long animation frames in loading: entering-flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 183 | 2 | 79 | `frame @ src/core/presentationRunner.js` |
| 53 | 1 | 27 | `Worker.onmessage @ src/core/simLaneMain.js` |

### Long animation frames in first seconds of flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 453 | 17 | 0 | `frame @ src/core/presentationRunner.js` |
| 35 | 1 | 3 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 22 | 4 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

## Fetched between Launch and flight

275 requests; 134.08 MB of bodies; 89.15 MB actually transferred. Delivery: 204 over the network, 30 revalidated (304), 41 straight from cache.

| type | requests | body MB | transferred MB |
|---|---:|---:|---:|
| glb | 109 | 121.69 | 78.61 |
| json | 152 | 10.67 | 8.81 |
| png | 11 | 1.72 | 1.73 |
| svg | 3 | 0.00 | 0.00 |

| largest bodies | MB | transferred MB | fetch ms |
|---|---:|---:|---:|
| `assets/ships/release/render-packages/helios-trade-hub/render.glb` | 5.36 | 0.00 | 39 |
| `assets/ships/release/render-packages/candle-fleet/render.glb` | 4.88 | 0.00 | 60 |
| `assets/ships/release/render-packages/jump-ring/render.glb` | 3.51 | 0.00 | 51 |
| `assets/ships/release/render-packages/military/render.glb` | 3.00 | 0.00 | 50 |
| `assets/ships/release/render-packages/volatiles-tanker/render.glb` | 2.59 | 2.59 | 363 |
| `assets/ships/release/render-packages/helios-cradle-dmc/render.glb` | 2.52 | 2.52 | 425 |
| `assets/ships/release/render-packages/helios-cradle/render.glb` | 2.52 | 2.52 | 123 |
| `assets/ships/release/render-packages/rescue-lifter/render.glb` | 2.49 | 2.49 | 318 |
| `assets/ships/release/render-packages/yard-tug/render.glb` | 2.41 | 2.41 | 20 |
| `assets/ships/release/render-packages/helios-arclight/render.glb` | 2.36 | 2.36 | 287 |
| `assets/ships/release/render-packages/ore-barge/render.glb` | 2.31 | 2.31 | 292 |
| `assets/ships/release/render-packages/wasp-free-militia/render.glb` | 2.12 | 2.12 | 371 |
| `assets/ships/release/render-packages/wasp-mts-escort/render.glb` | 2.12 | 2.12 | 389 |
| `assets/ships/release/render-packages/wasp-quiet-ghost/render.glb` | 2.12 | 2.12 | 256 |
| `assets/ships/release/render-packages/wasp-scn-patrol/render.glb` | 2.12 | 2.12 | 34 |

## Renderer resources

| moment | programs | geometries | textures | JS heap MB |
|---|---:|---:|---:|---:|
| entering flight | 149 | 2385 | 121 | 788 |
| end of profile | 149 | 2387 | 121 | 951 |

Dispose-registration probe renders: 1 at flight, 1 at end of profile (once per context generation is right).

## Draws that waited on a driver link

34 waits of 1 ms or more across 34 programs (1887 draw-path calls), 0.4 s on the main thread, longest 50 ms.

| shader family | waits (>= 1 ms) | total ms |
|---|---:|---:|
| ShaderMaterial | 7 | 107 |
| MeshStandardMaterial | 4 | 62 |
| MeshDepthMaterial | 2 | 28 |
| Material_Ceramic_ice | 2 | 25 |
| SF_Shared_mechanical_dark | 1 | 23 |
| MeshBasicMaterial | 2 | 19 |
| SF_Shared_canopy_none_native | 2 | 19 |
| SF_Station_OpaqueDepthPrepass | 1 | 18 |
| Material_Emissive_Amber_beacon | 1 | 17 |
| SphericalGaussianBlur | 1 | 15 |
| Material_Stone | 1 | 13 |
| SF_Shared_hull_textured_hull | 1 | 13 |

- 50 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:49912/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:49912/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:49912/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:49912/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:49912/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:49912/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:49912/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:49912/vendor/three.
- 29 ms `MeshStandardMaterial` — at timedBlockingFirstUse (http://127.0.0.1:49912/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:49912/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:49912/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:49912/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:49912/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:49912/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:49912/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:49912/vendor/three.
- 25 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:49912/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:49912/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:49912/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:49912/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:49912/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:49912/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:49912/vendor/three.module.js:18616:6) | at renderTransmissionPass (http://127.0.0.1:49912/ve
- 24 ms `MeshDepthMaterial` — at timedBlockingFirstUse (http://127.0.0.1:49912/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:49912/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:49912/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:49912/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:49912/src/render/bloom.js:1142:18) | at renderShadowCaster (http://127.0.0.1:49912/vendor/three.module.js:9860:15) | at http://127.0.0.1:49912/vendor/three.module.js:9814:42 | at eachShadowCaster (http://127.0.0.1:49912/vendor/three.module
- 23 ms `SF_Shared_mechanical_dark` — at timedBlockingFirstUse (http://127.0.0.1:49912/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:49912/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:49912/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:49912/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:49912/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:49912/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:49912/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:49912/vendor/three.
- 18 ms `SF_Station_OpaqueDepthPrepass` — at timedBlockingFirstUse (http://127.0.0.1:49912/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:49912/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:49912/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:49912/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:49912/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:49912/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:49912/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:49912/vendor/three.
- 17 ms `Material_Emissive_Amber_beacon` — at timedBlockingFirstUse (http://127.0.0.1:49912/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:49912/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:49912/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:49912/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:49912/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:49912/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:49912/vendor/three.module.js:18616:6) | at renderTransmissionPass (http://127.0.0.1:49912/ve
- 15 ms `SphericalGaussianBlur` — at timedBlockingFirstUse (http://127.0.0.1:49912/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:49912/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:49912/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:49912/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:49912/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:49912/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:49912/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:49912/vendor/three.

Opening work still pending when flight began: `392:missing:wreck`, `395:missing:payload`, `396:missing:payload`, `397:missing:payload`.

## Opening cook ledger

The opening cook began 2.6 s after Launch; flight began at 10.9 s. `t` is ms from the cook's start to the end of the step.

| step | ms | outcome | t ms | detail |
|---|---:|---|---:|---|
| opening.rockSurfaceLibrary | 0 | resolved | 1 |  |
| opening.firstPresentAdmission | 0 | resolved | 2 |  |
| opening.residency | 176 | resolved | 229 | subjects=86 textureRefs=31 textures=31 |
| opening.postResources | 4 | resolved | 233 | route=bloom |
| opening.capturedPipelineDrain | 774 | resolved | 1008 | captured=40 stillPending=9 |
| opening.receipt | 5 | resolved | 1013 |  |
| wait.prepareOpeningGpuResources | 1013 | resolved | 1013 |  |
| lane | 0 | sample | 1018 | queued=0 flushed=8 settled=74 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| live.meshBuilds1 | 0 | resolved | 1089 | queued=0 passes=0 built=0 buildMs=0 yields=0 left=0 |
| live.openingComposition | 17 | resolved | 1106 | pending=0 |
| live.upgradeQueueIdle | 17 | resolved | 1106 | pending=0 inFlight=0 compiling=false |
| live.pendingPipelines | 6 | resolved | 1112 | captured=2 remaining=0 |
| live.rocksAndLeftoverMeshes | 3 | resolved | 1116 | firstFlightEntities=47 |
| live.meshBuilds2 | 48 | resolved | 1164 | queued=9 passes=3 built=0 buildMs=0 yields=3 left=0 |
| cook.programs | 0 | resolved | 1211 | method=first-flight-hulls |
| cook.touchCompile | 127 | resolved | 1409 | issued=585 unlinked=0 yields=7 |
| lane | 0 | sample | 2013 | queued=0 flushed=0 settled=101 upgradeJobs=1 upgradeInFlight=2 upgradeCompiling=5 meshBuilds=0 |
| cook.touch | 591 | resolved | 2078 | subjects=585 firstPicture=94 touched=585 notReady=0 noProgram=0 switched=0 touchMs=204 maxTouchMs=4 yields=33 |
| lane | 0 | sample | 3049 | queued=0 flushed=0 settled=103 upgradeJobs=0 upgradeInFlight=1 upgradeCompiling=6 meshBuilds=0 |
| lane | 0 | sample | 4017 | queued=0 flushed=0 settled=104 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=5 meshBuilds=0 |
| cook.buffers | 2266 | resolved | 4445 | roots=94 textures=191 yields=25 |
| cook.layers | 325 | resolved | 4770 | roots=174 yields=37 |
| lane | 0 | sample | 5014 | queued=26 flushed=0 settled=118 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.crucibleWarm | 278 | resolved | 5056 | progress={"profile":"opening","records":43,"instantiated":43,"packageInstances":43,"paletteSubjects":345,"chunkPromotions":0,"shi |
| lane | 0 | sample | 6004 | queued=0 flushed=15 settled=129 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.rockPools | 1059 | resolved | 6286 | roots=53 units=1917 issued=1917 issueDedupeSkips=1832 touched=1917 hiddenTouchSkips=1843 yields=10 issueMs=229 drainMs=748 touchMs=51 |
| live.cook | 5122 | resolved | 6286 |  |
| live.leftoverUpgradeIdle | 0 | resolved | 6286 | pending=0 inFlight=0 compiling=false |
| live.materialSettle | 711 | resolved | 6997 | unbound=299 names=Physical racing wakes/Next checkpoint/Draft pace beacon/Massline anchors and crossing refuges/L6_comet/L0-L2_deep-field-composite/L3_stars/L4_flares/DeepField_helios-ecliptic-dust/DeepField_helios-left-drift/DeepField_helios-outer-shepherd/DeepFieldStructure_helios-derelict-hauler |
| live.postOpeningPipelines | 623 | resolved | 7672 |  |
| lane | 0 | sample | 7691 | queued=0 flushed=0 settled=144 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| live.parkWarmRoots | 205 | resolved | 7877 | roots=1 nodes=129 stampedGeometries=696 |
| live.firstFramePoolCensus | 963 | resolved | 7960 |  |
| live.finalPipelineSeal | 0 | resolved | 7960 | queuedPipelines=0 |
| lane | 0 | sample | 8007 | queued=0 flushed=0 settled=144 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| wait.prepareLiveSectorBeforeFlight | 7093 | resolved | 8105 |  |
| opening.compositionTail | 1 | resolved | 8109 |  |

## Top-level entry points (inclusive)

The owner of the frame. Anything here that is not the game's own presentation frame is work
the in-engine hitch classifier cannot see.

| ms | share | entry |
|---:|---:|---|
| 4950.6 | 32.0% | `(program) @ native:0` |
| 2796.6 | 18.1% | `frame @ src/core/presentationRunner.js:1060` |
| 1412.1 | 9.1% | `(idle) @ native:0` |
| 536.2 | 3.5% | `touchExactTargetSubjects @ src/render/renderer.js:12132` |
| 459.0 | 3.0% | `state.render.cookLiveSceneGpu @ src/render/renderer.js:15830` |
| 390.8 | 2.5% | `(anonymous) @ src/render/renderer.js:12852` |
| 387.5 | 2.5% | `fire @ src/render/compilePresentSlice.js:361` |
| 362.3 | 2.3% | `enqueueGeometryResidencyBatches.urgent @ src/render/startupGpuResidency.js:764` |
| 225.2 | 1.5% | `(garbage collector) @ native:0` |
| 214.1 | 1.4% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 206.0 | 1.3% | `buildComposedShipAsync @ src/render/partsLibrary.js:11436` |
| 204.7 | 1.3% | `buildExemplars @ src/render/renderer.js:21571` |

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
