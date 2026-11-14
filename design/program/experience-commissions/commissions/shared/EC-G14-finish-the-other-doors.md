# EC-G14 — Finish the other doors — racing, practice and public mode continuity

## Director's card — read this first

*From the creative director, 2026-11-09. The standard, the cast and the build order are in [09 — Creative direction](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/09_CREATIVE_DIRECTION.md). Where this card and the brief below disagree on **scope or order**, the card wins. On **ids, canon and who owns which state**, the brief wins.*

**What this is for:** the other ways to play live *in towns*, not only on a menu. The race starts from the Tethys bypass; practice is the Dione range; you reach them by flying there.

**Build first:** the Dione range as the practice door.

**Also written out, 2026-11-10:** getting in fast — seconds to the title, seconds to a run, nothing to choose unless asked — is in [19 — What players expect](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/19_WHAT_PLAYERS_EXPECT.md).

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
**Native parents:** `X5`, `Q2`, `Q5`, `RF-01`, `RF-02`, `RF-03`, `RF-08`  
**Source-review baseline:** `f95de0eb1ba7560839209936afba48c7b96fe41a` · 2026-11-08  
**Commission status:** authored; current gameplay must be inspected, not presumed complete or absent.  

This is a complete, standalone assignment for an implementation agent with the repository. Its EC label is a document address, not a new task queue or runtime identifier. Read current native authority and reconcile changed source before acting. New scene treatments and numerical composition bands are design proposals commissioned by the owner; existing IDs and inherited opportunity obligations remain authoritative unless deliberately migrated.

## Player promise

A game feels unfinished when its less-frequent doors lead to prototypes. Preserve and finish the existing public racing, practice, Range/Combat Lab and alternate encounter routes without turning them into separate games or stealing Adventure saves. This is not permission to build a new racing engine.

## Diagnose the actual gap

Answer these by inspecting current source and the ordinary route; they are not questions to return to the owner.

- Inventory the currently reachable menu routes and their real owners. Distinguish seven Swarm ladder arenas from the two additional combat-lab catalog entries `ceres_belt` and `tethys_hub`; do not falsely count them as new ladder unlocks.
- Inspect current circuits and contracts: Textile Belt, Tally Circuit and Veil Wash; practice, approach/course/handoff and existing temporary-flight semantics. The pace beacon is a guide, not proven simulated opponent AI.
- Test state exit, camera restoration, records, restart, controller focus and failed launch before adding ghost/rival features from older plans.

## Required construction

### A complete race lifecycle

Reach the board, understand course and current fit, start through the ordinary route, approach/align, count down, cross ordered gates, finish, hand off where required, receive the correct record/reward and retry or leave. Every stage needs truthful visible status and a recoverable failure.

### Terrain is raceable

Courses need an intentional readable line, useful margins, meaningful turns and an aligned finish approach. Preserve real gate-plane crossing/time logic. Camera presentation may change, but native ship physics and input remain the same. Do not teleport a live campaign ship to fake the approach.

### Isolation and return

Temporary flights preserve campaign state across completion, failure, crash/error where supported, retry and exit. A campaign-started contract instead uses actual local travel and save semantics. Closing a view returns the correct camera preference and input owner.

### Records describe what happened

Separate clean from recovery runs; explain whether records are local and how loadout differences are treated. Do not label a distance-weighted pace line a recorded replay ghost. Implement missing RF features only through their current admitted owner and truthful UI.

### Practice teaches useful capabilities

Range/Combat Lab routes let players try current fits and powers safely, with readable targets and a clear exit. Temporary inventory and rewards cannot leak into Adventure. The non-ladder arena entries either work as their intended public tools or are honestly removed from public selection under the existing owner.

### Public shell quality

Check menu focus, resizing, pause, audio settings, remapped controls, reduced motion, confirmation/cancel, help and error messages across these routes. Repair issues in the current interface grammar instead of launching another frontend redesign.

## Representative integrated scenes

- Complete Burned Canopy/Pace Light through approach, course and actual station handoff; verify no false payout at the finish.
- Run practice, use recover, finish, inspect the correct record and return to the untouched campaign.
- Open a non-ladder lab setup, try a fitted physical tool, leave and resume ordinary play with correct camera/input/state.

## Direct acceptance and finite stopping point

- Every public door in scope has a complete usable launch→play→result→retry/exit lifecycle.
- Campaign saves and persistent equipment remain correct.
- Displayed opponent, timing, record and reward claims match the actual implementation.
- No new mode-specific simulation fork or undocumented camera/input leak.

## Reject these substitutes

Only polishing the board screenshot; pretending a pace beacon is AI; rewriting races into minigames; neglecting legacy public routes; using record resets to hide incompatibility.

## Deliverables

Finished public-mode boundaries and current RF integration; sector agents preserve raceable routes rather than silently blocking them with new outpost geometry.

## Existing owners and coordination

- `docs/RACING_MODE.md`
- `design/program/RACING_FLIGHT_PROGRAM.md`
- `src/render/racingCameraBlend.js`
- `src/data/combatLabSetups.js`
- `src/data/survivalArenas.js`
- `src/ui/screens/raceBoard.js`

Coordinate with `EC-S01`, `EC-S03`, `EC-S10`, `EC-G02`, `EC-G07`, `EC-G12`. These are consumers/collaborators, **not all-finished-first prerequisites**. Agree the smallest shared interface, prove it in a real consumer, and let both sides progress. A geographic owner must not duplicate this shared mechanism; this shared owner must not hold all content hostage while pursuing a general framework.

## Commission execution supplement — branch and proof

**Existing draft PR ownership:** This brief already lives on `experience-commissions/EC-G14-finish-the-other-doors`. Add implemented source, assets and verification **on this same branch**; do not open another agent-prompt PR. Refresh current master, native Finish execution, open PR overlaps and exact `NOW.md` claims before writing. Local ownership never overrides a canonical shared writer; request a linked interface/fix when necessary.

**Professional design challenge:** Play the ordinary route, classify what's missing or poorly connected, compare at least two full solutions, and implement the one providing the greatest agency, spectacle or world coherence for acceptable cost. The modes and public launch routes must remain one shipped game, with consistent input/camera/save authority; do not create a disconnected mode just to increase menu breadth.

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
