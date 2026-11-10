<!-- LIFETIME: EVIDENCE -->
# PQ-046 reward-fountain receipt

```yaml
packet: PQ-046
unit: PQ-046.reward-fountain
candidateCommit: 489a35a96c5efed64b52b7d31b2d71f2bd1bb0f0
lifecycleClaim: integrated
acceptanceClaim: focused_green
disposition: PASS
changedPaths:
  - src/combat/rewardEligibility.js
  - src/systems/combat.js
  - src/systems/lootShards.js
  - test/combat-contract-reward-exclusivity.test.mjs
focusedGates:
  - focused law/reward tests: 32/32 pass
  - adjacent loot/cargo/save tests: 38/38 pass
  - npm run check:baseline: 11/11 pass
  - both sim compares and both golden hashes: pass
routeEvidence: []
performanceEvidence:
  - exactly three existing pickup entries per eligible kill; reward selection is stateless O(1)
review:
  discovery: REVISE
  causalRereview: APPROVE
residuals:
  - beam salvage and durable wreck rewards intentionally remain separate
followUps: []
```

## Result

An eligible hostile player kill now emits exactly three magnetized pickups: two scrap entries of
four to six units each and one two-unit electronics entry, for a base expected value of roughly
174–206 credits before market variation. Existing pickup, magnet, and cargo owners still perform
materialization and collection; ship wreck salvage remains intact.

Both authored loot and shard choice are stateless functions of the current run seed, a named reward
domain, and the victim's durable identity. New Game, save/load, and entity-id rematerialization no
longer carry a private RNG cursor. One shared four-marker predicate excludes mission-owned rewards,
and neutral, missing-victim, non-player, and duplicate reward paths fail closed. Hostile drones remain
eligible.

The candidate is published on `origin/master` at the exact commit above.
