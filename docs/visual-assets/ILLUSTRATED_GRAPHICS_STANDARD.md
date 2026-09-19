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

Helios is the **Amber Estuary**: a diagonal sweep of ochre and petrol-blue painted dust above a
quiet navy flight corridor. A small stellar formation, fine stars, the existing ringed planet and
occupied orbital hardware sit at different depths. The planet remains the landmark; the sky is
the setting. Weapons and thrust remain the brightest, fastest events in the picture.

## Shared implementation

| Layer | Current owner and treatment |
|---|---|
| Surface light | `src/render/illustratedSurface.js`: four softened illumination values; cool shadows/warm light; geometric ink contour on diffuse light; specular and emission remain outside the contour. AO and texture detail survive. |
| Fleet paint | `src/render/illustratedLivery.js`: occupational palettes bound as material uniforms at authored admission. Low-chroma painted texels receive pigment, keeping their spatial texture variation; saturated markings and excluded material roles retain their color. Pigment carries its own value rather than being normalized into white roofs. Yard Tug and Bastion use deeper body values. Explicit player paint in `partsLibrary.js` overrides the default pigment. |
| Hull detail | `illustratedHullLayout.js`: asset-space dark service channels, inset equipment wells, relief-shaded louvres, panel joints, cream shoulders and job-specific markings. Work craft use safety combs; patrols swept chevrons; habitats radial districts; rectangular docks access corridors; jump gates aperture segments; guns barrel collars; wrecks charred fracture ends. Fine detail fades before becoming subpixel noise. |
| Substance | `src/render/industrialMaterialFamilies.js` and `authoredMaterialProfiles.js`: shared role response for all admitted authored models, refined by exact original material names. Original names survive batching, so stencils and exposed armour do not silently become hull paint. Factors derive from a stored baseline and never compound. |
| Lighting | `src/data/sectors.js`, `sectorVisualProfiles.js`, `spaceReflectionEnvironment.js`: warm directional keys, cool rim/planet bounce, broader reflection cards. Existing lights, PMREM and shadow map are reused. |
| Post | `src/render/bloom.js`: restrained derivative ink and luminance grouping, hue-preserving HDR shoulder, bounded colored bloom spill. Both production post routes use the same shared presentation GLSL. HUD is outside the filter. |
| Sky | `spaceBackground.js` and the shipping `deepFieldDesign.js` composite the Amber Estuary painting in the existing background pass. Aspect-correct cropping, global-coordinate parallax and sector fades preserve composition. `deepFieldStars.js` supplies subordinate live stellar light; distant hardware is moved away from the planet silhouette. |
| Thrust | `contrailTrail.js`: eight broad folded sheets form four braids around immutable recorded history; seven vertices across each sheet give the fold a real cross-section. `plasmaRibbons.js` and `driveForge.js` compress the nozzle jet into bright shock cells with a short hot core. The wake carries colored folds, not a uniformly white tube. Recorded lifetime, length and emission rate remain intact. |
| Weapons/tools | `projectileGeometries.js` gives energy rounds three curved, folded fins; `energyBoltPool.js` concentrates heat at the projectile head. `toolConduit.js` uses three folded filaments with distinct extract, cut, repair and transfer shapes and transport. The existing two tool draws use uniform endpoints instead of CPU vertex uploads. Reduced motion stops the weave and transport; reduced flash dims their power. |
| Procedural models | `visualFactory.js` installs the same surface-light treatment after existing geology/material hooks. Common rocks keep their authored maps, mineral fields and five silhouettes. Procedural faction ships and fittings inherit the light language too. |
| Rescue props | `visualOverrides.js`: the opening distress/rescue payload uses the existing rescue capsule; the rescue exit uses existing lane hardware at a 14 WU visual radius. Simulation zones and explicit asset overrides retain their meaning. |

