// src/data/ships.js – 13 canonical player hulls across T0..T5.
// IDs use ship_ prefix per ARCHITECTURE §0.4. requiresTech refs use tech_ prefix.
// Pure data, no imports.
//
// WEAPON HARDPOINTS (Phase 2): each weapon-slot entry may be a bare size ('S') — defaults to
// 'front' — OR {size, facing} where facing ∈ 'front'|'left'|'right'|'rear'|'turret'. A fixed
// hardpoint fires along (nose + facing offset) and gimbal-assists toward the mouse within an arc;
// 'turret' tracks a target freely within turretArcDeg. Spreading facings across a hull makes
// loadout position a real strategic choice (front guns vs broadside vs rear coverage).
//
// VISUALS (overhaul): each hull now carries a `visuals` block consumed ONLY by the render track
// (src/render/visualFactory.js). It is pure presentation metadata; gameplay never reads it.
//   family       — silhouette family the procedural builder draws ('scout'|'fighter'|
//                  'freighter'|'miner'|'frigate'|'capital'|'multirole'). Replaces the old
//                  role→silhouette lookup so every hull can own its identity.
//   proportions  — overall footprint in R-fractions: {length, halfWidth, height} along (X,Z,Y).
//   tiers[]      — visual tier rows ascending by minTier (the SUM of fitted module tiers).
//                  Builder picks the highest row whose minTier the loadout meets. `name` is a
//                  cosmetic label; `hints` are family-specific geometry knobs.
//   hardpoints[] — weapon mount points in R-fractions [x,y,z] + facing + size, mirroring
//                  slots.weapon order/facings so a fitted barrel lands at its authored mount.
//   engineMounts[] — nozzle+plume mount points [x,y,z] (+ scaleK on the base plume size).
//   cockpit/bridge/drill — feature anchors [x,y,z] (null when the hull has none).
//   cargoRows    — how many stacked cargo-pod rows the freighter/miner profile draws.
//   sensor       — sensor-mast anchor [x,y,z] for utility antennas/dishes.
// All literal strings here avoid registered namespace prefixes (ship_/wpn_/…), so the
// cross-ref integrity check (scripts/check-data-refs.mjs) treats them as plain text.

