<!-- LIFETIME: HISTORICAL -->
# PQ-048.04 — Tender service occupation closure receipt

```yaml
packet: PQ-048
leaf: PQ-048.04
candidateCommit: eb865549856e9574fb4a4dca65ada15188a8cd05
candidateTitle: "feat(ceres): make tender service physical"
lifecycleClaim: implemented
acceptanceClaim: focused_green
disposition: PASS
changedPaths:
  - src/data/contactHail.js
  - src/systems/npcJobsRuntime.js
  - src/systems/traffic.js
  - src/ui/targetPanel.js
  - test/ceres-causal-chain.test.mjs
  - test/contact-hail-contract.test.mjs
  - test/inference-5x-target-work-readout.test.mjs
  - test/npc-jobs-runtime-wiring.test.mjs
  - test/pq048-tender-service-occupation.test.mjs
focusedGates:
  - "PQ-048.04 focused floor — 62/62 pass."
  - "Final focused contracts — 34/34 pass."
  - "Ceres causal-chain contracts — 26/26 pass."
  - "Shared baseline — 11/11 pass at the candidate family."
  - "git diff --check — clean."
routeEvidence:
  - "Ordinary headed route was not run; route acceptance remains unproven."
performanceEvidence: []
review:
  independent: "APPROVE — independent Terra/max spec and code-quality review of the frozen exact candidate."
residuals:
  - "Ordinary headed-route acceptance remains unproven for this leaf."
followUps:
  - "PQ-048.05 remains open; Tranche 1 is incomplete."
```

The candidate binds one compact, stable-ID Ceres service incident to the existing refinery tender and
seam miner. Combat owns the non-lethal drive disable and repair; traffic temporarily leases the two
existing jobs to hold a collision-safe standoff, then returns those original jobs after the drive is
actually re-enabled. Hail and target readout project the persisted incident plus live combat truth.
There is no added actor or static target, no direct cargo/economy write, and no normal-success wreck
aftermath.
