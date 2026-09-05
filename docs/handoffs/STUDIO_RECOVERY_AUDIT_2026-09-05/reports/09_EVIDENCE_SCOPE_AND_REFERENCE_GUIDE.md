# 09 — Evidence, source scope, and reference-code guide
## What this audit establishes—and what remains unmeasured

The audit is anchored to `coldshalamov/SpaceFace` at commit `571659e86d892022e2dfa118f058bdcdd0c96eed`, inspected on September 5, 2026. All repository citations point to that snapshot rather than a moving branch. The owner's current request supplies the governing assignment and the new visual direction. This report does not attribute its additional proposals to the owner as though they were prior quotations.

The research path covered product intent, the central build/program documents, feel and art contracts, historical performance and alignment audits, selected active packets, and the live owners for input, flight, physics, impulses, attachments, economy, automation, fitting, rover/site state, NPC jobs, engagement, Swarm, and presentation.

## 9.1 Evidence classes

**Source-confirmed behavior** means the inspected code or document contains the stated mechanism or rule. It does not automatically establish how often that path executes or how it feels. For example, the physics owner explicitly disables sleeping; that is confirmed. The amount of frame time that choice costs on a particular device is unmeasured here.

**Historical repository evidence** means a document reports a prior experiment, image, owner decision, or measurement. The report labels these as historical and checks key diagnoses against newer code. It does not claim to have rerun those experiments or viewed their captures.

**Engineering inference** means a consequence follows from the inspected structure under stated assumptions. The per-body scan of attachments suggests a body-count × attachment-count cost; it does not prove that scan dominates frame time. The simplified rope calculation identifies a feasibility tradeoff; it is not a recording of the live spring.

**Product recommendation** means a proposed change to make the intended game more coherent or enjoyable. Replacing routine fuel-expiry destruction with inactivity, revising the passive-income limiter, changing Swarm's refill rhythm, and adopting the proposed style slice are recommendations. They need the bounded experiments and migrations described in their chapters.

**Locally tested reference behavior** applies only to the new standalone modules in this ZIP. Their tests were executed with Node.js 22.16.0. Those results are not SpaceFace test-suite results.

## 9.2 Explicit limits

No complete runnable checkout was available in this environment. GitHub connector reads succeeded; direct local repository acquisition did not. No firsthand gameplay session, live input recording, headed GPU capture, current performance benchmark, binary-asset visual inspection, or repository test-suite execution was performed.

The audit did not read every repository file, every active packet, every test, or the complete bodies of all large owner modules. Some tool responses were truncated; those limitations are retained in the source index. Requested line ranges below describe the requested slices, not a claim that a truncated response supplied every character through the final line.

Audio implementation, the complete save/transaction pipeline, every event consumer, all scheduler call sites, complete shader/material usage, and the full late-game catalog remain outside exhaustive coverage. Recommendations touching those areas explicitly require current-owner verification. Import presence is not treated as proof of runtime use. A document's claim that an event has no listeners is not presented as an independently verified whole-repository search result.

No current bottleneck, minimum supported GPU, present average frame rate, asset-quality score, or commercial reception is invented. No remote branch, commit, or PR was created. The source repository remains unchanged by this audit.

## 9.3 How another agent should use this package

Read the executive verdict and authority audit first, then the relevant system chapter and work order. Locate the existing packet named in the delivery plan. Re-read its owner code at the working commit and compare the relevant source behavior with this snapshot. Do not restore an old bug simply because a historical document still describes it.

Admit approved design changes into the existing build/program authority. Keep implementation status separate from player acceptance. Use the machine-readable findings as an audit checklist, not an alternative `--next` queue. Preserve existing save and ownership constraints while changing the rules that the current owner wants reconsidered.

The report's inline capitalized source IDs link directly to pinned repository files or primary technical documentation. `evidence/sources.json` provides the same mapping with scope notes. `evidence/findings.json` contains the authority/assumption findings with classifications and proposed dispositions.

## 9.4 Reference modules and demonstrated properties

