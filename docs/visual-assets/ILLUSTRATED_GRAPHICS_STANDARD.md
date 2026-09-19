# Lacquer & Starlight

Active 3D art direction, 2026-09-19. The owner asked for an artsy, beautiful, inhabited indie
world: shiny edges, deep illustrated shadows, exuberant energy, and charm beyond generic metal.
This supersedes the earlier brief's claims of frozen models or a ratified look. It is a working
art direction, not a claim that the owner has approved a frame.

## The picture

Think painted working vessels under warm starlight. Couriers are sea-green, mining craft ochre,
service boats copper, freight blue-grey, patrols slate, and rescue equipment warm ivory. Small
colored signals and occupied windows suggest people at work. Preserve authored hazard stripes,
repair patches, names, colored panels, and the machinery that gives each vessel its job.

Large lit faces are quiet color shapes. Shadow planes turn blue-violet; mechanical recesses stay
dark. Narrow optical highlights sit above the ink contour and describe polished working edges.
Ceramics, rubber, glass, paint, and exposed mechanisms must remain different substances. Avoid
covering a bland object with glow or with scratch noise. Use its existing forms before adding parts.

Space has dark breathing room around a continuous painted galaxy, a warm nucleus, broken dust
lanes, fine stars and a strong planet silhouette. The stellar body is distant light, not a fog wash
across the playable plane. Weapons and thrust remain the brightest, fastest events in the picture.

## Shared implementation

| Layer | Current owner and treatment |
|---|---|
| Surface light | `src/render/illustratedSurface.js`: four softened illumination values; cool shadows/warm light; geometric ink contour on diffuse light; specular and emission remain outside the contour. AO and texture detail survive. |
| Fleet paint | `src/render/illustratedLivery.js`: occupational palettes bound as material uniforms at authored admission. Low-chroma painted texels receive pigment, keeping their spatial texture variation; saturated markings and excluded material roles retain their color. Pigment carries its own value rather than being normalized into white roofs. Yard Tug and Bastion use deeper body values. Explicit player paint in `partsLibrary.js` overrides the default pigment. |
| Substance | `src/render/industrialMaterialFamilies.js` and `authoredMaterialProfiles.js`: shared role response for all admitted authored models, refined by exact original material names. Original names survive batching, so stencils and exposed armour do not silently become hull paint. Factors derive from a stored baseline and never compound. |
| Lighting | `src/data/sectors.js`, `sectorVisualProfiles.js`, `spaceReflectionEnvironment.js`: warm directional keys, cool rim/planet bounce, broader reflection cards. Existing lights, PMREM and shadow map are reused. |
| Post | `src/render/bloom.js`: restrained derivative ink and luminance grouping, hue-preserving HDR shoulder, bounded colored bloom spill. Both production post routes use the same shared presentation GLSL. HUD is outside the filter. |
| Sky | `deepFieldStars.js`: small resolved stars plus one combined mesh for painted stellar light; shared projection, crossfade and parallax. `deepFieldStructureArt.js` lifts the lit faces and working edges of distant structures. |
| Thrust | `thruster/ribbon/contrailTrail.js` and `plasmaRibbons.js`: matching indigo edges, continuous spatial variation and folded ribbon shading. Recorded trail shape, lifetime, length and emission rate are preserved. |
| Rescue props | `visualOverrides.js`: the opening distress/rescue payload uses the existing rescue capsule; the rescue exit uses existing lane hardware at a 14 WU visual radius. Simulation zones and explicit asset overrides retain their meaning. |

The surface change adds arithmetic and two uniforms, not another material pass or per-frame
traversal. Liveries share a shader family. The painted stellar body adds one draw and 1,728
vertices for six preallocated regional forms; inactive forms early-out, and a region with no
formation submits zero vertices. Buffers refill only when projection changes. No new texture
sets, dynamic lights, outline pass, or reduction in shipping resolution/population is required.

## First-sector coverage

The tuneup preserves the shipped release geometry and applies the shared finishes on the actual
loader path. Inspection used the release loader and shipping post/light profiles, followed by the
live flight route. The asset gallery is a material inspection fixture, not a substitute for flight.

