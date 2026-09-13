<!-- LIFETIME: DURABLE -->
# SpaceFace performance: the top 10 and the next 100

**2026-09-13.** Owner's laptop: Intel Core Ultra 7 155U (15 W, two performance cores), Intel integrated
GPU through ANGLE to Direct3D 11, 1920x1080 at 125 %, 31.5 GB RAM, Electron 43. Every number here was
measured on that machine the same day, headed, on the real Electron route.

## In plain language

The game did not feel slow because it drew too much. Once you are flying at the start, a frame costs
about 4.5 ms of an available 16.7 ms and there are only ~60 draw calls. It felt slow because of
**waiting and freezing**: about half a minute from Launch to flying, multi-second freezes right after
you take control, and 8 seconds of stutter every time you charge a jump. Almost all of that came from
**doing the right work at the wrong moment** (building and checking graphics shaders while you watch)
and from **work nobody needed** (textures for ships that never use them, a hidden ship picture still
rendering behind the loading screen, stuck test programs eating three CPU cores).

**Where it stands (13 September, midday).** Four fixes are committed and measured: the stuck test
programs are gone (three CPU cores back); loading no longer interrogates the graphics driver and no
longer draws speed lines behind the loading screen (Launch to flying 32.2 s to 28.0 s on a second
launch); and New Game no longer paints fallback hull textures for ships that never show them (1.3 s
of loading work removed). Mid-campaign runs with the next fix still uncommitted reach flying in about
24 s, and a jump to Ceres ran with no freeze longer than a tenth of a second. The rest of the top 10
is being implemented and measured; this document is updated as each result lands.

## How every change is judged (the scoreboard)

A change is kept only when one of these moves on the owner's machine, measured the same way before
and after. One headed run at a time; headless or software-GPU timings do not count.

| What you feel | Instrument | Before (morning) | Latest |
|---|---|---|---|
| Launch click to flying (second launch) | `node scripts/probe-main-thread-profile.mjs --from-launch --keep-profile=p0913a` | 32.2 s | 28.0 s committed (step 1); 24.0-24.4 s in runs with the loading-queue work still uncommitted |
| Launch click to flying (first launch) | same, fresh `--keep-profile` name | 34.7 s | not re-measured |
| Freezes while loading (long tasks in gpu-resources) | same report | 24 tasks, 7.4 s | 15 tasks, 4.1 s (step 1); none of 400 ms or more after the fallback-texture fix |
| Freeze at the start of flight | same report + `[GPU brick]` console line | 1.6-4.8 s, three ships still compiling | 0.76 s + 0.98 s (step 1); 1.57 s in a mid-campaign run while four NPC ships were still building (being fixed) |
| Jump charge | `node scripts/probe-runtime-witness.mjs --sector-entry --no-sample-shots` | 8.3 s, 34 hitches, blocks up to 4.8 s | map to arrival 6.4 s, 8 long tasks, longest 97 ms (mid-campaign, profiler run; witness re-run pending) |
| Busy-scene frame (Ceres after the jump) | same witness, settled frame | presentation p95 10.6 ms | pending |

## What the measurements showed

1. **Three stuck test programs had been burning a CPU core each for two days** (35-41 CPU-hours
   apiece). On a 15 W chip with two fast cores that alone makes everything sluggish.
2. **Loading is main-thread work, not downloads.** Launch to flight fetched 33 files, 19 MB, in well
   under a second. The 25-second "gpu-resources" stage was 18 s of busy main thread.
3. **The biggest single cost was the game asking the graphics driver "is this shader still valid?"**
   for every shader on every poll: about 9 s of the load, each question a blocking round trip.
4. **The on-disk shader cache is not the lever.** First launch 34.7 s, second launch 32.2 s.
5. **Shaders were drawn before they finished building,** so the first draw waited for the driver:
   the 1.5-4.8 s freezes as flight begins, and the same during jumps.
6. **Work nobody needed:** 1024x1024 procedural fallback textures generated for ships that already
   have authored textures (1-4 s); the New Game screen's 3D ship preview (a second WebGL context)
   still rendering and compiling through the whole load; the speed-lines overlay drawing behind the
   loading screen (1.8 s).
