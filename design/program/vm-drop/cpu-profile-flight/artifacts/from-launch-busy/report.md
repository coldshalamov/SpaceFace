# Launch-to-flight main-thread profile

Profile: fresh temporary evidence profile (cold GPU program cache and HTTP cache). New Game seed 47.

**Launch click to flight: 18.8 s.** New Game click to flight: 29.8 s. The profile continues 20.3 s into held-thrust flight.

## Where the time went, by phase

Busy is sampled main-thread time that is not idle. `(program)` is native work outside JavaScript
(Blink, GPU command submission, compositor hand-off). A phase that is mostly idle is waiting on
something off the main thread: driver shader compiles, network, decoding workers, timers.

| phase | wall s | busy s | JS s | (program) s | idle s | GC s | long tasks (n / ms) |
|---|---:|---:|---:|---:|---:|---:|---|
| New Game screen (to Launch click) | 11.06 | 11.04 | 10.29 | 0.73 | 0.02 | 0.02 | 4 / 2858 |
| Launch click to first loading stage | 0.33 | 0.32 | 0.10 | 0.21 | 0.01 | 0.01 | 1 / 63 |
| loading: authored-visuals | 10.68 | 10.30 | 10.14 | 0.09 | 0.37 | 0.07 | 6 / 11936 |
| loading: gpu-resources | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0 / 0 |
| loading: entering-flight | 7.76 | 7.69 | 7.58 | 0.07 | 0.07 | 0.04 | 1 / 256 |
| first seconds of flight | 20.31 | 13.26 | 12.52 | 0.62 | 7.05 | 0.12 | 51 / 8670 |

## New Game screen (to Launch click) — 11.06 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 3756.7 | 34.0% | `isProgram @ native:0` |
| 2738.7 | 24.8% | `isProgram @ native:0` |
| 1858.6 | 16.8% | `getContext @ native:0` |
| 864.3 | 7.8% | `isProgram @ native:0` |
| 727.2 | 6.6% | `(program) @ native:0` |
| 392.0 | 3.5% | `getExtension @ native:0` |
| 333.7 | 3.0% | `isProgram @ native:0` |
| 53.2 | 0.5% | `compressedTexSubImage2D @ native:0` |
| 33.9 | 0.3% | `resize @ src/ui/shipPreviewMount.js:699` |
| 20.2 | 0.2% | `getProgramParameter @ native:0` |
| 17.4 | 0.2% | `fillText @ native:0` |
| 16.4 | 0.1% | `(garbage collector) @ native:0` |
| 15.8 | 0.1% | `isProgram @ native:0` |
| 11.4 | 0.1% | `WebGLRenderer.setSize @ vendor/three.module.js:16616` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 10107.7 | 91.4% | `(native)` |
| 727.2 | 6.6% | `(program)` |
| 89.5 | 0.8% | `vendor/three.module.js` |
| 37.3 | 0.3% | `src/ui/shipPreviewMount.js` |
| 24.4 | 0.2% | `vendor/three.core.js` |
| 18.8 | 0.2% | `(idle)` |
| 16.4 | 0.1% | `(garbage collector)` |
| 5.8 | 0.1% | `src/ui/screens/newGame.js` |
| 4.0 | 0.0% | `src/ui/screens/stageHull.js` |
| 3.4 | 0.0% | `src/render/partsLibrary.js` |

## loading: authored-visuals — 10.68 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 7526.7 | 70.5% | `isProgram @ native:0` |
| 2050.7 | 19.2% | `isProgram @ native:0` |
| 92.0 | 0.9% | `(program) @ native:0` |
| 74.9 | 0.7% | `(garbage collector) @ native:0` |
| 35.5 | 0.3% | `_createStars @ src/render/spaceBackground.js:1932` |
| 29.5 | 0.3% | `(anonymous) @ vendor/addons/loaders/GLTFLoader.js:3054` |
| 27.0 | 0.3% | `(anonymous) @ src/render/embeddedKtx2Textures.js:103` |
| 21.2 | 0.2% | `isProgram @ native:0` |
| 20.4 | 0.2% | `isProgram @ native:0` |
| 16.1 | 0.2% | `postMessage @ native:0` |
| 13.9 | 0.1% | `fillFormation @ src/render/deepFieldStars.js:304` |
| 12.7 | 0.1% | `GLTFBinaryExtension @ vendor/addons/loaders/GLTFLoader.js:1840` |
| 12.5 | 0.1% | `rebuildDeepFieldStars @ src/render/deepFieldStars.js:382` |
| 7.9 | 0.1% | `wasm-function[2] @ wasm://wasm/e5dcf6aa:1` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 9662.7 | 90.5% | `(native)` |
| 374.5 | 3.5% | `(idle)` |
| 92.0 | 0.9% | `(program)` |
| 74.9 | 0.7% | `(garbage collector)` |
| 50.3 | 0.5% | `vendor/addons/loaders/GLTFLoader.js` |
| 45.0 | 0.4% | `src/render/spaceBackground.js` |
| 44.7 | 0.4% | `src/render/deepFieldStars.js` |
| 34.7 | 0.3% | `vendor/three.core.js` |
| 28.7 | 0.3% | `src/render/partsLibrary.js` |
| 27.0 | 0.3% | `src/render/embeddedKtx2Textures.js` |

