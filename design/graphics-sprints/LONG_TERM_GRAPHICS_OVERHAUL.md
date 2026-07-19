# Long-Term Graphics Overhaul

- **Status:** RECOVERABLE DONOR CHECKPOINT COMMITTED — VISUAL ACCEPTANCE REJECTED; NOT MERGE-READY
- **Branch:** `codex/graphics-overhaul`
- **Worktree:** `C:\Users\93rob\Documents\GitHub\SpaceFace-graphics-overhaul`
- **Base revision:** `9921f1a0abce9ccd2b12aa748f56b0c0e4779259`

**Program relationship:** Implements visual work already admitted by
`design/program/02_REMAINING_WORK.md`. This file owns architecture and execution order, not the
cross-program completion roll-up.

This document specifies architecture and acceptance intent. Current branch recovery, candidate status,
merge order, focused receipts, and blockers are owned by
[`GRAPHICS_MERGE_CHECKPOINT_2026-07-18.md`](GRAPHICS_MERGE_CHECKPOINT_2026-07-18.md); whole-program
status remains in `design/program/`.

## 1. Outcome

Deliver a cohesive, professional presentation across flight, sectors, ships, stations, landmarks,
effects, previews, and retail captures without lowering the quality of the authored assets already in
the project.

The finished system must:

- preserve or improve the best current Kestrel, Wasp, Helios, station, place, and faction assets;
- make important sectors identifiable through composition, lighting, atmosphere, and landmarks;
- let fitted equipment and curated appearance choices remain visible without degrading authored ship
  silhouettes;
- keep browser and Electron on one gameplay/render route;
- keep save/Continue appearance stable and deterministic;
- scale through reusable data contracts, authoring templates, residency, LOD/HLOD, batching, and
  instancing rather than one-off renderer branches;
- improve performance by reducing invisible work, redundant passes, fragmented resources, and late
  decoding rather than by removing authored visuals or lowering default quality;
- finish every slice in a playable, independently verifiable state.
- publish the exact intended authored visual before an entity is visible, targetable, or capable of
  player-facing action; a procedural emergency shape may diagnose a load failure in development but
  must never masquerade as a live ship, station, rock, wreck, or hostile on the normal route;
- preserve one stable entity-space origin, orientation, bounds envelope, and identity through every
  LOD, HLOD, batching, instancing, sector-residency, save/restore, and authored-asset transition;
- resolve mining, drilling, massline, weapons, scanner labels, and destruction from one shared object
  interaction classification so a rock-shaped salvage object cannot silently behave as several
  unrelated object types.

## 2. User constraints and explicit permissions

- Work continuously through the complete overhaul rather than stopping after a planning-only pass.
- Use the existing assets wherever they remain the strongest solution; they represent substantial
  completed work and are not disposable scaffolding.
- Refactor or replace architecture when required to avoid a graphics or customization local maximum.
- Visual quality must not regress during architectural migration.
- A refactor is not accepted merely because tests pass: the normal player camera and public route must
  show an equal or better result.
- Assume the current authored graphics are affordable on supported hardware until measurement proves
  otherwise. Do not introduce visible surrogate geometry, late identity swaps, dynamic resolution,
  asset starvation, or quality throttles as speculative protection from workload that is not present.
- Treat the former target as a floor and raise the production quality bar by roughly 10–15 percent. The
  added quality must come from better construction logic, material behavior, silhouette hierarchy,
  functional storytelling, motion, and cross-family cohesion—not indiscriminate noise, draw calls, or
  texture resolution.
- Do not stop at the three golden assets. Propagate the accepted language through every player-facing
  family: player and NPC ships, reusable parts, stations, rocks and minerals, wrecks, infrastructure,
  cargo and mining equipment, celestial/background structures, propulsion, weapons, impacts, and
  destruction. A polished hero asset surrounded by blockouts is not a cohesive visual overhaul.
- Every family receives a weakest-link review at close, default, and maximum gameplay zoom. Structural
  geometry, UVs, PBR response, decals, LOD identity, animation/VFX, classification, and runtime wiring are
  repaired at the owning layer; post-processing must not be used to conceal an unfinished layer.

