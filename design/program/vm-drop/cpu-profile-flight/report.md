# cpu-profile-flight — V8 CPU profile (settled flight + busiest scene)

**Kind:** report (no game code changed)  
**Measured SHA (origin/master tip):** `0612d2b9fc994557dd35cb00d0df21b791722c23`  
**When:** 2026-09-22 ~20:50–20:53 EDT (America/New_York)  
**Branch for this outbox:** `vm-drop` (job folder only)  
**GPU tier:** **software** (soft-GPU — ANGLE Mesa llvmpipe). Label every GPU-adjacent cost soft-GPU.

## What was captured

Tool: `node scripts/probe-main-thread-profile.mjs` (CDP V8 CPU profile → `.cpuprofile` + ranked report). Opens in Chrome DevTools Performance → Load profile.

| Window | Command | Sampled wall | Long tasks | Artifacts |
|---|---|---:|---:|---|
| Settled flight (~60 s held thrust) | `--ms=60000 --label=settled-60s` | **60920 ms** | 64 | `artifacts/settled-60s/` |
| Busiest reachable (New Game → load → early flight) | `--from-launch --flight-ms=20000 --label=from-launch-busy` | **50629 ms** (incl. load) | 73 | `artifacts/from-launch-busy/` |

Both EXIT 0 on idle soft-GPU VM (`DISPLAY=:4`). Seed 47. Fresh temporary evidence profiles (cold GPU program + HTTP cache).

## Headline map (for every later CPU patch job)

### Settled flight (~60 s)

- **60.4% idle** — machine otherwise quiet; remaining self time is the game.
- Inclusive owner of busy work: **`presentationRunner.frame` (19.7%)** → `presentLastCompletedSnapshot` → `registry.renderUpdate` → `drawPreparedFrame` / bloom scene pass (soft-GPU).
- Still-hot mid-flight **admission / shader readiness**: `checkProgramsReady` / `isProgram` (~6% self each cluster), `pipelineReadiness.invokeCompileBatch`, `compileSubjectsAcrossPresents`.
- Sim inclusive chain ~5%: `advanceSimulation` → `simulationRunner.stepSimulation` → `registry.step`.
- Named hot JS loops (self): `radar.draw` / `drawRangePlate`, `queryAsteroidField`, `classifyWorld`, `syncEntityViews`, `prepareFrame`, `hud.frame`.
- Soft-GPU note: large `isProgram` / bloom compile self time is driver-poll cost on llvmpipe — owner-iGPU shares may differ; CPU-side JS loops above are portable.

### Busiest scene (from-launch)

- Launch→flight **18.8 s**; New Game→flight **29.8 s**; then 20.3 s held thrust.
- Dominated by **native `isProgram` / WebGL program readiness** across New Game screen + `authored-visuals` + `entering-flight` (soft-GPU).
- New Game screen: `getContext`, `getExtension`, `shipPreviewMount.resize`.
- `authored-visuals`: GLTF load, `_createStars` / deep-field stars, embedded KTX2.
- First flight seconds: same presentation frame chain as settled, plus residual admission.

## Named hot loops → subsystems

| Hot loop / call site | Subsystem | Seen in |
|---|---|---|
| `presentationRunner.frame` / `presentLastCompletedSnapshot` | presentation | settled (top inclusive) |
| `drawPreparedFrame` → `_renderPostRoute` → `bloom.render` / `renderScenePass` | render / bloom (soft-GPU) | settled |
| `checkProgramsReady` / `programHandleInvalid` / `isProgram` | render/admission + native GL (soft-GPU) | both |
| `pipelineReadiness.invokeCompileBatch` / `compileSubjectsAcrossPresents` | render/admission | settled |
| `advanceSimulation` → `stepSimulation` → `registry.step` | sim / core | settled |
| `radar.draw` / `drawRangePlate` | ui/radar | both |
| `queryAsteroidField` | world/asteroids | both |
| `classifyWorld` | world/activity | both |
| `syncEntityViews` / `prepareFrame` | render/renderer | settled |
| `shipPreviewMount.resize` / `getContext` | ui/ship-preview + GL | from-launch |
| GLTFLoader / `_createStars` / `embeddedKtx2Textures` | render load / background / textures | from-launch |

