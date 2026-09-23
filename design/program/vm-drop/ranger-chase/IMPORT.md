# Ranger chase C6 outbox import

## What this is

`ranger_c6_lod0.glb`, `ranger_c6_lod1.glb`, and `ranger_c6_lod2.glb` are an importable Ranger C6 candidate continued from PR 155 C5. C6 broadens and steps the assembled bow, increases the formed cheek gun-house volume, and adds broad interlocked dorsal armor courses for chase-readable skin. The three required stills were rendered at the repo chase camera with runtime Ranger scale (30.96 WU), Cycles CPU, 24 samples. Result is **REVISE vs Hitch**: the C5 remainder is materially improved, but Hitch still has the more inevitable formed-shell density at default chase distance.

Source master: `9f6c7b78f5f4505e283667757baa56f3a135b933`  
C5 candidate commit: `e9dc277ab081436b49da3336f28ccd0348749347` (PR branch tip inspected: `522d82937e572ffa75203f4e676f30a20b0f90e3`)  
Builder revision: `chase_form_v6a`; Blender `4.5.14 LTS`.

Rebuild from the C5 inputs by extracting that commit's three `assets/ships/fleet_player_bodies_v1/ranger/source/wholeships/ranger_production_v1_lod{0,1,2}.glb` files to temporary paths, then run:

```sh
blender --background --python design/program/vm-drop/ranger-chase/build_ranger_chase_form_c6.py -- \
  --source-lod0 /tmp/ranger_c5_lod0.glb \
  --source-lod1 /tmp/ranger_c5_lod1.glb \
  --source-lod2 /tmp/ranger_c5_lod2.glb \
  --out-dir design/program/vm-drop/ranger-chase --lods 0,1,2
blender --background --python design/program/vm-drop/ranger-chase/render_ranger_chase_cpu.py -- \
  --glb design/program/vm-drop/ranger-chase/ranger_c6_lod0.glb \
  --out design/program/vm-drop/ranger-chase --ship ranger --samples 24
```

## Exact future live paths

Only if a later owner-side review accepts this REVISE candidate, map the files as follows:

| Outbox file | Authoring/live destination |
|---|---|
| `ranger_c6_lod0.glb` | `assets/ships/fleet_player_bodies_v1/ranger/source/wholeships/ranger_production_v1_lod0.glb` and `assets/ships/parts/wholeships/ranger_production_v1.glb` |
| `ranger_c6_lod1.glb` | `assets/ships/fleet_player_bodies_v1/ranger/source/wholeships/ranger_production_v1_lod1.glb` and `assets/ships/parts/wholeships/ranger_production_v1_lod1.glb` |
| `ranger_c6_lod2.glb` | `assets/ships/fleet_player_bodies_v1/ranger/source/wholeships/ranger_production_v1_lod2.glb` and `assets/ships/parts/wholeships/ranger_production_v1_lod2.glb` |

The corresponding release mirrors would be `assets/ships/release/parts/wholeships/ranger_production_v1.glb`, `ranger_production_v1_lod1.glb`, and `ranger_production_v1_lod2.glb`; regenerate manifests/render packages through the owner-side promotion workflow rather than copying hashes by hand.

## What is not wired / freeze notes

Nothing is wired. No live GLB, manifest, render package, source file outside this folder, `src/`, `NOW.md`, `VM_LANES.md`, or shared builder was changed. Hitch/Kestrel, Hornet, and Drifter were read-only comparisons and remain frozen: Hitch/Kestrel LOD0 `e8317c66d9785463f398d535c4f358d2aba448354170178b1864531119b8099f`; Hornet LOD0 `0f81dce83e735c911412e1a815c918a349270e69e8de75ba5022f4a5211d5240`; Drifter LOD0 `3278b8ed1763d8dfbccf900a55b4a9cbbf63404fb8222a965bb5db89fc19bc7e`.
