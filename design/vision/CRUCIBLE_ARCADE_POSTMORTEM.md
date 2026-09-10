<!-- LIFETIME: DURABLE — dated product diagnosis; refresh findings against the active gameplay route. -->
# SpaceFace: the mechanics that are fighting the arcade game

**Revised 10 September 2026 after the owner's rejection of the first analysis.** This replaces that analysis. The present request is a concrete diagnosis and direction, not authorization to implement the quoted earlier campaign. Only this report was changed.

The evidence combines the preceding ordinary-menu Crucible play sample with a deeper reading of the current working source and direct calls to production flight, ship-derivation and surface-contact functions. HEAD during this revision was 3048a2ac3, with substantial concurrent uncommitted work. Calculations below are identified as calculations; proposed numbers are starting points for design, not measured optima.

## The actual diagnosis

The description calls for a game in which **movement arranges a crowd, weapons deform it, terrain destroys it, and that destruction spreads**. The player should be conducting a violent physical process while enjoying the flying and gunfire themselves.

Several present mechanics actively prevent that process:

- The ordinary asteroids generated for Swarm have an **absorbing** projectile material. The signature starter's bank shots therefore do not bank off that rock.
- The common swarmer uses a **flyby dogfighting doctrine**, with a short attack phase followed by disengagement and reforming.
- The default Crucible Hornet uses an **84 WU/s velocity target**, or 122 while boosting. Its controller actively brakes motion above that target even when the input marks the momentum as earned through a physics move.
- The starter advertised as a stream of banked bullets fires its main autocannon **four times a second**, with short individual slugs and a 60 ms ribbon linger.
- Ordinary ship destruction does **not** automatically deliver the damaging death blast in the owner's description. The implemented sympathetic chain needs temporary priming and starts at only **8.4 damage before falloff**.
- The current Snarl makes short chains among nearby enemies. The larger physical hub, winding web and bomb-web fantasies described in the plans are distinct, substantially unfinished behaviors.
- Audio is deliberately muted by default, and some implemented distortion effects require a render path that is disabled by default.

This concerns what the game permits, how forces compete, where enemies spend their time, how many objects participate, and how much of an impact the player can perceive. Better instructions cannot repair those relationships.

My taste is to make **crowd manipulation and destructive movement the ordinary language of combat**. A clever move should ruin several ships, open a route, and invite the player to take that route immediately. Advanced builds should turn that into extravagant combinations. A single elegant dogfight can remain an Adventure encounter; it should not define every body in a horde.

## 1. The promised asteroid ricochet is contradicted by the material rules

The default Ricochet Runner carries Bank Shot. The Swarm terrain system creates ast_common_rock asteroids without a reflective material override. Physics assigns asteroids the material “rock.” The surface response table explicitly maps rock to **absorb**; the ricochet resolver consumes the projectile on an absorbing surface before consulting its bounce budget.

A direct call through the production body-spec, contact-receipt and ricochet functions returned **material: rock → response: absorb → reason: absorbed**. This is not merely a hard-to-read bounce.

Reflective plates and mirrors can support ricochets. One Bank Shot rank supplies one bounce, and the starter has one rank. Smart Bank's post-bounce steering is a separate modification. There is a real reflection system, but ordinary rock, one of the most common objects and an explicitly named part of the fantasy, rejects it.

**Direction:** Give the signature bank weapon a useful interaction with common hard asteroids. Basalt or metal-rich rock can bank; deliberately soft, molten or porous surfaces can absorb, visibly. Special mirror plates can improve the bounce instead of being the only surfaces that make the build work.

Make useful bank angles common. Curved boulders should permit satisfying approximate shots, with a modest assisted outgoing cone for an accessible bank build and stronger assistance as a specialization. Preserve the physical contact and readable change of direction. A bounce should be an exploitable event: it can gain penetration, split, chain, or strike harder through upgrades.

Start the build with enough bank capacity to demonstrate its identity in normal play. Multiple banks through a shaped corridor are part of the pleasure, not an obscure late exception. Keep finite lifetimes and bounded bounce counts.

Sources: [starter kits](../../src/data/combatLabSetups.js), [Swarm asteroid creation](../../src/systems/swarmArena.js), [physics materials](../../src/core/physicsAuthority.js), [surface rules](../../src/core/surfaceContact.js), [ricochet resolver](../../src/combat/surfaceReflection.js), [attack traits](../../src/data/attackTraits.js).

