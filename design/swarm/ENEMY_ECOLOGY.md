# Swarm enemy ecology

**Audit:** 2026-11-01, against `35b99d872` and the specialist changes in this PR.  
**Scope:** the ordinary Crucible Swarm ruleset, its finite ship cohort, its separate Brood population, and its boss rotation.  
**Selected implementation:** deepen the existing Warden Escort, Mine-Layer Jackal, and Anchor Controller IDs. The remaining eight briefs below are future work. Implementation on a PR branch does not imply that the branch is merged or that a live encounter has been accepted; use the [validation receipt](../../docs/validation/swarm-specialists/README.md) for the exact evidence.

## Judgment: enough breadth, insufficiently clear decisions

Swarm already has enough enemy **roles** to support an interesting survival game: **15 ordinary ship archetypes, 20 Brood families, and 14 boss encounters**. The wider `ENEMY_TYPES` catalog contains 32 definitions; that is a different count, not another 32 Swarm enemies. The highest return comes from making the existing threats recognizable, consequential, and answerable. Adding ten more differently named pursuers would make identification harder without making the player's choices richer.

The right unit of variety is a decision: change trajectory, change target, change timing, change weapon, or use a body in the room. A useful specialist changes one of those decisions while the fodder provides pressure and ammunition. The player's stock flight and gun must retain an answer; Massline, terrain, explosions, and enemy remains should provide a more expressive second answer. A special weakness is useful when the player can recognize and exploit it under pressure. It should not be a hidden resistance table that silently invalidates the loadout bought between rounds.

The current roster makes strong use of physics in its Brood and demolition roles. It underuses that promise when a heavy ship's field, a bodyguard's interception, or a minelayer's commitment reads like an invisible rule. The three selected upgrades connect existing combat owners to unmistakable authored bodies, motion, bounded danger cues, preparation copy, and recovery windows. They change the experience without increasing the roster count or the number of full ship entities.

These are design judgments supported by the source audit, not a claim that a unit test measures fun. Fresh ordinary-route play remains the way to establish whether players notice the tells, learn the counter, and want another attempt.

## 1. The taxonomy that is actually present

### Ordinary ship cohort

The unlock clock lives in [`SWARM_ROSTER`](../../src/data/swarmMode.js); baseline hull, weapon, mass, telegraph, and counter definitions live in [`enemies.js`](../../src/data/enemies.js).

| Arrival | Role | Unit | Decision it creates | Counter or weakness |
|---|---|---|---|---|
| 1 | Mass | Wasp Swarmer | Clear a pursuing pack while choosing the next movement line | Fragile, low-mass hull; focus fire, recoil, throw into packmates |
| 2 | Pressure | Reaver Pirate | Resolve the pursuer and its reinforcement relationship | Catch its commitment/retreat; use the wingmen as mass |
| 4 | Mass | Choir Zealot | Adds pack pressure in ordinary Swarm | Light throwable hull; ordinary Swarm stamps `pack_pursuit`, so its Adventure guardian behavior is not the mode's role |
| 5 | Demolition | Detonator Dart | Decide where the approaching bomb will die | Kill at range, shove away, or put its indiscriminate blast among enemies |
| 6 | Area denial | Mine-Layer Jackal | Choose a safe flank or turn a mine hazard into ammunition | Destroy mines, avoid the seeded lane, or throw an armed mine |
| 8 | Reach | Lancer Sniper | Respect a committed firing corridor | Cross the line, close inside its preferred band, or use cover |
| 9 | Bodyguard | Warden Escort | Decide whether to remove the guard or find a clean shot at its ward | Shoot/displace the Warden; keep its body off the shot segment; wait out the finite link |
| 10 | Elite | Corsair Raider | Punish a fast committed pass | Cross its pass, work recovery, bank or throw mass into the wing |
| 12 | Reach | Quiet Ghost | Locate and close on a low-signature standoff threat | Break lock and close under cover; it relocates after its alpha |
| 13 | Disruption | Customs Cutter | Deal with interdiction and a plated prow | Take a flank or bank off the room; the arena restamps its lawful Adventure contract |
| 14 | Projectile defense | Point-Defense Screen | Change the attack used against a screened pack | Use kinetics, shove, or peel the screen; its PD job differs from Warden body interception |
| 15 | Elite | Patrol Lawman | Read a plated interceptor's committed pursuit | Cross the pass and attack the stern while it turns |
| 16 | Control | Tether-Control Raider | Protect or contest the player's Massline | Displace its anchor, break it, or outmass the contest |
| 18 | Heavy pressure | Bruiser Brawler | Avoid a heavy commitment and exploit a slow turn | Flank or slip its pass; heavy does not mean immune |
| 22 | Environmental control | Anchor Controller | Choose between staying outside a finite field and interrupting its source | Exit the ring, shoot the source, or displace the hull during spool/hold |

There are important distinctions inside the broad data roles. Choir's ordinary Swarm behavior is pack pursuit even though its Adventure definition is a guardian. Warden intercepts direct weapon/action packets when its **body** crosses the shot segment. The Point-Defense Screen handles selected incoming projectile classes. Those are three different player decisions and should keep separate tells.

The mode requests a concurrent ship target from 10 to 30, with an arena spawn cap of 38 under the shared hard maximum of 40. These are ship budgets. They do not justify creating extra full ship entities for a visual, a projectile, or a Brood family. A round resolves its finite cohort; a specialist may not prolong it with unaccounted reinforcements.

