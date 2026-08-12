<!-- LIFETIME: HISTORICAL -->
# PQ-048.13 — Pallas hidden-cache discovery closure receipt

```yaml
packet: PQ-048
leaf: PQ-048.13
candidateCommit: 14bd47ebc5e49a652abf5e622d3804e950855ea1
candidateTitle: "feat(pallas): complete hidden cache discovery"
productionSummary: "10 production/test paths; 1,287 insertions; 23 deletions"
lifecycleClaim: implemented
acceptanceClaim: focused_green
disposition: PASS
dependencies: []
changedPaths:
  - src/data/pallasHiddenCache.js
  - src/data/sectors.js
  - src/systems/scanner.js
  - src/systems/shipLedger.js
  - src/systems/world.js
  - src/ui/galaxyMap.js
  - src/ui/pallasHiddenCacheMapLayer.js
  - src/ui/recoveryEncounterPrompt.js
  - test/pq048-pallas-hidden-cache.test.mjs
  - test/scanner-signal-investigation.test.mjs
focusedGates:
  - "PQ-048.13 focused final floor — 6/6 pass."
  - "Scanner signal-investigation floor — 11/11 pass."
  - "Map authority, UI accessibility, ledger, pickup, and recovery adjacent gates — green."
routeEvidence:
  - "A physical Pallas pirate-wreck manifest clue unlocks only an approximate no-course search ring; a manual local scan and physical cache investigation are still required."
  - "The cache offers exactly RECOVER, REPORT, or CRIMINAL USE. REPORT is available only while docked at station_drift."
  - "RECOVER and CRIMINAL USE leave finite physical pickups for cargo ownership; CRIMINAL USE reaches existing black-market, patrol, law, and heat seams rather than creating a parallel authority."
  - "The world-owned outcome persists in the map and existing unique ledger, and corrupt terminal or intermediate save state fails closed."
  - "No headed ordinary-route acceptance was run; route acceptance remains unproven."
performanceEvidence: []
review:
  independent: "APPROVE — review confirmed built-in signal-kind priority stays above an authored tie-break; the crowded six-result view reserves at most one closest eligible manual signal without raising the cap; and malformed choice state requires a valid clue plus search before it can proceed."
residuals:
  - "This isolated leaf did not run check:baseline or a headed ordinary route; its acceptance is focused_green, not route_accepted."
  - "The inherited law-security-escalation Ceres sanctuary case was fingerprinted and statically unrelated to this candidate; it is not a PQ-048.13 failure and was not rerun."
followUps:
  - "PQ-048.14 remains open; Tranche 3 remains incomplete."
```

The committed Pallas route preserves uncertainty and player agency: investigate the physical wreck,
follow the approximate ring without receiving a course, manually scan the hidden cache, then resolve
one durable disposition. It records no direct cargo, credits, law, or heat write from the cache
choice itself; the established owner systems carry those consequences after the finite pickup enters
their existing routes.
