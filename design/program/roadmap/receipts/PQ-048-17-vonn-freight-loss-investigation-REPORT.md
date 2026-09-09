<!-- LIFETIME: HISTORICAL -->
# PQ-048.17 — Vonn freight-loss investigation closure receipt

```yaml
packet: PQ-048
leaf: PQ-048.17
candidateCommit: e262124a62e29b907aede15063dff2a8ab142c58
candidateTitle: "feat(vonn): investigate freight losses"
productionSummary: "6 source/test files; 744 insertions; 4 deletions"
lifecycleClaim: implemented
acceptanceClaim: focused_green
disposition: PASS
dependencies:
  - "The committed PQ-047 freight-loss/aftermath path is the existing prerequisite; no PQ-048 leaf dependency is introduced."
changedPaths:
  - src/data/stationContacts.js
  - src/data/vonnFreightLoss.js
  - src/systems/stationContacts.js
  - src/ui/screens/bar.js
  - src/ui/station/screens/bar.js
  - test/pq048-vonn-freight-loss-investigation.test.mjs
focusedGates:
  - "Vonn freight-loss focused suite — 1/1 pass."
  - "Adjacent freight, aftermath, custody, station-contact, and save coverage — 53/53 pass; the PQ-048.19 map regression also passed."
  - "Independent causal re-review — APPROVE after the terminal-disposition conservation repair."
  - "Final shared baseline before the lazy PQ-048.18 repair — structural 9/11 with CONTENT_ONLY sim hashes; canonical comparison later isolated the hashes solely to PQ-048.18 eager-null initialization. After that repair, legacy and Flight V3 are identical to HEAD, so PQ-048.17 has no motion, trace, or hash delta."
  - "Closure diff — clean."
routeEvidence:
  - "The real Pallas/Sker-Run curtain_convoy carrier creates physical freight pods and a matching aftermath marker; the existing freight and market owners handle loss consequence, while Vonn is an observer only."
  - "Vonn stores a bounded stable case only when the exact custody, manifest, freighter, encounter, and aftermath-marker identities agree. Terminal custody requires accountedQty == initialQty and player-collected + raider-secured + station-recovered + delivered + lost == initialQty."
  - "An early custody-receipt buffer is session-only and clears on restore; JSON Continue/replay preserves only the normalized case without replaying loss or settlement."
  - "The existing WRECKS dialogue exposes only a revalidated system-map CTA: no course, waypoint, mission, reward, cargo, freight, or market write. Native completion of the matching aftermath marker removes the CTA and reports the closed owner state."
  - "Ordinary headed route was not run; route acceptance remains unproven."
performanceEvidence: []
review:
  independent: "APPROVE — conservation, marker identity, custody matching, save/replay, map-only handoff, and native completion were re-reviewed after repair."
residuals:
  - "Ordinary headed-route acceptance remains unproven."
followUps:
  - "PQ-048.18 remains open; Phase 4 and Tranche 4 remain incomplete."
```

The closed case is deliberately a projection of independently owned freight loss, custody, aftermath,
and market state. It neither creates a second cargo/economy writer nor turns the wreck into a mission:
Vonn can point to the surviving exact marker, then the native aftermath owner determines when that
evidence is gone.
