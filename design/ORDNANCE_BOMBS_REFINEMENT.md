<!-- LIFETIME: PROGRAM (implemented core 2026-09-15; acceptance and content propagation below) -->
# Drift-bomb choreography: make a trap out of your trajectory

## Outcome and authority

The bomb bay is a **trajectory instrument**, not another forward gun and not eight coloured
status grenades. Lay a moving trap, commit its fuze, turn away, exploit the physical consequence.
The user explicitly authorized this redesign and implementation. This document supersedes the
preliminary report's obsolete capacity, cooldown, goo-braking and timing claims. Keep the existing
payload IDs, damage router, physics authority, status kernel, silhouette factory and burst VFX.
Do not create a second ordnance simulation, a second HUD, or eight target-scanning loops.

Implemented source is authoritative. Numbers are in `src/data/bombs.js`; sticky goo status numbers
remain in `src/data/combatDefs.js`. The equations live in `src/combat/bombDynamics.js`, lifecycle
in `src/systems/bombs.js`, read-only field geometry in `src/render/bombPresentation.js`.

## 1. Review of the preliminary landing

Reviewed base: `cda8dfd5331b845ab895312f81083edb78b42a87`, not an indexed older search snapshot.

| Finding in the original code | Why it matters | This implementation |
|---|---|---|
| Full bay sets the oldest bomb's `alive=false` | A seventh input erases the trap or gravity field the player is exploiting | Refuse the drop; preserve the six live commitments; no cooldown charged |
| One `cooldownUntil`, despite per-payload wording | A 3.5-second slug cooldown prevents practical pull-then-shove layering | Independent payload recharge plus a shared 0.35-second release latch |
| Goo changes mass/inertia and an action multiplier, not existing velocity | A fast hull keeps coasting through a supposed braking cloud | Solver-owned, cloud-relative viscous impulse; the ruptured cloud itself decelerates |
| Proximity checks endpoints, with an arming `else` blind spot | Fast targets can cross between ticks; arming can miss a valid encounter | Relative-motion swept chord, clipped to the arming time, same-tick trigger |
| Singularity uses constant strength and a hard-coded `1/60` | "Decaying" is not the implemented force; caller dt is ignored | Shared field envelope, actual dt, no force after expiry |
| `collides:false` is treated as equivalent to no body | Core still enrolls such entities; bomb kinematics needs an explicit owner | `physicsBody:false`, with bomb-owned previous-pose snapshots |
| Ship-like target index excludes stations and loose mass | Station damage and debris interaction differ from broad claims | One complete, stable target snapshot; static rocks are not pretended to move |
| Blast acceptance is not checked before shove/hitstun receipts | Effects can depict a force rejected by the physics port | Only accepted impulses publish shoves/hitstun |
| No bay socket or Settings rows | A implemented verb remains effectively undiscoverable | Real slot 9, live selection/count/cooldown, keyboard and controller rebinding |
| Existing bursts and patches do not describe a following live field | The danger can drift away from its apparent location | One bounded, source-following geometry batch, separate from burst ownership |
| Selection-reset prose disagrees with reset behavior | Save/new-game policy is unpredictable | Explicit transient reset, with lifecycle cleanup receipts |

Not every original sentence was a verified physics fact. In particular, the 1.6-second concussion
cooldown was not the longest; the 2.8-second slug has five half-second crush opportunities, not
eight. Increasing mass while preserving velocity does **not** conserve momentum. Ballast means
"harder to accelerate/steer," not "stopped in space." These distinctions now inform the design.

## 2. Player grammar and controls

**Release**: `dropBomb` (keyboard default **9**, pad **D-pad right**).
**Select**: `cycleBomb` (keyboard default **comma**, pad **D-pad left**).
**Commit**: existing `chargeDetonate` (keyboard default **R**, pad **D-pad down**).
Settings expose all three. Visible key names come from the binding registry, not hard-coded HUD
copy. The bay lives in the existing Field Hardware rail, not a new screen or panel.

The shared detonation edge is read by bombs before the legacy impulse-charge owner consumes it.
Bomb command affects **only the caller's armed, drifting bombs**. Safe bombs cannot bypass arming;
active fields cannot be force-collapsed by repeatedly pressing R. Existing charge-network behavior
is preserved; its older global charge scan is not newly claimed to be owner-filtered.

