# 00 — Studio verdict
## SpaceFace: recover the game, not the paperwork

**Audited snapshot:** `coldshalamov/SpaceFace`, commit `571659e86d892022e2dfa118f058bdcdd0c96eed`, September 5, 2026. **Assignment:** independent product, design, engineering, and production recovery review. **Disposition:** preserve the project and its strongest systems; change the convergence rules and finish a tightly connected playable slice before expanding the catalog.

SpaceFace has a distinctive game inside it. Its advantage is not an unprecedented number of commodities, ship parts, simulations, or agent-written plans. It is the possibility of using a personally piloted ship to **manipulate a working industrial world physically**: steal momentum, move something valuable, improvise with terrain, change a production route, and come back to a place that remembers what happened. The vision document articulates that advantage unusually well. The current build map also explicitly wants two expressions of the same game: fast physics-centric Swarm combat and an intellectually substantial Adventure built from customization, economy, and story. Keep both. [VISION] [BUILD]

My judgment is that the central development failure is **misaligned convergence**. The repository repeatedly converts a temporary implementation, an agent's diagnosis, or a conveniently measurable surrogate into binding design law. Later agents then optimize that law instead of the experience it was meant to protect. This is visible in contradictory controls, obsolete performance instructions, overprescribed visual techniques, outcome-counting rubrics, and economic rules that treat the industrial fantasy as an idle-game exploit to be suppressed. [GDD] [README] [PERFCAMPAIGN] [PERFORDER] [FUN] [VFXLAW] [AUTO]

That diagnosis is not an argument for a clean rewrite. The inspected runtime already contains significant, recent corrective work: explicit production profiles, a simulation/presentation ownership split, bounded fixed-step catch-up, a dynamic Rapier authority, force-based propulsion, attachment-specific behavior, a deterministic activity scheduler, collision feedback, engineering previews, persistent industrial sites, and live/virtual NPC jobs. Rebuilding those from their old descriptions would erase useful work while reproducing the same management failure. [PROFILES] [LOOP] [SIM] [PHYSICS] [FLIGHT] [ATTACH] [SCHEDULER] [FEELFX] [OUTFIT] [SITES] [JOBS]

## The acquisition decision

**Back this as a focused systemic action game, not as a small studio's attempt to simulate everything in a space empire.** Treat “A-list” as an experience standard: immediate control trust, distinctive expressive play, coherent presentation, dependable performance, meaningful progression, and a world whose important consequences the player can understand. Neither asset complexity nor document volume establishes that standard.

The first investment should produce one repeatably compelling experience in which the following chain works without explanatory rescue:

> I see a useful situation. I choose a physical tactic. My ship responds. The world reacts for a reason. Something valuable changes hands. That result improves what I can do next.

The chain must work in two contexts. In Swarm, its value is the next tactical opportunity, build choice, or escape. In Adventure, its value can also be cargo, a contract, a machine, a route, or a lasting relationship. One combat implementation; different encounter and progression structures. [BUILD] [PROFILES]

## Five decisions that unlock the project

### 1. Establish truth before issuing more work

Repair the active front door and the affected leaf packets in place. Keep `design/program/` as the status authority. Separate owner decisions, live implementation, measured outcomes, and experimental targets. Retire contradicted instructions with short replacement pointers; do not append another persuasive report and leave every old order active. The existing lifecycle-versus-acceptance split is useful and should survive. [PROGRAM] [BUILD]

The highest-confidence examples are concrete. The README assigns Space to fire while the current input module assigns it to tether. The GDD contradicts its own control scheme in onboarding. One performance operator orders an activity-scheduling task that another receipt says shipped, and the helper exists in code. The central reviewer checklist says reject on any “yes,” then asks positive questions about reachability and reporting. These are not philosophical disagreements. They are executable ambiguity. [README] [GDD] [INPUT] [PERFORDER] [PERFCAMPAIGN] [SCHEDULER] [BUILD]

### 2. Make the ship trustworthy, then make it spectacular

Characterize the current Hitch, one light combat hull, and one heavy work hull in both the Crucible and ordinary Adventure. Do not start by globally increasing thrust, recoil, stun, bloom, or enemy count. Identify which authority is causing each loss of control: the input projection, propulsion, solver contact correction, weapon consequence, attachment, camera, frame pacing, or an intentional control lock. Several old defects already have current code remedies; first establish whether they now feel right. [SHIPDATA] [FLIGHT] [PHYSICS] [FEELFX]

Keep physical-earned speed, explicit braking, useful assistance, and the deliberate player-contact protections. Make collision and tether outcomes legible rather than imposing mechanically pure symmetry that the owner has already rejected. The standard Massline's ordinary no-break policy is not a bug to “realism-fix.” Specialized heads can carry their own clearly advertised behavior. [ALIGNMENT] [ATTACH] [PHYSICS]

### 3. Replace invisible economic suppression with visible operational limits

The inspected automation code contains a passive-income token bucket, overflow discounting, continuous upkeep, fuel-expiry loss, and a programmed-drone path that adds ore to the player's hold. Asteroid-site export is routed through the same cap. Those mechanics are not a neutral backend. They decide whether industrial expansion feels like a growing physical capability or a collection of timers whose returns are arbitrarily shaved. [AUTO] [SITES]

