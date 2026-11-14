# EC-G11 — A machine that keeps its promises — smoothness, residency and load

## Director's card — read this first

*From the creative director, 2026-11-09. The standard, the cast and the build order are in [09 — Creative direction](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/09_CREATIVE_DIRECTION.md). Where this card and the brief below disagree on **scope or order**, the card wins. On **ids, canon and who owns which state**, the brief wins.*

**What this is for:** the game never freezes and never jumps.

**What is actually wrong — read from the code on 2026-11-09, not from a status page:**
- When a simulation step runs long, the worker **throws the lost time away** (`wholeSimBrowserWorker.js` batch cap and debt drop). The game itself then runs slow — status traces show 0.11–0.40× real time in busy scenes. The smoothing buffer (`snapshotFence.js`) can hide about a fifth of a second; after that it holds the last positions.
- **Decorations run on a second clock.** The speed-gauge ring is a browser animation that keeps going even when the page is blocked (`speedDial.js`). Idle spins, asteroid tumble, arena dressing, the backdrop and several shader clocks advance by frame time, not by the presented time the ships use. That is precisely "the gauge spins and the ships are frozen".
- After a long silence the picture **snaps in one frame**. That is the blip.
- The step is slow because three-quarters of physics time is script walking every body (the solver is the small part), every tick makes about 1.5 MB of garbage, and the economy does about 50 ms of work in a single tick with its slicing switched off.
- Not the cause: the fast shared-memory path has its headers in the dev server, the desktop app and the hosted build. It still needs one proof on a packaged desktop run.

**No engine port.** The worker-plus-buffer design is sound. Two pieces get rebuilt: how a tick is scheduled, and how bodies are stored.

**Build in this order. Each step has a proof an agent can run alone in under two minutes.**
1. **A time budget for every tick.** Physics and flight always run. Economy (slicing on), tactical AI, tether play and NPC jobs take turns across ticks under a hard allowance, so the simulation never runs slower than real time. *Proof:* `node scripts/probe-sim-step.mjs` — 99th percentile at or under 12 ms, worst at or under 25 ms, no shed steps across 900 ticks of a crowded scene.
2. **One clock on screen.** Everything in the list above advances from the presented clock, and the gauge ring's speed follows the playback rate. If anything is ever late, the whole picture slows together. *Proof:* run with `?simStall=400`; decoration time divided by presented time reads 1.0 on every frame.
3. **Stop the per-tick garbage** — store bodies in flat columns (the first slice of E4). *Proof:* the profiler's allocation column reads 50 KB a tick or less.
4. **Ease, never snap.** After a silence, run up to one and a half times speed for at most 300 ms. *Proof:* `?simGap=400@2500@3500` shows no frame over the movement bar.
5. **A drawing budget on the main thread** (E7), because a slow frame there pauses the simulation through the heartbeat. *Proof:* zero heartbeat holds across a sixty-second busy route.

**Director's ruling, to end the open argument in E1:** the smoothness bar is measured against the speed *shown on screen*. A collision stop is not a jump. Close that gate and move to step 1.

**Done when:** ten minutes of crowded Helios and one Swarm run to round twenty, recorded on the owner's laptop, show no moment where a ship holds while anything else moves, and no jump longer than the ship.

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
**Native parents:** `E1`, `E2`, `E3`, `E4`, `E5`, `E6`, `E7`, `E8`, `E9`, `E10`  
**Source-review baseline:** `f95de0eb1ba7560839209936afba48c7b96fe41a` · 2026-11-08  
**Commission status:** authored; current gameplay must be inspected, not presumed complete or absent.  

This is a complete, standalone assignment for an implementation agent with the repository. Its EC label is a document address, not a new task queue or runtime identifier. Read current native authority and reconcile changed source before acting. New scene treatments and numerical composition bands are design proposals commissioned by the owner; existing IDs and inherited opportunity obligations remain authoritative unless deliberately migrated.

## Player promise

The player’s ship cannot stop while decorative objects keep dancing. Busy places and extravagant Swarm combat must be supported by a measured architecture, not a pendulum between blurry graphics and frozen simulation. Complete the active engine campaigns instead of starting another optimization mythology.

## Diagnose the actual gap

Answer these by inspecting current source and the ordinary route; they are not questions to return to the owner.

- Read current campaign/status and exact live path claims. Reproduce the worker/main/render symptom with a trace; do not assume an earlier report describes the current bottleneck.
- Attribute time to authoritative sim work, transport arrival, pose presentation, render CPU, GPU, layout/allocation and asset admission. The symptom of smooth scenery plus stopped ships specifically requires separating clocks.
- Measure representative normal and crowded Adventure/Swarm routes on the target device. A headless software-renderer run can test logic, not establish the target GPU verdict.

