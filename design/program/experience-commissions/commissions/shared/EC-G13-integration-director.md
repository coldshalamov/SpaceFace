# EC-G13 — Integration director — complete coverage without a new bureaucracy

## Director's card — read this first

*From the creative director, 2026-11-09. The standard, the cast and the build order are in [09 — Creative direction](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/09_CREATIVE_DIRECTION.md). Where this card and the brief below disagree on **scope or order**, the card wins. On **ids, canon and who owns which state**, the brief wins.*

**What this is for:** keeping every commission pointed at one game. Use 09 as the standard: the Town Recipe, the Road Cast, the Stranger Test and the build order. No more than six PRs in flight. Helios first and alone until it passes; the Place Kit comes out of it; nobody writes another plan.

**Build first:** nothing. Review Helios Slice 1 against the Stranger Test and say plainly whether it passes.

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
**Native parents:** `Q1`, `Q2`, `Q3`, `Q4`, `Q5`, `W2`, `W3`  
**Source-review baseline:** `f95de0eb1ba7560839209936afba48c7b96fe41a` · 2026-11-08  
**Commission status:** authored; current gameplay must be inspected, not presumed complete or absent.  

This is a complete, standalone assignment for an implementation agent with the repository. Its EC label is a document address, not a new task queue or runtime identifier. Read current native authority and reconcile changed source before acting. New scene treatments and numerical composition bands are design proposals commissioned by the owner; existing IDs and inherited opportunity obligations remain authoritative unless deliberately migrated.

## Player promise

Own the connections and the coverage. A sector PR is an increment toward an inhabited universe, not evidence that the universe is finished. Keep the actual main build playable, integrate coherent work, expose missing connections and make the next meaningful deficiency visible—without creating another scheduler, endless review ceremony or a separate reality on a branch.

## Diagnose the actual gap

Answer these by inspecting current source and the ordinary route; they are not questions to return to the owner.

- Reconcile each commission with the current native parent, exact source paths, open PRs and claimed work. The included crosswalk is a starting map, not a stale lock or a whole-game completion certificate.
- Start through ordinary menus and use the game’s own routes. Inventory public modes, station screens, settings, save/load, map, missions, fitting, ownership and recovery. A feature with no public route is disconnected, not complete.
- Distinguish build availability, implementation, focused verification, actual player-route evidence, visual/feel acceptance and whole-area coverage. Keep these separate in the existing status surfaces.

## Required construction

### Dispatch complete ownership, not microscopic chores

Assign one area to a lead with concrete source base, native parents, promised outcomes and exact writable paths. Assign shared fixes to the shared owner; area leads remain responsible for integrating them. Use bounded related INFERENCE leaves to finish the experience, not to replace it.

### Integrate in useful increments

A sector may ship in several coherent commits/PRs; the remaining scope stays explicit. Merge only under actual authorization and the repository’s current workflow. When one shared capability is ready, integrate a real consumer before spreading it everywhere. Do not hold an already useful slice hostage to unrelated global work.

### Keep coverage honest

Track the 25 existing sector identities, 40 headline-level slots, seven ladder arenas, four zone-development scopes, separate authored Crucible arc, and the other public routes. These are review dimensions, not a new task queue. For each, identify what is implemented and what actually passed. New sector IDs or public modes detected later require reconciliation, not quiet omission.

### Review from the player’s side

Use the current taste rubric and a combined independent product/engineering critique at meaningful boundaries. Reviewers receive an ordinary route and build, not a script that tells them what to admire. Require concrete findings: unreachable person, unreadable threat, identical-looking places, boring repeated job, lost state, bad camera, confused next action. Fix material failures and recheck the affected boundary.

### Prevent false progress

Reports, tests, schemas, catalog entries and screenshots are supporting evidence, not the delivered game. A working lamp does not close all of Lantern Ward; a first wave does not close Swarm. Already-true reconciliation is useful housekeeping, not a new content outcome. Never pad unit counts or mark subjective acceptance from source comments.

### Continue with a bounded frontier

After a coherent PR, select the highest-impact unfinished promise within the assigned program. Maintain exact next actions in the existing native owner state. Stop the commission when its declared coverage and acceptance are satisfied, or checkpoint honestly when tools/runtime/permission prevent more work. Do not keep inventing optional features once the agreed experience is complete.

### Release means connected play

Exercise new/continued Adventure through an owned operation and meaningful return; Swarm launch→combat→upgrade→boss→result/retry; authored Crucible; race/range temporary-mode isolation; all supported settings/input/accessibility and save recovery. Package/browser/Electron paths share the same actual game. Unavailable hardware acceptance stays explicitly unverified.

## Representative integrated scenes

- Integrate a sector PR that passes unit tests but has a misleading in-world quest marker; reopen the relevant outcome and repair the connection.
- Integrate a shared camera fix and replay an interior, a harbor and a crowded fight instead of requiring every leaf to commission a new reviewer.
- Complete a cross-sector journey and a full Swarm loop on the main candidate, recording exact unresolved limitations.

## Direct acceptance and finite stopping point

- Every promised surface has an owner and an evidence state; no area is implicitly complete because a child ticket closed.
- The canonical main build, not only isolated branches, passes the applicable ordinary-route checks.
- No new queue/parallel ledger overrules native dispatch, and no permission boundary is bypassed.
- The final verdict identifies specific unfinished outcomes when evidence is absent rather than laundering them into “done.”

## Reject these substitutes

A new plan-generation engine; endless audits without source changes; counting documentation as shipped play; three reviewers for every CSS leaf; “optimal” as an unexplained magic word.

## Deliverables

Integrated changes, native status reconciliation and a usable exact next-work frontier. This is an execution/integration role, not permission to alter everyone’s claimed files simultaneously.

## Existing owners and coordination

- `design/program/finish/MASTER_LANES.md`
- `design/program/finish/EXECUTION_STATUS_2026-11-06.md`
- `design/program/NOW.md`
- `build_map.md`
- `build_map_done.md`
- `design/program/INFERENCE_IDEAS.md`
- `design/program/finish/campaigns/Q3/RUBRIC.md`

Coordinate with `EC-G01`, `EC-G02`, `EC-G03`, `EC-G04`, `EC-G05`, `EC-G06`, `EC-G07`, `EC-G08`, `EC-G09`, `EC-G10`, `EC-G11`, `EC-G12`, `EC-G14`, `EC-G15`. These are consumers/collaborators, **not all-finished-first prerequisites**. Agree the smallest shared interface, prove it in a real consumer, and let both sides progress. A geographic owner must not duplicate this shared mechanism; this shared owner must not hold all content hostage while pursuing a general framework.

## Commission execution supplement — branch and proof

**Existing draft PR ownership:** This brief already lives on `experience-commissions/EC-G13-integration-director`. Add implemented source, assets and verification **on this same branch**; do not open another agent-prompt PR. Refresh current master, native Finish execution, open PR overlaps and exact `NOW.md` claims before writing. Local ownership never overrides a canonical shared writer; request a linked interface/fix when necessary.

**Professional design challenge:** Play the ordinary route, classify what's missing or poorly connected, compare at least two full solutions, and implement the one providing the greatest agency, spectacle or world coherence for acceptable cost. This is the INTEGRATION/DISPATCH director. Do not create another queue or edit everybody's claimed files. Link actual area work, preserve status ownership, reopen incomplete outcomes, and prove assembled game journeys before accepting major milestones.

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