My recommendation is to retire the global haircut as the primary economic balancing tool for physically earned industrial production. Use local throughput, reachable deposits, cargo capacity, routes, storage, demand, operating inputs, and chosen exposure to danger. Missing inputs should stop work visibly. A routine fuel shortage should not make a purchased machine cease to exist. This is a proposed product change requiring save and balance migration—not a license to delete the cap in isolation and unleash the old return curve.

### 4. Re-author the visual target as stylized industrial energy

The current request is less shiny, more luminous, more expressive, more artistic. Preserve authored 3D form and the rejection of cheap geometric stand-ins. Do not equate stylization with flattening the world, hiding detail, or applying neon to everything. But remove mandates that require every prominent object or effect to justify itself as a physically plausible manufactured artifact with a single permitted rendering technique. Camera-scale communication is the standard; manufacturing detail is a means. [ASSETLAW] [VFXLAW] [ROVERLAW]

Use matte colored structure, readable silhouettes, controlled specular highlights, strong engine and tool states, directional impacts, and long useful motion trails. Reserve the highest luminance and motion for the thing the player must understand now. Current bloom has already been raised and sector overrides have changed; another global increase is not an art direction. [BLOOM] [SECTORART]

### 5. Finish the industrial connection, not an isolated rover screen

The mine's strongest existing design is “dig now or preserve a productive face,” with tunnels as a logistics plan and geology as functional infrastructure. Develop that into a compact industrial game that pays back into the flight world. A good session should result in something the player can see outside: a stocked berth, an export pod, a working machine, a changed route, or a capability for the ship. [ROVERLAW] [SITES]

Preserve the square, straight-on grid and real 3D objects. Preserve the newer surgical tap/hold movement rather than re-fixing the old 0.06-second repeat. Resolve the contradictory survey and permanence rules, then make the first productive site attainable and understandable. Do not require the entire factory game as a toll booth before the player can enjoy combat. [ROVERLAW] [DRILL] [DRILLUI] [SITES]

## What not to fund next

Do not fund another generic engine migration, another blanket ship remaster, another unbounded NPC ecosystem, another array of abilities bound across the keyboard, or another infrastructure campaign whose only demonstrated outcome is a green checker. Those may each contain useful local work; none is the default cure for this game's current problem.

Also do not treat every existing safety rail as bureaucratic waste. Single writers, production-route parity, bounded queues, stable identities, save migrations, normal-camera evidence, and independent acceptance are valuable. The problem is not rigor. It is rigor applied to the wrong proposition. [AGENTS] [PROGRAM] [PROFILES] [SIM]

## What this audit establishes—and what it does not

This is a substantial **static, source-grounded audit of selected repository documents and runtime owners**, not a claim to have read every file. Every reviewed path and requested range is recorded in the evidence ledger. The complete repository was not available as an executable local checkout through this environment; no firsthand gameplay session, headed GPU capture, repository test-suite run, or fresh hardware benchmark was performed. The report distinguishes current source behavior, repository-reported historical measurements, engineering inferences, and design recommendations.

The standalone reference modules included in the package are different: they are newly written analytical examples, tested locally. Their test output is included. They are not an integrated patch and do not prove that SpaceFace's runtime passes their properties.

The practical consequence is precise: the report can identify contradictory instructions, trace inspected authority paths, derive failure conditions, and prescribe bounded experiments. It cannot honestly certify that today's game now feels good, that a particular GPU is fast enough, or that the proposed product will achieve a commercial tier. Those remain acceptance outcomes, not adjectives bestowed by a report.

<!-- Source links are pinned to the audited commit. -->
[AGENTS]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/AGENTS.md
[VISION]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/VISION.md
[GDD]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/GDD_2_0.md
[PROGRAM]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/README.md#L1-L180
[BUILD]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/CANONICAL_BUILD_MAP.md#L1-L145
[README]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/README.md#L1-L170
[ALIGNMENT]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/VISION_ALIGNMENT_PLAN.md#L1-L180
[FUN]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/FUN_CONVERGENCE_LOOP.md#L1-L210
[LOOP]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/loop.js#L1-L220
[SIM]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/simulationRunner.js#L1-L220
[PROFILES]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/runtime/runtimeProfiles.js#L1-L170
[FLIGHT]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/flight/propulsionKernel.js
[INPUT]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/input.js#L200-L390
[ATTACH]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/combat/attachments.js#L1-L210
[PHYSICS]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/sg02DynamicBodyOwner.js
[PERFCAMPAIGN]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/PERF_HITCH_CAMPAIGN.md#L1-L200
[PERFORDER]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/PERF_WHAT_MATTERS.md
[SCHEDULER]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/activityScheduler.js#L1-L210
[SHIPDATA]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/data/ships.js#L1-L160
[OUTFIT]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/ui/screens/outfitting.js#L1-L180
[AUTO]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/automation.js
[ROVERLAW]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/ASTEROID_WORKS_DESIGN_LAW.md#L1-L210
[DRILL]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/drill.js
[DRILLUI]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/ui/screens/drill.js#L1-L165
[SITES]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/asteroidSites.js#L1-L200
[JOBS]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/npcJobsRuntime.js#L1-L195
[BLOOM]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/render/bloom.js#L1-L190
[SECTORART]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/data/sectorVisualProfiles.js#L1-L150
[FEELFX]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/render/feel.js#L1-L190
[VFXLAW]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/docs/visual-assets/VFX_TECHNIQUE_STANDARD.md#L1-L145
[ASSETLAW]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md#L1-L140
