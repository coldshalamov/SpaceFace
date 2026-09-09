<!-- LIFETIME: STABLE -->
# VFX technique standard

Governs every player-facing effect **and every world dressing that can be mistaken for one**:
thrusters, weapons, impacts, shields, mining, massline, explosions, debris, dust, gas, hazards,
pickups, nav lights, and the space you fly through.

The owner's standing direction, quoted because it is the acceptance bar and not a mood:

> whatever plan you come up with and however advanced it is, you should then ask yourself what 3x
> more attention to detail and advanced technique would produce, whatever quality all of these
> prompts would induce you to create, you should do 3x better than that instead

**The goal: see the force, follow the consequence, recover the solid world.** Effects should make
physical play inviting to understand: a shove has a contact and an aftermath; a loaded line connects
two bodies; an engine makes force while its wake remembers motion. Beauty comes from those distinct
shapes and rhythms sharing the scene, with bright machinery against substantial material.

**Owner's flight-history direction (2026-09-09):** the long, bright trail is intentional. It should
read like a luminous snake recording the ship's previous path, making direction obvious and fast,
nimble turns fun to watch. Preserve that generous length and brightness. Improve accurate bends,
continuity, flow direction and self-crossing readability; do not “clean up” the identity by shortening
or dimming it. The instantaneous nozzle jet remains a separate effect. Crossing a sky landmark alone
is not a failure; a false path, broken continuity or obscured actionable body is.
The jet and history should **look connected**: compatible width, fold/strand structure and flow,
continuous radiance/colour progression, and a short controlled handoff without a gap or doubled hot
spot. Separate objects are an ownership/coordinate-frame contract, not a requirement for visibly
different art. Blend their appearance without moving historical samples out of the flown path.

**PQ-190.01 scope.** This is the effect-class routing and reusable recipe contract, not a palette
or fleet remaster. It finishes the existing source candidate against the
[accepted .00 receipt](../../design/program/roadmap/receipts/PQ-190-00-material-candidate.md)
and its [image binding](../../design/program/roadmap/evidence/pq190-style-2026-09-06/binding.json).
Section 3 distinguishes observed recipes from prototype directions. All B1–B19 rejection outcomes
remain; the only narrowed prohibition is the shield-specific B17 qualification, supported by the
accepted transparent-panel sequence. Classification never promotes an inventory acceptance status.

The `assets/concept/` thruster reference — sharply defined curling plasma sheets, bright folds and
dark separation — is an **engine-jet** reference. It does not require rocks, smoke, shields or the
sky to become blue ribbons. Select construction by the effect's job, then apply the shared rules
in §3 and the rejection register in §4. Geometry, authored textures, simulation bakes and
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
Reference IDs such as `thruster_boost`, `impact_normal`, `reentry` and `massline_latch` date from the
retired `src/vfxnext/` reference library — unwired billboard work, deleted 2026-09-07 — and now live
only in this register. This register is **not** a declaration that every listed implementation passes
§4 or has been promoted to the default route.

