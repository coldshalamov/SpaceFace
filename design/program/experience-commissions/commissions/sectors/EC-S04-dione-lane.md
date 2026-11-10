# EC-S04 — Dione Lane — The standing army has a morning routine

**Direct execution commission · Sector completion**  
**Native parents:** `W2`, `W3`, `W4`, `LW-04`, `LW-05`, `LW-11`  
**Source-review baseline:** `f95de0eb1ba7560839209936afba48c7b96fe41a` · 2026-11-08  
**Commission status:** authored; current gameplay must be inspected, not presumed complete or absent.  
**Existing identity:** `sector_dione_lane`  

This is a complete, standalone assignment for an implementation agent with the repository. Its EC label is a document address, not a new task queue or runtime identifier. Read current native authority and reconcile changed source before acting. New scene treatments and numerical composition bands are design proposals commissioned by the owner; existing IDs and inherited opportunity obligations remain authoritative unless deliberately migrated.

## The place you are making

The ships are where someone put them. A patrol returns to a repair berth; a reserve vessel takes its place. Across the inspection apron, a drill formation turns together under the gate ring. The public lane remains calm. The danger is not random hostility but a boundary, a schedule and a force that knows why it is there. The player should be able to study this place, belong here, work here—or plan something outrageously ill-advised with information the game honestly provides.

## Bounded scope and initial composition targets

Own the whole playable sector experience, using **Niner Bastion** as the center of composition rather than deleting the rest of the sector. Complete **3 headline job(s), 3 smaller opportunities, 3 purposeful routine loops, and 4 recurring social/occupational roles** described below. Roles may share native actors; this is not an additive actor-spawn quota. Existing compatible content counts when it genuinely satisfies the outcome; do not create duplicate jobs merely to reach a number.

Start from **4 distinct public/restricted pockets**, approximately **3–5 S** across the local authored experience. Measure S at the default gameplay camera before using it; retain the sector's existing larger geography. Aim for **15–35 seconds on the public route** between useful observations/actions along the intended local route. A headline job's first complete approach may occupy roughly **10–18 minutes**; small opportunities generally occupy 20–120 seconds. These are **proposed pacing/composition bands, not measured current values, forced timers, required runtime clocks or rigid acceptance thresholds**. Adjust with evidence when the result plays better. Order and response must be readable. A quiet lawful route stays quiet unless the player chooses escalation.

Show at least one routine's actual source, work and destination on an ordinary visit. Different visits may expose different phases; no quest acceptance is required to start local life. Use native simulation/actor budgets, not every role and event simultaneously. The numbers define authored coverage, while production must measure and bound actual concurrent load. No more than one incident may demand urgent attention at a time.

**Inherited Open Reach scope:** `lw_dione_target_practice`, `lw_dione_last_bus`, `lw_dione_borrowed_authority`. All three remain mandatory, even when one appears below as a smaller opportunity rather than a headline slot. Do not reduce the original district brief.

## Spatial construction and navigation

Use five functional pieces: a safe public approach, inspection apron, drill court, repair/reserve berths and restricted tender hangar. The public path must not clip the restricted volume. Show alternate approach and retreat bearings before trespass. Patrols emerge from visible berths with a finite roster and shared spawn budget. Repair and reserve silhouettes make the base larger than the currently active fighting force without simulating a fleet of needless rigid bodies. Gate 3 and the existing Dione exchange/customs remain canonical.

## Residents and institutional character

- A duty officer explains one immediate rule and has useful contract work; their marker is never a proxy for automatic hostility.
- The bus pilot is tired of being late because of other people’s exercises.
- A drill lead reacts differently to an invited exercise, a collision and a deliberate attack.
- COUNTERSIGN’s maintenance crew gives the tender a place, work state and vulnerability without narrating a stealth tutorial.

## Ordinary life, even without an accepted mission

- A finite patrol returns, receives service and is relieved by a reserve with the same world identity.
- A drill squad practices a readable maneuver and returns to its own berths.
- An inspection crew clears real traffic; a passenger bus uses a public gap rather than teleporting past the gate.

## Headline jobs — complete playable sequences

### 1. Target Practice

**Binding:** `lw_dione_target_practice`. Preserve the native opportunity identity and extend its current implementation.

Join an optional exercise that demonstrates line/power counterplay and formation identity without making the lawful lane hostile. The exercise can be completed through a safe kinetic solution or good positioning; its targets and safety rules must be recognizable. If a real emergency interrupts, the drill releases control cleanly. Settlement distinguishes authorized practice from actual damage, and the unit remembers the outcome.

### 2. Last Bus

**Binding:** `lw_dione_last_bus`. Preserve the native opportunity identity and extend its current implementation.

A passenger transfer needs to cross the working base while an inspection/drill occupies the convenient passage. Secure clearance, guide a safe alternate route or physically clear the responsible obstruction. The bus is an actual actor with a destination and occupancy handled by native owners. The climax is its arrival, not a proximity trigger. Return to a changed service schedule or a concrete repair/restitution opportunity.

### 3. Borrowed Authority

**Binding:** `lw_dione_borrowed_authority`. Preserve the native opportunity identity and extend its current implementation.

