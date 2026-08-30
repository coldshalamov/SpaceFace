# Massline Core — material and shape audit (Cycle 10)

Identity `SF_WORKS_MASSLINE_CORE_V1`. Packet `PQ-131.02`. State `design_candidate`.
Whole-asset G1/G2/G4 remain open. Disposition: `review_pending` / `revise`.

## Shape grammar

Cycle 09's square-flange wellhead is the frozen identity for this revision:
a square wellhead flange with a round bore; continuous U-channel opening +Z;
folded square angle skirt; corner pads; nested dark race; and one side-mounted
hooded lamp with a visible cavity. Cycle 09 made the square anchor frame the
first load-bearing read, subordinated the circular collar, and strengthened
far-LOD asymmetry. Cycle 10 broadens and deepens the U-channel into three
separated physical bands, enlarges the hooded lamp and mechanical hatch,
and keeps LOD1/LOD2 silhouettes materially distinct while preserving the
Blender emissive diagnostic's glTF V orientation;
identity, hooks, envelope, and camera contract stay fixed.

Clay must read: dark circular hole in a squat square machine, U-channel trench,
skirt thickness, one hooded fixture. A washer / manhole / gear / tire / nut /
compass-rose / plus-dot / generic slab is a fail.

## Material bill (billed zones)

| Zone | Substrate | Finish | Forbidden |
|---|---|---|---|
| Collar / deck / skirt / hood / arm | formed steel | dark alkyd dielectric, edge wear | safety yellow, plastic, uniform AO dirt |
| Race / bolts / hatch strap | machined steel | restrained dark bare steel | chrome, coin highlight |
| Well liner | dry refractory | dark mineral, dusty throat | brown disk/plug, metal paint, glowing well |
| Hatch cover / latch | primed steel | dark structural plate with a small restrained oxide latch | yellow brick, orange strip |
| Lamp lens | recessed dielectric | small warm emissive | beacon, painted tab, emissive ring |

`allSupportedViewZonesClassified`: false (independent reviewer has not confirmed).

## Portable material wiring

- Base color is not emissive.
- A separate black-except-lens emissive atlas drives only the recessed lamp lens.
- Packed ORM is bound twice as required by glTF: ORM.R -> occlusionTexture and
  ORM.G/B -> metallicRoughnessTexture.

## Construction sequence

1. Tapered dark liner, real lip, open through, true inner wall.
2. Three-piece recessed U-channel (inner flange / dark floor / outer flange),
   cavity +Z, with four near-LOD cardinal lap straps and a far-LOD square anchor frame.
3. Square deck (round bore) + raised folded angle load wall + inner anchor frame + corner pads on the rock.
4. Narrow nested dark inner bearing race (ring_spin) with a retained far-LOD shoulder.
5. One enlarged layered mechanical hatch on the +X deck, one hooded lamp with a returned
   lip on the +Y frame; only its recessed lens emits.

Every visible part has a load path into the liner or the skirt. No occupancy fins.
