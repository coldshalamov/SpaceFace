# EC-G01 — People with addresses — residents, conversations and mission signals

## Director's card — read this first

*From the creative director, 2026-11-09. The standard, the cast and the build order are in [09 — Creative direction](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/09_CREATIVE_DIRECTION.md). Where this card and the brief below disagree on **scope or order**, the card wins. On **ids, canon and who owns which state**, the brief wins.*

**What this is for:** people. This PR owns **Faces** and **the Usual** for every town — a named resident with a berth you can find, a want, a one-line voice, a memory of what you did; and the **Berth Board** at each dock where your name climbs from *stranger* to a nickname the town gave you. It also owns the five **Road Cast** who travel (see 09).

**Build first:** the three Helios faces and Late Benny, hailable from flight, with the Berth Board. Build it inside the Helios PR's world, then lift it out as the kit every town uses.

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
**Native parents:** `W4`, `W5`, `X3`, `X5`, `LW-02`  
**Source-review baseline:** `f95de0eb1ba7560839209936afba48c7b96fe41a` · 2026-11-08  
**Commission status:** authored; current gameplay must be inspected, not presumed complete or absent.  

This is a complete, standalone assignment for an implementation agent with the repository. Its EC label is a document address, not a new task queue or runtime identifier. Read current native authority and reconcile changed source before acting. New scene treatments and numerical composition bands are design proposals commissioned by the owner; existing IDs and inherited opportunity obligations remain authoritative unless deliberately migrated.

## Player promise

A person is someone the player can find again. Give existing characters a believable physical address, a useful interaction and a memory that changes what they say and do. The world should not hide all its people behind station tabs, and it should not become a floating forest of quest icons.

## Diagnose the actual gap

Answer these by inspecting current source and the ordinary route; they are not questions to return to the owner.

- Trace one existing named contact from catalog through station generation, physical presence, offer, acceptance, objective, turn-in and memory. Identify exactly which links exist and which are only described.
- Watch a fresh player approach a busy berth. Determine whether the interaction is invisible, badly placed, blocked by UI/camera, or genuinely absent. A larger marker cannot repair an absent person.
- Inspect existing no-dialogue-tree rulings and current authored interaction affordances. The owner now requests optional contact conversation; implement a concise discoverable layer without an unbounded dialogue engine or runtime LLM dependency.

## Required construction

### One identity in several places

Bind a canonical character to a ship/berth/workplace and existing contact UI. Their world presence and dock conversation share memory, mission eligibility and portrait/voice, rather than minting two characters. Preserve existing appearance/beat/reputation gates. Use existing far-actor/world records to represent offscreen presence.

### An interaction you can learn once

Provide approach/hail/inspect through the existing contextual input grammar and remapping. Show the person’s name, current purpose and one actionable sentence. Optional conversation opens only by player choice. Closing it returns the exact prior flight/dock context; do not steal the controls during an active threat.

### A small truthful signal vocabulary

Differentiate available work, active work and ready-to-settle by shape plus text/accessibility treatment. Eligibility comes from the mission owner. Declined, completed, failed and moved contacts must not leave stale icons. Apply distance/occlusion/priority rules so only useful nearby signals compete; long-range guidance belongs to the selected objective/map.

### Memory expressed as life

Use existing counters and committed events. A rescue can put a worker back at their berth; a theft can close a service until restitution; a successful delivery can change a receiver’s actual work. Add short event-specific acknowledgment, not a universal adjective such as “friendly.” The same persistent action must not fire its reward or speech repeatedly.

### Contacts have ordinary use

Support service, advice tied to real navigation, a short local observation, trade or an offer when appropriate. Not every person is a quest dispenser. A non-offering resident can still be useful to the place. Area agents author the actual lives and dialogue; this commission owns shared reachability, identity and signal semantics.

### Prove reuse before generalizing

Integrate the shared seam into a protected harbor contact, a working-yard contact and a quiet frontier contact. Resolve a missing/moved actor and a save/Continue case. Do not spend the commission constructing a generic social framework without these real consumers.

## Representative integrated scenes

