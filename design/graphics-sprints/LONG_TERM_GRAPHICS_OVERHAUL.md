<!-- LIFETIME: DURABLE -->
<!-- Long-lived architecture and evidence reference only. It cannot dispatch, prioritize, lease, or accept work; current implementation requires an admitted packet and candidate-bound evidence. -->
# Long-Term Graphics Overhaul

**Purpose:** durable architecture and evidence reference for bringing the complete player-visible
game to one professional visual bar. Its old build order and acceptance language is non-authoritative.

**Status authority:** this document does not dispatch, prioritize, lease, promote, or accept work.
Current order comes from `CANONICAL_BUILD_MAP.md` and an admitted queue packet; craft acceptance comes
from the visual-asset standard plus candidate-bound evidence. When this reference and live evidence
disagree, the live route, runtime maps, manifests, focused checks, and admitted packet win.

## 1. Outcome and quality bar

Deliver a cohesive presentation across flight, sectors, ships, stations, landmarks, rocks, wrecks,
equipment, effects, previews, and retail captures without degrading the best authored work already in
the project.

The finished system must:

- preserve or improve the strongest Kestrel, Wasp, Helios, place, station, and faction assets;
- show the exact intended authored identity before an entity is visible, targetable, interactive, or
  capable of player-facing action;
- keep each visible entity's origin, orientation, bounds, sockets, and semantic identity stable through
  interpolation, frame-origin changes, LOD/HLOD, instancing, residency, and save/Continue;
- make ships, stations, rocks, wrecks, weapons, and effects identifiable through construction, material,
  motion, and function rather than color swaps;
- give important sectors distinct composition, landmarks, depth, and localized illumination while
  preserving genuinely black space;
- make fitted equipment and curated appearance choices visible without sacrificing authored silhouettes;
- use one gameplay/render route for browser, Electron, probes, and packaged builds;
- scale through reusable profiles, Blender sources, deterministic generation, manifests, residency,
  LOD/HLOD, batching, and instancing rather than one-off renderer branches;
- improve performance by eliminating invisible work, allocations, redundant passes, fragmented resources,
  and late decoding instead of removing authored content or lowering default quality without evidence;
- finish every slice in a playable, independently verifiable state.

The bar is not “more noise.” At normal gameplay distance, hierarchical detail must communicate:

- **macro:** silhouette, massing, thickness, propulsion, weapon and utility zones;
- **meso:** plate overlap, recesses, access, vents, structure, machinery, radiators, sockets, and decals;
- **micro:** material grain, controlled wear, fasteners, welds, scratches, heat effects, and roughness
  response, filtered so they enrich rather than shimmer.

No post-processing pass may conceal unfinished silhouette, surfacing, lighting, or VFX. No Blender
turntable or source-pattern check alone proves game quality; the normal player camera is decisive.

## 2. Verified checkpoint facts and honest boundaries

The following facts were proven at the latest promoted graphics checkpoint. They are a floor to preserve,
not a declaration that the overhaul is complete:

