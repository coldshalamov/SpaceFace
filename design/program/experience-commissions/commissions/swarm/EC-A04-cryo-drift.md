# EC-A04 — Cryo Drift

## Director's card — read this first

*From the creative director, 2026-11-09. The standard, the cast and the build order are in [09 — Creative direction](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/09_CREATIVE_DIRECTION.md). Where this card and the brief below disagree on **scope or order**, the card wins. On **ids, canon and who owns which state**, the brief wins.*

**The toy:** no grip — whatever you push keeps going. Frozen enemies shatter when something heavy slides into them. **The moment:** one shove starts a chain that clears the rink.

**The secret:** something is frozen under the floor. Shatter all four corners in one slide.

**Build first:** the slide and the shatter. If the sliding is not fun on its own with no enemies, stop and fix that.

**Written out, 2026-11-10:** the whole of Swarm — the loop, what is on the floor, the drops, the freight lanes, every enemy and its answer, all thirty rounds by name, the bosses and Madame Kiln's lines — is in [12 — Swarm: the Pit](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/12_SWARM_THE_PIT.md). The guns, power bends and mods it hands out are in [11 — The Armory](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/11_THE_ARMORY.md). Build from those; do not invent rounds, enemies or drops.

**Also written out, 2026-11-10:** this arena's floor — where the guns hang, where the freight runs, what the doors open, the traps, the loop a good player runs, the secret and the round-thirty boss — is laid out in [15 — The seven arena floors](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/15_ARENA_FLOORS.md). Build the grey-box loop first.

### How to build this and check your own work

Swarm has the best fast tools in the project. Use them in this order.

1. **Look first.** Play three real rounds and read the contact sheet: `npm run player-truth -- --mode=swarm --arena="<name>" --rounds=3 --seed=4242`. Interface stills: `node scripts/ui-bench.mjs --shot=crucibleHud` (also `crucibleDraft`, `crucibleResults`). That is your "before".
2. **Iterate with no screen.** `simulateCrucibleSwarm` in `scripts/lib/bench/crucibleBench.mjs` runs seeded waves with a scripted or idle pilot in seconds; `node scripts/check-crucible-swarm-bars.mjs` and `node scripts/run-fun-bench.mjs` read the result.
3. **Then real clicks:** `node scripts/probe-crucible-playtest.mjs --arena=<id> --seed=<n> --rounds=<n>` saves frames you must open and look at.
4. **Later rounds:** `node scripts/probe-crucible-stress.mjs` forces round fifteen. A proper "start at arena X, round N, spawn enemy Y" command does not exist yet — it is part of EC-G17; until then, reuse that probe's method.
5. **Frames:** `node scripts/probe-crucible-perf.mjs` before and after, back to back in one sitting. The Foundry was last measured at a median 65 ms a frame, which is about 15 frames a second. Nothing in Swarm will feel good until EC-G11 lands; do not hide that by lowering what is on screen.
6. **Stranger Test for an arena or a wave block:** a fresh agent, given only your contact sheets, must be able to say what this room's trick is, name two enemies and how they differ, and say what changed between round one and round ten.

**The ways agents have fooled themselves on this project. Check each before you say done.**
- *It is in the data and not in the game.* Fifteen enemy looks were authored and never drawn. Find your change on a contact sheet.
- *Only the Foundry is route-tested.* If you touch another arena, play it.
- *Harder by numbers.* More of the same enemy is not escalation. A new named situation is.
- *A feature in a menu that should be in the room.* If the player does not have to move for it, it is not part of the fight.
- *Fun faked with shake, particles or slow motion.* If the throw is not satisfying without them, fix the throw.
- *"Done" on a partial.* Say what works, what does not, and what you could not look at.

**How to use this card.** Existing names, bosses and ids stay. Everything else is yours to invent — decide, build, look. If an idea here plays badly, replace it with something that does the same job and say so in the PR. **This PR is ready when its "Build first" slice passes.** The rest of the brief follows in a second PR.

---

