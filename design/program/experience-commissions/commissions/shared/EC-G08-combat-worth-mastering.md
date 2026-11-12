# EC-G08 — Combat worth mastering — shared verbs and enemy character

## Director's card — read this first

*From the creative director, 2026-11-09. The standard, the cast and the build order are in [09 — Creative direction](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/09_CREATIVE_DIRECTION.md). Where this card and the brief below disagree on **scope or order**, the card wins. On **ids, canon and who owns which state**, the brief wins.*

**What this is for:** enemies you can tell apart and describe afterwards.

**The single biggest win in Swarm, found in the code on 2026-11-09:** fifteen ship types and about thirty Brood families are already authored, each with its own colour, shape, size and ability names — and almost none of it reaches the player. The look is stamped on each ship at spawn (`src/systems/waveMaterialization.js`) and **never drawn**; only the Brood renderer reads its own sheet. The ability names are **read by nothing**, so every ship still behaves the way its old built-in type did. The bestiary exists and is invisible.

**Build first, in this order:** (1) the ship renderer draws the stamped colour, shape and size, so every type reads at a glance from the top-down camera; (2) each ability name does the thing it says, one type at a time, starting with the first five a new player meets; (3) pack leaders with a name, a tell and a grudge.

**Proof:** a line-up still of all fifteen types in one arena where a stranger can sort them into groups without labels.

**Written out, 2026-11-10:** each of the fifteen enemies — what it reads as, the one thing it does, and the physical answer to it — is tabled in [12 — Swarm: the Pit](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/12_SWARM_THE_PIT.md). Draw and wire them to match that table.

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
**Native parents:** `SWARM`, `PQ-137`, `PQ-139`, `PQ-140`, `PQ-174`, `PQ-175`, `PQ-176`  
**Source-review baseline:** `f95de0eb1ba7560839209936afba48c7b96fe41a` · 2026-11-08  
**Commission status:** authored; current gameplay must be inspected, not presumed complete or absent.  

This is a complete, standalone assignment for an implementation agent with the repository. Its EC label is a document address, not a new task queue or runtime identifier. Read current native authority and reconcile changed source before acting. New scene treatments and numerical composition bands are design proposals commissioned by the owner; existing IDs and inherited opportunity obligations remain authoritative unless deliberately migrated.

## Player promise

Swarm should be gratuitously satisfying because the causes are physical and legible: a pull assembles a problem, a shove solves it violently, a line turns mass into a tool, and a gun cuts down what should die quickly. Adventure inherits those trustworthy mechanics while keeping civilian stakes, law and authored context. No enemy construction system belongs in this commission.

## Diagnose the actual gap

Answer these by inspecting current source and the ordinary route; they are not questions to return to the owner.

- Play current ordinary Swarm and one Adventure encounter before changing parameters. Separate an invisible attack, weak effect, poor enemy decision, actual physics failure and simulation stall.
- For each current enemy family, inspect silhouette, approach, tell, attack, recovery and exploitable response. A doctrine name in code is not character; a random strafe oscillation is not a tactic.
- Read the existing feel contract, active Swarm taste program and current owner rulings. Preserve fixed-good behavior such as ordinary line durability and avoid reinstating rejected drag/gyro/HP-sponge solutions.

## Required construction

### Verbs have complete lifecycles

Audit Pull, Shove, Pin, Bomb, Rig, Massline and relevant weapons from acquisition/input through target selection, denied/accepted activation, physics, effect, recovery and feedback. Repair inconsistent cause/cooldown/cancel behavior. Each useful combination is derived from supported rules, not a special cutscene.

### A readable enemy grammar

Make each existing family identifiable by silhouette, motion and attack behavior. Preserve a small set of complementary roles—fodder, charger, ranged pressure, heavy anchor and disruption—as the design backbone. Introduce unfamiliar specialists cleanly before combining them. Fix target/phase oscillation with evidence-based commitment and release semantics.

### Pressure without cheating

Maintain native spawn clearance, meaningful approach, finite cohort accounting and earned breathing room. Do not inflate HP to compensate for poor composition. Hard enemies should change a decision, not merely take longer to kill. Escaping a bad position must remain possible with supported starter kits.

### Physics creates the spectacle

Hits visibly transfer appropriate momentum, bodies collide honestly, useful heavy objects remain usable and collateral belongs to the real cause. Keep player-control protections and current mass/impulse policies. A dramatic effect cannot hide a failed physical action; an ambient pile-up must not award the player a chain they did not cause.

### Mode-aware context

Share physical laws and enemy capabilities, but keep encounter budgets, attention, rewards and social consequences mode-specific. A clean Swarm fight does not import Adventure chatter. Adventure does not receive endless reinforcements or automatic arcade upgrade rewards.

### Progression amplifies combinations

Work with existing ship parts and Swarm offers to create recognizable build identities. Validate that several supported styles can succeed and that a choice has visible consequences in the next fight. Avoid a single compulsory power or an offered upgrade that the current hull cannot use.

## Representative integrated scenes

- Foundry: a baseline ship defeats fodder with its gun, uses a heavy object for a multi-kill, then receives earned breathing room.
- A specialist is introduced alone, telegraphs, attacks and exposes counterplay; a later mixed fight tests the learned behavior.
- In Adventure, the same physical combination helps a convoy but produces truthful collateral/law results when misused.

## Direct acceptance and finite stopping point

- Every shipped family and tested power has a complete readable attack/use/cancel/recovery loop.
- No score/reward for uncaused ambient events or invisible phantom damage.
- Supported starter and evolved kits remain controllable and can disengage where the encounter promises it.
- The named live routes are readable at actual density and within the shared performance contract.

## Reject these substitutes

Enemy construction; a new physics engine without the active architecture decision; random movement as personality; health inflation; flashes instead of cause; a second copy of each power just for Swarm.

## Deliverables

Shared combat repairs and presentation contracts. Arena owners author spatial toys; zone owners author composition; this owner keeps mechanics and family behavior coherent.

## Existing owners and coordination

- `src/systems/swarmBrood.js`
- `src/render/broodPresentation.js`
- `src/ai/combatDoctrine.js`
- `src/ai/shipDecision.js`
- `src/systems/weapons.js`
- `src/combat/damage.js`
- `src/combat/attachments.js`

Coordinate with `EC-A01`, `EC-A02`, `EC-A03`, `EC-A04`, `EC-A05`, `EC-A06`, `EC-A07`, `EC-Z01`, `EC-G07`, `EC-G11`. These are consumers/collaborators, **not all-finished-first prerequisites**. Agree the smallest shared interface, prove it in a real consumer, and let both sides progress. A geographic owner must not duplicate this shared mechanism; this shared owner must not hold all content hostage while pursuing a general framework.

## Commission execution supplement — branch and proof

**Use this existing draft commission PR branch:** `experience-commissions/EC-G08-combat-worth-mastering`. Add implementation commits and evidence here; do not make another planning PR or an unrelated issue farm. First inspect current master, concurrent PRs, native Finish campaign/status and exact `NOW.md` write claims. Shared code remains with canonical one-writer owners; organize dependent PRs only when path conflicts require them, with the consumer in this PR remaining accountable for real play.

**Technical and creative direction:** Diagnose a named broken/immature player route before extending any architecture. Compare 2–3 remedies for the largest gap and implement one justified by visible usefulness, motion/readability, durability and expected cost. Prove in real Adventure and/or Swarm consumer scenes; never close from a disconnected test harness. Swarm and Adventure must use consistent physical outcomes; make Swarm spectacular without inventing a second force law or enemy structures built mid-fight.

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
