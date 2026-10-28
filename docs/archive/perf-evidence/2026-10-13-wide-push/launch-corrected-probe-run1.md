# Launch-to-flight main-thread profile

Profile: kept evidence profile `probe-keep-oct13f-000000` (reused: warm GPU program and HTTP caches). New Game seed 47.

**Launch click to flight: 11.4 s.** New Game click to flight: 11.7 s. The profile continues 10.2 s into held-thrust flight.

## Where the time went, by phase

Busy is sampled main-thread time that is not idle. `(program)` is native work outside JavaScript
(Blink, GPU command submission, compositor hand-off). A phase that is mostly idle is waiting on
something off the main thread: driver shader compiles, network, decoding workers, timers.

| phase | wall s | busy s | JS s | (program) s | idle s | GC s | long tasks (n / ms) |
|---|---:|---:|---:|---:|---:|---:|---|
| New Game screen (to Launch click) | 0.27 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 2 / 172 |
| Launch click to first loading stage | 0.91 | 1.17 | 0.16 | 1.01 | 0.00 | 0.00 | 1 / 508 |
| loading: authored-library | 0.31 | 0.30 | 0.06 | 0.24 | 0.01 | 0.00 | 1 / 66 |
| loading: authored-visuals | 1.55 | 1.49 | 1.22 | 0.25 | 0.05 | 0.03 | 1 / 70 |
| loading: render-pipelines | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0 / 0 |
| loading: gpu-resources | 8.13 | 7.16 | 5.09 | 1.92 | 0.97 | 0.14 | 0 / 0 |
| loading: physics-authority | 0.02 | 0.02 | 0.02 | 0.00 | 0.00 | 0.00 | 0 / 0 |
| loading: entering-flight | 0.49 | 0.42 | 0.34 | 0.08 | 0.07 | 0.00 | 2 / 172 |
| first seconds of flight | 10.24 | 9.88 | 6.85 | 2.97 | 0.36 | 0.06 | 3 / 162 |

## Launch click to first loading stage — 0.91 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 1009.1 | 86.1% | `(program) @ native:0` |
| 41.2 | 3.5% | `getBoundingClientRect @ native:0` |
| 13.6 | 1.2% | `getBoundingClientRect @ native:0` |
| 13.3 | 1.1% | `get offsetHeight @ native:0` |
| 9.6 | 0.8% | `getBoundingClientRect @ native:0` |
| 9.2 | 0.8% | `focus @ native:0` |
| 9.0 | 0.8% | `getBoundingClientRect @ native:0` |
| 9.0 | 0.8% | `getBoundingClientRect @ native:0` |
| 4.6 | 0.4% | `(anonymous) @ src/ui/orrery/yardCarousel.js:147` |
| 4.6 | 0.4% | `noteOwnerMembershipIndexed @ src/render/assetResidency.js:989` |
| 4.5 | 0.4% | `getBoundingClientRect @ native:0` |
| 4.5 | 0.4% | `refreshUniformsCommon @ vendor/three.module.js:15342` |
| 4.5 | 0.4% | `drawFace @ src/ui/orrery/arcRail.js:299` |
| 4.5 | 0.4% | `upload @ vendor/three.module.js:6425` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 1009.1 | 86.1% | `(program)` |
| 126.7 | 10.8% | `(native)` |
| 12.2 | 1.0% | `vendor/three.module.js` |
| 4.6 | 0.4% | `(idle)` |
| 4.6 | 0.4% | `src/ui/orrery/yardCarousel.js` |
| 4.6 | 0.4% | `src/render/assetResidency.js` |
| 4.5 | 0.4% | `src/ui/orrery/arcRail.js` |
| 4.4 | 0.4% | `src/render/packageCpuDetach.js` |
| 1.7 | 0.1% | `src/systems/mobile/laneTouchSurface.js` |

