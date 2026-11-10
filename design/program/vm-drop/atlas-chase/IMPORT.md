# Atlas chase C1 outbox import

## What this is

`atlas_c1_lod0.glb`, `atlas_c1_lod1.glb`, and `atlas_c1_lod2.glb` are an importable Atlas C1 chase-form candidate for the player bulk hauler. The live GLB is used only for root, sockets, and collision; render meshes are replaced with one continuous formed sea-enamel shell (blunt bow, bridge tub + thin canopy + raised house, cargo well as a deck hole with rim and three formed cargo pods, side wells, knuckle crane, raised aft house, four-engine transom). The three required stills were rendered with the repo chase camera at runtime Atlas scale (collisionRadius 30 → ~51.6 WU), Cycles CPU, 24 samples. Result is **REVISE vs Hitch**: gates clear (continuous shell, cargo/side/bridge wells as holes, no tube/paddle, no open cage), but Hitch still wins on formed-shell density and assembled inevitability at D=144; cargo-well depth and house/drive interlocking still read light next to Hitch.

Source master tip at job start on this box: `fabb9e438e941a51b0d281f54f49a0e74cddcdda`  
vm-drop tip before this job: `4a71f851a5352ee65ef6b5b0e997aa3bca661fdf`  
Builder revision: `chase_form_v1`; Blender `Blender 4.5.14 LTS`.

Rebuild:

```sh
blender --background --python design/program/vm-drop/atlas-chase/build_atlas_chase_form.py -- \
  --out-dir design/program/vm-drop/atlas-chase --lods 0,1,2
blender --background --python design/program/vm-drop/atlas-chase/render_atlas_chase_cpu.py -- \
  --glb design/program/vm-drop/atlas-chase/atlas_c1_lod0.glb \
  --out design/program/vm-drop/atlas-chase --ship atlas --samples 24
```

## Exact future live paths

Only if a later owner-side review accepts this REVISE candidate, map the files as follows:

| Outbox file | Authoring/live destination |
|---|---|
| `atlas_c1_lod0.glb` | `assets/ships/fleet_player_bodies_v1/atlas/source/wholeships/atlas_production_v1_lod0.glb` and `assets/ships/parts/wholeships/atlas_production_v1.glb` |
| `atlas_c1_lod1.glb` | `assets/ships/fleet_player_bodies_v1/atlas/source/wholeships/atlas_production_v1_lod1.glb` and `assets/ships/parts/wholeships/atlas_production_v1_lod1.glb` |
| `atlas_c1_lod2.glb` | `assets/ships/fleet_player_bodies_v1/atlas/source/wholeships/atlas_production_v1_lod2.glb` and `assets/ships/parts/wholeships/atlas_production_v1_lod2.glb` |

Release mirrors would be `assets/ships/release/parts/wholeships/atlas_production_v1.glb` (+ lod1/lod2); regenerate manifests through the owner-side promotion workflow.

Authored size (LOD0): `22.29 × 7.084 × 3.516 m`. Runtime chase size: `51.6 × 16.399 × 8.139 WU`.

## What is not wired / freeze notes

Nothing is wired. No live GLB, manifest, render package, source file outside this folder, `src/`, `NOW.md`, `VM_LANES.md`, or shared builder was changed. Hitch/Kestrel, Hornet, Drifter, Ranger, Ironback, and Bastion were read-only comparisons and remain frozen: Hitch/Kestrel LOD0 `e8317c66d9785463f398d535c4f358d2aba448354170178b1864531119b8099f`; Hornet LOD0 `0f81dce83e735c911412e1a815c918a349270e69e8de75ba5022f4a5211d5240`; Drifter LOD0 `3278b8ed1763d8dfbccf900a55b4a9cbbf63404fb8222a965bb5db89fc19bc7e`; Ranger LOD0 `015f7746308b97d8b0f525edad75cc72b9dbffa49b83133e9f15a755beff3254`; Ironback LOD0 `fa796ba42f73e345efdacdbca763780ea8a86e7ca3784c9445984116c7fc127b`; Bastion LOD0 `95e75b870c2b1259ccd3f4775d6f4994034870bf2cd19471e8e6585246e84079`.
