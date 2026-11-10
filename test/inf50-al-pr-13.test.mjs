// AL-PR-13 — first-hour recipes use authored captions, not id-built fallbacks. Seed 4242.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RECIPES } from '../src/data/audioRecipes.js';
import { captionForGameplayRecipe } from '../src/ui/captions.js';

const SEED = 4242;

// Recipes the first hour actually plays: onboarding (cold open, thrust, brake,
// scan, mine, boost, the three taught fields, instructor radio, raid kill, warrant),
// the starter pulse laser, the massline, and the dock.
const FIRST_HOUR_RECIPE_IDS = Object.freeze([
  'sfx_firsthour_coldopen',
  'sfx_moment_stinger',
  'sfx_accel_transition',
  'sfx_engine_thrust',
  'sfx_engine_boost',
  'sfx_boost_whoosh',
  'sfx_brake_bite',
  'sfx_rcs_hiss',
  'sfx_mining_scan_pulse',
  'sfx_mining_beam',
  'sfx_mining_impact',
  'sfx_mining_cutter_lock',
  'sfx_wpn_pulse_laser',
  'sfx_bark_radio',
  'sfx_comms_key_click',
  'sfx_comms_squelch_tail',
  'sfx_squelch_story',
  'sfx_wanted_alert',
  'sfx_wanted_clear',
  'sfx.shieldBreak',
  'sfx_shield_blowout_discharge',
  'sfx_reactor_overload',
  'sfx.killSmall',
  'sfx.killConfirmed',
  'sfx.tetherLatch',
  'sfx_tether_latch_lock',
  'sfx_tether_strain_creak',
  'sfx_massline_reel_whine',
  'sfx_massline_release',
  'sfx.tetherSnap',
  'sfx_tether_crack',
  'sfx_tether_twang',
  'sfx_massline_throw',
  'sfx_dock_clunk',
  'sfx_undock_release',
  'sfx_dock_capture',
  'sfx_station_hum',
  'sfx_field_deploy_well',
  'sfx_field_deploy_repulsor',
  'sfx_field_deploy_cone',
  'sfx_field_loop_well',
  'sfx_field_loop_repulsor',
  'sfx_field_loop_cone',
  'sfx_mission_accept',
]);

function idBuiltCaption(recipeId) {
  const words = String(recipeId || '')
    .replace(/^sfx[._]/, '')
    .replace(/[._]/g, ' ')
    .trim();
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}.` : 'Cue.';
}

test(`seed ${SEED}: first-hour recipes do not use id-built captions`, () => {
  const byId = new Map(RECIPES.map((recipe) => [recipe.id, recipe]));
  const seen = new Set();
  assert.ok(FIRST_HOUR_RECIPE_IDS.length >= 40);
  for (const id of FIRST_HOUR_RECIPE_IDS) {
    assert.equal(seen.has(id), false, `duplicate first-hour id ${id}`);
    seen.add(id);
    assert.ok(byId.has(id), `${id} is not a real recipe`);
    const cap = captionForGameplayRecipe(id, byId.get(id));
    assert.ok(cap, `${id} must caption`);
    assert.notEqual(cap.text, idBuiltCaption(id), `${id} still uses the id-built fallback`);
    assert.match(cap.text, /[a-z]/i);
  }
});
