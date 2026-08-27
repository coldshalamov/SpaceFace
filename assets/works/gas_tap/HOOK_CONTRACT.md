# Gas tap — hook / identity contract (Cycle 01)

Root: `SF_WORKS_GAS_TAP_V1` (Blender Z-up works scale; glTF export is Y-up).
Candidate: `assets/ships/parts/works/place_works_gas_tap.glb`
SHA-256: `4ED4D79DE48BAB98E70F30B6CDA94498357AD48817CAF21FCC813F81DC220724`

Axes below are **authoring / Blender Z-up**. After glTF Y-up export, world +Z (stem/face/hood) becomes glTF +Y.

| Hook | Empty | Child meshes | Pivot (wu) | Local axis | Motion |
|---|---|---|---|---|---|
| `valve_wheel` | empty, socket | `LOD{n}_valve_wheel` | hub `(0.48, 0.10, 0.80)` | local +Z = stem (world +Z) | spins about local +Z when the tap is active |
| `gauge_needle` | empty, socket | `LOD{n}_gauge_needle` | face centre `(0.58, −0.52, 0.745)` | local +Z = face normal (world +Z) | rotates in the face plane; rest pose points +Y (12 o’clock) |
| `lamp` | empty, socket | `LOD{n}_lamp` | glass `(0.80, 0.58, 0.86)` | local +Z = hood axis (world +Z) | emissive slot only; hood remains with emission off |

Mechanics:

- Handwheel rim/spokes/hub sit on the stem with yoke clearance under the rim.
- Needle is inside the case, under the glass; rotation must not leave the bezel.
- Lamp glass is recessed in the hood.

Evidence: `evidence/cycle_001/hooks_identity.png`.
Wiring: **not this unit.** Source candidate only.
