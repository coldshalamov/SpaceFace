<!-- LIFETIME: STABLE -->
# Iron Kraken and character units

This is an implementation and art-direction guide for the owner's mechanical-octopus request.
It describes the current Kraken implementation and the design contract for subsequent characters;
it is not a completion report or a second work queue. Runtime source, focused checks, and the PR's
player-route evidence establish acceptance. Configuration limits are not measured player FPS.
The future unit briefs at the end are proposals, not registered enemies.

The selected actor identities are `enemy_iron_kraken` and `enemy_iron_kraken_colossus`. Treat them
as a reusable enemy family: an encounter should teach the player something they can recognize
and exploit when another Kraken appears. A larger health bar alone does not create a character.

## 1. What the reference actually shows

The owner's 24.6-second screen recording shows a white industrial octopus with eight articulated
arms, two camera-like optics, a rounded pressure hull, and red/orange mechanical accents. The
reference is useful for anatomy and motion; its interface, product name, and branding are not the
SpaceFace character design.

| Feature | Preserve at the gameplay camera |
|---|---|
| Head | Broad rounded lower hull and a segmented dome. Alternating solid service panels and recessed glazed ports, shallow machinery pockets, bolted seams, and orange inspection plates establish the reference's panel pattern. |
| Optics | Two dark convex camera lenses in flared white sockets on the forward hemisphere. The black focusing barrels telescope axially; thin orange pressure seals and restrained lens reflections remain recognizable when small. |
| Arm roots | Eight substantial joints around the dark collar under the hull. Arms emerge below the head, not from its crown. |
| Arm links | Four substantial proximal white barrels, separated by exposed black hydraulic bays with silver piston rods and orange axle caps, lead into a much finer coiled chain. Preserve axial length and exposed mechanism; broad compressed beads are the wrong construction. |
| Suction discs | Two rows of dark dished cups with orange rims along the underside. Their faces follow the arm's underside through every curl and twist. |
| Underside | A compact dark beak/siphon, with a red throat visible during an appropriate move. |
| Palette | Warm off-white painted armor, charcoal machinery, restrained warning red. Avoid making the whole creature shiny gray or uniformly emissive. |

In the reference's spread poses, the overall width is approximately three to four head diameters;
camera angle and curl change that ratio. Use this as a silhouette check, not an exact model
measurement. At ordinary combat zoom, the dome, paired optics, eight tapered arms, and terminal
spirals must remain visible before spending geometry on bolts.

Reference landmarks: the opening shows head-first jetting with arms streaming aft; the following
holding poses show independently curled arms; the middle shows telescoping optics, opening mantle
petals, and an exploded arm; the ending shows whole-body disassembly and another jet departure.
The opening mantle exposes dense dark machinery, but the live game does not need to carry an
invisible engineering cutaway inside opaque armor.

## 2. Animate a machine with intentions

**Holding:** roots make small, slow corrections; midsections form broad arcs; the final third curls
into tight spirals. Give arms different phases, extension, height, and curl handedness. Let one
reach while another recoils. A small hull bank and roll should lag major changes of direction.

**Jetting:** pitch the body into travel, fold arms into a narrower aft bundle, partly unwind tips,
then let their ends trail. Return through a visible braking spread. This transformation is a
signature motion and a useful tell for a committed drive attack.

**Attacking:** the current rake spreads the flank arms into two lateral threat sectors. The ink
move gathers tips, then fans them open; the drive gathers all arms aft. Pose the threatening region
clearly before the hit and ease the recoil into recovery. If a future move selects just one arm
pair, quiet the others enough that the selected pair remains readable.

The [motion provider](../src/render/ironKrakenMotion.js) integrates rigid segment lengths along
distance-parameterized bends. Each of the eight arms has 22 links: four proximal pitches of
0.64, 0.61, 0.55, and 0.49 head radii, followed by 18 fine links whose lengths taper in a
0.245:0.060 ratio and are normalized to the remaining chain length. The nominal uncoiled chain
is 4.7 radii long; individual arms have small fixed anatomical length differences.
Large sleeves occupy 72% of their pitch, leaving a visible
hydraulic bay; fine sleeves occupy 80%. Do not compress these into short toroidal beads.

