# 04 — Gameplay Observatory

**Status:** DRAFT
**Purpose:** make recurring gameplay, balance, pacing, visual, and presentation failures observable

## 1. Principle

The acceptance unit is a session plus incident windows, not an arbitrary screenshot. The observer is
passive, local, bounded, off by default, and never becomes a gameplay authority.

## 2. Three synchronized truths

1. **Intent:** policy goal, encounter/director plan, AI tactic/action/maneuver, expected cue.
2. **Execution:** applied input, position/velocity, fire/hit/damage/death, mining/economy/progression.
3. **Presentation:** camera, HUD/radar, VFX requests, captured mixed audio, visible
   assets/LOD/fallback, animation/motion, and frame pacing.

Findings classify plan, execution, presentation, calibration, or content-coverage defects.

## 3. Capture contract

- Record the full qualitative session with render-frame timestamps, a 60 fps target (never below
  30 fps without invalidating fast-motion review), and the actual mixed audio track.
- Preserve at least eight seconds before and twelve seconds after each incident.
- Extract at least four frames per second; use eight around sub-second combat/asset events.
- Align frames and records with `sessionId, seq, tick, simTime, wallOffsetMs, frameId`.
- Merge overlapping incidents and retain the first/worst/most novel examples.
- Record applied public input at every 60 Hz sim tick, intent/event records losslessly, state at
  20 Hz, asset exposure at 10 Hz plus lifecycle changes, and performance on every render frame.
- Commit the candidate hash, route/policy matrix, and held-out seed list before sessions begin;
  retain every scheduled run, not only favorable examples.
- Replay the identical tape twice: observer on/media off, then observer off/media off. Periodic/final
  deterministic sim hashes and ordered sim-event receipts match across all three executions.
- Observer-off/media-off owns authoritative performance. Capture overhead compares media-on with
  observer-on/media-off and must remain ≤5% p95; observer overhead is reported separately against
  observer-off. Above the capture limit, media cannot adjudicate choppiness and must use a less
  intrusive/external path.

## 4. First detector families

This document owns the signals, capture shape, and calibration process. The sole normative numeric
threshold source is `10_OBSERVATORY_HARD_GATES.md`; copying numbers here creates drift and is
forbidden. `observatory-detectors.v1` converts the following synchronized signals into incidents:

| Concern | Required signals |
|---|---|
| Enemy confusion | selected target/tactic/action, blocked-action reason, heading/trajectory, contact visibility, and doctrine phase |
| Unfair lethality | first observable threat cue, attacker fire intent, projectile hit/damage/death receipts, EHP samples, and concurrent attackers |
| Missing feedback | gameplay action plus applied HUD/radar/VFX/audio/camera/target presentation receipts |
| Mining choppiness | raw render-frame duration, sim backlog, applied input, beam/seam/fracture/yield receipts, and paired no-media replay |
| Mining simplicity | mining state/choice/cadence changes, seam/core/tether progression, reward, escalation, and state dwell |
| Monotony | activity and encounter fingerprints, meaningful decisions, progression changes, consequences, and travel/activity time |
| Sparse world | visible contacts, affordances, discoveries, destinations, intentional tension beats, and travel/activity time |
| Asset repetition/jank | authored/fallback state, readable-fallback retention, asset identity, LOD lifecycle, bounds/pop/disappearance, and screen-time exposure |
| UI friction | public-input attempts, intended action, focus/route transitions, failed transitions, and milestone latency |

Each detector is a release gate only after a held-out benchmark of at least 20 seeded positives and
20 negatives reaches ≥90% sensitivity for P0/P1 examples and ≤10% false positives. Otherwise it is
advisory. Threshold changes require a new version and calibration set; they may not be tuned after
seeing an acceptance candidate.

“Fun,” “cartoony,” “cheap,” and “incongruous” remain independent session/clip-review judgments. The
observer finds and reconstructs moments; it does not manufacture objective taste.

### Advisory vs hard gates

The signal detectors above are advisory when first implemented. Once a detector passes its
calibration benchmark (≥90% sensitivity, ≤10% false positives across 20+20 held-out seeded
examples), its threshold is **promoted to a hard gate** only in
`10_OBSERVATORY_HARD_GATES.md` and wired as a `check:*` script that
exits nonzero on failure. A hard gate fails mechanically — the orchestrator cannot round it up,
and the campaign state records `fail` preventing `ACCEPTED`. An advisory detector raises incidents
for review; a hard gate blocks acceptance. The escalation path is one-way: once promoted, a gate
may not be demoted back to advisory without a recorded decision in `DECISIONS.md` with calibration
data, and safety gates (determinism, no-fallback, no-untelegraphed-damage) may never be demoted.

**Critical invariant:** an unimplemented gate is `pending`, never `pass`. The orchestrator may not
treat a missing detector as evidence the quality bar is met.

## 5. Player policies and evidence classes

- Public-input idle, novice, competent/evasive, reckless, miner, trader, and explorer policies.
- Paired seeds and held-out acceptance seeds.
- Headless cohorts for distributions; headed replay for worst/median/best.
- Fixture injection only as supporting mechanism evidence.
- Occasional human sessions calibrate false positives and subjective rubrics; traces can be replayed.

The controller selects seeds after candidate submission and ranks sessions with predeclared metrics.
Every wave retains all runs. Fresh critics watch the complete worst, median, and best native-rate
sessions with audio, then review at least twelve controller-selected random 10-second windows from
the remaining corpus. Unclassified problems become findings; event-selected incidents never replace
blind full-session/random-window review.

## 6. First vertical slice

One real twenty-minute Helios novice-miner route:

`New Game → fly → naturally mine three rocks → dock/sell → undock/threat → save/load`

No spawn, teleport, direct attach, injected damage, referee kill, or direct docking. Capture AI,
combat, mining, economy, navigation, presentation, perf, assets, full video, and incident sheets.

## 7. Artifacts

```text
.devshots/session-observatory/<session-id>/
  session.json
  input-tape.json
  applied-inputs.ndjson
  intents.ndjson
  timeline.ndjson
  deterministic-event-receipts.ndjson
  state-samples.ndjson
  perf-samples.ndjson
  asset-exposure.ndjson
  hash-checkpoints.ndjson
  recording-health.json
  observer-control-replay/{session.json,perf-samples.ndjson,hash-checkpoints.ndjson}
  performance-replay/{session.json,perf-samples.ndjson,hash-checkpoints.ndjson}
  full-session.webm                  # OBS-002 media_complete only
  mixed-audio.wav                    # OBS-002 media_complete only
  audio-analysis.json                # OBS-002 media_complete only
  detector-manifest.json
  review-sampling.json
  sim-hash-comparison.json
  findings.json
  report.html
  incidents/<id>/{incident.json,clip.webm,contact-sheet.jpg}
```

`session.json` and every finding validate against the versioned schemas in
`design/production/schemas/observatory-*.schema.json`. Audio analysis includes clipping, silence,
event alignment, loudness/range, and repetition; subjective mix quality is reviewed from the actual
track. OBS-001 records lifecycle `observer_contract`, media `pending`, and
`validForAcceptance:false`; it never fabricates the three media paths. OBS-002 promotes the
lifecycle only after real files pass containment, hash/size/signature, decode, duration, FPS, and
audio validation. The existing Alpha evidence record remains the outer acceptance wrapper.
