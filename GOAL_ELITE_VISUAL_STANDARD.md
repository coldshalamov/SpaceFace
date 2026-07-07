# GOAL: Elite Visual Standard (Phase 2)

**Authority:** `design/spec3/SPEC3-F9-elite-finish-bar.md` · **Gap audit:** `GOAL_ELITE_VISUAL_GAP_AUDIT.md`
**Generated:** 2026-07-07 (auto from manifest + devshots)

## Lane remediation (lanes that started <4)

| Lane | Start | Target | Status | Owner |
|------|------:|-------:|--------|-------|
| Code-native ships | 3 | 4 | **done** | `shipKit.applyEliteWearShell` on Concord/Reaver |
| Procedural fallbacks | 2 | 4 | **done** | `visualFactory.buildFallback` PBR wear upgrade |
| World backdrop | 3 | 4 | **done** | star/flare/planet hero density uplift |
| VFX | 2 | 4 | **done** | gameplay capture via `capture-vfx-elite-frames.mjs` |

## Existing manifest uplift (63 IDs)

| ID | Category | Elite | iter4/5 lit | Notes |
|----|----------|-------|-------------|-------|
| cockpit_dome | cockpits | elite | 5 (quota 5 met) | 3862 tris · PRO Elite Finish 2026-07-06 — 13 DET (+4 elite), 2K trim/wea |
| cockpit_recessed | cockpits | elite | 5 (quota 5 met) | 2424 tris · PRO Elite Finish 2026-07-06 — 12 DET (+5 elite), 2K trim/wea |
| cockpit_slab | cockpits | elite | 5 (quota 5 met) | 3076 tris · PRO Elite Finish 2026-07-06 — 14 DET (+5 elite), 2K trim/wea |
| engine_industrial | engines | elite | 5 (quota 5 met) | 23740 tris · PRO Elite Finish 2026-07-06 — 12 DET (+4 elite), 2K trim/wea |
| engine_ion_small | engines | elite | 5 (quota 5 met) | 14104 tris · PRO Elite Finish 2026-07-06 — 12 DET (+5 elite), 2K trim/wea |
| engine_ion_twin | engines | elite | 5 (quota 5 met) | 6096 tris · PRO Elite Finish 2026-07-06 — 12 DET (+4 elite), 2K trim/wea |
| engine_plasma_ring | engines | elite | 5 (quota 5 met) | 8784 tris · PRO Elite Finish 2026-07-06 — 12 DET, 2K trim/wear+plasma_gl |
| engine_resonator | engines | elite | 5 (quota 5 met) | 13720 tris · PRO Elite Finish 2026-07-06 — 12 DET (+4 elite), 2K trim/wea |
| engine_vector | engines | elite | 5 (quota 5 met) | 2372 tris · PRO Elite Finish 2026-07-06 — 12 DET (+4 elite), 2K trim/wea |
| fin_crystalline | fins | elite | 5 (quota 5 met) | 4248 tris · PRO Elite Finish 2026-07-06 — Anomaly crystalline fin: 12 DE |
| fin_delta | fins | elite | 5 (quota 5 met) | 4952 tris · PRO Elite Finish 2026-07-06 — Core patrol delta wing: 12 DET |
| fin_radiator_grid | fins | elite | 5 (quota 5 met) | 2364 tris · PRO Elite Finish 2026-07-06 — industrial radiator fin: 12 DE |
| fin_stabilator | fins | elite | 5 (quota 5 met) | 3360 tris · PRO Elite Finish 2026-07-06 — multirole stabilator: 12 DET l |
| fin_swept_smuggler | fins | elite | 5 (quota 5 met) | 7528 tris · PRO Elite Finish 2026-07-06 — Belt smuggler swept fin: 12 DE |
| fin_wedge | fins | elite | 5 (quota 5 met) | 4214 tris · PRO Elite Finish 2026-07-06 — Pit starter fin: 12 DET layers |
| skid_quad | gear | elite | 5 (quota 5 met) | 4812 tris · PRO Elite Finish 2026-07-06 — 4812 tris, 2K trim/wear + haul |
| skid_trio | gear | elite | 5 (quota 5 met) | 4576 tris · PRO Elite Finish 2026-07-06 — 4576 tris, 2K trim/wear + land |
| greeble_antennas | greebles | elite | 5 (quota 5 met) | 4030 tris · PRO Elite Finish 2026-07-06 — comms antenna greeble: 12 DET  |
| greeble_armor_plates | greebles | elite | 5 (quota 5 met) | 4788 tris · PRO Elite Finish 2026-07-06 — ablative armor greeble: 12 DET |
| greeble_hatches | greebles | elite | 5 (quota 5 met) | 8580 tris · PRO Elite Finish 2026-07-06 — access hatch greeble: 12 DET l |
| greeble_nav_lights | greebles | elite | 5 (quota 5 met) | 3148 tris · PRO Elite Finish 2026-07-06 — nav light greeble: 12 DET laye |
| greeble_pipes | greebles | elite | 5 (quota 5 met) | 5964 tris · PRO Elite Finish 2026-07-06 — industrial pipe greeble: 12 DE |
| greeble_rcs | greebles | elite | 5 (quota 5 met) | 4448 tris · PRO Elite Finish 2026-07-06 — RCS thruster greeble: 12 DET l |
| greeble_vents | greebles | elite | 5 (quota 5 met) | 4240 tris · PRO Elite Finish 2026-07-06 — heat vent greeble: 12 DET laye |
| hull_capital | hulls | elite | 5 (quota 5 met) | 3516 tris · PRO Elite Finish 2026-07-06 — 13 DET (+4 elite), 2K trim/wea |
| hull_corvette | hulls | elite | 5 (quota 5 met) | 2520 tris · PRO Elite Finish 2026-07-06 — 12 DET (+4 elite), 2K trim/wea |
| hull_fighter | hulls | elite | 5 (quota 5 met) | 3260 tris · PRO Elite Finish 2026-07-06 — 12 DET (+4 elite), 2K trim/wea |
| hull_freighter | hulls | elite | 5 (quota 5 met) | 4435 tris · PRO Elite Finish 2026-07-06 — 12 DET (+4 elite), 2K trim/wea |
| hull_frigate | hulls | elite | 5 (quota 5 met) | 3348 tris · PRO Elite Finish 2026-07-06 — 12 DET (+4 elite), 2K trim/wea |
| hull_gunship | hulls | elite | 5 (quota 5 met) | 3720 tris · PRO Elite Finish 2026-07-06 — 12 DET (+4 elite), 2K trim/wea |
| hull_interceptor | hulls | elite | 5 (quota 5 met) | 2492 tris · PRO Elite Finish 2026-07-06 — 12 DET (+4 elite), 2K trim/wea |
| hull_miner | hulls | elite | 5 (quota 5 met) | 15608 tris · PRO Elite Finish 2026-07-06 — 12 DET (+4 elite), 2K trim/wea |
| hull_multirole | hulls | elite | 5 (quota 5 met) | 2998 tris · PRO Elite Finish 2026-07-06 — 12 DET (+4 elite), 2K trim/wea |
| hull_starter | hulls | elite | 5 (quota 5 met) | 1660 tris · PRO Elite Finish 2026-07-06 — 18 DET layers (+4 elite), 2K t |
| place_asteroid_graffiti | places | elite | 5 (quota 5 met) | 2979 tris · PRO Elite Finish 2026-07-06 — tagged asteroid uplift: 12 DET |
| place_asteroid_rock_a | places | elite | 5 (quota 5 met) | 72779 tris · PRO Elite Finish 2026-07-06 — Belt hero rock A uplift: 12 DE |
| place_asteroid_rock_b | places | elite | 5 (quota 5 met) | 4076 tris · PRO Elite Finish 2026-07-06 — Belt hero rock B uplift: 12 DE |
| place_asteroid_rock_c | places | elite | 5 (quota 5 met) | 3619 tris · PRO Elite Finish 2026-07-06 — Belt hero rock C uplift: 12 DE |
| place_asteroid_seamed | places | elite | 5 (quota 5 met) | 3881 tris · PRO Elite Finish 2026-07-06 — 3881 tris, 2K trim/wear + ore  |
| place_conveyor_barge | places | elite | 5 (quota 5 met) | 2440 tris · PRO Elite Finish 2026-07-06 — conveyor barge uplift: 12 DET  |
| place_dead_hulk | places | elite | 5 (quota 5 met) | 3036 tris · PRO Elite Finish 2026-07-06 — derelict hulk uplift: 12 DET l |
| place_debris_chunk | places | elite | 5 (quota 5 met) | 2420 tris · PRO Elite Finish 2026-07-06 — combat debris uplift: 12 DET l |
| place_gate_jump_ring | places | elite | 5 (quota 5 met) | 6080 tris · PRO Elite Finish 2026-07-06 — 12 DET layers, 2K warp scorch  |
| place_lane_beacon | places | elite | 5 (quota 5 met) | 3020 tris · PRO Elite Finish 2026-07-06 — 3020 tris, 2K trim/wear + sodi |
| place_mining_drone | places | elite | 5 (quota 5 met) | 2612 tris · PRO Elite Finish 2026-07-06 — mining drone uplift: 12 DET la |
| place_nav_buoy | places | elite | 5 (quota 5 met) | 2652 tris · PRO Elite Finish 2026-07-06 — 2652 tris, 2K trim/wear + mari |
| place_station_billboard | places | elite | 5 (quota 5 met) | 2244 tris · PRO Elite Finish 2026-07-06 — commercial signage uplift: 12  |
| place_station_blackmarket | places | elite | 5 (quota 5 met) | 5244 tris · PRO Elite Finish 2026-07-06 — 12 DET layers, 2K contraband s |
| place_station_fab | places | elite | 5 (quota 5 met) | 2844 tris · PRO Elite Finish 2026-07-06 — 12 DET layers, 2K forge heat s |
| place_station_military | places | elite | 5 (quota 5 met) | 4596 tris · PRO Elite Finish 2026-07-06 — 12 DET layers, 2K armor scorch |
| place_station_mining | places | elite | 5 (quota 5 met) | 2844 tris · PRO Elite Finish 2026-07-06 — 12 DET layers, 2K ore dust sto |
| place_station_refinery | places | elite | 5 (quota 5 met) | 4304 tris · PRO Elite Finish 2026-07-06 — 12 DET layers, 2K refinery soo |
| place_station_research | places | elite | 5 (quota 5 met) | 2175 tris · PRO Elite Finish 2026-07-06 — 12 DET layers, 2K sensor wear  |
| place_station_trade_hub | places | elite | 14 (quota 5 met) | 6932 tris · PRO Elite Finish 2026-07-06 — Meridian trade hub uplift: 12  |
| pod_cargo_container | pods | elite | 5 (quota 5 met) | 5072 tris · PRO Elite Finish 2026-07-06 — 5072 tris, 2K trim/wear + sten |
| pod_repair_patch | pods | elite | 5 (quota 5 met) | 10072 tris · PRO Elite Finish 2026-07-06 — 10072 tris, 2K trim/wear + wel |
| pod_utility | pods | elite | 5 (quota 5 met) | 3848 tris · PRO Elite Finish 2026-07-06 — 3848 tris, 2K trim/wear + tool |
| weapon_gatling | weapons | elite | 5 (quota 5 met) | 8064 tris · PRO Elite Finish 2026-07-06 — 12 DET (+8 elite), 2K trim/wea |
| weapon_heavy_cannon | weapons | elite | 5 (quota 5 met) | 9640 tris · PRO Elite Finish 2026-07-06 — 12 DET (+12 new), 2K trim/wear |
| weapon_lance | weapons | elite | 5 (quota 5 met) | 7870 tris · PRO Elite Finish 2026-07-06 — long precision energy lance: 1 |
| weapon_pulse_cannon | weapons | elite | 5 (quota 5 met) | 14180 tris · PRO Elite Finish 2026-07-06 — Core pulse cannon: 12 DET laye |
| weapon_railgun | weapons | elite | 5 (quota 5 met) | 9324 tris · PRO Elite Finish 2026-07-06 — linear rail accelerator: 12 DE |
| weapon_turret_dual | weapons | elite | 5 (quota 5 met) | 11456 tris · PRO Elite Finish 2026-07-06 — dual gimbal turret: 12 DET lay |

