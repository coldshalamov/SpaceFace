# 02 — The assumptions that steer the project sideways
## Repair authority before adding another layer of instructions

The repository does not suffer from an absence of standards. It contains unusually detailed standards, a central work queue, ownership rules, a deterministic laboratory, acceptance states, and many explicit accounts of previous mistakes. Much of that infrastructure is useful. The failure is that **design intent, implementation description, historical diagnosis, and acceptance hypothesis repeatedly occupy the same authoritative voice**. A later agent cannot reliably distinguish “the owner wants this” from “a previous agent happened to build this.” [AGENTS] [PROGRAM] [BUILD] [GDD]

That distinction matters more than the total volume of documentation. A thousand pages of correctly labeled evidence are manageable through routing. Ten paragraphs of contradictory law can make every task diverge.

## 2.1 How an accidental assumption becomes permanent

A typical failure chain is: an ambiguous desire becomes a specific implementation; the implementation is summarized as the design; a test records its current behavior; the summary becomes an instruction to preserve that behavior; a later agent interprets the owner's dissatisfaction as a request for more polish around it. The result is technically disciplined movement in the wrong direction.

The GDD's explanation that a control section was rewritten to describe shipped behavior illustrates the risk. Describing shipped behavior is valuable, but it must not silently ratify every behavior as the intended product. Likewise, a campaign that correctly diagnoses a defect can become harmful after the defect has been fixed and the campaign still orders the same remedy. [GDD] [PERFORDER] [PERFCAMPAIGN]

The remedy is not “ignore the docs.” Keep engineering invariants, versioned state contracts, and ownership boundaries. Reclassify the assertions that determine what game gets made.

## 2.2 Concrete authority and convergence findings

The following findings are deliberately mixed in severity. Some are direct contradictions, some are stale instructions, and some are design rules that should become hypotheses. They are not all runtime bugs.

