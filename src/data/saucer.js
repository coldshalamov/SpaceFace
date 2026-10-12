// The Saucer is a ship capability, not a steering multiplier or a box of free inventory.
export const SAUCER_ID = 'ship_saucer';
export const SAUCER_DRIVE = Object.freeze({ cruiseSpeed: 340, boostSpeed: 900 });
export const SAUCER_WEAPON_SLOTS = Object.freeze([
  'wpn_saucer_death_ray', 'wpn_saucer_death_ray', 'wpn_saucer_annihilator',
]);
export const SAUCER_BRIEF = 'Inertialess flight: arrows / WASD move directly; release to stop. '
  + 'Built in: twin Death Rays, Annihilator, gravity immunity, salvage siphon and Event Horizon on boost. '
  + 'Its drive and boost field are built in, not conventional engine fittings. '
  + 'Empty weapon mounts use alien emitters; installed guns replace them, not add to them.';
export function isPlayerSaucer(entity) {
  return entity?.isPlayer === true && entity?.data?.defId === SAUCER_ID;
}
/** Prevent paying for conventional drives or boost verbs this ship cannot use. */
export function saucerFittingRefusal(hullId, def) {
  if (hullId !== SAUCER_ID || !def) return null;
  const mods = def.mods || {};
  if (def.slotType === 'engine' || def.slotType === 'thruster'
    || mods.phaseBlink || mods.swingDrive || mods.hullBurst || mods.boostTopSpeedPct) {
    return 'The Saucer has a built-in inertialess drive and Event Horizon. '
      + 'Conventional engines, steering thrusters and boost replacements do not fit it.';
  }
  return null;
}
// These definitions use the existing beam/projectile, targeting, heat and damage owners.
// They are never stock, salvage, or owned modules: an empty saucer mount supplies them.
export const SAUCER_WEAPONS = Object.freeze([
  Object.freeze({
    id: 'wpn_saucer_death_ray', baseId: 'wpn_heavy_beam_l', name: 'Saucer Death Ray',
    slotType: 'weapon', size: 'L', tier: 5, mass: 0, price: 0, purchasable: false,
    intrinsicHull: SAUCER_ID, mount: 'turret', tracking: 'hitscan', turretArcDeg: 360,
    sentence: 'Built-in alien beam. Tracks all around the disc without steering the ship.',
    dmg: 360, dps: 360, rof: 0, damageType: 'energy', energyCost: 28,
    continuous: true, projSpeed: Infinity, range: 1000,
    heatPerSec: 24, heatMax: 240, heatDissip: 40,
    impulsePerHit: 48, tumbleTorque: 0.6, impulseProvenance: 'saucer_death_ray',
  }),
  Object.freeze({
    id: 'wpn_saucer_annihilator', baseId: 'wpn_plasma_cannon_m', name: 'Saucer Annihilator',
    slotType: 'weapon', size: 'L', tier: 5, mass: 0, price: 0, purchasable: false,
    intrinsicHull: SAUCER_ID, mount: 'turret', tracking: 'auto_turret', turretArcDeg: 360,
    sentence: 'Built-in alien plasma battery: heavy splash rounds, independent of movement.',
    dmg: 160, rof: 3, dps: 480, damageType: 'thermal', energyCost: 18,
    projSpeed: 900, range: 1000, splashRadius: 38, splashDmg: 80, spreadDeg: 0,
    heatPerShot: 12, heatMax: 240, heatDissip: 40,
    impulsePerHit: 140, tumbleTorque: 3, impulseProvenance: 'saucer_annihilator',
  }),
]);