## Settled flight — subsystem ownership (self, idle excluded)

## Subsystem ownership (self time, idle excluded)

| ms | subsystem |
|---:|---|
| 13636.3 | native/GL |
| 2868.8 | other |
| 1712.2 | three.js |
| 285.2 | world/asteroids |
| 262.2 | GC |
| 126.4 | world/activity |
| 120.0 | render/renderer |
| 70.9 | render/vfx |
| 53.9 | wasm |
| 51.9 | render/gltf |
| 47.2 | sim/propulsion |
| 42.0 | sim/physics |
| 32.4 | render/textures |
| 22.7 | presentation |
| 11.0 | render/bloom |
| 10.1 | render/parts |
| 9.3 | render/background |

## Settled flight — top 40 self

## Top 40 by self time

| rank | ms | share | subsystem | function |
|---:|---:|---:|---|---|
| 1 | 36784.5 | 60.4% | idle | `(idle) @ native` |
| 2 | 3731.2 | 6.1% | native/GL | `isProgram @ native` |
| 3 | 3542.2 | 5.8% | native/GL | `isProgram @ native` |
| 4 | 2959.5 | 4.9% | native/GL | `isProgram @ native` |
| 5 | 2527.8 | 4.1% | native/GL | `(program) @ native` |
| 6 | 497.4 | 0.8% | native/GL | `isProgram @ native` |
| 7 | 439.8 | 0.7% | other | `get clientWidth @ native` |
| 8 | 385.4 | 0.6% | other | `draw @ radar.js:744` |
| 9 | 378.2 | 0.6% | native/GL | `isProgram @ native` |
| 10 | 357.7 | 0.6% | other | `compressedTexSubImage2D @ native` |
| 11 | 285.2 | 0.5% | world/asteroids | `queryAsteroidField @ asteroidField.js:135` |
| 12 | 262.2 | 0.4% | GC | `(garbage collector) @ native` |
| 13 | 149.3 | 0.2% | three.js | `setProgram @ three.module.js:18291` |
| 14 | 117.5 | 0.2% | other | `step @ registry.js:773` |
| 15 | 102.1 | 0.2% | other | `drawRangePlate @ radar.js:397` |
| 16 | 94.2 | 0.2% | three.js | `WebGLRenderer.renderBufferDirect @ three.module.js:17141` |
| 17 | 87.5 | 0.1% | three.js | `upload @ three.module.js:6214` |
| 18 | 70.6 | 0.1% | three.js | `refreshUniformsCommon @ three.module.js:15102` |
| 19 | 64.0 | 0.1% | other | `getBoundingClientRect @ native` |
| 20 | 60.4 | 0.1% | world/activity | `classifyWorld @ activityRuntime.js:697` |
| 21 | 57.7 | 0.1% | other | `bindVertexArray @ native` |
| 22 | 53.2 | 0.1% | render/renderer | `syncEntityViews @ renderer.js:11064` |
| 23 | 50.6 | 0.1% | render/renderer | `prepareFrame @ renderer.js:11952` |
| 24 | 47.6 | 0.1% | three.js | `setValue @ three.module.js:6063` |
| 25 | 46.8 | 0.1% | three.js | `needsUpdate @ three.module.js:1742` |
| 26 | 46.5 | 0.1% | three.js | `compose @ three.core.js:10827` |
| 27 | 44.2 | 0.1% | world/activity | `classifyWorld @ activityRuntime.js:697` |
| 28 | 42.5 | 0.1% | three.js | `updateMatrixWorld @ three.core.js:12853` |
| 29 | 42.4 | 0.1% | three.js | `multiplyMatrices @ three.core.js:10385` |
| 30 | 39.8 | 0.1% | three.js | `renderObject @ three.module.js:18081` |
| 31 | 38.7 | 0.1% | three.js | `compose @ three.core.js:10827` |
| 32 | 38.2 | 0.1% | three.js | `updateMatrixWorld @ three.core.js:12853` |
| 33 | 38.2 | 0.1% | other | `frame @ hud.js:4614` |
| 34 | 37.1 | 0.1% | three.js | `projectObject @ three.module.js:17788` |
| 35 | 35.7 | 0.1% | other | `bindTexture @ native` |
| 36 | 35.5 | 0.1% | other | `stepSimulation @ simulationRunner.js:268` |
| 37 | 34.7 | 0.1% | three.js | `getParameters @ three.module.js:7456` |
| 38 | 33.1 | 0.1% | three.js | `getBindingState @ three.module.js:1663` |
| 39 | 32.4 | 0.1% | render/textures | `(anonymous) @ embeddedKtx2Textures.js:103` |
| 40 | 32.3 | 0.1% | wasm | `wasm-function[37] @ wasm://wasm/005fccd2:1` |

