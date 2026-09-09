# Massline Core — material and shape audit (Cycle 10)

Identity `SF_WORKS_MASSLINE_CORE_V1`. Packet `PQ-131.02`. State `accepted`.
Whole-asset G1/G2/G4: KEEP. Disposition: `keep`.

## Shape grammar

Cycle 10 carries a wide raised square load frame, four rooted corner cases, a round open bore,
separated channels, a restrained nested race, a south service hatch, and a north hooded lamp.
The work race is lower and narrower than Cycle 09. LOD1 reallocates circular band detail into a
four-sided throat and larger asymmetric cues so the site camera keeps the claimed-rock read.

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

`allSupportedViewZonesClassified`: true (three independent original-resolution KEEP reviews).

## Portable material wiring

- Base color is not emissive.
- A separate black-except-lens emissive atlas drives only the recessed lamp lens.
- Packed ORM is bound twice as required by glTF: ORM.R -> occlusionTexture and
  ORM.G/B -> metallicRoughnessTexture.

## Construction sequence

1. Tapered dark liner, real lip, open through, true inner wall.
2. Continuous U-channel collar, cavity +Z, four cardinal lap straps.
3. Square deck (round bore) + folded angle skirt + corner pads on the rock.
4. Nested dark inner bearing race (ring_spin) in a rebate.
5. One hatch on the +X deck, one hooded lamp on the +Y frame.

Every visible part has a load path into the liner or the skirt. No occupancy fins.
