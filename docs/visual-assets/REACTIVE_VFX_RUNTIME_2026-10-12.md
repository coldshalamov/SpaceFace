# Reactive VFX architecture: the world must answer

**Status:** Engineering direction and first player-impact integration, 2026-10-12. This is a *global design contract*, not a claim that all existing effects are visually remastered by the accompanying patch.

## Diagnosis

SpaceFace already has animation, shaders, event bus, particle pools, geometry, smoke, authored models, material recipes and light budgets. Yet many effects read as opaque, dim, precisely-spaced magical props. The fundamental failure is often *causality and composition*: most effects appear between camera and scene rather than as phenomena that transfer material or energy into things in the scene. More sine waves, noise or bloom will not fix this.

A concrete integration failure existed at the mining caller: it supplied markKind and fracture but the receiving stampMiningScar implementation ignored those extra parameters. Combat scorch marks were one flat plane each. Animated overlays are not a receiving object responding to force.

A modern effect must be judged from the gameplay camera with other actors nearby. Passing state/lifetime tests is necessary but never sufficient to demonstrate art quality.

## One global director, multiple specialized renderers

Unify *semantic routing, budgets and lifecycle*, never force every effect to share one strip, ring, particle material or color scheme.

1. Read an authoritative gameplay/event receipt, never invent force, targets, damage or successful contact.
2. Classify **verb and family**, material, actor and receiver identities, and whether the event is intent, powered state, measured contact, confirmed consequence or residue.
3. Allocate the finite marginal render budget by priority: player's consequential action > imminent danger > near NPC contact > ambient world. Apply caps and hysteresis per technique and per target.
4. Compose source, transported material, receiver response and aftermath. Choose independent specialized renderers, all reporting costs to the same director.
5. Respect save/replay boundaries, floating-origin offsets, pause, reduced-motion/flash and mesh-pool rebind. Never write to simulation entity.data.
6. Measure actual frame and GPU time. Degrade secondary material first, not essential range/direction/contact information.

## Visual language inventory and family-specific signatures

| Family | Must reveal at play scale | Visual signature and receiver consequence | Cheapest viable default |
| --- | --- | --- | --- |
| Main/boost/retro/RCS propulsion | force direction, intensity, nozzle, acceleration/brake | swept hot throat, directional cooling exhaust, short RCS impulses; light nearby surfaces | existing shared jet sheets and world-space trail, batch |
| Flight trails / dash / travel | where the ship *was* vs where it is going | long reliable pose-history ribbons, acceleration cues, distinct travel departure/reentry | old pose recorder, no scene fluid |
| Ballistic launch and impact | caliber, recoil, actual contact and surface material | axial impulse and solid mineral/armor spall; asteroid chips and cracks | instanced hard particles plus target-local damage mark |
| Coherent beams / cutting / mining | exact source, path and working endpoint | collimated line; incandescent or pale worked face; material ejecta | single shared beam body and one typed receiving patch |
| Induced current / disruption | valid conductor contacts, bridge vs interruption | sequential branches anchored to receivers, localized electrical crawling; no purple Well | pooled branch geometry and clipped contact marks |
| Metric attraction/repulsion | inward vs outward force, real active reach | distorted nearby light/dust, incoming entrainment or outward bent pressure; visible body reaction | reused distortion pass, sparse existing field meshes |
| Shields / armor | coverage, struck sector, overload/breach | localized shell stress, transparent body-readable field, exposed hit point | shield-specific pool and actual surface-local patches |
| Thermal, plasma, reactor venting | heat, direction, exposure, cooling | compact white-hot contact and dark turbulent interior; directional venting, deposited heated seat | transported shader + typed local mark, rare baked plume |
| Explosion / destruction | ignition, breach, solid breakup, danger radius | rock cleaves, hull tears, volatile fuel burns asymmetrically; debris preserves real material | authored staged explosions, instanced solid debris |
| Sticky/chemical/status | attachment, spreading, remaining hazard | connected filaments/films adhering to source body; residues | target-local material stamp |
| Massline / tether / snare | real endpoints, tension, load/release | connected cable with travelling load, attached endpoint strain | existing retained endpoint ribbons |
| Repair/transfer/cargo/docking | real direction, receiver, confirmation vs failure | site-local work, resource travel, repair seam closes or cools | existing action/station pools + sparse contact |
| Loot/pickup | useful solid object and acquired state | visible item trajectories not celebratory abstract color | instanced matter, no new glow engine |
| AI/law/stations/environment | owner, state, urgency | clear sparse material-local tell without obscuring actor | low priority shared ribbons/marks |
| Planet skimming / sky | speed and environmental density | understated occlusion-aware context, sky remains quiet | cached sky/world assets, strong cull |

Do not distinguish families by palette alone. Compare in grayscale, without bloom, under moving gameplay conditions, and during overlaps.