| Vertical | Verified checkpoint fact | Still outside that proof |
|---|---|---|
| Starter ship | Borrowed Time / Kestrel V5 is the New Game and Continue starter, with one authored root and browser/hardware-Electron route evidence. | Appearance/customization truth across Shipyard, preview, save, and flight still needs a completed common resolver. |
| Authored admission | The accepted player route no longer publishes a blue-clay box or proxy before the authored starter. A 360-frame Kestrel stability run reported no root/composition failures. | The verifier must cover stations, rocks, wrecks, props, LOD/HLOD, instances, frame-origin changes, and natural encounter admission. |
| Thrusters and RCS | Kestrel has pooled, throttle-responsive core/plume/sheath/vapor layers and directional RCS; browser and hardware-Electron cruise/RCS evidence passed. | Spector/GPU-state receipts, dense scenes, and wider engine-family differentiation remain open. |
| Background | The accepted base restores black negative space and deterministic stars without full-screen blue haze or rejected ribbon/card overlays. | Localized authored nebular, dust, tidal, debris, planet, and anomaly compositions still need production and matched route review. |
| PBR substrate | Authored semantic roles bind during loading, and bounded role-specific compatibility maps prevent one universal shiny-plastic response. Dedicated Kestrel, Helios, and geology profiles exist. | Compatibility maps are not final surfacing. Frequent assets still need UV-aware authored materials, bevels, bakes, decals, and game-camera acceptance. |
| Palette routing | Materials can preserve native PBR color while hull, accent, drive, and selected structural roles remain palette-addressable. | Each family still requires value, identity, and material-sharing review under the live environment. |
| Helios | The retained three-LOD production station has function-specific PBR roles and controlled browser/Electron surface evidence. | Natural approach/undock motion, transform continuity, mip transitions, and station-specific performance remain open. |
| Geology landmarks | Seamed and graffiti landmarks have authored three-LOD geometry, semantic PBR roles, and accepted close/default/far browser evidence. | Electron parity remains open; these dressing assets must not be mislabeled as mineable asteroids. |
| Representative rock | `place_asteroid_rock_a` is authored and routed; accidental unmasked molten emission is suppressed and its geology response is nonuniform. | Mining-distance browser/Electron framing, positional stability, and truthful mining/drilling classification remain open. |
| Combat effects | Five mechanically distinct weapon families and phased small/ordinary/capital destruction passed normal-route browser motion, impact, dense-combat, accessibility, cleanup, and bounded-pool review. | Hardware-Electron parity, GPU-state capture, and further game-camera readability polish remain open. |
| Startup | New Game and Continue show a real loading presentation; isolated hardware Electron reached flight near the recorded three-second baseline. | Software-renderer startup and the first GPU submission remain measurable follow-up work; required first-frame visuals must not be deferred to improve a number. |

A generated asset, isolated preview, or focused test remains a candidate until its implementation is wired
to the default player route and survives the relevant browser/Electron, motion, accessibility, lifecycle,
and performance evidence. Merely creating or passing a local artifact never changes the table above.

### 2.1 Helios donor disposition

The captured donor audit rejected the then-current OpenCode Helios worktree as an asset replacement.
Its later release shortcut removed `LOD1`, `LOD2`, and `SOCKET_Structure_Core`, leaving roughly
1.02 million triangles active at every distance; its uncommitted texture set was also older and
heavier than the iteration-2 baseline reviewed in that audit. Preserve this as historical donor
evidence and refresh exact hashes, manifests, and current route acceptance before any reuse.

One donor technique is worth reimplementing in a dedicated optimization slice: its scratch Blender
candidate consolidates the full three-LOD station from 777 glTF primitives to 45 while preserving twelve
semantic PBR roles and the core socket. That candidate is not shippable as-is: it is about 228 MB and 1.64
million triangles, has no executed normal-route visual packet, loses authored anisotropy in glTF export,
and may expose repeated service-bay kit patterns at the game camera. Preserve the batching recipe as a
reference, then rebuild it against the accepted station, author genuinely reduced LOD geometry, package it
with the release compression path, and require matched approach/undock captures plus measured draw-call,
residency, and frame-time improvement before promotion.

## 3. Architectural decision: hybrid data-driven composition

Use Blender-authored assets where silhouette, construction, UVs, or material storytelling matters, and
procedural rendering where determinism, scale, and transience make it the stronger tool.

### 3.1 Authored assets

Blender-authored GLB/KTX2 assets remain the source of truth for hero ships, stations, landmarks, props,
rocks, wreck donors, reusable modules, and any surface whose construction is visible at the player camera.
Sources, generation steps, semantic slots, LODs, collision/interaction envelopes, exports, and validation
receipts remain reproducible.

### 3.2 Procedural presentation

Procedural systems remain appropriate for deterministic star distribution, transient particles, pooled
effects, scalable variation, and bounded compatibility layers. They must not impersonate a requested
authored identity or hide missing UV, geometry, or material work.

### 3.3 Declarative profiles

Profiles own artistic intent while runtime modules execute it:

- `SectorVisualProfile`: stars, localized structure, celestial composition, lighting inputs, exposure,
  grade, and dressing;
- `MaterialProfile`: semantic PBR roles, surface layers, tint eligibility, and emissive/exposure behavior;
- `ShipVisualSpec`: chassis, LOD family, sockets, slot policies, material channels, and damage bindings;
- `ShipAppearance`: persisted livery, paint, decals, wear, and allowed cosmetic choices;
- `VfxProfile`: socket-driven thrust, weapons, mining, shields, travel, hazards, damage, and accessibility
  variants.

Profiles must not become a second asset catalog. Exact manifests, release metadata, and runtime maps retain
asset-path authority.

### 3.4 Runtime ownership target