## 2. Common enemies are being told to leave the situation we need them to create

The Wasp Swarmer uses interceptor_flyby. Its normal doctrine is:

| Phase | Current authored behavior |
|---|---|
| Approach | Enter the flare phase within 420 WU. |
| Telegraph | 0.5 seconds before the strike. |
| Strike | 0.4–0.9 seconds, depending on whether the pass completes. |
| Extend | At least 1.25 seconds; leave once sufficiently separated, or after 3 seconds. |
| Reform | Another 0.75 seconds before approaching again. |

Only strike/commit grants the doctrine's burst action. Extend sets a preferred range of 620 WU and aims at an egress point projected 960 WU away. The clock limits mean an enemy does not necessarily travel those 960 units; the consequential fact is that its objective is extended separation.

Recent arena changes make the enemies hunt the player, ignore surrender, and remain part of the round. Those repairs do not turn this underlying flyby cycle into a pursuing swarm. “Target the player” and “stay in a threatening pack behind the player” are different behaviors.

The consequence is larger than weak pressure. Enemies spread apart, leave the useful terrain, spend less time as web candidates, and deny bombs a packed set of victims. The player gets isolated firing opportunities where the description promises a gathering disaster.

**Direction:** Give common swarmers a pursuit doctrine whose commitment lasts across the player's escape and terrain maneuver. They should follow flowing lanes around obstacles, bunch at bottlenecks, overshoot after committed turns, and recover into pursuit. Avoid perfectly synchronized formation slots; use local separation and a shared chase route so they form a deformable mass.

Keep flyby attackers as a minority role. Add cutters that anticipate the escape line, bruisers that split the pack, and specialists that force a change of route. The common bodies supply the crowd; the specialist changes its shape.

Do not make the AI automatically crash into every rock. It should navigate normally and become vulnerable when the player introduces unexpected momentum, closes a route, or binds its neighbors. That is the difference between a physics trick and ambient self-destruction.

Sources: [enemy definitions](../../src/data/enemies.js), [arena materialization](../../src/systems/waveMaterialization.js), [doctrine phases](../../src/ai/combatDoctrine.js), [live doctrine application](../../src/ai/stack.js).

## 3. The live flight system undermines momentum, and some tuning targets the wrong numbers

Directly deriving the current kits and resolving the profiles used by flightV3 gives:

| Kit | Legacy derived speed | Active ordinary drive speed | Active boosted speed |
|---|---:|---:|---:|
| Ricochet Runner / Hornet | 202.58 | 84 | 122 |
| Web Weaver / Hornet | 211.20 | 84 | 122 |
| Massline Rig / Drifter, with Fusion engine | 195.97 | 95 | 147.25 |
| Same Drifter, without Fusion engine | 133.71 | 95 | 147.25 |

These are different models, not measurements of one ship accelerating in a live room. World-unit speed alone is not a verdict on fun. The decisive problems are **which numbers actually govern play and what the controller does to motion the player earned**.

The Hornet's gravimetric drive chooses a desired velocity and applies force toward it. With the actual player feel envelope, its maximum braking acceleration is 419.52 WU/s². Feeding the production kernel a forward-moving Hornet at 200 WU/s while holding forward produced **−419.52 WU/s²** along its direction of travel. Setting physicsEarnedMomentum to true did not change that result.

The reaction-drive path contains special treatment for earned overspeed; the gravimetric velocity controller does not use that protection. Neutral Newtonian input can coast in the gravimetric path, but nonzero input again selects a target velocity. Consequently “keep steering and flying after the trick” can invite aggressive braking. Dash itself really does apply a substantial velocity impulse; the issue is what happens afterward.

There is also a concrete customization mismatch. The Massline starter's comment says its Fusion engine lets it escape by raising speed from about 134 to 196. Those are the legacy figures above. The active combat cap stays at 95; its travel ceiling increases from 438.75 to 504.56. The upgrade has an effect, but not the combat-speed effect used to justify the build.

**Direction:** Establish a deliberate arcade flight contract on the active path:

- Ordinary acceleration and heading control should be immediate enough to carve around cover.
- Dash and sling momentum should remain useful while the player aims and steers. Preserve excess speed along its earned direction, with predictable decay; allow steering to bend that motion.
- Explicit braking should be powerful. Merely pressing forward after a successful sling should not behave like an emergency brake.
- Engine and handling purchases must alter the active combat profile in the ways their descriptions promise. Cruising improvements can remain a separate benefit.
- Tune pursuer speed, escape burst, turning radius, terrain spacing and camera scale together.

This does not require every hull to handle identically or all assistance to disappear. A light carve-and-dash ship, a momentum-heavy rope ship and a stable weapons platform should each be joyful. Their differences should generate techniques, not expose incompatible generations of configuration.

Sources: [live flight](../../src/systems/flightV3.js), [profile resolution](../../src/core/flight/propulsionCatalog.js), [propulsion kernel](../../src/core/flight/propulsionKernel.js), [player feel envelopes](../../src/data/flightFeelEnvelopes.js), [derived ship stats](../../src/systems/ships.js), [Massline starter rationale](../../src/data/combatLabSetups.js).

## 4. Gunfire needs a different physical and visual identity

The signature bank starter's Heavy Autocannon M fires **4 rounds/s** at 400 WU/s. That produces approximately **100 WU between successive rounds** from a stationary muzzle, before inherited motion or collisions. Its presentation uses a 6.4 WU dash, a thin 0.22 WU ribbon and a 0.06-second ribbon linger.

That is a sequence of discrete heavy slugs. It is not the bright, abundant stream described by the owner or even the starter's own blurb.

Physical response is inconsistent across the catalog too. At a full authored hit against the mass-16 Wasp:

| Weapon | Rate | Authored impulse | Calculated velocity change |
|---|---:|---:|---:|
| Pulse Laser S | 5.5/s | 84 | 5.25 WU/s |
| Pulse Laser M | 6/s | 1.2 | 0.075 WU/s |
| Heavy Autocannon M | 4/s | 48 | 3 WU/s |
| Concussion Cannon M | 1/s | 920 | 57.5 WU/s |

Actual impulse scales with delivered damage. These are nominal full-hit comparisons, not claims that every collision produces that exact result. Still, the medium Pulse has **70 times less authored shove than the small Pulse**. The Web Weaver's main gun therefore contributes almost no physical nudge next to its force weapon.

A damaging bullet does not have to stun its target. It does need a readable response. Currently ordinary Pulse/Autocannon hits are below the force-based tumble threshold in this example; the concussion cannon is a substantially different physical event. That distinction is useful, but tiny force, restrained contact effects and sparse projectiles can jointly produce the “shooting at health bars” impression.

**Direction:** Author weapons around sensations and interactions:

- A bank-stream gun should produce a sustained, bright flow with visible cornering paths. A first candidate is 12–20 rounds/s with damage per projectile reduced to preserve a chosen damage budget. Rebalance heat, sound and projectile cost with that change.
- A concussion weapon should retain the satisfaction of one decisive shove. It need not become another rapid-fire weapon.
- A needle or energy stream should visibly stitch across hulls, with local recoil, escalating contact flashes and enough impulse to communicate accumulation without permanent stun.
- Beam, scatter, chain and mine builds should solve different spatial problems, not only vary DPS.

Design build-changing upgrades: a bank splits the stream, a web conducts an attack, a displaced enemy becomes a projectile, or a rear gun paints a pursuing lane. Larger stat values alone will not produce those play styles.

My earlier “weapon timing” emphasis was misplaced. Number-key powers and mounted guns sharing a trigger are real control distinctions. They do not explain why ordinary rock absorbs the bank shot, why the stream is sparse, or why an upgrade barely pushes a ship.

Sources: [weapon values](../../src/data/weapons.js), [weapon visual recipes](../../src/render/weapons/recipes.js), [impulse and hitstun law](../../src/combat/impulseKernel.js).

## 5. A ship exploding visually is not the same as a damaging cascade

The normal kill path publishes destruction and rewards; it does not give every dead ship a radial damaging explosion. The implemented sympathetic chain belongs to the impulse-charge system.

A victim must have been primed by an appropriate physical event, and the priming window lasts **0.8 seconds**. A sympathetic detonation takes its base values from the standard charge even when a stronger repulsion trap started the situation:

- First link: radius 71.4 WU, impulse 560, damage **8.4**.
- At 40 WU from that blast: approximately **3.69 damage** and **15.39 WU/s** of shove to a mass-16 Wasp.
- Subsequent yields decay; the chain has a four-link depth limit.

