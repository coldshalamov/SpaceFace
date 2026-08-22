<!-- LIFETIME: STABLE -->
# SpaceFace Crucible
## Survival Mode, Combat Lab, and Arcade-Physics Convergence Master Plan

**Repository path:** `design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md` (admitted as `PQ-133`, see `CANONICAL_BUILD_MAP.md` §12)  
**Source audit date:** 2026-08-21  
**Status:** **DURABLE DESIGN SOURCE — ADMITTED 2026-08-21 AS `PQ-133` (phases 0–13 are its dispatch leaves; `design/program/` owns live status)**  
**Primary purpose:** Give future agents one coherent, long-horizon source from which to shape bounded roadmap packets that move SpaceFace toward fast, combinatorial, swarm-scale arcade combat without severing that combat from the living Adventure universe.

This document is intentionally much larger than a near-term implementation packet. It contains:

- durable product direction;
- near-term executable sequences;
- provisional mechanics;
- experiment designs;
- candidate weapons, modifiers, enemies, arenas, and bosses;
- architectural seams;
- performance and validation requirements;
- future possibilities that may never be built.

It does **not** claim that every idea is required, admitted, implemented, integrated, or accepted. It does **not** replace:

- [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md), which owns technical contracts;
- [`../VISION.md`](../VISION.md), which owns product emphasis and fantasy;
- [`../GDD_2_0.md`](../GDD_2_0.md), which owns durable game pillars;
- [`../PHYSICAL_PLAY_GRAMMAR.md`](../PHYSICAL_PLAY_GRAMMAR.md), which owns the mechanics-level physical grammar;
- [`../PHYSICAL_PLAY_BUILD_PLAN.md`](../PHYSICAL_PLAY_BUILD_PLAN.md), which owns the existing physical-play seam analysis and implementation ordering;
- [`../program/README.md`](../program/README.md), which owns global status and acceptance;
- [`../program/roadmap/program-queue.json`](../program/roadmap/program-queue.json), which owns admitted task identity and dependencies;
- an active packet under `design/program/roadmap/active/`, which alone binds a selected outcome to current code, paths, checks, cost, proof, and stop conditions.

Before implementing any row from this document, an agent must re-audit the live code, deduplicate the outcome against current roadmap packets, assign or reuse a stable roadmap ID, and admit a bounded slice through `design/program/`.

---

## Reading labels

This document uses five labels to prevent a brainstorm from masquerading as a release commitment.

| Label | Meaning |
|---|---|
| **CORE** | A durable design decision that should shape downstream work unless a higher authority changes it. |
| **FIRST SLICE** | A deliberately narrow candidate for the earliest playable implementation. It still requires roadmap admission. |
| **EXPERIMENT** | A falsifiable idea to test. It may be kept, revised, or rejected. |
| **CONTENT BANK** | A reservoir of candidates. Selection is expected; wholesale implementation is not. |
| **FAR FUTURE** | A high-cost or dependency-heavy possibility preserved so present architecture does not foreclose it. |

---

## Agent-use contract

An agent consuming this file should follow this sequence:

1. Read the executive thesis and the specific section relevant to the assigned outcome.
2. Read the cited current owner files and nearest `AGENTS.md`.
3. Check `design/program/NOW.md`, the program queue, active packets, and current dirty paths.
4. Re-audit every code-path claim in this document. File names and seams are directional, not eternal.
5. Select the smallest coherent player-visible outcome.
6. Record explicit non-goals.
7. Map the outcome to a current queue ID or shape a new stable ID through the program process.
8. Implement through canonical writers and the ordinary game path.
9. Prove deterministic behavior at the owner seam before expensive route evidence.
10. Update only the exact packet and global roll-up rows supported by evidence.

Never turn this file into a giant checklist whose unchecked boxes imply a blocked game. Never mark a content-bank idea complete because an object or data row exists. Never build validation machinery as a substitute for a better playable game.

---

# Table of contents