7. **Steady flight is not the problem at the opening** (4.5 ms per frame, 59 draw calls). Ceres
   after a jump is heavier (10.6 ms) and is where per-frame work starts to matter.

## The top 10

| # | Problem (plain) | Evidence | Fix | Status |
|---|---|---|---|---|
| 1 | Stuck test programs pinned three CPU cores for two days | 35-41 CPU-hours each; unbounded `while (screenManager.isOpen())` drains and a 0 ms rAF shim | Killed them; bounded both drains and the deck walk's copy; ~60 Hz shim; 10-minute watchdog on `check:gamepad-screens` | DONE `7214b09e4` |
| 2 | Loading interrogated the driver about every shader on every poll | `gl.isProgram` ~9 s of load main thread (warm profile) | Readiness still polled; validity from the context-loss event, three's destroy, and one shared native recheck budget | DONE `63add91fb` (Launch to flying 32.2 s to 28.0 s with item 3) |
| 3 | Speed lines did their work behind the loading screen | `_updateSpeedLines` 1.8 s during gpu-resources | Publish the velocity record, then stop while loading | DONE `63add91fb` |
| 4 | The 25 s loading stage ends on timers, not on finished work | Cook ledger: a 12 s wait and a 6 s wait both time out on four NPC ships (two Wasps, two Mules) whose shaders are still queued; the outer 20 s limit then starts flight anyway | Find why those shader builds start so late (the pipeline admission queue during loading), then fix the waits | IN PROGRESS |
| 5 | Shaders drawn before they finish building | `getProgramInfoLog`/`getShaderInfoLog` inside `WebGLRenderer.render` ~3 s; bricks of 1.5-4.8 s | Compile, wait for readiness as a cohort, then touch | IN PROGRESS |
| 6 | Fallback hull textures built for ships that never use them | `makeHullNormalMap`/`makeNoiseTexture` from `fallbackMaterials` in `buildComposedShip`: 1-4 s | Fallback materials are built lazily, only when a part uses them | DONE `cd9c9f5ed` (1,298 ms of texture painting after Launch to 0; the 452 ms long task is gone) |
| 7 | New Game's hidden 3D ship preview keeps rendering during loading | `stageHull` drift renders (2.2 s) and preview texture uploads (285 ms) after Launch; disposed only at enterFlight | Stop the preview on Launch, release its WebGL context once the loading screen covers it, rebuild it if the start fails | IN PROGRESS (written and tested; measuring) |
| 8 | Loading uploads one texture per yield and builds one mesh per frame | Upload pass 947 ms wall, 930 ms of it the uploads themselves; pauses between textures add up to at most 17 ms | Try time-sliced batches; keep only if a run shows a gain | IN PROGRESS (likely no gain) |
| 9 | Jump charge stutters | Morning: 8.3 s charge, 34 hitches, 4.5 and 4.8 s blocks, plume programs linking mid-jump | Mid-campaign profile: map to arrival 6.4 s, 8 long tasks, longest 97 ms; confirming with the original witness | IN PROGRESS |
| 10 | Busy-scene frame cost | Ceres p95 10.6 ms; streamed models are hashed and their textures copied three times on the main thread (~6 % of it during a jump and at Ceres) | Chosen after items 4-9 land | PENDING |

## Answers to the owner's questions

**"Ships are recombinant, made of parts. Does that hurt?"** Not per frame, and not in the way it
sounds. Assembled ships are already cached in memory (by hull, parts, paint and loadout) and later
copies share geometry; static parts are merged by material when a ship is built. The real costs are
**when** assembly happens (the first time a ship type appears: in the load, at flight start, when a
distant ship switches detail level) and that **every copy clones its materials**, which multiplies
per-frame shader work in crowded scenes. Your instinct is right and about 70 % built: the missing
pieces are items 3-7 in the list below (bake on refit in the station, pre-bake a sector's NPC
variants during load or jump charge, share unchanged materials, persist the result between launches).

**"Is it loading things at the wrong time?"** Yes, that was the core of it. See the top 10.