First appearances are already authored more carefully than a weighted lottery. `swarmNewcomerFor()` identifies the exact debut, and [`survivalWavePlanner.js`](../../src/systems/survivalWavePlanner.js) reserves one of the wave's bodies and stages it at a longer-range bearing after four seconds. Deferred arrival remains owed. Later recurrence is weighted. The remaining question is whether the newcomer is visible and understandable through the actual camera, crowd, and effects—not whether another introduction scheduler is needed.

### Brood population

[`swarmBrood.js`](../../src/data/swarmBrood.js) defines nine base families; [`swarmBroodLate.js`](../../src/data/swarmBroodLate.js) adds eleven. The family engine and retained arrays live in [`systems/swarmBrood.js`](../../src/systems/swarmBrood.js). They are lightweight bodies with their own population budget, not ordinary ship quota entries. Population starts at 100 and reaches 400 by wave 21; non-Queen boss rounds reduce it to keep the encounter legible.

| Arrival | Family | Existing interaction and useful remains |
|---|---|---|
| 1 | Mite | Flocks and dives; sweep with the room; husk shards remain throwable |
| 3 | Spitter | Acid lands on a marked position; leave the marker; its sac becomes splash ammunition |
| 5 | Spore Drift | Drifting sticky cloud; blast clears it; avoid moving slowly through it |
| 7 | Charger | Commits to a dash line; sidestep it into rock; heavy horn plate survives |
| 9 | Lantern Cyst | Heat-seeking floating bomb with a prime tell; grab and throw into the pack |
| 11 | Leecher | Latches and brakes; scrape a wall; sticky remains become glue ammunition |
| 13 | Glassback | Guns ping off; collision/terrain mass cracks it; shards spread the payoff |
| 15 | Wake Eel | Follows and wraps the wake; turn and grab its tail; held body widens the whip |
| 17 | Bellows | A nonlethal hit swells it; another hit or its fuse causes a shove burst |
| 19 | Burrower | Hides in rock before a visible crack/emergence; clear the silhouette |
| 21 | Splitter | Death releases three smaller bodies from the held population budget |
| 23 | Brood Mother | Produces a bounded mite budget; kill the mother to stop the tide |
| 31 | Remora | Rides the wake and arms behind the player; shed it or pop it far away |
| 37 | Gloomcap | Burrowed bomb whose first hit starts its fuse; own the detonation position |
| 43 | Ash Wisp | Resists guns and whips; outrun its fuse or feed it an explosion |
| 49 | Keelback | Armored tail requires mass; turn it into the pack |
| 55 | Undertow | Drag follows the escape line; cut across the wake or burn down the source |
| 61 | Mirebulb | Brake field carries a bomb inward; leave the pitch or burst it outside |
| 67 | Clutchstone | Armored egg requires mass; crack it away from the ship |
| 75 | Pox Sac | Resistant bounded spawner; detonation interrupts its tide |

Volatile, Plated, and Commander strains join from waves 83, 97, and 111. They modify a seeded share of the Mite population; they are not three more species. One strain per room keeps the new rule identifiable. New ship concepts should complement this already broad language rather than duplicate acid, dash, drag, glue, bomb, armor, trail, spawn, and split mechanics under another name.

### Bosses and wider catalog

Every tenth wave uses the rotation in [`SWARM_BOSS_ROTATION`](../../src/data/swarmMode.js). The 14 encounters are Iron Maw/Dreadnought, Mirrorjaw Foreman, Forge Regent, Corsair Wing, The Anvil, The Quiet Choir, Brood Queen, The Tendril, Nest Carrier, Casket Worm, Furnace Maw, The Yardmaster, Adjudicator 44-C, and Hive-Hulk. Some are authored capital scores; others are compositions of already known enemies. Bosses have their own choreography and are not 14 additional ordinary roster slots.

The 32 wider enemy definitions also include mission/faction bodies and the fleeing Mule Trader. A catalog entry does not automatically belong in Swarm. It needs an arena role, lawful spawn and quota behavior, a readable debut, and at least one starter-loadout counter. Historical descriptions saying “one Dreadnought boss,” “19 enemies,” or “enemies have no abilities” do not describe the audited source.

## 2. Which systems are being used well, and what holds them back?

| Existing system | Useful expression already present | Gap this work addresses or future work must respect |
|---|---|---|
| Momentum, collision and Massline | Detonator placement, throwable light hulls, Brood remains, terrain impacts | A card must not promise throwing a 420-mass Anchor with any rope; movement/gun counter remains available |
| Canonical damage routing | Layered damage, physical effects, direct-fire screening, directional defenses | A guard needs a finite visible commitment; no recursive redirects or hidden blanket immunity |
| Mine ownership | Real shootable/throwable mines, arming, trigger, detonation and lifecycle | Freeze warning geometry before release; leave an open flank; cap and expire hazards; connect arming sound |
| Field ownership | Registered fields, bounded affected bodies, canonical force/impulse routes | Field center/radius and active interval must match the visible ring; displacement must cancel a commitment |
| Doctrine and telegraphs | Distinct approach, tell, hold, pass, egress and recovery phases | A similar hull and distant bark can hide the difference; animate the actual authored mechanism and transport phase changes |
| Shop, build progression and wave previews | Between-round preparation and a deterministic unlock clock | Explain the next guaranteed newcomer before purchase; avoid promising random future recurrence as guaranteed |
| Spawn and Brood budgets | Finite ship cohort plus separate low-cost crowd | New content must spend existing slots and retained arrays; never add unbounded full ships to simulate richness |
| Worker/render separation | Simulation authority and presentation read model | A new tell must cross the real worker transport and survive authored-model replacement; a local simulation field alone is invisible |

