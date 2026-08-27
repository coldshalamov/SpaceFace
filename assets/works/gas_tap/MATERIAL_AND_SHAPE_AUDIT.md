# Gas tap Cycle 01 — material and shape audit

**State:** `design_candidate`. **Gate scope:** component / evidence_ready. Whole-asset G1/G2/G4 **open**.
**Candidate:** `place_works_gas_tap.glb` `4ED4D79DE48BAB98E70F30B6CDA94498357AD48817CAF21FCC813F81DC220724`

## Shape-grammar audit (supported cameras)

| Form | Primitive origin | Manufactured profile | Verdict |
|---|---|---|---|
| Backplate | box | Hat-section web + return flanges + clamp pads/throats + stand feet at z=0 | Keep. Edge still shows wall standoff. |
| Globe valve | lofted rings | Flange–neck–bulb–neck–flange along X; bonnet and yoke on +Z | Keep. Not a tank, not a hydrant barrel. |
| Handwheel | swept C-rim + oriented spokes + hub | Rim/spokes/hub/stem; glove gap over yoke | Keep after Cycle 01 correction (world-origin spoke rotation was the floating failure). |
| Gauge | turned case + open bezel + face + glass + needle | Needle inside case | Keep. Bezel no longer caps the face. |
| Hose | oriented-ring loft | Short sagging run with unions and saddle | Keep. Dashed axis-X rings were the second floating failure. |
| Lance | cylinder + packed gland | Short occupancy, x ≤ 1.14 | Keep. |
| Lamp | hood loft + recessed glass | Hooded, not a halo | Keep; small at 120 px. |

Cycle 01 correction (once): spoke boxes were authored in world space then rotated about the object origin at 0, so they flew across the pad. Rebuilt as oriented world verts. Hose rings were parallel YZ slices and read as dashes; rebuilt as tangent-oriented loft. Gauge bezel was capped and hid the face; cap removed.

## Clay vs textured

`works_top_clay.png` still reads clamp-bar + wheel + offset gauge + +X tap without textures.
`works_edge.png` / clay show plate off the rock wall.

## Forbidden reads

Not a turret, hydrant, medical tank, glowing icon, or box-with-a-wheel in the Cycle 01 top/edge stills. Site register (~20 px) is a dark lump with a gold spec — identity is weak there; that is remaining cycle risk, not a rewrite of the envelope.

## Material allocation

Painted plate / bare valve-wheel steel / restrained brass / rubber hose / dry face / glass / hooded lamp.
No Rover yellow. Atlas 1024² unique UV0 per mesh remapped to role tiles.

`allSupportedViewZonesClassified`: false.