**Uplift progress:** 63/63 elite · 63/63 iter4/5 lit quota met

## New assets (45 — 5 per category)

| ID | Category | Elite | iter4/5 lit | Notes |
|----|----------|-------|-------------|-------|
| cockpit_armored | cockpits | elite | 10 (quota 5 met) | NEW · 6068 tris |
| cockpit_bridge_cap | cockpits | elite | 10 (quota 5 met) | NEW · 6068 tris |
| cockpit_bubble_twin | cockpits | elite | 10 (quota 5 met) | NEW · 6854 tris |
| cockpit_canopy_angled | cockpits | elite | 10 (quota 5 met) | NEW · 6854 tris |
| cockpit_stealth_hood | cockpits | elite | 10 (quota 5 met) | NEW · 2856 tris |
| engine_afterburner | engines | elite | 10 (quota 5 met) | NEW · 2372 tris |
| engine_fusion_lattice | engines | elite | 10 (quota 5 met) | NEW · 7920 tris |
| engine_ore_thruster | engines | elite | 10 (quota 5 met) | NEW · 23632 tris |
| engine_ramjet | engines | elite | 10 (quota 5 met) | NEW · 6096 tris |
| engine_tug_drive | engines | elite | 10 (quota 5 met) | NEW · 14380 tris |
| fin_armor_skid | fins | elite | 10 (quota 5 met) | NEW · 8166 tris |
| fin_contraband_cowl | fins | elite | 10 (quota 5 met) | NEW · 7960 tris |
| fin_ion_blade | fins | elite | 10 (quota 5 met) | NEW · 4680 tris |
| fin_solar_array | fins | elite | 10 (quota 5 met) | NEW · 2796 tris |
| fin_vtol_skeg | fins | elite | 10 (quota 5 met) | NEW · 5276 tris |
| gear_dock_skid | gear | elite | 10 (quota 5 met) | NEW · 5008 tris |
| gear_landing_truss | gear | elite | 10 (quota 5 met) | NEW · 5244 tris |
| gear_mag_clamp | gear | elite | 10 (quota 5 met) | NEW · 5008 tris |
| gear_tow_hook | gear | elite | 10 (quota 5 met) | NEW · 5244 tris |
| gear_vtol_stabilizer | gear | elite | 10 (quota 5 met) | NEW · 5244 tris |
| greeble_docking_latch | greebles | elite | 10 (quota 5 met) | NEW · 9012 tris |
| greeble_fuel_coupling | greebles | elite | 10 (quota 5 met) | NEW · 6396 tris |
| greeble_hazard_strobe | greebles | elite | 10 (quota 5 met) | NEW · 3580 tris |
| greeble_reactive_plate | greebles | elite | 10 (quota 5 met) | NEW · 5220 tris |
| greeble_sensor_dish | greebles | elite | 10 (quota 5 met) | NEW · 4462 tris |
| hull_courier | hulls | elite | 10 (quota 5 met) | NEW · 4104 tris |
| hull_dreadnought | hulls | elite | 10 (quota 5 met) | NEW · 4352 tris |
| hull_salvager | hulls | elite | 10 (quota 5 met) | NEW · 6019 tris |
| hull_scout | hulls | elite | 10 (quota 5 met) | NEW · 4076 tris |
| hull_smuggler | hulls | elite | 10 (quota 5 met) | NEW · 3618 tris |
| place_claim_marker | places | elite | 10 (quota 5 met) | NEW · 2852 tris |
| place_ore_spool | places | elite | 10 (quota 5 met) | NEW · 3044 tris |
| place_patrol_pylon | places | elite | 10 (quota 5 met) | NEW · 2156 tris |
| place_salvage_beacon | places | elite | 10 (quota 5 met) | NEW · 3084 tris |
| place_wreck_flare | places | elite | 10 (quota 5 met) | NEW · 3468 tris |
| pod_ammo_magazine | pods | elite | 10 (quota 5 met) | NEW · 5504 tris |
| pod_drone_bay | pods | elite | 10 (quota 5 met) | NEW · 5504 tris |
| pod_escape_capsule | pods | elite | 10 (quota 5 met) | NEW · 10504 tris |
| pod_fuel_cell | pods | elite | 10 (quota 5 met) | NEW · 4172 tris |
| pod_sensor_array | pods | elite | 10 (quota 5 met) | NEW · 4280 tris |
| weapon_autocannon | weapons | elite | 10 (quota 5 met) | NEW · 6056 tris |
| weapon_beam_slicer | weapons | elite | 10 (quota 5 met) | NEW · 7006 tris |
| weapon_missile_pod | weapons | elite | 10 (quota 5 met) | NEW · 8776 tris |
| weapon_plasma_thrower | weapons | elite | 10 (quota 5 met) | NEW · 14612 tris |
| weapon_torpedo_rack | weapons | elite | 10 (quota 5 met) | NEW · 11888 tris |