The decisive blockers are clarity and encounter composition. A player should recognize an enemy at gameplay size, see where its power will operate, understand when it becomes committed, and get immediate feedback when the counter succeeds. A cooldown hidden in data contributes little to fun; a folded projector, closing mine rack, or collapsing field boundary makes that cooldown usable.

Performance also changes the design. Lane 2's current crowd target is at most 8 ms for a 150-body simulation round, and Lane 1's board records separate rendering/loading problems. Those are targets and historical measurements, not performance results for this PR. A hitch can erase a half-second tell. More units are not an answer if their scans, geometry allocations, or simultaneous voices make the counter unreadable. Use spatial/index lanes, retain bounded effect objects, and do not add dynamic lights per specialist.

Existing counter text already has a reader: [`survivalAnnounce.js`](../../src/systems/survivalAnnounce.js) resolves `counterHint` through `HINT_PROSE`, and unknown tokens fail closed. The task is to make the prose precise and its claimed action real, not create a second hint channel. Likewise, the newcomer reservation already exists; improve its in-game exposure instead of adding another wave scheduler.

Historical acceptance must be kept separate. The 2026-10-29 [Swarm Renaissance gaps](../program/finish/SWARM_RENAISSANCE_GAPS.md) recorded a default-pilot wave-2 failure. This is a historical route result, not proof of a present defect. A 2026-10-30 attempt during this task was incomplete before flight after sparse-asset/startup problems; its transient evidence was lost when the workspace was cleared. It supplies neither a current pass nor current gameplay failure. The PR's fresh validation receipt states what the rebuilt candidate actually proves.

## 3. Top three ROI implementations

These are upgrades to stable IDs, not three new roster entries. They were selected because their mechanics already have canonical owners, each teaches a different decision, and each can become identifiable without a new combat subsystem.

| Priority | Existing ID / debut | Power in this PR | Ordinary counter | Physical counter |
|---|---|---|---|---|
| 1 | `warden_escort` / 9 | Finite, visible ward link; bounded direct-fire interception when the Warden's body crosses the shot | Hit the Warden, shoot around its body, or wait for recovery | Shove it out of range or off the shot line |
| 2 | `mine_layer_jackal` / 6 | A frozen warning lane and a bounded three-mine salvo on one flank | Use the open flank or shoot the mines | Throw an armed mine back at a hostile |
| 3 | `field_anchor_controller` / 22 | One telegraphed snare cycle with real off-time and a displacement interrupt | Stay outside the ring or attack the source during recovery | Move the source far enough during spool or hold to cancel that cycle |

### Warden Escort: a bodyguard with a breakable commitment

The existing base hull remains a heavy specialist: mass 96, hull 300, armor 90, shield 110. The power change is not extra health. One shared custody resolver chooses an eligible same-team, same-wave survival-cohort ward within **300 WU** for the approach. The Warden deploys its projector wings for **30 ticks** before the active link begins; the tentative custody choice grants no protection during deployment. Doctrine flies the screen point on that same ward-to-threat line, and an active link stays bound to its chosen ward rather than switching to a closer hull. It may protect that ward for up to **180 ticks**. The visible emitter-to-ward connection identifies the protected hull; the connection itself is not a projectile shield or collision plane.

When the Warden's body lies on an attacker's weapon/action segment aimed at that ward, canonical routing diverts at most **40% of raw packet damage**, limited by the remaining **92-point link budget**. The ward receives the remainder. Physical collision and explosion routes bypass this interception. Redirected packets cannot redirect again. Direct damage to the Warden, disabling the source, losing the ward or range, spending the budget, a breach dart, or normal hold expiry ends the link. A **90-tick recovery** and a fresh **30-tick relink tell** precede renewed protection. The target must not hop to another ward on the hit that breaks the old link.

A broad ivory bridge, navy split shield wings, and cyan projector ends give the hull its silhouette. Named wing pivots unfold during deployment and close through recovery. One faceted cyan link follows the actual ward position and weakens with link capacity. The existing ward-catch event supplies the interception cue; it must fire once for the guarded part of the packet. No new dynamic light or second damage owner is justified.

Acceptance includes a clean flank hit reaching the ward in full, a screened hit dividing only the configured share, and finite recovery after every break cause. Test same-wave/team eligibility, no Warden-to-Warden recursion, range, deterministic tie-break, disabled-source recovery, and target loss. The production sensor/doctrine regression must include a closer friendly Warden and a later nearer Wasp, and prove that custody, flight point, and active protection still agree. In a rendered encounter, the pilot should be able to identify the ward and then deliberately make the Warden fail. Preserve the separate Adventure screen contract.

### Mine-Layer Jackal: choose the open flank or steal the hazard

The Jackal retains its existing base mass 58, hull 110, armor 28, shield 45, and mine-layer doctrine. At the **30-tick wake cue**, freeze three world positions on one side of its approach. The warning and the released hazards use exactly those positions; neither may chase the player's later position. Release three canonical mines with **18 ticks between drops**, **90 ticks to arm**, **24 hull**, **52 WU trigger radius**, and **34 damage** to the trigger victim. The owner cap is **three live mines**. A **360-tick salvo cooldown** and **720-tick mine lifetime** prevent indefinite accumulation; the visible rack recovery is **45 ticks**.

