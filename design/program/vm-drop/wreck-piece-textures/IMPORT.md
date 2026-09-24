# Wreck-piece textures — outbox import

## What this is

Seven PQ-045.wreck-dressing aftermath pieces that exist as **untextured**
incubator source under `assets/incubator/wreck_aftermath_pack/source/`, rebuilt
here with real PBR maps (basecolor / normal / ORM), mesh merge by material
role, and LOD0/1/2. Blender **4.5.14 LTS**. Material-truth preflight copied
from the pack (`MATERIAL_TRUTH_PREFLIGHT.md`). Shared map pool under `maps/`.

### The seven names

| # | Asset id | Envelope (source sizeM, L×W×H m) | LOD0 tris | Materials | GLB SHA-256 |
|---|---|---|---|---|---|
| 1 | `wreck_ore_freighter_hopper` | 29.94 × 36.39 × 49.25 | 1012 | Material_Heat, Material_Hull, Material_Insulation, Material_Service, Material_Structural | `3f6b6b9b260bf129860725ceeb6e9efff2bf4f8a6b217ecbae98d02dc0990ed0` |
| 2 | `deb_ore_freighter_hopper_lid` | 31.56 × 16.38 × 22.2 | 260 | Material_Heat, Material_Hull, Material_Insulation, Material_Structural | `49e54dc66f42d5e1eb76e10e62461693bd3fef946e077c91e17f56ba48ce9592` |
| 3 | `wreck_liner_bow` | 68.95 × 26.22 × 24.43 | 724 | Material_Glass, Material_Heat, Material_Hull, Material_Insulation | `12d21d875423c5a37f3f18b57e3c31f7ac69bf4524bcc189bbf3c9c5eea3d279` |
| 4 | `wreck_liner_boatbay` | 53.8 × 23.15 × 15.87 | 436 | Material_Glass, Material_Heat, Material_Insulation, Material_Service, Material_Structural | `0679e7280103b95e0f5a6f55c2f62962c23998b44b72bc7ca2699cd8bd6e573a` |
| 5 | `deb_liner_hull_panel` | 28.7 × 9.4 × 13.52 | 228 | Material_Glass, Material_Hull, Material_Insulation, Material_Structural | `110661bf4f3d0c71118640c3508a4bbf15afa25bfa3070d7cfed3b6fcca36be1` |
| 6 | `aft_armor_slab` | 17.78 × 7.76 × 11.12 | 324 | Material_Armor, Material_Heat, Material_Insulation, Material_Structural | `ca55f4fa4f9619cce5709b8adc994a723bcc05cfa9721d20aafa8f2e2727c874` |
| 7 | `frag_grating_sheet` | 7.77 × 4.17 × 5.78 | 108 | Material_Insulation, Material_Structural | `45ea9cfb8b6e06e41ab2b5ec67d0200b9ad73e5420963587a70d70b4c9d7e1ed` |

Role → map stem: Hull→`wreck_painted_hull`, Armor→`wreck_armor_dark`,
Structural→`wreck_structural_alloy`, Insulation→`wreck_rupture_insulation`,
Service→`wreck_service_trunks`, Glass→`wreck_dead_glass`, Heat→`wreck_heat_affected`.

One scaled chase still per piece lives under `stills/<id>_play_chase.png`
(distances scaled for piece envelope; pose from `spaceface_chase_camera.py`).

Rebuild:

```sh
blender --background --factory-startup --python \
  design/program/vm-drop/wreck-piece-textures/build_wreck_piece_textures.py -- \
  --maps-root design/program/vm-drop/wreck-piece-textures/maps \
  --source-root assets/incubator/wreck_aftermath_pack/source \
  --authored-root design/program/vm-drop/wreck-piece-textures \
  --report design/program/vm-drop/wreck-piece-textures/build-report.json \
  --pieces-only
blender --background --factory-startup --python \
  design/program/vm-drop/wreck-piece-textures/render_piece_stills.py -- \
  --root design/program/vm-drop/wreck-piece-textures \
  --out design/program/vm-drop/wreck-piece-textures/stills
```

## Exact future live paths

Only if a later owner-side promotion accepts this outbox:

| Outbox file | Authoring destination (owner decides) |
|---|---|
| `wreck_ore_freighter_hopper.glb` | `assets/incubator/wreck_aftermath_pack/authored_down/wreck_ore_freighter_hopper.glb` |
| `deb_ore_freighter_hopper_lid.glb` | `assets/incubator/wreck_aftermath_pack/authored_down/deb_ore_freighter_hopper_lid.glb` |
| `wreck_liner_bow.glb` | `assets/incubator/wreck_aftermath_pack/authored_down/wreck_liner_bow.glb` |
| `wreck_liner_boatbay.glb` | `assets/incubator/wreck_aftermath_pack/authored_down/wreck_liner_boatbay.glb` |
| `deb_liner_hull_panel.glb` | `assets/incubator/wreck_aftermath_pack/authored_down/deb_liner_hull_panel.glb` |
| `aft_armor_slab.glb` | `assets/incubator/wreck_aftermath_pack/authored_down/aft_armor_slab.glb` |
| `frag_grating_sheet.glb` | `assets/incubator/wreck_aftermath_pack/authored_down/frag_grating_sheet.glb` |
| `maps/*.png` | `assets/incubator/wreck_aftermath_pack/maps/` (already present; reference copy) |
| `stills/*` | evidence / review only — not runtime |

Place compositions `place_ceres_bait_wreck` / `place_ceres_grave_shard` are **not**
in this drop (pieces-only). They remain a separate owner wiring step via
`tools/blender/author_ceres_wreck_dressing.py` if desired.

## What is not wired / freeze notes

Nothing is wired. `assets/incubator/wreck_aftermath_pack/` was **read only**.
No edit to manifests, `src/`, `NOW.md`, `VM_LANES.md`, live GLBs, places, or
shared builders. Maps in this folder are a self-contained copy for import.

