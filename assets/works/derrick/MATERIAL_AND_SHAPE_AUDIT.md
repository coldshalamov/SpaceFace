# Surface derrick — material and shape audit (Cycle 05)

Full source `B35007A82902BFC57017950E2A7BB4C8221984D3E090229A507BCCEFFB6F492A` · selected runtime `920F476A02BC1CE887CD64372E0676040039DE4765D347CF234B20FC02CF5B02` · root `SF_WORKS_DERRICK_V1` · disposition `accepted`.

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

The rectangular grate bars remain honest stock. No checker-plate decoration was added because the
accepted work view reads the guarded service platform without it.

## Material allocation

Dark painted structure, worn bare interfaces, heat/oil winch, dry grating, restrained works-orange
*edge wear* (no yellow-black shoe tape), greasy cable, warm recessed lenses. Rover yellow is absent.

Maps are mesh-derived AO / tangent normal / pointiness curvature, composited into authored
2048² (LOD0) basecolor / normal / ORM. Unique non-overlapping UV0. No kit textures.

## LOD

LOD0 7072 / 12000. LOD1 1304 / 3000. LOD2 896 / 900 remains source/evidence-only; selected runtime,
release, and render package ship LOD0 + LOD1. LOD1 uses the deterministic, non-emissive
`grounded_headframe_value_roles_v1` basecolor/ORM profile. Four materially separated shoe corners,
open shaft marker, A-planform, drum/sheave path, platform, and both lamps survive.

## Route acceptance

- The first current route capture incorrectly compressed the standing asset to 0.678 scale; the
  second exposed that `Z.surface` left the authored depth behind the rock face. Current proof and
  permanent routes both preserve 1x authored scale, one-cell X footprint, base anchoring, and seat
  native min-z at `ROCK_FACE`.
- Final work/site captures are hash-bound in `evidence/cycle_005_master/EPOCH.json`.
- Luna max, Terra xhigh, and Clinepass Kimi K3 max returned KEEP with no open P0/P1. Individual
  shoes approach the site pixel limit, but the four-corner stance and tall A-frame remain coherent.