## loading: entering-flight — 7.76 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 3719.1 | 47.9% | `isProgram @ native:0` |
| 2017.6 | 26.0% | `isProgram @ native:0` |
| 653.8 | 8.4% | `isProgram @ native:0` |
| 496.4 | 6.4% | `bufferData @ native:0` |
| 91.9 | 1.2% | `refreshCredits @ src/ui/hud.js:3649` |
| 65.0 | 0.8% | `(program) @ native:0` |
| 56.6 | 0.7% | `getProgramParameter @ native:0` |
| 40.8 | 0.5% | `(garbage collector) @ native:0` |
| 25.8 | 0.3% | `texSubImage2D @ native:0` |
| 13.1 | 0.2% | `applyAuthoredMaterialProfile @ src/render/authoredMaterialProfiles.js:107` |
| 12.7 | 0.2% | `step @ src/core/registry.js:773` |
| 11.3 | 0.1% | `draw @ src/ui/radar.js:744` |
| 10.8 | 0.1% | `scrubFlightTemplateCloneValue @ src/render/partsLibrary.js:6630` |
| 7.4 | 0.1% | `blur @ native:0` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 7022.3 | 90.5% | `(native)` |
| 110.6 | 1.4% | `src/ui/hud.js` |
| 71.0 | 0.9% | `(idle)` |
| 65.0 | 0.8% | `(program)` |
| 40.8 | 0.5% | `(garbage collector)` |
| 39.7 | 0.5% | `vendor/three.module.js` |
| 37.2 | 0.5% | `src/render/openingSubmissionPlan.js` |
| 31.5 | 0.4% | `vendor/three.core.js` |
| 22.5 | 0.3% | `src/render/partsLibrary.js` |
| 13.9 | 0.2% | `src/systems/flightV3.js` |

## first seconds of flight — 20.31 s

### Top self time (idle excluded)

| ms | share | function |
|---:|---:|---|
| 3588.2 | 17.7% | `isProgram @ native:0` |
| 2135.6 | 10.5% | `isProgram @ native:0` |
| 1180.5 | 5.8% | `isProgram @ native:0` |
| 628.6 | 3.1% | `isProgram @ native:0` |
| 617.0 | 3.0% | `(program) @ native:0` |
| 563.4 | 2.8% | `isProgram @ native:0` |
| 287.8 | 1.4% | `isProgram @ native:0` |
| 155.8 | 0.8% | `syncSize @ src/ui/capitalBossOverlayMount.js:27` |
| 123.6 | 0.6% | `draw @ src/ui/radar.js:744` |
| 117.9 | 0.6% | `(garbage collector) @ native:0` |
| 112.8 | 0.6% | `isProgram @ native:0` |
| 76.8 | 0.4% | `isProgram @ native:0` |
| 72.9 | 0.4% | `queryAsteroidField @ src/world/asteroidField.js:135` |
| 46.6 | 0.2% | `step @ src/core/registry.js:773` |

### Self time by source

| ms | share | source |
|---:|---:|---|
| 8916.1 | 43.9% | `(native)` |
| 7051.5 | 34.7% | `(idle)` |
| 619.4 | 3.0% | `vendor/three.module.js` |
| 617.0 | 3.0% | `(program)` |
| 460.0 | 2.3% | `vendor/three.core.js` |
| 169.4 | 0.8% | `src/ui/radar.js` |
| 156.4 | 0.8% | `src/ui/capitalBossOverlayMount.js` |
| 117.9 | 0.6% | `(garbage collector)` |
| 115.0 | 0.6% | `src/render/renderer.js` |
| 85.0 | 0.4% | `src/world/activityRuntime.js` |

## Long tasks from New Game to the end of the profile

