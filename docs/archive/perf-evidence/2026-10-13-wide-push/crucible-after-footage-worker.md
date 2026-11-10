# Main-thread profile

Window: 21987.6 ms of flight. Long tasks recorded in the window: **11**.

## Top-level entry points (inclusive)

The owner of the frame. Anything here that is not the game's own presentation frame is work
the in-engine hitch classifier cannot see.

| ms | share | entry |
|---:|---:|---|
| 9093.2 | 41.4% | `frame @ src/core/presentationRunner.js:1060` |
| 6573.5 | 29.9% | `(idle) @ native:0` |
| 5233.9 | 23.8% | `(program) @ native:0` |
| 570.1 | 2.6% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 114.1 | 0.5% | `(garbage collector) @ native:0` |
| 82.2 | 0.4% | `(anonymous) @ src/render/renderer.js:12649` |
| 56.5 | 0.3% | `capture @ src/ui/screens/flightFootage.js:131` |
| 46.1 | 0.2% | `drive @ src/systems/mobile/laneTouchSurface.js:77` |
| 35.9 | 0.2% | `compileSubjectColorAndDepth @ src/render/renderer.js:12104` |
| 25.9 | 0.1% | `tick @ src/ui/orrery/motion.js:22` |
| 15.3 | 0.1% | `(anonymous) @ src/render/pipelineReadiness.js:841` |
| 10.8 | 0.0% | `paint @ src/ui/screens/crucibleLabTelemetry.js:274` |
| 10.2 | 0.0% | `(anonymous) @ src/render/pipelineReadiness.js:420` |
| 9.7 | 0.0% | `(anonymous) @ native:4` |
| 9.2 | 0.0% | `(anonymous) @ src/render/renderer.js:26050` |

## Top self time

| ms | share | function |
|---:|---:|---|
| 6573.5 | 29.9% | `(idle) @ native:0` |
| 5233.9 | 23.8% | `(program) @ native:0` |
| 234.8 | 1.1% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 157.3 | 0.7% | `syncEntityViewsSteps @ src/render/renderer.js:26772` |
| 150.9 | 0.7% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |
| 149.7 | 0.7% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |
| 134.3 | 0.6% | `setProgram @ vendor/three.module.js:18879` |
| 127.9 | 0.6% | `refreshUniformsCommon @ vendor/three.module.js:15342` |
| 114.1 | 0.5% | `(garbage collector) @ native:0` |
| 104.8 | 0.5% | `upload @ vendor/three.module.js:6425` |
| 95.2 | 0.4% | `setProgram @ vendor/three.module.js:18879` |
| 90.6 | 0.4% | `upload @ vendor/three.module.js:6425` |
| 85.5 | 0.4% | `refreshUniformsCommon @ vendor/three.module.js:15342` |
| 85.3 | 0.4% | `now @ src/render/renderer.js:4144` |
| 80.7 | 0.4% | `bindVertexArray @ native:0` |
| 79.9 | 0.4% | `WebGLRenderer.renderBufferDirect @ vendor/three.module.js:17381` |
| 78.4 | 0.4% | `projectObject @ vendor/three.module.js:18323` |
| 78.4 | 0.4% | `detachedPresentedDrawBlocked @ src/render/packageCpuDetach.js:728` |
| 77.2 | 0.4% | `projectObject @ vendor/three.module.js:18323` |
| 74.9 | 0.3% | `detachedPresentedDrawBlocked @ src/render/packageCpuDetach.js:728` |
| 68.6 | 0.3% | `getParameters @ vendor/three.module.js:7667` |
| 65.6 | 0.3% | `getParameters @ vendor/three.module.js:7667` |
| 64.4 | 0.3% | `intersectsObject @ vendor/three.core.js:25320` |
| 64.1 | 0.3% | `cameraClearanceBoxForMesh @ src/render/renderer.js:4881` |
| 60.9 | 0.3% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |

## Self time by source

| ms | share | source |
|---:|---:|---|
| 6573.5 | 29.9% | `(idle)` |
| 5233.9 | 23.8% | `(program)` |
| 3409.8 | 15.5% | `vendor/three.module.js` |
| 1081.3 | 4.9% | `(native)` |
| 851.3 | 3.9% | `vendor/three.core.js` |
| 816.5 | 3.7% | `src/render/renderer.js` |
| 321.9 | 1.5% | `src/core/simLaneMain.js` |
| 302.7 | 1.4% | `src/render/packageCpuDetach.js` |
| 244.5 | 1.1% | `src/world/activityRuntime.js` |
| 208.8 | 0.9% | `src/render/vfx.js` |
| 184.9 | 0.8% | `src/ui/hud.js` |
| 176.4 | 0.8% | `src/render/bloom.js` |
| 137.8 | 0.6% | `src/render/dynamicBufferRanges.js` |
| 114.1 | 0.5% | `(garbage collector)` |
| 97.2 | 0.4% | `scripts/lib/simReadModel.mjs` |

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
| (none) | 450x270 | 0x0 | block | true |
| sf-range__canvas | 300x150 | 0x0 | block | true |
| (none) | 300x150 | 0x0 | block | true |
| (none) | 2x2 | 0x0 | block | true |
| ast-canvas | 300x150 | 0x0 | block | true |
| aw-empty-rock | 1600x900 | 0x0 | block | true |
| orr-base__lattice | 800x400 | 0x0 | block | true |
| boot-terminal-canvas | 300x150 | 0x0 | block | true |
| boot-ring-layer | 220x260 | 0x0 | block | true |
| sf-capital-boss-overlay | 1833x974 | 1466x779 | block | true |

## Long tasks in the window

| start ms | duration ms |
|---:|---:|
| 55901 | 68 |
| 56063 | 121 |
| 56428 | 56 |
| 56836 | 52 |
| 56991 | 61 |
| 57067 | 52 |
| 57133 | 58 |
| 57213 | 52 |
| 57429 | 54 |
| 65149 | 52 |
| 65204 | 88 |
