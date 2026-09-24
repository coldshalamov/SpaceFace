# Main-thread profile

Window: 46066.0 ms of flight. Long tasks recorded in the window: **21**.

## Top-level entry points (inclusive)

The owner of the frame. Anything here that is not the game's own presentation frame is work
the in-engine hitch classifier cannot see.

| ms | share | entry |
|---:|---:|---|
| 31626.6 | 68.7% | `(idle) @ native:0` |
| 8285.3 | 18.0% | `frame @ src/core/presentationRunner.js:780` |
| 2824.0 | 6.1% | `(program) @ native:0` |
| 1334.1 | 2.9% | `checkProgramsReady @ src/render/bloom.js:636` |
| 352.2 | 0.8% | `prepareStartupGpuResidency @ src/render/startupGpuResidency.js:511` |
| 243.0 | 0.5% | `drain @ src/render/bloom.js:481` |
| 221.3 | 0.5% | `(garbage collector) @ native:0` |
| 149.1 | 0.3% | `(anonymous) @ src/render/pipelineReadiness.js:387` |
| 143.6 | 0.3% | `(anonymous) @ src/render/pipelineReadiness.js:249` |
| 105.9 | 0.2% | `compileSubjectsAcrossPresents @ src/render/compilePresentSlice.js:22` |
| 81.6 | 0.2% | `upgradeBoundary @ src/render/partsLibrary.js:5284` |
| 74.5 | 0.2% | `upgradePlaceBoundary @ src/render/partsLibrary.js:2780` |
| 74.0 | 0.2% | `(anonymous) @ src/render/renderPackageLoader.js:169` |
| 56.0 | 0.1% | `enqueueGeometryResidencyBatches.urgent @ src/render/startupGpuResidency.js:433` |
| 50.7 | 0.1% | `admitOpeningUnitsAcrossSlices @ src/render/openingGpuAdmission.js:324` |

## Top self time

| ms | share | function |
|---:|---:|---|
| 31626.6 | 68.7% | `(idle) @ native:0` |
| 2824.0 | 6.1% | `(program) @ native:0` |
| 1317.6 | 2.9% | `isProgram @ native:0` |
| 340.2 | 0.7% | `getProgramParameter @ native:0` |
| 328.2 | 0.7% | `compressedTexSubImage2D @ native:0` |
| 242.7 | 0.5% | `isProgram @ native:0` |
| 221.3 | 0.5% | `(garbage collector) @ native:0` |
| 145.9 | 0.3% | `isProgram @ native:0` |
| 133.9 | 0.3% | `setProgram @ vendor/three.module.js:18291` |
| 131.6 | 0.3% | `isProgram @ native:0` |
| 123.3 | 0.3% | `step @ src/core/registry.js:775` |
| 106.1 | 0.2% | `queryFarActors @ src/world/farActorTable.js:387` |
| 103.9 | 0.2% | `refreshCredits @ src/ui/hud.js:3857` |
| 70.3 | 0.2% | `WebGLRenderer.renderBufferDirect @ vendor/three.module.js:17141` |
| 70.0 | 0.2% | `upload @ vendor/three.module.js:6214` |
| 63.8 | 0.1% | `classifyWorld @ src/world/activityRuntime.js:765` |
| 60.6 | 0.1% | `refreshUniformsCommon @ vendor/three.module.js:15102` |
| 56.9 | 0.1% | `bindVertexArray @ native:0` |
| 52.4 | 0.1% | `setValue @ vendor/three.module.js:6063` |
| 51.6 | 0.1% | `prepareFrame @ src/render/renderer.js:13193` |
| 50.8 | 0.1% | `syncEntityViews @ src/render/renderer.js:12255` |
| 44.6 | 0.1% | `needsUpdate @ vendor/three.module.js:1742` |
| 43.2 | 0.1% | `queryFarActors @ src/world/farActorTable.js:387` |
| 42.5 | 0.1% | `setValueV3f @ vendor/three.module.js:5251` |
| 41.2 | 0.1% | `frame @ src/ui/hud.js:4830` |

## Self time by source

| ms | share | source |
|---:|---:|---|
| 31626.6 | 68.7% | `(idle)` |
| 3233.2 | 7.0% | `(native)` |
| 2824.0 | 6.1% | `(program)` |
| 1414.5 | 3.1% | `vendor/three.module.js` |
| 1016.3 | 2.2% | `vendor/three.core.js` |
| 263.4 | 0.6% | `src/render/renderer.js` |
| 253.4 | 0.6% | `src/ui/hud.js` |
| 221.3 | 0.5% | `(garbage collector)` |
| 212.5 | 0.5% | `src/world/activityRuntime.js` |
| 205.0 | 0.4% | `src/world/farActorTable.js` |
| 193.6 | 0.4% | `src/render/vfx.js` |
| 166.0 | 0.4% | `src/core/sg02DynamicBodyOwner.js` |
| 141.9 | 0.3% | `src/core/flight/propulsionKernel.js` |
| 129.5 | 0.3% | `src/systems/flightV3.js` |
| 128.7 | 0.3% | `src/core/registry.js` |

## Canvas census during flight

A canvas that is still `connected` with a zero client size is not in layout and cannot be seen.
If its backing store is large, or grows between runs, it is an orphaned render surface.

| id / class | backing store | client | display | connected |
|---|---|---|---|---|
| gl-canvas | 435x244 | 1280x719 | block | true |
| sf-radar-semantic-canvas | 220x220 | 220x220 | block | true |
| sf-fx-flickergrid | 560x260 | 0x0 | inline | true |
| sf-speed-lines | 1280x719 | 1280x719 | block | true |
| boot-terminal-canvas | 1280x719 | 0x0 | block | true |
| sf-capital-boss-overlay | 1280x719 | 1280x719 | block | true |

## Long tasks in the window

| start ms | duration ms |
|---:|---:|
| 46794 | 289 |
| 47141 | 246 |
| 47388 | 60 |
| 47567 | 64 |
| 52908 | 55 |
| 53341 | 56 |
| 53710 | 176 |
| 54009 | 149 |
| 54850 | 110 |
| 56017 | 228 |
| 58029 | 239 |
| 60038 | 429 |
| 60701 | 225 |
| 62039 | 191 |
| 63317 | 96 |
| 63443 | 50 |
| 65299 | 55 |
| 68477 | 148 |
| 70494 | 229 |
| 70759 | 53 |
