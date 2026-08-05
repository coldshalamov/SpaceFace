# PQ-022 Navigation Infrastructure Material-Truth Preflight

Candidate-only dispatch: `PQ-022.billboard-buoy-reauthor`  
Authoring tier: `place_station_billboard` Tier B (repeated core-station infrastructure),
`place_memorial_array` Tier A (unique Helios hero landmark), and `place_nav_buoy` Tier B
(repeated navigation furniture)  
Component reference decision: `not_needed` — the canon and frozen interfaces provide a sufficiently
specific manufactured assembly sequence; no generated image is required for this pass.  
Preflight state: complete before geometry authoring. `allSupportedViewZonesClassified` is `true`:
all 27 final-epoch exact-source images were inspected at original resolution on 2026-08-04, with
the dispositions and hash binding recorded in `VISUAL_REVIEW.md`.

## G0 identity and frozen contract

| Asset | Live source | Live release | Frozen source identity | Frozen release identity |
|---|---|---|---|---|
| `place_station_billboard` | `assets/ships/parts/places/place_station_billboard.glb` | `assets/ships/release/parts/places/place_station_billboard.glb` | `557d5065d0435e3dc8128b4623135addf0b372d282ecb9f331e6a289b0d9ff7a`, 4,486,260 bytes | `598b130176e2e1b4b0bf89ec57cec7993e411ca548b28ac858dd04473f2c3098`, 6,658,368 bytes |
| `place_memorial_array` | New isolated identity; Helios `poi_memorial` currently collides with the shared billboard | New isolated identity | no predecessor | no predecessor |
| `place_nav_buoy` | `assets/ships/parts/places/place_nav_buoy.glb` | `assets/ships/release/parts/places/place_nav_buoy.glb` | `f1599e2f5ff47aca1bff2ff311f111bee9ce3ae076123b36eb71e32343ab7b4d`, 3,775,832 bytes | `c227ec86343f3105d312c4127daf4e2516ca45ac4a26e7fb27368ae308a02c20`, 5,570,068 bytes |

No active `authoring.__lock`, `release.__lock`, or `release.__building` signal was found. This lane
does not modify any live source, live release, manifest, runtime map, program document, or harness.

### Shared station display contract

- Live/runtime ID: `place_station_billboard`; asset ID: `SF_PLACE_HELIOS_SUPPORT_DOCK_ARM`.
- Frozen root: `SF_M4_HELIOS_DOCK_ARM_ROOT`; axes: `+X` forward, `+Y` up, `+Z` starboard; metre units.
- Frozen structure socket: `SOCKET_Structure_Core`, identity transform, forward `[1, 0, 0]`.
- Frozen LOD0 bounds: min `[-1.5, -1.2000000476837158, -1.5]`, max
  `[13.300000190734863, 1.850000023841858, 1.5]`; size
  `[14.800000190734863, 3.0500000715255737, 3]`.
- Frozen collision bounds: min `[-6.808000087738037, -1.4030001163482666, -1.3799999952316284]`,
  max `[6.808000087738037, 1.4030001163482666, 1.3799999952316284]`.
- Candidate role/title corrects stale donor prose from “dock arm” to faction-neutral core-station
  information and traffic infrastructure. It is explicitly not the Candle Fleet.
- Candidate/mirror: `assets/ships/m5_navigation_infrastructure/{source_candidates|release_candidates}/material_truth_v2/places/place_station_billboard.glb`.
- Editable source: `assets/ships/m5_navigation_infrastructure/blender/source/material_truth_v2/place_station_billboard.blend`.

### Memorial Array contract

- New live/runtime ID: `place_memorial_array`; asset ID: `SF_PLACE_MEMORIAL_ARRAY`.
- New root: `SF_PLACE_MEMORIAL_ARRAY_ROOT`; axes: `+X` forward, `+Y` up, `+Z` starboard; metre units.
- Structure socket: `SOCKET_Structure_Core`, identity transform, forward `[1, 0, 0]`.
- Initial LOD0 bounds intentionally match the existing memorial POI framing: min
  `[-1.5, -1.2000000476837158, -1.5]`, max
  `[13.300000190734863, 1.850000023841858, 1.5]`; size
  `[14.800000190734863, 3.0500000715255737, 3]`.
- Candidate collision starts with the same non-mesh helper placement/bounds contract as the prior
  POI representation so a later owned integration can preserve route scale without hiding a change.
