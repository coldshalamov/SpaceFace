<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-023
leafId: PQ-023.small-destruction-salience-repair
acceptance: focused_green
disposition: PASS
candidateCommit: e18211656b8aae020ff532d2725d56ea0424d636
-->

# PQ-023 normal-mode small-destruction salience repair

```yaml
packet: PQ-023
dispatchUnit: PQ-023.small-destruction-salience-repair
entryCandidateCommit: e18211656b8aae020ff532d2725d56ea0424d636
disposition: PASS
acceptance: focused_green
headedBrowserLaunched: false
headedElectronLaunched: false
performanceEvidenceClaimed: false
visualAcceptanceClaimed: false
```

## Reproduced defect

The exact H1 review showed that normal-mode small destruction still appeared as a minute hot speck
and two short fragments at the ordinary chase camera. The existing behavior contract only required
a final core footprint of 25% of the destroyed body's radius and two fragments. Candidate
`e1821165` barely cleared that floor while its core survived only `0.09 s`.

A new seconds-scale regression encodes the measured missing behavior without asserting exact effect
counts: a normal-mode core must survive at least `0.13 s`, reach at least 38% of source radius, and
open a three-point envelope with one fragment spanning at least half the source radius. It separately
requires the reduced fallback to retain its pruned noncolor pair.

Before the production edit:

- `node --test test/pq023-corridor-cues.test.mjs` — **FAIL, 22/23**;
- exact failure: `the hot core must survive ordinary-camera frame pacing, got 0.09s`.

## Repair

Only full-motion small ignition changed. Its hot core now lives `0.14 s` and expands to about 40.5%
of a radius-6 source footprint. Three deliberately biased fragments span roughly 56–65% of that
source radius, and one short offset combustion lobe makes the breakup silhouette survive overlap
with the ship/star field. The event still uses no ordinary/capital ring.

Reduced mode keeps the accepted two-fragment path, shorter core, reduced opacity, and no extra lobe.
Flak, ordinary/capital destruction, later explosion phases, mechanics, simulation state, RNG,
budgets, capacities, cleanup, and cue arbitration are unchanged.

## Focused evidence

- `node --check src/render/vfx.js` — PASS.
- `node --test test/pq023-corridor-cues.test.mjs` — PASS, 23/23.
- `node --test test/combat-vfx-presentation-contract.test.mjs test/phased-explosion-lifecycle.test.mjs`
  — PASS, 13/13.
- `npm run check:pq023:corridor-cues` — PASS, 23/23; critical cues `18/18`, all 42 flavor
  suppressions accounted for by `lane_budget:audio`.
- `npm run check:presentation` — PASS, including the real WebGL trail-program proof.
- `npm run check:baseline` — PASS, 10/10 in `43.870 s`, with `46.130 s` headroom.

## Honest boundary

This unit proves the renderer behavior and adjacent contracts only. It does not claim that the final
normal-camera visual lands. `PQ-023.small-destruction-salience-h1` owns the small-only
Browser/source-Electron capture, followed by exact causal review. No performance, physical-device,
or milestone-promotion claim is made.
