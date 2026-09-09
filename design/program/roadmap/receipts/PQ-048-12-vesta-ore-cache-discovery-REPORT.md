<!-- LIFETIME: HISTORICAL -->
# PQ-048.12 — Vesta ore-cache discovery closure receipt

```yaml
packet: PQ-048
leaf: PQ-048.12
candidateCommit: 2fa77848bb9002986514f376d4203983f962c933
candidateTitle: "feat(vesta): complete ore cache discovery"
productionSummary: "10 source/test files; 1,026 insertions; 42 deletions"
lifecycleClaim: implemented
acceptanceClaim: focused_green
disposition: PASS
dependencies:
  - "PQ-048.19 — landed manual-investigation behavior used by the Vesta relay/cache route; PQ-048.11 remains transitive through PQ-048.19."
changedPaths:
  - src/data/sectors.js
  - src/data/vestaOreCache.js
  - src/systems/cargo.js
  - src/systems/scanner.js
  - src/systems/shipLedger.js
  - src/systems/world.js
  - src/ui/galaxyMap.js
  - src/ui/recoveryEncounterPrompt.js
  - src/ui/vestaOreCacheMapLayer.js
  - test/pq048-vesta-ore-cache-discovery.test.mjs
focusedGates:
  - "PQ-048.12 focused discovery floor — 4/4 pass."
  - "Final adjacent floor — 77/77 pass."
  - "Live-pickup correction: active physics/spatial-hash partial acceptance and Continue floor — 19/19 pass."
  - "Shared wave baseline — 11/11 pass."
routeEvidence:
  - "The normal route is physical relay evidence, manual local investigation, an approximate search ring, then the gated fixed cache and durable preserve/report/take choice."
  - "Ordinary headed route was not run; route acceptance remains unproven."
performanceEvidence: []
review:
  independent: "APPROVE — Terra/max re-review verified the relay-to-cache gate, physical pickup conservation, one-choice durability, provenance, owner boundaries, accessible prompt, and truthful map/ledger state."
residuals:
  - "Ordinary headed-route acceptance is unproven for this leaf."
  - "The ledger reuses the existing unique family after a closed roster check; no new ledger type is claimed."
followUps:
  - "PQ-048.13 through PQ-048.15 remain open; Tranche 3 is incomplete."
```

The committed route keeps cache knowledge in normalized world state and lets the existing cargo,
faction, and ledger owners apply each selected consequence. TAKE remains a physical conserved lot:
partial capacity leaves the rejected remainder, Continue rematerializes it once, and recollection
retains generic provenance without double-counting. PRESERVE and REPORT keep their distinct durable
outcomes without inventing law, heat, or a second ledger family.
