<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-019
leafId: PQ-019.capsule-h1-capture
acceptance: route_accepted
disposition: PASS
candidateCommit: 3590acf9fd8facdb2c7277b33c1f363fe4ebe871
-->

# PQ-019 physical-capsule H1 continuation report

```yaml
packet: PQ-019
dispatchUnit: PQ-019.capsule-h1-capture
lifecycleClaim: route_accepted
acceptanceClaim: route_accepted
disposition: PASS
candidateCommit: 3590acf9fd8facdb2c7277b33c1f363fe4ebe871
fixedSeed: 1347498297
browserClaimId: 7584-0f021eaf85838a532440c0a8
browserCandidateDigest: 530315c2db88bb92502e6f602bd1e4d690a30ef137aa2e88be514da3e509d992
headedElectronLaunched: false
performanceEvidenceClaimed: false
humanArtVerdictClaimed: false
```

## Verdict

PASS for the missing H1 physical-capsule presentation. One broker-authorized Browser route on the
clean `3590acf9` candidate produced three distinct, original-resolution game-camera views of the
live in-flight authored `pod_cargo_container`. The retained facility/count and T-minus evidence was
not rerun by the accepted `--capsule-only` cell.

The applied runtime camera zooms are strictly `45`, `66`, and `108`. Each receipt reports authored
admission, one visible mesh, a near-zero NDC center, the same live entity and frozen in-flight
moment, and no page error. The three PNG hashes are:

| Framing | Applied zoom | Bytes | SHA-256 |
|---|---:|---:|---|
| close | 45 | 455151 | `f222602ac0afa25b7bf956a3eb89330fdfe050f3666b522a9fdfda20954a5e41` |
| default | 66 | 394858 | `8e988b9ab121d9023c3bc6175310b4c7fc8a98f36cf8d262b54ea4b581dccc8e` |
| far | 108 | 363547 | `7a9661f2feaad501f51f599136df9a748ca43bc24750f1fe84a45f5505e70355` |

## Causal attempt record

- `bbcf975e`: HARNESS failure `1634a88ae3c48bb7bdfec83e1ee8a62fd21e5d6137c8c59b341a4e1fdd3d40ac`;
  the page-context result referenced undeclared `player` and `separation` locals.
- `53922e94`: the process completed, but original-resolution review rejected duplicate applied
  close/default zoom `45,45,66` (`9d344831…`); the requested values had not modeled the camera owner.
- `a5096562`: runtime evidence proved the product camera's `45` minimum still collapsed the first
  two requests (`06bec7dc…`).
- `3590acf9`: the regression modeled the real owner boundary and the runtime itself proved
  `45,66,108`; PASS.

Every rerun followed a material harness/contract change. No unchanged failure was repeated.

## Bound evidence

Committed under
`design/program/roadmap/evidence/h1/row3-pq019a-presentation/capsule-continuation/`:

- the three accepted PNGs;
- `manifest.json` with seed, route, source identity, NDC, authored admission and applied zooms;
- `fast-gate.json`;
- `latest-run-result.json`;
- `consumed-claim.json` for claim `7584-0f021eaf85838a532440c0a8`.

Broker candidate digest:
`530315c2db88bb92502e6f602bd1e4d690a30ef137aa2e88be514da3e509d992`.
The seed was applied through the visible New Game input and verified as `state.meta.seed`.

## Focused checks

- `node --test test/pq019a-capsule-capture-repair.test.mjs
  test/pq019a-capsule-presentation-h1-manifest.test.mjs` — PASS, 10/10.
- `npm run check:pq019a:facility-embodiment` — PASS in the broker fast gate.
- `npm run check:sim:compare` — PASS, hash-equal, in the broker fast gate.
- `node --check scripts/capture-pq019a-acceptance.mjs` — PASS.
- `node scripts/check-program-docs.mjs` — PASS before evidence promotion.

## Honest scope

This closes the missing H1 capsule pixels only. It is not Electron parity, performance, physical
controller, accessibility, or a human art-quality verdict. PQ-019's complete route, H2 verdict, H3
matched performance, alias cleanup and parent promotion remain open.
