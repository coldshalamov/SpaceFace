# Runtime witness

Verdict: presenting
The 3D world is presenting. Biggest recent cost: presentation (p95 35.4 ms).

Next: If you came here for performance, that is the only legal first target.

## Live
- mode: flight
- simTime: 5.37
- clockScale: 1
- lifecycle: foreground-visible
- suspended: false
- documentHidden: false
- contextLost: false
- executedFrames: 227
- rendererFrame: 1042
- drawCalls: 192
- lastFrameError: none
- gpu: ANGLE (Mesa, llvmpipe (LLVM 19.1.7 256 bits), OpenGL 4.5) (tier software)

## Where the last frames went (ms)
- presentation: p95 35.4 / avg 24.6 / max 1040.7
- render: p95 13.1 / avg 20.2 / max 1036.2
- simFrame: p95 11.2 / avg 6.3 / max 18.2
- admission: p95 9.3 / avg 9.4 / max 281.7
- sim: p95 4.9 / avg 2.8 / max 6.3
- ui: p95 4.8 / avg 3.2 / max 9.0

## Sample deltas (tail)
- simDelta: 0.98
- executedFrames delta: 28
- rendererFrame delta: 90
- hitch samples: 2
- canvas hashes: 0 unique 0

## Console (loop/GPU)
- [console.log] [render] GPU: %s | tier: %s | pixelRatio: %s | buffer: %dx%d ANGLE (Mesa, llvmpipe (LLVM 19.1.7 256 bits), OpenGL 4.5) software 1.00 1280 719
- [http.404] http://127.0.0.1:45817/__spaceface_player_store
- [console.error] Failed to load resource: the server responded with a status of 404 (Not Found)
- [console.info] [render] opening ledger 10196 ms: opening.rockSurfaceLibrary 34ms resolved | opening.firstPresentAdmission 1668ms resolved | opening.planWait 8479ms resolved | opening.residency 5ms resolved (subjects=67,textureRefs=79,textures=80) | opening.postResources 8ms resolved (route=bloom) | opening.capturedPipelineDrain 0ms skipped (captured=0,stillPending=0) | opening.drainWait 0ms resolved | opening.receipt 1ms resolved | wait.prepareOpeningGpuResources 10196ms resolved | lane samples 1
- [console.warning] [GPU brick] bloomScene 208.7ms {"owners":[],"newGeometries":[],"unstampedVisible":[{"object":"SF_PlaceFallback_place_lane_pin_Hull","root":"SF_PlaceFallback_place_lane_pin_AuthoredAssetBoundary","geometry":"BoxGeometry","uuid":"99813fdf","drawRange":null},{"object":"SF_PlaceFallback_place_tally_post_Hull","root":"SF_PlaceFallback_place_tally_post_AuthoredAssetBoundary","geometry":"BoxGeometry","uuid":"99813fdf","drawRange":null},{"object":"ae_manifold_0","root":"Group","geometry":"BufferGeometry","uuid":"55281c42","drawRange":null},{"object":"ae_manifold_1","root":"Group","geometry":"BufferGeometry","uuid":"13b54709","drawRange":null},{"object":"ae_manifold_2","root":"Group","geometry":"BufferGeometry","uuid":"03806a7f","drawRange":null},{"object":"ae_manifold_3","root":"Group","geometry":"BufferGeometry","uuid":"18f7af9c","drawRange":null},{"object":"break_mount_fray_0","root":"Group","geometry":"BufferGeometry","uuid":"16946a89","drawRange":null},{"object":"break_mount_fray_1","root":"Group","geometry":"BufferGeometry","uuid":"c975c828","drawRange":null},{"object":"break_mount_fray_2","root":"Group","geometry":"BufferGeometry","uuid":"680d8449","drawRange":null},{"object":"break_mount_fray_3","root":"Group","geometry":"BufferGeometry","uuid":"ddd71925","drawRange":null},{"object":"break_mount_fray_4","root":"Group","geometry":"BufferGeometry","uuid":"649f19b9","drawRange":null},{"object":"break_mount_hotcore","root":"Group","geometry":"BufferGeometry","uuid":"f1abec34","drawRange":null},{"object":"break_mount_hotfray_0","root":"Group","geometry":"BufferGeometry","uuid":"0f843232","drawRange":null},{"object":"break_mount_hotfray_2","root":"Group","geometry":"BufferGeometry","uuid":"5a505e96","drawRange":null},{"object":"break_mount_hotfray_4","root":"Group","geometry":"BufferGeometry","uuid":"33514d33","drawRange":null},{"object":"break_mount_peel_0","root":"Group","geometry":"BufferGeometry","uuid":"676b66d8","drawRange":null},{"object":"break_mount_peel_1","root":"Group","geometry":"BufferGeometry","uuid":"3af23ad9","drawRange":null},{"object":"break_mount_peel_2","root":"Group","geometry":"BufferGeometry","uuid":"55683d74","drawRange":null},{"object":"break_mount_peel_3","root":"Group","geometry":"BufferGeometry","uuid":"65973fc7","drawRange":null},{"object":"stub_cbl_0a","root":"Group","geometry":"BufferGeometry","uuid":"3cc3d77e","drawRange":null},{"object":"stub_cbl_0b","root":"Group","geometry":"BufferGeometry","uuid":"981f55c9","drawRange":null},{"object":"stub_cbl_1a","root":"Group","geometry":"BufferGeometry","uuid":"52006bd2","drawRange":null},{"object":"stub_cbl_1b","root":"Group","geometry":"BufferGeometry","uuid":"bf3b0dc4","drawRange":null},{"object":"stub_cbl_2a","root":"Group","geometry":"BufferGeometry","uuid":"8007a54a","drawRange":null}],"programsBefore":108,"programsAfter":108,"geometriesBefore":283,"geometriesAfter":283,"texturesBefore":172,"texturesAfter":172,"newPrograms":[]}
- [console.warning] [GPU brick] bloomScene 1031.3ms {"owners":[],"newGeometries":[],"unstampedVisible":[],"programsBefore":116,"programsAfter":116,"geometriesBefore":356,"geometriesAfter":356,"texturesBefore":357,"texturesAfter":357,"newPrograms":[]}
- [console.warning] [GPU brick] bloomScene 204.7ms {"owners":[],"newGeometries":[{"object":"plume-layer:core","root":"plume-system:family_vector_main_plume","geometry":"PlaneGeometry","uuid":"92c90fd5","visible":true,"count":1},{"object":"plume-layer:inner","root":"plume-system:family_vector_main_plume","geometry":"PlaneGeometry","uuid":"b803599f","visible":true,"count":1},{"object":"plume-layer:sheath","root":"plume-system:family_vector_main_plume","geometry":"PlaneGeometry","uuid":"4d8624ad","visible":true,"count":1},{"object":"plume-layer:vapor","root":"plume-system:family_vector_main_plume","geometry":"PlaneGeometry","uuid":"bc198c8b","visible":true,"count":1},{"object":"plume-layer:distortion","root":"plume-system:family_vector_main_plume","geometry":"PlaneGeometry","uuid":"6bdc9618","visible":false,"count":0}],"unstampedVisible":[{"object":"plume-layer:core","root":"plume-system:family_vector_main_plume","geometry":"PlaneGeometry","uuid":"92c90fd5","count":1,"drawRange":null},{"object":"plume-layer:inner","root":"plume-system:family_vector_main_plume","geometry":"PlaneGeometry","uuid":"b803599f","count":1,"drawRange":null},{"object":"plume-layer:sheath","root":"plume-system:family_vector_main_plume","geometry":"PlaneGeometry","uuid":"4d8624ad","count":1,"drawRange":null},{"object":"plume-layer:vapor","root":"plume-system:family_vector_main_plume","geometry":"PlaneGeometry","uuid":"bc198c8b","count":1,"drawRange":null}],"programsBefore":116,"programsAfter":116,"geometriesBefore":356,"geometriesAfter":360,"texturesBefore":357,"texturesAfter":357,"newPrograms":[]}
- [console.warning] [GPU brick] bloomScene 240.2ms {"owners":[{"object":"sf-retro-jets-forge-0","material":"ShaderMaterial","root":"sf-retro-jets-root","key":"69,70,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,fal","siblingKeys":[],"visible":true},{"object":"sf-retro-jets-forge-1","material":"ShaderMaterial","root":"sf-retro-jets-root","key":"69,70,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,fal","siblingKeys":[],"visible":true}],"newGeometries":[],"unstampedVisible":[{"object":"plume-layer:core","root":"plume-system:family_vector_main_plume","geometry":"PlaneGeometry","uuid":"92c90fd5","count":1,"drawRange":null},{"object":"plume-layer:inner","root":"plume-system:family_vector_main_plume","geometry":"PlaneGeometry","uuid":"b803599f","count":1,"drawRange":null},{"object":"plume-layer:sheath","root":"plume-system:family_vector_main_plume","geometry":"PlaneGeometry","uuid":"4d8624ad","count":1,"drawRange":null},{"object":"plume-layer:vapor","root":"plume-system:family_vector_main_plume","geometry":"PlaneGeometry","uuid":"bc198c8b","count":1,"drawRange":null},{"object":"sf-retro-jets-plume-0","root":"sf-retro-jets-root","geometry":"BufferGeometry","uuid":"20bff6bf","drawRange":null},{"object":"sf-retro-jets-forge-0","root":"sf-retro-jets-root","geometry":"BufferGeometry","uuid":"af461901","drawRange":null},{"object":"sf-retro-jets-plume-1","root":"sf-retro-jets-root","geometry":"BufferGeometry","uuid":"e218f1d6","drawRange":null},{"object":"sf-retro-jets-forge-1","root":"sf-retro-jets-root","geometry":"BufferGeometry","uuid":"e9830409","drawRange":null}],"programsBefore":116,"programsAfter":117,"geometriesBefore":360,"geometriesAfter":364,"texturesBefore":357,"texturesAfter":357,"newPrograms":["69,70,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,fal"]}