## loading: authored-visuals — 1.55 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 247.2 | 16.0% | `(program) @ native:0` |
| 179.3 | 11.6% | `texSubImage2D @ native:0` |
| 89.8 | 5.8% | `getProgramParameter @ native:0` |
| 59.1 | 3.8% | `_createStars @ src/render/spaceBackground.js:2081` |
| 31.7 | 2.0% | `makeNoiseTexture @ src/render/canvasTextures.js:91` |
| 30.1 | 1.9% | `(garbage collector) @ native:0` |
| 24.9 | 1.6% | `getProgramParameter @ native:0` |
| 23.4 | 1.5% | `(anonymous) @ src/render/visualFactory.js:4942` |
| 14.0 | 0.9% | `(anonymous) @ src/render/glbPrepass.js:72` |
| 13.6 | 0.9% | `applyMatrix4 @ vendor/three.core.js:16966` |
| 10.4 | 0.7% | `makeHullNormalMap @ src/render/canvasTextures.js:402` |
| 10.3 | 0.7% | `MeshPhysicalMaterial @ vendor/three.core.js:38336` |
| 9.1 | 0.6% | `setStyle @ vendor/three.core.js:14108` |
| 9.0 | 0.6% | `cloneUniforms @ vendor/three.core.js:37307` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 347.3 | 22.4% | `(native)` |
| 288.4 | 18.6% | `vendor/three.core.js` |
| 247.2 | 16.0% | `(program)` |
| 68.7 | 4.4% | `src/render/spaceBackground.js` |
| 54.8 | 3.5% | `src/render/canvasTextures.js` |
| 54.6 | 3.5% | `(idle)` |
| 52.5 | 3.4% | `vendor/three.module.js` |
| 49.2 | 3.2% | `src/render/visualFactory.js` |
| 48.2 | 3.1% | `src/render/partsLibrary.js` |
| 43.7 | 2.8% | `src/render/renderer.js` |

## loading: gpu-resources — 8.13 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 1917.7 | 23.6% | `(program) @ native:0` |
| 143.9 | 1.8% | `(garbage collector) @ native:0` |
| 126.2 | 1.6% | `getProgramParameter @ native:0` |
| 82.5 | 1.0% | `syncEntityViewsSteps @ src/render/renderer.js:26778` |
| 63.4 | 0.8% | `get body @ vendor/addons/loaders/GLTFLoader.js:1927` |
| 53.9 | 0.7% | `texSubImage2D @ native:0` |
| 48.0 | 0.6% | `parse @ vendor/addons/loaders/GLTFLoader.js:429` |
| 47.6 | 0.6% | `traverse @ vendor/three.core.js:12758` |
| 46.5 | 0.6% | `traverse @ vendor/three.core.js:12758` |
| 43.4 | 0.5% | `releaseStatesOfObject @ vendor/three.module.js:2387` |
| 41.8 | 0.5% | `digest @ native:0` |
| 38.4 | 0.5% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:595` |
| 36.1 | 0.4% | `traverse @ vendor/three.core.js:12758` |
| 32.9 | 0.4% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:595` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 1917.7 | 23.6% | `(program)` |
| 1359.2 | 16.7% | `vendor/three.core.js` |
| 974.3 | 12.0% | `(idle)` |
| 631.6 | 7.8% | `(native)` |
| 570.3 | 7.0% | `vendor/three.module.js` |
| 312.5 | 3.8% | `src/render/renderer.js` |
| 208.5 | 2.6% | `src/render/openingGpuAdmission.js` |
| 189.6 | 2.3% | `vendor/addons/loaders/GLTFLoader.js` |
| 152.2 | 1.9% | `src/render/partsLibrary.js` |
| 144.0 | 1.8% | `src/contracts/renderPackage.js` |