| Existing family / aliases or variants | Primary class | Owner / boundary |
|---|---|---|
| Main-drive jets: ion small/twin, industrial, resonator, vector, plasma-ring profiles; player plasma stream and NPC/fleet drive variants | `engine-jet` | `src/render/vfxProfiles.js` engine profiles; `src/render/thruster/` recipes/systems. Profile colours are existing data, not a new palette law. |
| Reverse/retro and RCS impulse jets | `engine-jet` | `RcsImpulseSystem`, retro recipes and reverse-nozzle emission in `src/render/vfx.js`. |
| `thruster_boost` | `engine-jet` | Reference propulsion family; boosting is a jet-state recipe, not permission to lengthen history. |
| Engine contrails and persistent nozzle histories | `flight-history` | `src/render/thruster/ribbon/contrailTrail.js`; history outputs of `src/render/engineTrailSurfaces.js`. |
| Dash/cruise/direct-travel vector wakes and instantaneous speed streaks | `flight-history` | Travel/dash handlers in `src/render/vfx.js`; speed cues are not fabricated pose history. |
| `speed_extreme` | `flight-history` | Reference propulsion family. |
| Weapon discharge and carried projectile presentation: ballistic, energy, beam, concussion slug, vector mine / impulse-charge and explosive muzzle/body/tracer/wake variants | `heavy-impact` | `src/render/vfxProfiles.js`, `src/render/weapons/`, `src/render/combat/persistentBeams.js`; an attached projectile wake is support within this weapon recipe. |
| Causal structural accents: `direct`, `bank`, `chain`, `collision`, `terrain`; kill / ricochet / bounce aliases | `heavy-impact` | `src/presentation/causalVfxGrammar.js`, `src/presentation/cueArbitration.js`, live structural-burst handlers and `src/render/combat/arcadeStructuralFx.js`; causal accent is not a second independent impact. |
| Weak-point armour breach / `combat:weakPointHit` | `heavy-impact` | Live weak-point handler in `src/render/vfx.js`; directional solid shards and seam streaks, not a generic shield glow. |
| `impact_normal` — normal projectile contact, sparks and spall | `heavy-impact` | Reference impact family and live `_onProjectileHit` / `_impactSparks` counterparts. |
| `impact_concussion` — heavy/kinetic hit, concussive slam and collision-axis variant | `heavy-impact` | Reference impact family and live `_onCollisionConsequence`; `impact_collision_axis` is its lab scenario, not another family. |
| `destruction_light` — non-capital death/ignition beats | `heavy-impact` | Reference destruction family and live `_emitDestructionLightBeats`. |
| `explosion_heavy` — large/capital destruction and phased blast fronts | `heavy-impact` | Reference destruction family; live queued/phased explosions. |
| Mining beam/contact, charge detonation and work/yield flashes | `heavy-impact` | Mining and `_onChargeDetonated` handlers in `src/render/vfx.js`; independently persistent yield objects belong to the matter row below. |
| Shield hit/ripple, damage absorption and shield failure/recovery | `shield-response` | Shield/damage response in `src/render/vfx.js` and its energy materials. |
| `field_attractor`; live `well`, `seed`, `anchor_snare` | `shield-response` | Reference field label and live field-volume owners in `src/render/vfx.js` / `src/render/weapons/presenter.js`, not Massline cable presentation. |
| `field_repulsor` | `shield-response` | Reference field family and bounded repulsor counterparts. |
| `field_cone`; causal `field` and `reaction` accents | `shield-response` | Live field-cone branches and structural causal grammar. Shape depicts influence/causal state, not protection; use the field-extent subrecipe rather than a shield shell. |
| `field_skim` (data-defined; presentation gap) | `shield-response` | `src/data/fields.js` defines it; no dedicated skim geometry branch in the inspected live VFX owner. Generic field fallback is not an accepted sheet recipe; see build-map improvement plan. |
| Bounded hazard/energy volumes and momentum-sink influence/state cues | `shield-response` | Energy and momentum-sink presentation imported by `src/render/vfx.js`; physical gas/dust is not the field boundary cue. |
| World-space action/state tells: AI doctrine/flee/formation, law heat/scans, station/NPC/Ceres work signatures, charging/jump cues, nav/tool/seam lights and markers | `shield-response` | Presentation-cue and job/law controllers; only the in-world optical/state output is covered, not HUD/screen chrome. |
| Emitted combustion, lingering smoke, soot, dust clouds and low-hull `damageVenting` | `gas-smoke-dust` | Independently emitted matter in live VFX pools; current Quarks damage-venting consumer is foreign work in progress, not a newly accepted family. Pool membership does not license a soft-card silhouette. |
| Environmental fly-through gas, dust, haze and particulate fields | `gas-smoke-dust` | World-dressing owners; not a sky-star exception even when distant in one frame. |
| `reentry`; live planetary skim / reentry sheath | `gas-smoke-dust` | `src/render/vfx.js` `_initPlanetSkim` / `_updatePlanetSkim` and energy materials; hot compression/matter envelope with wake support, not an engine nozzle. |
| Solid spall, mining chips, rock/ice fragments, wreckage and debris fields | `debris-cargo` | Independently persistent/tumbling matter; supporting fragments inside an impact remain part of that impact recipe. |
| Cargo/resource/loot/pickup bodies and their collection/magnet accents | `debris-cargo` | Pickup/yield/loot presentation and solid-object owners; the object carries identity, not its accent. |
| `massline_latch` — attachment receipt | `massline` | Reference Massline family and live `_onTetherLatch`. |
| `massline_tension` — loaded cable/field and load evolution | `massline` | Reference Massline family and live `_updateTetherCable` / Massline presentation. |
| `massline_release` — snap/clean release and retained-motion presentation | `massline` | Reference Massline family and live release/snap/arc owners; preserve the live particle-silent clean-release grammar. |
| Massline arc/aim preview and coupled-body momentum/tumble cues | `massline` | Arc-preview and Massline presentation owners; preview is distinguished from an attached loaded line. |
| Causal `tether` structural accent | `massline` | `src/presentation/causalVfxGrammar.js` through the existing structural-FX owner; carries the tether event, not an independent explosion recipe. |
| Tiny sky stars and sparse sky flares, including legacy starfield variants | `background` | `src/render/spaceBackground.js`, `src/render/deepFieldStars.js`, legacy starfield; only the inventory's existing star-sky exception IDs. |
| Far-sky planets, authored comet, nebular/large sky forms and parallax composition | `background` | `src/render/spaceBackground.js` and background layers; existing distant-impostor records do not grant play-scale permission. |