| at s (after Launch) | duration ms | during |
|---:|---:|---|
| -11.0 | 375 | New Game screen (to Launch click) |
| -3.1 | 1989 | New Game screen (to Launch click) |
| -1.1 | 414 | New Game screen (to Launch click) |
| -0.4 | 80 | New Game screen (to Launch click) |
| 0.3 | 63 | Launch click to first loading stage |
| 0.4 | 132 | loading: authored-visuals |
| 0.5 | 340 | loading: authored-visuals |
| 0.9 | 1745 | loading: authored-visuals |
| 2.7 | 7526 | loading: authored-visuals |
| 10.4 | 58 | loading: authored-visuals |
| 10.5 | 2135 | loading: authored-visuals |
| 13.1 | 256 | loading: entering-flight |
| 18.9 | 191 | first seconds of flight |
| 19.1 | 64 | first seconds of flight |
| 19.2 | 201 | first seconds of flight |
| 19.5 | 78 | first seconds of flight |
| 19.8 | 215 | first seconds of flight |
| 20.0 | 70 | first seconds of flight |
| 20.3 | 119 | first seconds of flight |
| 20.5 | 129 | first seconds of flight |
| 20.8 | 152 | first seconds of flight |
| 21.0 | 180 | first seconds of flight |
| 21.3 | 68 | first seconds of flight |
| 21.6 | 208 | first seconds of flight |
| 21.8 | 70 | first seconds of flight |
| 21.8 | 125 | first seconds of flight |
| 22.0 | 144 | first seconds of flight |
| 22.2 | 98 | first seconds of flight |
| 22.3 | 125 | first seconds of flight |
| 22.4 | 704 | first seconds of flight |
| 23.2 | 549 | first seconds of flight |
| 23.7 | 74 | first seconds of flight |
| 23.9 | 69 | first seconds of flight |
| 24.0 | 164 | first seconds of flight |
| 24.2 | 134 | first seconds of flight |
| 24.3 | 107 | first seconds of flight |
| 24.6 | 165 | first seconds of flight |
| 24.9 | 150 | first seconds of flight |
| 25.1 | 169 | first seconds of flight |
| 25.3 | 82 | first seconds of flight |
| 25.4 | 101 | first seconds of flight |
| 25.6 | 189 | first seconds of flight |
| 25.8 | 476 | first seconds of flight |
| 26.3 | 94 | first seconds of flight |
| 26.6 | 238 | first seconds of flight |
| 26.8 | 108 | first seconds of flight |
| 27.1 | 248 | first seconds of flight |
| 27.3 | 101 | first seconds of flight |
| 27.6 | 121 | first seconds of flight |
| 27.9 | 228 | first seconds of flight |
| 28.1 | 105 | first seconds of flight |
| 28.4 | 217 | first seconds of flight |
| 28.7 | 67 | first seconds of flight |
| 28.9 | 110 | first seconds of flight |
| 29.0 | 102 | first seconds of flight |
| 29.2 | 514 | first seconds of flight |
| 29.8 | 90 | first seconds of flight |
| 30.0 | 173 | first seconds of flight |
| 31.1 | 180 | first seconds of flight |
| 31.4 | 159 | first seconds of flight |

## Fetched between Launch and flight

18 requests; 8.30 MB of bodies; 7.06 MB actually transferred. Delivery: 12 over the network, 6 revalidated (304), 0 straight from cache.

| type | requests | body MB | transferred MB |
|---|---:|---:|---:|
| glb | 7 | 4.36 | 3.19 |
| mjs | 1 | 2.14 | 2.14 |
| png | 1 | 1.52 | 1.52 |
| json | 8 | 0.25 | 0.19 |
| woff2 | 1 | 0.03 | 0.03 |