Independent shoulder heights, bend planes, droop, and slowly eased posture changes produce
raised elbows and terminal spirals. The [rig](../src/render/ironKrakenVisuals.js) aligns its shared
arm geometry batches to caller-owned point and frame buffers. Each hydraulic bridge joins the
actual ends of the neighboring sleeves, with a small bearing at the articulated endpoint.
Large paired cups remain circular; the fine-tail cup clusters are smaller to clear adjacent
barrels during contraction. Jetting interpolates
unwrapped bend angles, so a curled tip visibly unwinds without flipping through opposite
tangents. Body pitch commits head-first and releases through a slower braking spread. A stable
root, substantial elbow, closed coil, and independent forearm posture are the visual conditions;
a uniform sine wave or synchronized pinwheel does not satisfy them.

Keep pose state render-owned. Combat state supplies a small presentation snapshot such as phase,
committed heading, attack sectors, and mantle exposure. Render interpolation must never become
the authority for damage, attacks, or replay timing. Use existing simulation time and deterministic
state conventions; do not add `Math.random()` or wall-clock attack timers.

The existing tactical, maneuver, Flight V3 and physics owners move the body. During approach
and recovery, a bounded velocity request brings the Kraken into reach, gives it a slow lateral
swim, and then settles before the next tell. A bounded yaw servo turns the physical body toward
the score's heading. The visual root never turns independently to conceal an unresponsive helm.
Actual speed, turning and damage supply the swim lean, bank and brief recoil. The worker read
model mirrors the committed fight clock and cast with the body's update so presentation does
not silently lose the encounter in worker mode.

## 3. Heavy and colossus are different encounter jobs

| Variant | Encounter job | Design constraint |
|---|---|---|
| `enemy_iron_kraken` | Recurring juggernaut among ordinary enemies; recognizable enough that the player can plan around it. | Keep a compact, learnable repertoire, limited support, and frequent recovery. It should enrich a wave rather than convert every appearance into a lengthy boss ceremony. |
| `enemy_iron_kraken_colossus` | A much larger encounter anchor whose body and attack sectors change how the arena is navigated. | Preserve recognizable motion, then add scale through reach, inertia, vulnerable machinery, and phase changes. Camera framing, safe lanes, ingress, and recovery must grow with it. |

Share the rig, attack vocabulary, and material language. Tune encounter data and allowed overlap
instead of forking a second controller. A colossus needs space to be read and fought; simply
scaling the mesh until it fills the camera is not an encounter design. Decorative arms extending
beyond the hull do not justify a giant invisible circular contact-damage zone.

The [current profiles](../src/data/ironKraken.js) give the heavy a core radius of 28 world units and
an arm reach of 98; the colossus uses 51.8 and 181.3 respectively, with greater mass and slower turn
response. Both have one canonical spherical body. Arms are render chains and authored attack
regions, not 176 simulated links. Their empty weapon lists intentionally remove the backing
Bastion's ordinary cannons; the attached score owns the character's attacks.

The ordinary player route is Swarm. The [wave planner](../src/systems/survivalWavePlanner.js)
offers one character seat at eligible waves 7, 13, 19, and subsequent six-wave intervals; eligible
wave 31 and subsequent 24-wave intervals use the colossus. Specialist, boss, circuit, act, and
other reserved rounds can exclude the seat. One normal unit is replaced, so the quota and finite
population remain intact; this is not a weighted reinforcement roll. The wave owner attaches the
score, records the Kraken as a required living boss, limits concurrent supporting shooters during
its tells/attacks, and detaches the encounter when the round ends. A quota cannot finish while that
Kraken is still alive. Any future Adventure or mission route must explicitly attach the score.

## 4. Attack grammar and counterplay

The [encounter definitions](../src/data/encounters/capital-boss/iron-kraken.js) currently author
three moves. Times below use the existing 60 Hz simulation; tracking precedes the committed tell.

| Move | Readable commitment | Counter and consequence |
|---|---|---|
| Eight-arm rake | Flank arms spread across two lateral sectors; 1.9-second tell, then a 0.5-second attack. | Leave the flanks through the clear prow or stern gap, or move beyond reach. The armed regions stop at the authored arm reach. |
| Siphon jet burst | Arms stream aft and the body pitches into a fixed lane; 2.1-second heavy / 2.5-second colossus tell, then a 1-second jet. | Cross the short side of the committed lane. The drive subsystem is a requirement, so the existing subsystem rules can cancel this move. The body and the pressure lane use the score's commitment, not an independently aimed render effect. |
| Broken ink ring | Arms gather and fan outward; 2-second tell, then a 0.6-second ion attack in two separated annular sectors. | Remain inside the ring, outside its outer edge, or in the clear prow/stern gaps. It is a shaped field, not opaque ink over the player's view. |