- Candidate/mirror: `assets/ships/m5_navigation_infrastructure/{source_candidates|release_candidates}/material_truth_v2/places/place_memorial_array.glb`.
- Editable source: `assets/ships/m5_navigation_infrastructure/blender/source/material_truth_v2/place_memorial_array.blend`.

### Navigation Buoy contract

- Live/runtime ID: `place_nav_buoy`; asset ID: `SF_PLACE_HELIOS_NAV_SPIRE`.
- Frozen root: `SF_M4_HELIOS_NAV_SPIRE_ROOT`; axes: `+X` forward, `+Y` up, `+Z` starboard; metre units.
- Frozen structure socket: `SOCKET_Structure_Core`, identity transform, forward `[1, 0, 0]`.
- Frozen LOD0 bounds: min `[-1.399999976158142, -5, -1.399999976158142]`, max
  `[1.5749999284744263, 10.300000190734863, 1.399999976158142]`; size
  `[2.9749999046325684, 15.300000190734863, 2.799999952316284]`.
- Frozen collision bounds: min `[-1.368499994277954, -7.038000106811523, -1.2879999876022339]`,
  max `[1.368499994277954, 7.038000106811523, 1.2879999876022339]`.
- Candidate/mirror: `assets/ships/m5_navigation_infrastructure/{source_candidates|release_candidates}/material_truth_v2/places/place_nav_buoy.glb`.
- Editable source: `assets/ships/m5_navigation_infrastructure/blender/source/material_truth_v2/place_nav_buoy.blend`.

## Canon and narrative dossiers

### Shared core-station display

The nested place instructions establish why this asset must remain generic: shared place art is
correct for ordinary infrastructure, while bespoke art is earned only when a named landmark must not
read as a repeat. `src/systems/world.js::_spawnCoreDressing` places `place_station_billboard` beside
up to two stations in every core-palette sector and names each instance from the adjacent station.
The current long grey beam fails even that generic role because it has no dominant information face,
traffic orientation, maintainable screen assembly, or credible support structure. It also cannot
carry the Candle Fleet story without repeating a unique memorial at unrelated stations.

`ART EXTRAPOLATION:` The replacement is a standardized station-approach information gantry used by
multiple operators. Its broad face carries arrival lanes, docking status, local cautions, and public
service data supplied at runtime; the asset itself contains no faction crest, named memorial, fixed
advertisement, or story-specific count. Two deep display bays occupy the long face rather than one
perfect luminous rectangle. A center break, vertical mullions, and visor-like upper hoods give the
screens physical depth and keep glow from reading as a pasted plane. The screen glass is smoke-dark
when unpowered. Light comes from restrained edge guides and small status cells seated inside the bay,
so the frame still reads when emission is disabled.

The gantry is built like field-replaceable traffic hardware. A dark folded rear backplate resists
micrometeoroid strikes. Formed frame rails wrap that plate and terminate in cast end shoes that carry
loads toward the structure socket. Three rear service trunks distribute power and data; their doors
have hinge/latch logic rather than decorative rectangles. A narrow amber service strip marks the
maintainer side, never the whole face. One offset inspection cassette supplies asymmetry and tells a
mechanic where the most recent replacement occurred. The shared unit may be tinted by scene lighting,
but its authored material identity stays faction-neutral.

From one metre, the player should see screen recess depth, gasket lips, mullion fasteners, backplate
folds, service doors, and cable bridges. At approximately 120 pixels, the player should see a wide
framed display with two dark-glass information fields, a clear face/back distinction, and an
understood mounting spine. At far range it compresses to a long display-and-frame silhouette, not a
concrete beam. Its memorable construction cue is the center service bridge interrupting the paired
screen bays. Its manufacturing signature is folded backplate plus cast end shoes joined by formed
rails. Its service-history clue is one newer access cassette and local contact wear around its latch.
It must never resemble the Candle Fleet, a war memorial, a blank beam, an unframed emissive plane, a
commercial logo, a toy television, or a random cyberpunk sign.

### The Candle Fleet / Memorial Array