For context, an ordinary level-one Wasp has 55 hull, 8 armor points and 25 shield. The secondary blast can contribute and can shove something into terrain; it is not ordinarily a powerful neighboring-hull killer by direct damage alone. An unprimed ship killed by ordinary gunfire does not start this sympathetic blast.

The 0.8-second state also makes the interaction brittle: the blast, movement, wall collision and kill must line up very tightly. When targets and terrain are dispersed, a valid-looking setup can lose eligibility before its payoff.

**Direction:** Make destruction a regular part of the combat simulation. Common light ships should deliver a small but meaningful death burst of damage and shove. Armed, volatile or deliberately primed ships can produce much larger reactions. A successful trap-and-slam setup should leave survivors vulnerable to the next casualty's blast.

Choose the priming lifetime against actual shove-to-wall travel time. A visibly charged enemy should remain charged long enough to exploit. Give energetic death chains their own sound, impact shape and escalating rhythm.

Keep bounded spatial queries, a queue and controlled propagation. Distinguish branching breadth from depth so one excellent packed setup can destroy a substantial crowd without permitting infinite recursive work. A thirty-body cascade should be a possible earned spectacle at an advanced build, not automatically classified as a bug because an earlier comment dislikes it.

Sources: [kill path](../../src/systems/combat.js), [priming and sympathetic detonation](../../src/systems/impulseCharges.js), [chain configuration](../../src/data/impulseCharges.js).

## 6. The repulsion trap is already forceful; the room must let it pay off

The current rear-dropped trap has radius 105 WU, impulse 2400, a 0.55-second arming delay and a trigger radius of 52 WU. With linear falloff, a mass-16 Wasp at the trigger boundary receives approximately **75.7 WU/s** of velocity change. At the center, the theoretical change is 150 WU/s. A mass-60 ship at the boundary receives about 20.2 WU/s.

The terrain crumple law also has teeth. Above 30 WU/s of normal closing speed, its damage rises quadratically. For the reference mass-16 body and standard 1.15 terrain multiplier, 40 WU/s gives 57.5 damage, 50 gives 230, and the light-body cap is 400. Impact direction matters: a glancing velocity is not all closing speed.

So “add a stronger bomb” is an inadequate diagnosis. A large part of the described throw-and-smash move already has sufficient raw force.

**What is missing:** a packed pursuit on the right side of the charge, a reachable surface in the outgoing direction, a stable enough route to plan around, and subsequent destruction that damages the rest. A radial blast in open space mainly scatters enemies and can make the next task less satisfying.

**Direction:** Make the player learn useful trap geometry quickly. A narrow exit behind the player, rough walls beside the pack, and a wider gathering lane before it create an obvious opportunity. Add optional shaped charges, stick-to-surface launch plates and polarity variants that change the shape of the shove. Keep radial repulsion excellent at emergency escape.

Show the arming state and force direction in the world. The blast should visibly stretch the pack, throw hulls, terminate at hard impacts and leave a cleared opening the player can use immediately.

Sources: [charge definitions](../../src/data/impulseCharges.js), [blast implementation](../../src/systems/impulseCharges.js), [terrain consequence law](../../src/combat/impulseKernel.js).

## 7. The existing Snarl is a useful seed, not the full web fantasy

The current hit-driven Snarl searches within 120 WU, adds at most three links per hit, caps active links at twelve, and gives them nine seconds of life. It connects successive nearby targets into a chain. The weapon fires 0.8 times a second.

This is physical coupling, not just a slow-status effect. But a nearest-neighbor chain through a few bodies is materially different from throwing a web across a gathering crowd. If flyby AI spreads the bodies beyond the 120 WU candidate radius, increasing the nominal link cap will not help.

The plans describe a deployable hub linking several masses, a Capstan that winds them inward, and a bomb-web hub. Those should not be treated as completed because the current Snarl creates some constraints. The present tetherWebs implementation does not implement those hub behaviors.

**Direction:** Develop an unmistakable capture-and-struggle state. Several caught hulls should keep attempting their motions; the connected network should buckle, rotate and drag the group. Give the player a useful opportunity to shoot, shove, sling or detonate that network.

