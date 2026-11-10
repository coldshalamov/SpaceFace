# EC-G12 — Persistence and recovery — the same universe after Continue

## Director's card — read this first

*From the creative director, 2026-11-09. The standard, the cast and the build order are in [09 — Creative direction](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/09_CREATIVE_DIRECTION.md). Where this card and the brief below disagree on **scope or order**, the card wins. On **ids, canon and who owns which state**, the brief wins.*

**What this is for:** what a town remembers after Continue — its marks, what its faces think of you, the Berth Board, and the state of its toys (a cracked bell stays cracked).

**Build first:** the Helios lamp and board, through save, quit and Continue.

**Director's amendment, 2026-11-10** — see [10 — The game](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/10_THE_GAME.md), decision D8. **Dying makes a job, not a loading screen.** Today death takes your cargo, may charge insurance and wakes you at a berth (`src/systems/combat.js`). Instead: your wreck and your spilled cargo stay where you died, as real objects. You wake at the nearest berth with a line to them on the map, and somebody else — Juno, a salvor, a scavenger — is already heading there. Getting it back is a tow.

**Build this alongside the line above:** the wreck and cargo persisting through Continue, and one rival heading for them.

### How to build this and check your own work

A shared system is finished when a town or an arena is visibly better because of it — never on its own.

1. **Pick the one place named under "Build first"** and capture it today. That is your "before".
2. **Use the fast look that fits:** an interface screen — `node scripts/ui-bench.mjs --shot=<id> --walk`; a behaviour — `node scripts/agent-loop.mjs sim <scenario> --trace`; a Swarm run — `npm run player-truth -- --mode=swarm --rounds=3`. Do not boot the whole game to look when one of these can show it.
3. **After every step:** the one narrow test, then `npm run test:fast`. Never the full `npm run check` while something is red.
4. **Boot and frames:** `node scripts/check-game-playable.mjs`, then `node scripts/check-hitch-budget.mjs --out=<file>` before and after, back to back in one sitting.
5. **Show it in the place.** The same capture as step 1, after. Put both in the PR.

**The ways agents have fooled themselves on this project. Check each before you say done.**
- *A system nothing calls.* If no town or arena uses it yet, it is not built.
- *A second way to do something the game already does.* Find the existing owner and extend it.
- *Green test, nothing on screen.* Go and find it in the running game.
- *The working folder passes and the commit does not.* Check what you committed.
- *A reference result edited to make a check pass.* Never.
- *"Done" on a partial.* Say what works, what does not, and what you could not look at.

**How to use this card.** This card narrows the brief to the first thing worth finishing. **This PR is ready when its "Build first" slice is visibly working in the named place.** The rest of the brief follows in a second PR.

---

**Direct execution commission · Shared experience completion**  
**Native parents:** `Q2`, `Q5`, `W1`, `P3`, `LW-02`  
**Source-review baseline:** `f95de0eb1ba7560839209936afba48c7b96fe41a` · 2026-11-08  
**Commission status:** authored; current gameplay must be inspected, not presumed complete or absent.  

This is a complete, standalone assignment for an implementation agent with the repository. Its EC label is a document address, not a new task queue or runtime identifier. Read current native authority and reconcile changed source before acting. New scene treatments and numerical composition bands are design proposals commissioned by the owner; existing IDs and inherited opportunity obligations remain authoritative unless deliberately migrated.

## Player promise

A continuous game must keep the things the player earned and the consequences they caused. Save/Continue is not a utility menu at the edge of the design: it is the guarantee that this is one world rather than a sequence of demonstrations.

## Diagnose the actual gap

Answer these by inspecting current source and the ordinary route; they are not questions to return to the owner.

- Inspect the actual current save schema/migration route before naming fields. Trace stable identity, ownership, mission state, contact memory, facilities, cargo and run/profile separation.
- Exercise cold start, Continue, failed load, death/recovery, sector transitions, temporary race/range launches and interrupted purchases. Identify false resets, double settlement, recycled-ID confusion and state projected as success too early.
- Use current failing tests/known defect ledger as evidence, but verify outdated findings against current source.

## Required construction

### Canonical durable facts

Persist only through existing domain/save owners; no per-sector serialized blob that duplicates credits, actors or ownership. Keep stable object/character IDs and generation guards for live references. Reconstruct bounded presentation from facts rather than saving arbitrary meshes/timers.

### Transactions are restart-safe

Purchases, delivery, rescue, control transfer, construction, progression and contact settlements cannot pay twice or lose assets on retry/reentrant events. Preserve a clear interrupted/uncertain state where truth is unavailable rather than optimistically declaring success.

### Return state is coherent

On reentry, restore working routes, residents, damage/infestation, services and indicators before claiming they are ready. Missing hardware is not proof it was destroyed. Historic mission completion is not proof a currently removed lamp is still lit.

