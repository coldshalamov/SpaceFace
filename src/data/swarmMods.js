// A01-05 — the Forge and the Taps: run-long player modifiers bought on the Foundry floor
// (arena helios_core, Lane 2).
//
// 12_SWARM_THE_PIT: the Forge upgrades the gun you hold once per run; the two Taps vend
// sideways trades — every mod gives something and takes something you can feel within a
// lap. 11_THE_ARMORY §2 names the six hero Forged forms; A01-05 ships the Concussion
// Cannon's (Wrecking Ball) and leaves a `form: null` row for each of the other five so
// later packets only fill in the bespoke half.
//
// Ownership is a run ledger row (`swarm_forge` / `swarm_tap` in run.modifiers, appended
// through run:modifierRecordRequested — the same receipt the armory writes). Nothing here
// mutates fitted gear: every trade multiplies an existing stat at a read site, and a mod
// outlives the room that sold it but never the run.
//
// `volatile_wake` and `second_reel` are deliberately absent — they are later packets.

export const SWARM_FORGE_PRICE = 5000;
export const SWARM_FORGE_DMG_MULT = 1.4;
export const SWARM_FORGE_IMPULSE_MULT = 1.35;
export const SWARM_FORGE_LABEL = `THE FORGE · ${SWARM_FORGE_PRICE}`;
export const SWARM_FORGE_RECORD_KIND = 'swarm_forge';

export const SWARM_TAP_RECORD_KIND = 'swarm_tap';
/** Price by purchase number (1..4); a fifth buy is refused outright. */
export const SWARM_TAP_PRICES = Object.freeze([1500, 2000, 2500, 3000]);
export const SWARM_TAP_MAX_PURCHASES = SWARM_TAP_PRICES.length;

/**
 * The ten taps. `give`/`take` are the numbers a read site multiplies; absent keys mean
 * the mod leaves that stat alone. `magnetPickupRange`/`mineMagnetRange`/`hotCoreBurnPerS`
 * are ranges and a rate rather than multipliers — their sites read them raw.
 */
export const SWARM_TAP_MODS = Object.freeze([
  Object.freeze({
    id: 'overbore', name: 'Overbore', icon: '◉',
    text: 'knockback ×2.0, fire rate ×0.5',
    give: { knockMult: 2.0 }, take: { rofMult: 0.5 },
  }),
  Object.freeze({
    id: 'hair_trigger', name: 'Hair Trigger', icon: '✚',
    text: 'fire rate ×2.0, knockback ×0.7, heat gain ×1.5',
    give: { rofMult: 2.0 }, take: { knockMult: 0.7, heatMult: 1.5 },
  }),
  Object.freeze({
    id: 'long_reel', name: 'Long Reel', icon: '⌁',
    text: 'Line max length ×1.5, reel speed ×0.7',
    give: { tetherLenMult: 1.5 }, take: { reelRateMult: 0.7 },
  }),
  Object.freeze({
    id: 'hot_core', name: 'Hot Core', icon: '☀',
    text: 'boost duration ×2, boost drain ×0.5; burns 2 hull/s at top speed',
    give: { boostDurMult: 2.0, boostDrainMult: 0.5 },
    take: { hotCoreBurnPerS: 2 },
  }),
  Object.freeze({
    id: 'ballast', name: 'Ballast', icon: '▣',
    text: 'player mass ×1.6, turn rate ×0.75',
    give: { massMult: 1.6 }, take: { turnMult: 0.75 },
  }),
  Object.freeze({
    id: 'stripped', name: 'Stripped', icon: '▢',
    text: 'acceleration and turn rate ×1.25, mass ×0.65',
    give: { accelMult: 1.25, turnMult: 1.25 }, take: { massMult: 0.65 },
  }),
  Object.freeze({
    id: 'magnet_hull', name: 'Magnet Hull', icon: '◍',
    text: 'pickups within 260 WU drift to you; enemy mines within 260 WU do too',
    give: { magnetPickupRange: 260 }, take: { mineMagnetRange: 260 },
  }),
  Object.freeze({
    id: 'glass_cannon', name: 'Glass Cannon', icon: '◇',
    text: 'knockback ×1.4, max hull ×0.5',
    give: { knockMult: 1.4 }, take: { hullMaxMult: 0.5 },
  }),
  Object.freeze({
    id: 'bumper_rails', name: 'Bumper Rails', icon: '▤',
    text: 'ram damage dealt ×2 and taken ×0.5, top speed ×0.85',
    give: { ramDealtMult: 2.0, ramTakenMult: 0.5 }, take: { topSpeedMult: 0.85 },
  }),
  Object.freeze({
    id: 'wide_bore', name: 'Wide Bore', icon: '◎',
    text: 'power radius ×1.4, power cooldowns ×1.35',
    give: { powerRadiusMult: 1.4 }, take: { powerCdMult: 1.35 },
  }),
]);

const TAP_BY_ID = new Map(SWARM_TAP_MODS.map((mod) => [mod.id, mod]));
export function swarmTapModById(id) {
  return TAP_BY_ID.get(id) || null;
}

/**
 * 11_THE_ARMORY §2 hero forms. `match` is a defId substring so S and M variants of the
 * same gun land on the same forge line. `form` is the bespoke forged name; `pierce` is
 * the mod_piercing_core rank the forged slug carries. The five null rows are the
 * reservation for later packets — those guns take the ordinary Forged form today.
 */
export const SWARM_FORGE_HERO_FORMS = Object.freeze([
  Object.freeze({ match: 'concussion_cannon', form: 'Wrecking Ball', pierce: 2 }),
  Object.freeze({ match: 'bank_stream', form: null }),        // Pinball — later packet
  Object.freeze({ match: 'railgun', form: null }),            // Skewer — later packet
  Object.freeze({ match: 'heavy_beam', form: null }),         // Lighthouse — later packet
  Object.freeze({ match: 'disc_launcher', form: null }),      // Saw — later packet
  Object.freeze({ match: 'singularity_mortar', form: null }), // Second Sun — later packet
]);

export function swarmForgeHeroRow(defId) {
  const id = String(defId || '');
  return SWARM_FORGE_HERO_FORMS.find((row) => id.includes(row.match)) || null;
}

/** The name the forged gun reads as: a hero form where one exists, else Forged <name>. */
export function swarmForgeFormName(defId, weaponName) {
  const hero = swarmForgeHeroRow(defId);
  if (hero && typeof hero.form === 'string' && hero.form) return hero.form;
  return `Forged ${weaponName || 'Weapon'}`;
}

/** The pierce rank a forged gun carries into its attack spec (0 when unforged/ordinary). */
export function swarmForgePierceRank(defId) {
  const hero = swarmForgeHeroRow(defId);
  return hero && Number.isInteger(hero.pierce) ? hero.pierce : 0;
}

/** A pad's price line: the current step's offer and what it charges, in floor voice. */
export function swarmTapLabel(mod, price) {
  return mod ? `TAP · ${String(mod.name).toUpperCase()} · ${price}` : `TAP · SOLD OUT`;
}
