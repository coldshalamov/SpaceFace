# Warden material-truth preflight (PQ-050.07)

Gunship. Dark gunmetal. Command tower, broadside casemates, three-drive transom.
Not Atlas, not Bastion, not Hitch.

## Frozen identity

- Role: player gunship (`ship_warden`, `SF_WARDEN_PRODUCTION_V1`)
- Envelope: length 20.0 m, half-width 2.5 m, height 1.2 m
- Forward +X, starboard +Y, up +Z
- Three drives at transom y = ±1.8 and 0.0
- Tower, broadsides, twin-front guns
- Same socket set as the factory family
- Hitch / Kestrel files are not in the write set

## Visible-zone register (supported cameras: 3/4, starboard, rear)

| Zone | Class | Fiction |
|---|---|---|
| Pressure hull | billed | Faceted gunship shell, not a barge or needle |
| Command tower | billed | House over a cut tub; framed glass, not a brick |
| Broadside casemates | billed | Cut wells with gun tubes, rims, interiors |
| Three drive bells | billed | Unboltable casings, ceramic collars, hollow throats |
| Bow gun houses | billed | Twin housings with barrels, not glowing disks |
| Radiator wells | billed | Fin cassettes in cut wells |
| RCS / sensors | billed | Boxed nozzles and a gimbal dish |
| Hitch / Kestrel | blocked | Other lane |

`allSupportedViewZonesClassified`: false until hash-bound review.

## Shape-grammar failure of the factory Warden

Factory reads as a lofted sausage with a tower box and parented guns.
Warden must read as a gunship: aggressive bow, wide casemate mid, tower, three-engine transom.

## Component reference decision

`not_needed` for whole-asset identity. Quality target is Hitch-plus manufacture.

## Working scene and cameras

- Builder: `tools/blender/build_warden_mtx.py --mtx-cycle=N`
- Candidate: `assets/ships/fleet_player_bodies_v1/warden/source/wholeships/warden_production_v1_lod{0,1,2}.glb`
- Do not promote unless clay is manufactured and the stills beat Hitch
