<!-- LIFETIME: HISTORICAL -->
# PQ-048.10 — Passenger-liner service closure receipt

```yaml
packet: PQ-048
leaf: PQ-048.10
candidateCommit: 7bc112920bd5697dc6213a7b700f339c5620139e
candidateTitle: "feat(traffic): add Helios civic liner"
productionSummary: "4 source/test files; 969 insertions; 6 deletions"
lifecycleClaim: implemented
acceptanceClaim: focused_green
disposition: PASS
changedPaths:
  - src/data/contactHail.js
  - src/data/laneContacts.js
  - src/systems/traffic.js
  - test/pq048-passenger-liner-service.test.mjs
focusedGates:
  - "Passenger-liner service suite — 4/4 pass."
  - "Priority-courier suite — 5/5 pass."
  - "Contact-Hail contract suite — 14/14 pass."
  - "News suite — 3/3 pass."
  - "Final shared baseline before the lazy PQ-048.18 repair — structural 9/11 with CONTENT_ONLY sim hashes; canonical comparison later isolated the hashes to PQ-048.18 eager-null initialization. After that repair, legacy and Flight V3 are identical to HEAD, so PQ-048.10 has no motion, trace, or hash delta."
  - "git diff --check — clean."
routeEvidence:
  - "Ordinary headed route was not run; route acceptance remains unproven."
performanceEvidence: []
review:
  causalRereview: "APPROVE — independent re-review after the DIVERTING route was corrected to report the real return route."
residuals:
  - "Ordinary headed-route acceptance remains unproven."
followUps:
  - "Tranche 2 is complete because PQ-048.06 through PQ-048.10 are all done."
```

The service repurposes one existing Helios `express` / `ship_mule` in place as a civic liner; it does
not create a ninth traffic actor. One stable passenger custody, world-record, and leg identity drives
**BOARDING**, **EN_ROUTE**, delay, diversion, return, delivery, and loss. The route uses real Flight
V3/hitch movement, honors valid Coalition law authority, and fails closed for malformed authority.

Hail STATUS, ROUTE, and ASSIST read that same live record. ASSIST requires a physical formation, and
the corrected DIVERTING response names the actual return route. Save/rematerialization and service
deduplication preserve a single liner identity. Passenger death does not enter freight, cargo, or
economy loss handling.