| Family | Inspected first-sector assets |
|---|---|
| Player and principal traffic | Kestrel/Hitch, Helios Lark, Cradle, Span, Arclight, Ashline Rig, Yard Tug |
| Civilian work | Survey Pin, Ore Barge, Repair Tender, Rescue Lifter, Prospector Skiff, Scrap Sweeper, Apron Shuttle, Salvage Cutter, Volatiles Tanker, Massline Express Liner |
| Authority and flyby | Inspection Cutter, Wasp, Hornet, Bastion, Drifter |
| Stations and navigation | Trade Hub and Concord overlay, military station, jump ring, lane beacon/support gantry, Memorial Array/Candle Fleet |
| Lane furniture | Lane Pin, Tally Post, Claim Mark, Cold Locker, Ash Pin, Whistle |
| Rescue and cargo | Mining Drone, rescue capsule, evidence spindle, cargo container, Dead Hulk, debris chunk |
| Wreck set | Aft engine, cockpit, cargo module, corvette turret, weapon spar, pressure tank |
| Equipment and geology | Gatling, dual turret, railgun, heavy cannon, lance, pulse cannon; generated common-rock variants used by the starter fields and rescue aliases |

These receive a presentation upgrade; this is not a claim that every source model was rebuilt.
The live painted planet retains its authored identity. The former station preview's procedural
fallback and empty bolt previews must not be mistaken for the shipping assets.

## Continue the art direction

1. Begin at normal play distance and establish the model's job: a cargo jaw, radiator, drive,
   work deck, rescue door, or weapon mechanism. Keep the silhouette and useful existing details.
2. Assign semantic roles in glTF extras (`spacefaceMaterialRole`) and descriptive material names.
   Paint, bare mechanisms, ceramics, glass and signal apertures need distinct response. Do not
   tag broad painted surfaces as signal merely because a small decal emits light.
3. Reuse an occupational palette where appropriate. A new identity belongs in `illustratedLivery.js`,
   not a unique shader program. Preserve original material names through cloning and batching.
4. Keep three detail scales: broad color blocks, joints/service features, then restrained wear at
   handling/contact/heat locations. Broad white roofs need purposeful color and panel relief,
   not a universal dirt overlay. Preserve texture color spaces and packed ORM channels.
5. If geometry needs work, improve the weakest visible component first. The larger service boats,
   Bastion and Massline liner have broad roofs that could support later authored panel grouping;
   the current material upgrade does not require replacing them. Keep their payload silhouettes.
6. Outside Helios, review the seven procedural faction builders beside admitted GLB traffic,
   then non-core stations/landmarks, uncommon geology, and equipment not encountered here.
   They inherit global lighting/post and applicable material treatment, but are not individually
   signed off by the first-sector review. Finish those comparisons before adding unique embellishment.
7. Keep forces distinct: compact projectile/core, driven beam, nozzle jet, folded wake, shield
   response, fragmenting impact and dust. Energy may be wild; retain a visible origin, a useful
   silhouette and a release phase. Do not make all effects the same cyan splash.
8. Review moving ships, shadow crossings, turning wakes and firing/mining with ordinary camera
   framing. Check reduced motion/flash. A shader unit test verifies composition, not beauty.

Use the existing [asset route](README.md) for actual geometry/export work, keeping source,
release metadata and runtime selection together. Keep the owner-directed scope ahead of dated
freeze language or rules that only protect an earlier aesthetic choice.

## Verification

Use focused material/clone/cache tests and a GPU check of both post routes. Test new rescue
bindings through the public visual factory. Run the playable route. Measure the same opening
on the owner's GPU with unchanged viewport and quality; take screenshots outside the timing
window. Record host load alongside p95 frame/render cost, because other agents share the machine.
The target is responsive 60 fps; a noisy window is not a clean performance certification.

The completed pass passed the focused material, shader-hook, palette, sky-buffer, rescue-binding,
and paint-override checks, the GPU post-route pixel comparison, and Electron playability 16/16
including save/reload. Baseline content checks were 15/15 green, but their 105 s run exceeded
the 90 s wall-time allowance under shared host load; that budget result is not a green gate.

Session review images are in `.devshots/tuneup/`; the pre-change owner-GPU window is in
`.devshots/runtime-witness/tuneup-before/`. These are local working evidence, not repository assets.

On the Intel integrated GPU at 1832x973, the final dense-combat sample measured timed GPU work
at 4.43 ms median / 11.05 ms p95 (42 complete retained query frames; compositor excluded).
Overall presentation still hitched: 30.2 ms p95 in the tail, with 84% host CPU use and 30.7/32.3 GB
RAM occupied. The opening also hitched (52.6 ms presentation p95), versus 20.1 ms before at a
different memory load. These windows do not establish a speedup, a regression attributable to
the art change, or clean 60 fps. Do not turn them into a quality-lowering rule.
