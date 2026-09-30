// src/data/modules.js – canonical non-weapon modules.
// IDs use mod_ prefix per ARCHITECTURE §0.4. requiresTech refs use tech_ prefix.
// Covers: shields, engines, cargo, mining lasers, utility. The only import is userContent.js,
// which merges validated user-dropped JSON records onto the shipped table (PQ-172.00 — bottom).

import {
  userContentCandidates, claimUserContentId, acceptUserContent, rejectUserContent,
} from './userContent.js';

const SHIPPED_MODULES = [
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
    // visuals.glow tints the fitted nacelle's drive core + plume (PQ-176.04 — the drive is the
    // one module every hull already shows; swapping it must change the glow, not add a pod).
    id: 'mod_engine_ion_m', name: 'Ion Thruster M', slotType: 'engine', size: 'M', tier: 1, mass: 6, price: 7000,
    energyDraw: 4, mods: { topSpeed: 70, accelMult: 1.0, turnMult: 1.0, travelCeilingMult: 1.0 },
    visuals: { glow: '#8fd4ff' },
  },
  {
    id: 'mod_engine_fusion_m', name: 'Fusion Drive M', slotType: 'engine', size: 'M', tier: 2, mass: 9, price: 24000, requiresTech: 'tech_drive_tuning',
    energyDraw: 7, mods: { topSpeed: 95, accelMult: 1.3, turnMult: 1.15, travelCeilingMult: 1.15 },
    visuals: { glow: '#ffb154' },
  },
  {
    id: 'mod_engine_warp_l', name: 'Warp Coil L', slotType: 'engine', size: 'L', tier: 3, mass: 18, price: 70000, requiresTech: 'tech_graviton_drives',
    energyDraw: 12, mods: { topSpeed: 130, accelMult: 1.6, turnMult: 1.25, travelCeilingMult: 1.30 },
    visuals: { glow: '#b48cff' },
  },
  {
    id: 'unique_pale_coil_warp_drive', baseId: 'mod_engine_warp_l', name: 'Pale-Coil Warp Drive', slotType: 'engine', size: 'L', tier: 3, mass: 18, price: 0,
    energyDraw: 12, purchasable: false, unique: true, salvageOnly: true,
    visuals: { glow: '#d8f4ff' },
    mods: { topSpeed: 149.5, accelMult: 1.6, turnMult: 1.25, travelCeilingMult: 1.40, microJumpBlink: { usesPerEncounter: 1 } },
    variantBonuses: { topSpeedPct: 0.15, microJumpBlinkUsesPerEncounter: 1 },
  },

  // ===================== MANOEUVRING THRUSTERS (PQ-176.01) =====================
  // The drive owns going somewhere: forward thrust, and the speed the governor lets you hold.
  // These own everything else — turning, strafing and stopping — so "fast but clumsy" and "nimble
  // but slow" are two real builds of one hull instead of two words for the same ship.
  //
  // Every hull ships with a stock set (its authored `thrusterId`), and the stock set is exactly
  // neutral: one point on every axis. A ship with an empty thruster bay therefore flies precisely
  // as it always did, and every number below is a deliberate trade the player made.
  //
  // `mods.turnMult` scales yaw acceleration, yaw braking and the yaw-rate ceiling.
  // `mods.strafeMult` scales lateral thrust. `mods.brakeMult` scales reverse and braking thrust.
  {
    id: 'mod_thruster_stock_s', name: 'Stock RCS Cluster S', slotType: 'thruster', size: 'S', tier: 0, mass: 0, price: 0,
    purchasable: false, energyDraw: 0, mods: { turnMult: 1.0, strafeMult: 1.0, brakeMult: 1.0 },
  },
  {
    id: 'mod_thruster_stock_m', name: 'Stock RCS Cluster M', slotType: 'thruster', size: 'M', tier: 0, mass: 0, price: 0,
    purchasable: false, energyDraw: 0, mods: { turnMult: 1.0, strafeMult: 1.0, brakeMult: 1.0 },
  },
  {
    id: 'mod_thruster_stock_l', name: 'Stock RCS Cluster L', slotType: 'thruster', size: 'L', tier: 0, mass: 0, price: 0,
    purchasable: false, energyDraw: 0, mods: { turnMult: 1.0, strafeMult: 1.0, brakeMult: 1.0 },
  },
  {
    // The racer's choice: strip the manoeuvring bells off, keep the mass, point the nose and pray.
    // Pairs with a big drive to make a hull that arrives first and cannot do anything when it does.
    id: 'mod_thruster_stripped_s', name: 'Stripped RCS S', slotType: 'thruster', size: 'S', tier: 1, mass: 1, price: 4000,
    energyDraw: 0, mods: { turnMult: 0.68, strafeMult: 0.62, brakeMult: 0.78 },
  },
  {
    id: 'mod_thruster_vernier_m', name: 'Vernier Cluster M', slotType: 'thruster', size: 'M', tier: 2, mass: 7, price: 21000,
    requiresTech: 'tech_drive_tuning', energyDraw: 3, mods: { turnMult: 1.42, strafeMult: 1.50, brakeMult: 1.34 },
  },
  {
    id: 'mod_thruster_gimbal_l', name: 'Gimbal Thruster Array L', slotType: 'thruster', size: 'L', tier: 3, mass: 16, price: 58000,
    requiresTech: 'tech_graviton_drives', energyDraw: 6, mods: { turnMult: 1.70, strafeMult: 1.85, brakeMult: 1.52 },
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
    id: 'mod_repulsion_trap_s', name: 'Repulsion Trap', slotType: 'utility', size: 'S', tier: 2,
    mass: 3, price: 18000, requiresTech: 'tech_ricochet_ballistics', energyDraw: 2,
    mods: { repulsionTrap: true },
    description: 'Drop a proximity charge behind your flight path. Pursuers trigger a radial shove; remote detonation still works.',
  },
  {
    id: 'mod_cargo_scanner_s', name: 'Cargo Scanner S', slotType: 'utility', size: 'S', tier: 1, mass: 1, price: 4000,
    energyDraw: 1, mods: { revealCargo: true },
  },
  {
    // Alien Ecology AE-075 — biofilm filter: throttles hull-contamination accrual in
    // high-C space (ae.exposure), and slows cargo spoilage on biohazard lots.
    id: 'mod_filter_stack_s', name: 'Biofilm Filter Stack', slotType: 'utility', size: 'S', tier: 2, mass: 2, price: 9500,
    energyDraw: 1,
    mods: { bioFilterMult: 0.35 },
    description: 'Electrostatic mesh over the intakes and plate seams. Contaminated sectors stop fouling your hull — and your manifest.',
  },
  // ── Alien Ecology unlock economy (roadmap AE-120..129, catalog G/K-table) ──
  // Progression that opens behaviors and routes, not damage numbers. Every read site lives
  // in src/systems/alienEcology.js / precursorMachines.js / impulseCharges.js / economy.js.
  {
    // G01 — a biology-tuned scanner head: bio signatures resolve one rung up the reveal
    // ladder (read via effectiveRevelation in alienEcology spawn/refresh paths).
    id: 'mod_bio_spectral_pass_s', name: 'Bio-Spectral Pass Head', slotType: 'utility', size: 'S', tier: 2, mass: 2, price: 14000,
    energyDraw: 2,
    mods: { bioScanTier: 1 },
    description: 'A scanning head retuned for filament-band returns. Biological contacts resolve one classification rung earlier.',
  },
  {
    // G04 — reads site coherence live; the HUD surfaces it while you sit inside a radius.
    id: 'mod_field_coherence_meter', name: 'Field Coherence Meter', slotType: 'utility', size: 'S', tier: 2, mass: 2, price: 11500,
    energyDraw: 1,
    mods: { coherenceMeter: true },
    description: 'A rack listener on the relay band. Inside a colonized field it reports how coherent the ecology currently reads.',
  },
  {
    // G06 — sealed custody locker: biohazard lots stop feeding hull exposure accrual.
    id: 'mod_quarantine_locker_s', name: 'Quarantine Locker', slotType: 'utility', size: 'S', tier: 2, mass: 3, price: 16000,
    energyDraw: 1,
    mods: { quarantineLocker: true },
    description: 'A sealed custody drawer rated for living cargo. What is locked in it does not breathe on the manifest.',
  },
  {
    // G07 — the heavy filter ring: deep-pocket accrual cut to a fifth.
    id: 'mod_filter_stack_m', name: 'Biofilm Filter Stack M', slotType: 'utility', size: 'M', tier: 3, mass: 4, price: 21000,
    requiresTech: 'tech_long_range_survey',
    energyDraw: 2,
    mods: { bioFilterMult: 0.20 },
    description: 'Deep-sector rated filters — a full-bore regeneration stack for pilots who work contaminated space on purpose.',
  },
  {
    // G08 — a docked once-per-berth purge: docking with it fitted scrubs exposure clean.
    id: 'mod_hull_purge_ring_m', name: 'Hull Purge Ring', slotType: 'utility', size: 'M', tier: 3, mass: 5, price: 24000,
    energyDraw: 3,
    mods: { hullPurgeRing: true },
    description: 'A burn collar around the plate seams. Docking with it fitted fires one sterilizing pass — fouled hulls berth clean.',
  },
  {
    // G10 — charge-throw drops a heat lure that drags heat-hunters off your plume (60s).
    id: 'mod_heat_lure_s', name: 'Heat Lure Beacon', slotType: 'utility', size: 'S', tier: 2, mass: 2, price: 13500,
    energyDraw: 2,
    mods: { heatLure: true },
    description: 'Charge-thrown bait: a burn-flag beacon that reads hotter than your reactor. Predators chase the lie for a minute.',
  },
  {
    // G11 — emission damping: your hull presents a quieter mass/heat signature to fauna.
    id: 'mod_quiet_mask_s', name: 'Quiet Mask', slotType: 'utility', size: 'S', tier: 3, mass: 3, price: 26000,
    requiresTech: 'tech_long_range_survey',
    energyDraw: 3,
    mods: { stealthBioMult: 0.45 },
    description: 'Hull plating that damps your drive and mass signature. Animals that hunt heat notice you later — or never.',
  },
  {
    // G12 — relay-band probe: relay organisms report their coherence on the scanner.
    id: 'mod_relay_needle_s', name: 'Relay Needle', slotType: 'utility', size: 'S', tier: 2, mass: 1, price: 10500,
    energyDraw: 1,
    mods: { relayNeedle: true },
    description: 'A tuned probe for the relay band. Coherent emitters report their broadcast strength instead of a bare contact.',
  },
  {
    // G13 — the cradle: a latched animal released under it reaches the hold alive.
    id: 'mod_capture_cradle_m', name: 'Capture Cradle', slotType: 'utility', size: 'M', tier: 3, mass: 6, price: 32000,
    requiresTech: 'tech_tractor_systems',
    energyDraw: 4,
    mods: { captureSurvivalMult: 0.85 },
    description: 'A padded field cage for the massline. Release the latch while it is fitted and the animal comes aboard alive.',
  },
  {
    // K-table — a protocol transponder: machines resolve your compliance in half the time.
    id: 'mod_precursor_handshake_s', name: 'Handshake Transponder', slotType: 'utility', size: 'S', tier: 4, mass: 2, price: 0,
    purchasable: false, unique: true, salvageOnly: true,
    energyDraw: 2,
    mods: { precursorHandshake: true },
    description: 'A lattice-tuned responder salvaged from a machine site. Verge instruments read your compliance in half the window.',
  },
  {
    // K03 — quarantine paperwork as equipment: custody refusal softens to a discount.
    id: 'mod_containment_seal_s', name: 'Containment Seal Kit', slotType: 'utility', size: 'S', tier: 3, mass: 2, price: 28000,
    energyDraw: 1,
    mods: { containmentSeal: true },
    description: 'Registry-stamped quarantine seals. Stations that would refuse a biological lot instead take it at surrender prices.',
  },
  {
    // G02 — filament contrast filter: phantom contacts get flagged as probable echoes.
    id: 'mod_filament_contrast_s', name: 'Filament Contrast Filter', slotType: 'utility', size: 'S', tier: 2, mass: 1, price: 9800,
    energyDraw: 1,
    mods: { filamentContrast: true },
    description: 'A polarized scanner gasket tuned to the membrane band. Mirror-echo contacts mark themselves instead of wearing a clean return.',
  },
  {
    // G03 — host-memory cartography: crossing a site’s long band maps the hull under the growth.
    id: 'mod_host_cartography_s', name: 'Host-Memory Cartography', slotType: 'utility', size: 'S', tier: 3, mass: 2, price: 21000,
    requiresTech: 'tech_long_range_survey',
    energyDraw: 2,
    mods: { hostMapReveal: true },
    description: 'A hull-resonance mapper that reads the structure under the growth. Entering a colonized field, the host resolves on the chart.',
  },
  {
    // G05 — echo recorder: relay pulses get logged to the field notebook.
    id: 'mod_echo_recorder_s', name: 'Echo Recorder', slotType: 'utility', size: 'S', tier: 2, mass: 1, price: 12000,
    energyDraw: 1,
    mods: { echoRecorder: true },
    description: 'A slow tape for the relay band. Sites that pulse in phase leave a coherence signature in your flight log.',
  },
  {
    // G14 — resonant massline tuning: the beam strike carries a dead-matter signature;
    // dormant fauna do not wake on your mining noise.
    id: 'mod_resonant_massline_m', name: 'Resonant Massline Coil', slotType: 'utility', size: 'M', tier: 4, mass: 3, price: 0,
    purchasable: false, unique: true, salvageOnly: true,
    energyDraw: 3,
    mods: { resonantMassline: true },
    description: 'A field coil salvaged from a dead pylon. Your beam strikes read as dead matter — the sleepers do not hear you work.',
  },
  {
    // G15 — the Quiet Equation: machine directive lines decode into readable intent while fitted.
    id: 'mod_quiet_equation_s', name: 'The Quiet Equation', slotType: 'utility', size: 'S', tier: 4, mass: 1, price: 0,
    purchasable: false, unique: true, salvageOnly: true,
    energyDraw: 1,
    mods: { quietEquation: true },
    description: 'A Verge-layer decode lattice. Where the machines speak in directive fragments, you read the sentence underneath.',
  },
  {
    // K05 — lattice coupler: approaching a machine site echoes its last issued directive
    // on the log, so the player learns grammar from sites that have not spoken yet.
    id: 'mod_lattice_coupler_s', name: 'Lattice Coupler', slotType: 'utility', size: 'S', tier: 4, mass: 1, price: 0,
    purchasable: false, unique: true, salvageOnly: true,
    energyDraw: 1,
    mods: { latticeCoupler: true },
    description: 'A two-pin tap into site memory. Approach a machine site and its last issued directive echoes back through your comms.',
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
    id: 'mod_triangulation_suite_s', name: 'Triangulation Suite S', slotType: 'utility', size: 'S', tier: 2, mass: 2, price: 12000, requiresTech: 'tech_long_range_survey',
    energyDraw: 2, mods: { anomalyPingReduction: 1 },
    behavior: 'onboard bearing solver closes an anomaly fix in two scan pulses instead of three',
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
    // magnetRange must beat mining.MAGNET_RANGE floor (800) so the fitted tractor is player-felt.
    // Salvage cutters snapshot this head onto their wreck latch so the player sees the pick-up verb.
    energyDraw: 3, mods: { magnetRange: 1200, masslineHeadId: 'tractor' },
  },
  {
    id: 'unique_tideline_tractor', baseId: 'mod_tractor_beam_m', name: 'Tideline Tractor', slotType: 'utility', size: 'M', tier: 2, mass: 4, price: 0,
    energyDraw: 6, purchasable: false, unique: true, salvageOnly: true,
    mods: { magnetRange: 1600, tractorWholeWrecks: true, masslineHeadId: 'tractor' },
    variantBonuses: { magnetRangePct: 0.80, energyDrawPct: 1.00, tractorWholeWrecks: true },
  },
  {
    // PQ-170.03 — ace trophy heads. Same physics law as the stock head they were taken from;
    // the unique id and lineage are what NPCs recognize.
    id: 'unique_no_cut_filament', baseId: 'mod_monofilament_sweep_m', name: 'No-Cut Filament',
    slotType: 'utility', size: 'M', tier: 3, mass: 5, price: 0,
    energyDraw: 6, purchasable: false, unique: true, salvageOnly: true,
    mods: { masslineHeadId: 'monofilament_sweep' },
  },
  {
    id: 'unique_toll_saint_bridle', baseId: 'mod_twin_bridle_m', name: 'Toll-Saint Bridle',
    slotType: 'utility', size: 'M', tier: 3, mass: 7, price: 0,
    energyDraw: 8, purchasable: false, unique: true, salvageOnly: true,
    mods: { masslineHeadId: 'twin_bridle' },
  },
  {
    id: 'unique_broken_ring_whip', baseId: 'mod_elastic_whip_m', name: 'Broken-Ring Whip',
    slotType: 'utility', size: 'M', tier: 2, mass: 4, price: 0,
    energyDraw: 4, purchasable: false, unique: true, salvageOnly: true,
    mods: { masslineHeadId: 'elastic_whip' },
  },
  {
    // ELASTIC WHIP — stretch stores ½ k s². A player cut spends that remaining energy as a
    // closing snap. Load-break dumps it empty. M utility: Drifter, not Hitch.
    // Scrap sweepers (and patrols netting a raider) snapshot this head on their occupational line.
    id: 'mod_elastic_whip_m', name: 'Elastic Whip M', slotType: 'utility', size: 'M', tier: 2, mass: 4, price: 16000, requiresTech: 'tech_tractor_systems',
    energyDraw: 4, mods: { masslineHeadId: 'elastic_whip' },
  },
  {
    // FRAME COUPLER — the winched rest length is the hitch. A 200-mass tow turns with you.
    // Yard tugs snapshot this hitch onto the existing npc_tow line; they do not need the M slot.
    id: 'mod_frame_coupler_m', name: 'Frame Coupler M', slotType: 'utility', size: 'M', tier: 2, mass: 5, price: 22000, requiresTech: 'tech_tractor_systems',
    energyDraw: 5, mods: { masslineHeadId: 'frame_coupler' },
  },
  {
    id: 'mod_monofilament_sweep_m', name: 'Monofilament Sweep M', slotType: 'utility', size: 'M', tier: 3, mass: 5, price: 44000, requiresTech: 'tech_fire_control',
    // A taut swing cuts NPC tethers in one pass and staggers lights. Ordinary rope force is unchanged.
    // The tether-cutter specialist uses this verb on the route before Fire Control unlocks the fitting.
    energyDraw: 6, mods: { masslineHeadId: 'monofilament_sweep' },
  },
  {
    id: 'mod_transverse_snare_m', name: 'Transverse Snare M', slotType: 'utility', size: 'M', tier: 3, mass: 6, price: 52000, requiresTech: 'tech_fire_control',
    // Clothesline: the first fast hostile crossing rebinds onto the kept anchor and tumbles (B11).
    energyDraw: 7, mods: { masslineHeadId: 'transverse_snare' },
  },
  {
    id: 'mod_twin_bridle_m', name: 'Twin Bridle M', slotType: 'utility', size: 'M', tier: 3, mass: 7, price: 68000, requiresTech: 'tech_fire_control',
    // Bolas throw: latch A then B within the 2 s combat window; relative speed tumbles both lights (B11).
    energyDraw: 8, mods: { masslineHeadId: 'twin_bridle' },
  },
  {
    id: 'mod_targeting_computer_m', name: 'Targeting Computer M', slotType: 'utility', size: 'M', tier: 3, mass: 4, price: 40000, requiresTech: 'tech_fire_control',
    energyDraw: 4, mods: { weaponRangePct: 0.15, weaponDmgPct: 0.08 },
  },
  {
    // POINT-DEFENSE SERVO — an autonomous intercept verb, not a damage stat. While armed it watches
    // a short sphere around the hull and kills the nearest hostile projectile inside it on a
    // cooldown; missiles and slugs that would have hit simply die at the ring. Consumed by
    // systems/countermeasures.js from the fittings record (same pattern as the cloak trio).
    id: 'mod_pds_servo_s', name: 'Point-Defense Servo S', slotType: 'utility', size: 'S', tier: 3, mass: 3, price: 34000, requiresTech: 'tech_fire_control',
    energyDraw: 4, mods: { pointDefense: { radius: 240, cooldownS: 2.4, interceptPct: 1.0 } },
  },
  {
    // DECOY BUOY — a bait verb, not a bigger chaff puff. The deploy puts a persistent false contact
    // in the water: every missile that enters its radius re-attacks the buoy (chaff only diverts
    // missiles already aimed at YOU, for 3.5 s), and attacker locks decay while it broadcasts.
    // Same countermeasure keybind, same cooldown law — a different question answered.
    id: 'mod_decoy_buoy_s', name: 'Signal Decoy Buoy S', slotType: 'utility', size: 'S', tier: 2, mass: 3, price: 16500, requiresTech: 'tech_deflector_theory',
    energyDraw: 2,
    mods: { countermeasure: { kind: 'decoy', radius: 620, durationS: 8, cooldownS: 14, lockBreakPct: 0.6, divertPct: 0.9 } },
  },
  {
    id: 'mod_sensor_array_l', name: 'Sensor Array L', slotType: 'utility', size: 'L', tier: 3, mass: 8, price: 36000, requiresTech: 'tech_long_range_survey',
    // scanRpBonus: research points granted per ordinary freeflight scan pulse (missions writer).
    energyDraw: 5, mods: { radarRangePct: 0.60, scanRpBonus: 2 },
    visuals: { part: 'greebles/greeble_antennas.glb' },
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
    visuals: { part: 'greebles/greeble_armor_plates.glb' },
  },
  {
    // GRAVITY BUMPER — the first HULL BURST (design doc 2026-09-29 section 4). A timed, front-facing
    // special attack: press the burst key and for a few seconds the nose throws away every hostile
    // hull it touches, harder the faster you arrive (a Massline swing is the fastest way to arrive).
    // The hull counts as much heavier while it runs; nothing pushes back on you. Consumed via
    // derived.hullBurstKind (systems/ships.js), driven by systems/hullBurst.js, tuned in data/hullBurst.js.
    // One hull-burst module per hull: the type is the build.
    id: 'mod_gravity_bumper_s', name: 'Gravity Bumper S', slotType: 'utility', size: 'S', tier: 2, mass: 5, price: 24000,
    requiresTech: 'tech_graviton_drives',
    // The headline verb of the hull-burst overhaul sits on the first station's rack at first-haul terms
    // (same door as Swing Drive): docked at Helios it sells with no Graviton Drives stop. The catalog
    // price and the research gate stand at every other berth.
    shopOffers: { station_helios: { price: 12000 } },
    energyDraw: 0, mods: { hullBurst: 'gravity', hullBurstRank: 1 },
  },
  {
    // FIRE LANCE — the finisher (design doc 2026-09-29 section 4). A narrow, short wedge you must fly straight
    // at: contact is thermal damage through the combat kernel, credited to you. A light or medium hull dies;
    // a heavy ignites and burns. Full effect at speed; a crawling touch only scorches. Same key as every hull
    // burst, one per hull; the type is the build. Tuned in data/hullBurst.js.
    id: 'mod_fire_lance_s', name: 'Fire Lance S', slotType: 'utility', size: 'S', tier: 3, mass: 5, price: 32000,
    requiresTech: 'tech_plasma_dynamics',
    energyDraw: 0, mods: { hullBurst: 'lance', hullBurstRank: 1 },
  },
  {
    // GRIP BUMPER — a battering ram with a hostage (design doc 2026-09-29 section 4). Press the burst key and
    // the nose catches the first LIGHT hostile hull it meets and carries it, helm lost; whatever the carried
    // hull hits is your doing. It lets go when the window ends, when you press the key again, or when the
    // hostage dies, and leaves faster than you fly. Medium and heavy hulls cannot be caught. One hull burst
    // per hull; the type is the build. Tuned in data/hullBurst.js.
    id: 'mod_grip_bumper_s', name: 'Grip Bumper S', slotType: 'utility', size: 'S', tier: 2, mass: 5, price: 22000,
    requiresTech: 'tech_tractor_systems',
    energyDraw: 0, mods: { hullBurst: 'grip', hullBurstRank: 1 },
  },
  // HULL-BURST RANK 2 (the owner's "upgradeable to last longer"). The same three modules one research step
  // higher, same S bay so a starter hull can carry them: rank 2 lasts 25% longer, reaches 20% farther and hits
  // 15% harder (data/hullBurst.js HULL_BURST_RANK_GAIN). One hull burst per hull; the higher rank wins.
  {
    id: 'mod_gravity_bumper_s_mk2', name: 'Gravity Bumper S Mk2', slotType: 'utility', size: 'S', tier: 3, mass: 5, price: 52000,
    requiresTech: 'tech_impulse_ballistics',
    energyDraw: 0, mods: { hullBurst: 'gravity', hullBurstRank: 2 },
  },
  {
    id: 'mod_fire_lance_s_mk2', name: 'Fire Lance S Mk2', slotType: 'utility', size: 'S', tier: 4, mass: 5, price: 72000,
    requiresTech: 'tech_payload_conduction',
    energyDraw: 0, mods: { hullBurst: 'lance', hullBurstRank: 2 },
  },
  {
    id: 'mod_grip_bumper_s_mk2', name: 'Grip Bumper S Mk2', slotType: 'utility', size: 'S', tier: 3, mass: 5, price: 48000,
    requiresTech: 'tech_drone_control',
    energyDraw: 0, mods: { hullBurst: 'grip', hullBurstRank: 2 },
  },
  {
    id: 'mod_winch_hd', name: 'Heavy-Duty Winch', slotType: 'utility', size: 'S', tier: 1, mass: 3, price: 12000,
    energyDraw: 2, mods: { tetherReelRateMult: 1.80, tetherSpoolMult: 1.5 },
  },
  {
    // SWING DRIVE — a pendulum dash, not a straighter dash. On the dash keypress while a taut line
    // is latched, flightV3 redirects the whole impulse along the line's tangent (and uprates it),
    // so the dash swings you AROUND the anchor instead of off it. Without the module the same press
    // is the ordinary straight dash. Consumed via derived.swingDrive (systems/ships.js).
    // Helios keeps one on the rack at first-haul price: docked there it sells with no Drive Tuning
    // stop. The catalog price and the research gate stand at every other berth.
    id: 'mod_swing_drive_m', name: 'Swing Drive M', slotType: 'utility', size: 'M', tier: 2, mass: 5, price: 19000, requiresTech: 'tech_drive_tuning',
    shopOffers: { station_helios: { price: 12000 } },
    energyDraw: 3, mods: { swingDrive: true },
  },
  {
    // SWING DRIVE S — the same pendulum dash in the small bay the Hitch and Wasp actually carry.
    // The M sibling needs an M utility slot the starter hulls do not have; without this row the
    // first-haul rack sells a module the ship in front of it can never fit. Helios stocks it at
    // the same first-haul terms; elsewhere it sits on the Drive Tuning stop like its sibling.
    id: 'mod_swing_drive_s', name: 'Swing Drive S', slotType: 'utility', size: 'S', tier: 1, mass: 3, price: 14000, requiresTech: 'tech_drive_tuning',
    // first-haul terms measured against the honest opening: starter stake plus a defended-raid
    // salvage sweep lands ~7.4k at the Helios counter (seed 4242), so the rack meets it there.
    shopOffers: { station_helios: { price: 7400 } },
    energyDraw: 2, mods: { swingDrive: true },
  },
  {
    // LOOT MAGNET — reach without the line. Debris shards and jettisoned pods inside the ring are
    // drawn to the hull (bounded attraction through physics authority), so salvage is a fly-by
    // instead of a latch-per-piece. Consumed via derived.lootMagnetRange by systems/lootShards.js.
    id: 'mod_loot_magnet_s', name: 'Loot Magnet Ring S', slotType: 'utility', size: 'S', tier: 1, mass: 2, price: 9000, requiresTech: 'tech_tractor_systems',
    energyDraw: 2, mods: { lootMagnetRange: 420 },
  },
  {
    // MASS FLAIL — the tow IS the weapon. While a line is attached and the load outmasses the
    // hull, direct contacts the player makes carry the load's mass into the hit: the towed body
    // turns every bump into a flail strike scaled by what you drag (collisionConsequences reads
    // derived.towFlail + the live tether target mass). Towing ore into a fight becomes a decision.
    id: 'mod_mass_flail_rig_m', name: 'Mass Flail Rig M', slotType: 'utility', size: 'M', tier: 2, mass: 6, price: 21000, requiresTech: 'tech_tractor_systems',
    energyDraw: 0, mods: { towFlail: true },
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
    // D17 Long Chord unique — the unlogged toll hold, pulled from her grave off the chord.
    id: 'unique_long_chord_hold', baseId: 'mod_smuggler_hold_m', name: 'Long Chord Hold', slotType: 'cargo', size: 'M', tier: 3, mass: 8, price: 0,
    energyDraw: 1, legality: 'contraband', purchasable: false, unique: true, salvageOnly: true,
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
  // SP1 chain wrecks (D13-D16, uniqueWrecks.js): one authored salvage-only unique per hull.
  {
    id: 'unique_quadrille_box_reader', baseId: 'mod_cargo_scanner_s', name: 'Quadrille Box-Reader', slotType: 'utility', size: 'S', tier: 1, mass: 1, price: 0,
    energyDraw: 1, purchasable: false, unique: true, salvageOnly: true,
    mods: { revealCargo: true, scanRangeMult: 1.40 },
    variantBonuses: { scanRangePct: 0.40 },
  },
  {
    id: 'unique_double_entry_mask', baseId: 'mod_sensor_scrambler_m', name: 'Double-Entry Mask', slotType: 'utility', size: 'M', tier: 3, mass: 5, price: 0,
    energyDraw: 4, purchasable: false, unique: true, salvageOnly: true,
    mods: { scannerCloak: 0.62, scanRangeMult: 1.10 },
    variantBonuses: { scannerCloakPct: 0.24 },
  },
  {
    id: 'unique_first_notch_marker', baseId: 'mod_triangulation_suite_s', name: 'First-Notch Marker', slotType: 'utility', size: 'S', tier: 2, mass: 2, price: 0,
    energyDraw: 2, purchasable: false, unique: true, salvageOnly: true,
    mods: { anomalyPingReduction: 2, scannerRadiusMult: 1.25 },
    variantBonuses: { scannerRadiusPct: 0.25 },
  },
  {
    id: 'unique_regular_mass_shifter', baseId: 'mod_cargo_compactor_l', name: 'Regular Mass-Shifter', slotType: 'cargo', size: 'L', tier: 3, mass: 6, price: 0,
    energyDraw: 0, purchasable: false, unique: true, salvageOnly: true,
    mods: { cargoFlat: 132, cargoCapPct: 0.18 },
    variantBonuses: { cargoCapPct: 0.20 },
  },

  // ===================== CRUCIBLE GRAMMAR RIGS (PQ-133.11) =====================
  // Ids match landed attack traits so a fitted slot is the same grammar the compiler already knows.
  {
    id: 'mod_twin_mount', name: 'Twin Mount', slotType: 'utility', size: 'S', tier: 2, mass: 3, price: 12000,
    requiresTech: 'tech_attack_topology', energyDraw: 2,
  },
  {
    id: 'mod_triad_mount', name: 'Triad Mount', slotType: 'utility', size: 'M', tier: 3, mass: 6, price: 38000,
    requiresTech: 'tech_attack_topology', energyDraw: 6,
  },
  {
    id: 'mod_piercing_core', name: 'Piercing Core', slotType: 'utility', size: 'S', tier: 2, mass: 2, price: 14000,
    requiresTech: 'tech_attack_topology', energyDraw: 1,
  },
  {
    id: 'mod_forked_core', name: 'Forked Core', slotType: 'utility', size: 'S', tier: 2, mass: 3, price: 18000,
    requiresTech: 'tech_attack_topology', energyDraw: 2,
  },
  {
    id: 'mod_bank_shot', name: 'Bank Shot', slotType: 'utility', size: 'S', tier: 2, mass: 3, price: 16000,
    requiresTech: 'tech_ricochet_ballistics', energyDraw: 2,
  },
  {
    id: 'mod_smart_bank', name: 'Smart Bank', slotType: 'utility', size: 'M', tier: 3, mass: 5, price: 44000,
    requiresTech: 'tech_ricochet_ballistics', energyDraw: 5, legality: 'contraband',
  },
  {
    id: 'mod_ion_payload', name: 'Ion Payload', slotType: 'utility', size: 'S', tier: 2, mass: 2, price: 15000,
    requiresTech: 'tech_payload_conduction', energyDraw: 2, legality: 'restricted',
  },
  {
    id: 'mod_incendiary_payload', name: 'Incendiary Payload', slotType: 'utility', size: 'S', tier: 2, mass: 3, price: 17000,
    requiresTech: 'tech_payload_conduction', energyDraw: 2, legality: 'restricted',
  },
  {
    id: 'mod_gravity_tag', name: 'Gravity Tag', slotType: 'utility', size: 'S', tier: 2, mass: 2, price: 16000,
    requiresTech: 'tech_payload_conduction', energyDraw: 2,
  },
  {
    id: 'mod_relay_arc', name: 'Relay Arc', slotType: 'utility', size: 'S', tier: 2, mass: 3, price: 22000,
    requiresTech: 'tech_payload_conduction', energyDraw: 3, legality: 'restricted',
  },
  {
    id: 'mod_bank_relay', name: 'Bank Relay', slotType: 'utility', size: 'M', tier: 3, mass: 5, price: 48000,
    requiresTech: 'tech_ricochet_ballistics', energyDraw: 4, legality: 'restricted',
  },
  {
    id: 'mod_tether_capacitor', name: 'Tether Capacitor', slotType: 'utility', size: 'S', tier: 2, mass: 3, price: 20000,
    requiresTech: 'tech_tractor_systems', energyDraw: 3,
  },
  {
    id: 'mod_conductive_path', name: 'Conductive Path', slotType: 'utility', size: 'M', tier: 3, mass: 4, price: 36000,
    requiresTech: 'tech_payload_conduction', energyDraw: 3, legality: 'restricted',
  },
  {
    id: 'mod_cryo_payload', name: 'Cryo Payload', slotType: 'utility', size: 'S', tier: 2, mass: 3, price: 19000,
    requiresTech: 'tech_payload_conduction', energyDraw: 2,
  },
  {
    id: 'mod_cryo_gyros', name: 'Cryo Gyros', slotType: 'utility', size: 'M', tier: 3, mass: 7, price: 62000,
    requiresTech: 'tech_orbit_cryo', energyDraw: 8,
  },
  {
    id: 'mod_herald_fan', name: 'Herald Fan', slotType: 'utility', size: 'S', tier: 2, mass: 2, price: 11000,
    requiresTech: 'tech_attack_topology', energyDraw: 1,
  },
  {
    // CRU-038 named synthesis (src/data/survivalEvolutions.js): the armory conversion consumes
    // Bank Shot + Relay Arc + Ion Payload, so one S slot carries what used to need three.
    id: 'mod_storm_carom', name: 'Storm Carom', slotType: 'utility', size: 'S', tier: 4, mass: 6, price: 96000,
    requiresTech: 'tech_ricochet_ballistics', energyDraw: 6, legality: 'restricted',
  },
];