Canon establishes the object more precisely than its legacy filename. `src/data/flavor/080-landmark-lore.js`
names the Candle Fleet at the Helios Memorial Array: twenty-four flames burn, a recovered hull forms a
dark plinth, families paid for the candles, and Concord maintains the flame while converting damage
into ledger entries. `docs/worldbuilding/story/PLACE-IDENTITY-GAP-FILL.md` calls it a lattice monument
and “licensed mourning,” the one place Helios allows grief to remain visible. The Helios world sheet
adds that ordinary graffiti is painted over within forty-eight hours. The object therefore cannot read
as advertising, a cargo beam, or generic cyan signage.

At approach distance the first read is a long, low reliquary: a dark salvaged keel fragment bearing a
precisely maintained frame of twenty-four warm points. The lights must be countable in a close still and
must merge into a deliberate amber constellation at normal distance. The recovered hull is not a clean
plinth poured for the ceremony. Its upper edge is a cut ship section with a shallow crown, clipped
shoulders, one repaired scarf plate, and load-transfer feet. Its mass stays compositionally quiet so the
candles dominate, but its planes and seams still explain that it once carried stress. No glow is painted
onto the plinth. With emission disabled, every candle remains a recessed optical cassette seated in a
formed bezel and backed by service structure.

`ART EXTRAPOLATION:` Helios maintenance crews receive a replacement cassette under a serialized
service programme. The families funded the fixtures; Concord funded a powder-coated support lattice
that can be unbolted quickly and logged. That produces a deliberate friction: warm memorial glass and
aged bronze name rails sit inside cool, immaculate institutional framing. The plinth itself is left in
dark conversion coat, with abrasion only on cut edges and support contacts. One scarf repair on the
right third records an old fracture without turning the monument into pirate scrap. Technicians reach
the lamps from the rear through two long service trunks and small latch plates; power enters at the
structure core and branches along the frame, so the lamps never float on a decorative slab.

From one metre, the player should see rolled bezel lips, shadowed lens recesses, bronze registry bars,
frame cleats, and the dull grain of recovered hull coating. At roughly 120 pixels, those details collapse
into three unmistakable facts: a framed memorial array, twenty-four warm lights, and a dark load-bearing
plinth. The memorable asymmetry is the scarfed plinth shoulder and its replacement cleat. The
manufacturing signature is a cold-maintained rectangular lattice with chamfered cast corner shoes. The
service-history clue is a single newer frame segment whose finish is less faded, not random universal
scratching. It must never resemble an advertisement, roadside billboard, blank beam, toy light board,
glowing plane, or generic cyberpunk panel.

### Faction-neutral navigation buoy

The live data reuses `place_nav_buoy` across Tethys, Vesta, Io, Ashfall, and frontier regions, and the
world system also spawns it as belt-survey, flickering-nav, and Quiet-nav furniture. No single faction
can own its silhouette or color. `docs/worldbuilding/orgs/factions-CANONICAL.md` makes navigation and
beacon space bureaucratically contested: scans, logs, and names travel farther than the operators who
installed the hardware. The buoy must therefore look like durable, standardized lane infrastructure
that local crews can service, repaint, or partially neglect without changing its shared identity.

At distance it reads as an attitude-stabilized vertical instrument, not a post with a glowing cap. In
zero-g, “self-righting ballast” would be false terrestrial logic. The lower third is instead a protected
inertial-control assembly: orthogonal reaction-wheel drums in a damped gimbal cage, four shock struts,
clear service gaps, and a load-transfer shoulder around the structure socket. The middle is a visible
service-and-power spine with opposed battery packs, cable saddles, a recessed access trunk, and a
narrow clean structural line. The upper third
opens into a four-face navigation head whose hooded optical apertures point along cardinal local
directions. A crown antenna and two short telemetry vanes complete the silhouette without exceeding the
frozen envelope.

`ART EXTRAPOLATION:` Multiple yards manufacture compatible buoy cassettes around one old Concord lane
standard. The main shell is a pale neutral ceramic-filled coating over formed aluminum, chosen for
thermal stability rather than faction display. Exposed load collars, reaction-wheel housings, and the
gimbal cage are dark cast alloy. Photovoltaic laminates are blue-black and segmented only where cells physically divide.
Service marks are restrained amber at tow and access contacts. The local optic uses a cool
cyan-white emission because it must remain readable under every sector palette; the material stays
recessed under a hood and the head still reads with emission disabled. Paint loss follows tow lugs,
gimbal service contacts, access fasteners, and the prevailing service side rather than every convex edge.