| Finding | Evidence and classification | Required disposition |
|---|---|---|
| Three descriptions of basic controls | The root README says Space fires; the GDD's control section assigns Space to Massline; its onboarding teaches Space as brake. The inspected input bindings assign Space/F to tether. **Confirmed documentation contradiction.** | Generate binding labels from action data. Rewrite the onboarding conceptually and verify it against the shipping scheme. [README] [GDD] [INPUT] |
| Reverse versus brake | The GDD's terminology includes reverse/brake. The current propulsion path uses braking to suppress manual forward/strafe force rather than providing ordinary assisted reverse thrust. **Confirmed semantic mismatch.** | Name the actual action accurately; changing the action itself is a separate product decision. [GDD] [FLIGHT] |
| Old catch-up limit | Orientation says eight steps while the current simulation runner caps ordinary catch-up at four. **Confirmed stale architecture description.** | Link the constant or generate this factual excerpt. Do not change the runtime back to match the prose. [ORIENTATION] [SIM] |
| A shipped scheduler is still ordered as the next fix | The performance operator calls table cadence the next major task; the campaign calls the relevant work already shipped, and the activity-tier scheduler exists. **Confirmed instruction conflict; full call-site coverage unverified.** | Reconcile the work receipt and inspect remaining consumers. Do not rebuild the scheduler. [PERFORDER] [PERFCAMPAIGN] [SCHEDULER] |
| Historical zero craft damage | An older alignment audit identifies a zero craft-damage multiplier. The current impulse kernel has a nonzero multiplier. **Obsolete diagnosis.** | Test present damage/feel; do not repeat the zero-to-nonzero patch. [ALIGNMENT] [IMPULSE] |
| Historical forward-held overspeed braking | Older defects describe a governor that destroys earned speed. The current governor has a zero brake floor in that path. **Old remedy already represented in code.** | Test release, boost, contact, and assistance interactions at the current base. [FEEL] [FLIGHT] |
| Historical bungee diagnosis | The feel document includes a fixed-stiffness stretch analysis. The current physics owner already scales stiffness with load and has a five-percent stretch target. **Analysis must be updated.** | Investigate stability-bound cases and live tracking error, not the already-replaced constant alone. [FEEL] [PHYSICS] |
| Historical rover rocket | The playtest records a 0.06-second cell cadence. Current code has a tap/hold split, delayed cruise, and visible bore bite. **Fix present; subjective acceptance unverified.** | Validate responsiveness and frame-rate behavior instead of merely slowing movement again. [ROVERCAMPAIGN] [DRILL] [DRILLUI] |
| Positive questions inside an “any yes fails” checklist | The central reviewer checklist mixes defect questions with questions asking whether the feature is reachable and the report contains evidence. **Literal polarity error.** | Make every blocker predicate negative, or separate blockers from required proofs. [BUILD] |
| A negative question inside a yes-count pass rubric | The fun rubric includes a question about a bad visual stand-in alongside positive questions, then counts affirmative answers toward passing. **Literal scoring ambiguity.** | Replace the summed score with explicit blockers and dimensioned judgments. [FUN] |
| Two consequences for every action | The build map and fun loop require multiple further effects from a new action. **Overgeneralized design proxy.** | Require the promised causal consequence and meaningful integration. Do not require noisy secondary events for a brake, confirmation, or selection. [BUILD] [FUN] |
| Every measured bar must improve | The fun loop's strict reading rejects tradeoffs even when one improvement intentionally spends another resource. **Optimization-policy risk.** | Protect hard constraints; compare the intended improvement and its declared tradeoff. Not all design metrics are monotone. [FUN] |
| No quiet interval longer than a small fixed window | A constant spectacle cadence can satisfy the instrument while destroying contrast and exploration. **Hypothesis promoted to law.** | Use pacing envelopes appropriate to combat, travel, docking, and industry. [FUN] |
| Any drawn path must preserve a fixed fraction of cruise speed | Arbitrarily short or sharply curved strokes cannot meet a universal high-speed promise under finite acceleration. **Feasibility error in an unrestricted reading.** | Define admissible path geometry and a force-feasible speed envelope. [FEEL] |
| Rigid camera expansion and minimum hull size | Several independent camera ratios can be incompatible in a dense scene. **Constraint conflict requiring geometric reconciliation.** | Prioritize time-to-threat, target legibility, and a bounded zoom envelope; use cues when all three cannot fit. [FEEL] |
| Hidden passive cap versus increasing industrial income | Automation and site export share an overflow haircut; the mining design calls for successively higher industrial income slopes. **Confirmed design tension.** | Balance physical throughput and demand, migrate the payout model, and show limiting causes. [AUTO] [SITES] [ROVERLAW] |
| Attention cost as destruction | A programmed drone group is removed when routine fuel reaches zero. **Confirmed behavior; proposed design reversal.** | Default to visibly stranded or inactive equipment. Reserve destruction for an advertised destructive cause. [AUTO] |
| Player cargo doubles as programmed-drone inventory | The mining and selling path operates on the player's hold, including all units of the selected ore at sale. **Confirmed ownership coupling.** | Give the operation explicit cargo custody and a canonical transfer transaction. [AUTO] |
| “Permanent” excavation has multiple meanings | Unanchored drill geometry can recover, while site-associated geometry bypasses that recovery. A Core is required for durable site identity across rematerialization. **Confirmed distinction, often erased by prose.** | State permanence by lifecycle state. Do not claim that current anchored factories simply heal shut. [DRILL] [SITES] |
| No fog versus a surviving claim-survey path | The art/design law removes material fog; the site system still advances a volatile claim-survey record. **Potentially distinct mechanics, not yet a proven runtime contradiction.** | Trace exactly which information each exposes. Retire redundant gating, or name assay/claim information separately from visible geology. [ROVERLAW] [SITES] |
| Fifteen words and exact hex values as design authority | The rover law treats word count, pixel values, and literal palettes as binding. **Useful anti-clutter intent, brittle acceptance implementation.** | Preserve board dominance and warm instrument character; permit localization, remapping, scaling, and necessary warnings. [ROVERLAW] |
| Physically plausible lamps versus current expressive art direction | Older rover rules forbid many emissive accents; the current request explicitly wants more glowy arcade expression. **Current owner direction requires revision.** | Preserve full 3D objects and material depth; revise energy-effect and light-language rules. [ROVERLAW] |
| One thruster reference becomes an all-effects construction law | The VFX standard universally favors geometric sheets, view-dependent edges, and simulation-authored detail. **Technique overreach.** | Specify different techniques for jets, histories, impacts, gas, debris, and UI cues. Judge the gameplay-camera result. [VFXLAW] |
| Whole-zone manufacturing paperwork competes with play-scale art | The asset standard's camera-first and independent-review rules are good; mandatory material narratives can overdirect stylization and consume production effort. **Production-policy risk.** | Keep proportional provenance and surface intent, not proof by paperwork volume. [ASSETLAW] |
| Legacy golden success treated as production proof | The legacy47a profile intentionally disables many modern features and uses a curated system set. **Confirmed test-scope difference.** | Label every result by profile. Keep legacy compatibility tests, but require production-path behavior tests. [PROFILES] |
| “Never fail a mission” | The world-reaction packet requires mutation instead of failure for every clause break. **Overgeneralized narrative policy.** | Author recovery where meaningful; allow clean failure, partial success, and abandonment without recursive busywork. [WORLDPLAN] |
| Forecast must deliver at least thirty percent more profit | The economy packet compares forecast-reading agents against nonreaders over a seeded hour. **Confounded acceptance proxy.** | Test information quality, calibration, usability, and fair opportunity—not an arbitrary income uplift. [ECONPLAN] |
| Input, audio, and performance too late in the phase table | The build map groups several foundational response qualities with release work. **Sequencing risk.** | Pull the minimal player-facing slices of those tasks into the first toy and Adventure proof. [BUILD] |
| Ship scars versus a recorded rejection | The historical alignment document records rejection of recognition/scar work; current ship code imports living-hull scar/history behavior. **Unresolved authorization provenance.** | Find a later approval before extending it. Do not delete it based solely on the older note. [ALIGNMENT] [SHIPS] |