The actual mine owner damages one trigger victim. This PR does not promise an area-damage chain, mine-on-mine detonation, or a whole-pack grenade. Shooting a mine neutralizes it. A thrown armed mine can hurt a hostile through the existing thrown-mine rules and release grace; the interesting choice is taking the risk to reuse a live object. The far flank remains open. New mines must never be silently seeded directly under the player's hull.

The authored body is an ochre industrial catamaran with separated rails, three visible cradles, dark launch hardware, and moving ejection gates. The render cue traces the committed lane from the authored ejector socket. Once the source leaves the commitment, its lane cue disappears; the real mines retain their own arming and danger tells. Canonical `mines:armed` must feed the existing positional arming cue, sharing admission with the legacy weapon receipt so one mine does not produce two clicks. Detonation uses its existing separate event.

Use `mineLayerVerb` as policy and `systems/mines` as lifetime/damage authority. Disable the old NPC bomb-mirror path only for the Swarm Jackal to avoid a hidden second attack; Adventure keeps its original cadence. Release flagged specialist mines on both wave clear and run end through that same mine owner, preserving unrelated player and Adventure mines. The room's arena-mine teardown cannot stand in for this: it owns a different mine source. Test frozen geometry while the player/source moves, the three-body cap, timing, shooting, throwing, expiration, and round cleanup. The wave-6 preview should teach “open flank / shoot / throw” before the player buys a counter loadout.

### Anchor Controller: a field with an interrupt and a real off-state

The base Anchor is a fixture-weight body: mass 420, hull 360, armor 105, shield 120. Do not sell it as an ordinary throwable. The existing field owner registers its Swarm field **unarmed**. Doctrine supplies the **30-tick spool**, so there is no hidden second spinup. The active snare has **220 WU radius**, **88 strength**, and up to **180 active ticks**. Recovery lasts at least **75 ticks**, may extend to **200 ticks** while its separation condition is unmet, and retains the doctrine's existing reform leg. The field must not turn itself off simply because the player enters its own radius.

Record the source position at spool start. Displacement of **36 WU or more** during either spool or active hold cancels the cycle. Latch the cancellation immediately: returning to the original position before the tell ends does not restore the attack. Only a later approach starts a fresh commitment. The fields owner applies the actual impulse to eligible bodies inside the radius and none outside it; source removal, disable, and run end must remove active force and the corresponding danger presentation. Cleanup must work even if the source entity has already left the map.

Its teal/ivory body has three articulated vanes around an exposed amber gravity spool. During windup, a subdued boundary shows the true future radius; during active hold, the same boundary strengthens; recovery clears it. Vane pose follows simulation phase. Do not promise that an amber model core becomes dark unless the renderer actually implements that material change. The counter sentence says the **field is down**, which is the observable state. Reuse the existing doctrine/field audio routes; do not claim a new abort sound or continuous hum without an actual listener and voice.

Test initial unarmed registration, doctrine timing through the real sensor projection, force inside/outside the radius, spool displacement followed by return, active displacement, minimum/maximum recovery, and source-free cleanup. A rendered encounter should show an intact flight escape route around the ring and an unmistakable canceled field. The player's baseline gun and movement are valid answers even if its equipped line cannot displace a heavy body.

### Shared integration contract

[`swarmSpecialists.js`](../../src/data/swarmSpecialists.js) owns the Swarm tuning and preview vocabulary. Production `aiPorts` projects a bounded `swarmSpecialistKind` enum and a safe-integer-or-null `swarmWardTargetId`; `contracts.js` normalizes these before the doctrine reads them. The Warden's read-only sensor projection and live link use the same custody resolver, so the movement owner cannot screen another Warden while the power protects a Wasp. A doctrine consumes sensor state, not the raw entity's data bag. This avoids a power that works in a hand-built fixture but never gets its configured timing in the real AI stack.

[`swarmSpecialistPresentation.js`](../../src/data/swarmSpecialistPresentation.js), the worker host, and the read model carry the small phase/geometry snapshot. Steady tells do not resubmit changed vitals; nested target/energy/point changes invalidate the cached frame; deletion clears stale presentation. The phase driver belongs to the durable authored boundary, survives asynchronous package replacement, and runs after generic authored motion. Socket/world coordinates must honor the renderer's translated origin. Missing state hides the previous effect immediately.

Each ship follows Forge source GLB → release GLB → optimized render package → runtime hostile map. Named rigid pivots and motion-bank contracts survive optimization and LOD changes. Source, released bounds/collider measurements, authored rig, and the visible gameplay-camera result must agree. New texture metadata describes the actual shared Forge material; it must not change a global validator just to make three assets pass. The next-round preparation line exposes specialist advice only when the newcomer is guaranteed.

## 4. Future roster: eight concrete agent handoffs

These are **planned**, not implemented by this PR. F1–F4 are the next candidates for missing decisions; F5 is conditional on proving a difference from Warden; F6 is a composition recipe; F7 depends on cover truth; F8 is a boss proposal. They are not an instruction to add eight simultaneous ordinary debuts.

### Common implementation contract

All timings below are simulation seconds, converted to integer 60 Hz ticks in config. The proposed values are starting playtest candidates, not accepted balance. Damage always goes through the existing combat router; movement/impulses use the existing flight/physics owners; events do not write outcomes from presentation. Every reservation, target claim, hazard and effect must clear on interruption, source death, run end, sector exit, and new game. Persist only authoritative state needed for deterministic continuation; do not serialize renderer objects.