## loading: entering-flight — 0.49 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 76.6 | 15.6% | `(program) @ native:0` |
| 49.7 | 10.1% | `traverse @ vendor/three.core.js:12758` |
| 31.0 | 6.3% | `traverse @ vendor/three.core.js:12758` |
| 22.7 | 4.6% | `traverse @ vendor/three.core.js:12758` |
| 22.5 | 4.6% | `touchSubjectOnExactTarget @ src/render/openingGpuAdmission.js:595` |
| 22.0 | 4.5% | `traverse @ vendor/three.core.js:12758` |
| 13.8 | 2.8% | `updateMatrixWorldSteps @ src/render/staticChildMatrices.js:310` |
| 13.6 | 2.8% | `traverse @ vendor/three.core.js:12758` |
| 9.1 | 1.8% | `projectObject @ vendor/three.module.js:18323` |
| 8.9 | 1.8% | `(anonymous) @ src/render/openingGpuAdmission.js:573` |
| 8.7 | 1.8% | `(anonymous) @ src/render/openingGpuAdmission.js:573` |
| 8.0 | 1.6% | `subjectsForCompileRoots @ src/render/renderer.js:18091` |
| 5.2 | 1.1% | `setProgram @ vendor/three.module.js:18879` |
| 4.7 | 1.0% | `updateEntityShieldBubblePresentation @ src/render/weapons/shieldBubblePresentation.js:39` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 164.2 | 33.4% | `vendor/three.core.js` |
| 76.6 | 15.6% | `(program)` |
| 74.9 | 15.2% | `(idle)` |
| 49.3 | 10.0% | `src/render/openingGpuAdmission.js` |
| 31.0 | 6.3% | `src/render/renderer.js` |
| 28.0 | 5.7% | `vendor/three.module.js` |
| 13.8 | 2.8% | `src/render/staticChildMatrices.js` |
| 9.0 | 1.8% | `src/render/vfx.js` |
| 8.6 | 1.7% | `src/world/activityRuntime.js` |
| 4.7 | 1.0% | `src/render/weapons/shieldBubblePresentation.js` |

## first seconds of flight — 10.24 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 2973.6 | 29.0% | `(program) @ native:0` |
| 106.1 | 1.0% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 104.1 | 1.0% | `syncEntityViewsSteps @ src/render/renderer.js:26778` |
| 103.7 | 1.0% | `classifyWorld @ src/world/activityRuntime.js:1568` |
| 96.8 | 0.9% | `upload @ vendor/three.module.js:6425` |
| 86.5 | 0.8% | `setProgram @ vendor/three.module.js:18879` |
| 85.9 | 0.8% | `now @ src/render/renderer.js:4144` |
| 72.7 | 0.7% | `refreshUniformsCommon @ vendor/three.module.js:15342` |
| 61.1 | 0.6% | `sfTransformSignatureClean @ vendor/three.module.js:116` |
| 58.9 | 0.6% | `get body @ vendor/addons/loaders/GLTFLoader.js:1927` |
| 58.5 | 0.6% | `WebGLRenderer.renderBufferDirect @ vendor/three.module.js:17381` |
| 58.1 | 0.6% | `unreadyDrawGuard @ src/render/bloom.js:1091` |
| 55.7 | 0.5% | `(garbage collector) @ native:0` |
| 55.2 | 0.5% | `computePlainFloat32Bounds @ src/render/packageCpuDetach.js:324` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 2973.6 | 29.0% | `(program)` |
| 1489.7 | 14.5% | `vendor/three.module.js` |
| 806.1 | 7.9% | `vendor/three.core.js` |
| 677.5 | 6.6% | `(native)` |
| 523.3 | 5.1% | `src/render/renderer.js` |
| 358.7 | 3.5% | `(idle)` |
| 227.4 | 2.2% | `src/render/packageCpuDetach.js` |
| 226.4 | 2.2% | `src/world/activityRuntime.js` |
| 200.3 | 2.0% | `src/render/vfx.js` |
| 182.7 | 1.8% | `vendor/addons/loaders/GLTFLoader.js` |

## Long tasks from New Game to the end of the profile

| at s (after Launch) | duration ms | during |
|---:|---:|---|
| -0.2 | 103 | New Game screen (to Launch click) |
| -0.1 | 69 | New Game screen (to Launch click) |
| 0.4 | 508 | Launch click to first loading stage |
| 0.9 | 66 | loading: authored-library |
| 1.4 | 70 | loading: authored-visuals |
| 11.0 | 116 | loading: entering-flight |
| 11.1 | 56 | loading: entering-flight |
| 13.9 | 53 | first seconds of flight |
| 17.3 | 59 | first seconds of flight |
| 19.3 | 50 | first seconds of flight |

## Loading-screen smoothness (what the player sees)

Frame gaps are the page's own requestAnimationFrame cadence; stall ms is time beyond one 60 Hz frame. The
boot ring and the backdrop video render off the main thread, so a stall here is the DOM/labels/progress
freezing while they keep moving. Long animation frames (LoAF) name the scripts that held the frame.

