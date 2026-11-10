# EC-C01 — The thirty-wave Crucible — a course with an ending

## Director's card — read this first

*From the creative director, 2026-11-09. The standard, the cast and the build order are in [09 — Creative direction](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/09_CREATIVE_DIRECTION.md). Where this card and the brief below disagree on **scope or order**, the card wins. On **ids, canon and who owns which state**, the brief wins.*

**A course with an ending.** Thirty rounds that go somewhere: three acts of ten, a different arena toy leading each act, and a final opponent with a name, a goodbye line and a proper finish — lights up, Madame Kiln says something almost kind, your run is put on the wall. People should be able to say "I finished the Crucible".

**What the code says today:** a run ends by dying or by cashing out, and the round cap is 999 — nobody can ever win. The fourteen-boss rotation and the results screen already exist. Use them: a final boss at round thirty and a victory screen.

**Build first:** the last five minutes. If the ending lands, the rest is pacing.

**Written out, 2026-11-10:** the whole of Swarm — the loop, what is on the floor, the drops, the freight lanes, every enemy and its answer, all thirty rounds by name, the bosses and Madame Kiln's lines — is in [12 — Swarm: the Pit](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/12_SWARM_THE_PIT.md). The guns, power bends and mods it hands out are in [11 — The Armory](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/11_THE_ARMORY.md). Build from those; do not invent rounds, enemies or drops.

**Also written out, 2026-11-10:** what brings a player back after winning — Kiln's Dares, the Nightly, marks — is in [17 — The ladder, the prices and the long game](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/17_THE_LADDER_AND_THE_LONG_GAME.md) §5; the results screen and the five-second restart are in [19 — What players expect](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/19_WHAT_PLAYERS_EXPECT.md).

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

**Direct execution commission · Authored Crucible arc completion**  
**Native parents:** `PQ-133`, `SWARM`, `Q2`  
**Source-review baseline:** `f95de0eb1ba7560839209936afba48c7b96fe41a` · 2026-11-08  
**Commission status:** authored; current gameplay must be inspected, not presumed complete or absent.  

This is a complete, standalone assignment for an implementation agent with the repository. Its EC label is a document address, not a new task queue or runtime identifier. Read current native authority and reconcile changed source before acting. New scene treatments and numerical composition bands are design proposals commissioned by the owner; existing IDs and inherited opportunity obligations remain authoritative unless deliberately migrated.

## Player promise

The authored Crucible is a course with shape, not a copy of endless Swarm with the counter stopped at thirty. A pilot learns the room's physical language, discovers how those rules combine, has the arrangement turned against them, and finally breaks a machine they now understand. The ending must feel earned because the player recognizes the problem, not because a larger health bar has arrived.

Keep this mode distinct from Swarm's seven-arena ladder and its boss cadence. The reviewed `survivalActs.js` defines three ten-wave acts, a native `foundry_plate_theft` event at wave 20, and `forge_regent_crown` at wave 30. The Regent substitution applies to the native Mirrorjaw-core arena family, not every arena by assertion. Inspect current source for later changes. Do not copy the Swarm 5/15/25 boss rule into this arc.

## Source and public-route diagnosis

Start with the ordinary Crucible launch, the actual mode/ruleset selector and active wave owner. Identify how a player distinguishes this authored course from Swarm, practice and other public modes. Inventory the existing ten-wave template, all three act transformations, arena substitutions, supply/upgrade transitions, results and profile settlement. Read the existing question for every wave before altering it. A source comment about an unchanged first ten waves is not authority to leave a currently broken route untouched, but preserve intentional baseline behavior unless the repair requires an explicit, tested revision.

Find where a real run currently loses purpose: an advertised room that looks different in play, a hidden last enemy, a forced catalogue detour, an incomprehensible specialist, a boss death with no resolution, or an arc record awarded by the wrong ruleset. Reproduce the material failures and trace the canonical writers. Use existing repeatable seeds and current route tooling. No new independent arc engine, currency, combat model or mission ledger.

## Act I — learn the machinery, waves 1–10

The first ten waves establish a small vocabulary. Each new question should be a readable variation on movement, aim, mass, cover, timing and the room's own law. Keep useful gunfire and physical opportunities visible from the first engagement. Give a new specialist a readable entrance before mixing it into overwhelming pressure. Use the template's actual authored roles and wave questions rather than this prose as an excuse for a parallel roster.

Make transitions comprehensible: what ended, what was earned, what can be changed and what starts the next wave. Preserve native agency over breather duration. Do not restart combat while the player is reading or fitting. A player with an ordinary viable kit must be able to demonstrate the lesson; do not make a single rare module the unadvertised solution. The act's climax should visibly combine established rules and leave meaningful physical aftermath under current lifetime budgets.

## Act II — familiar rules in an inconvenient arrangement, waves 11–20

The second act changes composition, approaches and arena phases, not simply enemy health. Audit the actual role substitutions and gate diversification in `survivalActs.js`: the native source already expresses this distinction. An old tool should solve a new arrangement. Escape routes remain readable, while decisions about what to throw, what to interrupt and where to stand become more consequential.

Wave 20's plate theft is an event, not a line in the result screen. Its necessary object, actor, state transition and counterplay must be perceptible. Let the event change the geometry or usable resource through the existing owner; demonstrate successful intervention and the supported failure outcome. Do not count an emitted test event as proof the player saw or affected the theft. Preserve the actual plate's identity and state, and ensure interruptions, retries and transitions do not manufacture duplicate resources.

## Act III — mastery and a real conclusion, waves 21–30

