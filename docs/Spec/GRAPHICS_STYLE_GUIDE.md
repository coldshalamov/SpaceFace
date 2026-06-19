# SpaceFace Graphics Style Guide

**Version:** 1.0 — Kestrel hero-asset pass  
**Date:** 2026-06-19  
**Normative asset:** `assets/ships/kestrel/`  
**Live implementation:** `src/render/ships/kestrelHero.js`  
**Art thesis:** **Warm, haunted machinery against an indifferent universe.**

---

## 1. Executive conclusion

SpaceFace does not have a “missing post-processing” problem. Its renderer already contains a serious real-time foundation: true Three.js geometry, a tilted chase camera, physically based materials, fog, bloom, ACES-capable grading, environment reflections, real and contact shadows, dynamic VFX lights, and live diagnostics. The technical frame is ahead of the authored asset language.

The present visual weakness is therefore structural rather than cosmetic. Most ships are assembled by generic family builders from slabs, cones, boxes, repeated modules, and stochastic surface clusters. Faction paint and grime add useful differentiation, but they sit on forms that often share the same underlying compositional logic. Detail is frequently distributed by probability rather than by heat flow, access, load, repair, threat, or narrative. The result can be energetic in motion while still reading as “procedural game object” instead of “a ship from a world.”

The graphics upgrade should not begin by adding more bloom, more neon, larger textures, or a larger random-detail budget. It should begin by making the game’s most important objects authored at the level of silhouette, mass, material, causality, and story.

The SF-K0 Kestrel, **BORROWED TIME**, is the first reference implementation of that standard. It establishes:

- a bespoke hero-asset path that coexists with the procedural catalog;
- a recognizable starter-ship silhouette at gameplay distance;
- a causal material and wear hierarchy;
- visible hardware for the player’s first verbs—flight, shooting, and mining;
- named attachment sockets shared by runtime and GLB reference;
- constrained asymmetry that implies history;
- a draw-call-aware static batching strategy;
- deterministic reference generation and automated validation;
- a concrete bar against which every later ship, station, prop, effect, and interface element can be reviewed.

A USD 30 Steam position cannot be guaranteed by graphics. Price tolerance emerges from the agreement between art, writing, systems, performance, audio, content breadth, and presentation. Graphics can, however, remove the “prototype tax”: the silent impression that every system is temporary because the visible world lacks specificity. This guide is designed to remove that tax.

## 2. Evidence and audit boundary

This guide was written against the actual repository, not against a hypothetical remake. The principal evidence includes:

- `README.md` — game premise, inspirations, current no-build architecture;
- `ARCHITECTURE.md` — simulation/render separation, coordinate system, camera, starter-ship contract;
- `design/V2_MASTER_PLAN.md` — three-lens progression, Tier-0 experience, intervention loop, visual priorities;
- `VISUAL_ASSET_PLAN.md` — prior concept-image strategy and desired lived-in industrial language;
- `design/IMPROVEMENT_IDEAS.md` — presentation ambitions and earlier gaps;
- `design/PERF_BUDGET.md` — 60 fps target, 30 fps floor, renderer/VFX budgets, required measurement protocol;
- `src/data/ships.js` — ship families, dimensions, visual proportions, hardpoints, engines, tiers;
- `src/data/palettes.js` — faction palettes, paint personalities, Kestrel nose art, “BORROWED TIME” fiction;
- `src/render/visualFactory.js` — procedural forms, materials, greebles, overlays, loadout props, factory dispatch;
- `src/render/renderer.js` — lights, fog, shadows, PMREM environment, bloom, diagnostics, entity-to-view lifecycle;
- `src/render/shipPreview.js` — existing turntable and faction-variant capture harness;
- `src/systems/ships.js` — starter weapon, slot order, render-facing fittings, flight class, hardpoint behavior;
- `package.json` — Three.js 0.184.0 and current validation scripts.

The audit does not claim that a single code reading replaces live capture. The repository’s performance contract correctly requires before/after measurements in a representative scene, with bloom on and off. This pass can validate syntax, topology, file integrity, draw-call structure, material ranges, bounds, sockets, and architectural integration. Final frame-time and screenshot judgment still require running the game on the target and floor profiles.

## 3. Current strengths worth preserving

A professional revamp should protect what already works. Replacing the entire visual stack would be expensive, risky, and unnecessary.

### 3.1 True 3D, not a sprite illusion

The game already uses real three-dimensional geometry under a coherent camera. Banking, lighting, shadows, parallax, and environment reflection can all carry information. This gives SpaceFace a stronger foundation than a flat top-down game attempting to fake volume after the fact.

### 3.2 A mature renderer for the project’s scale

The renderer has multiple directional lights, restrained fog, shadow maps, contact shadows, bloom, an environment map baked from the scene, and diagnostics that aggregate multiple post passes. These are not placeholders. They are useful tools that now need better assets to illuminate.

Adding another post effect before the hero assets are solved would be polishing the telescope while the stars remain unnamed.

### 3.3 Data-driven faction identity

Faction palettes and paint profiles already separate lawful chrome, corporate polish, independent grime, blue-collar wear, pirate neglect, smuggler dirt, and alien austerity. This is the right architectural instinct: art direction encoded as reusable data rather than one-off conditionals.

The upgrade is to make that data affect construction, materials, maintenance, typography, lighting, and motion—not only color and overlay dirt.

### 3.4 Ship metadata already anticipates authored forms

Ship definitions contain family, proportions, engine mounts, hardpoints, cockpit positions, mining points, sensors, tier hints, and dimensions. This is a valuable latent contract. A future GLB loader or bespoke builder can consume the same information rather than creating a parallel taxonomy.

### 3.5 Performance discipline exists

The repository has a frame-time budget and a capture protocol. That is unusually healthy for an art-heavy browser game. The guide therefore treats draw calls, triangles, texture memory, transparency, and lights as design inputs rather than a late optimization funeral.

