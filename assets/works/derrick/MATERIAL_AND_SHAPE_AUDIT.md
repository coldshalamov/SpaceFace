# Surface derrick — material and shape audit (Cycle 01)

Candidate `DA4DC92FEFFE3A63642E790411AEAD0A96ECB175A5EB881CB016FE409D191372` · root `SF_WORKS_DERRICK_V1` · disposition `review_pending`.

## Shape grammar

| Form | Primitive origin | Manufactured result | Camera |
|---|---|---|---|
| A-frame legs | I-beam loft, not a box stick | Wide-flange section, splice/knee, shoes at z=0 | works_edge, clay |
| Cross-bracing | Angle iron / portal I | Every brace ends on a plate or strut | works_edge |
| Shaft collar | Annulus shell | Empty well, wall thickness | works_top |
| Drum | Cylinder + flanges + spindle | Sits in pillow blocks on a skid | works_top / edge |
| Cable | Coils + payout loft | Leaves at `cable_anchor` tangent, drops through the collar | works_edge |
| Platform | Frame + modelled grate bars | Guarded, kick plate, ladder from a shoe | works_top / edge |
| Lamps | Hood cone + socket + recessed lens | Fixtures exist with emission off | works_edge |

Unresolved blockout risk: grate bars are rectangular stock; a later cycle may add checker-plate
nosing if reviewers call the deck a comb.

## Material allocation

Dark painted structure, worn bare interfaces, heat/oil winch, dry grating, restrained works-orange
markings, greasy cable, warm recessed lenses. Rover yellow is absent.

Maps are mesh-derived AO / tangent normal / pointiness curvature, composited into authored
2048² (LOD0) basecolor / normal / ORM. Unique non-overlapping UV0. No kit textures.

## LOD

LOD0 7020 / 12000. LOD1 912 / 3000.
LOD2 640 / 900. A-frame, drum/cable tangent, platform, and both
lamps survive. Hidden faces evaluated per LOD only.

## Remaining visual risk (honest)

- Site register (~19 px/cell, straight down) flattens the three-cell height; identity then
  depends on the shoe diamond, collar hole, and A-planform.
- I-beam webs may alias at 120 px.
- Independent G1/G2/G4 review has not run.
