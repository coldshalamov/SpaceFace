# EC-G10 — The first hour is already the game

## Director's card — read this first

*From the creative director, 2026-11-09. The standard, the cast and the build order are in [09 — Creative direction](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/09_CREATIVE_DIRECTION.md). Where this card and the brief below disagree on **scope or order**, the card wins. On **ids, canon and who owns which state**, the brief wins.*

**What this is for:** the first hour, by the minute. 0: you undock into someone else's morning. 2: first hail. 5: your rope is on a lamp. 10: the lamp is lit and the radio mentions you. 20: Benny's bus needs a hand. 40: you leave for Tethys with a crate. 60: a second town already has a nickname for you.

**Build first:** minutes zero to ten, until a stranger smiles at minute ten.

**Director's amendment, 2026-11-10** — after reading the code; see [10 — The game](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/10_THE_GAME.md), decision D6. **This replaces the minute list above.** The opening already contains the game's best moment — flinging the raider into a rock at about minute two (`src/systems/onboarding.js`) — and then buries it under ten minutes of drills and about twenty verbs. Keep its own best beats, in this order, with nothing between them:

1. Spawn with the 47-A sample rock marked and one caption of premise.
2. Twenty seconds of thrust and brake.
3. Latch, reel, cut.
4. Swing the rock through the derelict.
5. The raid: fling the raider into a rock.
6. Claimed salvage — take it or leave it; if you take it, outrun the search.
7. Mine the sample.
8. **The Skim as a scene.** The black-line ship takes the tow in front of you and the escorts die on screen. Today it is text about ships the player never saw (`src/systems/missionStoryOps.js`).
9. Kessler's line, with a face.
10. Dock at Helios into Lamps-Up. Orla's lamp is the first town job; the alloy run to Tethys — the safe trip — is the one recommended contract.

Shooting drills, the extra verbs (`missingThree.js`) and the five powers (`powerSituations.js`) move to minutes fifteen to forty, one about every ninety seconds, taught by situations or at the Dione range. The title screen shows two doors, **Adventure** and **Swarm**, side by side. New game asks nothing: defaults, with Custom behind one button. The first trip is Tethys, not Ceres.

**Also written out, 2026-11-10:** the opening is Book 0 of [16 — The story, shown](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/16_THE_STORY_SHOWN.md); the first-evening basics it must meet are in [19 — What players expect](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/19_WHAT_PLAYERS_EXPECT.md).

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
**Native parents:** `W5`, `W1`, `X3`, `X5`  
**Source-review baseline:** `f95de0eb1ba7560839209936afba48c7b96fe41a` · 2026-11-08  
**Commission status:** authored; current gameplay must be inspected, not presumed complete or absent.  

This is a complete, standalone assignment for an implementation agent with the repository. Its EC label is a document address, not a new task queue or runtime identifier. Read current native authority and reconcile changed source before acting. New scene treatments and numerical composition bands are design proposals commissioned by the owner; existing IDs and inherited opportunity obligations remain authoritative unless deliberately migrated.

## Player promise

The opening is not preparation for a game elsewhere. Within the harbor the player sees useful work, finds a person, performs a satisfying action and understands a next possibility. The first hour should produce a small story, a more capable personal ship and a reason to leave—and a reason to return.

## Diagnose the actual gap

Answer these by inspecting current source and the ordinary route; they are not questions to return to the owner.

- Start from a clean profile through the ordinary title/new-game route. Use only presented guidance on the first pass. Record lost intent, unreadable controls, waiting, modal interruptions, navigation mismatch and promised assets that are not resident.
- Separate a missing tutorial explanation from a bad interaction. Do not patch a confusing control with three more popups before testing a better affordance.
- Check current input remapping and mode-specific bindings in source; never copy obsolete keys from an old design document.

## Required construction

### Opening image and first action

