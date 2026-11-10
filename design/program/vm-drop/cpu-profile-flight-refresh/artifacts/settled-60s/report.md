# Main-thread profile

Window: 60937.1 ms of flight. Long tasks recorded in the window: **18**.

## Top-level entry points (inclusive)

The owner of the frame. Anything here that is not the game's own presentation frame is work
the in-engine hitch classifier cannot see.

| ms | share | entry |
|---:|---:|---|
| 34894.0 | 57.3% | `(idle) @ native:0` |
| 12895.7 | 21.2% | `frame @ src/core/presentationRunner.js:780` |
| 5493.9 | 9.0% | `enqueueGeometryResidencyBatches.urgent @ src/render/startupGpuResidency.js:433` |
| 3105.7 | 5.1% | `(program) @ native:0` |
| 1194.6 | 2.0% | `checkProgramsReady @ src/render/bloom.js:636` |
| 1023.4 | 1.7% | `(anonymous) @ src/render/pipelineReadiness.js:249` |
| 742.2 | 1.2% | `prepareStartupGpuResidency @ src/render/startupGpuResidency.js:511` |
| 525.2 | 0.9% | `(anonymous) @ src/render/renderer.js:5795` |
| 203.7 | 0.3% | `(garbage collector) @ native:0` |
| 193.3 | 0.3% | `(anonymous) @ src/render/pipelineReadiness.js:387` |
| 74.6 | 0.1% | `compileSubjectsAcrossPresents @ src/render/compilePresentSlice.js:22` |
| 67.7 | 0.1% | `upgradePlaceBoundary @ src/render/partsLibrary.js:2775` |
| 65.0 | 0.1% | `admitOpeningUnitsAcrossSlices @ src/render/openingGpuAdmission.js:319` |
| 60.9 | 0.1% | `upgradeBoundary @ src/render/partsLibrary.js:5146` |
| 44.3 | 0.1% | `(anonymous) @ src/render/renderPackageLoader.js:169` |

## Top self time

| ms | share | function |
|---:|---:|---|
| 34894.0 | 57.3% | `(idle) @ native:0` |
| 5434.6 | 8.9% | `bufferData @ native:0` |
| 3105.7 | 5.1% | `(program) @ native:0` |
| 1179.4 | 1.9% | `isProgram @ native:0` |
| 620.7 | 1.0% | `getProgramParameter @ native:0` |
| 577.3 | 0.9% | `isProgram @ native:0` |
| 487.5 | 0.8% | `getProgramParameter @ native:0` |
| 422.6 | 0.7% | `texSubImage2D @ native:0` |
| 422.1 | 0.7% | `isProgram @ native:0` |
| 398.9 | 0.7% | `draw @ src/ui/radar.js:744` |
| 296.6 | 0.5% | `compressedTexSubImage2D @ native:0` |
| 212.9 | 0.3% | `setProgram @ vendor/three.module.js:18291` |
| 203.7 | 0.3% | `(garbage collector) @ native:0` |
| 188.0 | 0.3% | `isProgram @ native:0` |
| 169.7 | 0.3% | `step @ src/core/registry.js:773` |
| 147.8 | 0.2% | `WebGLRenderer.renderBufferDirect @ vendor/three.module.js:17141` |
| 120.7 | 0.2% | `refreshUniformsCommon @ vendor/three.module.js:15102` |
| 115.6 | 0.2% | `upload @ vendor/three.module.js:6214` |
| 107.3 | 0.2% | `classifyWorld @ src/world/activityRuntime.js:706` |
| 90.4 | 0.1% | `bindVertexArray @ native:0` |
| 79.8 | 0.1% | `classifyWorld @ src/world/activityRuntime.js:706` |
| 75.1 | 0.1% | `needsUpdate @ vendor/three.module.js:1742` |
| 72.0 | 0.1% | `setValue @ vendor/three.module.js:6063` |
| 68.9 | 0.1% | `syncEntityViews @ src/render/renderer.js:11693` |
| 66.0 | 0.1% | `compose @ vendor/three.core.js:10827` |

## Self time by source

| ms | share | source |
|---:|---:|---|
| 34894.0 | 57.3% | `(idle)` |
| 10626.1 | 17.4% | `(native)` |
| 3105.7 | 5.1% | `(program)` |
| 2373.5 | 3.9% | `vendor/three.module.js` |
| 1432.8 | 2.4% | `vendor/three.core.js` |
| 483.1 | 0.8% | `src/ui/radar.js` |
| 375.8 | 0.6% | `src/world/activityRuntime.js` |
| 300.8 | 0.5% | `src/render/vfx.js` |
| 300.5 | 0.5% | `src/render/renderer.js` |
| 255.6 | 0.4% | `src/systems/flightV3.js` |
| 248.1 | 0.4% | `wasm://wasm/005fccd2` |
| 245.5 | 0.4% | `src/core/flight/propulsionKernel.js` |
| 242.8 | 0.4% | `src/core/sg02DynamicBodyOwner.js` |
| 229.7 | 0.4% | `src/ui/hud.js` |
| 203.7 | 0.3% | `(garbage collector)` |

## Canvas census during flight

A canvas that is still `connected` with a zero client size is not in layout and cannot be seen.
If its backing store is large, or grows between runs, it is an orphaned render surface.

| id / class | backing store | client | display | connected |
|---|---|---|---|---|
| gl-canvas | 435x244 | 1280x719 | block | true |
| sf-radar-semantic-canvas | 220x220 | 220x220 | block | true |
| sf-fx-flickergrid | 560x260 | 0x0 | inline | true |
| sf-speed-lines | 1280x719 | 1280x719 | block | true |
| boot-terminal-canvas | 1280x743 | 0x0 | block | true |
| sf-capital-boss-overlay | 1280x719 | 1280x719 | block | true |

## Long tasks in the window

| start ms | duration ms |
|---:|---:|
| 47877 | 91 |
| 48023 | 816 |
| 55110 | 617 |
| 55747 | 492 |
| 57332 | 191 |
| 58868 | 52 |
| 59338 | 160 |
| 59848 | 155 |
| 60663 | 76 |
| 61356 | 248 |
| 62388 | 50 |
| 63173 | 549 |
| 64195 | 183 |
| 69021 | 83 |
| 69149 | 134 |
| 69305 | 123 |
| 73774 | 171 |
| 74272 | 87 |
