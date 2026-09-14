<!-- LIFETIME: DURABLE -->
# SpaceFace performance: the top 10 and the next 100

**2026-09-13.** Owner's laptop: Intel Core Ultra 7 155U (15 W, two performance cores), Intel integrated
GPU through ANGLE to Direct3D 11, 1920x1080 at 125 %, 31.5 GB RAM, Electron 43. Every number here was
measured on that machine the same day, headed, on the real Electron route.

## In plain language

The game did not feel slow because it drew too much. Once you are flying at the start, a frame costs
about 4.5 ms of an available 16.7 ms and there are only ~60 draw calls. It felt slow because of
**waiting and freezing**: half a minute from Launch to flying, multi-second freezes right after you
took control, and stutter every time you charged a jump. Almost all of it was **the right work at
the wrong moment** (building and checking graphics shaders while you watch), **work nobody needed**
(textures for ships that never use them, a hidden ship picture still rendering behind the loading
screen, stuck test programs eating three CPU cores), and **bookkeeping repeated far more often than
it changes** (a combat label rewritten for every ship on every tick).

**Where it stands (end of 2026-09-13).** On the owner's laptop, with nothing else running, Launch to flying takes 4.2 s (2.9 s on the other quiet run) against 32.2 s this morning,
no single freeze while loading is longer than 198 ms, and the first 10 s of flight have no long task. A jump to Ceres runs with nothing over 77 ms, and 8 s of
busy flight there had no long task with the main thread 56 % busy. A rendering bug found on the way is fixed: while the renderer held shadow refreshes in the first 20 s of flight, the graphics driver rejected every lit draw that needed the not-yet-created shadow map, so the player's own ship was not drawn. Drawing those objects costs real frame time in early flight (main thread 47 % -> 83 % busy in the first 10 s, still with no freeze), the same cost every frame already paid once the hold ended. Preparing engine-plume shaders when a ship spawns did not remove the one-time freeze on a cold shader cache, so it was not kept; it remains backlog item 2.
Earlier timings in this document were taken while other agents' tests shared the laptop; the final ones were taken after those
processes were stopped, and on a 15 W chip that alone is a large part of the difference.

## How every change is judged (the scoreboard)

A change is kept only when one of these moves on the owner's machine, measured the same way before
and after, one headed run at a time on a quiet machine. Headless or software-GPU timings do not count.

| What you feel | Instrument | Morning | Final |
|---|---|---|---|
| Launch click to flying (second launch) | `node scripts/probe-main-thread-profile.mjs --from-launch --keep-profile=p0913a` | 32.2 s | 4.2 s (other quiet run 2.9 s); 5.6 s once the engine effects are built while loading (one run; cook 1.19 s -> 1.77 s) |
| Launch click to flying (first launch) | same, fresh `--keep-profile` name | 34.7 s | 12.1 s with engine effects and rocks built while loading (fresh-install jump probe 12.4 s and 14.4 s; before those two changes 10.8-10.9 s) |
| Long freezes while loading | same report, long tasks from Launch to flight | 24 tasks, 7.4 s in gpu-resources | 6 tasks, 667 ms in total, longest 198 ms (second launch). First launch: longest 0.9 s and 2.7 s in total, from 1.9 s and 2.9 s, now that the New Game preview no longer loses its graphics context mid-link |
| Freeze as flight begins | same report, first 10 s of flight + `[GPU brick]` console line | 1.6-4.8 s, three ships still compiling | none in the first 10 s of a New Game, now with effects running (the earlier "none" was measured while effects were frozen). Fresh install: the 433-550 ms freeze when the first rocks came into view is gone (the rock material now compiles while loading); opening flight 60 fps, worst frame 17-18 ms in two runs. Crucible: one 50 ms frame as the first picture appears, then 60 fps with a worst frame of 18 ms (was two or three 50-117 ms frames while the field markers compiled on first draw) |
| Jump charge | `node scripts/probe-runtime-witness.mjs --sector-entry --no-sample-shots` | 8.3 s, 34 hitches, blocks up to 4.8 s | map to arrival 6 s, nothing over 77 ms (jump profile: the witness cannot click through uncommitted chart panels) |
| Freeze 20 s into every run | instrumented jump and swarm probes (game time, hold flags and new programs per frame) | 600 ms the first time on a profile, 50-67 ms cached, 330-373 ms on a fresh install; no exhaust or tracers before it | none on a warm cache (no frame over 34 ms at the release); on a fresh install at most 83 ms, and no frame over 34 ms in the second run; effects run from the first second |
| Busy scene (Ceres after the jump) | same witness, frame breakdown | presentation p95 10.6 ms | 0 long tasks in 8.1 s, main thread 56 % busy (jump profile); worst frame 67 ms with effects running (was 100 ms) |