- Lantern Ward: notice the working crew, hail them, help without accepting a mission, then return to a concise truthful acknowledgment.
- Tethys: accept at a physical contact, complete the actual transfer, distinguish turn-in readiness, settle once and observe marker retirement.
- Nyx or Sedna: a gated canonical contact remains correctly unavailable, explains the relevant next step where appropriate, and later becomes reachable without a duplicate identity.

## Direct acceptance and finite stopping point

- An unfamiliar reviewer finds the intended interaction from ordinary play and understands the three work states.
- The same person’s bar/world forms agree after movement, saving, failed transfer and repeated input.
- No duplicate reward, contradictory memory or inaccessible required return target remains.
- Busy scenes retain one primary transient voice and a readable playfield.

## Reject these substitutes

A second quest database; replacing in-world characters with a tooltip; mandatory exposition; automatic camera cuts on every hail; an icon above every background actor.

## Deliverables

A canonical contact/presence projection and state-driven affordance contract, consumed by sector briefs. Sector-specific cast and story stay with the area owners.

## Existing owners and coordination

- `src/ui/station/screens/bar.js`
- `src/ui/station/barContacts.js`
- `src/data/stationContacts.js`
- `src/systems/stationContacts.js`
- `src/story/campaign47a/embodiedDialogue.js`
- `src/world/worldRecords.js`

Coordinate with `EC-S01`, `EC-S03`, `EC-S12`, `EC-S24`. These are consumers/collaborators, **not all-finished-first prerequisites**. Agree the smallest shared interface, prove it in a real consumer, and let both sides progress. A geographic owner must not duplicate this shared mechanism; this shared owner must not hold all content hostage while pursuing a general framework.

## Commission execution supplement — branch and proof

**This is an assigned draft implementation PR** (`experience-commissions/EC-G01-people-with-addresses`), not a request to create another PR. Contribute real source/assets/tests and player-route evidence to this branch. Shared mechanisms remain with the **current canonical native writer**, not whoever cites a file from a sector commission. Refresh master, live Finish status, `NOW.md` claims, and overlapping open PRs before editing. Use a separate linked PR only when native ownership requires it.

**Design upgrade mandate:** Inspect a real consumer scene, identify what the player currently experiences and what is disconnected or wrong, compare two or three complete remedies, and choose the highest **player-understandable benefit per complexity/performance cost**. Prove this reusable system in one named current sector route before spreading a generic facade across the universe. Reject giant frameworks without a functioning consumer; prefer one strong integrated interface proven end-to-end.

**Performance and visual bar:** Record a repeatable populated Adventure or Swarm route, seed, hardware and renderer. Attribute cost separately to worker sim, snapshot/presentation, main-thread, GPU, asset admission and memory. Read the current E-campaign budgets; preserve authored silhouettes, lighting, physical cause and controllability. Never meet a target by lowering resolution, emptying the scene, or masking stalls with indefinite fake motion. Use representative images and motion, not only source review.

**Acceptance:** Demonstrate one concrete native consumer, normal input/feedback, alternative and failure paths, saved state when applicable, and cross-mode nonregression. Honor existing required independent reviewers (three under active Finish campaign gate). Keep unresolved routes, hardware or aesthetic approval visibly **UNVERIFIED**, not passed. Document exact changed paths, current status, genuinely tested checks, scene impact, performance delta and next action. **AREA INCOMPLETE** is the truthful partial-work state.

See [v2 agent execution protocol](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/06_AGENT_PR_EXECUTION_PROTOCOL.md) and [cross-owner deployment map](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/07_PARALLEL_AGENT_DEPLOYMENT.md).

## Execution contract — own the experience, not just the files

You are the implementation lead for the named commission. Produce working source/assets on this assigned draft PR branch; any separate linked PR must be justified by current shared-owner coordination. This is an execution assignment, not a request for another plan, prompt, simulation transcript, catalog, or test-only demonstration. Your responsibility includes design judgment, source integration, presentation, failure recovery, and the ordinary player route. A subordinate's completed component does not discharge your responsibility for the whole.

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
