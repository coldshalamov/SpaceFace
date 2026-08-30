# Cycle 84 material-truth preflight (PQ-131.01 rover)

Tier B hero. Supported cameras: `works_top` (LOD0), `works_edge` (LOD0), `works_site` (LOD1).
Working scene: `tools/blender/build_works_rover_mtx.py`. Live route remains on the last promoted authored release.

Cycle 83 reviewed `KEEP / REVISE / KEEP`. Its edge-camera veto is narrow and load-bearing: the raised working face is only 0.09 wu thick, so it reads as a coin/lid from the flank, while its tool-steel hub compresses to a white spark. Cycle 84 changes only the LOD0 working head:

- retain the accepted 0.244 wu outer diameter but make one 0.18 wu-deep vertical-axis drum that overlaps the axial housing;
- replace six detached one-pixel tooth boxes with a single twelve-sided alternating-radius scalloped drum silhouette;
- lower the drum center from `tz + 0.08` to `tz + 0.04`, preserving a top face above the housing while giving the flank a rooted cylindrical side band;
- replace the bright tool-steel hub with a 0.05 wu-diameter, 0.024 wu-proud non-emissive scar-steel boss;
- preserve the accepted Cycle 83 boom, body, glass/hopper/scar value ladder, tracks, cab, hopper, livery, and all LOD1/2 geometry/atlas bytes.

`componentReferenceDecision`: `not_needed`. Exact top and edge evidence already isolates a thickness/material hierarchy defect; another reference search cannot change the required mechanical construction.

Frozen identity: envelope 1.87 × 1.76 × 0.99 wu ±5%, 13 hooks, safety yellow remains minority paint, no steel hopper lip/walls, no boom cap, no yellow arm. The exact Cycle 80 LOD1 and LOD2 hashes must be restored after every build.

No KEEP is claimed here. G1/G2/G4 remain open until original-resolution Cycle 84 top, edge, and site stills receive independent hash-bound dispositions.

## Visible-zone register

| Zone | Disposition | Views | Dominates | Bill |
|---|---|---|---|---|
| LOD0 cutter drum | billed | top, edge | working-end silhouette | Thick dark scalloped cylinder overlapping its axial housing; round face above, barrel depth at flank. |
| LOD0 cutter hub | billed | top, edge | tool center | Small scar-steel boss differentiated by relief rather than a bright value spike. |
| LOD0 boom/value hierarchy | retained_reviewed | top, edge | working side/body | Cycle 83 rooted narrow boom and close-camera value ladder unchanged. |
| Tracks, hopper, cab, livery | retained_reviewed | all | dominant whole-asset zones | No geometry or material change. They remain inside final whole-asset review. |
| LOD1/2 whole asset | retained_reviewed | site | site silhouette/material hierarchy | Exact Cycle 80 bytes required; site KEEP remains valid only while the hashes match. |
