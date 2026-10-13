# Main-thread profile

Window: 21735.1 ms of flight. Long tasks recorded in the window: **24**.

## Top-level entry points (inclusive)

The owner of the frame. Anything here that is not the game's own presentation frame is work
the in-engine hitch classifier cannot see.

| ms | share | entry |
|---:|---:|---|
| 10119.4 | 46.6% | `frame @ src/core/presentationRunner.js:1060` |
| 5058.6 | 23.3% | `(program) @ native:0` |
| 3112.1 | 14.3% | `(idle) @ native:0` |
| 2203.6 | 10.1% | `capture @ src/ui/screens/flightFootage.js:57` |
| 671.6 | 3.1% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 143.2 | 0.7% | `(anonymous) @ src/render/renderer.js:12649` |
| 87.8 | 0.4% | `compileSubjectColorAndDepth @ src/render/renderer.js:12104` |
| 49.7 | 0.2% | `(garbage collector) @ native:0` |
| 44.8 | 0.2% | `drive @ src/systems/mobile/laneTouchSurface.js:77` |
| 25.2 | 0.1% | `(anonymous) @ src/render/pipelineReadiness.js:841` |
| 20.5 | 0.1% | `(anonymous) @ src/render/pipelineReadiness.js:420` |
| 16.5 | 0.1% | `paint @ src/ui/screens/crucibleLabTelemetry.js:274` |
| 15.1 | 0.1% | `(anonymous) @ src/ui/introSignalRemixBoot.js:100` |
| 14.3 | 0.1% | `tick @ src/ui/orrery/motion.js:22` |
| 13.3 | 0.1% | `fire @ src/render/compilePresentSlice.js:361` |

## Top self time

| ms | share | function |
|---:|---:|---|
| 5058.6 | 23.3% | `(program) @ native:0` |
| 3112.1 | 14.3% | `(idle) @ native:0` |
| 2186.7 | 10.1% | `toBlob @ native:0` |
| 265.9 | 1.2% | `worker.onmessage @ src/core/simLaneMain.js:1163` |
| 176.4 | 0.8% | `setProgram @ vendor/three.module.js:18879` |
| 171.3 | 0.8% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |
| 169.8 | 0.8% | `Object3D.updateMatrixWorld @ vendor/three.module.js:140` |
| 134.1 | 0.6% | `syncEntityViewsSteps @ src/render/renderer.js:26772` |
| 132.9 | 0.6% | `refreshUniformsCommon @ vendor/three.module.js:15342` |
| 128.1 | 0.6% | `upload @ vendor/three.module.js:6425` |
| 119.5 | 0.5% | `refreshUniformsCommon @ vendor/three.module.js:15342` |
| 119.4 | 0.5% | `setProgram @ vendor/three.module.js:18879` |
| 96.3 | 0.4% | `intersectsObject @ vendor/three.core.js:25320` |
| 96.2 | 0.4% | `detachedPresentedDrawBlocked @ src/render/packageCpuDetach.js:728` |
| 95.6 | 0.4% | `bindVertexArray @ native:0` |
| 94.8 | 0.4% | `WebGLRenderer.renderBufferDirect @ vendor/three.module.js:17381` |
| 91.4 | 0.4% | `upload @ vendor/three.module.js:6425` |
| 86.5 | 0.4% | `getParameters @ vendor/three.module.js:7667` |
| 86.4 | 0.4% | `projectObject @ vendor/three.module.js:18323` |
| 84.7 | 0.4% | `cameraClearanceBoxForMesh @ src/render/renderer.js:4881` |
| 83.2 | 0.4% | `unreadyDrawGuard @ src/render/bloom.js:1091` |
| 76.3 | 0.4% | `classifyWorld @ src/world/activityRuntime.js:1568` |
| 74.5 | 0.3% | `projectObject @ vendor/three.module.js:18323` |
| 73.0 | 0.3% | `projectObject @ vendor/three.module.js:18323` |
| 72.3 | 0.3% | `detachedPresentedDrawBlocked @ src/render/packageCpuDetach.js:728` |

## Self time by source

| ms | share | source |
|---:|---:|---|
| 5058.6 | 23.3% | `(program)` |
| 3814.8 | 17.6% | `vendor/three.module.js` |
| 3318.1 | 15.3% | `(native)` |
| 3112.1 | 14.3% | `(idle)` |
| 1019.0 | 4.7% | `vendor/three.core.js` |
| 868.2 | 4.0% | `src/render/renderer.js` |
| 367.5 | 1.7% | `src/core/simLaneMain.js` |
| 343.5 | 1.6% | `src/render/packageCpuDetach.js` |
| 271.7 | 1.2% | `src/world/activityRuntime.js` |
| 257.6 | 1.2% | `src/render/vfx.js` |
| 236.7 | 1.1% | `src/render/bloom.js` |
| 174.5 | 0.8% | `src/ui/hud.js` |
| 163.4 | 0.8% | `src/render/dynamicBufferRanges.js` |
| 111.5 | 0.5% | `scripts/lib/simReadModel.mjs` |
| 97.5 | 0.4% | `src/render/visualCullRadius.js` |

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
| ast-canvas | 300x150 | 0x0 | block | true |
| aw-empty-rock | 1600x900 | 0x0 | block | true |
| (none) | 450x270 | 0x0 | block | true |
| orr-base__lattice | 800x400 | 0x0 | block | true |
| boot-terminal-canvas | 300x150 | 0x0 | block | true |
| boot-ring-layer | 220x260 | 0x0 | block | true |
| sf-capital-boss-overlay | 1833x974 | 1466x779 | block | true |

## Long tasks in the window

| start ms | duration ms |
|---:|---:|
| 54090 | 64 |
| 54768 | 52 |
| 55484 | 53 |
| 55734 | 168 |
| 56903 | 196 |
| 57103 | 50 |
| 58179 | 121 |
| 58580 | 57 |
| 59101 | 50 |
| 59251 | 52 |
| 59318 | 265 |
| 60135 | 52 |
| 60585 | 209 |
| 61768 | 240 |
| 63151 | 149 |
| 64368 | 104 |
| 65502 | 107 |
| 66727 | 82 |
| 67835 | 155 |
| 68815 | 56 |