## Host load during the window
- logical CPUs: 8
- CPU busy during window: 34%
- memory: 10252 / 16013 MB
## Continue loading readiness
- 0.79 s: preparing-run (0.28 s until next stage)
- 1.07 s: authored-library (0.52 s until next stage)
- 1.59 s: authored-visuals (7.89 s until next stage)
- 9.48 s: render-pipelines (0.00 s until next stage)
- 9.48 s: gpu-resources (0.00 s until next stage)
- 9.48 s: entering-flight
- last loading snapshot: stage entering-flight; player authored; opening pending 2; ids 308:loading:ship:ship_mule:promise, 309:loading:ship:ship_atlas:promise; pipeline pending 2; pipeline admissions 0; GPU admissions 0
- exact opening plan: complete; roots 5; leaves 67; admitted programs 44; deferred global programs 0; producer census matched
- first visible draw identity gate: fail; uncaptured none
- opening scene delta: programs 37 -> 77; geometries 54 -> 126; renderer textures 16 -> 106
## Opening frame render subphases
- bloomScene: samples 1; p95 2.9 ms; avg 2.9 ms; max 2.9 ms
- bloomDownsample: samples 1; p95 0.2 ms; avg 0.2 ms; max 0.2 ms
- bloomComposite: samples 1; p95 25.6 ms; avg 25.6 ms; max 25.6 ms
## Opening first-touch owner
- disabled: pass `--opening-first-touch-owner` to arm the opt-in cold/warm owner capture
## Opening exact-owner micro-raster
- disabled: pass `--opening-exact-owner-touch` to arm the opt-in four-owner 64x64 cold touch
## No-submit scheduler A/B
- disabled: pass `--no-submit-diagnostic` to replace scene submission with a constant clear
## Tabletop census (PQ-129.01)
- route: New Game seed 47, held thrust, 20000 ms at 500 ms cadence
- sim delta: 4.55 s; executed-frame delta: 134
- bounded instrumentation: renderWork enabled for this probe only; prior state restored before shutdown: true
- last population: glass 2, runway 3, beyond 68, submitted 5, resident 20, landmarks 21
- policy envelope: glass half-extents 221 x 143 WU; runway 146 WU
- observed ranges: glass 2–8; runway 1–6; beyond 61–68; submitted 5–11; resident 9–20; landmarks 21–21
- submitted is the tabletop policy population (glass + runway + forced roots), not WebGL draw calls.
## Sector-transition phase ledger
- unavailable: no armed public jump event sequence was observed
## Live hitch attribution (PQ-129.02)
- bounded instrumentation: classifier enabled for this probe only; prior state restored before shutdown: true
- system timing coverage: prime-period-stratified
- observed frames: 156; hitches: 144; named: 132; unknown: 12
- hitch runs: first 12; echoes 132; longest streak 26
- named coverage: 0.917
- owner counts: compile 4; upload 1; bloom 5; present 1; sim 1; externalScheduling 120; unknown 12
- sim hitch systems (partially measured, incomplete evidence): tacticalAI 1
- sim steps in hitch frames: 0x 0 | 1x 0 | 2x 1 | 3x 0 | 4+x 0
- sim hitch coverage: fully measured 0 | partially measured 1 | unmeasured 0 | no sim steps 0
- unknown residual: mean 96.5 ms unattributed interval over 12 hitch frames; largest measured phase: externalScheduling 9 | bloom 2 | ui 1
- frame interval vs measured callback interval: mean frameMs 132.6 | mean callbackInterval 149.9 | mean disagreement -17.2 ms over 143 hitch frames
- interval disagreement: mean -17.2 | median -0.1 ms over 143 hitch frames (median over last 143 of 143); frames at the 250 ms frame-dt clamp: 11; mean disagreement on the clamped frames -138.0 ms
- externalScheduling split: mean gap 124.5 ms | mean dispatch lag 43.0 ms | gap dominant 115 | dispatch dominant 5 over 120 frames## Long tasks (main-thread blocks)
- JS heap MB over run: 303 393 407 398 453
- economy stations/listings/history-points: 2s/90L/5760p  2s/90L/5760p  2s/90L/5760p  2s/90L/5760p  2s/90L/5760p
- GPU geometries over run: 163 201 312 353 356
- GPU textures over run:   117 117 247 342 357
- count 66; total 20510 ms; max 3294 ms; >=50 ms 66; >=100 ms 49
- 3294 ms at 17955 ms
- 2801 ms at 23091 ms
- 1775 ms at 27281 ms
- 1115 ms at 16356 ms
- 1049 ms at 52335 ms
- 683 ms at 44790 ms
- 540 ms at 38245 ms
- 523 ms at 45771 ms
- 477 ms at 38807 ms
- 465 ms at 17471 ms
- 302 ms at 37751 ms
- 285 ms at 35455 ms