The last act combines familiar questions at higher compositional pressure within the native concurrency and physics budgets. No extra shadow population, unbounded fragments, arbitrary player-control suppression or hidden immunity. The player should use earned capabilities in ways that look extravagant while remaining causally legible.

Where the native arena uses the Mirrorjaw core, wave 30 culminates in the Forge Regent and the native crown event. Its silhouette, approach, threat, exploitable state changes, damage feedback and destruction must read as the conclusion of this course. Other supported arenas keep their deliberately authored boss identity and receive an equally coherent resolution; do not replace them with the Regent merely to satisfy a title.

A defeated final opponent must resolve through real combat and wave ownership. No deletion to force completion, false kills or lingering attacker holding a completed run hostage. Results state what was accomplished and what persists. Offer the existing sensible continuation/retry/mode-exit paths without corrupting Adventure or accidentally starting an endless wave 31 as though the authored finale had not happened. Where native design deliberately supports a post-arc mode, expose that transition clearly rather than conflating the rulesets.

## Construction obligations

Complete the whole route: title/selection → fit/preflight → first battle → breathers → three acts → both authored system events → final settlement → retry/exit. Keep the ordinary control contract and shared fit explanations consistent. Retain accessibility, muted threat readability, useful reduced effects and input remapping. Ensure advertised arena presentation matches the room on screen. A menu preview cannot establish arena acceptance.

Use the arena commission's geometry and shared combat improvements rather than a bespoke duplicate of the Foundry. Coordinate exact shared planner paths with EC-Z01–04, which own Swarm experience targets, and keep changes mode-scoped. A shared improvement should be tested in both rulesets; mode-specific progress, temporary runs and records must remain separate.

## Acceptance scenarios and stopping point

- A normal launch makes the authored course distinct from Swarm and leads into useful combat without irrelevant setup gates.
- The actual twenty-nine transitions and final settlement do not strand the pilot, lose input, create duplicate rewards or resume during a paused fitting decision. Focused checks can cover repeated state boundaries; the current repository batch route rule governs visible runs.
- Each act has a distinguishable physical/compositional purpose using the existing wave vocabulary; a reviewer can describe the progression without reading source comments.
- Wave 20's native event is observable, actionable and correctly settled on success and supported failure; moving or losing its object cannot invent completion.
- Wave 30 uses the correct arena-family boss, produces a readable conclusion, and settles the correct arc records exactly once.
- A deliberate death/retry, mode exit, supported checkpoint/resume and temporary-run save attempt preserve native campaign isolation and profile rules.
- The representative dense late fight is profiled under current engine contracts; source inspection and software rendering are not claims about the owner's hardware.
- Swarm wave 30 remains Swarm wave 30. This arc's finale does not leak into it, and the endless ladder does not accidentally award authored-arc completion.

Reject a new lore document, thirty labels, a wave-30 debug spawn, one attractive boss model, or a successful headless final-event fixture as completion. Finish the linked course and its ordinary route. If a real execution limit intervenes, publish an honest checkpoint with the next broken boundary and keep the commission open.


## Native starting points

- `src/data/survivalActs.js`
- `src/data/survivalWaves.js`
- `src/data/survivalArenas.js`
- `src/data/combatLabSetups.js`
- `src/data/swarmMode.js`
- `src/data/swarmLadder.js`

## Commission execution supplement — branch and proof

**Implementation on this existing draft PR:** `experience-commissions/EC-C01-the-thirty-wave-crucible`. Put production source, assets, real playtest evidence and fixes here; do not open a duplicate prompt/PR. Reconcile actual master, open Swarm PRs, current Finish status and `NOW.md` source claims first. Shared `swarmArena.js`, `swarmMode.js`, `swarmLadder.js` and roster writers must be assigned one active owner across all arenas/blocks. Use linked dependencies only for canonical shared-owner integration.

**Distinct combat design:** This is the **authored** 30-wave Crucible arc, not a duplication of the endless Swarm ladder. Preserve its unique scripted act/wave identity, systems, story climax, encounter meaning and result handling. Compare at least two feasible ways to improve the least convincing moment and choose a solution maximizing physically understandable agency, enemy character, encounter rhythm and replayable tactical depth for real performance cost. Do not build new enemy structures in combat, reward self-triggered collisions, make enemies bullet sponges or hide visual causes under particle whiteout.

**Proof in the actual game:** Check normal launch, multiple transition rounds, powers, different enemy sizes and counterplay, staged boss, results and restart; run existing regression/determinism tests plus a real rendered gameplay route. Inspect normal-camera image/video, keyboard/mouse/control response, audio-muted and reduced-motion equivalents. Measure dense-worker, main-thread, GPU, asset residency and memory under a named seed/hardware; no pixelation/depopulating as an optimization. Native reward/wave/mission ownership is mandatory.

**Finite completion:** Keep draft until all named round/block experiences, results and failure cases are implemented and independently reviewed (three reviewers if current native gate requires). Log changed source, ordinary route, seed, actual performance/visual evidence and exact remaining blockers; partial work remains **AREA INCOMPLETE**.

Follow [agent execution protocol](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/06_AGENT_PR_EXECUTION_PROTOCOL.md) and [concurrency map](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/07_PARALLEL_AGENT_DEPLOYMENT.md).

## Execution contract — own the experience, not just the files

You are the implementation lead for the named commission. Produce working combat source/assets directly on this existing draft PR branch; open a linked PR only for canonical shared-owner coordination. This is an execution assignment, not a request for another plan, prompt, simulation transcript, catalog, or test-only demonstration. Your responsibility includes design judgment, source integration, presentation, failure recovery, and the ordinary player route. A subordinate's completed component does not discharge your responsibility for the whole.

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