### 3.6 The narrative already contains a visual arc

The master plan’s strongest idea is that progression is a migration of attention. Tier 0 is manual, close, poor, and intimate. Later tiers move the player’s gaze from one drill and one ship toward routes, fleets, and interventions. The art should embody that migration: early technology is handled, patched, and personally legible; later technology becomes infrastructural, repeated, and politically visible.

## 4. Current shortcomings

### 4.1 Generic family builders flatten identity

The current family functions are useful catalog scaffolding, but a small set of slabs, cones, boxes, and repeated silhouette motifs must represent thirteen hulls across many tiers and factions. Proportions change; authorship often does not.

The player’s starter ship is the worst place to accept this compromise. The Kestrel appears in the opening minutes, the HUD, the shipyard, screenshots, combat, mining, docking, and likely most player memory. It requires a unique form hierarchy rather than a generic scout recipe plus extra parts.

**Upgrade rule:** procedural family builders remain fallback and population technology. Hero ships, major antagonists, signature stations, and critical story objects receive bespoke builders or imported assets through a registry seam.

### 4.2 Random greebles substitute density for causality

The current surface-detail system samples a grid and probabilistically places vents, hatches, pipes, ribs, thrusters, fins, plates, and scorch marks. It creates variation cheaply, but it cannot know why a vent belongs near a thermal system, why a hatch needs clearance, or where a repair crew would stand.

Random detail has no memory. It can imply complexity, but rarely history.

**Upgrade rule:** every strong detail belongs to one of five causal maps:

1. **load** — thrust, recoil, landing, towing, docking;
2. **heat** — engines, reactors, radiators, weapons, mining emitters;
3. **access** — service panels, hinges, ladders, crew touch, replaceable modules;
4. **exposure** — leading edges, dust, debris, atmosphere, impact zones;
5. **story** — repair, faction conversion, old ownership, damage, customization.

A detail that belongs to none of these maps should be removed or reduced to near-invisible manufacturing variation.

### 4.3 Overlay shells detach wear from form

Generic enlarged shells carrying grime, patches, chrome, and decals are efficient, but they can look like effects floating above geometry. They also apply similar wear logic to unlike hull regions.

**Upgrade rule:** major repairs and identity marks are local geometry or UV-aware decals placed against specific surfaces. Broad low-contrast grime may remain procedural, but high-contrast wear must be authored and causal.

### 4.4 Concept inventory and runtime art are disconnected

The visual plan contains ambitious reference images and contact-sheet thinking, while runtime ships remain code constructions. The problem is not that concept art exists; it is that no enforceable handoff contract turns a concept decision into runtime geometry, materials, sockets, LODs, and review images.

**Upgrade rule:** every hero asset has one manifest linking fiction, source, runtime implementation, bounds, coordinate convention, materials, sockets, performance metrics, and previews. A beautiful image without a runtime owner is reference. It is not an asset.

### 4.5 Material roles are not always physically or semantically distinct

High metalness is visually tempting because it makes forms sparkle under an environment map. Painted shell, oxidized repair, warning paint, glass, bare hardware, ceramic insulation, and emission should not all share similar responses.

**Upgrade rule:** coated surfaces are primarily dielectric; exposed metallic hardware carries metalness; roughness does most of the realism work; emissive color is stateful. Intermediate metalness across a whole painted surface should not be the default.

### 4.6 Emissive competition weakens information

Space games can become a parliament of glowing accents in which every object speaks at once. When cyan, magenta, red, orange, white, and purple all mean “interesting,” none means danger, heat, stability, faction, or interaction.

**Upgrade rule:** establish an emissive grammar and reserve saturation. Effects are information, not confetti.

### 4.7 Upgrade progression is often additive rather than compositional

Adding more fins, ribs, pods, and guns at higher tiers can increase clutter while preserving the same weak primary read.

**Upgrade rule:** progression changes posture, mass distribution, and function before it changes detail density. An upgrade should reveal a new capability through load path and silhouette, while preserving the hull’s identity.

### 4.8 Damage is mostly an effect layer, not an authored state

Smoke, sparks, scorch, and particles communicate damage, but an important ship should also have prepared geometry/material states: displaced armor, failed light groups, exposed structure, asymmetric drive behavior, and named break zones.

**Upgrade rule:** prepare operational, stressed, damaged, critical, and destruction states for hero assets. The core silhouette remains recognizable until final breakup.

### 4.9 Review can drift toward close-up beauty instead of gameplay legibility

A turntable is necessary but insufficient. The actual game camera, render scale, motion, effects, and background decide whether the ship works.

**Upgrade rule:** the 96-pixel silhouette, normal chase view, shipyard view, and darkest representative sector are mandatory review states.

### 4.10 Documentation has aged unevenly

Earlier improvement documents describe bloom, fog, tone mapping, and shadows as missing, while the current renderer includes them. This is normal in a fast project, but stale gaps cause duplicate effort.

**Upgrade rule:** the style guide distinguishes current fact, target, and future option. Every major graphics PR updates the relevant status section.

## 5. Product target: premium coherence

A premium independent game does not need the asset count of a large studio. It needs a visible hierarchy of care.

For SpaceFace, a professional 2026 presentation means:

- the starter ship is recognizable in a thumbnail and memorable in a close view;
- ships from different factions differ in construction and maintenance, not just hue;
- environments support navigation and mood without reducing combat readability;
- mining, combat, travel, trade, rescue, and damage each have distinct visual verbs;
- effects originate from geometry and scale with cause;
- interface, icons, and marketing renders depict the same objects as gameplay;
- performance remains stable on the documented floor profile;
- no obvious placeholder enters the first ten minutes;
- repeated assets show controlled variation rather than copy-paste or random clutter;
- every screenshot looks as if it belongs to one game.

The target is not photorealism. It is **authored stylized hard-surface science fiction with physical consequences**.

## 6. Art thesis and visual pillars