**Direct execution commission · Swarm arena completion**  
**Native parents:** `SWARM`, `X2`, `PQ-174`  
**Source-review baseline:** `f95de0eb1ba7560839209936afba48c7b96fe41a` · 2026-11-08  
**Commission status:** authored; current gameplay must be inspected, not presumed complete or absent.  
**Existing identity:** `cryo_drift`  

This is a complete, standalone assignment for an implementation agent with the repository. Its EC label is a document address, not a new task queue or runtime identifier. Read current native authority and reconcile changed source before acting. New scene treatments and numerical composition bands are design proposals commissioned by the owner; existing IDs and inherited opportunity obligations remain authoritative unless deliberately migrated.

## The room and the feeling

Cold preserves a shape until heat makes it spectacularly temporary. The room is beautiful and dangerous in different regions, not uniformly blue. The player reads thermal opportunity through bodies, surfaces and action: prepare, commit, fracture, escape. The controls remain a promise even when the fiction is hostile.

**Native ladder seed at the reviewed baseline:** `73314`. Reconcile current source rather than overriding a deliberate later revision. This room is one of the seven ladder arenas; its EC label is not an arena ID.

## Build the physical room

- Compose distinct cold and hot working pockets with a neutral traversal/refuge strip and two cross routes. Use the current native Cryo Lock/Burning/Thermal Shock behavior as truth; do not infer or add player-control penalties from the names.
- Begin with four visually distinct thermal sectors, two or three useful fracture/cover clusters and a bounded supply of native loose bodies. Not every ice shard becomes a physics entity. The neutral route remains large enough for a supported baseline hull under combat pressure.
- Communicate thermal boundaries with surface treatment, moving fixtures and accessible symbols—not solely red/blue color. A body’s actual status must be readable and retire correctly when the condition ends.
- Give gun builds good positioning and field/line builds a way to carry a prepared body into an advantageous region. No single required damage type or hidden status combination blocks the round.

## The first fight and its development

- Opening: one region and one state interaction are demonstrated cleanly.
- Development: movement between thermal regions creates a deliberate combination.
- Pressure: a ranged threat contests the neutral strip while another enemy can be exploited thermally.
- Boss: show which native components can receive the relevant state and which cannot; do not fake a weakness in effects.
- Aftermath: broken cover and surviving prepared mass give the next wave history without an ever-growing debris cost.

## Required physical opportunities

- Move a compatible prepared body into a thermal contrast and exploit the actual native result.
- Use neutral cover to recover or reposition rather than tolerate a mandatory status lock.
- Choose an alternate route when a useful cluster has broken instead of respawning it invisibly.

## Presentation at gameplay scale

Ice depth, hot metal and neutral refuge are readable through material and structure. Protect highlights; do not whiten the whole frame on fracture. Thermal feedback has concise sound and a muted equivalent. Keep important hulls distinct from crystal clutter.

## Shared mechanics back into Adventure

The current mapping uses Vesta’s Slag Radiation Field/coolant extraction failure. Reuse the real physical/thermal vocabulary for industrial recovery, not the arcade reward loop.

## Arena-specific acceptance

- Status, damage/impulse and presentation agree; no lingering frozen visual after recovery.
- Reduced-motion/flash modes preserve thermal boundaries and timing.
- Repeated fractures do not leak bodies, particles or draw resources across waves.

## Reject

Uniform blue tint; freeze as unexplained input theft; arbitrary elemental immunity; screen-white fracture effect; a growing heap of unbudgeted shards.

## Native starting points

- `src/data/adventureArenaSites.js`
- `src/systems/swarmArena.js`
- `src/data/swarmMode.js`
- `src/render/industrialMaterialFamilies.js`

## Arena ownership and stopping boundary

This commission owns the physical room, its ordinary camera-scale presentation, its native environmental law, readable approaches and how existing fighting uses those things. It does not own a new wave generator, private score, global difficulty curve, upgrade economy, actor budget or physics simulation. Coordinate roster/pressure changes with the current Swarm owner and the appropriate zone commission. Shared combat belongs to G08, camera to G02, performance/residency to G11. The exact-path claim—not the arena name—authorizes a code edit.

