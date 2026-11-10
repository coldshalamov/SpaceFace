# EC-Z03 — The Anvil — rounds 21–30

## Director's card — read this first

*From the creative director, 2026-11-09. The standard, the cast and the build order are in [09 — Creative direction](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/09_CREATIVE_DIRECTION.md). Where this card and the brief below disagree on **scope or order**, the card wins. On **ids, canon and who owns which state**, the brief wins.*

**Rounds 21–30 are the heavies.** Things your guns barely scratch. Each can only really be killed with the arena's toy — the furnace, the wheel, the lightning. This block is the test that the arena toys are real.

**Build first:** one heavy and its one honest answer in the first arena.

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

**Direct execution commission · Swarm round-block completion**  
**Native parents:** `SWARM`, `PQ-174`, `PQ-175`  
**Source-review baseline:** `f95de0eb1ba7560839209936afba48c7b96fe41a` · 2026-11-08  
**Commission status:** authored; current gameplay must be inspected, not presumed complete or absent.  

This is a complete, standalone assignment for an implementation agent with the repository. Its EC label is a document address, not a new task queue or runtime identifier. Read current native authority and reconcile changed source before acting. New scene treatments and numerical composition bands are design proposals commissioned by the owner; existing IDs and inherited opportunity obligations remain authoritative unless deliberately migrated.

## The experience to produce

Mass becomes a strategic fact. Some enemies are ammunition; some are anchors; some force the player to change the room before committing. A mature build should now do ridiculous things, but the opponent’s threat and the player’s escape remain readable. Heavy does not mean slow, dull or invulnerable.

## Round-by-round authored questions

These are experience targets over the existing planner, not ten new mission systems. Inspect the actual roster and behavior before binding a role; preserve supported identities and meaningful unlock timing. Do not invent an unadmitted specialist solely because a row uses a role word.

### Round 21 — Which body moves

**Construction:** Contrast compatible light mass with a genuinely heavy native role.

**What must be perceptible:** The player can identify a useful anchor versus throwable from behavior and silhouette.

### Round 22 — Make an opening

**Construction:** Use a heavy threat to reshape lines of fire or obstruct pursuers.

**What must be perceptible:** Physics creates opportunity instead of a damage sponge.

### Round 23 — Threat across the room

**Construction:** A ranged role makes travel and timing relevant while familiar close pressure remains bounded.

**What must be perceptible:** There is a reachable target and a meaningful route; no last-enemy hide-and-seek.

### Round 24 — Prepare the impact

**Construction:** The composition permits a planned multi-body event but does not require one exact script.

**What must be perceptible:** A gun-oriented alternate remains viable through positioning.

### Round 25 — Anvil champion

**Construction:** The native scheduled boss combines learned mass distinctions with its own supported counterplay.

**What must be perceptible:** Real component/state changes affect the fight and the death is a physical event.

### Round 26 — Play the aftermath

**Construction:** Surviving terrain and loot matter after the boss.

**What must be perceptible:** No sudden reset erases useful physical history; unused supplies remain genuine.

### Round 27 — A constrained choice

**Construction:** Two safe approaches ask different strengths of the current fit.

**What must be perceptible:** Both are legible before commitment; no invisible one-way trap.

### Round 28 — Exploit a weakness

**Construction:** A familiar specialist changes timing, not the player’s entire control contract.

**What must be perceptible:** Interrupt/recover windows remain visible at density.

### Round 29 — A strong combination

**Construction:** Several learned mechanics interact in a bounded spectacle.

**What must be perceptible:** The player can name the causes with and without audio.

### Round 30 — A mature build continues

**Construction:** Finish this block under Swarm semantics, not the separate Forge Regent arc finale.

**What must be perceptible:** Records, refit and onward access remain truthful; no forced end of endless mode.

## All-arena integration

The round questions are common; their solutions differ with each room. Validate their binding to all seven arena laws with focused composition checks and the relevant current batch player-route coverage. A foundry-only success is not a global planner verdict. Select representative high-risk combinations for full visible play rather than inventing an exhaustive 280-video ritual. A failure specific to one room remains assigned to that room/shared boundary, not concealed by deleting its law.

## Block acceptance

- No boss/elite is balanced solely through health inflation or hidden immunity.
- Large mass interactions are measured on the shared sim/render profile.
- The complete block preserves score/cargo/supply identity and wave completion.
- Swarm wave 30 does not accidentally trigger the separate authored Crucible ending.

## Reject

Copying the thirty-wave arc finale into Swarm; mandatory field builds; unbounded wreck persistence; camera surrender to a huge target.

## Native starting points

- `src/data/swarmMode.js`
- `src/data/swarmLadder.js`
- `src/data/swarmEvents.js`
- `src/data/swarmSpecialists.js`
- `design/program/finish/swarm/README.md`

## Wave-program contract

