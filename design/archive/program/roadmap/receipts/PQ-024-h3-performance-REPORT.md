<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-024
leafId: PQ-024.h3-performance
acceptance: route_accepted
disposition: PASS
candidateCommit: 2509a168446f0622b943084c97849a65c84346ea
-->

# PQ-024 matched survey-to-relay performance

```yaml
packet: PQ-024
dispatchUnit: PQ-024.h3-performance
candidateCommit: 2509a168446f0622b943084c97849a65c84346ea
claimBase: 02d2c877f3966df6c89904c3dd6d29490f87c70a
brokerManifest: pq024-h3-performance
browserClaim: 33596-be4c6688b2df89754fd8285d
candidateDigest: 293e69663d1fe379cc80f4e2c1a6d05f84021f11e687f58715e5c6d1e405ecb5
routeDigest: e4404893a566b06bbc6df2ab024104b48bd5ff14948ddaeab3619bd707ad6057
regressionDigest: 6c891c03ba2705c5daf0735ae6bd4a31d8ef8a2c6a01d0c3686e66d180484835
manifestDigest: e2e821eed4c7b4fe56aa82c4aa3cbd3ea02865117415d78d2715ecc4e9ee8f92
buildDigest: cdd523a24578c280983f59a98f0439201a07e1136dcf24686b379de8a74671dd
profileDigest: 2af746230348c250266f16846728246400f7735a772d405270329c12465ac9c5
receiptSha256: 611D55E696C9F48DAA30AAA4A8C4D692CA6491EAF58021536580D502E76E348B
fixedSeed: 24024
runtime: browser-chromium-headed
gpu: Intel ANGLE Direct3D11
viewport: 1830x973@1
matchedCellResult: PASS
absoluteBudgetObservedResult: PASS
relayVisualQualityClaimed: false
historicalOptimizationClaimed: false
programWideAbsoluteTargetClaimed: false
absoluteBudgetWaiverGranted: false
browserClosed: true
serverClosed: true
```

## Verdict

**PASS the exact PQ-024 H3 cell.** One brokered headed Browser claim completed three public,
fixed-seed matched pairs. Each pair bought the real Core/extractor cargo at Helios, flew the
unified-map asteroid course, latched the exact route-selected asteroid through the rendered
Massline acquisition, committed the deterministic Survey/Core site, and sampled its no-relay
exterior floor. The same actor then re-entered Asteroid Ops, installed the real extractor, awaited
one authoritative positive-output receipt plus exactly one admitted relay, restored the exact
floor pose, and sampled the target with the same camera, settings, viewport, route, runtime, and GPU.

| Profile | Median p50 | Median p95 | Median p99 | Median max | Total >32 ms | Total >50 ms |
|---|---:|---:|---:|---:|---:|---:|
| Committed Core, no extractor/relay floor | 16.7 ms | 16.8 ms | 17.2 ms | 17.7 ms | 0 | 0 |
| Producing site, one relay target | 16.7 ms | 16.8 ms | 17.2 ms | 17.3 ms | 2 | 0 |

Both profile medians satisfy the separately reported `17.5 ms` absolute sampling envelope. The
target's two raw >32 ms intervals occurred together in pair 3, were multi-step catch-up after an
external callback gap, and normalize to zero product-attributed hitches. All six windows recorded
zero backlog shedding; the floor likewise recorded zero raw, external, or product-attributed
hitches. This accepts the bound route/build/settings/hardware cell only. It does not claim that the
relay is visually acceptable, that an optimization improved historical performance, or that a
program-wide absolute target is waived.

## Six-window evidence

| Pair | Profile | Samples | p95 | p99 | max | >32 / >50 | Callback / render / sim p95 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | floor | 300 | 16.8 | 17.1 | 17.3 | 0 / 0 | 11.0 / 5.3 / 5.3 ms |
| 1 | target | 301 | 16.8 | 17.2 | 17.3 | 0 / 0 | 10.8 / 5.0 / 5.3 ms |
| 2 | floor | 300 | 16.8 | 17.2 | 17.9 | 0 / 0 | 12.4 / 5.9 / 5.4 ms |
| 2 | target | 301 | 16.8 | 17.1 | 17.3 | 0 / 0 | 12.0 / 6.0 / 4.9 ms |
| 3 | floor | 300 | 16.8 | 17.4 | 17.7 | 0 / 0 | 12.5 / 6.0 / 5.2 ms |
| 3 | target | 298 | 16.9 | 17.4 | 33.4 | 2 / 0 | 12.2 / 6.2 / 5.0 ms |

