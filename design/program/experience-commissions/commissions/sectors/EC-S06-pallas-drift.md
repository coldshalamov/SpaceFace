# EC-S06 — Pallas Drift — A street through the ribs of dead ships

## Director's card — read this first

*From the creative director, 2026-11-09. The standard, the cast and the build order are in [09 — Creative direction](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/09_CREATIVE_DIRECTION.md). Where this card and the brief below disagree on **scope or order**, the card wins. On **ids, canon and who owns which state**, the brief wins.*

**Tier B — an outpost.** A landmark, two faces, the toy, your mark and one job. Do not build the brief's full list; the card's Slice 1 is the whole of this PR.

**One line:** a street painted through the ribs of dead ships, where people very much live.

**Landmark:** Rib Street — bright arrows painted on hulls never meant to be walls, windows lit behind them. **Shift:** the Slow Bell. When a funeral tow passes every light on the street dims until it is gone. **Toy:** bounce plates — old hull panels on springs that ferries bank off to take corners; you can too, and so can anything you throw.

**Faces:** **Mother Calloway**, funeral tow pilot — *"Slow is the respect."* · **Dr. Bao**, medical receiver, can tell bought-back from brought — *"Who had this before you?"* · **Fitch**, salvage-ram crew — *"Empty. Probably. Knock anyway."* · Mara and the Children only through their existing gates.

**Argument:** the salvagers want to cut hulls that somebody is sleeping in. **Your mark:** an arrow in your colour pointing to the safe berth you found.

**First 90 seconds:** it reads as wreckage. Then a window lights, a ferry noses out through a broken rib and banks off a plate, and the Slow Bell rings.

**Build first (Slice 1):** Funeral Freight.

### How to build this town and check your own work

Work in this order. Each step ends with something you looked at.

1. **Look first.** Arrive by the ordinary route and capture what a stranger sees today (`node scripts/capture-sector-identity.mjs` covers Helios and Ceres; for other sectors copy it for yours until the `look` tool from EC-G17 exists). Write the five Stranger Test answers for the place *as it is now* in the PR. That is your "before".
2. **Build the toy alone**, in the no-boot simulation lab (`node scripts/agent-loop.mjs sim <scenario> --trace`), until it is fun with nothing else in the scene. The jobs lean on it.
3. **Then faces, then the shift, then your mark** — each through the system that already owns it (contacts, broadcasts, world records). Do not start a parallel one.
4. **After every step:** the one narrow test (`node --test test/<file>`), then `npm run test:fast`. Never run the full `npm run check` while something is red, and never use the long playthrough battery as a per-change check.
5. **Does it still boot and fly:** `node scripts/check-game-playable.mjs`.
6. **Did it cost frames:** `node scripts/check-hitch-budget.mjs --out=<file>` before and after, back to back in one sitting (this machine swings from 60 to 40 with background load, so a comparison across sessions means nothing).
7. **Stranger Test:** give a fresh agent only your captures — not this file, not the code — and the five questions. Put its answers in the PR, unedited.

**The ways agents have fooled themselves on this project. Check each before you say done.**
- *Green test, nothing on screen.* The thing is defined in data and never appears in play. Go and find it in the running game.
- *Reachable only by a flag, a debug spawn or a test fixture.* A player cannot get there. It is not built.
- *Decoration without behaviour.* A lit window nobody is behind. A crane that does not lift.
- *The working folder passes and the commit does not.* Commit exact paths, then check what you committed, not what is on disk.
- *A reference result edited to make a check pass.* Never.
- *"Done" on a partial.* Say what works, what does not, and what you could not look at.

**How to use this card.** Bold names are fixed so the world stays consistent; everything else is yours to invent — decide, build, look. If an existing character already fills a face's role, keep their name and give them this want and this line. If an idea here plays badly, replace it with something that fills the same line of the Town Recipe and say so in the PR. **This PR is ready when Slice 1 passes the Stranger Test.** The brief's remaining jobs follow in a second PR on the same place.

---

**Direct execution commission · Sector completion**  
**Native parents:** `W2`, `W3`, `W4`, `LW-06`, `LW-A2`  
**Source-review baseline:** `f95de0eb1ba7560839209936afba48c7b96fe41a` · 2026-11-08  
**Commission status:** authored; current gameplay must be inspected, not presumed complete or absent.  
**Existing identity:** `sector_pallas_drift`  

This is a complete, standalone assignment for an implementation agent with the repository. Its EC label is a document address, not a new task queue or runtime identifier. Read current native authority and reconcile changed source before acting. New scene treatments and numerical composition bands are design proposals commissioned by the owner; existing IDs and inherited opportunity obligations remain authoritative unless deliberately migrated.

## The place you are making

At first it is wreckage. Then a window lights, a ferry noses out through a broken rib, and someone has painted a direction on a hull that was never meant to be a street. The safe berth is hidden, not absent. A funeral tow passes slowly enough to conceal a cargo transfer. The place is precarious but inhabited; strangers do useful work here because the official routes will not.

## Bounded scope and initial composition targets

Own the whole playable sector experience, using **Widow’s Run / Quiet Berths** as the center of composition rather than deleting the rest of the sector. Complete **2 headline job(s), 3 smaller opportunities, 3 purposeful routine loops, and 3 recurring social/occupational roles** described below. Roles may share native actors; this is not an additive actor-spawn quota. Existing compatible content counts when it genuinely satisfies the outcome; do not create duplicate jobs merely to reach a number.

