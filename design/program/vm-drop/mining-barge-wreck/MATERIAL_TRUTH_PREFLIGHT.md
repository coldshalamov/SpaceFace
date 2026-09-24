<!-- LIFETIME: ACTIVE_CANDIDATE -->
# Material-truth preflight — mining-barge-wreck (vm-drop)

```yaml
packet: vm-drop/mining-barge-wreck
preparedAt: 2026-09-21
tier: C place dressing / hero wreck (grouped manufactured families allowed)
scope: one primary wreck GLB authored in-folder from fiction §5 mining barge (not in wreck_aftermath_pack)
componentReferenceDecision: not_needed
allSupportedViewZonesClassified: false   # G1/G2/G4 remain open; this is preflight only
```

Authority: `.grok/skills/spaceface-blender-material-truth/SKILL.md`, fiction
`design/fiction/THE_LONG_AFTERMATH.md` §5, pack note in
`assets/incubator/wreck_aftermath_pack/INTEGRATION.md` (mining barge ✗ not built).

## Fiction-development agreement

The mining barge is an asteroid extraction platform. Class identity that must survive
dismemberment: an **enormous cutter head on a boom**, **ore bins**, and **working-face
asymmetry**. Cause of death: **boom root sheared**; the cutter head is the heavy thing that
stayed. Grammar is freighter-variant (truss / boom-root break), not monocoque lance-cut or
pressure petal.

This outbox delivers that missing family as one primary GLB. It does **not** edit the
incubator pack, shared builders, live GLBs, or runtime wiring.

## Material bill (grouped manufactured families — Tier C)

| Material | Fiction substance | Manufacture / finish | Wear logic | Forbidden reads |
|---|---|---|---|---|
| `wrk_paint_barge_rust` | Industrial barge shell paint | Rolled plate, dielectric rust-brown | Scorch and chalk at break; paint loss at torn lips | Plasticine uniform orange, clean showroom hull |
| `wrk_hull_bare` / `wrk_frame_steel` | Load frame, boom stump, yoke | Bare structural steel | Clean shear at boom root; fretting at joints | Painted as soft clay bevels |
| `wrk_armor` | Cutter drum body | Hardened alloy shell | Picks and hub survive; mass stays | Soft rubber drum, glowing edges |
| `wrk_deck_grate` | Working apron / conveyor | Open grate steel | Torn mid-run at bay | Runway of lamps |
| `wrk_ore_raw` | Spilled ore | Matte rock/ore | Only from breached bin | Shiny gemstones |
| `wrk_torn_edge` / `wrk_insulation` | Break lips | Bright bare metal + fibrous blanket | Directional from boom-root axis | Random grunge stamps |
| `wrk_hot_*` / `wrk_vent_coolant` / `wrk_arc_blue` / `wrk_fire_internal` | Cooling state light budget | Emissive roles, small screen area | Cooling: hot→deep red; arc deleted | Beauty neon wash |
| `wrk_glass_shattered` | Bridge glazing | Dead dielectric | Non-emissive | Intact glossy glass |
| `wrk_emerg_amber` | Sparse emergency lamp | Failing amber | One only, not a runway | Staffed derelict with working lights |

## Zone register (supported chase cameras)

Supported review cameras: `play_chase`, `play_chase_abeam`, `play_chase_close` via
`spaceface_chase_camera.py` (distances scaled for hero wreck occupancy).

| Zone | Class | Notes |
|---|---|---|
| Barge deck / pontoons | billed | Rust paint; asymmetric starboard working face |
| Ore bins (aft-port) | billed | Rhythm identity; one breached with ore spill |
| Hab / bridge | billed | Port aft, away from working face; dead glass |
| Drive bells / reactor | billed | Aft; salvage socket |
| Boom stump + shear | billed | Causal break; hot metal, vent, occluded fire |
| Cutter head + yoke | billed | Heavy thing that stayed; picks readable at abeam |
| Amidships fly-through bay | billed | Measured ≥40 m clear span (`INTERACTION_BinGap`) |
| Torn conveyor / cables / radiator | billed | Service wreckage; not bridging the bay |

## Shape-grammar note

New manufactured assembly (not a remaster): open industrial barge with boom-root truss break.
Primitives retained only where section and load purpose are intentional (pontoon slabs, bin walls,
cutter drum). Negative space is the bay the boom failure tore open.

## Surfaced working scene

- Builder: `design/program/vm-drop/mining-barge-wreck/build_mining_barge_wreck.py`
- Artifact: `wreck_mining_barge.glb`
- Evidence cameras: chase stills in this folder
