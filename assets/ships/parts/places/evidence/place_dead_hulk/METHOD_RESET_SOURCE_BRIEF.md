# `place_dead_hulk` method-reset source checkpoint

**Status:** reviewed offline source and release checkpoint integrated; formally `blocked` at G5
runtime presentation, G6 live performance/LOD, and G7 independent art acceptance.

The prior iteration family added surface density to a weak symmetric blockout. The replacement is a
deterministic Blender-authored commercial carrier/drill-tender with one causal starboard/dorsal
rupture:

- one continuous shell, keel, surviving port longeron, and dorsal spine;
- a broad aft drive ring, central hold/load path, tapered forward shoulder, and command house;
- one 11.4 m rupture shared by the shell opening, severed starboard longeron, heat-affected lips,
  rooted bulkheads, nested skin/insulation/liner layers, and service trunks;
- three macro-consistent LOD groups built from the same functions;
- canonical root `place_dead_hulk` plus `SOCKET_Hazard_Core` and `SOCKET_Salvage_Core`.

The unsupported historical `HOOK_Emissive` marker is intentionally absent. Heat-affected surfaces
are ordinary cold materials; the place-asset hook contract does not accept a generic emissive hook.

## Durable artifacts

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `assets/ships/parts/blender/place_dead_hulk_authored.blend` | 5,010,011 | `E3187B52879050E16C82EBEB7B353102D5F4688BEF97A4A6EF44315CACB65609` |
| `assets/ships/parts/places/place_dead_hulk.glb` | 5,424,740 | `7D083B28B73550434C5C4783C85719C0C6C437AB68DFC9EAE4122CA1872D0327` |
| `assets/ships/release/parts/places/place_dead_hulk.glb` | 1,919,816 | `C2C421C6FF4B87CB92566560E080190F77AC14336B0FC43045BD2BE9D02BA185` |

The source has 30,316 triangles across authored LOD0/LOD1/LOD2 groups:
18,324 / 9,236 / 2,756. The release contains 21/21 KTX2 textures and 73
Meshopt-compressed buffer views.

## Rebuild and surface contract

The source builder is `tools/blender/remaster_opening_dead_hulk_v1.py`. It accepts explicit
`--maps-root`, `--output-blend`, `--output-glb`, and `--report` paths and never promotes output or
edits a manifest itself.

Each semantic role consumes authored base-color, OpenGL tangent normal, and packed ORM inputs from
`tools/art/build_opening_infrastructure_maps.py`:

| Semantic material | Map role |
|---|---|
| `Material_Hull` | `hulk_painted_hull` |
| `Material_Armor` | `hulk_armor_dark` |
| `Material_Structural` | `hulk_structural_alloy` |
| `Material_Insulation` | `hulk_rupture_insulation` |
| `Material_Service` | `hulk_service_trunks` |
| `Material_Glass` | `hulk_dead_glass` |
| `Material_Heat` | `hulk_heat_affected` |

Normal and ORM maps come from authored surface information, not from color inference. Source and
release publication is guarded by structural, texture-role, hash/byte parity, KTX2, Meshopt, and
transaction tests.

## Acceptance boundary

The offline source/release production slice is complete. The remaining gates require current
player-facing evidence:

- Browser and Electron normal-route presentation;
- live LOD transition, residency, and frame-cost evidence;
- the independent, nondelegable human-eye art verdict.

Those gates were not self-approved and were not run while `browser-gpu`, `performance-evidence`,
and `validation-broker` were owned by PQ-034.