- `renderer.js` remains the render-loop facade, not the owner of every artistic decision.
- Environment direction coordinates the background, localized depth, scene lights, and post inputs.
- Asset loading/residency retains cancelable, reference-counted ownership.
- Runtime registration derives incrementally from validated manifest data rather than duplicated filename
  maps.
- Ship visual resolution, assembly, appearance, and instance pooling remain separate responsibilities.
- Entity-family decomposition follows characterization tests; it must not fork browser and Electron paths.
- Existing render paths remain until a replacement wins matched quality, correctness, and measured-cost
  comparisons.

## 4. Resolve, prepare, then admit

The normal route must never publish a placeholder silhouette and later swap it for the requested asset.
Use this contract:

1. **Resolve:** determine the exact visual identity, LOD family, appearance key, interaction descriptor,
   and required sockets from authoritative registry data.
2. **Prepare:** load and validate the exact asset and textures off-scene; normalize transforms and bounds;
   prepare material pipelines without publishing pixels.
3. **Admit:** publish one stable entity root only when the authored payload is ready.
4. **Share readiness:** visibility, targeting, interaction, and hostile action use the same admission
   receipt. A pending hostile cannot attack as a box, and a pending rock cannot offer misleading verbs.
5. **Preserve identity:** LOD/HLOD or instance changes may replace detail only when normalized origin,
   axes, scale, bounds, sockets, and interaction envelope match the admitted contract.
6. **Fail closed:** a real load failure produces an explicit diagnostic/retry state. It does not silently
   publish unrelated primitive geometry as the entity.

Initial flight and sector arrival gate the visible composition required for the first frame. Off-camera
streaming may continue after handoff only when it cannot alter an already-published identity.

## 5. Stable-transform and identity verifier

The stability verifier covers every visible family, not ships alone. For every sampled frame, record:

- entity and authored-identity keys;
- simulation pose and authoritative interpolated render pose;
- root world pose and visible-bounds center/extents;
- LOD/HLOD state and normalized pivot/bounds receipts;
- instance/batch owner and slot;
- asset admission/load state;
- frame-origin sequence;
- any authoritative gameplay teleport or sector transition.

A discontinuity beyond interpolation tolerance without an authoritative teleport is a failure, including a
single-frame excursion that returns immediately. The verifier must exercise ships, stations, rocks, wrecks,
props, instances, save/Continue, sector transitions, LOD boundaries, destruction, and context recovery.
Transforms, pivots, axes, object scale, sockets, collision bounds, and interaction envelopes are validated
at authoring/export time as well as at runtime.

## 6. Shared interaction descriptors

Visual identity and gameplay verbs must agree. A shared descriptor includes at least:

```js
{
  kind,
  mineable,
  drillable,
  salvageable,
  tetherable,
  destructible,
  scanLabel
}
```

Massline, mining beam, drill, scanner/HUD, targeting, salvage, impacts, and destruction resolve from the
same classification. A rock-shaped object must clearly read and behave as an asteroid, ore body, wreck,
volatile reactor, landmark, or other declared kind. Presentation supports the classification through
silhouette, material regions, markings, response, and effects rather than contradicting it.

This contract does not move mining or simulation authority into rendering. Gameplay owns the semantic
descriptor; rendering consumes it.

## 7. Layered PBR foundry

Principled BSDF is the default Blender authoring surface and must translate to the corresponding standard
or physical glTF response. Exceptions require a material role that genuinely needs another model. A base
color plus constant scalar roughness/metalness is not a finished major surface.

Each material role deliberately selects the layers its physical story needs:

- macro and meso base-color variation at role-appropriate physical scales;
- nonuniform roughness describing coating, handling, machining, heat, dust, scratches, and substrate;
- a fine micro-normal/bump layer plus a separate broader shallow-form layer where appropriate;
- truthful metalness and exposed-substrate masks, with AO/roughness/metallic packed according to the
  established runtime channel contract;
- function- and orientation-driven recess dirt, contact wear, heat staining, service markings, decals,
  and damage;
- small physical bevels on exposed manufactured edges so highlights describe construction at gameplay
  distance;
- distinct glass, paint, alloy, composite, machinery, ceramic, rubber, radiator, docking, repair,
  geology, regolith, mineral, and emissive responses.

