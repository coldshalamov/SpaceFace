# 01 — The game to converge on
## A physical-action sandbox with an industrial memory

The product should be recognizable in a sentence: **fly an expressive ship, turn mass and machinery into tactics, and build a place in a world that keeps working.** That statement is a synthesis of the repository vision and the current request, not a claim that every link is presently successful. The build map's two-mode ambition is compatible with it: Swarm concentrates the physical improvisation; Adventure gives that improvisation economic and narrative stakes. [VISION] [BUILD]

## 1.1 What actually differentiates SpaceFace

A conventional space shooter asks which target to shoot and which weapon to equip. A conventional trade game asks which price spread to exploit. SpaceFace can ask a better composite question: **what can I do with the objects, relative motion, and ownership relationships in front of me?** A freighter is cargo, cover, inertia, a moving anchor, a witness, and somebody's delivery—not merely an enemy with a larger health bar.

The unusual value is in the intersections, not the isolated subsystems. Towing a load changes handling; that handling changes the safe route; the route exposes the load to a claim or ambush; the intervention changes who gets paid; the payment buys a new manipulation capability. The existing Massline heads, cargo-related handling, world records, jobs, and industrial site state supply pieces of that construction. The audit does not assume all those pieces already complete this example. [ATTACH] [MODULES] [JOBS] [SITES]

The product must therefore spend its complexity budget on **situations that support several intelligible solutions**. A new commodity that behaves like every other commodity is low-value complexity. A cargo assembly that can be detached, towed behind cover, bargained over, and delivered through the same custody rules is high-value complexity. The latter also demands stronger integration, not just a new data row.

## 1.2 Design pillars with falsifiable consequences

**Trust before difficulty.** When the player loses a maneuver, they should be able to attribute it to their speed, load, timing, geometry, or opponent—not to an undisclosed brake, binding conflict, delayed camera, or hitch. Assistance is legitimate when it converts intent into an achievable maneuver; it is illegitimate when it secretly rescinds an earned outcome. This aligns with the vision but must be evaluated on the current propulsion and contact policies, which already include deliberate asymmetries. [VISION] [FLIGHT] [PHYSICS]

**Objects have affordances, not just hit points.** A light attacker is something that can be displaced or used; a heavy hull changes navigation; a tool changes a relation; a working site has a purpose and failure state. Do not make every object support every interaction. A finite, legible affordance vocabulary is better than universal simulated ambiguity.

**The world has reasons.** Important cargo originates somewhere, important responders belong somewhere, and an important price change has a cause the player can discover. This does not require simulating every background atom. It requires consistency for the subset of the world on which the player is invited to reason. The current live/virtual job adapter is an appropriate base for that contract. [JOBS]

**Progression increases expressive power.** A new build should create a maneuver, tactic, operating range, trade route, or production arrangement—not merely lengthen an endurance bar. Some numeric growth is useful. It must not become the dominant explanation for why one ship wins.

**Spectacle explains action.** The strongest effect marks the meaningful event, and its timing reveals causality. Long trails can communicate velocity. A directional flash can communicate transferred force. A lighted logistics lane can show why a machine has stopped. More effects are not automatically more information.

**Failure preserves initiative.** A setback should usually leave the player able to choose the next action. Recovery contracts, disputed salvage, damaged cargo, and changed routes are useful. An automatic multi-step restitution mission for every failed clause is not. The current world-reaction packet's “mutate, never fail” rule should become a bounded, situation-sensitive policy rather than an infinite obligation generator. [WORLDPLAN]

## 1.3 The core loop at four scales

At the **two-second scale**, the player reads a threat, commits to an input, and sees a decisive response. This includes steering, firing, attaching, releasing, braking, or accepting contact. The camera and audio are part of the response. A delayed but mathematically correct force is not a satisfying action.

At the **thirty-second scale**, the player develops and spends an advantage: acquire an anchor, pull an attacker out of formation, make room for a tow, cross a firing lane, or exploit a brief disabled state. A good encounter has setup, commitment, consequence, and recovery. Continuous maximum stimulus eliminates that shape.

At the **five-minute scale**, the player completes a local undertaking: recover a payload, resolve a convoy dispute, extract a valuable seam, test a fitted head, or commission a small site. The goal is not five minutes by stopwatch. It is a complete causal arc short enough that the player remembers why it mattered.

At the **session scale**, the player changes their options: chooses a different operating style, establishes a reliable route, equips a materially different capability, or understands a place well enough to exploit it. The industrial layer belongs here, while still producing tangible evidence at the shorter scales.

These scales should nest. A profitable delivery with no interesting immediate handling is a weak action-game loop. A spectacular fight with no reason to care about its result is a weak Adventure loop. Neither weakness is repaired by adding more total content.

## 1.4 Preserve two modes without maintaining two games

### Swarm / Crucible

Treat the Crucible as both a controlled test surface and a serious compact game mode. Its job is to produce frequent, understandable opportunities for physical improvisation, not merely to measure the Adventure player's ship in an empty arena. The build map explicitly calls for strong Swarm play. [BUILD]

Use encounter composition to alternate pressures. A pursuit group tests route choice and release timing. A heavy controller tests space management. A fragile carrier or payload gives the player something to manipulate beyond the nearest hostile. Recovery intervals permit collection, build evaluation, and deliberate repositioning. Exact wave durations and enemy counts should be tuned experimentally; they are not specified as universal laws here.

Build choices should be expressed in tactical sentences. “Your line catches softly but pays out more,” “you can bind two targets but give up a utility slot,” and “your concussion tool creates a long opening at close range” are more useful than a draft full of nearly identical damage multipliers. Use the existing head taxonomy and fitting exclusivity rather than creating a second arena-only equipment system. [ATTACH] [SHIPS] [MODULES]

