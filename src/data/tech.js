// src/data/tech.js – canonical tech nodes across 4 branches.
// IDs use tech_ prefix per ARCHITECTURE §0.4.
// unlock ship IDs use ship_ prefix; module IDs use mod_ (weapons: wpn_).
// prereqs[] reference other tech_ IDs. Pure data, no imports.

export const TECH_NODES = [
  // ---------------- COMBAT branch ----------------
  {
    id: 'tech_combat_basics', name: 'Combat Basics', branch: 'combat', prereqs: [],
    cost: { credits: 6000, rp: 10 },
    unlocks: { ships: ['ship_wasp'], modules: ['wpn_pulse_laser_s', 'wpn_autocannon_s'] },
  },
  {
    id: 'tech_beam_focusing', name: 'Beam Focusing', branch: 'combat', prereqs: ['tech_combat_basics'],
    cost: { credits: 18000, rp: 30 },
    unlocks: { modules: ['wpn_pulse_laser_m', 'wpn_beam_laser_m'] },
  },
  {
    id: 'tech_kinetic_drivers', name: 'Kinetic Drivers', branch: 'combat', prereqs: ['tech_combat_basics'],
    cost: { credits: 22000, rp: 35 },
    unlocks: { modules: ['wpn_autocannon_m', 'wpn_railgun_m'] },
  },
  {
    id: 'tech_guided_ordnance', name: 'Guided Ordnance', branch: 'combat', prereqs: ['tech_combat_basics'],
    cost: { credits: 26000, rp: 45 },
    unlocks: { modules: ['wpn_missile_rack_m'] },
  },
  {
    id: 'tech_plasma_dynamics', name: 'Plasma Dynamics', branch: 'combat', prereqs: ['tech_kinetic_drivers', 'tech_beam_focusing'],
    cost: { credits: 90000, rp: 150 },
    unlocks: { modules: ['wpn_plasma_cannon_m', 'wpn_emp_disruptor_m'] },
  },
  {
    id: 'tech_deflector_theory', name: 'Deflector Theory', branch: 'combat', prereqs: [],
    cost: { credits: 12000, rp: 20 },
    unlocks: { modules: ['mod_shield_capacitor_m', 'mod_shield_hardener_m', 'mod_chaff_dispenser_m'] },
  },
  {
    id: 'tech_hardened_deflectors', name: 'Hardened Deflectors', branch: 'combat', prereqs: ['tech_deflector_theory'],
    cost: { credits: 100000, rp: 140 },
    unlocks: { modules: ['mod_shield_aegis_l'], efficiency: { shieldRegenMult: 0.05 } },
  },
  {
    id: 'tech_strike_craft', name: 'Strike Craft', branch: 'combat', prereqs: ['tech_combat_basics'],
    cost: { credits: 30000, rp: 40 },
    unlocks: { ships: ['ship_hornet'] },
  },
  {
    id: 'tech_fire_control', name: 'Fire Control', branch: 'combat', prereqs: ['tech_strike_craft'],
    cost: { credits: 80000, rp: 110 },
    // Massline-native home of the spool ceiling: this node already grants the three advanced
    // Massline heads (monofilament sweep, transverse snare, twin bridle). Gating the signature
    // mechanic's 6x spool behind Flagship Command forced a capital-empire buy-in VISION.md forbids.
    unlocks: { modules: ['mod_targeting_computer_m', 'mod_ecm_jammer_l', 'mod_monofilament_sweep_m', 'mod_transverse_snare_m', 'mod_twin_bridle_m', 'mod_massline_spool_l'] },
  },
  {
    id: 'tech_warship_license', name: 'Warship License', branch: 'combat', prereqs: ['tech_strike_craft'],
    cost: { credits: 120000, rp: 120 },
    unlocks: { ships: ['ship_bastion'] },
  },
  {
    id: 'tech_capital_weapons', name: 'Capital Weapons', branch: 'combat', prereqs: ['tech_warship_license', 'tech_fire_control'],
    cost: { credits: 600000, rp: 400 },
    unlocks: { ships: ['ship_warden'], modules: ['wpn_heavy_beam_l', 'wpn_torpedo_l'] },
  },
  {
    id: 'tech_capital_hulls', name: 'Capital Hulls', branch: 'combat', prereqs: ['tech_capital_weapons'],
    cost: { credits: 900000, rp: 600 },
    unlocks: { ships: ['ship_colossus'] },
  },
  {
    id: 'tech_flagship_command', name: 'Flagship Command', branch: 'combat', prereqs: ['tech_capital_hulls', 'tech_graviton_drives'],
    cost: { credits: 2500000, rp: 1200 },
    unlocks: { ships: ['ship_leviathan'], modules: ['wpn_siege_lance_l'] },
  },
  {
    id: 'tech_attack_topology', name: 'Attack Topology', branch: 'combat', prereqs: ['tech_combat_basics'],
    cost: { credits: 28000, rp: 40 },
    unlocks: { modules: ['mod_twin_mount', 'mod_triad_mount', 'mod_piercing_core', 'mod_forked_core'] },
  },
  {
    id: 'tech_ricochet_ballistics', name: 'Ricochet Ballistics', branch: 'combat', prereqs: ['tech_attack_topology'],
    cost: { credits: 42000, rp: 70 },
    unlocks: { modules: ['mod_bank_shot', 'mod_smart_bank', 'mod_bank_relay'] },
  },
  {
    id: 'tech_payload_conduction', name: 'Payload Conduction', branch: 'combat', prereqs: ['tech_attack_topology', 'tech_plasma_dynamics'],
    cost: { credits: 110000, rp: 160 },
    unlocks: { modules: ['mod_ion_payload', 'mod_incendiary_payload', 'mod_gravity_tag', 'mod_relay_arc', 'mod_conductive_path', 'mod_cryo_payload'] },
  },
  {
    id: 'tech_orbit_cryo', name: 'Cryo Orbitals', branch: 'combat', prereqs: ['tech_payload_conduction'],
    cost: { credits: 140000, rp: 200 },
    unlocks: { modules: ['mod_cryo_gyros'] },
  },

  // ---------------- INDUSTRY branch (5 nodes) ----------------
  {
    id: 'tech_industrial_mining', name: 'Industrial Mining', branch: 'industry', prereqs: [],
    cost: { credits: 25000, rp: 30 },
    unlocks: { ships: ['ship_ironback'] },
  },
  {
    id: 'tech_focused_extraction', name: 'Focused Extraction', branch: 'industry', prereqs: ['tech_industrial_mining'],
    cost: { credits: 30000, rp: 40 },
    unlocks: { modules: ['mod_mining_beam_m'], efficiency: { miningYieldMult: 0.10 } },
  },
  {
    id: 'tech_deep_core_mining', name: 'Deep-Core Mining', branch: 'industry', prereqs: ['tech_focused_extraction'],
    cost: { credits: 110000, rp: 160 },
    unlocks: { modules: ['mod_mining_pulverizer_l', 'mod_mining_industrial_l'], efficiency: { miningYieldMult: 0.15 } },
  },
  {
    id: 'tech_bulk_logistics', name: 'Bulk Logistics', branch: 'industry', prereqs: [],
    cost: { credits: 20000, rp: 25 },
    unlocks: { ships: ['ship_atlas'], modules: ['mod_cargo_expander_l', 'mod_massline_spool_m', 'mod_smuggler_hold_m'] },
  },
  {
    id: 'tech_matter_compression', name: 'Matter Compression', branch: 'industry', prereqs: ['tech_bulk_logistics'],
    cost: { credits: 90000, rp: 130 },
    unlocks: { modules: ['mod_cargo_compactor_l'] },
  },

  // ---------------- DRIVES branch (5 nodes) ----------------
  {
    id: 'tech_drive_tuning', name: 'Drive Tuning', branch: 'drives', prereqs: [],
    cost: { credits: 15000, rp: 20 },
    unlocks: { modules: ['mod_engine_fusion_m', 'mod_afterburner_m', 'mod_jump_drive_m', 'mod_cloak_mk2', 'mod_sensor_scrambler_m'] },
  },
  {
    id: 'tech_impulse_ballistics', name: 'Impulse Ballistics', branch: 'drives', prereqs: ['tech_drive_tuning'],
    cost: { credits: 85000, rp: 120 },
    unlocks: { modules: ['mod_charge_vector_rack'] },
  },
  {
    id: 'tech_graviton_drives', name: 'Graviton Drives', branch: 'drives', prereqs: ['tech_drive_tuning'],
    cost: { credits: 95000, rp: 150 },
    unlocks: { modules: ['mod_engine_warp_l', 'wpn_gravity_marker_s', 'wpn_momentum_sink_s'], efficiency: { energyRegenMult: 0.08 } },
  },
  {
    id: 'tech_long_range_survey', name: 'Long-Range Survey', branch: 'drives', prereqs: ['tech_drive_tuning'],
    cost: { credits: 60000, rp: 90 },
    // Folded: the former tech_advanced_navigation pure-stat node (jumpRangeMult +0.20 /
    // jumpCooldownMult -0.15) merged here — a node that unlocks nothing but numbers is the
    // "170 -> 212" failure VISION.md names. Saves that already researched the old node keep their
    // persisted efficiencyMods; saves that stopped at Survey gain the bonus going forward.
    unlocks: { ships: ['ship_ranger'], modules: ['mod_sensor_array_l', 'mod_sensor_post', 'mod_triangulation_suite_s'], flags: ['wormhole_access'], efficiency: { jumpRangeMult: 0.20, jumpCooldownMult: -0.15 } },
  },

  // ---------------- LOGISTICS branch (6 nodes) ----------------
  {
    id: 'tech_tractor_systems', name: 'Tractor Systems', branch: 'logistics', prereqs: [],
    cost: { credits: 10000, rp: 15 },
    unlocks: { modules: ['mod_tractor_beam_m', 'mod_elastic_whip_m', 'mod_frame_coupler_m', 'mod_tether_capacitor'] },
  },
  {
    id: 'tech_drone_control', name: 'Drone Control', branch: 'logistics', prereqs: ['tech_tractor_systems'],
    cost: { credits: 70000, rp: 100 },
    unlocks: { modules: ['mod_drone_bay_l'], droneTierCap: 1 },
  },
  {
    id: 'tech_drone_swarm', name: 'Drone Swarm', branch: 'logistics', prereqs: ['tech_drone_control'],
    cost: { credits: 200000, rp: 260 },
    unlocks: { droneTierCap: 2, extraDronePerBay: 1 },
  },
  {
    id: 'tech_autonomous_fleets', name: 'Autonomous Fleets', branch: 'logistics', prereqs: ['tech_drone_swarm'],
    cost: { credits: 500000, rp: 500 },
    unlocks: { droneTierCap: 3, npcTraderHiring: true },
  },
  {
    id: 'tech_nanofabrication', name: 'Nanofabrication', branch: 'logistics', prereqs: ['tech_drone_control'],
    cost: { credits: 140000, rp: 180 },
    unlocks: { modules: ['mod_repair_nanobots_m'] },
  },
  {
    id: 'tech_outpost_charter', name: 'Outpost Charter', branch: 'logistics', prereqs: ['tech_autonomous_fleets'],
    cost: { credits: 800000, rp: 700 },
    unlocks: { droneTierCap: 4, outpostConstruction: true },
  },
];

export function techDisplayName(id) {
  const node = TECH_NODES.find((entry) => entry.id === id);
  return (node && node.name) || String(id || 'required tech').replace(/^tech_/, '').replace(/_/g, ' ');
}