| largest bodies | MB | transferred MB | fetch ms |
|---|---:|---:|---:|
| `vendor/rapier3d-compat/rapier.mjs` | 2.14 | 2.14 | 11 |
| `assets/ships/release/render-packages/atlas-production-v1/render.glb` | 2.02 | 2.02 | 18 |
| `assets/background/helios-amber-estuary.png` | 1.52 | 1.52 | 37 |
| `assets/ships/release/render-packages/weapon-pulse-cannon/render.glb` | 0.48 | 0.48 | 9 |
| `assets/ships/release/render-packages/weapon-pulse-cannon/render.glb` | 0.48 | 0.00 | 8 |
| `assets/ships/release/render-packages/greeble-pipes/render.glb` | 0.40 | 0.40 | 10 |
| `assets/ships/release/render-packages/greeble-pipes/render.glb` | 0.40 | 0.00 | 2 |
| `assets/ships/release/render-packages/greeble-antennas/render.glb` | 0.29 | 0.29 | 3 |
| `assets/ships/release/render-packages/greeble-antennas/render.glb` | 0.29 | 0.00 | 13 |
| `assets/ships/release/render-packages/mule-production-v1/render-package.json` | 0.06 | 0.06 | 3 |
| `assets/ships/release/render-packages/atlas-production-v1/render-package.json` | 0.06 | 0.06 | 3 |
| `assets/ships/release/render-packages/weapon-pulse-cannon/render-package.json` | 0.04 | 0.04 | 10 |
| `assets/ships/release/render-packages/weapon-pulse-cannon/render-package.json` | 0.04 | 0.00 | 3 |
| `styles/fonts/instrument-sans-var.woff2` | 0.03 | 0.03 | 125 |
| `assets/ships/release/render-packages/greeble-antennas/render-package.json` | 0.01 | 0.01 | 3 |

## Renderer resources

| moment | programs | geometries | textures | JS heap MB |
|---|---:|---:|---:|---:|
| entering flight | 101 | 200 | 185 | 279 |
| end of profile | 130 | 403 | 418 | 345 |

Opening work still pending when flight began: `306:loading:ship:ship_mule`, `307:loading:ship:ship_atlas`.

## Opening cook ledger

The opening cook began 11.0 s after Launch; flight began at 18.8 s. `t` is ms from the cook's start to the end of the step.

| step | ms | outcome | t ms | detail |
|---|---:|---|---:|---|
| opening.rockSurfaceLibrary | 31 | resolved | 31 |  |
| opening.firstPresentAdmission | 1543 | resolved | 1575 |  |
| lane | 0 | sample | 7778 | queued=0 flushed=0 settled=17 upgradeJobs=7 upgradeInFlight=1 upgradeCompiling=1 meshBuilds=0 |
| opening.planWait | 6203 | resolved | 7778 |  |
| opening.residency | 3 | resolved | 7781 | subjects=67 textureRefs=79 textures=80 |
| opening.postResources | 1 | resolved | 7781 | route=bloom |
| opening.capturedPipelineDrain | 0 | skipped | 7781 | captured=0 stillPending=0 |
| opening.drainWait | 0 | resolved | 7782 |  |
| opening.receipt | 1 | resolved | 7782 |  |
| wait.prepareOpeningGpuResources | 7783 | resolved | 7783 |  |

## Top-level entry points (inclusive)

The owner of the frame. Anything here that is not the game's own presentation frame is work
the in-engine hitch classifier cannot see.

| ms | share | entry |
|---:|---:|---|
| 11118.8 | 22.0% | `checkProgramsReady @ src/render/bloom.js:628` |
| 7904.6 | 15.6% | `(idle) @ native:0` |
| 7528.8 | 14.9% | `prepareForFirstDraw @ src/render/uiStage.js:788` |
| 5133.9 | 10.1% | `admitOpeningUnitsAcrossSlices @ src/render/openingGpuAdmission.js:312` |
| 4701.3 | 9.3% | `frame @ src/core/presentationRunner.js:780` |
| 4404.4 | 8.7% | `(anonymous) @ src/render/pipelineReadiness.js:249` |
| 2219.3 | 4.4% | `compileSubjectsAcrossPresents @ src/render/compilePresentSlice.js:22` |
| 1976.0 | 3.9% | `(anonymous) @ src/ui/kit/dom.js:88` |
| 1723.5 | 3.4% | `(program) @ native:0` |
| 1218.8 | 2.4% | `(anonymous) @ src/render/renderer.js:5507` |
| 534.6 | 1.1% | `enqueueGeometryResidencyBatches.urgent @ src/render/startupGpuResidency.js:433` |
| 413.2 | 0.8% | `acquire @ src/render/assetLoader.js:237` |

## Canvas census at the end of the profile

A canvas that is still `connected` with a zero client size is not in layout and cannot be seen.
If its backing store is large, or grows between runs, it is an orphaned render surface.

| id / class | backing store | client | display | connected |
|---|---|---|---|---|
| gl-canvas | 435x244 | 1280x719 | block | true |
| sf-radar-semantic-canvas | 220x220 | 220x220 | block | true |
| sf-fx-flickergrid | 560x260 | 0x0 | inline | true |
| sf-speed-lines | 1280x719 | 1280x719 | block | true |
| sf-capital-boss-overlay | 1280x719 | 1280x719 | block | true |