Keep the current chain-shot as one weapon identity. Add the area-catching hub and winding variant as genuinely different toys. Plan for loose debris, a heavy anchor and a volatile victim to change what a web does. The best advanced result is a temporary physical machine made from enemies.

Presentation must expose tension and membership: strands stretch, the loaded directions brighten, engines oppose one another, and breaks release motion. The meaning should survive a moving camera and a bright gun stream. A link counter cannot communicate that.

Sources: [current web topology](../../src/combat/tetherWebs.js), [constraint definitions](../../src/data/combatDefs.js), [planned Snarl/Capstan grammar](../PHYSICAL_PLAY_GRAMMAR.md), [Crucible master plan](CRUCIBLE_SURVIVAL_MASTER_PLAN.md).

## 8. The population and space need to support a horde, not just contain enemies and rocks

Current concurrency starts at ten and tops out at thirty; boss rounds cap their accompanying population at eighteen. The first quota is fifteen, with later quotas capped at forty-eight. Swarm enemies currently remain level one: escalating health is not the present cause of every slow encounter.

Those settings can support a brisk early round. They cannot automatically produce the advanced “giant swarm” fantasy, especially when the alive population is spread across approach, attack, departure and reform.

The generated field maintains rocks around the fight, with much of its replenishment band at 115–340 WU and a 120 WU player-safe radius. Opening geometry is also authored separately. Meanwhile the default camera policy describes a roughly 170 × 100 WU local view, the Snarl search radius is 120, the trap blast radius is 105, and flyby egress objectives reach far beyond them. The camera figure is a policy approximation, not a measured perspective footprint. The important finding is that these systems operate at poorly reconciled scales.

The sampled opening visibly reinforced the mismatch: substantial scenery and large edge rocks, but little immediately legible chase geometry near the player. After the input pass, the remaining opponents were represented by offscreen indicators rather than an obvious following crowd.

**Direction:** Define the combat neighborhood as one physical composition. At a useful fighting zoom, the player should see an approaching crowd, one exploitable obstacle relationship and a plausible escape. Terrain should provide circuits: gather, bank, constrict, reverse, break out. Give the player places worth revisiting as traps and wreckage change them.

For developed runs, explore larger populations—for example 40–80 simple, fully interactive light bodies plus a few specialists—after pursuit, chaining and spatial queries can support them. That is a candidate scale, not a mandatory count or a license to draw fake enemies. Local density and sustained arrival matter more than the global counter, but the current thirty-body ceiling should not be declared optimal without confronting the larger fantasy.

Scale danger through density, routes, mixed roles and pressure, keeping common bodies quick to destroy. Increase late-round quotas when the player gains group-killing capability; do not assume a fixed kill rate forever. Preserve the fast first purchase.

Sources: [Swarm curve](../../src/data/swarmMode.js), [terrain layout](../../src/systems/swarmArena.js), [camera policy](../../src/render/tabletopPolicy.js), [camera and presentation defaults](../../src/core/gameState.js).

## 9. The presentation emphasizes small material events where the fantasy needs bodily reactions

There is already considerable VFX work: projectile shapes, shield contact effects, breakup explosions, geometric impact effects and floating damage numbers. Bloom is already enabled. “Add damage numbers and turn on bloom” would be another superficial recommendation.

The current ordinary hull-damage presentation emphasizes local smoke, combustion, fragments and a small contact light. Ordinary armor/hull hit-stop durations are explicitly zero; shield breaks and kills receive stronger punctuation. Damage numbers already aggregate repeated hits, with normal numbers smaller than the large-hit category. These choices can be sensible separately, but they emphasize a material being damaged more than a whole enemy being struck.

The bank gun's short gold slugs and thin transient trails further reduce the large, luminous attack patterns imagined by the owner. The local play sample also showed bright galaxy imagery competing with the active ships. That is a composition problem as well as an effect-strength problem.

Two default-route gaps are especially concrete:

- **Audio muted by default.** The profile migration deliberately makes the procedural sound stack opt-in pending authored audio. Whatever the reason, the normal first encounter loses gun rhythm, impacts, engine urgency, chain escalation and reward sound.
- **Render graph disabled by default.** Weapon haze and well refraction attach through that graph's distortion pass. Their implementation does not mean those effects appear on the default route.

