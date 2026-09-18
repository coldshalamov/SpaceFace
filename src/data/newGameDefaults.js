// src/data/newGameDefaults.js – canonical new-game starting state.
// All IDs use canonical prefixes per ARCHITECTURE §0.4.
// Pure data, no imports.

export const NEW_GAME = {
  credits: 5000,
  shipId: 'ship_kestrel',
  // Must match the starter Kestrel's derived cargo cap (no cargo modules in the default
  // fit): live capVolume syncs from derived stats, so a stale constant here silently models
  // the wrong hold in benchmarks and corrupt-save fallbacks.
  cargoCapacity: 250,
  startingSectorId: 'sector_helios_prime',

  // Starting reputation per faction (ARCHITECTURE §3.10).
  factionRep: {
    faction_scn:   0,
    faction_mts:   0,
    faction_dmc:   0,
    faction_reach: -50,
    faction_quiet: 0,
    faction_vael:  -120,
    faction_free:  40,
    faction_choir: 0,
  },

  // Starting equipment fitted to ship_kestrel.
  fittedModules: [
    'wpn_pulse_laser_s',   // weapon slot S (starter gun, visible in loadout)
    'mod_mining_laser_s',   // mining slot S (starter laser, price 0)
    'mod_engine_ion_m',     // engine slot M
    'mod_shield_booster_s', // shield slot S
  ],

  // Starting cargo.
  cargo: [],

  // Story beat FSM initial state.
  storyBeat: 0,

  // Tech research state – all locked.
  researchedNodes: [],

  // Research points.
  researchPoints: 0,

  // Salvage rights — stunt-paid claim currency; redeemed at Pitborn yards.
  salvageRights: 0,

  // Automation assets.
  drones: [],
  traders: [],
  outposts: [],

  // Visited sectors.
  visitedSectors: ['sector_helios_prime'],

  // Discovered POIs.
  discoveredPOIs: [],
};

// ---- PQ-156.00 three starters ------------------------------------------------------
// Three ways to wake up. Each starter is a hull, a fit, and a first-ten-minutes bias —
// a starting point, never a class lock: any hull can buy and fit the game's normal
// modules and verbs later, and nothing here restricts a refit.
//
// `fittedModules` follows the NEW_GAME.fittedModules convention: an ordered default-fit
// id list that src/systems/ships.js fittingsFromDefaultModules resolves into real slots,
// silently dropping unknown or illegal ids. The pq-156 regression test asserts every
// listed id survives resolution on its hull so a typo never ships as a missing module.
export const NEW_GAME_STARTERS = Object.freeze([
  Object.freeze({
    id: 'starter_hitch',
    shipId: 'ship_kestrel',
    name: 'Hitch',
    tag: 'Skater',
    blurb: 'Turns wide. Sluggish under load. Stops badly.',
    line: 'Light, quick, and the best swinger in the yard. One of everything, so the first ten minutes can go any way.',
    fittedModules: Object.freeze(NEW_GAME.fittedModules.slice()),
  }),
  Object.freeze({
    id: 'starter_pelican',
    shipId: 'ship_pelican',
    name: 'Pelican',
    tag: 'Tug',
    blurb: 'Slow to answer. Carries twice what it should. Hard to tip over.',
    line: 'A heavy-duty winch, a cargo pod, and twin mining lasers. The first ten minutes end in a tow or a full hold.',
    fittedModules: Object.freeze([
      'wpn_pulse_laser_s',    // weapon slot S
      'mod_shield_booster_s', // shield slot S
      'mod_engine_ion_m',     // engine slot M
      'mod_cargo_pod_m',      // cargo slot M
      'mod_mining_laser_s',   // mining slot M (S def, S fits M)
      'mod_mining_laser_s',   // mining slot M
      'mod_winch_hd',         // utility slot S — the tow line
    ]),
  }),
  Object.freeze({
    id: 'starter_wasp',
    shipId: 'ship_wasp',
    name: 'Wasp',
    tag: 'Brawler',
    blurb: 'Fast off the mark. Thin skin. Bites early.',
    line: 'A second gun and a ram plate, no cargo space to speak of. The first ten minutes want a bounty and a little nerve.',
    fittedModules: Object.freeze([
      'wpn_pulse_laser_s',    // weapon slot S (front)
      'wpn_autocannon_s',     // weapon slot S (front) — the shove gun
      'mod_shield_booster_s', // shield slot M (S def, S fits M)
      'mod_engine_ion_m',     // engine slot M
      'mod_ram_plate',        // utility slot S — the brawl
    ]),
  }),
]);

export const DEFAULT_STARTER_ID = 'starter_hitch';
const NEW_GAME_STARTER_BY_ID = new Map(NEW_GAME_STARTERS.map((starter) => [starter.id, starter]));

/** The catalog entry for a starter id, or null when the id is absent or unknown. */
export function starterById(id) {
  return NEW_GAME_STARTER_BY_ID.get(id) || null;
}

/** The starter a `game:new` payload asks for (opts.starter). Absent or unknown ids mean
 *  "no pick": return null so the caller keeps the legacy NEW_GAME defaults untouched. */
export function resolveNewGameStarter(opts) {
  return starterById(opts && typeof opts === 'object' ? opts.starter : null);
}