The body animation, world telegraph, and damage footprint must describe the same move. A visual
lash does not authorize a hit outside the authored region. Damage stays off during the tell;
targets cannot be hit retroactively for crossing the region while it was harmless. Once the
telegraph commits, do not keep steering its lethal footprint onto the player.

Each attack has 2.5 seconds of heavy recovery or 3 seconds of colossus recovery; the jet adds
another 0.6 seconds. The frontal shutters expose the core during each recovery. The full mantle
petals open for the ink discharge and its venting recovery; the other moves keep the pressure
housing assembled. A serializable recovery record retains the preceding move and its timing,
including a cancelled discharge. The [core damage rule](../src/combat/ironKraken.js) grants 1.8× only
for an actual direct weapon impact on the frontal aperture during a bound, active recovery phase.
An attacker standing in front is insufficient: a side impact, splash, status damage, or an
unbound/suspended score receives no aperture bonus. It uses the existing hit evidence and hull
body, with no new collider and no second damage subtraction.

Three acts change move order at 60% and 28% hull without secretly shortening the tells. Two mantle
plates cover the drive and weapon subsystem roles and can shed through the existing capital part
owner. Before detachment they are attachment records and visible petals, not extra rigid bodies.

For color-independent readability, pair color with motion and shape: gathered arms mean drive
charge; spread flank arms mean rake; open shell means exposed machinery. Reduced-motion or
reduced-flash modes must retain the footprint and commitment information. Strong silhouettes,
brief sound cues, and a bounded pulse can carry the warning without full-screen strobing.

The [attack effects](../src/render/ironKrakenAttackVfx.js) use the authoritative locked lane and
sector shapes. Their entire harmful region is visible on the first active tick. Travelling
crests add motion without implying that unreached portions are safe; cooling residue loses
its active coverage immediately. Effects stay fixed through body interpolation and floating
origin changes. Four reusable field slots and one front-aperture emission need no new geometry
or scene nodes per frame.

The [audio adapter](../src/audio/ironKrakenAudio.js) routes mechanical charge, rake, pressure jet,
ink discharge and recovery vent recipes through the existing positional audio system. Each
score stage sounds once, after audio is enabled by the normal gesture flow. Cancellation,
suspension, pause, death and restore stop or reset those finite voices. Do not create another
audio context or substitute wall-clock playback scheduling for score receipts.

Use the existing encounter machinery:

- [Encounter catalog](../src/data/encounters/capital-boss.js) owns registered authored scores.
- [Capital score](../src/combat/capitalBossScore.js) owns fixed-tick tell/lock/active/recovery
  sequencing, subsystem cancellation, suspension, and terminal outcomes.
- [Encounter runtime](../src/systems/capitalBossEncounters.js) routes commands through existing
  movement, damage, plate, and wing owners. Do not subtract hull or move entities from the rig.
- [Boss geometry](../src/combat/capitalBossGeometry.js) owns the authored hit regions.
- [Boss presentation](../src/presentation/capitalBossPresentation.js) is the presentation seam.

The stock mission spawner alone does not execute an authored score. Verify any added spawn route
actually attaches the encounter and preserves player-action gating, range/docking suspension,
resume, and terminal cleanup. A catalog entry with an attractive model is not a functioning enemy.

## 5. Make death specific without a hidden interior

The live shell does not carry a complete invisible engine or a second robot. Its four-batch pump
reveal is created on the first mantle opening and is hidden while the shell is closed. It models
the visible cross-braced frame, cylinders, gears, pressure manifolds, routed hoses, and cap spindle.
The closed dome carries only the shallow mechanisms visible through its inspection windows.
The eight shell petals rotate about fixed, visible hinges while the supported cap rises.
The pump remains seated in the pressure housing and its spindle reaches the cap throughout
the opening. The reference's exploded service demonstration belongs to destruction, not to
ordinary live articulation.
The separate death-only pump chunks are created by the VFX owner only when a valid kill first
requires the shared debris pool; no corpse geometry is preloaded inside each living creature.