Apply object scale and transforms before procedural generation, baking, tangents, or export. Noise
frequency, scratch width, panel scale, strata, fasteners, and bump strength are evaluated in physical
context; unrelated materials must not share identical ranges. Judge surfaces under a black-space-compatible
reflection setup with broad warm/cool sources and localized game lights so the material has meaningful
reflections without lifting the space background.

The foundry owns:

- Blender source and non-destructive audit scripts;
- semantic material slots and authored UVs;
- high-detail construction or source detail where required;
- base color, tangent-space normal, roughness, metallic, AO, emissive, optional glass, and damage/decal
  masks;
- deterministic source-map generation where procedural layers are appropriate;
- texture-role and color-space receipts;
- KTX2 conversion and glTF validation;
- source, release, and runtime manifest consistency;
- matched close, default-game-camera, maximum-zoom, and motion evidence.

Runtime-generated role maps are bounded compatibility coverage for incomplete UV-capable legacy assets.
They preserve complete authored maps, remain deterministic, and explicitly record that source remastering
is still required. UV-less or structurally weak assets return to Blender instead of receiving a misleading
shader-only pass. Texture dimensions follow projected texel density, filtering, residency, and measured
memory—not one prestige number for every asset.

## 8. Chassis and appearance model

Treat production whole-ship assets as authored **chassis**, not as the opposite of modular ships. Each
visible slot declares one policy:

- `integrated`: authored into the chassis and deliberately not replaced;
- `attachment`: renders the equipped part at a standardized socket;
- `optional`: selects allowed cosmetic geometry through appearance data;
- `hidden`: gameplay equipment without an exterior representation.

This preserves a hero silhouette while allowing weapons, cargo pods, utilities, engines, damage, trails,
and curated liveries to remain truthful. Player selection is explicit and deterministic; seeded part
variation is limited to declared NPC profiles.

Persist a bounded versioned appearance record beside each owned ship, for example:

```js
appearance: {
  version: 1,
  hullColor: null,
  accentColor: null,
  finish: 'worn',
  wear: 0.55,
  decalId: 'borrowed_time'
}
```

Old saves receive defaults through migration. Shipyard, preview, preload, flight, save/Continue, capture,
residency, instancing, and shader precompilation resolve the same appearance key. Appearance never mutates
shared materials in a way that leaks between entities.

## 9. Execution method

Each slice is a reversible vertical:

1. Characterize the current behavior and capture the reported defect.
2. Add a focused failing contract or regression test where behavior is machine-verifiable.
3. Implement the smallest complete player-facing vertical.
4. Run the owning checks before broad suites.
5. Capture matched browser and Electron views at normal gameplay distance; add close/far views only when
   they answer a specific question.
6. Inspect motion for transforms, LODs, texture cards, particles, temporal phases, and frame pacing.
7. Measure GPU/CPU/resource cost where the slice changes runtime work.
8. Review the diff and preserve an explicit rollback boundary.

Every completed slice leaves title, New Game, flight, dock, Shipyard/preview, save, and Continue runnable.
Generated release metadata is rebuilt, not hand-edited. Reduced-motion and reduced-flash modes preserve
useful feedback rather than simply removing it.

## 10. Ordered self-contained slices

### Slice 0 — Close identity admission, transform stability, and interaction truth

**Visible outcome:** intended assets appear once, remain spatially stable, and advertise the correct verbs.

Preserve the accepted starter route; extend admission/no-fallback contracts to NPC ships, stations, rocks,
wrecks, and props; broaden the verifier across transforms, instances, LOD/HLOD, save/Continue, and context
recovery; finish one shared interaction descriptor across mining, tether, targeting, scanner/HUD, salvage,
and destruction.

**Exit:** matched route video contains no placeholder, composition swap, unexplained position/bounds jump,
or object/verb disagreement; focused admission, stability, interaction, save, asset, browser/Electron, and
performance checks pass.

### Slice 1 — Close the current golden route evidence

**Visible outcome:** the accepted Kestrel, Helios, and representative geology survive natural gameplay,
motion, distance, and both runtimes.

Capture Helios natural approach and undock, the representative rock at mining distance, and the accepted
geology landmarks in Electron. Inspect transforms, scale, material response, mips, LOD transitions, draw
state, and target readability. Repair only observed defects and preserve the accepted three-LOD Helios.

**Exit:** browser/Electron matched captures and motion prove the goldens without harness-only camera tricks;
asset, release, reachability, stability, station, mining-distance, and measured performance checks pass.

