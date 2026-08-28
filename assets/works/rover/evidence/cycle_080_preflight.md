# Cycle 80 material-truth preflight (PQ-131.01 rover)

Tier B hero. Supported cameras: works_top (LOD0), works_edge (LOD0), works_site (LOD1).
Working scene: `tools/blender/build_works_rover_mtx.py`. Live route still `makeRover` until KEEP.

Cycle 79 rebuilt the value ladder on LOD0 and lit a mine into the site frame. Two causal
lies remain, and they are the same lie: **the site register has never seen LOD1**.

1. `works_site` was rendered from `rover_lod0.glb`. The packet puts LOD1 on that camera.
2. LOD1 was not authored for 19 px/cell. It was the LOD0 construction minus a few bolts,
   then `DECIMATE COLLAPSE` to 4,000 triangles. That is MTX-48's named fake: it closes the
   hopper and the roof pane and smears glass into hull. A collapsed copy is not a reduction.

This cycle does not retune LOD0 paint, the hopper well, or the mine set. It authors LOD1
(and LOD2) as site-scale meshes that keep openings and material breaks, and it shoots the
site still from that mesh.

`componentReferenceDecision`: `not_needed`. The defect is a modifier and a camera lie, not
a missing manufactured vocabulary.

Frozen identity: envelope 1.87 × 1.76 × 0.99 wu ±5%, 13 hooks, yellow as minority safety
paint, hopper interior untouched, no steel lip ring, no steel well walls, no boom cap.

G0–G7: hash-bound `evidence/cycle_080/`. Hitch frozen.
`allSupportedViewZonesClassified`: true. Independent original-resolution dispositions are
`works_top`: KEEP, `works_edge`: KEEP, and `works_site`: KEEP; no required defects remained.

## Visible-zone register (changed this cycle)

| Zone | Disposition | Views | Dominates | Bill |
|---|---|---|---|---|
| Track belt + crown (LOD1/2) | billed | works_site, works_top (pop) | site outline | Extruded rubber-composite stadium. LOD1 drops the 18 cross-cleats (they alias into sparkle at ~12 px of belt). Solid dark wall, not a paperclip, not a loaf with grouser noise. |
| Track outer lip (LOD1/2) | billed | works_site | site edge | Abraded steel link edge, outboard face only. Fewer, longer rails so a 1 px catch survives. Not a luminous ring. Not the hopper lip C77 banned. |
| Hopper well | retained_reviewed | all three | top + site hole | Cycle 78/79 cavity. LOD1 keeps floor + four walls + chamfers as real openings. No steel lip ring. No steel well walls. |
| Cab roof pane | billed | works_site, works_top | cab at site | Laminated glass in a through-cut slab. LOD1 keeps the aperture and the glass; drops the mullion (it splits a 2 px pane into noise). Not a painted square. Not merged into hull. |
| Cab brow / kick plates / rail | retained_reviewed | works_site | accent | `#ffd23f` at 46% value, five separated bolted plates. LOD1 keeps all five so the hue-separation floor still has ≥8 accent px. |
| Deck plate courses / hatch | billed | works_top only at LOD0 | no at site | Folded 3–4 mm steel. LOD1 drops the 0.01 wu steps; they do not occupy a pixel at 19 px/cell. Deck stays plate-band steel, below ground. |
| Boom arm + spine + bit | billed | all three | facing | Chevron weldment, mill-scale spine, sooted body, tool-steel tip. LOD1 keeps one spine rail with end returns, not four segments that collapse into a stripe. |
| Scar plate + breach | billed | works_edge_flank, works_site | no | Sooted rock guard. LOD1 keeps the plate and the punched breach (an opening). Drops petals/bolts. |
| Beacon cage | billed | works_site | no | Cage bars around a 1 px lamp are sparkle. LOD1 keeps the can and lens, drops the cage. Recessed emissive remains. |
| Glass vs hull / track vs steel / rubble vs deck | billed | works_site | material breaks | MTX-48. LOD1 does not join glass into hull, track into steel, or rubble into deck. Collapse-decimate is forbidden. |

LOD0 zones not listed stay `retained_reviewed` from cycle 79. They are still inside the
whole-asset visual veto. Do not treat a LOD1-only pass as a whole-asset G1/G2/G4 close.
