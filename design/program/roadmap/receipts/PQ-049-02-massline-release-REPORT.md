# PQ-049.02 — Massline source/candidate/release transaction

```yaml
packet: PQ-049.02
candidateCommit: 93ebe7c794915d5e94a6829dc8e114bca986f335
lifecycleClaim: integrated
acceptanceClaim: focused_green
disposition: PASS
changedPaths:
  - assets/ships/massline_express_liner_v1/release_candidates/wholeships/
  - assets/ships/parts/wholeships/massline_express_liner_v1*.glb
  - assets/ships/release/parts/wholeships/massline_express_liner_v1*.glb
  - assets/ships/parts/parts_manifest.json
  - assets/ships/release/release_manifest.json
focusedGates:
  - node --test test/pq049-massline-express-liner.test.mjs
  - npm run check:asset-status
  - npm run check:asset-reachability
  - npm run check:baseline
routeEvidence: []
performanceEvidence: []
review:
  discovery: APPROVE
  causalRereview: NOT_REQUIRED
residuals:
  - check:assets:live is master-only and rejected the integration branch before probing
  - player-route and release-hash G7 remain PQ-049.05
followUps:
  - PQ-049.05 captures the natural route on an eligible master candidate
```

`evidence/finalize_report.json` binds the frozen Cycle 36 LOD0/1/2 and blend hashes to thirteen
sockets, collision, 0.30 glazing, exact semantic roles, stamped candidate bytes, and source/release
manifest records. The accepted courier Lark and unrelated traffic assets were unchanged.

RESULT: DONE — release transaction integrated; route acceptance remains unproven.
