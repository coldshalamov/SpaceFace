# Surface derrick — material and shape audit (Cycle 04)

Candidate `B35007A82902BFC57017950E2A7BB4C8221984D3E090229A507BCCEFFB6F492A` · root `SF_WORKS_DERRICK_V1` · disposition `review_pending`.

Cycle 01/02/03 art is retained: planted shoes, open I-beam A-frames, crown portal,
open well, offset winch/cable path, grated deck and ladder, hollow lamp hoods and exposed
anchor plates. Cycle 04 changes only the final exported hierarchy: functional empties retain
their authored pivots, child meshes are pivot-local, and collision retains authored bounds.

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
| Lamps | Socket + hollow tilted casting + recessed lens | Dark hood/mouth readable at 120 px before warm glass | works_top / edge |

Unresolved blockout risk: grate bars are rectangular stock; a later cycle may add checker-plate
nosing if reviewers call the deck a comb.

## Material allocation

Dark painted structure, worn bare interfaces, heat/oil winch, dry grating, restrained works-orange
*edge wear* (no yellow-black shoe tape), greasy cable, warm recessed lenses. Rover yellow is absent.

Maps are mesh-derived AO / tangent normal / pointiness curvature, composited into authored
2048² (LOD0) basecolor / normal / ORM. Unique non-overlapping UV0. No kit textures.

## LOD

LOD0 7072 / 12000. LOD1 1304 / 3000.
LOD2 896 / 900. Four materially separated shoe corners, open shaft marker, A-planform,
drum/sheave path, platform, and both lamps survive. Hidden faces evaluated per LOD only.

## Remaining visual risk (honest)

- Site register (~19 px/cell, straight down) still flattens three-cell height; the four exposed
  anchor plates must remain visually separate around the dark collar hole.
- I-beam webs may alias at 120 px.
- Independent G1/G2/G4 review has not run.