| window | fps | frames | p50 ms | p95 ms | worst ms | >33 | >50 | >100 | stall ms | LoAF n / blocking ms | video dropped / played |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| New Game screen (to Launch click) | 15.1 | 4 | 16.7 | 150.1 | 150 | 1 | 1 | 1 | 133 | 2 / 111 | 0 / 0 |
| Launch click to first loading stage | 6.6 | 6 | 83.4 | 183.4 | 183 | 4 | 4 | 1 | 367 | 3 / 520 | 6 / 1 |
| loading: authored-library | 9.7 | 3 | 66.7 | 66.7 | 67 | 2 | 2 | 0 | 100 | 3 / 5 | 0 / 0 |
| loading: authored-visuals | 31.0 | 48 | 17.3 | 83.3 | 117 | 9 | 9 | 1 | 734 | 8 / 145 | 24 / 33 |
| loading: render-pipelines | 0.0 | 0 | 0.0 | 0.0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 0 / 0 |
| loading: gpu-resources | 45.3 | 368 | 16.7 | 50.0 | 150 | 26 | 17 | 4 | 1922 | 19 / 63 | 5 / 214 |
| loading: physics-authority | 52.6 | 1 | 0.0 | 0.0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 0 / 0 |
| loading: entering-flight | 18.4 | 9 | 66.6 | 150.0 | 150 | 5 | 4 | 1 | 333 | 4 / 110 | 1 / 5 |
| first seconds of flight | 24.9 | 255 | 33.4 | 66.7 | 100 | 110 | 65 | 2 | 5960 | 29 / 112 | 0 / 4 |

### Long animation frames in New Game screen (to Launch click): who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 91 | 1 | 79 | `BUTTON.onclick @ src/ui/kit/dom.js` |
| 22 | 1 | 14 | `BUTTON.onclick @ src/ui/screens/newGame.js` |
| 16 | 2 | 15 | `ResizeObserverCallback @ src/ui/orrery/stopDial.js` |
| 8 | 1 | 7 | `ResizeObserverCallback @ src/ui/orrery/hullRing.js` |
| 7 | 1 | 7 | `ResizeObserverCallback @ src/ui/orrery/lampKey.js` |

### Long animation frames in Launch click to first loading stage: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 508 | 1 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 28 | 1 | 0 | `frame @ src/core/presentationRunner.js` |
| 27 | 1 | 0 | `FrameRequestCallback @ src/render/partsLibrary.js` |
| 6 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-library: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 95 | 5 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 44 | 3 | 0 | `frame @ src/core/presentationRunner.js` |
| 38 | 1 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |

### Long animation frames in loading: authored-visuals: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 224 | 7 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 136 | 6 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 105 | 5 | 0 | `frame @ src/core/presentationRunner.js` |
| 13 | 1 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 6 | 1 | 0 | `fire @ src/core/backgroundPost.js` |

### Long animation frames in loading: gpu-resources: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 383 | 28 | 0 | `Scheduler.yield.then @ src/render/startupGpuResidency.js` |
| 99 | 15 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |
| 81 | 3 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 38 | 5 | 0 | `frame @ src/core/presentationRunner.js` |
| 15 | 1 | 0 | `FrameRequestCallback @ src/render/partsLibrary.js` |
| 13 | 1 | 0 | `checkProgramsReady @ src/render/bloom.js` |

### Long animation frames in loading: entering-flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 200 | 4 | 56 | `frame @ src/core/presentationRunner.js` |
| 68 | 3 | 21 | `Worker.onmessage @ src/core/simLaneMain.js` |

### Long animation frames in first seconds of flight: who ran

| script ms | calls | forced style/layout ms | function @ source |
|---:|---:|---:|---|
| 738 | 29 | 0 | `frame @ src/core/presentationRunner.js` |
| 141 | 14 | 0 | `Scheduler.yield.then @ src/render/compilePresentSlice.js` |
| 68 | 1 | 0 | `Response.json.then @ src/render/renderPackageLoader.js` |
| 65 | 2 | 0 | `Response.arrayBuffer.then @ src/render/authoredMotion.js` |
| 36 | 3 | 0 | `Worker.onmessage @ src/core/simLaneMain.js` |
| 19 | 1 | 0 | `poll @ src/ui/screens/flightFootage.js` |
| 8 | 1 | 0 | `checkProgramsReady @ src/render/bloom.js` |

