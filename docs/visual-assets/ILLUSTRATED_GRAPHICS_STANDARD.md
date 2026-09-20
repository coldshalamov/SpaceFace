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

Helios is the **Amber Estuary**: the original luminous spiral galaxy and ringed planet sit above
a quiet navy flight corridor, with restrained ochre and petrol-blue painted dust around them.
The painting is a low-strength supporting layer (0.16), not a replacement for the older sky.
Fine stars and occupied orbital hardware sit at different depths. Weapons and thrust remain
the brightest, fastest events in the picture.

## Shared implementation

| Layer | Current owner and treatment |
|---|---|
| Surface light | `src/render/illustratedSurface.js`: compress irradiance before mapping it into soft illumination bands, retaining a small continuous component; blue-violet shadow pools, warm light, and geometric ink contour on diffuse light. Specular and emission remain outside the contour. AO and texture detail survive. |
| Fleet paint | `src/render/illustratedLivery.js`: occupational palettes bound as material uniforms at authored admission. Low-chroma painted texels receive pigment, keeping their spatial texture variation; saturated markings and excluded material roles retain their color. Pigment carries its own value rather than being normalized into white roofs. Yard Tug and Bastion use deeper body values. Explicit player paint in `partsLibrary.js` overrides the default pigment. |
| Hull construction | Real recesses, open frames, layered plates, equipment bays, glazing, barrel bores and torn sections are authored into first-sector GLBs. Materials carry `spacefaceRemasterGeometry: true`; `authoredMaterialProfiles.js` then disables the earlier synthetic hull-layout wells on those surfaces. `illustratedHullLayout.js` remains a fallback for older models. Never double the fake relief over modeled construction. |
| Substance | `src/render/industrialMaterialFamilies.js` and `authoredMaterialProfiles.js`: shared role response for all admitted authored models, refined by exact original material names. Original names survive batching, so stencils and exposed armour do not silently become hull paint. Factors derive from a stored baseline and never compound. |
| Lighting | `src/data/sectors.js`, `sectorVisualProfiles.js`, `spaceReflectionEnvironment.js`: warm directional keys, cool rim/planet bounce, broader reflection cards. Existing lights, PMREM and shadow map are reused. |
| Post | `src/render/bloom.js`: four nearby HDR samples pool dark pigment at solid-object creases, followed by derivative ink, hue-preserving HDR shoulder and bounded colored bloom. Empty sky and hot cores bypass pooling. Both production routes share this GLSL; HUD is outside it. This costs four extra texture taps on solid pixels, not another full-screen pass. |
| Sky | `spaceBackground.js` and the shipping `deepFieldDesign.js` composite the Amber Estuary painting in the existing background pass. Aspect-correct cropping, global-coordinate parallax and sector fades preserve composition. `deepFieldStars.js` supplies subordinate live stellar light; distant hardware is moved away from the planet silhouette. |
| Thrust | `contrailTrail.js`: eight folded sheets form four braids around immutable recorded history. `plasmaRibbons.js` uses twelve broader nozzle ribbons instead of twenty-eight thin ones, with seven vertices across each fold, colored dark backs and hot creases. Fewer overlapping sheets offset their richer cross-section. Recorded lifetime, length and emission rate remain intact. |
| Weapons/tools | Three curved fins form one shared 192-triangle projectile mesh, with cupped pulse lips, rolling plasma, slim ballistic bodies, forked induction and short concussion cups. The instanced pool sorts transparent bolts by camera depth with reused scratch buffers and still submits one draw. `toolConduit.js` gives extract, cut, repair and transfer distinct folded filaments through the existing two draws. Reduced motion freezes decorative animation; reduced flash controls rapid brightness modulation; travel remains intact. |
| Impacts and forces | `combat/transientVfxMaterials.js` separates cool soot from warm combustion. Shield contacts use scalloped glass edges; `forceLanguage/sweptSurfaceBatch.js` carries broader pressure folds with dark troughs and narrow hot creases. Existing pools, lifetimes and batches remain the owners. |
| Geology and procedural models | `objectSpaceGeology.js` and `visualFactory.js` give the five common rock forms broad structural faults, attached mineral response and quiet grain. Their 320-triangle silhouettes remain unchanged. Procedural faction ships and fittings inherit the same surface-light language. |
| Rescue props | `visualOverrides.js`: the opening distress/rescue payload uses the existing rescue capsule; the rescue exit uses existing lane hardware at a 14 WU visual radius. Simulation zones and explicit asset overrides retain their meaning. |

Surface layouts add shader arithmetic and uniforms, without another material pass or per-frame
traversal. The asset-coordinate attribute aliases the existing position buffer for merged release
packages; transformed source pieces receive a cached coordinate buffer. Liveries/layouts share
one shader family. The painted sky adds one texture fetch in Helios's existing composite and
about 8 MB of GPU texture residency, reported separately by `SpaceBackground.stats()`. No new
dynamic lights, outline pass or reduction in shipping resolution/population is required.

## First-sector coverage

The current refactor replaces the earlier finish-only pass with component-level geometry work on
68 model families (86 GLBs including distance siblings), plus five common procedural rock shapes.
The [first-sector inventory](../../tools/blender/helios_remaster/INVENTORY.md) identifies every source,
its authoring recipe, and the remaining individual-model work outside Helios.
The release loader and shipping post/light profiles are used for visual review; the actual flight
route remains the integration check. A candidate GLB is not shipped until source, compressed release,
pilot binding and compiled render package agree.

