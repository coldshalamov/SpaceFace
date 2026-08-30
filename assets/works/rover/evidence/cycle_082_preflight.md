# Cycle 82 material-truth preflight (PQ-131.01 rover)

Tier B hero. Supported cameras: `works_top` (LOD0), `works_edge` (LOD0), `works_site` (LOD1).
Working scene: `tools/blender/build_works_rover_mtx.py`. Live route remains on the last promoted authored release.

Cycle 81 reviewed `REVISE / KEEP / KEEP`. Its top-camera veto was narrow and load-bearing: the cutter’s dark drum merged into the boom while six bright steel tooth pixels read as a spark ring. Cycle 82 changes only the LOD0 working face:

- enlarge the dark cutter face from 0.20 to 0.23 wu and move it slightly inboard so it stays inside the frozen envelope;
- assign drum and teeth a dedicated dark forged-steel atlas role so the toothed silhouette owns the tip;
- reduce the cool-steel hub from 0.09 to 0.07 wu and remove LOD0 bit emission;
- preserve the accepted Cycle 81 boom root/arm/spine, glass/hopper/scar value ladder, tracks, cab, hopper, livery, and all LOD1/2 geometry/atlas bytes.

`componentReferenceDecision`: `not_needed`. The top review named an exact screen-space material/silhouette hierarchy defect; another reference search would not change the fix.

Frozen identity: envelope 1.87 × 1.76 × 0.99 wu ±5%, 13 hooks, safety yellow remains minority paint, no steel hopper lip/walls, no boom cap, no yellow arm. The exact Cycle 80 LOD1 and LOD2 hashes must be restored after every build.

No KEEP is claimed here. G1/G2/G4 remain open until original-resolution Cycle 82 top, edge, and site stills receive independent hash-bound dispositions.

## Visible-zone register

| Zone | Disposition | Views | Dominates | Bill |
|---|---|---|---|---|
| LOD0 cutter drum and teeth | billed | top, edge | working-end silhouette | Larger dark forged-steel face with six dark silhouette teeth. No bright dot ring. |
| LOD0 cutter hub | billed | top, edge | tool center | Small cool-steel hub, non-emissive and subordinate to the drum face. |
| LOD0 boom/value hierarchy | retained_reviewed | top, edge | working side/body | Cycle 81 rooted narrow scar-steel boom and close-camera value ladder unchanged. |
| Tracks, hopper, cab, livery | retained_reviewed | all | dominant whole-asset zones | No geometry or material change. They remain inside final whole-asset review. |
| LOD1/2 whole asset | retained_reviewed | site | site silhouette/material hierarchy | Exact Cycle 80 bytes required; site KEEP remains valid only while the hashes match. |
