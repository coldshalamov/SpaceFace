# Helios Hub Environment Visual Family V3

**Packet:** `PROFESSIONAL-HELIOS-HUB-VISUAL-V6-CODEX-001`
**Status:** isolated candidates only — no live promote, no acceptance claim
**Quality floor:** SF-K0 Borrowed Time craft bar (continuous masslines, 1024 PBR, bevel law, LOD merge)
**Rejected predecessor:** `PROFESSIONAL-HELIOS-HUB-VISUAL-V5-GROK-001` (four-arm cylinder hub / stacked gate / ico rocks)

## Family identity

Helios core world: optimistic precision infrastructure — warm ivory shells, graphite mechanical guts,
restrained cyan identity for navigation readability, amber for functional bay/hazard markers only.
Material zones must read **without emissive**. Space stays dark; no greeble soup.

| Token | Role | RGB target |
|---|---|---|
| Material_Hull | Ivory ceramic station skin | 196,184,164 |
| Material_Mechanical | Graphite structure / clamps | ~26,29,33 |
| Material_Accent | Cyan identity + optional nav | restrained cyan |
| Material_Warm | Bay lips / hazard / claims | restrained amber |
| Material_Glass | Hab windows / operator blisters | smoked cool glass |
| Material_Rock | Hero rock geology + strata/ore | cool slate + oxide |

## Assets

| id | live promote target (future only) | role |
|---|---|---|
| helios_hub_station | place_station_trade_hub | asymmetric orbital-port hub |
| helios_gate | place_gate_jump_ring | continuous-spar gate landmark |
| helios_rock_a/b/c | place_asteroid_rock_a/b/c | geological hero rocks |
| helios_support_gantry | place_lane_beacon | modular support |
| helios_support_dock_arm | place_station_billboard | modular support |
| helios_nav_spire | place_nav_buoy | nav landmark |

## Rebuild

```text
"C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe" --background --python tools/blender/build_m4_helios_hub_v3.py --
node tools/art/finalize_m4_helios_hub_v3_candidate.mjs
```

## Isolation

Authoring under `assets/ships/m4_helios_hub_v3/**` only. Does **not** touch live parts/release/manifests.
Scoped lock: `assets/ships/m4_helios_hub_v3/authoring.__lock` (released on exit).
No acceptance claim. Macro cycle counts never self-pass.