## Material/receiver reactions: R0–R3

**R0 – no decorative receiver:** the default for distant or offscreen low-priority events. The gameplay contact/telegraph must still be legible.

**R1 – cheap confirmed surface reaction:** the existing pooled mark batch shows a short locally attached, material-specific response; no independent light, physics query, scene pass or second pool. Implemented initially for confirmed **player-fired, visible, unshielded asteroid weapon impacts**. Three distinct modes: mineral fracture/ejecta contact, thermal seat/cooling, induced crawling charge. This is a *collision-sphere curvature approximation*, not an accurate mesh decal.

**R2 – true receiver material:** stamp or transport a small material response within the asteroid's actual shader/surface coordinates, or at accepted contact time project a small decal mesh onto triangles using an existing BVH/surface proxy. For instanced asteroids, retain target-identity and geometry-binding guarantees, and avoid material cloning per hit. This is the *critical next quality milestone* for the 'Photoshopped overlay' complaint. R1 can still clip at concavities; R2 must be reviewed from oblique angles with rotating rocks.

**R3 – selected hero interactions:** bounded baked fluid/rupture tiles and spatially limited distortion, indirect illumination/reflection or true deposited matter as the visual benefit warrants. Never apply a 3D solver to every shot.

### Implemented R1 budget (limits, not benchmarked FPS claims)

| Quality | Concurrent hero marks | Minimum admission spacing | Added render passes | Added point lights |
| --- | ---: | ---: | ---: | ---: |
| Low / mobile | 2 | 280 ms | 0 | 0 |
| Medium / integrated GPU | 4 | 150 ms | 0 | 0 |
| High | 6 | 90 ms | 0 | 0 |

The old 32-slot mark InstancedMesh continues to draw all marks in one batch. The new 5×5 patch topology supports inexpensive spherical projection (36 vertices per mark); its fragment fill is unchanged in order of area. The number of *additional renderer passes/material owners* is zero, but activating an otherwise-idle existing mark batch can still cost a draw call. These are admission limits rather than measured milliseconds. This does **not** establish mesh-accurate conformation, physically simulated splash, or a performance improvement. Optional splashes cannot evict persistent gameplay scars. Every mark follows the original target-local anchor and disappears with its bounded lifetime. The weapon's existing hit-light remains the only hit light. Mining now preserves the correct gouge kind and fracture amount all the way to the mark pool.

## Performance policy before any further remaster

Current game performance is a first-class constraint. Do not globally enable volumes, raymarching or background field simulations to improve screenshots.

- Keep core/endpoint/contact visible at every quality level. First suppress distant secondary debris, long residue and decorative environment interaction.
- No per-particle target raycasts, unbounded allocations, new per-effect RenderTarget or individual dynamic point lights. Coalesce repeated hits on the same receiver.
- Do not create extra scene traversal or material recompilation on the hot path. New shaders/textures must precompile during load or warm-up.
- Track draw calls, fragment overdraw, total active slots, CPU admission/update time, GPU pass time, shader compile hitches, and target-device thermals independently.
- Tune using actual first-load/steady-state/crowded-combat captures on integrated GPUs and iOS. Use hysteresis for adaptive admission; performance spikes must not make effects visibly flicker between quality tiers.
- Keep shared budgets per technique in the eventual Global VFX Director. The director must report rejections/drops by priority and reason, not silently hide contact cues.
- Reuse the current six-light event budget and two-light weapon pool. Never create an independent per-family lighting budget.

## Verification and advancement

1. Test each effect as a **five-stage causal sequence**: source activation, transport, contact or influence, receiver consequence, and cooling/termination; distinct timing, not grow–rotate–shrink.
2. For the R1 first slice: player impact into actual rotating/tumbling asteroids; low-profile caps, denied cases (NPC, shields, occluded); no persistent scar eviction; material type differs without relying on hue; mining forwards gouge and fracture; rebasing and mesh reuse cannot move a patch to a foreign target.
3. For R2: record contact positions and surface adherence from at least three oblique camera angles with and without bloom, at 0/50/150/400/800 ms, and while the asteroid moves. A bright rectangle hovering above a rock is failure.
4. Measure performance before/after on target devices with identical seeded scenarios. Compare GPU time, CPU update, overdraw, shader warmup, memory, and 1% lows. Set budgets from evidence, not guessed milliseconds.
5. Roll out by owners to **all** catalogued effects and keep a per-effect visual/status ledger. Specialized emitters remain specialized even though they share orchestration.

Run the initial regression as:

    node --test test/player-surface-vfx.test.mjs

**Acceptance honesty:** this patch demonstrates an inexpensive contact reaction and a documented global direction, not an entire aesthetically approved VFX system. Successful tests do not certify the visual bar; a browser/real-game capture and device profile are required before promoting it.
