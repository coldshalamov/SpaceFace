<!-- LIFETIME: HISTORICAL -->
# PQ-135.05 — Fodder cohort receipt (closes the PQ-135 program)

- **packetId:** PQ-135
- **leafId:** PQ-135.05
- **candidateCommit:** (the commit carrying this receipt)
- **disposition:** PASS
- **acceptance:** focused_green

## What changed

`src/ai/fodderCohort.js` (new): twelve disposable enemies fly as one cheap cohort — shared flow,
shared target prediction, one loose frame; each body adds only local separation (an AVERAGE, not a
sum — eight neighbors shove no harder than one), mild alignment, hazard avoidance, and target
pressure, weights normalized to 1 and capped by the speed band, so the command does not grow with
roster size. Neighbor lookups ride the existing spatial hash when live (physics parks it below 96
colliders; the lab uses the same radius filter on the cohort list — 24 bodies see ≤9 neighbors,
not 23). No full tactical stack, no tokens (those stay on specialists), no direct position/velocity
writes; motion through the existing thruster path. Nothing opts in until an encounter assigns a
river or crescent.

## M11 before → after (controller re-run, suite 14/14)

Flow coherence 0.69 → **0.99** (12-body river; floor 0.82 asserted), 24-body **1.00**, crescent
0.94 with a genuinely concave front. Min gap while flowing 18 → 29 (24-body: 8 → 27; floor 20),
zero contacts. **Throwability**: a shove's displacement is fully retained at 0.25 s (retention
1.00) and rejoin takes 1.0–1.28 s (was an impulse-erasing 0.35 s snap) — the §21A.14 essential
clause, asserted.

## Mutations

Steering cranked to cancel the shove → rejoin collapses to 0.35 s, throwability gate red.
Separation removed → 24-body min gap 9, pileup gate red. Both restored.

## Goldens

Legacy and V3 byte-stable.

## Program closure

All six PQ-135 leaves are done: .00 speed governor, .01 per-hull feel, .02 Motion Lab, .03
hull-relative enemy envelopes, .04 scissors wing, .05 fodder cohort. Named residuals for future
work: striker fire-window admission (.04 receipt), Crucible/encounter opt-in of wings and cohorts
in live spawning, and normal-speed chase-camera capture review when the GPU lane runs its batch.