### Inventory is evidence, not a second family register

[`SOFT_CARD_INVENTORY.json`](./SOFT_CARD_INVENTORY.json) continues to record the actual constructions,
files and status. Its `vfx-sprite-puffs` entry covers a shared multi-family substrate; it is not a
newly approved effect family, and its status remains subject to visual acceptance. The former
`vfxnext-billboards` entry was retired when the library was deleted on 2026-09-07. The star/flare
allowlist and distant-impostor records are not broadened.

`star-texture-factory`, `startup-gpu-residency-proxy`, `graphics-lab-sprites` and
`asteroid-tier-badges` describe a factory, an offscreen upload mechanism, lab examples and UI chrome,
respectively, not additional world-effect classes. The unused legacy starfield remains unused.
Listing, classifying or renaming something never clears its rejection or changes its live status.

The current `src/render/vfx/quarksSystem.js` is another shared substrate, not a ninth class:
`impactSpall`, `muzzleSparks`, `collisionSpall`, `shrapnel`, `casingEjection` and `miningEjecta` support heavy-impact;
`shieldShards` supports shield-response; `retroVenting` supports engine-jet; `damageVenting` is
gas-smoke-dust. Independently persistent solids route to debris-cargo. A comment advertising cargo
swirls is not an implemented family: pickup/magnet presentation still belongs to its actual VFX owner.
These mappings describe inspected source and do not accept the in-progress Quarks migration.

## 3. Derived rules — one shared contract

The matrix owns construction choices; this section owns reusable material, effect, LOD and
composition rules. A downstream recipe references these rules rather than copying a competing
version into an asset brief. Numeric material and regional settings remain in their live data
owners; the recipes below explain how to select and compose them, rather than duplicating constants.

### Observed anchors and their limits

The following are observations from the accepted .00 images, inspected again for this leaf.
Image names resolve under the linked binding above. These are specific reads, not acceptance of
everything else in the frame. Fresh-route findings and source identity belong to the
[.01 receipt](../../design/program/roadmap/receipts/PQ-190.01-REPORT.md).