## 3. Historical starting snapshot and shared-tree boundary

At worktree creation, the isolated worktree started from the base revision above. A graphics-only snapshot of concurrent WIP
was copied from the original `master` checkout after worktree creation. It includes:

- background layer compositing and its focused contract test;
- sector lighting/palette transition work;
- render residency and authored-upgrade relevance work;
- render-target warmup/readiness work for New Game and previews;
- related focused tests.

It deliberately excludes dirty station-minigame, audio, economy, drill, input, CSS, and unrelated
probe changes from the original checkout. The original checkout remains untouched. Reconcile later
upstream graphics commits explicitly rather than assuming this snapshot stays current.

## 4. Architectural decision

Adopt a **hybrid data-driven visual composition system**.

### 4.1 Authored assets

Blender-authored GLB/KTX2 assets remain the hero-quality source for ships, stations, landmarks, props,
and any surface whose silhouette or material story matters at the player camera.

### 4.2 Procedural presentation

Procedural rendering remains the scalable source for infinite backgrounds, deterministic distribution,
particles, transient effects, fallback continuity, and variation that would be wasteful to author as a
unique heavyweight asset.

### 4.3 Declarative profiles

Data profiles own artistic intent and compatibility:

- `SectorVisualProfile`: sky, lighting, exposure, grade, fog/dust, celestial composition, dressing.
- `MaterialProfile`: semantic PBR roles and emissive/exposure behavior.
- `ShipVisualSpec`: chassis, LOD family, sockets, slot policies, surface channels, damage bindings.
- `ShipAppearance`: persisted curated livery/paint/decal/wear and visible attachment selections.
- `VfxProfile`: socket-driven thrust, weapon, mining, shield, travel, hazard, and damage behavior.

Render modules execute these profiles. They must not become duplicate catalogs.

### 4.4 Runtime ownership target

- `renderer.js` becomes the scene/render-loop facade rather than the art-direction owner.
- An environment director coordinates background, sector lighting, fog/dust, and post parameters.
- Asset loading and residency keep their existing ref-counted, cancelable lifetime contract.
- A generated runtime asset registry derives from `parts_manifest.json`; hard-coded asset filename maps
  are retired incrementally.
- Ship visual resolution, ship assembly, and instance pooling become separate owners.
- `visualFactory.js` is decomposed by entity family only after characterization tests protect current
  behavior.
- Existing bloom/straight paths remain fallbacks until a measured render-graph path is accepted.

### 4.5 Authored visual admission and stable identity

The current stable-root hot-swap contract is retired from player-facing gameplay. It mounts a
procedural or bespoke boundary immediately, starts an asynchronous authored decode later, and replaces
the mounted subtree after the entity can already be visible or active. That produces the observed
blue-clay ship, floating box, and station/ship identity swap even when the final GLB is healthy.

The replacement contract is **resolve, prepare, then admit**:

1. Resolve an entity's exact visual identity from a generated registry before presentation admission.
2. Load and validate the exact GLB/texture/LOD family and prepare its material pipelines off-scene.
3. Publish one stable entity root only after the authored payload is ready.
4. Make visibility and player-facing action share that readiness receipt. A hostile cannot shoot while
   its visual is still pending, and an interactable cannot be targeted under a placeholder identity.
5. Keep the root transform and semantic object identity invariant for the entity lifetime. LOD/HLOD
   changes may replace detail only when their normalized pivot, axes, scale, bounds center, sockets, and
   interaction envelope match the admitted asset contract.
6. On a real load failure, fail closed with an explicit diagnostic/retry state. Do not silently publish
   unrelated primitive geometry as if it were the requested asset.

Initial flight and sector arrival gate the exact visible composition. Runtime encounters and traffic
must acquire a visual-admission receipt before their spawn is announced to presentation/combat. Preload
and residency remain useful implementation details, but they may not change visible identity.

