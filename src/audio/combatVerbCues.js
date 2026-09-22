// Wave C5 — every combat verb names a recipe that already exists.
// fire, hit, shield, hull, shove, throw release, latch, break, slam, kill, dock, undock.

export const COMBAT_VERB_CUES = Object.freeze({
  fire: 'sfx_wpn_pulse_laser',
  hit: 'sfx_hull_scrape',
  shield: 'sfx_shield_blowout_pop',
  hull: 'sfx_hull_stress_groan',
  shove: 'sfx_bomb_concussion_shove',
  throwRelease: 'sfx_tether_twang',
  latch: 'sfx_tether_latch_lock',
  break: 'sfx_tether_crack',
  slam: 'sfx_hull_decompress',
  kill: 'sfx_kill_confirm',
  dock: 'sfx_dock_clunk',
  undock: 'sfx_undock_release',
});

export const COMBAT_VERB_IDS = Object.freeze(Object.keys(COMBAT_VERB_CUES));

export function combatVerbRecipe(verbId) {
  return COMBAT_VERB_CUES[verbId] || '';
}
