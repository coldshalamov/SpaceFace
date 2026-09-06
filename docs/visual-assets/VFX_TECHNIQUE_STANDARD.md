<!-- LIFETIME: STABLE -->
# VFX technique standard

Governs every player-facing effect **and every world dressing that can be mistaken for one**:
thrusters, weapons, impacts, shields, mining, massline, explosions, debris, dust, gas, hazards,
pickups, nav lights, and the space you fly through.

The owner's standing direction, quoted because it is the acceptance bar and not a mood:

> whatever plan you come up with and however advanced it is, you should then ask yourself what 3x
> more attention to detail and advanced technique would produce, whatever quality all of these
> prompts would induce you to create, you should do 3x better than that instead

**PQ-190.01 scope.** This is the effect-class routing and reusable recipe contract, not a palette,
a fleet remaster, a runtime migration, or visual acceptance. Its source baseline is
`873584d9e6301e23edfc599bdf48f74c16bc787a`. No admitted `.00` shipping-camera result is supplied by
that baseline's packet/receipt route, so this revision relaxes **none** of B1–B19. A later exception
needs `.00` evidence bound to the exact candidate and camera; calling a technique a hybrid is not
that evidence. Existing inventory statuses are unchanged.

The `assets/concept/` thruster reference — sharply defined curling plasma sheets, bright folds and
dark separation — is an **engine-jet** reference. It does not require rocks, smoke, shields or the
sky to become blue ribbons. Select construction by the effect's job, then apply the shared rules
in §3 and the unchanged rejection register in §4. Geometry, authored textures, simulation bakes and
hybrids may contribute in different proportions within those constraints. No technique name, vertex
count or screenshot alone proves that the result has designed internal form.

## 1. Effect-class matrix

One row per class. “Preferred” is the construction to prototype, not a mandate to replace working
owners. The play-scale column is the minimum visual information to preserve through LOD and density;
it is not permission to simplify the effect to an icon. B-numbers refer to §4, not extra bans.