A new ordinary unit gets a stable catalog ID and one deterministic debut within the existing finite cohort, then a modest recurrence weight. Choose its actual debut after examining neighboring lessons; the suggested trial waves below are not changes to the shipped ladder. Its preparation card states threat and counter in one readable sentence each. Tell geometry is frozen before commitment, visible in reduced effects, and distinguished by shape and motion rather than color alone. Each brief requires one starter-build counter and one physical/environmental answer. Preserve an open escape route; never synchronize a new control mechanic with an unavoidable second hit.

Suggested files named below are **new proposed locations**, not existing APIs. Existing owners are linked separately. Inspect their interfaces before implementation; do not create a second damage, projectile, field, quota, or wreck authority.

### F1. Foundry Sweeper — move across a lane, not away from homing fire

**Behavior.** `acquire` selects an occlusion-tested 420 WU segment. `windup` lasts 0.8 s and freezes its start, endpoint and clockwise/counterclockwise sweep direction. `sweep` lasts 0.65 s through a 35-degree arc at constant angular speed; it never follows the player's current bearing. `vent` lasts 1.6 s before reposition. A heavy body or rock occludes the beam at the first valid hit surface. One target can receive at most one 22-damage packet per sweep. The beam can hurt hostile bodies so the room offers a payoff, but it cannot damage through cover or through a telegraph that was not visible.

**Counter and asset.** Stock flight crosses the marked lane before commitment; stock gunfire can kill the source; a thrown hull can block the sweep or strike its exposed vent. Build a low armored spindle carrying one long lateral emitter, with `MOTION_SWEEPER_YOKE`, `MOTION_SWEEPER_VENT` and a `SOCKET_SWEEP_ORIGIN`. Windup shows the complete path and direction, active uses a narrow core plus a restrained edge, and vent opens visible radiator fins. Use one rising coil cue, one sweep voice, and a dry vent release. No per-beam light.

**Integration and acceptance.** Proposed config `src/data/swarmMachineUnits.js`; doctrine in existing `combatDoctrine`; geometry through `combat/telegraphFootprint` and canonical hit/occlusion queries. Cap two sweepers per room and one sweep per source. Retain one effect object per emitter. Test fixed segment despite target movement, first-occluder behavior, one hit per target, friendly hostile contact, cancellation, and cleanup. First trial encounter: one Sweeper with light pack pressure, without Anchor or another lane-closing effect. Do not increase density until a gameplay-camera capture shows a visible crossing route.

### F2. Salvage Assembler — contest a wreck before it returns

**Behavior.** `seek_wreck` chooses the nearest eligible hostile wreck within 260 WU, with stable entity-ID tie-break. It may start only after obtaining a reservation from the wave owner's **unspawned finite quota**. `plant` takes 0.6 s; `assemble` takes 5 s, holding that exact wreck; `release` materializes one low-tier reserved hostile, then `recover` lasts 2 s. Damage to the assembler, source displacement of 36 WU, destruction/movement of the wreck outside 320 WU, or invalidation of the reservation cancels into recovery. No start when the wave owes no unused quota. Maximum two successful builds per wave.

**Counter and asset.** A normal gun hit interrupts the channel; the pilot can destroy the assembler, move the wreck, or carry it away. Build a compact industrial hull with two articulated grasping jaws and an exposed assembly spool: `MOTION_ASSEMBLER_JAW_L/R`, `MOTION_ASSEMBLER_SPOOL`, `SOCKET_ASSEMBLY`. Mechanical sections light in sequence over the full channel. The link endpoint stays on the actual wreck. A countdown contracts toward it, with one servo bed and a distinct cancel clank. On cancel, release the claim; do not delete ordinary salvage to simplify cleanup.

**Integration and acceptance.** Proposed specialist policy `src/ai/swarmAssemblerVerb.js`, config in `swarmMachineUnits.js`; existing wave planner/owner grants and consumes the slot, and existing wreck lifecycle owns the target. Exclude bosses, champions, player wrecks, already claimed wrecks and ambiguous ownership. No arbitrary entity clone or second reward. Cap one Assembler and one active channel per room. Test no-reservation refusal, duplicate release/cancel, source and target loss, save continuation, exactly one kill credit per real body and no quota overrun. The first encounter should make the wreck reachable to the player before the five-second timer can complete.

### F3. Ricochet Sawblade — a hostile hazard the player can redirect

**Behavior.** A launch mount displays an authored first segment and a dashed expected second segment. `charge` lasts 1 s; `launch` releases one non-homing disc at 110 WU/s; at most three solid contacts reflect it through the existing collision owner. `decay` lasts 0.7 s before shatter; total flight lifetime is at most 6 s. A deliberate external impulse can change its course, but maximum speed is 150 WU/s and the collision budget never resets. One target takes at most one 24-damage packet per pass, with a 0.5 s same-target separation floor. Both teams can be hit.

**Counter and asset.** Stock movement leaves the telegraphed segment. A rock intercepts it; Massline or a shove can redirect it into the pack. Build a toothed disc with a clear central hub, mechanical spin pivot and an intact/cracked state. Its launcher uses an existing room-mount body where possible rather than another full ship. Use one light-free retained trail; launch is a sharp transient, reflection is a short metallic clang, and decay visibly slows the glow. The tell stays legible under Reduced effects.