## Required construction

### Presentation continuity

Finish the current timestamped-snapshot/interpolation/reconciliation design with bounded prediction and explicit teleport discontinuities. Evaluate input latency and collision correction, not just whether a curve looks smooth. Do not hide indefinitely stalled authoritative state by extrapolating forever.

### Hot work becomes bounded

Use the E10 profile to select actual expensive contacts, scans, dispatch, allocations and periodic spikes. Preserve single-writer/deterministic outcomes. Apply mode-scoping, spatial/indexed data and bounded batching where the active campaign requires it; verify equivalence or document an intended versioned behavior change.

### Assets arrive ready

Unify the existing residency/upload/compile path so visible authored assets do not pop, blink or freeze the first interaction. Predict upcoming sector/arena needs within memory budgets. Do not replace required identity with hidden procedural stand-ins and call the playable-route test a visual pass.

### Render work is deliberate

Address measured per-draw/per-frame discovery, material/program-key churn, unnecessary allocations and state changes. Batch/instance when identity and behavior permit. Make any WebGPU/native choice through the existing measured spike/decision, not by taste or a blanket rewrite.

### Load and platform parity

Preserve one ordinary game entry across browser and Electron, with correct shared-memory/isolation behavior where supported. Follow current E9 launch/payload targets and measure cold and warm starts. A responsive title must not disguise an unready player world.

### No quality ransom

Keep full authored player identity, necessary lighting, collision readability and action cues. Performance improvements must not be purchased by secretly reducing screen resolution, deleting world life, altering forces or silencing useful feedback. Any intentional tradeoff needs a matched measured visual result.

### Architectural decisions are finite

Use existing E8 criteria to assess a port only at the approved stage. Do not hold content forever behind a speculative engine replacement. A negative experiment is a decision; preserve useful results and return to the chosen production path.

## Representative integrated scenes

- The reported acceleration/turn/boost/tether combination near working geometry, with sim and render clocks traced separately.
- A busy Swarm fight with Brood, real ships, useful terrain and effects under native caps.
- A populated harbor/interior transition on cold and warm load, then return/Continue without admission gaps.

## Direct acceptance and finite stopping point

- Active master-plan performance/continuity bars are measured against current baseline on the relevant hardware; unresolved bars remain open.
- No known held-pose/blip, asset admission cliff or unbounded hot-path growth in the named routes.
- Physics/economy/save meaning and visual identity remain preserved.
- All useful findings/changes are integrated into existing E-campaign state, not another parallel profiler/report program.

## Reject these substitutes

Lower resolution as an unmeasured first response; fake motion hiding a dead sim; repeated benchmark loops without a hypothesis-changing fix; a port before evidence; green unit tests as frame-rate proof.

## Deliverables

The shared technical foundation and explicit body/light/memory/frame budgets consumed by every area. Area agents provide representative worst-case scenes and must not privately fork transport/render behavior.

## Existing owners and coordination

- `src/core/presentationRunner.js`
- `src/core/simLaneMain.js`
- `src/core/wholeSimBrowserWorker.js`
- `src/core/physics.js`
- `src/render/renderer.js`
- `src/render/partsLibrary.js`
- `design/program/finish/MASTER_PLAN.md`

Coordinate with `EC-G02`, `EC-G03`, `EC-G08`, `EC-A01`, `EC-A07`, `EC-S01`, `EC-S02`, `EC-S11`. These are consumers/collaborators, **not all-finished-first prerequisites**. Agree the smallest shared interface, prove it in a real consumer, and let both sides progress. A geographic owner must not duplicate this shared mechanism; this shared owner must not hold all content hostage while pursuing a general framework.

## Commission execution supplement — branch and proof

**Use this existing draft commission PR branch:** `experience-commissions/EC-G11-a-machine-that-keeps-its-promises`. Add implementation commits and evidence here; do not make another planning PR or an unrelated issue farm. First inspect current master, concurrent PRs, native Finish campaign/status and exact `NOW.md` write claims. Shared code remains with canonical one-writer owners; organize dependent PRs only when path conflicts require them, with the consumer in this PR remaining accountable for real play.

**Technical and creative direction:** Diagnose a named broken/immature player route before extending any architecture. Compare 2–3 remedies for the largest gap and implement one justified by visible usefulness, motion/readability, durability and expected cost. Prove in real Adventure and/or Swarm consumer scenes; never close from a disconnected test harness. CRITICAL: E1–E10 are distinct live Finish campaigns. This PR is their shared experience/integration brief, **not a grant for one agent to modify all E-program files or close them from a single benchmark**. Preserve existing lane owners and implement only exact free segments; link shared dependent fixes.

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
