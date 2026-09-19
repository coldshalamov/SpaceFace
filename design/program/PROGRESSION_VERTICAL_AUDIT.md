# Progression Vertical Audit — Scalar vs Verb

Generated **2026-09-19** by `scripts/check-progression-verb-audit.mjs` — this file is GENERATED, do not hand-edit. Regenerate with `npm run check:progression:verbs -- --write=design/program/PROGRESSION_VERTICAL_AUDIT.md`.

A module is **verb** when it grants a capability or state change (tether head, cloak, countermeasure, drone bay, jump, impulse charge, attack-trait rig, …), **intel** when it is a read (reveal cargo, market data, scan bonuses), and **scalar** when it only moves numbers (shieldFlat, *Mult, *Pct, …). Precedence per module: verb > intel > scalar; secondary classes are listed in the row. Tech classification is imported verbatim from the committed ladder (`src/data/techVerbLadder.js`), not re-derived.

## Summary

| Population | Verb | Intel | Scalar | Total |
|---|---:|---:|---:|---:|
| Modules (src/data/modules.js) | 45 | 12 | 31 | 88 |
| Weapons (src/data/weapons.js) | 26 | 0 | 0 | 26 |
| Tech nodes (src/data/tech.js) | verb 29 strict / 23 broad | — | stat-only 3 strict / 9 broad | 32 |

Tech reading: 29 nodes grant a ship or module in both modes; 6 more fall to stat-only under the ladder's **broad** mode (hull-license-only nodes plus two enlarge-an-existing-verb passives); 3 are strict stat-only (no ship, no module).

## Verb modules

| Module | Granted by | Secondary classes |
|---|---|---|
| `unique_choir_bell_aegis` | reactiveMissileKnockback | scalar |
| `unique_pale_coil_warp_drive` | microJumpBlink | scalar |
| `mod_repulsion_trap_s` | repulsionTrap | — |
| `unique_knitbots` | repairDockedDrones | scalar |
| `mod_tractor_beam_m` | masslineHeadId='tractor' | scalar |
| `unique_tideline_tractor` | tractorWholeWrecks, masslineHeadId='tractor' | scalar |
| `unique_no_cut_filament` | masslineHeadId='monofilament_sweep' | — |
| `unique_toll_saint_bridle` | masslineHeadId='twin_bridle' | — |
| `unique_broken_ring_whip` | masslineHeadId='elastic_whip' | — |
| `mod_elastic_whip_m` | masslineHeadId='elastic_whip' | — |
| `mod_frame_coupler_m` | masslineHeadId='frame_coupler' | — |
| `mod_monofilament_sweep_m` | masslineHeadId='monofilament_sweep' | — |
| `mod_transverse_snare_m` | masslineHeadId='transverse_snare' | — |
| `mod_twin_bridle_m` | masslineHeadId='twin_bridle' | — |
| `mod_pds_servo_s` | pointDefense | — |
| `mod_decoy_buoy_s` | countermeasure | — |
| `mod_drone_bay_l` | droneBay | — |
| `mod_jump_drive_m` | jumpDriveTier | — |
| `mod_swing_drive_m` | swingDrive | — |
| `mod_loot_magnet_s` | lootMagnetRange | — |
| `mod_mass_flail_rig_m` | towFlail | — |
| `mod_cloak_mk1` | cloakBaseRadius, cloakDrainPerS, cloakRechargePerS | — |
| `mod_cloak_mk2` | cloakBaseRadius, cloakDrainPerS, cloakRechargePerS | — |
| `unique_quietcloak` | cloakBaseRadius, cloakDrainPerS, cloakRechargePerS | — |
| `mod_charge_rack` | impulseChargeCapacity | — |
| `mod_charge_vector_rack` | impulseChargeCapacity, bombPropulsion | — |
| `mod_chaff_dispenser_m` | countermeasure | — |
| `unique_smokesong_chaff` | countermeasure | — |
| `mod_ecm_jammer_l` | countermeasure | — |
| `mod_twin_mount` | id-matched attack trait (volley) | — |
| `mod_triad_mount` | id-matched attack trait (volley) | — |
| `mod_piercing_core` | id-matched attack trait (propagation) | — |
| `mod_forked_core` | id-matched attack trait (propagation) | — |
| `mod_bank_shot` | id-matched attack trait (ricochet) | — |
| `mod_smart_bank` | id-matched attack trait (ricochet) | — |
| `mod_ion_payload` | id-matched attack trait (payload) | — |
| `mod_incendiary_payload` | id-matched attack trait (payload) | — |
| `mod_gravity_tag` | id-matched attack trait (payload) | — |
| `mod_relay_arc` | id-matched attack trait (chain) | — |
| `mod_bank_relay` | id-matched attack trait (ricochet) | — |
| `mod_tether_capacitor` | id-matched attack trait (payload) | — |
| `mod_conductive_path` | id-matched attack trait (propagation) | — |
| `mod_cryo_payload` | id-matched attack trait (payload) | — |
| `mod_cryo_gyros` | id-matched attack trait (orbit) | — |
| `mod_herald_fan` | id-matched attack trait (trajectory) | — |

## Intel modules (reads — neither pure stat nor combat verb)

| Module | Intel keys | Secondary classes |
|---|---|---|
| `mod_cargo_scanner_s` | revealCargo | — |
| `unique_truesight_scanner` | revealCargo | scalar |
| `mod_market_data_s` | marketIntel | — |
| `mod_triangulation_suite_s` | anomalyPingReduction | — |
| `mod_sensor_array_l` | radarRangePct, scanRpBonus | — |
| `mod_survey_suite` | scannerRadiusMult, pingPersistMult, radarRangePct | — |
| `unique_deepsurvey_suite` | scannerRadiusMult, pingPersistMult, radarRangePct, overusePingThreshold | — |
| `mod_smuggler_hold` | hiddenCargoPct | scalar |
| `mod_smuggler_hold_m` | hiddenCargoPct | scalar |
| `mod_sensor_scrambler_s` | scannerCloak | — |
| `mod_sensor_scrambler_m` | scannerCloak | — |
| `unique_phantom_scrambler` | scannerCloak | — |