Start from **3–4 connected pockets**, approximately **3–5 S** across the local authored experience. Measure S at the default gameplay camera before using it; retain the sector's existing larger geography. Aim for **20–45 seconds** between useful observations/actions along the intended local route. A headline job's first complete approach may occupy roughly **10–18 minutes**; small opportunities generally occupy 20–120 seconds. These are **proposed pacing/composition bands, not measured current values, forced timers, required runtime clocks or rigid acceptance thresholds**. Adjust with evidence when the result plays better. Seclusion is earned through a navigable approach; the inhabited interior rewards reaching it.

Show at least one routine's actual source, work and destination on an ordinary visit. Different visits may expose different phases; no quest acceptance is required to start local life. Use native simulation/actor budgets, not every role and event simultaneously. The numbers define authored coverage, while production must measure and bound actual concurrent load. No more than one incident may demand urgent attention at a time.

**Inherited Open Reach scope:** `lw_pallas_funeral_freight`, `lw_pallas_short_cut`, `lw_pallas_salvage_ram`. All three remain mandatory, even when one appears below as a smaller opportunity rather than a headline slot. Do not reduce the original district brief.

## Spatial construction and navigation

Build a readable wreck gauntlet with two useful passages and a quieter inhabited court beyond it. One path admits a tug and load; another trades clearance for concealment. Preserve the Quiessence landmark and the existing Smuggler Den/Drift Market. Wreck mass creates cover and anchors without making all navigable openings lie inside a solid collider. Mark occupied hulls distinctly from empty salvage.

## Residents and institutional character

- A funeral tow pilot has a destination and a passenger history, not merely a smuggling disguise.
- A medical receiver recognizes the difference between a protected lot and stolen cargo bought back later.
- A salvage crew knows which apparently abandoned compartments still contain residents; Mara and the Children may be used only through their actual canonical station/beat gates.

## Ordinary life, even without an accepted mission

- The ferry boards/receives at a real berth, navigates the passage and returns on a readable schedule.
- Salvors cut unoccupied material and transport real salvage to their receiver.
- A lookout changes position for an actual approach or patrol, not an endlessly repeating alarm animation.

## Headline jobs — complete playable sequences

### 1. Funeral Freight

**Binding:** `lw_pallas_funeral_freight`. Preserve the native opportunity identity and extend its current implementation.

A medical shipment can travel under a real funeral tow. Study the operation, escort it, carry part of the load by an alternate passage, or deliberately steal it. An inspection or environmental obstruction creates a complication grounded in native state. Keep the tow, residents and finite medicine distinct: moving a cargo object does not imply rescuing everyone aboard. The clinic, crew memory and local service on return reflect the precise delivered/rescued amounts.

### 2. The Salvage Ram

**Binding:** `lw_pallas_salvage_ram`. Preserve the native opportunity identity and extend its current implementation.

Recover a useful ram from a worked wreck or earn its custody through a crew job. The machine has a practical use: opening a blocked salvage route without destroying an occupied hull. Offer a controlled approach and an expensive/brute physical alternative with readable collateral. Resolve the original machine’s identity and keep it usable afterward. Damage to the passage leaves a real repair task rather than resetting the gauntlet at sector load.

## Smaller opportunities and return reasons

- Complete inherited `lw_pallas_short_cut`: an alternate passage must be physically navigable, socially meaningful and remembered.
- A resident asks for a lamp or berth repair that makes the hidden court easier to find.
- A profitable salvage lot invites an ownership dispute with a real claimant and restitution path.

## Light, material, motion and sound

Rib silhouettes, warm inhabited windows, low directional worklights and reflected hull paint create enclosure. Quiet Berths must feel sheltered after the exposed gauntlet. Keep smoke and dust local enough to preserve the next opening and the player’s load. Domestic sound never becomes a constant distress broadcast.

## Continuing value and visible consequences

Develop a repair/salvage berth, lawful or illicit logistics and relationships that remain useful after the story. Upgrades add a service or useful route, not a second identical vendor. Recovery and restitution can reopen trust without erasing history.

## Connections beyond this sector

These are proposed causal relationships to realize through existing topology and owners, not new jump links or proof that the shipment already exists.

- Tethys denied freight has a real alternative here.
- Sker buys illicit property under a different social contract.
- Charon growth may affect salvage intake through bounded contaminated lots.

## Reuse and deduplication anchors

Inspect these live paths first; their presence does not establish player-route acceptance. The paths are starting points, not blanket write reservations.

- `src/data/wreckAftermathDressing.js`
- `src/systems/aftermathWrecks.js`
- `src/systems/npcJobsRuntime.js`
- `src/systems/shipjack.js`
- `src/data/factionConduct.js`
- `src/world/worldRecords.js`

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

- Small hull, tug and load traverse the intended routes with honest clearance and camera behavior.
- Occupied-hull rescue, cargo theft and salvage have independent truthful results.
- Return after repair/destruction preserves the route, residents and property memory.

## Explicitly reject

A green quest marker in an empty asteroid field; wrecks only as obstacles; destroying occupied homes as unmarked routine salvage; two interchangeable smuggler menus.

## Commission execution supplement — branch and proof

**Assigned branch:** This document is already in draft PR `experience-commissions/EC-S06-pallas-drift`. Add actual gameplay implementation and verification **to this same PR branch**; do not generate another plan, new branch or duplicate PR. Before editing, compare current master, concurrent implementation PRs, current native Finish status and exact `NOW.md` claims; integrate new work by the repository's allowed merge workflow and preserve foreign changes.

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
