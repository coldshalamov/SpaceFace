# 08 — Damage response, destruction, animation, and readable light

**Outcome:** gun hits feel consequential; concussed survivors visibly lose control while retaining inertia; mortally damaged ships smoke, fail, veer and descend visually into satisfying explosions and coherent wreckage. Relevant bodies remain readable against the sky. Planning only. Evidence: E03/E09/E10/E11/E12/E14. Research: R05/R06. Coordinate closely with 03/05/09 and the existing Look/NOCTURNE owners.

## Separate life, incapacity, death, and spectacle

The inspected `deathSlide.js` is explicitly render-only and says the simulation body stays parked. That is a useful bounded effect, not evidence of physically traveling dying ships. Do not build collision-dependent chain reactions on a decorative offset while the authoritative body remains elsewhere.

Define lifecycle meaning through the existing damage/defeat/aftermath owners:

| State | Remaining agency | Physics and presentation obligation |
|---|---|---|
| Alive, controlled | Normal capabilities subject to damage | Show actual thrust, facing, hits, and subsystem condition |
| Alive, concussed/tumbling | Temporarily gated control and possibly fire | Retain linear/angular momentum; show the same loss and recovery the simulation applies |
| Alive, disabled | Persistent or repairable loss of specific capability | Do not use an irreversible-death animation; show repair/salvage/capture opportunities honestly |
| Irreversibly dying | No fresh combat decisions or normal attacks | A bounded physical failure trajectory if intended, with a clearly scheduled terminal outcome |
| Wreck/aftermath | No living AI; possible physical hazard, contents, and salvage | Preserve inherited motion and authoritative remaining structure/custody |

Do not add a second health model or another system independently declaring a kill. One canonical transition owns kill credit, experience, loot entitlement, and mission/run consequences. Presentation may continue after that transition, but cannot grant another reward. A delayed explosive event must have its own finite, causally attributed physical payload, not replay the original death damage repeatedly.

Specify how a run ends while a dying hull or dangerous wreck remains. Wave progression may wait for a short relevant terminal hazard or move on with it, according to the current run owner; it must not double-count kills or leave a run permanently active because cosmetic smoke has not faded.

## Hit response with mechanical meaning

Read the accepted damage layer and local contact. Shield contact should differ from armor impact and a hull breach. A shallow graze should not launch the same large explosion as a fatal strike. Direction, relative energy, affected subsystem, and hull class should shape the response without making every bullet a camera event.

Use actual impulse and torque through the existing physics authority. Off-center concussion can tumble a light hull; a heavier hull can respond less. While the authoritative incapacity lasts, gate the actual relevant control/fire channels. Never merely spin the render mesh while the enemy continues perfectly aiming and steering underneath it.

Concussion is not a hidden teleport-to-zero-velocity. A stunned ship continues ballistically until real forces or recovery act on it. Prevent tiny repeated hits from extending complete control loss indefinitely unless that is an explicit, balanced status rule. Coordinate recovery damping with 03 so an AI does not erase the visible opening immediately or spend the rest of the fight in uncontrolled oscillation.

Hull damage can cause localized smoke/venting, damaged-nozzle behavior, sparks, or an exposed hot interior according to actual severity. If veering is mechanically meaningful, implement it through a damaged actuator or finite physical impulse, not an independent renderer movement that changes where shots appear to hit.

## The requested smoking fall and explosion

Prototype a readable fatal sequence: decisive impact → unmistakable failure → smoke/vent trail and loss of thrust authority → a short inherited-motion departure with visual roll/pitch/descent → rupture → a few important physical fragments and cooling wreckage.

Not every ship needs every beat. Small swarm fodder can rupture promptly; a selected medium ship can have a clearer failure travel; a large hull can break in identifiable sections. The difference should express mass and cause, not arbitrary cinematic length. Tune timings through comparative motion review; do not make every kill wait several seconds or bury the next enemy under a smoke curtain.

The gameplay plane remains XZ. Visual Y descent and roll/pitch are presentation. While an object remains collidable or damageable, keep its visible relevant footprint aligned with the authoritative planar body and respect occlusion/target cues. If a terminal visual is deliberately noninteractive, retire its combat affordances and make that status obvious. Do not leave a target bracket on a visual shell whose hitbox was removed, or place a damaging explosion at a cosmetic position that the simulation never occupied.

A physical dying-body implementation should continue from the final authoritative velocity, angular velocity, mass, and damage state. Remove living control and apply only justified remaining forces. Convert to a wreck once; keep cargo and loot identity on the appropriate authoritative successor. Collisions during the failure interval retain causal attribution without duplicating the original kill.

## Explosion composition rather than particle inflation

Design a recognizable temporal structure: source rupture/flash, directional ejection, expanding pressure or fracture cue where the mechanic warrants it, sustained hot core or burning fragments, and readable decay. The peak should be brief enough that the player can see the result. A large low-opacity sphere covering half the screen for seconds is not a satisfying explosion.

