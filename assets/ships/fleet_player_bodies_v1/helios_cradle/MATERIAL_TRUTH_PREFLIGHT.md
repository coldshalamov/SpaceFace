# Helios cradle material-truth preflight (PQ-050.17)

Civilian miner / tug. 15 m, dirty pale cream, twin tail drives, two cutter
arms, open hopper well. Not Lark. Not Reach. Not Hitch.

## Frozen identity

- Role: `civilian_miner` / `SF_HELIOS_CRADLE_V1`
- Envelope: length 15 m, half-width 1.9 m, height 0.95 m
- Twin drives at (-6.2, ±1.2)
- Two cutter arms, hoppers
- Live factory sockets (half = 7.5)
- Hull triangles ≥ 800
- Hitch not in the write set

## Visible-zone register (supported three-quarter / starboard / rear)

| Zone | Class | Fiction |
|---|---|---|
| Pressure hull | billed | Rolled plate barge, hard chine, dirty dielectric cream |
| Cabin greenhouse | billed | Framed glass over cut tub, not a brick |
| Hopper well | billed | Open dump bay with yellow hazard lip and inner liner |
| Hopper tanks | billed | Formed pressure vessels in saddles |
| Cutter arms | billed | Saddle, boom, knuckle, carbide drum, hoses |
| Twin bells | billed | Hollow spun bottles, ceramic collar, no glow disk |
| Radiator houses | billed | Dorsal louvered boxes, dark faces |
| Keel / transom | billed | Armor plate, braces |
| RCS / sockets | billed | Factory RCS and gameplay empties |

`allSupportedViewZonesClassified`: pending reviewer confirmation.

## Shape-grammar failure

Factory loft + boxes + hopper brick + stick arms. Concept image is quality
target only (industrial well, manufactured arms, pale dirty paint). Remaster
keeps factory envelope and sockets.

## componentReferenceDecision

`not_needed` for C1. Whole-asset selected jpg is quality target, not identity.

## Working scene

`tools/blender/build_helios_cradle_mtx.py` →
`assets/ships/fleet_player_bodies_v1/helios_cradle/source/wholeships/`