[Kraken debris](../src/render/ironKrakenDebris.js), owned by the existing VFX system, emits 24
cosmetic pieces per death: four thin curved mantle shards, eight ivory arm sleeves, four dark
joints, four red-rimmed suction pieces, and four pump sections. Mantle shards have ivory outer
enamel, dark inner faces, and closed thin edges; never scale an arm sleeve to the head's dimensions.
When the model remains available, 20 pieces copy selected live
shell/arm poses. Multiply each instance by its own `matrixWorld`, including the scaled and banked
body ancestor; applying the root transform alone loses the normalized rig's scale. A removed
model falls back to the canonical kill position, projected through the floating-origin membrane.

The pool has a global ceiling of 96 live pieces, five instanced draws, and a maximum 4.8-second
lifetime. Repeated families share their geometry and one opaque material. Motion is cosmetic and
deterministically seeded without consuming `state.rng`; there are no per-piece simulation entities
or lights. Reduced motion holds a small separation instead of continuous tumble. The pieces add
no emissive flash, and the existing blast presenter retains its own accessibility controls.

The kill's actual `occupantGeneration` distinguishes successive victims when a numeric entity ID
is recycled. Capture that identity synchronously before deferred presentation and corpse removal;
do not deduplicate by bare ID or borrow the replacement occupant's model. Receipt/presentation
identity still suppresses duplicates, and the private world epoch rejects delayed old-world kills.
Pause, origin rebasing, rewind, save/load, world changes, and disposal must preserve these bounds.

**Capital aftermath remains owned by the existing lifecycle.** Combat settles death, credit,
loot entitlement, and wave consequences once at `entity:killed`. The cosmetic Kraken pieces begin
from that receipt. When the existing [dying-hull owner](../src/systems/dyingHull.js) admits the
successor wreck, it retains the real wreck's movement, holds the ordinary explosion, and ruptures
once at the wreck's current position. That wreck is no longer an enemy and does not hold the wave
open. The existing fracture owner may shed up to two physical pieces at a capital rupture; these
are separate from the 24 cosmetic Kraken fragments. The 96-piece ceiling describes this new pool,
not every effect, loot item, or physical wreck in the scene. The transient dying interval is not
saved; a restored wreck is a wreck. Do not introduce another death, reward, or rupture owner to
make the character's destruction look specific.

The successor's persisted `hulkVisual.lootTableId` selects the
[static Kraken wreck](../src/render/ironKrakenWreckVisuals.js), so dying or restored remains do not
turn into the backing Bastion spaceship. It reuses the live shape cache with a shared darkened
palette, five splayed mantle petals, four shortened curled arms, and four broken roots: 88 static
links, using the shared distant arm hardware so successive corpses do not retain all the living
asset's small fasteners. Its silhouette, cups, hydraulic rods, and broad shoulder dimensions remain
intact, with no attack animation, charge lights, or hidden engine. This is the existing wreck body,
not another simulated object. Physical fracture pieces keep their own existing render owner. The
roster warm admits the character wreck separately from ordinary ship packages; both ordinary and
paced detached teardown release its private instance buffers while retaining shared shapes.

## 6. Performance and acceptance

The rig's shared instancing, one collision body, lazy shallow reveal, and bounded cosmetic pool
are structural limits, not proof that the whole encounter meets the frame budget. The following
are acceptance requirements, not reported measurements. Use the current
[Finish Program](../design/program/finish/README.md) for whole-game frame targets.

Render repeated links, joints, and discs through instancing or equivalent batching. Reuse geometry,
materials, scratch vectors, matrices, and pose buffers. Avoid per-frame scene-node construction,
geometry rebuilding, recursive child searches, or a physics chain for every visible arm. Cull and
throttle presentation work outside the view without suspending combat authority. Lower detail may
reduce fine hardware, but must retain the eight-arm silhouette, tip curls, and tells.

The current camera-driven detail switch uses the projected head diameter, independently of the
large jet/culling bounds. Below 128 pixels it selects shared distant arm geometry; above 160 it
restores close detail. The hysteresis avoids repeated switches around one distance. Both levels
retain all 176 articulated links, all four cups per link, the white barrel profile, and four
hydraulic mechanisms per joint. Distant geometry omits subpixel fasteners and pinstripes and uses
simpler circular surfaces. Compare submitted triangles in the native capture report; those
counts do not establish frame-time savings. No new mesh, material, or pose buffer is allocated per frame.
Camera changes can switch detail while paused without advancing the score or pose.

The model is divided by responsibility: [hull and lazy pump construction](../src/render/ironKrakenHullGeometry.js),
[shared arm hardware](../src/render/ironKrakenArmGeometry.js), [pure motion](../src/render/ironKrakenMotion.js),
and the [production render owner](../src/render/ironKrakenVisuals.js). Keep the live actor, static
wreck, reference inspection, and gameplay view on those shared dimensions and resources. A polished
standalone replacement that bypasses the production factory is not evidence for the game asset.

