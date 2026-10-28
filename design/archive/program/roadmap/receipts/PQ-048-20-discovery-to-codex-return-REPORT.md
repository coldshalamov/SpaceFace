<!-- LIFETIME: HISTORICAL -->
# PQ-048.20 — Discovery-to-Codex return closure receipt

```yaml
packet: PQ-048
leaf: PQ-048.20
candidateCommit: 0d405461bf6a906a08081ecca3795df455519766
candidateTitle: "feat(codex): add discovery return handoff"
productionSummary: "3 source/test files; 315 insertions; 17 deletions"
lifecycleClaim: implemented
acceptanceClaim: focused_green
disposition: PASS
dependencies:
  - "PQ-048.19 — landed Tethys discovery/manual-flow surface; PQ-048.11 remains transitive through PQ-048.19."
changedPaths:
  - src/ui/screens/codex.js
  - src/ui/signalInvestigationPrompt.js
  - test/pq048-discovery-to-codex-return.test.mjs
focusedGates:
  - "Implementer focused PQ-048.20 + PQ-048.11 + PQ-048.19 floor — 5/5 pass."
  - "Independent reviewer broader focused floor — 19/19 pass."
  - "UI accessibility/import floor — 43/43 pass; player-facing labels green."
  - "Shared wave baseline — 11/11 pass."
routeEvidence:
  - "A contacted Tethys discovery requests one exact already-projected Codex plate; the UI-local request is consumed once and is not saved."
  - "The Codex return opens the normal Tethys map focus only; it creates no course, route, waypoint, navigation state, or economy offer."
  - "Ordinary headed route was not run; route acceptance remains unproven."
performanceEvidence: []
review:
  independent: "APPROVE — Terra/max review verified the one-shot accessible handoff, exact durable plate, Continue reconstruction, map-only return, and no-navigation boundary."
residuals:
  - "Ordinary headed-route acceptance is unproven for this leaf."
followUps:
  - "PQ-048.16 through PQ-048.18 remain open; Phase 4 is incomplete."
```

The committed UI handoff asks the existing Codex to focus an already durable discovery plate; it does
not create or persist a second discovery record. On Continue, world state rebuilds the same plate while
the transient focus request is absent. The usable return action selects Tethys through the ordinary map
surface without plotting navigation or mutating the opportunity/economy state.