Surface layouts add shader arithmetic and uniforms, without another material pass or per-frame
traversal. The asset-coordinate attribute aliases the existing position buffer for merged release
packages; transformed source pieces receive a cached coordinate buffer. Liveries/layouts share
one shader family. The painted sky adds one texture fetch in Helios's existing composite and
about 8 MB of GPU texture residency, reported separately by `SpaceBackground.stats()`. No new
dynamic lights, outline pass or reduction in shipping resolution/population is required.

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
5. Improve the weakest visible component first. The first-sector service boats and Bastion now
   receive broad panel grouping, dark channels and relief-shaded equipment wells at runtime.
   Future geometry authoring can replace that detail with real recesses where silhouette or
   close-camera use warrants it; avoid doubling the shader layout over newly authored features.
   The Massline liner's release material names also require corrected roles: CeramicPaint is
   hull coating, Glazing is glass, Frame/Keel/Throat are mechanical, and Wayfinding is signal.
   The runtime admission handles this now; carry it into source extras at the next model export.
   The same applies to `wrk_*` aftermath packages that declared every material mechanical:
   paint is hull coating, scorch is matte soot, and glazing is glass. Keep torn edges metallic.
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

## Runtime surfacing scope and sky source

This pass changes runtime surfacing and effect geometry. Existing ship/place GLBs, texture maps,
packed ORM channels, sockets, source transforms and collision bounds are reused. Material roles,
root-space coordinates and both package/source admission paths are the preflight seams. This is
an art pass over the listed first-sector families, not certification of every Blender source or
every model elsewhere in the universe. Individually reviewed families are listed above.

`assets/background/helios-amber-estuary.png` is an original 1672×941 runtime painting generated
with the built-in image generation tool on 2026-09-19, then used unchanged. No external reference
image was supplied. Direction/prompt: a wide 16:9 gouache/rotoscope interstellar estuary, only
distant dust and gas against midnight navy; layered graphic silhouettes with Prussian blue,
petrol teal, ivory and ochre lit edges. A sinuous diagonal arch crosses the upper field and
branches toward the lower right. Keep the center and lower left quiet for combat, brightest
areas sparse, edges dark. Exclude planets, ships, text, UI, large stars, lens flares, symmetric
spirals, generic purple nebulae, photographic noise and soft airbrush blobs. Existing live stars,
planet art and 3D structures supply the other depths.

## Verification

Use focused material/clone/cache tests and a GPU check of both post routes. Test new rescue
bindings through the public visual factory. Run the playable route. Measure the same opening
on the owner's GPU with unchanged viewport and quality; take screenshots outside the timing
window. Record host load alongside p95 frame/render cost, because other agents share the machine.
The target is responsive 60 fps; a noisy window is not a clean performance certification.

The deeper pass verifies material roles and cloning, mixed quantized/float batching, hull-coordinate
admission, tool endpoints/release/accessibility, plume history, projectile geometry, sky crossfades
and rebases, and authored-model publication. Live inspection covers the listed models plus thrust,
firing, all four tool verbs, reduced motion/flash, shield contact and explosion presentation.
The model fixture uses the real release loader; the moving effect check uses the live VFX owner.

Session images are in `.devshots/tuneup/`; dense-combat measurements are in
`.devshots/runtime-witness/helios-art-refactor/`. These are local working evidence, not repository assets.
At 1832×973 on Intel integrated graphics, that window measured GPU work at 12.45 ms median /
26.64 ms p95 (16 complete retained query frames; compositor excluded), with 50 ms foreground
frame-interval p95. Host CPU was 86% busy and memory use 29.7/32.3 GB; late asset/shader admissions
also occurred. This is not a clean 60 fps result or an isolated measure of the new art's cost.
Do not turn a noisy window into a reason to remove the authored picture.

An alternating GPU-timer comparison on one fixed six-model scene isolates the hull layout branch:
24 frames per state, no disjoint timer or runtime errors, 1440×900 on the same Intel GPU. Layout
enabled measured 51.68 ms median; disabled 50.96 ms (about 0.72 ms difference). The heavy inspection
scene's absolute time is not gameplay performance. The comparison indicates that hull-detail
arithmetic alone does not explain the dense-combat timing change; it does not certify total frame pace.

The shared-tree baseline was 11/15 green: failures were in concurrent tether/massline work and
simulation hash envelopes, with additional contention timeouts. Graphics checks passed; do not
re-record those simulation goldens to conceal unrelated changes.
Electron playability finished 16/16 green, including new game, visible authored hull, thrust,
save/Continue, shader compilation and asset requests. The first attempt caught a concurrent
world-owner edit before its helper function had been written; the completed source passed.