| Anchor | What the image actually establishes | Reusable decision / limit |
|---|---|---|
| A-02, quiet flight | A white throat gives way to a cyan body and separated indigo reaches; the hull remains a solid dark mass. | Preserve the owner's long bright flight snake, with internal structure and an identifiable nozzle. Its crossing of the sky is intentional. The straight held burn does not establish curved-path accuracy or throttle transitions. |
| D-02 to D-04, loaded line | A curved pale connection becomes straight and amber while the blue engine wake remains a separate shape. | Use endpoint/curve truth first, load contrast second. A colour change alone cannot identify tension; the exact mechanic name and release causality were not established by these stills. |
| shield-00, shield-03, shield-07 | Bright polygon seams surround transparent panels, then weaken and disappear; the hull is visible throughout. | Preserve panel construction and local response while decaying coverage after contact. This is the sole B17 qualification; no opaque pastel shell, uniform aura or throttle-faded exhaust is admitted. |
| B-02, rover | A yellow rover, excavated passage and machine assembly remain distinct at the working camera. | Keep machinery as solids and put useful state light on its working parts. The tiled wall and labels are not a new art recipe; this sequence does not prove a producing refinery. |
| C-00 and D-04, mixed engagement | Hulls, trajectories, cargo and background coexist; D-04 separates the taut connection from propulsion. | Reserve local contrast for the action. The independent critique could not attribute an individual hit; heavy-impact causality remains a prototype requirement, not an approved result copied from C. |

### Recipes to carry into the next asset task

Fresh shipping-camera inspection on 2026-09-09 supports these same relationships: quiet-flight
frames show the abrupt white-jet/cyan-strand handoff while preserving the bright long history;
rover frames retain the solid working assembly; Crucible frames separate a gold loaded connection
from blue history but crowd the target with circular responses and panel shields. Thus the next
improvement is continuity at the propulsion seam and differentiation around contact/influence,
not dimmer history or a new palette. The [.01 receipt](../../design/program/roadmap/receipts/PQ-190.01-REPORT.md)
records the individual source identities and slower combat capture clocks. These observations do
not approve unobserved smoke, every region, or the concurrently changing runtime's performance.

Pick a row, use the named live owner, and change only the fictional material or causal state that
differs. Supporting layers earn their place by adding different information. In a crowded frame,
protect contact/endpoints and body silhouettes before atmosphere. This is a priority for authoring
and measured LOD, not permission to lower shipping quality or delete effects.

