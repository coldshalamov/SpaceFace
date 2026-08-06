// src/data/weapons.js – canonical weapon modules.
// IDs use wpn_ prefix per ARCHITECTURE §0.4. requiresTech refs use tech_ prefix.
// ammo refs use cmdty_ prefix. Pure data, no imports.
// Combat fields: dmg, rof(/s), dps(derived), damageType, projSpeed(wu/s),
//   range(wu), tracking, energyCost(cap/shot or cap/s for continuous).
// PQ-009 impulse identity: impulsePerHit is world-space momentum at a full authored hit;
// continuous weapons scale it by their per-tick damage fraction. tumbleTorque is the maximum
// authored angular impulse for an off-center hit. impulseProvenance is the stable receipt tag.

export const WEAPONS = [
  // --- SMALL (S slot) ---
  {
    id: 'wpn_pulse_laser_s', name: 'Pulse Laser S', slotType: 'weapon', size: 'S', tier: 1, mass: 2, price: 4500,
    // Starter reliability: a long, readable engagement burst rather than five-shot lockout or
    // infinite fire. At 5.5 rps the authored dissipation yields roughly seven seconds / 35+ shots
    // before a short forced vent; releasing the trigger for two seconds sheds meaningful heat.
    dmg: 8, rof: 5.5, dps: 44, damageType: 'energy', energyCost: 2,
    projSpeed: 320, range: 600, tracking: 'fixed', spreadDeg: 0.6,
    heatPerShot: 5, heatMax: 100, heatDissip: 12,
    impulsePerHit: 0.5, tumbleTorque: 0.05, impulseProvenance: 'starter_pulse_plink',
  },
  {
    id: 'wpn_autocannon_s', name: 'Autocannon S', slotType: 'weapon', size: 'S', tier: 1, mass: 4, price: 5200,
    dmg: 14, rof: 2.2, dps: 31, damageType: 'kinetic', energyCost: 1.5,
    projSpeed: 420, range: 520, tracking: 'fixed', spreadDeg: 2.2,
    heatPerShot: 9, heatMax: 100, heatDissip: 28, armorPierce: 0.5,
    impulsePerHit: 28, tumbleTorque: 4, impulseProvenance: 'small_autocannon_slug',
  },
  {
    id: 'wpn_flak_turret_s', name: 'Flak/PD Turret S', slotType: 'weapon', size: 'S', tier: 2, mass: 3, price: 11000,
    dmg: 4, rof: 8.0, dps: 32, damageType: 'kinetic', energyCost: 1,
    projSpeed: 600, range: 300, tracking: 'auto_turret', turretArcDeg: 180,
    intercepts: true,
    impulsePerHit: 5, tumbleTorque: 0.6, impulseProvenance: 'flak_fragment',
  },

  // --- MEDIUM (M slot) ---
  {
    id: 'wpn_pulse_laser_m', name: 'Pulse Laser M', slotType: 'weapon', size: 'M', tier: 2, mass: 5, price: 14000, requiresTech: 'tech_beam_focusing',
    dmg: 12, rof: 6.0, dps: 72, damageType: 'energy', energyCost: 4,
    projSpeed: 340, range: 680, tracking: 'fixed', spreadDeg: 0.6,
    impulsePerHit: 1.2, tumbleTorque: 0.12, impulseProvenance: 'medium_pulse_bolt',
  },
  {
    id: 'wpn_autocannon_m', name: 'Heavy Autocannon M', slotType: 'weapon', size: 'M', tier: 2, mass: 9, price: 19000, requiresTech: 'tech_kinetic_drivers',
    dmg: 18, rof: 4.0, dps: 72, damageType: 'kinetic', energyCost: 2,
    projSpeed: 400, range: 560, tracking: 'fixed', spreadDeg: 1.6,
    heatPerShot: 14, heatMax: 100, heatDissip: 28, armorPierce: 0.5,
    impulsePerHit: 48, tumbleTorque: 7, impulseProvenance: 'heavy_autocannon_slug',
  },
  {
    id: 'unique_ironsong_ac', baseId: 'wpn_autocannon_m', name: 'Ironsong AC', slotType: 'weapon', size: 'M', tier: 2, mass: 9, price: 0,
    dmg: 16.2, rof: 4.8, dps: 77.76, damageType: 'kinetic', energyCost: 2,
    projSpeed: 400, range: 560, tracking: 'fixed', spreadDeg: 1.0,
    heatPerShot: 14, heatMax: 100, heatDissip: 28, armorPierce: 0.5,
    purchasable: false, unique: true, salvageOnly: true,
    variantBonuses: { rateOfFirePct: 0.20, damagePct: -0.10, spreadDeg: 1.0 },
    impulsePerHit: 44, tumbleTorque: 8, impulseProvenance: 'ironsong_burst_slug',
  },
  {
    id: 'wpn_beam_laser_m', name: 'Beam Laser M', slotType: 'weapon', size: 'M', tier: 3, mass: 7, price: 22000, requiresTech: 'tech_beam_focusing',
    dmg: 60, rof: 0, dps: 60, damageType: 'energy', energyCost: 14,
    projSpeed: Infinity, range: 520, tracking: 'hitscan',
    continuous: true, heatPerSec: 55, heatMax: 100, heatDissip: 22,
    impulsePerHit: 10, tumbleTorque: 0.8, impulseProvenance: 'light_beam_pressure',
  },
  {
    id: 'unique_veil_cutter', baseId: 'wpn_beam_laser_m', name: 'Veil-Cutter', slotType: 'weapon', size: 'M', tier: 3, mass: 7, price: 0,
    dmg: 60, rof: 0, dps: 60, damageType: 'energy', energyCost: 14,
    projSpeed: Infinity, range: 598, tracking: 'hitscan', spreadDeg: 0.3,
    continuous: true, heatPerSec: 66, heatMax: 100, heatDissip: 22,
    purchasable: false, unique: true, salvageOnly: true,
    variantBonuses: { rangePct: 0.15, spreadDeg: 0.3, heatPerSecPct: 0.20 },
    impulsePerHit: 12, tumbleTorque: 1.2, impulseProvenance: 'veil_cutter_pressure',
  },
  {
    id: 'wpn_railgun_m', name: 'Railgun M', slotType: 'weapon', size: 'M', tier: 2, mass: 9, price: 21000, requiresTech: 'tech_kinetic_drivers',
    dmg: 60, rof: 0.8, dps: 48, damageType: 'kinetic', energyCost: 14,
    projSpeed: 700, range: 1100, tracking: 'fixed', armorPierce: 0.5,
    impulsePerHit: 120, tumbleTorque: 16, impulseProvenance: 'railgun_penetrator',
  },
  {
    id: 'wpn_plasma_cannon_m', name: 'Plasma Cannon M', slotType: 'weapon', size: 'M', tier: 3, mass: 8, price: 42000, requiresTech: 'tech_plasma_dynamics',
    dmg: 34, rof: 3.0, dps: 102, damageType: 'thermal', energyCost: 9,
    projSpeed: 360, range: 600, tracking: 'fixed', splashRadius: 30,
    impulsePerHit: 36, tumbleTorque: 5, impulseProvenance: 'plasma_pressure',
  },
  {
    id: 'wpn_missile_rack_m', name: 'Missile Rack M', slotType: 'weapon', size: 'M', tier: 2, mass: 7, price: 24000, requiresTech: 'tech_guided_ordnance',
    dmg: 70, splashDmg: 35, splashRadius: 40, rof: 0.8, dps: 56, damageType: 'explosive', energyCost: 4,
    projSpeed: 320, projSpeedMin: 180, range: 900, tracking: 'homing', turnRate: 3.5, lockTimeS: 1.2,
    ammo: 'cmdty_munitions',
    impulsePerHit: 150, tumbleTorque: 22, impulseProvenance: 'missile_detonation',
  },
  {
    id: 'unique_nestbreaker_rack', baseId: 'wpn_missile_rack_m', name: 'Nestbreaker Rack', slotType: 'weapon', size: 'M', tier: 2, mass: 7, price: 0,
    dmg: 49, splashDmg: 24.5, splashRadius: 40, rof: 0.8, dps: 78.4, damageType: 'explosive', energyCost: 4,
    projSpeed: 320, projSpeedMin: 180, range: 900, tracking: 'homing', turnRate: 3.5, lockTimeS: 1.2,
    ammo: 'cmdty_munitions', splitCount: 2, submunitions: { count: 2, damageMult: 0.70 },
    purchasable: false, unique: true, salvageOnly: true,
    variantBonuses: { submunitionCount: 2, perMissileDamagePct: -0.30 },
    impulsePerHit: 92, tumbleTorque: 15, impulseProvenance: 'nestbreaker_submunition',
  },

  // --- LARGE (L slot) ---
  {
    id: 'wpn_heavy_beam_l', name: 'Heavy Beam L', slotType: 'weapon', size: 'L', tier: 4, mass: 16, price: 130000, requiresTech: 'tech_capital_weapons',
    dmg: 160, rof: 0, dps: 160, damageType: 'energy', energyCost: 22,
    projSpeed: Infinity, range: 900, tracking: 'hitscan',
    continuous: true, heatPerSec: 50, heatMax: 100, heatDissip: 20,
    impulsePerHit: 30, tumbleTorque: 2.5, impulseProvenance: 'heavy_beam_pressure',
  },
  {
    id: 'unique_lighthouse_heavy_beam', baseId: 'wpn_heavy_beam_l', name: 'Lighthouse Heavy Beam', slotType: 'weapon', size: 'L', tier: 4, mass: 16, price: 0,
    dmg: 200, rof: 0, dps: 200, damageType: 'energy', energyCost: 22,
    projSpeed: Infinity, range: 1035, tracking: 'hitscan',
    continuous: true, heatPerSec: 67.5, heatMax: 100, heatDissip: 20,
    purchasable: false, unique: true, salvageOnly: true,
    variantBonuses: { damagePct: 0.25, rangePct: 0.15, heatPerSecPct: 0.35 },
    impulsePerHit: 38, tumbleTorque: 3.5, impulseProvenance: 'lighthouse_beam_pressure',
  },
  {
    id: 'wpn_torpedo_l', name: 'Torpedo L', slotType: 'weapon', size: 'L', tier: 4, mass: 24, price: 60000, requiresTech: 'tech_capital_weapons',
    dmg: 320, splashDmg: 120, splashRadius: 70, rof: 0.25, dps: 80, damageType: 'explosive', energyCost: 10,
    projSpeed: 240, projSpeedMin: 140, range: 1400, tracking: 'homing', turnRate: 1.4, lockTimeS: 2.5,
    ammo: 'cmdty_munitions',
    impulsePerHit: 320, tumbleTorque: 48, impulseProvenance: 'torpedo_detonation',
  },
  {
    id: 'wpn_siege_lance_l', name: 'Siege Lance L', slotType: 'weapon', size: 'L', tier: 5, mass: 24, price: 310000, requiresTech: 'tech_flagship_command',
    dmg: 420, rof: 0.5, dps: 210, damageType: 'kinetic', energyCost: 40,
    projSpeed: 600, range: 1600, tracking: 'fixed', armorPierce: 0.5,
    impulsePerHit: 420, tumbleTorque: 64, impulseProvenance: 'siege_lance_impact',
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
    impulsePerHit: 14, tumbleTorque: 10, impulseProvenance: 'emp_attitude_spike',
  },
  {
    // GRAVITY MARKER — low-damage setup tool for the existing Well/Repulsor/Cone kernel. A landed
    // shot leaves a six-second simulation status that increases artificial-field coupling; merely
    // selecting a target does nothing. The cyan disruption projectile and persistent contracting
    // world marker make the state readable without adding an asset or changing the default fit.
    id: 'wpn_gravity_marker_s', name: 'Gravity Marker S', slotType: 'weapon', size: 'S', tier: 2, mass: 3, price: 18000, requiresTech: 'tech_graviton_drives',
    dmg: 3, rof: 0.25, dps: 0.75, damageType: 'emp', energyCost: 7,
    projSpeed: 520, range: 680, tracking: 'fixed', spreadDeg: 0.5,
    impulsePerHit: 1, tumbleTorque: 0.08, impulseProvenance: 'gravity_marker_ping',
    statuses: [{ id: 'status_gravity_marked', stacks: 1 }],
  },
  {
    // MOMENTUM SINK — a landed hit binds the target to the shooter's translational frame for four
    // seconds. The combat kernel applies a capped opposing impulse; the weapon never writes target
    // velocity, controls, facing, braking, or speed limits and remains weak as direct damage.
    id: 'wpn_momentum_sink_s', name: 'Momentum Sink S', slotType: 'weapon', size: 'S', tier: 2, mass: 3, price: 21000, requiresTech: 'tech_graviton_drives',
    dmg: 3, rof: 0.2, dps: 0.6, damageType: 'emp', energyCost: 9,
    projSpeed: 500, range: 640, tracking: 'fixed', spreadDeg: 0.45,
    impulsePerHit: 1, tumbleTorque: 0.08, impulseProvenance: 'momentum_sink_latch',
    statuses: [{ id: 'status_momentum_sink', stacks: 1 }],
  },

  // --- PHYSICS-FIRST FAMILY (SF-10 / STEP 9): three setup/payoff verbs on the PQ-009 impulse
  // kernel. They read mechanically distinct in flight (see src/render/vfxProfiles.js) and are the
  // light-tier rebalance lever: a light hull (Wasp mass 16, Hornet 24) is picked up and put into
  // terrain, not ground down as an HP sponge, while a mass-anchored heavy (150+) shrugs the same
  // shove. Impulse APPLICATION and the contact payoff are owned by the kernel + collisionConsequences
  // + physics authority; these defs only DECLARE identity (impulsePerHit / tumbleTorque / stable
  // provenance) per PQ-009. Each carries price>0 so it reaches the outfitting shop, and each has a
  // distinct impulseProvenance so its receipt and its VFX identity never collapse onto another family.
  {
    // CONCUSSION CANNON — a heavy, slow, low-damage slug whose payload is MOMENTUM, not damage. A hit
    // shoves the target along the slug line (impulsePerHit ÷ target mass): 400 ÷ 16 ≈ 25 wu/s on a
    // Wasp clears the kernel tumbleDeltaV (18), so the ship is thrown and TUMBLES the instant it meets
    // terrain — the wall impact is its own receipted terrain-damage event. 400 ÷ 150 ≈ 2.7 wu/s on a
    // gunship is below staggerDeltaV (3), so heavies are unmoved. The kill comes from the environment,
    // not the gun; this is deliberately NOT a DPS weapon (STEP 9 forbidden shortcut #1).
    id: 'wpn_concussion_cannon_m', name: 'Concussion Cannon M', slotType: 'weapon', size: 'M', tier: 2, mass: 9, price: 26000, requiresTech: 'tech_kinetic_drivers',
    dmg: 12, rof: 1.0, dps: 12, damageType: 'kinetic', energyCost: 6,
    projSpeed: 340, range: 560, tracking: 'fixed', spreadDeg: 1.2,
    heatPerShot: 16, heatMax: 100, heatDissip: 26,
    impulsePerHit: 400, tumbleTorque: 60, impulseProvenance: 'concussion_slug',
  },
  {
    // VECTOR MINE — deployable ordnance whose payload is a RADIAL IMPULSE, not a burn: zero hull
    // damage (design Q9), its cost paid entirely in capacitor + heat at deploy. It lobs off the nose,
    // arms after mineArmS, then any ship/drone that enters mineTriggerRadius — INCLUDING the owner —
    // detonates it, shoving every body inside mineBlastRadius outward with a mass-scaled kick. Enemies
    // scatter; a pilot who drops one and dives back through it gets blast-yourself mobility (STEP 9
    // forbidden shortcut #3: a mine that does not move the player). Fired via the weapons DEPLOY verb,
    // never as a projectile — impulsePerHit is the blast momentum the detonation imparts through the
    // physics authority. dmg 0 is honest: the mine throws, it does not damage.
    id: 'wpn_vector_mine_m', name: 'Vector Mine M', slotType: 'weapon', size: 'M', tier: 2, mass: 7, price: 22000, requiresTech: 'tech_guided_ordnance',
    dmg: 0, rof: 0.5, dps: 0, damageType: 'kinetic', energyCost: 22,
    projSpeed: 90, range: 260, tracking: 'deploy',
    heatPerShot: 34, heatMax: 100, heatDissip: 22,
    deployKind: 'vector_mine', mineArmS: 1.4, mineTriggerRadius: 60, mineBlastRadius: 150, mineLifeS: 30, mineMaxActive: 3,
    impulsePerHit: 620, tumbleTorque: 24, impulseProvenance: 'vector_mine_pulse',
  },
  {
    // RCS DISRUPTOR — a subsystem-coupling spike that couples through shields like the EMP disruptor
    // (subsystemShare/shieldBypass) and, for a bounded window (rcsDisruptS), suppresses the target's
    // attitude control: it drifts, cannot hold a firing line, and slides into your tether arc. It
    // REUSES the existing tumble-owner pattern — weapons runs last before physics, so it overwrites
    // the AI's control command for the window and damps intent (no new status-effect framework) — and
    // it is triggered off the PQ-009 provenance the hit leaves ('rcs_disruptor_spike'). Distinct from
    // the concussion cannon: it does NOT throw the ship, it removes its steering. Low hull damage —
    // this is a disable verb, not a killer.
    id: 'wpn_rcs_disruptor_m', name: 'RCS Disruptor M', slotType: 'weapon', size: 'M', tier: 3, mass: 6, price: 34000, requiresTech: 'tech_plasma_dynamics',
    dmg: 16, rof: 1.4, dps: 22.4, damageType: 'emp', energyCost: 10,
    projSpeed: 400, range: 520, tracking: 'fixed', spreadDeg: 1.0,
    subsystemShare: 0.85, shieldBypass: 1.0, rcsDisruptS: 1.6,
    impulsePerHit: 10, tumbleTorque: 4, impulseProvenance: 'rcs_disruptor_spike',
  },
];