### 6.1 Warm, haunted machinery against an indifferent universe

Space is vast, quiet, cold, and geometrically unconcerned with the player. Human technology answers with repair paint, hand labels, warm cabin light, bolts, mismatched modules, improvised routes, and evidence that someone expects the machine to return.

The player’s assets should contain warmth without comfort and age without collapse. The universe may be beautiful; it is not welcoming.

### 6.2 Silhouette before surface

Every ship must survive as a black filled shape at its smallest common gameplay size. Class, forward direction, and faction family should be legible within three seconds.

The review sequence is:

1. filled silhouette at 96 pixels wide;
2. grayscale render at gameplay camera;
3. flat-color material-block render;
4. final lit render;
5. motion with effects.

If a design fails step 1, do not add decals. Return to blockout.

### 6.3 Detail follows consequence

Vents belong downstream of heat. Armor belongs around threat or pressure. Struts connect load. Landing hardware reaches the ground. A hatch has room to open. A weapon clears its own hull. A mining emitter can see the rock.

Stylization can exaggerate. It cannot abdicate.

### 6.4 Controlled pareidolia

SpaceFace can use facial readings as a signature without making every ship a toy. Paired sensors, armored brows, central intakes, and light state can create expression. The viewer should first see a ship, then notice the face.

Literal eyes, smiles, moving eyebrows, or cartoon mouths require explicit narrative justification.

### 6.5 Asymmetry carries biography

Primary flight and structural masses remain balanced unless the fiction explains otherwise. Secondary equipment can be asymmetric: one repaired shoulder, one sensor mast, one replaced module, one faction conversion.

Each hero asset receives one dominant asymmetric story and no more than two supporting ones. More becomes noise.

### 6.6 Quiet surfaces are finished surfaces

Blank paint is not unfinished. It is rest. Large low-frequency material fields make small lights, repairs, weapons, and silhouettes readable. Uniform texture noise destroys scale and attention.

### 6.7 Motion has hierarchy

Not every panel needs animation. One fan, one gimbal, one antenna settle, one landing compression, and one meaningful light change can make a ship feel more alive than twenty unrelated moving parts.

## 7. The three lenses

The V2 plan divides the game into Space, Surface, and Drill lenses. The visual system must make the shift in attention legible.

### 7.1 Space lens

The Space lens is about trajectory, threat, affiliation, and distance. Visual priorities are:

- unmistakable silhouettes;
- bright but restrained propulsion cues;
- clear weapon and impact direction;
- sector-scale color signatures outside the combat corridor;
- readable docking and route infrastructure;
- faction massing visible before decals.

At later tiers, the Space lens should show the player’s growing logistical footprint: escorts, repeated modules, route beacons, owned stations, and intervention traffic.

### 7.2 Surface lens

Tier 0 spends most attention close to machinery and terrain. Surface presentation therefore cannot feel like a generic pause screen pasted under a space game.

Surface assets should emphasize:

- ground contact and weight;
- service clearances;
- hazard markings and access paths;
- local dust, abrasion, and lighting;
- hand-scale props near large machines;
- visible relationships between ship, cargo, drill, crew, and repair.

The Kestrel’s landing skids are not ornamental. They declare that this ship belongs to the early manual world.

### 7.3 Drill lens

The Drill lens needs material truth. Rock composition, danger, temperature, fracture, tool stress, and reward should be visually differentiated without requiring the UI to narrate every state.

Use:

- material families with distinct fracture scale and reflectance;
- heat and stress gradients around the cut;
- tool-specific emission and debris;
- clear overheat and instability states;
- sparse bright reward cues against quieter stone;
- environmental residue that connects the drill to the surface scene.

Progression should move from hand-readable individual strata toward automated extraction patterns and throughput visualization, not simply larger particle bursts.

## 8. Faction construction grammar

Palette remains useful, but color is the last confirmation, not the first identifier.

### 8.1 Free Frontier / player-independent

**Reading:** adapted, repaired, personally owned, difficult to replace.

- protective pressure shells over visible mechanical structure;
- mismatched modules and local repairs;
- cyan identity paint used as broken stripes, sensor marks, and navigation cues;
- warm practical lights;
- hand-applied typography and old ownership evidence;
- moderate grime concentrated by cause;
- one or two visibly nonstandard systems.

The Kestrel is the reference.

### 8.2 Concord lawful authority

**Reading:** maintained, standardized, surveillant, expensive.

- strong axial or bilateral organization;
- repeated panel rhythm and serialized modules;
- clean pressure boundaries;
- brighter, cooler shell materials;
- controlled chrome only on surfaces designed to carry it;
- small precise insignia;
- minimal exposed repair;
- light groups that read as regulated and redundant.

Authority should feel intimidating because it is organized, not because every ship has spikes.

### 8.3 Meridian corporate

**Reading:** brand-controlled efficiency.

- modular replaceable blocks;
- strict alignment and service grids;
- standardized containers and radiators;
- warm gold/cream accents within disciplined neutral fields;
- large legible corporate marks at infrastructure scale;
- low grime, but visible throughput wear at cargo and docking interfaces.

### 8.4 Drift Miners / blue-collar industrial

**Reading:** honest load, repair, and abrasion.

- broad load paths;
- external braces, scoops, clamps, and service platforms;
- safety color near moving or hot systems;
- dust and abrasion stronger than combat scarring;
- replaceable tools with unmistakable mount geometry;
- work lights rather than decorative glow.

### 8.5 Crimson Reach / pirate

**Reading:** predatory reuse.

- stolen base hulls with altered posture;
- weapons mounted where cargo or service systems used to be;
- strong local damage and replacement;
- broken symmetry around function;
- overpaint, tags, and kill marks with hierarchy;
- neglected thermal and access surfaces;
- hot, unstable emission.

Do not make every pirate uniformly filthy. The important question is what they maintain because they need it to survive.