| Effect class | Preferred construction to prototype | What must survive at play scale | What to reject |
|---|---|---|---|
| **Engine jet** (`engine-jet`) | Short nozzle-local shock structure with evolving swept, curved sheets/streamlines; authored or simulation-baked detail and bounded heat support. Treat retro/RCS pulses as jets, not mini histories. Use the sheet and frame rules M2/E2, not an isotropic smoke substitute for plasma folds. | Nozzle origin, force direction, spool/boost/retro state, bright folds separated by dark interior, flow at a fixed ship pose, and individually dissolving reaches. A short jet must still read while stationary. | B1–B3, B5–B12, B14, B16–B19: a striped cone, glowing primitive, uniformly soft plume, static bolted-on body, net of wires, or clipped common back edge. |
| **Flight history** (`flight-history`) | Recorded world-space paths rendered as curved ribbons/sheets with authored cross-section and view response. Keep instantaneous velocity/speed streaks a distinct, non-history cue; neither is the jet object. Apply E2 to the actual pose record. | The flown curve, direction and age ordering remain legible through turns, stops and emitter rotation; current speed cues remain distinguishable from past positions. Preserve enough concentration to read a wake rather than isolated wires. | B6–B7, B9–B11, B14–B19: rigid ruler/tape tails, synthetic full-length history behind a stationary ship, frozen scrolling forms, uniform cutoffs, or opacity hiding a broken path. |
| **Heavy impact** (`heavy-impact`) | A timed contact/ignition core, oriented compression front, and solid spall/debris; authored/simulated detail on shaped geometry or a geometry/texture hybrid. Small hits, weapon discharge and destruction scale their own causal recipe, not one enlarged glow sprite. | Contact point and force axis, a sharp impulse distinct from its expanding aftermath, structured hot/cold interior and material kick. Small hit, concussion and destruction remain different events at the actual combat density. | B1–B6, B8–B10, B16–B19: blurry flash as the entire event, bare emissive ball, clipped card/front, static noise, identical repeated rings, or no designed internal breakup. Do not fabricate a signed force from an unsigned collision axis. |
| **Shield response** (`shield-response`) | Surface-conforming patches/shell segments and bounded field geometry with authored stress/ripple detail; state-driven radiance on a designed surface. This class also routes bounded force fields and world-space state tells, not screen UI. | Where contact or influence lies, its extent, direction/propagation and the distinct states of activation, load, failure and recovery. The protected body or affected region stays readable behind the response. | B1–B2, B5–B10, B16–B19: permanent equally bright bubble/trim, a radial aura instead of a response, clipped patch, noise-only interior, or a flat emblem that hides the affected body. |
| **Gas/smoke/dust** (`gas-smoke-dust`) | Authored or simulation-baked evolving volumes, shaped simulated meshes, or a depth-aware volume/mesh/texture hybrid. Resolve body-scale density, lobes, cavities and occlusion first; M3 governs thinning and detail. Isotropic integration may portray gas, not substitute for sheets/filaments (B12). | Volume and internal structure, hot-to-cold evolution where relevant, inherited motion, dispersal and depth against nearby matter. The player can pass it without discovering a rotating square or losing the action behind a fog blanket. | B1–B6, B9–B10, B12–B13, B16–B19 as applicable: cotton-wool cards, star-sprite dust, noisy flat planes, uniform grey static, a translucent solid primitive, or blur presented as designed smoke. |
| **Debris/cargo** (`debris-cargo`) | Opaque lit authored solids, instanced where useful, with real silhouette, material response and tumbling or carried motion. Textures describe surfaces; local heat or pickup accents support the object rather than replace it (M1). | Solid mass, orientation/trajectory, cargo or resource identity, and separation from background. Wrecks, rock/ice chips and useful objects remain matter at the shipping camera, including when emission is absent. | B2, B4–B5, B13: point confetti, see-through glowing rocks, a halo as cargo, or a distant-star exception applied to fly-through matter. Also reject a generic primitive with no authored construction/material identity. |
| **Massline** (`massline`) | A spatially coherent cable/ribbon/curved band with designed cross-section and tension-driven travelling structure; localized attachment and snap response. Compose load, release and retained-motion cues from the actual line state, using M2/E2. | Both endpoints and the loaded curve, tension change, latch versus snap versus clean release, and the body's continuing motion. The line reads as a force connection, not exhaust or a painted screen stroke. | B1–B2, B5–B10, B16–B19: flat neon line/ring icon, fixed decorative pulse, disconnected endpoints, clipped span, invented release burst, or a bright blanket hiding the coupled bodies. |
| **Background** (`background`) | Authored far-sky layers, designed planetary/comet imagery and spatially coherent large forms; the existing tiny sky-star/flare exception remains narrow. Use regional composition rules C1–C3; use a fly-through class for anything the player can pass. | Sky depth, landmark/region identity, continuous layer boundaries and quiet separation behind ships and action. Star points remain tiny; authored impostors retain the internal form of their intended celestial object. | B1–B2, B4–B6, B9, B13 subject only to the existing sky exceptions: blurry stand-ins for nearby matter, dusty static at ship scale, hard layer/card edges, or bright background patterns competing with gameplay. |

## 2. Family assignment — one primary class per family

This is the single classification register. A **family** is the player-facing event/state recipe,
not a pool, a shader, an inventory entry or a source file. Multiple owners/variants of a family
inherit its row; a port of a reference family is not a second family. Class labels route technique:
“heavy impact” also covers its smaller contact/discharge relatives, and “shield response” covers
bounded field/state responses without claiming that every field is a shield.

Composite recipes retain one primary assignment. Their supporting smoke, fragments, sheets or
history must satisfy the relevant M/E rules in §3; borrowing a substrate does not borrow an
exception or give the whole family a second class. Independently owned persistent matter/wakes use
their own rows below. In particular, a nozzle's jet and its recorded history are distinct families.

The live owner routing is visible in `src/render/vfx.js` (navigation index and event handlers),
`src/render/vfxProfiles.js`, and its imported thruster, weapon, energy and presentation owners.
Reference IDs come from `src/vfxnext/index.js` and `src/vfxnext/families/`; they are classified even
where the library remains unwired. This register is **not** a declaration that every listed
implementation passes §4 or has been promoted to the default route.

