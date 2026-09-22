# Mule chase C1 outbox import

## What this is

`mule_c1_lod0.glb`, `mule_c1_lod1.glb`, and `mule_c1_lod2.glb` are an importable Mule C1 chase-form candidate for the player hauler (dedicated package, not a factory clone). The live GLB is used only for root, sockets, and collision; render meshes are replaced with one continuous formed freighter shell (dirty grey-green cargo box, forward raised bridge cab + tub/canopy, midship cargo well as a hole with rim and two stacked formed container rows, side wells as holes, compact knuckle crane, aft machine house, twin industrial ion drives at y=±0.95, rear-facing gun blister, return chevron). The three required stills were rendered with the repo chase camera at runtime Mule scale (collisionRadius 18 → ~30.96 WU), Cycles CPU, 24 samples. Result is **REVISE vs Hitch**: gates clear (continuous shell, cargo/side/bridge wells as holes, no tube/paddle, no open cage), but Hitch still wins on formed-shell density and assembled inevitability at D=144; cargo-well depth and container/drive interlocking still read light next to Hitch for a working T1 freighter.

Source master tip at job start on this box: `fabb9e438e941a51b0d281f54f49a0e74cddcdda`
vm-drop tip before this job: `0781f9de18efe16cba2975d1d329186fcf774e27`
Builder revision: `chase_form_v1`; Blender `Blender 4.5.14 LTS`.

Rebuild:

```sh
blender --background --python design/program/vm-drop/mule-chase/build_mule_chase_form.py -- \
  --out-dir design/program/vm-drop/mule-chase --lods 0,1,2
blender --background --python design/program/vm-drop/mule-chase/render_mule_chase_cpu.py -- \
  --glb design/program/vm-drop/mule-chase/mule_c1_lod0.glb \
  --out design/program/vm-drop/mule-chase --ship mule --samples 24
```

## Exact future live paths

Only if a later owner-side review accepts this REVISE candidate, map the files as follows:

| Outbox file | Authoring/live destination |
|---|---|
| `mule_c1_lod0.glb` | `assets/ships/fleet_player_bodies_v1/mule/source/wholeships/mule_production_v1_lod0.glb` and `assets/ships/parts/wholeships/mule_production_v1.glb` (dedicated package also mirrors under `assets/ships/mule_production_v1/` as owner decides) |
| `mule_c1_lod1.glb` | `assets/ships/fleet_player_bodies_v1/mule/source/wholeships/mule_production_v1_lod1.glb` and `assets/ships/parts/wholeships/mule_production_v1_lod1.glb` |
| `mule_c1_lod2.glb` | `assets/ships/fleet_player_bodies_v1/mule/source/wholeships/mule_production_v1_lod2.glb` and `assets/ships/parts/wholeships/mule_production_v1_lod2.glb` |

Release mirrors would be `assets/ships/release/parts/wholeships/mule_production_v1.glb` (+ lod1/lod2); regenerate manifests through the owner-side promotion workflow.

Authored size (LOD0): `16.76 × 5.504 × 3.154 m`. Runtime chase size: `30.96 × 10.1676 × 5.8268 WU`.

## What is not wired / freeze notes

Nothing is wired. No live GLB, manifest, render package, source file outside this folder, `src/`, `NOW.md`, `VM_LANES.md`, or shared builder was changed. Hitch/Kestrel, Hornet, Drifter, Ranger, Ironback, Bastion, Atlas, Warden, Colossus, Leviathan, and Pelican were read-only comparisons and remain frozen: Hitch/Kestrel LOD0 `e8317c66d9785463f398d535c4f358d2aba448354170178b1864531119b8099f`; Hornet LOD0 `0f81dce83e735c911412e1a815c918a349270e69e8de75ba5022f4a5211d5240`; Drifter LOD0 `3278b8ed1763d8dfbccf900a55b4a9cbbf63404fb8222a965bb5db89fc19bc7e`; Ranger LOD0 `015f7746308b97d8b0f525edad75cc72b9dbffa49b83133e9f15a755beff3254`; Ironback LOD0 `fa796ba42f73e345efdacdbca763780ea8a86e7ca3784c9445984116c7fc127b`; Bastion LOD0 `95e75b870c2b1259ccd3f4775d6f4994034870bf2cd19471e8e6585246e84079`; Atlas LOD0 `a8ed9a685fb1984bff8e8ba70d748a3dec1199293240baf8688f83266f32b0a7`; Warden LOD0 `db57f08cff986727ba18735b097f126a0a21c0937992349398732bea797d3b53`; Colossus LOD0 `9efde1840b00cacf1849ff77900ac3b3df9285635bac3426eb0f91897aa6536e`; Leviathan LOD0 `e9d0cf067bd4e2fbf80fb06fe6a0dfbb66f1c9828461a91cdbb08178839607e4`; Pelican LOD0 `c7d482e511993fce7be5cc87ac5c5ebd3d174379075e7d81644ff2f9656bdd8f`. Live Mule LOD0 left untouched: `9326f5c4a6a8adf53294ce4a905e0507d48e6ebc61ff17752c9330ad5f68ba70`.
