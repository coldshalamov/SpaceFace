<!-- LIFETIME: HISTORICAL -->
# PQ-048.19 — Rumor-to-route guidance closure receipt

```yaml
packet: PQ-048
leaf: PQ-048.19
candidateCommit: efc7c5c30ae0db8b30cdb2e472904d1195d08ddf
candidateTitle: "feat(guidance): complete rumor to route handoff"
productionSummary: "9 source/test files; 421 insertions; 46 deletions"
lifecycleClaim: implemented
acceptanceClaim: focused_green
disposition: PASS
changedPaths:
  - src/data/sectors.js
  - src/systems/scanner.js
  - src/systems/world.js
  - src/ui/frontierRumorMapLayer.js
  - src/ui/galaxyMap.js
  - src/ui/signalInvestigationPrompt.js
  - src/ui/station/screens/bar.js
  - test/pq048-rumor-to-route-guidance.test.mjs
  - test/pq048-tethys-black-market-discovery.test.mjs
focusedGates:
  - "PQ-048.19 rumor-to-route floor after the focus correction — 11/11 pass."
  - "Map authority, UI accessibility, UI screen imports, and player-facing labels — pass."
  - "Shared baseline — 11/11 pass at the candidate family."
  - "git diff --check — clean."
routeEvidence:
  - "Ordinary headed route was not run; route acceptance remains unproven."
performanceEvidence: []
review:
  independent: "APPROVE — independent Terra/max spec and code-quality review, including the keyboard-focus correction."
residuals:
  - "Ordinary headed-route acceptance remains unproven for this leaf."
followUps:
  - "PQ-048.20 remains open; Phase 4 is incomplete."
```

The committed route turns the first durable purchased Tethys rumor into an accessible handoff: the Bar
may open the map, the map focuses a selectable approximate search ring without writing an exact course
or navigation route, and manual signal investigation completes the existing physical discovery path.
One completion voice and persistent return guidance survive Continue while hints-off behavior and the
expert M/N/C bypass remain intact. The focus correction places keyboard users on the visible primary
action when it exists, otherwise on the persistent dialog root, never a hidden course control.