## Settled flight — top 40 total (inclusive)

## Top 40 by total (inclusive) time

| rank | ms | share | subsystem | function |
|---:|---:|---:|---|---|
| 1 | 60920.1 | 100.0% | other | `(root) @ native` |
| 2 | 36784.5 | 60.4% | idle | `(idle) @ native` |
| 3 | 12014.9 | 19.7% | presentation | `frame @ presentationRunner.js:780` |
| 4 | 8874.3 | 14.6% | presentation | `presentLastCompletedSnapshot @ presentationRunner.js:688` |
| 5 | 8864.8 | 14.6% | other | `renderUpdate @ registry.js:854` |
| 6 | 8858.9 | 14.5% | other | `runRenderUpdatePhase @ renderUpdatePhase.js:14` |
| 7 | 5638.6 | 9.3% | render/renderer | `drawPreparedFrame @ renderer.js:12178` |
| 8 | 5618.0 | 9.2% | render/renderer | `_renderPostRoute @ renderer.js:13124` |
| 9 | 5079.9 | 8.3% | render/bloom | `render @ bloom.js:1516` |
| 10 | 5074.7 | 8.3% | render/bloom | `timePassGroup @ bloom.js:1203` |
| 11 | 5014.3 | 8.2% | render/bloom | `renderScenePass @ bloom.js:1381` |
| 12 | 4949.4 | 8.1% | three.js | `WebGLRenderer.render @ three.module.js:17566` |
| 13 | 4510.1 | 7.4% | three.js | `renderScene @ three.module.js:17906` |
| 14 | 4504.7 | 7.4% | three.js | `renderObjects @ three.module.js:18054` |
| 15 | 4477.0 | 7.3% | three.js | `renderObject @ three.module.js:18081` |
| 16 | 4395.8 | 7.2% | three.js | `WebGLRenderer.renderBufferDirect @ three.module.js:17141` |
| 17 | 4068.4 | 6.7% | three.js | `setProgram @ three.module.js:18291` |
| 18 | 3740.0 | 6.1% | render/bloom | `checkProgramsReady @ bloom.js:628` |
| 19 | 3731.2 | 6.1% | native/GL | `isProgram @ native` |
| 20 | 3731.2 | 6.1% | render/bloom | `programHandleInvalid @ bloom.js:426` |
| 21 | 3561.9 | 5.8% | render/admission | `invokeCompileBatch @ pipelineReadiness.js:205` |
| 22 | 3561.9 | 5.8% | render/admission | `(anonymous) @ pipelineReadiness.js:249` |
| 23 | 3561.0 | 5.8% | render/renderer | `compileForCurrentTarget @ renderer.js:5278` |
| 24 | 3558.9 | 5.8% | render/bloom | `compileScenePipelinesForRenderTarget @ bloom.js:312` |
| 25 | 3558.9 | 5.8% | render/bloom | `compileScenePipelines @ bloom.js:1548` |
| 26 | 3558.9 | 5.8% | render/renderer | `_compilePostRoute @ renderer.js:13147` |
| 27 | 3558.9 | 5.8% | render/renderer | `compileSubjectColorAndDepth @ renderer.js:5263` |
| 28 | 3558.9 | 5.8% | render/renderer | `(anonymous) @ renderer.js:5339` |
| 29 | 3558.9 | 5.8% | render/admission | `compileSubjectsAcrossPresents @ compilePresentSlice.js:22` |
| 30 | 3558.6 | 5.8% | render/bloom | `(anonymous) @ bloom.js:553` |
| 31 | 3558.6 | 5.8% | render/bloom | `compilePipelinesContextSafe @ bloom.js:540` |
| 32 | 3544.2 | 5.8% | render/bloom | `checkProgramsReady @ bloom.js:628` |
| 33 | 3542.2 | 5.8% | native/GL | `isProgram @ native` |
| 34 | 3542.2 | 5.8% | render/bloom | `programHandleInvalid @ bloom.js:426` |
| 35 | 3052.1 | 5.0% | presentation | `advanceSimulation @ presentationRunner.js:753` |
| 36 | 3047.4 | 5.0% | other | `advance @ simulationRunner.js:412` |
| 37 | 3045.1 | 5.0% | other | `advanceFixedTimestep @ simulationRunner.js:41` |
| 38 | 3043.2 | 5.0% | other | `stepSimulation @ simulationRunner.js:268` |
| 39 | 2995.6 | 4.9% | other | `step @ registry.js:773` |
| 40 | 2979.0 | 4.9% | other | `getUniformsAfterLinkCheck @ shaderLinkReporter.js:61` |