Preserve material and cause. A magazine cookoff, shield collapse, brittle rock fracture, and inert wreck impact should not share one generic orange puff. Use the existing authored explosion, structural burst, material, trail, and audio systems. Improve a family at its owner and propagate the improvement to real consumers; do not add another competing per-weapon explosion path.

Separate physical fragments from cosmetic micro-debris. Important chunks should continue from real parent motion and admit their actual colliders through the existing fracture/aftermath owner. Small sparks and dust can be pooled visual detail. Do not allow the cosmetic fragment count to determine mass, collision damage, or salvage value.

Budget simultaneous emphasis. A nearby selected-target kill or a major player-caused cascade deserves a clear hero beat; distant ordinary deaths can be less prominent while retaining their identity. This is a relevance/composition policy, not permission to turn off default effects to meet a benchmark. Preserve dangerous blast footprints and incoming telegraphs even when cosmetic pools are saturated.

## Darkness is a contrast problem, not a mood veto

The owner wants atmosphere and legibility. Keep dark space and authored noir locations; make the important bodies separate from the background. Do not fix the report by turning every material emissive, lifting the whole sky to gray, or adding thick outlines to every object.

Investigate the entire image chain at the actual gameplay camera: authored albedo/material values, texture color interpretation, key/fill/rim contribution, environment reflections, tone mapping, post-grade, vignette, bloom, background detail, exposure, projected size, and display scaling. Change one suspected cause at a time before combining fixes. A source file with plausible lighting values is not evidence that a hull is readable on the user's screen.

Use the existing Look values and runtime owners. Material identity belongs to the asset; mood belongs to the Look system. Real lights illuminate nearby surfaces. A bloom halo or translucent fan cannot substitute for a headlight or impact light that affects a rock or hull. Coordinate with NOCTURNE's current branch/landed status before touching shared light allocation; do not build a second lighting director.

Prefer readable facing and silhouette through coherent key/edge light, restrained operational emitters, and a quiet background. Selected/contact feedback can reinforce relevant shapes without disclosing cloaked or unobserved actors. Separate rendering visibility for the player from detection facts used by AI.

Evaluate bright and dark sectors, backlit and shadow-side hulls, different camera distances, dense debris, and concurrent explosions. A hero asset must still read when its best angle or brightest lamp is not facing the camera. Preserve faction/material differentiation instead of giving all enemies the same luminous red treatment.

## Motion, sound, and accessibility

Coordinate sound with the actual hit layer and cause: a shield strike, tearing armor, a heavy collision, control loss, reactor failure, and final rupture need distinct temporal identities. Use the existing voice/audio admission and pooling owners. Repeated simultaneous events should not become a clipped wall of sound or steal the next dangerous telegraph.

Use local body reaction before camera shake. Reserve strong camera events for meaningful beats with bounded admission; do not shake on every pellet. Hit-stop and slow motion must not repeatedly steal control or magnify input latency. Reduced-motion and reduced-flash settings preserve impact location, lifecycle distinction, warning, and target identity without decorative shaking or strobes.

An incapacitated hull should remain identifiable as living. Smoke, dimmed thrusters, and a control-loss mark are different from the final rupture. A player should recognize the opportunity to throw, capture, finish, or wait for recovery without reading a paragraph.

## Performance and lifecycle discipline

Prototype and measure the complete sequence early with 09. Reuse geometry/material families, instance repeated pieces, bound translucent screen coverage, reuse particle/trail buffers, and warm required shaders on existing admission paths. Do not create one new PointLight, texture, or material per death.

Attach visual lifetimes to accepted events and stable actor generations. Death, removal, rebase, pause, replay, save/Continue, context loss, and renderer teardown must not leave ghost smoke, stale target references, or repeatedly firing explosions. A renderer can rebuild the current presentation without causing gameplay consequences.

## Acceptance

CEC-B distinguishes shield hit, armor hit, hull damage, living concussion, recoverable disable, fatal failure, and inert aftermath. CEC-F combines multiple deaths, thrown mass, a shield contact, and an incoming attack at the normal camera. Review synchronized video and simulation traces, not only close-up screenshots.

Ask testers to identify which ships are alive, which are temporarily helpless, what caused the main explosion, where the next threat comes from, and what remains physically useful. Compare before/after at the same resolution/settings and similar event density. Report recognition failures and visual occlusion as defects. Completion requires both a satisfying sequence and truthful, performant gameplay underneath it.

## Implementation status

Lifecycle half only (lighting / readability of dark hulls is a later wave and is untouched). Written 2026-10-25 against the current tree.