Release -> safe drift (0.5 s) -> armed drift -> committed warning (normally 0.18 s) -> burst/field
-> spent. Proximity or the ordinary time fuze still works without remote input. The warning is
capped by the original hard fuze deadline: a late command cannot keep a bomb alive indefinitely.
Once a warning commits, leaving proximity does not disarm it. The player can read the commitment
and turn away; enemies may escape during that delay. It is not guaranteed reaction time at every
speed. Pre-drop spacing, the slow arming phase and positioning remain the primary counterplay.

Six deployed objects per owner include fields; the world ceiling is 24. A full bay says no rather
than silently erasing a previous choice. Cycling never refunds recharge. Mixed payloads can be
released 0.35 s apart, while each keeps its own 1.2–3.5 s recharge. No ammo economy is invented by
this patch: this remains the existing free cooldown-based verb pending acquisition design.

### Useful combinations — consequences, not arbitrary combo multipliers

**Herd and break.** Release a neutron slug across a pursuit lane, open it with R after arming,
then stage a concussion drum. Commanding the drum does not terminate the slug. Its outward shove
competes with the still-active inward field. Fire early to scatter; fire late for a stronger escape
from the weakening well. There is no magic scripted attraction-to-explosion combo bonus.

**Tar and burn.** Put a braking volume where pursuers will actually cross, then use thermite while
they struggle out. Cloud drag slows their relative motion; sticky mass/DoT keeps a cost after exit.
This patch does not secretly implement goo ignition or extra thermal damage multipliers.

**Cross-current.** A Havoc pod applies a tangential component to the actual blast impulse, rotating
the radial direction without increasing total impulse. Use that displacement to spoil a firing
pass or send a hull across a rock lane. It is not just spiral decoration on a radial force.

**Self-shove escape.** Concussion causes no direct blast damage, but affects the owner too. A pilot
can deliberately ride the impulse; collision damage still belongs to the normal collision law.
Friendly-only proximity protection is not friendly-fire immunity.

## 3. Physics and determinism contract

### Drift

At release, `v_bomb = v_ship`; there is no extra throw velocity and no future steering attachment.
The capsule's drag remains k=0.14/s. Use the analytic pair, including the k=0 limit:

```
v1 = v0 * exp(-k*dt)
x1 = x0 + v0 * (-expm1(-k*dt) / k)
```

A bomb keeps about 66% of its speed after 3 s; it also falls behind a constant-speed coasting ship.
It does not literally "keep pace" with one. The emitted tar cloud uses k=0.9/s after rupture;
intact capsules still share the release law. That separate medium slows into a real pursuit trap.

Bombs are logical kinematic objects, excluded from the solver via `physicsBody:false`. They alone
write their own pose, velocity and interpolation snapshots. This is not permission to write a
victim's velocity. Foreign shoves use `combatPhysics.applyImpulse`, continuous forces use
`queuePhysicsImpulse`, and every damage/status application uses the combat router.

### Goo: strong, bounded, frame-relative braking

For each overlapping cloud, queue a fraction of

```
J = effectiveMass * (v_cloud - v_target) * (1 - exp(-k * falloff * dt))
```

`effectiveMass` includes the combat status response the upcoming solver step will use. Otherwise
applying the sticky mass penalty accidentally weakens the brake itself. Dividing by the number
of overlapping clouds keeps their combined impulse a convex blend: adding clouds cannot command
a velocity past every participating reference frame. It is deliberately not an unbounded additive
stack of brakes. Existing status mass/inertia and corrosive ticks are retained, not duplicated.
The cloud is an authored dissipative medium, not a two-body momentum-conserving collision model.

### Gravity and blasts

The slug linearly weakens from 100% to 25% of authored strength over its 2.8-second field life.
Spatial falloff and existing `FIELD_COUPLING` remain explicit. Expiration ends continuous force,
then routes the existing collapse snap once. Sector/save cleanup ends the field without an attack.
The last force slice is quantized to fixed ticks; no post-expiry force is applied. Do not claim
an exact variable-step event integrator for fields or status ticks.

Fuzes and blasts use surface distance: a large hull is not excluded merely because its centre lies
outside the radius. Trigger scans exclude owner and same team. Blasts retain friendly fire. Physical
loose bodies may be pulled/braked/shoved; static asteroids are not given fictitious movement or
ship damage packets. The complete target snapshot is collected once per occupied sim tick and
sorted by stable entity ID; the per-payload loops then work on that snapshot. Idle bay does not
scan targets. Goo overlap counting is O(fields * targets), not quadratic in fields.

Relative contact uses a swept circle against a chord over one fixed tick, predicting the target's
linear motion before the physics solve. This catches high-speed crossings; it is not curved CCD
against arbitrary future solver collisions. Do not claim line-of-sight occlusion: blasts retain
the existing unobstructed radial law.

