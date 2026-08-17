// src/data/modules.js – canonical non-weapon modules.
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
  {
    id: 'unique_choir_bell_aegis', baseId: 'mod_shield_aegis_l', name: 'Choir-Bell Aegis', slotType: 'shield', size: 'L', tier: 4, mass: 14, price: 0,
    energyDraw: 13.5, purchasable: false, unique: true, salvageOnly: true,
    mods: { shieldFlat: 650, shieldRegenFlat: 14, reactiveMissileKnockback: { usesPerEncounter: 1 } },
    variantBonuses: { shieldFlatPct: 0.25, energyDrawPct: 0.50, missileKnockbackUsesPerEncounter: 1 },
  },

  // ===================== ENGINES (exactly 1 per ship) =====================
  {
    id: 'mod_engine_ion_m', name: 'Ion Thruster M', slotType: 'engine', size: 'M', tier: 1, mass: 6, price: 7000,
    energyDraw: 4, mods: { topSpeed: 70, accelMult: 1.0, turnMult: 1.0, travelCeilingMult: 1.0 },
  },
  {
    id: 'mod_engine_fusion_m', name: 'Fusion Drive M', slotType: 'engine', size: 'M', tier: 2, mass: 9, price: 24000, requiresTech: 'tech_drive_tuning',
    energyDraw: 7, mods: { topSpeed: 95, accelMult: 1.3, turnMult: 1.15, travelCeilingMult: 1.15 },
  },
  {
    id: 'mod_engine_warp_l', name: 'Warp Coil L', slotType: 'engine', size: 'L', tier: 3, mass: 18, price: 70000, requiresTech: 'tech_graviton_drives',
    energyDraw: 12, mods: { topSpeed: 130, accelMult: 1.6, turnMult: 1.25, travelCeilingMult: 1.30 },
  },
  {
    id: 'unique_pale_coil_warp_drive', baseId: 'mod_engine_warp_l', name: 'Pale-Coil Warp Drive', slotType: 'engine', size: 'L', tier: 3, mass: 18, price: 0,
    energyDraw: 12, purchasable: false, unique: true, salvageOnly: true,
    mods: { topSpeed: 149.5, accelMult: 1.6, turnMult: 1.25, travelCeilingMult: 1.40, microJumpBlink: { usesPerEncounter: 1 } },
    variantBonuses: { topSpeedPct: 0.15, microJumpBlinkUsesPerEncounter: 1 },
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
    energyDraw: 4, dps: 18, range: 240, directToCargo: false,
  },
  {
    id: 'mod_mining_beam_m', name: 'Mining Beam M', slotType: 'mining', size: 'M', tier: 2, mass: 6, price: 22000, requiresTech: 'tech_focused_extraction',
    energyDraw: 8, dps: 30, range: 300, directToCargo: false,
  },
  {
    id: 'mod_mining_pulverizer_l', name: 'Mining Pulverizer L', slotType: 'mining', size: 'L', tier: 3, mass: 13, price: 64000, requiresTech: 'tech_deep_core_mining',
    energyDraw: 16, dps: 48, range: 360, directToCargo: false, rareOreChance: 0.10,
  },
  {
    id: 'mod_mining_industrial_l', name: 'Industrial Extractor L', slotType: 'mining', size: 'L', tier: 4, mass: 16, price: 90000, requiresTech: 'tech_deep_core_mining',
    energyDraw: 20, dps: 70, range: 420, directToCargo: true,
  },

  // ===================== UTILITY =====================
  {
    id: 'mod_cargo_scanner_s', name: 'Cargo Scanner S', slotType: 'utility', size: 'S', tier: 1, mass: 1, price: 4000,
    energyDraw: 1, mods: { revealCargo: true },
  },
  {
    id: 'unique_truesight_scanner', baseId: 'mod_cargo_scanner_s', name: 'Truesight Scanner', slotType: 'utility', size: 'S', tier: 1, mass: 1, price: 0,
    energyDraw: 1, purchasable: false, unique: true, salvageOnly: true,
    mods: { revealCargo: true, scanRangeMult: 1.50 },
    variantBonuses: { scanRangePct: 0.50 },
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
    id: 'unique_knitbots', baseId: 'mod_repair_nanobots_m', name: 'Knitbots', slotType: 'utility', size: 'M', tier: 3, mass: 6, price: 0,
    energyDraw: 3, purchasable: false, unique: true, salvageOnly: true,
    mods: { hullRepairOOC: 4.4, repairDockedDrones: true },
    variantBonuses: { hullRepairPct: 0.10, repairDockedDrones: true },
  },
  {
    id: 'mod_tractor_beam_m', name: 'Tractor Beam M', slotType: 'utility', size: 'M', tier: 2, mass: 4, price: 12000, requiresTech: 'tech_tractor_systems',
    // magnetRange must beat mining.MAGNET_RANGE floor (420) so the fitted tractor is player-felt.
    energyDraw: 3, mods: { magnetRange: 560, masslineHeadId: 'tractor' },
  },
  {
    id: 'unique_tideline_tractor', baseId: 'mod_tractor_beam_m', name: 'Tideline Tractor', slotType: 'utility', size: 'M', tier: 2, mass: 4, price: 0,
    energyDraw: 6, purchasable: false, unique: true, salvageOnly: true,
    mods: { magnetRange: 780, tractorWholeWrecks: true, masslineHeadId: 'tractor' },
    variantBonuses: { magnetRangePct: 0.80, energyDrawPct: 1.00, tractorWholeWrecks: true },
  },
  {
    id: 'mod_elastic_whip_m', name: 'Elastic Whip M', slotType: 'utility', size: 'M', tier: 2, mass: 4, price: 16000, requiresTech: 'tech_tractor_systems',
    energyDraw: 4, mods: { masslineHeadId: 'elastic_whip' },
  },
  {
    id: 'mod_frame_coupler_m', name: 'Frame Coupler M', slotType: 'utility', size: 'M', tier: 2, mass: 5, price: 22000, requiresTech: 'tech_tractor_systems',
    energyDraw: 5, mods: { masslineHeadId: 'frame_coupler' },
  },
  {
    id: 'mod_monofilament_sweep_m', name: 'Monofilament Sweep M', slotType: 'utility', size: 'M', tier: 3, mass: 5, price: 44000, requiresTech: 'tech_fire_control',
    energyDraw: 6, mods: { masslineHeadId: 'monofilament_sweep' },
  },
  {
    id: 'mod_transverse_snare_m', name: 'Transverse Snare M', slotType: 'utility', size: 'M', tier: 3, mass: 6, price: 52000, requiresTech: 'tech_fire_control',
    energyDraw: 7, mods: { masslineHeadId: 'transverse_snare' },
  },
  {
    id: 'mod_twin_bridle_m', name: 'Twin Bridle M', slotType: 'utility', size: 'M', tier: 3, mass: 7, price: 68000, requiresTech: 'tech_fire_control',
    energyDraw: 8, mods: { masslineHeadId: 'twin_bridle' },
  },
  {
    id: 'mod_targeting_computer_m', name: 'Targeting Computer M', slotType: 'utility', size: 'M', tier: 3, mass: 4, price: 40000, requiresTech: 'tech_fire_control',
    energyDraw: 4, mods: { weaponRangePct: 0.15, weaponDmgPct: 0.08 },
  },
  {
    id: 'mod_sensor_array_l', name: 'Sensor Array L', slotType: 'utility', size: 'L', tier: 3, mass: 8, price: 36000, requiresTech: 'tech_long_range_survey',
    // scanRpBonus: research points granted per ordinary freeflight scan pulse (missions writer).
    energyDraw: 5, mods: { radarRangePct: 0.60, scanRpBonus: 2 },
  },
  {
    id: 'mod_drone_bay_l', name: 'Drone Bay L', slotType: 'utility', size: 'L', tier: 3, mass: 14, price: 80000, requiresTech: 'tech_drone_control',
    energyDraw: 4, mods: { droneBay: 1 },
  },
  {
    id: 'mod_jump_drive_m', name: 'Jump Drive T2 M', slotType: 'utility', size: 'M', tier: 2, mass: 6, price: 26000, requiresTech: 'tech_drive_tuning',
    energyDraw: 2, mods: { jumpDriveTier: 2 },
  },
  // Role kits (SPEC2/05): data-only hooks for economy/mining/tether progression.
  {
    id: 'mod_ram_plate', name: 'Ram Plate', slotType: 'utility', size: 'S', tier: 1, mass: 4, price: 6000,
    energyDraw: 0, mods: { ramDamageDealtMult: 1.80 },
  },
  {
    id: 'mod_winch_hd', name: 'Heavy-Duty Winch', slotType: 'utility', size: 'S', tier: 1, mass: 3, price: 12000,
    energyDraw: 2, mods: { tetherReelRateMult: 1.80, tetherSpoolMult: 1.5 },
  },
  {
    id: 'mod_massline_spool_m', name: 'Industrial Massline Spool', slotType: 'utility', size: 'M', tier: 3,
    mass: 8, price: 46000, requiresTech: 'tech_bulk_logistics',
    energyDraw: 4, mods: { tetherSpoolMult: 3 },
  },
  {
    id: 'mod_massline_spool_l', name: 'Capital Massline Spool', slotType: 'utility', size: 'L', tier: 5,
    mass: 20, price: 220000, requiresTech: 'tech_fire_control',
    energyDraw: 8, mods: { tetherSpoolMult: 6 },
  },
  // Massline Physics Identity (Wave M2 §4.2): activated stealth. cloakBaseRadius is the DETECTION
  // ring while dark (smaller = better cloak); drain/recharge are the energy-bar rates per second.
  // Consumed by systems/cloak.js via the fittings record — deliberately NOT folded into derived.
  {
    id: 'mod_cloak_mk1', name: 'Shroud Cloak Mk1', slotType: 'utility', size: 'M', tier: 2, mass: 6, price: 34000,
    energyDraw: 3, mods: { cloakBaseRadius: 320, cloakDrainPerS: 0.09, cloakRechargePerS: 0.06 },
  },
  {
    id: 'mod_cloak_mk2', name: 'Shroud Cloak Mk2', slotType: 'utility', size: 'M', tier: 4, mass: 8, price: 120000, requiresTech: 'tech_drive_tuning',
    energyDraw: 5, mods: { cloakBaseRadius: 210, cloakDrainPerS: 0.07, cloakRechargePerS: 0.08 },
  },
  {
    id: 'unique_quietcloak', baseId: 'mod_cloak_mk2', name: 'Quietcloak', slotType: 'utility', size: 'M', tier: 4, mass: 8, price: 0,
    energyDraw: 5, purchasable: false, unique: true, salvageOnly: true,
    mods: { cloakBaseRadius: 168, cloakDrainPerS: 0.056, cloakRechargePerS: 0.096 },
    variantBonuses: { cloakRadiusPct: -0.20, cloakDrainPct: -0.20, cloakRechargePct: 0.20 },
  },
  {
    id: 'mod_charge_rack', name: 'Impulse Charge Rack', slotType: 'utility', size: 'S', tier: 1, mass: 2, price: 18000,
    energyDraw: 1, mods: { impulseChargeCapacity: 8 },
  },
  {
    id: 'mod_charge_vector_rack', name: 'Vector Charge Rack', slotType: 'utility', size: 'S', tier: 3, mass: 3, price: 52000,
    requiresTech: 'tech_impulse_ballistics', energyDraw: 2,
    mods: { impulseChargeCapacity: 8, bombPropulsion: true },
  },
  {
    id: 'mod_drill_amp', name: 'Drill Amp', slotType: 'utility', size: 'S', tier: 2, mass: 3, price: 24000,
    energyDraw: 2, mods: { richCoreRingPctBonus: 0.04 },
  },
  {
    id: 'mod_survey_suite', name: 'Survey Suite', slotType: 'utility', size: 'M', tier: 2, mass: 4, price: 30000,
    energyDraw: 3, mods: { scannerRadiusMult: 1.50, pingPersistMult: 2.00, radarRangePct: 0.35 },
  },
  {
    id: 'unique_deepsurvey_suite', baseId: 'mod_survey_suite', name: 'Deepsurvey Suite', slotType: 'utility', size: 'M', tier: 2, mass: 4, price: 0,
    energyDraw: 4.5, purchasable: false, unique: true, salvageOnly: true,
    mods: { scannerRadiusMult: 2.25, pingPersistMult: 4.00, radarRangePct: 0.35, overusePingThreshold: 3 },
    variantBonuses: { scannerRadiusPct: 0.50, pingPersistPct: 1.00, energyDrawPct: 0.50 },
  },
  {
    id: 'mod_smuggler_hold', name: 'Smuggler Hold', slotType: 'cargo', size: 'S', tier: 2, mass: 4, price: 38000,
    energyDraw: 0, legality: 'contraband', mods: { hiddenCargoPct: 0.20, cargoFlat: 8 },
  },
  {
    id: 'mod_smuggler_hold_m', name: 'Smuggler Hold M', slotType: 'cargo', size: 'M', tier: 3, mass: 8, price: 92000,
    requiresTech: 'tech_bulk_logistics', energyDraw: 1, legality: 'contraband',
    mods: { hiddenCargoPct: 0.35, cargoFlat: 20 },
  },
  {
    id: 'mod_sensor_scrambler_s', name: 'Sensor Scrambler S', slotType: 'utility', size: 'S', tier: 1, mass: 2, price: 16000,
    energyDraw: 2, legality: 'restricted',
    mods: { scannerCloak: 0.25 },
  },
  {
    id: 'mod_sensor_scrambler_m', name: 'Sensor Scrambler M', slotType: 'utility', size: 'M', tier: 3, mass: 5, price: 48000,
    requiresTech: 'tech_drive_tuning', energyDraw: 4, legality: 'contraband',
    mods: { scannerCloak: 0.50 },
  },
  {
    id: 'unique_phantom_scrambler', baseId: 'mod_sensor_scrambler_m', name: 'Phantom Scrambler', slotType: 'utility', size: 'M', tier: 3, mass: 5, price: 0,
    energyDraw: 4, purchasable: false, unique: true, salvageOnly: true,
    mods: { scannerCloak: 0.70 },
    variantBonuses: { scannerCloakPct: 0.40 },
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
    id: 'unique_smokesong_chaff', baseId: 'mod_chaff_dispenser_m', name: 'Smokesong Chaff', slotType: 'utility', size: 'M', tier: 2, mass: 4, price: 0,
    energyDraw: 1, purchasable: false, unique: true, salvageOnly: true,
    mods: { countermeasure: { kind: 'chaff', radius: 608, durationS: 3.5, cooldownS: 16, lockBreakPct: 1.0, divertPct: 1.0, divertChanceMult: 1.50 } },
    variantBonuses: { radiusPct: 0.60, divertPct: 0.50, cooldownPct: 1.00 },
  },
  {
    id: 'mod_ecm_jammer_l', name: 'ECM Jammer L', slotType: 'utility', size: 'L', tier: 4, mass: 10, price: 62000, requiresTech: 'tech_fire_control',
    energyDraw: 6,
    mods: { countermeasure: { kind: 'ecm', radius: 520, durationS: 4.0, cooldownS: 12, lockBreakPct: 0.6, turnRateMult: 0.0 } },
  },
  {
    id: 'mod_thermal_sink_s', name: 'Thermal Sink S', slotType: 'utility', size: 'S', tier: 1, mass: 2, price: 6500,
    energyDraw: 1,
    mods: { weaponHeatDissipPct: 0.25 },
  },
  {
    id: 'mod_thermal_sink_m', name: 'Thermal Sink Booster M', slotType: 'utility', size: 'M', tier: 2, mass: 4, price: 18000, requiresTech: 'tech_beam_focusing',
    energyDraw: 2,
    mods: { weaponHeatDissipPct: 0.40 },
  },
  {
    id: 'unique_cryo_shroud_sink', baseId: 'mod_thermal_sink_m', name: 'Cryo-Shroud Sink', slotType: 'utility', size: 'M', tier: 3, mass: 4, price: 0,
    energyDraw: 3, purchasable: false, unique: true, salvageOnly: true,
    mods: { weaponHeatDissipPct: 0.65, weaponDmgPct: 0.05 },
    variantBonuses: { weaponHeatDissipPct: 0.65, weaponDmgPct: 0.05 },
  },
];