**One canonical kill, a physical dying successor.** `combat.kill()` stays the single transition that owns kill credit, xp, loot entitlement, mission and run counts; it still settles on the lethal tick. The kill's successor is the wreck `aftermathWrecks` already mints on that tick with the victim's real velocity, spin, mass, radius and cargo/loot identity (the authoritative planar body). `src/systems/dyingHull.js` marks that successor `dying` (synchronously inside the kill's own emit, so audio/presenters always find the record) for a bounded, mass-shaped window (fodder ~0.35-0.6 s, medium ~0.8 s, heavy ~1.3-2 s, large <= 3 s, tick-quantized; `dyingWindowS` in `src/combat/lifecycle.js`), applies ONE damaged-nozzle impulse and ONE yaw impulse through the physics command membrane (hash-seeded, never `state.rng`, skipped if tether-held), tilts the presentation pitch/bank, and converts it ONCE at the rupture (`dyingHull:ruptured`). Medium+ hulls shed one or two real tear-off bodies through the existing `hullFracture.spawnCollisionTearOff` (a one-flag additive hunk lets a kill wreck take its single owed break-apart). No damage payload rides the rupture; nothing is granted; a vanished body (`dyingHull:lost`) never ruptures; a rupture resumed far past its time (`late`) sheds no fragments. Waves/runs never stall: the successor is a `wreck`, in no hostile census, and the wave clears on the same tick with or without the window (test pins this by comparing clear ticks).

**Lifecycle read.** `src/combat/lifecycle.js` is the pure, total, write-nothing vocabulary packets 02/03 import: `lifecycleOf(state, entity)` -> `'alive' | 'concussed' | 'disabled' | 'dying' | 'wreck'`, `readConcussion(state, entity)` -> `{phase:'tumble'|'recovering', until, startedAt, source, kind, cause, chainCount}` | null, plus `isHelmLost`, `isDisabledHull`, `isCombatant`, `isIrreversiblyDying`, `readDying`, `dyingFuseS`. Concussion is deliberately NOT mirrored onto `entity.status`: that would be a second writer and a save field. The dying record lives in the transient `state.dyingHullRuntime` (never serialized; a reloaded wreck simply reads `'wreck'`).

**Concussion is the existing tumble.** `tumbleStates` + `impulseKernel` (mass-scaled hitstun law, `HITSTUN_CHAIN_LAW` 0.65 decay / 5 s ceiling / recovery re-entry floor, player immune, 0.9 s stabilization) already implement the packet; this wave proves it through real rapier-dynamic physics in production relative order instead of rebuilding it (`test/concussion-lifecycle.test.mjs`): momentum is retained (no velocity reset), fire + steer channels are gated then returned, a heavy hull moves less and loses the helm no longer but is never immune, repeated tiny hits shrink and hit the ceiling.

**Presentation (existing owners only).** `render/vfx.js` holds the already-queued death explosion for the window (same `PhasedExplosionLifecycle`, no new explosion path, no new light/material), trails the existing wounded-hull smoke (critical band) on the real wreck, spits two nozzle sputters (skipped under reduced motion; tilt also skipped; smoke stays as the location+state cue), and detonates at the wreck's current position/motion with the kill's directional cause; audio lands the boom on the rupture via `dyingFuseS`. `render/shakeAdmission.js` gives discrete camera shakes diminishing returns in a draining window (hero beat whole, swarm/pellets bounded; textures below the floor untouched) at the renderer's single `camera:shake` chokepoint. `render/deathSlide.js` stays the PLAYER-defeat-only decorative slide (comment now says so). Shield/armor/hull-breach hit responses were already distinct in `vfx._onDamage`; not rebuilt.

**Golden safety.** Gated on `combatFlag('tumbleFling')` (production ON, legacy47a OFF), not in the sf-sim curated system list, strict no-op when idle (two integer reads, no rng, no event). Registered after `aftermathWrecks` (manifest init+update, node factory table, table clock). Test counts in `test/authoritative-manifest.test.mjs` bumped 249/195 -> 250/196 for this system (a peer adding another system must bump again).

**Tests (all `node --test`, 44 total):** `concussion-lifecycle` 6, `dying-hull-window` 6, `dying-hull-system` 15 (real survival run: single reward set, exactly-once rupture, momentum, wave-clear tick parity, pause, teardown x4, destroyed/replaced body + id reuse, rebase, determinism, idle-free, fragments, flag-off, tilt/reduced motion), `dying-hull-physics` 3 (real rapier-dynamic physics), `dying-hull-presentation` 9 (hold/retime, begin-before-kill ordering, 15-kill pool overrun = 15 explosions, timer-fallback then late rupture = once, lost, trail/reduced motion, audio fuse), `shake-admission` 5.

**Honestly still open.** (1) No Y-axis descent: the mesh keeps y=0 (pitch/bank only; adding y needs a hook in the renderer's mesh seat). (2) The dying hull is drawn as the existing hulk model (ember-lit) - the living hull's dimmed thrusters are not shown, and capital/boss/base deaths keep their authored sequences (skipped). (3) Concussion spin sign is hit-side only (magnitude from delta-V/mass, not hit offset) and the entry spin sets the target spin rather than adding - existing owner behavior, left alone. (4) `overkill` is a supported input to the window but no producer fills it yet. (5) A kill with no successor wreck (ambient cap) keeps the fixed 0.4 s fuse. (6) No timing tuning against a live capture (agents do not capture; windows are prototype values). (7) The sim goldens (`sim`, `sim-v3`) and `save-schema` are already red on `origin/master` (actual hash `643a6f43...` / `1ebf054a...` identical with and without this packet); `vfx-death-sizing` #5 and eight aftermath/wreck tests also fail identically on `origin/master`.