Study, enter and take the actual interdiction tender COUNTERSIGN. Support a quiet authorized/deceptive access route and an explicit loud route using existing law and custody systems. Transfer control of that exact hull, preserve its cargo/fittings, account for the original player hull, and escape a finite causal response. Then use its real clamp capability elsewhere. A second identical reward ship is not acceptable. Recovery, lawful purchase or negotiated return should remain possible without a new character.

## Smaller opportunities and return reasons

- A damaged reserve accepts an attended repair job with a changed readiness state.
- A real contraband seizure creates an inspectable holding load, not free loot detached from custody.
- A returning veteran contact moves from a flight berth to their normal service location without duplicating identity.

## Light, material, motion and sound

Disciplined silhouettes, readable hull spacing, inspection floodlight cones and lower warm repair light. Reserves need not all be active physics actors to be visibly housed. A player should read the restricted apron by architecture and markings before a warning fires. Alerts rise with a real alarm and recede when native law says they can.

## Continuing value and visible consequences

Influence can produce permits, contracts, access and eventually a negotiated or conquered operating presence. Owning part of the base changes patrol allegiance and service access through existing authorities, not a painted flag alone. Avoid compulsory attacks on the starter population or irreversible faction-class locks.

## Connections beyond this sector

These are proposed causal relationships to realize through existing topology and owners, not new jump links or proof that the shipment already exists.

- Tethys and Helios observe bounded policy effects.
- The stolen/earned tender has useful work at other existing machinery sites.
- Campaign pressure can contest the base, but must preserve a reachable player route.

## Reuse and deduplication anchors

Inspect these live paths first; their presence does not establish player-route acceptance. The paths are starting points, not blanket write reservations.

- `src/systems/factionPresence.js`
- `src/systems/gateThreeWeir.js`
- `src/ai/engagementAuthority.js`
- `src/systems/lawSecurity.js`
- `src/systems/shipControlTransfer.js`
- `src/shipjack/ownedOperations.js`

## Questions you must answer by inspecting and playing

These questions are your design/research work, not a questionnaire to send back to the owner.

1. From the ordinary arrival, which promised places, people and activities actually appear, at what scale, and how does a stranger find the first useful action? Which apparent absence is a broken connection rather than missing content?
2. What is the smallest spatial arrangement that lets the place's work be understood and physically interrupted? Where are the approach, destination, alternate path and retreat, including a large legal hull and its load?
3. Which existing encounter/contact/asset already serves each named obligation? Which needs expansion, which should be merged into the same story, and which genuinely requires new production?
4. What currently makes interaction unpleasant: camera motion, invisible collision, weak lighting, poor targeting, instructions, latency, missing audio, an unclear outcome, or a dead return path? Reproduce the cause before choosing a remedy.
5. What happens when the player ignores the quest, helps before accepting it, moves the object, fails, leaves, saves, returns, changes ship, or approaches with no sound? What state survives, who owns it, and how does the player perceive it?
6. After all enumerated pieces work, what still makes the area feel like a demonstration rather than a place? Make the highest-impact composition and interaction corrections inside this scope. Do not answer thinness by multiplying decorative entities.

## Area-wide construction and acceptance standard

**Spatial design.** Measure one default gameplay-screen width in world units, denoted S, and the reference starter/tug/large-hull envelopes before placing geometry. Use the travel-time and screen-space bands in this brief as first-pass composition targets, then tune by playing. Keep existing sector IDs, coordinate frames, saved sites, gates and required routes. A district is a composition within the current sector, not a replacement map. Its entrance, center, working edge, refuge and departure must be intelligible without its nameplate. Functional geometry needs believable clearance, a reverse path, and honest collision; an enormous bounding sphere is not an interior.

**Density is an experience, not a spawn count.** Quiet, working and hub profiles intentionally differ. In a working neighborhood, a normal 60–90-second approach should reveal work in progress, a reachable person or service, and an optional intervention, without obliging the player to accept a quest. More than one of these can be the same well-composed event. Along connective travel, let the player see a destination before the current activity exhausts itself. Preserve deliberate silence at the frontier. At most one urgent local incident should seize attention; other routines can remain calm. Do not place an event every fixed number of seconds or create artificial interruptions while someone is reading.

**People have addresses.** Give recurring residents a physically recognizable berth, ship, machine or inhabited threshold; attach their canonical identity to it. Hailing/approaching uses a discoverable contextual action, a concise voice, and optional further conversation through existing contact UI. Make available work, active work and ready-to-return outcomes distinguishable by icon shape plus text/accessibility treatment, not color alone. Only eligible offers receive markers; resolved markers disappear; moved actors remain findable. Dialogue can be optional, but an actor must have a job, an attitude and an observable response. Do not clone a bar contact into an unrelated in-world person or create a generic exclamation-mark carpet.

**Required event depth.** For each headline sequence implement: discoverable setup; an understandable physical or strategic problem; at least two materially different approaches; a complication caused by an actual state change; a playable climax; settlement through the existing owner; and persistent return/recovery. Extra dialogue choices that trigger the same operation are not different approaches. Smaller opportunities may be brief, but must still connect to real work and a visible result. Existing equivalents can satisfy a slot when they meet its promise; upgrade them rather than adding duplicates. These are floors for completeness, not encouragement to pad the map with weak missions.

