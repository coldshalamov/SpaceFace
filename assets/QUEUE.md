# SpaceFace authored-asset queue (SPEC3-37 §2 step 3)

Nothing enters `assets/ships/release/` without exporter pass + manifest entry + reachability check.
Tri budgets follow the live manifest/exporter contract: part ≤15k · whole-ship ≤20k with ≥800 hull-body tris · prop ≤3k · landmark ≤10k. Treat these as alarms, not taste ceilings; change a row with rationale + perf evidence.

| id | kind | thread | tri budget | palette | status |
|---|---|---|---:|---|---|
| wholeship_kestrel | wholeship | F9-37 | 6000 | core cyan accent | **blocked** — hull body missing; re-export in Blender |
| wholeship_pelican | wholeship | F9-37 | 6000 | industrial amber | **blocked** — hull body missing; re-export in Blender |
| wholeship_wasp | wholeship | F9-37 | 6000 | smuggler violet | **blocked** — hull body missing; re-export in Blender |
| claim_hopper | prop | F6-26 | 600 | claim sector palette | queued |
| claim_battery_mast | prop | F6-26 | 600 | claim sector palette | queued |
| claim_hangar_frame | prop | F6-26 | 600 | claim sector palette | queued |
| claim_hab_ring | prop | F6-26 | 600 | claim sector palette | queued |
| claim_sensor_dish | prop | F6-26 | 600 | claim sector palette | queued |
| claim_depot_silo | prop | F6-26 | 600 | claim sector palette | queued |
| claim_teleport_ring | prop | F6-26 | 600 | claim sector palette | queued |
| hunter_sig_rail_01 | part | F4-22 | 1200 | hostile rim red | queued |
| hunter_sig_rail_02 | part | F4-22 | 1200 | hostile rim red | queued |
| hunter_sig_rail_03 | part | F4-22 | 1200 | hostile rim red | queued |
| hunter_sig_rail_04 | part | F4-22 | 1200 | hostile rim red | queued |
| hunter_sig_rail_05 | part | F4-22 | 1200 | hostile rim red | queued |
| hunter_sig_rail_06 | part | F4-22 | 1200 | hostile rim red | queued |
| hunter_sig_rail_07 | part | F4-22 | 1200 | hostile rim red | queued |
| hunter_sig_rail_08 | part | F4-22 | 1200 | hostile rim red | queued |
| hunter_sig_rail_09 | part | F4-22 | 1200 | hostile rim red | queued |
| hunter_sig_rail_10 | part | F4-22 | 1200 | hostile rim red | queued |
| hunter_sig_rail_11 | part | F4-22 | 1200 | hostile rim red | queued |
| hunter_sig_rail_12 | part | F4-22 | 1200 | hostile rim red | queued |
| landmark_beacon_spire | landmark | F7-30 | 10000 | sector identity | queued |
| landmark_wreck_cathedral | landmark | F7-30 | 10000 | ashfall rust | queued |
| landmark_veil_obelisk | landmark | F7-31 | 10000 | veil cyan | queued |
| landmark_pit_anchor | landmark | F7-31 | 10000 | pit ember | queued |
| landmark_vault_maw | landmark | F7-31 | 10000 | anomaly violet | queued |
| landmark_tower_crown | landmark | F6-27 | 10000 | siege brass | queued |
| module_vis_battery_S | part | F5-23 | 1200 | faction trim | queued (`wantsVisual`) |
| module_vis_battery_M | part | F5-23 | 1200 | faction trim | queued (`wantsVisual`) |
| module_vis_battery_L | part | F5-23 | 1200 | faction trim | queued (`wantsVisual`) |
| module_vis_drill_head | part | F5-23 | 1200 | mining ember | queued (`wantsVisual`) |
| module_vis_cargo_pod | part | F5-23 | 1200 | hauler slate | queued (`wantsVisual`) |
| module_vis_shield_emitter | part | F5-23 | 1200 | defensive cyan | queued (`wantsVisual`) |
| module_vis_salvage_claw | part | F5-23 | 1200 | salvage ochre | queued (`wantsVisual`) |
| module_vis_tow_winch | part | F5-23 | 1200 | industrial amber | queued (`wantsVisual`) |

**Priority order:** whole-ship repairs (blocked) → claim modules → hunter signatures → landmarks/vault/tower → module-visual variants.