| Module | Purpose | Demonstrated checks | Deliberate exclusions |
|---|---|---|---|
| `ropeEnvelope.mjs` | Diagnose load, extension target, and a scalar time-step stiffness envelope | Reduced mass, fixed anchors, equilibrium relation, target stiffness, short-line infeasibility, invalid input | No live forces, constraint solver, contact coupling, or claim of Rapier stability |
| `maneuverEnvelope.mjs` | Plan a speed envelope on supplied arc-length/curvature samples | Acceleration/braking, curvature caps, triangular short-segment timing, boundary-speed infeasibility | No spline creation, obstacle detection, steering integration, or guarantee between undersampled curvature extrema |
| `transferPlan.mjs` | Demonstrate immutable atomic trade semantics and durable idempotence | Conservation, capacity, stock/funds checks, retries across JSON restore, receipt collision, integer overflow | No production writer adapter, real commodity volume, authorization layer, slippage model, or durable checkpoint implementation |
| `frameAudit.mjs` | Analyze exported frame traces without misleading phase arithmetic | Quantiles, foreground coverage, GPU-validity handling, shed-time accounting, manifest comparability | No instrumentation hook, actual capture, display-present timing guarantee, or statistical significance test |

Run the examples from the `reference_code` directory:

```bash
node --test reference.test.mjs
node examples.mjs
node frameAudit.mjs synthetic-frame-trace.json
```

The included test run passes 33 tests. Its raw output is `evidence/reference-test-results.txt`. The example outputs are also retained. The frame fixture and its analysis are prominently labeled **synthetic** and must never be quoted as SpaceFace performance.

The rope example uses movable masses 18 and 630, speed 200, rest length 100, and fixed stiffness 170 as a declared analytical case. It gives reduced mass 17.5, an exact fixed-speed equilibrium extension ratio of about 0.3135, and the small-extension approximation 0.4118. Requiring five-percent extension gives K ≈ 1333.33 under that model. At length 8, the required K rises to about 208333.33, above the chosen scalar envelope ceiling 15750. These are diagnostic calculations; the current game already has load-scaled stiffness, so the fixed-K examples are not claims about its current stretch.

The short-stroke example travels one unit from rest to rest with acceleration and braking magnitude 100 and a speed ceiling of 100. Its fastest triangular profile takes 0.2 seconds and averages 5 units per second. This is a counterexample to an unrestricted requirement that every stroke maintain seventy percent of cruise—not a recommendation to make normal gestures slow.

The transaction example transfers three ore units at five credits each, conserves goods and money, and does not execute twice after a JSON save round trip even when the original quote has expired. The retained receipt resolves the exact retry. A different request reusing the same identity is rejected.

## 9.5 Repository source index

The index contains **48 distinct repository paths** and **6 external primary/API documentation references**. Repeated reads of different ranges are consolidated below.