## From-launch busy — subsystem ownership (self, idle excluded)

## Subsystem ownership (self time, idle excluded)

| ms | subsystem |
|---:|---|
| 34016.1 | native/GL |
| 4172.3 | other |
| 612.9 | three.js |
| 266.4 | GC |
| 102.0 | render/gltf |
| 74.6 | world/asteroids |
| 62.5 | render/renderer |
| 50.0 | world/activity |
| 39.3 | render/stars |
| 38.6 | wasm |
| 36.4 | render/textures |
| 35.5 | render/background |
| 34.9 | render/vfx |
| 33.9 | ui/ship-preview |
| 28.5 | sim/physics |
| 17.5 | sim/propulsion |
| 16.1 | render/parts |
| 9.9 | presentation |
| 7.5 | render/gpu-residency |
| 5.1 | render/bloom |

## From-launch busy — top 40 self

## Top 40 by self time

| rank | ms | share | subsystem | function |
|---:|---:|---:|---|---|
| 1 | 11114.9 | 22.0% | native/GL | `isProgram @ native` |
| 2 | 7904.6 | 15.6% | idle | `(idle) @ native` |
| 3 | 4347.8 | 8.6% | native/GL | `isProgram @ native` |
| 4 | 4068.3 | 8.0% | native/GL | `isProgram @ native` |
| 5 | 3756.7 | 7.4% | native/GL | `isProgram @ native` |
| 6 | 2738.7 | 5.4% | native/GL | `isProgram @ native` |
| 7 | 2135.6 | 4.2% | native/GL | `isProgram @ native` |
| 8 | 1858.6 | 3.7% | other | `getContext @ native` |
| 9 | 1723.5 | 3.4% | native/GL | `(program) @ native` |
| 10 | 1180.5 | 2.3% | native/GL | `isProgram @ native` |
| 11 | 864.3 | 1.7% | native/GL | `isProgram @ native` |
| 12 | 653.8 | 1.3% | native/GL | `isProgram @ native` |
| 13 | 563.4 | 1.1% | native/GL | `isProgram @ native` |
| 14 | 496.9 | 1.0% | other | `bufferData @ native` |
| 15 | 413.2 | 0.8% | other | `getExtension @ native` |
| 16 | 333.7 | 0.7% | native/GL | `isProgram @ native` |
| 17 | 287.8 | 0.6% | native/GL | `isProgram @ native` |
| 18 | 266.4 | 0.5% | GC | `(garbage collector) @ native` |
| 19 | 167.7 | 0.3% | other | `syncSize @ capitalBossOverlayMount.js:27` |
| 20 | 137.7 | 0.3% | other | `draw @ radar.js:744` |
| 21 | 112.8 | 0.2% | native/GL | `isProgram @ native` |
| 22 | 91.9 | 0.2% | other | `refreshCredits @ hud.js:3649` |
| 23 | 76.8 | 0.2% | native/GL | `isProgram @ native` |
| 24 | 74.6 | 0.1% | world/asteroids | `queryAsteroidField @ asteroidField.js:135` |
| 25 | 73.5 | 0.1% | other | `getProgramParameter @ native` |
| 26 | 59.8 | 0.1% | other | `step @ registry.js:773` |
| 27 | 53.2 | 0.1% | other | `compressedTexSubImage2D @ native` |
| 28 | 49.8 | 0.1% | other | `(anonymous) @ renderPackageDigest.js:87` |
| 29 | 47.6 | 0.1% | render/gltf | `(anonymous) @ GLTFLoader.js:3054` |
| 30 | 47.0 | 0.1% | render/gltf | `GLTFBinaryExtension @ GLTFLoader.js:1840` |
| 31 | 43.3 | 0.1% | three.js | `WebGLRenderer.renderBufferDirect @ three.module.js:17141` |
| 32 | 42.8 | 0.1% | three.js | `setProgram @ three.module.js:18291` |
| 33 | 36.4 | 0.1% | render/textures | `(anonymous) @ embeddedKtx2Textures.js:103` |
| 34 | 35.5 | 0.1% | render/background | `_createStars @ spaceBackground.js:1932` |
| 35 | 33.9 | 0.1% | ui/ship-preview | `resize @ shipPreviewMount.js:699` |
| 36 | 31.8 | 0.1% | world/activity | `classifyWorld @ activityRuntime.js:697` |
| 37 | 30.8 | 0.1% | render/renderer | `prepareFrame @ renderer.js:11952` |
| 38 | 29.6 | 0.1% | other | `drawRangePlate @ radar.js:397` |
| 39 | 26.4 | 0.1% | three.js | `refreshUniformsCommon @ three.module.js:15102` |
| 40 | 26.2 | 0.1% | three.js | `upload @ three.module.js:6214` |

