<!-- LIFETIME: DURABLE -->
# Reusable SpaceFace asset bank: coverage and production inventory

Research snapshot: **2026-10-14**, checkout `48563578aa425c96bde03f5a243b194ef9c715e2`.
This is an asset-bank commission under the existing [graphics program](../program/GRAPHICS_PROGRAM.md)
and [asset families A–I](../program/world-depth-2026-10-02/ASSET_FAMILIES.md), not another gameplay queue.
The inventory below proposes **156 distinct reusable model entries plus 12 composition recipes**.
It does not claim those entries are built, promoted, visually accepted, or present in gameplay.
Production status belongs to the bank's actual manifests and the existing program owners.
The bank is reusable authoring-candidate content (primarily Tier C/D; large anatomy Tier B),
with no automatic runtime promotion.

## Recommendation

Build breadth around **compatible exterior infrastructure, readable operations, diverse handled
loads, matched aftermath, physical terrain, and large-place anatomy**. SpaceFace already has a
substantial fleet and station roster. Another set of recoloured hulls, random rocks, generic crates,
or free-floating greebles would miss the largest reusable-content gaps.

The first 36 entries commission structural, fluid and docking interfaces intended for assembly. They turn existing
whole industrial props into a vocabulary other agents can compose. Parallel production can build
operations and cargo without changing the shared Forge kit. The terrain and large-place batches
follow the same interfaces. Large compositions are intentionally included in the first bank; this
must not become an endless micro-prop exercise.

Counting rule: a mirrored copy, palette swap, LOD, export format, random seed, and ordinary open/closed
transform are not another model. A useful load-bearing shape, distinct handling interface, or authored
fracture anatomy is. Compositions are counted separately from their constituent meshes.

## What already exists

### Exact source inventory

The current [parts manifest](../../assets/ships/parts/parts_manifest.json) contains **197 rows**:
101 places, 52 whole-ship entries, 10 hull parts, 7 greebles, 6 engines, 6 fins, 6 weapons, 4 pods,
3 cockpits and 2 gear parts. These are registry rows, not 197 unique authored experiences: some are
LOD members, old accessory hulls or derivatives. The [Forge registry](../../tools/blender/forge/fleet.json)
contains **147 recipe entries**: 80 place-layout, 52 NPC-layout and 15 player-layout. Layout is an
export contract; it is not proof of gameplay category or availability.

The August [visual catalog](../graphics-sprints/VISUAL_ASSET_CATALOG.md) and September counts in the
graphics program are useful historical routing, but their old counts and missingness claims are not
today's inventory. Source rows do not prove successful default-route loading. This research inspected
manifests, selected recipes and runtime source; it did not visually certify every existing model or
bulk-read the binary asset tree.

### Reuse suitable in scope, with consumer verification before integration

- **Whole stations:** trade hub, refinery, mining, fabrication, military, research, black market,
  jump gate, and trade-hub faction overlays. Build complementary frontage and modules, not replacements.
- **Industry:** `place_conveyor_truss`, `place_conveyor_barge`, `place_drill_platform`,
  `place_extraction_mast`, `place_freight_platform`, `place_radiator_bank`, `place_slurry_tank`,
  `place_transfer_arm`, `place_maintenance_gantry`, `place_container_rack`, `place_scrap_cage`, and
  `place_improvised_dock`. These are designed whole props. For example, the conveyor is a driven,
  enclosed ore bridge with return strand and supports, not a bare structural truss segment.
- **Claims/navigation:** six claim-outpost bodies; lane beacon, nav buoy, sensor mast, worklight tower,
  transponder gate and interdiction buoy. Reuse their recipes and interfaces instead of commissioning
  another generic beacon/mast set.
- **Cargo/handling:** standard cargo pod, cargo container, 47-A evidence spindle and rescue capsule,
  Anvil condensate pod and storm orchard; Ceres section cradle, cutter head, long plate/crossbeam/keel,
  SP-07 and breakaway fork. Preserve their named story and gameplay roles.
- **Wrecks/landmarks:** dead hulk, debris, Ceres bait wreck/grave shard, Wasp bow/aft fragments,
  Quiessence freighters, Candle Fleet, Resonant Cathedral and Skerris Throne. Wreck Cathedral and
  Asteroid Works are existing older-pipeline bodies, not absent assets.
