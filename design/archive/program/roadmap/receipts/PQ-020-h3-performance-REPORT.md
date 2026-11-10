<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-020
leafId: PQ-020.h3-performance
acceptance: route_accepted
disposition: PASS
candidateCommit: f7464211dc175b1741b3d63724d9ce34cb61883a
-->

# PQ-020 Cathedral-keyed matched Ceres performance

```yaml
packet: PQ-020
dispatchUnit: PQ-020.h3-performance
candidateCommit: f7464211dc175b1741b3d63724d9ce34cb61883a
claimBase: dc210503f0a2e0fe2697dc0f4c231102b8e64805
brokerManifest: pq020-h3-performance
browserClaim: 27012-047cbbea6c18528dea331f95
candidateDigest: 103b715d1f103b99330faa60e7dcff8e853acb664391dd96aacda8b19c586436
routeDigest: c8a9e8d496991e7ccc5f4afb799127de93d080ba926e5fefa872db2cf82e6cb3
regressionDigest: 0e61c1d27d2e2c2d472b44e9623f92684bbb84f7d1b46b0e55cf8f4758f4cca9
harnessDigest: 0399a41096bbe686d5ce34e623747f658f04cf9eb3ee301e9a926814e27a0d0a
manifestDigest: a5097432031d5a7e0a58b0bf885e2e5619563fb6c94ab96b89b66491c478c941
buildDigest: cdd523a24578c280983f59a98f0439201a07e1136dcf24686b379de8a74671dd
receiptSha256: FE4937228DD1C763991513DF9E0FE2C13949EDD166DE5E22DD4981FBA8997406
fixedSeed: 47
runtime: browser-chromium-headed
gpu: Intel ANGLE Direct3D11
viewport: 1830x973@1
matchedCellResult: PASS
declaredAbsoluteCellBudgetResult: PASS
generalOptimizationABClaimed: false
programWideAbsoluteTargetClaimed: false
absoluteBudgetWaiverGranted: false
browserClosed: true
serverClosed: true
```

## Verdict

**PASS the exact PQ-020 H3 cell.** One brokered headed Browser claim alternated three ordinary
Ceres endpoint-entry floor windows with three publicly selected, naturally reached, admitted, and
default-framed Wreck Cathedral windows. All six windows retained default quality, fixed seed `47`,
the same 1830x973 viewport and real Intel ANGLE/D3D11 GPU, exactly 300 visible and controllable raw
intervals, zero backlog shedding, zero page issues, and clean owned teardown.

| Profile | Median p50 | Median p95 | Median p99 | Median max | Total >32 ms | Total >50 ms |
|---|---:|---:|---:|---:|---:|---:|
| Ceres entry floor | 16.7 ms | 16.8 ms | 17.1 ms | 17.6 ms | 0 | 0 |
| Cathedral visible target | 16.7 ms | 16.8 ms | 16.9 ms | 17.2 ms | 0 | 0 |

The accepted cell satisfies its declared `17.5 ms` p95 sampling envelope and `50 ms` hard-frame
ceiling without a waiver. It does not claim a historical before/after gain or a program-wide
performance guarantee beyond this fixed route, build, viewport, settings, runtime, and GPU.

## Six-window evidence

| Pair | Profile | Samples | p95 | p99 | max | >32 ms | >50 ms | backlog shed |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Ceres entry floor | 300 | 16.8 | 17.1 | 17.6 | 0 | 0 | 0 |
| 1 | Cathedral visible target | 300 | 16.8 | 16.9 | 17.2 | 0 | 0 | 0 |
| 2 | Ceres entry floor | 300 | 16.8 | 17.1 | 18.4 | 0 | 0 | 0 |
| 2 | Cathedral visible target | 300 | 16.8 | 16.9 | 17.1 | 0 | 0 | 0 |
| 3 | Ceres entry floor | 300 | 16.8 | 17.1 | 17.2 | 0 | 0 | 0 |
| 3 | Cathedral visible target | 300 | 16.8 | 17.1 | 17.7 | 0 | 0 | 0 |

- Floor windows held `364` entities and `326` colliders; target windows held `365` entities and
  `334` colliders. Spatial queries were `853-858` floor and `860-868` target, with candidate counts
  `21,243-28,774` and `15,258-17,137` respectively.
- Floor render facts were `43-46` calls, `28,022-28,054` triangles, `51` geometries,
  `273-275` textures, and `84` programs. Target facts were `53-58` calls,
  `199,450-199,494` triangles, `60` geometries, `354-356` textures, and `90` programs.
- Renderer measurement deltas were zero for geometries, textures, programs, and render targets in
  every window. Target heap growth was `16.96-20.97 MB`; all windows reported zero long-task and GC
  signals.
- Map open measured `178.4-457.0 ms`; sector entry measured `0.4-0.6 ms`. Every target window bound
  fifteen Cathedral entities, seven admitted components, authored/ready LOD0, in-frame projection,
  and public camera zoom `72`.

## Accepted structural closure

The accepted production path rejects the prior coarse material-family assumption and classifies the
real indexed topology instead:

- exact zero-area pruning removes `5,247` of `91,908` source triangles, leaving one indexed
  `86,661`-triangle color batch with all eight original material groups;
- connected-component classification retains `36,268` closed exposed-alloy triangles in the closed
  path and leaves the genuinely open `1,882` exposed-alloy triangles on ordinary double-sided
  color/depth;
- one front-sided, position-only depth shader prepasses the `84,779` closed triangles and shares the
  exact color position buffer;
- all eight PBR roles reuse one packed ORM sample for AO, roughness, and metalness while preserving
  their authored values, role identities, pixels, and material defaults.

Source/release assets, authored geometry positions, LOD policy, visible material roles, default
quality, and scene content are unchanged. The owner regression binds the zero-area accounting,
closed/open split, index and attribute identity, packed-ORM shader contract, and source-material
immutability.

## Measurement isolation and checks

Accepted rAF timing windows ran with GPU timer queries disabled. Each was followed by a separate
150-frame attribution segment that attempted, issued, completed, and drained exactly `450` queries
with zero pending, dropped, or rejected results. Route and settings remained stable. Conservative
sums of the separately measured GPU-pass maxima were `9.403/10.877/10.346 ms` for the floor and
`14.722/12.380/11.809 ms` for the target, all inside the `17.5 ms` attribution ceiling. The bounded
external-scheduling classifier was therefore available but unused: all six accepted timing windows
contained zero raw and zero product-attributed hitches.

Accepted evidence and supporting gates:

- `node scripts/validation-broker-cli.mjs --manifest pq020-h3-performance` — PASS, one consumed
  Browser claim, six matched windows, zero page issues, clean teardown;
- focused owner and H3 tests — 32/32 PASS;
- `npm run check:render-hotpath` — PASS;
- H1 manifest regressions — 16/16 PASS;
- `npm run check:pq020:proofs` — 14/14 PASS;
- `npm run check:pq020:ceres-topology` — PASS;
- `npm run check:sim:compare` — deterministic hashes equal;
- `npm run check:baseline` — 10/10 PASS (`39.903 s`, `50.097 s` headroom);
- program-control tests — 9/9 PASS;
- `node scripts/check-program-docs.mjs` — PASS with zero warnings;
- `git diff --check` — PASS.

The full ignored runtime receipt remains at
`.devshots/perf/pq020-h3/performance-receipt.json`; its consumed claim remains under
`.devshots/perf/pq020-h3/broker-claims/`. The accepted H1/H2 route evidence was reused rather than
rerun.