// ─────────────────────────────── user content (PQ-172.00) ───────────────────────────────
// Same contract as weapons.js: user JSON records validate against the shipped field/vocab set at
// module-eval time and merge before consumers snapshot MODULES. Rejections are listed per-mod.

const USER_MODULE_KEYS = new Set([
  'id', 'name', 'slotType', 'size', 'tier', 'mass', 'price', 'requiresTech', 'baseId',
  'energyDraw', 'mods', 'dps', 'range', 'rareOreChance', 'directToCargo',
  'legality', 'behavior', 'description', 'visuals', 'sentence',
  'purchasable', 'unique', 'salvageOnly', 'variantBonuses',
]);
const USER_MODULE_SLOT_TYPES = new Set(['shield', 'engine', 'cargo', 'mining', 'thruster', 'utility']);
const USER_MODULE_SIZES = new Set(['S', 'M', 'L']);

function userModuleProblem(rec) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return 'record must be an object';
  for (const key of Object.keys(rec)) {
    if (!USER_MODULE_KEYS.has(key)) return `unknown field "${key}"`;
  }
  if (typeof rec.id !== 'string' || !/^(mod|unique)_[a-z0-9_]+$/.test(rec.id)) {
    return 'id must match mod_* or unique_*';
  }
  if (typeof rec.name !== 'string' || !rec.name.trim()) return 'name is required';
  if (!USER_MODULE_SLOT_TYPES.has(rec.slotType)) {
    return `slotType must be one of ${[...USER_MODULE_SLOT_TYPES].join(', ')}`;
  }
  if (!USER_MODULE_SIZES.has(rec.size)) return 'size must be S, M, or L';
  if (!Number.isInteger(rec.tier) || rec.tier < 1 || rec.tier > 5) return 'tier must be an integer 1-5';
  for (const f of ['mass', 'price']) {
    if (typeof rec[f] !== 'number' || !Number.isFinite(rec[f]) || rec[f] < 0) {
      return `${f} must be a non-negative number`;
    }
  }
  if (rec.mods != null && (typeof rec.mods !== 'object' || Array.isArray(rec.mods))) {
    return 'mods must be an object';
  }
  if (rec.energyDraw != null && (typeof rec.energyDraw !== 'number' || !Number.isFinite(rec.energyDraw))) {
    return 'energyDraw must be a number';
  }
  if (rec.sentence != null && (typeof rec.sentence !== 'string' || !rec.sentence.trim() || /[\r\n]/.test(rec.sentence))) {
    return 'sentence must be one non-empty line';
  }
  if (rec.requiresTech != null && (typeof rec.requiresTech !== 'string' || !rec.requiresTech.startsWith('tech_'))) {
    return 'requiresTech must be a tech_* id';
  }
  if (rec.baseId != null && typeof rec.baseId !== 'string') return 'baseId must be a string id';
  for (const f of ['purchasable', 'unique', 'salvageOnly', 'directToCargo']) {
    if (rec[f] != null && typeof rec[f] !== 'boolean') return `${f} must be a boolean`;
  }
  if (rec.variantBonuses != null && (typeof rec.variantBonuses !== 'object' || Array.isArray(rec.variantBonuses))) {
    return 'variantBonuses must be an object';
  }
  if (rec.visuals != null && (typeof rec.visuals !== 'object' || Array.isArray(rec.visuals))) {
    return 'visuals must be an object';
  }
  return null;
}

