# Massline Core — material and shape audit (Cycle 01)

Identity `SF_WORKS_MASSLINE_CORE_V1`. Packet `PQ-131.02`. State `design_candidate`.
Whole-asset G1/G2/G4 remain open. Disposition: `review_pending`.

## Shape grammar

The procedural stand-in was a hex column plus an emissive torus. Cycle 01 replaces
that with an open refractory liner (booleaned throat, thick wall), a segmented
channel-section collar, four gusseted corner feet, a separable lug ring on a
bearing shelf, one hooded lamp, and one asymmetric service hatch.

Clay must read: dark hole, faceted collar, four corner pads. A torus / coin /
tire / halo read is a fail.

## Material bill (billed zones)

| Zone | Substrate | Finish | Forbidden |
|---|---|---|---|
| Collar / feet / hood | formed steel | dark alkyd dielectric | safety yellow, plastic |
| Races / bolts / lugs | machined steel | bare, worn | chrome, uniform edge wear |
| Well liner | dry refractory | dusty mineral | metal paint, glowing well |
| Hatch strap | primed steel | restrained warm oxide | yellow brick |
| Lamp lens | recessed dielectric | small emissive | emissive ring/paint |

`allSupportedViewZonesClassified`: false (independent reviewer has not confirmed).

## Construction sequence

1. Boolean-open liner with lip.
2. Eight (LOD0) channel courses with gaps.
3. Four corner pads, ribs, gussets, pretension ties.
4. Bearing shelf + separable spin ring with lugs.
5. Axis bolt bosses, service hatch, hooded lamp.

Every visible part has a load path into the liner or a foot. No occupancy fins.