This is a composition and experience commission for the current Swarm ruleset, not the separate authored thirty-wave Crucible arc. Preserve the native finite-cohort accounting, earned-breathing mechanism, unlock/record scopes, restart behavior and current canonical enemy/physics owners. The current ladder has ten-round named zones and bosses at waves 5, 15, 25, 35, …; do not infer a different schedule from a comment or from “ten rounds.” Read current source and reconcile a deliberate upstream change before editing.

Treat the wave-by-wave intents below as questions the fight asks, not a requirement to add a new enemy or subsystem for each row. First audit the existing composition at that number. Preserve good work and use current families/abilities to complete the question. If the current roster has not unlocked the suggested role, either satisfy the intent with an already admitted equivalent or coordinate one explicit roster-clock revision with the canonical owner. Do not secretly add later enemies or bespoke wave scripts in seven arena files.

One lead coordinates the shared wave planner. Each zone lead owns only its admitted data slice/parameters and relevant tests; arena owners provide environmental modifiers and geometry. The shared source seam is not seven independent write permissions. Maintain the distinction among finite ship cohort, Brood pressure, live concurrency, refill/earned breath and score. Do not raise health or hard body caps merely to make a later wave harder.

For every affected round, define the learned/combined behavior, spatial pressure, readable cue, available response, earned release and what the next upgrade can change. Store useful authored differences in native data rather than a new scenario engine. The schedule must remain deterministic for a given supported seed and loadout. Keep player-launch control during the inter-wave breather; no surprise timeout while choosing a part.

Prove the whole named block through a supported ordinary route/checkpoint and test transitions into and out of it. A deep-state fixture can expose edge cases, but does not prove earned access or progression. Use representative gun and physical-tool builds, inspect motion at intended density, and test a genuine failed run/result/retry. Every offered upgrade must be usable and correctly described; existing persistent entitlements survive the run. Record exact remaining holes rather than closing a zone because its boss can be spawned in a lab.

Close when all round intents in the assigned block, its upgrade/pressure transitions, boss, settlement, retry/exit and declared ongoing generator behavior work. A numbered table without integrated play, one successful wave or a scripted clear event is not completion. Optional additional variants may wait; the named finite program cannot. Review material quality at the integrated block boundary using existing taste/batch rules, not a mandatory video per leaf.

## Commission execution supplement — branch and proof

**This draft PR's branch is the assignment:** `experience-commissions/EC-Z03-the-anvil`. Commit the gameplay, authored asset, live integration, tests and play evidence here; no second prompt/PR by default. First reconcile latest master, current Swarm/Crucible implementation PRs, native program status and `NOW.md` path claims. The same `swarmArena.js`, `swarmMode.js` and `swarmLadder.js` cannot have seven simultaneous uncoordinated writers; appoint one shared owner and provide area-specific authored definitions/consumer fixtures.

**Make the fight a game.** This ten-wave zone must have a recognizable pressure→release→upgrade→renewed pressure rhythm, distinctive introduction and counterplay, authored boss/special event, and a genuine result/retry path. Different waves must have different questions, not inflated HP or arbitrary spawn counts. Compare two or three real ways to improve the weakest first-session/fight moment; choose the best player-readability, physical interaction and fun per verified worker/GPU cost. Every enemy should read by silhouette + motion + attack cause; every powerful hit must explain what changed. No enemy construction during combat, parallel physics law, gratuitous whiteout, mystery-credit chains or in-fight Adventure UI clutter.

**Test actual combat:** Normal menu→launch, first twenty seconds, mid-wave enemy composition, power/physics manipulation, upgrade and next wave, boss/failure/results/retry; representative authored seed plus perturbation. Inspect real gameplay-camera images and input/video, not only simulation checks. Measure worker sim p95/p99, transport/presentation, main-thread, GPU and asset admission on appropriately dense fights; don't pixelate or silently reduce horde/visual quality. Verify outcomes/rewards through existing canonical writers, including unique pickups and restoration.

**Close honestly:** Finish the full assigned arena or wave block, not the first impressive battle. Keep **AREA INCOMPLETE** until all named contracts and failure/restart cases work. Use current native independent reviewer gate (including three reviewers when required), report production commits, seed/route/hardware, supported visual/performance evidence, limitations and next action.

See [v2 agent protocol](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/06_AGENT_PR_EXECUTION_PROTOCOL.md) and [parallel conflict map](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/07_PARALLEL_AGENT_DEPLOYMENT.md).

## Execution contract — own the experience, not just the files

You are the implementation lead for the named commission. Produce real gameplay/asset implementation directly on this assigned draft PR branch, with a separate linked PR only when shared native ownership requires it. This is an execution assignment, not a request for another plan, prompt, simulation transcript, catalog, or test-only demonstration. Your responsibility includes design judgment, source integration, presentation, failure recovery, and the ordinary player route. A subordinate's completed component does not discharge your responsibility for the whole.

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
