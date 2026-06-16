// src/data/newGameDefaults.js – canonical new-game starting state.
// All IDs use canonical prefixes per ARCHITECTURE §0.4.
// Pure data, no imports.

export const NEW_GAME = {
  credits: 5000,
  shipId: 'ship_kestrel',
  cargoCapacity: 40,
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

  // Automation assets.
  drones: [],
  traders: [],
  outposts: [],

  // Visited sectors.
  visitedSectors: ['sector_helios_prime'],

  // Discovered POIs.
  discoveredPOIs: [],
};
