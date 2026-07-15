# 10 — Observatory Hard-Gate Thresholds

> **Campaign-specific proposed gates.** These thresholds govern only a named observatory campaign
> that explicitly activates them and implements the matching measurements. They are not universal
> acceptance law for unrelated work; live player evidence and the task's named checks remain primary.

**Status:** DRAFT — operational definitions for mechanically enforced acceptance
**Authority:** These thresholds become hard gates (check fails, not warns) once OBS-003 lands them.
No orchestrator judgment can round them up. If a threshold fires, the candidate is rejected and
returned with the exact measurement and evidence path.

## 1. Why hard thresholds exist

The observatory makes bad quality *measurable*. But measurement alone is warning-only — an
orchestrator that wants to declare victory can rationalize a warning. A hard gate fails
mechanically: the check script exits nonzero, the campaign state records `fail`, and the
candidate cannot advance to `ACCEPTED` regardless of what any agent says about it.

Hard gates cover **objective** defects. Subjective quality ("looks cheap", "feels cartoony",
"incongruous with the rest of the game") remains blind cross-model clip review — never automated.

## 2. Combat and lethality gates

| Gate | Threshold | Class | Evidence required |
|---|---|---|---|
| `no_damage_before_telegraph` | If damage occurs to the player, a required telegraph event must precede it by the doctrine's authored reaction window. Missing telegraph → hard fail. | P0 | warning→hit timeline from incident window; AI tactic log showing telegraph emit |
| `min_reaction_to-first-hit` | First hostile damage to the player must come ≥ 1.0s after the player can observe the threat (radar contact, HUD warning, or visual lock). Below 1.0s → hard fail. Below 1.5s → warning. | P0 (fail) / P1 (warn) | threat-appearance→first-hit latency from synchronized timeline |
| `max_burst_ehp_loss` | No single 0.5s window may remove more than 50% of max effective HP from the player at normal difficulty. Above → hard fail. | P0 | damage samples from state-samples.ndjson in the incident window |
| `max_concurrent_attackers_first-session` | During the first 10 minutes of a novice route, no more than 2 hostiles may be actively firing at the player simultaneously. Above → hard fail. | P0 | entity fire-intent log from AI trace |
| `tactic_churn` | A single AI entity may not change its top-level tactic or primary target more than 4 times in 10 seconds. 4–6 → warning. >6 → hard fail. | P1 (warn) / P0 (fail) | AI explainability trace tactic/target transitions |
| `heading_reversal_rate` | A single AI entity may not reverse heading more than 5 times in 10 seconds (indicating oscillation/confusion). >5 → hard fail. | P0 | heading samples from AI trace |
| `blocked_action_loop` | If an AI action is blocked and retried identically more than 3 consecutive times without a tactic change, → hard fail. | P0 | action-port log |

## 3. Mining gates

