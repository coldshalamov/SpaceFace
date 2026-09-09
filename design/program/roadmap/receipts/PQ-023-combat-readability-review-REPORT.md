<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-023
leafId: PQ-023.combat-readability-review
acceptance: focused_green
disposition: PASS
candidateCommit: b626a8b305b57a98fabd3f3eaa12c42fb4233965
-->

# PQ-023 targeted combat-readability causal review

```yaml
packet: PQ-023
dispatchUnit: PQ-023.combat-readability-review
reviewMode: solo-integrator-self-review
candidateCommit: b626a8b305b57a98fabd3f3eaa12c42fb4233965
h1EvidenceCommit: 6cc6cc909ca375984b362894189e7b03c6b0d099
reviewDisposition: PASS
flakDisposition: KEEP
smallDestructionDisposition: REVISE
reducedModeDisposition: KEEP
denseCompositionDisposition: KEEP
acceptedLargerHierarchyDisposition: KEEP
performanceEvidenceClaimed: false
```

## Split verdict

**KEEP the repaired flak impact.** At the exact ordinary camera and contact point, autocannon presents
a narrow directional incidence fan: no sprite, seven particles, and five aligned streaks. Flak now
opens around a compact bright core into a broader, irregular radial fragment cloud: one core sprite,
15 particles, and six outward streaks. The original-resolution four-frame sequences and the WebM
windows `38.061–38.810 s` (autocannon) and `38.810–39.541 s` (flak) make that difference visible at a
glance rather than merely naming different profile data. Browser and source Electron execute the
same projection.

**REVISE full-motion small destruction.** The normal sequence and WebM window `39.543–40.561 s`
show only a minute hot speck and two short fragments at the ordinary chase camera. Its two sprites
and two streaks satisfy the machine grammar, avoid the ordinary ring, and clean up, but the event does
not reliably land as destruction against the ship, HUD, and star field. This is the same perceptual
question the repair was meant to close, so passing pool counts do not justify KEEP.

**KEEP the reduced-mode fallback and dense composition.** Reduced small destruction remains visible
through a slower noncolor ring/streak fallback in `40.633–41.894 s`, while the dense representative
retains the connected source-to-contact beam, target/source separation, bounded mixed destruction,
all 18 critical cues, and clean pools in `41.977–43.417 s`. The reduced fallback being more legible
than the full-motion event is additional evidence for the narrow normal-mode repair; it is not a
reason to weaken reduced accessibility.

## Evidence and causal boundary

The review used the complete original-resolution artifacts under
[`row6-pq023-combat-readability/`](../evidence/h1/row6-pq023-combat-readability/EVIDENCE.md), including
the SHA-256-bound `1440×900` WebM, impact/small/dense sheets, all underlying stills, Browser report,
and exact Electron parity receipt. The Browser report has zero issues and every acceptance predicate
true; Electron has zero issues and clean owned teardown. Those facts rule out route, runtime parity,
cleanup, and accessibility-setting failure, leaving a localized normal-mode visual-salience defect.

The exact next chain is `PQ-023.small-destruction-salience-repair` → targeted small-only H1 → causal
re-review. Accepted flak, Cathedral, unrelated weapon, ordinary/capital destruction, and dense/reduced
evidence stays retained. No matched-performance, physical-device, or milestone claim is made here.
