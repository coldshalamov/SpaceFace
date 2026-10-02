// Per-fitting showcase matrix: what to stage, what to do, and what proves it worked.
// demo kinds the runner understands:
//   shoot     - hostiles ahead, autoFire on for the clip
//   shoot_inert - one inert drone dead ahead, LMB held (physics/push weapons)
//   trait     - hostiles + baseline weapon fitted alongside the trait
//   duo_line  - two inert drones in a line, LMB (pierce demos)
//   bank      - asteroid between player and pack, LMB (ricochet demos)
//   tether    - inert drone ahead: Ctrl+Space latch, reel, whip-cut
//   burst     - hostiles ahead: hold W+Shift through them
//   counter   - missile-armed hostile at range: press X mid-flight
//   deploy    - press the field/bomb key near a pack (key option)
//   charge    - Y throws an impulse charge into the pack, R detonates
//   cloak     - hostiles + Backquote toggle
//   mine_ast  - asteroid ahead: hold RMB to bite it
//   scan      - contacts around: press C
//   fly       - W+Shift dash (engines / afterburner / swing)
//   turn      - A/D yaw + Q/E strafe (thrusters)
//   dronebay  - hostiles around: bay launches drones on its own
//   flak      - missile-armed hostile: point defence fires on its own
//   loot      - loose payload bodies: fly through them
//   ram       - one inert drone: fly straight through it
//   shield    - hostile shooting back: absorb on the ring
//   diagram   - no clip; UI shows spec sheet / diagram only
// verify: list — any listed bus event (count>0) or 'd:<derived key>' nonzero-diff passes.

const H_M = 'ship_hornet';      // M x3 weapon, S x2 utility, M eng/thr/shield
const H_L = 'ship_colossus';    // L x6 weapon, L x5 utility
const H_DRIFTER = 'ship_drifter'; // M weapon x2, M util x2, M mining
const H_IRONBACK = 'ship_ironback'; // L mining x4, M util x2, M shield x2
const H_KESTREL = 'ship_kestrel';   // starter: S wpn/shield/util/mining/thruster, M engine/cargo
const H_MULE = 'ship_mule';     // cargo M x3
const H_ATLAS = 'ship_atlas';   // cargo L x5
const H_BASTION = 'ship_bastion'; // L weapon x4, M util x3, L shield x2
const H_WASP = 'ship_wasp';     // S weapon x2