| Recipe | Construction, material and timing | Play-scale handoff and evidence |
|---|---|---|
| **Industrial solid / useful cargo** | Select `painted_shell` or `painted_shell_worn` for coating; `bare_structure` for exposed plate; `worn_tool_metal` for serviced edges; `thermal_ceramic`, `radiator_fin`, `matte_seal`, `industrial_marking`, `controlled_glass` for their actual substances. Use the existing `state_emission_*` family only on the active drive, signal, window or work surface it names. Values and asset mappings live in `src/render/industrialMaterialFamilies.js`; preserve authored maps and shader hooks. | Retain a readable unlit silhouette and the separation of shell from working edge seen in A/shield/B. The source's semantic-role fallback can merge Kestrel armour and markings into painted shell; do not copy that loss into a new asset's precise material mapping. Cargo must separate from surrounding chips by form and placement, not a halo. |
| **Drive + remembered flight** | Two owners: a compact evolving jet from `src/render/thruster/` and a long, bright recorded world-space snake from `contrailTrail.js`. Use M2 for structured radiance, the existing drive envelope for spool/cooldown, and independently dissolving terminal reaches without sacrificing generous history. A short hot throat and coloured structured history are relationships, not mandatory hues. | A demonstrates sustained thrust and D demonstrates separation from the loaded line. Preserve origin, direction and the entire intended flown curve; keep old bends fixed in the world. The owner endorses the long bright signature. Tight turns, self-crossings and rest must be observed when changed; straight-flight images cannot prove them. |
| **Shield contact** | Designed transparent panels and seams, localized contact radiance, then coverage/radiance decay after the event. Follow the shield owner and contact slots; keep the body visible and let later contacts remain local. M2 supplies luminous edge response; B17 permits this observed decay only. | shield-00/03/07: seam structure is present, body visible, response gone after the event. Do not make the whole shell a permanent primary light. Current timing values are owned by the live shield presenter, not these historical frames. |
| **Loaded Massline** | Follow both real endpoints and cable curvature; modulate the existing load response in `src/render/masslinePresentation.js`. Travel belongs on the line, retained motion belongs to the bodies. Keep latch, loaded state, snap and clean release distinct; never invent a release explosion. | D-02/04 establishes curve-plus-load contrast and separation from the wake. Keep those two geometric relations through LOD. Snap and clean-release timing still require their own action observation when changed. |
| **Shove / heavy contact — prototype** | Contact core → oriented compression front → solid spall and cooling aftermath, using `IMPACT_PRESENTATION_PROFILES` and the live combat pools. Prototype geometry, authored textures or their hybrid per layer; keep the contact brief and the aftermath spatially separated. Respect signed force versus an unsigned collision axis. | C is a density reference, not causal-hit approval. A new candidate must let the viewer locate contact and follow the displaced body without help from a caption. No amount of rings, particles or shake substitutes for that motion. |
| **Smoke / dust — prototype** | Use lobes, cavities, inherited motion, depth intersections and dilution; choose a shaped volume, authored/simulated detail or hybrid. Hot and cold regions need separate structure before fine turbulence. M3/M4 apply. | .00 supplies no accepted smoke study. Borrow its attention hierarchy only: smoke reveals aftermath and space around solids. Do not label a pending volume migration approved or derive a new billboard exception from the lack of smoke evidence. |
| **Working machine** | Keep the authored body and functional openings. Drive the actual furnace/lamp through its existing productive/limited/starved state owner; emission illuminates a working aperture, not every seam. Use material-family selection above rather than a universal metal preset. | B anchors solid machine/rover separation; the .00 receipt's furnace correction supplies the state wiring. Production brightness is not visually approved by a starved-refinery capture. |

### Regional and LOD derivation

`src/data/sectorVisualProfiles.js` owns the region recipes and exact lighting/composition values.
Select structure and landmark placement before tint. The live profile IDs below are reusable data,
not an assertion that every region was approved in the small .00 scene.

| Context | Composition to preserve | LOD priority and evidence boundary |
|---|---|---|
| Helios opening / quiet flight | `helios_core`: an offset planetary landmark, star associations and open dark flight space; solid bodies get directional separation, events retain the local peak. | A and the mixed .00 views anchor the planet/flight relationship. Keep landmark silhouette and open space before tiny star detail; never move the camera to rescue a weak effect. |
| Dense combat / loaded work | Use the current region profile; allow contact, shield or loaded line to become the primary event while nearby hulls remain identifiable. Avoid duplicating one event as multiple full-size glows. | D anchors line/wake separation; C exposes the hit-attribution limit. Preserve contact, both line ends and bodies before distant supporting detail. Do not broaden this into a global post adjustment. |
| Asteroid Works | Keep the straight-on real-3D working grid, solid machinery and localized work light; the normal work/site view owns projection. | B anchors the rover/assembly distinction. Preserve rover, tool opening and occupied footprint before small fasteners. This does not approve the floor texture or authorize UI changes. |
| Other regional profiles — prototype transfer | Reuse each existing profile's structural recipe and material identity; inherit the above action/body/atmosphere separation, not Helios's colours or planet layout. | .00 did not visit every region. New regional work must show the same family at its own shipping view before claiming that transfer works; no invented regional approval or numeric LOD threshold. |

### Material families

