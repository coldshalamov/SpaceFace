# Runtime witness

Verdict: presenting
The 3D world is presenting. Biggest recent cost: admission (p95 84.7 ms).

Next: If you came here for performance, that is the only legal first target.

## Live
- mode: flight
- simTime: 5.77
- clockScale: 1
- lifecycle: foreground-visible
- suspended: false
- documentHidden: false
- contextLost: false
- executedFrames: 250
- rendererFrame: 1020
- drawCalls: 103
- lastFrameError: none
- gpu: ANGLE (Mesa, llvmpipe (LLVM 19.1.7 256 bits), OpenGL 4.5) (tier software)

## Where the last frames went (ms)
- admission: p95 84.7 / avg 12.9 / max 510.0
- presentation: p95 29.9 / avg 28.5 / max 1062.1
- render: p95 27.4 / avg 24.3 / max 1056.9
- simFrame: p95 9.0 / avg 5.9 / max 31.6
- sim: p95 4.8 / avg 2.8 / max 8.1
- ui: p95 4.7 / avg 3.0 / max 12.2

## Sample deltas (tail)
- simDelta: 1.25
- executedFrames delta: 35
- rendererFrame delta: 105
- hitch samples: 2
- canvas hashes: 3 unique 3

## Console (loop/GPU)
- [console.log] [render] GPU: %s | tier: %s | pixelRatio: %s | buffer: %dx%d ANGLE (Mesa, llvmpipe (LLVM 19.1.7 256 bits), OpenGL 4.5) software 1.00 1280 719
- [http.404] http://127.0.0.1:34629/__spaceface_player_store
- [console.error] Failed to load resource: the server responded with a status of 404 (Not Found)
- [console.info] [render] opening ledger 15237 ms: opening.rockSurfaceLibrary 37ms resolved | opening.firstPresentAdmission 0ms resolved | opening.planWait 15190ms resolved | opening.residency 4ms resolved (subjects=67,textureRefs=79,textures=80) | opening.postResources 1ms resolved (route=bloom) | opening.capturedPipelineDrain 0ms skipped (captured=0,stillPending=0) | opening.drainWait 0ms resolved | opening.receipt 5ms resolved | wait.prepareOpeningGpuResources 15237ms resolved
- [console.warning] [GPU brick] bloomScene 162.0ms {"owners":[{"object":"Mesh","material":"ShaderMaterial","root":"sf-liquid-plasma-root","key":"67,68,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,fal","siblingKeys":["67,68,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,fal"],"visible":true},{"object":"Mesh","material":"ShaderMaterial","root":"sf-liquid-plasma-root","key":"69,70,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,fal","siblingKeys":[],"visible":true},{"object":"sf-plasma-throat-0","material":"ShaderMaterial","root":"sf-liquid-plasma-root","key":"71,72,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,fal","siblingKeys":[],"visible":true}],"newGeometries":[{"object":"LOD0_Remaster_Material_BrushedMetal_RemasterNickel","root":"ship_atlas_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"BufferGeometry","uuid":"b7e5d762","visible":true},{"object":"LOD0_Remaster_Material_Hull_RemasterSeaEnamel","root":"ship_atlas_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"BufferGeometry","uuid":"914c8e92","visible":true},{"object":"COLLISION_HULL","root":"ship_atlas_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"BufferGeometry","uuid":"9b76a4ed","visible":false},{"object":"LOD0_Accent","root":"ship_atlas_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"BufferGeometry","uuid":"aeb51de6","visible":true},{"object":"LOD0_Armor","root":"ship_atlas_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"BufferGeometry","uuid":"366548e9","visible":true},{"object":"LOD0_Canopy","root":"ship_atlas_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"BufferGeometry","uuid":"3cd6521e","visible":true},{"object":"LOD0_Ceramic","root":"ship_atlas_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"BufferGeometry","uuid":"4b735a7c","visible":true},{"object":"LOD0_Hull","root":"ship_atlas_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"BufferGeometry","uuid":"0c6106c5","visible":true},{"object":"LOD0_Mechanical","root":"ship_atlas_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"BufferGeometry","uuid":"25c56bb3","visible":true},{"object":"LOD0_Radiator","root":"ship_atlas_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"BufferGeometry","uuid":"63c76921","visible":true},{"object":"LOD0_Thruster","root":"ship_atlas_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"BufferGeometry","uuid":"a2c4a395","visible":true},{"object":"LOD0_Warning","root":"ship_atlas_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"BufferGeometry","uuid":"a7d2a970","visible":true},{"object":"GLTFKit_Nav_Lights_port","root":"ship_atlas_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"SphereGeometry","uuid":"bfccde83","visible":true},{"object":"GLTFKit_Nav_Lights_starboard","root":"ship_atlas_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"SphereGeometry","uuid":"bfccde83","visible":true},{"object":"GLTFKit_BoundsProxy","root":"ship_atlas_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"BoxGeometry","uuid":"e0799250","visible":false},{"object":"plume-layer:core","root":"plume-system:hitch_kestrel_main_plume","geometry":"PlaneGeometry","uuid":"6e8054bd","visible":false,"count":0},{"object":"plume-layer:inner","root":"plume-system:hitch_kestrel_main_plume","geometry":"PlaneGeometry","uuid":"9c22e357","visible":false,"count":0},{"object":"plume-layer:sheath","root":"plume-system:hitch_kestrel_main_plume","geometry":"PlaneGeometry","uuid":"0f3905ca","visible":false,"count":0},{"object":"plume-layer:vapor","root":"plume-system:hitch_kestrel_main_plume","geometry":"PlaneGeometry","uuid":"d0d49066","visible":false,"count":0},{"object":"plume-layer:distortion","root":"plume-system:hitch_kestrel_main_plume","geometry":"PlaneGeometry","uuid":"e90aec2e","visible":false,"count":0},{"object":"rcs-layer:core","root":"rcs-system:hitch_kestrel_rcs_impulse","geometry":"PlaneGeometry","uuid":"f4ab34e2","visible":false,"count":0},{"object":"rcs-layer:inner","root":"rcs-system:hitch_kestrel_rcs_impulse","geometry":"PlaneGeometry","uuid":"d69e8b93","visible":false,"count":0},{"object":"rcs-layer:sheath","root":"rcs-system:hitch_kestrel_rcs_impulse","geometry":"PlaneGeometry","uuid":"48abd0b1","visible":false,"count":0},{"object":"rcs-layer:vapor","root":"rcs-system:hitch_kestrel_rcs_impulse","geometry":"PlaneGeometry","uuid":"02c2a559","visible":false,"count":0}],"unstampedVisible":[{"object":"AuthoredResolvingMarker","root":"ship_mule_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"0a80b8f8","drawRange":null},{"object":"AuthoredResolvingMarker","root":"ship_atlas_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"0a80b8f8","drawRange":null},{"object":"AuthoredResolvingMarker","root":"ship_wasp_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"0a80b8f8","drawRange":null},{"object":"AuthoredResolvingMarker","root":"ship_wasp_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"0a80b8f8","drawRange":null},{"object":"AuthoredResolvingMarker","root":"ship_mule_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"0a80b8f8","drawRange":null},{"object":"AuthoredResolvingMarker","root":"ship_mule_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"0a80b8f8","drawRange":null},{"object":"SF_PlaceFallback_place_lane_pin_Hull","root":"SF_PlaceFallback_place_lane_pin_AuthoredAssetBoundary","geometry":"BoxGeometry","uuid":"3932c74b","drawRange":null},{"object":"SF_PlaceFallback_place_tally_post_Hull","root":"SF_PlaceFallback_place_tally_post_AuthoredAssetBoundary","geometry":"BoxGeometry","uuid":"3932c74b","drawRange":null},{"object":"Mesh","root":"sf-liquid-plasma-root","geometry":"BufferGeometry","uuid":"49fb6c82","drawRange":null},{"object":"Mesh","root":"sf-liquid-plasma-root","geometry":"BufferGeometry","uuid":"113655cb","drawRange":null},{"object":"sf-plasma-throat-0","root":"sf-liquid-plasma-root","geometry":"PlaneGeometry","uuid":"4ddc07ba","drawRange":null},{"object":"Mesh","root":"sf-energy-massline","geometry":"CylinderGeometry","uuid":"a8c24fc8","drawRange":null},{"object":"Mesh","root":"sf-energy-massline","geometry":"CylinderGeometry","uuid":"a8c24fc8","drawRange":null}],"programsBefore":72,"programsAfter":76,"geometriesBefore":127,"geometriesAfter":130,"texturesBefore":106,"texturesAfter":106,"newPrograms":["67,68,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,fal","67,68,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,fal","69,70,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,fal","71,72,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,fal"]}
- [console.warning] [GPU brick] bloomScene 108.9ms {"owners":[],"newGeometries":[],"unstampedVisible":[{"object":"AuthoredResolvingMarker","root":"ship_mule_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"0a80b8f8","drawRange":null},{"object":"AuthoredResolvingMarker","root":"ship_atlas_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"0a80b8f8","drawRange":null},{"object":"AuthoredResolvingMarker","root":"ship_wasp_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"0a80b8f8","drawRange":null},{"object":"AuthoredResolvingMarker","root":"ship_wasp_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"0a80b8f8","drawRange":null},{"object":"AuthoredResolvingMarker","root":"ship_mule_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"0a80b8f8","drawRange":null},{"object":"AuthoredResolvingMarker","root":"ship_mule_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"0a80b8f8","drawRange":null},{"object":"SF_PlaceFallback_place_lane_pin_Hull","root":"SF_PlaceFallback_place_lane_pin_AuthoredAssetBoundary","geometry":"BoxGeometry","uuid":"3932c74b","drawRange":null},{"object":"SF_PlaceFallback_place_tally_post_Hull","root":"SF_PlaceFallback_place_tally_post_AuthoredAssetBoundary","geometry":"BoxGeometry","uuid":"3932c74b","drawRange":null},{"object":"plume-layer:core","root":"plume-system:family_industrial_main_plume","geometry":"PlaneGeometry","uuid":"a5a27d12","count":4,"drawRange":null},{"object":"plume-layer:inner","root":"plume-system:family_industrial_main_plume","geometry":"PlaneGeometry","uuid":"99716b78","count":4,"drawRange":null},{"object":"plume-layer:sheath","root":"plume-system:family_industrial_main_plume","geometry":"PlaneGeometry","uuid":"efedc7bc","count":4,"drawRange":null},{"object":"plume-layer:vapor","root":"plume-system:family_industrial_main_plume","geometry":"PlaneGeometry","uuid":"b341f2aa","count":4,"drawRange":null},{"object":"ae_manifold_0","root":"Group","geometry":"BufferGeometry","uuid":"681e66d6","drawRange":null},{"object":"ae_manifold_1","root":"Group","geometry":"BufferGeometry","uuid":"8d3dcc13","drawRange":null},{"object":"ae_manifold_2","root":"Group","geometry":"BufferGeometry","uuid":"f8ede047","drawRange":null},{"object":"ae_manifold_3","root":"Group","geometry":"BufferGeometry","uuid":"3c95f882","drawRange":null},{"object":"break_mount_fray_0","root":"Group","geometry":"BufferGeometry","uuid":"faa78a18","drawRange":null},{"object":"break_mount_fray_1","root":"Group","geometry":"BufferGeometry","uuid":"12487d1f","drawRange":null},{"object":"break_mount_fray_2","root":"Group","geometry":"BufferGeometry","uuid":"66bb9600","drawRange":null},{"object":"break_mount_fray_3","root":"Group","geometry":"BufferGeometry","uuid":"b1b3acff","drawRange":null},{"object":"break_mount_fray_4","root":"Group","geometry":"BufferGeometry","uuid":"dba5aeef","drawRange":null},{"object":"break_mount_hotcore","root":"Group","geometry":"BufferGeometry","uuid":"9236f1ae","drawRange":null},{"object":"break_mount_hotfray_0","root":"Group","geometry":"BufferGeometry","uuid":"8512bb16","drawRange":null},{"object":"break_mount_hotfray_2","root":"Group","geometry":"BufferGeometry","uuid":"0f716d66","drawRange":null}],"programsBefore":93,"programsAfter":93,"geometriesBefore":162,"geometriesAfter":162,"texturesBefore":136,"texturesAfter":136,"newPrograms":[]}
- [console.warning] [GPU brick] bloomScene 142.7ms {"owners":[],"newGeometries":[],"unstampedVisible":[{"object":"AuthoredResolvingMarker","root":"ship_mule_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"0a80b8f8","drawRange":null},{"object":"AuthoredResolvingMarker","root":"ship_atlas_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"0a80b8f8","drawRange":null},{"object":"AuthoredResolvingMarker","root":"ship_wasp_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"0a80b8f8","drawRange":null},{"object":"AuthoredResolvingMarker","root":"ship_wasp_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"0a80b8f8","drawRange":null},{"object":"AuthoredResolvingMarker","root":"ship_mule_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"0a80b8f8","drawRange":null},{"object":"AuthoredResolvingMarker","root":"ship_mule_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"0a80b8f8","drawRange":null},{"object":"SF_PlaceFallback_place_lane_pin_Hull","root":"SF_PlaceFallback_place_lane_pin_AuthoredAssetBoundary","geometry":"BoxGeometry","uuid":"3932c74b","drawRange":null},{"object":"SF_PlaceFallback_place_tally_post_Hull","root":"SF_PlaceFallback_place_tally_post_AuthoredAssetBoundary","geometry":"BoxGeometry","uuid":"3932c74b","drawRange":null},{"object":"ae_manifold_0","root":"Group","geometry":"BufferGeometry","uuid":"681e66d6","drawRange":null},{"object":"ae_manifold_1","root":"Group","geometry":"BufferGeometry","uuid":"8d3dcc13","drawRange":null},{"object":"ae_manifold_2","root":"Group","geometry":"BufferGeometry","uuid":"f8ede047","drawRange":null},{"object":"ae_manifold_3","root":"Group","geometry":"BufferGeometry","uuid":"3c95f882","drawRange":null},{"object":"break_mount_fray_0","root":"Group","geometry":"BufferGeometry","uuid":"faa78a18","drawRange":null},{"object":"break_mount_fray_1","root":"Group","geometry":"BufferGeometry","uuid":"12487d1f","drawRange":null},{"object":"break_mount_fray_2","root":"Group","geometry":"BufferGeometry","uuid":"66bb9600","drawRange":null},{"object":"break_mount_fray_3","root":"Group","geometry":"BufferGeometry","uuid":"b1b3acff","drawRange":null},{"object":"break_mount_fray_4","root":"Group","geometry":"BufferGeometry","uuid":"dba5aeef","drawRange":null},{"object":"break_mount_hotcore","root":"Group","geometry":"BufferGeometry","uuid":"9236f1ae","drawRange":null},{"object":"break_mount_hotfray_0","root":"Group","geometry":"BufferGeometry","uuid":"8512bb16","drawRange":null},{"object":"break_mount_hotfray_2","root":"Group","geometry":"BufferGeometry","uuid":"0f716d66","drawRange":null},{"object":"break_mount_hotfray_4","root":"Group","geometry":"BufferGeometry","uuid":"8ef0dfda","drawRange":null},{"object":"break_mount_peel_0","root":"Group","geometry":"BufferGeometry","uuid":"6d736dea","drawRange":null},{"object":"break_mount_peel_1","root":"Group","geometry":"BufferGeometry","uuid":"5cf5347c","drawRange":null},{"object":"break_mount_peel_2","root":"Group","geometry":"BufferGeometry","uuid":"ccbaf511","drawRange":null}],"programsBefore":96,"programsAfter":96,"geometriesBefore":190,"geometriesAfter":190,"texturesBefore":136,"texturesAfter":136,"newPrograms":[]}
- [console.warning] [GPU brick] bloomScene 133.6ms {"owners":[],"newGeometries":[],"unstampedVisible":[{"object":"AuthoredResolvingMarker","root":"ship_wasp_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"0a80b8f8","drawRange":null},{"object":"AuthoredResolvingMarker","root":"ship_wasp_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"0a80b8f8","drawRange":null},{"object":"AuthoredResolvingMarker","root":"ship_mule_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"0a80b8f8","drawRange":null},{"object":"AuthoredResolvingMarker","root":"ship_mule_DirectAuthoredAdmission_AuthoredAssetBoundary","geometry":"OctahedronGeometry","uuid":"0a80b8f8","drawRange":null},{"object":"SF_PlaceFallback_place_lane_pin_Hull","root":"SF_PlaceFallback_place_lane_pin_AuthoredAssetBoundary","geometry":"BoxGeometry","uuid":"3932c74b","drawRange":null},{"object":"SF_PlaceFallback_place_tally_post_Hull","root":"SF_PlaceFallback_place_tally_post_AuthoredAssetBoundary","geometry":"BoxGeometry","uuid":"3932c74b","drawRange":null},{"object":"SF_PlaceFallback_place_lane_beacon_Hull","root":"SF_PlaceFallback_place_lane_beacon_AuthoredAssetBoundary","geometry":"BoxGeometry","uuid":"3932c74b","drawRange":null}],"programsBefore":102,"programsAfter":102,"geometriesBefore":272,"geometriesAfter":272,"texturesBefore":311,"texturesAfter":311,"newPrograms":[]}
- [console.warning] [GPU brick] bloomScene 1051.2ms {"owners":[],"newGeometries":[],"unstampedVisible":[],"programsBefore":102,"programsAfter":102,"geometriesBefore":355,"geometriesAfter":355,"texturesBefore":351,"texturesAfter":351,"newPrograms":[]}
- [console.warning] [GPU brick] bloomScene 1026.2ms {"owners":[],"newGeometries":[],"unstampedVisible":[],"programsBefore":105,"programsAfter":105,"geometriesBefore":358,"geometriesAfter":358,"texturesBefore":366,"texturesAfter":366,"newPrograms":[]}

## Host load during the window
- logical CPUs: 8
- CPU busy during window: 42%
- memory: 10466 / 16013 MB
## Continue loading readiness
- 1.31 s: preparing-run (0.36 s until next stage)
- 1.67 s: authored-library (0.35 s until next stage)
- 2.03 s: authored-visuals (2.58 s until next stage)
- 4.61 s: render-pipelines (0.00 s until next stage)
- 4.61 s: gpu-resources (0.00 s until next stage)
- 4.61 s: entering-flight
- last loading snapshot: stage entering-flight; player authored; opening pending 3; ids 307:loading:ship:ship_atlas:promise, 308:loading:ship:ship_mule:promise, 309:loading:ship:ship_atlas:promise; pipeline pending 3; pipeline admissions 0; GPU admissions 0
- exact opening plan: complete; roots 5; leaves 67; admitted programs 44; deferred global programs 0; producer census matched
- first visible draw identity gate: fail; uncaptured none
- opening scene delta: programs 41 -> 72; geometries 55 -> 113; renderer textures 16 -> 91
## Opening frame render subphases
- bloomScene: samples 1; p95 1.9 ms; avg 1.9 ms; max 1.9 ms
- bloomDownsample: samples 1; p95 0.0 ms; avg 0.0 ms; max 0.0 ms
- bloomComposite: samples 1; p95 0.1 ms; avg 0.1 ms; max 0.1 ms
## Opening first-touch owner
- disabled: pass `--opening-first-touch-owner` to arm the opt-in cold/warm owner capture
## Opening exact-owner micro-raster
- disabled: pass `--opening-exact-owner-touch` to arm the opt-in four-owner 64x64 cold touch
## No-submit scheduler A/B
- disabled: pass `--no-submit-diagnostic` to replace scene submission with a constant clear
## Tabletop census (PQ-129.01)
- route: New Game seed 47, held thrust, 20000 ms at 500 ms cadence
- sim delta: 4.98 s; executed-frame delta: 158
- bounded instrumentation: renderWork enabled for this probe only; prior state restored before shutdown: true
- last population: glass 2, runway 3, beyond 71, submitted 5, resident 21, landmarks 23
- policy envelope: glass half-extents 221 x 143 WU; runway 146 WU
- observed ranges: glass 2–8; runway 1–6; beyond 61–72; submitted 4–13; resident 8–21; landmarks 23–23
- submitted is the tabletop policy population (glass + runway + forced roots), not WebGL draw calls.
## Sector-transition phase ledger
- unavailable: no armed public jump event sequence was observed
## Live hitch attribution (PQ-129.02)
- bounded instrumentation: classifier enabled for this probe only; prior state restored before shutdown: true
- system timing coverage: prime-period-stratified
- observed frames: 163; hitches: 145; named: 136; unknown: 9
- hitch runs: first 15; echoes 130; longest streak 39
- named coverage: 0.938
- owner counts: compile 8; upload 2; bloom 5; sim 1; externalScheduling 120; unknown 9
- sim steps in hitch frames: 0x 0 | 1x 0 | 2x 1 | 3x 0 | 4+x 0
- sim hitch coverage: fully measured 0 | partially measured 0 | unmeasured 1 | no sim steps 0
- unknown residual: mean 84.7 ms unattributed interval over 9 hitch frames; largest measured phase: externalScheduling 8 | bloom 1
- frame interval vs measured callback interval: mean frameMs 120.8 | mean callbackInterval 138.7 | mean disagreement -17.9 ms over 144 hitch frames
- interval disagreement: mean -17.9 | median -0.8 ms over 144 hitch frames (median over last 144 of 144); frames at the 250 ms frame-dt clamp: 9; mean disagreement on the clamped frames -261.5 ms
- externalScheduling split: mean gap 99.1 ms | mean dispatch lag 21.0 ms | gap dominant 114 | dispatch dominant 6 over 120 frames## Long tasks (main-thread blocks)
- JS heap MB over run: 408 492 496 557
- economy stations/listings/history-points: 2s/90L/5760p  2s/90L/5760p  2s/90L/5760p  2s/90L/5760p
- GPU geometries over run: 127 192 355 358
- GPU textures over run:   106 157 351 366
- count 53; total 11319 ms; max 1132 ms; >=50 ms 53; >=100 ms 38
- 1132 ms at 18675 ms
- 1071 ms at 47189 ms
- 1043 ms at 51982 ms
- 883 ms at 17597 ms
- 510 ms at 43912 ms
- 269 ms at 39650 ms
- 257 ms at 49414 ms
- 252 ms at 28588 ms
- 246 ms at 35632 ms
- 217 ms at 49098 ms
- 213 ms at 36572 ms
- 208 ms at 37347 ms

## Bloom subphases (PQ-129.03)
- bloomScene: samples 163; p95 5.4 ms; avg 20.1 ms; max 1053.1 ms
- bloomDownsample: samples 163; p95 0.1 ms; avg 0.1 ms; max 0.3 ms
- bloomComposite: samples 163; p95 0.1 ms; avg 0.0 ms; max 0.2 ms
## Sampled simulation systems
- physics: samples 79; p95 1.60 ms; avg 0.97 ms; max 15.90 ms
- tacticalAI: samples 42; p95 1.40 ms; avg 1.00 ms; max 1.60 ms
- flight: samples 79; p95 0.60 ms; avg 0.37 ms; max 1.20 ms
- tetherGameplay: samples 79; p95 0.40 ms; avg 0.10 ms; max 0.70 ms
- masslineHud: samples 42; p95 0.30 ms; avg 0.14 ms; max 0.30 ms
- core.preStep: samples 79; p95 0.20 ms; avg 0.11 ms; max 0.30 ms
- input: samples 79; p95 0.20 ms; avg 0.11 ms; max 0.20 ms
- lawSecurity: samples 42; p95 0.20 ms; avg 0.09 ms; max 0.30 ms
- actions: samples 79; p95 0.20 ms; avg 0.08 ms; max 0.20 ms
- world: samples 79; p95 0.20 ms; avg 0.11 ms; max 0.40 ms
- npcJobsRuntime: samples 42; p95 0.20 ms; avg 0.16 ms; max 2.40 ms
- scenarioRuntime: samples 1; p95 0.20 ms; avg 0.20 ms; max 0.20 ms