Use the current `src/data/swarmLadder.js`, `swarmMode.js`, `combatLabSetups.js`, `survivalArenas.js` and active Swarm program as truth. The seven ladder arenas have authored seeds and unlock rules; the separate thirty-wave Crucible arc is not this ruleset. Preserve existing save/record and unlock identities. Do not require a player to lose persistent Adventure equipment to try a run. A temporary Swarm build can end with the run, but persistent entitlements and clear records must settle honestly.

A round has a finite cohort and a player-earned release. No surviving enemy is silently deleted to manufacture a clear. The native roster and admission owner determine spawn legality; an arena contributes meaningful approaches and fair geometry, not hidden spawns inside the player or a wall. First specialist exposure should be readable before a mixed encounter tests it. Keep the existing boss cadence—currently first at wave 5, then 15, 25 and so on—unless the canonical program explicitly changes it; a ten-round zone label does not authorize a different boss clock.

Interpret terrain counts below as composition targets inside the native live/retained budgets, not additional pools. Preserve moved objects, surviving terrain and their identities rather than snapping a pristine room back into place each wave. Reset only at the appropriate new-run boundary. Broad structural geometry need not be dynamic. Do not manufacture hundreds of rigid-body props to make a scene look busy; the Brood and physical ships already have distinct scaling strategies.

Prove the room through ordinary launch, meaningful gun and physical-tool play, a specialist encounter, the native boss, an upgrade, continued combat, death/result/retry and a clean exit. Test at least a baseline gun style and a line/field/ram style when the current hull/loadout roster supports them. Use fixed authored seed for comparability and another supported seed/pressure state to expose brittle staging; do not claim a custom run earns ladder credit when it does not. Relevant targeted state fixtures may supplement, not replace, ordinary play.

Judge in motion at intended density. An unfamiliar reviewer should be able to identify the room’s physical rule, an exploitable opportunity, the current danger, why a collision/kill occurred, and an escape/repositioning option. Compare the public arena preview with the actual fighting space; no false marketing image. Big effects are in-world and directional; no screen-filling white flash. Muted and reduced-motion play must remain readable. Adventure chatter, unrelated faction/news notices and technical-debug jargon do not belong in the round.

Close only when the named composition, environmental interactions, public lifecycle, continued-use cases and negative paths actually work, with no known broken control, inaccessible enemy, dishonest clear/score or presentation failure in scope. A nice empty screenshot, a physics fixture, one working first wave or a new model alone cannot close the arena. Optional additional mutators can wait; the promised room cannot. Use the native taste review and batch evidence rules; do not invent per-wave capture quotas or claim independent critique from a self-review.

## Commission execution supplement — branch and proof

**Existing draft PR ownership:** This brief already lives on `experience-commissions/EC-A04-cryo-drift`. Add implemented source, assets and verification **on this same branch**; do not open another agent-prompt PR. Refresh current master, native Finish execution, open PR overlaps and exact `NOW.md` claims before writing. Local ownership never overrides a canonical shared writer; request a linked interface/fix when necessary.

**Professional design challenge:** Play the ordinary route, classify what's missing or poorly connected, compare at least two full solutions, and implement the one providing the greatest agency, spectacle or world coherence for acceptable cost. Test whether this arena's distinctive environmental physics can be explained by its picture and the first fight, with no opaque labels. Coordinate all `swarmArena.js`, `swarmLadder.js` and roster edits with one authorized writer; wave progression is owned by the Z commissions. No enemy construction during combat.

**Proof:** Exercise baseline and improved entry, a meaningful action, its response, an alternate or negative path, and recovery/restart/Continue where relevant. Inspect actual video frames, camera stability, light/material identity, HUD and audio-muted equivalents; measure worker-step timing, presentation jitter, main CPU, GPU and asset admission on a representative crowded scene. No performance gain by reducing resolution or depopulating the scene. Keep physics/economy/save outcomes native and deterministic.

