# Surface derrick — material and shape audit (Cycle 02)

Candidate `DD5349314927145925C84D42E27776DF650CEBE999801416630752C6EEDE5C75` · root `SF_WORKS_DERRICK_V1` · disposition `review_pending`.

Cycle 01 edge construction is retained: planted shoes, I-beam web/flanges, splice plates,
crown portal, open well, offset grated deck and ladder. Cycle 02 removes A-plane rung fill,
offsets the winch, and routes the cable over a crown sheave into the empty shaft.

## Shape grammar

| Form | Primitive origin | Manufactured result | Camera |
|---|---|---|---|
| A-frame legs | I-beam loft, not a box stick | Wide-flange section, splice/knee, shoes at z=0 | works_edge, clay |
| A-bar / splice | One I-strut + web plates | Open A, no rung/X-grid fill | works_top, clay |
| Shaft collar | Annulus shell | Empty well, wall thickness, drum offset off the hole | works_top |
| Drum | Cylinder + flanges + spindle | Pillow blocks on a -X skid | works_top / edge |
| Head sheave | Grooved wheel in cheek plates on the crown | Cable turns from rise to drop | works_top / edge |
| Cable | Coils + rise loft + drop loft | Leaves `cable_anchor` tangent, over sheave, down the well | works_top |
| Platform | Frame + modelled grate bars | Guarded, offset +X, not a roof | works_top / edge |
| Lamps | Socket + tilted hood + recessed lens | Hood/mouth readable at 120 px, emission off | works_top / edge |

Unresolved blockout risk: grate bars are rectangular stock; a later cycle may add checker-plate
nosing if reviewers call the deck a comb.

## Material allocation

Dark painted structure, worn bare interfaces, heat/oil winch, dry grating, restrained works-orange
*edge wear* (no yellow-black shoe tape), greasy cable, warm recessed lenses. Rover yellow is absent.

Maps are mesh-derived AO / tangent normal / pointiness curvature, composited into authored
2048² (LOD0) basecolor / normal / ORM. Unique non-overlapping UV0. No kit textures.

## LOD

LOD0 6696 / 12000. LOD1 1232 / 3000.
LOD2 856 / 900. Four shoe corners, open shaft marker, A-planform,
drum/sheave path, platform, and both lamps survive. Hidden faces evaluated per LOD only.

## Remaining visual risk (honest)

- Site register (~19 px/cell, straight down) still flattens three-cell height; identity is the
  four-shoe diamond, the dark collar hole, and the head-frame mass — not a filled rounded square.
- I-beam webs may alias at 120 px.
- Independent G1/G2/G4 review has not run.
