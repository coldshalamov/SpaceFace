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
- Replay the identical input tape without capture. Periodic/final deterministic sim hashes and
  ordered sim-event receipts must match the capture run exactly; otherwise the pair is invalid.
- No-capture replay owns performance truth. Capture overhead must be reported and remain ≤5% p95;
  above that, the capture cannot adjudicate choppiness and must use a less intrusive/external path.

## 4. First detector families

The first threshold set is versioned `observatory-detectors.v1`. These thresholds create review
incidents; they do not automatically declare a design bad.

| Concern | v1 incident threshold |
|---|---|
| Enemy confusion | engaged target changes >3/5 s; tactic changes >4/3 s; heading reversals >4/2 s; blocked loop >2 s; plan/trajectory mismatch |
| Unfair lethality | damage before an identifiable warning; warning→hit <0.75 s; warning→death <2.5 s; >40% EHP lost/0.5 s; pre-first-dock multi-attacker pile-on |
| Missing feedback | critical action has no identifying HUD/radar/VFX/mixed-audio/camera/target cue in the declared −0.5 s/+0.15 s window |
| Mining choppiness | no-capture p95 exceeds the 16.7 ms target/33.3 ms floor, hitch count >32 ms increases, event-window p95 regresses >5%, backlog sheds, or input→beam→yield latency spikes |
| Mining simplicity | one interaction state persists >45 s without a new choice/escalation; seam/core/tether states or cadences collapse to one repeated fingerprint |
| Monotony | identical activity/encounter fingerprint ≥3 times/10 min; no meaningful decision/progression change >90 s |
| Sparse world | >45 s without an actionable contact, affordance, discovery, or intentional tension beat; excessive travel-to-action ratio versus route contract |
| Asset repetition/jank | any fallback/loader error; LOD oscillates >2 times/s; bounds/pop/disappearance; one non-hero variant exceeds 50% of same-family exposure |
| UI friction | ≥3 failed attempts for one intent, screen loop, planned action without transition, or route milestone delay beyond its acceptance card |

Each detector is a release gate only after a held-out benchmark of at least 20 seeded positives and
20 negatives reaches ≥90% sensitivity for P0/P1 examples and ≤10% false positives. Otherwise it is
advisory. Threshold changes require a new version and calibration set; they may not be tuned after
seeing an acceptance candidate.

“Fun,” “cartoony,” “cheap,” and “incongruous” remain independent session/clip-review judgments. The
observer finds and reconstructs moments; it does not manufacture objective taste.

### Advisory vs hard gates

The thresholds above are advisory when first implemented. Once a detector passes its calibration
benchmark (≥90% sensitivity, ≤10% false positives across 20+20 seeded examples), its threshold is
**promoted to a hard gate** in `10_OBSERVATORY_HARD_GATES.md` and wired as a `check:*` script that
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
  applied-inputs.json
  intents.ndjson
  timeline.ndjson
  state-samples.ndjson
  perf-samples.ndjson
  asset-exposure.ndjson
  full-session.webm
  mixed-audio.wav
  audio-analysis.json
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
track. The existing Alpha evidence record remains the outer acceptance wrapper.