Target an initial minute with control, a recognizable inhabited place and a small approachable intervention. Do not force a combat ambush inside Helios sanctuary. Show the signature physical possibility safely through actual work; a player may watch before acting.

### A useful first social connection

An existing contact has an address and a concise offer. Accepting is not the only way to help; physical action can be recognized afterward. Teach available/active/return states through the real interaction, not a separate UI tutorial slide.

### An earned first loop

Within the early harbor/nearby route, complete one work→settlement→useful improvement loop. The first ship-sheet visit explains one actual fitting choice and lets the player use it. Avoid a catalogue dump, empty reward or irreversible build selection.

### Three continuing interests

Make trade/work, exploration/story and combat capability visible as options without requiring three simultaneous tutorials. Recommend one clear next action based on the current committed progression; preserve the others in existing UI. Swarm is accessible independently, not locked behind an hour of Adventure.

### Pacing bands are diagnostics

Use approximately 0–5 minutes for arrival/agency, 5–15 for a first complete local outcome, 15–30 for acquisition and a meaningful route, and 30–60 for a second place and a returned consequence. These are tuning hypotheses, not clocks that punish slow or exploratory players. Observe actual play and revise staging without shrinking the intended learning outcomes.

### Recovery teaches reliability

Leaving a job, missing a timing window, damaging a load or dying must leave an understandable next step. Save/Continue should reestablish current purpose without replaying the entire introduction. Do not repeatedly ask first-run configuration questions or require debug resets to regain control.

## Representative integrated scenes

- Fresh keyboard/mouse player reaches the first completed local job and equips a useful part.
- A player refuses the first offer, explores, returns and still finds a meaningful coherent route.
- A player reloads during an accepted job, completes it and returns to a correctly changed place.

## Direct acceptance and finite stopping point

- An unbriefed ordinary-route first-hour run does not stall on inaccessible actions, false objectives or mandatory lore reading.
- Every tutorial claim corresponds to a real action available on the current ship/control scheme.
- The first meaningful reward has an immediate practical use and remains owned after refit.
- Helios sanctuary, independent Swarm access and saved onboarding state are preserved.

## Reject these substitutes

More popups as the default cure; a cinematic intro with no agency; mandatory first-hour combat; one completed tutorial checkpoint called a finished first hour.

## Deliverables

Current-route onboarding, attention and guidance integration. S01 owns the place; G01 owns social affordances; G09 owns campaign transitions; this owner tests their actual sequence.

## Existing owners and coordination

- `src/data/newGameDefaults.js`
- `src/core/gameState.js`
- `src/systems/missions.js`
- `src/ui/bindings.js`
- `src/ui/missionPreflight.js`
- `src/data/lanternWardGuidance.js`

Coordinate with `EC-S01`, `EC-S02`, `EC-S03`, `EC-G01`, `EC-G07`, `EC-G09`, `EC-G11`, `EC-G12`. These are consumers/collaborators, **not all-finished-first prerequisites**. Agree the smallest shared interface, prove it in a real consumer, and let both sides progress. A geographic owner must not duplicate this shared mechanism; this shared owner must not hold all content hostage while pursuing a general framework.

## Commission execution supplement — branch and proof

**Use this existing draft commission PR branch:** `experience-commissions/EC-G10-the-first-hour-is-already-the-game`. Add implementation commits and evidence here; do not make another planning PR or an unrelated issue farm. First inspect current master, concurrent PRs, native Finish campaign/status and exact `NOW.md` write claims. Shared code remains with canonical one-writer owners; organize dependent PRs only when path conflicts require them, with the consumer in this PR remaining accountable for real play.

**Technical and creative direction:** Diagnose a named broken/immature player route before extending any architecture. Compare 2–3 remedies for the largest gap and implement one justified by visible usefulness, motion/readability, durability and expected cost. Prove in real Adventure and/or Swarm consumer scenes; never close from a disconnected test harness. Build a visible feature with existing owner state; do not substitute a stat-rich screen for distinct player agency.

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