### 8.6 The Quiet / smuggler

**Reading:** deniable, low-signature, modified.

- masked or baffled emitters;
- low-reflectance surfaces with subtle repair variation;
- hidden compartments visible through construction, not magic;
- narrow light apertures;
- restrained identifiers;
- asymmetry around sensors and cargo access.

### 8.7 Vael / non-human austerity

**Reading:** purpose without human hospitality.

Break one foundational human assumption at a time:

- structure and signal may share a surface;
- repetition may occur at a non-human scale;
- light may not sit in fixtures;
- front may remain ambiguous until motion;
- material may transition continuously rather than by bolted panel;
- cavities may be more important than shells.

Unknown design is strongest when it violates a grammar the player already understands.

## 9. SF-K0 Kestrel / BORROWED TIME

### 9.1 Fictional role

The Kestrel is a Tier‑0 scout, manual mining platform, courier, and old criminal runner. It is described in the existing art data as a haunted ex-gangster death ship nobody else would fly. The opening experience calls for a beat-up beater that flies, but not fast.

The model therefore avoids two tempting mistakes:

- it is not a clean high-performance fighter;
- it is not an undifferentiated junk pile.

It is a pressure vessel that has outlived several explanations.

Its emotional sentence is:

> **A death ship that still starts every morning.**

### 9.2 Three-second read

At normal play distance, the player should see:

1. a low guarded central wedge;
2. split shoulder masses and negative gaps;
3. one bright axial engine;
4. a broken cyan centerline establishing orientation;
5. paired sensor slits beneath a dark brow.

No tally mark, rivet, vent, or motto is part of the three-second read.

### 9.3 Thirty-second read

At shipyard or close camera distance, the ship reveals:

- a recessed canopy protected by armor;
- external shoulder radiators connected by visible struts;
- a port field-repair panel in mismatched sage material;
- a starboard utility pod;
- an old antenna loop;
- landing skids and struts;
- visible front pulse hardware;
- a ventral mining emitter;
- the worn “BORROWED TIME” stencil;
- a restrained ghost service mark;
- thirteen old tallies;
- a faded shark-mouth treatment.

This is biography through delayed disclosure. The player can read the ship in motion and reward inspection later.

### 9.4 Form anatomy

#### Pressure hull

The central mass is a flattened loft, widest around the inhabited and service region, protected at the nose, and narrowed around the axial drive. It reads as a pressure shell, not a stretched sports car.

#### Split shoulders

Inner shoulder plates and outboard thermal pods are separated by real negative space and connected by load-bearing struts. These masses are not additional engines. The canonical recipe specifies one engine; the design honors that fact.

#### Axial drive

A single large aft drive is memorable and slightly ominous. Its rings, fan, core, and plume origin show layers of structure and heat. The cyan-white exhaust matches Free Frontier identity but is brighter and hotter than navigation emission.

#### Prow and face

A dark armored brow protects two narrow cyan sensor apertures. A chin service plate and mining emitter complete a mask-like reading. It is severe without becoming cute.

#### Ground hardware

Landing skids are deliberately over-readable. The opening game spends attention on mining and surface work; the ship must appear capable of touching the world it exploits.

### 9.5 Material hierarchy

| Role | Reference material | Approx. sRGB | Metalness | Roughness | Meaning |
|---|---|---:|---:|---:|---|
| Structural coating | Shell Aged Warm Gray | `#817b70` | 0.18 | 0.58 | old coated pressure shell; dominant visual rest |
| Replacement armor | Shell Replacement Dark | `#4e5050` | 0.28 | 0.62 | parts changed at different times |
| Mechanical/thermal | Mechanical Graphite | `#10161b` | 0.78 | 0.42 | heat, depth, exposed machinery |
| Load-bearing hardware | Load Gunmetal | `#252b30` | 0.88 | 0.29 | struts, rings, mounts, fasteners |
| Identity paint | Frontier Cyan | `#4ecbe0` | 0.08 | 0.52 | ownership, orientation, stable systems |
| Cockpit | Canopy Smoked | `#061a22` | 0.08 | 0.14 | intimate protected volume |
| Sensor emission | Sensor Cyan | `#a0eef8` | low | 0.18 | navigation and sensing |
| Drive core | Drive Core | `#e6fdff` | low | 0.16 | peak energy |
| Practical light | Practical Amber | `#e9a34a` | low | 0.38 | cabin, service, human presence |
| Hazard paint | Warning Mustard | `#c28b35` | 0.06 | 0.66 | access, moving or hot systems |
| Field repair | Field Repair Sage | `#53665a` | 0.22 | 0.72 | one explicit chapter of repair history |

The exact values are reference factors, not universal shader law. Their relationships are normative:

- painted shell remains mostly dielectric;
- exposed hardware is more metallic;
- roughness separates age and function;
- emission is sparse and semantic;
- warm practical light remains distinct from cyan machine state.

### 9.6 Color allocation

A normal exterior frame should approximately contain:

- 50–65% warm structural shell;
- 20–30% graphite and dark replacement surfaces;
- 5–10% cyan identity paint;
- 2–5% repair and warning color;
- less than 3% bright emission.

These are composition checks, not pixel quotas. The purpose is to prevent accent color from becoming wallpaper.

### 9.7 Wear map

Strong wear belongs at:

- landing skids and lower struts;
- leading shoulder edges;
- mining emitter and front service hardware;
- engine rings and aft thermal surfaces;
- cargo and utility access;
- the port repair perimeter;
- crew-touch or fastener regions;
- old decal boundaries.

The broad shell remains comparatively quiet. Do not cover the Kestrel with equal-strength scratches. Equal dirt has no chronology.

### 9.8 Nose art and tallies

“BORROWED TIME,” the ghost, shark mouth, and thirteen tallies are canonical, but they are subordinate to form.

Rules:

- visible in shipyard and close cinematic view;
- mostly unreadable as text during ordinary flight;
- faded and interrupted by panel boundaries;
- never brighter than sensor or drive information;
- not repeated symmetrically unless the fiction supports it;
- no UI-style drop shadow or perfectly clean vector appearance on old paint.

### 9.9 Gameplay hardware

The starter ship can shoot and mine. Both actions must originate from visible hardware.

The runtime and GLB define seven named sockets:

- `SOCKET_Weapon_Front`;
- `SOCKET_Mining_Front`;
- `SOCKET_Engine_Main`;
- `SOCKET_Utility_Dorsal`;
- `SOCKET_Cargo_Ventral`;
- `SOCKET_Trail_Main`;
- `SOCKET_Camera_Focus`.

Future VFX and module work should consume these markers. A weapon beam leaving an unrelated center point is a broken visual contract even if gameplay damage is correct.

### 9.10 Upgrade behavior

The Kestrel’s upgrade identity should remain “my old ship, changed,” not “a new ship with the same name.”

An upgrade may strongly change one major dimension at a time:

- width;
- vertical profile;
- forward aggression;
- aft energy mass;
- cargo/service mass;
- color identity.

It may modestly change one or two others. Early upgrades should attach to visible sockets or replace a defined module. They should not spawn unexplained ornaments.

Examples:

- engine upgrade enlarges aft ring, adds cooling, and changes plume behavior;
- weapon upgrade changes mount, barrel, recoil support, and muzzle effect;
- mining upgrade enlarges emitter/lens and adds heat management;
- cargo upgrade adds a ventral pod and changes landing clearance;
- shield upgrade adds emitter nodes and subtle field-state lighting, not arbitrary fins.

### 9.11 Damage states

Prepare five states:

1. **Operational** — stable drive, all navigation lights, intact silhouette.
2. **Stressed** — local heat, minor flicker, venting only under load.
3. **Damaged** — displaced armor, one failed light group, visible exposed substructure.
4. **Critical** — unstable axial drive, intermittent sensors, asymmetric debris shedding.
5. **Destruction** — authored breakup at engine, shoulder, hull, and utility zones.

The ship remains recognizable through the critical state. Random fragmentation begins only at destruction and should inherit the Kestrel’s materials.

### 9.12 Motion and effects

The current hero implementation animates the drive fan and changes core/plume response with actual speed. This is the correct principle: motion follows state.

Future additions may include:

- subtle antenna settle after acceleration;
- landing-strut compression;
- pulse-mount recoil;
- mining-emitter heat ramp;
- utility-pod service animation;
- damage-specific fan instability.

Avoid perpetual panel motion. A working ship is not a theme-park prop.

### 9.13 Performance posture

The live Kestrel consolidates static geometry by material and targets 16 pre-postprocessing mesh draws, with three decal planes and three dynamic drive components left separate. The reference GLB contains approximately 1.8k triangles.

This is appropriate for the current top-down camera. More geometry is not automatically higher quality. Add it when it improves silhouette, highlight flow, deformation, or a verified close view.

The live diagnostics remain the authority. Measure with bloom on and off because the bloom chain renders multiple passes and multiplies the cost of visible objects.

## 10. Standards for all future ships

### 10.1 Required deliverables

A production ship includes:

- editable source or deterministic generator;
- runtime implementation;
- engine-neutral interchange model where appropriate;
- manifest;
- named sockets;
- collision representation;
- LOD plan;
- neutral-light and gameplay-camera previews;
- filled silhouette sheet;
- material list;
- damage-state plan;
- performance capture;
- validation result.

### 10.2 Coordinate and scale contract

Until a deliberate migration changes the project convention:

- right-handed;
- +X forward;
- +Y up;
- +Z starboard;
- metres;
- pivot near visual/inertial center;
- attachment transforms in model space.

Do not apply undocumented import rotations. Conversion belongs in a version-controlled importer or wrapper.

### 10.3 Naming

Use semantic stable names:

```text
SF_<CATEGORY>_<Asset>_<Part>_<Side>_<Variant>
```

Examples:

```text
SF_SHIP_Kestrel_Drive_Main_A
SF_SHIP_Kestrel_Repair_Port_A
SOCKET_Weapon_Front
UCX_SF_SHIP_Kestrel_Hull_A
```

Use `Port`, `Starboard`, `Dorsal`, `Ventral`, `Fore`, and `Aft`. Avoid DCC names such as `Cube.042`.

### 10.4 Silhouette family

Within a faction, define no more than three dominant recurring motifs:

- mass arrangement;
- negative-space pattern;
- engine placement;
- prow language;
- tail/radiator language.

Across classes, change proportion and function before detail. A corvette is not a Kestrel scaled to 300% with more antennae.

### 10.5 Nested scale cues

Larger ships require multiple frequencies:

- **human scale:** hatch, rail, light, ladder, service label;
- **ship scale:** armor plate, engine, radiator, cargo door, structural rib;
- **architectural scale:** bay, tower, trench, repeated deck or logistics district.

A capital ship without nested scale looks like a small toy nearby.

## 11. Materials and textures

### 11.1 PBR workflow

Use metallic/roughness PBR. The project’s GLB references follow glTF 2.0’s material model.

Material categories should be discrete where physically possible:

- coated metal: low metalness, authored roughness;
- bare metal: high metalness;
- oxide/rust/dust: dielectric;
- ceramic/thermal tile: dielectric and rough;
- glass: low roughness, controlled transparency;
- emission: separate semantic mask.

Roughness does more work than base-color noise. A surface can share color and still feel different through micro-surface response.

### 11.2 Color space

- base color and emissive source artwork are authored in sRGB and decoded by the renderer;
- normal, roughness, metalness, and occlusion data are linear;
- glTF numeric factors are stored in linear space;
- do not double-convert CanvasTexture or imported color data;
- verify output color space and tone mapping in the live renderer.

### 11.3 Texture strategy

