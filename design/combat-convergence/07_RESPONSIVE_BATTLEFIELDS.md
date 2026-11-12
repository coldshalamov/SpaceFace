# 07 — Responsive battlefields and purposeful environments

**Outcome:** the environment supplies useful material, readable routes, meaningful cover, stealth opportunities, and durable consequences. Physics is central because it changes the encounter, not because every decorative object has a rigid body. Planning only. Interfaces: 03–06/08–10; existing world, material, custody, and encounter owners remain authoritative.

## Design opportunities, not random clutter

A pile of simulated objects is not yet a battlefield. Every representative encounter should offer a legible tactical geography: approach lanes, threatening positions, manipulable mass, a useful impact surface, room to evade, and an exit or recovery route. The geometry must work at the actual ship speed and camera, not only in a top-down editor still.

Place a useful amount of immediately manipulable matter near the likely first decision. The player should not equip the signature physics tool and then search an empty screen for ammunition. Include heavier objects that imply future capability, but do not fill the opening with only bodies the current kit cannot affect.

Treat negative space as authored content. A clean lane makes a sniper warning or thrown mass readable. Dense rubble can be a deliberate hazard or resource zone, not the default everywhere. Alternate readable structure, action, and recovery rather than covering every square unit with equal-interest objects.

## A shared affordance taxonomy

Use existing entity/material/interaction profiles to publish what an object can actually do. The following categories are player-facing distinctions, not a request for a second entity schema.

| Class | Mechanical promise | Visible/readable cue |
|---|---|---|
| Loose usable matter | Can be displaced; some can be captured or thrown | Distinct solid body, coherent motion and tool-preview response |
| Anchored machinery | Resists movement until an actual support or joint fails | Visible supports/load path and a meaningful break event |
| Valuable or protected cargo | Can be collected, moved, or stolen only through custody rules | Recognizable cargo form and interaction state; never anonymous absorbed ballast |
| Solid cover | Stops the attack families advertised by its material and geometry | Visible thickness, actual collision footprint, honest occlusion |
| Living worker/neutral ship | Has a task, relation, and perception state | Operational motion, facing, tools, and contextual contact identity |
| Disabled/dying/wreck hull | Different remaining agency, risk, and salvage opportunity | Lifecycle-specific movement, emissions, and interaction affordance |
| Decorative background | Provides atmosphere but not a false tactical promise | Clearly different depth/scale/treatment; no misleading tool highlight |

A prop that looks identical to usable cover but cannot block a shot is a design defect. Conversely, do not add collisions to distant scenic geometry merely to make the taxonomy universal. Choose a legible presentation difference and keep it stable across sectors.

## Material and destruction grammar

Continue the existing environment material, machinery, field, collision consequence, fracture, and salvage owners. Before adding a rule, trace its current implementation. The authoring contract should state material, mass/size envelope, anchoring, collision response, heat/volatility/conductivity, break conditions, fragment policy, custody, and persistence where relevant. Do not duplicate those values in a scene-only rule table.

Use a small number of reliably composable responses. A metal support can carry load and release a heavy section when broken. Brittle matter can crack and split into useful pieces. A volatile container can develop a visible warning and then cook off through an accepted cause. Conductive wreckage can complete an electrical path. Heat and force should not be interchangeable universal damage spells.

Breaking a structure must change the gameplay geometry as well as its appearance. Retire the original collider and admit the actual released pieces transactionally. Preserve source attribution and valuable contents. Bound fragment count and shape complexity through the existing performance policy without making a large destroyed object simply vanish or spray only nonphysical glitter.

Some debris can be cosmetic. It must not look like a large piece that ought to block a ship, take damage, or join a Gyre core. Give the important physical pieces strong continuity from parent to aftermath; use smaller cosmetic detail to enrich their breakup rather than replace it.

## Three encounter compositions to author deeply

**The debris forge.** Loose scrap, a brittle obstruction, a heavy anchored section, and protected cargo share one readable work site. Pull gathers eligible scrap; Gyre can launch it; an impact can release a real section; protected cargo remains available afterward. A direct gunfight also works, and a skilled player can exploit the layout without following a scripted combination.

