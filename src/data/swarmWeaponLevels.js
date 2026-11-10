// SEED-SW-13 — weapon levels for a Swarm run.
//
// A fitted gun starts at level 0 (the stock the hull already carries). The armory sells
// levels 1 through 5. Each purchase is one immutable run record. The feel is the gun's
// own rate of fire: the weapons system reads `weapon.rof` and turns it into the cooldown
// between shots. A higher level is a higher rate, so the next shot comes sooner.
// Shelf stock that is not bolted to the hull has no row, and there is no sixth level.

export const SWARM_WEAPON_LEVEL_KIND = 'swarm_weapon_level';
export const SWARM_WEAPON_LEVEL_MAX = 5;

/** Added to the stock rate for each level above 0. Level 5 is faster than level 1. */
export const SWARM_WEAPON_LEVEL_STEP = 0.12;

// Rising run-credit prices. Index is the level being bought. Level 0 is not for sale.
const LEVEL_PRICES = Object.freeze([0, 18, 30, 46, 66, 90]);

export function swarmWeaponLevelPrice(level) {
  if (!Number.isInteger(level) || level < 1 || level > SWARM_WEAPON_LEVEL_MAX) return null;
  return LEVEL_PRICES[level];
}

function modifierList(modifiers) {
  if (Array.isArray(modifiers)) return modifiers;
  if (modifiers && Array.isArray(modifiers.modifiers)) return modifiers.modifiers;
  return [];
}

/** Highest purchased level for this gun, or 0 when the run has not bought one. */
export function weaponLevelOf(modifiers, defId) {
  if (typeof defId !== 'string' || defId.length === 0) return 0;
  let level = 0;
  for (const row of modifierList(modifiers)) {
    if (!row || row.kind !== SWARM_WEAPON_LEVEL_KIND || row.defId !== defId) continue;
    if (!Number.isInteger(row.level) || row.level <= level) continue;
    level = row.level;
  }
  if (level < 0) return 0;
  if (level > SWARM_WEAPON_LEVEL_MAX) return SWARM_WEAPON_LEVEL_MAX;
  return level;
}

/** Rate multiplier the live gun reads. Level 0 is the stock rate. */
export function swarmWeaponRofScale(level) {
  const n = Number.isInteger(level) ? level : 0;
  const clamped = Math.max(0, Math.min(SWARM_WEAPON_LEVEL_MAX, n));
  return 1 + SWARM_WEAPON_LEVEL_STEP * clamped;
}

/**
 * Write the purchased rate onto the weapon objects the guns actually fire.
 * `_baseRof` remembers the stock rate so a second apply does not compound.
 * Guns with no purchased level are left untouched.
 */
export function applySwarmWeaponLevels(weapons, modifiers) {
  if (!Array.isArray(weapons)) return weapons;
  for (const weapon of weapons) {
    if (!weapon || typeof weapon.defId !== 'string') continue;
    const level = weaponLevelOf(modifiers, weapon.defId);
    if (level <= 0 && !Number.isFinite(weapon._baseRof)) continue;
    const base = Number.isFinite(weapon._baseRof) ? weapon._baseRof : weapon.rof;
    if (!Number.isFinite(base) || base <= 0) continue;
    if (!Number.isFinite(weapon._baseRof)) weapon._baseRof = base;
    weapon.rof = weapon._baseRof * swarmWeaponRofScale(level);
  }
  return weapons;
}
