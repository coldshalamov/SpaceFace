# Extractor — material and shape audit (Cycle 01)

Candidate `938948CC0D946703E38C6E082CD2A8F96E3ACB38AA32C2C95683F00B6BB275F0` · root `SF_WORKS_EXTRACTOR_V1` · disposition `review_pending`.

## Shape grammar

| Form | Primitive origin | Manufactured result | Camera |
|---|---|---|---|
| Floor rails | C-channel loft, not a box beam | Load-bearing C section, open +X, pad feet at z=0 | works_top, clay |
| Crossmembers | Hat-beam loft | Rooted into rails with gussets | works_top |
| Drive case | 4-station loft with waist | Heat-stained gearbox, access cover, ochre lip | works_top / edge |
| Fins | Thin plates | Rooted into a header on the case, not occupancy wings | works_top |
| Mouth | Five-wall shell open +X | Dark well with ceramic rim teeth | works_top |
| Drum / yoke | Cylinder + lofted arms + bearing bosses | Aimable head under `head_face`, forward +X | works_top / edge |
| Belt | Ribbon + rollers + return + pulley | Negative space under belt; UV1 along +X | works_top / edge |
| Lamp | Cone hood + socket + recessed lens | Fixture exists with emission off | works_edge |

Unresolved blockout risk: rim teeth are still faceted blocks; a later cycle may loft a true
jaw profile if reviewers call the bite a stud ring.

## Material allocation

Dark painted structure, bare cutting/roller metal, heat-stained drive, dry ceramic liners,
rubber belt, one ochre accent, one warm recessed lens. Rover yellow is absent.

Maps are mesh-derived AO / tangent normal / pointiness curvature, composited into authored
1024² basecolor / normal / ORM. Unique non-overlapping UV0. No kit textures.

## LOD

LOD0 3580 / 8000. LOD1 1736 / 2000.
LOD2 564 / 600. Direction, conveyor, frame, and all three hooks
survive. Hidden faces evaluated per LOD only.

## Remaining visual risk (honest)

- Site register (~19 px/cell) may collapse the mouth into a dark rectangle; identity depends
  on the open +X silhouette and fin comb.
- Drum teeth may alias at 120 px.
- Independent G1/G2/G4 review has not run.