The stability verifier must sample every visible entity family, not ships alone. For each frame it
records simulation position, interpolated expected render position, root world position, visible bounds
center, LOD/HLOD state, instance ownership, authored identity, and frame-origin sequence. A discontinuity
larger than interpolation tolerance without an authoritative gameplay teleport is a failure, including
a one-frame excursion that immediately returns.

Mining/drilling/tether behavior uses a shared interaction descriptor with at least `kind`, `mineable`,
`drillable`, `salvageable`, `tetherable`, `destructible`, and `scanLabel`. Scanner/HUD presentation must
state whether a rock-shaped object is an asteroid, ore body, wreck, volatile reactor, or other hazard;
visual silhouette and material language must support that classification rather than contradict it.

### 4.6 Layered PBR surface foundry

Every opaque authored surface uses a physically based shader path: Principled BSDF in Blender and the
corresponding standard/physical glTF response at runtime. A base-color skin plus constant scalar factors
is not a finished surface. Each production material role must deliberately resolve the layers its real
material needs, selected from:

- base-color variation at material-appropriate macro and meso scales;
- spatially varying roughness that describes coating, handling, machining, heat, dust, scratches, and
  exposed substrate rather than universal noise;
- tangent-space normal or bump detail with a fine micro layer and a separate broader shallow-form layer;
- physically truthful metalness and exposed-metal masks, packed with AO and roughness as R/G/B ORM;
- recess dirt, contact wear, heat effects, service markings, decals, and damage tied to function and
  orientation rather than evenly distributed grunge;
- geometry bevels on physically exposed manufactured edges so highlights describe construction at the
  normal game camera; texture embossing does not substitute for a needed silhouette or bevel;
- role-appropriate glass, ceramic, rubber, radiator, docking, geology, painted hull, structural metal,
  repair, and emissive response instead of one shared material with tint changes.

Object scale and transforms are applied before procedural generation, baking, tangent generation, or
export. Noise frequency, scratch width, panel scale, strata, fasteners, and bump strength are evaluated in
physical context and must not reuse identical ranges across unrelated roles. Assets are reviewed under a
black-space-compatible reflection environment with broad warm/cool sources and localized game lights so
roughness and normal response have something meaningful to reflect without lifting the visible space
background into fog.

The deterministic CLI/Blender foundry owns source maps, generation scripts, Blender bindings, semantic
material slots, texture-role receipts, KTX2 conversion, glTF validation, and matched close/game-camera
captures. Runtime role-specific procedural maps may temporarily supply missing channels for a UV-capable
legacy material, but they must preserve complete authored maps, remain bounded and deterministic, record
`sourceRemasterStillRequired`, and never count as final asset acceptance. UV-less or structurally wrong
assets remain explicit Blender/remesh/bake work rather than receiving a misleading shader-only pass.

Texture resolution follows projected texel density and residency, not one library-wide prestige number.
The starting production profile is 512px per channel for modular cockpit/engine/weapon/fin/greeble/gear/
pod pieces and 1024px or higher only for large hull/place surfaces whose player-camera coverage proves it.
Each manifest row records the actual size and validators use the category profile. Asset-specific macro
wear and masks remain authored; reusable micro-normal/roughness layers should converge on shared,
hash-keyed texture resources so assembling several ships does not upload identical detail maps per GLB.
Any shared layer must preserve role-specific frequency, strength, UV/object scale, accessibility, and
material identity rather than collapsing surfaces back into one generic sci-fi noise response.

## 5. Ship customization decision

Retire the binary distinction between “whole ship” and “modular ship.” Preserve production whole-ship
GLBs as authored **chassis** assets.

Every chassis declares a policy per visible slot:

- `integrated`: deliberately baked into the chassis and not replaced;
- `attachment`: render the equipped part at a standardized socket;
- `optional`: cosmetic geometry selected by appearance data;
- `hidden`: gameplay equipment with no exterior representation.

This lets a sculpted hero hull retain its silhouette while weapons, cargo pods, utility equipment,
engines, damage, trails, and curated liveries remain truthful. Player ship selection must be explicit and
deterministic; hashed/random part choice is allowed only for declared NPC variation profiles.

