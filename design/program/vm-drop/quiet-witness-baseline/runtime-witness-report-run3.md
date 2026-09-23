# Runtime witness

Verdict: presenting
The 3D world is presenting. Biggest recent cost: presentation (p95 70.1 ms).

Next: If you came here for performance, that is the only legal first target.

## Live
- mode: flight
- simTime: 6.30
- clockScale: 1
- lifecycle: foreground-visible
- suspended: false
- documentHidden: false
- contextLost: false
- executedFrames: 258
- rendererFrame: 1063
- drawCalls: 114
- lastFrameError: none
- gpu: ANGLE (Mesa, llvmpipe (LLVM 19.1.7 256 bits), OpenGL 4.5) (tier software)

## Where the last frames went (ms)
- presentation: p95 70.1 / avg 27.5 / max 973.1
- render: p95 65.2 / avg 23.4 / max 969.1
- simFrame: p95 9.9 / avg 6.1 / max 25.8
- admission: p95 9.2 / avg 7.0 / max 195.2
- sim: p95 4.9 / avg 3.0 / max 22.2
- ui: p95 4.5 / avg 2.8 / max 10.7

## Sample deltas (tail)
- simDelta: 1.17
- executedFrames delta: 34
- rendererFrame delta: 102
- hitch samples: 0
- canvas hashes: 3 unique 3