| Existing family / aliases or variants | Primary class | Owner / boundary |
|---|---|---|
| Main-drive jets: ion small/twin, industrial, resonator, vector, plasma-ring profiles; player plasma stream and NPC/fleet drive variants | `engine-jet` | `src/render/vfxProfiles.js` engine profiles; `src/render/thruster/` recipes/systems. Profile colours are existing data, not a new palette law. |
| Reverse/retro and RCS impulse jets | `engine-jet` | `RcsImpulseSystem`, retro recipes and reverse-nozzle emission in `src/render/vfx.js`. |
| `thruster_boost` | `engine-jet` | Reference propulsion family; boosting is a jet-state recipe, not permission to lengthen history. |
| Engine contrails and persistent nozzle histories | `flight-history` | `src/render/thruster/ribbon/contrailTrail.js`; history outputs of `src/render/engineTrailSurfaces.js`. |
| Dash/cruise/direct-travel vector wakes and instantaneous speed streaks | `flight-history` | Travel/dash handlers in `src/render/vfx.js`; speed cues are not fabricated pose history. |
| `speed_extreme` | `flight-history` | Reference propulsion family. |
| Weapon discharge and carried projectile presentation: ballistic, energy, beam and explosive muzzle/body/tracer/wake variants | `heavy-impact` | `src/render/vfxProfiles.js`, `src/render/weapons/`, `src/render/combat/persistentBeams.js`; an attached projectile wake is support within this weapon recipe. |
| `impact_normal` — normal projectile contact, sparks and spall | `heavy-impact` | Reference impact family and live `_onProjectileHit` / `_impactSparks` counterparts. |
| `impact_concussion` — heavy/kinetic hit, concussive slam and collision-axis variant | `heavy-impact` | Reference impact family and live `_onCollisionConsequence`; `impact_collision_axis` is its lab scenario, not another family. |
| `destruction_light` — non-capital death/ignition beats | `heavy-impact` | Reference destruction family and live `_emitDestructionLightBeats`. |
| `explosion_heavy` — large/capital destruction and phased blast fronts | `heavy-impact` | Reference destruction family; live queued/phased explosions. |
| Mining beam/contact, charge detonation and work/yield flashes | `heavy-impact` | Mining and `_onChargeDetonated` handlers in `src/render/vfx.js`; independently persistent yield objects belong to the matter row below. |
| Shield hit/ripple, damage absorption and shield failure/recovery | `shield-response` | Shield/damage response in `src/render/vfx.js` and its energy materials. |
| `field_attractor` | `shield-response` | Reference field family; bounded attractor/mass-seed field counterparts, not Massline cable presentation. |
| `field_repulsor` | `shield-response` | Reference field family and bounded repulsor counterparts. |
| Bounded hazard/energy volumes and momentum-sink influence/state cues | `shield-response` | Energy and momentum-sink presentation imported by `src/render/vfx.js`; physical gas/dust is not the field boundary cue. |
| World-space action/state tells: AI doctrine/flee/formation, law heat/scans, station/NPC/Ceres work signatures, charging/jump cues, nav/tool/seam lights and markers | `shield-response` | Presentation-cue and job/law controllers; only the in-world optical/state output is covered, not HUD/screen chrome. |
| Emitted combustion, lingering smoke, soot and dust clouds | `gas-smoke-dust` | Independently emitted matter in live VFX pools; pool membership does not license a soft-card silhouette. |
| Environmental fly-through gas, dust, haze and particulate fields | `gas-smoke-dust` | World-dressing owners; not a sky-star exception even when distant in one frame. |
| `reentry` | `gas-smoke-dust` | Reference reentry family: hot compression/matter envelope with wake support, not an engine nozzle. |
| Solid spall, mining chips, rock/ice fragments, wreckage and debris fields | `debris-cargo` | Independently persistent/tumbling matter; supporting fragments inside an impact remain part of that impact recipe. |
| Cargo/resource/loot/pickup bodies and their collection/magnet accents | `debris-cargo` | Pickup/yield/loot presentation and solid-object owners; the object carries identity, not its accent. |
| `massline_latch` — attachment receipt | `massline` | Reference Massline family and live `_onTetherLatch`. |
| `massline_tension` — loaded cable/field and load evolution | `massline` | Reference Massline family and live `_updateTetherCable` / Massline presentation. |
| `massline_release` — snap/clean release and retained-motion presentation | `massline` | Reference Massline family and live release/snap/arc owners; preserve the live particle-silent clean-release grammar. |
| Massline arc/aim preview and coupled-body momentum/tumble cues | `massline` | Arc-preview and Massline presentation owners; preview is distinguished from an attached loaded line. |
| Tiny sky stars and sparse sky flares, including legacy starfield variants | `background` | `src/render/spaceBackground.js`, `src/render/deepFieldStars.js`, legacy starfield; only the inventory's existing star-sky exception IDs. |
| Far-sky planets, authored comet, nebular/large sky forms and parallax composition | `background` | `src/render/spaceBackground.js` and background layers; existing distant-impostor records do not grant play-scale permission. |