**Integration and acceptance.** Proposed config `src/data/swarmSawblade.js`; use the existing projectile/contact and impulse owners. If the current projectile contract cannot accept a physical impulse safely, use a bounded physical hazard through that owner rather than invent a visual-only trajectory. Cap two live discs globally; source death disarms its unpublished charge, while a released disc follows its finite lifetime. Return all discs/effects at round reset. Test contact budget, speed clamp, per-pass hit admission, changed direction after impulse, both-team impacts, no spawn inside the player, and deterministic boundary contacts. The trial room needs at least one usable cover surface and a broad open lane.

### F4. Magnet Sentry — bend the shot lane while preserving ship control

**Behavior.** `choose_cone` locks a 60-degree cone of 350 WU radius, at least 20 degrees away from the player's exact current bearing. `polarity_tell` lasts 0.75 s; `bend` lasts 1.1 s; `cooldown` lasts 2 s. Only eligible light projectile classes curve toward the displayed pole. Start with a 60-degree/second angular ceiling and a 45-degree total deflection ceiling per projectile, preserving speed. After leaving the cone or reaching its deflection budget, the projectile continues on its new trajectory. The cone never retargets during the tell or active phase.

**Counter and asset.** Move outside the cone, shoot during cooldown, kill or displace the sentry. A bent player shot can hit a hostile, so the rule can benefit the player. Two pole prongs rotate into place (`MOTION_MAGNET_POLE_L/R`), a curved directional ribbon explains polarity, and the source retracts during cooldown. Use a low rising tone and one activation snap. No change to player velocity, aim, tethers, mines or capital projectiles; the threat is the projectile lane alone.

**Integration and acceptance.** Proposed config/policy in `swarmMachineUnits.js` and existing specialist AI; actual trajectory changes must use the projectile/field owner. If fields cannot safely affect the eligible classes, defer the concept until that seam is explicit. Cap one active cone globally and eight influenced projectiles per tick, with deterministic candidate selection. Do not globally scan every entity. Test eligibility, frozen cone, total curvature cap, speed conservation, source disable/death, round cleanup and unchanged player controls. Introduce it with slow visible bolts and no concurrent snare; add faster projectiles only after the player can read the curved path.

### F5. Shield Linker — admit only if cutting geometry is a new decision

**Admission rule.** Warden already asks “remove the guard or find a clean shot.” The Linker qualifies only if the **coupling segment and its node** can be attacked as independent geometry. Prototype two eligible same-team endpoints within 300 WU, excluding existing linked endpoints. `windup` lasts 0.9 s; `linked` lasts at most 2.4 s; `cooldown` lasts 1.8 s. Only projectiles crossing the visible segment lose up to 35% of raw energy, spending a total 60-point segment capacity. No aura, health regeneration, collision immunity, or reflected projectiles. Opaque cover breaks the segment rather than allowing a through-wall shield.

**Counter and asset.** Kill/displace an endpoint, shoot the coupling node (32 hull, no armor/shield), or throw a body through the segment to break it. A compact two-boom controller unfolds sockets toward both endpoints; the small coupling node visibly carries the rule. `MOTION_LINKER_BOOM_L/R` and `SOCKET_LINK_L/R` define the authored geometry. Charge segments in order, show full taut geometry only while active, and play a single crisp break voice. Baseline gunfire must kill the exposed node quickly.

**Integration and acceptance.** Proposed config `src/data/swarmLinker.js`; deterministic endpoint selection in specialist AI, segment crossing and reduction in canonical combat geometry. Cap one segment per Linker and two per room. Dedupe crossing damage/energy accounting and clear on any endpoint transition or room end. Test projectile crossing versus parallel movement, moving endpoints, occlusion, direct node hits, finite budget and non-recursion. If the prototype still feels like another Warden health shield, do not add the ID; improve Warden composition instead. No permanent ordinary-wave slot is assigned by this document.

### F6. Formation Diver — a composition, not another species

**Behavior.** Reuse one unlocked Corsair leader and two Wasps from the wave's own quota. `gather` lasts at most 1.2 s; `line_tell` lasts 0.9 s; `crossing_pass` lasts at most 1 s; `reform` lasts 1.4 s. Freeze three approach vectors at tell start around the player's previous position, leaving a corridor at least 70 WU wide. The formation does not update those vectors to chase the pilot during commitment. If the leader dies, is disabled, or moves more than 70 WU from its committed start before launch, cancel the synchronized pass and return survivors to their normal doctrines.

**Counter and presentation.** Move through the safe corridor, kill/shove the leader, or use cover and the wing's own mass. Keep the existing hulls, damage and reward rules. One shared chevron resolves into three per-ship cues at commitment; one chord is preferable to three stacked warning voices. Existing drive/yaw animation carries the maneuver; this does not justify new geometry, a new weapon or a new enemy catalog ID.

**Integration and acceptance.** Proposed data recipe `src/data/swarmFormations.js`, consumed through existing cohort/choreography and doctrine owners. Cap one three-ship group per wave. Keep the normal firing budgets; do not grant three bonus volleys because the formation was selected. Test fixed arrival/order, leader loss, timeout when gathering fails, corridor width accounting for collision radius, doctrine return, and unchanged kill/quota accounting. Suggested trial wave 24 after the individual members are familiar, not on a new specialist's debut. Reject the recipe if it only feels like three simultaneous spawns without a deliberate movement puzzle.

### F7. Siege Crawler — one readable attack on cover