The current code-native model intentionally uses material factors and tiny procedural decals. A future authored texture pass should prefer:

- one compact hero atlas or trim set;
- normal details for shallow seams and fasteners;
- packed occlusion/roughness/metalness data;
- decal atlas for faction marks, serials, tallies, warnings, and damage;
- reusable trim sheets for common industrial structure;
- compressed GPU-ready formats when the runtime pipeline supports them.

Provisional resolutions at the current camera:

| Use | Typical target |
|---|---:|
| Player hero atlas | 1024–2048, only if shipyard view justifies it |
| Common ship atlas | 512–1024 |
| Shared trim/decal atlas | 1024–2048 across many assets |
| Background/debris | 256–512 |
| Masks/ORM | often half base-color resolution if tests permit |

Measure projected texel use. A 4K map that never occupies 800 screen pixels is not prestige; it is memory debt.

### 11.4 Edge treatment

Model edges that affect silhouette or produce important highlights. Bake or texture shallow features. Slightly exaggerated bevels are acceptable when the real-world bevel would vanish at gameplay distance.

The goal is perceptual truth under the actual camera, not micron-level simulation.

### 11.5 Wear sequence

1. clean material separation;
2. broad manufacturing variation at low contrast;
3. local roughness history;
4. causal edge/contact wear;
5. heat and residue;
6. repairs and replacement panels;
7. decals and serials;
8. damage states.

Never begin with a universal grunge layer.

## 12. Geometry, draw calls, LOD, and collision

### 12.1 Frame-time is the budget

The repository target is 16.7 ms at 60 fps and a 33.3 ms floor. The renderer budget is 7 ms and VFX 2.5 ms. These numbers matter more than any universal triangle count.

The bloom chain can render several passes. A ship draw call may be paid multiple times. Track both scene-level frame time and local asset structure.

### 12.2 Provisional asset budgets

| Asset role | Triangle guidance | Pre-post draw guidance | Notes |
|---|---:|---:|---|
| Player starter/hero at normal chase distance | 2k–20k | 8–20 | prioritize silhouette, sockets, damage, dynamic parts |
| Player hero with frequent close inspection | 10k–60k | 10–25 | only after camera evidence; use textures for shallow detail |
| Common small/medium ship | 500–8k | 2–8 | many may be visible simultaneously |
| Elite/signature enemy | 3k–25k | 6–16 | bespoke identity justified |
| Capital visible section | modular, 10k–80k | 10–30 | budget the visible section, not the off-screen fiction |
| Debris/background craft | 50–3k | 1–3 | pooling, instancing, and impostors encouraged |

These are alarms, not commandments. A 5k-triangle ship with 35 materials is worse than a 20k-triangle ship with a disciplined atlas.

### 12.3 Static batching

Merge static geometry by material where it does not destroy culling, animation, sockets, or damage breakup. Keep dynamic drive parts, weapon gimbals, landing gear, decals, and breakable modules separate.

The Kestrel demonstrates this balance: authored as many logical pieces, rendered as fewer material batches.

### 12.4 LOD

LOD should follow projected screen size, not only world distance. Starting thresholds:

- LOD0 above roughly 300 pixels projected width;
- LOD1 around 100–300 pixels;
- LOD2 or impostor below roughly 100 pixels when population warrants it.

Use hysteresis or fade where practical. Preserve nose, engine spacing, major negative space, and faction read across transitions.

### 12.5 Collision

- render mesh collision is not the default for moving ships;
- use a few convex volumes or the project’s collision primitive;
- separate combat hit regions only where gameplay needs them;
- preserve stable collision through cosmetic LOD changes;
- debug-visualize collision, sockets, and landing contacts;
- ensure weapons and mining tools clear the collision hull.

## 13. Lighting and post-processing

### 13.1 Respect the existing stack

The renderer already has fog, multiple directional lights, PMREM reflection, shadows, bloom, and tone-mapping support. The next quality gain comes from disciplined use, not indiscriminate increase.

### 13.2 Exposure

Maintain a stable normal-play exposure. Aggressive adaptation during combat makes UI, threat, and material values unreliable. Cinematic transitions may adapt deliberately.

The player ship must retain a readable midtone in the darkest normal sector without a permanent white outline.

### 13.3 Bloom

Bloom is punctuation. It should reveal the highest-energy few percent of the frame:

- drive core;
- weapon discharge;
- mining contact;
- shield failure;
- critical system event;
- rare environmental highlight.

Hull edges, every star, every window, every UI element, and every navigation lamp should not bloom together.

### 13.4 Environment grade

Sector palettes should shape the scene around neutral asset materials. The asset must not be recolored so aggressively that material categories collapse.

Keep the central combat corridor quieter than scenic periphery. Nebulae and planets should compose the frame rather than wallpaper it.

### 13.5 Shadows

Real shadows add grounding but cost fill and can become visually contradictory in open space. Use them most strongly near surfaces, stations, asteroids, and large structures. Contact shadows remain a useful fallback cue.

Review transparent emissive pieces and effects so they do not cast implausible opaque shadows.

## 14. Emissive and VFX language

### 14.1 Semantic color

A provisional grammar:

- **cyan / pale cyan:** stable navigation, sensing, Free Frontier identity, controlled drive energy;
- **warm amber:** cabin, service, heat, manual machinery, mining preparation;
- **red:** actual danger, hostile lock, critical failure, forbidden state;
- **violet/magenta:** exotic or non-human technology, not generic “cool” decoration;
- **white:** peak energy, short duration, center of an effect;
- **green:** reserve for explicit biological, safe-confirmation, or faction-specific use.

Hue alone is insufficient. Use pulse, shape, position, and intensity for accessibility.

### 14.2 Thrust

A main drive effect has:

1. a compact bright core;
2. a structured near plume;
3. a lower-opacity breakup layer;
4. optional distortion on higher quality;
5. sparse particles during high acceleration.