export const DEMOS = {
  // ---- weapons --------------------------------------------------------------
  wpn_snarl_s:            { hull: H_M, demo: 'shoot', ev: ['combat:damage', 'combat:statusApplied'], clip: 8 },
  wpn_pulse_laser_s:      { hull: H_M, demo: 'shoot', ev: ['combat:damage'], clip: 8 },
  wpn_autocannon_s:       { hull: H_M, demo: 'shoot', ev: ['combat:damage'], clip: 8 },
  wpn_flak_turret_s:      { hull: H_M, demo: 'flak_wpn', ev: ['combat:damage', 'combat:hit', 'pds:intercept'], clip: 8 },
  wpn_concussion_cannon_s:{ hull: H_M, demo: 'shoot_inert', ev: ['combat:damage', 'combat:tumbled', 'combat:shove'], clip: 8 },
  wpn_pulse_laser_m:      { hull: H_M, demo: 'shoot', ev: ['combat:damage'], clip: 8 },
  wpn_bank_stream_m:      { hull: H_M, demo: 'bank', ev: ['combat:damage', 'projectile:hit'], clip: 8 },
  wpn_autocannon_m:       { hull: H_M, demo: 'shoot', ev: ['combat:damage'], clip: 8 },
  wpn_beam_laser_m:       { hull: H_M, demo: 'shoot', ev: ['combat:damage', 'combat:beamStop'], clip: 8 },
  wpn_railgun_m:          { hull: H_M, demo: 'shoot_nose', ev: ['combat:damage', 'projectile:hit'], clip: 9, dist: 70 },
  wpn_plasma_cannon_m:    { hull: H_M, demo: 'shoot', ev: ['combat:damage'], clip: 8 },
  // Homing racks only launch inside the nose lock cone — the pinned-target nose-track
  // demo holds the pick in the cone long enough for lockProgress to reach 1.
  wpn_missile_rack_m:     { hull: H_M, demo: 'shoot_nose', ev: ['combat:damage', 'entity:killed'], clip: 9, dist: 100 },
  wpn_heavy_beam_l:       { hull: H_L, demo: 'shoot', ev: ['combat:damage', 'combat:beamStop'], clip: 8 },
  wpn_torpedo_l:          { hull: H_L, demo: 'shoot_nose', ev: ['combat:damage', 'entity:killed', 'projectile:hit'], clip: 14, dist: 80 },
  wpn_siege_lance_l:      { hull: H_L, demo: 'shoot', ev: ['combat:damage'], clip: 8, dist: 110 },
  wpn_emp_disruptor_m:    { hull: H_M, demo: 'shoot', ev: ['combat:damage', 'combat:statusApplied', 'combat:emp'], clip: 8 },
  wpn_gravity_marker_s:   { hull: H_M, demo: 'shoot_inert', ev: ['combat:statusApplied', 'combat:damage', 'projectile:hit'], clip: 8 },
  wpn_momentum_sink_s:    { hull: H_M, demo: 'shoot_inert', ev: ['combat:damage', 'combat:shove', 'projectile:hit'], clip: 8 },
  wpn_inertial_shunt_s:   { hull: H_M, demo: 'shoot_inert', ev: ['combat:damage', 'combat:shove', 'projectile:hit'], clip: 8 },
  wpn_concussion_cannon_m:{ hull: H_M, demo: 'shoot_inert', ev: ['combat:damage', 'combat:tumbled', 'combat:shove'], clip: 8 },
  wpn_vector_mine_m:      { hull: H_M, demo: 'shoot', ev: ['weapons:mineDeployed', 'fields:deployed', 'combat:damage'], clip: 9 },
  wpn_gravity_well_m:     { hull: H_M, demo: 'shoot', ev: ['fields:deployed', 'well:capture', 'combat:damage'], clip: 9 },
  wpn_rcs_disruptor_m:    { hull: H_M, demo: 'shoot', ev: ['combat:damage', 'combat:statusApplied'], clip: 8 },
  wpn_sticky_detonator:   { hull: H_M, demo: 'shoot', ev: ['emergent:applied', 'combat:damage', 'weapons:mineDetonated', 'combat:statusApplied'], clip: 9 , must: ['emergent:applied'] },
  wpn_conductive_primer:  { hull: H_M, demo: 'shoot', ev: ['emergent:applied', 'combat:statusApplied', 'combat:damage'], clip: 8 , must: ['emergent:applied'] },
  tool_grav_anchor:       { hull: H_M, demo: 'shoot_inert', ev: ['emergent:applied', 'combat:statusApplied', 'projectile:hit', 'fields:hitchLatched'], clip: 8 , must: ['emergent:applied'] },
  wpn_thermal_cooker:     { hull: H_M, demo: 'shoot_inert', ev: ['emergent:applied', 'combat:damage', 'combat:statusApplied'], clip: 8 , must: ['emergent:applied'] },
  wpn_mass_driver:        { hull: H_M, demo: 'shoot_inert', ev: ['emergent:applied', 'combat:shove', 'combat:tumbled', 'projectile:hit'], clip: 8 , must: ['emergent:applied'] },
  tool_polarity_inverter: { hull: H_M, demo: 'shoot', ev: ['emergent:applied', 'combat:statusApplied', 'combat:shove', 'projectile:hit'], clip: 8 , must: ['emergent:applied'] },
  tool_viscosity_field:   { hull: H_M, demo: 'shoot_inert', ev: ['emergent:applied', 'combat:statusApplied', 'fields:deployed', 'projectile:hit'], clip: 8 , must: ['emergent:applied'] },
  tool_hardlight_prism:   { hull: H_M, demo: 'shoot_inert', ev: ['emergent:applied', 'combat:statusApplied', 'combat:damage', 'projectile:hit'], clip: 8 , must: ['emergent:applied'] },
  tool_thruster_hijacker: { hull: H_M, demo: 'shoot', ev: ['emergent:applied', 'combat:statusApplied', 'combat:damage'], clip: 8 , must: ['emergent:applied'] },
  tool_seismic_gong:      { hull: H_M, demo: 'shoot', ev: ['emergent:applied', 'combat:shove', 'combat:statusApplied', 'combat:tumbled'], clip: 9 , must: ['emergent:applied'] },
  tool_quantum_sympathy:  { hull: H_M, demo: 'duo_line', ev: ['emergent:applied', 'combat:statusApplied', 'combat:damage', 'combat:hit'], clip: 9 , must: ['emergent:applied'] },

  // ---- shields --------------------------------------------------------------
  mod_shield_booster_s:   { hull: H_KESTREL, demo: 'shield', ev: ['combat:damage', 'projectile:hit', 'shieldDown'], stat: 'shieldMax', clip: 8 },
  mod_shield_capacitor_m: { hull: H_M, demo: 'shield', ev: ['combat:damage', 'projectile:hit', 'shieldDown'], stat: 'shieldMax', clip: 8 },
  mod_shield_aegis_l:     { hull: H_BASTION, demo: 'shield', ev: ['combat:damage', 'projectile:hit', 'shieldDown'], stat: 'shieldMax', clip: 8 },

  // ---- engines / thrusters ---------------------------------------------------
  mod_engine_ion_m:    { hull: H_M, demo: 'fly', ev: [], stat: 'topSpeed', clip: 7 },
  mod_engine_fusion_m: { hull: H_M, demo: 'fly', ev: [], stat: 'topSpeed', clip: 7 },
  mod_engine_warp_l:   { hull: H_BASTION, demo: 'fly', ev: [], stat: 'topSpeed', clip: 7 },
  mod_thruster_stripped_s: { hull: H_KESTREL, demo: 'turn', ev: [], stat: 'turnRate', clip: 7 },
  mod_thruster_vernier_m:  { hull: H_M, demo: 'turn', ev: [], stat: 'turnRate', clip: 7 },
  mod_thruster_gimbal_l:   { hull: H_BASTION, demo: 'turn', ev: [], stat: 'turnRate', clip: 7 },

  // ---- cargo / market (diagram) ---------------------------------------------
  mod_cargo_pod_m:      { demo: 'diagram', stat: 'cargoCap' },
  mod_cargo_expander_l: { demo: 'diagram', hull: H_ATLAS, stat: 'cargoCap' },
  mod_cargo_compactor_l:{ demo: 'diagram', hull: H_ATLAS, stat: 'cargoCap' },
  mod_smuggler_hold:    { demo: 'diagram', stat: 'hiddenCargoPct' },
  mod_smuggler_hold_m:  { demo: 'diagram', stat: 'hiddenCargoPct' },
  mod_market_data_s:    { demo: 'diagram', stat: 'marketIntel' },

  // ---- mining ----------------------------------------------------------------
  mod_mining_laser_s:      { hull: H_KESTREL, demo: 'mine_ast', ev: ['mining:start', 'mining:beamLocked', 'mining:yield'], clip: 10 },
  mod_mining_beam_m:       { hull: H_DRIFTER, demo: 'mine_ast', ev: ['mining:start', 'mining:beamLocked', 'mining:yield'], clip: 10 },
  mod_mining_pulverizer_l: { hull: H_IRONBACK, demo: 'mine_ast', ev: ['mining:start', 'mining:yield'], clip: 10 },
  mod_mining_industrial_l: { hull: H_IRONBACK, demo: 'mine_ast', ev: ['mining:start', 'mining:yield'], clip: 10 },
  mod_drill_amp:           { hull: H_DRIFTER, demo: 'mine_ast', ev: ['mining:start', 'mining:yield'], support: ['mod_mining_beam_m'], stat: 'richCoreRingPctBonus', clip: 10 },

  // ---- massline rig (tether heads + line gear) -------------------------------
  mod_tractor_beam_m:       { hull: H_DRIFTER, demo: 'tether', ev: ['tether:latched'], stat: 'masslineHeadId', clip: 10 },
  mod_elastic_whip_m:       { hull: H_DRIFTER, demo: 'tether', ev: ['tether:latched'], stat: 'masslineHeadId', clip: 10 },
  mod_frame_coupler_m:      { hull: H_DRIFTER, demo: 'tether', ev: ['tether:latched'], stat: 'masslineHeadId', clip: 10 },
  mod_monofilament_sweep_m: { hull: H_DRIFTER, demo: 'tether', ev: ['tether:latched'], stat: 'masslineHeadId', clip: 10 },
  mod_transverse_snare_m:   { hull: H_DRIFTER, demo: 'tether', ev: ['tether:latched', 'tether:attached', 'massline:throw'], stat: 'masslineHeadId', clip: 10 },
  mod_twin_bridle_m:        { hull: H_DRIFTER, demo: 'tether2', ev: ['tether:latched', 'tether:attached', 'massline:throw'], stat: 'masslineHeadId', clip: 11 },
  mod_winch_hd:             { hull: H_DRIFTER, demo: 'tether', ev: ['tether:latched'], support: ['mod_tractor_beam_m'], stat: 'tetherReelRateMult', clip: 10 },
  mod_massline_spool_m:     { hull: H_DRIFTER, demo: 'tether', ev: ['tether:latched'], support: ['mod_tractor_beam_m'], stat: 'tetherSpoolMult', clip: 10 },
  mod_massline_spool_l:     { hull: H_L, demo: 'tether', ev: ['tether:latched'], support: ['mod_tractor_beam_m'], stat: 'tetherSpoolMult', clip: 10 },
  mod_swing_drive_m:        { hull: H_DRIFTER, demo: 'swing', ev: ['tether:latched'], support: ['mod_tractor_beam_m'], stat: 'swingDrive', clip: 10 },
  mod_swing_drive_s:        { hull: H_KESTREL, demo: 'swing', ev: ['tether:latched'], support: ['mod_tractor_beam_m'], stat: 'swingDrive', clip: 10 },
  mod_mass_flail_rig_m:     { hull: H_DRIFTER, demo: 'flail', ev: ['tether:latched', 'combat:damage'], support: ['mod_tractor_beam_m'], stat: 'towFlail', clip: 11 },

  // ---- hull bursts -----------------------------------------------------------
  mod_gravity_bumper_s:      { hull: H_KESTREL, demo: 'burst', ev: ['hullBurst:hit', 'combat:shove'], stat: 'hullBurstKind', clip: 8 },
  mod_fire_lance_s:          { hull: H_KESTREL, demo: 'burst', ev: ['hullBurst:hit', 'combat:damage'], stat: 'hullBurstKind', clip: 8 },
  mod_grip_bumper_s:         { hull: H_KESTREL, demo: 'burst', ev: ['hullBurst:hit'], stat: 'hullBurstKind', clip: 8 },
  mod_gravity_bumper_s_mk2:  { hull: H_KESTREL, demo: 'burst', ev: ['hullBurst:hit', 'combat:shove'], stat: 'hullBurstKind', clip: 8 },
  mod_fire_lance_s_mk2:      { hull: H_KESTREL, demo: 'burst', ev: ['hullBurst:hit', 'combat:damage'], stat: 'hullBurstKind', clip: 8 },
  mod_grip_bumper_s_mk2:     { hull: H_KESTREL, demo: 'burst', ev: ['hullBurst:hit'], stat: 'hullBurstKind', clip: 8 },

  // ---- countermeasures / point defence ---------------------------------------
  mod_chaff_dispenser_m: { hull: H_DRIFTER, demo: 'counter', ev: ['countermeasure:deployed'], stat: 'chaffCount', clip: 15 },
  mod_ecm_jammer_l:      { hull: H_L, demo: 'counter', ev: ['countermeasure:deployed'], stat: 'ecmCount', clip: 15 },
  mod_decoy_buoy_s:      { hull: H_M, demo: 'counter', ev: ['countermeasure:deployed'], clip: 15 },
  mod_pds_servo_s:       { hull: H_M, demo: 'flak', ev: ['pds:intercept', 'combat:hit'], stat: 'pointDefense', clip: 10 },

  // ---- deployables / ordnance ------------------------------------------------
  mod_repulsion_trap_s:    { hull: H_M, demo: 'deploy', key: 'Digit6', ev: ['fields:deployed', 'combat:shove'], clip: 8 },
  mod_heat_lure_s:         { hull: H_M, demo: 'charge', ev: ['alienEcology:lureDropped', 'charge:thrown'], stat: 'heatLure', clip: 9 },
  mod_charge_rack:         { hull: H_M, demo: 'charge', ev: ['charge:thrown', 'charge:detonated', 'combat:shove'], stat: 'impulseChargeCapacity', clip: 9 },
  mod_charge_vector_rack:  { hull: H_M, demo: 'charge', ev: ['charge:thrown', 'charge:detonated', 'combat:shove'], stat: 'impulseChargeCapacity', clip: 9 },

  // ---- cloak / stealth --------------------------------------------------------
  mod_cloak_mk1: { hull: H_DRIFTER, demo: 'cloak', ev: ['cloak:engaged'], clip: 7 },
  mod_cloak_mk2: { hull: H_DRIFTER, demo: 'cloak', ev: ['cloak:engaged'], clip: 7 },
  mod_sensor_scrambler_s: { demo: 'diagram', stat: 'scannerCloak' },
  mod_sensor_scrambler_m: { demo: 'diagram', stat: 'scannerCloak' },
  mod_quiet_mask_s:       { demo: 'diagram', stat: 'stealthBioMult' },

  // ---- drones / loot / ram / repair ------------------------------------------
  mod_drone_bay_l:        { hull: H_L, demo: 'dronebay', ev: ['combat:damage', 'combat:fire'], stat: 'droneBayCount', clip: 10 },
  mod_loot_magnet_s:      { hull: H_KESTREL, demo: 'loot', ev: ['loot:magnetCaptured', 'cargo:changed'], stat: 'lootMagnetRange', clip: 8 },
  mod_ram_plate:          { hull: H_KESTREL, demo: 'ram', ev: ['combat:damage', 'combat:tumbled'], stat: 'ramDamageDealtMult', clip: 8 },
  mod_repair_nanobots_m:  { hull: H_DRIFTER, demo: 'diagram', stat: 'hullRepairOOC' },
  mod_afterburner_m:      { hull: H_DRIFTER, demo: 'fly', ev: [], stat: 'boostTopSpeedPct', clip: 7 },
  mod_shield_hardener_m:  { hull: H_DRIFTER, demo: 'shield', ev: ['combat:damage'], stat: 'damageReductionMult', clip: 8 },
  mod_jump_drive_m:       { demo: 'diagram', stat: 'jumpDriveTier' },
  mod_thermal_sink_s:     { hull: H_M, demo: 'shoot', support: ['wpn_pulse_laser_s'], ev: ['combat:damage'], stat: 'weaponHeatDissipPct', clip: 9 },
  mod_thermal_sink_m:     { hull: H_DRIFTER, demo: 'shoot', support: ['wpn_pulse_laser_m'], ev: ['combat:damage'], stat: 'weaponHeatDissipPct', clip: 9 },
  mod_targeting_computer_m: { hull: H_DRIFTER, demo: 'shoot', support: ['wpn_pulse_laser_m'], ev: ['combat:damage'], stat: 'weaponDmgMult', clip: 8 },

  // ---- scanners ---------------------------------------------------------------
  mod_sensor_array_l:       { hull: H_L, demo: 'scan', ev: ['scan:pulse'], stat: 'radarRangeMult', clip: 6 },
  mod_survey_suite:         { hull: H_DRIFTER, demo: 'scan', ev: ['scan:pulse'], stat: 'scannerRadiusMult', clip: 6 },
  mod_triangulation_suite_s:{ hull: H_M, demo: 'scan', ev: ['scan:pulse'], stat: 'anomalyPingReduction', clip: 6 },
  mod_cargo_scanner_s:      { hull: H_M, demo: 'scan', ev: ['scan:pulse'], stat: 'revealCargo', clip: 6 },

  // ---- bio / host-lane gear (diagram — needs alien hosts, not combat-staged) ---
  mod_filter_stack_s:        { demo: 'diagram', stat: 'bioFilterMult' },
  mod_filter_stack_m:        { hull: H_DRIFTER, demo: 'diagram', stat: 'bioFilterMult' },
  mod_bio_spectral_pass_s:   { demo: 'diagram', stat: 'bioScanTier' },
  mod_field_coherence_meter: { demo: 'diagram', stat: 'coherenceMeter' },
  mod_quarantine_locker_s:   { demo: 'diagram', stat: 'quarantineLocker' },
  mod_hull_purge_ring_m:     { hull: H_DRIFTER, demo: 'diagram', stat: 'hullPurgeRing' },
  mod_relay_needle_s:        { demo: 'diagram', stat: 'relayNeedle' },
  mod_capture_cradle_m:      { hull: H_DRIFTER, demo: 'diagram', stat: 'captureSurvivalMult' },
  mod_containment_seal_s:    { demo: 'diagram', stat: 'containmentSeal' },
  mod_filament_contrast_s:   { demo: 'diagram', stat: 'filamentContrast' },
  mod_host_cartography_s:    { demo: 'diagram', stat: 'hostMapReveal' },
  mod_echo_recorder_s:       { demo: 'diagram', stat: 'echoRecorder' },

  // ---- grammar-rig attack traits (utility mounts) -----------------------------
  mod_twin_mount:        { hull: H_M, demo: 'trait', support: ['wpn_pulse_laser_s'], ev: ['combat:damage', 'combat:fire'], clip: 8 },
  mod_triad_mount:       { hull: H_DRIFTER, demo: 'trait', support: ['wpn_pulse_laser_m'], ev: ['combat:damage', 'combat:fire'], clip: 8 },
  mod_piercing_core:     { hull: H_M, demo: 'duo_line', support: ['wpn_pulse_laser_s'], ev: ['combat:damage'], clip: 8 },
  mod_forked_core:       { hull: H_M, demo: 'trait', support: ['wpn_pulse_laser_s'], ev: ['combat:damage'], clip: 8 },
  mod_bank_shot:         { hull: H_M, demo: 'bank', support: ['wpn_pulse_laser_s'], ev: ['combat:damage', 'projectile:hit'], clip: 8 },
  mod_smart_bank:        { hull: H_DRIFTER, demo: 'bank', support: ['wpn_pulse_laser_m'], ev: ['combat:damage', 'projectile:hit'], clip: 8 },
  mod_ion_payload:       { hull: H_M, demo: 'trait', support: ['wpn_pulse_laser_s'], ev: ['combat:statusApplied', 'combat:damage'], clip: 8 },
  mod_incendiary_payload:{ hull: H_M, demo: 'trait', support: ['wpn_pulse_laser_s'], ev: ['combat:statusApplied', 'combat:damage'], clip: 8 },
  mod_gravity_tag:       { hull: H_M, demo: 'trait', support: ['wpn_pulse_laser_s'], ev: ['combat:statusApplied', 'combat:damage'], clip: 8 },
  mod_relay_arc:         { hull: H_M, demo: 'trait', support: ['wpn_pulse_laser_s'], ev: ['combat:damage'], clip: 8 },
  mod_bank_relay:        { hull: H_DRIFTER, demo: 'bank', support: ['wpn_pulse_laser_m'], ev: ['combat:damage', 'projectile:hit'], clip: 8 },
  mod_tether_capacitor:  { hull: H_DRIFTER, demo: 'tether_shoot', support: ['mod_tractor_beam_m', 'wpn_pulse_laser_m'], ev: ['tether:latched', 'combat:damage'], clip: 10 },
  mod_conductive_path:   { hull: H_DRIFTER, demo: 'trait', support: ['wpn_pulse_laser_m', 'mod_ion_payload'], ev: ['combat:damage', 'combat:statusApplied'], clip: 8 },
  mod_cryo_payload:      { hull: H_M, demo: 'trait', support: ['wpn_pulse_laser_s'], ev: ['combat:statusApplied', 'combat:damage'], clip: 8 },
  mod_cryo_gyros:        { hull: H_DRIFTER, demo: 'gyros', support: ['wpn_pulse_laser_m'], ev: ['combat:statusApplied', 'combat:damage', 'combat:tumbled'], clip: 9, dist: 25 },
  mod_herald_fan:        { hull: H_M, demo: 'trait', support: ['wpn_pulse_laser_s'], ev: ['combat:damage', 'combat:fire'], clip: 8 },
  mod_storm_carom:       { hull: H_M, demo: 'bank', support: ['wpn_pulse_laser_s'], ev: ['combat:damage', 'projectile:hit'], clip: 8 },
};
