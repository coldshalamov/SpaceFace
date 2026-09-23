# Analyzer: settled-60s
Window sampled: **60920.1 ms**

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