The effect begins inside the nozzle, responds within one rendered frame, and follows actual thrust. Trail direction follows velocity/force, not camera decoration.

### 14.3 Mining

Mining must feel materially different from weapons:

- sustained contact;
- tool and rock heat response;
- fracture debris tied to material;
- readable overheat ramp;
- lower explosive cadence;
- a visible emitter and contact point.

### 14.4 Impacts

Differentiate:

- shield impact — coherent surface spread and rapid decay;
- armor hit — directional sparks, flakes, local heat;
- internal damage — sustained venting, arcs, system failure;
- mining fracture — material-specific chips and dust;
- collision — mass-dependent debris and camera response.

An impact effect should reveal what was hit, not cover the entire object with the same explosion sprite.

### 14.5 Quality tiers

Every expensive effect needs a lower-cost form:

- distortion can disappear;
- volumetric-looking plume can become cards;
- particle counts can shrink while preserving timing and silhouette;
- dynamic lights can become emissive-only;
- persistent debris can be pooled and capped;
- high-frequency sparks can become a single authored flash.

## 15. Stations, environments, and props

### 15.1 Stations

Stations need nested scale and visible traffic logic. A docking port must be recognizable before the interaction prompt. Repetition is appropriate, but break it at command, habitation, repair, trade, damage, and ownership zones.

A station should answer:

- where ships arrive;
- where cargo goes;
- where heat leaves;
- where people live;
- what the faction values;
- what has failed or been replaced.

### 15.2 Asteroids and geology

Avoid uniformly noisy rocks. Use large geological logic:

- fracture planes;
- impact basins;
- strata;
- melt or metal veins;
- excavation scars;
- dust distribution;
- different roughness and breakup scale by resource.

### 15.3 Debris

Destroyed assets emit recognizable fragments that inherit material and construction logic. A Kestrel should break into engine ring, shoulder plate, utility pod, keel, and armor fragments—not generic gray cubes.

### 15.4 Surface props

Surface props are scale anchors. Service carts, clamps, cable runs, containers, lights, rails, and tools should reflect the same faction material language as ships while remaining legible at camera distance.

## 16. Camera, icons, UI, and marketing presentation

### 16.1 Camera-specific art review

For every important asset record:

- closest intended camera distance;
- smallest normal on-screen width;
- dominant visible surfaces;
- average background value and color;
- effect occlusion risk;
- orientation read during rotation;
- shipyard or cinematic framing.

Approve gameplay first, turntable second.

### 16.2 Icons

Icons derive from the runtime silhouette. At 32–64 pixels:

- remove minor antennae and panel noise;
- preserve forward direction;
- keep one identity accent;
- test against every UI state;
- avoid unrelated concept illustrations.

### 16.3 Shipyard presentation

The shipyard is a premium surface inside the game. Use a controlled three-quarter angle showing prow, canopy, shoulder gaps, drive, and upgrade points. Avoid extreme wide-angle distortion.

Show relevant modules and damage state. Do not present a pristine render if gameplay always shows a scarred ship.

### 16.4 Store screenshots

A store-ready screenshot set should prove variety, not repeat explosions:

1. Kestrel hero flight in a readable core sector;
2. close manual mining with clear tool/rock interaction;
3. faction contrast in a combat or escort encounter;
4. surface or station service scene with scale cues;
5. later-tier logistics/intervention view showing progression;
6. quiet narrative frame that demonstrates mood and UI restraint.

The same ship and material language must survive all six.

## 17. Asset pipeline

### 17.1 Folder contract

Recommended direction:

```text
assets/
  ships/
    <asset_id>/
      source/          # DCC or generator sources when appropriate
      runtime/         # imported/compressed runtime files if used
      previews/        # hero, silhouette, orthographic, damage states
      <asset>_manifest.json
src/render/
  ships/               # code-native bespoke builders
  visualOverrides.js   # narrow hero-asset registry
scripts/
  check-*.mjs           # committed validation
 tools/art/
  generate_*.py        # deterministic asset generation
```

The Kestrel package remains flatter for immediate compatibility. Migrate only with a path plan.

### 17.2 Source of truth

Every generated file names its source. Hand-editing a generated GLB or SVG without changing the generator creates a forked truth and is prohibited.

For a DCC-authored asset, the DCC file and export preset become source of truth. Runtime exports remain reproducible.

### 17.3 Hero override registry

`src/render/visualOverrides.js` wraps the existing visual factory. It only intercepts the player Kestrel. Every other entity continues through the mature procedural path. Failure returns the procedural fallback.

This is intentionally conservative. It allows bespoke assets to be introduced one at a time without destabilizing the catalog or rewriting the renderer.

### 17.4 Manifests

Each hero manifest includes:

- stable asset ID;
- display name and role;
- fiction sentence;
- coordinates and units;
- nominal and actual dimensions;
- runtime source;
- file map;
- geometry and file metrics;
- material roles;
- sockets;
- silhouette contract;
- wear rule;
- generator/source metadata.

### 17.5 Validation

`npm run check:art` verifies the Kestrel GLB header, version, binary length, bounds, material factor ranges, triangle count, socket set, file-size guardrail, and manifest agreement. The normal `npm run check` includes this validation.

Validation catches broken transport, not bad taste. Both are necessary.

## 18. Visual QA gates

### Gate 0 — brief

- gameplay role known;
- narrative sentence written;
- faction and tier known;
- camera and minimum screen size known;
- budget assigned;
- damage and upgrade needs listed.

### Gate 1 — silhouette

- recognizable at 96 pixels;
- forward direction clear;
- class and faction family legible;
- negative spaces survive rotation;
- scale cues planned.

### Gate 2 — construction

- thrust/load paths plausible;
- weapon, mining, docking, and landing clearances work;
- asymmetry has a reason;
- no floating modules;
- break points selected;
- sockets named.

### Gate 3 — materials

