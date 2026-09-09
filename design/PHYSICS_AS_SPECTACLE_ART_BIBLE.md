<!-- LIFETIME: DURABLE -->
# Physics as Spectacle — art bible

**Status:** pre-gate visual authority and evidence contract. This document does not claim that the
R5 Ceres route, five-minute Ceres gate, R8 showcase, G0 admission, or any G0-G7 visual gate has
passed. Current lifecycle and acceptance remain owned by
[`PHYSICS_AS_SPECTACLE_PROGRAM.md`](program/roadmap/active/PHYSICS_AS_SPECTACLE_PROGRAM.md).

**Direction:** bright, kinetic, colorful arcade-industrial science fiction. Deep space is the
darkest layer; materially varied world geometry and faction-readable ships remain visible; active
machinery is bright; Massline, fields, weapons, collision, and destruction are brightest.

This bible freezes the pre-gate visual grammar. It is not a runtime asset, render specification,
palette allowlist, numeric performance ceiling, or substitute for an exact-candidate material bill.
Versioned support candidates wait for the dependency and exact R8 lease; matched evidence waits for
the frozen G0 candidate described in [§9](#9-dependency-and-candidate-bound-work).

## 1. Authority and supersession

When two visual prescriptions disagree, use this table rather than averaging them together.

| Source | Current use | Ruling in this bible |
|---|---|---|
| [`PHYSICS_AS_SPECTACLE_PROGRAM.md`](program/roadmap/active/PHYSICS_AS_SPECTACLE_PROGRAM.md) | Admitted program direction, dependency order, range cast, and gates | **Controls.** Bright force is read against colored, materially varied hulls and world geometry. |
| [`PHYSICAL_PLAY_GRAMMAR.md`](PHYSICAL_PLAY_GRAMMAR.md) | Non-admitted mechanics-level proposal and useful physical-play vocabulary | Retain continuous physics, shape-led force identity, white-hot cores, saturated falloff, dark edge contrast, directional motion, and no automatic camera takeover. Its global grey-hull/neutral-world aesthetic is superseded. |
| [`FIELD_TOOL_READABILITY_BIBLE.md`](vfx/FIELD_TOOL_READABILITY_BIBLE.md) | Field-specific form and accessibility reference | Its dated withdrawal notice controls contradictory later prose. Retain machine-not-orb, state-as-pose/event-as-pulse, direction encoded by form, grayscale survival through silhouette/motion, information-preserving accessibility, deterministic variation, bounded pools, and measured performance. |
| [`CAMERA_VISIBLE_BUBBLE.md`](graphics-sprints/CAMERA_VISIBLE_BUBBLE.md) | Accepted R1 production framing | **Controls supported framing.** Use 0-95 WU for the inner work lane, 95-125 WU for normal moving play, and 125-165 WU for physics-earned continuation. |
| [`VISUAL_ASSET_PRODUCTION_STANDARD.md`](../docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md) | Authored-media craft, material truth, G0-G7, promotion, and independent acceptance | Controls any later Blender/GLB or texture-backed support asset. A brief, technical receipt, or valid file is not accepted art. |
| [`VISUAL_ITERATION_PROTOCOL.md`](graphics-sprints/VISUAL_ITERATION_PROTOCOL.md) | Exact-candidate matched capture and review method | Controls evidence integrity, camera matching, motion review, accessibility variants, and independent verdicts. |

The following old prescriptions are explicitly **not** active requirements:

- grey PBR hulls or a globally desaturated world as the means of making forces important;
- the old 72-WU default chase framing or the historical 45-50 WU visible-bubble assumption;
- a closed field palette or a rule that hue must come from a small allowlist;
- a blanket non-additive rule or "the boundary never blooms" rule;
- a 2 px measure used as a loudness ceiling;
- a fixed six-draw ceiling or any other arbitrary visual-complexity quota;
- the retired ten-step fail-stop ritual or a deterministic occlusion test.

Bloom and additive light remain tools, not identity. They fail when they erase faction paint,
material separation, target silhouette, contact direction, or the primary gameplay verb.

## 2. Supported view and composition

All diagrams and later evidence are judged through the accepted production camera, not an invented
beauty camera:

- **0-95 WU ahead — inner collision/work lane.** Cause, immediate target, tether relationship,
  contact surface, and closest hazard belong here.
- **95-125 WU ahead — normal moving frame.** The primary anchor and enough interacting actors to
  explain the local situation remain readable here.
- **125-165 WU ahead — speed-revealed continuation.** Trajectory payoff, pursuit continuation, or
  the next collision consequence may enter here only through real physics-earned opening.
- **Beyond about 165 WU — approach/radar space.** It does not count as immediate activity at the
  normal chase camera.

Record the actual camera distance, FOV, viewport, route, projected bounds, and motion segment in
evidence. A close debug view may diagnose a defect but cannot approve normal-play readability.

## 3. Value and radiance ladder

The ladder is ordinal. It defines separation and dominance, not hard-coded RGB values, exposure,
material intensity, or bloom thresholds. Numeric targets may be frozen only against the exact R8
candidate on the declared hardware route.

| Level | Scene role | Required read | Bloom/radiance behavior | Rejection signal |
|---:|---|---|---|---|
| 1 | Void and far background | Deepest value layer; enough localized structure to establish place without flattening silhouettes | Normally sub-emissive; rare distant energy remains subordinate to local play | Raised black floor, full-frame haze, or background color competing with ships |
| 2 | Industrial world geometry | Varied rock, metal, ceramic, paint, dust, damage, and service history remain legible | Local work lights or hot machinery may bloom; the whole structure does not | Default grey/clay sameness, plastic roughness, or a silhouette visible only through rim light |
| 3 | Ships and faction identity | Hull form, faction paint, warnings, cargo markings, and role remain readable in motion | Localized emissives support identity; paint and solid materials remain present bloom-off | Dark anonymous hulls with tiny cyan/orange points, or recolor-only faction identity |
| 4 | Engines and active machinery | Working state and thrust direction are obvious but remain subordinate to the immediate hero force event | Bright cores and controlled sheath/work-light bloom; structural throats, housings, and load paths stay visible | Flat emissive disks, uniform glow, or machinery brighter than every current cause/consequence |
| 5 | Massline, fields, weapons, collision, and destruction | Brightest temporal layer; cause, direction, contact, and consequence read immediately | White-hot or high-radiance cores may bloom; shape, dark edge, motion, endpoints, and residue carry the read when bloom is removed | Generic circles, screen wash, directionless flash, or an effect whose identity disappears bloom-off/grayscale |

The highest layer is not permanently bright. Temporal contrast matters: ignition, loading, release,
contact, rupture, and decay create dominance, then yield the frame back to ships and terrain.

## 4. Five-role scene material bill

This is the shared scene-response bill. It does not replace the component material bill required for
each changed camera-visible 3D zone. Later asset briefs must still name function, origin, substrate,
manufacture, finish, interfaces, service history, expected optical response, and forbidden reads.

| Role | Substrate | Manufacture / finish | Optical response | Value / saturation | Emissive behavior | Forbidden reads |
|---|---|---|---|---|---|---|
| Void/background | Procedural deep space, sparse particulate structure, dark dust occlusion; not a ship material | Layered astronomical structure with localized lanes, clouds, stars, and distant silhouettes | Predominantly absorptive; small high-value points separated by true dark intervals | Lowest scene value; color may establish sector identity but stays below local solids | No uniform luminous sheet; distant emitters are isolated and subordinate | Grey fog, raised-black wash, wallpaper noise, or background ribbons that read as nearby gameplay |
| Industrial solid | Ferrous/non-ferrous alloy, refractory ceramic, rock/regolith, insulation, glass where functional | Welded, cast, rolled, bolted, machined, fractured, painted, abraded, repaired, or dust-loaded according to fiction | Distinct roughness, metalness, normal, AO, edge, cavity, and grazing-light response by substrate | Broad readable value separation; industrial colors, white ceramics, warning bands, mineral seams, and dirt are allowed | Only localized work lights, hot apertures, signage, or active interfaces | Default DCC material, uniform plastic, clay-grey sameness, baked-light albedo, or grime used to fake construction |
| Identity coating | Faction paint, primer, stencils, hazard markings, cargo labels, replacement panels, trim | Sprayed, powder-coated, anodized, plated, hand-stenciled, patched, chipped, or heat-discolored as fiction requires | Coating response remains distinct from exposed substrate; markings follow seams, access, and service logic | Strong faction/role color with sufficient value contrast to survive sector lighting and grayscale inspection | Markings do not glow by default; emissive identifiers are small, functional, and separately zoned | Whole-object tint, identical repaint across roles, unreadable near-black paint, or neon used as a substitute for faction construction |
| Active machinery | Refractory throat, hot metal, energized coil, radiator, drive hardware, work lamp, active tool | Engineered assemblies with visible housing, interfaces, cooling, restraint, and service access | Crisp structural response around a hotter core; temperature and work state may change response locally | Brighter than passive solids, with warm/cool differences serving function rather than a closed palette | Local cores, sheath, heat, and work lights may exceed bloom threshold while housings remain solid | Flat glowing disk, floating emissive card, whole-machine glow, or heat with no containment/load path |
| Force/event energy | Massline, field surface, compression front, projectile energy, contact flash, rupture, residue | Presentation geometry derived from real state/event receipts; not a fictional physical substrate | Anisotropic core/sheath, refractive or additive interface, dark edge, directional streak, contact plane, and decay as appropriate | Highest momentary value and saturation; color is redundant to form and motion | Bloom may amplify energy but may not carry identity; reduced-flash retains state, direction, and order | Generic orb/ring pileup, directionless flash, constant maximum intensity, premature explosion, or decorative motion contradicting simulation |

## 5. Matched evidence-sheet contract

### 5.1 Entry identity

Do not create final sheets until the program dependency is satisfied and a G0 candidate is frozen.
Every sheet and motion strip must record:

- exact start/end candidate fingerprint and relevant source/release hashes;
- Browser or Electron route, renderer/GPU, viewport, resolution, quality settings, and HUD state;
- exposure, tone mapping, output color space/color-management transform, and bloom configuration;
- exact background/sector visual profile, lighting state, and every visible subject's asset and LOD;
- scenario/seed, camera FOV/pose/settled distance, projected subject bounds, and the identical motion
  interval or event timeline;
- exact cast/loadout and whether the frame is ordinary, dense, or accessibility-reduced;
- capture transformation used for grayscale; grayscale is a review transform, not a replacement
  runtime palette.

No cell may change camera, exposure, background, time interval, composition, asset LOD, or effect
state to flatter a variant. A stale, unmatched, cropped, tiny, obscured, wrong-route, or wrong-hash
cell is `EVIDENCE_INVALID`, not a weak pass.

### 5.2 Required matched cells

| Cell | Required purpose | Must remain readable |
|---|---|---|
| Bloom on | Shipping hierarchy and energy dominance | Faction paint, solid materials, target silhouette, cause, direction, contact, and consequence |
| Bloom off | Prove bloom supports rather than owns the read | Force shape/endpoints, machinery structure, hull identity, contact normal, and trajectory |
| Grayscale | Remove hue as the primary discriminator | Pull vs push, Massline vs compression front, load/release/contact states, target/background separation |
| Emissive off — solid-material subjects | Prove authored material quality rather than glow compensation | Substrate, construction, roughness/material separation, markings, silhouette, and interfaces |
| Reduced motion | Preserve information without continuous animation | Static pose, taper, density gradient, endpoint asymmetry, compression/convergence direction, event order |
| Reduced flash | Preserve cause and consequence with bounded peaks | Contact location, direction, cause family, release state, breakup/rebound distinction, and residue |

For VFX, still sheets are accompanied by matched motion covering ignition, growth, sustain, decay,
cleanup, idle/ordinary/high-energy states, and pool saturation. Emissive-off is a solid-material
diagnostic, not a demand that an energy effect remain meaningful with its energy removed.

### 5.3 Review questions

A valid sheet must let an independent reviewer answer without telemetry labels:

1. What caused the motion?
2. Which way did force and the target travel?
3. Is this pull, push, arrest, line tension, or surface contact?
4. Did the target rebound, survive, or enter contact-driven destruction?
5. Which ship/faction and which industrial surface remain in the event?

## 6. Force-shape and motion matrix

The shared rule is **form identifies the verb; radiance identifies energy**. Reuse primitive
vocabulary only where the physical relationship is the same. A recolor is not a new force family.

| Family / live truth | Primary form | Motion grammar | Grayscale / reduced-mode carrier | Forbidden read |
|---|---|---|---|---|
| Massline — canonical tether relationship | Narrow white-hot core inside a saturated sheath; dark edge; two unmistakable contact endpoints | Energy travels along the line; meaningful load tightens and accelerates disturbances; ordinary release separates both visible ends with a short recoil | Line topology, endpoint asymmetry, travelling/tapered disturbance, retained load pose; reduced motion holds a directional long-exposure state | Generic beam, one-ended attachment, constant near-break alarm, or release that dominates the retained velocity |
| Concussion — `wpn_concussion_cannon_m` | Sharp contact flash plus short compression plane/wedge normal to the force path | Debris, sparks, and the target's trail change along actual incoming/contact direction | Plane orientation, wedge taper, target trajectory discontinuity, directional fragment cone | Spherical explosion, radial ring as primary shape, or damage spectacle that hides the momentum payload |
| Well / Mass Seed — `field_well_standard`, `mass_seed_standard` | Concave intake/funnel around a compact framed anchor; inward density toward the sink | Curved or spiral tracers converge; affected trails bend inward; loose matter follows the real field | Concavity, inward taper/crowding, anchor frame, and inward-facing static vanes/dashes | Glowing sphere, outward spokes, or particles that ignore actual affected-body motion |
| Repulsor — `field_repulsor_standard` | Convex pressure dome/front with a central clearing and outward-oriented ribs/berm | Straight radial divergence and expanding pressure; nearby matter moves outward when physics does | Convex silhouette, empty center, outward taper/spacing, static outward ribs | Intake spiral, generic aura, or dust moving outward without a real shove |
| Momentum Sink — `wpn_momentum_sink_s`, `status_momentum_sink` | Compressed/shortened target trail plus directional convergence toward the reference velocity | Flow closes on the target's actual relative-velocity error; trail length and separation reduce as real motion is arrested | Converging brackets/streaks, shortening trail, target-relative axis; reduced motion holds the compressed pose | EMP lightning, arbitrary stun sphere, velocity reversal, or a trail that claims slowdown before state changes |
| Collision / consequence — `combat:collisionConsequence` | Surface-aligned compression/contact plane with local fragments, dust, deformation cue, and residue | The receipt's normal is an **unoriented axis**: compression and fragments oppose or mirror across that axis while scale follows exchanged momentum/severity | Axis-aligned opposed/symmetric response, surface-local residue, rebound versus continued breakup | Pretending the normal has a causal sign, inventing incoming direction/target velocity, pre-contact explosion, terrain response on craft-only contact, or fragments unrelated to available receipt truth |

The accepted Well and Repulsor geometry remains the foundation. This matrix authorizes no rewrite of
their physics or wholesale replacement of their existing form. Momentum Sink is the missing
world-space convergence/compressed-trail read; it remains a presentation consumer of combat truth.

### 6.1 Shared directional-force kit contract

The future kit may share preallocated compression planes, tapered streaks, chevrons/brackets,
contact splinters, concave/convex ribs, and velocity-aligned trail segments. Each use must select a
physical form, axis, taper, density, cadence, and lifetime from real state or an immutable receipt.
The kit must remain bounded, pooled, deterministic for gameplay-readable variation, allocation-free
in its hot path, and inspectable under saturation. It is not one generic circle recolored six ways.

## 7. Causal fling storyboard

This is a truth map, not a scripted kill. A target may rebound or survive; the storyboard branches
at real contact rather than forcing destruction.

| Panel | Canonical source | Visible beat | Truth constraint |
|---:|---|---|---|
| 1 — latch | `tether:latched` plus the canonical attachment snapshot | Both endpoints acquire, line topology becomes unambiguous, target remains itself | No visual latch without an admitted attachment; no camera retarget |
| 2 — load | Live tether phase/load, target velocity, and attachment geometry | Line tightens, disturbances accelerate, target instability/tumble may become visible | Ordinary load does not look like constant imminent snapping; presentation does not add force |
| 3 — release | `tether:released` | The two visible ends separate with a short recoil ripple | A normal cut is not a violent break; no break sparks, injected impulse, or automatic camera aim |
| 4 — rating/handoff | `tether:releaseRated` and the same-tick release truth | Messy/good/clean/razor shape/cadence may qualify the recoil; visual dominance immediately passes to the released body's retained motion | Rating classifies the real release and is single-use; it never writes velocity or fabricates a destination |
| 5 — trajectory | Live target velocity and presentation derived from that velocity | Translational trail aligns with actual motion while spin ribbons/hull smear remain separate rotational cues | No cursor-predicted trail, stale release target, boost-authored speed, or decorative curvature |
| 6 — contact | `combat:collisionConsequence` | Surface-local compression, flash, dust/fragments, rebound/tumble, and severity appear at real contact | Position, surface, exchanged momentum/severity, and an **unoriented** normal axis come from this receipt. Use opposed or symmetric response about the axis; it does not supply signed incoming direction or target velocity. |
| 7 — consequence branch | `entity:killed.presentation` when combat actually kills; otherwise the surviving entity snapshot | Cause-specific breakup inherits target motion and killing direction when the lethal receipt supplies them, or the target visibly rebounds/survives | Signed direction/target velocity exists here only for lethal `entity:killed.presentation`, or later through a future owner-issued receipt. Never infer it from panel 6's normal axis; no destruction before contact, injected kill, or second damage owner. |
| 8 — residue/continuation | Existing phased-explosion lifecycle, pooled residue, and live player/camera state | Secondary internal event and persistent local residue decay while player control and chase framing continue | No hit-stop, killcam, focus takeover, leaked pool residents, or residue detached from the contact site |

Cause, trajectory, and consequence must remain one continuous event. A bright cause with an unreadable
trajectory, or a readable throw ending in an unrelated generic explosion, fails the storyboard.

## 8. Initial support-family briefs

These are briefs only. They do not create runtime IDs, authorize source/release mutation, admit a
render package, or claim an asset gate. Resolve exact candidate hashes from the live manifests at the
future leaf entry; do not copy volatile hashes into this bible.

### 8.1 Dart breakup pieces

- **Exact live donor ID:** `wholeship_ashline_dart`.
- **Live source/release truth:** `assets/ships/parts/wholeships/ashline_dart.glb` and
  `assets/ships/release/parts/wholeships/ashline_dart.glb`.
- **Editable family source:** `assets/ships/m4_ashline/blender/ashline_dart_production.blend`.
- **Required read:** a small bounded family of recognizable Dart structural zones with inherited
  sodium-red/amber identity, exposed substrate, rupture surfaces, and scale appropriate to the R1
  camera. Piece velocity inherits target motion and killing/contact direction.
- **Boundary:** do not make Ashline V2 remaster acceptance a showcase dependency. Do not repurpose
  `place_debris_chunk`; it is a Meridian pressure-module fragment with the wrong identity and
  material story. Do not replace or mutate the accepted Dart donor to obtain breakup pieces.

### 8.2 Rock chips and dust

- **Exact live donor IDs:** `place_asteroid_seamed` and `place_asteroid_rock_a`.
- **Live source/release truth:** `assets/ships/parts/places/place_asteroid_seamed.glb`,
  `assets/ships/release/parts/places/place_asteroid_seamed.glb`,
  `assets/ships/parts/places/place_asteroid_rock_a.glb`, and
  `assets/ships/release/parts/places/place_asteroid_rock_a.glb`.
- **Editable seamed source:** `assets/ships/parts/blender/place_asteroid_seamed_authored.blend`.
- **Editable Rock A source:** `assets/ships/m4_helios_hub/blender/helios_rock_a_production.blend`.
- **Required read:** mineral/regolith chips, dust color, density, axis, and residue match the actual
  contacted surface. A nonlethal collision uses opposed/symmetric emission around the unoriented
  contact axis and scales from exchanged momentum; signed bias is allowed only when a lethal or
  future owner-issued receipt supplies it. Dust remains surface-local and subordinate to the causal
  trajectory.
- **Boundary:** no universal brown puff, ambient burst without contact, emissive ore substitute,
  base-rock replacement, or false terrain response on craft-only contact.

### 8.3 Shared directional-force shape kit

- **Exact live reference IDs:** `wpn_concussion_cannon_m`, `field_well_standard`,
  `field_repulsor_standard`, `mass_seed_standard`, `wpn_momentum_sink_s`, and
  `status_momentum_sink`.
- **Runtime ID:** none is admitted by this brief. The future leaf must decide whether each resident
  is procedural/instanced geometry, pooled sprite/streak data, texture-backed material, or a measured
  combination before any asset or manifest path is created.
- **Required read:** one shared implementation vocabulary supplies distinct compression,
  convergence, divergence, contact, and velocity-aligned forms without collapsing them into one
  visual family.
- **Boundary:** retain existing Well/Repulsor geometry and physics; add no field, damage, status,
  force, velocity, save, camera, or AI writer. No runtime asset promotion follows from this brief.

## 9. Dependency and candidate-bound work

The authority/contract in this file may exist before the showcase candidate. Support candidates and
matched evidence enter at different points in the controlling program sequence:

```text
accepted/published R3
  -> R5 Ceres reference pocket
  -> accepted five-minute Ceres gate
  -> exact R8 implementation lease
  -> versioned support candidates composed into the route candidate
  -> frozen G0 Browser/Electron candidate
  -> matched evidence and support-family acceptance review
```

After the accepted five-minute Ceres gate and an exact R8 lease, the implementation leaf may allocate:

- versioned Dart-derived candidates under the owned `assets/ships/m4_ashline/` family root;
- versioned rock-response candidates under the owned `assets/ships/m4_helios_hub/` family root;
- `assets/fx/physics_spectacle/` only when a measured, texture-backed force resident is actually
  required.

Those versioned candidates must be composed into the Browser/Electron route before G0 freezes the
candidate. Only after that exact G0 fingerprint exists may the leaf allocate the matched evidence
packet under
`design/graphics-sprints/evidence/physics-as-spectacle/<candidate-fingerprint>/` and begin visual
acceptance review. Evidence from a pre-support or otherwise different fingerprint is invalid.

Do not predeclare GLB filenames or registry edits. The implementation trace must first determine
whether each support family is authored mesh, instanced primitive, sprite/texture, or a combination.
If a live GLB is ultimately required, follow asset brief/material-truth preflight -> versioned source
candidate -> source-candidate craft/technical evidence -> source manifest -> generated release build
-> runtime map -> frozen G0 route evidence and matched acceptance review. Never hand-edit generated
release metadata merely to advertise an unaccepted candidate.

## 10. Acceptance of this bible

This document is ready for use only when an independent reader can confirm:

- the admitted bright, colored, materially varied hierarchy clearly supersedes the grey-hull rule;
- all five scene roles state physical response, value/radiance order, emissive behavior, and
  forbidden reads;
- pull, push, arrest, line tension, concussion, and contact remain distinct by form and motion in
  grayscale and reduced settings;
- the evidence matrix is exact-candidate and matched, including bloom-on/off, grayscale,
  solid-material emissive-off, reduced-motion, and reduced-flash cells;
- every fling panel maps to a canonical state, event, or immutable receipt and never fabricates
  motion, contact, death, or camera ownership;
- the three support briefs point to the exact live donor/reference IDs while making no runtime,
  manifest, promotion, or G0-G7 claim;
- links resolve and no sentence advances program lifecycle or acceptance.

## 11. Non-goals

- redesigning physics, AI, damage/death ownership, controls, camera, or the renderer;
- replacing accepted Massline, Well, Repulsor, tumble, velocity, pooled VFX, or phased-explosion
  foundations;
- authoring support assets, runtime IDs, manifests, or render packages before the accepted
  five-minute Ceres gate and an exact R8 implementation lease;
- authoring matched captures or promotional art before the support-complete Browser/Electron
  candidate is frozen at G0;
- making every hull bright, every material saturated, or every event bloom;
- remastering the full cast, substituting the stopped express-liner donor for the accepted Lark, or
  treating the later five-cell/four-wave scale-out as pre-gate work;
- using fixed visual budgets, golden rerecording, quality reduction, density reduction, scripted
  contact, injected kills, or fabricated VFX to obtain acceptance.
