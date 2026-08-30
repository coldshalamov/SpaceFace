# Cycle 83 material-truth preflight (PQ-131.01 rover)

Tier B hero. Supported cameras: `works_top` (LOD0), `works_edge` (LOD0), `works_site` (LOD1).

Cycle 82 reviewed `REVISE / KEEP / KEEP`. Its top-camera defect is occlusion, not missing form or material: the scar-steel axial housing reaches above the vertical dark drum, hiding the face and hub while leaving only dark side nubs.

Cycle 83 changes one transform family on LOD0: raise `BitDrum`, `BitHub`, and `BitTooth_*` together by 0.08 wu so the round dark face sits visibly above the housing from the supported top camera. Their X/Y planform, size, dark drum/teeth material, quiet non-emissive hub, boom, body, value hierarchy, and LOD1/2 bytes remain frozen.

`componentReferenceDecision`: `not_needed`. The failure is a measured object-over-object occlusion in the exact player camera.

No KEEP is claimed here. Whole-asset gates stay open until Cycle 83’s exact hashes receive independent top, edge, and whole-asset dispositions.

## Visible-zone register

| Zone | Disposition | Views | Bill |
|---|---|---|---|
| LOD0 cutter drum/hub/teeth Z transform | billed | top, edge | Raise the existing assembly above the housing so its face and hub own the top view. |
| LOD0 cutter planform/materials | retained_reviewed | top, edge | Cycle 82 dark face, silhouette teeth, and quiet hub unchanged. |
| Boom, body, tracks, hopper, cab, livery | retained_reviewed | top, edge, site | No changes. |
| LOD1/2 whole asset | retained_reviewed | site | Exact Cycle 80 hashes required. |