1. [Executive thesis](#1-executive-thesis)
2. [The problem this program solves](#2-the-problem-this-program-solves)
3. [Reference transfer: what to borrow and what to refuse](#3-reference-transfer-what-to-borrow-and-what-to-refuse)
4. [Product topology: Adventure, Crucible, and Combat Lab](#4-product-topology-adventure-crucible-and-combat-lab)
5. [The north-star experience](#5-the-north-star-experience)
6. [The complete Survival run loop](#6-the-complete-survival-run-loop)
7. [Progression clocks and run economy](#7-progression-clocks-and-run-economy)
8. [The shared attack algebra](#8-the-shared-attack-algebra)
9. [Attack lineage, triggers, and deterministic containment](#9-attack-lineage-triggers-and-deterministic-containment)
10. [Modifier system design](#10-modifier-system-design)
11. [Weapon and Rig expansion](#11-weapon-and-rig-expansion)
12. [Physical states and reaction grammar](#12-physical-states-and-reaction-grammar)
13. [Materials, props, and environmental verbs](#13-materials-props-and-environmental-verbs)
14. [Arena design grammar](#14-arena-design-grammar)
15. [Arena 1: Ricochet Foundry](#15-arena-1-ricochet-foundry)
16. [Arena 2: Lagrange Crucible](#16-arena-2-lagrange-crucible)
17. [Arena 3: Cinder Sluice](#17-arena-3-cinder-sluice)
18. [Arena 4: Cryo Drift](#18-arena-4-cryo-drift)
19. [Arena 5: Storm Lattice](#19-arena-5-storm-lattice)
20. [Future arena bank](#20-future-arena-bank)
21. [Wave director and encounter composition](#21-wave-director-and-encounter-composition)
22. [Enemy ecology](#22-enemy-ecology)
23. [Boss design](#23-boss-design)
24. [Scoring, style, rewards, and causal truth](#24-scoring-style-rewards-and-causal-truth)
25. [Combat Lab](#25-combat-lab)
26. [Interface, readability, camera, audio, and accessibility](#26-interface-readability-camera-audio-and-accessibility)
27. [Technical architecture](#27-technical-architecture)
28. [Performance and scale](#28-performance-and-scale)
29. [Telemetry, playtesting, and experiment design](#29-telemetry-playtesting-and-experiment-design)
30. [Beginning-to-end implementation roadmap](#30-beginning-to-end-implementation-roadmap)
31. [Provisional agent work packet map](#31-provisional-agent-work-packet-map)
32. [Integration into existing plans](#32-integration-into-existing-plans)
33. [Risk register and anti-patterns](#33-risk-register-and-anti-patterns)
34. [Adventure-mode convergence](#34-adventure-mode-convergence)
35. [Long-horizon possibilities](#35-long-horizon-possibilities)
36. [Definition of convergence](#36-definition-of-convergence)
37. [Appendix A: proposed schemas](#appendix-a-proposed-schemas)
38. [Appendix B: full modifier content bank](#appendix-b-full-modifier-content-bank)
39. [Appendix C: example thirty-wave run](#appendix-c-example-thirty-wave-run)
40. [Appendix D: agent packet template](#appendix-d-agent-packet-template)
41. [Appendix E: source and ownership map](#appendix-e-source-and-ownership-map)
42. [Appendix F: unresolved product decisions](#appendix-f-unresolved-product-decisions)

---

# 1. Executive thesis

**CORE:** SpaceFace needs a concentrated combat proving ground in which its signature physical verbs can be learned, combined, stressed, measured, and made spectacular within minutes rather than hidden behind hours of Adventure progression.

The working umbrella name is **Crucible**.

Crucible is not merely an additional menu mode. It is a product-development instrument with three jobs:

1. **Expose depth immediately.** A player or developer can reach advanced weapons, Rigs, statuses, enemies, and environmental interactions without grinding through the campaign.
2. **Force combat grammar to converge.** The game must support rapid, legible, combinatorial builds: ricochet, chain, multishot, split, orbit, freeze, damage-over-time, gravity, tether, collision, debris, fields, and environmental reactions.
3. **Feed successful mechanics back into Adventure.** Crucible discovers and sharpens fun. Adventure gives that fun context, acquisition, risk, consequence, persistence, law, faction meaning, and memory.

The intended relationship is:

> **Crucible discovers what is fun. Adventure makes it matter. Combat Lab explains why it worked or failed.**

The central design move is not “add a wave mode.” It is to make a **shared combat algebra** that can express both arcade escalation and physical causality. A Pulse Laser should not be one immutable gun. It should be able to become:

- a twin-shot bank weapon whose second bounce seeks an ionized target;
- a low-damage gravity-marking setup tool whose chains prepare a cluster for a Well;
- a returning projectile that cuts through a tethered formation twice;
- a burning split-shot whose children detonate only on hard collision;
- a defensive orbiting emitter that curves incoming fire;
- a clean direct weapon when the player chooses not to build a contraption.

The game should not need a bespoke code path for every one of those outcomes. It needs trustworthy primitives that compose.

Crucible should also reveal whether the physical fantasy survives density. The project already claims that light enemies are almost ammunition, swarms are the correct frame, and progression should increase physical agency. Survival mode is where those claims become falsifiable.

A successful run should feel like this:

> The player begins with a modest ship and one reliable weapon. Ten minutes later, the same ship is firing three bolts that bank through machinery, ionize a moving knot of enemies, jump through a conductive pylon, and knock the last survivor into a gravity current. The player understands every link in that sequence. None of it was a canned ultimate. The room, the build, the enemies, and the player’s trajectory all participated.

That is not a bullet heaven pasted onto SpaceFace. It is SpaceFace’s own physics grammar accelerated until its structure becomes undeniable.

---

# 2. The problem this program solves

## 2.1 Adventure hides the combat ceiling

The persistent game properly asks the player to earn ships, parts, money, access, and knowledge. That makes Adventure meaningful, but it makes combat development slow:

- advanced weapons are difficult to reach;
- rare interactions depend on an accidental loadout;
- a failure may require repeating travel, acquisition, and setup;
- a weapon can exist in data without receiving sustained live use;
- agents can validate a local code path without learning whether the resulting build is fun;
- the player’s first hours overrepresent starter guns and ordinary dogfights;
- the game’s most distinctive physical tools can read as optional gadgets rather than its center.

The result is a feedback asymmetry. Generic shooting is always available, so generic shooting receives the most iteration. Deep physical play is gated, so it remains under-tested. The game converges toward the path of least resistance.

Crucible reverses that asymmetry.

## 2.2 Existing pieces are strong but insufficiently compositional

SpaceFace already contains substantial foundations:

- fixed-timestep deterministic simulation;
- Rapier-backed physical bodies and constraints;
- the Massline;
- impulse weapons and charges;
- gravity and repulsion fields;
- status application and status interactions;
- Gravity Marked, Momentum Sink, Pinned, Unmoored, Ionized, Burning, Overheated, Scrambled, and Tumbling;
- projectile, beam, missile, splash, submunition, impulse, torque, and subsystem-damage weapon data;
- enemy role definitions;
- an encounter materialization path;
- a single spawn-budget authority;
- physical pickups and homing collection;
- a Sandbox that launches through the real New Game path and canonical writers;
- a deterministic gameplay lab;
- causal collision and kill receipts;
- priority-aware VFX foundations.

The missing element is not “more systems.” The missing element is a common grammar that lets those systems alter one another.

A gravity field that only performs its own isolated effect is a tool. A gravity field that changes ricochet geometry, pulls split projectiles into a second pass, alters pickup risk, clusters conductive targets, and makes a Massline release more violent is a system multiplier.

## 2.3 The current combat frame still invites generic answers

A small number of durable enemies in open space rewards:

- single-target DPS;
- circular kiting;
- range maintenance;
- stat comparison;
- direct-fire accuracy;
- incremental shield/armor/hull attrition.

Those are valid ingredients, but they are not the game’s identity. Physical control becomes disproportionately difficult when every encounter is framed as a precise dogfight.

Swarms change the question. The player no longer asks only, “Can I hit that ship?” The player asks:

- Where can I gather them?
- What can I throw through them?
- Which wall gives me another pass?
- Which target should become the conductor?
- Which body is heavy enough to anchor the web?
- What happens when the current reverses?
- Can I freeze their control without cancelling their momentum?
- Can I turn the boss’s machinery into my weapon?
- Can I survive the consequences of my own build?

That is the game’s native language.

## 2.4 Survival mode is also an integration test

A concentrated wave mode exposes defects that ordinary play can conceal:

- unbounded proc chains;
- projectile leaks;
- status stacking bugs;
- non-deterministic target selection;
- hidden allocations;
- fixed-size pools;
- AI cost cliffs;
- unreadable VFX overlap;
- camera framing failures;
- economy-owner violations;
- save contamination;
- overpowered passive builds;
- dead upgrades;
- upgrade text that does not describe actual behavior;
- bosses that only work at low entity counts;
- debug tools that do not match the shipping route.

A good Survival implementation is therefore both content and infrastructure. It should make every later combat feature cheaper to understand.

---

# 3. Reference transfer: what to borrow and what to refuse

The useful reference is not “a mobile game in space.” The useful reference is the way a simple starting attack becomes a compound machine through frequent, legible transformations.

## 3.1 Bullet Knight transfer

The user-observed mechanics worth transferring are:

- projectiles that bounce from boundaries;
- attacks that jump from one enemy to another;
- multiple simultaneous copies of a weapon;
- orbiting objects or fields around the player;
- freeze or control effects;
- damage-over-time;
- dense, fast combat;
- frequent power growth inside a run;
- clear arena-to-arena differences;
- rapid access to build experimentation.

The deeper transfer is **conversion density**: the player should not wait an hour for a build to acquire an identity. A run should create a meaningful fork early, then compound it.

### Transfer

- Frequent three-choice drafts.
- Upgrades that change topology, not just magnitude.
- Synergies that are understandable from short descriptions.
- Compact combat spaces with authored constraints.
- High enemy density supporting area and chain effects.
- Boss cadence that punctuates build phases.
- Runs short enough to repeat, long enough to develop.
- Visible escalation from humble to ridiculous.

### Refuse

- Stop-moving-to-fire as a core control rule.
- Auto-targeting that replaces manual combat intent.
- Flat attack/health inflation as the main progression.
- Monetization-shaped friction.
- Permanent stat grind that makes later runs numerically superior.
- Physics-insensitive walls and enemies.
- Arena resets that erase meaningful physical state without explanation.
- Effects that look combinatorial but are actually unrelated damage emitters.
- Visual saturation that hides causes.
- Passive orbit builds that clear the game while the player merely drives in circles.

SpaceFace must preserve its shipped control promise: the keyboard flies, the mouse fights. Crucible should make that scheme more expressive, not replace it with mobile auto-fire.

## 3.2 Broader design transfers

Several adjacent genres offer mechanisms worth translating rather than copying.

### Modular projectile games

The valuable lesson is that a weapon can be decomposed into reusable traits: emission, motion, propagation, payload, trigger, and constraint. The failure mode is unconstrained recursion or a build system whose correct use requires external spreadsheets. SpaceFace should expose combinatorial depth while keeping causal chains visible in motion.

### Bullet heavens and wave survivors

The valuable lesson is cadence: enemies arrive continuously, the build changes often, and downtime is aggressively removed. The failure mode is player passivity, indistinguishable damage circles, and enemies functioning only as hit-point particles.

SpaceFace should preserve active aim, piloting, terrain, commitment, and self-created danger.

### Roguelites with directors

The valuable lesson is pressure built from composition rather than only stat scaling: enemy roles, timing, elites, arena mutators, and resource risk. The failure mode is a director so opaque that difficulty feels arbitrary.

SpaceFace should expose wave identity, telegraph rule changes, and use deterministic seeds.

### Physics sandboxes

The valuable lesson is emergence from simple material rules. The failure mode is impressive one-off chaos with no repeatable player mastery.

SpaceFace requires trustworthy physical outcomes, causal receipts, and clear setup/payoff loops.

## 3.3 The synthesis

Crucible should combine:

```text
roguelite build cadence
+ bullet-heaven density
+ manually piloted top-down shooting
+ deterministic physical interaction
+ authored environmental laws
+ a living-world campaign that inherits proven mechanics
```

No reference owns that synthesis. It is the project’s opportunity.

---

# 4. Product topology: Adventure, Crucible, and Combat Lab

## 4.1 Adventure

**CORE:** Adventure remains the canonical persistent universe.

It owns:

- travel;
- sectors and places;
- factions and law;
- economy;
- missions and careers;
- persistent ship identity;
- acquisition;
- cargo;
- mining;
- salvage;
- long-term consequences;
- world memory;
- narrative context.

Adventure should eventually use the same combat traits, statuses, material properties, enemy abilities, and physical interaction rules as Crucible. It should not inherit Crucible’s temporary economy, artificial wave clock, or unrestricted power curve.

## 4.2 Crucible: Survival

**CORE:** Survival is a scored, ephemeral run using the shipping flight, physics, combat, fitting, rendering, input, and enemy systems.

A run includes:

- an arena;
- a deterministic seed;
- a starting budget;
- a selected hull or starter package;
- waves;
- run XP;
- temporary modifiers;
- physical reward collection;
- ten-wave refits;
- bosses and arena mutations;
- death or extraction;
- a results record and reproducible build code.

The first authored target is **thirty waves**. Endless continuation follows only after the authored thirty-wave arc is good.

## 4.3 Combat Lab

**CORE:** Combat Lab is not a separate simulation. It is an expanded human-facing layer over the existing Sandbox and deterministic gameplay lab.

It should provide immediate control over:

- hull;
- fittings;
- weapon traits;
- modifier stack;
- arena;
- arena phase;
- wave;
- enemy package;
- seed;
- health, capacitor, heat, and cooldown rules;
- simulation speed;
- invulnerability;
- projectile and entity caps;
- replay and build code;
- telemetry.

Combat Lab is unscored. It exists to reproduce, compare, debug, and understand.

The current Sandbox already follows the right architectural pattern: it boots the real New Game pipeline, then applies setup through canonical writers. Combat Lab should extend that principle rather than add raw-state cheats that diverge from production.

## 4.4 Later rulesets

These are not first-slice requirements.

| Ruleset | Purpose | Disposition |
|---|---|---|
| **Daily Seed** | Same arena, seed, draft pool, and starting choices for all players. | FUTURE after determinism and run integrity. |
| **Boss Circuit** | Consecutive bosses with compressed refits. | CONTENT BANK. |
| **One-Hull Trial** | Fixed hull, unrestricted build evolution. | CONTENT BANK. |
| **One-Weapon Trial** | One root weapon transformed through traits. | Excellent attack-grammar stress test. |
| **Physics Only** | Direct weapon damage heavily reduced; collision, fields, tether, and environment dominate. | EXPERIMENT. |
| **No Safe Walls** | Enemy ricochet and environmental hazard variant. | Challenge mode only; not default readability. |
| **Contract Mutators** | Faction-authored special rules and rewards. | Adventure integration candidate. |
| **Extraction Survival** | Player may cash out at ten-wave boundaries or risk the run. | FUTURE economy experiment. |
| **Draftless Engineering** | Player buys deterministic traits at refits instead of random drafts. | Useful control group. |
| **Arena Editor** | Compose geometry, materials, wave recipes, and mutators from validated data. | FAR FUTURE. |

---

# 5. The north-star experience

## 5.1 The first sixty seconds

The player selects a starter package and enters a compact authored arena. The first wave arrives quickly. The arena’s law is obvious before it becomes dangerous.

In Ricochet Foundry:

- a test shot strikes an angled plate and visibly banks;
- ordinary enemy fire dies against the same wall;
- the first light enemies arrive in a readable lane;
- the player discovers that firing at the wall can be better than firing at the enemy;
- a heavy impact moves loose machinery;
- the first kill sprays physical credit light into the room;
- the player understands that positioning, geometry, and collection are already connected.

The first modifier arrives before the base weapon becomes stale.

## 5.2 The first ten minutes

By the end of the first ten-wave block:

- the player has made three or four build-defining choices;
- one arena law has changed;
- at least one specialist has countered the obvious strategy;
- at least one physical kill has produced a memorable chain;
- the player has learned why their current build is strong;
- the player has discovered one weakness;
- the wave-ten boss tests the arena law rather than merely demanding DPS;
- the refit screen offers a structural response to that weakness.

## 5.3 The full thirty-wave arc

A complete run should contain three acts.

### Act I — discovery

The player learns the arena and gives the build a first identity.

### Act II — exploitation and resistance

The player compounds the build. Enemy composition begins to attack its assumptions. The arena gains a second state.

### Act III — system stress

The build becomes extreme. The arena law mutates or combines with a second law. Enemy specialists force active adaptation. The final boss changes the room itself.

## 5.4 The emotional target

The run should alternate between:

- **anticipation:** “I can see the setup”;
- **execution:** “I am committing to it”;
- **consequence:** “Everything is moving”;
- **recognition:** “That happened because of what I built and did”;
- **improvisation:** “The consequence was not exactly what I planned”;
- **recovery:** “Can I turn this mistake into another setup?”

The player should not merely watch damage numbers accelerate. The player should feel that the room has become an instrument.

## 5.5 Ten belonging tests

A proposed mechanic belongs near the center only if it passes several of these tests:

1. Does it change where mass is or how it moves?
2. Does it alter an existing weapon rather than merely add another damage source?
3. Does it create a state another action can exploit?
4. Does terrain or material matter to it?
5. Can the player understand the cause from motion and presentation?
6. Does it create a meaningful piloting or aiming decision?
7. Does it become different in another arena?
8. Does it create a build weakness as well as a strength?
9. Can it later exist in Adventure with costs and consequences?
10. Can Combat Lab reproduce and measure it deterministically?

A mechanic that passes none of these is likely content noise.



# 6. The complete Survival run loop

## 6.1 Entry

The player enters Crucible from a clear main-menu or in-world launch point. The first implementation should use a direct menu route because it minimizes fiction and travel dependencies. An in-world diegetic entry can be added after the mode proves itself.

Entry flow:

1. Choose **Survival** or **Combat Lab**.
2. Choose an unlocked arena.
3. Choose a deterministic seed or accept a generated seed.
4. Choose a starter package or build from the starting budget.
5. Review the arena law in one sentence and one visual diagram.
6. Launch through the real New Game and flight pipeline.
7. Begin after a brief controllable setup beat, not a cinematic lock.

The launch screen must show:

- arena;
- primary environmental law;
- starting budget;
- hull;
- fitted weapons and Rigs;
- any selected challenge mutators;
- expected run length;
- seed and build-code visibility;
- whether the run is scored.

## 6.2 Starting budget and packages

A normalized run economy is required because Adventure prices span a much wider scale than a twenty-to-forty-minute arcade run.

Working starting budget: **100 Arena Credits**.

This number is semantic, not tied to campaign credits. It lets every component price read as a percentage of the starting build.

Example starter packages:

| Package | Hull identity | Starting kit | Intended lesson |
|---|---|---|---|
| **Hitch Controller** | light, forgiving starter | Pulse Laser, Massline, one field Rig | Set up and manipulate rather than overpower. |
| **Wasp Gunner** | agile, weapon-forward | twin light guns, limited defense | Aim, bank, and exploit speed. |
| **Drifter Tug** | heavier, stable, more utility | concussion weapon, stronger control capacity | Enemies and debris are movable resources. |
| **Hornet Physics Kit** | advanced lab/default showcase | Concussion, Gravity Marker, Momentum Sink | Immediate access to the physical ceiling. |

The first public Survival build should offer no more than three packages plus a custom option. Combat Lab can expose everything.

A package must never be a trap. Every package needs:

- one reliable direct-damage path;
- one answer to light swarms;
- one meaningful interaction with the arena law;
- enough handling to recover from mistakes;
- a clear upgrade direction.

## 6.3 Pre-wave staging

Before each wave:

- spawn gates telegraph;
- arena machinery visibly enters its current state;
- remaining pickups sweep toward the player or expire according to an explicit rule;
- the player receives a brief control window;
- any wave-specific objective appears;
- the wave number and role composition are signaled at low information density.

The player should not navigate menus between ordinary waves. Drafts and refits are separate phases.

## 6.4 Active wave

During an active wave:

- the run director owns the wave objective and completion condition;
- the spawn-budget authority arbitrates live ship slots;
- canonical encounter materialization creates enemies;
- tactical or lightweight AI owns behavior;
- physics owns movement, constraints, contact, reflection, and impulse;
- combat owns damage, statuses, subsystems, and death;
- the run controller consumes immutable receipts for XP, credits, score, wave progress, and telemetry.

A wave ends when:

- all required spawn packages have materialized;
- all required hostile objectives are resolved;
- no blocking boss system remains;
- any survival timer or escort condition is complete;
- a short bounded cleanup phase has expired.

Do not require the player to hunt one distant bugged enemy for two minutes. A wave cleanup owner should detect invalid, unreachable, escaped, or non-participating remnants and resolve them honestly.

## 6.5 Run experience and drafts

Kills, assists, physical interactions, objectives, and style actions grant run XP. The first tuning target is three to four drafts per ten-wave block.

When a level threshold is reached:

1. Queue the draft if the game is in an unsafe transition.
2. Pause simulation at a deterministic phase boundary.
3. Present three choices from a seeded pool.
4. Show exact affected weapon, trigger, and relevant caps.
5. Allow one reroll only if the run owns a reroll resource.
6. Apply the choice through the modifier owner.
7. Recompile affected attack specifications.
8. Resume from the same simulation state.

The first version should pause completely. Real-time drafting is a later challenge mutator, not a default tax on comprehension.

## 6.6 Physical rewards

Destroyed enemies should emit:

- Arena Credit light or chips;
- occasional repair or capacitor pickups;
- rare temporary tactical pickups;
- objective-specific physical objects;
- debris and salvage that remain gameplay-relevant when performance permits.

Collection is part of combat while a wave is active. Positioning near the reward may be dangerous. After wave clear, a bounded arena-wide gravity sweep should collect ordinary currency so cleanup does not become housekeeping.

The pickup’s visual and movement must communicate value and collection direction without turning the arena into confetti fog.

## 6.7 Wave-ten refit

Every ten waves, enter a full refit phase.

The refit phase may allow:

- repair;
- weapon purchase;
- weapon replacement;
- Rig purchase;
- fitting changes;
- hull change;
- trait reroll or removal;
- shop refresh;
- reroll-resource purchase;
- limited conversion between run resources.

The player should be able to respond to discovered weaknesses, but not erase every commitment for free. Candidate rules:

- selling returns 60–80% of price;
- removing a temporary modifier costs a scarce purge resource;
- hull change keeps temporary traits but may invalidate slot-dependent ones;
- invalid traits become suspended and clearly marked rather than silently lost;
- one “emergency refit” can be earned for use between ten-wave blocks.

## 6.8 Boss waves

Wave 10, 20, and 30 are authored boss or major-system waves.

Boss waves should:

- use the current arena law;
- expose one new interaction;
- punish one common autopilot strategy;
- allow multiple successful build families;
- create physical targets beyond the boss hull;
- change geometry, fields, machinery, or spawn topology;
- end with a clear causal climax.

The boss should not invalidate the player’s build by arbitrary immunity. It may reduce the build’s efficiency and force an alternate expression.

## 6.9 Death

On player death:

1. Freeze score and causal accounting at the authoritative death tick.
2. Complete only already-earned receipts.
3. Show the final physical state briefly if motion/accessibility settings permit.
4. Present the run summary.
5. Offer same-seed restart, new-seed restart, Combat Lab reproduction, or exit.
6. Never write temporary run credits or traits into the Adventure save.

A “last event” panel should explain the fatal chain:

```text
Ionized by Lancer arc
→ shield failed
→ repulsor pushed ship into shutter lane
→ moving shutter collision
→ hull destroyed
```

This is useful to players and indispensable to developers.

## 6.10 Victory and extraction

The first release target is victory after wave 30.

Results should include:

- arena and seed;
- run duration;
- hull and final loadout;
- modifier stack;
- score;
- highest style multiplier;
- damage and kills by root weapon;
- damage and kills by trigger;
- direct, collision, terrain, tether, field, status, and reaction kills;
- peak hostile/projectile/field counts;
- boss outcomes;
- credits earned and spent;
- build code;
- unlocks earned;
- notable causal moments.

Endless continuation can begin after the victory screen as an explicit choice. It should not obscure the fact that the authored run was completed.

---

# 7. Progression clocks and run economy

Crucible needs several clocks because a single ten-wave shop cadence is too slow to create the transformation the reference experience promises.

## 7.1 Clock A: second-to-second physical state

This is ordinary combat:

- heat;
- capacitor;
- cooldown;
- momentum;
- field state;
- tether state;
- temporary statuses;
- pickups;
- arena machinery.

This clock creates immediate decisions.

## 7.2 Clock B: run XP and modifier drafts

This changes attack topology several times per block.

It answers:

> What surprising thing does my existing build do now?

Examples:

- one bounce;
- an additional projectile;
- chain through ionized targets;
- burning payload;
- orbiting field node;
- on-collision fork;
- Massline discharge.

## 7.3 Clock C: ten-wave refits

This changes the machine itself.

It answers:

> What should I buy, replace, move, or repair now that I understand this arena and build?

It operates through hulls, weapons, Rigs, fittings, and handling.

## 7.4 Clock D: run-long evolutions

A few combinations may unlock named evolutions during the run. Evolutions should be emergent summaries of a build, not an opaque recipe hunt.

Example:

```text
Bank Shot II
+ Smart Bank
+ Relay Arc
+ Ion Payload
→ STORM CAROM
```

Storm Carom might:

- preserve only one additional bounce;
- chain only after a bounce;
- increase field coupling of chained targets;
- add a distinctive visual and audio identity;
- remain bounded by one shared proc budget.

An evolution must simplify or focus the build, not merely add every effect at once.

## 7.5 Clock E: account-level unlocks

Meta-progression should unlock possibility:

- new arenas;
- new hull packages;
- new base weapons;
- new modifier families;
- new challenge rules;
- additional starter packages;
- cosmetics;
- lore and in-world provenance;
- Combat Lab presets.

It should not primarily grant:

- permanent damage;
- permanent hull;
- permanent XP gain;
- escalating starting health;
- mandatory grind before the game becomes expressive.

A skilled first-run player should be able to win with the initial pool. Later players should have more ways to win.

## 7.6 Arena Credits

Arena Credits are:

- run-local;
- integer;
- deterministic;
- owned by the run controller;
- granted from immutable receipts;
- discarded at run end;
- never stored in `state.player.credits`;
- never charged or granted through the campaign economy owner.

This is a deliberate exception to campaign economy semantics because the currency is not money in the living universe. It is a temporary run budget.

If later fiction makes Crucible an in-world institution, rewards crossing into Adventure should use a separate settlement event after the run, with explicit conversion and economy ownership.

## 7.7 XP sources

Candidate XP weights:

- ordinary kill;
- elite kill;
- boss system destroyed;
- physical collision caused;
- terrain kill;
- tether setup;
- status reaction;
- objective completion;
- rescue or protection;
- multi-kill;
- causal variety;
- risk pickup collected.

XP should not pay repeatedly for low-cost spam. Each source needs dedupe and causal attribution.

## 7.8 Shop design

The shop should be compact and legible.

A first refit shop can show:

- two weapons;
- two Rigs;
- one defensive/handling component;
- one repair option;
- one reroll;
- one purge;
- one hull offer.

The shop should avoid color-rarity language as the primary identity. A component is interesting because of its physical behavior, not because it is purple.

Possible shop controls:

- seeded inventory;
- one free refresh per refit;
- paid refreshes with increasing cost;
- lock one item for the next refit;
- salvage one offered item into a modifier reroll;
- arena-specific merchant bias;
- challenge mutator that removes randomness.

## 7.9 Economy pressure

The run economy should generate real tradeoffs:

- repair versus offensive growth;
- stable direct damage versus speculative synergy;
- light handling versus heavy control;
- buying a new root weapon versus deepening the current one;
- immediate survival versus saving for the next block;
- collecting exposed credits versus maintaining position.

It should not generate bookkeeping:

- dozens of low-value currencies;
- inventory weight management;
- ammo purchasing for every ordinary shot;
- campaign commodity prices;
- transaction taxes;
- randomized stat affixes with tiny differences.

---

# 8. The shared attack algebra

## 8.1 Core equation

**CORE:**

```text
Attack =
    Emitter
  × Trajectory
  × Propagation
  × Payload
  × Trigger
  × Constraint
```

This algebra should describe weapons, Rigs, orbitals, fields, and secondary effects with the same vocabulary.

### Emitter

How an attack enters the simulation:

- bolt;
- burst;
- beam;
- missile;
- mine;
- pulse;
- cone;
- tether discharge;
- orbiting node;
- deployed field;
- thrown body;
- debris fan;
- contact effect.

### Trajectory

How it moves:

- straight;
- inherited-velocity;
- homing;
- gravity-curved;
- ricochet;
- returning;
- orbiting;
- attached;
- drifting;
- accelerating;
- decelerating;
- spline or authored machinery path where physically justified.

### Propagation

How it reaches additional targets:

- multishot;
- pierce;
- split;
- chain;
- fork;
- pulse;
- echo;
- return pass;
- area;
- debris conversion;
- status transmission.

### Payload

What a valid contact does:

- channel damage;
- subsystem damage;
- impulse;
- torque;
- Gravity Mark;
- Momentum Sink;
- Pinned;
- Unmoored;
- Ionized;
- Burning;
- Overheated;
- Scrambled;
- Cryo Lock;
- Primed;
- Breached;
- tether attachment;
- field source;
- pickup magnetism;
- repair;
- projectile deflection.

### Trigger

When a secondary operation occurs:

- on fire;
- after delay;
- on surface contact;
- after bounce;
- on entity contact;
- on pierce;
- on kill;
- on hard collision;
- on status application;
- on status reaction;
- on field entry;
- on field exit;
- on Massline attach;
- on Massline tension threshold;
- on Massline cut;
- on projectile expiration;
- on player damage;
- on pickup collection.

### Constraint

What prevents an attack from becoming unbounded or free:

- heat;
- capacitor;
- ammunition;
- cooldown;
- proc budget;
- generation depth;
- child count;
- per-target hit cooldown;
- active-instance cap;
- bounce count;
- chain count;
- pierce count;
- range;
- mass threshold;
- line-of-sight;
- status prerequisite;
- arena material;
- player action;
- self-risk.

## 8.2 Why algebra instead of one-off weapons

Without a shared grammar:

- bounce is implemented in one projectile;
- chain is implemented in another;
- split missiles use a third path;
- orbitals become a fourth micro-engine;
- status payloads are copied;
- VFX has no stable causal identity;
- every combination requires bespoke integration;
- balance and performance caps drift.

With a shared grammar:

- one surface-contact seam can support every ricochet weapon;
- one chain selector can serve electricity, debris, healing, and tether discharge;
- one lineage system can measure every descendant;
- one proc budget can contain recursion;
- one modifier can apply to several compatible roots;
- Combat Lab can construct attacks from data;
- Adventure fittings can expose the same traits under physical costs.

## 8.3 Compatibility

Every trait should declare compatibility in data.

Example:

```yaml
id: trait_bank_shot
requires:
  emitter: [bolt, missile, debris]
  trajectory: [straight, inherited_velocity, gravity_curved]
forbids:
  continuous: true
  hitscan: true
cost:
  procBudget: 1
stack:
  mode: add_bounces
  maxRank: 3
```

This prevents invalid drafts and makes the choice UI honest.

## 8.4 Compile once, consume many times

The run modifier stack should not force every system to scan every modifier every tick.

At loadout change or modifier choice:

1. Read the canonical base weapon.
2. Read fitted components and run modifiers.
3. Resolve compatibility, precedence, exclusions, and rank.
4. Compile an immutable `AttackSpec`.
5. Cache it under a version or digest.
6. Root shots reference that spec.
7. Descendants carry a compact runtime record and shared lineage state.

This makes complexity pay at build-change time rather than in the hot path.

## 8.5 Example compilation

Base:

```yaml
weapon: wpn_pulse_laser_s
emitter: bolt
trajectory: straight
propagation: []
payload:
  - damage: thermal 8
constraints:
  heatPerShot: 5
```

Modifiers:

```text
Twin Mount
Bank Shot II
Smart Bank
Ion Payload
Relay Arc
```

Compiled:

```yaml
emitter:
  kind: bolt
  count: 2
  spreadDeg: 8
trajectory:
  kind: straight
  inheritedVelocity: 0.35
  bounces: 2
  afterBounceSteer:
    coneDeg: 50
    maxTurnDeg: 35
propagation:
  chain:
    count: 2
    requiresTargetStatus: status_ionized
payload:
  - damage: thermal 6.2
  - status: status_ionized
constraints:
  rootProcBudget: 12
  generationMax: 1
  sameTargetCooldownTicks: 18
  activeFamilyCap: 24
```

The exact numbers are tuning. The structural fact is that every behavior is visible before the shot exists.

## 8.6 Roots and descendants

A **root attack** is directly caused by a player activation or an authored periodic activation.

A **descendant** is created by a trigger from that root.

Examples:

- the two bolts from Twin Mount may both be generation 0 siblings;
- a split child is generation 1;
- a chain arc can remain generation 1;
- an explosion created by a chained child may be generation 2;
- generation 2 can be prohibited from spawning further damage descendants.

This distinction is required for:

- score attribution;
- heat and capacitor fairness;
- on-hit proc control;
- kill ownership;
- performance budgets;
- telemetry;
- VFX priority;
- preventing exponential recursion.

---

# 9. Attack lineage, triggers, and deterministic containment

## 9.1 Runtime record

A projectile or attack instance should carry only the runtime information it needs.

```js
attackRuntime = {
  lineageId: 817231,
  rootAttackId: 44091,
  specDigest: 'atk_3df42...',
  sourceEntityId: 'player',
  sourceWeaponSlot: 0,
  generation: 0,

  remaining: {
    bounces: 2,
    chains: 2,
    pierces: 0,
    splits: 1
  },

  procBudgetRef: 9912,
  visitedTargetsRef: 774,
  hitCooldownTicks: 18,
  createdTick: 40120
};
```

Large payload and trait definitions remain in the compiled spec.

## 9.2 Shared proc budget

Every lineage owns a finite proc budget.

Operations consume budget:

| Operation | Example cost |
|---|---:|
| additional root sibling | 1 |
| bounce continuation | 1 |
| chain target | 2 |
| split child | 2 |
| explosion | 3 |
| field spawn | 4 |
| orbit node spawn | 5 |
| status reaction child | 2 |

These are provisional weights. The invariant is that the family cannot generate more work than its budget permits.

When budget is exhausted:

- the current direct payload may still resolve;
- no additional descendant is spawned;
- telemetry records a suppressed proc;
- VFX may show a subtle exhausted read only if useful;
- gameplay never silently exceeds the cap.

## 9.3 Deterministic target selection

Every multi-target operation must use stable ordering.

Candidate procedure:

1. Query the bounded spatial region.
2. Filter invalid faction, state, line-of-sight, status, mass, and visited targets.
3. Compute authored score.
4. Sort by score descending.
5. Tie-break by distance squared.
6. Tie-break by stable entity ID.
7. Select the first valid candidates.

Never depend on insertion order from an unstable collection. Never use ambient randomness.

## 9.4 Surface contact receipt

Physics should remain the only authority on movement and contact. Weapon code should not guess a normal or reflect velocity directly.

A useful immutable receipt:

```js
{
  version: 1,
  projectileId,
  lineageId,
  surfaceId,
  materialId,
  point: { x, z },
  normal: { x, z },
  incomingVelocity: { x, z },
  relativeSpeed,
  incidenceCos,
  tick
}
```

The attack resolver decides whether the projectile:

- dies;
- reflects;
- penetrates;
- embeds;
- splits;
- creates a field;
- transfers a payload;
- changes material state.

Physics executes any continuation or reflected velocity.

## 9.5 Entity contact receipt

Combat should receive:

- authoritative source;
- target;
- contact point;
- incoming direction;
- relative velocity;
- attack lineage;
- payload;
- remaining propagation state.

Combat applies:

- damage;
- subsystem effects;
- statuses;
- impulse requests;
- torque requests;
- kill attribution.

A target may have a short lineage-specific hit cooldown to prevent one projectile from applying dozens of contacts while resting against a collider.

## 9.6 Kill trigger

Kill triggers must consume the authoritative combat-owned kill receipt. They may not infer death from missing entities.

Possible kill-trigger outcomes:

- fork;
- explosion;
- pickup bonus;
- style tag;
- cooldown refund;
- orbit-node refresh;
- Massline retarget;
- debris conversion;
- temporary field.

Kill triggers should generally have higher proc cost than contact triggers because they can cascade through low-health swarms.

## 9.7 Containment invariants

**CORE:**

- A descendant may not implicitly inherit every ancestor trigger.
- A trigger must declare whether children inherit it.
- Generation depth is finite.
- Per-lineage child count is finite.
- Per-tick global descendant creation is finite.
- Active projectiles, fields, and orbit nodes are bounded.
- Same-target re-hit is bounded.
- Target selection is deterministic.
- Cosmetic VFX can degrade before gameplay work.
- Suppressed procs are measurable.
- A build description must state meaningful caps.

The spectacle should look dangerous. The implementation should not be.

---

# 10. Modifier system design

## 10.1 Modifier purpose

A modifier should do at least one of four things:

1. **Change topology:** more paths, bounces, chains, splits, returns, or orbit.
2. **Change physical relationship:** mass, impulse, torque, field coupling, tether, collision, or terrain.
3. **Create a setup/payoff:** apply a state, exploit a state, or transform a state.
4. **Change risk:** heat, capacitor, proximity, recoil, self-damage, collection exposure, or commitment.

A modifier whose only text is “+8% damage” should usually be folded into tuning, a fitting, or a side effect of a more interesting choice.

## 10.2 Rarity is not identity

Use functional tiers rather than loot-color mysticism.

| Tier | Function |
|---|---|
| **Foundation** | Enables a family: first bounce, first chain, first orbit node, first payload. |
| **Deepener** | Adds rank, efficiency, targeting, or a second use to an enabled family. |
| **Bridge** | Connects two families: bounce-to-chain, tether-to-ion, burn-to-impulse. |
| **Keystone** | Reorients the build around one rule and usually adds a cost. |
| **Evolution** | Named synthesis of a mature build. |
| **Curse/Challenge** | Adds power with explicit danger or constraint. |

The UI may use visual hierarchy, but text should tell the player what kind of decision it is.

## 10.3 Draft quality rules

A three-choice draft should contain meaningful contrast.

Bad draft:

```text
+8% damage
+10% damage
+12% projectile speed
```

Better draft:

```text
Bank Shot — bolts bounce once from reflective terrain
Gravity Tag — hits mark light targets for stronger field coupling
Twin Mount — fire a second weaker bolt with wider heat cost
```

Draft construction rules:

- at least one choice compatible with the current root weapon;
- no choice already at maximum rank;
- no choice rendered inert by the current arena unless explicitly marked as a long-term bet;
- avoid three choices from the same family;
- weight bridges only when both prerequisite families exist or the missing half is offered soon;
- pity protection after several drafts without a build-defining option;
- do not secretly adapt every offer to force a designer-approved build;
- preserve seed reproducibility.

## 10.4 Stacking

Every modifier declares:

- maximum rank;
- stack mode;
- marginal effect per rank;
- compatibility;
- prerequisite;
- exclusion;
- child inheritance;
- proc cost;
- presentation identity;
- text template.

Possible stack modes:

- add count;
- multiply bounded scalar;
- replace behavior;
- unlock then deepen;
- alternate behavior by rank;
- convert payload;
- increase cap;
- reduce cost;
- add prerequisite.

## 10.5 Exclusivity

Some keystones should be mutually exclusive because their coexistence destroys identity or balance.

Examples:

- **Needle Geometry:** few precise high-speed projectiles.
- **Storm Geometry:** many low-damage chained projectiles.
- **Orbit Forge:** root shots convert into persistent orbit nodes.
- **Mass Driver:** most damage becomes impulse and collision setup.
- **Thermal Reactor:** heat becomes the build’s power resource.

Exclusivity should be explicit before selection.

## 10.6 Respec

The player needs limited correction, not consequence-free optimization.

Candidate rule:

- one free modifier purge at wave 10;
- additional purge costs rise;
- a purge removes one modifier and offers one replacement from the same functional tier;
- evolution can be dismantled only at a refit;
- Combat Lab ignores these limits.

## 10.7 Modifier text

Text should follow a stable grammar:

```text
NAME
What changes.
When it happens.
Relevant cap or cost.
```

Example:

> **Smart Bank**  
> After a wall bounce, the projectile may turn up to 35° toward the nearest valid hostile inside a 50° cone. One steering event per bounce.

Avoid “greatly,” “sometimes,” and hidden percentages.



# 11. Weapon and Rig expansion

The first implementation should prove that existing weapons can become radically different through modifiers. New weapons should arrive only where they demonstrate a missing emitter, trajectory, trigger, or physical relationship.

## 11.1 Existing roots to prioritize

| Existing root | Why it is valuable in Crucible |
|---|---|
| **Pulse Laser** | Clean baseline for multishot, ricochet, chain, status payload, and return behavior. |
| **Autocannon** | Strong impulse and armor identity; ideal for pierce, recoil, debris, and collision builds. |
| **Railgun** | Few-shot precision root for wall geometry, overpenetration, and momentum inheritance. |
| **Plasma Cannon** | Splash and thermal payload root for Burning and Thermal Shock. |
| **Missile Rack / Nestbreaker** | Existing homing and submunition vocabulary; natural split and target-selection stress test. |
| **Beam Laser** | Continuous emitter; tests whether the modifier algebra supports non-projectiles without fake bolts. |
| **EMP Disruptor** | Disable and subsystem root; supports capture, Drifting, and control builds. |
| **Gravity Marker** | Setup tool that makes fields and mass manipulation stronger. |
| **Momentum Sink** | Frame-relative control root; supports clustering and collision setup. |
| **Concussion Cannon** | Signature impulse root; ideal for terrain and body-as-ammunition play. |
| **Impulse Charges** | Delayed, attached, player-timed physical payoff. |
| **Massline** | Constraint root and bridge into every physical build. |
| **Well / Repulsor / field Rigs** | Persistent arena-shaping roots and defensive projectile curvature. |

## 11.2 Candidate new roots

### Carom Driver

A deliberate ricochet weapon. It fires a slow, dense kinetic slug with a small number of high-value bounces.

Distinctive rule:

- every valid bounce increases impulse and armor penetration;
- every bounce also reduces structural integrity;
- a shallow-angle scrape is less valuable than a committed bank;
- the last bounce can become a penetrating exit shot.

Purpose: prove that walls are part of aiming.

### Relay Lance

A low-to-moderate direct-damage ion bolt that traverses a physical conductivity graph:

- ionized ships;
- conductive pylons;
- conductive debris;
- a Massline acting as a cable;
- authored machinery.

Purpose: make target arrangement and environmental wiring matter.

### Cryo Gyro Rack

Deploys two or more orbiting field nodes.

Each node:

- follows a deterministic orbital phase;
- applies Cryo Lock on close pass;
- exerts a weak outward impulse;
- has a per-target cooldown;
- can be upgraded in count, radius, speed, or payload;
- is a field source, not initially a full colliding rigid body.

Purpose: introduce orbit play without immediately paying for constrained-body collision chaos.

### Shepherd Mine

A two-phase mine:

1. pull nearby light bodies inward;
2. after a visible charge, release a stronger outward impulse.

Variants may:

- pin the center target;
- mark pulled targets;
- convert the release into cryo or ion;
- attach to terrain;
- attach to a Massline target.

Purpose: create a visible setup and payoff event rather than another explosion.

### Forkcaster

A projectile designed to split under selectable conditions.

Keystone options:

- split on first wall;
- split on first enemy;
- split on kill;
- split on expiration;
- split children inherit payload but not split.

Purpose: prove trigger inheritance and proc containment.

### Massline Arc Welder

Conducts an ion or thermal payload through the active Massline.

Possible path:

```text
player
→ active line
→ anchor target
→ nearby ionized targets
```

Purpose: turn the signature constraint into an electrical and thermal relationship without replacing its physical identity.

### Wake Cutter

Leaves a short-lived directional shear field behind the player.

It can:

- displace pursuers;
- curve projectiles;
- strip light mines;
- align loose debris;
- gain strength from actual player speed.

Purpose: reward authored flight paths and make retreat an offensive shape.

### Rebound Flak

Fires a broad pellet cone. Pellets are weak directly and become guided only after a surface contact.

Purpose: invert ordinary aiming. The best shot is often deliberately away from the enemy.

### Neutron Slug

A moving, decaying gravity source.

It:

- curves nearby bodies and projectiles while traveling;
- loses field strength with time;
- can be banked;
- creates a transient moving geometry problem;
- has strict field and query caps.

Purpose: extend the existing static Well into a moving projectile without creating a second force model.

### Snarl Hub

Deploys a hub that attaches Masslines to several valid light targets.

It creates a temporary constraint network. The hub can be:

- destroyed;
- moved;
- tethered;
- wound by a later upgrade;
- overloaded into a bomb-web.

Purpose: turn enemy number into opportunity.

### Capstan

A winding Snarl variant. It reduces effective line length as the hub turns, creating a spiral and collision machine.

Purpose: make swarms physically self-destructive.

### Hullplate Projector

Deploys a dense flat plate that can:

- block ordinary enemy fire;
- become a player ricochet surface;
- be tethered and repositioned;
- crush light targets;
- degrade under impact.

Purpose: unite defense, construction, bounce, and thrown terrain.

### Collision Primer

Low direct damage. It applies Primed so the next sufficiently hard collision or impulse event detonates the target.

Purpose: make setup weapons valuable without requiring direct DPS parity.

### Polarity Beam

A continuous field-like beam whose alternate fire or modifier changes between:

- pulling the target along the beam axis;
- pushing it away;
- changing field coupling;
- transferring Pinned or Unmoored.

Purpose: give precise continuous mass control.

### Debris Loom

Converts nearby eligible debris fragments into a bounded rotating or forward-firing pattern.

Purpose: make destruction generate ammunition while respecting active-fragment caps.

### Reactor Mortar

Fires a slow volatile payload that embeds in terrain or hull. It can be moved before detonation by fields, impact, or Massline.

Purpose: create a player-authored hazard whose position remains negotiable.

### Tumble Ray

A low-damage continuous emitter that applies torque and degrades aim/attitude control.

Purpose: make Spinning a deliberate setup state.

### Magnetic Harvester

A utility Rig that attracts ferrous debris, pickups, and selected light projectiles into an orbit or cone, then ejects them.

Purpose: turn collection into attack preparation.

### Phase Harpoon

A projectile that passes through ordinary non-conductive cover once, then becomes physical and can attach.

Purpose: create a limited exception to terrain without erasing terrain.

### Orbit Forge

Converts a portion of root shots into bounded orbiting projectiles that release on a player trigger or target condition.

Purpose: transform timing and spatial commitment while retaining active control.

## 11.3 Root design rule

Every new weapon proposal must include:

- the missing grammar cell it proves;
- why existing roots cannot express it cleanly;
- its physical decision;
- its arena interaction;
- its Adventure acquisition and cost;
- its performance envelope;
- its deterministic Lab scenario;
- the build family it enables;
- at least one explicit weakness.

A new weapon with no weakness is a patch note, not a design.

## 11.4 Rigs versus weapons

Use the existing utility-slot/Rig framing.

Weapons primarily:

- emit attacks;
- consume weapon heat/capacitor/ammunition;
- occupy weapon mounts;
- care about facing and shot geometry.

Rigs primarily:

- create fields;
- manipulate constraints;
- alter movement or defense;
- deploy machinery;
- consume utility capacity;
- change how the ship relates to the arena.

Some candidates may exist in both forms, but the distinction should remain meaningful.

---

# 12. Physical states and reaction grammar

The status system already supports duration, stacking, periodic packets, interaction declarations, persistence, and physics-response effects. Crucible should exploit that before adding a parallel buff framework.

## 12.1 Existing states to center

| State | Crucible use |
|---|---|
| **Tumbling / Spinning** | Prevents clean aim and creates a physically vulnerable trajectory. |
| **Gravity Marked** | Increases coupling to artificial fields; setup for Well, Repulsor, and moving gravity. |
| **Momentum Sink** | Binds motion toward an attacker-relative frame; setup for clustering and interception. |
| **Pinned** | Makes a body physically expensive to accelerate; anchor creation and formation disruption. |
| **Unmoored** | Makes a body light and throwable; converts heavies toward ammunition. |
| **Ionized** | Electronic pressure and chain-conduction prerequisite. |
| **Burning** | Damage-over-time, heat, and thermal-reaction setup. |
| **Overheated** | Weapon denial and thermal interaction. |
| **Scrambled** | Sensor/capability loss and chain consequence. |
| **Drive disabled / Drifting** | Converts an agent into a ballistic object and capture opportunity. |
| **Breached subsystem/hull state** | Creates venting, unstable thrust, and explosive opportunity where implemented. |

## 12.2 One recommended new status: Cryo Lock

**FIRST SLICE CANDIDATE after the base modifier kernel.**

Cryo Lock should not set velocity to zero. That would erase the game’s physical identity.

It should:

- reduce thrust authority;
- reduce rotational authority;
- increase rotational inertia;
- optionally reduce capacitor recovery;
- preserve translational velocity;
- preserve collision response;
- remain visibly legible through frost, venting, and altered attitude control.

A cryo-locked enemy continues along its last trajectory. The player can then:

- bank it into a wall;
- pull it into a group;
- use it as cover;
- shatter brittle attachments;
- apply heat for Thermal Shock.

## 12.3 Candidate advanced states

These are **EXPERIMENTS**, not first-slice requirements.

### Primed

The entity stores a bounded detonation payload triggered by:

- hard collision;
- sufficiently large impulse;
- high-tension Massline cut;
- thermal threshold;
- destruction.

Primed needs strict one-shot consumption and causal ownership.

### Breached

A hull or subsystem is physically open:

- venting applies directional impulse;
- thrust becomes unreliable;
- heat and fire spread more easily;
- boarding/capture becomes possible;
- internal payloads can be hit.

Breached should be derived from actual damage state where possible, not duplicated.

### Hot

A per-entity signature state:

- seekers prefer it;
- cloak suppresses it;
- high-output Rigs generate it;
- thermal arenas exploit it;
- score or enemy aggression may respond.

This must not be confused with WANTED heat.

### Snarled

An entity is part of a multi-body constraint network.

This may be represented by attachments and network identity rather than a conventional status.

### Conductive

Prefer a material/tag property or derived state over a generic timed icon. Ionized can temporarily make a ship conductive; metal props are inherently conductive.

## 12.4 Reaction matrix

| Setup | Payoff | Result | Notes |
|---|---|---|---|
| Ionized | Overheated | Scrambled | Existing interaction should remain canonical. |
| Burning | Cryo Lock | Thermal Shock | Consumes or reduces both; sharp impulse, subsystem pulse, vapor read. |
| Gravity Marked | Well/Repulsor | Amplified coupling | Existing intended relationship. |
| Pinned | High impulse | Pressure Fracture | Candidate: armor/subsystem effect rather than raw extra hull damage. |
| Unmoored | Collision | Amplified displacement | Physics consequence, not a hidden damage multiplier. |
| Tumbling | Massline attach | Excellent capture/throw window | Targeting and UI should expose this. |
| Drive disabled | Tow/custody | Capture | Existing physical-play chain. |
| Primed | Hard collision | Detonation | One-shot, lineage-owned. |
| Breached | Burning | Vent Fire | Persistent directional emission and propulsion instability. |
| Breached | Cryo | Seal/Frost fracture | May temporarily reduce venting, then increase brittleness. |
| Ionized | Relay Arc | Chain extension | Conductivity graph. |
| Gravity Marked | Neutron Slug | Curved pursuit | Physical path change. |
| Snarled | Capstan | Spiral collapse | Constraint-network payoff. |
| Hot | Cryo zone | Rapid fog/thermal stress | Arena-specific. |
| Pinned | Unmoored | Neutralization | Existing mutual consumption is the clean default. |

## 12.5 Reaction design rules

- Reactions must be visible in motion, material, or emission.
- Reactions should consume, transform, or meaningfully alter setup states.
- A reaction should not be free extra damage on every hit.
- The player should be able to predict it after seeing it once.
- Enemy specialists may use the same grammar selectively.
- Bosses should not be universally immune; they can scale response by mass, subsystem, or phase.
- Every reaction needs deterministic tests and causal telemetry.
- Status icons support comprehension; they do not replace world presentation.

---

# 13. Materials, props, and environmental verbs

## 13.1 Material grammar

Every arena object should declare a small, composable set of physical/material properties.

| Property | Behavior | Gameplay use |
|---|---|---|
| **Reflective** | Eligible player projectiles reflect according to material and attack traits. | Ricochet, banking, defensive geometry. |
| **Absorbent** | Projectiles die or embed; may store energy. | Safe walls, traps, charge surfaces. |
| **Conductive** | Participates in ion/relay graphs. | Chain routing and electrical arenas. |
| **Volatile** | Detonates under threshold conditions. | Environmental bombs and cascading hazards. |
| **Cryogenic** | Releases cold field or applies Cryo Lock. | Control and Thermal Shock setup. |
| **Brittle** | Fractures into bounded pieces under sufficient impact. | Debris attacks and shatter builds. |
| **Ferrous** | Couples to magnetic/gravity tools according to authored rules. | Self-aiming debris and collection. |
| **Dense** | High mass, strong anchor, collision tool. | Massline, cover, wall construction. |
| **Elastic** | Returns impulse with altered restitution. | Pinball bodies and bounce hazards. |
| **Insulating** | Breaks conductivity graphs. | Counterplay and arena routing. |
| **Phase-permeable** | Passes selected attack classes. | Limited geometry inversion. |
| **Repairing** | Restores hull or machinery under conditions. | Objectives and enemy support. |
| **Hazardous** | Applies an arena-specific consequence on contact. | Current, heat, radiation, grinding machinery. |

Properties should live in shared data and produce canonical receipts. Arena scripts should compose properties rather than hard-code every interaction.

## 13.2 Prop families

### Loose ballast

Dense, movable blocks used for:

- cover;
- crushing;
- anchoring;
- blocking spawn lanes;
- constructing bank surfaces;
- current visualization.

### Hull plates

Flat dense wreck pieces used for:

- shields;
- ricochet surfaces;
- Massline throws;
- temporary walls;
- conductive paths.

### Coolant tanks

Cryogenic, volatile or brittle containers used for:

- cold clouds;
- freeze setup;
- Thermal Shock;
- movement through venting;
- chain reactions.

### Reactor cores

Volatile and conductive objects used for:

- delayed area denial;
- relay nodes;
- boss subsystem payloads;
- dangerous reward objects.

### Field pylons

Anchored or movable field sources used for:

- attraction;
- repulsion;
- projectile curvature;
- conductivity;
- arena-state control.

### Shutters and machinery

Kinematic authored bodies used for:

- changing lanes;
- timed crush hazards;
- altering bounce geometry;
- creating cover;
- boss phase changes.

### Ice and mineral bodies

Brittle, ferrous, dense, or volatile natural objects used for:

- fragmentation;
- gravity alignment;
- mining crossover;
- arena-specific ammunition.

## 13.3 Environmental verb tests

Every prop should answer at least two verbs:

- shoot;
- tether;
- push;
- pull;
- bounce from;
- conduct through;
- freeze;
- heat;
- break;
- collect;
- hide behind;
- use as anchor.

A prop that only damages the player on touch is a hazard. A prop that answers several verbs is content.

## 13.4 Persistence within a wave and run

Arena state should persist long enough for player actions to matter.

Default:

- movable props persist across a wave;
- destroyed ordinary props may remain as bounded debris;
- wave cleanup removes only low-value clutter or resets machinery explicitly;
- ten-wave refit may restore or mutate the arena according to authored rules;
- bosses can permanently alter the arena for later acts;
- Combat Lab can reset instantly.

Do not reset every object between waves merely because wave games often do. Physical history is part of the fantasy.

---

# 14. Arena design grammar

## 14.1 One law per arena

Every initial arena should have one sentence a player can remember.

Examples:

- “Your shots bounce; ordinary enemy shots do not.”
- “The central field changes the weight of the room.”
- “A current sweeps light bodies in a warned direction.”
- “Cold preserves momentum but steals control.”
- “Electricity follows the network you build.”

Additional mechanics may exist, but they must support the primary law.

## 14.2 One mutation per act

A thirty-wave arena should evolve through three acts.

| Act | Mutation role |
|---|---|
| I | Teach the law in a stable configuration. |
| II | Let enemies exploit or interfere with the law. |
| III | Change the law’s geometry, timing, or polarity. |

The player should not need to relearn a completely different arena every ten waves.

## 14.3 Geometry requirements

An arena needs:

- clear camera bounds;
- readable edge treatment;
- at least two meaningful movement loops;
- open space for recovery;
- constrained lanes for area/control payoff;
- authored surfaces or machinery;
- spawn gates that do not ambush without telegraph;
- safe but non-permanent staging zones;
- sufficient scale for high-speed flight;
- no decorative collision mismatch;
- no invisible walls.

## 14.4 Build diversity requirement

Each arena should favor several families, not one mandatory answer.

For example, Ricochet Foundry should support:

- bounce;
- impulse;
- tether;
- mines;
- direct precision;
- orbit defense.

Bounce may be strongest, but a non-bounce build must remain viable through other uses of machinery and geometry.

## 14.5 Arena law versus enemy law

Difficulty emerges when enemy roles interact with the arena.

Examples:

- a sniper occupies the best bank angle;
- a shield drone blocks a current lane;
- a heavy anchor resists a gravity inversion;
- a mine-layer contaminates the safe orbit;
- a conductor enemy turns the player’s Storm Lattice network against them;
- a cryo specialist reheats itself before a wall collision.

This is more interesting than increasing health.

## 14.6 Authored first, procedural later

The first five arenas should be authored and measured.

Procedural generation is deferred because early development needs to answer:

- which wall angles create satisfying banks;
- how much room a Massline needs;
- which field strengths remain readable;
- how many props create opportunity without clutter;
- where spawn gates remain fair;
- how camera bounds interact with speed;
- what machinery motion is understandable;
- what geometry breaks AI.

After those answers exist, a recipe system can recombine validated modules.

## 14.7 Arena acceptance

An arena is not complete because it loads.

It requires:

- exact render/collision agreement;
- one-sentence law visible in play;
- at least three viable build families;
- one interaction with Massline;
- one interaction with field or impulse tools;
- one enemy role that exploits the law;
- one boss that changes the room;
- deterministic Lab scenario;
- ordinary Browser/Electron route;
- accessibility review;
- performance at authored density;
- a fun verdict from complete waves, not screenshots.



# 15. Arena 1: Ricochet Foundry

**Disposition:** **FIRST SLICE.**  
**Primary law:** Player projectiles can bank from authored reflective surfaces; ordinary enemy projectiles generally cannot.  
**Primary proof:** surface-contact receipts, reflection authority, trait compatibility, lineage containment, and causal readability.

## 15.1 Fantasy

An industrial test chamber built around blast-resistant armor, smelting machinery, moving shutters, and replaceable impact plates. The room feels like a weapon-testing plant that has become a gladiatorial machine.

The visual hierarchy:

- dark industrial floor and void;
- painted structural rails;
- hot furnace cores;
- clean reflective armor faces;
- scarred absorbent blocks;
- bright player shot paths;
- restrained enemy shot deaths against boundaries;
- moving machinery with unmistakable warning motion.

## 15.2 Layout

Initial layout:

- broad rectangular or octagonal combat floor;
- four spawn gates near corners but outside direct spawn-fire lines;
- two angled reflective armor plates creating diagonal bank corridors;
- a central absorbent furnace block;
- two moving blast shutters that alternately open and close side lanes;
- two loose dense hull plates;
- one open recovery loop around the exterior;
- one high-risk inner loop near machinery;
- clear player entry bay.

The first prototype should use simple exact geometry. Visual finish follows only after bank angles and movement lanes are proven.

## 15.3 Surface classes

| Surface | Player projectile behavior | Enemy projectile behavior | Physical behavior |
|---|---|---|---|
| Reflective plate | Eligible attacks reflect. | Ordinary shots terminate with readable impact. | Heavy, tetherable only if loose. |
| Absorbent furnace | Terminates or embeds attacks. | Terminates. | Stores heat or detonates embedded payloads in later experiment. |
| Structural wall | No bounce by default or one low-energy bounce by trait. | Terminates. | Immovable. |
| Loose hull plate | Reflects eligible attacks. | Terminates or damages plate. | Movable, tetherable, throwable. |
| Shutter face | Reflects while closed. | Terminates. | Kinematic crush hazard. |
| Furnace mouth | Consumes projectiles and light bodies. | Same. | High-damage environmental sink. |

## 15.4 Act structure

### Waves 1–10: learn the bank

- Stable plate positions.
- One shutter moves slowly.
- Light swarmers arrive through visible lanes.
- First specialist occupies a direct-fire line, inviting a bank.
- Boss presents reflective frontal armor and vulnerable rear systems.

### Waves 11–20: contested geometry

- Both shutters operate.
- Mine-layers contaminate the outer loop.
- A bruiser can shove loose plates out of alignment.
- Some enemies deploy temporary absorbent screens.
- One wave requires protecting a movable reflective plate.

### Waves 21–30: the room becomes a machine

- Plate angles rotate between waves or during telegraphed transitions.
- Furnace pulses create temporary no-cross zones.
- Spawn gates alternate.
- A boss system can reverse one shutter’s motion.
- The player can deliberately jam machinery with a dense body.

## 15.5 Favored build families

- Bank Shot and Smart Bank.
- Rebound Flak.
- Railgun precision.
- Impulse and wall-driver builds.
- Massline plate repositioning.
- Mines placed behind shutters.
- Returning projectiles.
- Orbit defense in constrained lanes.
- Collision Dividend.

## 15.6 Counterpressure

The arena should challenge bounce builds through:

- absorbent enemies or temporary screens;
- heavies occupying the best bank corridor;
- fast swarmers crossing before the second bounce;
- machinery that changes the expected angle;
- threats that force the player off a comfortable firing line.

It should challenge direct-fire builds through:

- frontal cover;
- enemies using the furnace block;
- long diagonal spawn paths;
- specialists behind shutters.

## 15.7 Wave-ten boss: Mirrorjaw Foreman

Working concept:

A heavy industrial ram with:

- reflective frontal armor;
- vulnerable rear reactor machinery;
- side-mounted impulse pistons;
- a telegraphed charge;
- the ability to push loose plates;
- one deployable absorbent screen;
- moderate swarm support.

Ways to win:

- bank shots into the rear;
- bait the charge into machinery;
- tether and rotate a loose plate;
- unmoor the boss temporarily through a subsystem;
- throw swarmers into rear machinery;
- embed a Reactor Mortar in the furnace and move the boss near it.

The boss should not rotate instantly to face the player. Its mass and commitment are the fight.

## 15.8 Foundry experiments

- Does a reflected shot need small aim assistance to remain satisfying?
- Is assistance best applied after contact, before contact through a preview, or not at all?
- How many bounces remain readable at normal camera?
- Does player-only bounce feel coherent or arbitrary?
- Can loose reflective plates be repositioned without AI/path failures?
- Does a wall-impact build compete with raw DPS?
- How often does a player intentionally fire away from the target?
- Do bank paths remain legible under multishot?

## 15.9 Performance risks

- many swept projectile contacts;
- repeated surface queries;
- child shots after bounce;
- trails drawing long paths;
- moving collision surfaces;
- debris near shutters;
- VFX at repeated wall impacts.

Contain through:

- bounded bounces;
- shared lineage cap;
- pooled impact cues;
- material-level VFX cadence;
- exact kinematic ownership;
- low-cost preview only for the player’s current root shot, if used.

## 15.10 Acceptance scenario

A deterministic Lab scenario should:

1. spawn the player with Pulse Laser;
2. place three targets behind an angled plate;
3. fire an authored input sequence;
4. verify one root and one reflected continuation;
5. verify physics-owned reflected velocity;
6. verify target ordering;
7. verify ordinary enemy fire does not reflect;
8. verify a moved loose plate changes the result;
9. repeat and save/load compare where relevant;
10. expose a headed route for visual judgment.

---

# 16. Arena 2: Lagrange Crucible

**Disposition:** second arena after Ricochet Foundry.  
**Primary law:** A central artificial-gravity system changes how light bodies, marked targets, projectiles, and pickups move.  
**Primary proof:** field-kernel scalability, moving/alternating field configurations, mass-sensitive interaction, and Gravity Mark payoff.

## 16.1 Fantasy

A research ring around a compact gravitic engine. The room is less a floor than a diagram of forces. Loose debris, warning filaments, orbiting pylons, and curved trails show the current state before the player feels it.

## 16.2 Layout

- central field core with an unsafe inner radius;
- wide annular combat lane;
- four peripheral field pylons;
- two loose dense anchor bodies;
- outer spawn gates;
- one broken maintenance arc providing cover;
- clear radial markings or material seams;
- no invisible gravity boundaries.

## 16.3 Field states

### Pull

- light enemies and pickups drift inward;
- marked targets couple more strongly;
- player projectiles curve according to attack compatibility;
- heavy bodies shift slowly;
- the player can use the core as a slingshot hazard.

### Repel

- light bodies are driven outward;
- center becomes temporary recovery space;
- outer-wall collision risk increases;
- pickups become harder to collect until cleanup sweep.

### Lateral tide

- opposing pylons create a cross-room current;
- the room gains a dominant direction;
- mines and loose props become moving hazards.

### Pulse

- the field alternates with a clear charge and release;
- momentum accumulates between pulses;
- timing becomes more important than static positioning.

## 16.4 Act structure

### Waves 1–10: stable central pull

The player learns:

- mass bands;
- Gravity Mark;
- clustering;
- curved shots;
- using the core to redirect enemies.

### Waves 11–20: pylon control

- one or more pylons become destructible or movable;
- enemies can occupy or disable pylons;
- polarity shifts between waves;
- specialists resist or exploit field coupling.

### Waves 21–30: tidal engine

- multiple field components combine;
- short inversions occur after warning;
- the boss moves the field center;
- destroyed pylon fragments remain physical.

## 16.5 Favored build families

- Gravity Marker.
- Well and Repulsor.
- Neutron Slug.
- Shepherd Mine.
- Momentum Sink.
- Massline slings.
- explosive or chain builds after clustering.
- orbiting nodes that shepherd bodies.
- pickups and reward-risk builds.

## 16.6 Counterpressure

- heavy anchors that barely move;
- unmoored light enemies that overshoot player setups;
- snipers on the outer ring;
- field disruptors that create dead zones;
- enemies that deliberately ride the current;
- mines that are also field-coupled;
- a specialist that temporarily clears Gravity Mark.

## 16.7 Wave-ten boss: Tidal Engine Carrier

A heavy carrier with four external field vanes.

Each vane:

- changes the carrier’s local field;
- can be disabled;
- can be physically displaced after damage;
- creates a safe or dangerous sector;
- affects support swarm trajectories.

The boss wins by controlling the room. The player wins by:

- breaking field symmetry;
- marking the carrier;
- using a pylon as an anchor;
- redirecting a vane fragment;
- exploiting inversion timing;
- attacking exposed machinery during field transitions.

## 16.8 Experiments

- What field strength produces visible curvature without stealing control?
- Should eligible player projectiles couple automatically or require a trait?
- How should the camera communicate offscreen field consequences?
- Can pickups remain desirable during pull phases without causing suicidal collection?
- Does mass difference read without numbers?
- Can a player create stable orbits, and are they useful or merely pretty?
- How many simultaneous field sources remain understandable?

## 16.9 Acceptance

The arena passes only if:

- a new player can predict pull direction from presentation;
- Gravity Mark produces an obvious but bounded difference;
- heavy and light targets respond differently;
- the player can deliberately cause a collision using the field;
- no hidden velocity writes bypass physics;
- field query and render costs remain inside the packet budget;
- the boss’s field state remains understandable under swarm load.

---

# 17. Arena 3: Cinder Sluice

**Disposition:** third arena and shortest path to environment-as-weapon because the project already has directional-current concepts and machinery.  
**Primary law:** A warned industrial current sweeps light bodies and projectiles through the arena.  
**Primary proof:** phased environmental machinery, shared geometric predicates, directional flow readability, and Massline/impulse integration.

## 17.1 Fantasy

A refinery slag and cargo channel. Massive pumps periodically vent a lateral force through the work lane. Ballast, cargo slabs, ore chunks, and wreck plates make the current visible. The player fights inside a machine that was designed to move material, not host a battle.

## 17.2 Layout

- long central channel;
- two broad side pockets;
- upstream and downstream machinery;
- movable shutters;
- ballast piles;
- loose cargo slabs;
- one dense central anchor;
- clearly marked current direction;
- side routes that are safer but less lucrative.

## 17.3 Current phases

### Warning

- lights chase in the coming direction;
- loose particles begin to drift;
- machinery spins up;
- audio rises;
- a direction arrow may appear at the arena boundary, not across the windshield.

### Surge

- bounded force acts on eligible bodies;
- force scales by mass and coupling;
- projectile curvature is visible;
- collision risk rises;
- thrown objects travel farther.

### Calm

- no current or residual low flow;
- player repositions props;
- pickups are easier to collect;
- mines and hazards can be set.

## 17.4 Act structure

### Waves 1–10: one-direction cycle

- long warning;
- predictable surge;
- light swarmers;
- early ballast throws;
- boss drags hazardous cargo.

### Waves 11–20: directional choice

- alternating directions;
- one side pocket closes;
- mine-layers use downstream lanes;
- current-sensitive specialists appear;
- dense enemies become mobile cover.

### Waves 21–30: rotating failure

- current rotates among four directions;
- warning time shortens but remains fair;
- shutters change the flow;
- machinery can be jammed;
- boss creates a secondary local current.

## 17.5 Favored build families

- Massline.
- Concussion.
- Impulse charges.
- Shepherd Mine.
- returning projectiles.
- mines and delayed payloads.
- heavy hull anchor builds.
- collision and terrain scoring.
- Wake Cutter.
- Hullplate Projector.

## 17.6 Counterpressure

- mines laid in the downstream safe lane;
- heavies that use the current to ram;
- shield drones hiding behind ballast;
- snipers firing across the channel during calm;
- enemies that tether themselves to anchors;
- a specialist that reverses one loose prop’s coupling.

## 17.7 Wave-ten boss: Chain Tug

A heavy industrial tug hauling a train of dangerous ballast and volatile cargo.

The train:

- follows physical or bounded constraint rules;
- blocks lanes;
- becomes a moving shield;
- can be cut into segments;
- can be redirected into machinery;
- includes one high-value volatile car.

Ways to win:

- sever the train;
- use current timing to fold it into the tug;
- pin the tug and unmoor the ballast;
- tether a car and swing it;
- destroy control machinery;
- direct-fire the tug more slowly.

The memorable kill should often be the tug being destroyed by what it was hauling.

## 17.8 Experiments

- How long must the warning be at different speeds?
- Should the player ship couple at full strength, reduced strength, or through hull class?
- Can the current move projectiles without making aim feel false?
- Does the player understand why one object moved and another did not?
- How many loose bodies are useful before clutter dominates?
- Can AI exploit side pockets without path-script theater?
- Can current-driven pickups create risk without frustration?

## 17.9 Acceptance

The arena is successful when a player can intentionally:

- stage a body during calm;
- use the surge to turn it into a weapon;
- recover from being caught in the wrong lane;
- read direction without a text prompt;
- use Massline and impulse as distinct answers;
- defeat the boss through at least two physical strategies.

---

# 18. Arena 4: Cryo Drift

**Disposition:** fourth arena, after the base status/reaction bridge exists.  
**Primary law:** Cold removes control but preserves momentum; heat restores control and can trigger violent thermal reactions.  
**Primary proof:** Cryo Lock, thermal interaction, zone presentation, and status-to-physics readability.

## 18.1 Fantasy

A failed coolant-processing pocket filled with drifting ice, cracked tanks, thermal exhausts, and frozen machinery. The arena alternates between silent cold geometry and violent hot venting.

## 18.2 Layout

- four quadrants with controllable thermal state;
- central insulated platform;
- coolant tanks near boundaries;
- thermal exhaust manifolds;
- brittle ice bodies;
- two narrow transition lanes;
- safe staging region that moves as machinery changes.

## 18.3 Thermal rules

### Cold zone

- applies Cryo Lock over time;
- improves weapon heat dissipation;
- may reduce fire duration;
- preserves translational momentum;
- creates frost trails and brittle surfaces.

### Hot zone

- removes Cryo Lock faster;
- adds heat;
- may apply Burning;
- activates thermal machinery;
- creates expanding exhaust impulse.

### Thermal Shock

Triggered when sufficient heat meets Cryo Lock:

- consumes or reduces both states;
- applies a sharp impulse;
- deals bounded subsystem or armor damage;
- produces a distinctive vapor event;
- can fracture brittle attached props.

## 18.4 Act structure

### Waves 1–10: static cold and hot halves

- simple zone boundaries;
- coolant tanks teach portable cold;
- thermal vents teach cleanse and risk;
- boss rotates one manifold.

### Waves 11–20: moving thermal map

- quadrants change;
- enemies carry heat or cold auras;
- brittle ice creates debris;
- the player can damage controls to lock one zone.

### Waves 21–30: containment collapse

- alternating arena-wide pulses;
- coolant and exhaust interact;
- fog briefly reduces visual detail but not threat readability;
- boss breaks tanks and changes material state.

## 18.5 Favored build families

- Cryo Gyro Rack.
- Plasma and Burning.
- Thermal Shock bridges.
- impulse and collision.
- brittle-fragment attacks.
- heat-engine builds.
- Massline tank delivery.
- orbiting control nodes.
- precise high-speed shots through frozen formations.

## 18.6 Counterpressure

- enemies that generate heat and self-cleanse;
- cold-resistant heavies that remain dangerous anchors;
- fast enemies whose preserved momentum becomes hazardous;
- thermal snipers that detonate frozen clusters;
- support units that move coolant tanks;
- repair units in the insulated center.

## 18.7 Wave-ten boss: Manifold Warden

A rotating industrial controller with:

- four exhaust arms;
- coolant reservoirs;
- a heavy central body;
- vulnerable flow-control subsystems;
- a phase that locks two quadrants cold;
- a phase that rotates hot exhaust.

The player can:

- destroy reservoirs;
- tether and redirect a loose tank;
- freeze an arm, then heat-shock it;
- use preserved momentum to slide enemies into the core;
- attack the controller conventionally at lower efficiency.

## 18.8 Experiments

- Does Cryo Lock feel like control loss without feeling like stolen input?
- What minimum visual language makes preserved momentum obvious?
- Does improved heat dissipation create a meaningful reason to enter cold?
- Can Thermal Shock remain legible in multishot builds?
- Does brittle debris add opportunity or only projectiles?
- Can enemies use cold without creating unavoidable stuns?
- Should player Cryo Lock have reduced intensity or the same rules?

## 18.9 Acceptance

- Cryo Lock never zeroes translational velocity.
- Player and enemy control effects are clearly telegraphed.
- Thermal Shock is causally attributable.
- At least one non-thermal build remains viable.
- Arena fog never hides silhouettes or collision geometry.
- Heat/cold states survive deterministic replay.
- The boss can be beaten through thermal, physical, and direct strategies.

---

# 19. Arena 5: Storm Lattice

**Disposition:** fifth initial arena because it requires the most mature chain, material, tether, and target-graph infrastructure.  
**Primary law:** Electricity follows a physical network the player and enemies can reconfigure.  
**Primary proof:** conductivity graph, bounded chain traversal, movable nodes, status routing, and anti-recursion.

## 19.1 Fantasy

A power-distribution lattice around a damaged station core. Conductive pylons, cable fragments, ionized ships, and tethered objects define changing electrical paths.

The arena should look like a circuit diagram made from machinery and bodies.

## 19.2 Layout

- six primary pylons;
- central insulated reactor island;
- two movable relay nodes;
- conductive debris clusters;
- insulating cover;
- four spawn lanes;
- one outer repair loop;
- visible but restrained connection previews.

## 19.3 Conductivity graph

Nodes can include:

- authored pylons;
- ionized ships;
- inherently conductive props;
- Massline-linked eligible bodies;
- Relay Lance anchors;
- boss machinery.

Edges require:

- range;
- line-of-sight or authored cable;
- compatible conductivity;
- bounded neighbor count;
- deterministic ordering.

The graph should be constructed locally and lazily around an activation, not globally rebuilt every frame unless profiling proves that cheaper.

## 19.4 Act structure

### Waves 1–10: fixed network

- stable pylons;
- player learns to ionize a bridge target;
- enemy groups cross predictable paths;
- boss overloads one segment.

### Waves 11–20: movable network

- two pylons can be displaced;
- enemies destroy or capture nodes;
- insulating screens appear;
- Massline becomes a cable bridge.

### Waves 21–30: hostile network

- periodic arena arcs traverse the current graph;
- enemies can temporarily reverse ownership;
- the player must rewire while fighting;
- the final boss is itself a mobile network.

## 19.5 Favored build families

- Relay Arc.
- Ion Payload.
- Relay Lance.
- Massline Arc Welder.
- Gravity clustering.
- conductive debris.
- fork and chain.
- sensor/scramble control.
- orbit nodes that apply ion.
- precision builds that construct a path.

## 19.6 Counterpressure

- insulating enemies;
- node thieves;
- pylon destroyers;
- enemies that discharge accumulated ion back toward the player;
- snipers that punish stationary network construction;
- heavies that break line-of-sight;
- a specialist that clears Ionized from allies and stores the charge.

## 19.7 Wave-ten boss: Grid Tyrant

A mobile power platform with detachable relay drones.

Its systems:

- central capacitor;
- four relay drones;
- conductive armor segments;
- periodic network discharge;
- an insulated phase;
- support swarm that can become either ammunition or a hostile chain.

Ways to win:

- build a chain into exposed capacitor;
- isolate relay drones;
- tether a drone into an insulating wall;
- use gravity to cluster support enemies into a conductive bridge;
- direct-fire the capacitor during discharge windows.

## 19.8 Experiments

- How much graph preview is useful before it becomes UI spaghetti?
- Can the player understand why a chain selected a particular target?
- Should chain prefer unvisited targets, status targets, pylons, or high-value targets?
- How does Massline conductivity interact with multiple attachments?
- Can an enemy-owned network threaten without violating player-only ricochet/readability principles?
- What is the maximum local graph size?
- Can the same graph serve damage, status, repair, and objective transfer?

## 19.9 Acceptance

- deterministic graph traversal;
- bounded query and proc cost;
- player can intentionally create and break a route;
- chain presentation matches actual path;
- no hidden jump through invalid cover;
- insulating counterplay is visible;
- boss discharge remains readable under peak density;
- direct non-ion builds remain viable through pylon destruction and physical manipulation.

---

# 20. Future arena bank

These are **CONTENT BANK** candidates. Each should be admitted only after it demonstrates a distinct law not already covered.

| Arena | Primary law | Distinctive opportunity |
|---|---|---|
| **Kessler Mill** | Destruction increases bounded orbital debris density. | Build and then harvest a debris belt. |
| **Sunskate Array** | Solar flares create directional heat and light pressure. | Ride shadows and use heat as propulsion. |
| **Magnetar Yard** | Ferrous bodies align along changing magnetic axes. | Construct spears, shields, and moving lanes. |
| **Wreck Choir** | Dead hulls retain subsystem behavior and can be reactivated. | Fight through a programmable graveyard. |
| **Phase Quarry** | Some walls alternate between solid and permeable. | Time shots, throws, and escapes through phase windows. |
| **Pressure Cathedral** | Large bodies create local safe wakes in a hostile flow. | Use heavies as moving terrain. |
| **Glass Comet** | Brittle terrain continuously fractures under stress. | The arena’s geometry is a consumable resource. |
| **Black Ice Relay** | Low-friction surfaces preserve and redirect contact motion. | Body pinball and long sliding collisions. |
| **Salvage Furnace** | Debris can be fed into machinery for temporary upgrades or hazards. | Choose ammunition versus economy. |
| **Tether Garden** | Fixed anchor points create a network of slingshot routes. | High-skill movement and web combat. |
| **Redline Raceway** | Score and wave pressure rise with maintained physical speed. | Combat racing without becoming a separate vehicle game. |
| **Null Pocket** | Rigs and weapons alternate between suppressed and amplified zones. | Reposition the build’s active layer. |
| **Bioship Gut** | Living walls contract and react to heat, impact, and electricity. | Environment behaves like an enemy system. |
| **Cargo Avalanche** | Continuous freight flow crosses the arena. | Protect, steal, redirect, or weaponize neutral cargo. |
| **Patrol Crossfire** | Lawful and hostile factions fight while the player’s collateral matters. | Crucible law experiment feeding Adventure. |
| **Mirror Sea** | Mobile reflective fragments orbit a dark center. | Ricochet geometry is dynamic and destructible. |
| **Capstan Pit** | Multiple neutral hubs can capture bodies into networks. | Competing webs and constraint control. |
| **Event Horizon Drill** | A central sink consumes matter but emits timed impulse waves. | Sacrifice objects for room-scale consequences. |
| **Repair Dock Siege** | Machinery repairs whichever faction physically controls it. | Position, tow, disable, and capture over pure kills. |
| **Smuggler Maze** | Movable cargo containers define lanes and conceal hazards. | Build the arena while surviving it. |

## 20.1 Arena selection rule

Do not build an arena because its art is attractive. Build it because it tests a missing relationship.

## 20.2 Procedural recipe horizon

After five authored arenas are accepted, extract validated modules:

- boundary family;
- lane family;
- anchor family;
- moving machinery family;
- field family;
- prop family;
- spawn-gate family;
- boss-system socket;
- visual identity layer;
- soundscape;
- law and mutation.

A procedural or semi-procedural arena generator may then compose only validated modules under explicit constraints. It should produce authored-feeling recipes, not random rectangles.



# 21. Wave director and encounter composition

Crucible should not overload the living-universe encounter director. The campaign director is designed to make the world breathe: rare majors, paced minors, quiet after spending, and no overlapping combat shapes. Survival needs continuous authored pressure.

## 21.1 Ownership split

| Owner | Responsibility |
|---|---|
| **Survival run controller** | Run phase, wave number, objective, threat budget, draft/refit transitions, run XP, run credits, score, completion. |
| **Wave planner** | Pure deterministic conversion of arena, seed, wave index, act, and mutators into a wave recipe. |
| **Spawn-budget authority** | Grants bounded live slots. |
| **Canonical materializer** | Creates enemies through existing entity/ship/combat setup. |
| **AI owners** | Behavior and tactics. |
| **Physics/combat** | Movement, contact, damage, status, death. |
| **Arena controller** | Machinery, field phase, environmental objectives. |

The Survival run controller may request a package. It should not construct ship entities by hand.

## 21.2 Threat budget

A wave recipe should be based on authored threat costs rather than only enemy count.

Candidate cost dimensions:

```text
body pressure
+ mobility pressure
+ ranged pressure
+ area-denial pressure
+ control pressure
+ support pressure
+ arena leverage
+ coordination
+ durability
```

A Wasp Swarmer has low individual cost but high body-pressure value in groups. A Lancer Sniper has moderate cost because it changes positioning. A mine-layer costs more in Cinder Sluice than in an open arena because the current amplifies its denial.

The planner can use:

```js
effectiveCost = baseCost * arenaRoleMultiplier * mutatorMultiplier;
```

Multipliers must be authored and bounded, not derived from an opaque adaptive model in the first version.

## 21.3 Role slots

Every wave has a role envelope.

| Slot | Function |
|---|---|
| **Mass** | Disposable light bodies that make area and physical tools valuable. |
| **Pressure** | Direct attackers forcing movement. |
| **Control** | Mines, fields, tethers, screens, or terrain denial. |
| **Reach** | Snipers, missiles, beams, or artillery. |
| **Support** | Repair, shield, cleansing, relay, or command. |
| **Anchor** | Heavy moving terrain or objective body. |
| **Disruptor** | Counters the player’s dominant topology. |
| **Elite** | Named or enhanced unit with a clear special rule. |

Not every wave uses every slot.

## 21.4 Wave shapes

### Introduction

One new role or law interaction, low density, generous read.

### Flood

Many light bodies, low specialist count.

### Pincer

Two or more spawn directions with synchronized timing.

### Convoy

A moving anchor/support relationship.

### Siege

Ranged and area-denial enemies force the player to cross space.

### Knot

Dense formation inviting chain, field, or tether play.

### Shatter

Brittle or volatile props and fast attackers.

### Inversion

Arena law changes or enemies exploit it.

### Elite hunt

One elite plus a support ecology.

### Objective

Protect, tow, hold, disable, capture, feed machinery, or survive.

### Boss system

Room-changing authored event.

## 21.5 Ten-wave block template

A flexible first template:

| Wave | Function |
|---:|---|
| 1 | Reintroduce current arena state and basic mass. |
| 2 | Increase density; first draft usually occurs by here or soon after. |
| 3 | Introduce one specialist. |
| 4 | Multi-gate pressure. |
| 5 | Elite or objective wave. |
| 6 | Combine two known roles. |
| 7 | Arena mutation or counter-role. |
| 8 | High-density build payoff. |
| 9 | Attack the build’s likely weakness without hard-countering it. |
| 10 | Boss or major room-system event. |

The template is a pacing skeleton, not a mandatory identical sequence.

## 21.6 Spawn timing

Spawn packages should use:

- visible gates;
- minimum telegraph;
- bounded batches;
- role-aware spacing;
- no spawn directly inside immediate lethal geometry;
- deterministic timing;
- pressure responsive to live count only within authored limits.

A wave may queue 40 total light enemies while allowing only a bounded subset live at once.

## 21.7 Scaling

Difficulty should rise primarily through:

- more simultaneous light bodies;
- faster package overlap;
- additional spawn vectors;
- role combinations;
- arena exploitation;
- elites;
- objectives;
- reduced safe space;
- more demanding boss systems.

Scale health and damage slowly. Avoid exponential HP.

Recommended philosophy:

- lights die quickly to a good direct hit and instantly to a strong setup/payoff;
- mediums survive spray but fold to an intentional combination;
- heavies are physical problems and moving terrain;
- specialists are dangerous because of function;
- bosses are systems.

## 21.8 Build-sensitive pressure

The director may observe broad build topology:

- projectile count;
- direct versus area;
- chain;
- collision;
- field;
- tether;
- status;
- range;
- passive orbit share;
- heat dependency.

It may then choose from pre-authored fair pressure candidates. It must not secretly spawn immunity.

Example:

- a dominant orbit build sees more ranged reach and node disruptors;
- a railgun build sees pincer mass rather than an immune shield;
- a chain build sees insulating screens and spread formations;
- a collision build sees anchors and mines that complicate trajectories.

Build response should be delayed, bounded, and telegraphed. The player should feel tested, not cheated.

## 21.9 Objectives beyond kill-all

Candidate objectives:

- survive a timed surge;
- keep a machine intact;
- tow a core to a socket;
- disable rather than destroy a target;
- capture an elite;
- maintain control of two pylons;
- feed debris into a furnace;
- prevent volatile cargo from reaching a gate;
- ride inside a safe wake;
- destroy support systems before the anchor;
- collect a high-risk resource quota;
- escape a collapsing arena phase.

Objective waves are essential because they reveal whether the build can do more than maximize DPS.

---

# 22. Enemy ecology

## 22.1 Reuse before expansion

The existing roster already supplies a strong first palette:

- Wasp Swarmer;
- Lancer Sniper;
- Bruiser Brawler;
- Reaver Pirate;
- Corsair Raider;
- mine-layer and other variety roles;
- phased capital boss;
- lawful and civilian actors for later experiments.

The first ten-wave shell should reuse these roles before creating a new fleet.

## 22.2 Simulation classes

### Fodder

Purpose:

- density;
- physical ammunition;
- chain targets;
- reward flow;
- readable movement patterns.

Implementation:

- cheap shared perception where possible;
- one or two maneuvers;
- squad-level target solution;
- local separation;
- low subsystem complexity;
- bounded VFX.

### Specialists

Purpose:

- alter the player’s decision;
- exploit arena geometry;
- support or disrupt groups.

Implementation:

- full tactical AI where justified;
- authored abilities;
- strong telegraph;
- clear silhouette;
- moderate count.

### Elites

Purpose:

- mini-build checks;
- named pressure;
- reward spikes.

Implementation:

- one additional rule;
- not just doubled health;
- clear causal reward;
- bounded support package.

### Bosses

Purpose:

- change the room and test accumulated mastery.

Implementation:

- system graph;
- phase transitions;
- arena integration;
- full causal receipts.

## 22.3 Mass bands

Enemy physical identity should use mass bands.

| Band | Role |
|---|---|
| **Dust/light** | Easily displaced, chained, clustered, and thrown. |
| **Fighter** | Resists casual force but responds to committed tools. |
| **Medium** | Requires setup, status, leverage, or strong impulse. |
| **Heavy** | Moving terrain; displacement is a build achievement. |
| **Capital** | Only subsystems, external structures, fields, and exceptional setups move meaningfully. |

Mass response should be visible. A heavy target may show field strain, line load, and partial motion rather than a hidden “immune” label.

## 22.4 Candidate new roles

### Rammer

Telegraphs a committed charge. Can be redirected into enemies, props, or machinery.

### Orbit Skirmisher

Maintains a rotating lane around the player or arena core, challenging static fields.

### Shield Tender

Projects a directional or linked shield onto allies. The tender is physically vulnerable.

### Cleanser

Removes Ionized, Burning, or Cryo from nearby allies and stores a bounded countercharge.

### Anchor Barge

Very heavy support body that stabilizes nearby light ships against fields.

### Field Thief

Captures or inverts an unprotected deployed field for a short duration.

### Tether Cutter

Attacks active Masslines or Snarl hubs with a clear wind-up.

### Insulator

Deploys non-conductive cover that breaks chains and bank corridors.

### Scrapper

Consumes debris to repair or create projectiles, contesting the player’s debris economy.

### Seeder

Plants mines, volatile bodies, or field nodes into predicted movement lanes.

### Harpooner

Tethers the player or props, creating an escape problem rather than direct damage.

### Splitter

Breaks into smaller bodies on death; children inherit momentum but not every ability.

### Reactor Drone

Low direct threat, high volatile potential. Both sides can exploit it.

### Mimic Rig

Temporarily copies one visible field or orbit behavior at reduced strength.

### Collector

Steals Arena Credit pickups and becomes more valuable if destroyed.

### Phase Skater

Uses timed permeable walls, teaching the arena’s phase law.

### Repair Tug

Physically docks with an ally to repair it and can be separated by impulse or tether.

### Relay Drone

Extends conductivity and sensor networks.

### Fogger

Creates a bounded visibility/material effect without hiding collision or threat silhouettes.

### Counterweight

Attaches to a light group and increases its effective mass until separated.

## 22.5 Enemy modifier grammar

Later, elites can use a restricted modifier grammar:

- reflective armor;
- volatile core;
- conductive hull;
- gravity-resistant anchor;
- cryogenic wake;
- forked missile;
- repair link;
- tether cutter;
- orbiting screen.

Do not grant enemies the full player modifier pool. Their behavior must remain readable at a glance.

## 22.6 Counterplay rule

Every specialist definition needs:

- telegraph;
- distinctive silhouette or emission;
- threat;
- arena interaction;
- physical counterplay;
- direct fallback counterplay;
- reward;
- maximum simultaneous count.

## 22.7 Friendly collision and collateral

Enemy-on-enemy collision and player-caused collateral are central.

Rules should clarify:

- who owns a kill when one enemy hits another;
- whether enemy projectiles can damage enemies;
- whether boss machinery harms support units;
- how style and XP attribute indirect causality;
- whether enemies avoid their own hazards;
- how Adventure law later treats collateral.

Default Crucible recommendation:

- physical collision and authored environmental hazards affect enemies;
- ordinary enemy projectiles use limited or no friendly damage unless the role requires it;
- player-caused redirection owns the resulting causal credit within a bounded window.

---

# 23. Boss design

## 23.1 Bosses are arena systems

A boss should have:

- a body;
- a relationship to the arena law;
- external systems;
- visible state transitions;
- movement commitment;
- support ecology;
- multiple solution paths;
- a physical climax.

The hull-health bar may exist in the target panel. It is not the fight’s main language.

## 23.2 Boss system graph

Example:

```text
boss core
├── propulsion system
├── field system
├── weapon system
├── support-spawn system
└── arena-control system
```

Destroying or disabling a system changes behavior.

The player may choose:

- fastest core kill;
- safe system dismantling;
- physical arena kill;
- capture/disable;
- score-optimal style sequence.

## 23.3 Phase transitions

Phase changes should arise from:

- subsystem loss;
- arena machinery state;
- external object position;
- support network loss;
- accumulated status;
- timer or objective;
- bounded hull thresholds where appropriate.

Avoid a phase that simply makes the boss invulnerable until adds die unless the physical relationship is explicit.

## 23.4 Boss adaptation

A boss can pressure a build without immunity.

Examples:

- rotate reflective armor to make bank timing harder;
- break a conductivity graph;
- shed hot armor to clear Cryo;
- deploy an anchor against repulsion;
- change arena current;
- move spawn gates;
- consume debris;
- attack orbit nodes;
- force a Massline choice.

## 23.5 Boss content bank

| Boss | Arena/law | Physical identity |
|---|---|---|
| **Mirrorjaw Foreman** | Ricochet | Reflective ram, movable plates, vulnerable rear. |
| **Tidal Engine Carrier** | Gravity | External vanes move the field center. |
| **Chain Tug** | Current | Hazardous ballast train becomes weapon. |
| **Manifold Warden** | Thermal | Rotating exhaust and coolant systems. |
| **Grid Tyrant** | Conductivity | Mobile relay network and capacitor core. |
| **Kessler Crown** | Debris | Builds an orbiting armor belt from wreckage. |
| **Magnet King** | Ferrous alignment | Reorients the arena’s metal axis. |
| **The Capstan Saint** | Constraint | Winds swarms and props into moving armor. |
| **Phase Miller** | Permeability | Moves through walls and changes which surfaces exist. |
| **Furnace Whale** | Salvage | Eats debris, vents molten payload, can choke. |
| **Patrol Arbiter** | Law/collateral | Changes objectives based on player-caused damage. |
| **Black-Ice Ram** | Low friction | Commits to long sliding trajectories. |
| **Null Choir** | Suppression zones | Turns systems off in rotating sectors. |
| **Repair Cathedral** | Control point | Rebuilds itself through physical docking arms. |
| **Event-Horizon Drill** | Sink/pulse | Consumes bodies and emits momentum waves. |

## 23.6 Boss acceptance

A boss is accepted when:

- its dangerous states are readable without memorizing a script;
- at least three build families can win;
- one physical solution is clearly viable;
- direct damage remains a slower fallback;
- phase changes preserve causality;
- support spawns respect budget;
- the boss cannot leave the playable arena;
- the boss remains deterministic;
- the death sequence reflects actual cause and motion;
- replay and build code reproduce the fight.

---

# 24. Scoring, style, rewards, and causal truth

## 24.1 Why raw kill score is wrong

A score based mostly on kill count and time trains the player to maximize ordinary DPS. That would pull Crucible back toward the generic shooter it exists to escape.

Score should value:

- physical causality;
- build expression;
- risk;
- efficiency;
- objective play;
- causal variety;
- mastery of the arena law.

## 24.2 Causal tags

Candidate tags:

```text
DIRECT
BANK
CHAIN
PIERCE
SPLIT
RETURN
ORBIT
FIELD
MASSLINE
SLING
COLLISION
TERRAIN
DEBRIS
STATUS
REACTION
SUBSYSTEM
CAPTURE
MULTIKILL
BOSS_SYSTEM
ARENA_OBJECTIVE
HIGH_SPEED
NEAR_MISS
RESOURCE_RISK
```

A kill may carry several tags derived from immutable receipts.

Example:

```text
BANK + ION + CHAIN + TERRAIN
```

## 24.3 Causal window

Indirect credit needs a bounded window and lineage.

Example:

- player applies impulse to enemy A;
- enemy A collides with enemy B within the causal window;
- B is killed by contact;
- player owns the collision kill;
- if A is later pushed by an arena current with no retained player influence, ownership may decay.

Use actual receipts and influence records, not heuristics based only on last damage.

## 24.4 Style multiplier

A provisional model:

```text
eventScore =
  baseValue
  × executionFactor
  × causalVarietyFactor
  × riskFactor
  × objectiveFactor
```

Where:

- repeating the same simple cause gradually reduces variety contribution;
- chaining distinct causes increases it;
- taking risk without consequence should not be farmable;
- objective completion has a stable floor;
- direct kills remain valid and never score zero.

## 24.5 Style sequences

Named style sequences may appear briefly:

- **BANK JOB** — bank kill.
- **RETURN TO SENDER** — enemy killed by redirected body or hazard.
- **SLINGSHOT** — Massline release kill.
- **HARD WIRING** — conductive chain through a moved node.
- **THERMAL SHOCK** — cryo/heat reaction kill.
- **ROOM SERVICE** — arena machinery kill.
- **FAMILY TREE** — one lineage kills through multiple propagation types.
- **ORBIT BREAKER** — released orbit node kill.
- **COLLATERAL GENIUS** — multi-enemy collision chain.
- **BAD IDEA, GREAT RESULT** — high self-risk physical sequence.

Text should be sparse and subordinate to the event.

## 24.6 Reward relationship

Score and economy should overlap but not be identical.

- XP rewards learning and build cadence.
- Arena Credits reward economic growth.
- Score rewards mastery and comparison.
- Unlock progress rewards completion and challenge.
- Style can modestly affect XP/credits but should not force theatrical play every second.

## 24.7 Results analysis

The results screen should show a causal distribution:

```text
Direct weapon kills        31%
Bank / return kills        18%
Collision / terrain kills  24%
Field / tether kills       15%
Status / reaction kills    12%
```

This tells the player what build they actually made.

## 24.8 Anti-farming

Prevent score exploits through:

- diminishing repeated trivial causes;
- no score for spawned descendants beyond authored ownership rules;
- objective and threat eligibility;
- no repeated score from immortal targets;
- per-event dedupe;
- no pickup-drop loops;
- capped score from arena machinery farming;
- deterministic validation of score receipts.

## 24.9 Leaderboards

Leaderboards are **FAR FUTURE** until:

- seeds are deterministic;
- build codes are validated;
- run integrity is signed or locally verifiable;
- exploit surfaces are understood;
- versioning separates balance patches;
- accessibility settings are fairly categorized where required.

Local personal records and seed history can arrive earlier.

---

# 25. Combat Lab

Combat Lab is the shortest path to understanding the deeper game and the highest-leverage first deliverable.

## 25.0 Audited foothold

At the 2026-08-21 source audit, the existing Sandbox already provides:

- a real-New-Game setup path;
- canonical economy, ship, faction, world, and spawn writers;
- `physics_swarm` with ten light enemies, two medium enemies, and three collision anchors;
- `visual_stress_scene` with a larger mixed cast;
- a `physics_toolkit` loadout containing Concussion, Gravity Marker, and Momentum Sink;
- deterministic seed support;
- a human enemy-count override currently clamped at twenty.

These are footholds, not acceptance of Crucible. The first Combat Lab packet should evolve them rather than rebuild them.

## 25.1 Build on the existing Sandbox

The current Sandbox already:

- launches through the real New Game pipeline;
- applies changes through canonical writers;
- exposes full arsenal and free-play setups;
- includes a physics-swarm preset;
- includes Ceres and visual-stress scenarios;
- supports deterministic seeds and authored physics loadouts.

Combat Lab should extend this surface with a purpose-built combat configuration, not replace it.

Possible UI structure:

```text
Sandbox
├── Quick Presets
├── Combat Lab
├── World / Economy Lab
└── Validation Scenarios
```

The label can be decided during frontend work. The architectural principle is fixed.

## 25.2 Human feel controls

Combat Lab should expose:

- hull;
- fitting;
- root weapons;
- Rigs;
- run modifiers;
- modifier rank;
- arena;
- arena act and phase;
- starting wave;
- enemy package;
- live enemy count;
- total queued enemies;
- boss;
- seed;
- camera candidate;
- difficulty mutators.

## 25.3 Runtime toggles

Candidate toggles:

- invulnerable player;
- infinite capacitor;
- no heat;
- no cooldown;
- infinite ammunition;
- freeze enemy AI;
- freeze all physics;
- pause;
- single fixed-step;
- 0.25×, 0.5×, 1×, 2× simulation;
- clear projectiles;
- clear enemies;
- refill;
- kill selected target;
- apply selected status;
- attach/detach Massline;
- reset arena;
- restart same seed;
- restart from checkpoint.

Toggles must route through explicit Lab-owned or canonical debug seams. Do not scatter raw state writes through UI.

## 25.4 Inspection

Entity inspection should show:

- stable ID;
- type and role;
- position, velocity, angular velocity;
- mass and effective mass;
- health layers;
- subsystems;
- statuses and remaining ticks;
- active attachments;
- field coupling;
- current AI intent;
- spawn-budget owner;
- last damage and last causal influence;
- current target.

Attack inspection should show:

- root weapon;
- compiled spec digest;
- lineage;
- generation;
- remaining bounce/chain/pierce/split;
- proc budget;
- visited targets;
- suppressed procs;
- contact history.

## 25.5 Event trace

A bounded trace should display or export:

- wave phase;
- attack fire;
- surface contact;
- entity contact;
- status applied;
- status reaction;
- impulse request;
- collision consequence;
- kill;
- pickup spawn/collect;
- score;
- XP;
- credits;
- boss transition.

Trace filters prevent flood.

## 25.6 Build codes

A build code should encode or reference:

- schema version;
- game version or content digest;
- arena;
- seed;
- ruleset;
- hull;
- fittings;
- modifiers and ranks;
- wave;
- mutators;
- relevant Lab toggles.

Example human-readable form:

```text
SFCR1-FOUND-6F2A-WASP-PULSE2-BANK2-ION1-CHAIN1-W20
```

The actual code may use a compact signed payload. Always provide a readable summary.

## 25.7 Reproduction flow

From a results screen or failure:

1. Copy build code.
2. Open Combat Lab.
3. Paste code.
4. Select exact wave or checkpoint.
5. Launch.
6. Run same seed/input trace or manual play.
7. Compare telemetry.
8. export a deterministic scenario candidate.

## 25.8 Deterministic gameplay lab integration

The headless lab should cover:

- attack compiler;
- modifier compatibility;
- lineages;
- bounce;
- chain selection;
- split inheritance;
- status reactions;
- wave planning;
- score attribution;
- run transitions;
- save/suspend where implemented;
- Node/Chromium parity.

Human Combat Lab and deterministic lab share schemas and scenario data where practical. They do not share evidence class automatically. A headless pass does not prove visual fun.

## 25.9 Telemetry overlay

At minimum:

- simulation tick rate;
- frame time;
- physics time;
- AI time;
- weapon/combat time;
- render time;
- active entities;
- active hostile ships;
- active projectiles;
- active descendants by generation;
- active fields;
- active orbit nodes;
- spatial queries;
- contacts;
- VFX admissions and drops;
- proc suppressions;
- spawn-budget current/max.

## 25.10 Combat Lab acceptance

Combat Lab is accepted when it can:

- reproduce one same-seed combat failure;
- create a legal full loadout through canonical owners;
- apply and remove modifiers without restarting the app;
- launch the same gameplay path as Survival;
- export a build code;
- show attack lineage;
- restart quickly;
- run a physics-swarm scenario at the accepted density;
- avoid campaign save contamination;
- match Browser and Electron behavior where claimed.

---

# 26. Interface, readability, camera, audio, and accessibility

## 26.1 HUD principle

Survival adds pressure, but the HUD should not become a dashboard pasted over the flight view.

Persistent additions should be minimal:

- wave and phase;
- run level and XP;
- Arena Credits;
- score/style state;
- boss-system state when relevant;
- compact modifier access;
- arena law status.

Existing flight instruments remain authoritative for ship state.

## 26.2 Wave presentation

At wave start:

```text
WAVE 7
MINE-LAYERS + SWARM
CURRENT: EAST
```

Then the transient clears. Do not leave a large banner covering spawn telegraphs.

## 26.3 Draft UI

Draft cards must show:

- modifier name;
- functional tier;
- compatible root;
- exact effect;
- rank;
- cap/cost;
- prerequisite or exclusion;
- a tiny trajectory/relationship diagram where useful.

A card should not need a paragraph of lore to explain mechanics.

Keyboard, mouse, and controller navigation must all work if supported by the project. No hover-only information.

## 26.4 Refit UI

The refit screen should compare:

- installed versus offered component;
- mass;
- handling change;
- heat/capacitor;
- slot fit;
- attack topology;
- active modifier compatibility;
- suspended traits;
- sell value;
- repair cost.

Existing fitting-feel panels should be reused where current and valid.

## 26.5 World readability

Every major state needs a world read:

| State | World read |
|---|---|
| Gravity Marked | contracting/warped marker bound to hull. |
| Pinned | compressed field, strained movement, dense wake. |
| Unmoored | lifted/light wake, exaggerated force response. |
| Ionized | controlled electrical crawling, not full-screen lightning. |
| Burning | persistent localized fire/venting. |
| Cryo Lock | frost, vent plume, reduced attitude response. |
| Tumbling | actual uncontrolled rotation and trail behavior. |
| Primed | stored-energy pulse tied to body. |
| Breached | directional venting and exposed damage. |
| Snarled | visible constraint network and hub strain. |

## 26.6 Attack-path readability

- root shots have the clearest identity;
- descendants preserve family color/shape but reduce visual dominance by generation;
- bounce contact is directional;
- chain path exactly matches selected targets;
- split event shows parent-to-child relation;
- suppressed procs do not fake an effect;
- orbit nodes have stable phase and readable release;
- field boundaries use motion and particles, not only translucent discs.

## 26.7 Causal priority

Under saturation:

1. player-caused current hero event survives;
2. immediate threats survive;
3. boss-system cues survive;
4. relevant pickups survive;
5. distant ambient effects degrade;
6. repeated low-value impacts degrade;
7. cosmetic debris degrades before gameplay objects.

This should reuse the project’s causal-priority and pooled VFX work.

## 26.8 Camera

The camera must:

- preserve player choice and shipped framing rules;
- keep the player, immediate threats, and meaningful geometry visible;
- respond to physics-earned speed without taking control;
- avoid repeated zoom pumping from wave events;
- provide bounded boss framing only when it does not steal play;
- respect reduced motion;
- keep offscreen threats represented through existing radar/edge language.

Arena geometry should be designed for the camera, not repaired by constant dynamic zoom.

## 26.9 Hit stop and slow motion

Use sparingly:

- major shield break;
- catastrophic player-caused collision;
- boss-system destruction;
- final boss kill;
- draft pause;
- optional flyby or focus systems already under authority.

Do not apply hit stop to every chain kill in a swarm. It will turn one second of combat into ten seconds of interruption.

## 26.10 Audio grammar

Audio should communicate:

- mass;
- direction;
- material;
- field type;
- line load;
- status reaction;
- wave state;
- boss machinery;
- pickup convergence;
- build evolution.

Examples:

- reflective plate: sharp directional metallic crack;
- absorbent block: dead thud;
- heavy collision: low-frequency mass exchange;
- Cryo Lock: brittle damping and vent hiss;
- Thermal Shock: vapor snap plus impulse body;
- ion chain: sequential spatial ticks matching path;
- Massline tension: rising harmonic tied to actual load;
- field inversion: pre-event charge, then directional release.

Limit simultaneous voices through priority and family cooldowns.

## 26.11 Accessibility

Required considerations:

- reduced motion suppresses or bounds camera punch, time dilation, and rapid zoom;
- reduced flash controls chain, explosion, and field pulses;
- color is never the only status or arena-law signal;
- high-contrast silhouettes survive bloom;
- subtitles or text equivalents exist for critical audio telegraphs;
- control remapping reaches every Survival action;
- no precision hover requirement;
- draft and refit remain usable at high UI scale;
- pause is available in single-player;
- visual clutter settings degrade cosmetics, not gameplay truth;
- aim assistance, if offered, is explicit and separately tunable;
- same gameplay rules remain unless a categorized assist intentionally changes them.

---

# 27. Technical architecture

## 27.1 Preserve flight mode

**CORE:** Do not represent Survival by replacing the top-level gameplay mode with a value that causes flight systems to stop updating.

Keep:

```js
state.mode = 'flight';
```

Add an orthogonal run envelope:

```js
state.run.kind = 'survival';
```

Many systems already gate on flight. An orthogonal record minimizes special cases.

## 27.2 Fresh ephemeral state

A Survival run should start from a fresh game state through the real boot/New Game path.

Do not:

- mutate the player’s live Adventure state;
- snapshot the campaign, run Survival in place, then attempt a giant restore;
- share campaign credits;
- share campaign inventory by reference;
- leave Survival entities in the Adventure world;
- write temporary modifiers into persistent fittings;
- use an alternate physics or combat registry.

The safest boundary is a separate ephemeral game session using the same runtime.

## 27.3 Run state

Proposed shape:

```js
state.run = {
  schemaVersion: 1,
  kind: 'survival',
  ruleset: 'scored',
  seed: 0,
  arenaId: 'arena_ricochet_foundry',

  phase: 'loadout',
  wave: 0,
  block: 0,
  act: 0,

  wavePlanId: null,
  threatBudget: 0,
  spawnedThreat: 0,
  resolvedThreat: 0,

  credits: 100,
  xp: 0,
  level: 1,
  score: 0,
  style: {
    multiplier: 1,
    recentCauses: []
  },

  modifiers: [],
  draftHistory: [],
  shopHistory: [],
  arenaMutators: [],

  buildCode: null,
  result: null,
  telemetry: {}
};
```

The exact schema belongs to an admitted packet and save decision.

## 27.4 Run phases

```text
inactive
→ loadout
→ arena_intro
→ wave_intro
→ active
→ cleanup
→ draft
→ wave_intro
→ ...
→ refit
→ ...
→ victory | ended
```

Transitions should be explicit, validated, and deterministic.

No UI should infer phase from whether enemies happen to exist.

## 27.5 Proposed owner

A new `survivalRun` system may own:

- `state.run`;
- phase transitions;
- wave index;
- run XP;
- Arena Credits;
- score;
- draft request/resolution;
- refit request/resolution;
- run result.

It must not own:

- campaign credits;
- entity construction;
- ship movement;
- projectile movement;
- damage;
- statuses;
- fitting mutation outside canonical ship APIs;
- arena machinery owned elsewhere;
- UI state outside narrow requests/receipts.

## 27.6 Pure wave planner

A pure module should take:

```js
planWave({
  seed,
  arenaId,
  wave,
  act,
  difficulty,
  mutators,
  buildSummary
})
```

and return:

```js
{
  id,
  objective,
  packages,
  schedule,
  arenaPhase,
  rewards,
  draftExpectation,
  completionRules
}
```

The planner returns intent. Runtime owners materialize it.

## 27.7 Data surfaces

Provisional files:

```text
src/data/survivalArenas.js
src/data/survivalWaves.js
src/data/runModifiers.js
src/data/attackTraits.js
src/data/runShops.js
src/data/runUnlocks.js
```

Re-audit naming and data ownership before creation. Do not create all files for the first slice if one focused data module is enough.

## 27.8 Combat modules

Provisional seams:

```text
src/combat/attackCompiler.js
src/combat/attackLineage.js
src/combat/attackPropagation.js
src/combat/attackTargeting.js
```

The goal is not a parallel combat kernel. These modules should extend canonical firing/contact/status/death owners through narrow data and receipt seams.

## 27.9 Events and intents

Candidate event vocabulary:

```text
run:requested
run:started
run:phaseChanged
run:wavePlanned
run:waveStarted
run:waveCleared
run:xpGranted
run:levelReady
run:draftOffered
run:modifierChosen
run:creditsGranted
run:refitOpened
run:refitClosed
run:bossPhase
run:ended
run:resultReady
```

Use events only where ownership and decoupling require them. Do not create event echo chains for local pure logic.

## 27.10 Fitting

Crucible should use canonical ship grant/fit APIs.

Temporary run traits are not ordinary fitted modules. The attack compiler reads both:

- canonical fitted equipment;
- run modifier stack.

Refit changes use the ship owner. Arena Credits authorize the run purchase but do not directly mutate fittings.

A transaction could be:

1. UI emits `run:purchaseRequested`.
2. run owner validates Arena Credits and offer.
3. run owner calls or requests canonical grant/fit.
4. ship owner returns success/failure.
5. run owner charges Arena Credits only on success.
6. attack compiler invalidates affected spec.
7. UI receives receipt.

## 27.11 Arena ownership

Arena systems own:

- machinery state;
- field phase;
- prop reset policy;
- boss-linked environment;
- objective sockets;
- arena-specific receipts.

They do not own generic damage, physics, or scoring.

## 27.12 Save and suspend

### First release

- no mid-run persistence required;
- leaving the run ends it;
- result history may store compact records;
- settings persist normally;
- Adventure save remains untouched.

### Later suspend

A suspend system may serialize:

- run schema/version;
- seed;
- wave and phase;
- player ship/fittings;
- modifiers;
- run economy;
- arena durable state;
- live eligible entities or a deterministic checkpoint;
- RNG state;
- attack lineages that must persist.

Suspension should be added only after deterministic replay and save/continue semantics are proven. A long run justifies suspend; a fragile partial save does not.

## 27.13 One game path

Browser, Electron, Sandbox, Crucible, and validation should share:

- gameplay registry;
- input;
- data;
- physics;
- combat;
- rendering;
- settings;
- assets.

Wrappers may select setup and rules. They may not fork gameplay.

---

# 28. Performance and scale

## 28.1 Current boundary

At the 2026-08-21 source audit, the current spawn-budget authority uses `DEFAULT_MAX = 24` and `HARD_MAX = 40`. The default includes ambient reservations, so the immediately available hostile envelope is smaller than the raw maximum. Existing Sandbox swarm presets provide a useful lower baseline. Re-audit these values before implementation.

The first slice should not bypass the cap. It should prove a fun mode inside current authority, then admit measured performance work.

## 28.2 Scale ladder

A provisional ladder:

| Tier | Live hostiles | Purpose |
|---|---:|---|
| **S0** | 8–12 | Existing physics-swarm baseline and feature correctness. |
| **S1** | 16–20 | First playable ten-wave shell. |
| **S2** | 24 | Current default-budget neighborhood with controlled ambient removal. |
| **S3** | 32–40 | Hard-ceiling stress after targeted optimization. |
| **S4** | 50–80 apparent | FAR FUTURE; requires lightweight actors, batching, or clustered simulation rather than naive full ships. |

The exact accepted numbers depend on target hardware and current budget evidence.

## 28.3 Performance budgets by family

Every modifier and weapon needs cost declarations:

- maximum active roots;
- maximum descendants;
- maximum generation;
- maximum bounces;
- maximum chain candidates;
- maximum orbit nodes;
- maximum fields;
- maximum persistent debris;
- query radius;
- query cadence;
- VFX emissions;
- audio voice family.

## 28.4 AI scaling

Use tiered cognition.

### Fodder

- shared target frame;
- squad-level intent;
- cheap steering;
- local separation;
- simple attack cadence;
- no expensive global query per ship.

### Specialists

- full tactical perception at bounded cadence;
- authored role logic;
- more precise obstacle and arena awareness.

### Bosses

- full behavior and system logic;
- few in number;
- explicit performance budget.

## 28.5 Spatial queries

Avoid cost cliffs:

- use spatial hash at swarm-relevant counts;
- batch shared supersets;
- query only bounded neighborhoods;
- avoid rebuilding conductivity graphs globally;
- use stable scratch buffers;
- profile query count and candidate count;
- expose thresholds in telemetry;
- verify that the “optimization threshold” does not leave the actual target count in an O(N²) dead zone.

## 28.6 Pooling and batching

Priorities:

- projectile pools;
- pickup pools;
- impact VFX pools;
- debris pools;
- instanced repeated swarm hulls where visual identity permits;
- instanced orbit nodes;
- batched trails;
- bounded audio sources;
- reuse of field visualization geometry;
- no per-entity DOM.

## 28.7 Gameplay versus cosmetic degradation

When overloaded, degrade in this order:

1. distant repeated cosmetic particles;
2. low-priority trails;
3. minor debris visuals;
4. ambient audio;
5. distant repeated impact cues;
6. lower-frequency cosmetic updates.

Never silently drop:

- gameplay projectiles;
- status applications;
- collision contacts;
- boss telegraphs;
- arena hazards;
- player-relevant pickups;
- score/XP receipts;
- input.

If a gameplay cap suppresses a proc, the rule is deterministic and part of the build.

## 28.8 Projectile aggregation horizon

For apparent densities above the full-projectile budget, later systems may represent a group as:

- a deterministic packet cloud;
- a ribbon volume;
- an instanced ballistic family;
- a shared broadphase object with individual hit slots.

This is **FAR FUTURE** and must preserve collision truth. Do not preemptively replace honest projectiles with visual theater.

## 28.9 Orbitals

Start with field nodes rather than colliding constrained bodies.

Field-node rules:

- fixed maximum count;
- deterministic phase;
- one bounded spatial query per cadence;
- per-target cooldown;
- no node-node collision;
- no independent AI;
- pooled render instances.

Physical orbitals can be a later weapon family after the cheap version proves fun.

## 28.10 Debris

Debris is gameplay only while it has meaningful mass, material, and interaction.

Use tiers:

- gameplay debris: bounded, physical, queryable;
- presentation debris: pooled, non-gameplay, short-lived;
- residue: static or cheap persistent mark.

Causal receipts must distinguish them.

## 28.11 Performance acceptance

A performance packet should record:

- exact candidate digest;
- hardware/profile;
- arena/seed/wave/build;
- live body counts;
- active projectile/field/node counts;
- simulation and render frame distributions;
- query counts;
- contacts;
- allocation and GC behavior;
- VFX admission/drop counts;
- visual equivalence.

Do not pass by lowering default quality or removing authored action.

---

# 29. Telemetry, playtesting, and experiment design

Crucible exists to accelerate learning. Every major design claim should be phrased so evidence can disprove it.

## 29.1 Core telemetry

### Run

- start/end;
- arena;
- seed;
- duration;
- wave reached;
- result;
- hull;
- build code;
- modifier history;
- refit purchases;
- repairs;
- rerolls;
- purges.

### Combat

- root shots;
- child attacks by generation;
- hits;
- bounces;
- chains;
- splits;
- pierces;
- returns;
- orbit contacts;
- field interactions;
- Massline attachments/releases;
- status applications;
- reactions;
- collision consequences;
- suppressed procs.

### Outcomes

- damage by root;
- damage by trigger;
- kills by root;
- kills by cause;
- TTK by enemy role;
- player damage source;
- deaths;
- boss systems destroyed;
- objectives.

### Economy

- credits spawned;
- collected during active wave;
- swept after wave;
- missed;
- spent by category;
- XP sources;
- draft timing;
- unused offers.

### Performance

- peak and percentile entity/projectile/field counts;
- system times;
- frame times;
- spatial queries;
- contacts;
- allocations;
- VFX admission;
- audio voices.

## 29.2 Build identity metrics

A build has identity when:

- one or two causal families dominate;
- at least one bridge connects systems;
- the player can describe it;
- its behavior changes across arenas;
- it has a visible weakness;
- its power does not come only from scalar damage.

Possible measures:

- entropy of kill causes;
- share of damage from descendants;
- share of kills involving arena or physics;
- unique trigger families used;
- active decision frequency;
- root weapon concentration;
- modifier utilization rate;
- dead modifier rate.

Metrics diagnose. They do not automatically decide fun.

## 29.3 First hypotheses

### H1 — Early identity

By wave 4, most runs should have a recognizable build direction.

Disproof:

- players cannot describe their build;
- modifier choices remain scalar;
- root weapon feels unchanged;
- first meaningful synergy arrives after wave 10.

### H2 — Arena law participation

The primary arena law should contribute to a meaningful portion of combat decisions without becoming mandatory.

Disproof:

- optimal play ignores it;
- every viable build must exploit it in one exact way;
- players cannot identify it;
- it causes mostly accidental deaths.

### H3 — Physical causality

A substantial share of memorable kills should involve collision, terrain, tether, field, status reaction, or multi-stage propagation.

Disproof:

- direct DPS accounts for nearly all successful play;
- physical kills are rare accidents;
- players cannot reproduce a physical kill;
- score incentives create contrived low-efficiency behavior.

### H4 — Active orbitals

Orbit and field builds should require positioning, timing, release, or target selection.

Disproof:

- the player can survive by circling without aiming;
- orbit nodes solve every swarm shape;
- node count is the only meaningful upgrade;
- visual density hides other attacks.

### H5 — Ten-wave refit value

Refits should let players respond to a weakness without erasing build commitment.

Disproof:

- the correct choice is always full repair;
- selling and swapping are never useful;
- players can freely pivot into the strongest meta build;
- invalid modifiers create confusion.

### H6 — Lab fidelity

A Combat Lab reproduction should predict shipping Survival behavior.

Disproof:

- Lab toggles alter update order;
- setup bypasses canonical writers;
- same seed/build differs;
- debug-only limits hide performance failures.

## 29.4 Quantitative starting targets

These are tuning hypotheses, not release law.

- first hostile contact within roughly 10–20 seconds after launch;
- first draft within roughly 60–120 seconds;
- three to four drafts per ten-wave block;
- ordinary wave duration roughly 35–75 seconds;
- cleanup usually under 5 seconds;
- ten-wave block roughly 8–14 minutes;
- authored thirty-wave run roughly 25–45 minutes;
- no single ordinary enemy requires prolonged starter-fire attrition;
- most deaths have an explainable last-event chain;
- low dead-choice rate in drafts;
- measurable use of more than one causal family in successful runs.

## 29.5 Playtest questions

After a run, ask:

1. What was your build?
2. When did it become that build?
3. What was the strongest interaction?
4. What was its weakness?
5. What did the arena make you do differently?
6. Which death or near-death felt fair?
7. Which event was unreadable?
8. Which modifier never mattered?
9. Did you aim and pilot actively?
10. What would you try on the same seed?
11. Which mechanic belongs in Adventure?
12. What felt generic?

These answers are more valuable than a generic 1–10 fun score.

## 29.6 A/B experiments

Candidate controlled comparisons:

- three-choice random draft versus deterministic shop draft;
- player-only ricochet versus limited enemy ricochet;
- auto-sweep pickups versus manual full collection;
- complete pause during draft versus 10% slow time;
- one refit every 10 waves versus smaller refits every 5;
- direct arena-law tutorial versus discovery through first wave;
- Smart Bank aim assistance strengths;
- orbit field nodes versus physical colliding nodes;
- build-sensitive director on versus off;
- style multiplier visible versus mostly hidden;
- health scaling versus composition scaling.

Run one variable at a time where possible.

## 29.7 Rejection ledger

Every rejected mechanic should record:

- version;
- hypothesis;
- implementation;
- test context;
- observed failure;
- whether the idea is rejected or only the implementation;
- what evidence would justify revisiting it.

This prevents agents from repeatedly rediscovering the same bad answer.



# 30. Beginning-to-end implementation roadmap

This roadmap is ordered to maximize learning and minimize architectural duplication. Each phase still requires admission as one or more bounded program packets.

## Phase 0 — Assimilation, deduplication, and seam audit

### Outcome

The proposal is registered as durable direction, current overlapping work is mapped, and the first executable slice is shaped against live code.

### Work

- Place this document at the intended repo path.
- Add a Plan Registry row classifying it as durable design proposal/experiment quarry, not status.
- Add a Program Map reference if useful.
- Audit current:
  - Sandbox;
  - deterministic lab;
  - run/session lifecycle;
  - New Game setup;
  - weapon firing;
  - projectile contact;
  - physics surface material;
  - combat statuses;
  - kill receipts;
  - spawn budget;
  - encounter materialization;
  - fitting APIs;
  - UI navigation;
  - save boundaries;
  - performance probes.
- Deduplicate against:
  - Physical Play Grammar;
  - Physical Play Build Plan;
  - Physics as Spectacle;
  - Combat Ceiling;
  - current performance/hitch work;
  - current Sandbox/recovery work;
  - retained sequential swarm plans;
  - any existing queue leaves.
- Shape only the first one or two packets.

### Non-goals

- No Survival implementation.
- No new attack engine.
- No new weapons.
- No global status claims.
- No rewriting unrelated plans.

### Exit gate

A short current seam map names:

- exact owners;
- exact files;
- reusable code;
- missing seams;
- current tests;
- current performance limits;
- first packet outcome and non-goals.

## Phase 1 — Combat Lab extension

### Outcome

A player/developer can instantly launch a real-path combat setup with selected hull, weapons, physics loadout, enemy package, seed, and arena prototype.

### Work

- Extend existing Sandbox configuration.
- Add Combat Lab setup surface.
- Add same-seed restart.
- Add legal full-loadout selection.
- Add enemy package and count controls inside spawn authority.
- Add simulation speed and bounded debug toggles.
- Add initial telemetry overlay.
- Add build-code v0.
- Add one deterministic physics-swarm scenario.
- Preserve real New Game and canonical writers.

### Non-goals

- No scored run.
- No random drafts.
- No attack modifiers.
- No new arena art.
- No leaderboard.
- No run persistence.

### Exit gate

The same build and seed can be launched repeatedly in Browser and Electron, and the deterministic scenario agrees on the supported claim.

## Phase 2 — Ten-wave shell using existing combat

### Outcome

A complete, replayable ten-wave run works with existing weapons, enemies, fields, pickups, and one greybox arena.

### Work

- Add orthogonal run state.
- Add explicit run phases.
- Add pure wave recipe schema/planner.
- Add wave spawning through canonical materialization.
- Add run-local XP and Arena Credits.
- Add physical credit collection and post-wave sweep.
- Add simple three-choice draft from safe existing effects or placeholder structural choices.
- Add wave-ten boss using an existing enemy/system where possible.
- Add results screen and build code.
- Add campaign-contamination checks.

### Non-goals

- No complete modifier algebra.
- No five arenas.
- No meta progression.
- No endless mode.
- No permanent run save.
- No broad enemy expansion.

### Exit gate

A player can start, play, die or win, view results, and restart the same seed. Adventure state is unchanged.

## Phase 3 — AttackSpec compiler and lineage kernel

### Outcome

Existing projectile weapons can receive bounded, deterministic topology modifiers.

### Work

- Define attack trait schema.
- Compile base weapon plus modifiers.
- Add attack lineage.
- Add shared proc budget.
- Add deterministic child inheritance.
- Add compatible multishot, pierce, and split.
- Add owner-seam metrics.
- Add Lab inspector.
- Add focused deterministic tests.

### Non-goals

- No surface bounce yet if the seam is not ready.
- No orbit nodes.
- No conductivity graph.
- No generic rewrite of beams/missiles unless required by a selected trait.
- No unbounded recursive combinations.

### Exit gate

Pulse Laser and one projectile weapon can produce at least three distinct legal compiled forms with repeatable metrics and bounded descendants.

## Phase 4 — Surface receipt and Ricochet Foundry vertical slice

### Outcome

One polished-enough arena supports authoritative player projectile banking, moving geometry, physical props, ten waves, and one boss.

### Work

- Add or confirm physics surface-contact receipt.
- Add material compatibility.
- Add reflection continuation through physics.
- Add Bank Shot and Smart Bank.
- Build greybox Foundry.
- Prove angles and camera.
- Add moving shutters.
- Add loose reflective plate.
- Add Foundry wave recipes.
- Add Mirrorjaw Foreman boss.
- Add causal VFX/audio.
- Add route and performance acceptance.

### Non-goals

- No procedural arenas.
- No player and enemy symmetric bounce.
- No five-bounce screen soup.
- No final art expansion before geometry passes.
- No unrelated projectile rewrite.

### Exit gate

The same Pulse Laser supports direct, bank, and smart-bank builds; all three can finish the ten-wave block; bounce cause is visible and deterministic.

## Phase 5 — Chain, payload, and bridge modifiers

### Outcome

Projectile topology connects to the existing status and field systems.

### Work

- Add deterministic chain selection.
- Add Ion Payload.
- Add Relay Arc.
- Add Gravity Tag.
- Add Incendiary Payload.
- Add bridge traits:
  - bounce-to-chain;
  - tether-to-payload;
  - status-to-propagation.
- Add causal score tags.
- Add draft compatibility and exclusions.
- Add results causal distribution.

### Non-goals

- No global conductivity graph yet.
- No dozens of statuses.
- No meta unlock tree.
- No enemy full modifier grammar.

### Exit gate

At least three mature build identities are viable in Foundry and produce measurably different causal distributions.

## Phase 6 — Orbit fields, Cryo Lock, and reaction play

### Outcome

Crucible supports an active orbit/control family and one new physical status reaction without losing momentum identity.

### Work

- Add bounded orbiting field nodes.
- Add Cryo Lock.
- Add Thermal Shock.
- Add Cryo Gyro Rack prototype.
- Add player action or positioning requirement for orbit efficacy.
- Add visual/audio grammar.
- Add Lab controls and performance metrics.
- Add one greybox thermal test pocket.

### Non-goals

- No fully physical colliding orbit bodies.
- No passive screen-clearing aura.
- No broad elemental system.
- No status icon wall.

### Exit gate

Orbit builds require active movement/positioning; Cryo preserves translational momentum; Thermal Shock is understandable and repeatable.

## Phase 7 — Thirty-wave Foundry run

### Outcome

One arena supports the full three-act thirty-wave arc.

### Work

- Acts I–III.
- Wave 20 boss/system event.
- Wave 30 final boss variant.
- full refit cadence;
- build evolutions;
- difficulty composition;
- score/style;
- results history;
- unlock scaffolding;
- tuning across starter packages.

### Non-goals

- No five-arena breadth.
- No daily leaderboards.
- No endless balance claim.
- No Adventure migration yet.

### Exit gate

The run has early identity, mid-run resistance, late build spectacle, and a complete victory arc without relying on HP inflation.

## Phase 8 — Lagrange Crucible and Cinder Sluice

### Outcome

The shared grammar proves itself in two arenas whose laws are not ricochet.

### Work

- gravity arena;
- current arena;
- field/pylon/machinery controllers;
- arena-specific bosses;
- wave recipes;
- existing build cross-testing;
- new props;
- performance and readability.

### Exit gate

The strongest Foundry build is not automatically strongest in both new arenas, but remains intelligibly viable.

## Phase 9 — Cryo Drift and Storm Lattice

### Outcome

Status reactions and physical conductivity mature into full arenas.

### Work

- thermal quadrants;
- coolant/heat props;
- conductivity graph;
- movable relay nodes;
- Massline conduction;
- two bosses;
- twenty additional authored wave recipes or equivalent act coverage;
- cross-arena tuning.

### Exit gate

All five arenas express distinct laws using the same combat owners and data grammar.

## Phase 10 — Meta progression, challenges, and endless

### Outcome

Runs produce long-term possibility unlocks and replay structures without permanent power inflation.

### Work

- unlock catalog;
- local records;
- challenge mutators;
- boss circuit;
- deterministic endless recipes after wave 30;
- one-hull and one-weapon trials;
- extraction experiment;
- run history;
- versioned build codes.

### Non-goals

- No global leaderboard until integrity.
- No live-service economy.
- No mandatory grind.
- No campaign stat transfer.

### Exit gate

A player has reasons to replay beyond raw score, and a fresh account remains competitively viable.

## Phase 11 — Adventure migration

### Outcome

Successful Crucible mechanics become fitted, earned, situated, consequential tools in Adventure.

### Work

- map modifiers to modules, Rigs, weapon variants, tech, salvage, or training;
- map arenas to authored sites and machinery;
- add enemy doctrines from successful wave roles;
- add physical reward and causal scoring where appropriate;
- build acquisition arcs;
- integrate law/collateral;
- add Adventure Combat Lab shortcuts only as developer surfaces;
- preserve long-lived ship identity.

### Exit gate

Adventure combat exhibits the same combinatorial physical grammar without using the run economy or random draft structure.

## Phase 12 — Content factory and authoring tools

### Outcome

Designers and agents can add validated modifiers, wave recipes, and arenas without bespoke engine work.

### Work

- schemas and validators;
- data-driven authoring;
- preview tools;
- performance estimates;
- compatibility lint;
- arena module library;
- wave recipe simulator;
- localization-ready text;
- balance and telemetry dashboards;
- mod-facing boundaries where appropriate.

### Exit gate

A new legal modifier or wave recipe can be authored, validated, previewed, and tested without editing the combat kernel.

## Phase 13 — Community and network horizons

### Outcome

Only after the local game is mature: daily seeds, ghosts, shared challenges, leaderboards, or co-op research can be evaluated.

### Non-goals

This phase is not implied by completion of local Crucible. It is a separate product decision with infrastructure, security, moderation, determinism, and cost implications.

---

# 31. Provisional agent work packet map

The IDs below are **local proposal labels**, not queue IDs. Before execution, map each selected outcome to an existing `PQ-XXX` or assign a new stable roadmap ID through the program process.


| Local ID | Candidate packet | Player/product outcome | Dependencies | Minimum proof |
|---|---|---|---|---|
| **CRU-000** | Proposal assimilation | Register this document and deduplicate against active plans without claiming status. | None | Plan docs validator; no global status drift. |
| **CRU-001** | Current seam audit | Re-audit Sandbox, lab, run lifecycle, combat, physics contact, spawn, fitting, save, and route owners. | CRU-000 | Current file/symbol map with first bounded packet. |
| **CRU-002** | Run-state contract | Define orthogonal `state.run`, phases, reset, and contamination boundary. | CRU-001 | Owner tests; New Game/exit/reset behavior. |
| **CRU-003** | Combat Lab setup schema | Extend Sandbox config for hull, loadout, enemy package, arena, seed, and wave. | CRU-001 | Canonical-writer setup; repeated same-seed launch. |
| **CRU-004** | Combat Lab UI | Build player-facing setup and quick restart around the schema. | CRU-003 | Browser/Electron reachability and input accessibility. |
| **CRU-005** | Lab runtime controls | Pause, step, speed, refill, invulnerability, and bounded clear/reset actions. | CRU-003 | No raw cross-owner mutation; deterministic step tests. |
| **CRU-006** | Telemetry overlay v1 | Expose counts, system times, spawn budget, contacts, and active attack families. | CRU-003 | Overlay matches authoritative counters. |
| **CRU-007** | Build code v0 | Versioned arena/seed/hull/loadout configuration encoding. | CRU-003 | Round-trip and invalid-code tests. |
| **CRU-008** | Physics-swarm scenario expansion | Create one deterministic scenario matching the human Lab setup. | CRU-003 | Repeat and supported runtime parity. |
| **CRU-009** | Pure wave schema | Define wave recipe data and validation. | CRU-001 | Schema rejects invalid roles, timing, and completion rules. |
| **CRU-010** | Wave planner v1 | Map seed/arena/wave to deterministic packages and schedule. | CRU-009 | Repeatability and snapshot/semantic tests. |
| **CRU-011** | Survival run controller | Own phase transitions and consume wave-plan receipts. | CRU-002, CRU-010 | State-machine tests; no inferred phases. |
| **CRU-012** | Spawn materialization bridge | Request bounded packages through spawn budget and canonical materializer. | CRU-010, CRU-011 | Budget bind/release and lifecycle tests. |
| **CRU-013** | Wave completion/cleanup | Resolve valid completion and bounded remnant cleanup. | CRU-012 | No orphan wave; escaped/invalid target cases. |
| **CRU-014** | Run wallet and XP | Own Arena Credits, XP, levels, and immutable reward receipts. | CRU-011 | Campaign credit unchanged; dedupe tests. |
| **CRU-015** | Physical credit reward | Spawn/collect run currency and post-wave sweep. | CRU-014 | Value conservation and pickup ownership. |
| **CRU-016** | Draft flow v0 | Seeded three-choice offer, pause, choice, and history. | CRU-014 | Same seed/history yields same offer sequence. |
| **CRU-017** | Refit transaction | Run purchase authorization plus canonical grant/fit transaction. | CRU-014 | Charge only on successful canonical mutation. |
| **CRU-018** | Results and death chain | Produce run result, causal death summary, and same-seed restart. | CRU-011, CRU-014 | Authoritative final tick; round-trip build code. |
| **CRU-019** | Attack trait schema | Define compatibility, stacking, inheritance, caps, and text. | CRU-001 | Data validators and representative invalid cases. |
| **CRU-020** | Attack compiler | Compile base weapon, fitting, and run modifiers into immutable AttackSpec. | CRU-019 | Digest stability and semantic tests. |
| **CRU-021** | Attack lineage | Root/descendant identity, generation, visited targets, and shared proc budget. | CRU-020 | Containment and deterministic suppression tests. |
| **CRU-022** | Multishot trait | Add bounded root siblings with heat/damage tradeoff. | CRU-020, CRU-021 | Shot/count/heat conservation. |
| **CRU-023** | Pierce trait | Continue through bounded target count with re-hit protection. | CRU-020, CRU-021 | Contact order and same-target cooldown. |
| **CRU-024** | Split trait | Spawn bounded children with explicit inheritance. | CRU-020, CRU-021 | No recursive inheritance leak. |
| **CRU-025** | Surface contact receipt | Expose authoritative point, normal, material, and velocity. | CRU-001 | Physics owner contract and replay stability. |
| **CRU-026** | Ricochet continuation | Bank eligible attacks through physics with bounded energy/counter. | CRU-021, CRU-025 | Angle/material tests; enemy asymmetry. |
| **CRU-027** | Smart Bank | Deterministic bounded post-bounce steering. | CRU-026 | Target ordering and cone/turn caps. |
| **CRU-028** | Foundry greybox | Exact geometry, plates, furnace, gates, camera, and props. | CRU-025 | Render/collision agreement; human play route. |
| **CRU-029** | Foundry machinery | Moving shutters, warnings, crush/contact receipts, and jam rules. | CRU-028 | Kinematic ownership and telegraph acceptance. |
| **CRU-030** | Foundry ten-wave recipe | Author and tune the first complete block. | CRU-012, CRU-028 | Full block playtest and deterministic plan. |
| **CRU-031** | Mirrorjaw boss | Reflective ram and external rear machinery. | CRU-028, CRU-030 | Three solution families and system transitions. |
| **CRU-032** | Chain selector | Bounded deterministic nearest/scored chain targeting. | CRU-021 | Candidate filtering/order/proc tests. |
| **CRU-033** | Ion payload and Relay Arc | Connect attacks to Ionized and chain propagation. | CRU-032 | Status/chain causal receipt and result attribution. |
| **CRU-034** | Gravity payload bridge | Add Gravity Tag and field-coupling build path. | CRU-020 | Existing status authority; field response test. |
| **CRU-035** | Burn payload bridge | Add Burning through compatible attack payloads. | CRU-020 | Periodic ownership and stacking tests. |
| **CRU-036** | Causal style ledger | Classify direct, bank, chain, collision, terrain, tether, field, and reaction. | CRU-018, CRU-021 | Deduped authoritative score receipts. |
| **CRU-037** | Draft quality planner | Compatibility, contrast, pity, rank, and exclusion logic. | CRU-016, CRU-019 | Seeded offer properties and dead-choice checks. |
| **CRU-038** | Build evolution v1 | One named synthesis with explicit conversion and cost. | CRU-033, CRU-037 | No hidden extra triggers; reversible Lab setup. |
| **CRU-039** | Orbit field node kernel | Bounded deterministic orbit sources using field queries. | CRU-021 | Node cap, target cooldown, performance scenario. |
| **CRU-040** | Cryo Lock | Preserve translational momentum while reducing control authority. | CRU-001 | Physics/control/status persistence tests. |
| **CRU-041** | Thermal Shock | Burn/Cryo interaction with bounded impulse and subsystem effect. | CRU-035, CRU-040 | Consumption, causality, VFX receipt. |
| **CRU-042** | Cryo Gyro prototype | Active orbit control weapon using node kernel and Cryo. | CRU-039, CRU-040 | Player-action requirement and passive-play test. |
| **CRU-043** | Thirty-wave Foundry arc | Acts II–III, refits, bosses, mutations, and victory. | CRU-030, CRU-031, CRU-037 | Complete run acceptance and tuning evidence. |
| **CRU-044** | Lagrange arena | Field states, pylons, wave arc, and Tidal Engine boss. | CRU-034, CRU-043 | Mass-band response and arena-law acceptance. |
| **CRU-045** | Cinder Sluice arena | Directional current, ballast, shutters, and Chain Tug boss. | CRU-043 | Warn/surge/calm readability and physical win paths. |
| **CRU-046** | Cryo Drift arena | Thermal zones, coolant props, wave arc, and Manifold boss. | CRU-041, CRU-043 | Thermal-state accessibility and cross-build viability. |
| **CRU-047** | Conductivity graph | Local bounded graph over pylons, statuses, props, and eligible lines. | CRU-032 | Deterministic traversal and cost limits. |
| **CRU-048** | Storm Lattice arena | Movable network, wave arc, and Grid Tyrant boss. | CRU-047, CRU-043 | Graph path truth and route readability. |
| **CRU-049** | Swarm AI tiering | Shared perception/steering path for disposable bodies. | CRU-012 | Behavior equivalence goal and performance gain. |
| **CRU-050** | Spawn-scale profile | Measured run-specific budget profile inside authority. | CRU-049 | No cap bypass; target/floor performance comparison. |
| **CRU-051** | VFX/audio causal grammar | Family/generation/material/status reads under saturation. | CRU-036 | Hero-event survival and accessibility variants. |
| **CRU-052** | Run HUD | Wave, XP, credits, score, arena state, and boss system surfaces. | CRU-011, CRU-014 | No flight-HUD regression; input/UI scale checks. |
| **CRU-053** | Refit and draft polish | Comparison, diagrams, compatibility, and suspended-trait clarity. | CRU-017, CRU-037 | Usability and accessibility review. |
| **CRU-054** | Run history | Store compact local result records and build codes. | CRU-018 | Versioning and migration tests. |
| **CRU-055** | Unlock catalog | Possibility unlocks without permanent stat power. | CRU-043 | Fresh-account viability review. |
| **CRU-056** | Endless recipe | Deterministic post-wave-30 composition and mutators. | CRU-043 | No authored-victory regression; escalating composition. |
| **CRU-057** | Challenge rulesets | One-weapon, one-hull, physics-only, boss circuit. | CRU-043 | Ruleset isolation and result labeling. |
| **CRU-058** | Adventure trait mapping | Map proven traits to modules, Rigs, variants, tech, or salvage. | CRU-043 | No run-modifier leakage into persistence. |
| **CRU-059** | Adventure arena-law sites | Transfer validated machinery/material laws into authored world sites. | CRU-044, CRU-045 | Ordinary Adventure route and world consequence. |
| **CRU-060** | Adventure enemy doctrine transfer | Use proven specialist relations in living encounters. | CRU-044 | Campaign pacing remains owned by encounter director. |
| **CRU-061** | Authoring schemas and lint | Compatibility, cost, text, arena, and wave validators. | CRU-048 | Bad content fails before runtime. |
| **CRU-062** | Arena recipe toolkit | Compose validated geometry/law modules for designers. | CRU-048, CRU-061 | Generated recipe obeys camera/perf/spawn constraints. |
| **CRU-063** | Daily seed research | Versioned deterministic challenge and integrity model. | CRU-054, CRU-061 | Local verification; no public leaderboard claim. |
| **CRU-064** | Leaderboard research | Security, versioning, accessibility categories, and exploit model. | CRU-063 | Separate product decision; threat model. |
| **CRU-065** | Run suspend research | Checkpoint/save envelope for long runs. | CRU-043 | Save/continue equivalence and migration plan. |
| **CRU-066** | Modding boundary | Safe data extension for traits, waves, and arenas. | CRU-061 | Validation, versioning, and failure isolation. |
| **CRU-067** | Ghost/replay research | Input trace or causal replay for same-seed comparison. | CRU-054 | Deterministic fidelity and storage cost. |
| **CRU-068** | Co-op feasibility | Authority, netcode, physics determinism, UI, and product study. | CRU-048 | Research only; no implicit commitment. |


## 31.1 Parallelization guidance

Safe parallel work usually follows data/owner boundaries after foundations land.

Potential parallel groups:

- Foundry geometry and attack compiler after exact seams are frozen;
- run HUD and headless run-state tests;
- VFX/audio grammar and deterministic score classification;
- future arena paper design while the first arena is implemented;
- enemy content data and Lab telemetry;
- accessibility review and refit interaction design.

High-collision seams should remain single-owner during a mutation window:

- projectile firing/contact;
- physics contact receipts;
- combat kill/status ownership;
- `state.run` phase machine;
- spawn-budget changes;
- fitting transactions;
- Sandbox launch schema;
- central modifier compiler.

A broad lane label never reserves an entire subsystem. Exact paths and hunks decide coordination.

## 31.2 Packet-size rule

A packet should usually produce one coherent player-visible change and one bounded proof chain.

Bad packet:

> Implement Crucible, all modifiers, five arenas, bosses, progression, and Adventure integration.

Good packet:

> In the existing Sandbox real-New-Game path, add a legal Combat Lab configuration for one hull, three selected weapons, a seeded twelve-enemy package, same-seed restart, and authoritative active-body/projectile counters. Do not add a scored run, modifiers, or new weapons.

---

# 32. Integration into existing plans

## 32.1 Intended registry classification

Suggested Plan Registry row:

| Family | Canonical role | Current disposition | Status owner |
|---|---|---|---|
| `vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md` | Durable product and implementation quarry for Survival, Combat Lab, attack composition, arena laws, and Adventure combat convergence | **DURABLE DESIGN PROPOSAL / EXPERIMENT BANK — NOT ADMITTED WORK** | Product/design owner curates direction; executable work enters only through a stable program queue ID and active packet |

Do not call it ACTIVE SCOPE unless the user explicitly admits the entire program.

## 32.2 Program Map

A Program Map reference may say:

> Use for long-horizon Crucible/Survival direction and decomposition. It does not establish queue order, status, implementation, or acceptance.

## 32.3 Relationship to Physical Play Grammar

The Physical Play Grammar remains the authority for:

- direct manipulation of mass and momentum;
- primitive → state → outcome;
- swarms rather than dogfights;
- asymmetric bounce;
- material properties;
- input-level constraints;
- Rig framing;
- Massline and field identity.

This document adds:

- a concentrated mode structure;
- run progression;
- attack topology;
- arenas;
- wave composition;
- Combat Lab;
- experimental and content roadmaps.

Where the two disagree on physical-play fundamentals, correct this document or make an explicit higher-authority decision. Do not silently fork the grammar.

## 32.4 Relationship to Physical Play Build Plan

The Build Plan contains existing seam audits, cost findings, and technical ordering. Re-audit it before implementation because some values and paths have changed.

This document should not duplicate its status. Selected Crucible packets may cite and reuse its findings.

## 32.5 Relationship to Physics as Spectacle

Physics as Spectacle owns active presentation gates and existing causal/VFX foundations. Crucible should consume:

- contact provenance;
- kill presentation receipts;
- priority-aware VFX admission;
- velocity language;
- Massline visual truth;
- field presentation;
- cause-specific destruction.

Crucible does not close that program’s acceptance gates merely by using its code.

## 32.6 Relationship to GDD and VISION

The direction already aligns with durable product authority:

- fast, colorful, physically slapstick play;
- light enemies as ammunition;
- progression as physical agency;
- world geometry and machinery as participants;
- no HP-bar dogfight collapse;
- simple controls producing complex consequences.

Once Crucible decisions are proven, update GDD only for durable cross-mode rules. Do not copy the entire run design into the GDD.

## 32.7 Retained future backlog

Unselected content-bank ideas may be represented by one or a few umbrella retained outcomes. Do not create sixty queue rows merely because sixty local proposal labels exist.

Admission should begin with:

1. current seam audit;
2. Combat Lab extension;
3. ten-wave shell;
4. attack trait/lineage foundation;
5. Ricochet Foundry vertical slice.

Everything else remains directional until those produce evidence.

## 32.8 Global status

Only `design/program/` owns:

- verified done;
- remaining admitted work;
- live acceptance;
- integration state.

This document never says “done.”

---

# 33. Risk register and anti-patterns

## 33.1 Generic bullet-heaven drift

**Failure:** The player drives in circles while passive auras erase hit-point clouds.

**Mitigation:**

- manual aim remains important;
- orbitals require positioning, timing, release, or resource;
- enemies have physical roles;
- arena geometry matters;
- direct passive damage is bounded;
- objectives require verbs beyond survival.

## 33.2 Generic Freelancer drift

**Failure:** Survival becomes ordinary open-space dogfights with waves.

**Mitigation:**

- compact authored arenas;
- environment law;
- dense light bodies;
- physical states;
- attack topology;
- bosses as room systems;
- causal score.

## 33.3 Second-game architecture

**Failure:** New run mode grows separate weapons, enemies, physics, fitting, UI, and save paths.

**Mitigation:**

- fresh ephemeral state, same runtime;
- orthogonal `state.run`;
- canonical writers;
- shared data and attack grammar;
- Lab built on Sandbox;
- Adventure migration required as a design test.

## 33.4 Modifier soup

**Failure:** Hundreds of upgrades exist but most are tiny, dead, or incomprehensible.

**Mitigation:**

- functional tiers;
- compatibility;
- bridge/evolution logic;
- utilization telemetry;
- content lint;
- small first pool;
- rejection ledger.

## 33.5 Proc explosion

**Failure:** Split × chain × bounce × explosion becomes an exponential entity generator.

**Mitigation:**

- lineage;
- shared proc budget;
- generation cap;
- child inheritance declarations;
- active-family cap;
- per-tick global cap;
- deterministic suppression;
- telemetry.

## 33.6 Visual soup

**Failure:** Every effect is bright, large, and equally important.

**Mitigation:**

- root/descendant hierarchy;
- causal priority;
- material-specific impacts;
- status world reads;
- pooled bounded cues;
- grayscale/bloom-off review;
- accessibility variants.

## 33.7 HP inflation

**Failure:** Later waves only increase health and damage.

**Mitigation:**

- role composition;
- arena mutation;
- objectives;
- specialists;
- bosses as systems;
- slow bounded stat scaling;
- TTK telemetry.

## 33.8 Hard-counter director

**Failure:** The game reads the build and spawns immunity.

**Mitigation:**

- broad topology only;
- pre-authored fair pressure;
- delayed response;
- no immunity;
- telegraph;
- control group with adaptation off.

## 33.9 Arena gimmick lock

**Failure:** Each arena has one required build and rejects the rest.

**Mitigation:**

- three-family acceptance;
- direct fallback;
- multiple uses of props;
- cross-arena build matrix;
- arena law as opportunity, not keycard.

## 33.10 Physics as garnish

**Failure:** Physical effects are spectacular but inefficient compared with direct damage.

**Mitigation:**

- fast light-enemy deaths;
- collision/terrain rewards;
- objective design;
- setup/payoff balance;
- bosses with physical systems;
- causal distribution telemetry.

## 33.11 Physics as chaos

**Failure:** Outcomes are unpredictable and mastery is impossible.

**Mitigation:**

- deterministic rules;
- strong telegraphs;
- bounded forces;
- trajectory previews where justified;
- Lab reproduction;
- material language;
- causal death chain.

## 33.12 Campaign contamination

**Failure:** Run credits, traits, entities, or state leak into Adventure.

**Mitigation:**

- fresh ephemeral session;
- separate run wallet;
- no shared references;
- contamination tests;
- explicit post-run settlement only later.

## 33.13 Meta-progression grind

**Failure:** A fresh player must lose repeatedly for permanent stats before the mode becomes fair.

**Mitigation:**

- unlock possibility, not power;
- viable initial pool;
- cosmetics and challenge breadth;
- fresh-account victory acceptance.

## 33.14 Debug divergence

**Failure:** Combat Lab behaves differently from Survival.

**Mitigation:**

- same setup schema;
- same registry;
- same compiled attacks;
- same wave planner;
- toggles are explicit;
- build codes;
- parity tests.

## 33.15 Harness treadmill

**Failure:** Agents spend weeks polishing validators while the game remains dull.

**Mitigation:**

- one player-visible outcome per packet;
- proportionate proof;
- reuse existing lab;
- no new harness unless needed for a real claim;
- stop repeated unchanged probes.

## 33.16 Content-before-foundation

**Failure:** Five arenas and fifty upgrades are authored on unstable one-off mechanics.

**Mitigation:**

- Combat Lab first;
- attack compiler;
- one vertical slice;
- cross-arena proof before breadth;
- schema/lint after patterns stabilize.

## 33.17 Procedural sameness

**Failure:** Generated arenas vary cosmetically but play alike.

**Mitigation:**

- five authored laws first;
- extract validated modules;
- procedural recipes constrained by gameplay relations;
- human play acceptance.

## 33.18 Boss immunity theater

**Failure:** Bosses ignore the player’s build until scripted vulnerability windows.

**Mitigation:**

- mass-scaled response;
- subsystem targets;
- alternate physical paths;
- direct fallback;
- no arbitrary total immunity.

## 33.19 Input overload

**Failure:** New verbs compete with weapon aim or require delicate simultaneous trackpad gestures.

**Mitigation:**

- preserve keyboard-flies/mouse-fights;
- use existing Rig slots;
- modal manipulation only where explicitly justified;
- no hover-only interaction;
- test with trackpad.

## 33.20 Overfitting score

**Failure:** Players perform awkward style tricks because score punishes efficient play.

**Mitigation:**

- direct kills retain value;
- style bonus is bounded;
- objective floor;
- invisible or subtle variety weighting option;
- compare scored and unscored play.

---

# 34. Adventure-mode convergence

Crucible succeeds only if it changes how Adventure combat is designed.

## 34.1 Trait migration

Temporary run modifiers can become Adventure components.

| Crucible trait | Adventure form |
|---|---|
| Bank Shot | ballistic computer, barrel assembly, or reflective ammunition Rig. |
| Smart Bank | higher-tier targeting processor with mass/heat cost. |
| Relay Arc | ion-conduction module or unique weapon variant. |
| Twin Mount | mount synchronizer with heat, spread, and slot implications. |
| Cryo Gyros | utility Rig with capacitor draw and physical mass. |
| Tether Capacitor | Massline conductor fitting. |
| Collision Dividend | bounty contract, salvage processor, or score/reward doctrine. |
| Deflection Halo | field Rig with power draw and signature cost. |
| Forked Core | ammunition or emitter module with reliability cost. |
| Thermal Shock | shared status reaction available to enemies and environments. |

Adventure versions should carry:

- mass;
- slot;
- heat;
- capacitor;
- price;
- tech;
- rarity only where fiction requires;
- maintenance;
- law/collateral;
- acquisition.

## 34.2 Arena migration

Arena laws become world sites:

- Ricochet Foundry becomes an industrial weapons plant, pirate refinery, or station interior pocket.
- Lagrange Crucible becomes a gravitic research site.
- Cinder Sluice becomes a refinery channel.
- Cryo Drift becomes a coolant extraction failure.
- Storm Lattice becomes station power infrastructure.

These sites need not use formal waves. The same machinery can shape:

- ambushes;
- missions;
- heists;
- mining;
- salvage;
- patrols;
- faction battles;
- emergencies.

## 34.3 Enemy migration

Successful Survival specialists become Adventure doctrines:

- mine-layer in refinery routes;
- tether cutter in anti-piracy patrols;
- cleanser in advanced faction fleets;
- anchor barge in convoy defense;
- relay drone around power infrastructure;
- repair tug in industrial sites.

Adventure encounters remain paced by the living-universe director. It borrows role relationships, not Survival’s nonstop clock.

## 34.4 Acquisition arcs

Crucible exposes a mechanic immediately. Adventure asks how it is earned.

Paths:

- bought at outfitters;
- researched;
- salvaged from a unique wreck;
- granted and taught by a career ladder;
- stolen;
- manufactured;
- recovered from a boss/site;
- faction-restricted;
- illegal or high-signature.

The Massline remains foundational and should not be hidden.

## 34.5 Consequence

Adventure adds what Crucible intentionally strips away:

- collateral damage;
- law;
- civilian traffic;
- faction reputation;
- persistent wrecks;
- cargo;
- rescue;
- capture;
- economic disruption;
- recurring enemies;
- ship scars;
- story.

A build that is efficient in Crucible may be reckless in a populated refinery. That is not inconsistency. It is context.

## 34.6 Feedback loop

```text
Crucible experiment
→ telemetry and playtest
→ accepted shared mechanic
→ Adventure component/site/doctrine
→ living-world consequence
→ new emergent interaction
→ concentrated Crucible scenario
```

The two modes should improve each other.

## 34.7 Adventure acceptance test

For every major shared mechanic ask:

1. Can it exist outside a wave?
2. What does it cost?
3. How is it acquired?
4. What does the law think?
5. What does it do to cargo/civilians/world machinery?
6. Can enemies use or counter it?
7. Does it preserve ship identity?
8. Does it create a story when it fails?

If none have answers, the mechanic may belong only in a challenge ruleset.

---

# 35. Long-horizon possibilities

These possibilities should influence extensibility only where cheap. They are not justification for premature architecture.

## 35.1 Daily deterministic Crucibles

A rotating daily package:

- arena;
- seed;
- starter choices;
- modifier pool;
- mutators;
- score rules;
- version.

Players compare same conditions. Requires run integrity and balance-version separation.

## 35.2 Ghosts and causal replays

A ghost may show:

- player trajectory;
- major attacks;
- boss-system transitions;
- score events;
- build choices.

A full deterministic replay is preferable but may be expensive across versions. A causal summary can remain useful.

## 35.3 Challenge contracts in Adventure

Factions or corporations may sponsor:

- weapons trials;
- salvage competitions;
- anti-swarm drills;
- no-collateral trials;
- physical-capture trials;
- arena-law research.

This gives Crucible mechanics fiction without making the mode dependent on campaign travel.

## 35.4 Arena creator

A validated editor could allow:

- geometry module placement;
- material assignment;
- field and machinery sockets;
- spawn gates;
- wave recipes;
- boss sockets;
- mutators;
- lighting/audio identity;
- performance estimate;
- deterministic preview.

Publishing requires schema, licensing, moderation, and security decisions.

## 35.5 Modding

The attack algebra is naturally mod-friendly if:

- traits are declarative;
- scripts are bounded;
- schemas are versioned;
- proc costs are mandatory;
- assets are declared;
- unsafe code is not loaded casually;
- compatibility and performance lint exist.

## 35.6 Asynchronous build challenges

A player publishes:

- seed;
- arena;
- build restriction;
- score target;
- replay/build code.

Others attempt the same problem.

## 35.7 Faction Crucibles

Different factions may favor:

- lawful no-collateral control;
- pirate debris and volatile cargo;
- industrial current and salvage;
- military formation breaking;
- research field manipulation;
- illegal captive-web combat.

This can become a worldbuilding vector.

## 35.8 Ship scars and trophies

A long-lived Adventure ship may display:

- Crucible emblems;
- boss-system trophies;
- arena-specific paint;
- physical scars;
- build lineage records.

Cosmetics should not require permanent power.

## 35.9 Dynamic arena laws in the universe

Far later, world simulation events could change site laws:

- a damaged gravity reactor creates a temporary Lagrange pocket;
- a station outage creates a Storm Lattice emergency;
- a coolant accident creates Cryo Drift conditions;
- a refinery surge creates Cinder Sluice combat;
- wreck density creates a Kessler Mill.

The living world generates situations that resemble proven Crucible laws.

## 35.10 Cooperative play

Co-op is extremely expensive because:

- physical authority must be networked;
- constraints and collision must reconcile;
- attack lineages must remain authoritative;
- pause/drafts require group rules;
- camera and arena scale change;
- score and causality become multi-owner;
- grief/collateral changes meaning.

Preserve stable IDs, deterministic schemas, and explicit ownership because they help anyway. Do not build current systems around hypothetical co-op.

## 35.11 Competitive modes

Direct PvP is not a natural first extension. The player power curve is intentionally abusive and combinatorial. Competitive possibilities are more plausible as:

- same-seed score;
- asynchronous ghosts;
- indirect arena influence;
- racing/efficiency trials;
- controlled fixed-loadout duels.

## 35.12 Adaptive experimental director

A later research system could learn which combinations create:

- active decisions;
- causal variety;
- fair deaths;
- build diversity;
- performance risk.

It may propose wave recipes to designers. It should not silently alter a scored deterministic run.

## 35.13 Automated balance search

Combat Lab and deterministic scenarios could run large batches across:

- builds;
- arenas;
- waves;
- seeds;
- enemy compositions.

Automated agents can identify:

- dead traits;
- runaway proc chains;
- impossible bosses;
- dominant passive builds;
- cost cliffs;
- arena-law irrelevance.

Simulation results generate hypotheses. Human play decides whether behavior feels good.

## 35.14 Narrative convergence

A champion build or spectacular failure may become:

- a bar rumor;
- a named weapon variant;
- a faction doctrine;
- a bounty;
- a wreck;
- a rival pilot;
- a site hazard.

This is a far-future bridge from run history into the living universe.

---

# 36. Definition of convergence

SpaceFace has converged toward the intended arcade-physics core when all of the following are true.

## Access

- Advanced combat behavior can be reached within minutes in Combat Lab.
- Survival exposes signature tools without campaign grinding.
- Adventure still preserves meaningful acquisition.

## Build identity

- A run build acquires identity early.
- One root weapon can become several genuinely different machines.
- Modifiers change topology and relationships more often than scalar damage.
- Builds have weaknesses.

## Physical play

- Light enemies function as manipulable bodies.
- Terrain and machinery regularly matter.
- Massline, fields, impulse, statuses, and projectiles combine.
- Physical kills are intentional and reproducible.
- Momentum remains honest.

## Arena diversity

- The same build plays differently across the five launch arenas.
- Every arena has one legible law.
- No arena requires one exact build.
- Bosses change the room.

## Causality

- The player understands why chains occurred.
- Attack lineage and score attribution are trustworthy.
- Death summaries explain fatal sequences.
- VFX matches actual cause.

## Performance

- Swarm density is achieved through bounded, measured systems.
- Gameplay work is never silently dropped.
- Proc suppression is deterministic.
- Visual priority preserves the important event.

## Tooling

- Same-seed failures are reproducible.
- Combat Lab and Survival share the real path.
- Build codes reconstruct runs.
- Telemetry reveals weapon, trigger, and performance behavior.

## Adventure transfer

- Successful traits become fittings, Rigs, weapons, sites, and doctrines.
- Adventure combat no longer defaults to stately dogfights.
- The living world adds consequence to the same physical grammar.
- Crucible does not remain a disconnected minigame.

## Player sentence

The final test is whether players describe runs like this:

> “I built a bank-shot ion cannon, moved a relay plate with the Massline, and used the boss’s own current to chain the whole wave into the furnace.”

rather than:

> “My DPS was high enough.”



# Appendix A: proposed schemas

These are illustrative contracts for packet shaping. They are not current code.

## A.1 Arena definition

```js
{
  id: 'arena_ricochet_foundry',
  schemaVersion: 1,
  name: 'Ricochet Foundry',
  primaryLaw: 'player_ricochet',
  acts: [
    {
      id: 'act_1',
      waveRange: [1, 10],
      machineryProfile: 'stable_shutter',
      materialProfile: 'foundry_intro',
      recipePool: ['foundry_intro_mass', 'foundry_bank_lane']
    }
  ],
  geometryId: 'geo_foundry_v1',
  spawnGates: ['nw', 'ne', 'sw', 'se'],
  props: [
    { family: 'reflective_plate', count: 2, persistent: true },
    { family: 'dense_hull_plate', count: 2, persistent: true }
  ],
  bossIds: ['boss_mirrorjaw'],
  performanceProfile: {
    maxGameplayProps: 12,
    maxFields: 4,
    maxOrbitNodes: 8
  }
}
```

## A.2 Wave recipe

```js
{
  id: 'foundry_w07_counter_lane',
  schemaVersion: 1,
  objective: { kind: 'resolve_hostiles' },
  threatBudget: 28,
  packages: [
    {
      atTick: 0,
      gateGroup: 'diagonal_a',
      role: 'mass',
      enemyId: 'wasp_swarmer',
      count: 8,
      batchSize: 4,
      batchGapTicks: 90
    },
    {
      atTick: 180,
      gateGroup: 'rear',
      role: 'control',
      enemyId: 'mine_layer_jackal',
      count: 1
    }
  ],
  arenaPhase: 'shutter_alternating',
  completion: {
    requiredPackagesMaterialized: true,
    blockingRolesResolved: ['mass', 'control'],
    cleanupTicks: 180
  },
  rewards: {
    xp: 100,
    credits: 16
  }
}
```

## A.3 Modifier definition

```js
{
  id: 'mod_bank_shot',
  schemaVersion: 1,
  name: 'Bank Shot',
  tier: 'foundation',
  family: 'ricochet',
  maxRank: 3,

  compatibility: {
    emitters: ['bolt', 'missile', 'debris'],
    trajectories: ['straight', 'inherited_velocity', 'gravity_curved'],
    forbids: ['hitscan', 'continuous']
  },

  stack: {
    mode: 'add',
    target: 'trajectory.bounces',
    perRank: 1
  },

  inheritance: {
    rootSiblings: true,
    splitChildren: true,
    chainChildren: false
  },

  cost: {
    procBudgetPerBounce: 1,
    activeFamilyDelta: 0
  },

  text: {
    summary: 'Eligible projectiles bounce {rank} time(s) from reflective surfaces.',
    detail: 'Each bounce consumes one lineage proc. Ordinary enemy shots are unchanged.'
  }
}
```

## A.4 AttackSpec

```js
{
  schemaVersion: 1,
  digest: 'atk_3df42...',
  sourceWeaponId: 'wpn_pulse_laser_s',

  emitter: {
    kind: 'bolt',
    rootCount: 2,
    intervalTicks: 0,
    spreadDeg: 8
  },

  trajectory: {
    kind: 'straight',
    speed: 320,
    inheritedVelocity: 0.35,
    bounces: 2,
    afterBounceSteer: {
      coneDeg: 50,
      maxTurnDeg: 35
    }
  },

  propagation: {
    pierce: 0,
    split: null,
    chain: {
      count: 2,
      range: 110,
      prerequisiteStatus: 'status_ionized'
    }
  },

  payload: [
    { kind: 'damage', channels: { thermal: 6.2 } },
    { kind: 'status', statusId: 'status_ionized', stacks: 1 }
  ],

  triggers: [
    { event: 'surface_contact', action: 'ricochet' },
    { event: 'entity_contact', action: 'apply_payload' },
    { event: 'entity_contact', action: 'chain_if_eligible' }
  ],

  constraints: {
    lineageProcBudget: 12,
    generationMax: 1,
    childMax: 8,
    sameTargetCooldownTicks: 18,
    activeFamilyCap: 24
  },

  presentation: {
    family: 'pulse_ion_bank',
    rootPriority: 1,
    descendantPriorityFalloff: 0.25
  }
}
```

## A.5 Score receipt

```js
{
  version: 1,
  tick: 44502,
  eventId: 'score:44502:entity_92',
  sourceEntityId: 'player',
  targetEntityId: 'entity_92',
  lineageId: 817231,
  baseValue: 120,
  tags: ['BANK', 'ION', 'CHAIN', 'TERRAIN'],
  objectiveId: null,
  risk: {
    playerHullFraction: 0.32,
    proximity: 18,
    selfHazardActive: true
  },
  multiplierInputs: {
    causalVariety: 1.4,
    execution: 1.2,
    risk: 1.1,
    objective: 1
  },
  finalValue: 222
}
```

## A.6 Build code payload

```js
{
  schemaVersion: 1,
  gameContentDigest: 'content_2026_08_21_a',
  ruleset: 'survival',
  arenaId: 'arena_ricochet_foundry',
  seed: 1864401122,
  wave: 20,
  hullId: 'ship_wasp',
  fittings: [
    'wpn_pulse_laser_s',
    'wpn_pulse_laser_s',
    'rig_repulsor'
  ],
  modifiers: [
    ['mod_twin_mount', 1],
    ['mod_bank_shot', 2],
    ['mod_smart_bank', 1],
    ['mod_ion_payload', 1],
    ['mod_relay_arc', 1]
  ],
  mutators: []
}
```

## A.7 Wave planner purity test

```js
const a = planWave(input);
const b = planWave(structuredClone(input));

assert.deepEqual(a, b);
assert.equal(hashSemantic(a), hashSemantic(b));
```

## A.8 Campaign-contamination test

```text
Given an Adventure save snapshot A
When a Survival run starts, mutates loadout, earns credits, chooses modifiers, and ends
Then restoring/continuing Adventure yields snapshot A for:
  player credits
  cargo
  inventory
  researched tech
  faction reputation
  current sector/world entities
  persistent ship fittings
  mission state
except for an explicitly authorized post-run settlement record, if that feature exists.
```

---

# Appendix B: full modifier content bank

This catalog is deliberately broad. The first public pool should be small—roughly twelve to twenty-four carefully tested entries. The rest are candidates for experiments, later arenas, evolutions, challenges, and Adventure fittings.


| Family | Modifier | Candidate effect | Functional tier |
|---|---|---|---|
| Volley | **Twin Mount** | Fire one additional weaker root sibling; total heat rises. | Foundation |
| Volley | **Triad Mount** | Add a third root sibling with wider spread and stronger heat cost. | Deepener |
| Volley | **Tight Formation** | Reduce sibling spread and slightly reduce projectile speed. | Deepener |
| Volley | **Crossfire** | Alternate sibling angles to intersect at the current aim range. | Experiment |
| Volley | **Rear Echo** | A delayed weaker shot fires backward along the ship’s wake. | Experiment |
| Volley | **Broadside Logic** | Root siblings emit laterally from valid side mounts while moving above a speed floor. | Experiment |
| Volley | **Staggered Rack** | Convert simultaneous multishot into a short deterministic burst. | Deepener |
| Volley | **Counter-Rotating Pair** | Two siblings curve in opposite directions before reconverging. | Experiment |
| Volley | **Heavy Twins** | Keep two shots but increase mass/impulse and reduce rate of fire. | Keystone |
| Volley | **Needle Volley** | Collapse all siblings into near-identical paths; pierce improves, spread disappears. | Keystone |
| Volley | **Scatter Crown** | Increase root count substantially but lower payload and child inheritance. | Keystone |
| Volley | **Momentum Salvo** | Sibling velocity includes more of the player’s actual motion. | Bridge |
| Ricochet | **Bank Shot** | Eligible projectiles bounce once per rank from reflective surfaces. | Foundation |
| Ricochet | **Smart Bank** | After a bounce, steer within a bounded cone toward a valid hostile. | Deepener |
| Ricochet | **Hard Angle** | Steep incidence preserves more speed and impulse after reflection. | Deepener |
| Ricochet | **Glancing Dividend** | Shallow bounces refund a small portion of heat or capacitor. | Experiment |
| Ricochet | **Wall Charge** | Each bounce increases the next impact’s impulse within a cap. | Deepener |
| Ricochet | **Mirror Split** | The first bounce creates two weaker children; children cannot split again. | Bridge |
| Ricochet | **Last Bank** | The final allowed bounce converts remaining ricochet budget into damage or impulse. | Deepener |
| Ricochet | **Bank Relay** | A bounced hit may begin a chain; direct hits cannot. | Bridge |
| Ricochet | **Return Angle** | After the last bounce, the projectile bends toward the player and may make one return pass. | Bridge |
| Ricochet | **Moving Mirror** | Loose reflective props grant stronger bounce effects than fixed walls. | Experiment |
| Ricochet | **Furnace Bank** | A bounce from a hot surface adds Burning; one application per projectile. | Arena Bridge |
| Ricochet | **Cold Bank** | A bounce from cryogenic material applies Cryo buildup. | Arena Bridge |
| Ricochet | **Ricochet Armor** | A successful bank briefly strengthens projectile deflection near the player. | Experiment |
| Ricochet | **No Direct Line** | Greatly improves bounced payload while weakening unbounced hits. | Keystone |
| Chain | **Relay Arc** | The first valid hit jumps to nearby targets. | Foundation |
| Chain | **Long Relay** | Increase chain range while reducing each jump’s payload. | Deepener |
| Chain | **Conductive Priority** | Prefer Ionized targets and conductive props. | Deepener |
| Chain | **Branch Circuit** | One chain step may fork to two targets; consumes heavy proc budget. | Deepener |
| Chain | **Return Current** | The final chain may return to the first target if the hit cooldown has expired. | Experiment |
| Chain | **Ground Path** | Chains may route through conductive arena objects. | Bridge |
| Chain | **Massline Conductor** | The active Massline becomes an eligible chain edge. | Bridge |
| Chain | **Hot Circuit** | Burning targets extend thermal chains but consume Burning duration. | Bridge |
| Chain | **Cold Circuit** | Cryo-locked targets transmit control payload at reduced damage. | Bridge |
| Chain | **Chain Reaction** | A status reaction on one chain target may transmit a weaker setup state to the next. | Keystone |
| Chain | **Insulation Breaker** | The first insulating obstacle struck becomes temporarily conductive. | Experiment |
| Chain | **Closed Loop** | Completing a loop through distinct nodes triggers one bounded pulse and ends the lineage. | Keystone |
| Propagation | **Piercing Core** | Pass through one additional body per rank. | Foundation |
| Propagation | **Overpenetration** | Unused pierce count increases exit speed and impulse. | Deepener |
| Propagation | **Skewer Line** | Pierced targets receive a brief shared alignment/drag effect. | Experiment |
| Propagation | **Wake Pierce** | A projectile gains pierce after crossing the player’s Wake Cutter field. | Bridge |
| Propagation | **Forked Core** | Split into two weaker children on the selected first trigger. | Foundation |
| Propagation | **Wall Fork** | Split only on first eligible surface contact. | Bridge |
| Propagation | **Kill Fork** | Split only when the parent gets a kill. | Bridge |
| Propagation | **Delayed Bloom** | Split after a fixed flight time if no earlier trigger occurs. | Deepener |
| Propagation | **Heavy Children** | Fewer split children with higher impulse and lower speed. | Deepener |
| Propagation | **Needle Children** | More children with low damage, high speed, and no further descendants. | Deepener |
| Propagation | **Payload Inheritance** | Children inherit status payloads at reduced duration. | Deepener |
| Propagation | **Sterile Children** | Children inherit damage and motion but no triggers; grants stronger base payload. | Keystone |
| Propagation | **Fracture Debris** | A hard terrain impact converts the projectile into bounded physical fragments. | Bridge |
| Propagation | **Convergent Split** | Children initially diverge, then turn once toward the parent’s aim point. | Experiment |
| Trajectory | **Hunter Turn** | Projectiles receive one bounded steering correction toward a target. | Foundation |
| Trajectory | **Gravity Sail** | Artificial fields curve eligible projectiles more strongly. | Bridge |
| Trajectory | **Return Pass** | A projectile returns toward the player after expiration or final hit. | Foundation |
| Trajectory | **Boomerang Edge** | Returning projectiles gain impulse but lose direct damage. | Deepener |
| Trajectory | **Orbit Capture** | Expired projectiles may enter a short player orbit instead of dying. | Bridge |
| Trajectory | **Wake Rider** | Shots traveling inside the player’s wake gain speed and stability. | Bridge |
| Trajectory | **Drift Round** | Projectiles inherit high shooter velocity and retain it visibly. | Experiment |
| Trajectory | **Braking Round** | Projectiles decelerate near targets, increasing local dwell but not repeated hits. | Experiment |
| Trajectory | **Sling Round** | Firing while under high Massline load increases tangential projectile velocity. | Bridge |
| Trajectory | **Field Skip** | The first field boundary crossing redirects rather than continuously curves the projectile. | Experiment |
| Trajectory | **Predicted Return** | Draw a bounded return-path cue for the current root family. | Deepener |
| Trajectory | **Blind Comet** | Remove homing and increase speed, mass, and impact payoff. | Keystone |
| Payload | **Ion Payload** | Compatible hits apply Ionized. | Foundation |
| Payload | **Incendiary Payload** | Compatible hits apply Burning. | Foundation |
| Payload | **Gravity Tag** | Compatible hits apply Gravity Marked. | Foundation |
| Payload | **Cryo Payload** | Compatible hits build or apply Cryo Lock. | Foundation |
| Payload | **Momentum Binder** | Hits apply a reduced Momentum Sink effect. | Bridge |
| Payload | **Unmooring Charge** | First hit after cooldown applies Unmoored to eligible mass bands. | Bridge |
| Payload | **Pinning Charge** | First hit after cooldown applies Pinned to eligible mass bands. | Bridge |
| Payload | **Scramble Burst** | Consuming sufficient Ionized stacks applies Scrambled. | Bridge |
| Payload | **Thermal Pressure** | Burning ticks add tiny bounded impulse along vent direction. | Experiment |
| Payload | **Breach Seeker** | Payload prefers damaged subsystems and Breached targets. | Deepener |
| Payload | **Collision Primer** | Low direct damage applies Primed for a hard-collision payoff. | Keystone |
| Payload | **Status Echo** | The first chain child copies one setup status at reduced duration. | Deepener |
| Payload | **Reaction Amplifier** | Status reactions gain impulse and lose direct damage. | Keystone |
| Payload | **Clean Burn** | Burning deals less damage but greatly raises signature/Hot state. | Experiment |
| Payload | **Deep Freeze** | Cryo takes longer to apply but produces stronger control loss. | Keystone |
| Payload | **Volatile Mark** | Marked target detonates on destruction; no recursive mark inheritance. | Bridge |
| Physics | **Wall Driver** | Increase damage/score from player-caused terrain impacts. | Foundation |
| Physics | **Collision Dividend** | Grant extra run reward for qualified collision kills. | Foundation |
| Physics | **Torque Core** | Increase off-center torque while reducing direct hull damage. | Deepener |
| Physics | **Impulse Core** | Increase linear impulse while reducing direct damage. | Deepener |
| Physics | **Mass Ratio Exploit** | Impulse scales more favorably against Unmoored/light targets. | Bridge |
| Physics | **Anchor Breaker** | Pinned or heavy targets take stronger subsystem pressure from high impulse. | Bridge |
| Physics | **Rebound Body** | A struck light enemy gains restitution and can hit a second target. | Experiment |
| Physics | **Kinetic Cascade** | First collision kill emits one bounded impulse pulse. | Bridge |
| Physics | **Debris Dividend** | Qualified debris hits refund a small proc or resource amount. | Experiment |
| Physics | **High-Speed Clause** | Payload improves above a real relative-speed threshold. | Deepener |
| Physics | **Close Quarters** | Impulse and torque improve at short range; projectile range falls. | Keystone |
| Physics | **Remote Artillery** | Payload improves at long travel time; close hits weaken. | Keystone |
| Physics | **Momentum Theft** | A portion of target-relative velocity becomes player capacitor on hit. | Experiment |
| Physics | **Ramming Plate Logic** | Player collisions deal more and receive less impulse damage within authored caps. | Keystone |
| Physics | **Pressure Fracture** | High impulse against Pinned targets damages armor/subsystems. | Bridge |
| Physics | **Body Bomb** | A Primed light enemy transfers detonation through its next hard collision. | Keystone |
| Massline | **Tether Capacitor** | Payloads against the active anchor are amplified within a cap. | Foundation |
| Massline | **Snap Discharge** | Manual cut releases a bounded ion/impulse pulse based on live line load. | Bridge |
| Massline | **Line Conductor** | Massline transmits ion and selected chain effects. | Bridge |
| Massline | **Hot Line** | High load adds heat to the anchor and player Rig. | Experiment |
| Massline | **Cold Cable** | A tether through a cryogenic zone builds Cryo on the anchor. | Arena Bridge |
| Massline | **Anchor Kick** | Impulse charge on the anchor transfers additional reaction through the line. | Bridge |
| Massline | **Tail Pop** | A rear self-charge under valid line load amplifies player exit motion. | Deepener |
| Massline | **Sling Bomb** | A released Primed anchor detonates only after its next hard collision. | Keystone |
| Massline | **Line Harvest** | Pickups near the line accelerate toward its midpoint and then the player. | Experiment |
| Massline | **Emergency Reel** | Taking hull damage briefly increases legal reel authority at high resource cost. | Experiment |
| Massline | **Twin Line** | Allow one additional light-target attachment through a dedicated Rig; strict cap. | Keystone |
| Massline | **Capstan Seed** | Deploy a hub that winds multiple eligible attachments. | Keystone |
| Massline | **Shield Web** | Attached disabled enemies intercept projectiles while lines remain intact. | Experiment |
| Massline | **Relay Cut** | Cutting a conductive line forces the stored chain to discharge at both ends. | Bridge |
| Orbit/Field | **Deflection Halo** | A small player field curves ordinary incoming projectiles. | Foundation |
| Orbit/Field | **Cryo Gyros** | Add orbit nodes that apply Cryo and weak outward impulse. | Foundation |
| Orbit/Field | **Ion Bearings** | Orbit nodes build Ionized on close pass. | Foundation |
| Orbit/Field | **Gravity Bearings** | Orbit nodes weakly pull light enemies before pushing them away. | Bridge |
| Orbit/Field | **Wide Orbit** | Increase orbit radius and reduce node pass frequency. | Deepener |
| Orbit/Field | **Tight Orbit** | Reduce radius and increase defensive coverage at collision risk. | Deepener |
| Orbit/Field | **Fast Bearings** | Increase orbital speed and reduce per-pass payload. | Deepener |
| Orbit/Field | **Heavy Bearings** | Reduce node count, increase field strength and resource cost. | Keystone |
| Orbit/Field | **Release Pattern** | Player action releases orbit nodes along their current tangents. | Bridge |
| Orbit/Field | **Capture Pattern** | Eligible returning projectiles become temporary orbit nodes. | Bridge |
| Orbit/Field | **Field Echo** | Deploying a Well creates a weaker delayed pulse at the player. | Experiment |
| Orbit/Field | **Polarity Rhythm** | Alternating activations switch pull and push behavior. | Keystone |
| Orbit/Field | **Node Sacrifice** | Destroy one orbit node to create a bounded emergency field. | Experiment |
| Orbit/Field | **Pickup Satellites** | Collected credit chips briefly orbit before converting, blocking nothing. | Cosmetic/Experiment |
| Orbit/Field | **Orbit Forge** | A fraction of root shots become persistent nodes instead of direct projectiles. | Keystone |
| Orbit/Field | **Shepherd Crown** | Orbit nodes coordinate to cluster light enemies on a player trigger. | Evolution |
| Defense/Mobility | **Wake Cutter** | High-speed travel leaves a short directional shear field. | Foundation |
| Defense/Mobility | **Impact Brake** | Qualified player collision converts some exchanged momentum into braking impulse. | Experiment |
| Defense/Mobility | **Threat Slip** | A near miss reduces boost cooldown within a bounded cadence. | Deepener |
| Defense/Mobility | **Field Skater** | Crossing a field boundary grants a brief handling bonus. | Bridge |
| Defense/Mobility | **Cold Running** | Cryo zones improve heat dissipation and reduce thrust authority less. | Arena Bridge |
| Defense/Mobility | **Hot Exit** | Leaving a hot zone grants a short forward impulse at heat cost. | Arena Bridge |
| Defense/Mobility | **Debris Screen** | Nearby dense debris receives mild attraction toward a defensive arc. | Experiment |
| Defense/Mobility | **Hullplate Projector** | Deploy a movable reflective/defensive plate. | Keystone |
| Defense/Mobility | **Reactive Repulse** | Taking a heavy hit emits a long-cooldown weak repulsor pulse. | Foundation |
| Defense/Mobility | **Tether Dodge** | Cutting a loaded line grants a brief handling window, not invulnerability. | Bridge |
| Defense/Mobility | **Momentum Armor** | Damage reduction rises with actual speed while turn authority falls. | Keystone |
| Defense/Mobility | **Anchor Stance** | Low speed increases effective mass and field resistance. | Keystone |
| Defense/Mobility | **Orbit Guard** | Orbit nodes prioritize projectile deflection while the player is not firing. | Experiment |
| Defense/Mobility | **Last Vector** | At critical hull, one deterministic emergency impulse becomes available. | Challenge |
| Resource | **Capacitor Relay** | Chain completions refund bounded capacitor. | Bridge |
| Resource | **Bank Cooling** | Successful bounces reduce weapon heat slightly. | Bridge |
| Resource | **Collision Dynamo** | Qualified collision consequences grant capacitor. | Bridge |
| Resource | **Hot Chamber** | Higher weapon heat increases payload and reduces accuracy. | Keystone |
| Resource | **Cold Chamber** | Low heat increases accuracy and proc efficiency but lowers rate of fire. | Keystone |
| Resource | **Overheat Bloom** | Forced overheat emits a bounded defensive pulse and extends lockout. | Experiment |
| Resource | **Heat Sink Children** | Split children cost no extra heat but deal reduced payload. | Deepener |
| Resource | **Proc Battery** | Increase lineage proc budget at a direct-damage penalty. | Keystone |
| Resource | **Sterile Power** | Reduce proc budget and greatly improve root payload. | Keystone |
| Resource | **Salvage Capacitor** | Collecting exposed credits grants a small temporary capacitor buff. | Experiment |
| Resource | **Boss Feedback** | Destroying a boss subsystem clears one weapon heat lock. | Challenge |
| Resource | **Dry Fire Field** | When ammunition is empty, the weapon emits a weak impulse-only shot at capacitor cost. | Experiment |
| Economy/Style | **Collision Dividend** | Qualified collision kills grant additional Arena Credits. | Foundation |
| Economy/Style | **Bank Bonus** | First bank kill each wave grants bonus XP. | Experiment |
| Economy/Style | **Variety Contract** | Using distinct causal tags raises score faster; repeated tags decay. | Foundation |
| Economy/Style | **Danger Pickup** | Credits collected near active threats are worth more within a cap. | Experiment |
| Economy/Style | **Clean Sweep** | Collect all spawned wave credits before cleanup for a small reroll resource. | Challenge |
| Economy/Style | **No Repair Bonus** | Entering a block without repair raises score, not combat power. | Challenge |
| Economy/Style | **Salvage Speculator** | Unspent Arena Credits gain a bounded block bonus. | Experiment |
| Economy/Style | **Boss Bounty** | Destroying optional boss systems increases shop quality. | Bridge |
| Economy/Style | **Physics Sponsor** | Physical kills grant more credits; direct weapon price rises. | Ruleset |
| Economy/Style | **Purist Contract** | One root weapon only; modifier offers deepen that root. | Ruleset |
| Evolution | **Storm Carom** | Bounced hits chain through Ionized targets; direct hits cannot chain. | Evolution |
| Evolution | **Gravity Blender** | Orbit fields cluster marked targets; a timed release throws them outward. | Evolution |
| Evolution | **Sling Bombardier** | Massline anchor receives amplified impulse payload and collision priming. | Evolution |
| Evolution | **Cryo Furnace** | Orbiting cryo control and thermal root shots alternate Thermal Shock windows. | Evolution |
| Evolution | **Closed Circuit** | Build a conductive loop; completing it emits one room-scale bounded pulse. | Evolution |
| Evolution | **Kinetic Loom** | Piercing shots leave short force threads that align later projectiles. | Experiment Evolution |
| Evolution | **Debris Crown** | Collision kills create bounded gameplay debris captured into orbit. | Experiment Evolution |
| Evolution | **Pinball Thunder** | Multishot banks build Ionized and seek new targets after each bounce. | Evolution |
| Evolution | **Event-Horizon Rack** | Split missiles become short-lived moving gravity sources; child count is reduced. | Experiment Evolution |
| Evolution | **Capstan Mass** | Snarl network winds inward and converts line tension into score and damage. | Experiment Evolution |
| Evolution | **Needle God** | One extremely fast, precise, piercing root with no descendants and massive commitment. | Evolution |
| Evolution | **Storm Nursery** | Many low-payload descendants apply setup states but cannot directly kill above a floor. | Experiment Evolution |
| Evolution | **Thermal Engine** | Weapon heat powers Wake Cutter and orbit speed; overheat becomes dangerous payoff. | Experiment Evolution |
| Evolution | **Mirror Fortress** | Deployed plates and bank shots create a player-built defensive geometry. | Experiment Evolution |
| Evolution | **Bad Gravity** | Player fields become stronger but also couple the player ship at full strength. | Curse/Keystone |


# Appendix C: example thirty-wave run

This is a paper run for Ricochet Foundry. It is not a balance commitment. Its purpose is to demonstrate cadence, build development, arena mutation, and counterpressure.

## C.1 Starting state

```text
Hull: Wasp
Root weapon: Pulse Laser S
Rig: Repulsor
Starting Arena Credits: 100
Initial purchases:
  Pulse Laser upgrade package 25
  Light handling component 15
  Repair reserve 10
Unspent: 50
Seed: FOUNDRY-EXAMPLE-01
```

## C.2 Draft path used in this example

```text
Draft 1: Bank Shot
Draft 2: Twin Mount
Draft 3: Ion Payload
Draft 4: Smart Bank
Refit 1: buy Relay Lance sidearm; repair; retain Wasp
Draft 5: Relay Arc
Draft 6: Wall Charge
Draft 7: Conductive Priority
Draft 8: Bank Relay
Evolution: Storm Carom
Refit 2: buy Deflection Halo; improve cooling
Draft 9: Collision Dividend
Draft 10: Massline Conductor
Draft 11: Return Angle
Draft 12: Closed Loop
```

The build begins as geometry, becomes geometry plus conductivity, then bridges into Massline and a closed circuit. Another seed and choice path should produce a completely different run in the same arena.

## C.3 Wave-by-wave paper recipe

| Wave | Arena state | Encounter | Intended beat |
|---:|---|---|---|
| 1 | Plates fixed; shutters idle | 6 Wasp Swarmers from one gate | Fire at plate, see a bank, learn enemy-fire asymmetry. |
| 2 | Same | 8 Swarmers from two staggered gates | First density payoff; likely first draft. |
| 3 | One slow shutter | 6 Swarmers + 1 Lancer | Lancer occupies direct lane; bank path is safer. |
| 4 | One slow shutter | 10 Swarmers in two batches | Twin Mount or other early topology becomes visible. |
| 5 | Furnace active | Elite Swarmer + 6 mass bodies | Elite uses furnace block; introduce exposed reward pickup. |
| 6 | Loose plate unlocked | 8 Swarmers + 1 Reaver | Player can move plate or use it as cover. |
| 7 | Alternating gate | 1 Mine-Layer + 8 Swarmers | Outer loop becomes dangerous; geometry decision changes. |
| 8 | Shutter closes side lane | 14 Swarmers in bounded batches | Build payoff wave; many bodies, low durability. |
| 9 | Absorbent screen enemy | 2 screens + 6 Swarmers + Lancer | Direct counterpressure without bounce immunity. |
| 10 | Boss configuration | Mirrorjaw Foreman + 6 support Swarmers | Bank into rear, bait charge, or use loose plate. |
| 11 | Both shutters active | 8 Swarmers + 2 Reavers | Re-establish pace after refit; more crossfire. |
| 12 | Plates rotate between waves | 12 Swarmers + 1 Relay Drone | Ion/chain bridge opportunity. |
| 13 | Furnace pulse | 2 Lancers + 8 Swarmers | Long reach pressures static bank position. |
| 14 | Loose plate contested | Bruiser pushes plate + 8 Swarmers | Geometry is no longer fixed. |
| 15 | Protect objective | Hold reflective calibration plate for 45 s | Build must defend and position, not only kill. |
| 16 | Fast shutter | Mine-Layer + 2 Reavers + 8 Swarmers | Route planning and threat priority. |
| 17 | Conductive rail active | 12 Swarmers + Relay Drone + Cleanser | Chain build meets cleansing counterplay. |
| 18 | Furnace draws loose bodies | 16 Swarmers in waves | Cluster and bank spectacle; performance stress. |
| 19 | Screen formation | 2 insulating screens + Bruiser + Lancer | Break formation physically or flank geometry. |
| 20 | Major system event | Mirrorjaw Mk II + movable shield tender | Boss controls a plate; player can steal its geometry. |
| 21 | Furnace unstable | Volatile props added; 10 Swarmers | New risk: banks can ignite environmental payloads. |
| 22 | Shutters desynchronized | 14 Swarmers + 2 Mine-Layers | No permanent safe outer loop. |
| 23 | Plate rotation during wave | 2 Lancers + 10 Swarmers | Smart Bank must adapt to moving normal. |
| 24 | Conveyor current | Bruiser + Reavers + loose plates | Foundry borrows a mild directional law without becoming Cinder Sluice. |
| 25 | Disable objective | Capture/disable an elite calibration ship | EMP, Massline, and control receive value. |
| 26 | High-density knot | 20 light enemies in bounded batches + Cleanser | Mature chain build payoff and counterpressure. |
| 27 | Furnace overload warning | Timed survive/clear objective | Arena becomes the primary threat. |
| 28 | Triple-role composition | Lancers + Mine-Layer + Shield Tender + mass | Full role literacy. |
| 29 | Final weakness test | Insulators spread formation; heavy anchor occupies bank lane | Force alternate physical solution before finale. |
| 30 | Final Foundry system | Forge Regent: Mirrorjaw core, rotating plate crown, furnace control | Build a loop, move geometry, disable systems, survive room mutation. |

## C.4 Example run narrative

Wave 1 teaches a single bounce. The player chooses Bank Shot. By wave 4, Twin Mount makes the bank corridor visually and mechanically different. Ion Payload arrives before the first boss, so bounced hits begin marking bodies even though chaining is not yet available.

The first boss is defeated by banking around its front plate. The player buys Relay Lance at refit, giving the Ionized state an immediate second use.

During Act II, Relay Arc and Conductive Priority turn the loose plate and rail machinery into path decisions. Wall Charge makes bounce geometry physically relevant even when chain targets are sparse. Bank Relay converts the build into Storm Carom: chains only begin after a bank.

The second boss steals a reflective plate. The player must decide whether to destroy the shield tender, move the plate with Massline, or use a direct lane.

Act III introduces volatile props and moving plate angles. Collision Dividend pushes the player to use loose bodies. Massline Conductor connects the signature verb to the electrical build. Return Angle creates a second traversal of the room.

The final evolution, Closed Loop, is powerful only if the player constructs a valid network. The final boss rotates reflective plates and controls the furnace, so the player must build the loop under changing geometry. The climax is not a larger damage number. It is the room becoming the circuit.

## C.5 Alternate viable builds in the same seed

### Mass Driver

```text
Autocannon
+ Impulse Core
+ Torque Core
+ Wall Driver
+ Collision Dividend
+ Unmooring Charge
+ Kinetic Cascade
```

Strategy: throw enemies and plates, cause terrain impacts, use boss charge against machinery.

### Mirror Fortress

```text
Pulse Laser
+ Bank Shot
+ Hullplate Projector
+ Deflection Halo
+ Moving Mirror
+ Return Angle
```

Strategy: construct safe geometry, redirect fire, release plates as weapons.

### Furnace Bloom

```text
Plasma Cannon
+ Incendiary Payload
+ Wall Fork
+ Furnace Bank
+ Volatile Mark
+ Thermal Pressure
```

Strategy: use hot surfaces and volatile props, sacrifice direct precision for area reactions.

### Needle Geometry

```text
Railgun
+ Hard Angle
+ Piercing Core
+ Overpenetration
+ Last Bank
+ Sterile Power
```

Strategy: very few precise shots, high commitment, no proc storm.

All four should finish the arena through different decisions. If one cannot, the arena or grammar needs work.

---

# Appendix D: agent packet template

Copy this only after a stable roadmap ID has been assigned.

````markdown
<!-- LIFETIME: ACTIVE_PACKET -->
# [PQ-XXX] — [Bounded player-visible outcome]

```yaml
queueId: PQ-XXX
lifecycle: ready
acceptance: unproven
sourceDirection:
  - design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md
  - [other exact authority]
dependencies:
  - [integrated dependency]
writeSet:
  - [exact paths or bounded owner surfaces]
nonGoals:
  - [explicitly excluded outcome]
```

## Player contract

In ordinary play, the player can:

> [one sentence describing the visible result]

## Why this packet exists

[Current observed gap, not a historical assumption.]

## Current owner audit

| Concern | Current owner/path | Reverified fact |
|---|---|---|
| State | | |
| Mutation | | |
| Presentation | | |
| Input | | |
| Save/reset | | |
| Performance | | |
| Validation | | |

## Entry conditions

- [ ] Dependencies are integrated.
- [ ] Current branch/HEAD/dirty paths recorded.
- [ ] Exact foreign hunks preserved.
- [ ] Current behavior reproduced.
- [ ] Focused characterization exists.
- [ ] Performance cost model recorded where relevant.

## Implementation

- [ ] Implement the smallest coherent owner-side change.
- [ ] Use deterministic time/order/RNG.
- [ ] Route through canonical writers.
- [ ] Preserve Browser/Electron one-path behavior.
- [ ] Add accessibility semantics with presentation.
- [ ] Keep non-goals out.

## Acceptance

### L0

- [ ] Syntax/schema/import/data validation.

### L1

- [ ] Seconds-scale owner behavior.

### L2

- [ ] Determinism, ownership, reset/save, adjacent regression.

### L3, only if claimed

- [ ] Ordinary player route.
- [ ] Browser/Electron cell as declared.
- [ ] Visual/readability/accessibility judgment.

### L4, only if claimed

- [ ] Matched performance profile.
- [ ] No visual quality cut.
- [ ] Target/floor comparison.

## Stop conditions

- Do not repeat an unchanged failed probe.
- Preserve failure fingerprint.
- Reduce product/harness/non-determinism failures to the owner seam.
- Return `PASS`, `FAIL`, `NEEDS HUMAN`, or `DEFERRED` for this packet only.

## Receipt

- Candidate digest:
- Commands:
- Route:
- Seed/build:
- Evidence:
- Result:
````

---

# Appendix E: source and ownership map

Re-audit before implementation.

| Concern | Current source/direction |
|---|---|
| Product fantasy and emphasis | `design/VISION.md` |
| Durable pillars and controls | `design/GDD_2_0.md` |
| Physical primitive/state/outcome grammar | `design/PHYSICAL_PLAY_GRAMMAR.md` |
| Physical-play seam analysis | `design/PHYSICAL_PLAY_BUILD_PLAN.md` |
| Program authority and status | `design/program/` |
| Execution protocol | `design/program/roadmap/00_EXECUTION_PROTOCOL.md` |
| Architecture and single-writer contracts | `ARCHITECTURE.md`, nearest `AGENTS.md` |
| Existing Sandbox setup | `src/ui/sandbox/sandboxSetup.js` |
| Deterministic Lab | `src/testing/lab/`, `scripts/sf-lab.mjs` |
| Canonical weapons | `src/data/weapons.js` |
| Combat actions/statuses/subsystems | `src/data/combatDefs.js`, `src/combat/` |
| Physics authority/contact | `src/core/physicsAuthority.js` and current Rapier owners |
| Massline | current tether/attachment/constraint owners |
| Field kernel | current fields system and combat status coupling |
| Enemy roles | `src/data/enemies.js` |
| Spawn cap/accounting | `src/systems/spawnBudget.js` |
| Campaign encounter pacing | `src/systems/encounterDirector.js` |
| Ship grant/fit/derived stats | `src/systems/ships.js` and current ship owner |
| Campaign economy | `src/systems/economy.js` or current economy owner |
| Causal collision/death presentation | current collision-consequence, combat, presentation adapter, and VFX owners |
| Validation | `docs/VALIDATION_WORKFLOW.md`, validation broker, deterministic Lab |
| Performance | `design/PERF_BUDGET.md`, runtime witness, current performance packets |
| UI grammar | `src/ui/AGENTS.md`, `styles/AGENTS.md`, active frontend authority |
| Visual assets and VFX standards | `docs/visual-assets/README.md` and cited standards |
| External mechanics reference | Kooapps’ *Bullet Knight*, used only for behavioral inspiration: frequent build transformation, ricochet, chain, multishot, orbit/control, and run cadence. No code, assets, characters, maps, or text are to be copied. |

---

# Appendix F: unresolved product decisions

These questions should be answered by evidence or an explicit owner decision, not by whichever agent edits the first file.

## F.1 Name

Working terms:

- umbrella: **Crucible**;
- scored ruleset: **Survival**;
- developer/player experimentation surface: **Combat Lab**;
- existing implementation surface: **Sandbox**.

Do not rename existing UI until the frontend packet decides whether Combat Lab is a tab, a preset family, or a new label.

## F.2 Entry fiction

Options:

- main-menu mode;
- station simulator;
- illegal arena;
- corporate weapons lab;
- faction trials;
- dream/simulation;
- no fiction.

Recommendation: direct menu first. Fiction later.

## F.3 Manual aim and auto-fire

Recommendation:

- manual aim remains default;
- optional auto-fire may exist as accessibility or challenge support;
- root weapon targeting never becomes an invisible full replacement for player intent;
- orbit/field builds still require active piloting and positioning.

## F.4 Draft pause

Recommendation: full pause in standard single-player Survival. Slow-time drafting can be a challenge mode.

## F.5 Hull changes

Recommendation: allow hull changes only at ten-wave refits, at meaningful cost, after compatibility UI exists.

## F.6 Friendly fire

Recommendation:

- physical collisions and arena hazards affect enemies;
- ordinary enemy projectile friendly fire remains limited for readability;
- explicit enemy roles and boss systems may use friendly fire;
- player-caused redirection owns causal credit.

## F.7 Mid-run save

Recommendation: omit from first ten-wave and first thirty-wave slice. Add only after run determinism and checkpoint semantics are solid.

## F.8 Randomness

Recommendation:

- seeded offers and waves;
- enough randomness for replay;
- deterministic build-code reproduction;
- a draftless ruleset as a control group;
- no hidden adaptive manipulation of every offer.

## F.9 Meta progression

Recommendation: unlock possibility, not permanent combat stats.

## F.10 Endless mode

Recommendation: victory at wave 30 first; endless is an optional continuation.

## F.11 Adventure rewards

Recommendation: no campaign material reward in the first version. Later rewards require explicit settlement through campaign owners.

## F.12 Score visibility

Experiment:

- visible multiplier and sparse style tags;
- mostly hidden causal variety with a detailed results screen;
- unscored mode for players who dislike score pressure.

## F.13 Enemy count fantasy

Recommendation: optimize toward the largest density that preserves physical truth and readability, not a marketing number.

## F.14 Procedural arenas

Recommendation: five authored arenas before generation.

## F.15 Network features

Recommendation: no architectural distortion for hypothetical co-op or public leaderboards. Preserve stable data and determinism because they are independently valuable.

---

# Closing directive

Build the Lab first.

Then build one run.

Then build one room.

Make one ordinary gun become three different machines.

Make one wall, one enemy, one field, one tether, and one piece of debris participate in the same causal event.

Measure it. Reproduce it. Make it readable. Make it fun.

Only then multiply the content.

Crucible is not a detour from SpaceFace. It is the furnace in which SpaceFace’s actual game is made visible.
