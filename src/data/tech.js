// src/data/tech.js – 28 canonical tech nodes across 4 branches.
// IDs use tech_ prefix per ARCHITECTURE §0.4.
// unlock ship IDs use ship_ prefix; module IDs use mod_ (weapons: wpn_).
// prereqs[] reference other tech_ IDs. Pure data, no imports.

export const TECH_NODES = [
  // ---------------- COMBAT branch (13 nodes) ----------------
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
    unlocks: { modules: ['wpn_plasma_cannon_m'] },
  },
  {
    id: 'tech_deflector_theory', name: 'Deflector Theory', branch: 'combat', prereqs: [],
    cost: { credits: 12000, rp: 20 },
    unlocks: { modules: ['mod_shield_capacitor_m', 'mod_shield_hardener_m'] },
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
    unlocks: { modules: ['mod_targeting_computer_m'] },
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

  // ---------------- INDUSTRY branch (5 nodes) ----------------
  {
    id: 'tech_industrial_mining', name: 'Industrial Mining', branch: 'industry', prereqs: [],
    cost: { credits: 25000, rp: 30 },
    unlocks: { ships: ['ship_ironback'], modules: ['mod_mining_beam_m'] },
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
    unlocks: { ships: ['ship_atlas'], modules: ['mod_cargo_expander_l'] },
  },
  {
    id: 'tech_matter_compression', name: 'Matter Compression', branch: 'industry', prereqs: ['tech_bulk_logistics'],
    cost: { credits: 90000, rp: 130 },
    unlocks: { modules: ['mod_cargo_compactor_l'] },
  },

  // ---------------- DRIVES branch (4 nodes) ----------------
  {
    id: 'tech_drive_tuning', name: 'Drive Tuning', branch: 'drives', prereqs: [],
    cost: { credits: 15000, rp: 20 },
    unlocks: { modules: ['mod_engine_fusion_m', 'mod_afterburner_m', 'mod_jump_drive_m'] },
  },
  {
    id: 'tech_graviton_drives', name: 'Graviton Drives', branch: 'drives', prereqs: ['tech_drive_tuning'],
    cost: { credits: 95000, rp: 150 },
    unlocks: { modules: ['mod_engine_warp_l'], efficiency: { energyRegenMult: 0.08 } },
  },
  {
    id: 'tech_long_range_survey', name: 'Long-Range Survey', branch: 'drives', prereqs: ['tech_drive_tuning'],
    cost: { credits: 60000, rp: 90 },
    unlocks: { ships: ['ship_ranger'], modules: ['mod_sensor_array_l'], flags: ['wormhole_access'] },
  },
  {
    id: 'tech_advanced_navigation', name: 'Advanced Navigation', branch: 'drives', prereqs: ['tech_long_range_survey'],
    cost: { credits: 180000, rp: 220 },
    unlocks: { efficiency: { jumpRangeMult: 0.20, jumpCooldownMult: -0.15 } },
  },

  // ---------------- LOGISTICS branch (6 nodes) ----------------
  {
    id: 'tech_tractor_systems', name: 'Tractor Systems', branch: 'logistics', prereqs: [],
    cost: { credits: 10000, rp: 15 },
    unlocks: { modules: ['mod_tractor_beam_m'] },
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
