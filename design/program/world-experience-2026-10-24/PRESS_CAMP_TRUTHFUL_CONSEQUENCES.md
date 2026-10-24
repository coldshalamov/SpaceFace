# Press Camp: truthful destruction and captive consequences

## Scope
Scene358 now retains witnesses for its original camp, garrison and captive. Missing, stored or recycled actors do not count as destroyed originals. Actual combat death observed while the original occupant is still present is retained across reap-before-tick, so a genuine destroyed camp still settles once. Missing unproven cast resolves neutral contact_lost without invented pay or liberation.

Captive release requires the original actor/generation and retained AI/activity, normalized body and intent identity. Player-owned/captured, absent, dead or foreign-controlled captives are left untouched. A settlement latch is set before comms, grant, reputation or resolution callbacks, preventing synchronous reentry from paying twice. Save/loaded/sector lifecycle and stale-live guards remain within the existing transient encounter policy; continuous crossing retains the real current encounter.

No shared director, AI, capture, Save, schema, physics, model or geometry edits. This increment is independent of PR583. Existing camp hull1400, radius42, combat bounty520, scene award120, Reach-3/eligible Free+2 and three authored loot pods remain. Actual model/native separation was observed separately; no overlap geometry correction is claimed.

## Focused qualification
Final source6b085d84 and focused testfc788643 passed27/27 locally. Tests cover missing/replaced base, genuine killed/reaped base with replacement, unavailable/captured/player/foreign AI/activity/intent/body captive, four synchronous reentry seams, genuine versus missing garrison, stale lifecycle, timeout and continuous crossing.
Original-source negative control passed6/21 initial cases and failed15. The final27-case suite adds lifecycle and intent/body coverage;6/21 is not mislabeled a27-case baseline run.

## Native owner and unchanged-envelope evidence
Final native file4ce54f8f passed two cases on selected actual AI/flight/aiPorts/Rapier/combat/economy/Save systems:
- Garrison destroyed through actual combat.kill: camp and original captive remain alive, no scene grant; combat credits2341 remain2341 after serialize→JSON→load and resumed ticks.
- Original base killed and removed before settlement: exactly one120 scene grant plus the pre-existing520 combat bounty yields640 total, not two camp bounties. Continue retains640 and cannot replay the scene grant.
Final proof retains the complete serialized physics payload and checksum. An earlier fixture deleted both as a convenience and established only scalar Save evidence; that weakening was removed and an unchanged-envelope probe and final two-case run passed. The earlier scalar attempt is not claimed as exact native restore proof.

Final native raw summary (exit0, stderr empty):
- garrison_broken, grants[], moved0WU, alive true, credits2341→2341;
- base_destroyed, grants[[120,press_camp:base_burned]], credits640→640;
- tests2, pass2, fail0, skip0, cancelled0, duration1568.623355ms.

The local dependency graph is explicitly selected/read-only and mixed, not the whole current public graph. Component admission is forced and deaths are injected through the real combat owner, not personally flown combat or an ordinary scheduler route. The player is a qualification entity; no full populated-world/browser/GPU/performance acceptance follows. Hosted current-checkout validation is pending.

## Important remaining boundary
The passive captive still moves **0WU** during the observed10-second native tail, retaining its existing held activity even though the old release flags/label change. This guard-only increment does not implement or claim physical escape, home arrival or a played rescue. A separate motion/capture-commit experiment is unfinished and excluded from these source files. Existing loose release copy is not evidence of travel.

## Publication and gate
Five files: scene358, two new focused/native test files, package alias/check-chain addition and this report. The reachable check:press-camp-consequences leaf runs27 focused +2 native tests, expected29 TAP tests. Current graph classification is static shard2/3, no unclassified commands; all prior command relative order and workflows remain unchanged. No local aggregate was executed.

Source, both portable tests and this handoff are preserved in Git on a sole fresh public-master parent. Fresh open-PR census found no scene/test overlap. No merge or deployment. The next hosted artifact is required before claiming a current-public-graph pass.