### Inventory is evidence, not a second family register

[`SOFT_CARD_INVENTORY.json`](./SOFT_CARD_INVENTORY.json) continues to record the actual constructions,
files and status. Its `vfx-sprite-puffs` and `vfxnext-billboards` entries cover shared multi-family
substrates; neither is a newly approved effect family. Their `banned-live` / `library-unwired`
statuses remain. The star/flare allowlist and distant-impostor records are not broadened.

`star-texture-factory`, `startup-gpu-residency-proxy`, `graphics-lab-sprites` and
`asteroid-tier-badges` describe a factory, an offscreen upload mechanism, lab examples and UI chrome,
respectively, not additional world-effect classes. The unused legacy starfield remains unused.
Listing, classifying or renaming something never clears its rejection or changes its live status.

## 3. Derived rules — one shared contract

The matrix owns construction choices; this section owns reusable material, effect, LOD and
composition rules. A downstream recipe references these rules rather than copying a competing
version into an asset brief. These are source-candidate rules, not invented `.00` measurements or
approved numeric material/palette settings.

### Material families

- **M1 — Solid matter.** Rocks, ice, debris, wreckage and cargo are opaque, lit and carry a real
  silhouette and authored surface identity. Heat/emission is a property of that surface or a
  separate volume, never a substitute for the object. Surface response is selected for the object's
  fictional material and state; no universal metalness, roughness or permanent trim prescription.
- **M2 — Luminous sheets and surfaces.** A sheet/ribbon needs a curved cross-section and
  view-dependent grazing-angle edge brightening; a lit solid or gas volume does not inherit the
  sheet equation. Hot cores reserve deliberate HDR headroom above 1.0 with a stated bloom intent.
  Temperature/radiance and reach carry activation; alpha is not a throttle animation channel.
  Designed internal separation must exist before bloom. B7/B8/B17 remain in force.
- **M3 — Participating matter.** Transparency represents real dilution, edge runout and dispersal.
  Concentrate material enough for a coherent body with legible internal structure; do not spread
  fixed material into a net and fade away the gaps. Depth-aware soft intersections are required
  where an effect meets geometry. Thin-sheet creases and volumetric gas are different structures
  (B12); neither a density integrator nor a soft mask is a universal recipe.
- **M4 — Detail and source art.** Fine detail comes from simulation or authored art, not final-art
  hash noise. Blender/Mantaflow simulation and baking remain the source-art route; see
  `tools/vfx/AGENTS.md` and `assets/fx/AGENTS.md`. Continuous/infinite procedural transport fields
  (for example curl-field advection) remain legitimate, but do not become the final visible art.
  Authored textures may describe shaped surfaces, volumes and already admitted far-sky impostors;
  they do not legalize a blurry card. A flipbook requires motion-vector interpolation rather than
  slideshow playback. M4 does not relax B1 or extend the B2/B4/B13 exception.

### Effect recipes and frames

