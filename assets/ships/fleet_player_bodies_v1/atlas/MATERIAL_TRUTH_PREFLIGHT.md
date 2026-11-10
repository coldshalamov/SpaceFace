# Atlas material-truth preflight (PQ-050.06)

Bulk hauler. Olive workboat paint. High forecastle bridge, three dorsal cargo tanks
in a cut well, four-drive transom bank. Not Bastion, not Ironback, not Hitch.

## Frozen identity

- Role: player bulk hauler (`ship_atlas`, `SF_ATLAS_PRODUCTION_V1`)
- Envelope: length 22.0 m, half-width 2.4 m, height 1.45 m
- Forward +X, starboard +Y, up +Z
- Four drives at transom y = ±1.7 and ±0.7
- Three cargo pods, high bridge
- Same socket set as the factory family
- Hitch / Kestrel files are not in the write set

## Visible-zone register (supported cameras: 3/4, starboard, rear)

| Zone | Class | Fiction |
|---|---|---|
| Pressure hull / barge shell | billed | Rolled plate workboat hull, hard chine, flat cargo deck |
| Dorsal cargo trench | billed | Skin-breaking well; tanks sit in saddles, not on a closed lid |
| Three cargo tanks | billed | Formed pressure vessels, straps, end domes, saddle frames |
| Forecastle / high bridge | billed | House over a cut tub; framed greenhouse, not a glass brick |
| Four drive bells | billed | Unboltable casings, ceramic collars, hollow throats, vanes |
| Side radiator wells | billed | Fin cassettes in cut wells |
| Walkway / rails | billed | Thin deck plate and stanchions |
| Cargo crane | billed | Knuckle boom for pot-handling, not mining cutter heads |
| RCS / sensors | billed | Boxed nozzles and a gimbal dish |
| Keel / collision / sockets | retained_reviewed | Gameplay identity frozen |
| Hitch / Kestrel | blocked | Other lane |

`allSupportedViewZonesClassified`: false until hash-bound review.

## Shape-grammar failure of the factory Atlas

Factory and prior fleet builders read as a lofted sausage with parented boxes.
Atlas must read as a barge: blunt bow, wide cargo mid, raised house, four-engine
transom. Clay that still looks like stacked primitives keeps the leaf open.

## Component reference decision

`not_needed` for whole-asset identity. Quality target is Hitch-plus manufacture
plus the selected Atlas wholeship construction still (tanks, house, wear) — not
a copy of its mining cutter arms.

## Working scene and cameras

- Builder: `tools/blender/build_atlas_mtx.py --mtx-cycle=N`
- Candidate: `assets/ships/fleet_player_bodies_v1/atlas/source/wholeships/atlas_production_v1_lod{0,1,2}.glb`
- Supported stills: three-quarter, starboard, rear from the exported LOD0 GLB
- Do not promote unless clay is manufactured and the stills beat Hitch
