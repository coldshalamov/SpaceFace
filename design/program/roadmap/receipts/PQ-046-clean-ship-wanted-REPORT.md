<!-- LIFETIME: EVIDENCE -->
# PQ-046 clean-ship WANTED receipt

```yaml
packet: PQ-046
unit: PQ-046.clean-ship-wanted
candidateCommit: 489a35a96c5efed64b52b7d31b2d71f2bd1bb0f0
lifecycleClaim: integrated
acceptanceClaim: focused_green
disposition: PASS
changedPaths:
  - src/combat/damage.js
  - src/combat/rewardEligibility.js
  - src/systems/combat.js
  - src/systems/heat.js
  - test/pq019-heat-incident-listener.test.mjs
focusedGates:
  - focused law/reward tests: 32/32 pass
  - PQ-019 seams: 105/105 pass
  - adjacent loot/cargo/save tests: 38/38 pass
  - npm run check:baseline: 11/11 pass
  - both sim compares and both golden hashes: pass
routeEvidence: []
performanceEvidence:
  - first-hit lookup is O(1); no per-frame work added
  - durable incident ledger stores one boolean per distinct law receipt to preserve exact replay refusal
review:
  discovery: REVISE
  causalRereview: APPROVE
residuals:
  - the save-backed incident-id ledger grows with distinct authored law incidents and intentionally does not evict entries
followUps: []
```

## Result

The first accepted player hit now freezes the target's canonical lawful/hostile truth before
synchronous retaliation can mutate live AI. Durable targets carry that receipt through world-record
capture, JSON save, rematerialization, and lethal follow-up; non-durable targets retain an
object-lifetime fallback. Clean generic ships, frigates, haulers, and freighters cross WANTED, while
genuine encounter hostiles remain legitimate combat.

The causal reviewer reproduced the former two-hit trader laundering case through the real
`world._spawnFromDurableRecord()` path. Final receipts remained non-hostile across the replacement
object, heat reached `0.18`, WANTED was true, and the hostile shard path stayed closed. Heat timing
resets on New Game/load, de-escalation is ignored, and the durable incident ledger refuses replay of
its oldest receipt after more than 32 later incidents.

The candidate is published on `origin/master` at the exact commit above.
