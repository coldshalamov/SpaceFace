# Main-thread profile

Window: 60920.1 ms of flight. Long tasks recorded in the window: **64**.

## Top-level entry points (inclusive)

The owner of the frame. Anything here that is not the game's own presentation frame is work
the in-engine hitch classifier cannot see.

| ms | share | entry |
|---:|---:|---|
| 36784.5 | 60.4% | `(idle) @ native:0` |
| 12014.9 | 19.7% | `frame @ src/core/presentationRunner.js:780` |
| 3740.0 | 6.1% | `checkProgramsReady @ src/render/bloom.js:628` |
| 3561.9 | 5.8% | `(anonymous) @ src/render/pipelineReadiness.js:249` |
| 2527.8 | 4.1% | `(program) @ native:0` |
| 503.9 | 0.8% | `(anonymous) @ src/render/pipelineReadiness.js:387` |
| 463.4 | 0.8% | `compileSubjectsAcrossPresents @ src/render/compilePresentSlice.js:22` |
| 385.8 | 0.6% | `prepareStartupGpuResidency @ src/render/startupGpuResidency.js:511` |
| 262.2 | 0.4% | `(garbage collector) @ native:0` |
| 77.5 | 0.1% | `upgradeBoundary @ src/render/partsLibrary.js:5075` |
| 71.2 | 0.1% | `(anonymous) @ src/render/renderPackageLoader.js:155` |
| 59.8 | 0.1% | `enqueueGeometryResidencyBatches.urgent @ src/render/startupGpuResidency.js:433` |
| 44.9 | 0.1% | `(anonymous) @ src/render/renderer.js:5507` |
| 41.2 | 0.1% | `upgradePlaceBoundary @ src/render/partsLibrary.js:2719` |
| 41.0 | 0.1% | `(anonymous) @ src/render/renderPackageLoader.js:887` |

## Top self time

| ms | share | function |
|---:|---:|---|
| 36784.5 | 60.4% | `(idle) @ native:0` |
| 3731.2 | 6.1% | `isProgram @ native:0` |
| 3542.2 | 5.8% | `isProgram @ native:0` |
| 2959.5 | 4.9% | `isProgram @ native:0` |
| 2527.8 | 4.1% | `(program) @ native:0` |
| 497.4 | 0.8% | `isProgram @ native:0` |
| 439.8 | 0.7% | `get clientWidth @ native:0` |
| 385.4 | 0.6% | `draw @ src/ui/radar.js:744` |
| 378.2 | 0.6% | `isProgram @ native:0` |
| 357.7 | 0.6% | `compressedTexSubImage2D @ native:0` |
| 285.2 | 0.5% | `queryAsteroidField @ src/world/asteroidField.js:135` |
| 262.2 | 0.4% | `(garbage collector) @ native:0` |
| 149.3 | 0.2% | `setProgram @ vendor/three.module.js:18291` |
| 117.5 | 0.2% | `step @ src/core/registry.js:773` |
| 102.1 | 0.2% | `drawRangePlate @ src/ui/radar.js:397` |
| 94.2 | 0.2% | `WebGLRenderer.renderBufferDirect @ vendor/three.module.js:17141` |
| 87.5 | 0.1% | `upload @ vendor/three.module.js:6214` |
| 70.6 | 0.1% | `refreshUniformsCommon @ vendor/three.module.js:15102` |
| 64.0 | 0.1% | `getBoundingClientRect @ native:0` |
| 60.4 | 0.1% | `classifyWorld @ src/world/activityRuntime.js:697` |
| 57.7 | 0.1% | `bindVertexArray @ native:0` |
| 53.2 | 0.1% | `syncEntityViews @ src/render/renderer.js:11064` |
| 50.6 | 0.1% | `prepareFrame @ src/render/renderer.js:11952` |
| 47.6 | 0.1% | `setValue @ vendor/three.module.js:6063` |
| 46.8 | 0.1% | `needsUpdate @ vendor/three.module.js:1742` |

## Self time by source

| ms | share | source |
|---:|---:|---|
| 36784.5 | 60.4% | `(idle)` |
| 12644.0 | 20.8% | `(native)` |
| 2527.8 | 4.1% | `(program)` |
| 1560.7 | 2.6% | `vendor/three.module.js` |
| 1096.3 | 1.8% | `vendor/three.core.js` |
| 533.2 | 0.9% | `src/ui/radar.js` |
| 296.3 | 0.5% | `src/world/asteroidField.js` |
| 262.2 | 0.4% | `(garbage collector)` |
| 221.5 | 0.4% | `src/render/renderer.js` |
| 220.6 | 0.4% | `src/render/vfx.js` |
| 209.6 | 0.3% | `src/world/activityRuntime.js` |
| 176.9 | 0.3% | `src/ui/hud.js` |
| 154.9 | 0.3% | `src/core/sg02DynamicBodyOwner.js` |
| 145.2 | 0.2% | `wasm://wasm/005fccd2` |
| 141.6 | 0.2% | `src/core/flight/propulsionKernel.js` |

## Canvas census during flight

A canvas that is still `connected` with a zero client size is not in layout and cannot be seen.
If its backing store is large, or grows between runs, it is an orphaned render surface.

| id / class | backing store | client | display | connected |
|---|---|---|---|---|
| gl-canvas | 435x244 | 1280x719 | block | true |
| sf-radar-semantic-canvas | 220x220 | 220x220 | block | true |
| sf-fx-flickergrid | 560x260 | 0x0 | inline | true |
| sf-speed-lines | 1280x719 | 1280x719 | block | true |
| sf-capital-boss-overlay | 1280x719 | 1280x719 | block | true |

## Long tasks in the window

| start ms | duration ms |
|---:|---:|
| 63412 | 97 |
| 63519 | 54 |
| 63624 | 186 |
| 63937 | 129 |
| 64197 | 128 |
| 64450 | 98 |
| 64733 | 129 |
| 64985 | 100 |
| 65242 | 195 |
| 65501 | 64 |
| 65620 | 61 |
| 65760 | 188 |
| 66014 | 74 |
| 66270 | 124 |
| 66569 | 184 |
| 66824 | 158 |
| 67084 | 147 |
| 67340 | 136 |
| 67599 | 123 |
| 67871 | 211 |