## Fetched between Launch and flight

274 requests; 133.86 MB of bodies; 89.15 MB actually transferred. Delivery: 204 over the network, 29 revalidated (304), 41 straight from cache.

| type | requests | body MB | transferred MB |
|---|---:|---:|---:|
| glb | 109 | 121.50 | 78.61 |
| json | 151 | 10.64 | 8.81 |
| png | 11 | 1.72 | 1.73 |
| svg | 3 | 0.00 | 0.00 |

| largest bodies | MB | transferred MB | fetch ms |
|---|---:|---:|---:|
| `assets/ships/release/render-packages/helios-trade-hub/render.glb` | 5.36 | 0.00 | 120 |
| `assets/ships/release/render-packages/candle-fleet/render.glb` | 4.88 | 0.00 | 63 |
| `assets/ships/release/render-packages/jump-ring/render.glb` | 3.51 | 0.00 | 55 |
| `assets/ships/release/render-packages/military/render.glb` | 3.00 | 0.00 | 53 |
| `assets/ships/release/render-packages/volatiles-tanker/render.glb` | 2.59 | 2.59 | 335 |
| `assets/ships/release/render-packages/helios-cradle-dmc/render.glb` | 2.52 | 2.52 | 421 |
| `assets/ships/release/render-packages/helios-cradle/render.glb` | 2.52 | 2.52 | 44 |
| `assets/ships/release/render-packages/rescue-lifter/render.glb` | 2.49 | 2.49 | 352 |
| `assets/ships/release/render-packages/yard-tug/render.glb` | 2.41 | 2.41 | 17 |
| `assets/ships/release/render-packages/helios-arclight/render.glb` | 2.36 | 2.36 | 316 |
| `assets/ships/release/render-packages/ore-barge/render.glb` | 2.31 | 2.31 | 302 |
| `assets/ships/release/render-packages/wasp-free-militia/render.glb` | 2.12 | 2.12 | 348 |
| `assets/ships/release/render-packages/wasp-mts-escort/render.glb` | 2.12 | 2.12 | 349 |
| `assets/ships/release/render-packages/wasp-quiet-ghost/render.glb` | 2.12 | 2.12 | 335 |
| `assets/ships/release/render-packages/wasp-scn-patrol/render.glb` | 2.12 | 2.12 | 17 |

## Renderer resources

| moment | programs | geometries | textures | JS heap MB |
|---|---:|---:|---:|---:|
| entering flight | 149 | 2331 | 126 | 838 |
| end of profile | 150 | 2484 | 126 | 1274 |

Dispose-registration probe renders: 1 at flight, 1 at end of profile (once per context generation is right).

## Draws that waited on a driver link

34 waits of 1 ms or more across 34 programs (2043 draw-path calls), 0.7 s on the main thread, longest 197 ms.

| shader family | waits (>= 1 ms) | total ms |
|---|---:|---:|
| SF_StartupGeometryResidency | 1 | 198 |
| ShaderMaterial | 7 | 122 |
| CubemapFromEquirect | 1 | 94 |
| MeshStandardMaterial | 3 | 60 |
| MeshDepthMaterial | 2 | 27 |
| SF_Shared_mechanical_dark | 1 | 22 |
| Material_Ceramic_ice | 2 | 19 |
| SF_Shared_canopy_none_native | 2 | 18 |
| PMREMGGXConvolution | 1 | 17 |
| Material_Emissive_Amber | 2 | 17 |
| MeshBasicMaterial | 2 | 16 |
| Material_BrushedMetal | 1 | 15 |