## 4. Payload identity matrix — preserve these differences

| Payload | Physical question it answers | Existing identity retained | Required content-quality follow-through |
|---|---|---|---|
| Frag cassette | Can I put damage across a chase lane? | Compact segmented casing; explosive splash | Crisp fracture hierarchy, not a glowing ball |
| Concussion drum | Where should those hulls go? | Pure shove, cold directional sheets | Accepted shove direction must dominate the visual |
| Neutron slug | Where should enemies gather while the trap moves? | Gyros, moving pull/crush/collapse | Live field weakens visibly; its sound must inhale then release |
| Tarburst bladder | Can I steal their speed and escape route? | Sticky slow/DoT plus actual medium drag | Viscous material, readable clear paths, following boundaries |
| Static bomb | Can I interrupt their electrical capacity? | EMP channels/subsystem routing and ionized status | Verify actual disabled subsystem read, not purple flash alone |
| Thermite starter | Can I make staying here continue to hurt? | Thermal burst + burning stacks | Show burning on affected victims for the real status duration |
| Havoc pod | Can I spoil orientation and crossing geometry? | Tumble status plus cross-current shove | Spiral accents must correspond to the actual changed shove vector |
| Ballast slug | Can I make evasive thrust ineffective? | Existing PINNED mass/inertia response | Communicate weight, never fake a zero-velocity freeze |

No ninth payload until at least these eight pass actual route acceptance. Variety is eight
recognizable decisions, not eight entries in a JSON table.

## 5. Presentation implementation and honest quality boundary

The original `visualFactory.buildBomb` silhouettes and `vfx.js` burst handlers remain intact.
The new shared batch adds small drift marks, arming ladders, committed warning chevrons, inward
filaments for gravity and broad veins for tar. These follow actual interpolated source positions,
use the floating-origin membrane, show actual authored reach and stop with the field lifecycle.
No flat sprite, fake expanding shock ring, extra light, postprocess, random sim draw or separate
production animation loop was added. One bounded mesh/material carries the whole layer; at 24
fields its ceiling is 21,600 vertices (about 605 KB of CPU attribute storage, plus GPU allocation).
Individual extents are culled before geometry generation. Arrays are reused. No first-bomb mesh
exists on an empty baseline; route and scene replacement explicitly dispose it.

Reduced motion removes travelling accents without hiding the danger boundary. Reduced flash dims
this layer while preserving reach. The existing burst owner still applies its own accessibility
policy. A static mesh budget is not a measured frame-time or a visual-quality pass. Procedural bodies
still have their existing mesh cost; this patch does not claim to have batched those too.

**Visual acceptance remains open.** This execution environment blocked Chromium navigation with
`ERR_BLOCKED_BY_ADMINISTRATOR`; a direct context check also did not obtain WebGL. The source packet
omits the authored media. No screenshot or full-flight beauty/performance claim is fabricated.
`test/fixtures/bomb-choreography/presentation.html` is an inspection fixture using the production
mesh and existing procedural bodies, explicitly labelled as not the game. Inspect it at real
combat zoom, then the default route. Replace/reshape a motif that looks like a diagram instead of
matter. The fixture's enlarged body scale is for examination, not runtime tuning.

## 6. Propagation jobs for repository agents (finish outcomes, not paperwork)

### A. Route acceptance and look/feel — highest remaining priority

Run the default browser and Electron path with an isolated save (`SPACEFACE_PLAYER_STORE_DIR=''`).
Verify actual buttons/rebinding, release during forward thrust and sideways drift, a 90-degree turn,
coasting, simultaneous R with an armed legacy charge, pause/resume, docking, death and sector exit.
Capture all eight safe/armed/committed/burst states; additionally capture early/mid/late gravity and
tar fields. Repeat at normal/minimum combat zoom and reduced motion/flash. Every field marker must
remain attached after origin rebase; every status effect must expire with the status, not a guessed
particle lifetime. Do not accept a UI screenshot or a passing unit test as evidence of this.

Run a fixed seed/deterministic input tape with 0, 6 mixed, and 24 stress-test bombs, plus the existing
dense combat scene. Measure first-use hitch, CPU bomb update p50/p95, render submission and GPU time,
draws, allocation/GC and total frame pacing. Keep the baseline scene and quality fixed. If the first
batch/material use hitches, integrate preparation into the existing readiness/cook owner, not a
parallel preload framework or a hidden default quality reduction. Separate the cost of existing
bodies/bursts from this new single batch. No claim of 60 FPS from draw-call counting alone.

