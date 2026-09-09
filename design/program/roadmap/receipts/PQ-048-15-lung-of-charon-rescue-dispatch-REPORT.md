<!-- LIFETIME: HISTORICAL -->
# PQ-048.15 — Lung of Charon rescue dispatch closure receipt

```yaml
packet: PQ-048
leaf: PQ-048.15
candidateCommit: fe78ff0fe20f56b4911217a42d41b5bf2282dd85
candidateTitle: "feat(charon): persist Lung rescue outcomes"
productionSummary: "2 source/test files; 210 insertions; 1 deletion"
lifecycleClaim: implemented
acceptanceClaim: focused_green
disposition: PASS
changedPaths:
  - src/systems/recoveryEncounter.js
  - test/lung-of-charon-rescue.test.mjs
focusedGates:
  - "Initial focused floor — 16/16 pass."
  - "Sector-exit, death-recovery, and continuous-membership correction final floor — 18/18 pass."
  - "Real combat-recovery narrow trace — pass."
  - "Shared wave baseline — 11/11 pass."
routeEvidence:
  - "The existing Charon distress/recovery route writes one stable Lung case card for each terminal outcome and reprojects the same case after Continue."
  - "Ordinary headed route was not run; route acceptance remains unproven."
performanceEvidence: []
review:
  independent: "APPROVE — Terra/max re-review verified the stable case projection, abandonment's zero settlement, existing reward preservation, no double-pay path, and recovery-safe sector transitions."
residuals:
  - "Ordinary headed-route acceptance is unproven for this leaf."
followUps:
  - "PQ-048.13 and PQ-048.14 remain open; Tranche 3 is incomplete."
```

The committed recovery owner records one durable Lung outcome, publishes the stable case-card identity
through the existing discovery writer, and reprojects it after Continue without settling again.
Continuous/no-teleport transitions and combat recovery preserve an active operation; a true departure
files abandonment once with zero credits, reputation, and cargo. The pre-existing rescue, black-box,
and strip rewards remain unchanged and cannot be paid twice.
