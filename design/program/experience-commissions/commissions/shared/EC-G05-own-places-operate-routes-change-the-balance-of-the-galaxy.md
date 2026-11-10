# EC-G05 — Own places, operate routes, change the balance of the galaxy

## Director's card — read this first

*From the creative director, 2026-11-09. The standard, the cast and the build order are in [09 — Creative direction](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/09_CREATIVE_DIRECTION.md). Where this card and the brief below disagree on **scope or order**, the card wins. On **ids, canon and who owns which state**, the brief wins.*

**What this is for:** owning something you can fly up to. A berth with your name, a stall with your stock arriving on a real tug — never just an income number in a menu. It grows from your lamp, to your berth, to a business.

**Build first:** one owned berth at Helios where you can watch your own delivery come in.

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
**Native parents:** `W1`, `P3`, `W3`, `PQ-177`, `PQ-155`, `LW-11`, `LW-12`  
**Source-review baseline:** `f95de0eb1ba7560839209936afba48c7b96fe41a` · 2026-11-08  
**Commission status:** authored; current gameplay must be inspected, not presumed complete or absent.  

This is a complete, standalone assignment for an implementation agent with the repository. Its EC label is a document address, not a new task queue or runtime identifier. Read current native authority and reconcile changed source before acting. New scene treatments and numerical composition bands are design proposals commissioned by the owner; existing IDs and inherited opportunity obligations remain authoritative unless deliberately migrated.

## Player promise

Adventure is a continuous rise in capability and reach: one useful ship becomes a collection of fits and tools, then a working berth, reliable routes, productive outposts, political leverage and regional power. The player personally flies through the consequences. This is not a forced replay loop and not permission to build a second real-time-strategy engine beside SpaceFace.

## Diagnose the actual gap

Answer these by inspecting current source and the ordinary route; they are not questions to return to the owner.

- Trace the existing buy/build/claim, production, storage, transport, sale, upkeep, risk, ownership and save paths. Separate working functionality from menus that imply unsupported operations.
- Inspect actual faction/control capabilities and current campaign restrictions. The latest owner direction explicitly includes buying places, influencing/taking over factions and eventually dominating the galaxy; reconcile conflicting older emphasis deliberately instead of silently pretending it is already built.
- Play one operation from acquisition to useful income and reinvestment. Locate every manual ambiguity, invisible result, dead resource loop or unexplained cap.

## Required construction

### One economic and ownership truth

Extend existing automation, cargo, market, faction, world-record and fleet owners. Define the minimum canonical facts for an owned facility and route; do not give each sector a private stock/credit/save system. A facility’s visible machinery and workers project those facts.

### A legible acquisition-to-operation loop

For each supported facility: inspect what it does and needs; see actual cost and obligations; acquire legally or through a clearly different contested path; supply/configure it; observe its first real cycle; collect or sell actual output; understand net result; reinvest. Refusal and insufficient-stock/funds states must preserve progress and explain the next useful action.

### Growth changes the place

Specialization adds useful physical modules, service access, storage/receiver behavior and a small credible work routine. Present the difference between refinery, relay, bastion or other current types at the approach camera. Use existing outpost asset families where appropriate; compose them into inhabited work rather than a decorative model swap.

### Logistics exists at the right fidelity

Near the player, show actual loads, receivers and movements under canonical custody. Offscreen, use existing bounded simulation with conserved quantities and stable actors; do not simulate every crate as a live rigid body. Ownership displays distinguish stored assets, operating assets, in-transit goods and projected versus realized income.

### Influence has operational consequences

Supply, service, contracts, negotiation and explicit force can produce access/control through the existing faction authorities. Capture/negotiation changes permits, patrol behavior, services and routes. Show cause before effect. Support restitution, repair, buyback or reconquest where appropriate; no permanent build/class lock from a routine decision.

### Continuous late game

Organize existing mechanics into stages: self-sufficient pilot, local operator, inter-sector network, regional influence and optional hegemony objectives. Finishing the main story does not erase facilities or end free play. Preserve purchased equipment through ordinary shortages; no punitive offline catastrophe. Challenge should come from visible strategic choices and bounded disruptions, not endless daily chores.

### Repair the user experience

Provide a clear place-and-route overview through existing UI, with drill-down to real operations and navigation to the physical site. Show gross input/output, cost, constrained throughput and realized profit honestly. Avoid another dashboard that the player must consult to know whether their factory exists.

## Representative integrated scenes

- Earn/buy a small Ceres/Nereid operation, supply it, observe the first delivery, sell output and purchase a visibly useful upgrade.
- Divert/interdict a relevant real shipment, observe a bounded local stock/service/price effect, then restore supply and watch recovery.
- Gain influence over a contested Io/Dione operation, save/Continue and return to changed patrol/service behavior with old ships and fits intact.

## Direct acceptance and finite stopping point

- A complete acquisition→operation→income→expansion loop works without debugging or manual state edits.
- Visible output, market stock, credit settlement and ownership agree under partial loss, interrupted delivery and repeated requests.
- At least one real regional-control outcome changes life, not only map color.
- Campaign completion and routine refitting preserve accumulated options and owned infrastructure.
- Operational growth respects measured residency/body budgets and does not install a parallel economy.

## Reject these substitutes

A +income label on an inert model; infinite production without input/demand; a new strategic map with fake fleets; permanent character choices; mandatory prestige resets; simulation of every offscreen bolt.

## Deliverables

Shared facility/route/control contracts and one proven complete cross-sector network. Area briefs author the local acquisition, residents, geography and visible operating identity.

## Existing owners and coordination

- `src/systems/automation.js`
- `src/systems/automationOperations.js`
- `src/data/automation.js`
- `src/systems/factionPresence.js`
- `src/systems/gateControlDirector.js`
- `src/world/worldRecords.js`
- `src/shipjack/fleetPersistence.js`

Coordinate with `EC-S02`, `EC-S03`, `EC-S04`, `EC-S05`, `EC-S08`, `EC-S20`, `EC-G06`, `EC-G09`, `EC-G12`. These are consumers/collaborators, **not all-finished-first prerequisites**. Agree the smallest shared interface, prove it in a real consumer, and let both sides progress. A geographic owner must not duplicate this shared mechanism; this shared owner must not hold all content hostage while pursuing a general framework.

## Commission execution supplement — branch and proof

**This is an assigned draft implementation PR** (`experience-commissions/EC-G05-own-places-operate-routes-change-the-balance-of-the-galaxy`), not a request to create another PR. Contribute real source/assets/tests and player-route evidence to this branch. Shared mechanisms remain with the **current canonical native writer**, not whoever cites a file from a sector commission. Refresh master, live Finish status, `NOW.md` claims, and overlapping open PRs before editing. Use a separate linked PR only when native ownership requires it.

**Design upgrade mandate:** Inspect a real consumer scene, identify what the player currently experiences and what is disconnected or wrong, compare two or three complete remedies, and choose the highest **player-understandable benefit per complexity/performance cost**. Make owned economic operations visible as actual places and routes; do not add a second empire-management currency, ledger or permanent class lock. Reject giant frameworks without a functioning consumer; prefer one strong integrated interface proven end-to-end.

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