- 197 ms `SF_StartupGeometryResidency` — at timedBlockingFirstUse (http://127.0.0.1:53804/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:53804/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:53804/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:53804/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:53804/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:53804/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:53804/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:53804/vendor/three.
- 94 ms `CubemapFromEquirect` — at timedBlockingFirstUse (http://127.0.0.1:53804/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:53804/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:53804/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:53804/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:53804/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:53804/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:53804/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:53804/vendor/three.
- 47 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:53804/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:53804/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:53804/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:53804/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:53804/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:53804/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:53804/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:53804/vendor/three.
- 38 ms `MeshStandardMaterial` — at timedBlockingFirstUse (http://127.0.0.1:53804/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:53804/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:53804/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:53804/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:53804/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:53804/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:53804/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:53804/vendor/three.
- 26 ms `ShaderMaterial` — at timedBlockingFirstUse (http://127.0.0.1:53804/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:53804/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:53804/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:53804/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:53804/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:53804/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:53804/vendor/three.module.js:18616:6) | at renderTransmissionPass (http://127.0.0.1:53804/ve
- 22 ms `SF_Shared_mechanical_dark` — at timedBlockingFirstUse (http://127.0.0.1:53804/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:53804/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:53804/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:53804/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:53804/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:53804/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:53804/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:53804/vendor/three.
- 21 ms `MeshDepthMaterial` — at timedBlockingFirstUse (http://127.0.0.1:53804/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:53804/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:53804/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:53804/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:53804/src/render/bloom.js:1142:18) | at renderShadowCaster (http://127.0.0.1:53804/vendor/three.module.js:9860:15) | at http://127.0.0.1:53804/vendor/three.module.js:9814:42 | at eachShadowCaster (http://127.0.0.1:53804/vendor/three.module
- 17 ms `PMREMGGXConvolution` — at timedBlockingFirstUse (http://127.0.0.1:53804/src/render/shaderLinkReporter.js:248:5) | at WebGLProgram.getUniformsAfterLinkCheck [as getUniforms] (http://127.0.0.1:53804/src/render/shaderLinkReporter.js:105:12) | at setProgram (http://127.0.0.1:53804/vendor/three.module.js:19070:31) | at WebGLRenderer.renderBufferDirect (http://127.0.0.1:53804/vendor/three.module.js:17387:20) | at WebGLRenderer.unreadyDrawGuard [as renderBufferDirect] (http://127.0.0.1:53804/src/render/bloom.js:1142:18) | at renderObject (http://127.0.0.1:53804/vendor/three.module.js:18647:11) | at renderObjects (http://127.0.0.1:53804/vendor/three.module.js:18616:6) | at renderScene (http://127.0.0.1:53804/vendor/three.

Opening work still pending when flight began: `381:missing:wreck`, `384:missing:payload`, `385:missing:payload`, `386:missing:payload`.

## Opening cook ledger

The opening cook began 2.8 s after Launch; flight began at 11.4 s. `t` is ms from the cook's start to the end of the step.

| step | ms | outcome | t ms | detail |
|---|---:|---|---:|---|
| opening.rockSurfaceLibrary | 0 | resolved | 1 |  |
| opening.firstPresentAdmission | 0 | resolved | 1 |  |
| opening.residency | 29 | resolved | 82 | subjects=87 textureRefs=32 textures=32 |
| opening.postResources | 3 | resolved | 85 | route=bloom |
| opening.capturedPipelineDrain | 769 | resolved | 855 | captured=35 stillPending=10 |
| opening.receipt | 9 | resolved | 864 |  |
| wait.prepareOpeningGpuResources | 864 | resolved | 864 |  |
| live.meshBuilds1 | 0 | resolved | 957 | queued=0 passes=0 built=0 buildMs=0 yields=0 left=0 |
| live.openingComposition | 35 | resolved | 992 | pending=0 |
| live.upgradeQueueIdle | 35 | resolved | 992 | pending=0 inFlight=0 compiling=false |
| live.pendingPipelines | 1 | resolved | 994 | captured=1 remaining=0 |
| live.rocksAndLeftoverMeshes | 3 | resolved | 997 | firstFlightEntities=47 |
| lane | 0 | sample | 1017 | queued=1 flushed=0 settled=84 upgradeJobs=2 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=6 |
| live.meshBuilds2 | 35 | resolved | 1032 | queued=9 passes=2 built=0 buildMs=0 yields=2 left=0 |
| cook.programs | 0 | resolved | 1078 | method=first-flight-hulls |
| cook.touchCompile | 181 | resolved | 1338 | issued=601 unlinked=0 yields=9 |
| lane | 0 | sample | 2031 | queued=1 flushed=16 settled=85 upgradeJobs=2 upgradeInFlight=1 upgradeCompiling=4 meshBuilds=0 |
| cook.touch | 1482 | resolved | 2869 | subjects=601 firstPicture=94 touched=601 notReady=0 noProgram=0 switched=2 touchMs=507 maxTouchMs=5 yields=76 |
| lane | 0 | sample | 3029 | queued=0 flushed=0 settled=105 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.buffers | 1048 | resolved | 4021 | roots=94 textures=224 yields=20 |
| lane | 0 | sample | 4023 | queued=0 flushed=0 settled=105 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.layers | 847 | resolved | 4868 | roots=174 yields=66 |
| lane | 0 | sample | 5012 | queued=32 flushed=0 settled=113 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.crucibleWarm | 362 | resolved | 5236 | progress={"profile":"opening","records":43,"instantiated":43,"packageInstances":43,"paletteSubjects":436,"chunkPromotions":0,"shi |
| lane | 0 | sample | 6001 | queued=0 flushed=20 settled=125 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| cook.rockPools | 913 | resolved | 6244 | roots=53 units=1902 issued=1902 issueDedupeSkips=1804 touched=1902 hiddenTouchSkips=1825 yields=8 issueMs=165 drainMs=651 touchMs=43 |
| live.cook | 5212 | resolved | 6244 |  |
| live.leftoverUpgradeIdle | 0 | resolved | 6244 | pending=0 inFlight=0 compiling=false |
| lane | 0 | sample | 7006 | queued=0 flushed=0 settled=145 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| live.materialSettle | 1338 | resolved | 7582 | unbound=334 names=Physical racing wakes/Next checkpoint/Draft pace beacon/Massline anchors and crossing refuges/L0-L2_deep-field-composite/L3_stars/L4_flares/DeepField_helios-ecliptic-dust/DeepField_helios-left-drift/DeepField_helios-outer-shepherd/DeepFieldStructure_helios-derelict-hauler/DeepFieldStructure_helios-relay-mast |
| live.postOpeningPipelines | 336 | resolved | 7950 |  |
| live.parkWarmRoots | 25 | resolved | 7975 | roots=1 nodes=129 stampedGeometries=631 |
| live.firstFramePoolCensus | 408 | resolved | 7990 |  |
| live.finalPipelineSeal | 0 | resolved | 7990 | queuedPipelines=0 |
| lane | 0 | sample | 8008 | queued=0 flushed=0 settled=145 upgradeJobs=0 upgradeInFlight=0 upgradeCompiling=0 meshBuilds=0 |
| wait.prepareLiveSectorBeforeFlight | 7261 | resolved | 8126 |  |
| opening.compositionTail | 1 | resolved | 8128 |  |

## Top-level entry points (inclusive)

The owner of the frame. Anything here that is not the game's own presentation frame is work
the in-engine hitch classifier cannot see.

| ms | share | entry |
|---:|---:|---|
| 6778.3 | 29.8% | `(program) @ native:0` |
| 6380.3 | 28.0% | `frame @ src/core/presentationRunner.js:1060` |
| 1495.6 | 6.6% | `(idle) @ native:0` |
| 854.6 | 3.8% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 780.5 | 3.4% | `state.render.cookLiveSceneGpu @ src/render/renderer.js:15806` |
| 595.0 | 2.6% | `admitOpeningUnitsAcrossSlices @ src/render/openingGpuAdmission.js:830` |
| 500.1 | 2.2% | `fire @ src/render/compilePresentSlice.js:361` |
| 349.4 | 1.5% | `(anonymous) @ src/render/renderer.js:12840` |
| 308.1 | 1.4% | `buildComposedShipAsync @ src/render/partsLibrary.js:11436` |
| 302.1 | 1.3% | `upgradeBoundary @ src/render/partsLibrary.js:9162` |
| 259.3 | 1.1% | `(anonymous) @ src/render/renderPackageLoader.js:324` |
| 250.9 | 1.1% | `compileSubjectColorAndDepth @ src/render/renderer.js:12104` |

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