| Gate | Threshold | Class | Evidence required |
|---|---|---|---|
| `mining_hitch_p99` | Frame p99 during mining events (beam start, seam hit, fracture, pickup) must not exceed 33.3ms on the browser floor profile. If the observer-off/media-off replay shows the same hitch, → hard fail (it's the game, not capture/observer overhead). If only in media capture, → warning. | P0 | mining-event-aligned raw frame samples across all three matched executions |
| `mining_backlog_shedding` | If the sim reports any backlog-shedding (skipped ticks) during a primary-route mining session, → hard fail. | P0 | sim timing log |
| `mining_single_state_dwell` | If the player spends more than 30s in a single mining state without any seam/core/tether/state change during a primary mining route, → warning. >60s → hard fail (simplicity). | P1 (warn) / P0 (fail) | mining state timeline from state-samples.ndjson |
| `mining_missing_heat_vents` | If the design calls for mining heat rhythm and the runtime emits zero heat or vent events during mining (per the GDD), → hard fail. This catches the known drift where mining.js deletes heat state. | P0 | event trace: mining heat/vent events; cross-checked against GDD spec |

## 4. World and pacing gates

| Gate | Threshold | Class | Evidence required |
|---|---|---|---|
| `max_dead_air` | No interval longer than 90 seconds with zero contacts, zero affordances, zero destination visibility, and zero UI updates during a primary route. Above → warning. Above 180s → hard fail (sparse world). | P1 (warn) / P0 (fail) | asset-exposure.ndjson + encounter timeline |
| `travel_action_ratio` | During a 20-minute novice route, travel time must not exceed 60% of total play time. Above → warning. Above 75% → hard fail. | P1 (warn) / P0 (fail) | intent/execution timeline |
| `encounter_fingerprint_repeat` | No exact encounter fingerprint (`objective × doctrine × topology × complication × consequence × reward`) may repeat within a 12-encounter window. Repeat → hard fail. | P0 | encounter director fingerprint log |

## 5. Asset and presentation gates

| Gate | Threshold | Class | Evidence required |
|---|---|---|---|
| `asset_fallback_on_primary_route` | Any asset falling back to procedural geometry during a primary acceptance route → hard fail. | P0 | loader fallback log; runtime asset map |
| `lod_thrash` | An entity cycling LOD levels more than 3 times in 2 seconds → hard fail. | P0 | LOD transition log from asset-exposure.ndjson |
| `dominant_asset_share` | No single hull/asset model may occupy more than 40% of visible screen-time during a diverse primary route without an authored regional reason. Above → warning. | P1 | time-weighted asset exposure report |
| `missing_feedback` | If a gameplay action (fire, hit, dock, mine, jump, damage taken) occurs without a paired HUD, radar, VFX, or audio response within 0.5s, → hard fail. | P0 | action→cue alignment from synchronized timeline |
| `observer_determinism_drift` | If observer-on and observer-off simulation hashes differ for the same input tape, → hard fail. The observer must be a pure read. | P0 | paired hash comparison |

## 6. Performance gates (acceptance routes only)

| Gate | Threshold | Class | Evidence required |
|---|---|---|---|
| `desktop_p95` | Desktop target p95 frame time ≤ 16.7ms on acceptance routes. Above → hard fail. | P0 | perf-samples.ndjson from no-capture replay on desktop profile |
| `browser_p95` | Browser floor profile p95 frame time ≤ 33.3ms on acceptance routes. Above → hard fail. | P0 | perf-samples.ndjson from no-capture replay on browser profile |
| `hitch_regression` | Hitches > 32ms must not increase relative to the last accepted baseline. Increase → hard fail. | P0 | hitch count comparison to baseline |
| `heap_growth` | No steady heap growth over a 10-minute acceptance route. Growth trend > 5MB/min → hard fail. | P0 | memory samples from perf-samples.ndjson |

## 7. Promoting gates

A gate threshold is promoted from this document to an actual `check:*` script only when:
1. OBS-003 has implemented the detector with a versioned, held-out benchmark containing at least
   20 seeded positive and 20 seeded negative cases for that detector family.
2. The held-out benchmark demonstrates at least 90% sensitivity for P0/P1 examples and no more
   than 10% false positives. A detector that misses either bar remains advisory.
3. At least three natural sessions have been reviewed for integration/pathology failures that the
   seeded benchmark does not model; those sessions supplement rather than replace the 20+20 set.
4. The check is wired into `package.json` as `check:observatory:<gate-name>` and its detector
   manifest, threshold version, and benchmark hash are recorded in the session artifact.

Until then, the threshold is a specification the detector must implement. The orchestrator may
not treat an unimplemented gate as passed — an unimplemented gate is `pending`, not `pass`.

## 8. Threshold review

Thresholds are calibrated, not guessed. After OBS-004 (first 20-minute route across 20 seeds),
each threshold's distribution is reviewed against real data. A threshold may be adjusted only by:
1. A recorded decision in DECISIONS.md with the distribution data.
2. Updated acceptance cards that reference the new value.
3. The change does not relax a safety property (determinism, fairness, no-fallback).
