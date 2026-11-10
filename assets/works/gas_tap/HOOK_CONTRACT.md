# Gas tap — hook / identity contract (Cycle 02)

Root: `SF_WORKS_GAS_TAP_V1` (Blender Z-up works scale; glTF export is Y-up).
Candidate: `assets/ships/parts/works/place_works_gas_tap.glb`
SHA-256: `8DA1D98DAFE6EF475FF94C0F47E320C90128756BFB215CE7F362C8C52AF8AA60`

Axes below are **authoring / Blender Z-up**. After glTF Y-up export, world +Z (stem/face/hood) becomes glTF +Y.

| Hook | Empty | Child meshes | Pivot (wu) | Local axis | Motion |
|---|---|---|---|---|---|
| `valve_wheel` | empty, socket | `LOD{n}_valve_wheel` | hub `(0.52, 0.08, 0.80)` | local +Z = stem (world +Z) | spins about local +Z when the tap is active |
| `gauge_needle` | empty, socket | `LOD{n}_gauge_needle` | face centre `(0.56, −0.54, 0.761)` | local +Z = face normal (world +Z) | rotates in the face plane; rest pose points +Y (12 o’clock) |
| `lamp` | empty, socket | `LOD{n}_lamp` | glass `(0.94, 0.58, 0.96)` | local +Z = hood axis (world +Z) | emissive slot only; hood remains with emission off |

Mechanics:

- Handwheel rim/spokes/hub sit on the stem, coaxial with the globe body and yoke. Wheel clears the yoke.
- Needle is inside the case, over the cream face, under the glass ring; rotation must not leave the bezel.
- Lamp glass is recessed in the hood on the hat top return. One lamp only; it is not the site identity.
- In the combined GLB, each hook has the authored nonzero glTF translation and all three LOD children carry the same inverse counter-translation, so animation stays on the visible component.

Evidence: `evidence/cycle_002/hooks_identity.png`. Cycle 01 hooks still at `evidence/cycle_001/hooks_identity.png`.
Wiring: **not this unit.** Source candidate only.