export const SHIPS = [
  // ---------- T0 ----------
  {
    id: 'ship_kestrel', name: 'Kestrel', role: 'starter', tier: 0,
    hull: 120, shield: 40, baseShieldRegen: 6, cargo: 40, mass: 18, handling: 1.0,
    bankFactor: 0.70,   // how aggressively the hull rolls into a turn (0..1.2)
    energyCap: 80, energyRegen: 12, collisionRadius: 14, price: 0, buyback: 8000,
    // boost: {max, drainRate (while boosting), regenRate (idle), dashImpulse (units), dashCooldown (s)}
    boost: { max: 100, drainRate: 38, regenRate: 22, dashImpulse: 150, dashCooldown: 2.0 },
    slots: { weapon: ['S'], shield: ['S'], engine: ['M'], cargo: ['S'], mining: ['S'], utility: ['S'] },
    visuals: {
      family: 'scout',
      proportions: { length: 1.35, halfWidth: 0.42, height: 0.30 },
      tiers: [
        { minTier: 0, name: 'Mk.I', hints: { plating: 'smooth', greeble: 0.4, finCount: 0, spineRibs: 0 } },
        { minTier: 7, name: 'Mk.II', hints: { plating: 'paneled', greeble: 0.7, finCount: 2, spineRibs: 1 } },
        { minTier: 14, name: 'Mk.III', hints: { plating: 'armored', greeble: 1.0, finCount: 2, spineRibs: 2 } },
      ],
      hardpoints: [
        { facing: 'front', size: 'S', pos: [0.62, 0.06, 0.0] },
      ],
      engineMounts: [
        { pos: [-0.70, 0.0, 0.0], scaleK: 1.0 },
      ],
      cockpit: [0.16, 0.16, 0.0], bridge: null,
      drill: [0.74, 0.0, 0.0], cargoRows: 1, sensor: [-0.18, 0.22, 0.0],
    },
  },
  // ---------- T1 ----------
  {
    id: 'ship_pelican', name: 'Pelican', role: 'mining', tier: 1,
    hull: 180, shield: 60, baseShieldRegen: 8, cargo: 60, mass: 32, handling: 0.8,
    bankFactor: 0.45,
    energyCap: 110, energyRegen: 16, collisionRadius: 16, price: 22000,
    boost: { max: 70, drainRate: 44, regenRate: 16, dashImpulse: 80, dashCooldown: 3.0 },  // miners barely boost — sturdy, not nimble
    slots: { weapon: ['S'], shield: ['S'], engine: ['M'], cargo: ['M'], mining: ['M','M'], utility: ['S'] },
    visuals: {
      family: 'miner',
      proportions: { length: 1.30, halfWidth: 0.55, height: 0.42 },
      tiers: [
        { minTier: 0, name: 'Mk.I', hints: { plating: 'smooth', greeble: 0.5, armCount: 2, scoopSize: 0.8 } },
        { minTier: 7, name: 'Mk.II', hints: { plating: 'paneled', greeble: 0.8, armCount: 2, scoopSize: 1.0 } },
        { minTier: 15, name: 'Mk.III', hints: { plating: 'armored', greeble: 1.0, armCount: 4, scoopSize: 1.2 } },
      ],
      hardpoints: [
        { facing: 'front', size: 'S', pos: [0.55, 0.10, 0.0] },
      ],
      engineMounts: [
        { pos: [-0.62, 0.05, 0.20], scaleK: 0.95 },
        { pos: [-0.62, 0.05, -0.20], scaleK: 0.95 },
      ],
      cockpit: [0.30, 0.22, 0.0], bridge: null,
      drill: [0.70, 0.0, 0.0], cargoRows: 2, sensor: [-0.10, 0.30, 0.0],
    },
  },
  {
    id: 'ship_wasp', name: 'Wasp', role: 'fighter', tier: 1, requiresTech: 'tech_combat_basics',
    hull: 150, shield: 110, baseShieldRegen: 10, cargo: 15, mass: 16, handling: 1.4,
    bankFactor: 1.00,
    energyCap: 140, energyRegen: 22, collisionRadius: 14, price: 28000,
    boost: { max: 110, drainRate: 36, regenRate: 28, dashImpulse: 170, dashCooldown: 1.8 },  // twitchy combat bursts
    // twin fixed guns: one straight-front, one slightly off for a wider gimbal envelope
    slots: { weapon: ['S', { size:'S', facing:'front' }], shield: ['M'], engine: ['M'], cargo: [], mining: [], utility: ['S'] },
    visuals: {
      family: 'fighter',
      proportions: { length: 1.40, halfWidth: 0.58, height: 0.26 },
      tiers: [
        { minTier: 0, name: 'Mk.I', hints: { plating: 'smooth', greeble: 0.4, canard: false, wingSweep: 0.55 } },
        { minTier: 7, name: 'Mk.II', hints: { plating: 'paneled', greeble: 0.7, canard: true, wingSweep: 0.60 } },
        { minTier: 14, name: 'Mk.III', hints: { plating: 'armored', greeble: 1.0, canard: true, wingSweep: 0.68 } },
      ],
      hardpoints: [
        { facing: 'front', size: 'S', pos: [0.66, 0.04, 0.14] },
        { facing: 'front', size: 'S', pos: [0.66, 0.04, -0.14] },
      ],
      engineMounts: [
        { pos: [-0.66, 0.02, 0.0], scaleK: 1.05 },
      ],
      cockpit: [0.22, 0.14, 0.0], bridge: null,
      drill: null, cargoRows: 0, sensor: [-0.20, 0.20, 0.0],
    },
  },
  {
    id: 'ship_mule', name: 'Mule', role: 'freighter', tier: 1,
    hull: 200, shield: 70, baseShieldRegen: 8, cargo: 140, mass: 55, handling: 0.6,
    bankFactor: 0.35,
    energyCap: 100, energyRegen: 14, collisionRadius: 18, price: 35000,
    boost: { max: 130, drainRate: 30, regenRate: 30, dashImpulse: 240, dashCooldown: 2.2 },  // strong escape-dash, quick recharge (the archetype)
    // hauler: a rear-facing gun to discourage pursuit while it runs
    slots: { weapon: [{ size:'S', facing:'rear' }], shield: ['M'], engine: ['M'], cargo: ['M','M','M'], mining: [], utility: ['S'] },
    visuals: {
      family: 'freighter',
      proportions: { length: 1.55, halfWidth: 0.50, height: 0.46 },
      tiers: [
        { minTier: 0, name: 'Mk.I', hints: { plating: 'smooth', greeble: 0.5, podCols: 1, podRows: 2 } },
        { minTier: 7, name: 'Mk.II', hints: { plating: 'paneled', greeble: 0.8, podCols: 2, podRows: 2 } },
        { minTier: 15, name: 'Mk.III', hints: { plating: 'armored', greeble: 1.0, podCols: 2, podRows: 3 } },
      ],
      hardpoints: [
        { facing: 'rear', size: 'S', pos: [-0.78, 0.08, 0.0] },
      ],
      engineMounts: [
        { pos: [-0.74, 0.06, 0.22], scaleK: 0.9 },
        { pos: [-0.74, 0.06, -0.22], scaleK: 0.9 },
      ],
      cockpit: null, bridge: [0.80, 0.20, 0.0],
      drill: null, cargoRows: 2, sensor: [-0.30, 0.34, 0.0],
    },
  },
  // ---------- T2 ----------
  {
    id: 'ship_drifter', name: 'Drifter', role: 'multirole', tier: 2,
    hull: 320, shield: 180, baseShieldRegen: 12, cargo: 90, mass: 48, handling: 1.0,
    bankFactor: 0.70,
    energyCap: 200, energyRegen: 28, collisionRadius: 18, price: 95000,
    boost: { max: 110, drainRate: 34, regenRate: 26, dashImpulse: 160, dashCooldown: 2.0 },
    // multirole: one front + one rear = defend itself coming and going
    slots: { weapon: ['M', { size:'M', facing:'rear' }], shield: ['M'], engine: ['M'], cargo: ['M','M'], mining: ['M'], utility: ['M','M'] },
    visuals: {
      family: 'multirole',
      proportions: { length: 1.50, halfWidth: 0.50, height: 0.38 },
      tiers: [
        { minTier: 0, name: 'Mk.I', hints: { plating: 'smooth', greeble: 0.5, nacelles: 2, winglets: true } },
        { minTier: 8, name: 'Mk.II', hints: { plating: 'paneled', greeble: 0.8, nacelles: 2, winglets: true } },
        { minTier: 16, name: 'Mk.III', hints: { plating: 'armored', greeble: 1.0, nacelles: 4, winglets: true } },
      ],
      hardpoints: [
        { facing: 'front', size: 'M', pos: [0.68, 0.06, 0.0] },
        { facing: 'rear', size: 'M', pos: [-0.74, 0.06, 0.0] },
      ],
      engineMounts: [
        { pos: [-0.66, 0.04, 0.24], scaleK: 1.0 },
        { pos: [-0.66, 0.04, -0.24], scaleK: 1.0 },
      ],
      cockpit: [0.26, 0.20, 0.0], bridge: null,
      drill: [0.72, 0.0, 0.0], cargoRows: 2, sensor: [-0.14, 0.30, 0.0],
    },
  },
  {
    id: 'ship_hornet', name: 'Hornet', role: 'interceptor', tier: 2, requiresTech: 'tech_strike_craft',
    hull: 260, shield: 240, baseShieldRegen: 16, cargo: 20, mass: 24, handling: 1.7,
    bankFactor: 1.15,
    energyCap: 260, energyRegen: 38, collisionRadius: 16, price: 110000,
    boost: { max: 130, drainRate: 32, regenRate: 32, dashImpulse: 200, dashCooldown: 1.6 },  // best burst+dash in class
    // interceptor: 2 front + 1 turret for all-aspect coverage on the attack run
    slots: { weapon: ['M', 'M', { size:'M', facing:'turret' }], shield: ['M'], engine: ['L'], cargo: [], mining: [], utility: ['S','S'] },
    visuals: {
      family: 'fighter',
      proportions: { length: 1.45, halfWidth: 0.70, height: 0.30 },
      tiers: [
        { minTier: 0, name: 'Mk.I', hints: { plating: 'smooth', greeble: 0.6, canard: true, wingSweep: 0.70 } },
        { minTier: 8, name: 'Mk.II', hints: { plating: 'paneled', greeble: 0.9, canard: true, wingSweep: 0.78 } },
        { minTier: 16, name: 'Mk.III', hints: { plating: 'armored', greeble: 1.0, canard: true, wingSweep: 0.85 } },
      ],
      hardpoints: [
        { facing: 'front', size: 'M', pos: [0.70, 0.05, 0.16] },
        { facing: 'front', size: 'M', pos: [0.70, 0.05, -0.16] },
        { facing: 'turret', size: 'M', pos: [-0.10, 0.28, 0.0] },
      ],
      engineMounts: [
        { pos: [-0.68, 0.02, 0.0], scaleK: 1.20 },
      ],
      cockpit: [0.24, 0.16, 0.0], bridge: null,
      drill: null, cargoRows: 0, sensor: [-0.24, 0.26, 0.0],
    },
  },
  {
    id: 'ship_ironback', name: 'Ironback', role: 'mining_barge', tier: 2, requiresTech: 'tech_industrial_mining',
    hull: 480, shield: 160, baseShieldRegen: 10, cargo: 200, mass: 90, handling: 0.5,
    bankFactor: 0.30,
    energyCap: 240, energyRegen: 26, collisionRadius: 24, price: 130000,
    boost: { max: 60, drainRate: 50, regenRate: 12, dashImpulse: 60, dashCooldown: 4.0 },  // a brick — barely moves, doesn't run
    // slow barge: a turret so it can swat pests while its drill works
    slots: { weapon: [{ size:'M', facing:'turret' }], shield: ['M','M'], engine: ['M'], cargo: ['M','M','M'], mining: ['L','L','L','L'], utility: ['M','M'] },
    visuals: {
      family: 'miner',
      proportions: { length: 1.40, halfWidth: 0.72, height: 0.56 },
      tiers: [
        { minTier: 0, name: 'Mk.I', hints: { plating: 'paneled', greeble: 0.7, armCount: 2, scoopSize: 1.2 } },
        { minTier: 9, name: 'Mk.II', hints: { plating: 'armored', greeble: 0.9, armCount: 4, scoopSize: 1.4 } },
        { minTier: 18, name: 'Mk.III', hints: { plating: 'armored', greeble: 1.0, armCount: 6, scoopSize: 1.7 } },
      ],
      hardpoints: [
        { facing: 'turret', size: 'M', pos: [0.10, 0.42, 0.0] },
      ],
      engineMounts: [
        { pos: [-0.66, 0.06, 0.30], scaleK: 1.0 },
        { pos: [-0.66, 0.06, -0.30], scaleK: 1.0 },
      ],
      cockpit: [0.32, 0.34, 0.0], bridge: null,
      drill: [0.78, 0.0, 0.0], cargoRows: 3, sensor: [-0.20, 0.46, 0.0],
    },
  },
  // ---------- T3 ----------
  {
    id: 'ship_bastion', name: 'Bastion', role: 'corvette', tier: 3, requiresTech: 'tech_warship_license',
    hull: 640, shield: 460, baseShieldRegen: 18, cargo: 70, mass: 80, handling: 1.1,
    bankFactor: 0.55,
    energyCap: 420, energyRegen: 52, collisionRadius: 22, price: 320000,
    boost: { max: 100, drainRate: 36, regenRate: 30, dashImpulse: 120, dashCooldown: 2.4 },  // warship: steady, not flashy
    // corvette: 2 front + 1 broadside gun each side
    slots: { weapon: ['L', 'L', { size:'L', facing:'left' }, { size:'L', facing:'right' }], shield: ['L','L'], engine: ['L'], cargo: ['M'], mining: [], utility: ['M','M','M'] },
    visuals: {
      family: 'frigate',
      proportions: { length: 1.55, halfWidth: 0.62, height: 0.42 },
      tiers: [
        { minTier: 0, name: 'Mk.I', hints: { plating: 'paneled', greeble: 0.7, broadsideGuns: 1, towerTiers: 1 } },
        { minTier: 10, name: 'Mk.II', hints: { plating: 'armored', greeble: 0.9, broadsideGuns: 1, towerTiers: 2 } },
        { minTier: 20, name: 'Mk.III', hints: { plating: 'armored', greeble: 1.0, broadsideGuns: 2, towerTiers: 2 } },
      ],
      hardpoints: [
        { facing: 'front', size: 'L', pos: [0.74, 0.08, 0.18] },
        { facing: 'front', size: 'L', pos: [0.74, 0.08, -0.18] },
        { facing: 'left', size: 'L', pos: [0.10, 0.14, 0.56] },
        { facing: 'right', size: 'L', pos: [0.10, 0.14, -0.56] },
      ],
      engineMounts: [
        { pos: [-0.74, 0.06, 0.30], scaleK: 1.1 },
        { pos: [-0.74, 0.06, -0.30], scaleK: 1.1 },
      ],
      cockpit: null, bridge: [0.30, 0.34, 0.0],
      drill: null, cargoRows: 1, sensor: [-0.10, 0.52, 0.0],
    },
  },
  {
    id: 'ship_atlas', name: 'Atlas', role: 'heavy_hauler', tier: 3, requiresTech: 'tech_bulk_logistics',
    hull: 720, shield: 300, baseShieldRegen: 12, cargo: 480, mass: 200, handling: 0.45,
    bankFactor: 0.25,
    energyCap: 360, energyRegen: 40, collisionRadius: 30, price: 380000,
    boost: { max: 160, drainRate: 26, regenRate: 36, dashImpulse: 320, dashCooldown: 2.0 },  // the escape-king: huge dash, fast recharge, ponderous otherwise
    // ponderous hauler: front + rear PD guns — survive, don't win fights
    slots: { weapon: ['M', { size:'M', facing:'rear' }], shield: ['L','L'], engine: ['L'], cargo: ['L','L','L','L','L','L'], mining: [], utility: ['M','M','M'] },
    visuals: {
      family: 'freighter',
      proportions: { length: 1.75, halfWidth: 0.62, height: 0.62 },
      tiers: [
        { minTier: 0, name: 'Mk.I', hints: { plating: 'paneled', greeble: 0.6, podCols: 2, podRows: 3 } },
        { minTier: 10, name: 'Mk.II', hints: { plating: 'armored', greeble: 0.9, podCols: 3, podRows: 3 } },
        { minTier: 20, name: 'Mk.III', hints: { plating: 'armored', greeble: 1.0, podCols: 3, podRows: 4 } },
      ],
      hardpoints: [
        { facing: 'front', size: 'M', pos: [0.82, 0.10, 0.0] },
        { facing: 'rear', size: 'M', pos: [-0.84, 0.10, 0.0] },
      ],
      engineMounts: [
        { pos: [-0.80, 0.08, 0.34], scaleK: 1.2 },
        { pos: [-0.80, 0.08, -0.34], scaleK: 1.2 },
        { pos: [-0.80, 0.08, 0.12], scaleK: 0.9 },
        { pos: [-0.80, 0.08, -0.12], scaleK: 0.9 },
      ],
      cockpit: null, bridge: [0.84, 0.26, 0.0],
      drill: null, cargoRows: 3, sensor: [-0.34, 0.44, 0.0],
    },
  },
  {
    id: 'ship_ranger', name: 'Ranger', role: 'explorer', tier: 3, requiresTech: 'tech_long_range_survey',
    hull: 480, shield: 380, baseShieldRegen: 16, cargo: 110, mass: 60, handling: 1.3,
    bankFactor: 0.90,
    energyCap: 500, energyRegen: 64, collisionRadius: 18, price: 290000,
    boost: { max: 140, drainRate: 28, regenRate: 34, dashImpulse: 180, dashCooldown: 1.8 },  // long-endurance cruise boost
    // explorer: twin front + a turret for self-defense deep in hostile space
    slots: { weapon: ['M', 'M', { size:'M', facing:'turret' }], shield: ['M','M'], engine: ['L'], cargo: ['M','M'], mining: [], utility: ['L','L','L','L'] },
    visuals: {
      family: 'multirole',
      proportions: { length: 1.65, halfWidth: 0.52, height: 0.40 },
      tiers: [
        { minTier: 0, name: 'Mk.I', hints: { plating: 'smooth', greeble: 0.6, nacelles: 2, winglets: true } },
        { minTier: 9, name: 'Mk.II', hints: { plating: 'paneled', greeble: 0.9, nacelles: 2, winglets: true } },
        { minTier: 18, name: 'Mk.III', hints: { plating: 'armored', greeble: 1.0, nacelles: 4, winglets: true } },
      ],
      hardpoints: [
        { facing: 'front', size: 'M', pos: [0.72, 0.06, 0.16] },
        { facing: 'front', size: 'M', pos: [0.72, 0.06, -0.16] },
        { facing: 'turret', size: 'M', pos: [-0.12, 0.32, 0.0] },
      ],
      engineMounts: [
        { pos: [-0.72, 0.04, 0.22], scaleK: 1.05 },
        { pos: [-0.72, 0.04, -0.22], scaleK: 1.05 },
      ],
      cockpit: [0.28, 0.22, 0.0], bridge: null,
      drill: null, cargoRows: 1, sensor: [-0.30, 0.40, 0.0],
    },
  },
  // ---------- T4 ----------
  {
    id: 'ship_warden', name: 'Warden', role: 'gunship', tier: 4, requiresTech: 'tech_capital_weapons',
    hull: 1100, shield: 820, baseShieldRegen: 22, cargo: 90, mass: 150, handling: 0.95,
    bankFactor: 0.40,
    energyCap: 720, energyRegen: 84, collisionRadius: 26, price: 950000,
    boost: { max: 90, drainRate: 40, regenRate: 24, dashImpulse: 90, dashCooldown: 3.0 },  // a wall of guns that advances, doesn't chase
    // gunship: 2 front heavies + 1 broadside each side = a weapons platform
    slots: { weapon: ['L', 'L', { size:'L', facing:'left' }, { size:'L', facing:'right' }], shield: ['L','L','L'], engine: ['L'], cargo: ['M'], mining: [], utility: ['L','L','L','L'] },
    visuals: {
      family: 'frigate',
      proportions: { length: 1.70, halfWidth: 0.78, height: 0.52 },
      tiers: [
        { minTier: 0, name: 'Mk.I', hints: { plating: 'paneled', greeble: 0.8, broadsideGuns: 1, towerTiers: 2 } },
        { minTier: 12, name: 'Mk.II', hints: { plating: 'armored', greeble: 1.0, broadsideGuns: 2, towerTiers: 2 } },
        { minTier: 24, name: 'Mk.III', hints: { plating: 'armored', greeble: 1.0, broadsideGuns: 2, towerTiers: 3 } },
      ],
      hardpoints: [
        { facing: 'front', size: 'L', pos: [0.78, 0.10, 0.22] },
        { facing: 'front', size: 'L', pos: [0.78, 0.10, -0.22] },
        { facing: 'left', size: 'L', pos: [0.06, 0.18, 0.70] },
        { facing: 'right', size: 'L', pos: [0.06, 0.18, -0.70] },
      ],
      engineMounts: [
        { pos: [-0.76, 0.08, 0.40], scaleK: 1.15 },
        { pos: [-0.76, 0.08, -0.40], scaleK: 1.15 },
        { pos: [-0.76, 0.08, 0.0], scaleK: 1.0 },
      ],
      cockpit: null, bridge: [0.34, 0.44, 0.0],
      drill: null, cargoRows: 1, sensor: [-0.04, 0.64, 0.0],
    },
  },
  {
    id: 'ship_colossus', name: 'Colossus', role: 'battlecruiser', tier: 4, requiresTech: 'tech_capital_hulls',
    hull: 1600, shield: 1100, baseShieldRegen: 26, cargo: 200, mass: 300, handling: 0.7,
    bankFactor: 0.30,
    energyCap: 900, energyRegen: 100, collisionRadius: 32, price: 1400000,
    boost: { max: 80, drainRate: 42, regenRate: 22, dashImpulse: 70, dashCooldown: 3.2 },
    // battlecruiser: 3 front + broadside batteries both sides
    slots: { weapon: ['L', 'L', 'L', { size:'L', facing:'left' }, { size:'L', facing:'right' }], shield: ['L','L','L','L'], engine: ['L'], cargo: ['L','L'], mining: [], utility: ['L','L','L','L','L'] },
    visuals: {
      family: 'capital',
      proportions: { length: 1.85, halfWidth: 0.82, height: 0.60 },
      tiers: [
        { minTier: 0, name: 'Mk.I', hints: { plating: 'paneled', greeble: 0.9, towerTiers: 2, finArrays: 1 } },
        { minTier: 14, name: 'Mk.II', hints: { plating: 'armored', greeble: 1.0, towerTiers: 3, finArrays: 2 } },
        { minTier: 28, name: 'Mk.III', hints: { plating: 'armored', greeble: 1.0, towerTiers: 3, finArrays: 3 } },
      ],
      hardpoints: [
        { facing: 'front', size: 'L', pos: [0.84, 0.12, 0.0] },
        { facing: 'front', size: 'L', pos: [0.82, 0.10, 0.26] },
        { facing: 'front', size: 'L', pos: [0.82, 0.10, -0.26] },
        { facing: 'left', size: 'L', pos: [0.02, 0.20, 0.74] },
        { facing: 'right', size: 'L', pos: [0.02, 0.20, -0.74] },
      ],
      engineMounts: [
        { pos: [-0.82, 0.10, 0.46], scaleK: 1.25 },
        { pos: [-0.82, 0.10, -0.46], scaleK: 1.25 },
        { pos: [-0.82, 0.10, 0.16], scaleK: 1.0 },
        { pos: [-0.82, 0.10, -0.16], scaleK: 1.0 },
      ],
      cockpit: null, bridge: [0.40, 0.50, 0.0],
      drill: null, cargoRows: 2, sensor: [-0.04, 0.74, 0.0],
    },
  },
  // ---------- T5 ----------
  {
    id: 'ship_leviathan', name: 'Leviathan', role: 'flagship', tier: 5, requiresTech: 'tech_flagship_command',
    hull: 3200, shield: 2600, baseShieldRegen: 32, cargo: 350, mass: 600, handling: 0.6,
    bankFactor: 0.22,
    energyCap: 1600, energyRegen: 160, collisionRadius: 45, price: 4500000,
    boost: { max: 70, drainRate: 46, regenRate: 18, dashImpulse: 50, dashCooldown: 3.6 },
    // flagship: 3 front + 2 broadside each side — a broadside duel monster
    slots: { weapon: ['L', 'L', 'L', { size:'L', facing:'left' }, { size:'L', facing:'left' }, { size:'L', facing:'right' }, { size:'L', facing:'right' }], shield: ['L','L','L','L','L'], engine: ['L'], cargo: ['L','L','L'], mining: [], utility: ['L','L','L','L','L','L','L','L'] },
    visuals: {
      family: 'capital',
      proportions: { length: 2.00, halfWidth: 0.92, height: 0.72 },
      tiers: [
        { minTier: 0, name: 'Mk.I', hints: { plating: 'armored', greeble: 1.0, towerTiers: 3, finArrays: 2 } },
        { minTier: 16, name: 'Mk.II', hints: { plating: 'armored', greeble: 1.0, towerTiers: 4, finArrays: 3 } },
        { minTier: 32, name: 'Mk.III', hints: { plating: 'armored', greeble: 1.0, towerTiers: 4, finArrays: 4 } },
      ],
      hardpoints: [
        { facing: 'front', size: 'L', pos: [0.90, 0.14, 0.0] },
        { facing: 'front', size: 'L', pos: [0.86, 0.12, 0.30] },
        { facing: 'front', size: 'L', pos: [0.86, 0.12, -0.30] },
        { facing: 'left', size: 'L', pos: [0.10, 0.22, 0.82] },
        { facing: 'left', size: 'L', pos: [-0.20, 0.22, 0.82] },
        { facing: 'right', size: 'L', pos: [0.10, 0.22, -0.82] },
        { facing: 'right', size: 'L', pos: [-0.20, 0.22, -0.82] },
      ],
      engineMounts: [
        { pos: [-0.88, 0.12, 0.54], scaleK: 1.35 },
        { pos: [-0.88, 0.12, -0.54], scaleK: 1.35 },
        { pos: [-0.88, 0.12, 0.20], scaleK: 1.05 },
        { pos: [-0.88, 0.12, -0.20], scaleK: 1.05 },
      ],
      cockpit: null, bridge: [0.44, 0.58, 0.0],
      drill: null, cargoRows: 3, sensor: [-0.04, 0.86, 0.0],
    },
  },
];