**Direction:** Build a shared attack-to-destruction language: luminous attack path → unmistakable contact → local hull flash/recoil → displaced silhouette → terrain impact → branching destruction. Put the strongest contrast at the event that changes the situation.

Use a short, shaped hull/silhouette response that survives small screen size. Make force hits visibly displace and rotate bodies; make ordinary hits visibly register without turning every target into a stunned ragdoll. Reserve global camera emphasis and brief time dips for major events, with repetition limits so a dense stream does not constantly freeze play. Preserve reduced-flash and reduced-motion behavior.

Lengthen and shape the important attack trails so the player can read the stream and its banks. Differentiate allied fire, hostile fire, force fields and tension using shape and motion as well as color. Keep bright background structures from winning over enemies and hazards.

Finish an authored audible combat mix and make it available naturally after the initial user gesture, while preserving explicit mute choices. Integrate needed distortion into the supported default rendering path, with its lifecycle and cost handled; blindly flipping a feature flag is not a completed presentation pass.

Sources: [weapon recipes](../../src/render/weapons/recipes.js), [damage effects](../../src/render/vfx.js), [impact feel](../../src/render/feel.js), [graph attachment](../../src/render/weapons/presenter.js), [default settings](../../src/core/gameState.js), [audio migration](../../src/core/graphicsProfileBootstrap.js).

## 10. The opening protection and the enemy behavior jointly flatten urgency

The default Hornet has 260 hull, 240 shield, shield regeneration of 16/s and a three-second regeneration delay. The arena Wasp's gun is upgraded from its Adventure teaching values to 8 damage at 3.6 shots/s, but actual pressure still depends on approach, alignment and doctrine firing permission.

In the preceding seed-4242 ordinary-route sample, ten enemies were alive at launch. After twenty simulation seconds without player input, hull and shield were full. After approximately another twenty-five seconds of automated aiming, shooting and repeated boost/trap inputs, eleven of the fifteen enemies had been killed and hull and shield were again full. These checkpoint values do not prove that the player never took damage between them.

They do show an opening that could communicate very little survival urgency. A large shield and recovery between intermittent passes can turn errors into events the player barely notices. This interaction is more meaningful than independently labeling either the shield or gun DPS “wrong.”

**Direction:** Make continued inactivity dangerous and successful movement visibly buy safety. Tune recovery after sustained pursuit works. Let a skilled escape, a cleared pocket or a recovery pickup earn the breathing room. Preserve a forgiving first attempt, but make being cornered a recognizable failure state.

Do not solve pressure by giving every enemy instant, perfectly accurate fire or by making collisions punish parkour. Keep clear attack cues, dodgeable trajectories and enough surviving control to recover from mistakes. The player should understand “I let the pack cut off my route,” not “a number somewhere drained.”

Sources: [derived player defenses](../../src/systems/ships.js), [arena weapon override](../../src/systems/waveMaterialization.js), [AI doctrine](../../src/ai/combatDoctrine.js).

## What the best version adds beyond repairing those contradictions

The current game needs a larger set of **combinable physical verbs**, not just more catalog entries. The strongest extensions are:

| Play style | The complete pleasure to deliver |
|---|---|
| Bank runner | Carve around cover while a bright stream ricochets through several pursuers; banks alter the attack through upgrades. |
| Trap engineer | Build a dangerous wake, steer the pursuit through it, and use shaped blasts or remote triggers to open an escape. |
| Web weaver | Capture a group, make its thrust work against itself, then wind, sling or detonate the network. |
| Massline pilot | Use heavy terrain as an anchor, preserve the speed earned by the swing, and release bodies or charges along that motion. |
| Chain gunner | Mark or destabilize targets so the next death meaningfully damages and displaces nearby enemies. |
| Environmental opportunist | Throw loose cover, exploit moving machinery, collapse a structure, and turn the changing room into the next attack. |

Arena differences should make these combinations behave differently. Foundry supplies bank walls and crushing machinery; Lagrange supplies anchors and momentum routes; Cinder supplies currents and delayed heat; Cryo supplies long slides and breakable structures; Storm supplies conduction through bodies and links. Bosses should rearrange those relationships through their bodies and attacks. This preserves the full variety in the plans while giving it a mechanical purpose.

Swarm should expose these styles quickly through fast earning and repeated purchases, with room to save for a build-changing toy. A purchase should immediately suggest something the player wants to try in the next round. Death and retry should make another experiment tempting.