## What the measurements showed

1. **Three stuck test programs had been burning a CPU core each for two days** (35-41 CPU-hours
   apiece). On a 15 W chip with two fast cores that alone makes everything sluggish.
2. **Loading was main-thread work, not downloads.** Launch to flight fetched 33 files, 19 MB, in well
   under a second; the 25-second gpu-resources stage was 18 s of busy main thread.
3. **The biggest single cost was asking the graphics driver "is this shader still valid?"** for every
   shader on every poll: ~9 s of the load, each question a blocking round trip.
4. **The on-disk shader cache is not the lever:** first launch 34.7 s, second 32.2 s.
5. **A second WebGL context starves the first on this GPU.** The New Game screen's 3D ship preview
   kept drawing under the loading screen; while it lived, four nearby NPC ships took 12 s + 6 s of
   timeouts to build their shaders, and about 2.5 s once it was released.
6. **Loading never dispatched the shader queue.** The pipeline admission lane's auto-flush stays
   deferred for the whole opening on hardware with parallel shader compile, so ships' compiles sat
   queued until both waits timed out and the 20 s gate let flight start anyway.
7. **Shaders were drawn before they finished building,** and loading paid a whole frame per touch,
   upload and mesh build.
8. **In a busy sector nothing large is left on the main thread.** On a quiet machine, over a jump to
   Ceres and 8 s there, the biggest items were the texture copies fixed in item 10 (~0.44 s),
   verifying streamed models (SHA-256, ~0.22-0.27 s; moved to a worker in `5332d0dac`) and opening the galaxy map (one 0.4 s freeze). An
   earlier profile ranked a combat digest (~0.9 s), residency tables on sector exit (445 ms) and a
   status-sample sort (~0.67 s) as the poles; it was taken beside another agent's browser soak test,
   and on a quiet machine those three cost 24 ms, 3 ms and 3 ms. Contention does not slow a run
   evenly: it reshuffles which functions look expensive.
9. **Steady flight at the opening was never the problem** (4.5 ms per frame, 59 draw calls).

The loading shell now records a cook ledger, one row per awaited step (`state.render.openingCookLedger`,
printed in the launch profile report). Read it first when loading regresses.

## The top 10

