# Helios Hub Environment Visual Family

**Packet:** `M4-HELIOS-HUB-ENV-VISUAL-FAMILY-001`  
**Status:** candidates — promote to live place IDs only after finalize validators pass  
**Quality floor:** SF-K0 Borrowed Time craft bar (continuous masslines, 1024 PBR, bevel law, LOD merge)

## Family identity

Helios core world: optimistic precision infrastructure — warm ivory shells, graphite mechanical guts,
restrained cyan identity/emissives for navigation readability, amber for functional bay/hazard markers only.
Space stays dark; emissives carry the night; no greeble soup.

| Token | Role | RGB target |
|---|---|---|
| Material_Hull | Ivory ceramic station skin | 196,184,164 |
| Material_Mechanical | Graphite structure / clamps | ~26,29,33 |
| Material_Accent | Cyan identity + nav emissives | restrained cyan |
| Material_Warm | Bay lips / hazard / claims | restrained amber |
| Material_Glass | Hab windows / operator blisters | smoked cool glass |
| Material_Rock | Hero rock family geology | cool slate + oxide |

## Assets

| id | live promote target | role |
|---|---|---|
| helios_hub_station | place_station_trade_hub | hub focal silhouette |
| helios_gate | place_gate_jump_ring | gate landmark |
| helios_rock_a/b/c | place_asteroid_rock_a/b/c | hero rock family |
| helios_support_gantry | place_lane_beacon | modular support |
| helios_support_dock_arm | place_station_billboard | modular support |
| helios_nav_spire | place_nav_buoy | nav landmark |

## Rebuild

```text
"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" --background --python tools/blender/build_m4_helios_hub_family.py --
node tools/art/finalize_m4_helios_hub_candidate.mjs
```

## Isolation

Authoring under `assets/ships/m4_helios_hub/**`. Live promote is an explicit finalize/promote step
that acquires `release.__lock` and rebuilds only the named place IDs.