Acceptance: trajectory and blast are readable while fighting; no persistent render object after
cleanup; no dead input; no full-bay erasure; two useful mixed-payload maneuvers witnessed; focused
suite and both unmodified 47a goldens green; report candidate SHA and capture settings.

### B. Audio and victim-attached status craft

Adopt the actual cue IDs in `src/data/bombs.js` into the existing audio catalog. The preliminary
report claimed three new IDs but listed only two: `bombs.goo.burst` and `bombs.emp.pulse`; inspect
code, not that count. Give the slug a bounded, source-following inhale and a collapse snap; terminate
loops on every `bombs:fieldEnded`/cleanup path. No independent sim timers in audio. Keep low-frequency
shove weight without simply making concussion louder. Give tar a damp rupture, EMP a dry electrical
cutoff, thermite short ignition plus victim-attached burn, and ballast a heavy settling transient.

Share status presentation through the existing status owner so thermite from another weapon and
this bomb uses the same truthful burn duration. Wire goo residue to actual stacks. Every new
asset/cue needs catalog validation and reduced-flash/motion checks. Do not declare missing audio
"graceful degradation" as a completed sound design.

### C. NPC mirror and shootable counterplay

NPCs call `bombs.drop(owner, payloadId, state)` and `commandDetonate(owner.id, state)`; no copied
fuze/cooldown/effect implementation. Keep their ammunition/acquisition policy in its proper owner.
Start with one telegraphed pursuit-lane doctrine. Exercise owner death, faction changes, capacity,
world limits, retreat and target crossings. If legacy charges become NPC-owned, separately fix and
test their older global R scan; do not assume this bomb patch already changed it.

Shootability requires a **moving projectile-sweep proxy** with a clear authoritative pose adapter,
not a second integrator. Destroying the proxy retires the bomb exactly once and releases its VFX;
choose and document inert destruction versus committed detonation. Test same-tick bullet/proximity/
R/expiry races. Preserve the minimum arming law and friendly-fire policy. Never turn `physicsBody`
back on for the capsule without removing its kinematic owner and proving the replacement in Rapier.

### D. Economy, loadouts and orchestration

Do not penalize every experimental drop before the core verbs feel good. Evaluate a fitted rack,
small loadout and combat resupply rather than a catalogue of eight mandatory consumables. Economy,
cargo and unlock owners remain authoritative; failed release does not spend ammo. Preserve payload
cooldowns across mere selection changes. Selection persistence is optional and must be written to
a deliberate save subtree with schema tests; this patch explicitly keeps transient reset behavior.

Only add named trick/achievement recognition from actual existing bomb/impulse/damage receipts.
Do not award style merely for pressing two buttons or duplicate impulseCharges' chain-prime state.
Candidate trick: a single commanded drum displaces multiple hostile hulls after they actually
received slug pull; qualification must use causal receipts and real physics thresholds, not colour
or temporal proximity alone. Continuous pull provenance needs an authoritative receipt before
claiming that recognizer is implemented.

## 7. Verification receipt for this candidate

Focused command (53 tests passed):

```
node --test test/bombs.test.mjs test/bomb-choreography.test.mjs \
  test/bomb-presentation.test.mjs test/power-rail.test.mjs \
  test/input-lifecycle.test.mjs test/render-update-phase.test.mjs
```

Includes the real factory/index, all eight lifecycle routes, arming/sweep/caps, stable reuse,
remote ownership/shared edge, rejected-port receipts, loose mass, actual status-compensated Rapier
goo braking, moving-cloud drag, field cleanup, HUD/input and bounded/culling/rebasing/disposal tests.
The inspected shell suite requiring station UI could not import `@floating-ui/dom` from this
source-only environment; no fake dependency was substituted to make it green.

Full baseline completed: **13/15 green**, 53.6 seconds, 4 workers. Legacy and V3 golden runs,
legacy and V3 reload comparisons, massline aggregate, input-label, VFX-technique, save-schema and
other physics checks passed. Two environment/packet limitations: UI screen imports lack
`@floating-ui/dom`; render-package planning has no binary render packages in the source artifact.
Neither golden was edited. These limitations are not described as completed route acceptance.

Node testing used the repository's exact vendored Three 0.184 and embedded Rapier exposed locally
under their package names. Those local node_modules symlinks are not repository changes. No
production dependency, save schema, authored binary, golden or workflow change is part of this PR.
