<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-023
leafId: PQ-023.combat-readability-repair
acceptance: focused_green
disposition: PASS
candidateCommit: 3c8e61382bc29df9de6c9c1fcf4a0dcfca07522a
-->

# PQ-023 combat-readability repair

```yaml
packet: PQ-023
dispatchUnit: PQ-023.combat-readability-repair
entryCandidateCommit: 3c8e61382bc29df9de6c9c1fcf4a0dcfca07522a
disposition: PASS
acceptance: focused_green
headedBrowserLaunched: false
headedElectronLaunched: false
performanceEvidenceClaimed: false
visualAcceptanceClaimed: false
```

## Reproduced defects

The H2 source diagnosis was exact. `wpn_flak_turret_s` resolved to a profile whose mode was
`proximity-burst`, but `_onProjectileHit` had no corresponding switch branch. The live renderer
therefore fell through the default autocannon incidence-fan grammar. A behavior-level spy around the
real consumer reproduced that flak emitted no compact core and did not create the required outward
fragment-streak volume.

Small destruction also reused the ordinary expanding-ring grammar at a `0.72` class scale, leaving
its normal-camera ignition too faint to read as a complete breakup. The second behavior regression
reproduced the borrowed ring, undersized hot core, and missing asymmetric departing fragments.

After adding both regressions but before changing production code:

- `node --test test/pq023-corridor-cues.test.mjs` — **FAIL, 20/22**;
- the flak failure was `a proximity burst needs a compact visible core at the ordinary camera`;
- the small-destruction failure was `small destruction must not borrow the ordinary expanding-ring grammar`.

The unchanged entry candidate separately passed `npm run check:pq023:corridor-cues` at 20/20 and
`npm run check:baseline` at 10/10. Its first `npm run check:presentation` attempt reached the already
characterized late-empty raw WebGL active-attribute probe (`active=`); no product defect was inferred
from that inherited preflight race.

## Repair

The renderer now has an explicit `proximity-burst` branch. It retains the lower shared flak light
peak and existing bounded profile counts while adding a compact subordinate core, six-or-more
full-volume radial fragment streaks, and a full-circle particle release. Autocannon remains on its
tight surface-incidence path, so the two weapons differ in executed behavior rather than metadata
alone.

Small destruction now uses a readable compact hot core and asymmetric fragment snap without an
expanding ring in ignition or rupture. Ordinary and capital ring lifecycles remain unchanged. The
small class receives a modest scale/lobe/debris correction, while event ownership, mechanics,
ordinary/capital hierarchy, reduced-mode policy, shared pools, caps, cleanup, and cue arbitration are
unchanged.

## Focused evidence

- `node --check src/render/vfx.js` — PASS.
- `node --test test/pq023-corridor-cues.test.mjs` — PASS, 22/22.
- `node --test test/combat-vfx-presentation-contract.test.mjs test/phased-explosion-lifecycle.test.mjs`
  — PASS, 13/13.
- `npm run check:pq023:corridor-cues` — PASS, 22/22; critical cues 18/18 retained and all 42
  suppressed flavor cues accounted for by the audio lane budget.
- `npm run check:presentation` — PASS, including the real WebGL program with
  `instanceMatrix`, `position`, `uv`, `aTrailColor`, and `aTrailOpacity` active.
- `npm run check:baseline` — PASS, 10/10 in 42.363 seconds wall time.
- `git diff --check` — PASS.

## Honest boundary

This is a focused code-and-contract repair. It does not claim Browser/Electron visual acceptance,
normal-camera judgment, dense-scene performance, physical hardware, or milestone promotion. Exact
unit `PQ-023.combat-readability-h1` owns the targeted five-cell Browser/source-Electron continuation;
`PQ-023.combat-readability-review` then owns the causal visual verdict.