**World state must be seen.** Every major local consequence changes at least one physical or operational fact—an open berth, a repaired device, a supply queue, a resident's location, a patrol route, an infected surface—and, where relevant, one economic/social fact. Both come from committed state. Leaving, saving, continuing and returning must preserve the same causal result. Do not award a clean service visually while the cargo owner rejected delivery. Failure should create a recoverable problem or honest alternative where possible, not an unannounced permanent loss of the entire area's usefulness.

**A finite acceptance boundary.** Close the commission only when all named headline slots, all explicitly inherited LW opportunities, the specified ordinary routines, usable services/contacts, return states and required connections are working on ordinary routes. No known crash, save corruption, progression softlock, inaccessible required interaction, misleading consequence or materially broken camera/control remains within the scope. Count coverage by outcomes, not lines of code. Attractive optional extras may remain for a later PR; unexplained omissions of promised behavior may not.

**Judge the experience, not just the checklist.** A reviewer playing without this brief must be able to explain what this place is for, who is here, what can be done now, what changed after their action, and why they might return. They must point to screen-visible evidence, not quote the implementation. A place with the right objects but no readable routes, no convincing light, dead conversations or dull interaction fails even if its logic tests pass. Obtain a combined independent product/engineering critique where available. A specific subjective defect is actionable: “the service court reads as an empty parking lot” demands composition and activity, not a documentation fix. Do not claim perfection or stop on an unexplained score.

**Exercise the real negative paths.** Cover first visit without an accepted quest; the intended mission route; a plausible alternative; interruption/rejection; departure and return; save/Continue; and the representative small and large hull/load. Test destroyed or unavailable actors, duplicate settlement, nonzero origins, remapped input, muted audio and reduced motion where relevant. Targeted fixtures can reach rare states quickly but do not replace the ordinary approach. Inspect real rendered captures for appearance and motion for camera/handling claims. When the current environment cannot run the required route, preserve useful implementation and label route/visual acceptance UNVERIFIED—never silently downgrade it to source inspection.


## Sector-specific acceptance scenarios

- Ordinary first-session transit stays safe; optional trespass has warning and retreat.
- Two alarms and a return conserve the finite force; dead/captured ships do not respawn under new IDs to fake strength.
- COUNTERSIGN remains the same owned machine after transfer, escape and Continue; the original ship is accounted for.
- Combat improvements remain useful in Adventure without importing Swarm’s crowds and reward rules.

## Explicitly reject

A decorative formation; endless guards materializing behind the player; random hostility at a public quest giver; a theft that only awards a duplicate inventory item.

## Commission execution supplement — branch and proof

**Assigned branch:** This document is already in draft PR `experience-commissions/EC-S04-dione-lane`. Add actual gameplay implementation and verification **to this same PR branch**; do not generate another plan, new branch or duplicate PR. Before editing, compare current master, concurrent implementation PRs, current native Finish status and exact `NOW.md` claims; integrate new work by the repository's allowed merge workflow and preserve foreign changes.

**Quality strategy:** Compare at least two credible approaches to the section's most consequential scene, prioritizing visible physical agency, understandable layout, social/industrial life, consequences and architectural simplicity. Improve the literal specification when evidence supports a better result. Preserve the sector's named identity and obligations. The player should find meaningful residents and work without a quest, act on something physically real, and later see the same place changed; a decorative asset cluster is a failure.

**Measured craft:** Inspect actual first arrival, active job, interruption and return at the normal gameplay camera. Record source and owner, reproducible route, seed and renderer, real image/motion/audio, blocked paths and save/Continue. Measure crowded-scene worker, presentation, CPU, GPU and admission cost before and after; don't buy frame time by hiding activity, pixelating zoom or replacing authored hulls. Coordinate all shared world records, cargo/traffic, mission, camera and station interaction writes with their existing one-writer owners.

**Finite completion:** Every promised job, routine, recurring contact, alternative and negative/return path must be implemented or explicitly marked unresolved; current native reviewer requirements apply. A useful partial commit is **AREA INCOMPLETE**, not permission to close the commission. End only after complete player-route acceptance or an honest tool/session blocker with exact next action. Report concrete creative improvements, performance tradeoffs, implementation paths and evidence in the PR.

**Shared protocol:** [execution and acceptance](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/06_AGENT_PR_EXECUTION_PROTOCOL.md) · [concurrency and source ownership](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/07_PARALLEL_AGENT_DEPLOYMENT.md).

## Execution contract — own the experience, not just the files

You are the implementation lead for the named commission. Produce working source and any necessary authored assets in SpaceFace and commit directly to this existing draft PR branch; a separate linked implementation PR requires a canonical shared-owner reason. This is an execution assignment, not a request for another plan, prompt, simulation transcript, catalog, or test-only demonstration. Your responsibility includes design judgment, source integration, presentation, failure recovery, and the ordinary player route. A subordinate's completed component does not discharge your responsibility for the whole.

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
