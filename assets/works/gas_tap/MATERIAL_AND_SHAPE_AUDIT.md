# Gas tap Cycle 02 — material and shape audit

**State:** `design_candidate`. **Gate scope:** component / evidence_ready. Whole-asset G1/G2/G4 **open**.
**Candidate:** `place_works_gas_tap.glb` `8DA1D98DAFE6EF475FF94C0F47E320C90128756BFB215CE7F362C8C52AF8AA60`

Cycle 01 stills remain frozen under `evidence/cycle_001/`. Cycle 02 stills and diagnostics live under `evidence/cycle_002/`.

## Shape-grammar audit (supported cameras)

| Form | Primitive origin | Manufactured profile | Verdict |
|---|---|---|---|
| Backplate | hat-section | Web + top/bottom returns + Y-end legs. Darker alkyd so it is a clamp bar, not a grooved/cell-colored slab | Keep. Four corner blocks and top-face bolts read from above. |
| Saddle clamps | boxes + hex | Four corner pads, throats, standoff posts, hex bolts, feet at z=0 | Keep at every LOD, including LOD2. Longest mass. |
| Globe valve | lofted rings | Flange–neck–bulb–neck–flange along X; saddle into the plate; bonnet and yoke coaxial with the wheel | Keep. Stem is on the valve axis (Cycle 01 offset was the unrooted failure). |
| Handwheel | swept C-rim + 4 spokes + hub | Rim/spokes/hub/stem; glove gap over yoke | Keep Cycle 01 four-spoke identity. |
| Gauge | turned case + stepped bezel + cream face | Needle inside case on a brass boss; glass is a thin recessed ring, not a dark cap | Keep. Cream disc replaces the gold torus around a black hole. |
| Hose | oriented-ring loft | Short sagging run, unions, saddle, armor rings at LOD0 | Keep. |
| Lance | cylinder + packed hex gland | Occupancy to x = 1.16 through a top-open pocket | Keep after Cycle 02 correction (wall roof was hiding the tap). |
| Lamp | hood loft + recessed glass | Hooded, rooted on the hat top return | Keep; small at 120 px; not the site identity. |

Cycle 02 correction (once): the works-top camera could not see the lance because the evidence wall's roof covered X > 1.08. Cut a top-open pocket so the tap visibly enters the rock.

Export correction: Blender's deferred matrix evaluation had serialized all three hook pivots at the asset origin, and removing imported LOD empties too early doubled two child counter-transforms. The builder now evaluates before parenting and reparents every LOD mesh before deleting temporary hooks; the combined GLB carries the authored pivot plus the same matching counter-translation on all three LOD children.

## Clay vs textured

`works_top_clay.png` still reads clamp-bar + four-spoke wheel + offset gauge + +X tap without textures.
`works_edge.png` / clay show plate off the rock wall and the lance in the pocket.
`works_site.png` at 19 px/cell keeps the dark bar, steel circle and cream spec on the +X wall.

## Forbidden reads

Not a turret, hydrant, medical tank, glowing icon, or box-with-a-wheel in the Cycle 02 top/edge stills. Site register keeps wheel/gauge asymmetry without outlines, enlargement, labels or emission.

## Material allocation

Painted plate / bare valve-wheel steel / restrained brass / rubber hose / dry cream face / glass ring / hooded lamp.
No Rover yellow. Atlas 1024² unique UV0 per mesh remapped to role tiles.

`allSupportedViewZonesClassified`: false.