| # | Problem (plain) | Evidence | Fix | Result | Commit |
|---|---|---|---|---|---|
| 1 | Stuck test programs pinned three CPU cores for two days | 35-41 CPU-hours each; unbounded `while (screenManager.isOpen())` drains and a 0 ms rAF shim in `scripts/lib/pq16400-gamepad-screens.mjs`, `pq16402-deck.mjs` | Killed them; bounded the drains; ~60 Hz shim; 10-minute watchdog in `check:gamepad-screens` | 3 cores back | `7214b09e4` |
| 2 | Loading interrogated the driver about every shader on every poll | `gl.isProgram` ~9 s of load main thread (`src/render/bloom.js` readiness polls) | Readiness still polled; validity from the context-loss event, three's destroy, and one shared native recheck (at most 4/s) | Launch to flying 32.2 s -> 28.0 s with item 3 | `63add91fb` |
| 3 | Speed lines drew behind the loading screen | `_updateSpeedLines` 1.8 s during gpu-resources | Publish the velocity record, then stop while loading (`src/render/feel.js`) | 1.8 s -> 0 | `63add91fb` |
| 4 | Fallback hull textures painted for ships that never use them | `fallbackMaterials` -> `pbrHullMaterial` in `buildComposedShip`: three 1024² canvas textures per livery | Fallback materials built on first use (`src/render/partsLibrary.js`) | 1,298 ms of painting after Launch -> 0 | `cd9c9f5ed` |
| 5 | Hidden ship preview kept a second WebGL context busy while loading | `stageHull` drift renders 2.2 s, preview uploads and compiles after Launch; disposed only at enterFlight | Stop on Launch or Load, free the context once the shell covers it, rebuild if the start fails (`newGame.js`, `saveLoad.js`, `stageHull.js`) | 2.2 s -> 0; opening ships' compiles no longer starved | `0262999c8`, `ef8cb83cf` |
| 6 | Shader builds queued but never dispatched during loading | Ledger: `live.openingComposition` 12,023 ms and `live.upgradeQueueIdle` 6,001 ms timeouts, 24 compiles still queued | Flush the admission lane one cohort at a time while the cook waits (`renderer.js`, `pipelineReadiness.js`) | 24.4 s -> 11.8 s | `c1669a4c4` |
| 7 | Shaders drawn before built; a frame per loading item | 5 of 89 touch subjects had no program at their draw; 1.3 s of per-touch frame yields | Compile the touch set as one readiness cohort, drain, then touch; 8 ms shared-frame slices while loading; final sweep for late-published materials | 11.8 s -> 5.8 s; nothing drawn unbuilt | `37f5072f1`, `cb460b021` |
| 8 | Every new shader's first draw asked the graphics driver for three error logs | three's `onFirstUse` reads `getProgramInfoLog` and two `getShaderInfoLog` per program, each a blocking round trip: 2.2 s of main thread from Launch to flight | Three's check off; link failures still reported from the program info the first draw fetches anyway (`src/render/shaderLinkReporter.js`; `?shaderChecks=1` restores the full check) | Log reads 2.2 s -> 0; loading busy 4.25 s -> 3.07 s; no long task in the first 10 s of flight | `66132abbe` |
| 9 | Bookkeeping repeated far more often than it changes | Combat digest re-formatted per ship per tick, two `diagnostics()` tables per sector exit, a stats sort with a script comparator: 24 ms, 3 ms and 3 ms over a jump and 8 s at Ceres on a quiet machine (a contended profile had shown ~0.9 s, 445 ms and 0.67 s) | Re-format only when `hashU32` changes; sum memory units directly; native `Float64Array#sort` (`trace.js`, `assetResidency.js`, `perfRuntime.js`) | Small: ~30 ms per jump window -> ~0 | `c3335e0d3` |
| 10 | Streamed models copied each embedded texture through a Blob, an object URL and a fetch | GLTFLoader `Blob` 268 ms + `createObjectURL` 170 ms over a jump to Ceres and 8 s there (quiet) | Replace the built-in `KHR_texture_basisu` handler with one that hands the bytes straight to `KTX2Loader.parse` (`src/render/embeddedKtx2Textures.js`) | 438 ms -> ~1 ms (the plugin's own copy ~38 ms); every texture identical | `26b02e46f` |

## Also fixed today

- **Streamed render packages are verified in a worker** (`5332d0dac`): main-thread SHA-256 over a jump to Ceres and 8 s there, 218 ms -> 1 ms.
- **The late-materials settle sweep shares frames while loading** (`66132abbe`): with shader log reads off, 49 stragglers settled in 260 ms instead of a frame per item.
- **Lit objects draw while no shadow map exists yet** (vendored three, `2d4c8845c`): during the first 20 s of flight the renderer holds shadow refreshes, three bound its never-uploaded empty shadow texture (so the generic colour texture) to shadow samplers, and the driver rejected 3,811 of 5,612 draws, including every part of the player's ship; after the fix, 0 of 3,148 draws were rejected and the ship is drawn.
- **Engine exhaust, weapon fire and particles run from the first second of flight** (`7cac23426`, and
  building the engine effects while loading): effects had been frozen for the first 20 s of every New
  Game and Crucible run since `2ca4bc8e5`, and their release linked every lazily built effect program on
  one frame. After: no frame over 34 ms at the release on a warm cache, 67-100 ms frames on a fresh
  install (was 330-373 ms), about half a second more loading behind the loading screen. The instanced
  rock material now compiles after the first rocks join their pools, still behind the loading screen:
  the 433-550 ms freeze a few seconds into a fresh install's first flight is gone, for about 0.8 s more
  loading on a fresh install.

## Answers to the owner's questions

**"Ships are recombinant, made of parts. Does that hurt?"** Not per frame, and not in the way it
sounds. Assembled ships are already cached in memory (by hull, parts, paint and loadout) and later
copies share geometry; static parts are merged by material when a ship is built. The real costs are
**when** assembly happens (the first time a ship type appears: in the load, at flight start, when a
distant ship switches detail level) and that **every copy clones its materials**, which multiplies
per-frame shader work in crowded scenes. Your instinct is right and about 70 % built: the missing
pieces are items 3-7 below (bake on refit in the station, pre-bake a sector's NPC variants during
load or jump charge, share unchanged materials, persist the result between launches).

**"Is it loading things at the wrong time?"** Yes, that was the core of it. See the top 10.

**"Are hidden inner parts or always-covered plates being drawn?"** Not that we could find. No ship
file tags interior geometry and no mesh names suggest it; the collision hull is already excluded.
The real waste is different: lower-detail ship models keep all their materials and textures, and the
biggest hull mesh is often not simplified at all (the Hornet hull is 18,514 triangles at every detail
level). Those are items 11 and 71-73.

**"Too many draw calls?"** No. 22-96 per frame, and skipping draws entirely did not change frame
pacing on 2026-09-10.

## The next 100, ranked

Order: first everything with **no visual cost**, most felt first; then **small** visual costs you
would struggle to notice at the chase camera; then **medium** costs that belong behind an opt-in
"integrated GPU" setting; then **large** architectural or look trade-offs. Numbering matches the
owner-facing report page. None repeat the top 10.

### No visual cost

1. **Collapse ship-part shader variants.** Bind neutral 1x1 maps for missing texture slots so every
   authored hull part compiles to one or two programs; the Atlas and Mule compiled five variants that
   differ only in which maps exist. (`partsLibrary.js` packed-ORM path, `authoredMaterialProfiles.js`)
2. **Find what still links at first draw after a jump on a cold shader cache.** One ~0.3 s freeze
   remains 13-20 s after arriving at Ceres (a `[GPU brick]` in bloomScene linking a depth program and
   effect programs). Queuing every engine family's plume materials for compilation when its ships spawn
   did not change it (272 ms with, 289 ms without, 2026-09-13), so capture the brick's owners before
   choosing what to warm; loading and the jump cook still skip `warmupLiveFlightEffects`
   (`holdLeftoverFx`).
   **Cause found (2026-09-13, late).** In the jump profile (arrival at game time 14.6 s) and in a
   Crucible swarm, the freeze lands on the frame where game time reaches 20.00 s. Effects were frozen for the
   first 20 s of every run: `vfx.update` and every effect spawn path read
   `openingGraphPublicationFrozen`, which the first paint in flight keeps held through the first-flight
   window (`2ca4bc8e5`). No exhaust, bolt tracers or particles were drawn. The engine fleet, plasma
   stream and retro jets did not exist until the release frame, which created them and linked their
   programs at once: 7 programs, 600 ms the first time on a profile and 50-67 ms once cached. The
   shadow refresh on that frame took 4-6 ms. Fixed in `7cac23426` and `09a54187f`. The fresh-install
   freeze when the first rocks come into view was a separate first draw, now compiled while loading.
   The field marker meshes that a Crucible arena lights in its first half second now compile while
   loading as well; one 50 ms frame remains there, on the frame the first picture appears, with no
   shader built in it. The 1.9 s freeze on a fresh install's loading screen was `forceContextLoss()` on
   the New Game preview's WebGL context while that context's own hull shaders were still linking: after a
   15 s stay on New Game (`--launch-dwell-ms=15000`) the same release took 24 ms. The preview now stops
   drawing at once and loses its context when its programs report ready (`previewContextRetire.js`).
   On a fresh install that teardown took 11 ms and the longest freeze while loading went from 1.9 s to
   0.9 s; on a warm cache it still costs about 0.2 s, later in loading.
3. **Bake the ship when you refit it:** compose the template on `ship:appearanceChanged` while docked.
4. **Persist baked ship templates between launches** (merged geometry in IndexedDB, keyed by loadout
   hash plus part-library and material ABI versions).
5. **Pre-bake the sector's NPC ship variants** on an idle queue at sector load, not at first sight.
6. **Share unchanged materials across ship copies** (`cloneFlightInstanceMaterials` clones every
   material per ship; clone only drive glow, damage tint and shield-hit materials).
7. **Stop template-cache churn in busy sectors** (`FLIGHT_ROOT_TEMPLATE_CACHE_LIMIT` 32, static batch
   geometry cache 48; partition per ship family or raise).
8. **Keep runtime weapon state out of the template key** (`_cooldown`, `_heat` in
   `stableFlightTemplateToken`).
9. **Start fetching and decoding the opening's models when New Game opens.**
10. **Initialize physics earlier** (the 2.1 MB Rapier module is fetched and started during loading).
11. **Share texture data across a ship's detail levels** (Kestrel LOD files carry identical 1024²
    textures: 16, 12 and 10 MB).