- categories distinct under neutral light;
- painted and bare surfaces respond differently;
- roughness carries history;
- accent hierarchy intact;
- emission remains semantic;
- wear is causal.

### Gate 4 — integration

- units, axes, pivot, normals, and scale correct;
- factory/override path works;
- fallback works;
- sockets align with gameplay;
- collision is stable;
- no missing textures or unsupported features;
- rebuild/disposal path does not leak.

### Gate 5 — motion and scene

- reads through gameplay camera;
- effects do not erase silhouette;
- thrust responds to state;
- damage is readable;
- darkest and brightest sectors pass;
- icon and shipyard agree with runtime.

### Gate 6 — performance and release

- diagnostics captured bloom on/off;
- target and floor frame budgets pass;
- p95 regression within tolerance;
- geometry, texture, and program counts settle;
- lower quality path passes;
- validator passes;
- source, runtime, manifest, and previews committed.

## 19. Review rubric

Score major assets out of 100. Below 80 does not enter final content. Below 65 returns to blockout rather than receiving more texture polish.

| Category | Points | Test |
|---|---:|---|
| Silhouette and gameplay readability | 20 | recognizable, oriented, class-legible at actual size |
| World/faction coherence | 15 | obeys shared grammar while remaining specific |
| Construction logic | 15 | parts have purpose, attachment, heat/load/access logic |
| Material hierarchy | 15 | surfaces are distinct, causal, and correctly lit |
| Narrative specificity | 10 | implies history without noise |
| Motion, VFX, and state | 10 | effects and animation communicate gameplay |
| Technical integrity | 10 | scale, sockets, export, collision, LOD, validation |
| Performance | 5 | cost proportional to visible value |

A beautiful render with broken sockets is not a 90. A clean model with no identity is not a 90. Premium finish is cross-disciplinary agreement.

## 20. Upgrade roadmap

### Phase 1 — Kestrel integration and evidence

- merge the bespoke Kestrel path;
- capture normal play, mining, combat, shipyard, dark-sector, and surface views;
- record diagnostics with bloom on/off;
- tune scale and exposure from evidence;
- connect weapon/mining/trail VFX to named sockets;
- add damage-state hooks;
- verify rebuilds do not leak decal textures or materials.

### Phase 2 — first playable consistency

- replace or refine every placeholder visible in the first ten minutes;
- create Kestrel icon and shipyard composition from runtime silhouette;
- establish surface prop and mining material kits;
- revise first-sector station/dock for readable traffic and service logic;
- reduce competing background glow;
- align tutorial highlights with emissive grammar.

### Phase 3 — faction contrast

- create one bespoke Concord authority ship;
- create one bespoke pirate conversion of a recognizable base hull;
- revise paint profiles to affect construction and light behavior;
- create faction typography and decal atlas;
- capture side-by-side grayscale silhouettes.

### Phase 4 — progression silhouettes

- author two player-relevant upgrade/hull milestones;
- ensure each tier changes posture and function before detail;
- add authored damage and module states;
- build LOD/impostor policy from scene counts;
- connect logistics growth to visible traffic and infrastructure.

### Phase 5 — premium presentation

- final material/texture pass where camera evidence supports it;
- store-quality screenshot scenes;
- trailer shot list grounded in real gameplay;
- accessibility and color-vision review;
- Steam Deck/floor-profile capture;
- release visual regression set.

## 21. Known limitations of the Kestrel pass

This pass is deliberately honest about what it does not solve.

- The live model is code-native rather than a textured DCC hero asset. This preserves the current zero-build architecture and is appropriate to the game camera, but a future close inspection mode may justify UVs, normal maps, and higher-order bevels.
- The GLB is a neutral reference/interchange model, not the current runtime load path.
- The GLB does not embed the Canvas-generated motto/shark decals; those exist in the live model and are documented in the manifest.
- The pass does not remodel the remaining ship catalog.
- It does not create final damage meshes, LOD switching, or engine-specific collision assets.
- It cannot substitute static validation for the repository’s required live before/after performance capture.
- The design uses existing fiction and palette data but should continue to evolve if later narrative documents introduce stronger constraints.

These are boundaries, not evasions. The important change is that the project now has a concrete asset, pipeline seam, and review standard from which the next work can proceed without ambiguity.

## 22. Minimum acceptance criteria for the starter ship

The Kestrel is ready for a first-playable visual sign-off when:

- its silhouette is recognizable at the smallest normal camera scale;
- its forward direction remains clear in grayscale;
- the single axial drive and split shoulders survive effects;
- the cyan centerline remains subordinate to shape;
- pulse and mining effects originate from their sockets;
- landing hardware aligns with surface presentation;
- `BORROWED TIME` is readable in shipyard and unobtrusive in flight;
- damage state can be understood without only reading the hull bar;
- the visual factory fallback remains intact;
- the art validator passes;
- live diagnostics pass target/floor criteria;
- no texture, geometry, or program count climbs after repeated rebuilds;
- the ship shown in icon, shipyard, screenshot, and gameplay is the same design.

## 23. Technical references

- Khronos glTF 2.0 specification: <https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html>
- Three.js WebGLRenderer documentation: <https://threejs.org/docs/pages/WebGLRenderer.html>
- Steam Deck technical specifications: <https://www.steamdeck.com/en-us/tech>
- Project performance contract: `design/PERF_BUDGET.md`
- Project visual master plan: `design/V2_MASTER_PLAN.md`
- Kestrel reference package: `assets/ships/kestrel/`

---

## Closing standard

SpaceFace should not look expensive because every surface is busy. It should look expensive because no surface, light, scar, motion, or interface element contradicts the world.

The Kestrel is the first sentence in that language: old warm armor around a dark mechanical spine, one white-hot cyan engine, a guarded face, one repaired shoulder, one improvised utility pod, a gun, a mining tool, thirteen names the ship refuses to explain, and a promise painted on borrowed metal.

Every later asset may reject its shape. None may reject its discipline.