**"Are hidden inner parts or always-covered plates being drawn?"** Not that we could find. No ship
file tags interior geometry and no mesh names suggest it; the collision hull is already excluded. The
real waste is different: lower-detail ship models keep all their materials and textures, and the
biggest hull mesh is often not simplified at all (the Hornet hull is 18,514 triangles at every detail
level). Those are items 11 and 71-73.

**"Too many draw calls?"** No. 22-96 per frame measured, and skipping draws entirely did not change
frame pacing on 2026-09-10.

## The next 100, ranked

Order: first everything with **no visual cost**, most felt first; then **small** visual costs you
would struggle to notice at the chase camera; then **medium** costs that belong behind an opt-in
"integrated GPU" setting; then **large** architectural or look trade-offs. Items are not repeats of
the top 10.

### No visual cost

1. **Collapse ship-part shader variants.** Bind neutral 1x1 maps for missing texture slots so every
   authored hull part compiles to one or two programs; the Atlas and Mule compiled five variants that
   differ only in which maps exist. Fewer links at load, fewer "new ship appears" freezes.
   (`partsLibrary.js` packed-ORM path, `authoredMaterialProfiles.js`)
2. **Precompile the destination during jump charge** from a manifest of its ship families and effects
   (liquid plasma and industrial plume programs linked at first draw mid-jump: 541 ms).
3. **Bake the ship when you refit it.** Compose the template on `ship:appearanceChanged` while docked
   instead of at undock or first draw.
4. **Persist baked ship templates between launches** (merged geometry in IndexedDB, keyed by loadout
   hash plus part-library and material ABI versions).
5. **Pre-bake the sector's NPC ship variants** on an idle queue at sector load, not at first sight.
6. **Share unchanged materials across ship copies.** `cloneFlightInstanceMaterials` clones every
   material for every ship; clone only drive glow, damage tint and shield-hit materials.
7. **Stop template-cache churn in busy sectors:** the flight template cache holds 32 and the static
   batch geometry cache 48; partition per ship family or raise them.
8. **Keep runtime weapon state out of the template key** (`_cooldown`, `_heat` in
   `stableFlightTemplateToken`) so identical loadouts cannot split the cache.
9. **Start fetching and decoding the opening's models when New Game opens,** so Launch only admits.
10. **Initialize physics earlier.** The 2.1 MB Rapier module is fetched and started during loading.
11. **Share texture data across a ship's detail levels.** Kestrel's three LOD files carry identical
    1024x1024 textures (16, 12 and 10 MB).
12. **Split the 75 MB starting trade hub** (30 textures, 12 materials) into a docking-collar shell
    admitted before flight and the rest streamed after.
13. **Compress the remaining hulls** (Hornet, Pelican, Mule, Ashline Rig, Helios Span) with meshopt
    and quantization like Kestrel and Wasp.
14. **Fetch each render package once:** greeble-pipes, weapon-pulse-cannon and greeble-antennas were
    each requested twice while loading.
15. **Build the identical roughness noise once** for every procedural hull livery (seed 99 is
    regenerated at 1024x1024 per livery in `shipKit.js`).
16. **Cache procedural textures across launches** (IndexedDB) or generate them in a worker.
17. **Bake weapon flipbook atlases** at build time or in a worker (`flipbookAtlases.js` runs at New Game).
18. **Walk the scene graph once per frame,** not once per render pass (three re-walks every object for
    the bloom pass, the main pass and shadows because `scene.matrixWorldAutoUpdate` is left on).
19. **Write shared time uniforms once per material,** not once per object (`energyMaterials.js` bolts,
    `spaceBackground.js`, `plasmaRibbons.js`, `plasmaStream.js`, `volumetricPlume.js`, `visualFactory.js`).
20. **Fix the GL_INVALID_OPERATION flood** ("texture format and sampler type") in flight: every failing
    draw is skipped, so something is missing on screen. Capture it with `npm run perf:spector`.
21. **Spread jump arrival's synchronous work over frames** (`world.enterSector` 57 ms, `sector:enter`
    listeners 35 ms, residency plan 10 ms, renderer lifecycle 10 ms).