## 2.3 The replacement authority model

Use the existing program, not a second management system. The program already distinguishes lifecycle status from acceptance status; that is exactly the distinction to retain. “Integrated” can mean the code is on the shared branch without claiming a player has accepted its feel. [PROGRAM]

Add a small provenance block to decisions that materially constrain design. A useful record contains the owner statement or approved interpretation, date, intended player outcome, explicit non-goals, superseded decision, and the evidence required to revisit it. Technical implementation notes belong underneath as changeable means. A statement such as “the rover must feel precise” is durable intent. “Cruise every 0.24 seconds” is a tuning candidate that serves it.

For performance records, require the measured commit, runtime profile, hardware, resolution, settings, route, seed, warm/cold state, and retained artifact. A measurement without those fields may still be useful as a clue, but it must not command future work as though it identifies the current bottleneck.

For descriptions of shipped code, include a last-verified commit and the owning symbol. Prefer generated control labels, system-order tables, and catalog references over repeated prose copies. Generation is appropriate for facts. It cannot decide whether a behavior is enjoyable.

Most importantly, this report's recommendations must remain **recommendations until admitted into the current authority chain**. The present user instruction clearly authorizes changing the visual direction and questioning old assumptions. It does not retroactively turn every number or design proposal in this report into a verbatim owner decision.

## 2.4 Correct the critic, not just the criteria

Replace the ambiguous yes-count with three independent outputs:

**Blockers:** runtime failure, unreachable default route, wrong control label, lost or duplicated value, unreadable decisive threat, broken save, or unacceptable performance regression. Each has an explicit evidence field and a boolean whose polarity is consistent.

