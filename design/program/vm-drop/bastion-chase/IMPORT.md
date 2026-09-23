# Bastion chase C1 outbox import

## What this is

`bastion_c1_lod0.glb`, `bastion_c1_lod1.glb`, and `bastion_c1_lod2.glb` are an importable Bastion C1 chase-form candidate for the player corvette. The live GLB is used only for root, sockets, and collision; render meshes are replaced with one continuous formed navy-grey shell (knife bow, canopy tub + thin canopy, command tower stack over a dorsal well, broadside casemate wells with gun tubes, twin aft war-drive houses). The three required stills were rendered with the repo chase camera at runtime Bastion scale (collisionRadius 22 → ~37.84 WU), Cycles CPU, 24 samples. Result is **REVISE vs Hitch**: gates clear (continuous shell, cockpit/casemate/tower wells as holes, no tube/paddle, no open cage), but Hitch still wins on formed-shell density and assembled inevitability at D=144; tower and casemate mass still read light next to Hitch.

Source master tip at job start on this box: `61b87cb0e6d729555c55eb246e235a8550d66672`  
vm-drop tip before this job: `238fbfe34393f2ce1b9e0bf9d274606ac74bca53`  
Builder revision: `chase_form_v1`; Blender `Blender 4.5.14 LTS`.

Rebuild:

```sh
blender --background --python design/program/vm-drop/bastion-chase/build_bastion_chase_form.py -- \
  --out-dir design/program/vm-drop/bastion-chase --lods 0,1,2
blender --background --python design/program/vm-drop/bastion-chase/render_bastion_chase_cpu.py -- \
  --glb design/program/vm-drop/bastion-chase/bastion_c1_lod0.glb \
  --out design/program/vm-drop/bastion-chase --ship bastion --samples 24
```

## Exact future live paths

Only if a later owner-side review accepts this REVISE candidate, map the files as follows:

| Outbox file | Authoring/live destination |
|---|---|
| `bastion_c1_lod0.glb` | `assets/ships/fleet_player_bodies_v1/bastion/source/wholeships/bastion_production_v1_lod0.glb` and `assets/ships/parts/wholeships/bastion_production_v1.glb` |
| `bastion_c1_lod1.glb` | `assets/ships/fleet_player_bodies_v1/bastion/source/wholeships/bastion_production_v1_lod1.glb` and `assets/ships/parts/wholeships/bastion_production_v1_lod1.glb` |
| `bastion_c1_lod2.glb` | `assets/ships/fleet_player_bodies_v1/bastion/source/wholeships/bastion_production_v1_lod2.glb` and `assets/ships/parts/wholeships/bastion_production_v1_lod2.glb` |

Release mirrors would be `assets/ships/release/parts/wholeships/bastion_production_v1.glb` (+ lod1/lod2); regenerate manifests through the owner-side promotion workflow.

Authored size (LOD0): `18.29 × 4.509 × 4.006 m`. Runtime chase size: `37.84 × 9.328 × 8.289 WU`.

## What is not wired / freeze notes

Nothing is wired. No live GLB, manifest, render package, source file outside this folder, `src/`, `NOW.md`, `VM_LANES.md`, or shared builder was changed. Hitch/Kestrel, Hornet, Drifter, Ranger, and Ironback were read-only comparisons and remain frozen: Hitch/Kestrel LOD0 `e8317c66d9785463f398d535c4f358d2aba448354170178b1864531119b8099f`; Hornet LOD0 `0f81dce83e735c911412e1a815c918a349270e69e8de75ba5022f4a5211d5240`; Drifter LOD0 `3278b8ed1763d8dfbccf900a55b4a9cbbf63404fb8222a965bb5db89fc19bc7e`; Ranger LOD0 `015f7746308b97d8b0f525edad75cc72b9dbffa49b83133e9f15a755beff3254`; Ironback LOD0 `fa796ba42f73e345efdacdbca763780ea8a86e7ca3784c9445984116c7fc127b`.