## Bloom subphases (PQ-129.03)
- bloomScene: samples 156; p95 6.1 ms; avg 16.5 ms; max 1033.3 ms
- bloomDownsample: samples 156; p95 0.2 ms; avg 0.1 ms; max 0.2 ms
- bloomComposite: samples 156; p95 0.1 ms; avg 0.0 ms; max 0.2 ms
## Sampled simulation systems
- physics: samples 81; p95 1.60 ms; avg 0.72 ms; max 2.40 ms
- tacticalAI: samples 50; p95 1.50 ms; avg 1.11 ms; max 2.10 ms
- flight: samples 81; p95 0.70 ms; avg 0.43 ms; max 1.50 ms
- travelLanes: samples 1; p95 0.50 ms; avg 0.50 ms; max 0.50 ms
- tetherGameplay: samples 81; p95 0.40 ms; avg 0.10 ms; max 0.90 ms
- barkDirector: samples 1; p95 0.30 ms; avg 0.30 ms; max 0.30 ms
- scenarioRuntime: samples 1; p95 0.30 ms; avg 0.30 ms; max 0.30 ms
- core.preStep: samples 81; p95 0.20 ms; avg 0.10 ms; max 0.20 ms
- input: samples 81; p95 0.20 ms; avg 0.12 ms; max 0.20 ms
- lawSecurity: samples 50; p95 0.20 ms; avg 0.08 ms; max 0.20 ms
- actions: samples 81; p95 0.20 ms; avg 0.10 ms; max 0.30 ms
- stuntGrammar: samples 81; p95 0.20 ms; avg 0.09 ms; max 0.20 ms