### A failed operation still has a next action

Define recoverable results for lost actors, destroyed cargo, denied docking, insufficient funds, missing assets and malformed saves. Explain the state in player terms. Required progression needs a lawful recovery/alternative, not a hidden debug reset.

### Keep modes separate where they are separate

Temporary race/range flights do not overwrite an Adventure campaign. Swarm run state and persistent profile unlocks settle through the existing owners. Confirm exit, retry and loading paths release the correct lease/context and preserve user settings.

### Migrate without erasing identity

New fields/retired definitions get explicit migrations and compatibility handling. Preserve owned hulls, stored parts, place IDs, discovered routes and existing ending facts. Test representative old/current saves and corrupted input safely; do not “fix” migration by silently starting a new game.

## Representative integrated scenes

- Save while towing the actual job cargo, Continue, complete and settle once.
- Capture/refit a hull, store a part, acquire an outpost, Continue and observe the same owned assets and production.
- Complete a temporary race, return to the campaign, then load a save with an interrupted local story and recover through ordinary UI.

## Direct acceptance and finite stopping point

- No known asset duplication, earned-progress erasure, false resurrection or required softlock in the covered lifecycle.
- All new state has a declared native writer and migration/restore behavior.
- Ordinary mode exits and failed-load recovery are usable without developer tools.
- Local test evidence and real public-route evidence are reported separately.

## Reject these substitutes

A second save system; backup as a substitute for correct transactions; silent new-game fallback; auto-paying an unverified event; indefinite “resolving” state with no player recovery.

## Deliverables

Shared identity, transaction and lifecycle repairs plus focused scenario coverage; area agents supply their own concrete interrupted-state fixtures.

## Existing owners and coordination

- `src/save/saveSystem.js`
- `src/save/migrations.js`
- `src/world/worldRecords.js`
- `src/world/farActorTable.js`
- `src/systems/shipControlTransfer.js`
- `src/systems/automationOperations.js`

Coordinate with `EC-S01`, `EC-S04`, `EC-S09`, `EC-S25`, `EC-G05`, `EC-G07`, `EC-G09`, `EC-G14`. These are consumers/collaborators, **not all-finished-first prerequisites**. Agree the smallest shared interface, prove it in a real consumer, and let both sides progress. A geographic owner must not duplicate this shared mechanism; this shared owner must not hold all content hostage while pursuing a general framework.

## Commission execution supplement — branch and proof

**Use this existing draft commission PR branch:** `experience-commissions/EC-G12-persistence-and-recovery`. Add implementation commits and evidence here; do not make another planning PR or an unrelated issue farm. First inspect current master, concurrent PRs, native Finish campaign/status and exact `NOW.md` write claims. Shared code remains with canonical one-writer owners; organize dependent PRs only when path conflicts require them, with the consumer in this PR remaining accountable for real play.

**Technical and creative direction:** Diagnose a named broken/immature player route before extending any architecture. Compare 2–3 remedies for the largest gap and implement one justified by visible usefulness, motion/readability, durability and expected cost. Prove in real Adventure and/or Swarm consumer scenes; never close from a disconnected test harness. Save recovery must compare world truth, held cargo, person identity and consequences—not merely a byte-equal serialized flag.

**Measure, don't hope:** Capture reproducible first-use and stressed routes, including actual gameplay view and input response. Attribute worker simulation, transport interpolation, render/DOM CPU, GPU, asset residency and memory cost independently. Use active master-plan performance bars, matched-before/after measurements, and current hardware/renderer identity. No pixelation, removal of useful content, disabling relevant systems or replacing authoritative motion with infinite cosmetic extrapolation to claim improvement.

**Finite acceptance:** All named relevant public routes and failures, interruption and Continue, accessibility treatment and cross-mode consumers must operate through canonical writers. Use the current native review gate, including three independent reviewers where the campaign requires them. Attach code paths, exact commit, route, measurements/limits, independent findings and unresolved next action. A partial subsystem remains **AREA INCOMPLETE**, and a build passing tests but unplayed/uncaptured is **UNVERIFIED**.

Read [v2 agent protocol](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/06_AGENT_PR_EXECUTION_PROTOCOL.md) and [parallel ownership map](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/07_PARALLEL_AGENT_DEPLOYMENT.md).

## Execution contract — own the experience, not just the files

You are the implementation lead for the named commission. Produce working source and necessary authored assets on this assigned draft PR branch; use a separate linked implementation PR only for a canonical shared-owner reason. This is an execution assignment, not a request for another plan, prompt, simulation transcript, catalog, or test-only demonstration. Your responsibility includes design judgment, source integration, presentation, failure recovery, and the ordinary player route. A subordinate's completed component does not discharge your responsibility for the whole.

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
