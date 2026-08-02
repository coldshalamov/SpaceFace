<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-023
leafId: PQ-023.h3-performance
acceptance: route_accepted
disposition: PASS
candidateCommit: 93c76f6529e709ac6dc552b4611571dee590ca72
-->

# PQ-023 matched dense-scene cue performance

```yaml
packet: PQ-023
dispatchUnit: PQ-023.h3-performance
candidateCommit: 93c76f6529e709ac6dc552b4611571dee590ca72
claimBase: e996a83778b2729e358f5abd5485a9c33413ed5a
brokerManifest: pq023-h3-performance
browserClaim: 25092-dc1e123131f87f9b970e8185
candidateDigest: 606f7607ff9f23f596f51a08484e1484f4556d8cd4928d3cc3bbf4b81ea012b8
routeDigest: c96fb8841090c3ac842cba270944f9607eb1dd207aa6d65c4e5a256023bd81c3
regressionDigest: 40908a8915ca3e277fdb3c8ad9008ed04bd4f66b72acef2cf836aea6bec97739
harnessDigest: 7fbe43034c889b42750249dadf8ae4999d89ee2b075931ba556b5f0798812702
manifestDigest: 448501f34df39d014d9cfbb4f832b54e37cf7a902b311be45ca38162d1b2fcf2
buildDigest: cdd523a24578c280983f59a98f0439201a07e1136dcf24686b379de8a74671dd
receiptSha256: 4F7C3AC2BD2A466FA16C8D67866E6B5ECEEE8F298F9938D452E97609388FBBDA
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

**PASS the exact PQ-023 H3 cell.** One brokered headed Browser claim alternated three ordinary
authored Helios-flight floor windows with three accepted dense destruction/connected-beam windows
in the same live context. All six retained fixed seed `47`, default quality, an 1830x973@1 viewport,
the exact `(0, 0, rot 0, zoom 88, no target)` pose, live NPC combat and ambient VFX, real Intel
ANGLE/D3D11, visible controllable flight, zero page issues, and clean owned teardown.

| Profile | Median p50 | Median p95 | Median p99 | Median max | Total >32 ms | Total >50 ms |
|---|---:|---:|---:|---:|---:|---:|
| Authored Helios flight floor | 16.7 ms | 16.8 ms | 17.0 ms | 18.2 ms | 2 | 0 |
| Accepted dense cue target | 16.7 ms | 16.8 ms | 17.3 ms | 17.9 ms | 0 | 0 |

The target satisfies the declared `17.5 ms` p95 sampling envelope, the `50 ms` hard-frame ceiling,
zero backlog shedding, and the matched p95/p99 tolerances. The two floor intervals above 32 ms were
isolated to one `49.9 ms` external-scheduling event; product-attributed hitches were zero in all six
windows. This accepts only the fixed route/build/settings/runtime/GPU cell and makes no historical
optimization delta or program-wide performance claim.

## Six-window and cue evidence

| Pair | Profile | Samples | p95 | p99 | max | >32 ms | Dense particles/sprites/streaks | Beam/explosions |
|---:|---|---:|---:|---:|---:|---:|---|---|
| 1 | floor | 300 | 16.8 | 16.9 | 17.3 | 0 | 42 / 72 / 68 | 0 / 6 |
| 1 | dense target | 300 | 16.8 | 17.3 | 18.4 | 0 | 254 / 96 / 63 | 1 / 6 |
| 2 | floor | 297 | 16.8 | 17.2 | 49.9 | 2 | 42 / 94 / 67 | 0 / 6 |
| 2 | dense target | 300 | 16.8 | 16.9 | 16.9 | 0 | 330 / 98 / 60 | 1 / 6 |
| 3 | floor | 300 | 16.8 | 17.0 | 18.2 | 0 | 42 / 83 / 67 | 0 / 6 |
| 3 | dense target | 300 | 16.9 | 17.4 | 17.9 | 0 | 254 / 88 / 59 | 1 / 6 |

- Each target run emitted `9-11` declared pulses. Every pulse preserved all three critical cues,
  attempted ten flavor cues, and demonstrated real flavor suppression; no critical cue was dropped.
- Ambient-mixed peak medians were `254 particles / 96 sprites / 60 trail streaks`. Exact per-run
  topology remained one connected beam and six explosions. Default capacities stayed
  `3000 / 256 / 96 / 16 / 24` and every owned pool returned to zero.
- Renderer-admission medians were zero geometries, textures, programs, and render targets for both
  profiles. Programs and render targets were exact-zero in every individual window.
- The benchmark suppressed only player defeat/contact drift while journaling the exact entity and
  Rapier state. All three pair cleanups restored that state and removed their time-effect listeners,
  driver, target, and pooled effects; NPC combat and ambient VFX remained active.

## GPU attribution

The rAF timing windows ran without GPU timer queries. Each was followed by a separate 150-frame
attribution segment that attempted, issued, completed, and drained exactly `450` queries, correlated
by display-frame identity, with zero pending/dropped/rejected results. Correlated GPU-frame p95 was:

| Profile | Pair 1 | Pair 2 | Pair 3 | Median p95 |
|---|---:|---:|---:|---:|
| floor | 9.017811 ms | 9.773800 ms | 8.509218 ms | 9.017811 ms |
| dense target | 11.581925 ms | 10.403488 ms | 7.938175 ms | 10.403488 ms |

All six segments remained below the `17.5 ms` correlated-GPU ceiling.

## Causal harness closure

Three earlier candidate-bound claims are retained as diagnostics rather than hidden or relabeled:

- `27360-392f59b52aabd1f75f33f095` / fingerprint `514e33e4…` exposed a machine-specific absolute
  geometry cap even though target admission was lower than its ordinary ambient floor.
- `40528-534e8651de62c2df3d36338d` / fingerprint `5e3770f3…` exposed one legitimate
  source-attributed `feel:hit-stop` interval caused by ordinary NPC damage.
- `25268-637c99e5d09bf9c9f71c94dc` / fingerprint `16dea2dc…` exposed one unrelated ambient burst in
  the shared whole-scene particle pool while the dense driver's exact attempt/topology counts held.

The final validator uses predeclared three-run medians only for shared ambient-mixed resource
surfaces, while exact program/render-target and beam/explosion invariants remain per run. It accepts
only a bounded timestamp/tick/event-attributed authored hit-stop, isolates and restores the player
benchmark state, and retains the live surrounding battle. Fourteen seconds-scale regressions cover
the reproduced failures and still reject systematic pool/resource multiplication, unattributed or
extended dilation, route/pose drift, missing critical cues, capacity drift, and incomplete cleanup.
No production, visual, asset, default-quality, H1, or H2 path changed to pass this cell.

## Checks

- `node scripts/validation-broker-cli.mjs --manifest pq023-h3-performance` — PASS, claim
  `25092-dc1e123131f87f9b970e8185`, six matched windows, `175493 ms`, clean teardown;
- `node --test test/pq023-h3-performance.test.mjs` — 14/14 PASS;
- exact failed-receipt causal revalidation — PASS at dense medians `271/96/61`;
- `npm run check:pq023:corridor-cues` — 23/23 plus 18/18 critical-contract tests PASS (retained;
  production cue code did not change);
- `npm run check:presentation` — PASS (retained; production presentation code did not change);
- `npm run check:sim:compare` — deterministic hashes equal (retained; simulation code did not change);
- `npm run check:baseline` — 10/10 PASS (`38.803 s`, `51.197 s` headroom);
- program-control tests — 9/9 PASS;
- `node scripts/check-program-docs.mjs` — PASS with zero warnings;
- changed-script syntax and `git diff --check` — PASS.

The full ignored runtime receipt remains at
`.devshots/perf/pq023-h3/performance-receipt.json`; its consumed claims and latest result remain under
`.devshots/perf/pq023-h3/`. Already accepted H1/H2 evidence was not rerun.