Adventure should make advanced toys worth pursuing through discoveries, contracts, salvage, research or specialized sellers. Earn the extraordinary combinations; start with good movement, satisfying fire and some physical agency. Carry the same weapon behavior into a world with beautiful quiet stretches and consequences. The reward is “now I can use this everywhere,” not access to a separate better combat system.

## How to converge, in dependency order

1. **Repair the game's basic physical agreement.** Make ordinary intended bank terrain bankable; establish active combat speed and engine effects; preserve earned movement; ensure the signature gun actually looks and feels like its advertised attack. These are foundational mechanics, not polish at the end.
2. **Build the crowd and its terrain together.** Introduce sustained common-swarmer pursuit, coherent local routes, a useful fighting scale and a pressure/recovery relationship. Retain distinct specialist brains.
3. **Make a good setup propagate.** Deliver ordinary damaging death bursts, stronger earned cascades, the full web/hub behaviors and force-to-terrain combinations. Then expand the interactive population and late-round throughput around that capability.
4. **Compose the sensory result on the default route.** Ship silhouettes, luminous attacks, contact response, throwing, slams, sound and chain rhythm should explain the same physical event. Perform this alongside the mechanics above, not after an entire silent, weakly readable mode is declared complete.
5. **Carry that standard through builds, arenas, bosses, purchases and Adventure acquisition.** The first coherent encounter is the design reference, not a reduced replacement for the rest of the scope.

The relevant work is spread across the [Crucible master plan](CRUCIBLE_SURVIVAL_MASTER_PLAN.md), [physical-play grammar](../PHYSICAL_PLAY_GRAMMAR.md), [physical-play build plan](../PHYSICAL_PLAY_BUILD_PLAN.md), [physics spectacle program](../program/roadmap/active/PHYSICS_AS_SPECTACLE_PROGRAM.md), [Massline presentation direction](../program/roadmap/active/MASSLINE_PRESENTATION_UVP.md), [frontend direction](../FRONTEND_DIRECTION.md), and the underlying live flight/combat/render systems cited above. These plans contain useful ambition. Their descriptions must be reconciled with the actual selected runtime instead of being accepted as evidence that the desired behavior exists.

The prior analysis's shopping, HUD, launch latency and stray Adventure-message findings remain useful secondary work. They should not displace the foundational contradictions in this report. In particular, correcting “Survive the minute,” reducing irrelevant labels, and speeding entry cannot turn absorbing asteroids, departing enemies and weak death propagation into the described game.

## Why the prior approach missed this

It accepted the presence of systems as evidence of their intended experience. A bounce module was counted without asking whether the common rocks accept its shots. An engine was justified with legacy speed values. “Hunt player” was mistaken for sustained pursuit. A ship explosion was treated too readily as a chain-combat ingredient. Working constraints stood in for the much richer web topology.

The solution is not another layer of certification. For each change, inspect the shortest real sequence that matters: bank this ordinary rock; keep steering after this sling; pull this crowd through this gap; let this death affect its neighbors. Use numerical checks where a force or selection is disputed and moving play where perception or control is disputed. Stop collecting evidence once the design question is answered, and spend the effort making the next interaction better.

## Evidence limits

The play observations come from the preceding ordinary main-menu → Crucible → Ricochet Runner → Foundry run at 1280 × 720, seed 4242. It used normal input automation, not injected kills or modified stats, and remained in round one. It is evidence of that opening, not a complete balance verdict across all arenas.

The new calculations call current production functions for ship derivation, active propulsion and rock contact response. They establish configuration and controller behavior; they are not a new full-session movement or population benchmark. Gun/blast comparisons use the stated authored values and mass assumptions. I did not listen to the audio mix, so its artistic quality is not assessed. The default mute setting is directly verified.

Selected local visual records: [opening](C:/Users/93rob/.codex/visualizations/2026/09/10/01a08b17-1849-7853-a821-244cba3999d5/postmortem-opening.png), [stationary opening](C:/Users/93rob/.codex/visualizations/2026/09/10/01a08b17-1849-7853-a821-244cba3999d5/postmortem-stationary.png), [after inputs](C:/Users/93rob/.codex/visualizations/2026/09/10/01a08b17-1849-7853-a821-244cba3999d5/postmortem-combat.png). These are review artifacts, not new capture obligations.
