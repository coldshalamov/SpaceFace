# BM16/BM17 — SFQ-P12 and SFQ-P17 dispositions

2026-10-17. The CSV contains ten candidates in each family (P17 has ten, despite the brief's count of nine); all twenty are covered. Sixteen outcomes are already true, B115 lands with M13 row 349, B166/B167 have focused-green implementations minted as rows 357/358, and B165 is parked for its missing service endpoint. No new engine or queue was created.

Publication scope: `_constraints-codex.md` reserves staging, commits and publication for the orchestrator. The two **LANDED (implementation only)** dispositions below mean code exists and its focused checks passed in this working tree; neither is claimed committed or route-accepted. Rows 357/358 remain OPEN for orchestrator landing verification. This worker ran no Git mutation commands.

## SFQ-P12 — people/law

| Candidate | Disposition | Exact current owner and focused evidence |
|---|---|---|
| SFQ-B111 — Attribute physical collateral honestly | already-true | `src/combat/killCausality.js`, `src/systems/collisionConsequences.js`, and `src/ui/sectorLawPresenter.js` carry direct/indirect/accidental/stale responsibility onto the live law card; `test/sfq-b111-impact-class.test.mjs` passed 6/6, including seed-4242 law adjudication. |
| SFQ-B112 — Make the first law response readable | already-true | `src/ui/sectorLawPresenter.js` reads the actual offense, response and stand-down options; `test/first-hour-law-read.test.mjs` passed 3/3 at seed 4242, including the wanted-pilot case that must not promise stand-down by leaving. |
| SFQ-B113 — Give rescue durable recognition | already-true | `src/systems/onboarding.js`, `src/systems/stationContacts.js`, and `src/systems/uniqueWrecks.js` retain real rescue identity and return the same worker to work without another reward; `test/first-hour-rescue-recognition.test.mjs` 2/2, `test/sfq-build-rescued-return-retry.test.mjs` 1/1, and `test/pb-cons-b-rescued-return.test.mjs` 5/5 passed (recognition/retry seed 4242; return lifecycle uses its existing seed 156162). |
| SFQ-B114 — Let rivals remember tactics | already-true | `src/systems/nemesis.js`, `src/nemesis/learning.js`, and `src/ai/nemesisTactics.js` learn only witnessed player techniques and attach a bounded counter to that rival's encounter; `test/nemesis-observation-bridge.test.mjs` passed 7/7 and `scripts/check-nemesis.mjs` passed 58/58, including different equipment/doctrine, changed trajectories, wrong-prediction counterplay, unrelated actors, and save continuity. |
| SFQ-B115 — Make restitution playable | LANDS-WITH row 349 (M13) | `src/systems/custodyConsequences.js`, `src/systems/lawSecurity.js:creditRestitutionDelivery`, and `src/systems/missions.js` already contain the mission lane's original-goods/replacement-goods route; `test/m13-pay-back-the-wake.test.mjs` covers partial returns, duplicate delivery, decline/abort, payment during recovery, and saved unwitnessed incidents (MJ2 reports seed-4242 3/3 in `results/MJ2-M13-M01-final.md`; not rerun by this lane). |
| SFQ-B116 — Show factions in action | already-true | `src/data/factionContactGrammar.js`, `src/data/factionDoctrines.js`, `src/systems/combat.js`, and `src/systems/factionPresence.js` select inspection/extortion/assassination and physical approach/attack/withdrawal/berth responses; `test/faction-pressure-grammar.test.mjs` passed 7/7 and seed-4242 `test/faction-identity-conduct.test.mjs` passed 7/7, including attack runs and tetherable folio theft/return changing the censors' orders and service access. |
| SFQ-B117 — Keep comms from drowning the fight | already-true | `src/systems/barkDirector.js` coalesces one incident's voices and `src/ui/voiceArbiter.js` reserves the floor by priority; seed-4242 `test/infer-p12-bark-coalesce.test.mjs` passed 2/2 and `test/first-hour-voice-priority.test.mjs` reported 16/16, including danger interruption, tutorial protection, coalescing and stable FIFO. |
| SFQ-B118 — Give the ship a legible history | already-true | `src/systems/ships.js` stores history on each owned hull, keeps it during `recomputeEntity`, creates clean history in `buyShip`, and selects only the target hull's history in `setActiveShip`; `test/ship-history.test.mjs` passed 15/15 (existing seed 47), `test/depth-program-a2-ship-ledger.test.mjs` passed 8/8, and a direct seed-4242 check passed refit retention, scar-free replacement, and original patched-hull return. |
| SFQ-B119 — Create aftermath choices | already-true | `src/combat/aftermathChoices.js`, `src/systems/combatOutcome.js`, and `src/ui/aftermathChoicePrompt.js` derive rescue/salvage/pursuit/escape from current field facts while physics continues; `test/sfq-b119-aftermath-choices.test.mjs` passed 17/17, including dead targets, gone fleers, reused IDs, and actual wreck selection. |
| SFQ-B120 — Review the consequence chain end to end | already-true | `src/systems/lawSecurity.js`, `src/systems/factions.js`, and `src/ui/impoundPayPrompt.js` settle a named cause once and restore only the standing it took while preserving unrelated hostility/heat; `test/sfq-b120-restitution-standing.test.mjs` passed 6/6 (existing seed 29420), including partial/short payment, duplicate settlement, save, discovery and live payment control. |

## Direct verification run

One combined run of the twelve test files listed above, excluding M13 and the later voice/grammar additions, returned `tests 79`, `pass 79`, `fail 0`. The files were `sfq-b111-impact-class`, `first-hour-law-read`, `first-hour-rescue-recognition`, `sfq-build-rescued-return-retry`, `pb-cons-b-rescued-return`, `nemesis-observation-bridge`, `faction-identity-conduct`, `infer-p12-bark-coalesce`, `ship-history`, `depth-program-a2-ship-ledger`, `sfq-b119-aftermath-choices`, and `sfq-b120-restitution-standing` under `test/` with suffix `.test.mjs`.

The separate two-file run of `test/faction-pressure-grammar.test.mjs` and `test/first-hour-voice-priority.test.mjs` returned `tests 8`, `pass 8`, `fail 0`; the latter wraps its own 16 passing priority assertions. `node scripts/check-nemesis.mjs` returned `Nemesis acceptance: 58/58 passed; 0 failed.` No command was rerun against the same candidate after a failure.

The additional inline seed-4242 hull check used the existing `createSimulation({ seed: 4242, systems: [ships] })`, a patched scar on owned hull 0, `recomputeEntity`, `buyShip({ defId: 'ship_pelican', grant: true, setActive: true })`, and `setActiveShip(0)`. Its assertions confirmed that refit keeps the original record, the new hull has zero scars, and returning to hull 0 restores the original patched record. It changed no repository file.

The seed-4242 fine-work fixture in `test/sfq-build-economy-law-residuals.test.mjs` shows a bounded berth shift, interruption and one-time settlement, but that alone is weaker than B115's requested recovery/replacement-cargo job. Row 349 supplies that exact outcome and owns its tests; this lane does not duplicate it.

These P12 checks found no additional production gap. They are simulation/presenter results, not a new visual or player-truth certification.

## SFQ-P17 — research/regional change

| Candidate | Disposition | Exact current owner and focused evidence |
|---|---|---|
| SFQ-B161 — Falsifiable field experiment | already-true | `src/systems/alienEcology.js:tickFauna`, `src/data/faunaMotionRead.js`, and `src/data/heatProximityTrial.js` compare cold shadowing with heat-driven charge at matching geometry and retain one observation; `test/sfq-b161-heat-proximity.test.mjs` passed 3/3, including the live drive/notebook/save path. |
| SFQ-B162 — Behavioral archaeology | already-true | `src/systems/alienEcology.js:fileChartDiscovery`, `src/data/faunaRouteEcho.js`, and `src/data/routeChart.js` match the old docking route to a real placed discovery; `test/sfq-b162-route-chart.test.mjs` passed 2/2, including rebased coordinates and duplicate-free reload. |
| SFQ-B163 — Sterile, suppressed and unknown | already-true | `src/data/siteLifeRead.js` and `src/systems/alienEcology.js` keep biomass, activity and confidence separate; `test/sfq-b163-site-life.test.mjs` passed 2/2, including a quiet living site and a contradictory saved eradication label. |
| SFQ-B164 — Reversible site succession | already-true | `src/data/wreckSuccession.js` and `src/systems/alienEcology.js` retain open/warned/sealed stages across departure and reload, and scanning cuts the sequence back; `test/sfq-b164-wreck-succession.test.mjs` passed 2/2. |
| SFQ-B165 — Settlement ecology service | PARKED | `src/data/alienEcology.js` defines Breathing Dock as a site, but no dockable berth/service endpoint consumes the `ecology:collar` event; `test/sfq-b165-collar-service.test.mjs` passes 2/2 for state/readout only, so a real service change cannot be claimed without authoring that missing endpoint across the docking/service owners. |
| SFQ-B166 — Machine/biology interdependence | LANDED (implementation only), row 357 | `src/data/wasteHeat.js:wasteHeatMotionMult` now feeds the existing `src/systems/alienEcology.js:tickFauna` motion: cutting standby slows cysts and frees eels while leaving leeches unchanged; the first seed-4242 case in `test/sfq-p17-field-effects-4242.test.mjs` passed, including switch persistence/restoration; `test/sfq-b166-waste-heat.test.mjs` passed 2/2. |
| SFQ-B167 — Usable research derivative | LANDED (implementation only), row 358 | `src/systems/alienEcology.js` deploys the fabricated derivative through `alienEcology:lureDropped`, resolves its drive after ordinary proximity, and records success only when a live maw moves toward the decoy; `src/data/heatLure.js` preserves unfinished-trial recovery; four seed-4242 cases in `test/sfq-p17-field-effects-4242.test.mjs` passed, and `test/sfq-b167-heat-lure.test.mjs` passed 2/2 with a real predator, both recipe materials, save and duplicate cases. |
| SFQ-B168 — Careful knowledge market | already-true | `src/data/surveyCopy.js` and `src/systems/alienEcology.js:noteSurveyCopy` issue one economy grant per finding without deleting the notebook; `test/sfq-b168-survey-copy.test.mjs` passed 2/2, including stale copies, out-of-range scans and reload. |
| SFQ-B169 — Indirect domain approach | already-true | `src/data/alienEcology.js` authors deep casts, old architecture, phantom contacts and suppression corridors; `src/systems/alienEcology.js` applies exposure/filter/purge and threshold evidence without spawning a Vethari apex; `test/alienEcologyDeep.test.mjs` passed 21/21 and `test/alienEcologyPhases5_10.test.mjs` passed 11/11, including meaningful gear/route decisions and deep-trace evidence. |
| SFQ-B170 — Bounded long-lived world | already-true | `src/systems/sectorSim.js:runOfflineCatchup` caps elapsed time/days, consumes pending elapsed once and retains applied embodiment IDs; ecology stages and offers are persisted; `test/m2-sector-embodiment.test.mjs` passed 25/25, including capped absence, repeated entry, saved applied sets and single-writer safety. |

Prerequisite outcomes were mapped to the current owners rather than queued by local ID: B071's physical mission object lifecycle already exists (`test/sfq-b071-b079-tow-lifecycle.test.mjs`); B101's regions already differ in traffic/encounters (`src/data/regionalEcology.js`, `src/systems/regionalEcology.js`, existing `test/m4-regional-ecology.test.mjs`); B121's fauna capabilities, B126's route echo and B145's finite machine protocol already exist in the current ecology/machine owners. The relevant live fauna, route, cradle, suppression and protocol cases were exercised in the P17 run. The referenced B071 and regional fixtures were identified as mappings, not rerun or claimed newly certified.

## What the two repairs change

The Warm Freighter's standby switch now has a physical tradeoff: warm cysts move normally while eels are held back; cold cysts slow while eels move freely. The same persisted switch reverses it, and other sites and leeches retain their behavior.

A fabricated heat lure now draws a real predator to a decoy away from the hull. Success waits for that motion; an empty site or foreign-sector lure cannot produce a successful-trial message, and Continue restarts an interrupted trial without charging another sample.

The root causes were unwired gameplay state: `heatOnline` only selected prose, and the derivative return trigger set `shown` without creating a stimulus or observing a response. The repair uses the existing kinematic fauna writer and bounded eight-lure stimulus list, corrects drive precedence, and adds one optional save boolean (`trialStarted`) to distinguish an interrupted trial from a freshly crafted lure. It adds no population process, new ticking system, unbounded log or visual allocation.

## P17 validation and remaining scope

The final combined P17 run returned **tests 79 · pass 79 · fail 0**. It ran the twelve files `test/sfq-b161-heat-proximity.test.mjs`, `test/sfq-b162-route-chart.test.mjs`, `test/sfq-b163-site-life.test.mjs`, `test/sfq-b164-wreck-succession.test.mjs`, `test/sfq-b165-collar-service.test.mjs`, `test/sfq-b166-waste-heat.test.mjs`, `test/sfq-b167-heat-lure.test.mjs`, `test/sfq-b168-survey-copy.test.mjs`, `test/alienEcologyDeep.test.mjs`, `test/alienEcologyPhases5_10.test.mjs`, `test/m2-sector-embodiment.test.mjs`, and `test/sfq-p17-field-effects-4242.test.mjs` with concurrency 1. The new field-effects file returned **tests 5 · pass 5 · fail 0**; with the strengthened B167 acquisition fixture, **tests 7 · pass 7 · fail 0**.

`node scripts/sf-sim.mjs compare 47a --seed 4242 --ticks 720 --inputs test/47a.inputs.json --reload-at 600 --flight-system v3` passed (`ok:true`, `deterministic:true`, `hashEqual:true`, no diffs). This checks replay/save integration, not deep-site motion; the field-effects fixture checks that motion. An initial 120-tick attempt was too short to reach the tape's weapon-fire assertion, so the corrected run used the established 720-tick window. No golden was edited. `node scripts/generate-save-schema.mjs --check` passed: **SAVE_SCHEMA.md OK (version 17, 390 paths)**.

The bounded independent review found the save-before-response interruption case; it was repaired and the fifth seed-4242 test passed. The previous B167 test had accepted a success message with no predator at all; its fixture now includes the real maw and advances simulation until it responds.

Adjacent defect reported for the orchestrator: `check-plan-integrity` remains red because existing mission rows **348, 352, 353, 354, 355** are absent from the seam table. Rows 357/358 were added to the reservoir seam and are not orphans. No foreign mission row was changed. No browser/player-truth run, perf claim, commit or push is claimed here; the campaign's cluster gate and publication remain with its orchestrator.

## Exact changed files

- `build_map.md` — minted rows 357/358 and included them in the reservoir seam; rows remain OPEN.
- `src/data/wasteHeat.js` — local species motion response.
- `src/data/heatLure.js` — optional interrupted-trial marker normalization.
- `src/systems/alienEcology.js` — existing heat/lure owner wiring and trial recovery.
- `test/sfq-p17-field-effects-4242.test.mjs` — five physical/lifecycle regressions.
- `test/sfq-b167-heat-lure.test.mjs` — real-predator acquisition fixture.
- `design/program/demo-maturity-2026-10-17/results/BM16-17-final.md` — requested disposition/delivery table.
