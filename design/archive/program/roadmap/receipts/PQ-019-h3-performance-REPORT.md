<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-019
leafId: PQ-019.h3-performance
acceptance: route_accepted
disposition: PASS
candidateCommit: 51c5967abd1803032d874456284f55e843947ddc
-->

# PQ-019 matched facility and heist-route performance

```yaml
packet: PQ-019
dispatchUnit: PQ-019.h3-performance
candidateCommit: 51c5967abd1803032d874456284f55e843947ddc
claimBase: 8febcb42dea4df99f0cfb3b1cfe94bb936811a40
brokerManifest: pq019-h3-performance
browserClaim: 34148-f81823309088525213ab63c2
candidateDigest: 5fa313e26df19ce0a05e53c7d2dbbaf16b458804a6480933dbb4838486dcb817
routeDigest: 3a72ff03e82a65cbebfce65a65145062a811cee817f60f6369d5b40baf715791
regressionDigest: 79badb43d436d5fdac6dc5d7ae83226ee68e0f84cac9c60d843c2ea16cdbbbc5
fixedSeed: 19019
runtime: browser-chromium-headed
gpu: Intel ANGLE Direct3D11
matchedFeatureResult: PASS
absoluteBudgetResult: OPEN
performanceImprovementClaimed: false
absoluteBudgetWaiverGranted: false
browserClosed: true
serverClosed: true
```

## Verdict

**PASS the PQ-019 matched feature cell.** One broker claim alternated three facility-normal windows
with three traffic-loaded live-heist windows on the same fixed-seed Tethys route, viewport, default
quality settings, Chromium runtime, and Intel D3D11 GPU. The loaded route retained ordinary sector
traffic and added the physical authored capsule, witnessed theft, WANTED heat, and one real patrol
lease. It did not regress the matched normal profile:

| Profile | Median p50 | Median p95 | Median p99 | Median frames >32 ms | Median frames >50 ms |
|---|---:|---:|---:|---:|---:|
| facility-normal | 16.7 ms | 33.4 ms | 33.5 ms | 51 | 0 |
| traffic-loaded-heist | 16.7 ms | 16.8 ms | 33.4 ms | 6 | 0 |

The result makes no before/after optimization claim. It proves only that the accepted PQ-019 live
feature load fits within the current matched normal envelope after the indexed authority repair.

## Six-window evidence

| Pair | Profile | Samples | p95 | p99 | max | >32 ms | >50 ms | backlog shed |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | facility-normal | 287 | 17.1 | 33.3 | 33.4 | 13 | 0 | 0 |
| 1 | traffic-loaded-heist | 294 | 16.8 | 33.3 | 33.4 | 6 | 0 | 0 |
| 2 | facility-normal | 249 | 33.4 | 33.5 | 33.5 | 51 | 0 | 0 |
| 2 | traffic-loaded-heist | 271 | 33.3 | 33.5 | 33.6 | 28 | 0 | 0 |
| 3 | facility-normal | 244 | 33.4 | 33.6 | 66.9 | 53 | 2 | 0 |
| 3 | traffic-loaded-heist | 296 | 16.8 | 33.4 | 33.6 | 5 | 0 | 0 |

- Normal windows held `335-336` entities and `305-306` colliders; loaded windows held `336-337`
  entities and `306-307` colliders. Spatial-query counts were `1162-1194` normal and `1161-1169`
  loaded.
- Normal draw facts were `61-62` calls and `37,064-39,672` triangles. Loaded facts were `62-65`
  calls and `39,620-39,672` triangles. All six completed with `65` geometries and `89` programs.
- Every window achieved five stable pipeline seconds inside the bounded 30-second ceiling. GPU timer
  queries drained with zero pending, dropped, or rejected queries.
- Every one of the `244-296` raw intervals per window remained visible, in flight, undocked, and
  player-controllable. Video settings and `dynResScale=1` were identical at both ends. Loaded
  intervals honestly retained authored shield-hit dilation down to `timeScale=0.12`; no covered or
  non-controllable interval was admitted.
- Renderer growth during measurement was zero geometries/programs/render targets and at most one
  texture in the normal arms, with no retained-after-GC signal. All arms reported zero long tasks,
  zero GC signals, zero page issues, and clean owned Browser/server teardown.

## Absolute target remains open

The independent 16.7 ms program target is still red and unwaived. The facility-normal median p95
is `33.4 ms`, outside the `17.5 ms` bounded sampling envelope, and pair 3 contains two frames above
50 ms. This finding is retained as an absolute program-quality signal; it is not rewritten into a
matched-feature failure and does not become a fictitious waiver.

## Causal closure and checks

The accepted candidate includes the indexed station/ship-like authority paths and removes the H1-only
high-rate VFX observer from the H3 actor (`c887d08c`). It also records authored VFX and hidden-LOD
residency before publication, binds capsule waiting to simulation progress, and fails closed on raw
route continuity. The final harness correction (`51c5967a`) covers the observed `18.5 + 5 s` cold
pipeline fingerprint within the shared 30-second ceiling and separates transient authored hit-stop
from strict video/dynamic-resolution equality.

Accepted evidence and supporting gates:

- `node scripts/validation-broker-cli.mjs --manifest pq019-h3-performance` — PASS, one consumed
  Browser claim, six matched windows, `175685 ms`;
- focused/shared performance regressions — 96/96 PASS;
- program-control tests — 9/9 PASS;
- `node scripts/check-program-docs.mjs` — PASS;
- `npm run check:baseline` — 10/10 PASS (`56.159 s`, `33.841 s` headroom).

The full ignored runtime receipt remains at
`.devshots/perf/pq019-h3/performance-receipt.json`; the consumed claim and latest result remain under
`.devshots/perf/pq019-h3/`. No already-accepted H1 or H2 evidence was rerun.