**Finite stop:** Every named scope obligation must work; a useful partial remains **AREA INCOMPLETE**, unavailable hardware/route remains **UNVERIFIED**, and a passing test isn't subjective acceptance. Apply current independent review requirements, including three reviewers where mandated. PR handoff names changed production source, exact route/seed/renderer, evidence, remaining defects and next action.

Follow [v2 execution protocol](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/06_AGENT_PR_EXECUTION_PROTOCOL.md) and [concurrent authoring map](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/07_PARALLEL_AGENT_DEPLOYMENT.md), subject to current native authority.

## Execution contract — own the experience, not just the files

You are the implementation lead for the named commission. Produce working gameplay source/assets directly on this existing draft PR branch; only canonical shared-owner dependencies justify linked PRs. This is an execution assignment, not a request for another plan, prompt, simulation transcript, catalog, or test-only demonstration. Your responsibility includes design judgment, source integration, presentation, failure recovery, and the ordinary player route. A subordinate's completed component does not discharge your responsibility for the whole.

**Establish truth before replacing things.** Read the current `AGENTS.md`, relevant nested instructions, `design/VISION.md`, the applicable parts of `design/GDD_2_0.md`, and the current master-plan campaign/lane/status. Inspect `git status --short`, exact relevant diffs, open PRs and `design/program/NOW.md`. Read the named native parents in this commission. Inspect the existing route in the running game; trace its source owners. Classify each promised outcome as working, present-but-poor, disconnected, absent, blocked by a shared defect, or unverified. A prose claim, a shipped catalog row, and a passing unit test are not equivalent to a working experience. Preserve the good parts and finish their missing connections.

**Do not start a competing backlog.** The EC-S/EC-G/EC-A/EC-Z/EC-C labels in this document are commission labels, not new queue IDs. `build_map.md` is specification/history with dispatch closed; current master lanes govern execution. `INFERENCE_LANES.md` §0.2 explicitly supports area development. Absorb related `INFERENCE_IDEAS.md` leaves into this outcome; do not count them as unrelated extra accomplishments. Check `build_map_done.md` and live code before rebuilding a shipped feature. Record authoritative status in the existing campaign/lane context. The attached manifest and reconciliation tool are read-only aids, not a second scheduler.

**Make implementation decisions rather than requesting taste decisions from the owner.** Compare two or three credible ways to solve each important missing connection. Select the simplest complete result that preserves the intended feeling and offers useful play. Explain substantial departures briefly in the PR. The arrival treatment, causal outcomes and rejection examples are commitments; incidental set dressing, exact dimensions, incidental dialogue and staging are design variables. Do not preserve a bad parameter merely because it is already in code. Conversely, do not rewrite a sound architecture to make your contribution look larger.

**Work in an integrated loop.** Inspect the public route → identify the most consequential missing/broken experience → implement it through canonical owners → exercise it in the real scene → inspect the resulting image, motion, sound and interaction → fix the material failures → continue through the remaining named scope. Begin actual production once enough is known to make a responsible edit. If research has stopped changing the design decision, stop researching and build. Do not substitute a month of harness construction for one finished encounter.

**Use specialists when available.** Delegate meaningful, disjoint work: spatial composition/assets, gameplay and continuity, interaction/audio, and independent product/engineering critique. Give each specialist an exact deliverable, current source base, read dependencies, reserved write paths and a merge/interface contract. Retain integration ownership yourself. A single-agent environment performs these roles sequentially; do not claim independent review when the same agent merely changed hats. Review the integrated result at a meaningful boundary, not every tiny edit. Follow current repository batch-verification rules rather than inventing screenshot or reviewer quotas.

**Shared code is not owned by geography.** Twenty sector agents must not each replace `world.js`, the camera, the contact renderer or the mission engine. Claim exact current paths, place local composition/behavior in the appropriate existing extension seams, and coordinate a narrowly specified shared fix with its owner. Define the consumer contract and complete other independent work while waiting. A blocked shared fix leaves the affected acceptance claim open; it does not justify stubs or stop unrelated authorized work. Keep concurrent foreign edits; no reset, clean, stash, force-push, broad staging, or unapproved extra worktree. Integrate remote changes by the repository's current permitted workflow.

