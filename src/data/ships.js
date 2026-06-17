// src/data/ships.js – 13 canonical player hulls across T0..T5.
// IDs use ship_ prefix per ARCHITECTURE §0.4. requiresTech refs use tech_ prefix.
// Pure data, no imports.

export const SHIPS = [
  // ---------- T0 ----------
  {
    id: 'ship_kestrel', name: 'Kestrel', role: 'starter', tier: 0,
    hull: 120, shield: 40, baseShieldRegen: 6, cargo: 40, mass: 18, handling: 1.0,
    bankFactor: 0.70,   // how aggressively the hull rolls into a turn (0..1.2)
    energyCap: 80, energyRegen: 12, collisionRadius: 14, price: 0, buyback: 8000,
    slots: { weapon: ['S'], shield: ['S'], engine: ['M'], cargo: ['S'], mining: [], utility: ['S'] },
  },
  // ---------- T1 ----------
  {
    id: 'ship_pelican', name: 'Pelican', role: 'mining', tier: 1,
    hull: 180, shield: 60, baseShieldRegen: 8, cargo: 60, mass: 32, handling: 0.8,
    bankFactor: 0.45,
    energyCap: 110, energyRegen: 16, collisionRadius: 16, price: 22000,
    slots: { weapon: ['S'], shield: ['S'], engine: ['M'], cargo: ['M'], mining: ['M','M'], utility: ['S'] },
  },
  {
    id: 'ship_wasp', name: 'Wasp', role: 'fighter', tier: 1, requiresTech: 'tech_combat_basics',
    hull: 150, shield: 110, baseShieldRegen: 10, cargo: 15, mass: 16, handling: 1.4,
    bankFactor: 1.00,
    energyCap: 140, energyRegen: 22, collisionRadius: 14, price: 28000,
    slots: { weapon: ['S','S'], shield: ['M'], engine: ['M'], cargo: [], mining: [], utility: ['S'] },
  },
  {
    id: 'ship_mule', name: 'Mule', role: 'freighter', tier: 1,
    hull: 200, shield: 70, baseShieldRegen: 8, cargo: 140, mass: 55, handling: 0.6,
    bankFactor: 0.35,
    energyCap: 100, energyRegen: 14, collisionRadius: 18, price: 35000,
    slots: { weapon: ['S'], shield: ['M'], engine: ['M'], cargo: ['M','M','M'], mining: [], utility: ['S'] },
  },
  // ---------- T2 ----------
  {
    id: 'ship_drifter', name: 'Drifter', role: 'multirole', tier: 2,
    hull: 320, shield: 180, baseShieldRegen: 12, cargo: 90, mass: 48, handling: 1.0,
    bankFactor: 0.70,
    energyCap: 200, energyRegen: 28, collisionRadius: 18, price: 95000,
    slots: { weapon: ['M','M'], shield: ['M'], engine: ['M'], cargo: ['M','M'], mining: ['M'], utility: ['M','M'] },
  },
  {
    id: 'ship_hornet', name: 'Hornet', role: 'interceptor', tier: 2, requiresTech: 'tech_strike_craft',
    hull: 260, shield: 240, baseShieldRegen: 16, cargo: 20, mass: 24, handling: 1.7,
    bankFactor: 1.15,
    energyCap: 260, energyRegen: 38, collisionRadius: 16, price: 110000,
    slots: { weapon: ['M','M','M'], shield: ['M'], engine: ['L'], cargo: [], mining: [], utility: ['S','S'] },
  },
  {
    id: 'ship_ironback', name: 'Ironback', role: 'mining_barge', tier: 2, requiresTech: 'tech_industrial_mining',
    hull: 480, shield: 160, baseShieldRegen: 10, cargo: 200, mass: 90, handling: 0.5,
    bankFactor: 0.30,
    energyCap: 240, energyRegen: 26, collisionRadius: 24, price: 130000,
    slots: { weapon: ['M'], shield: ['M','M'], engine: ['M'], cargo: ['M','M','M'], mining: ['L','L','L','L'], utility: ['M','M'] },
  },
  // ---------- T3 ----------
  {
    id: 'ship_bastion', name: 'Bastion', role: 'corvette', tier: 3, requiresTech: 'tech_warship_license',
    hull: 640, shield: 460, baseShieldRegen: 18, cargo: 70, mass: 80, handling: 1.1,
    bankFactor: 0.55,
    energyCap: 420, energyRegen: 52, collisionRadius: 22, price: 320000,
    slots: { weapon: ['L','L','L'], shield: ['L','L'], engine: ['L'], cargo: ['M'], mining: [], utility: ['M','M','M'] },
  },
  {
    id: 'ship_atlas', name: 'Atlas', role: 'heavy_hauler', tier: 3, requiresTech: 'tech_bulk_logistics',
    hull: 720, shield: 300, baseShieldRegen: 12, cargo: 480, mass: 200, handling: 0.45,
    bankFactor: 0.25,
    energyCap: 360, energyRegen: 40, collisionRadius: 30, price: 380000,
    slots: { weapon: ['M','M'], shield: ['L','L'], engine: ['L'], cargo: ['L','L','L','L','L','L'], mining: [], utility: ['M','M','M'] },
  },
  {
    id: 'ship_ranger', name: 'Ranger', role: 'explorer', tier: 3, requiresTech: 'tech_long_range_survey',
    hull: 480, shield: 380, baseShieldRegen: 16, cargo: 110, mass: 60, handling: 1.3,
    bankFactor: 0.90,
    energyCap: 500, energyRegen: 64, collisionRadius: 18, price: 290000,
    slots: { weapon: ['M','M'], shield: ['M','M'], engine: ['L'], cargo: ['M','M'], mining: [], utility: ['L','L','L','L'] },
  },
  // ---------- T4 ----------
  {
    id: 'ship_warden', name: 'Warden', role: 'gunship', tier: 4, requiresTech: 'tech_capital_weapons',
    hull: 1100, shield: 820, baseShieldRegen: 22, cargo: 90, mass: 150, handling: 0.95,
    bankFactor: 0.40,
    energyCap: 720, energyRegen: 84, collisionRadius: 26, price: 950000,
    slots: { weapon: ['L','L','L','L'], shield: ['L','L','L'], engine: ['L'], cargo: ['M'], mining: [], utility: ['L','L','L','L'] },
  },
  {
    id: 'ship_colossus', name: 'Colossus', role: 'battlecruiser', tier: 4, requiresTech: 'tech_capital_hulls',
    hull: 1600, shield: 1100, baseShieldRegen: 26, cargo: 200, mass: 300, handling: 0.7,
    bankFactor: 0.30,
    energyCap: 900, energyRegen: 100, collisionRadius: 32, price: 1400000,
    slots: { weapon: ['L','L','L','L','L'], shield: ['L','L','L','L'], engine: ['L'], cargo: ['L','L'], mining: [], utility: ['L','L','L','L','L'] },
  },
  // ---------- T5 ----------
  {
    id: 'ship_leviathan', name: 'Leviathan', role: 'flagship', tier: 5, requiresTech: 'tech_flagship_command',
    hull: 3200, shield: 2600, baseShieldRegen: 32, cargo: 350, mass: 600, handling: 0.6,
    bankFactor: 0.22,
    energyCap: 1600, energyRegen: 160, collisionRadius: 45, price: 4500000,
    slots: { weapon: ['L','L','L','L','L','L','L'], shield: ['L','L','L','L','L'], engine: ['L'], cargo: ['L','L','L'], mining: [], utility: ['L','L','L','L','L','L','L','L'] },
  },
];