- **Routing pieces:** `place_works_conduit_lane_*` and `place_works_conduit_power_*` already cover
  straight, corner, tee, cross, junction and end, **12 existing board-routing pieces**. New pressure
  pipes and exterior lattice connectors have different physical interfaces; do not relabel the
  existing twelve as newly authored models.
- **Rocks:** three ordinary authored rocks, seamed/graffiti forms, Forge's deterministic rock helper,
  and current rock/metal/crystal/exotic/ice surface paths. New geology must add cut/contact/clearance
  anatomy, not merely more seeds.

### Existing reusable authoring machinery

[Forge](../../tools/blender/forge/FORGE.md) already provides lofts, plates, boxes, cylinders, nozzles,
annuli, trusses, ladders, beams, sweeps, rocks, dishes, containers, lights and designed greebles.
[Skin](../../tools/blender/forge/skin.py) supplies seated hardware;
[wreck kit](../../tools/blender/forge/wreck_kit.py) supplies deterministic cuts, wounds, torn flanges,
frame stubs and damage treatments. Extend this system through recipes; do not create another primitive
engine or revive runtime bolt-ons on Forge ships.

There is also a **legacy donor bank** at
`assets/ships/foundry/fleet_breadth_20260720/`:

- [47 micro-pieces](../../assets/ships/foundry/fleet_breadth_20260720/kit/kit_manifest.json) across
  14 families: access panels (3), armor spacers (3), gussets (4), recessed fasteners (4), hatch frames
  (3), heat shields (3), pipe clamps (3), plate lips (3), split rails (4), rivet strips (5), sensor
  housings (3), vent grids (3), weapon collars (3), weld seams (3).
- [20 scenery pieces](../../assets/ships/foundry/fleet_breadth_20260720/scenery/scenery_manifest.json):
  battery masts (2), hoppers (2), dishes (2), container stacks (3), gate rings (3), lane beacons (3),
  nav buoys (2), wreck fragments (3).

These use pre-Forge `KitMat_*` materials. Their manifest presence establishes donor geometry, not
current material compatibility or runtime readiness. Prefer Forge's present helpers; adapt a donor
only when its actual shape earns reuse. Do not bulk-wire this older bank.

### Represented procedurally, not missing from the game

[Fauna and growth](../../src/render/faunaVisuals.js) already have differentiated procedural builders,
including nerve lace, collars, lungs, chimneys and dead crowns. [Ancient-machine data](../../src/data/precursorMachines.js)
and its renderer already represent kinds and sites. Batch D is **authored, reusable anatomy and
host/contact variants**, not a claim that ecology or ancient machines are blank IDs. It must preserve
[ecology taxonomy](../alien-ecology-program/02_FAUNA_AND_HOST_TAXONOMY.md) and
[precursor-machine canon](../alien-ecology-program/07_PRECURSOR_MACHINE_LAYER.md). Adventure ecology,
Swarm Brood, rogue Foundry machines and ancient machines remain distinct families.

## External bank comparison: borrow coverage, not models or style

Primary pages checked on 2026-10-14:

| Official catalog | Verified coverage | Useful lesson for this bank |
|---|---|---|
| [Kenney Space Kit](https://kenney.nl/assets/space-kit) | 3D; **150 files**; planet/ship/space tags; CC0 | A useful space library spans more than ships. The page counts files, so do not call this 150 unique models. |
| [Kenney Modular Space Kit](https://kenney.nl/assets/modular-space-kit) | 3D modular; **40 files**; station/tile/space tags; animation and variations; released 2026; CC0 | A relatively small compatible module set can supply many combinations. Interfaces and use examples matter. |
| [Quaternius Ultimate Space Kit](https://quaternius.com/packs/ultimatespacekit.html) | **92 models**; characters, enemies, vegetation, planets and more; FBX/OBJ/Blend/glTF; CC0 | Include environmental scale and life, not just hard-surface vessels. SpaceFace should use its own canon instead of importing unrelated creatures. |
| [Quaternius Modular Sci-Fi Megakit](https://quaternius.com/packs/modularscifimegakit.html) | Page counter **277 models**; description 270+; grid-based modular walls/floors/doors/columns/props/aliens; Source edition includes optimized collisions and engine implementations | Model count becomes useful through fit, collision, material roles and implementation. Do not imply the free tier includes all 277 or its Source-edition support. |

The [creator's Megakit distribution page](https://quaternius.itch.io/modular-sci-fi-megakit) independently
confirms the tier distinction and modular/collision features. No external models, textures or code
were downloaded or incorporated for this coverage document. Low-poly pack aesthetics are not a new
SpaceFace direction; the existing Neon Industrial Look remains authoritative.

## Shared contract for every producer

### Size and assembly

Proposed **authoring sizes**, not new gameplay-radius policy:

- XS: 0.2–2 m, mounted hardware; visible at close zoom or as a purposeful grouped silhouette.
- S: 2–8 m, cargo and service components.
- M: 8–32 m, working machinery and ordinary infrastructure spans.
- L: 32–128 m, large structural pieces and district anatomy.
- XL compositions: 64–240 m overall; preserve readable routes and deliberate voids.

Use metre units. A practical first interface set is 2 m square structural truss cross-section,
4/8 m span increments, 4 m pressure-corridor diameter, and explicit small/large pipe bores. These are
new bank conventions to record in its manifest, not claims of an existing universal game grid.
Avoid arbitrary non-uniform scaling to make interfaces fit. Existing dimensions win at adapters.
Forge authors +X forward/+Y port/+Z up; GLB/runtime becomes +X forward/+Y up/+Z starboard.
Runtime body-radius normalization must apply consistently to the assembled object; separately
normalizing every child will destroy matched socket spacing.

Each entry needs stable identity, source recipe, actual dimensions/bounds, intended family and use,
material slots, mount/pivot, sockets, collision policy, LODs, state capability, and source/release
provenance. These are consumer facts in the bank's manifest, not a second game-state registry.

- Structure: `SOCKET_Join_A/B` plus branch joins as needed; socket positions lie on mating faces.
- Fluid: `SOCKET_Pipe_In/Out`, branch connectors, diameter/interface metadata, and base mount.
- Dock/habitat: `SOCKET_Dock_Approach`, `SOCKET_Berth`, `SOCKET_Airlock`, service connection and clear
  approach envelope where relevant. Preserve existing gameplay socket names at adapters.
- Power/service: `SOCKET_Mount`, `SOCKET_Power_In/Out`, observation/working axis where relevant.
- Handling: `SOCKET_Hoist_Center`, `SOCKET_Clamp_Dorsal`, `SOCKET_Tether_Massline` or the established
  consumer's exact names, plus load center. Sockets must touch physical attachments.
- Terrain/mechanisms: matched cut faces, fixed supports, moving pivots and allowed sweep limits.

**Exporter caveat:** current `_add_sockets` in
[forge_export.py](../../tools/blender/forge/forge_export.py) uses `SOCKET_ROLES` or default +X for
socket-forward metadata rather than each custom `s.socket` direction. Producers must verify exported
orientation and declare limitations; integration must repair/test shared orientation support before
promising fully automatic arbitrary-direction mating.

### Shape, materials, LOD and collision

- Design for the 60-degree top-down camera: plan outline, negative space, a dark mechanical layer,
  restrained identity bands, and attached structure. Side-only detail is not a substitute.
- Use [Forge finishes](../../tools/blender/forge/FORGE.md) and [the Look](../../docs/visual-assets/LOOK.md).
  Lacquer paint/paint2/stripe/hazard; bare/gunmetal for metal; ceramic/stone for dry surfaces;
  deadmetal for truly dark wrecks. Reuse shared textures. Paint does not emit. No per-model noisy
  texture sets, global grime spray, or indiscriminate cyan strips.
- Geology uses geological surfaces; organic growth needs supported tissue/membrane anatomy and
  appropriate semantic surfaces, not green hull plating. Ancient apparatus follows restrained
  pale/dark precise forms, not human hazard-striped salvage machinery.
- Working targets: XS about 0.5–3k triangles, S 2–8k, M 4–15k, L 10–35k; composed landmark bodies
  about 40–100k where appropriate. These are planning estimates, not quality ceilings or assertions
  of measured runtime cost. Existing manifest/publish constraints still apply.
- Preserve primary outline and contact geometry through all LODs. Use `s.detail` for close hardware;
  Forge's approximate 40%/18% LOD ratios are a starting point, followed by inspection. Socket,
  collision, pivot and gameplay dimensions must not vary with visual LOD.
- Consolidate static meshes by finish; do not merge independently moving/damageable parts. Small
  repetition should instance/batch instead of creating hundreds of independent materials/bodies.
- **Important collision trap:** Forge's default `COLLISION_HULL` is one convex hull, reduced toward
  300 faces. It can fill an arch, ring, fork or docking cavity. Build traversable compositions from
  separate solid components or use the existing compound/planar collision path with real holes.
  Test approach and exit, not just an outer bounding box. Do not create a render-only passage.
- Source bank membership does not justify loading the whole bank. Compose explicit dependencies;
  measure cold admission, warm draws, material/texture residency, leave/return and crowded-scene cost.

## Five disjoint production batches

The labels below identify inventory rows, not new runtime IDs or dispatcher tasks. Producers own
separate recipe/output paths. One integration owner manages shared Forge support, registry rows,
release manifests, package/census generation, top-level index and publication.

### A. Structural, fluid and dock interfaces — 36 models

**Scales:** S–M. **Family fit:** D/E/I. **Purpose:** a recognisable open lattice, pressure network and
habitat spine that agents can extend without hiding joins. **Class:** new reusable interfaces;
reuse Forge construction helpers and adapt existing attachment names.

| Group | Exact pieces, in order | Interface and silhouette |
|---|---|---|
| A01–A12 Structure | short truss span; long truss span; 90-degree truss corner; truss tee; truss cross; 45-degree truss elbow; truss rise adapter; octagonal structural hub; flange coupler; bulkhead mount; terminal cap; telescoping truss sleeve | Common end face; exposed load path, visibly different junction outline; sleeve has a motion pivot/axis. Existing conveyor is reused as an end consumer. |
| A13–A24 Fluid/thermal | straight pressure pipe; 90-degree pipe elbow; 45-degree pipe elbow; pipe tee; pipe cross; bore reducer; isolation valve; twin manifold; pipe end cap; pump skid; heat-exchanger cassette; expansion bellows | Matched bores and flange planes; valve/manifold/pump identifiable from above; inlet/outlet/branch sockets. Existing slurry tank and radiator bank remain endpoints. |
| A25–A36 Dock/habitat | straight pressure corridor; corridor elbow; corridor tee; corridor cross; blank habitat end cap; windowed observation end; docking collar; airlock vestibule; berth jaw; loading bridge; escape-capsule cradle; service umbilical | Shared pressure interface plus distinct dock/service clearances; meaningful top-view window/door/brace forms. Capsule cradle fits the existing capsule rather than replacing it. |

Short/long trusses have purpose-authored bay counts and load proportions, not duplicate scale exports.
Do not duplicate Asteroid Works' lane/power routing pieces.

### B. Operations, utilities and mounted service anatomy — 36 models

**Scales:** XS–M. **Family fit:** A/D/E. **Purpose:** communicate what an installation does and which
part moves, receives power or performs work. **Class:** new assembled components; existing helper
or donor geometry may be adapted without multiplying exports merely to raise the count.

| Group | Exact pieces, in order | Interface and silhouette |
|---|---|---|
| B01–B12 Power | rectangular solar wing; radial solar petal; solar hinge/mast adapter; battery cassette; capacitor drum; transformer skid; switchyard busbar; distribution cabinet; induction coil; reactor containment shell; coolant-fin cassette; power-junction saddle | Distinct fan/panel/coil/bank silhouettes; mount and power sockets; solar hinges and thermal vanes keep pivots. Coolant cassette complements, not replaces, the radiator bank. |
| B13–B24 Mechanisms | sliding bulkhead leaf; bulkhead guide rail; hinged vent vane; piston ram; paired capture jaws; rail carriage; launch sled; ejector stop; cargo turntable; retractable bollard; clamp shoe; gantry swivel pedestal | Authored moving groups, sweep bounds and fixed supports. The jaw pair is one entry, not two mirrored-model credits. No invented gameplay actuation; consumers own transforms. |
| B25–B36 Service | narrowband antenna blade; phased-array tile; optical rangefinder; docking-light bar; status-signal housing; exclusion baffle; sensor iris; camera pod; fire-suppression head; robotic tool changer; hose caddy; repair-tool tray | Mounted heads rather than another complete mast; forward/aim axis plus mount socket. Top-facing lenses, broad panels and silhouettes survive the actual viewing angle. |

Reuse `place_sensor_mast`, worklight tower, transfer arm and maintenance gantry as hosts. A whole
existing prop is not a missing module simply because it lives in a different folder.

### C. Cargo, handling and aftermath — 36 models

**Scales:** S–M, a few XS supports. **Family fit:** A/E/I. **Purpose:** infer mass, fragility, custody,
containment and handling method before reading a label. **Class:** new payload silhouettes and
matched damage derivatives. Regular/damaged states share source ancestry.

| Group | Exact pieces, in order | Interface and silhouette |
|---|---|---|
| C01–C12 Payloads | cryogenic Dewar; gas-bottle cluster; ore skip; bagged-regolith pallet; machine-tool skid; inert reactor-core cask; fragile habitat-panel pack; biological-containment cage; insulated medical carrier; sealed custody safe; sample carousel; wound-conductor spool | Tank, bundle, open bulk, wrapped mass, irregular equipment, shielded cask, thin fragile stack and carousel have genuinely different shells. Shared hoist/clamp/tow interface, not twelve crates with labels. |
| C13–C24 Handling | twin-tank cradle; irregular-load V cradle; hoist spreader; four-point sling frame; tether fairlead; tow-bridle yoke; magnetic handling shoe; docking bumper; fork receiver; rail cargo dolly; load-restraint hoop; transit pressure-cap cover | Load paths visible; actual attachment points and support surfaces; V cradle and tank saddle match the intended payload class. |
| C25–C36 Aftermath | torn hull strip; peeled armor corner; split pressure-vessel half; fractured drive bell; snapped truss node; buckled solar wing; severed umbilical; broken docking-collar arc; exposed avionics tray; punctured cargo cage; scavenged pipe bundle; crumpled shield louvre | Derive through Forge/wreck tools; fresh fracture faces and retained recognizable anatomy. Coarse collisions and optional recovery sockets; cosmetic fragments stay pooled rather than becoming automatic rigid bodies. |

Standard cargo pod, evidence spindle, rescue capsule, dead hulk, Wasp fragments and Ceres salvage
remain reusable existing models. New custody/medical/containment shells are generic physical assets,
not new story assertions, quest items or changes to established cargo definitions.

### D. Physical geology, host growth and ancient structures — 36 models

**Scales:** S–L. **Family fit:** E/F/G/H/I, with canon-specific use. **Purpose:** provide route-changing
shapes, seated life and precise machine apparatus instead of another circle of generic debris.
**Class:** adapt existing natural/procedural representation into reusable authored contact anatomy;
new structural component entries where absent. No new species or civilisation is introduced.

| Group | Exact pieces, in order | Interface and silhouette |
|---|---|---|
| D01–D12 Cut geology | seam-bearing quarried parent rock; matched removable wedge; stepped fracture shelf; bore plug; bored rock collar; rock bridge span; cleaved slab; rubble berm; ice pressure ridge; split ice plate; crystal fan; metallic-vein rib | Stable cut-face pairing, scan/contact/support sockets; broad cleavage and clearance, not random seed variety. Parent/wedge remain identifiable after separation. Geological materials retain present surface families. |
| D13–D24 Host growth | nerve-lace corner; branching nerve mat; calcified pipe collar; ribbed vent lung; spore-chimney stalk; short tendril bridge; arched tendril bridge; supported cyst nest; hull-leech attachment bed; root anchor pad; severed tendril stump; dead crown | Host-side mount and seated contact surfaces; lace/roots hug real machinery, bridges carry explicit endpoint span; torn stump is authored anatomy. Existing procedural growth remains intentional until a consumer deliberately adopts a compatible piece. |
| D25–D36 Ancient apparatus | threshold jamb; threshold lintel; shutter vane; repair-face tile; sealed vault seam; quarantine-pylon foot; prism-instrument mount; dormant machine rack; measuring rail; boundary vane; service plinth; ossuary-spine segment | Precise shared seams/joints and large negative space; repair/measurement boundaries are readable. Use existing machine-site semantics; no humanoid creator reveal or new faction war. |

Growth is Adventure ecology by default. Sharing a shape technique does not authorize relabelling
these as Swarm Brood. Ancient apparatus does not become rogue Foundry hardware through a palette swap.

### E. Large-place anatomy and reusable landmark compositions — 12 models + 12 recipes

**Scales:** L / XL. **Family fit:** D/E/G/I. **Purpose:** let a district read from a distance and provide
real approach, occupation and passage spaces. **Class:** twelve distinct large components plus
explicit assemblies of existing and bank pieces. An assembly is not another set of copied meshes.

| Group | Exact pieces, in order | Interface and silhouette |
|---|---|---|
| E01–E12 Large components | drydock side wall; drydock end buttress; capital-berth outrigger; habitation-ring quadrant; ring spoke; pressure-dome habitat; agricultural cylinder; fabrication-hall shell; ice-anchoring terrace; ore-transfer terrace; relay-dish backframe; launch-trench bank | Structural joins, docking/camera/operation anchors, optional moving leaves; one large silhouette idea each. Ring/hangar openings require truthful compound collision, not one convex closure. |
| E13–E24 Composition recipes | customs inspection pen; salvage custody court; relief berth; open repair quay; screened illicit intake; solar orchard hub; bulk-coolant exchange; freight-rail transfer yard; survey cut-face worksite; quarantine-transfer platform; derelict rib corridor; ancient service threshold | Explicit dependencies and placed instances, exact total bounds, empty approach/exit lanes, focal anchor and three purposeful working/occupied/after-use arrangements where supported. Adapt to existing station/site owners; these are descriptive templates, not new canonical named landmarks. |

Reuse the existing stations and landmark exemplars for scale and context. A new assembly must
contribute a readable macroform and usable space; placing identical boxes around a hub is not closure.
The full customs/salvage/relief operating behavior remains with the corresponding gameplay owner.

## Common connected-use acceptance example

Every batch must participate in at least one actual assembled example, not just export loose GLBs.
Use explicit references to source entries and transforms; a contact sheet with objects side by side
is not assembly proof.

1. **Structure:** connect one truss tee to two spans and an end cap, then mount a solar hinge/wing
   or service payload on the remaining branch. The three exposed routes should read in top view.
2. **Fluid:** connect straight pipe → elbow → valve → pump or exchanger, with one adapter into an
   existing tank/radiator interface where compatible. Check actual end planes and bore sizes.
3. **Habitat/handling:** join corridor → docking collar, seat a payload in its appropriate cradle,
   and place a hoist or clamp on the declared attachment. Demonstrate an unblocked approach and exit.
4. **Terrain/large scene:** place the matched cut wedge in its parent, remove it using the declared
   transform, and show the resulting route/contact change; or assemble two drydock walls around a
   berth with honest clearance. Organic/ancient components should be seated on a real host or seam.

For each example, validate socket pairs coincide within a declared small metre-scale tolerance,
connection normals oppose with a compatible up axis, uniform scale is preserved, attached geometry
is supported, and no unexpected body intersection closes a passage. Test the same joins after GLB
load and at every visual LOD. Record actual member IDs and measured bounds. For moving components,
verify stowed and extended states with the declared pivot and swept clearance. Use an appropriately
sized ship/collision probe through intended openings, not just a rendered gap. Scene consumers must
retain the original authoring transforms; per-child radius normalization is not a valid workaround.

## Delivery and integration

1. Each producer delivers its named model entries, editable/replayable source, local bank manifest,
   and a labelled preview/contact-sheet aid. Report exactly which pieces and states exist. Do not
   mark a model accepted from polygon counts or a successful exporter alone.
2. Demonstrate assembly with real joined neighbors and existing endpoint props. Inspect the top view
   and the 60-degree gameplay view in both bright and dark Look moods. Check clear approaches,
   supported loads, visible material zones, no floating parts and no z-fighting. A first-person
   corridor kit or Blender-only studio render is not adequate evidence for this game.
3. Preserve native source → parts → release → render-package conventions. The bank can hold candidate
   reusable source, but its directory is not a new runtime loading system. Promote selected bodies
   through Forge with stable `assetId`/`partId`, parts rows, `PLACE_FILES`, pilot/release/package and
   census; call bank availability and default-route integration separate facts.
4. Model-only workers must not concurrently edit shared manifests or the exporter. The integration
   owner validates registry identities, sockets, LOD selection and collision, then packages coherent
   batches. No new global queue or automatic gameplay spawning is introduced.
5. Use applicable parts-manifest, render-package, asset-reachability and model-truth checks. For
   map-visible placements follow [PLACE_REGISTRATION](../../src/data/PLACE_REGISTRATION.md), including
   nonzero-sector-origin tests and existing Atlas proxies; never load a full hero mesh as a map mark.
6. Publish authored source, manifests and reusable outputs durably to GitHub in owned pathspec commits.
   Source/release provenance and readable usage examples matter more than a ZIP. ZIPs may supplement
   the repository but are not the durable destination or proof of game integration.

The first bank is complete when its **156 named models and 12 composition recipes** can be found,
loaded, joined and reused without guessing dimensions or material/collision contracts, with honest
per-entry validation and promotion state. Filling the world with those assets is a subsequent
consumer operation inside the existing canon and gameplay owners.