| Source | Inspected scope and limitation |
|---|---|
| [AGENTS] — `AGENTS.md` | Requested lines: Returned excerpt; see note. Selected substantial excerpt; response truncated. Not a claim of full-file review. |
| [VISION] — `design/VISION.md` | Requested lines: Returned excerpt; see note. Substantial Part I and beginning of Part II; response truncated. |
| [GDD] — `design/GDD_2_0.md` | Requested lines: 1–160, 160–350. Selected sections; do not treat everything described here as implemented. |
| [ORIENTATION] — `docs/ORIENTATION.md` | Requested lines: Returned excerpt; see note. Orientation text returned; architecture descriptions checked against selected live owners. |
| [MODULEMAP] — `docs/MODULE_MAP.md` | Requested lines: 1–240. Navigation excerpt; response truncated. File size/count annotations not independently verified. |
| [PROGRAM] — `design/program/README.md` | Requested lines: 1–180. Program lifecycle/acceptance authority; returned text ends before requested maximum. |
| [BUILD] — `CANONICAL_BUILD_MAP.md` | Requested lines: 1–145. Current front door, order, rules, and reviewer checklist. |
| [README] — `README.md` | Requested lines: 1–170. Root pitch, controls, implementation claims, launch policy. |
| [ALIGNMENT] — `design/program/VISION_ALIGNMENT_PLAN.md` | Requested lines: 1–180. Historical August 10 audit and recorded owner decisions; not a current runtime measurement. |
| [FUN] — `design/program/FUN_CONVERGENCE_LOOP.md` | Requested lines: 1–210. Current methodology and scoring rules, including negative-polarity rubric question. |
| [FEEL] — `design/FEEL_CONTRACT.md` | Requested lines: 1–190, 88–250. Mixed historical defect rows and newer September 5 results. Reported values not remeasured in this audit. |
| [REGISTRY] — `src/core/registry.js` | Requested lines: 1–220. Selected imports and ownership wiring; import presence alone does not prove every-tick execution. |
| [LOOP] — `src/core/loop.js` | Requested lines: 1–220. Short adapter returned in full; simulation/presentation split already exists. |
| [SIM] — `src/core/simulationRunner.js` | Requested lines: 1–220. Fixed-step and backlog policy, completed-tick metadata. |
| [PRESENT] — `src/core/presentationRunner.js` | Requested lines: 1–180, 470–680, 680–860. Lifecycle, journal handling, advance/render, timing and recovery excerpts. |
| [PROFILES] — `src/runtime/runtimeProfiles.js` | Requested lines: 1–170. Explicit production and legacy47a feature profiles. |
| [FLIGHT] — `src/core/flight/propulsionKernel.js` | Requested lines: 1–210, 280–470, 600–815. Selected governor, assistance, family and manual-input force paths. |
| [INPUT] — `src/systems/input.js` | Requested lines: 200–390. Action bindings and conditional steering/braking projection. |
| [WINCH] — `src/core/constraints/masslineController.js` | Requested lines: 1–210. Winch/telemetry controller; these defaults are not the entire production attachment policy. |
| [ATTACH] — `src/combat/attachments.js` | Requested lines: 1–210. Heads, migrations, and automatic-break policy. |
| [IMPULSE] — `src/combat/impulseKernel.js` | Requested lines: 1–220. Hitstun, collision multipliers, impulse provenance and terrain consequence constants. |
| [PHYSICS] — `src/core/sg02DynamicBodyOwner.js` | Requested lines: 1–170, 535–720, 780–852, 850–1040. Current spring constants, structural give, dynamic sleep prohibition, CCD, pooling and loop excerpts. |
| [PERFCAMPAIGN] — `design/program/PERF_HITCH_CAMPAIGN.md` | Requested lines: 1–200. Historical route measurements and sweep receipts; long response truncated. |
| [PERFORDER] — `design/program/PERF_WHAT_MATTERS.md` | Requested lines: Returned excerpt; see note. Returned operator document; conflicts with later shipped/closed work. Measurements are repository-reported. |
| [SCHEDULER] — `src/core/activityScheduler.js` | Requested lines: 1–210. Short file returned; duty-cycle helper exists. All call sites were not exhaustively audited. |
| [NEWGAME] — `src/data/newGameDefaults.js` | Requested lines: 1–180. Starting credits, hull ID, fittings, cargo and location; short file. |
| [SHIPDATA] — `src/data/ships.js` | Requested lines: 1–160. Hitch and selected T1 hulls plus first T2 entry; not a full catalog census. |
| [SHIPS] — `src/systems/ships.js` | Requested lines: 1–170. Derived-stat ownership, station access, head exclusivity, living-hull imports and presets. |
| [MODULES] — `src/data/modules.js` | Requested lines: 1–165. Selected standard modules and behavior-changing Massline heads. |
| [OUTFIT] — `src/ui/screens/outfitting.js` | Requested lines: 1–180. Engineering preview imports, fit/purchase validation and inventory behavior. |
| [ECON] — `src/systems/economy.js` | Requested lines: 1–190, 950–1140. Pricing model, credit bounds, market construction, synthetic history and observed-price memory. |
| [AUTO] — `src/systems/automation.js` | Requested lines: 1–190, 460–650, 700–900. Passive-cap design, update/expiry, programmed cargo mining/selling and visible drones. |
| [ROVERCAMPAIGN] — `design/program/ASTEROID_WORKS_PLAYFIELD.md` | Requested lines: 1–185. Historical owner playtest plus subsequent amendments; do not infer current screen appearance. |
| [ROVERLAW] — `design/ASTEROID_WORKS_DESIGN_LAW.md` | Requested lines: 1–210. Positive mining/factory design, owner rulings, art and rigid numeric UI specifications. |
| [DRILL] — `src/systems/drill.js` | Requested lines: 1–185, 530–705. Cadence fixes, geology, recovery and persistent-site bypass. |
| [DRILLUI] — `src/ui/screens/drill.js` | Requested lines: 1–165. Current remap-aware input adapter and bounded render-frame catch-up. |
| [SITES] — `src/systems/asteroidSites.js` | Requested lines: 1–200. Durable site state, Massline Core anchoring, logistics imports, cap routing and survey listeners. |
| [ENGAGE] — `src/ai/engagementAuthority.js` | Requested lines: 1–205, 185–350. Final engagement authorization, first-session cap, bounded convoy predation and hostility. |
| [JOBS] — `src/systems/npcJobsRuntime.js` | Requested lines: 1–195. Live/virtual adapter, global job time, materialization, and explicitly authored physical relationships. |
| [BLOOM] — `src/render/bloom.js` | Requested lines: 1–190. Current custom post pipeline and defaults; source comments refer to r160 behavior. |
| [SECTORART] — `src/data/sectorVisualProfiles.js` | Requested lines: 1–150. Helios and other selected sector composition, lighting and bloom overrides. |
| [FEELFX] — `src/render/feel.js` | Requested lines: 1–190. Collision feedback, real-time cooldown, FOV limits and speed-line limits already exist. |
| [VFXLAW] — `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md` | Requested lines: 1–145. Strong appearance rationale plus technique-wide prohibitions and required construction. |
| [ASSETLAW] — `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md` | Requested lines: 1–140. Existing validity/acceptance split, camera-first rule and material/assembly paperwork. |
| [WORLDPLAN] — `design/program/roadmap/active/PQ-138.md` | Requested lines: 1–170. Connection work packet; missing-listener claims are packet-reported, not independently verified at every current producer/consumer. |
| [ECONPLAN] — `design/program/roadmap/active/PQ-177.md` | Requested lines: 1–160. Economic surfacing plan, forecast uplift and interesting-decision acceptance proxies. |
| [SWARMARENA] — `src/systems/swarmArena.js` | Requested lines: 1–175. Event-driven debris placement, terrain/wreck retention and historical play notes; no fresh runtime census. |
| [SWARMCURVE] — `src/data/swarmMode.js` | Requested lines: 1–185. Current concurrency, refill, cadence, roster and boss-rotation excerpts. |