Persist a bounded appearance record beside each owned ship:

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

Old saves receive defaults through a migration. Preview, Shipyard, flight, save restore, and store capture
must resolve the same appearance key.

## 6. Execution rules

Each slice follows red-green-refactor:

1. Add a focused failing behavior/contract test.
2. Run it and record the expected failure.
3. Implement the minimum complete vertical behavior.
4. Run the focused test and adjacent owners.
5. Capture a current normal-route before/after view when the slice is visual.
6. Run relevant asset, reachability, visual-stability, performance, save, browser, and Electron gates.
7. Review the diff and commit one reversible logical slice.

No production behavior is added before its failing test. Exploration may be thrown away before the
tested implementation begins.

## 7. Ordered continuous build

### Slice 0A — Asset admission, transform stability, and object identity

**Visible outcome:** the advanced Hitch/Kestrel selected by the production registry is the first and only
starter ship shown in New Game, Shipworks, flight, save/Continue, and Electron. No visible entity appears
as blue clay, a primitive box, or a different silhouette before becoming authored. Ships, stations,
asteroids, wrecks, and props do not jump away from their simulation pose for one or more frames.

Work:

- capture the reported normal-route starter mismatch, position excursion, and massline/mining/drill case;
- extend visual-stability instrumentation to all visible entity families and compare root/bounds/instance
  transforms with the authoritative interpolated pose;
- replace visible hot-swap boundaries with resolve/prepare/admit receipts and gate player-facing action on
  the same receipt;
- route the production advanced Hitch/Kestrel identity through New Game, Shipworks, flight, save/Continue,
  and Electron without a competing code-native or procedural body;
- normalize and validate pivot, scale, axes, bounds, sockets, and interaction envelopes across LOD/HLOD
  and instance paths;
- add the shared interaction descriptor and align massline, mining beam, drill, scanner/HUD, salvage, and
  destruction behavior for asteroid-like and wreck-like objects;
- remove speculative quality throttles from the hardware path; retain only measured emergency behavior for
  a confirmed software renderer or actual context failure.

Exit: matched player-route video proves no intermediate visual, no uncommanded screen/world excursion,
and truthful interaction labels/verbs; focused admission, asset, transform, mining/tether, save/Continue,
flight, browser/Electron, accessibility, and measured performance checks pass.

### Slice 0 — Integrate the imported render foundation

**Visible outcome:** sector lighting remains coherent, ordinary space presents as a restrained void rather
than a full-screen effect, and New Game/preview warmup does not expose broken intermediate presentation.

Work:

- review the imported graphics-only WIP as untrusted changes;
- verify single-pass background parallax, tint, intensity, restore, and disposal;
- verify current-sector/approach asset relevance does not pop or starve the critical route;
- verify bloom/render-target warmup is context-loss safe;
- fix or drop any imported change that lacks proof.

Exit: focused background, preload, warmup, New Game, preview, asset-live, launch, and representative
player-route checks pass with before/after evidence.

### Slice 1 — Environment profiles and Helios signature look

**Visible outcome:** Helios has an unmistakable sky, light rig, depth stack, and station approach.

Work:

- add validated `SectorVisualProfile` data and a pure resolver;
- add an environment director coordinating background, lights, fog/dust, exposure, and post inputs;
- migrate hard-coded sector background/lighting selection into profiles without a visual reset;
- tune and accept the Helios profile first;
- preserve deterministic placement and context-restore behavior.

Exit: core/belt/fringe/anomaly profiles are schema-valid; Helios normal-route capture is visibly improved;
sector transition, save/restore, background, camera, flight-clean, visual-stability, and perf checks pass.

### Slice 2 — Semantic materials and illumination repair

**Visible outcome:** Hitch’s silhouette survives thrust, Helios has no opaque/unshaded defects, and ships,
stations, rocks, and props respond coherently to the environment.

Work:

- characterize and consolidate semantic material roles across authored and procedural paths;
- require layered, role-specific base-color, normal/detail, nonuniform roughness, metallic, and AO response
  for physical surfaces; a base-color-only skin or constant roughness/metalness remains incomplete;
- make procedural/detail scale, bevels, tangents, and applied transforms part of source validation and
  resolve missing UV or geometry structure in Blender rather than hiding it with a generic runtime noise;
- make emissive intensity exposure-aware and role-driven;
- preserve authored texture detail, roughness, clearcoat, canopy, damage, and tint channels;
- remove ad hoc per-asset material mutations when the shared contract can own them;
- repair known Hitch glare and Helios material failures with same-framing evidence.

Exit: material/canopy/asset/live/visual/perf checks pass and the defects are absent in browser and Electron.

### Slice 3 — Ship visual spec, appearance save schema, and Kestrel migration

**Visible outcome:** the Kestrel retains its hero quality while at least one real fitting and one curated
appearance choice are truthful in Shipyard, flight, save, and Continue.

Work:

- add pure `ShipVisualSpec` and `ShipAppearance` validators/resolvers;
- add save defaulting/migration and stable appearance keys;
- convert the production Kestrel whole-ship route to the chassis slot-policy path;
- keep the current Kestrel GLB as chassis and fallback during migration;
- mount only declared attachments at authored sockets;
- include appearance in preview, preload, residency, instance, and precompile keys;
- prohibit random player-part selection.

Exit: unit/save/Continue/Shipyard/asset/live/visual/perf checks pass and current Kestrel comparison shows no
silhouette, surfacing, lighting, or animation regression.

### Slice 4 — Blender authoring contract and one hero asset pass

**Visible outcome:** one existing hero asset is materially improved in game, and every later asset can be
produced through the same reproducible contract.

Work:

- configure local Blender MCP/CLI without committing machine-specific paths;
- add non-destructive audits for units, axes, transforms, normals, semantic materials, sockets, LODs,
  collision, dependencies, and gameplay-camera framing;
- align `spaceface_export.py`, finalizers, manifest data, and runtime validation with chassis/profile
  contracts;
- render consistent authoring and gameplay-distance views;
- improve the highest-impact existing Kestrel or Helios seam rather than replacing good work wholesale.

Exit: source, provenance, export, GLB validation, release, live load, reachability, visual stability, and
normal-route evidence all pass.

### Slice 5 — Background and world-depth expansion

**Visible outcome:** sectors have stronger scale, composition, depth, and identity without unique heavyweight
renderers or obvious repetition.

Work:

- use a neutral sparse star field as the infinite base;
- reserve visible nebula gas, dust, and distortion for sectors whose physical/environmental identity calls
  for them instead of tinting every sector;
- add profile-driven planets/moons, distant silhouettes, foreground debris, and landmark-aligned
  compositions;
- share geometry/materials and preserve the single-pass background foundation;
- make seeded placement stable across save/reload and long-distance travel;
- establish screenshot-identifiable core, belt, fringe, and anomaly looks.

Exit: sector identity captures, background/transition/save/visual/perf checks, and browser/Electron parity pass.

### Slice 6 — Socket-driven VFX and camera composition

**Visible outcome:** idle, cruise, boost, RCS, firing, impact, shield break, mining, tether, gate travel, and
damage each have readable, professional signatures.

Work:

- route effects through `VfxProfile` and authored sockets;
- unify exposure/bloom response with the material contract;
- preserve pooled/no-allocation hot paths;
- add reduced-motion and reduced-flash variants;
- tune camera response and composition from player-route captures rather than effect-only fixtures.

Exit: focused VFX, camera, accessibility, flight-clean, visual-stability, and measured perf checks pass.

### Slice 7 — Ship, station, landmark, and ecology families

**Visible outcome:** fighter/interceptor, miner/hauler, station, gate, landmark, asteroid/rock, and faction
families are identifiable by silhouette and material language at gameplay distance.

Work:

