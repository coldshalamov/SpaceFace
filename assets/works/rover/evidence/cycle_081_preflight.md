# Cycle 81 material-truth preflight (PQ-131.01 rover)

Tier B hero. Supported cameras: `works_top` (LOD0), `works_edge` (LOD0), `works_site` (LOD1).
Working scene: `tools/blender/build_works_rover_mtx.py`. Live route already loads the authored release and fails closed if it is absent.

Cycle 80's independent result is split by camera: LOD0 top `REVISE`, LOD0 edge `REVISE`, LOD1 site `KEEP`. The site mesh, hopper opening, track planform, livery plates, cab aperture, camera, and mine set are frozen. Cycle 81 repairs only the two causal close-camera failures:

1. The boom was a chevron-covered rectangular plank with a five-segment bright barcode. It becomes a rooted scar-steel housing, tapered weldment, one load spine, and one hydraulic ram.
2. The axial bit ended in a 6–8 px spark. LOD0 gets a dark vertical cutter drum with a tool-steel hub and six macro teeth so its working face reads from the top camera; LOD1/2 keep the compact site-scale head.
3. Close-camera glass, hopper liner, and scar steel receive LOD0-only value/roughness separation. Track rubber, deck plate, yellow minority, and all LOD1/2 atlas values stay frozen.

`componentReferenceDecision`: `not_needed`. This is a diagnosed construction/value correction to an existing manufactured assembly, not a missing vocabulary search.

Frozen identity: envelope 1.87 × 1.76 × 0.99 wu ±5%, 13 hooks, safety yellow remains minority paint, hopper geometry untouched, no steel lip ring, no steel well walls, no boom cap, no yellow arm.

No KEEP is claimed here. G1/G2/G4 remain open until original-resolution Cycle 81 top, edge, and site stills receive independent hash-bound dispositions.

## Visible-zone register

| Zone | Disposition | Views | Dominates | Bill |
|---|---|---|---|---|
| LOD0 boom root/arm/spine | billed | top, edge | working-side silhouette | Rooted pivot housing, one tapered scar-steel weldment, one machined load spine, one ram. No chevron bar or decorative segmentation. |
| LOD0 cutter housing/drum/teeth | billed | top, edge | tool identity | Dark housing and drum with a tool-steel hub and six readable teeth in plan. Tool face, not spark. |
| LOD0 glass response | billed | top | cab identity | Existing through-cut laminated pane, lower roughness and its own dark value band. Geometry unchanged. |
| LOD0 hopper liner value | billed | top | hopper opening | Existing floor/walls/chamfers, raised above rubber while remaining below deck. No new lip or wall material. |
| LOD0 scar steel value | billed | top, edge | cab and boom body | Neutral worn steel above rubber and below deck; not yellow, tan, or emissive. |
| LOD1/2 whole asset | retained_reviewed | site | site silhouette/material hierarchy | Cycle 80 geometry and atlas values frozen; the independent site KEEP remains the target, not an inherited Cycle 81 verdict. |
| Hopper geometry, tracks, cab aperture, livery plates | retained_reviewed | all | dominant retained zones | No form changes. They remain inside the whole-asset veto at final review. |
