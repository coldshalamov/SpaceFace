# Main-thread profile

Window: 21624.0 ms of flight. Long tasks recorded in the window: **7**.

## Top-level entry points (inclusive)

The owner of the frame. Anything here that is not the game's own presentation frame is work
the in-engine hitch classifier cannot see.

| ms | share | entry |
|---:|---:|---|
| 9555.1 | 44.2% | `frame @ src/core/presentationRunner.js:1060` |
| 5999.6 | 27.7% | `(idle) @ native:0` |
| 4863.9 | 22.5% | `(program) @ native:0` |
| 650.4 | 3.0% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 140.1 | 0.6% | `(anonymous) @ src/render/renderer.js:12649` |
| 64.9 | 0.3% | `capture @ src/ui/screens/flightFootage.js:131` |
| 57.7 | 0.3% | `compileSubjectColorAndDepth @ src/render/renderer.js:12104` |
| 45.7 | 0.2% | `(garbage collector) @ native:0` |
| 33.6 | 0.2% | `drive @ src/systems/mobile/laneTouchSurface.js:77` |
| 18.7 | 0.1% | `(anonymous) @ src/render/pipelineReadiness.js:841` |
| 14.0 | 0.1% | `paint @ src/ui/screens/crucibleLabTelemetry.js:274` |
| 11.2 | 0.1% | `(anonymous) @ src/render/pipelineReadiness.js:420` |
| 10.6 | 0.0% | `(anonymous) @ src/ui/introSignalRemixBoot.js:100` |
| 9.8 | 0.0% | `tick @ src/ui/orrery/motion.js:22` |
| 9.5 | 0.0% | `fire @ src/render/compilePresentSlice.js:361` |

## Top self time

| ms | share | function |
|---:|---:|---|
| 5999.6 | 27.7% | `(idle) @ native:0` |
| 4863.9 | 22.5% | `(program) @ native:0` |
| 228.7 | 1.1% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 177.5 | 0.8% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |
| 158.1 | 0.7% | `setProgram @ vendor/three.module.js:18879` |
| 151.2 | 0.7% | `syncEntityViewsSteps @ src/render/renderer.js:26772` |
| 144.4 | 0.7% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |
| 131.4 | 0.6% | `upload @ vendor/three.module.js:6425` |
| 107.5 | 0.5% | `refreshUniformsCommon @ vendor/three.module.js:15342` |
| 105.1 | 0.5% | `refreshUniformsCommon @ vendor/three.module.js:15342` |
| 87.8 | 0.4% | `setProgram @ vendor/three.module.js:18879` |
| 82.3 | 0.4% | `detachedPresentedDrawBlocked @ src/render/packageCpuDetach.js:728` |
| 82.3 | 0.4% | `unreadyDrawGuard @ src/render/bloom.js:1091` |
| 81.6 | 0.4% | `projectObject @ vendor/three.module.js:18323` |
| 81.6 | 0.4% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |
| 79.0 | 0.4% | `detachedPresentedDrawBlocked @ src/render/packageCpuDetach.js:728` |
| 78.8 | 0.4% | `classifyWorld @ src/world/activityRuntime.js:1568` |
| 78.3 | 0.4% | `WebGLRenderer.renderBufferDirect @ vendor/three.module.js:17381` |
| 77.3 | 0.4% | `bindVertexArray @ native:0` |
| 76.6 | 0.4% | `projectObject @ vendor/three.module.js:18323` |
| 73.1 | 0.3% | `upload @ vendor/three.module.js:6425` |
| 72.0 | 0.3% | `getParameters @ vendor/three.module.js:7667` |
| 69.9 | 0.3% | `restorePresentedCompressedMips @ src/render/packageCpuDetach.js:829` |
| 69.4 | 0.3% | `projectObject @ vendor/three.module.js:18323` |
| 69.2 | 0.3% | `now @ src/render/renderer.js:4144` |

## Self time by source

| ms | share | source |
|---:|---:|---|
| 5999.6 | 27.7% | `(idle)` |
| 4863.9 | 22.5% | `(program)` |
| 3503.7 | 16.2% | `vendor/three.module.js` |
| 1058.3 | 4.9% | `(native)` |
| 934.7 | 4.3% | `vendor/three.core.js` |
| 881.2 | 4.1% | `src/render/renderer.js` |
| 333.3 | 1.5% | `src/core/simLaneMain.js` |
| 325.0 | 1.5% | `src/render/packageCpuDetach.js` |
| 274.7 | 1.3% | `src/render/vfx.js` |
| 246.6 | 1.1% | `src/world/activityRuntime.js` |
| 218.1 | 1.0% | `src/render/bloom.js` |
| 174.9 | 0.8% | `src/ui/hud.js` |
| 144.9 | 0.7% | `src/render/dynamicBufferRanges.js` |
| 107.3 | 0.5% | `scripts/lib/simReadModel.mjs` |
| 92.9 | 0.4% | `src/render/visualCullRadius.js` |

## Canvas census during flight

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
| (none) | 450x270 | 0x0 | block | true |
| ast-canvas | 300x150 | 0x0 | block | true |
| aw-empty-rock | 1600x900 | 0x0 | block | true |
| orr-base__lattice | 800x400 | 0x0 | block | true |
| boot-terminal-canvas | 300x150 | 0x0 | block | true |
| boot-ring-layer | 220x260 | 0x0 | block | true |
| sf-capital-boss-overlay | 1833x974 | 1466x779 | block | true |

## Long tasks in the window

| start ms | duration ms |
|---:|---:|
| 60418 | 84 |
| 61278 | 53 |
| 62396 | 61 |
| 63120 | 50 |
| 63759 | 57 |
| 68499 | 52 |
| 68753 | 50 |