The median CPU-work p95 envelopes are `12.4 / 5.9 / 5.3 ms` for floor callback/render/sim and
`12.0 / 6.0 / 5.0 ms` for the target. Renderer admission during both measured profiles is zero new
geometries, textures, programs, and render targets. Default quality and route/settings stability
remain exact; the only disclosed isolation suppresses player defeat/contact drift while retaining
NPC combat and ambient VFX. Every pair restored player safety, removed its time-effect listeners,
and released Massline before teardown.

Each producing target binds `site_1` in lifecycle `producing`, one Core, one extractor, one real
`cmdty_silicate` output receipt, and exactly one `place_claim_outpost_relay` with authored admission.
The relay is the same indexed LOD1 path in every pair: one visible indexed mesh, five draw groups,
21,532 triangles, 42,786 vertices, 64,596 indices, five front-side materials, and five materials
sharing the packed ORM fetch. Those are runtime identity/resource facts, not a visual-quality verdict.

## Correlated GPU attribution

The rAF timing windows ran without GPU timer queries. Each was followed by a separate 150-frame
attribution segment and all correlated samples drained before the next transition.

| Profile | Pair 1 p95 | Pair 2 p95 | Pair 3 p95 | Median p95 |
|---|---:|---:|---:|---:|
| floor | 10.680780 ms | 11.451977 ms | 11.112655 ms | 11.112655 ms |
| target | 11.902290 ms | 11.553645 ms | 11.740571 ms | 11.740571 ms |

Paired target-minus-floor p95 deltas are `+1.221510`, `+0.101668`, and `+0.627916 ms`; their
predeclared median is `+0.627916 ms`, inside the `+0.8 ms` matched tolerance. Both profile median
p95 values also remain below the separately reported `17.5 ms` correlated-GPU envelope.

## Causal harness closure

The broker ledger retains five one-use candidate digests. Four failed claims remain diagnostics and
were never relabeled as acceptance:

- claim `24656-90918dc89ec1c032aad6ec0c` exercised the initial H3 actor but did not produce a
  promotable matched receipt; its route evidence led to exact dock/Massline timeout diagnostics and
  the bounded route/relay correction in `73bdc55e`;
- claim `30332-3a50ca677c26b95cef271814` reached the matched route but exposed pair-2 pose drift
  (`0.540 WU`) plus a target GPU p95 over the then-absolute gate. `4cec87ef` restored the exact
  entity/Rapier pose and preserved the relay's indexed topology;
- claim `27828-759cf71dfc900df6182a987c` proved exact poses but exposed two evidence-semantics defects:
  catch-up work was compared to a one-step CPU envelope and a matched feature cell was gated by an
  unrelated absolute GPU threshold. `ce9322af` added regressions, normalized only externally
  scheduled catch-up, and separated the absolute report from the `0.8 ms` matched GPU delta;
- claim `12560-10bc9d56d989a91703cd74f5` stopped in pair 2 when the actor's Ctrl override selected
  Helios Station by nearest surface instead of the map-selected asteroid. Screenshot, state, and
  owner-code evidence falsified the stale assumption. `2509a168` now waits for the exact rendered
  `route-anchor` receipt, holds ordinary Space across a fixed tick, verifies the exact tether, and
  emits structured route/acquisition/tether diagnostics on any future miss.

Seconds-scale regressions cover each accepted correction. The final claim used a new bound
candidate digest, passed all three pairs, reported zero page issues, and closed its owned Browser
and server. Already accepted PQ-024 H1 Browser/Electron/save/Continue evidence was retained rather
than recaptured.

## Checks

- `node scripts/validation-broker-cli.mjs --manifest pq024-h3-performance` — PASS, claim
  `33596-be4c6688b2df89754fd8285d`, duration `448497 ms`, clean teardown;
- broker fast gate — PASS for all eight manifest-declared commands before claim issuance;
- `node --test test/pq024-h3-performance.test.mjs` — 16/16 PASS;
- `node --test test/pq024-asteroid-claim-manifest.test.mjs` — 8/8 PASS;
- `npm run check:pq024:survey-claim` — 21/21 PASS;
- `npm run check:sim:compare` — PASS in the broker fast gate;
- `npm run check:baseline` — 10/10 PASS in `54.599 s`, `35.401 s` headroom;
- changed-script syntax and `git diff --check` — PASS.

The full ignored runtime receipt remains at
`.devshots/perf/pq024-h3/performance-receipt.json`; its five consumed candidate claims, fast-gate
digest, screenshots, and latest run result remain under `.devshots/perf/pq024-h3/`.