**One truth for every consequence.** Physics, cargo, economy, missions, law, world records, progression, saves and presentation retain their canonical writers. Send intents and consume committed results. Visuals and dialogue must not invent success, a payment, a death, an infection, a delivered shipment or ownership. Use stable IDs plus generation checks where transient entity IDs can be reused. Use seeded RNG and simulation time, not wall-clock timers or ambient randomness. Do not create a parallel infection ledger, quest database, faction reputation calculator, or private credit balance.

**The current owner's boundaries are part of the design.** Remain ship-scale; this commission does not add an on-foot game. No enemies constructing new structures during combat. Preserve acquired Adventure options: meaningful consequences may change a place, but routine fitting, alliance repair and business recovery must not require a fresh character or forced prestige reset. Swarm is an exuberant combat expression of shared mechanics, not a second incompatible physics game. Ship fittings must change usable capabilities and their presentation, not just numerical labels. Do not manufacture extra complexity as a substitute for finishing ordinary interactions.

**Use the actual asset pipeline.** Check existing shipped and unintegrated assets before authoring replacements. Reuse is not a creative ceiling: produce missing structure, motion, material or audio when the experience needs it, using the current Forge/release workflow and coordinated manifest ownership. Temporary blockouts are useful during development but cannot pass visual acceptance. Never count a turntable, a promotional image, a hidden flag or a debug spawn as the normal game.

**Measure budgets without sacrificing the promise.** Numbers of opportunities and routine roles below are authored coverage, not permission to keep every actor, rigid body, light and effect active. Respect native global budgets; reuse crews between phases; use existing far-state/persistence mechanisms and bounded pools. Measure representative crowded routes, not empty scenes. Do not lower resolution, erase atmosphere, alter physical outcomes or disable necessary behavior to conceal an unprofiled bottleneck. Claims about the owner's device require measurements on that device; software rendering is not hardware-performance evidence.

**Publish honestly.** Keep one focused outcome PR, or a clearly linked dependent stack when shared changes require it. Never put unrelated work into a convenient UI PR or bypass approval requirements. No merge or deployment unless separately authorized. Report the commit, changed production paths, ordinary entry route, what the player can now do, evidence actually obtained, and precisely what remains. A session interruption is a checkpoint, not completion: preserve the next concrete action and unresolved findings in the existing owner context. Continue eligible work while execution remains available; do not stop just because one test or one local story passed.

## Completion decision and PR handoff

Close this commission only after its full named production scope works together on the ordinary route, the local acceptance scenarios pass, required assets/presentation are integrated, and no known material defect invalidates its promise. The relevant current repository quality and performance gates still apply. A successful fixture, one finished mission, or one attractive screenshot cannot close the area. Small unrelated defects may be handed to their existing owners; a missing central interaction, repeated loss of control, false consequence, broken Continue or unreadable place may not.

Use professional judgment for the final experience review: can a player understand the situation, choose a useful action, feel its result, recover from a mistake, and want to return? Ask the reviewer for concrete failures in the actual scene, not a ceremonial word such as “optimal.” An unexplained score is not acceptance. If a material complaint remains, fix it and review the changed boundary; do not repeat unchanged tests for reassurance.

The PR description must name the ordinary route, before/after player outcome, native parent coverage, inherited opportunities completed, source/assets changed, checks actually run, visual/motion/audio evidence actually inspected, and remaining limitations. Reconcile relevant existing INFERENCE leaves individually without declaring unrelated rows complete. Preserve current native status and path ownership. Keep implementation readiness separate from route/visual/hardware acceptance when the environment cannot establish all of them. When a real session limit intervenes, leave a resumable checkpoint and keep the commission open; do not relabel partial scope as a successful smaller assignment.
