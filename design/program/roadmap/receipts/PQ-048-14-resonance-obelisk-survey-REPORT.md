<!-- LIFETIME: HISTORICAL -->
# PQ-048.14 — Resonance Obelisk survey closure receipt

```yaml
packet: PQ-048
leaf: PQ-048.14
candidateCommit: 9971f4a794658b090210f6908273ea6f235a7ffe
candidateTitle: "feat(veil): add Resonance Obelisk survey"
productionSummary: "3 source/test paths; 351 insertions; 7 deletions"
lifecycleClaim: implemented
acceptanceClaim: focused_green
disposition: PASS
dependencies: []
changedPaths:
  - src/data/landmarkMissions.js
  - src/systems/missions.js
  - test/pq048-resonance-obelisk-survey.test.mjs
focusedGates:
  - "PQ-048.14 focused survey contract — 4/4 pass."
  - "Positive-reward mission regression floor — 15/15 pass."
  - "Named Resonance, Shard, journal, Doss, and player-facing-label checks — green."
  - "Pre-correction shared baseline — 11/11 pass in budget at 69.6s."
  - "Post-correction shared baseline — all 11 behavioral checks pass, but concurrent asset work took 92.9s, 2.9s over the wall budget; it is not an in-budget claim and was not rerun."
routeEvidence:
  - "Only the pre-existing physical station_veil poi_anomaly record can post the survey: its raw discovered, identified, investigated, and uncoerced finite investigatedAt >= 0 state is required."
  - "The validated landmark probe targets landmark_c2_resonance_obelisk at poi_anomaly with signalKind anomaly, maxRangeWu 300, and scanner stage >= 3."
  - "One validated landmark offer survives a board epoch without duplication; the durable survey artifact and cause fingerprint suppress reoffer after completion and Continue."
  - "The zero-credit completion emits neither a credit grant nor faction-reputation change and labels the outcome truthfully as a filed field record."
  - "Doss continues to derive its generic Obelisk archive source only from the original physical discovery; the survey artifact cannot add a second source or count."
  - "The sole complication is the existing bounded Vael watch response to additional pulses; this leaf creates no new Vael state owner."
  - "No headed Browser or Electron route was run; route acceptance remains unproven."
performanceEvidence:
  - "The post-correction baseline exceeded its wall budget during concurrent asset work despite 11/11 behavioral checks; no performance or in-budget acceptance claim is made."
review:
  independent: "APPROVE — review confirmed strict raw discovery gating, exact probe identity/range/stage, artifact/fingerprint idempotence, no-credit completion truthfulness, Doss independence, and bounded Vael behavior."
residuals:
  - "Ordinary headed-route acceptance remains unproven."
  - "The post-correction shared baseline was 2.9s over its wall budget under concurrent asset work; it must not be represented as in budget."
  - "The Caved Shaft legacy signal-id expectation is inherited and unrelated to this candidate."
followUps: []
```

The shipped survey is a return contract, not a second discovery path. It starts only after the
existing physical Obelisk investigation has written a valid raw discovery record, then asks for one
close anomaly reading through the normal mission/scanner owners. Its separate survey log is durable,
but does not alter the generic Obelisk evidence that Doss already reads. Completion gives the player
a truthful field-record acknowledgement rather than fabricated credits, reputation, or a new Vael
encounter.