12. **Split the 75 MB starting trade hub** (30 textures, 12 materials) into a docking-collar shell
    admitted before flight and the rest streamed after.
13. **Compress the remaining hulls** (Hornet, Pelican, Mule, Ashline Rig, Helios Span) with meshopt
    and quantization.
14. **Fetch each render package once** (three packages were requested twice while loading).
15. **Build the identical roughness noise once** for every procedural hull livery (`shipKit.js`
    regenerates seed 99 at 1024² per livery, ~170 ms each).
16. **Cache procedural textures across launches** (IndexedDB) or generate them in a worker (asteroid
    noise textures, ~20 ms on arrival at Ceres on a quiet machine).
17. **Bake weapon flipbook atlases** at build time or in a worker (`flipbookAtlases.js`).
18. **Walk the scene graph once per frame,** not once per render pass (`scene.matrixWorldAutoUpdate`).
19. **Write shared time uniforms once per material,** not once per object (`energyMaterials.js`,
    `spaceBackground.js`, `plasmaRibbons.js`, `plasmaStream.js`, `volumetricPlume.js`, `visualFactory.js`).
20. **Fix the GL_INVALID_OPERATION flood** ("texture format and sampler type") in flight; capture it
    with `npm run perf:spector`.
21. **Done: streamed models are verified in a worker** (`src/render/renderPackageDigest.js`,
    `5332d0dac`): main-thread `digest` over a jump to Ceres and 8 s there went from 218 ms to 1 ms.