- reuse strong existing assets as chassis/kit members;
- produce missing family members through compatible authored kits and profile data;
- migrate hard-coded runtime maps to the generated manifest registry;
- use instancing, batching, LOD/HLOD, residency, and compression where measured;
- classify, wire, and capture each promoted family through normal routes.

Exit: sparse/normal/crowded public routes, classifications, manifest/release/live/reachability/visual/perf
checks, and independent visual review pass.

### Slice 8 — Render ownership split and capability tiers

**Visible outcome:** high-capability hardware receives the strongest accepted presentation; lower-capability
hardware remains stable without silent quality cliffs.

Work:

- split renderer, environment, asset resolution, ship assembly, and pooling behind proven contracts;
- retain one facade and route while removing duplicate catalogs and dead fallback branches;
- capability-gate measured AO, bloom, grading, shadow, and resolution behavior;
- keep straight and proven bloom paths until the render graph wins representative comparisons;
- validate WebGL context loss, resize, alt-tab, preview, and long-session resource lifetime.

Exit: characterization tests, focused render suite, browser/Electron parity, soak, memory, startup, hitch,
and visual comparison pass.

### Slice 9 — Retail surfaces and final acceptance

**Visible outcome:** flight, station, Shipyard, maps, previews, menus, captures, and transitions present one
cohesive game.

Work:

- make previews truthful to the runtime asset/loadout/appearance resolver;
- finish map/scanner silhouettes and restrained world/HUD integration;
- capture representative first-hour, combat, mining, travel, docked, sparse, normal, and crowded routes;
- complete browser/Electron, accessibility, localization, save/corruption, resize/alt-tab, packaging, and
  store-capture evidence;
- remove migration-only fallbacks after the accepted route proves they are unnecessary.

Exit: the relevant release matrix is green, current captures meet the visual outcome bar, and status owners
can promote completion from evidence.

## 8. Universal slice acceptance

Every slice must leave:

- a runnable title, New Game, flight, dock, Shipyard/preview, save, and Continue route;
- no silent authored-asset fallback on the acceptance route;
- deterministic sim state and cosmetic-only render state;
- current browser and Electron evidence;
- no reduced default visual quality used to satisfy performance;
- no generated release metadata edited by hand;
- no active Blender/release lock overwritten;
- a reviewed diff limited to the logical slice;
- an explicit rollback boundary.

## 9. Non-goals

- No engine rewrite.
- No universal aesthetic recipe, fixed effect count, or arbitrary asset ceiling.
- No post-processing used to hide weak silhouettes, materials, or lighting.
- No per-sector bespoke renderer.
- No combinatorial ship customizer built on pre-authored material variants alone.
- No replacement of strong authored assets merely to make architecture uniform.
- No claim of visual completion from Blender renders or pattern checks alone.

## 10. Final verification set

Run focused checks throughout, then at final acceptance run at minimum:

```bash
npm run check:asset-status
npm run check:assets:live
npm run check:asset-reachability
npm run check:visual-stability
npm run check:ship-material-sharing
npm run check:camera
npm run check:flight:clean
npm run check:launch-policy
npm run check:sim:compare
npm run check
```

Add current browser/Electron captures, performance/startup/memory artifacts, and requirements review. A
green command cannot substitute for a missing player-route or visual outcome.

## 11. Recoverable donor checkpoint

The graphics branch now contains a deliberately partitioned recovery stack through `0c34fc9e`. It
preserves background/de-haze, VFX substrate and family contracts, authored admission and stable-identity
seams, semantic PBR profiles, procedural legacy-surface fallback, canopy optics, geology/interaction
identities, appearance schema, Blender sources for the Kestrel/Helios/Wasp candidates, reusable foundry
tools, and GPU/release evidence tooling.

These are donor slices, not synthesized-master acceptance. The current master renderer control flow,
pipeline tracker, upload ownership, mining mechanics, UI, save behavior, and final asset manifests must
remain the base where they are newer. Exact commits, safe hunk-level merge rules, focused receipts,
candidate criticisms, and excluded paths live in
[`GRAPHICS_MERGE_CHECKPOINT_2026-07-18.md`](GRAPHICS_MERGE_CHECKPOINT_2026-07-18.md).