**Dependency.** First prove the arena's targetable cover has stable durability, fracture visuals and a surviving alternative route. The Crawler then attacks one eligible cover object, not an unmarked point under the player. `acquire_cover` chooses a breakable obstacle on an approach without selecting the last safe cover or only exit. `brace` lasts 0.6 s; `aim` lasts 1.2 s; `fire` releases one 38-damage projectile; `reload` lasts 2 s; `expose_rear` lasts 0.8 s. Use ordinary damage against both bodies and cover; do not delete terrain directly.

**Counter and asset.** A normal hit interrupts brace/aim; the pilot can kill/shove the Crawler, change lanes, or place an enemy in the committed shot. Four visible braces and a low gun carriage make it distinct: `MOTION_CRAWLER_BRACE_1..4`, `MOTION_CRAWLER_BREECH`, `SOCKET_SIEGE_MUZZLE`. A target ring names the exact cover object; a rising bore cue precedes one dust-backed bolt and a clear crack. A restrained debris cap preserves visibility after fracture. The rear mechanism opens during reload.

**Integration and acceptance.** Proposed config `src/data/swarmSiegeCrawler.js`; doctrine selection plus the existing environment/obstacle damage and projectile owners. Cap one Crawler and one siege shot alive. Release target claims on cancel, death and round end. Do not attack persistent player construction until ownership and repair consequences are deliberately designed. Test target eligibility, no-last-exit selection, interrupted aim, projectile lifetime, canonical fracture, duplicate impact and cleanup. A rendered trial must show a second route staying open throughout. This unit is deferred if cover truth is not yet reliable.

### F8. Rival Pilot — a named boss encounter

**Behavior.** A rival uses two authored patterns inspired by broad player build categories, never copies exact gear rolls or changes damage secretly in response to success. At encounter initialization, read existing resolved weapon/loadout tags, choose from a small documented pattern table, and freeze that choice; unknown categories use a fixed default. `salute/read` lasts 2 s. `first_pass` performs one telegraphed pattern with at least 1 s recovery; `counter_pass` uses a second distinct pattern with at least 1.2 s recovery. A visible hull threshold advances `retreat_or_finale`; no untelegraphed immunity phase.

**Counter and asset.** Cover, ordinary flight and a starter gun can answer every pattern. Advanced play throws a room object into the exposed recovery. Reuse a high-quality fighter hull with one unmistakable authored silhouette detail—an asymmetric movable dorsal sail or paired countermeasure vane—rather than another enlarged Bastion. Add a named intro, one short music motif and a distinct commitment cue; reuse the boss HUD. The rig needs only the new named mechanism and existing weapon/drive sockets. Never add unlimited homing ordnance or clone the player's save state.

**Integration and acceptance.** Proposed score `src/data/encounters/capital-boss/rival-pilot.js`, indexed through [`capital-boss.js`](../../src/data/encounters/capital-boss.js), using [`capitalBossScore`](../../src/combat/capitalBossScore.js) and [`capitalBossEncounters`](../../src/systems/capitalBossEncounters.js). One boss slot, no unbudgeted escorts. Suggested experimental encounter after the existing 14-encounter rotation, not a regular `SWARM_ROSTER` entry. Validate both weak and strong builds against the same counter windows, category fallback, saved score continuation and clear win/loss attribution. Existing bosses and the route to them deserve attention before expanding the rotation.

### Concrete starting configuration and asset handoff

All numerical values here are **proposed prototype baselines** before existing wave scaling. `H/A/S` means hull/armor/shield. Use flat armor 0–1 for the ordinary candidates so starter hits remain meaningful; the Rival may start at 2. Preserve existing level scaling instead of adding a private multiplier.

| Brief | Proposed identity / config | H/A/S; mass; speed (WU/s) | Main power and hard caps | Asset mechanism / suggested trial |
|---|---|---|---|---|
| F1 | `foundry_sweeper`; `swarmMachineUnits.js` | 140/18/30; 64; 56 | 22 damage once/target/sweep, range 420, width 18; 2 sources, 1 sweep/source | Yoke + vent, one emitter socket; solitary trial before weighted recurrence |
| F2 | `salvage_assembler`; `swarmMachineUnits.js` | 130/18/35; 72; 38 | 5 s channel; 1 source/channel globally; 2 completions/wave, each spends an unspawned quota reservation | Two jaws + spool, wreck socket; a visible reachable wreck and light pressure |
| F3 | `swarm_sawblade` hazard; `swarmSawblade.js` | Disc hull 30/no armor/no shield; 20; 110 (cap 150) | 24 damage/pass; 3 contacts; 6 s life; 2 live discs globally | Disc spin + cracked state, reuse launcher mount; cover-rich trial |
| F4 | `magnet_sentry`; `swarmMachineUnits.js` | 160/24/40; 90; 32 | Cone 60°/350 WU; 60°/s curve, 45° total; 1 cone globally, 8 projectiles/tick | Two pole pivots and directional ribbon; slow bolts first |
| F5 | Conditional `shield_linker`; `swarmLinker.js` | 150/20/40; 76; 48; coupling node hull 32 | 35% reduction, total 60 energy; 300 WU link; 1/source, 2/room | Two booms + exposed coupling node; prototype only until distinct from Warden |
| F6 | `formation_diver` recipe; `swarmFormations.js` | Inherit Corsair + two Wasp definitions | One 3-body group/wave; ordinary weapon budgets; safe corridor ≥70 WU | Existing hulls/drive rigs; suggested trial wave 24 |
| F7 | Conditional `siege_crawler`; `swarmSiegeCrawler.js` | 240/35/60; 180; 28 | 38 damage/shot; 1 source, 1 shot; never select last safe cover | Four braces + breech; trial only after cover durability/exit proof |
| F8 | `rival_pilot` boss; `capital-boss/rival-pilot.js` | 700/80/180; 88; 100 | Two frozen authored patterns; one boss slot; use existing projectile budgets | Distinct fighter mechanism + current boss presentation; experimental wave 150 slot |