| Family | Inspected first-sector assets |
|---|---|
| Player and principal traffic | Kestrel/Hitch, Helios Lark, Cradle, Span, Arclight, Ashline Rig, Yard Tug |
| Civilian work | Survey Pin, Ore Barge, Repair Tender, Rescue Lifter, Prospector Skiff, Scrap Sweeper, Apron Shuttle, Salvage Cutter, Volatiles Tanker, Massline Express Liner |
| Authority, convoy and hostiles | Inspection Cutter, Wasp, Hornet, Bastion, Drifter, Mule, Atlas, Warden; faction Span/Wasp kits and Ashline Dart/Lode/Corsair variants |
| Stations and navigation | Trade Hub and Concord overlay, military station, jump ring, lane beacon/support gantry, Memorial Array/Candle Fleet |
| Lane furniture | Lane Pin, Tally Post, Claim Mark, Cold Locker, Ash Pin, Whistle |
| Rescue and cargo | Mining Drone, rescue capsule, evidence spindle, cargo container, Dead Hulk, debris chunk |
| Wreck set | Aft engine, cockpit, cargo module, corvette turret, weapon spar, pressure tank |
| Equipment and geology | Gatling, dual turret, railgun, heavy cannon, lance, pulse cannon; five common-rock variants and the surveyed seamed-rock landmark |

The table defines the first-sector scope, including conditional conflict traffic. All 86 source,
release and compiled-package bindings are integrated and hash-checked. The live painted planet retains
its authored identity. The former station preview's procedural fallback and empty bolt previews
must not be mistaken for the shipping assets.

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
5. Work on every visible component that fails its material or construction role. Cut actual bays,
   preserve disconnected source islands before boolean surgery, and make supports connect to
   their loads. Do not paste floating greebles onto an unchanged blank roof. Mark rebuilt materials
   with `spacefaceRemasterGeometry`. Liner ceramic paint is hull coating, glazing is glass,
   frame/keel/throat are mechanical, and wayfinding is signal. Wreck paint, soot, glazing and torn
   metal remain different materials. Rebuild from each recipe's pinned original source revision;
   running boolean surgery again on an already-remastered GLB compounds the damage.
6. Outside Helios, review the seven procedural faction builders beside admitted GLB traffic,
   then non-core stations/landmarks, uncommon geology, and equipment not encountered here.
   They inherit global lighting/post and applicable material treatment, but are not individually
   signed off by the first-sector review. Finish those comparisons before adding unique embellishment.
7. Keep forces distinct: compact projectile/core, driven beam, nozzle jet, folded wake, shield
   response, fragmenting impact and dust. Energy may be wild; retain a visible origin, a useful
   silhouette and a release phase. Do not make all effects the same cyan splash.
8. Review moving ships, shadow crossings, turning wakes and firing/mining with ordinary camera
   framing. Check reduced motion/flash. A shader unit test verifies composition, not beauty.
9. Build and package external LOD siblings; published `RENDER_PACKAGE_PILOTS` bindings are the live
   admission list, so a source file alone cannot become a blank distant ship. Derive the
   family from the selected visual file; gameplay chassis IDs may differ. A faction kit must keep
   its own livery at distance. Batch new detail by material role, simplify it for far LODs, and keep
   player LOD0. Refresh pilot scene-root bindings when an export adds top-level geometry siblings,
   or compilation can silently omit the new components.

Use the existing [asset route](README.md) for actual geometry/export work, keeping source,
release metadata and runtime selection together. Keep the owner-directed scope ahead of dated
freeze language or rules that only protect an earlier aesthetic choice.

## Runtime surfacing scope and sky source

This pass changes runtime surfacing, effect geometry and the first-sector ship/place geometry.
Useful source components and texture maps are retained; sockets, source axes and collision contracts
stay fixed. Material roles, root-space coordinates, LOD ownership and both package/source admission
paths are the integration seams. Models elsewhere in the universe inherit the global style; their
individual construction review remains future work.

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

The geometry pass passed 80 focused renderer/VFX checks, 18 final surface/distance-family checks,
and 17 storage/compiler checks. Model review used the shared shipping light/post fixture. Final
actual flight included native thrust and firing with the restored sky and remastered ships.
The final Electron playable route passed 16/16 checks, including save/Continue, native thrust,
visible authored hulls, shader compilation and asset requests.
All 86 source/release/pilot/package/runtime hash bindings agree, including fourteen newly packaged
distance siblings. Full integration, storage tradeoffs and known legacy validator failures are
recorded in the [inventory](../../tools/blender/helios_remaster/INVENTORY.md#integrated-storage-and-runtime-results).

At 1440×900 DPR1 on this machine's Intel integrated GPU, alternating live-shader timing measured
the new shadow treatment at about **0.44 ms**. A calmer settled-flight window measured **11.32 ms
median / 15.21 ms p95 GPU work**, with **16.8 ms p95 frame interval**. The busy thrust/fire window
measured **22.34 / 42.57 ms GPU work** and **100 ms p95 frame interval**; the nearby host-load sample
was 84% CPU with about 30.7/32.3 GiB RAM used. Both results matter. This is not a claim of locked
60 fps in heavy combat. Default viewport quality, population and authored visuals were retained.
All diagnostic bypasses were restored before the final moving-flight check.

Session captures and full timing samples remain in `.devshots/tuneup/` and
`.devshots/helios-remaster/`; they are local working evidence rather than shipping assets.
