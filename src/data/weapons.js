// src/data/weapons.js – 12 canonical weapon modules.
// IDs use wpn_ prefix per ARCHITECTURE §0.4. requiresTech refs use tech_ prefix.
// ammo refs use cmdty_ prefix. Pure data, no imports.
// Combat fields: dmg, rof(/s), dps(derived), damageType, projSpeed(wu/s),
//   range(wu), tracking, energyCost(cap/shot or cap/s for continuous).

export const WEAPONS = [
  // --- SMALL (S slot) ---
  {
    id: 'wpn_pulse_laser_s', name: 'Pulse Laser S', slotType: 'weapon', size: 'S', tier: 1, mass: 2, price: 4500,
    dmg: 8, rof: 4.0, dps: 32, damageType: 'energy', energyCost: 3,
    projSpeed: 320, range: 600, tracking: 'fixed', spreadDeg: 0.6,
  },
  {
    id: 'wpn_autocannon_s', name: 'Autocannon S', slotType: 'weapon', size: 'S', tier: 1, mass: 4, price: 5200,
    dmg: 14, rof: 2.2, dps: 31, damageType: 'kinetic', energyCost: 1.5,
    projSpeed: 420, range: 520, tracking: 'fixed', spreadDeg: 2.2,
    heatPerShot: 9, heatMax: 100, heatDissip: 28, armorPierce: 0.5,
  },
  {
    id: 'wpn_flak_turret_s', name: 'Flak/PD Turret S', slotType: 'weapon', size: 'S', tier: 2, mass: 3, price: 11000,
    dmg: 4, rof: 8.0, dps: 32, damageType: 'kinetic', energyCost: 1,
    projSpeed: 600, range: 300, tracking: 'auto_turret', turretArcDeg: 180,
    intercepts: true,
  },

  // --- MEDIUM (M slot) ---
  {
    id: 'wpn_pulse_laser_m', name: 'Pulse Laser M', slotType: 'weapon', size: 'M', tier: 2, mass: 5, price: 14000, requiresTech: 'tech_beam_focusing',
    dmg: 12, rof: 6.0, dps: 72, damageType: 'energy', energyCost: 4,
    projSpeed: 340, range: 680, tracking: 'fixed', spreadDeg: 0.6,
  },
  {
    id: 'wpn_autocannon_m', name: 'Heavy Autocannon M', slotType: 'weapon', size: 'M', tier: 2, mass: 9, price: 19000, requiresTech: 'tech_kinetic_drivers',
    dmg: 18, rof: 4.0, dps: 72, damageType: 'kinetic', energyCost: 2,
    projSpeed: 400, range: 560, tracking: 'fixed', spreadDeg: 1.6,
    heatPerShot: 14, heatMax: 100, heatDissip: 28, armorPierce: 0.5,
  },
  {
    id: 'wpn_beam_laser_m', name: 'Beam Laser M', slotType: 'weapon', size: 'M', tier: 3, mass: 7, price: 22000, requiresTech: 'tech_beam_focusing',
    dmg: 60, rof: 0, dps: 60, damageType: 'energy', energyCost: 14,
    projSpeed: Infinity, range: 520, tracking: 'hitscan',
    continuous: true, heatPerSec: 55, heatMax: 100, heatDissip: 22,
  },
  {
    id: 'wpn_railgun_m', name: 'Railgun M', slotType: 'weapon', size: 'M', tier: 2, mass: 9, price: 21000, requiresTech: 'tech_kinetic_drivers',
    dmg: 60, rof: 0.8, dps: 48, damageType: 'kinetic', energyCost: 14,
    projSpeed: 700, range: 1100, tracking: 'fixed', armorPierce: 0.5,
  },
  {
    id: 'wpn_plasma_cannon_m', name: 'Plasma Cannon M', slotType: 'weapon', size: 'M', tier: 3, mass: 8, price: 42000, requiresTech: 'tech_plasma_dynamics',
    dmg: 34, rof: 3.0, dps: 102, damageType: 'thermal', energyCost: 9,
    projSpeed: 360, range: 600, tracking: 'fixed', splashRadius: 30,
  },
  {
    id: 'wpn_missile_rack_m', name: 'Missile Rack M', slotType: 'weapon', size: 'M', tier: 2, mass: 7, price: 24000, requiresTech: 'tech_guided_ordnance',
    dmg: 70, splashDmg: 35, splashRadius: 40, rof: 0.8, dps: 56, damageType: 'explosive', energyCost: 4,
    projSpeed: 320, projSpeedMin: 180, range: 900, tracking: 'homing', turnRate: 3.5, lockTimeS: 1.2,
    ammo: 'cmdty_munitions',
  },

  // --- LARGE (L slot) ---
  {
    id: 'wpn_heavy_beam_l', name: 'Heavy Beam L', slotType: 'weapon', size: 'L', tier: 4, mass: 16, price: 130000, requiresTech: 'tech_capital_weapons',
    dmg: 160, rof: 0, dps: 160, damageType: 'energy', energyCost: 22,
    projSpeed: Infinity, range: 900, tracking: 'hitscan',
    continuous: true, heatPerSec: 50, heatMax: 100, heatDissip: 20,
  },
  {
    id: 'wpn_torpedo_l', name: 'Torpedo L', slotType: 'weapon', size: 'L', tier: 4, mass: 24, price: 60000, requiresTech: 'tech_capital_weapons',
    dmg: 320, splashDmg: 120, splashRadius: 70, rof: 0.25, dps: 80, damageType: 'explosive', energyCost: 10,
    projSpeed: 240, projSpeedMin: 140, range: 1400, tracking: 'homing', turnRate: 1.4, lockTimeS: 2.5,
    ammo: 'cmdty_munitions',
  },
  {
    id: 'wpn_siege_lance_l', name: 'Siege Lance L', slotType: 'weapon', size: 'L', tier: 5, mass: 24, price: 310000, requiresTech: 'tech_flagship_command',
    dmg: 420, rof: 0.5, dps: 210, damageType: 'kinetic', energyCost: 40,
    projSpeed: 600, range: 1600, tracking: 'fixed', armorPierce: 0.5,
  },
  {
    // EMP Disruptor (spec §9 weapon-verb variety): a distinct DISABLE verb. Unlike hull weapons, it
    // routes ALL damage to subsystems (subsystemShare 1.0) and bypasses hull entirely — its purpose
    // is to cripple capability (drive/weapon/sensor/power), not to destroy the ship. EMP damage is
    // heavily resisted by armor but ignores shields (it couples through them), making it the
    // counter to shield-turtling and the enabler of capture/disable play.
    id: 'wpn_emp_disruptor_m', name: 'EMP Disruptor M', slotType: 'weapon', size: 'M', tier: 3, mass: 6, price: 36000, requiresTech: 'tech_plasma_dynamics',
    dmg: 45, rof: 1.5, dps: 68, damageType: 'emp', energyCost: 11,
    projSpeed: 380, range: 560, tracking: 'fixed', spreadDeg: 1.0,
    subsystemShare: 1.0, shieldBypass: 1.0,
  },
];