## VFX families

| Family | Variants | Evidence | Status |
|--------|----------|----------|--------|
| muzzle | 4/3 | design/vfx-evidence/muzzle.md | wired |
| projectile | 3/3 | design/vfx-evidence/projectile.md | wired |
| impact | 3/3 | design/vfx-evidence/impact.md | wired |
| explosion | 3/3 | design/vfx-evidence/explosion.md | wired |
| thruster | 3/3 | design/vfx-evidence/thruster.md | wired |
| mining | 3/3 | design/vfx-evidence/mining.md | wired |
| countermeasure | 3/3 | design/vfx-evidence/countermeasure.md | wired |
| station_emissive | 3/3 | design/vfx-evidence/station_emissive.md | wired |

## Verification log

| Gate | Last run | Result |
|------|----------|--------|
| check:elite:contract | 2026-07-07 | PASS (`SCRATCH/repo-contract.log`) — blend1 index 0, rollup sourceSha256 |
| check:revamp:evidence | 2026-07-07 | PASS 108/108 (`SCRATCH/phase1-floor.log`) |
| check:elite:evidence | 2026-07-07 | PASS 108/108 incl. colocated renders (`SCRATCH/per-id-elite-audit.txt`) |
| check:vfx:elite | 2026-07-07 | PASS 8 families (`SCRATCH/vfx-elite-audit.txt`) |
| check:assets:live | 2026-07-07 | PASS `failureCount:0` `loadedCount:108` (`SCRATCH/check-assets-live.log`) |
| check:visual-stability | 2026-07-07 | PASS `ok:true` (`SCRATCH/visual-stability.log`) |
| check-sg04-release | 2026-07-07 | OK 112 assets `releaseReady=true` sourceSha256 verified (`SCRATCH/check-sg04-release-exit.txt`) |
| needed-assets briefs | 2026-07-07 | 45/45 ELITE NEW story rows |
| blend1 cleanup | 2026-07-07 | 0 remaining backup files |
| render colocation | 2026-07-07 | 1350 PNGs → `revamp-evidence/<id>/renders/` (45 NEW IDs) |