### Slice 2 — Localized space depth and sector identity

**Visible outcome:** sectors are recognizable by composition and physical phenomena while most of the frame
can remain genuinely dark.

Keep a sparse neutral star field as the infinite base. Add profile-driven planets/moons, distant
silhouettes, landmark-aligned structure, debris, dust, tidal features, or nebular gas only where sector
identity calls for them. Preserve deterministic placement, stable parallax, single-pass/shared substrate
where justified, context restore, and gameplay silhouettes. Do not tint the same fog field per sector.

**Exit:** core, belt, fringe, and anomaly captures are compositionally distinct; black level, transition,
save/restore, visual-stability, overdraw, browser/Electron, and performance evidence pass.

### Slice 3 — PBR foundry closure and next frequent asset family

**Visible outcome:** the next most frequently seen weak asset family no longer reads as smooth clay/plastic.

Finish the reusable Blender/CLI audit, source-map, bake, KTX2, validator, manifest, and gameplay-camera
pipeline. Apply it to one coherent high-frequency family—common NPC ships, station modules, or common
rocks—using role-specific material scales and construction logic rather than Kestrel texture reuse.

**Exit:** reproducible sources and receipts exist; source/release/live paths agree; close/default/far and
motion evidence show meaningful material and construction improvement; validation and measured cost pass.

### Slice 4 — Chassis, fitting, and appearance truth

**Visible outcome:** one real fitting and one curated appearance choice remain identical across Shipyard,
preview, flight, save, and Continue without reducing Kestrel quality.

Complete `ShipVisualSpec` and `ShipAppearance` validation, save migration, stable keys, chassis slot policy,
socketed attachments, preview/runtime parity, and instance-safe material ownership. Do not reintroduce
random player-part selection or mutate shared materials globally.

**Exit:** unit, save/Continue, Shipyard, preview, asset, visual-stability, browser/Electron, and performance
checks pass with no silhouette, material, lighting, or animation regression.

### Slice 5 — Thruster/RCS family completion

**Visible outcome:** propulsion communicates throttle, engine architecture, maneuvering direction, and
ship identity without polygon cones, bead trails, or bloom-only shapes.

Preserve the accepted Kestrel substrate. Bind profiles to authored sockets; differentiate engine families
through plume structure and timing as well as palette; close dense-view, reduced-motion, reduced-flash,
GPU-state, lifecycle, and pooling evidence.

**Exit:** idle, acceleration, cruise, boost, turn/RCS, and multi-ship motion pass at the real camera on
browser and Electron with zero unbounded allocation or lingering-effect defects.

### Slice 6 — Weapon, impact, and destruction visual acceptance

**Visible outcome:** kinetic, rail, plasma, beam, and missile events are mechanically distinct, while small,
ship, and capital destruction have different temporal and material structure.

Repair projectile bodies, muzzle timing, trail behavior, shield/hull contacts, event lights, and phased
ignition/debris/cooling. Remove generic colored balls, reused circular flashes, primary expanding rings,
identical smoke puffs, and strobing sustained beams. Preserve target readability in dense combat.

**Exit:** matched firing/flight/impact strips and motion, dense-combat, accessibility, pooling/lifecycle,
Spector state, asset, flight, stability, and measured-performance evidence pass.

### Slice 7 — Ship, station, rock, wreck, and infrastructure families

**Visible outcome:** common families are recognizable by silhouette, assembly, material language, function,
and use history before the player reads a label.

Reuse strong assets as chassis or kit members. Produce missing family members through authored kits,
semantic roles, shared trim/detail resources where appropriate, and distinct functional wear. Finish Wasp
and Pelican candidates only when they beat current assets in normal-route and cost comparisons. Promote
each family through manifests and public routes.

**Exit:** sparse, normal, and crowded routes show coherent faction/manufacturer relationships without
repetition or color-only variation; source, manifest, LOD, release, live, reachability, stability, and cost
checks pass.

### Slice 8 — Render ownership and measured capability tiers

**Visible outcome:** capable hardware receives the strongest accepted presentation; constrained hardware
remains stable without silent identity swaps or unproven quality cliffs.

Separate environment, asset resolution, ship assembly, and pooling behind characterized contracts while
retaining one renderer facade and game route. Capability-gate only measured AO, bloom, grading, shadows,
resolution, and residency behavior. Validate context loss, resize, alt-tab, preview, startup, dense combat,
long-session lifetime, and memory.