From one metre, a mechanic finds captive fasteners, a power-bus cover, cable clamps, replaceable optic
cassettes, reaction-wheel access covers, gimbal bearings, dampers, cast collar parting lines, and one
service-side marking plate. At normal play size the buoy retains a broad lower stabilizer cage, thin
middle spine, and widened multi-face head. That large-to-small-to-large rhythm supplies scale and
attitude-control logic. The memorable asymmetry is one offset service
trunk and its cable run. The manufacturing signature is a stack of faceted load collars rather than
smooth toy toruses. The service-history clue is wear concentrated on the marked access face. It must
never resemble a lamp post, single cylinder, faction flag, glowing disk, smooth plastic bottle, or a
pile of decorative rings.

## Production translation

### Shared station display

Macro imperatives:

1. Long framed display remains inside the exact shared billboard envelope and root placement.
2. Two recessed dark-glass information bays form the dominant read without fixed story or faction art.
3. A folded rear backplate, cast end shoes, and center saddle show how the span is carried.
4. Rear power/data trunks and a center service bridge make the display maintainable with emission off.
5. One offset replacement cassette adds service history without making the repeat visually noisy.

Meso zones: paired screen cavities; upper visor rails; lower sill rails; center mullion/service bridge;
cast end shoes; folded backplate; rear vertical ribs; three service trunks; cable bridges; status-cell
recesses; maintainer-side marking strip; central structure-core saddle. Clean rest area remains across
the dark display glass and broad backplate panels. Detail concentrates at mullions, end loads, and rear
access points.

### Memorial Array

Macro imperatives:

1. Long, low framed reliquary stays inside the exact legacy envelope and root placement.
2. Twenty-four recessed lights form the dominant broadside read; no emissive advertising plane.
3. Dark recovered-hull plinth visibly carries the frame and remains readable with emission disabled.
4. Rear service trunks and lattice feet root every light bank into the structure socket load path.
5. One repaired shoulder introduces history without disturbing the clean memorial rhythm.

Meso zones: recovered keel/plinth; two end shoes; upper and lower frame rails; three intermediate
frame stations; twenty-four bezel/lens cassettes; bronze registry rails; rear power trunks; cable
bridges; scarf repair and cleat; central structure-core mounting saddle. Clean plate is reserved on the
plinth flanks between the repair and supports. Dense construction is limited to light bezels, frame
joints, and rear service access.

### Navigation Buoy

Macro imperatives:

1. Preserve the exact tall envelope and origin while replacing the featureless post silhouette.
2. Broad inertial stabilizer cage, narrow service spine, and widened head make the attitude-control load path visible.
3. Four hooded apertures make navigation role readable from multiple approach directions.
4. Battery/solar and cable architecture explain power and service without faction livery.
5. LOD1 and LOD2 retain stabilizer-spine-head rhythm and the primary emissive anchor.

Meso zones: orthogonal reaction-wheel drums; damped gimbal cage; four shock struts; service-clearance
gaps; load-transfer shoulder; lower cast collar; central structural spine; opposed battery boxes;
photovoltaic faces; offset service trunk; cable saddles; upper cast collar;
four-face signal head; recessed optic apertures; crown mast; telemetry vanes; tow/service marking
plate. Quiet plate remains on the pressure shell and stabilizer housings. Detail concentrates at access,
load transfer, and sensor interfaces.

## Exhaustive visible-zone register and material bill