- **M1 — Solid matter.** Rocks, ice, debris, wreckage and cargo are opaque, lit and carry a real
  silhouette and authored surface identity. Heat/emission is a property of that surface or a
  separate volume, never a substitute for the object. Surface response is selected for the object's
  fictional material and state; no universal metalness, roughness or permanent trim prescription.
- **M2 — Luminous sheets and surfaces.** A sheet/ribbon needs a curved cross-section and
  view-dependent grazing-angle edge brightening; a lit solid or gas volume does not inherit the
  sheet equation. Hot cores reserve deliberate HDR headroom above 1.0 with a stated bloom intent.
  Temperature/radiance and reach carry activation; alpha is not a throttle animation channel.
  The observed shield-panel decay is qualified under B17; it does not apply to propulsion.
  Designed internal separation must exist before bloom. B7/B8/B17 remain in force.
- **M3 — Participating matter.** Transparency represents real dilution, edge runout and dispersal.
  Concentrate material enough for a coherent body with legible internal structure; do not spread
  fixed material into a net and fade away the gaps. Depth-aware soft intersections are required
  where an effect meets geometry. Thin-sheet creases and volumetric gas are different structures
  (B12); neither a density integrator nor a soft mask is a universal recipe.
- **M4 — Detail and source art.** Fine detail comes from simulation or authored art, not final-art
  hash noise. Blender/Mantaflow simulation and baking remain the source-art route; see
  `tools/AGENTS.md` and `assets/AGENTS.md`. Continuous/infinite procedural transport fields
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
  than opacity (except the observed shield recovery qualified under B17). Vary element reach, size and lifetime so material runs out before mesh/UV bounds,
  never at one shared terminal plane. These requirements govern emitted/energized effects; an
  opaque cargo hull is not required to flow, dissolve or exceed a bloom threshold.
- **E4 — Composition inside a family.** Give each supporting layer a job and a termination; do not
  replicate the same full silhouette as several halos. Support may use a minor term allowed by §4
  but cannot become the silhouette/structure/detail carrier. A smoke or debris layer does not
  change the primary assignment, and an existing banned pool does not grant a new exception.
- **E5 — Jet/history handoff.** Both recipes consume a shared appearance boundary (width,
  radiance/colour progression, flow phase and structural motif). The outgoing jet and incoming
  history use complementary support in their short overlap; two independently bright full heads
  create a join, not unity. Preserve the long bright history beyond that seam. If the ship turns or
  stops, keep true historical positions; do not bridge a gap by painting invented past motion.
  This is the owner's requested next improvement, not a claim that the current pair already meets it.

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

## 4. Rejection register — B1–B19, with one observed qualification


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

**B17 qualification — shield response only.** The accepted `.00` shield-00 → shield-03 → shield-07
sequence (linked binding, source capture `dense-shield-response/1788717810079`, simulation/wall ratio
0.9995) demonstrates transparent constructed panels recovering after contact while retaining the
hull underneath. Permit coverage/opacity decay as part of this event envelope, together with designed
seams and contact structure. Reject opacity-only switching of an otherwise featureless shape, uniform
auras, and opacity as propulsion throttle. This qualifies the technique prohibition, not the rejection
of a cheap translucent stand-in. B1–B16/B18–B19 and the sky-only exceptions are unchanged.

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
reference IDs), preserved rejection outcomes and evidence for any narrow qualification, link resolution and the exact write set;
run the focused checker and preserve that coherent candidate before optional prose polish. Keep
inventory statuses factual rather than marking old implementations accepted to obtain green.

The [.01 receipt](../../design/program/roadmap/receipts/PQ-190.01-REPORT.md) owns this leaf's closure
and fresh-route findings. This standard owns the reusable recipes; the inventory owns construction
status. Neither classification nor a green static scan grants visual acceptance to an unobserved
implementation. Preserve that distinction when the next asset task uses this handoff.
