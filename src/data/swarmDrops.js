// Swarm enemy drops data (EC-A01-03)
// Things that fall out of enemies in the Pit (design/game/12_SWARM_THE_PIT.md).

export const SWARM_DROP_KIND = 'swarm_drop';

/** At most one drop per 12 kills */
export const SWARM_DROP_INTERVAL = 12;

/** Never more than 2 drops alive at once on the board */
export const SWARM_DROP_MAX_LIVE = 2;

/** TTL in seconds before an unclaimed drop despawns */
export const SWARM_DROP_TTL_S = 12;

/**
 * The eight drops: names, effects and lines exactly as specified.
 * Equal weights (1.0), with free_forge at 1/4 weight (0.25).
 */
export const SWARM_DROP_DEFS = Object.freeze([
  Object.freeze({
    id: 'full_rack',
    name: 'Full Rack',
    effect: 'every gun\'s ammo/heat and every power\'s cooldown refilled at once',
    line: 'Reload, darling.',
    weight: 1.0,
    durationS: 0,
  }),
  Object.freeze({
    id: 'heavy_hands',
    name: 'Heavy Hands',
    effect: '20 s: every weapon\'s knockback impulse doubled',
    line: 'Oh, now you\'ve done it.',
    weight: 1.0,
    durationS: 20,
  }),
  Object.freeze({
    id: 'dead_weight',
    name: 'Dead Weight',
    effect: '20 s: any body the player throws kills the ship it touches (light and medium; heavies take 60 %)',
    line: 'Throw something. Anything.',
    weight: 1.0,
    durationS: 20,
  }),
  Object.freeze({
    id: 'magnet',
    name: 'Magnet',
    effect: 'every scrap/credit pickup on the floor flies to the player (reuse mining\'s magnet pull)',
    line: 'Tidy.',
    weight: 1.0,
    durationS: 0,
  }),
  Object.freeze({
    id: 'big_bang',
    name: 'Big Bang',
    effect: 'one Shove centred on the player with radius = the arena radius (the Shove field with a one-off radius)',
    line: 'Everybody out.',
    weight: 1.0,
    durationS: 0,
  }),
  Object.freeze({
    id: 'double_scrap',
    name: 'Double Scrap',
    effect: '30 s: run scrap/purse earnings doubled',
    line: 'The sponsors are generous.',
    weight: 1.0,
    durationS: 30,
  }),
  Object.freeze({
    id: 'loose_cannon',
    name: 'Loose Cannon',
    effect: 'a small auto-turret body that fires at the nearest enemy; tetherable, so the player can tow it; 60 s life',
    line: 'It\'s not house-trained.',
    weight: 1.0,
    durationS: 60,
  }),
  Object.freeze({
    id: 'free_forge',
    name: 'Free Forge',
    effect: 'sets run.freeForge = true',
    line: 'On the house. Once.',
    weight: 0.25,
    durationS: 0,
  }),
]);

export const SWARM_DROP_BY_ID = new Map(SWARM_DROP_DEFS.map((d) => [d.id, d]));

export const SWARM_DROP_TOTAL_WEIGHT = SWARM_DROP_DEFS.reduce((sum, d) => sum + d.weight, 0);

/**
 * Pick a drop deterministically using rng (equal weights, free_forge at 1/4 weight).
 * Pure.
 */
export function selectSwarmDrop(rng) {
  const roll = (typeof rng === 'function' ? rng() : 0.5) * SWARM_DROP_TOTAL_WEIGHT;
  let acc = 0;
  for (const def of SWARM_DROP_DEFS) {
    acc += def.weight;
    if (roll < acc) return def;
  }
  return SWARM_DROP_DEFS[0];
}