## 9.6 External primary/API documentation

External documentation supports limited technical API claims. The game-design recommendations and mathematical examples are original analysis, not claims that an external source has validated SpaceFace. Current documentation must be reconciled with the vendored library versions before adopting any API.

| Source | Use in the audit |
|---|---|
| [THREECOLOR] | Official current documentation checked September 5, 2026. Verify APIs against vendored revision before implementation. |
| [THREEBATCH] | Official current documentation; not a drop-in API promise for the repository version. |
| [GPUTIMER] | Primary API documentation: asynchronous GPU timer queries and disjoint validity. WebGL2 has its own extension. |
| [SLEEP] | Official Rapier sleep/wake behavior; architectural recommendations are independent analysis. |
| [DETERMINISM] | Official same-version/initialization/order requirements and JavaScript transcendental caveat. |
| [BODIES] | Official rigid-body/collider and force integration concepts. |


## 9.7 Acceptance evidence still required

The next executable review needs a current production-route frame trace on named hardware, a normal-speed control/combat capture, a save/reload demonstration through the economic and site transactions, a current event-consumer trace for the chosen Adventure incident, and an approved mixed-scene visual candidate.

These artifacts answer the unresolved questions. They should be attached to the existing packets that perform the work, not collected as an independent documentation project. The value of this audit is to make those experiments smaller and their conclusions harder to misinterpret.