| Asset / visible zone | Disposition | Supported views | Dominant | Material truth / retained review evidence |
|---|---|---|---|---|
| Shared display formed frame and cast end shoes | billed | all display views | yes | Formed aluminum rails with cool neutral coating and distinct cast load shoes; controlled edge families and local contact wear; forbids one-piece plastic bezel or blank beam. |
| Shared display paired screen bays | billed | front 3/4, side, emissive-off | yes | Smoke-dark laminated glass recessed behind gasket lips and visors; restrained edge/status emission only; screen remains visibly deep when dark; forbids luminous plane or fixed advertisement. |
| Shared display folded rear backplate | billed | rear 3/4, side, emissive-off | yes | Folded coated sheet with quiet plate, return flanges and rooted ribs; broad low-sheen response; forbids concrete slab, random panel grid, or floating strips. |
| Shared display service alloy/trunks | billed | rear 3/4, side | no | Machined/cast neutral alloy at hinges, latches, cable bridges and center saddle; directional response and access wear; forbids decorative greeble bars. |
| Shared display safety marking/status cells | billed | front/rear 3/4, emissive-off | no | Non-faction amber service strip and finite recessed status cells; no story-specific count or name; forbids livery takeover and emissive trim everywhere. |
| Memorial recovered hull plinth, shoulder and feet | billed | front 3/4, rear 3/4, side, emissive-off | yes | Salvaged ship steel; cut/faceted and scarf-repaired; dark conversion coating; broad low-sheen response, abrasion only at cuts/support contacts; forbids clean plastic slab and random edge wear. |
| Memorial maintained frame rails/stations | billed | all memorial views | yes | Formed aluminum box sections with cast corner shoes and controlled cool coating; bolted to plinth saddle; crisp grazing highlights with moderate roughness; forbids one-piece toy bezel and uniform soft bevel. |
| Memorial candle bezels and optics | billed | front 3/4, rear 3/4, emissive-off | yes | Twenty-four replaceable glass/ceramic optical cassettes in rolled service bezels; warm light recessed behind lens; dark/readable cavity with emission off; forbids luminous plane, floating disks, or uncountable noise. |
| Memorial service alloy, trunks and cleats | billed | rear 3/4, side, emissive-off | no | Machined/cast nickel-aluminum hardware; captive fasteners and power runs; directional finish and contact wear; forbids decorative greeble bars. |
| Memorial bronze registry rails | billed | front 3/4, side, emissive-off | no | Etched silicon bronze strips mechanically fixed to frame; aged warm metal, no emission; forbids sticker decals or gold plastic. |
| Buoy coated pressure shell and spine cover | billed | all buoy views | yes | Formed aluminum with pale ceramic-filled neutral coating; access-side wear and clean quiet planes; forbids faction recolor, smooth plastic tube, or quilted panel noise. |
| Buoy inertial stabilizer and load frame | billed | front/rear 3/4, service side, stabilization close, emissive-off | yes | Orthogonal reaction-wheel housings inside a damped gimbal cage with shock struts, service gaps, shoulder and collar transitions; dark cast alloy with wear only at access contacts; forbids terrestrial ballast, square pedestal, or stacked toruses. |
| Buoy navigation head and optic apertures | billed | all buoy views | yes | Four replaceable hooded sensor cassettes with recessed glass; cool restrained emission; visible cavity/hood/load frame when dark; forbids glowing cap, ring, or faction beacon color. |
| Buoy photovoltaic/battery assemblies | billed | front/rear 3/4, side | no | Segmented blue-black photovoltaic laminate over removable cold plates and opposed battery cases; brackets and cable roots visible; forbids pasted dark rectangles. |
| Buoy service markings, trunk and cables | billed | front/rear 3/4, side | no | Amber non-emissive access/tow marking on a discrete service plate; rubber-jacketed routed cable held by saddles; forbids floating stripe and universal grunge. |

Every visible zone across all three candidates is listed. There are no inherited candidate surfaces and no
`outside_supported_view` zones. Final exact-source review must set the completeness flag.

## Shape-grammar audit

| Deficient baseline form | Fictional function/load | Manufactured final profile | Rooted interface / retention decision |
|---|---|---|---|
| Shared billboard long rectangular beam | Core-station information and traffic display | Folded rear backplate carrying paired recessed screen bays inside formed rails | Rooted through central saddle and cast end shoes; perfect donor beam is not retained. |
| Shared billboard tiny cyan cap | Finite information/status presentation | Two smoke-glass bays plus small hooded status cells | Screen cavities, mullion and gasket lips replace the cap; no fixed story count survives. |
| Shared billboard pasted blocks | Maintainable power/data and load distribution | Rear trunks, cable bridges, service doors, end shoes and fastened cleats | Joints occur only at load/service interfaces; generic blocks are not retained. |
| Memorial POI shared-ad silhouette | Unique Candle Fleet monument | Dark recovered-hull plinth carrying a framed 6-by-4 light lattice | New `place_memorial_array` identity resolves the silhouette collision; no shared billboard identity remains. |
| Memorial luminous surface risk | Twenty-four family-funded memorial flames | Countable recessed cassettes with rolled bezels, dark cavities and rear service trunks | Each cassette seats in frame structure and survives emissive-off review; no luminous plane is retained. |
| Memorial plinth primitive risk | Recovered convoy hull fragment and load plinth | Clipped faceted keel section with crown, scarf shoulder, support feet and quiet plate | Rooted through central saddle and end shoes; perfect rectangular slab is rejected. |
| Buoy plain post | Service/power spine carrying head and stabilizer loads | Narrow faceted spine with collars, opposed battery cases, trunk and saddles | Continuous load/data path from structure socket through stabilizer shoulder to head; smooth donor post removed. |
| Buoy square base | Zero-g inertial attitude stabilization | Orthogonal reaction-wheel housings in a damped gimbal cage with four rooted shock struts and visible service clearance | Centered on structure core; no terrestrial pedestal or ballast fiction retained. |
| Buoy purple cap | Multi-direction navigation head | Four hooded recessed apertures around a framed head plus mast/vanes | Head mounts through an upper cast collar; glowing cap removed. |
| Repeated rings | Load transfer and service separation | Segmented collars with brackets and clear section changes | Only manufactured collars remain; no decorative perfect torus survives. |