Modules classified scalar on top-level stat fields alone (no mods, no id-verb): `mod_mining_laser_s` (top-level stat fields (dps, directToCargo)), `mod_mining_beam_m` (top-level stat fields (dps, directToCargo)), `mod_mining_pulverizer_l` (top-level stat fields (dps, rareOreChance, directToCargo)), `mod_mining_industrial_l` (top-level stat fields (dps, directToCargo)).

## Stat-only tech nodes (9, with the ladder's own justification)

| Node | Mode | Justification (src/data/techVerbLadder.js) |
|---|---|---|
| `tech_hardened_deflectors` | broad only | Aegis L plus 5% regen. Same "raise a shield" verb as deflector_theory. Not folded: Aegis is a distinct module id in modules.js (out of this write set). |
| `tech_strike_craft` | broad only | Hull license only (Hornet). Same guns as combat_basics, on a faster body. Not folded: a T2 interceptor at first upgrade would smash the ladder. |
| `tech_warship_license` | broad only | Hull license only (Bastion). A heavier body, not a new shot or line. Not folded: the corvette buy is a distinct save key. |
| `tech_capital_hulls` | broad only | Hull license only (Colossus). The siege verbs sit on capital_weapons / flagship. Not folded: merging would skip the hull gate ships.js requires. |
| `tech_industrial_mining` | broad only | Hull license only (Ironback). Same mining verb as the starter laser, on a barge. Not folded: ships.js keys the hull to this id (ships.js is out of this write set). |
| `tech_matter_compression` | broad only | Cargo compactor. More hold, not a new carry verb — bulk_logistics already gives the Atlas and an expander. Not folded: module id lives in modules.js. |
| `tech_drone_swarm` | strict + broad | No ship or module. Raises droneTierCap and extraDronePerBay on the bay unlocked at drone_control. Folding into drone_control would collapse the tier ladder bay tests pin. Keep until a distinct swarm chassis exists. |
| `tech_autonomous_fleets` | strict + broad | No ship or module. Hire-trader flag plus a tier cap. Hiring is a menu, not a field verb. Folding into drone_swarm would bury the hire behind a cap bump. |
| `tech_outpost_charter` | strict + broad | No ship or module. Outpost-construction flag plus a tier cap. Placement is not yet a field verb on the default route. Folding into fleets would bury a late flag. |

## Verb weapons

| Weapon | Verb source |
|---|---|
| `wpn_snarl_s` | impulsePerHit |
| `wpn_pulse_laser_s` | impulsePerHit |
| `wpn_autocannon_s` | impulsePerHit |
| `wpn_flak_turret_s` | impulsePerHit |
| `wpn_pulse_laser_m` | impulsePerHit |
| `wpn_autocannon_m` | impulsePerHit |
| `unique_ironsong_ac` | impulsePerHit |
| `wpn_beam_laser_m` | impulsePerHit |
| `unique_veil_cutter` | impulsePerHit |
| `wpn_railgun_m` | impulsePerHit |
| `wpn_plasma_cannon_m` | impulsePerHit |
| `wpn_missile_rack_m` | impulsePerHit |
| `unique_nestbreaker_rack` | impulsePerHit |
| `wpn_heavy_beam_l` | impulsePerHit |
| `unique_lighthouse_heavy_beam` | impulsePerHit |
| `wpn_torpedo_l` | impulsePerHit |
| `wpn_siege_lance_l` | impulsePerHit |
| `wpn_emp_disruptor_m` | impulsePerHit, subsystemShare/shieldBypass |
| `wpn_gravity_marker_s` | statuses (status_gravity_marked), impulsePerHit, control-gun token |
| `wpn_momentum_sink_s` | statuses (status_momentum_sink), impulsePerHit, control-gun token |
| `wpn_inertial_shunt_s` | impulsePerHit |
| `wpn_concussion_cannon_m` | impulsePerHit, control-gun token |
| `wpn_vector_mine_m` | deployKind=vector_mine, impulsePerHit, control-gun token |
| `wpn_gravity_well_m` | deployKind=gravity_well |
| `wpn_rcs_disruptor_m` | impulsePerHit, subsystemShare/shieldBypass, control-gun token |
| `unique_mirrorjaw_pulse` | impulsePerHit, attackTraits (mod_bank_shot, mod_bank_relay) |

Declared-but-unwired verb keys (registered verbs whose mods key no system reads — honestly labeled, tracked by the packet leaf that will wire or reclassify each): `microJumpBlink` (tracked by PQ-208.01), `reactiveMissileKnockback` (tracked by PQ-208.01).

## Vocabulary contract

The drift guard knows 18 verb mods keys, 10 intel keys, 25 scalar keys, 16 id-matched attack-trait rigs, massline heads {tractor, elastic_whip, frame_coupler, monofilament_sweep, transverse_snare, twin_bridle}, countermeasure kinds {chaff, ecm, decoy}, and deploy kinds {vector_mine, gravity_well}. A mods key outside these sets fails this check — register new keys in `scripts/check-progression-verb-audit.mjs` in the same packet that introduces them. Every verb key also carries consumer evidence verified on every run (PQ-208.00): 16 keys verified against live source, 2 declared-only pending their tracked leaf. A declared verb key that names no implemented behaviour fails the run.
