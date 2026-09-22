# Leviathan chase C1 outbox import

## What this is

`leviathan_c1_lod0.glb`, `leviathan_c1_lod1.glb`, and `leviathan_c1_lod2.glb` are an importable Leviathan C1 chase-form candidate for the player flagship. The live GLB is used only for root, sockets, and collision; render meshes are replaced with one continuous formed dark flagship shell (blunt flagship bow, bridge tub + canopy, taller command island over a cut well, broadside battery wells with gun tubes, radiator wells with fin cassettes, lofted dorsal fins, triple bow guns, four-drive transom at y=±2.3 / ±0.85). The three required stills were rendered with the repo chase camera at runtime Leviathan scale (collisionRadius 45 → ~77.4 WU), Cycles CPU, 24 samples. Result is **REVISE vs Hitch**: gates clear (continuous shell, cockpit/battery/island/radiator wells as holes, no tube/paddle, no open cage), but Hitch still wins on formed-shell density and assembled inevitability at D=144; flagship massing still reads light/needle-like next to Hitch, and island/battery interlocking still undersells a flagship at chase distance.

Source master tip at job start on this box: `fabb9e438e941a51b0d281f54f49a0e74cddcdda`
vm-drop tip before this job: `9b0c4930a18d87dafc169df8ff6a2a45e5b7d0c8`
Builder revision: `chase_form_v1`; Blender `Blender 4.5.14 LTS`.

Rebuild:

```sh
blender --background --python design/program/vm-drop/leviathan-chase/build_leviathan_chase_form.py -- \
  --out-dir design/program/vm-drop/leviathan-chase --lods 0,1,2
blender --background --python design/program/vm-drop/leviathan-chase/render_leviathan_chase_cpu.py -- \
  --glb design/program/vm-drop/leviathan-chase/leviathan_c1_lod0.glb \
  --out design/program/vm-drop/leviathan-chase --ship leviathan --samples 24
```

## Exact future live paths

Only if a later owner-side review accepts this REVISE candidate, map the files as follows:

| Outbox file | Authoring/live destination |
|---|---|
| `leviathan_c1_lod0.glb` | `assets/ships/fleet_player_bodies_v1/leviathan/source/wholeships/leviathan_production_v1_lod0.glb` and `assets/ships/parts/wholeships/leviathan_production_v1.glb` |
| `leviathan_c1_lod1.glb` | `assets/ships/fleet_player_bodies_v1/leviathan/source/wholeships/leviathan_production_v1_lod1.glb` and `assets/ships/parts/wholeships/leviathan_production_v1_lod1.glb` |
| `leviathan_c1_lod2.glb` | `assets/ships/fleet_player_bodies_v1/leviathan/source/wholeships/leviathan_production_v1_lod2.glb` and `assets/ships/parts/wholeships/leviathan_production_v1_lod2.glb` |

Release mirrors would be `assets/ships/release/parts/wholeships/leviathan_production_v1.glb` (+ lod1/lod2); regenerate manifests through the owner-side promotion workflow.

Authored size (LOD0): `26.22 × 7.134 × 5.785 m`. Runtime chase size: `77.4 × 21.0605 × 17.077 WU`.

## What is not wired / freeze notes

Nothing is wired. No live GLB, manifest, render package, source file outside this folder, `src/`, `NOW.md`, `VM_LANES.md`, or shared builder was changed. Hitch/Kestrel, Hornet, Drifter, Ranger, Ironback, Bastion, Atlas, Warden, and Colossus were read-only comparisons and remain frozen: Hitch/Kestrel LOD0 `e8317c66d9785463f398d535c4f358d2aba448354170178b1864531119b8099f`; Hornet LOD0 `0f81dce83e735c911412e1a815c918a349270e69e8de75ba5022f4a5211d5240`; Drifter LOD0 `3278b8ed1763d8dfbccf900a55b4a9cbbf63404fb8222a965bb5db89fc19bc7e`; Ranger LOD0 `015f7746308b97d8b0f525edad75cc72b9dbffa49b83133e9f15a755beff3254`; Ironback LOD0 `fa796ba42f73e345efdacdbca763780ea8a86e7ca3784c9445984116c7fc127b`; Bastion LOD0 `95e75b870c2b1259ccd3f4775d6f4994034870bf2cd19471e8e6585246e84079`; Atlas LOD0 `a8ed9a685fb1984bff8e8ba70d748a3dec1199293240baf8688f83266f32b0a7`; Warden LOD0 `db57f08cff986727ba18735b097f126a0a21c0937992349398732bea797d3b53`; Colossus LOD0 `9efde1840b00cacf1849ff77900ac3b3df9285635bac3426eb0f91897aa6536e`.