Asset files proposed for full hulls are `tools/blender/forge/ships/<id>.py` and their matching source/release packages. Each has complete near/mid/far silhouettes, collision truth, damage/drive hooks, required motion-bank bindings, and authored material roles. These are delivery requirements, not a demand for a particular triangle count independent of visibility. Review the gameplay-camera view and a close rig view before admitting a hull. The Sawblade and formation explicitly avoid unnecessary ship bodies.

## 5. Composition, progression and shipping order

First finish the three upgraded specialists on their existing waves. Next prototype F1, F2 and F3 individually; they add different decisions with comparatively narrow ownership seams. F4 follows only if projectile deflection has a safe canonical owner. F5, F7 and F8 stay conditional. F6 can be tried earlier because it reuses existing entities, but its synchronization must create a real safe corridor rather than a difficulty spike.

| Pairing | Desired interaction | Guardrail |
|---|---|---|
| Jackal + light pack | Choose open flank or reuse a mine against one hostile | Do not close both flanks; do not imply mine chain/AoE damage |
| Warden + light pack | Pick off or displace a visible bodyguard before clearing its ward | One ward per Warden; no recursive protection or extra aura |
| Anchor + shooter | Route around the field while reading a separate committed shot | Do not synchronize their windows into a guaranteed hit; either source remains answerable |
| Sweeper + Brood | Cover and enemy mass block a beam across the crowd | Keep the lane visible through acid/bomb effects; no full-screen sweep |
| Assembler + wreck-rich room | A wreck becomes a temporary contested objective | Existing salvage ownership and finite quota remain authoritative |
| Formation + ordinary cover | One deliberate crossing line creates a bank or collision payoff | Only known hulls; one group; no first-debut pileup |

Forbidden compositions include permanent snares, chained movement/fire suppression, hazards spawned invisibly within the player, every exit closed at once, and a body that is simultaneously gun-proof, blast-proof and impossible to move. An enemy's recovery must be useful at the actual camera and simulation cadence. Avoid raising hull as a substitute for an unfinished power or missing response.

Preparation can support this ecology without more loot systems. The next guaranteed specialist's card should name both a stock answer and the physical payoff. A mine counter does not require a rare anti-mine gun. A field counter does not require a lucky cleansing powerup. Equipment and upgrades should improve the available approaches—reach, recoil, line capacity, cooldown, control—while the baseline interaction remains solvable. Review the shop offer relevance against the upcoming lesson rather than adding random stat boosts to compensate for opaque enemies.

## 6. Implementation map and verification scope

| Concern | Existing owner / relevant checks |
|---|---|
| Roster, quota and debut | `src/data/swarmMode.js`, `src/systems/survivalWavePlanner.js`, wave owner; `test/crucible-swarm.test.mjs`, `test/fb-023-swarm-lawful-roster.test.mjs`, `test/swarm-ladder.test.mjs` |
| Doctrine/specialist policy | `src/ai/combatDoctrine.js`, `src/ai/specialistCounterplay.js`, `src/ai/swarmSpecialistRuntime.js`, `src/ai/mineLayerVerb.js`, `src/systems/tacticalAI.js`; `test/combat-doctrines.test.mjs`, `test/pb-tac-b-disrupt-ward-anchor.test.mjs` |
| Damage and field truth | `src/combat/damage.js`, `src/systems/mines.js`, `src/systems/fields.js`; `test/grok-fight-09.test.mjs`, `test/mine-layer.test.mjs`, `test/field-anchor-controller.test.mjs` |
| Worker and sensor integration | `scripts/lib/simWorkerHost.mjs`, `scripts/lib/simReadModel.mjs`, `src/systems/aiPorts.js`, `src/ai/contracts.js`; production port check and specialist presentation tests |
| Player explanation | `src/data/swarmLadder.js`, `src/ui/screens/crucibleDraft.js`, `src/systems/survivalAnnounce.js`; specialist preview contract and ordinary preparation surface |
| Authored presentation | `src/render/partsLibrary.js`, `src/render/swarmSpecialistVisuals.js`, Forge builders, release/package manifests, motion banks and model-truth census |
| Audio | `src/audio/audioSystem.js` and existing doctrine/mine/field/ward cue owners; real mine-owner/audio-bus arming check |
| New focused regressions | `test/swarm-specialists.test.mjs`, `test/swarm-specialist-presentation.test.mjs`, `test/swarm-specialist-preview.test.mjs` |

A focused simulation check establishes mechanics; a worker/read-model check establishes transport; a rendered package check establishes the loaded model/rig/cue; a public route establishes ordinary reachability. None alone establishes optimal fun or target-machine performance. The [validation receipt](../../docs/validation/swarm-specialists/README.md) must distinguish those claims and record unresolved limitations. Do not cite an earlier session's lost logs as fresh candidate evidence, and do not count a brief, a screenshot fixture, or a new catalog name as a completed live encounter.