function mergeUserModules(base) {
  const candidates = userContentCandidates('modules');
  if (!candidates.length) return base;   // no payload → the shipped array, untouched
  const takenIds = new Set(base.map((m) => m.id));
  const merged = [...base];
  for (const cand of candidates) {
    const rec = cand.record;
    const problem = userModuleProblem(rec)
      || claimUserContentId('modules', rec.id, cand.modId, takenIds)
      || (rec.baseId && !takenIds.has(rec.baseId) && !merged.some((m) => m.id === rec.baseId)
        ? `baseId "${rec.baseId}" does not resolve to a known module` : null);
    if (problem) {
      rejectUserContent(cand.modId, 'modules', rec && rec.id, problem, cand.file);
      continue;
    }
    merged.push(rec);
    acceptUserContent(cand.modId, 'modules', rec.id, cand.file);
  }
  return merged;
}

// One plain line per module: what it does in the air. Not a price, a mass, or a stat.
// The fit screen already prints `sentence` on the row. Unwired promises are not claimed —
// an afterburner and a market uplink do not move the ship or the prices the sim reads.
const MODULE_AIR_SENTENCE = Object.freeze({
  mod_shield_booster_s: 'A thicker shield that keeps rebuilding while you fly.',
  mod_shield_capacitor_m: 'A much thicker shield, and it comes back faster.',
  mod_shield_aegis_l: 'The heavy shield. It soaks a fight and rebuilds afterward.',
  unique_choir_bell_aegis: 'The heavy shield, and once a fight it knocks a missile back.',
  mod_engine_ion_m: 'The yard drive. Push and the run stay where this hull was rated.',
  mod_engine_fusion_m: 'More push than the yard drive, and a faster run above the speed you fight at.',
  mod_engine_warp_l: 'The long run. You still fight at the same cap, and you travel much faster.',
  unique_pale_coil_warp_drive: 'The long run, and once a fight it blinks you a short jump.',
  mod_thruster_stock_s: 'The yard set for a small bay. Turn, slide and stop stay as this hull was built.',
  mod_thruster_stock_m: 'The yard set for a medium bay. Turn, slide and stop stay as this hull was built.',
  mod_thruster_stock_l: 'The yard set for a large bay. Turn, slide and stop stay as this hull was built.',
  mod_thruster_stripped_s: 'You give up turn, slide and brake. The hull commits, and it answers late.',
  mod_thruster_vernier_m: 'The nose comes around harder, and you slide and stop with more authority.',
  mod_thruster_gimbal_l: 'The strongest manoeuvring set. It turns, slides and stops harder than the yard cluster.',
  mod_cargo_pod_m: 'More room in the hold. The mass is what you feel once it is full.',
  mod_cargo_expander_l: 'A much larger hold. You will feel the mass when it is full.',
  mod_cargo_compactor_l: 'More hold, and the space you already have packs tighter.',
  mod_mining_laser_s: 'Bites ore. Hold it and the beam runs hot until you let it vent.',
  mod_mining_beam_m: 'Cuts ore faster and farther than the starter laser.',
  mod_mining_pulverizer_l: 'A heavy cut, and sometimes it cracks a rare seam.',
  mod_mining_industrial_l: 'The deepest cut. Ore goes straight into the hold.',
  mod_repulsion_trap_s: 'Drop a charge behind you that shoves whoever flies into it.',
  mod_cargo_scanner_s: 'Reads what another hull is carrying.',
  unique_truesight_scanner: 'Reads a hold, and from farther out than a stock scanner.',
  mod_market_data_s: 'Streams live exchange quotes from every station in this sector while you fly it.',
  mod_triangulation_suite_s: 'Closes an anomaly fix in two scans instead of three.',
  mod_shield_hardener_m: 'The same hit takes less out of the hull.',
  mod_afterburner_m: 'You carry its mass. It does not change the boost you fly.',
  mod_repair_nanobots_m: 'The hull knits itself back together between fights.',
  unique_knitbots: 'Heals the hull a little faster between fights than the stock nanobots.',
  mod_tractor_beam_m: 'Picks up ore and wrecks without stopping on them.',
  unique_tideline_tractor: 'Picks up a whole wreck, from farther out than a stock tractor.',
  unique_long_chord_hold: 'Hides a third of the hold from every scan, the way she hid a whole career.',
  unique_no_cut_filament: 'A taut swing cuts a hostile line.',
  unique_toll_saint_bridle: 'Anchors two points at once, and the pull tumbles light hulls.',
  unique_broken_ring_whip: 'Stores the stretch of a swing and gives it back as a snap.',
  mod_elastic_whip_m: 'Stretch the line, then spend that stored snap when you cut it.',
  mod_frame_coupler_m: 'Holds a heavy tow on a hitch so the load turns with you.',
  mod_monofilament_sweep_m: 'A taut swing cuts a hostile line and staggers a light hull.',
  mod_transverse_snare_m: 'A fast hull that crosses your line gets snatched and tumbled.',
  mod_twin_bridle_m: 'Latch two targets close together and the line tumbles both.',
  mod_targeting_computer_m: 'Your guns reach farther and hit harder.',
  mod_pds_servo_s: 'Knocks down a shot or a missile that gets in close.',
  mod_decoy_buoy_s: 'Puts a false contact in the water and missiles go for it.',
  mod_sensor_array_l: 'Sees contacts farther out.',
  mod_drone_bay_l: 'Puts a drone in the water.',
  mod_jump_drive_m: 'Jumps you farther than the hull\'s own drive.',
  mod_ram_plate: 'The hull itself hits harder when you mean to ram.',
  mod_gravity_bumper_s: 'Press the burst key and, for a few seconds, the nose throws every hostile hull it touches. The faster you arrive, the farther they fly.',
  mod_fire_lance_s: 'Press the burst key and, for a few seconds, a narrow lance burns whatever the nose touches: light and medium hulls die, heavies ignite. Fly straight at it, fast.',
  mod_grip_bumper_s: 'Press the burst key and the nose catches the first light hostile hull it meets and carries it: ram things with it, then press again to let it go.',
  mod_gravity_bumper_s_mk2: 'The Gravity Bumper, refined: it lasts a quarter longer, reaches a fifth farther and throws harder.',
  mod_fire_lance_s_mk2: 'The Fire Lance, refined: it lasts a quarter longer, reaches a fifth farther and burns hotter.',
  mod_grip_bumper_s_mk2: 'The Grip Bumper, refined: it lasts a quarter longer and reaches a fifth farther, so the catch is easier and the ride longer.',
  mod_winch_hd: 'Reels a line in faster, and you can swing from farther away.',
  mod_swing_drive_m: 'A dash on a taut line swings you around the anchor instead of off it.',
  mod_swing_drive_s: 'The same swing-around dash, in the small bay a starter hull can fit.',
  mod_loot_magnet_s: 'Debris and pods drift into the hull as you fly past.',
  mod_mass_flail_rig_m: 'While you tow something heavier than you, a bump hits with the load\'s mass.',
  mod_massline_spool_m: 'A longer line, so you can swing off things much farther away.',
  mod_massline_spool_l: 'The longest line. The swing starts from far outside a fight.',
  mod_cloak_mk1: 'Shrinks the range at which you are seen, and it drinks power while dark.',
  mod_cloak_mk2: 'Harder to see than the first shroud, and it recovers faster when you drop it.',
  unique_quietcloak: 'A tighter detection ring than the Mk2, and it drinks less while dark.',
  mod_charge_rack: 'Carries charges you can throw and set off.',
  mod_charge_vector_rack: 'Carries the same charges, and you can kick one out behind you.',
  mod_drill_amp: 'The rich-core window on a rock stays open a little longer.',
  mod_survey_suite: 'The scan ring is wider, and a ping stays up longer.',
  unique_deepsurvey_suite: 'A wider scan than the stock suite, and the ping lingers longer.',
  mod_smuggler_hold: 'A little more cargo, and part of the hold does not show on a scan.',
  mod_smuggler_hold_m: 'More hidden hold. A scan misses more of what you carry.',
  mod_sensor_scrambler_s: 'You read quieter on a scan than the hull you are.',
  mod_sensor_scrambler_m: 'You read much quieter. A scan has to get closer.',
  unique_phantom_scrambler: 'Quieter still. You are a faint return.',
  mod_chaff_dispenser_m: 'Breaks a missile lock and pulls the shot off you.',
  unique_smokesong_chaff: 'A wider chaff cloud that pulls missiles off you.',
  mod_ecm_jammer_l: 'Jams a missile\'s steering so it stops turning toward you.',
  mod_thermal_sink_s: 'The guns shed heat faster, so a burst lasts longer.',
  mod_thermal_sink_m: 'A stronger heatsink. The guns stay cool through a longer hold.',
  unique_cryo_shroud_sink: 'Cools the guns harder than a stock sink, and the shots hit a little harder.',
  mod_twin_mount: 'Your shot throws a second, weaker round, and the gun runs hotter.',
  mod_triad_mount: 'Your shot throws a third, wider round, and the gun runs hotter still.',
  mod_piercing_core: 'A hit keeps going into the hull behind the first.',
  mod_forked_core: 'The first thing you hit splits the shot into two weaker children.',
  mod_bank_shot: 'Shots bounce off stone.',
  mod_smart_bank: 'After a bounce, the shot steers toward a hostile.',
  mod_ion_payload: 'A hit leaves the target ionized.',
  mod_incendiary_payload: 'A hit sets the target burning.',
  mod_gravity_tag: 'A hit marks the target for gravity.',
  mod_relay_arc: 'The first hit jumps to a nearby target.',
  mod_bank_relay: 'A bounced hit can jump onward. A direct hit cannot.',
  mod_tether_capacitor: 'Shots into the hull on your line hit harder, up to a cap.',
  mod_conductive_path: 'A chain only jumps to a target that is already ionized.',
  mod_cryo_payload: 'A hit locks the target in cryo.',
  mod_cryo_gyros: 'Two orbiting nodes freeze whatever passes close.',
  mod_herald_fan: 'The volley spreads wider and runs a little hotter. The damage does not change.',
  mod_storm_carom: 'A bounced hit storms through ionized targets. A direct hit cannot jump.',
});

function attachAirSentences(list) {
  for (const mod of list) {
    if (!mod || (typeof mod.sentence === 'string' && mod.sentence.trim())) continue;
    const line = MODULE_AIR_SENTENCE[mod.id];
    if (line) mod.sentence = line;
  }
  return list;
}

export const MODULES = attachAirSentences(mergeUserModules(SHIPPED_MODULES));
