// src/data/modules.js – 23 canonical non-weapon modules.
// IDs use mod_ prefix per ARCHITECTURE §0.4. requiresTech refs use tech_ prefix.
// Covers: shields, engines, cargo, mining lasers, utility. Pure data, no imports.

export const MODULES = [
  // ===================== SHIELDS =====================
  {
    id: 'mod_shield_booster_s', name: 'Shield Booster S', slotType: 'shield', size: 'S', tier: 1, mass: 3, price: 6000,
    energyDraw: 2, mods: { shieldFlat: 60, shieldRegenFlat: 2 },
  },
  {
    id: 'mod_shield_capacitor_m', name: 'Shield Capacitor M', slotType: 'shield', size: 'M', tier: 2, mass: 6, price: 19000, requiresTech: 'tech_deflector_theory',
    energyDraw: 4, mods: { shieldFlat: 180, shieldRegenFlat: 6 },
  },
  {
    id: 'mod_shield_aegis_l', name: 'Aegis Shield L', slotType: 'shield', size: 'L', tier: 4, mass: 14, price: 95000, requiresTech: 'tech_hardened_deflectors',
    energyDraw: 9, mods: { shieldFlat: 520, shieldRegenFlat: 14 },
  },

  // ===================== ENGINES (exactly 1 per ship) =====================
  {
    id: 'mod_engine_ion_m', name: 'Ion Thruster M', slotType: 'engine', size: 'M', tier: 1, mass: 6, price: 7000,
    energyDraw: 4, mods: { topSpeed: 70, accelMult: 1.0, turnMult: 1.0 },
  },
  {
    id: 'mod_engine_fusion_m', name: 'Fusion Drive M', slotType: 'engine', size: 'M', tier: 2, mass: 9, price: 24000, requiresTech: 'tech_drive_tuning',
    energyDraw: 7, mods: { topSpeed: 95, accelMult: 1.3, turnMult: 1.15 },
  },
  {
    id: 'mod_engine_warp_l', name: 'Warp Coil L', slotType: 'engine', size: 'L', tier: 3, mass: 18, price: 70000, requiresTech: 'tech_graviton_drives',
    energyDraw: 12, mods: { topSpeed: 130, accelMult: 1.6, turnMult: 1.25 },
  },

  // ===================== CARGO =====================
  {
    id: 'mod_cargo_pod_m', name: 'Cargo Pod M', slotType: 'cargo', size: 'M', tier: 1, mass: 4, price: 5000,
    energyDraw: 0, mods: { cargoFlat: 50 },
  },
  {
    id: 'mod_cargo_expander_l', name: 'Hold Expander L', slotType: 'cargo', size: 'L', tier: 2, mass: 12, price: 18000, requiresTech: 'tech_bulk_logistics',
    energyDraw: 0, mods: { cargoFlat: 160 },
  },
  {
    id: 'mod_cargo_compactor_l', name: 'Cargo Compactor L', slotType: 'cargo', size: 'L', tier: 3, mass: 8, price: 46000, requiresTech: 'tech_matter_compression',
    energyDraw: 0, mods: { cargoFlat: 110, cargoCapPct: 0.15 },
  },

  // ===================== MINING LASERS =====================
  // dps = ore-HP/s (asteroid damage). beam_mk1 is the starter laser (price 0).
  {
    id: 'mod_mining_laser_s', name: 'Mining Laser S', slotType: 'mining', size: 'S', tier: 1, mass: 3, price: 0,
    energyDraw: 4, dps: 18, range: 240, heatRate: 12, coolRate: 20, directToCargo: false,
  },
  {
    id: 'mod_mining_beam_m', name: 'Mining Beam M', slotType: 'mining', size: 'M', tier: 2, mass: 6, price: 22000, requiresTech: 'tech_focused_extraction',
    energyDraw: 8, dps: 30, range: 300, heatRate: 10, coolRate: 24, directToCargo: false,
  },
  {
    id: 'mod_mining_pulverizer_l', name: 'Mining Pulverizer L', slotType: 'mining', size: 'L', tier: 3, mass: 13, price: 64000, requiresTech: 'tech_deep_core_mining',
    energyDraw: 16, dps: 48, range: 360, heatRate: 8, coolRate: 30, directToCargo: false, rareOreChance: 0.10,
  },
  {
    id: 'mod_mining_industrial_l', name: 'Industrial Extractor L', slotType: 'mining', size: 'L', tier: 4, mass: 16, price: 90000, requiresTech: 'tech_deep_core_mining',
    energyDraw: 20, dps: 70, range: 420, heatRate: 6, coolRate: 40, directToCargo: true,
  },

  // ===================== UTILITY =====================
  {
    id: 'mod_cargo_scanner_s', name: 'Cargo Scanner S', slotType: 'utility', size: 'S', tier: 1, mass: 1, price: 4000,
    energyDraw: 1, mods: { revealCargo: true },
  },
  {
    id: 'mod_market_data_s', name: 'Market Data Uplink S', slotType: 'utility', size: 'S', tier: 1, mass: 1, price: 6000,
    energyDraw: 1, mods: { marketIntel: true },
  },
  {
    id: 'mod_shield_hardener_m', name: 'Shield Hardener M', slotType: 'utility', size: 'M', tier: 2, mass: 5, price: 20000, requiresTech: 'tech_deflector_theory',
    energyDraw: 5, mods: { damageReductionPct: 0.12 },
  },
  {
    id: 'mod_afterburner_m', name: 'Afterburner M', slotType: 'utility', size: 'M', tier: 2, mass: 5, price: 17000, requiresTech: 'tech_drive_tuning',
    energyDraw: 10, mods: { boostTopSpeedPct: 0.40, boostDurS: 4, boostCdS: 12 },
  },
  {
    id: 'mod_repair_nanobots_m', name: 'Repair Nanobots M', slotType: 'utility', size: 'M', tier: 3, mass: 6, price: 38000, requiresTech: 'tech_nanofabrication',
    energyDraw: 3, mods: { hullRepairOOC: 4 },
  },
  {
    id: 'mod_tractor_beam_m', name: 'Tractor Beam M', slotType: 'utility', size: 'M', tier: 2, mass: 4, price: 12000, requiresTech: 'tech_tractor_systems',
    energyDraw: 3, mods: { magnetRange: 400 },
  },
  {
    id: 'mod_targeting_computer_m', name: 'Targeting Computer M', slotType: 'utility', size: 'M', tier: 3, mass: 4, price: 40000, requiresTech: 'tech_fire_control',
    energyDraw: 4, mods: { weaponRangePct: 0.15, weaponDmgPct: 0.08 },
  },
  {
    id: 'mod_sensor_array_l', name: 'Sensor Array L', slotType: 'utility', size: 'L', tier: 3, mass: 8, price: 36000, requiresTech: 'tech_long_range_survey',
    energyDraw: 5, mods: { radarRangePct: 0.60, scanRpBonus: true },
  },
  {
    id: 'mod_drone_bay_l', name: 'Drone Bay L', slotType: 'utility', size: 'L', tier: 3, mass: 14, price: 80000, requiresTech: 'tech_drone_control',
    energyDraw: 4, mods: { droneBay: 1 },
  },
  {
    id: 'mod_jump_drive_m', name: 'Jump Drive T2 M', slotType: 'utility', size: 'M', tier: 2, mass: 6, price: 26000, requiresTech: 'tech_drive_tuning',
    energyDraw: 2, mods: { jumpDriveTier: 2 },
  },
  // Countermeasures (P1-7): chaff breaks missile locks + diverts in-flight missiles to a decoy
  // cloud; ECM jams homing guidance (turnRate → 0) for a duration. Both use the utility slot, are
  // cooldown-gated (not consumable ammo — keeps the loop simple), and give missiles real counterplay
  // beyond pure dodging. Triggered by the player (keybind) + auto-deployed by AI ships that equip one.
  {
    id: 'mod_chaff_dispenser_m', name: 'Chaff Dispenser M', slotType: 'utility', size: 'M', tier: 2, mass: 4, price: 14000, requiresTech: 'tech_deflector_theory',
    energyDraw: 1,
    mods: { countermeasure: { kind: 'chaff', radius: 380, durationS: 3.5, cooldownS: 8, lockBreakPct: 1.0, divertPct: 0.85 } },
  },
  {
    id: 'mod_ecm_jammer_l', name: 'ECM Jammer L', slotType: 'utility', size: 'L', tier: 4, mass: 10, price: 62000, requiresTech: 'tech_fire_control',
    energyDraw: 6,
    mods: { countermeasure: { kind: 'ecm', radius: 520, durationS: 4.0, cooldownS: 12, lockBreakPct: 0.6, turnRateMult: 0.0 } },
  },
];