22. **Stop submitting the 3D world under full-screen UI** (map, station, pause).
23. **Time-slice in-flight admission** (new ships and promoted rocks) the way loading now is.
24. **Upload a new ship's textures across frames** after it is composed, not in its first drawn frame.
25. **Warm the ships about to enter the view** from traffic intent instead of the whole sector.
26. **Schedule background admission with `scheduler.yield()` after present,** not stacked `setTimeout(0)`.
27. **Present-first loop:** after a late frame show the last snapshot and cap catch-up to one step.
28. **Turn off three's per-program shader log checks for players** (`renderer.debug.checkShaderErrors`),
    keep them under probes and dev: three synchronous round trips per program at first use.
29. **Enforce the memory residency budget during long visits** (today only on sector exit) and size it
    from the hardware instead of fixed 384/512 MB.
30. **Free transcoded texture bytes from JavaScript memory** after upload.
31. **Confirm KTX2 transcodes to BC7 on this GPU;** an RGBA32 fallback would cost four times the video
    memory and upload time.
32. **Stop deep-copying world records every simulation tick** (`ensureWorldRecords` renormalizes the
    whole bag from `world.js`); the cost grows with every sector you visit.
33. **Remove the closure allocated on every event emit** (`eventBus.js`, ~1,700 emit sites).
34. **Cache subsystem ordering** in `recomputeCombatantModifiers` instead of sorting each call.
35. **Keep radar contacts sorted incrementally** (two full loops and a sort every draw).
36. **Gate tumble body-language effects** (`vfx.js` walks every pitch candidate every frame).
37. **Skip rewriting unchanged effect instance matrices** in `vfx.js`.
38. **Skip buffer uploads for idle engine trails and plumes.**
39. **Use PCFShadowMap in the asteroid interior preview;** PCFSoftShadowMap on the shared renderer makes
    three print a warning every shadow frame (also `asteroidRenderer3d.js`, `graphicsLab.js`).
40. **Sort opaque draws by material** (the opaque sort is a stub) to cut GPU state changes.
41. **Size the shadow caster region to the view plus a margin,** not the sector.
42. **HUD:** reuse projection objects, avoid layout reads per frame (`hud.js`), replace the command
    bar's per-frame JSON signature with a revision counter (`commandBar.js`).
43. **Build HUD effects on first use** (flicker grid, route beam, hex pattern are built at boot).
44. **Cache galaxy-map routes;** each alternative is computed twice per render.
45. **Stop recomputing galaxy-map selectors and ETA ribbon** every frame while the map is open.
46. **Reuse market and bar rows** instead of rebuilding HTML and listeners on every open.
47. **Save once, not several times:** remove repeated stringify/parse/checksum passes and confirm the
    save worker is the production path.
48. **Stop scheduling near-silent music stems;** cull audio sources at table distance, not 900 WU.
49. **Reuse physics command objects** per craft per tick (`sg02DynamicBodyOwner.js`).
50. **Reuse AI hazard-contact records** per query (`aiPorts.js`).
51. **Reuse mining beam and heat descriptors** (`mining.js`).
52. **Stop tether acquisition copying and sorting every tick** (`tetherGameplay.js`).
53. **Merge traffic's back-to-back freighter passes** and per-tick filter-then-sort candidate lists.
54. **Remove the rest-argument allocation in `rng.hash32`.**
55. **Use the spatial hash for projectile sweeps** even below its threshold (all-pairs fallback).
56. **Swap-remove entities** instead of splicing several arrays (`coreSystem.js`).
57. **Index world records by id** instead of scanning the entity list (`findLiveEntityForRecord`).
58. **Ring-buffer price history** and build synthetic station history when a market opens.
59. **Refresh only dirty batches on a floating-origin rebase.**
60. **Build one path map per ship template** instead of traversing it per binding (`findFlightTemplateObject`).
61. **Batch mirrored fitted pods and greebles** into one mesh.
62. **Author roster hulls pre-merged by material** (the corsair blade model already is).
63. **Make traffic spawn at the right detail level** for all 13 hull families, not full detail then demote.
64. **Give weapon presenters an on-screen condition,** not only a 240 WU range.
65. **Keep off-view station landmarks as map facts** until you approach.
66. **Audit the main canvas context flags** (alpha, desynchronized, power preference).
67. **A/B the ANGLE backends on this GPU** (D3D11, D3D11-on-12, Vulkan) and ship the fastest.
68. **Match Electron frame pacing to the browser route** (background throttling, vsync switches).
69. **Delete the dead simulation worker files** (`simWorker.js`, `simWorkerHost.js`, `simTransport.js`).
70. **Guard it:** a zero-shader-links-after-first-frame check (from `perf:renderer-info`'s mid-flight
    compile detector), the scoreboard as one command, and a 20-minute soak whose resource counts must
    plateau.

