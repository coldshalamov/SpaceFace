# Massline Core — material and shape audit (Cycle 06)

Identity `SF_WORKS_MASSLINE_CORE_V1`. Packet `PQ-131.02`. State `design_candidate`.
Whole-asset G1/G2/G4 remain open. Disposition: `review_pending` / `revise`.

## Shape grammar

Cycle 05's square-flange wellhead is the frozen identity for this revision:
a square wellhead flange with a round bore; continuous U-channel opening +Z;
folded square angle skirt; corner pads; nested dark race; and one side-mounted
hooded lamp with a visible cavity. Cycle 06 changes section depth/width and
far-LOD feature geometry only; identity, hooks, envelope, and camera contract stay fixed.

Clay must read: dark circular hole in a squat square machine, U-channel trench,
skirt thickness, one hooded fixture. A washer / manhole / gear / tire / nut /
compass-rose / plus-dot / generic slab is a fail.

## Material bill (billed zones)

| Zone | Substrate | Finish | Forbidden |
|---|---|---|---|
| Collar / deck / skirt / hood / arm | formed steel | dark alkyd dielectric, edge wear | safety yellow, plastic, uniform AO dirt |
| Race / bolts / hatch strap | machined steel | restrained dark bare steel | chrome, coin highlight |
| Well liner | dry refractory | dark mineral, dusty throat | brown disk/plug, metal paint, glowing well |
| Hatch cover | primed steel | restrained warm oxide | yellow brick |
| Lamp lens | recessed dielectric | small warm emissive | beacon, painted tab, emissive ring |

`allSupportedViewZonesClassified`: false (independent reviewer has not confirmed).

## Portable material wiring

- Base color is not emissive.
- A separate black-except-lens emissive atlas drives only the recessed lamp lens.
- Packed ORM is bound twice as required by glTF: ORM.R -> occlusionTexture and
  ORM.G/B -> metallicRoughnessTexture.

## Construction sequence

1. Tapered dark liner, real lip, open through, true inner wall.
2. Continuous deep U-channel collar, cavity +Z, four cardinal lap straps.
3. Square deck (round bore) + deep folded angle skirt + corner pads on the rock.
4. Nested dark inner bearing race (ring_spin) with a retained far-LOD shoulder.
5. One layered hatch on the +X deck, one enlarged hooded lamp on the +Y frame.

Every visible part has a load path into the liner or the skirt. No occupancy fins.
