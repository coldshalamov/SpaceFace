# Ironback chase C1 outbox import

## What this is

`ironback_c1_lod0.glb`, `ironback_c1_lod1.glb`, and `ironback_c1_lod2.glb` are an importable Ironback C1 chase-form candidate for the player barge. The live GLB is used only for root, sockets, and collision; render meshes are replaced with one continuous formed barge shell (blunt bow, cabin tub + thin canopy, hopper as a deck hole with rim, twin aft drive houses, four cutter arms). The three required stills were rendered with the repo chase camera at runtime Ironback scale (radius 17 → ~29.24 WU), Cycles CPU, 24 samples. Result is **REVISE vs Hitch**: gates clear (continuous shell, hopper/side wells as holes, no tube/paddle, no open cage), but Hitch still wins on formed-shell density and assembled inevitability at D=144; cutter arms still read thin at chase distance.

Source master tip at job start on this box: `fabb9e438e941a51b0d281f54f49a0e74cddcdda`  
vm-drop tip before this job: `e21e8b3986e51ef6130cdf67a77d2d0d0d36c5a6`  
Builder revision: `chase_form_v1`; Blender `Blender 4.5.14 LTS`.

Rebuild:

```sh
blender --background --python design/program/vm-drop/ironback-chase/build_ironback_chase_form.py -- \
  --out-dir design/program/vm-drop/ironback-chase --lods 0,1,2
blender --background --python design/program/vm-drop/ironback-chase/render_ironback_chase_cpu.py -- \
  --glb design/program/vm-drop/ironback-chase/ironback_c1_lod0.glb \
  --out design/program/vm-drop/ironback-chase --ship ironback --samples 24
```

## Exact future live paths

Only if a later owner-side review accepts this REVISE candidate, map the files as follows:

| Outbox file | Authoring/live destination |
|---|---|
| `ironback_c1_lod0.glb` | `assets/ships/fleet_player_bodies_v1/ironback/source/wholeships/ironback_production_v1_lod0.glb` and `assets/ships/parts/wholeships/ironback_production_v1.glb` |
| `ironback_c1_lod1.glb` | `assets/ships/fleet_player_bodies_v1/ironback/source/wholeships/ironback_production_v1_lod1.glb` and `assets/ships/parts/wholeships/ironback_production_v1_lod1.glb` |
| `ironback_c1_lod2.glb` | `assets/ships/fleet_player_bodies_v1/ironback/source/wholeships/ironback_production_v1_lod2.glb` and `assets/ships/parts/wholeships/ironback_production_v1_lod2.glb` |

Release mirrors would be `assets/ships/release/parts/wholeships/ironback_production_v1.glb` (+ lod1/lod2); regenerate manifests through the owner-side promotion workflow.

Authored size (LOD0): `16.61 × 6.087 × 2.926 m`. Runtime chase size: `29.24 × 10.715 × 5.152 WU`.

## What is not wired / freeze notes

Nothing is wired. No live GLB, manifest, render package, source file outside this folder, `src/`, `NOW.md`, `VM_LANES.md`, or shared builder was changed. Hitch/Kestrel, Hornet, and Drifter were read-only comparisons and remain frozen: Hitch/Kestrel LOD0 `e8317c66d9785463f398d535c4f358d2aba448354170178b1864531119b8099f`; Hornet LOD0 `0f81dce83e735c911412e1a815c918a349270e69e8de75ba5022f4a5211d5240`; Drifter LOD0 `3278b8ed1763d8dfbccf900a55b4a9cbbf63404fb8222a965bb5db89fc19bc7e`.