## From-launch busy — top 40 total (inclusive)

## Top 40 by total (inclusive) time

| rank | ms | share | subsystem | function |
|---:|---:|---:|---|---|
| 1 | 50629.0 | 100.0% | other | `(root) @ native` |
| 2 | 11118.8 | 22.0% | render/bloom | `checkProgramsReady @ bloom.js:628` |
| 3 | 11114.9 | 22.0% | native/GL | `isProgram @ native` |
| 4 | 11114.9 | 22.0% | render/bloom | `programHandleInvalid @ bloom.js:426` |
| 5 | 7904.6 | 15.6% | idle | `(idle) @ native` |
| 6 | 7528.8 | 14.9% | other | `prepareForFirstDraw @ uiStage.js:788` |
| 7 | 7467.1 | 14.7% | three.js | `WebGLRenderer.render @ three.module.js:17566` |
| 8 | 5133.9 | 10.1% | other | `admitOpeningUnitsAcrossSlices @ openingGpuAdmission.js:312` |
| 9 | 4701.3 | 9.3% | presentation | `frame @ presentationRunner.js:780` |
| 10 | 4465.8 | 8.8% | render/renderer | `whileRevealed @ renderer.js:5974` |
| 11 | 4465.8 | 8.8% | render/renderer | `touchOne @ renderer.js:5983` |
| 12 | 4465.2 | 8.8% | other | `touchSubjectOnExactTarget @ openingGpuAdmission.js:288` |
| 13 | 4465.2 | 8.8% | render/bloom | `touchScenePipelines @ bloom.js:1560` |
| 14 | 4465.2 | 8.8% | render/renderer | `touchExactTargetSubject @ renderer.js:5271` |
| 15 | 4465.2 | 8.8% | render/renderer | `(anonymous) @ renderer.js:5983` |
| 16 | 4463.0 | 8.8% | other | `withOnlySubjectsDrawable @ openingGpuAdmission.js:266` |
| 17 | 4456.8 | 8.8% | other | `(anonymous) @ openingGpuAdmission.js:299` |
| 18 | 4455.6 | 8.8% | three.js | `WebGLRenderer.render @ three.module.js:17566` |
| 19 | 4446.2 | 8.8% | three.js | `renderScene @ three.module.js:17906` |
| 20 | 4445.1 | 8.8% | three.js | `WebGLRenderer.renderBufferDirect @ three.module.js:17141` |
| 21 | 4445.1 | 8.8% | three.js | `renderObject @ three.module.js:18081` |
| 22 | 4445.1 | 8.8% | three.js | `renderObjects @ three.module.js:18054` |
| 23 | 4440.5 | 8.8% | three.js | `setProgram @ three.module.js:18291` |
| 24 | 4428.6 | 8.7% | other | `getUniformsAfterLinkCheck @ shaderLinkReporter.js:61` |
| 25 | 4404.4 | 8.7% | render/admission | `invokeCompileBatch @ pipelineReadiness.js:205` |
| 26 | 4404.4 | 8.7% | render/admission | `(anonymous) @ pipelineReadiness.js:249` |
| 27 | 4403.9 | 8.7% | render/renderer | `compileForCurrentTarget @ renderer.js:5278` |
| 28 | 4347.8 | 8.6% | native/GL | `isProgram @ native` |
| 29 | 4347.8 | 8.6% | other | `checkLinkStatus @ shaderLinkReporter.js:71` |
| 30 | 4347.8 | 8.6% | other | `beforeFirstUse @ shaderLinkReporter.js:56` |
| 31 | 4108.9 | 8.1% | render/bloom | `(anonymous) @ bloom.js:553` |
| 32 | 4108.9 | 8.1% | render/bloom | `compilePipelinesContextSafe @ bloom.js:540` |
| 33 | 4108.9 | 8.1% | render/bloom | `compileScenePipelinesForRenderTarget @ bloom.js:312` |
| 34 | 4108.9 | 8.1% | render/bloom | `compileScenePipelines @ bloom.js:1548` |
| 35 | 4108.9 | 8.1% | render/renderer | `_compilePostRoute @ renderer.js:13147` |
| 36 | 4108.9 | 8.1% | render/renderer | `compileSubjectColorAndDepth @ renderer.js:5263` |
| 37 | 4069.2 | 8.0% | render/bloom | `checkProgramsReady @ bloom.js:628` |
| 38 | 4068.3 | 8.0% | native/GL | `isProgram @ native` |
| 39 | 4068.3 | 8.0% | render/bloom | `programHandleInvalid @ bloom.js:426` |
| 40 | 3776.8 | 7.5% | three.js | `renderScene @ three.module.js:17906` |

## Probe-native reports (also copied)

- `artifacts/settled-60s/report.md` — probe’s top-25 self + entry points + canvas census
- `artifacts/from-launch-busy/report.md` — per-loading-stage busy/idle/JS/(program)/GC breakdown
- `artifacts/settled-60s/profile.cpuprofile` / `artifacts/from-launch-busy/profile.cpuprofile`

## Soft-GPU caveat

All GL/`isProgram`/bloom compile shares are soft-GPU (llvmpipe). Use JS/sim/world/ui rows as portable CPU evidence for patch jobs; leave fps verdicts to owner-GPU witness after import.
