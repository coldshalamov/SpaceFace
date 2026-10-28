# Main-thread profile

Window: 21880.0 ms of flight. Long tasks recorded in the window: **20**.

## Top-level entry points (inclusive)

The owner of the frame. Anything here that is not the game's own presentation frame is work
the in-engine hitch classifier cannot see.

| ms | share | entry |
|---:|---:|---|
| 9337.6 | 42.7% | `frame @ src/core/presentationRunner.js:1060` |
| 5284.8 | 24.2% | `(program) @ native:0` |
| 3465.6 | 15.8% | `(idle) @ native:0` |
| 2478.8 | 11.3% | `capture @ src/ui/screens/flightFootage.js:57` |
| 651.4 | 3.0% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 178.0 | 0.8% | `(anonymous) @ src/render/renderer.js:12649` |
| 129.8 | 0.6% | `(garbage collector) @ native:0` |
| 86.9 | 0.4% | `compileSubjectColorAndDepth @ src/render/renderer.js:12104` |
| 34.6 | 0.2% | `drive @ src/systems/mobile/laneTouchSurface.js:77` |
| 20.5 | 0.1% | `(anonymous) @ src/render/pipelineReadiness.js:841` |
| 17.5 | 0.1% | `(anonymous) @ src/render/pipelineReadiness.js:420` |
| 13.7 | 0.1% | `tick @ src/ui/orrery/motion.js:22` |
| 13.6 | 0.1% | `(anonymous) @ src/render/renderer.js:9460` |
| 13.6 | 0.1% | `paint @ src/ui/screens/crucibleLabTelemetry.js:274` |
| 13.2 | 0.1% | `(anonymous) @ src/ui/map/mapParityBridge.js:267` |

## Top self time

| ms | share | function |
|---:|---:|---|
| 5284.8 | 24.2% | `(program) @ native:0` |
| 3465.6 | 15.8% | `(idle) @ native:0` |
| 2464.9 | 11.3% | `toBlob @ native:0` |
| 251.4 | 1.1% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 165.6 | 0.8% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |
| 145.2 | 0.7% | `syncEntityViewsSteps @ src/render/renderer.js:26772` |
| 142.3 | 0.7% | `setProgram @ vendor/three.module.js:18879` |
| 136.7 | 0.6% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |
| 129.8 | 0.6% | `(garbage collector) @ native:0` |
| 117.9 | 0.5% | `refreshUniformsCommon @ vendor/three.module.js:15342` |
| 114.7 | 0.5% | `refreshUniformsCommon @ vendor/three.module.js:15342` |
| 108.2 | 0.5% | `upload @ vendor/three.module.js:6425` |
| 96.4 | 0.4% | `setProgram @ vendor/three.module.js:18879` |
| 89.3 | 0.4% | `bindVertexArray @ native:0` |
| 78.9 | 0.4% | `upload @ vendor/three.module.js:6425` |
| 78.1 | 0.4% | `projectObject @ vendor/three.module.js:18323` |
| 75.4 | 0.3% | `detachedPresentedDrawBlocked @ src/render/packageCpuDetach.js:728` |
| 74.7 | 0.3% | `classifyWorld @ src/world/activityRuntime.js:1568` |
| 73.9 | 0.3% | `getParameters @ vendor/three.module.js:7667` |
| 73.7 | 0.3% | `WebGLRenderer.renderBufferDirect @ vendor/three.module.js:17381` |
| 72.7 | 0.3% | `now @ src/render/renderer.js:4144` |
| 70.8 | 0.3% | `unreadyDrawGuard @ src/render/bloom.js:1091` |
| 70.5 | 0.3% | `projectObject @ vendor/three.module.js:18323` |
| 68.0 | 0.3% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |
| 67.9 | 0.3% | `intersectsObject @ vendor/three.core.js:25320` |

## Self time by source

| ms | share | source |
|---:|---:|---|
| 5284.8 | 24.2% | `(program)` |
| 3488.4 | 15.9% | `(native)` |
| 3465.6 | 15.8% | `(idle)` |
| 3352.2 | 15.3% | `vendor/three.module.js` |
| 929.4 | 4.2% | `vendor/three.core.js` |
| 853.6 | 3.9% | `src/render/renderer.js` |
| 340.1 | 1.6% | `src/core/simLaneMain.js` |
| 286.9 | 1.3% | `src/render/packageCpuDetach.js` |
| 273.3 | 1.2% | `src/render/vfx.js` |
| 262.7 | 1.2% | `src/world/activityRuntime.js` |
| 204.7 | 0.9% | `src/render/bloom.js` |
| 184.1 | 0.8% | `src/ui/hud.js` |
| 159.2 | 0.7% | `src/render/dynamicBufferRanges.js` |
| 129.8 | 0.6% | `(garbage collector)` |
| 101.9 | 0.5% | `scripts/lib/simReadModel.mjs` |

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
| (none) | 450x270 | 0x0 | block | true |
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
| 55908 | 51 |
| 55960 | 100 |
| 57091 | 371 |
| 57465 | 52 |
| 58457 | 179 |
| 58860 | 56 |
| 59624 | 173 |
| 60891 | 267 |
| 62191 | 174 |
| 63426 | 241 |
| 64691 | 179 |
| 65974 | 284 |
| 67441 | 288 |
| 68224 | 50 |
| 68775 | 149 |
| 69941 | 278 |
| 70993 | 55 |
| 71369 | 51 |
| 71574 | 149 |
| 72692 | 163 |