## Console (loop/GPU)
- [console.log] [render] GPU: %s | tier: %s | pixelRatio: %s | buffer: %dx%d ANGLE (Mesa, llvmpipe (LLVM 19.1.7 256 bits), OpenGL 4.5) software 1.00 1280 719
- [http.404] http://127.0.0.1:33229/__spaceface_player_store
- [console.error] Failed to load resource: the server responded with a status of 404 (Not Found)
- [console.info] [render] opening ledger 8174 ms: opening.rockSurfaceLibrary 35ms resolved | opening.firstPresentAdmission 0ms resolved | opening.planWait 8089ms resolved | opening.residency 14ms resolved (subjects=67,textureRefs=79,textures=80) | opening.postResources 34ms resolved (route=bloom) | opening.capturedPipelineDrain 0ms skipped (captured=0,stillPending=0) | opening.drainWait 0ms resolved | opening.receipt 1ms resolved | wait.prepareOpeningGpuResources 8174ms resolved
- [console.warning] [GPU brick] bloomScene 207.9ms {"owners":[{"object":"plume-layer:core","material":"plume:family_industrial_main_plu","root":"plume-system:family_industrial_main_plume","key":"73,74,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,fal","siblingKeys":[],"visible":true},{"object":"plume-layer:inner","material":"plume:family_industrial_main_plu","root":"plume-system:family_industrial_main_plume","key":"73,74,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,fal","siblingKeys":[],"visible":true},{"object":"plume-layer:sheath","material":"plume:family_industrial_main_plu","root":"plume-system:family_industrial_main_plume","key":"73,74,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,fal","siblingKeys":[],"visible":true},{"object":"plume-layer:vapor","material":"plume:family_industrial_main_plu","root":"plume-system:family_industrial_main_plume","key":"73,74,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,fal","siblingKeys":[],"visible":true}],"newGeometries":[{"object":"plume-layer:core","root":"plume-system:family_industrial_main_plume","geometry":"PlaneGeometry","uuid":"2c753518","visible":true,"count":4},{"object":"plume-layer:inner","root":"plume-system:family_industrial_main_plume","geometry":"PlaneGeometry","uuid":"3f999660","visible":true,"count":4},{"object":"plume-layer:sheath","root":"plume-system:family_industrial_main_plume","geometry":"PlaneGeometry","uuid":"1e426ffb","visible":true,"count":4},{"object":"plume-layer:vapor","root":"plume-system:family_industrial_main_plume","geometry":"PlaneGeometry","uuid":"4fc52a24","visible":true,"count":4},{"object":"plume-layer:distortion","root":"plume-system:family_industrial_main_plume","geometry":"PlaneGeometry","uuid":"b0d63d34","visible":false,"count":0}],"unstampedVisible":[{"object":"AuthoredResolvingMarker","root":"ship_mule_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"c8a9c298","drawRange":null},{"object":"AuthoredResolvingMarker","root":"ship_atlas_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"c8a9c298","drawRange":null},{"object":"AuthoredResolvingMarker","root":"ship_wasp_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"c8a9c298","drawRange":null},{"object":"AuthoredResolvingMarker","root":"ship_wasp_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"c8a9c298","drawRange":null},{"object":"AuthoredResolvingMarker","root":"ship_mule_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"c8a9c298","drawRange":null},{"object":"AuthoredResolvingMarker","root":"ship_mule_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"c8a9c298","drawRange":null},{"object":"SF_PlaceFallback_place_lane_pin_Hull","root":"SF_PlaceFallback_place_lane_pin_AuthoredAssetBoundary","geometry":"BoxGeometry","uuid":"e673fe69","drawRange":null},{"object":"SF_PlaceFallback_place_tally_post_Hull","root":"SF_PlaceFallback_place_tally_post_AuthoredAssetBoundary","geometry":"BoxGeometry","uuid":"e673fe69","drawRange":null},{"object":"plume-layer:core","root":"plume-system:family_industrial_main_plume","geometry":"PlaneGeometry","uuid":"2c753518","count":4,"drawRange":null},{"object":"plume-layer:inner","root":"plume-system:family_industrial_main_plume","geometry":"PlaneGeometry","uuid":"3f999660","count":4,"drawRange":null},{"object":"plume-layer:sheath","root":"plume-system:family_industrial_main_plume","geometry":"PlaneGeometry","uuid":"1e426ffb","count":4,"drawRange":null},{"object":"plume-layer:vapor","root":"plume-system:family_industrial_main_plume","geometry":"PlaneGeometry","uuid":"4fc52a24","count":4,"drawRange":null},{"object":"Mesh","root":"sf-liquid-plasma-root","geometry":"BufferGeometry","uuid":"09a0f662","drawRange":864},{"object":"Mesh","root":"sf-liquid-plasma-root","geometry":"BufferGeometry","uuid":"91e6217a","drawRange":null},{"object":"Mesh","root":"sf-liquid-plasma-root","geometry":"BufferGeometry","uuid":"cdf61645","drawRange":null},{"object":"sf-plasma-throat-0","root":"sf-liquid-plasma-root","geometry":"PlaneGeometry","uuid":"5a349704","drawRange":null},{"object":"Mesh","root":"sf-energy-massline","geometry":"CylinderGeometry","uuid":"81249240","drawRange":null},{"object":"Mesh","root":"sf-energy-massline","geometry":"CylinderGeometry","uuid":"81249240","drawRange":null}],"programsBefore":79,"programsAfter":80,"geometriesBefore":151,"geometriesAfter":155,"texturesBefore":114,"texturesAfter":118,"newPrograms":["73,74,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,fal"]}
- [console.warning] [GPU brick] bloomScene 430.4ms {"owners":[],"newGeometries":[],"unstampedVisible":[{"object":"AuthoredResolvingMarker","root":"ship_wasp_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"c8a9c298","drawRange":null},{"object":"AuthoredResolvingMarker","root":"ship_mule_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"c8a9c298","drawRange":null},{"object":"AuthoredResolvingMarker","root":"ship_mule_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"c8a9c298","drawRange":null}],"programsBefore":102,"programsAfter":102,"geometriesBefore":290,"geometriesAfter":290,"texturesBefore":338,"texturesAfter":338,"newPrograms":[]}
- [console.warning] [GPU brick] bloomScene 623.6ms {"owners":[],"newGeometries":[],"unstampedVisible":[{"object":"AuthoredResolvingMarker","root":"ship_wasp_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"c8a9c298","drawRange":null},{"object":"AuthoredResolvingMarker","root":"ship_mule_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"c8a9c298","drawRange":null}],"programsBefore":102,"programsAfter":102,"geometriesBefore":330,"geometriesAfter":330,"texturesBefore":338,"texturesAfter":338,"newPrograms":[]}
- [console.warning] [GPU brick] bloomScene 203.8ms {"owners":[],"newGeometries":[],"unstampedVisible":[],"programsBefore":102,"programsAfter":102,"geometriesBefore":330,"geometriesAfter":330,"texturesBefore":338,"texturesAfter":338,"newPrograms":[]}
- [console.warning] [GPU brick] bloomScene 963.7ms {"owners":[],"newGeometries":[],"unstampedVisible":[],"programsBefore":105,"programsAfter":105,"geometriesBefore":333,"geometriesAfter":333,"texturesBefore":353,"texturesAfter":353,"newPrograms":[]}

## Host load during the window
- logical CPUs: 8
- CPU busy during window: 42%
- memory: 10835 / 16013 MB
## Continue loading readiness
- 0.93 s: preparing-run (0.41 s until next stage)
- 1.33 s: authored-library (6.80 s until next stage)
- 8.14 s: authored-visuals (2.62 s until next stage)
- 10.76 s: render-pipelines (0.00 s until next stage)
- 10.76 s: gpu-resources (0.00 s until next stage)
- 10.76 s: entering-flight
- last loading snapshot: stage entering-flight; player authored; opening pending 3; ids 307:loading:ship:ship_atlas:promise, 308:loading:ship:ship_mule:promise, 309:loading:ship:ship_atlas:promise; pipeline pending 3; pipeline admissions 0; GPU admissions 0
- exact opening plan: complete; roots 5; leaves 67; admitted programs 44; deferred global programs 0; producer census matched
- first visible draw identity gate: fail; uncaptured none
- opening scene delta: programs 37 -> 69; geometries 54 -> 112; renderer textures 13 -> 88
## Opening frame render subphases
- bloomScene: samples 1; p95 2.8 ms; avg 2.8 ms; max 2.8 ms
- bloomDownsample: samples 1; p95 0.2 ms; avg 0.2 ms; max 0.2 ms
- bloomComposite: samples 1; p95 44.9 ms; avg 44.9 ms; max 44.9 ms
## Opening first-touch owner
- disabled: pass `--opening-first-touch-owner` to arm the opt-in cold/warm owner capture
## Opening exact-owner micro-raster
- disabled: pass `--opening-exact-owner-touch` to arm the opt-in four-owner 64x64 cold touch
## No-submit scheduler A/B
- disabled: pass `--no-submit-diagnostic` to replace scene submission with a constant clear
## Tabletop census (PQ-129.01)
- route: New Game seed 47, held thrust, 20000 ms at 500 ms cadence
- sim delta: 5.53 s; executed-frame delta: 168
- bounded instrumentation: renderWork enabled for this probe only; prior state restored before shutdown: true
- last population: glass 2, runway 5, beyond 68, submitted 7, resident 20, landmarks 23
- policy envelope: glass half-extents 221 x 144 WU; runway 146 WU
- observed ranges: glass 2–8; runway 1–6; beyond 62–71; submitted 4–12; resident 12–20; landmarks 23–23
- submitted is the tabletop policy population (glass + runway + forced roots), not WebGL draw calls.
## Sector-transition phase ledger
- unavailable: no armed public jump event sequence was observed
## Live hitch attribution (PQ-129.02)
- bounded instrumentation: classifier enabled for this probe only; prior state restored before shutdown: true
- system timing coverage: prime-period-stratified
- observed frames: 174; hitches: 152; named: 142; unknown: 10
- hitch runs: first 17; echoes 135; longest streak 46
- named coverage: 0.934
- owner counts: compile 5; upload 2; bloom 9; externalScheduling 126; unknown 10
- unknown residual: mean 72.0 ms unattributed interval over 10 hitch frames; largest measured phase: externalScheduling 6 | sim 4
- frame interval vs measured callback interval: mean frameMs 116.7 | mean callbackInterval 131.3 | mean disagreement -14.6 ms over 151 hitch frames
- interval disagreement: mean -14.6 | median -1.3 ms over 151 hitch frames (median over last 151 of 151); frames at the 250 ms frame-dt clamp: 9; mean disagreement on the clamped frames -254.0 ms
- externalScheduling split: mean gap 98.2 ms | mean dispatch lag 18.1 ms | gap dominant 122 | dispatch dominant 4 over 126 frames## Long tasks (main-thread blocks)
- JS heap MB over run: 364 363 375 426
- economy stations/listings/history-points: 2s/90L/5760p  2s/90L/5760p  2s/90L/5760p  2s/90L/5760p
- GPU geometries over run: 148 205 330 337
- GPU textures over run:   114 314 338 353
- count 58; total 18493 ms; max 3309 ms; >=50 ms 58; >=100 ms 48
- 3309 ms at 17086 ms
- 1921 ms at 26886 ms
- 1735 ms at 20703 ms
- 1044 ms at 24669 ms
- 981 ms at 48902 ms
- 701 ms at 23600 ms
- 646 ms at 16423 ms
- 639 ms at 44640 ms
- 447 ms at 43115 ms
- 310 ms at 23282 ms
- 288 ms at 20400 ms
- 282 ms at 22449 ms

## Bloom subphases (PQ-129.03)
- bloomScene: samples 174; p95 62.5 ms; avg 19.9 ms; max 965.6 ms
- bloomDownsample: samples 174; p95 0.2 ms; avg 0.1 ms; max 0.2 ms
- bloomComposite: samples 174; p95 0.1 ms; avg 0.0 ms; max 0.2 ms
## Sampled simulation systems
- tacticalAI: samples 38; p95 1.40 ms; avg 0.97 ms; max 1.90 ms
- physics: samples 89; p95 1.20 ms; avg 0.63 ms; max 1.60 ms
- flight: samples 89; p95 0.60 ms; avg 0.36 ms; max 0.80 ms
- tetherGameplay: samples 89; p95 0.40 ms; avg 0.10 ms; max 0.60 ms
- npcJobsRuntime: samples 38; p95 0.30 ms; avg 0.12 ms; max 1.10 ms
- masslineHud: samples 38; p95 0.30 ms; avg 0.12 ms; max 0.30 ms
- input: samples 89; p95 0.20 ms; avg 0.10 ms; max 0.30 ms
- barkDirector: samples 3; p95 0.20 ms; avg 0.23 ms; max 0.40 ms
- actions: samples 89; p95 0.20 ms; avg 0.09 ms; max 0.20 ms
- scenarioRuntime: samples 3; p95 0.20 ms; avg 0.17 ms; max 0.20 ms
- traffic: samples 38; p95 0.20 ms; avg 0.14 ms; max 0.30 ms
- core.preStep: samples 89; p95 0.20 ms; avg 0.08 ms; max 0.30 ms