22. **Spread jump arrival's remaining synchronous work over frames** (`world.enterSector` 57 ms,
    `sector:enter` listeners 35 ms).
23. **Stop submitting the 3D world under full-screen UI** (map, station, pause).
24. **Time-slice in-flight admission** (new ships and promoted rocks) the way loading now is.
25. **Upload a new ship's textures across frames** after it is composed.
26. **Warm the ships about to enter the view** from traffic intent instead of the whole sector.
27. **Schedule background admission with `scheduler.yield()` after present,** not stacked `setTimeout(0)`.
28. **Present-first loop:** after a late frame show the last snapshot and cap catch-up to one step.
29. **Turn off three's per-program shader log checks for players** (`renderer.debug.checkShaderErrors`),
    keep them under probes and dev.
30. **Enforce the memory residency budget during long visits** and size it from the hardware.
31. **Free transcoded texture bytes from JavaScript memory** after upload.
32. **Confirm KTX2 transcodes to BC7 on this GPU** (an RGBA32 fallback costs 4x memory and upload).
33. **Stop deep-copying world records every simulation tick** (`ensureWorldRecords` renormalizes the
    whole bag from `world.js`; grows with every sector visited). Measured 174 ms of main thread in the
    first 21 s of a run (about 0.14 ms per tick), before any sector visits add to the bag. Not a felt
    number on its own; the simulation goldens must stay byte-identical.
