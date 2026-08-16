// src/data/tech.js – canonical tech nodes across four player fantasies.
// IDs use tech_ prefix per ARCHITECTURE §0.4.
// unlock ship IDs use ship_ prefix; module IDs use mod_ (weapons: wpn_).
// prereqs[] reference other tech_ IDs. Pure data, no imports.

export const TECH_NODES = [
  // ---------------- KINESIS — momentum, impulse, gravity, committed combat ----------------
  {
    id: 'tech_combat_basics', name: 'Combat Basics', branch: 'kinesis', prereqs: [],
    cost: { credits: 6000, rp: 10 },
    unlocks: { ships: ['ship_wasp'], modules: ['wpn_pulse_laser_s', 'wpn_autocannon_s'] },
  },
  {
    id: 'tech_beam_focusing', name: 'Beam Focusing', branch: 'ghost', prereqs: ['tech_deflector_theory'],
    cost: { credits: 18000, rp: 30 },
    unlocks: { modules: ['wpn_pulse_laser_m', 'wpn_beam_laser_m'] },
  },
  {
    id: 'tech_kinetic_drivers', name: 'Kinetic Drivers', branch: 'kinesis', prereqs: ['tech_combat_basics'],
    cost: { credits: 22000, rp: 14 },
    unlocks: { modules: ['wpn_autocannon_m', 'wpn_railgun_m'] },
  },
  {
    id: 'tech_guided_ordnance', name: 'Guided Ordnance', branch: 'kinesis', prereqs: ['tech_combat_basics'],
    cost: { credits: 26000, rp: 16 },
    unlocks: { modules: ['wpn_missile_rack_m'] },
  },
  {
    id: 'tech_plasma_dynamics', name: 'Plasma Dynamics', branch: 'kinesis', prereqs: ['tech_kinetic_drivers', 'tech_guided_ordnance'],
    cost: { credits: 90000, rp: 20 },
    unlocks: { modules: ['wpn_plasma_cannon_m', 'wpn_emp_disruptor_m'] },
  },
  {
    id: 'tech_deflector_theory', name: 'Deflector Theory', branch: 'ghost', prereqs: [],
    cost: { credits: 12000, rp: 20 },
    unlocks: { modules: ['mod_shield_capacitor_m', 'mod_shield_hardener_m', 'mod_chaff_dispenser_m'] },
  },
  {
    id: 'tech_hardened_deflectors', name: 'Hardened Deflectors', branch: 'ghost', prereqs: ['tech_deflector_theory'],
    cost: { credits: 100000, rp: 35 },
    unlocks: { modules: ['mod_shield_aegis_l'], efficiency: { shieldRegenMult: 0.05 } },
  },
  {
    id: 'tech_strike_craft', name: 'Strike Craft', branch: 'kinesis', prereqs: ['tech_combat_basics'],
    cost: { credits: 30000, rp: 14 },
    unlocks: { ships: ['ship_hornet'] },
  },
  {
    id: 'tech_fire_control', name: 'Twin-Line Authority', branch: 'bond', prereqs: ['tech_bulk_logistics'],
    cost: { credits: 80000, rp: 145 },
    // Massline-native home of the spool ceiling: this node already grants the three advanced
    // Massline heads (monofilament sweep, transverse snare, twin bridle). Gating the signature
    // mechanic's 6x spool behind Flagship Command forced a capital-empire buy-in VISION.md forbids.
    featGate: ['feat_tether_kills', 'feat_capital_tow', 'feat_slingshot_deployments'],
    capstone: { verb: 'two_line_rig', label: 'Link two world bodies with a player-controlled Twin Bridle.' },
    unlocks: { modules: ['mod_targeting_computer_m', 'mod_ecm_jammer_l', 'mod_monofilament_sweep_m', 'mod_transverse_snare_m', 'mod_twin_bridle_m', 'mod_massline_spool_l'], verbs: ['two_line_rig'] },
  },
  {
    id: 'tech_warship_license', name: 'Warship License', branch: 'kinesis', prereqs: ['tech_strike_craft'],
    cost: { credits: 120000, rp: 18 },
    unlocks: { ships: ['ship_bastion'] },
  },
  {
    id: 'tech_capital_weapons', name: 'Capital Weapons', branch: 'kinesis', prereqs: ['tech_warship_license'],
    cost: { credits: 600000, rp: 22 },
    unlocks: { ships: ['ship_warden'], modules: ['wpn_heavy_beam_l', 'wpn_torpedo_l'] },
  },
  {
    id: 'tech_capital_hulls', name: 'Capital Hulls', branch: 'kinesis', prereqs: ['tech_capital_weapons'],
    cost: { credits: 900000, rp: 28 },
    unlocks: { ships: ['ship_colossus'] },
  },
  {
    id: 'tech_flagship_command', name: 'Paired-Well Command', branch: 'kinesis', prereqs: ['tech_capital_hulls', 'tech_graviton_drives'],
    cost: { credits: 2500000, rp: 30 },
    featGate: ['feat_terrain_smashes', 'feat_well_collapses', 'feat_chain_three'],
    capstone: { verb: 'paired_wells', label: 'Deploy a second gravity Well before the first collapses.' },
    unlocks: { ships: ['ship_leviathan'], modules: ['wpn_siege_lance_l'], verbs: ['paired_wells'] },
  },

  // ---------------- INDUSTRY — extraction, fabrication, automation, owned places ----------------
  {
    id: 'tech_industrial_mining', name: 'Industrial Mining', branch: 'industry', prereqs: [],
    cost: { credits: 25000, rp: 10 },
    unlocks: { ships: ['ship_ironback'] },
  },
  {
    id: 'tech_focused_extraction', name: 'Focused Extraction', branch: 'industry', prereqs: ['tech_industrial_mining'],
    cost: { credits: 30000, rp: 15 },
    unlocks: { modules: ['mod_mining_beam_m'], efficiency: { miningYieldMult: 0.10 } },
  },
  {
    id: 'tech_deep_core_mining', name: 'Deep-Core Mining', branch: 'industry', prereqs: ['tech_focused_extraction'],
    cost: { credits: 110000, rp: 25 },
    unlocks: { modules: ['mod_mining_pulverizer_l', 'mod_mining_industrial_l'], efficiency: { miningYieldMult: 0.15 } },
  },
  {
    id: 'tech_bulk_logistics', name: 'Bulk Logistics', branch: 'bond', prereqs: ['tech_tractor_systems'],
    cost: { credits: 20000, rp: 45 },
    unlocks: { ships: ['ship_atlas'], modules: ['mod_cargo_expander_l', 'mod_massline_spool_m'] },
  },
  {
    id: 'tech_matter_compression', name: 'Matter Compression', branch: 'industry', prereqs: ['tech_deep_core_mining'],
    cost: { credits: 90000, rp: 30 },
    unlocks: { modules: ['mod_cargo_compactor_l'] },
  },

  // ---------------- GHOST / KINESIS bridge — evasion, survey, impulse fields ----------------
  {
    id: 'tech_drive_tuning', name: 'Drive Tuning', branch: 'ghost', prereqs: [],
    cost: { credits: 15000, rp: 20 },
    unlocks: { modules: ['mod_engine_fusion_m', 'mod_afterburner_m', 'mod_jump_drive_m', 'mod_cloak_mk2'] },
  },
  {
    id: 'tech_impulse_ballistics', name: 'Impulse Ballistics', branch: 'kinesis', prereqs: ['tech_combat_basics'],
    cost: { credits: 85000, rp: 18 },
    unlocks: { modules: ['mod_charge_vector_rack'] },
  },
  {
    id: 'tech_graviton_drives', name: 'Graviton Drives', branch: 'kinesis', prereqs: ['tech_impulse_ballistics'],
    cost: { credits: 95000, rp: 22 },
    unlocks: { modules: ['mod_engine_warp_l', 'wpn_gravity_marker_s', 'wpn_momentum_sink_s', 'wpn_impulse_lance_m'], efficiency: { energyRegenMult: 0.08 } },
  },
  {
    id: 'tech_long_range_survey', name: 'Far-Side Listening', branch: 'ghost', prereqs: ['tech_drive_tuning'],
    cost: { credits: 60000, rp: 110 },
    // Folded: the former tech_advanced_navigation pure-stat node (jumpRangeMult +0.20 /
    // jumpCooldownMult -0.15) merged here — a node that unlocks nothing but numbers is the
    // "170 -> 212" failure VISION.md names. Saves that already researched the old node keep their
    // persisted efficiencyMods; saves that stopped at Survey gain the bonus going forward.
    featGate: ['feat_scans_run', 'feat_ambushes_survived', 'feat_ghost_discovered'],
    capstone: { verb: 'sensor_post', label: 'Build a physical Sensor Post that files local hidden-contact leads.' },
    unlocks: { ships: ['ship_ranger'], modules: ['mod_sensor_array_l', 'mod_sensor_post'], flags: ['wormhole_access'], verbs: ['sensor_post'], efficiency: { jumpRangeMult: 0.20, jumpCooldownMult: -0.15 } },
  },

  // ---------------- BOND / INDUSTRY bridge — Massline authority and autonomous work ----------------
  {
    id: 'tech_tractor_systems', name: 'Tractor Systems', branch: 'bond', prereqs: [],
    cost: { credits: 10000, rp: 20 },
    unlocks: { modules: ['mod_tractor_beam_m', 'mod_elastic_whip_m', 'mod_frame_coupler_m'] },
  },
  {
    id: 'tech_drone_control', name: 'Drone Control', branch: 'industry', prereqs: ['tech_industrial_mining'],
    cost: { credits: 70000, rp: 20 },
    unlocks: { modules: ['mod_drone_bay_l'], droneTierCap: 1 },
  },
  {
    id: 'tech_drone_swarm', name: 'Drone Swarm', branch: 'industry', prereqs: ['tech_drone_control'],
    cost: { credits: 200000, rp: 25 },
    unlocks: { droneTierCap: 2, extraDronePerBay: 1 },
  },
  {
    id: 'tech_autonomous_fleets', name: 'Autonomous Fleets', branch: 'industry', prereqs: ['tech_drone_swarm'],
    cost: { credits: 500000, rp: 30 },
    unlocks: { droneTierCap: 3, npcTraderHiring: true },
  },
  {
    id: 'tech_nanofabrication', name: 'Nanofabrication', branch: 'industry', prereqs: ['tech_drone_control'],
    cost: { credits: 140000, rp: 25 },
    unlocks: { modules: ['mod_repair_nanobots_m'] },
  },
  {
    id: 'tech_outpost_charter', name: 'Living Outpost Charter', branch: 'industry', prereqs: ['tech_autonomous_fleets'],
    cost: { credits: 800000, rp: 55 },
    featGate: ['feat_perfect_resonance', 'feat_cores_cracked', 'feat_raid_defended'],
    capstone: { verb: 'physical_outpost', label: 'Build a persistent working outpost in the current space.' },
    unlocks: { droneTierCap: 4, outpostConstruction: true, verbs: ['physical_outpost'] },
  },
];

export function techDisplayName(id) {
  const node = TECH_NODES.find((entry) => entry.id === id);
  return (node && node.name) || String(id || 'required tech').replace(/^tech_/, '').replace(/_/g, ' ');
}