**The broken gate.** A wide approach narrows around damaged industrial infrastructure. Two shield endpoints can create a useful temporary lane, but exposed ends and alternate paths let enemies counter it. A nearby mass pile offers a throw opportunity. Do not place a perfect permanent corner where every hostile becomes harmless behind a selective shield.

**The silent vault.** A powerful guard, readable patrol, occluding structure, safe observation/recharge pockets, and a separate valuable cache create a no-kill theft route. The cache's contents, opening noise, carry/tow burden, and escape route matter. The strongest enemy should remain dangerous and optional, not secretly despawn when the loot is taken.

These compositions become CEC-C/D/E in the reference suite and are then combined in CEC-F. Reuse existing sectors/arenas and authoring surfaces. Do not invent a disconnected game mode that proves the features only in a private developer demo.

## Space and time must agree

Evaluate routes as swept hulls with actual acceleration, braking, turning, and control latency. A gap that appears open but requires an impossible instantaneous turn is not useful cover. A stealth opening shorter than the actual container interaction cannot be called a feasible stealth route.

Measure time from the player's initial view to the first useful physical decision, time spent traveling without a new choice, time available to react to a major threat, and the frequency of involuntary target/camera loss. Use these observations to tune placement rather than scaling all distances by taste.

Allow multiple solutions that genuinely use different resources: bypass, disable, throw, flank, shield, fight, or abandon with partial salvage. Do not enforce exactly three solutions as a content quota; ensure the interesting encounter is not reduced to one hidden prescribed button order.

## Living world and aftermath

Workers and neutral traffic need intentional activity so the player can distinguish them from tumbling debris. Show approach, work, transfer, wait, retreat, and recovery where those states actually exist. A welding effect cannot stand in for a nonexistent repair transaction. A worker that loses its task or path needs a coherent fallback, not endless circular motion.

A fight changes the place: released material becomes potential ammunition or salvage; destroyed supports open or block routes; surviving workers react through existing perception/faction rules. Avoid perfectly resetting every local prop on a short timer simply to refill combat toys. If a production site replenishes material, make that a bounded, authored process with existing economy/world ownership.

Preserve custody and legal consequences. Throwing a civilian's cargo at a pirate may be physically possible, but ownership does not disappear because the object passed through a weapon. Incidental blast credit and crime attribution must use accepted causal evidence, not proximity to the player.

Persist meaningful structural and loot consequences through the current save/world identity system. Temporary fields, purely cosmetic debris, and transient actor detail can follow documented lifetime policies. Do not serialize renderer meshes or save every particle; do not erase an emptied cache or resurrect its loot because the sector unloaded.

## Authoring for agents

Give agents semantic building blocks that the actual loaders accept: physical materials, actor roles, objective/custody facts, supported encounter triggers, and existing scenario inputs. Creator's Dock does not currently accept arbitrary force-field objects in its lab dialect. Drive fields through production input or extend the existing adapter narrowly with validation; do not author attractive JSON that the game ignores.

A scene brief should include the player kit, starting view, intended decisions, alternative routes, actual bodies and relationships, failure/escape states, material inventory, permanent consequences, and stress case. Have a separate reviewer look for affordance lies, unavoidable damage, empty travel, inaccessible rewards, and performance traps.

Allow agents to improve placement and discover emergent tactics. Require them to retain evidence that the fixed owner outcomes still work after those improvements. A stronger scene is welcome; replacing the no-kill vault with another kill-all arena is not.

## Acceptance

CEC-C/D/E each need a normal-player route and a different legitimate solution. CEC-F must combine their useful structures without making a cluttered theme park. Test impact-induced topology changes, loose-object promotion, protected contents, failed pickup, save/Continue, sector re-entry, shield relocation, and enemy path replanning.

A player should be able to point to an object and predict whether it is alive, movable, valuable, dangerous, or only background. Wrong predictions are actionable evidence. Completion is not the number of props placed; it is the number of clear, consequential choices the layout enables without violating the game's physical rules.