A benchmark win must transfer. Re-run the selected maneuver with moving civilians, cargo, a station boundary, a different camera speed, and a save/reload boundary. Shared code is necessary, but it does not automatically make the same tuning enjoyable in different situations.

### Adventure

Adventure should be built around **activity pockets**, not an indiscriminate increase in galaxy size. An activity pocket is a place with several overlapping uses: a field, a worksite, traffic with a destination, a local need, and a reason for conflict. The inspected Ceres job adapter already names activity-pocket actors and physical targets; that is a practical integration point rather than a hypothetical new world system. [JOBS]

A strong pocket lets the player ignore its drama, help someone, exploit it, or return later. It should not require a scripted camera shot to become meaningful. It also need not be fully emergent. A carefully authored initial configuration, populated by reusable rules, is a valid systemic design. “Authored” and “alive” are not opposites.

Do not make every outcome follow the player. An NPC should sometimes complete its delivery, abandon a route, or salvage a wreck without waiting for the protagonist. But do not let those background processes erase the player's important investment invisibly. Bounded persistence and clearly represented causes are the contract.

## 1.5 A proposed first-ten-minutes slice

This is a **candidate sequence**, not a mandatory tutorial script or a declaration that the existing story must be discarded. Integrate it with the current opening and `PQ-163` rather than building a second opening.

The player first controls the actual starter Hitch in a place with enough visible geometry to understand movement. One nearby recoverable object offers a safe, useful first attachment. The goal is not to read a control chart; it is to take an object somewhere and feel how the relation changes the ship. The catalog retains `ship_kestrel` as the internal identifier but correctly names the hull Hitch. Preserve that save-compatible distinction. [NEWGAME] [SHIPDATA]

The first complication should admit at least two genuinely usable responses. A claimant can be avoided, negotiated with through the existing interaction system, or physically displaced. A route can be cut across at a handling cost or followed for safety. The game must demonstrate the alternative in geometry and behavior, not merely add two menu options whose outcomes are identical.

The undertaking then produces a visible payoff. The player hands over a payload, sees a local operation resume, receives an intelligible payment, and can try one meaningful modification. A loaner or reversible early fitting experiment can introduce a different Massline behavior before the player has purchased a large hull. The inspected starter utility slot is Small while the inspected alternate heads are Medium; that is a real access constraint to evaluate, not proof that all early progression is broken. [SHIPDATA] [MODULES]

Finally, present an optional industrial opportunity. A small, understandable geological arrangement contains a near-term extraction choice and a longer-term productive face. The player can continue flying instead. Those who engage should return to flight with evidence of a persistent operation, not a separate score screen that disappears into the economy.

The opening succeeds when the player can explain what they did, why it worked, and one thing they want to try next. Completion flags are supporting evidence; they are not the experience.

## 1.6 A reusable encounter grammar

Author encounters as **roles plus relationships plus changing stakes**. A compact specification can name an objective, valuable bodies, opposing intents, useful geometry, escalation triggers, retreat conditions, and durable outcomes. For example, a recovery job can contain a damaged hauler, a detached manifest carrier, an arriving salvor, and an obstruction. The player can escort the cargo, tow it through the obstruction, negotiate ownership, or create a diversion.

Every participating role needs a bounded commitment window. A raider must reveal its approach before applying its decisive attack. A heavy unit must become vulnerable or reposition after occupying space. A salvor should pursue the cargo rather than mysteriously switching to a clean player. The final engagement authority already performs extensive legality, motive, response-window, doctrine-phase, and jurisdiction checks. Extend coherent relations there instead of letting each new encounter bypass them. [ENGAGE]

The current convoy predation path is explicitly narrow: exact actor identities, an owned encounter, a manifest-bearing target, deadline, and leash. That is good defensive engineering for the shipped example. It also identifies the next design boundary: extract a reusable bounded relation only after a second or third real encounter demonstrates which fields are common. Do not replace it with universal faction warfare on speculation. [ENGAGE]

## 1.7 What to narrow for release

Narrow breadth before lowering craft. An excellent compact roster, a small set of economically distinct goods, a few memorable activity pockets, and a short set of industrial decisions can establish the product better than many shallow variations. Existing content should be assessed for distinct function; deletion is not automatic, and save compatibility still matters.

Defer large-scale geopolitical simulation, extensive mod support, broad localization expansion, photo-mode sophistication, and repeated whole-fleet cosmetic remasters until the core route is convincing. Accessibility, correct input hints, stable saves, and usable performance are not late polish. Audio that establishes response timing is not late polish either, even though the current build-map phase table groups audio and input truth with release work. [BUILD]

The stop rule is experiential: expand when the current slice produces different satisfying solutions with the same rules, not when all checkboxes are green. Conversely, do not demand that every system be finished before testing the slice. The purpose of narrowing is to make the truth of the game observable.

<!-- Source links are pinned to the audited commit. -->
[VISION]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/VISION.md
[BUILD]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/CANONICAL_BUILD_MAP.md#L1-L145
[FLIGHT]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/flight/propulsionKernel.js
[ATTACH]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/combat/attachments.js#L1-L210
[PHYSICS]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/sg02DynamicBodyOwner.js
[NEWGAME]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/data/newGameDefaults.js#L1-L180
[SHIPDATA]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/data/ships.js#L1-L160
[SHIPS]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/ships.js#L1-L170
[MODULES]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/data/modules.js#L1-L165
[SITES]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/asteroidSites.js#L1-L200
[ENGAGE]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/ai/engagementAuthority.js
[JOBS]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/npcJobsRuntime.js#L1-L195
[WORLDPLAN]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/roadmap/active/PQ-138.md#L1-L170