- **E1 — One recipe record.** Name the assigned family/class, live owner, causal event/state,
  coordinate frame, silhouette/internal-form source, material family, temporal envelope, support
  layers, play-scale invariant and measured cost. Variants reference the family and override only
  their real differences. A library recipe or static definition is not evidence of live wiring.
- **E2 — Frame truth.** A short jet may anchor its shock structure near the nozzle, as the previous
  standard already allowed; emitted material evolves/ages in world space rather than becoming a
  solid rigid attachment (B11). A history records positions actually occupied by its emitter and
  never advects them along the current exhaust axis (B15). They are separate objects (B14).
  Attached shield/line surfaces follow their actual surface/endpoints; free matter inherits the
  producing body's motion. A velocity cue is labelled as current motion, not historical evidence.
  Preserve signed direction versus unoriented collision axis; do not invent a force direction.
- **E3 — Temporal structure.** Flowing effects use travelling structure (position minus time) plus
  slower evolution, not a frozen emission-state image. State transitions and one-shots have explicit
  asymmetric attack/release; cooling is slower than lighting up, with reach/heat changing rather
  than opacity. Vary element reach, size and lifetime so material runs out before mesh/UV bounds,
  never at one shared terminal plane. These requirements govern emitted/energized effects; an
  opaque cargo hull is not required to flow, dissolve or exceed a bloom threshold.
- **E4 — Composition inside a family.** Give each supporting layer a job and a termination; do not
  replicate the same full silhouette as several halos. Support may use a minor term allowed by §4
  but cannot become the silhouette/structure/detail carrier. A smoke or debris layer does not
  change the primary assignment, and an existing banned pool does not grant a new exception.

### LOD rules

- **L1 — Protect the matrix invariant.** Judge projected size at the shipping camera, not a close
  lab view. Reduce secondary counts, subdivisions, distant temporal detail and support layers
  before the identifying form, state, recorded path or force relation. At each used tier the family
  still reads; a blurred card, bare primitive, star point or invisible history is not an LOD.
- **L2 — Budget the mixed scene.** Record draw/instance counts, overdraw, texture residency, update
  work and the runtime-witness/frame-time result for quiet flight, dense combat and the rover as
  applicable. Pooling, batching, culling and cadence are tools, not evidence by themselves. Do not
  lower default quality or remove authored identity to buy a pass; no universal polygon, texture or
  particle quota is introduced here. Static checks cannot supply these measurements.
- **L3 — Preserve transitions.** LOD/culling changes must not expose geometric/card boundaries,
  pop a state, reset a history, or make matter rotate toward the camera. Keep essential event/line
  cues under saturation; measure both the worst-case composition and the transition in motion.

### Regional composition profiles

- **C1 — Attention follows state.** Allocate primary action, secondary bodies and atmosphere in
  the same scene. Emission identifies an active event, force, load or useful machine state; it is
  not permanently equal-bright decoration. Preserve body and action legibility at density rather
  than globally darkening the world or turning up bloom.
- **C2 — Profiles, not a palette law.** `src/data/sectorVisualProfiles.js` remains the regional
  data owner. A later profile records landmark/atmosphere placement, lighting/value separation and
  local event headroom against the approved mixed scene. This matrix supplies no new colour table,
  global post/exposure setting, fleet-wide material conversion or claim that `.00` approved one.
- **C3 — Respect the play plane.** Background detail and world-state tells support navigation and
  action instead of masking them. Preserve existing reduced-motion/flash behavior and read the
  world beside the frontend direction; this packet does not change HUD, type, screens or render
  ownership. The frame/camera and profile are part of visual evidence, not variables to hide a
  failed effect.

## 4. Rejection register — preserved B1–B19


These are banned as the *primary construction or final art* of a player-facing effect or world
object. Each is listed with what it looks like on screen, so the ban can be applied without knowing
the jargon.

