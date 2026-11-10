<!-- LIFETIME: HISTORICAL -->
# PQ-048.18 — Orrin witness case closure receipt

```yaml
packet: PQ-048
leaf: PQ-048.18
candidateCommit: 1ba6ce221900ecb5075765f900157c199d1fcfad
candidateTitle: "feat(orrin): complete witness evidence case"
productionSummary: "9 source/test files; 668 insertions; 3 deletions"
lifecycleClaim: implemented
acceptanceClaim: focused_green
disposition: PASS
dependencies:
  - "None. The exact published H5 completion is a pre-existing durable source authority, not a PQ-048 dependency."
changedPaths:
  - src/data/orrinWitnessCase.js
  - src/systems/e1EncounterRuntime.js
  - src/systems/story.js
  - src/systems/world.js
  - src/ui/galaxyMap.js
  - src/ui/screens/bar.js
  - src/ui/station/screens/bar.js
  - test/depth-program-e1-runtime.test.mjs
  - test/pq048-orrin-witness-case.test.mjs
focusedGates:
  - "Orrin witness-case focused suite — 7/7 pass."
  - "H5/depth E1 runtime suite — 19/19 pass."
  - "Adjacent station-contact-memory and Vonn freight-loss suites — 6/6 pass."
  - "Legacy sim-golden-diff --ref HEAD — IDENTICAL after the lazy default-key correction."
  - "Flight V3 sim-golden-diff --ref HEAD — IDENTICAL after the lazy default-key correction."
  - "Independent review — APPROVE after three bounded fixes and Bar recomposition."
  - "Closure diff — clean."
routeEvidence:
  - "The only admissible source is the durable completed depth_h5_corridor_massacre record with outcome published in sector_io_reach; convenience flags, history rows, generic witness content, any other outcome, and any other sector fail closed."
  - "The source id uses the published record's deterministic seed/tick identity, and its retained physical anchor is used when present; old saves use the authored deterministic Io Reach fallback anchor."
  - "World records own exactly one durable aftermath wreck for that source. Story observes case pressure only and creates no cargo, economy, law, mission, or reward writer."
  - "Evidence recovery requires the exact live world-owned recorder and matching durable world record; copied marker ids, copied source ids, or a wrong persistence owner cannot recover evidence. Investigation leaves the recorder in place."
  - "Recovered evidence is submitted only by the dedicated contact_orrin/station_coalition evidence event, bypassing generic ui:talkContact and station-contact memory. Acceptance opens a normal map-only Customs Gate referral in sector_tethys_junction and arms no course or waypoint."
  - "A destroyed recorder remains terminal in the durable record and does not respawn on reconciliation, save load, or Continue. Save/replay preserves the matching source, recovered case, and one physical recorder when it is still live."
  - "Ordinary headed route was not run; route acceptance remains unproven."
performanceEvidence: []
review:
  independent: "APPROVE — final re-review after three fixes and Bar recomposition confirmed sole H5 authority, one physical recorder, exact investigation, dedicated evidence submission, map-only referral, terminal destruction, save/replay, and canonical hash restoration."
residuals:
  - "Ordinary headed-route acceptance remains unproven."
  - "Leaf closure does not composition-check Phase 4 or Tranche 4."
followUps:
  - "A dedicated composition receipt must assess Phase 4 and Tranche 4; do not promote this leaf receipt into a parent or tranche closure."
```

The case is deliberately derived from one already-published H5 transition rather than making a new
story authority. It preserves the witness as a physical, source-stamped world aftermath and lets
Orrin recognize only its investigated original. The later Customs handoff is a normal map referral,
not a hidden route, mission, memory counter, or owner-side reward.