## 12. Current stop line

- Claude is still changing `master`; do not merge, rebase, or copy graphics work into that checkout until
  the user confirms the active sequence is finished and the final tip has been audited.
- Kimi's Helios candidate is incomplete and unaccepted. The committed Golden Helios V4 source is the
  comparison floor, not a promoted winner.
- Kestrel V5+, Wasp, Golden Helios, background, thruster, combat, and geology outputs are candidate or
  donor evidence where the checkpoint says so. None becomes accepted merely because a focused contract
  passes.
- Bulk regenerated catalog GLBs and manifests remain quarantined. Four release whole-ship paths are
  missing/unsafe, including a false binary rename heuristic; never stage the asset tree wholesale.
- Final matched browser and Electron captures, motion/LOD/flicker proof, default-route thruster and combat
  visibility, accessibility comparisons, measured GPU/performance evidence, and a narrow release/manifest
  rebuild are still required after synthesis.
- `design/program/` remains untouched by this donor checkpoint; update whole-program status only after
  the synthesized normal route has survived independent visual acceptance.

## 13. Defect-driven production wave and final visual bar

The corrective wave is integration-first and rejects visual completion by file-count. Its ordered
verticals are:

1. authored-before-visible admission, exact starter routing, transform stability, and shared object identity;
2. dark-space background with localized structure and stable parallax;
3. golden PBR surfaces for Hitch/Kestrel, Helios trade hub, and a representative starting-region rock;
4. reusable thruster/RCS substrate and a finished Hitch implementation;
5. mechanically distinct projectile, muzzle, shield-impact, and hull-impact families;
6. phased small/ship/capital destruction families;
7. matched normal-route browser/Electron, accessibility, GPU-state, and performance acceptance.

Disposable Grok CLI workers may generate high-volume candidates, but they never write into a SpaceFace
checkout, author Blender/GLB/release data, or approve their own work. Every packet owns an immutable input
manifest, reproducible generators, hashes, captures, command evidence, and a structured worker result.
The controller reruns the candidate, inspects stills and motion, records visible defects, and resumes the
same worker session until the rejection conditions are absent or a real external blocker is proven.
Only the controller adapts accepted concepts to current live seams and binds or bakes material work with
Blender.

The Grok implementation lane is explicitly the disposable non-Blender foundry: Three.js/Node shader and
VFX modules, deterministic texture generators, ImageMagick, KTX Tools, Khronos glTF Validator, glTF
Transform inspection, and reproducible browser capture harnesses. Grok must not launch Blender or call
Blender MCP. Blender source edits, baking, GLB binding, release promotion, and live-tree integration remain
controller-only. Material Maker is excluded from this build because the installed Windows CLI crashes
before processing arguments; it is not silently substituted with Blender inside Grok packets.

The overhaul remains rejected until the normal player route visibly proves all of the following:

- the intended advanced Hitch/Kestrel is the only starter visual ever published, and no entity is visible
  or attacks as procedural clay, a primitive box, or another temporary silhouette;
- ships, stations, rocks, wrecks, and places retain a stable transform and bounds center across interpolation,
  frame-origin changes, LOD/HLOD, instancing, sector residency, and save/Continue;
- asteroid-like objects communicate one truthful identity and the massline, mining beam, drill, scanner,
  salvage, and destruction verbs agree with that identity;
- no polygon-cone exhaust, floating bead trail, or generic miniature-engine RCS;
- ordinary weapons do not collapse to colored balls, generic circular flashes, or primary expanding rings;
- explosions have ignition, irregular release, directional debris, cooling residue, and scale-specific timing;
- black space remains genuinely dark while localized structure supplies credible scale and sector identity;
- Hitch, Helios, and the representative rock separate functional material roles and no longer read as one
  smooth plastic/clay surface;
- game-camera results survive motion, dense scenes, reduced-motion/flash settings, browser/Electron parity,
  asset/live, flight-clean, visual-stability, launch, and measured performance checks.