**Exit:** matched quality comparisons plus startup, hitch, soak, memory, GPU/CPU attribution, browser,
Electron, and recovery evidence pass without deleting authored content to satisfy a budget.

### Slice 9 — Cohesion and retail acceptance

**Visible outcome:** flight, stations, Shipyard, maps, previews, menus, transitions, and store captures present
one finished visual system.

Make previews truthful to runtime resolution; complete map/scanner silhouettes and restrained HUD/world
integration; inspect the weakest link across the first-hour, combat, mining, travel, docked, sparse, normal,
and crowded routes; remove migration-only fallbacks after the accepted route proves them unnecessary.

**Exit:** relevant release, packaging, accessibility, localization, save/corruption, resize/alt-tab,
browser/Electron, and performance matrices pass, and current captures survive independent visual review.

## 11. Current validation surfaces

Use the narrow owner first. The current tree provides these primary checks:

### Asset admission, wiring, and stability

```powershell
npm run check:graphics:asset-receipts
npm run check:asset-status
npm run check:asset-reachability
npm run check:assets:live
npm run check:visual-stability
npm run check:kestrel:wholeship
npm run check:kestrel:normal-routes
npm run check:kestrel:electron-route
node --test test/authored-admission-no-visible-fallback.test.mjs test/authored-live-probe-contract.test.mjs test/runtime-asset-lod-policy.test.mjs test/ship-preview-authored-admission.test.mjs
```

`check:graphics:asset-receipts` and the four tests on the final line are closeout validation candidates;
they become checkpoint evidence only after promotion and execution on the integrated tree.

### Materials, places, and background

```powershell
npm run check:ship-material-sharing
npm run check:station-archetype-glb-load
npm run check:station-archetype-wiring
npm run check:helios-living-pocket
node --test test/authored-surface-tint.test.mjs test/rock-surface-library.test.mjs
node --test test/space-background-shared-geometry.test.mjs test/space-background-depth-occlusion.test.mjs test/sector-visual-profiles.test.mjs
```

### Thrusters and combat VFX

```powershell
npm run check:thruster:electron-route
node scripts/check-thruster-vfx-pack.mjs
node scripts/check-sg08-render-vfx.mjs
node scripts/check-vfx-trail-bind.mjs
node --test test/vfx-additive-single-pass.test.mjs test/vfx-settings-runtime-truth.test.mjs test/vfx-save-restore-destroy.test.mjs test/vfx-accessibility-profile.test.mjs
npm run check:vfx-sleep
node scripts/check-combat-hit-vfx-pack.mjs
node --test test/combat-vfx-presentation-contract.test.mjs test/projectile-visual-family-shapes.test.mjs test/wreck-visual-identity.test.mjs test/visual-factory-no-blue-box-fallback.test.mjs
```

### Shared integration

```powershell
npm run check:camera
npm run check:flight:clean
npm run check:launch-policy
npm run check:sim:compare
npm run check
```

Add current browser and hardware-Electron screenshots and motion, accessibility comparisons, and measured
GPU/CPU/resource evidence appropriate to the slice. A green command cannot substitute for a missing
player-facing outcome.

## 12. Universal acceptance and non-goals

Every slice must preserve:

- a runnable title, New Game, flight, dock, Shipyard/preview, save, and Continue path;
- deterministic simulation and cosmetic-only render randomness;
- one browser/Electron gameplay and asset route;
- useful reduced-motion and reduced-flash feedback;
- strong authored visuals unless a replacement wins matched evidence;
- generated manifest/release truth rather than hand-edited output;
- a reviewed, reversible logical integration boundary.

This program does not authorize:

- an engine rewrite or per-sector bespoke renderer;
- full-screen haze, fog, bloom, or color grading used as environmental structure;
- primitive placeholders or wrong identities on a live route;
- universal material recipes, arbitrary asset ceilings, or indiscriminate grunge;
- post-processing used to hide weak assets;
- combinatorial customization built from pre-authored material variants alone;
- removal of authored content or lower default quality as an unmeasured optimization;
- replacement of strong assets merely to make architecture uniform;
- completion claims based only on files touched, Blender renders, worker reports, or static checks.

The overhaul is complete only when the current normal route proves stable authored identity, truthful
interaction, black-space depth, layered material response, professional motion/VFX, coherent asset families,
browser/Electron parity, accessibility, and measured performance across representative gameplay.
