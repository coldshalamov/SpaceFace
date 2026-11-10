<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-022
leafId: PQ-022.gold-corridor-required-assets
acceptance: milestone_accepted
disposition: PASS
candidateCommit: 84d1b1c3fc80cc633a41e31adbc31861220c217d
-->

# PQ-022 — `gold-corridor-required-assets` leaf receipt

## Milestone upgrade — 2026-09-23

```yaml
packet: PQ-022
leafId: PQ-022.gold-corridor-required-assets
promotionUnit: PQ-022.promote-corridor-assets
promotionBase: 568d1358e518f595c064986b2ad3ca18fbfeb435
candidateCommit: 84d1b1c3fc80cc633a41e31adbc31861220c217d
lifecycleClaim: integrated
acceptanceClaim: milestone_accepted
disposition: PASS
requiredAssetCount: 82
boundAtReceipt: 80
remainingNamedGaps: 2 (wasp_production_v1_lod1, wasp_production_v1_lod2 — source-manifest
  identity rows only; dormant LOD family, unreachable at runtime, blocksMilestone:false)
gate: npm run check:pq022:corridor-assets
gateResult: PASS (2 named gaps, 0 unexpected, 0 stale)
assetMutations: none
gameplaySourceMutations: none
newHeadedEvidenceSpent: false
```

**PROMOTE the corridor required-asset set to `milestone_accepted` for PQ-025 consumption.** The
scoping report below defined the routed 82-asset set and its gate; every gap it named has since
closed except two dormant Wasp LOD source-manifest rows the same report already ruled
non-blocking (`lodFamily` has zero runtime consumers; LOD0 is live truth). This is evidence
reconciliation only; it reruns no accepted Browser/Electron cell and changes no runtime, visual,
asset, default-quality, or pool-capacity path.

| Accepted layer | Exact evidence | Git blob |
|---|---|---|
| Required-asset census, inclusion rule, gate | `PQ-022-gold-corridor-required-assets-SCOPING.md` | `fb46ebc6ae21c5da81c8928776b1c26a68535c1c` |
| Eleven exact corridor identities, headed Browser H1 | `evidence/h1/row7-pq022-asset-leaves/EVIDENCE.md` | `b21283d5f220a5ef297bdb7a8402158245549a50` |
| Corridor-assets H2 visual disposition | `PQ-022-corridor-assets-h2-disposition-REPORT.md` | `0ebde31c824524adc95563f51c3f0f6ec5b9cdb9` |
| Ceres geology rock A production leaf | `PQ-022-ceres-geology-rock-a-REPORT.md` | `a40f49b4e585f3d59460d7ce557d09e93acdbe5c` |
| Heist catcher/fence publish (closed 4 artifact gaps) | `PQ-022-heist-receivers-promote-REPORT.md` | `b80b7fc901eb6f2ecfb348e29aafb697d92658c7` |
| Claim relay collar — route_accepted | `PQ-022-exterior-relay-collar-REPORT.md` | `c299d1068d930dbcba08370f11b2c37a61ba0994` |
| Relay re-author Browser/Electron H1 | `PQ-022-relay-reauthor-h1-REPORT.md` | `9c067e8a3f38e116ab0be37d6f2e7865770adcc7` |
| Refinery re-author | `PQ-022-refinery-reauthor-REPORT.md` | `62e4116a70debcf9a741b9277cd8bb2d85338319` |
| Refinery re-author H1 | `PQ-022-refinery-reauthor-h1-REPORT.md` | `02462ad201898b811f2b5a88815bc9bbbcd8e020` |
| Billboard/buoy re-author | `PQ-022-billboard-buoy-reauthor-REPORT.md` | `9c8426af57e6c4e0da92db3ccf5ffa160e53b2de` |
| Billboard/buoy re-author H1 | `PQ-022-billboard-buoy-reauthor-h1-REPORT.md` | `afba33f29913ebef37770a42bcedb5c465058b95` |
| Re-author causal KEEP review | `PQ-022-reauthor-causal-review-2026-09-10.md` | `fdb8fb4fb5db791cf25f2b804cff69c8427280c6` |

## What changed in this unit

- `scripts/lib/pq022CorridorExpectedGaps.json`: deleted six stale allowlist entries the gate
  itself flagged — `place_claim_outpost_catcher`/`fence` source+release artifact rows (closed by
  `PQ-022.heist-receivers-promote`, files verified on disk and in both manifests) and
  `wasp_production_v1_lod1`/`lod2` release-manifest rows (since landed). The two remaining entries
  are the still-real, non-blocking source-manifest identity rows.
- Gate now: **PASS — 2 named gaps, 0 unexpected, 0 stale** (was FAIL on 6 stale entries).

## Scope discipline

No new asset, manifest row, runtime map, or check was added. The two named gaps are carried
exactly as the scoping report recommended: recorded, owned, non-blocking.