34. **Remove the closure allocated on every event emit** (`eventBus.js`, ~1,700 emit sites).
35. **Cache subsystem ordering** in `recomputeCombatantModifiers`.
36. **Draw the radar cheaply in busy sectors:** two passes and a sort over every contact and asteroid
    per draw, ~60-80 ms of main thread per 8-10 s of flight on a quiet machine and far more when the
    laptop is busy; batch asteroid dots into one path, keep contacts sorted incrementally, cache
    static layers (`src/ui/radar.js`).
37. **Gate tumble body-language effects** (`vfx.js` walks every pitch candidate every frame).
38. **Skip rewriting unchanged effect instance matrices** in `vfx.js`.
39. **Skip buffer uploads for idle engine trails and plumes.**
40. **Use PCFShadowMap in the asteroid interior preview** (PCFSoftShadowMap on the shared renderer
    prints a warning every shadow frame; also `asteroidRenderer3d.js`, `graphicsLab.js`).
41. **Sort opaque draws by material** (the opaque sort is a stub).
42. **Size the shadow caster region to the view plus a margin,** not the sector.
43. **HUD:** reuse projection objects, avoid per-frame layout reads (`hud.js`), replace the command
    bar's per-frame JSON signature with a revision counter (`commandBar.js`).
44. **Build HUD effects on first use** (flicker grid, route beam, hex pattern are built at boot).
45. **Cache galaxy map label widths and route alternatives** (`makeMapLabelCandidate` measures every
    label on every draw; each route alternative is computed twice per render). Small: a dedicated probe
    opened the map five times in flight and measured 59 ms on the first open and no long task on the
    next four; the 0.4 s in the jump profile came from opening it right after launch and searching.
46. **Stop recomputing galaxy-map selectors and the ETA ribbon** every frame while the map is open.
47. **Reuse market and bar rows** instead of rebuilding HTML and listeners on every open.
48. **Save once, not several times** (repeated stringify/parse/checksum; confirm the save worker path).
49. **Stop scheduling near-silent music stems;** cull audio sources at table distance, not 900 WU.
50. **Reuse physics command objects** per craft per tick (`sg02DynamicBodyOwner.js`).
51. **Reuse AI hazard-contact records** per query (`aiPorts.js`).
52. **Reuse mining beam and heat descriptors** (`mining.js`).
53. **Stop tether acquisition copying and sorting every tick** (`tetherGameplay.js`).
54. **Merge traffic's back-to-back freighter passes** and per-tick filter-then-sort candidate lists.
55. **Remove the rest-argument allocation in `rng.hash32`.**
56. **Use the spatial hash for projectile sweeps** below its threshold (all-pairs fallback).
57. **Swap-remove entities** instead of splicing several arrays (`coreSystem.js`).
58. **Index world records by id** instead of scanning the entity list (`findLiveEntityForRecord`).
59. **Ring-buffer price history** and build synthetic station history when a market opens.
60. **Refresh only dirty batches on a floating-origin rebase.**
61. **Build one path map per ship template** instead of traversing per binding (`findFlightTemplateObject`).
62. **Batch mirrored fitted pods and greebles** into one mesh.
63. **Author roster hulls pre-merged by material** (the corsair blade model already is).
64. **Make traffic spawn at the right detail level** for all 13 hull families.
65. **Give weapon presenters an on-screen condition,** not only a 240 WU range.
66. **Keep off-view station landmarks as map facts** until you approach.
67. **Remember the reduced-motion setting** instead of asking the browser for it on every HUD gauge
    animation step (`prefersReducedMotion` in `src/ui/effects/effectRuntime.js`, called from
    `gaugeSettle.js` and every radar draw; ~34 ms per 8 s at Ceres, 82 ms per 21 s of opening flight).
    Not a felt number; cheap if wanted.
