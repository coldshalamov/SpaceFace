<!-- LIFETIME: HISTORICAL -->
# PQ-048.09 — Priority courier lane closure receipt

```yaml
packet: PQ-048
leaf: PQ-048.09
candidateCommit: 20cff089b756860a9a4e6d00e359c5f251bc4fd7
candidateTitle: "feat(traffic): add priority courier service"
productionSummary: "6 source/test files; 926 insertions; 9 deletions"
lifecycleClaim: implemented
acceptanceClaim: focused_green
disposition: PASS
changedPaths:
  - src/data/contactHail.js
  - src/data/laneContacts.js
  - src/systems/npcJobsRuntime.js
  - src/systems/traffic.js
  - test/contact-hail-contract.test.mjs
  - test/pq048-priority-courier-lane.test.mjs
focusedGates:
  - "Priority courier suite — 5/5 pass."
  - "Contact-hail contract suite — 14/14 pass."
  - "Adjacent NPC freight arrival — 1/1 pass; durable world records — 23/23 pass; NPC-jobs runtime wiring — 15/15 pass."
  - "Combined baseline — 9/11: the two CONTENT_ONLY hash failures came from the concurrent unfinished PQ-048.08 eager empty economy fields. Canonical sim diff reported zero motion and trace delta and explicitly cleared PQ-048.09."
  - "git diff --check — clean."
routeEvidence:
  - "Ordinary headed route was not run; route acceptance remains unproven."
performanceEvidence: []
review:
  causalRereview: "APPROVE — independent current-candidate re-review after the full-roster and protected-selector corrections."
residuals:
  - "Ordinary headed-route acceptance is unproven for this leaf."
  - "The combined baseline's two CONTENT_ONLY hash failures belong to the unfinished concurrent PQ-048.08 candidate, not this committed leaf."
followUps:
  - "PQ-048.06 through PQ-048.08 and PQ-048.10 remain open; Tranche 2 is not complete."
```

The committed service keeps the original eight-actor Tethys roster by deterministically repurposing
one eligible idle civilian hauler as Kess. The saved courier runs a scheduled Tethys-to-Customs
freight leg with readable sprint and braking behavior, normal/late/interrupted outcomes, one bounded
escort opportunity, and idempotent arrival or loss consequence without a generic scheduler.
