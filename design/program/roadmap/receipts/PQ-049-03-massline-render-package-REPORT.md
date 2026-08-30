# PQ-049.03 — Massline render packages

```yaml
packet: PQ-049.03
candidateCommit: ac004d15
lifecycleClaim: integrated
acceptanceClaim: focused_green
disposition: PASS
changedPaths:
  - assets/ships/render-packages/pilots.json
  - assets/ships/release/render-packages/massline-express-liner-v1/
  - assets/ships/release/render-packages/massline-express-liner-v1-lod1/
  - assets/ships/release/render-packages/massline-express-liner-v1-lod2/
  - src/render/renderPackageManifest.js
focusedGates:
  - node scripts/build-render-package-pilots.mjs --check --only=massline-express-liner-v1,massline-express-liner-v1-lod1,massline-express-liner-v1-lod2
  - npm run check:render-package-plan
  - node --test test/pq049-massline-express-liner.test.mjs
  - npm run check:baseline
routeEvidence: []
performanceEvidence: []
review:
  discovery: REVISE
  causalRereview: APPROVE
residuals:
  - the global pilot check still stops on an unrelated frozen Kestrel package; the exact Massline family is fresh
followUps:
  - repair Kestrel only through its owning frozen-asset lane
```

The original `93ebe7c7` transaction generated all three shipping packages and runtime table entries.
Current focused validation found their metadata stale after later pilot-manifest changes; `ac004d15`
rebuilt only the three Massline package manifests and generated runtime table. The exact family is now
fresh, and all 220 packages form valid instance plans.

RESULT: DONE — exact Massline package family fresh and integrated.
