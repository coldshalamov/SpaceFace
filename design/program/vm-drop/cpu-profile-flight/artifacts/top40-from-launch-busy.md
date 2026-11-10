# Analyzer: from-launch-busy
Window sampled: **50629.0 ms**

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