### Small visual cost (hard to notice at the chase camera)

71. Simplify the dominant hull mesh in LOD1 and LOD2 (Hornet's hull is 18,514 triangles at every level).
72. A merged "distant" material set for LOD1 and LOD2 (nine materials down to two or three).
73. Smaller texture mips for LOD2 ships (256x256).
74. Distance tiers for NPC engine trails and plumes (player and target stay full detail).
75. Standard instead of physical (transmission, clearcoat) canopy material on distant NPCs.
76. Single-sided effect quads where the winding is proven.
77. An overdraw cap for screen-filling additive smoke and shards beyond the view.
78. Fewer always-on effect point lights (six are baked into every lit shader).
79. A cheaper HDR bloom buffer format at half resolution where it looks identical.
80. Far background planet impostors at 256x256.
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
92. A 512x512 hull texture tier.
93. Post effects (grade, vignette, grain) off.
94. A particle density setting.

### Large trade-offs (architecture or look)

95. **WebGPU renderer** (three's WebGPURenderer on Dawn to Direct3D 12): removes the GLSL to HLSL to
    D3DCompile path behind shader build times; `vfx.js`'s ~14,000 lines of GLSL must move to TSL and
    three.quarks support must be verified first.
96. **Simulation on a worker** (packed snapshot fence first). Simulation is 2-5 ms per frame today, so
    not indicated yet.
97. **An art pass for common NPC hulls** targeting 8-12 thousand triangles at full detail.
98. **Far ships as impostor sprites** beyond the view.
99. **Fixed pre-built NPC hulls** (no runtime assembly for NPCs; loses visible NPC loadouts).
100. **Baked contact shadows instead of real-time shadow maps.**

## Measured and killed (do not re-propose without new data)

- **Draw-call count** as the pole: 22-96 per frame; replacing submission with a clear did not change
  frame pacing (2026-09-10).
- **Garbage collection** as the pole: a forced collection moved the heap 285 to 282 MB; 4 MB sampled
  allocation over 20 s (2026-09-10).
- **Rapier physics:** 66 bodies, 0.8 ms.
- **Bloom cost:** bloomScene p95 2.4-3.2 ms.
- **Download size / HTTP caching** as the load problem: 19 MB in under a second; release assets are
  already immutable-cached with ETags.
- **The GPU program disk cache** as the load lever: first vs second launch differ by 2.5 s.
- **Hidden interior geometry:** none tagged or named; collision hulls already excluded.
- **Dead MSAA resolve:** the default route already creates the canvas without antialiasing.
- **Always-on instrumentation:** system timing, GPU timers and GL instrumentation are off unless a
  probe enables them.
- **Exact-key dummy shader prewarm, stand-in material warmup, gating `scheduleUpgradeFrame` on flight
  mode:** each measured worse in earlier campaigns.

## Instruments

```
# Launch to flight, per stage, long tasks, bytes fetched (headed Electron)
node scripts/probe-main-thread-profile.mjs --from-launch --keep-profile=<name> --label=<run>
node scripts/probe-main-thread-profile.mjs --drop-profile=<name>
# Steady flight main-thread profile
node scripts/probe-main-thread-profile.mjs --ms=20000
# Loading ledger, hitches, GPU bricks; jump to Ceres
node scripts/probe-runtime-witness.mjs --no-sample-shots
node scripts/probe-runtime-witness.mjs --sector-entry --no-sample-shots
# Owner-installed tools (2026-09-13)
npm run perf:renderer-info -- --duration=15
npm run perf:spector
npm run perf:gltf
```

Reports land under `.devshots/main-thread-profile/<label>/` and `.devshots/runtime-witness/`. A
`.cpuprofile` opens in Chrome DevTools. Two headed runs at once corrupt each other's timings.
