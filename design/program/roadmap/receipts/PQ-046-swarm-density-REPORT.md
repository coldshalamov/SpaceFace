<!-- LIFETIME: EVIDENCE -->
# PQ-046 cap-safe swarm-density receipt

```yaml
packet: PQ-046
unit: PQ-046.swarm-density
candidateCommit: 0209c4cab61d799852f4256825a429fa8672f444
lifecycleClaim: integrated
acceptanceClaim: focused_green
disposition: PASS
changedPaths:
  - scripts/check-encounter-one-voice.mjs
  - src/core/runReset.js
  - src/data/encounters/020-ambush-snare.js
  - src/data/encounters/050-claim-threat.js
  - src/data/encounters/100-distress-call.js
  - src/data/encounters/328-pattern-refrain.js
  - src/systems/aiEncounter.js
  - src/systems/claims.js
  - src/systems/encounterDirector.js
  - src/systems/lawSecurity.js
  - src/systems/missions.js
  - src/systems/spawnBudget.js
  - src/systems/world.js
  - test/combat-ecology-roles.test.mjs
  - test/depth-program-encounter-loader.test.mjs
  - test/law-security-escalation.test.mjs
  - test/m2-continuous-handoff.test.mjs
  - test/swarm-density-authority.test.mjs
focusedGates:
  - swarm-density and law-security suites: 25/25 pass
  - claim-defense suite: 8/8 pass
  - one-voice checker: 6/6 sections pass
  - broader scoped author batch: 76 cases accounted for and green after fixture corrections
routeEvidence:
  - production drive-arrival saturation and partial-admission harness
  - mission hard-transition, JSON world record, and save adoption harness
  - all 15 explicit claim count/partial-grant combinations
performanceEvidence:
  - one shared cap defaults to 24 with hard ceiling 40; every producer materializes only its grant
review:
  discovery: REVISE
  causalRereview: APPROVE
residuals: []
followUps: []
```

## Result

Light-enemy encounters now realize groups of four to six through one anchor-first composition while
the sector-wide ship authority defaults to 24 and remains a hard admission gate. Encounter, world,
mission, claim, law, bounty, boss, ambient, and reinforcement producers reserve before materializing,
bind successful entities, retry deterministic shortfalls, and release exact ownership on failure,
destruction, transition, New Game, or save boundaries.

Cold review found six lifecycle and composition failures that green happy-path tests had missed. The
final candidate closes uncapped world ambushes, mission slot collisions, repeated claim anchors,
saturated/distress side effects, thrown-spawn reservation leaks, and law top-up position stacking.
Independent replays retained budget/live parity at saturation, preserved durable slots `[0,1,2]`
through Ceres→Helios→Ceres and JSON save adoption, and produced one Reach anchor plus only lights for
every admitted claim-defense size.

The candidate is published on `origin/master` at the exact commit above.

## Portfolio closeout

PQ-046 integrates five focused-green outcomes at four production commits:
`02419f0cdd8f2815b2943a13cf49b484c79c08fd`,
`489a35a96c5efed64b52b7d31b2d71f2bd1bb0f0`,
`0209c4cab61d799852f4256825a429fa8672f444`, and
`f773e086b2d702b98555e2c13c111ebd64a0028d`. The WANTED and reward units intentionally share one
atomic candidate commit. The five leaf receipts are:

- [craft collision](./PQ-046-craft-collision-REPORT.md)
- [visual energy](./PQ-046-visual-energy-REPORT.md)
- [clean-ship WANTED](./PQ-046-clean-ship-wanted-REPORT.md)
- [reward fountain](./PQ-046-reward-fountain-REPORT.md)
- this swarm-density receipt

No parent Browser/Electron `route_accepted` claim is made.