## LOD, evidence, and gate boundary

- Measured live render-geometry baselines are `976 / 413 / 180` triangles for the shared billboard
  and `1284 / 520 / 222` for the buoy. Older `1581 / 2038` stamp totals include broader contract
  geometry and are not treated as LOD0 render counts. The new memorial has no same-ID baseline.
- Each asset has three separately authored, strictly decreasing LOD representations. Ceilings are
  approximately LOD0 `<= 3000`, LOD1 `<= 1000`, LOD2 `<= 300` triangles unless an exact measured
  form defect justifies an increase.
- LOD0 preserves full construction; LOD1 preserves the display frame/screens, memorial
  plinth/frame/light count, or stabilizer/spine/multi-face head; LOD2 preserves macro silhouette and emissive anchor without fine
  service parts.
- Exact-source offline renders are one bounded same-epoch 1600x900 set: shared-display front/rear
  three-quarter and matched emissive-off; memorial face/count, front three-quarter, rear-service
  three-quarter, end/load-path, top, and matched emissive-off; buoy full three-quarter, service side,
  top/head, four-azimuth head contact sheet, stabilizer close, and matched emissive-off. Every asset
  also receives material-ID, hard grazing-light, one named LOD1 distance (`26.5 m` display/memorial,
  `27.2 m` buoy), and one far LOD2 view. These are exact-source candidate diagnostics, not runtime H1.
- G0 can be proven in this candidate lane. G1/G2/G4 receive candidate-side exact-source evidence but
  remain separate from independent acceptance. G3 records deterministic generated UV/material maps.
  G5 records per-asset structural cost only; representative repeated-scene performance is not owned.
  G6 Browser/Electron/live admission and G7 independent acceptance are not claimed here.

## Final exact-source disposition

The fifth and final build completed one coherent export/reimport/render/report epoch. Exact-source
inspection accepted all three candidates as `keep` for candidate-side G1, G2, G4, and matched
emissive-state evidence. The navigation buoy's initially closed stabilizer shoulder was revised into
an open cruciform yoke and four-strut cage because the closed shell hid the reaction-wheel, gimbal,
and damper logic from every exterior view. Its whole-asset cameras were widened to retain both ends;
the named LOD1 view remains at exactly `27.2 m` with a `29 mm` lens.

| Asset | Candidate SHA-256 | Measured LOD triangles | Exact-source disposition |
|---|---|---|---|
| `place_station_billboard` | `d86365e3129b638c1c985c482fe3c5834d9769d8cb9211dee2e68bc06ee529ad` | `2168 / 788 / 136` | `keep` |
| `place_memorial_array` | `fd18cf6619f9847d2afa898929f73bdbb682b5a1d61e507eaf0866b6471b43b9` | `2816 / 932 / 180` | `keep` |
| `place_nav_buoy` | `c5dbebc188329dd35c15613aef864d20293e54c24537f356b3c78e8e5d1e3ac4` | `1640 / 952 / 292` | `keep` |

All three exact envelopes, roots, sockets, five-material bills, zero-triangle collision-helper
contracts, and byte-identical candidate/release-candidate mirror pairs passed. This closes only the
candidate-authoring review boundary; live promotion, route acceptance, representative repeated-scene
performance, and independent acceptance remain outside this dispatch lane.
