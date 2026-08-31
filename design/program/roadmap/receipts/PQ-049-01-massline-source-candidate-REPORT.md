<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-049
leafId: PQ-049.01
acceptance: unproven
disposition: PASS
candidateCommit: 2c8c3e4ffec535945f11c37026cc8d83ae24c59f
-->

# PQ-049.01 — Massline source-candidate checkpoint

```yaml
packet: PQ-049
dispatchUnit: PQ-049.01
candidateCommit: 2c8c3e4ffec535945f11c37026cc8d83ae24c59f
recoveredFrom: d38e05e79b60102af4968e12bdb4153ba5cde5de
lifecycleClaim: implemented
acceptanceClaim: unproven
disposition: PASS
productionState: surfaced_candidate
releaseOrRuntimeChanged: false
independentReview: pending
wholeAssetG1G2G4: evidence_ready
```

## Exact source

The candidate is the asset-local Cycle 29–36 progression at
`assets/ships/massline_express_liner_v1/`. Its Cycle 36 source GLB hashes are:

- LOD0: `AAF714ABF24EF5F7B92AE47818C9CEF2C0512065F405AE9A4BFF0E2D43E1AFEB`
- LOD1: `7FBB3B272962C17D07396CBB90A7594C111CD621431B7955F4AD796A0780158E`
- LOD2: `B201060C52819F9F0B2A9416A8FE4915E41D19D2263BFE32EF76E221D141CA50`

The checkpoint preserves that source and its authored evidence, including the
stepped civic pressure body, passenger/drive/dock/service/tether design work,
and the asset-local builder. It deliberately changes no release manifest,
render package, runtime map, or traffic selection.

## Focused evidence

- The exact three source GLBs passed `tools/foundry/validate_foundry_glb.mjs`
  as a variant set.
- `node --test test/pq048-passenger-liner-service.test.mjs` passed 4/4.
- The source import was whitespace-clean before its focused commit.
- `npm run check:baseline` completed 12/14 green. The two pre-existing,
  unrelated failures were `vfx-techniques` (an unlisted soft-card construction
  in `src/render/startupGpuResidency.js`) and `pq020-ceres-topology`
  (structural-cost digest mismatch). Neither path is changed by this source
  checkpoint.

## Remaining promotion boundary

This receipt does not accept the whole asset. PQ-049.02 through PQ-049.05
remain responsible for promotion/release records, render-package and express
mapping, and independent player-route/whole-asset acceptance before Massline
can be called live.