**Intent result:** what the candidate is supposed to improve, whether the evidence demonstrates that improvement, and which tradeoff was deliberately accepted. A larger impact effect may spend a small amount of fill rate. A more responsive brake may change a handling curve. The reviewer should evaluate the bargain, not reject all movement on every other metric.

**Play judgment:** what the player can perceive, decide, and execute that they could not before; where friction remains; and what observation would falsify the candidate. This is not reducible to a sum of adjectives or an event counter.

A practical report object can be this small:

```json
{
  "candidate": "commit + profile + route manifest",
  "intent": "A held reel visibly closes a feasible tow without erasing tangential speed",
  "blockers": [{"id": "save_round_trip", "failed": false, "evidence": "artifact"}],
  "outcome": {"supported": true, "evidence": ["trace", "normal_speed_capture"]},
  "tradeoff": "The short-line extreme remains outside the admitted capture envelope",
  "acceptance": "focused_green_not_route_accepted"
}
```

The example is a proposed reporting shape, not a new persisted game schema. Reuse the current receipt machinery where possible.

Fixed-seed tests are valuable for causal comparison. Unscripted play is valuable for finding situations the tests did not imagine. Do not discard an exploratory report because it lacks a seed; capture the symptom and turn it into a reproducible case where possible. Similarly, a silent low-frame-rate image strip is useful for composition but cannot prove sub-second input timing or audio synchronization. Use normal-speed temporal evidence for those claims. [FUN]

## 2.5 What not to dismantle

Retain the single writers, deterministic simulation discipline, normal-route requirement, browser/Electron parity, shared physics across modes, explicit save ownership, and exact-path collaboration. Retain the separation between technical validity, performance validity, and visual acceptance. Retain camera-scale review and the rejection of primitive stand-ins sold as finished art. These mechanisms protect the project from a different class of agent failure. [AGENTS] [README] [ASSETLAW]

The goal is fewer contradictions and better decisions, not fewer safeguards. Make an agent's smallest task easier to execute correctly: one relevant intention, one current owner, one observed failure, one bounded change, and the evidence that determines whether it helped.

<!-- Source links are pinned to the audited commit. -->
[AGENTS]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/AGENTS.md
[GDD]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/GDD_2_0.md
[ORIENTATION]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/docs/ORIENTATION.md
[PROGRAM]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/README.md#L1-L180
[BUILD]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/CANONICAL_BUILD_MAP.md#L1-L145
[README]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/README.md#L1-L170
[ALIGNMENT]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/VISION_ALIGNMENT_PLAN.md#L1-L180
[FUN]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/FUN_CONVERGENCE_LOOP.md#L1-L210
[FEEL]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/FEEL_CONTRACT.md
[SIM]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/simulationRunner.js#L1-L220
[PROFILES]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/runtime/runtimeProfiles.js#L1-L170
[FLIGHT]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/flight/propulsionKernel.js
[INPUT]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/input.js#L200-L390
[IMPULSE]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/combat/impulseKernel.js#L1-L220
[PHYSICS]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/sg02DynamicBodyOwner.js
[PERFCAMPAIGN]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/PERF_HITCH_CAMPAIGN.md#L1-L200
[PERFORDER]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/PERF_WHAT_MATTERS.md
[SCHEDULER]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/activityScheduler.js#L1-L210
[SHIPS]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/ships.js#L1-L170
[AUTO]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/automation.js
[ROVERCAMPAIGN]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/ASTEROID_WORKS_PLAYFIELD.md#L1-L185
[ROVERLAW]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/ASTEROID_WORKS_DESIGN_LAW.md#L1-L210
[DRILL]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/drill.js
[DRILLUI]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/ui/screens/drill.js#L1-L165
[SITES]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/asteroidSites.js#L1-L200
[VFXLAW]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/docs/visual-assets/VFX_TECHNIQUE_STANDARD.md#L1-L145
[ASSETLAW]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md#L1-L140
[WORLDPLAN]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/roadmap/active/PQ-138.md#L1-L170
[ECONPLAN]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/roadmap/active/PQ-177.md#L1-L160