<!-- Source links are pinned to the audited commit. -->
[AGENTS]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/AGENTS.md
[VISION]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/VISION.md
[GDD]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/GDD_2_0.md
[ORIENTATION]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/docs/ORIENTATION.md
[MODULEMAP]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/docs/MODULE_MAP.md#L1-L240
[PROGRAM]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/README.md#L1-L180
[BUILD]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/CANONICAL_BUILD_MAP.md#L1-L145
[README]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/README.md#L1-L170
[ALIGNMENT]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/VISION_ALIGNMENT_PLAN.md#L1-L180
[FUN]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/FUN_CONVERGENCE_LOOP.md#L1-L210
[FEEL]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/FEEL_CONTRACT.md
[REGISTRY]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/registry.js#L1-L220
[LOOP]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/loop.js#L1-L220
[SIM]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/simulationRunner.js#L1-L220
[PRESENT]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/presentationRunner.js
[PROFILES]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/runtime/runtimeProfiles.js#L1-L170
[FLIGHT]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/flight/propulsionKernel.js
[INPUT]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/input.js#L200-L390
[WINCH]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/constraints/masslineController.js#L1-L210
[ATTACH]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/combat/attachments.js#L1-L210
[IMPULSE]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/combat/impulseKernel.js#L1-L220
[PHYSICS]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/sg02DynamicBodyOwner.js
[PERFCAMPAIGN]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/PERF_HITCH_CAMPAIGN.md#L1-L200
[PERFORDER]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/PERF_WHAT_MATTERS.md
[SCHEDULER]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/activityScheduler.js#L1-L210
[NEWGAME]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/data/newGameDefaults.js#L1-L180
[SHIPDATA]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/data/ships.js#L1-L160
[SHIPS]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/ships.js#L1-L170
[MODULES]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/data/modules.js#L1-L165
[OUTFIT]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/ui/screens/outfitting.js#L1-L180
[ECON]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/economy.js
[AUTO]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/automation.js
[ROVERCAMPAIGN]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/ASTEROID_WORKS_PLAYFIELD.md#L1-L185
[ROVERLAW]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/ASTEROID_WORKS_DESIGN_LAW.md#L1-L210
[DRILL]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/drill.js
[DRILLUI]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/ui/screens/drill.js#L1-L165
[SITES]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/asteroidSites.js#L1-L200
[ENGAGE]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/ai/engagementAuthority.js
[JOBS]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/npcJobsRuntime.js#L1-L195
[BLOOM]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/render/bloom.js#L1-L190
[SECTORART]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/data/sectorVisualProfiles.js#L1-L150
[FEELFX]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/render/feel.js#L1-L190
[VFXLAW]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/docs/visual-assets/VFX_TECHNIQUE_STANDARD.md#L1-L145
[ASSETLAW]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md#L1-L140
[WORLDPLAN]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/roadmap/active/PQ-138.md#L1-L170
[ECONPLAN]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/roadmap/active/PQ-177.md#L1-L160
[THREECOLOR]: https://threejs.org/docs/pages/Color.html
[THREEBATCH]: https://threejs.org/docs/pages/BatchedMesh.html
[GPUTIMER]: https://developer.mozilla.org/en-US/docs/Web/API/EXT_disjoint_timer_query
[SLEEP]: https://rapier.rs/docs/user_guides/javascript/rigid_body_sleeping/
[DETERMINISM]: https://rapier.rs/docs/user_guides/javascript/determinism/
[BODIES]: https://rapier.rs/docs/user_guides/javascript/rigid_bodies/
[SWARMARENA]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/swarmArena.js#L1-L175
[SWARMCURVE]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/data/swarmMode.js#L1-L185