| # | Technique | What it looks like |
|---|---|---|
| B1 | Procedural noise (hash/value/Perlin/FBM) baked or sampled as the final FX art | grey-blue static; "shady smoke"; no readable shapes |
| B2 | Camera-facing soft-particle billboards — quads with radial alpha falloff | Super Mario clouds; cotton wool; puffs |
| B3 | UV-scrolled emissive cone or cylinder mesh | tiger-striped traffic cone; a solid shape pretending to be gas |
| B4 | Point sprites (`GL_POINTS`, `THREE.Points`) for sparks, embers, debris, dust, or any fly-through field | dots; confetti; pixel spray; a field of white squares |
| B5 | Untextured emissive primitives (sphere/cone/capsule/tetrahedron) as the object itself | glowing balls; see-through rocks |
| B6 | Gaussian-only cross-section (`exp(-r²)`) as the sole edge treatment | airbrushed; soft everywhere; no definition |
| B7 | Flat ribbons with no view-dependent term | plastic tape; party streamer |
| B8 | Output clamped at or below 1.0 with nothing left for bloom | flat sticker; no glow, no heat |
| B9 | Effect terminating at a mesh or UV boundary | hard cut-off; clipped tail |
| B10 | Visual state driven directly by an input with no attack/release envelope | popping; clipping instantly from small to big |
| B11 | Exhaust rigidly parented to the nozzle, rotating with the ship | plume reads as a solid object bolted on |
| B12 | Isotropic volumetric density integration used to portray sheets or filaments | soft smoke; cannot produce a crisp crease at any setting |
| B13 | Reusing the distant-star point-sprite at play scale | flying through a field of blurry white squares |
| B14 | One object serving as both a jet and a flight history | a horse's tail welded to the hull and dragged around |
| B15 | A history trail advected along the emitter's axis instead of recording where the emitter was | a full-length ribbon snapping into place behind a ship that has not moved |
| B16 | Deformation keyed only to state frozen at emission, so the form is constant in the emitter's frame | a still image being stretched and translated; nothing flows through it |
| B17 | Opacity used as an animation channel — fading an effect in and out with the input that drives it | a decal switching on; "shady glass"; cheap website translucency |
| B18 | Uniform extent across all elements of an effect, so they all end at the same place | a flat chopped-off back edge; a haircut cut straight across |
| B19 | Spreading a fixed amount of material over a large area to make it "soft" | a wireframe net; a tangle of individually visible wires with gaps between them |

A banned technique may still appear as a *minor supporting term* — for example a soft radial falloff
modulating a ribbon's own opacity — but never as the thing that carries the effect's silhouette,
structure, or detail.

**The only exception to B2 / B4 / B13** is distant background stars (and a handful of sky flares
that sit in that same sky). They must remain tiny, at sky depth, and never occupy the flight path.
Planet impostors may stay as far-sky cards of an authored planet texture. Nothing else inherits
this exception: not debris, not dust motes, not gas clouds, not pickups, not nav lights, not
hazards, not thrusters, not explosions.


## 5. Verification and handoff

A technique claim is only closed by a capture at the real gameplay camera distance, compared against
the appropriate class reference. Preview framings closer than the live chase camera do not count.
Judge normal-speed motion and the mixed quiet-flight, dense-combat and rover contexts that actually
use the family. The matrix's play-scale information must remain visible, including internal form
before bloom and the relevant turns, stops, intersections and state transitions.

`npm run check:vfx-techniques` keeps [`SOFT_CARD_INVENTORY.json`](./SOFT_CARD_INVENTORY.json) honest:
every live `THREE.Points` / `THREE.Sprite` / glow-card factory in the scanned trees must be listed,
and a new file cannot pick up the cheat without declaring it. Listing a new world-object as an
exception is itself a failure unless it is the star-sky allowlist. The checker also protects the
live player jet/history construction. It does not certify this table's taste, a library's live
reachability, or visual/performance acceptance.

For a matrix-only change, check all eight rows, single family assignments (including the twelve
reference IDs), unchanged rejection/exception semantics, link resolution and the exact write set;
run the focused checker and preserve that coherent candidate before optional prose polish. Keep
inventory statuses factual rather than marking old implementations accepted to obtain green.

PQ-190.01 remote output is a **source candidate**. Codex owns independent hash-bound visual review,
shipping-camera captures, runtime-witness/performance checks and integration with `.00` evidence.
The candidate does not close packet acceptance, authorize a migration, or update queue/NOW or any
other lifecycle ledger.