Before claiming acceptance, establish:

1. **Reachability:** the unit enters through an ordinary player route, announces attacks, can
   damage and be damaged, dies once, and permits the wave/encounter to finish.
2. **Fairness:** tell, lock, active, recovery, subsystem cancellation, and suspend/resume work.
   Test large time gaps and player movement across the telegraph before activation.
3. **Visual truth:** inspect idle, charge, rake, exposure, and death at the actual gameplay camera.
   Compare terminal curls, trailing posture, and shell/optic proportions with the reference.
4. **Cost:** compare the same seeded scene and camera with and without the unit in the same session.
   Record CPU/frame percentiles, draw calls/triangles, allocation or memory growth, and the death
   spike. Report host contention and hardware; a headless microbenchmark is not player FPS.
5. **Bounds:** multiple simultaneous heavies and successive deaths respect the chosen arm-update,
   VFX, debris, and entity caps. Removing a creature releases its resources/listeners appropriately.

Record actual results and remaining limitations in the change's evidence, not by rewriting this
guide to assert success. Do not spend a broad regression run proving what one focused check can
answer; do not replace ordinary-route play with source-text assertions.

## 7. Turn existing units into a supporting cast

The [enemy catalog](../src/data/enemies.js) already separates gameplay role from `silhouette`.
Start by choosing an existing role with useful behavior; change its appearance and encounter
assignment together. Preserve its readable physical class and the player's learned answers.

For a Kraken screen, `wasp_swarmer` is a candidate for small scavenger/inspection helpers that dart
out during recovery; `pd_screen_escort` can guard its approach; `reaver_pirate` can pressure an exit.
These are composition options, not a request to replace all their existing appearances. Keep the
support count bounded and gate attack windows so helpers do not erase the boss's safe answer.
Giving a henchman a new paint job is useful only if its shape, movement, or job makes the encounter
clearer. Introduce one support interaction at a time and play it before adding another family.

## 8. Four future character briefs

These are unimplemented starting points. Each is deliberately small enough to build as one coherent
enemy, using existing damage, tether, drive, and encounter systems wherever possible.

| Unit | Silhouette and attitude | One signature move and a fair answer | Reuse and scope |
|---|---|---|---|
| **Funeral Tug** | A squat industrial hearse with a folded crane and a procession of coffin-shaped salvage pods. Solemn service lights; a machine doing its job much too literally. | Announces a tow lane, hauls a wreck along it, then swings the load through an arc. Cut/disable its towing mechanism or redirect the load while it commits. Pods remain physical objects with consistent ownership. | Reuse an existing tug/tether role and a small finite cargo train. Begin with one recoverable load; no bespoke funeral economy. |
| **Angler Salvager** | A dark folded shell with a single bright salvage lure extended far ahead. Its body opens like a collection clamp when prey approaches. | Lure glows and the jaws unfold before a short grab corridor commits. Shoot the exposed winch, sidestep the corridor, or tow the lure away if that interaction is implemented. | Reuse a salvage ambusher and existing tether/cargo rules. Never counterfeit unrelated HUD rewards or require an unavoidable proximity punishment. |
| **Foundry Bull** | Low, broad furnace body; two asymmetric lifting forks; heavy rear counterweight. Hot exhaust and impatient stamping of its articulated supports. | Scrapes its forks, aligns, and charges one fixed lane; a missed charge exposes rear cooling fins. Bait it into movable machinery or strike during braking. | Reuse a bruiser's mass/drive role. One fork hinge and one vent sequence can provide character without a full walking simulation. |
| **Courtesy Crab** | A corporate maintenance mascot: reassuring painted smile on a battered shield, oversized inspection lamp, two mismatched service claws. The expression never changes when the machinery becomes hostile. | Projects an inspection cone, closes one claw across a marked side, then rotates the shield. Cross behind the committed claw or break the lamp to cancel its aimed move. | Reuse a shield/escort role. The joke is the earnest service machine and its hazardous procedure, not borrowed clown/ice-cream imagery or constant dialogue. |

For any new character, deliver one unmistakable silhouette, one idle habit, one signature attack,
one readable counter, one response to damage, and one recognizable death. Wire that complete loop
into a real encounter before expanding its lore, variants, or attack list.
