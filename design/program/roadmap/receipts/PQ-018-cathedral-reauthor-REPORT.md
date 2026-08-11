<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-018
leafId: PQ-018.cathedral-reauthor
acceptance: focused_green
disposition: PASS
candidateCommit: PENDING_COMMIT
-->

# PQ-018 leaf — Wreck Cathedral hull/rupture re-author

```yaml
packet: PQ-018
dispatchUnit: PQ-018.cathedral-reauthor
lifecycleClaim: implemented
acceptanceClaim: focused_green
disposition: PASS
productionState: integration_candidate
exactFinalVisualBinding: false
routeEvidenceClaimed: false
performanceEvidenceClaimed: false
wholeAssetG1G2G4Claimed: false
```

## Verdict

PASS for the offline implementation unit. The live Wreck Cathedral source/release candidate was
re-authored away from the art-verdict REVISE baseline (`f335935f…` / `dc5510f…` / blend `1bc08169…`)
toward capital-scale manufactured hull shells, rooted rupture, and multi-zone material allocation,
while preserving place identity, two-half envelope, 72×58 m fly-through clearance, LOD order,
sockets/markers, coordinate reservation, and collision/component proxies.

This unit does **not** claim whole-asset G1/G2/G4 KEEP or Browser/Electron route acceptance. Those
belong to `PQ-018.cathedral-reauthor-h1` and `PQ-018.cathedral-reauthor-review`.

## Exact artifact identity

| Artifact | SHA-256 | Bytes |
|---|---|---:|
| Source `assets/ships/parts/places/place_landmark_wreck_cathedral.glb` | `7c2f3fcd82235b8a44463320b83d3ee18d377049fe63995d8ebf7b896733ee0e` | 18,890,576 |
| Release `assets/ships/release/parts/places/place_landmark_wreck_cathedral.glb` | `32094bcd6df7671e9e2d93ae491a6aab33aa1ca9bd2a32cc3548cb7532eedcca` | 7,563,260 |
| Blend `assets/ships/parts/blender/place_landmark_wreck_cathedral.blend` | `e76227e8762092072fb963b898eba592a1c2e39caf8c8860dcb43868cc3c40b7` | 13,693,850 |

REVISE baseline (superseded): source `f335935f…`, release `dc5510f…`, blend `1bc08169…`.

## Construction and material repair (implementation)

Against the art verdict repair direction:

1. **G1/G2 direction — hull shells with section/thickness.** Casemate banks keep layered hull mass
   plus fore/aft plate-section lips; rib-to-rib outer cladding plates with stringers make the primary
   outer silhouette manufactured shell rather than open bar cage; hangar cavity remains open for
   fly-through.
2. **G1/G2 direction — rooted rupture.** Break shards use I-section members with bulkhead root plates
   and torn armor flaps; additional mid-break members densify the rupture without invading the
   72×58 m clearance probe (75 samples / 0 hits).
3. **G4 direction — material zones.** Eight semantic materials retained with distinct roles:
   hull dielectric, scorched armor, Concord blue accent, mechanical frame, warm exposed alloy,
   copper conduit, cold emergency emissive, Marker amber emissive. ORM/normal maps remain authored
   per role (not a single clay response).

LOD triangles: **166944 / 68684 / 18024** (strictly reducing). 8 materials / 26 textures / 8 draw
groups per LOD. Release: meshopt + 26/26 KTX2; contract nodes and marker transforms preserved.

## Structural and contract evidence

| Check | Result |
|---|---|
| `node --test test/pq018-wreck-cathedral.test.mjs test/pq018-wreck-cathedral-admission.test.mjs` | **16/16 pass** |
| `npm run check:graphics:asset-receipts` | PASS (suite; Cathedral not in rock/hull receipt set, no stale Cathedral mismatch) |
| `npm run check:asset-reachability` | PASS (Cathedral place remains reachable) |
| `node scripts/check-pq018-coordinate-reservation.mjs` | PASS (placement/envelope not relocated) |
| Fly-through clearance probe | PASS (75/0 hits) |
| Source vs REVISE baseline hash | Changed (required) |
| Release vs REVISE baseline hash | Changed (required) |

Focused admission test freezes the new source hash and asserts release preserves markers, materials,
LOD order, and transform contracts on the real shipped GLBs.

## Residual / not claimed here

1. `PQ-018.cathedral-reauthor-h1` — Browser/Electron exact-candidate capture under production lighting.
2. `PQ-018.cathedral-reauthor-review` — causal whole-asset G1/G2/G4 KEEP|REVISE on that capture.
3. Known residual author notes (iteration log): simplified bow wedges; engine bells still frustum-based;
   hangar retains intentional framed openings inside the cladding envelope.

## Authoring provenance

- Deterministic builder: `assets/ships/parts/revamp-evidence/place_landmark_wreck_cathedral/author_wreck_cathedral.py`
- `BUILD_SEED = 18082027`
- Iteration log: `assets/ships/parts/revamp-evidence/place_landmark_wreck_cathedral/ITERATION_LOG.md`
- Release: `node scripts/build-sg04-release-assets.mjs --no-clean --only place_landmark_wreck_cathedral`
  (18.89 MB → 7.56 MB)