68. **A/B the ANGLE backends on this GPU** (D3D11, D3D11-on-12, Vulkan) and ship the fastest. A
    standalone link probe (fresh browser profile, one standard material, 3 directional and 22 point
    lights) measured programs ready in 329 ms on D3D11, 452 ms on D3D11-on-12 and 2 ms on Vulkan,
    where the cost moves to the first draw (16 ms). The whole game on Vulkan measured worse; see
    "Measured and ruled out".
69. **Match Electron frame pacing to the browser route** (background throttling, vsync switches).
70. **Guard the wins:** a zero-shader-links-after-first-frame check (from `perf:renderer-info`'s
    mid-flight compile detector), the scoreboard as one command, and a 20-minute soak whose resource
    counts must plateau.

### Small visual cost (hard to notice at the chase camera)

71. Simplify the dominant hull mesh in LOD1 and LOD2 (Hornet's hull is 18,514 triangles at every level).
72. A merged "distant" material set for LOD1 and LOD2 (nine materials down to two or three).
73. Smaller texture mips for LOD2 ships (256²).
74. Distance tiers for NPC engine trails and plumes (player and target stay full detail).
75. Standard instead of physical (transmission, clearcoat) canopy material on distant NPCs.
76. Single-sided effect quads where the winding is proven.
77. An overdraw cap for screen-filling additive smoke and shards beyond the view.
78. Fewer always-on effect point lights. Twenty-two are baked into every lit shader: 6 event lights in
    `vfx.js` plus the 16-slot weapon light pool in `weapons/weaponLights.js`. A standalone link probe on
    this GPU (D3D11, one standard material) measured 77 ms with 0 point lights, 119 ms with 6 and 329 ms
    with 22. In a wave-1 Crucible swarm with effects running, the weapon pool used 0 lights at the median,
    2 at the 90th percentile and 5 at most. An earlier "16 of 16 busy" reading was lights stuck on while
    effects were frozen. Only standard and physical materials get cheaper; effect shaders do not. Next:
    an occupancy check in a denser fight (wave 3+), then the owner's call on muzzle and impact lights
    in big fights.
79. A cheaper HDR bloom buffer format at half resolution where it looks identical.
80. Far background planet impostors at 256².
81. Speed lines drawn into a half-resolution canvas.
82. Radar canvas at 1x device pixel ratio.
83. Particle emission scaled by distance from the camera.
84. No shadow casting from tiny ship parts and greebles.
85. Earlier asteroid instancing or impostors beyond the view.

### Medium visual cost (opt-in "integrated GPU" settings)

86. Shadows off.
87. Reduced bloom (fewer levels) or bloom off.
88. Render scale 0.85 with a sharpening pass.
89. Opt-in dynamic resolution, only after a pre-allocated render-target pool exists (reallocation
    stalls 0.5-1.3 s on this GPU today).
90. A 30 or 45 fps frame cap for battery and heat on 15 W chips.
91. Lower NPC traffic density and a smaller live simulation radius.
92. A 512² hull texture tier.
93. Post effects (grade, vignette, grain) off.
94. A particle density setting.

### Large trade-offs (architecture or look)

95. **WebGPU renderer** (three's WebGPURenderer on Dawn to Direct3D 12): removes the GLSL to HLSL to
    D3DCompile path behind shader build times; `vfx.js`'s ~14,000 lines of GLSL must move to TSL and
    three.quarks support must be verified first.
96. **Simulation on a worker** (packed snapshot fence first); simulation is 2-5 ms per frame today.
97. **An art pass for common NPC hulls** targeting 8-12 thousand triangles at full detail.
98. **Far ships as impostor sprites** beyond the view.
99. **Fixed pre-built NPC hulls** (no runtime assembly for NPCs; loses visible NPC loadouts).
100. **Baked contact shadows instead of real-time shadow maps.**

## Measured and ruled out (do not re-propose without new data)

- **Draw-call count** as the pole: 22-96 per frame; replacing submission with a clear did not change
  frame pacing (2026-09-10).
- **Garbage collection** as the pole: a forced collection moved the heap 285 to 282 MB (2026-09-10).
- **Rapier physics:** 66 bodies, 0.8 ms. **Bloom cost:** bloomScene p95 2.4-3.2 ms.
- **Download size / HTTP caching** as the load problem: 19 MB in under a second.
- **The GPU program disk cache** as the load lever: first vs second launch differ by 2.5 s.
- **Time-slicing the opening's texture uploads:** the pass is the uploads themselves (947 ms wall, 930 ms
  inside `compressedTexSubImage2D`); at most 17 ms of pauses to recover.
- **Hidden interior geometry:** none tagged or named; collision hulls already excluded.
- **Dead MSAA resolve:** the default route already creates the canvas without antialiasing.
- **Always-on system timing and GL instrumentation:** off unless a probe enables them (the 1 Hz runtime
  witness sample is on, and its sort is fixed in `c3335e0d3`).
- **Exact-key dummy shader prewarm, stand-in material warmup, gating `scheduleUpgradeFrame` on flight
  mode:** each measured worse in earlier campaigns.
- **Removing the last shared `gl.isProgram` recheck from shader readiness** (`bloom.js`, 2026-09-13):
  it took ~1.5 s of blocking calls out of loading, but Launch to flying did not get shorter (6.6 s with
  the recheck; 7.9 s and 12.7 s without it, all on a shared laptop) and both runs without it had more
  long tasks in the first seconds of flight. The blocking calls appear to pace the driver's links.
- **The galaxy map as a freeze:** 59 ms on first open, nothing on re-opens (probe, 2026-09-13).
- **Queuing engine-plume materials for compilation when ships of a new engine family spawn**
  (2026-09-13): the one-time bloomScene brick after a jump on a cold cache stayed (272 ms with, 289 ms
  without).
- **The shadow map as the 20 s freeze** (2026-09-13): the first real shadow refresh after the
  first-flight hold took 4-6 ms on the freeze frame. The freeze was effect programs created on that
  frame (backlog item 2).
- **Running the game on ANGLE's Vulkan backend** (backlog item 68; Crucible swarm probe, 2026-09-13).
  With the driver's pipeline cache warm it was no better than D3D11: 59.8 fps, 5 dropped frames and a
  worst frame of 33 ms, against 60.0 fps, none dropped and 18 ms. The first run on a profile was far
  worse: 53.8 fps, 186 dropped frames, and freezes of 1.4 s, 617 ms and 533 ms while three ship hull
  programs were built at their first draw, where no compile call made ahead of time reaches on
  Vulkan. Startup also skipped the awaited shader cook on Vulkan (103 programs against 120, engine
  effects absent when flight began), so a fair load comparison would first need that cook built for
  a GPU path without parallel compile. The standalone probe's 2 ms program readiness on Vulkan only
  moves the cost to the first draw.

## Instruments

```
# Launch to flight: per stage, cook ledger, long tasks, bytes fetched (headed Electron)
node scripts/probe-main-thread-profile.mjs --from-launch --keep-profile=<name> --label=<run>
node scripts/probe-main-thread-profile.mjs --drop-profile=<name>
# Steady flight main-thread profile
node scripts/probe-main-thread-profile.mjs --ms=20000
# Loading readiness, hitches, GPU bricks; public jump to Ceres
node scripts/probe-runtime-witness.mjs --no-sample-shots
node scripts/probe-runtime-witness.mjs --sector-entry --no-sample-shots
# Owner-installed tools (2026-09-13)
npm run perf:renderer-info -- --duration=15
npm run perf:spector
npm run perf:gltf
```

Reports land under `.devshots/main-thread-profile/<label>/` and `.devshots/runtime-witness/`. A
`.cpuprofile` opens in Chrome DevTools. Attribute costs with caller chains (self time per function
and its callers), not phase splits alone. Two headed runs at once, or one beside another agent's
browser soak check, corrupt each other's timings: check for running `check-release-soak-browser`,
`capture-*` and `probe-*` processes and wait for a quiet machine before measuring. Any program using a
few cores during the run skews it too (a Playwright headless browser did on 2026-09-13), so record
machine load while the run is going, not only before it.
