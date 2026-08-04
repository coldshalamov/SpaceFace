<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-022
leafId: PQ-022.refinery-reauthor
acceptance: focused_green
disposition: PASS
candidateCommit: 228f28d7
-->

# PQ-022 leaf — Ceres refinery visible-identity re-author

```yaml
packet: PQ-022
dispatchUnit: PQ-022.refinery-reauthor
candidateCommit: 228f28d7
lifecycleClaim: implemented
acceptanceClaim: focused_green
disposition: PASS
productionState: integration_candidate
exactFinalVisualBinding: true
routeEvidenceClaimed: false
performanceEvidenceClaimed: false
```

## Verdict

PASS for the implementation leaf. The canonical Ceres refinery now reads as a connected industrial
process crown: framed grizzly feed, rooted crusher/transfer machinery, differentiated separation,
thermal and heat-recovery stages, slurry and Chalk output systems, and a supported dock/control yoke.
The exact frozen identity, root, three sockets, collision proxy, envelope, runtime placement scale,
five semantic material groups, and three strictly decreasing LODs remain intact.

This receipt closes offline source/release implementation and exact-source G1/G2/G4 review. It does
not claim Browser/Electron route presentation, representative performance, or milestone promotion;
those remain separately dispatchable units.

## Exact artifact identity

| Artifact | SHA-256 | Bytes |
|---|---|---:|
| Admitted technical candidate and mirror | `49d6a50f24fdbb01a29d64f944a6171dd281f1b1800e0d4e045411b69b4538ed` | 23,088,208 |
| Authored Blender source | `5af14fcf50cb738f17414dd8c4d76576facbd1ac11a7b582cd98d949dab1bf6c` | 4,836,089 |
| Canonical promoted source | `9faf59a697a9faafbf18f3c74c6abc27b7fc38e0ec3ffe3ea803396f46365d88` | 23,088,680 |
| Canonical KTX2/Meshopt release | `3b673f761f8e47c32ffa0563b933ad099380d2df75629dca927481cec4c8b7c0` | 5,725,268 |
| Parts manifest after promotion | `8bc37fce5ae05eb7c9315ad5d19066d3c13fe1904115dde82292a71d1593149a` | 116,185 |
| Release manifest after promotion | `26ce452ff40b673bc2b7fd6c8cd5f56d3653f70730dd2f835b18598cbf23bbcc` | 52,392 |

The source differs from the candidate only by the guarded lifecycle promotion metadata; the exact
23,054,260-byte BIN payload is preserved. The optimized release contains all 15 textures as KTX2
with mipmaps and 66 Meshopt-compressed buffer views.

## Structural and validator evidence

- LOD0/LOD1/LOD2 contain **138,840 / 31,684 / 568 triangles** across five semantic PBR groups.
- The one broadphase collision primitive remains **44 triangles** with frozen geometry digest
  `f6ec9016...bb7d`.
- Root `SF_PLACE_STATION_REFINERY_ROOT`, `SOCKET_Structure_Core`, `SOCKET_Emissive`, and
  `SOCKET_Dock_Approach` match the frozen transforms and the **98 × 63.85 × 55.5 m** envelope.
- Foundry validation: **PASS**, 0 failures / 0 warnings; exact report `218c3a54...bddd`.
- Khronos glTF validation: **0 errors / 0 warnings / 0 infos / 0 hints**; exact report
  `a05841da...950e`.
- Blender export gate: **PASS**, 0 errors. Five recorded hard-edge annotation diagnostics are
  non-failing because the generator supplies visible bevel geometry and closed topology.
- Candidate admission passed against the complete hash-bound producer, validator, render, and
  lifecycle bundle.

## Exact-source visual disposition

The final 1600×900 process, feed, side, top, and emissive-off images bind candidate
`49d6a50f...38ed` through render manifest `5eb1422a...051c` and promotion review
`c26f34d1...fa67d`. The evidence-bound solo-integrator disposition is:

- **G1 KEEP:** the feed, unequal separator stages, thermal wing, split output, and dock form a
  readable process silhouette without labels.
- **G2 KEEP:** load frames, gussets, bearings, flanges, pipe shoes, kiln supports, valves, conveyor,
  bin walls, and dock truss make the construction accountable.
- **G4 KEEP:** coated structure, directional process alloy, localized thermal oxide, matte Chalk
  ceramic, and recessed glass now have role-specific response; the rejected cross-role quilt/check
  pattern is absent and dark interfaces remain readable.
- **Emissive KEEP:** the complete process remains legible with emission disabled.

The first candidate was rejected for primitive repetition and weak material truth. The second
repaired construction but retained a shared quilt/check response. The admitted candidate corrects
that causal defect; no technical receipt was substituted for visual judgment.

## Focused checks

| Gate | Result |
|---|---|
| Final Foundry / Khronos / Blender validator refresh | PASS / 0 issues / PASS |
| Final candidate admission CLI | PASS |
| Candidate contract suite | 14/15 before the measured report digest repair; failed cell then covered by the green admission CLI |
| Promotion contract suite | 6/7 before the same digest repair; failed lifecycle cell then **1/1 PASS** |
| `test/gltf-material-contract.test.mjs` | **3/3 PASS** after explicit/implicit clearcoat-default normalization |
| Disposable-root promotion dry-run | PASS; 22.02 MiB source → 5.46 MiB release |
| `npm run check:pq022:corridor-assets` | PASS; all 9 retained gaps are named and none stale |
| `npm run check:graphics:asset-receipts` | PASS |
| `npm run check:asset-reachability` | PASS; 53/53 runtime references present |

The first release dry-run failed on a material-contract digest. A diagnostic replay proved the only
semantic difference was omitted versus explicit zero for
`KHR_materials_clearcoat.clearcoatRoughnessFactor`. The shared guard now normalizes that Khronos
default while retaining exact checks for nonzero factors, texture identity, transforms, samplers,
extensions, and primitive/material bindings. No live file changed until the corrected dry-run was
green and the five-file transaction was applied once.

## Validation budget and residual chain

- **Browser launches:** 0.
- **Electron launches:** 0.
- **Live promotion attempts:** 1, PASS.
- **Focused live asset gates:** 3 commands, each run once, all PASS.

Residual units are explicit rather than inherited:

1. `PQ-022.refinery-reauthor-h1` owns any future targeted Browser/Electron route capture.
2. `PQ-022.refinery-reauthor-review` owns causal review of that route evidence.
3. `PQ-022.h3-performance` owns representative matched corridor performance.
