// CV-EAR — physics weapons stop borrowing the autocannon / generic voice (build_map §23, slice 2).
// Done-when: every catalog id resolves to a registered recipe via weapon-data classification;
// concussion/plasma/gravitic/disruptor/charge carry their own voices; nothing lands on the
// starter pulse or the generic discharge without belonging there.
import assert from 'node:assert/strict';
import test from 'node:test';

import { RECIPES } from '../src/data/audioRecipes.js';
import { WEAPONS } from '../src/data/weapons.js';
import { recipeForWeapon, getBusForRecipe } from '../src/audio/audioSystem.js';

const recipeById = new Map(RECIPES.map((r) => [r.id, r]));

const NEW_FAMILY = {
  concussion: 'sfx_wpn_concussion',
  plasma: 'sfx_wpn_plasma',
  gravitic: 'sfx_wpn_gravitic',
  disruptor: 'sfx_wpn_disruptor',
  charge: 'sfx_wpn_charge',
};
const LEGACY_FAMILY = [
  'sfx_wpn_beam_laser', 'sfx_wpn_railgun', 'sfx_wpn_missile',
  'sfx_wpn_autocannon', 'sfx_wpn_pulse_laser', 'sfx_wpn_unclassified',
];

// The contract the slice names: what each catalog id must sound like.
const EXPECTED = {
  wpn_snarl_s: 'sfx_wpn_disruptor',
  wpn_pulse_laser_s: 'sfx_wpn_pulse_laser',
  wpn_autocannon_s: 'sfx_wpn_autocannon',
  wpn_flak_turret_s: 'sfx_wpn_autocannon',
  wpn_concussion_cannon_s: 'sfx_wpn_concussion',
  wpn_pulse_laser_m: 'sfx_wpn_pulse_laser',
  wpn_bank_stream_m: 'sfx_wpn_autocannon',
  wpn_autocannon_m: 'sfx_wpn_autocannon',
  unique_ironsong_ac: 'sfx_wpn_autocannon',
  wpn_beam_laser_m: 'sfx_wpn_beam_laser',
  unique_veil_cutter: 'sfx_wpn_beam_laser',
  wpn_railgun_m: 'sfx_wpn_railgun',
  wpn_plasma_cannon_m: 'sfx_wpn_plasma',
  wpn_missile_rack_m: 'sfx_wpn_missile',
  unique_nestbreaker_rack: 'sfx_wpn_missile',
  wpn_heavy_beam_l: 'sfx_wpn_beam_laser',
  unique_lighthouse_heavy_beam: 'sfx_wpn_beam_laser',
  wpn_torpedo_l: 'sfx_wpn_missile',
  wpn_siege_lance_l: 'sfx_wpn_railgun',
  wpn_emp_disruptor_m: 'sfx_wpn_disruptor',
  wpn_gravity_marker_s: 'sfx_wpn_gravitic',
  wpn_momentum_sink_s: 'sfx_wpn_gravitic',
  wpn_inertial_shunt_s: 'sfx_wpn_gravitic',
  wpn_concussion_cannon_m: 'sfx_wpn_concussion',
  wpn_vector_mine_m: 'sfx_wpn_charge',
  wpn_gravity_well_m: 'sfx_wpn_gravitic',
  wpn_rcs_disruptor_m: 'sfx_wpn_disruptor',
  unique_mirrorjaw_pulse: 'sfx_wpn_pulse_laser',
  wpn_sticky_detonator: 'sfx_wpn_charge',
  wpn_conductive_primer: 'sfx_wpn_disruptor',
  tool_grav_anchor: 'sfx_wpn_gravitic',
  wpn_thermal_cooker: 'sfx_wpn_beam_laser',
  wpn_mass_driver: 'sfx_wpn_railgun',
  tool_polarity_inverter: 'sfx_wpn_gravitic',
  tool_viscosity_field: 'sfx_wpn_gravitic',
  tool_hardlight_prism: 'sfx_wpn_gravitic',
  tool_thruster_hijacker: 'sfx_wpn_disruptor',
  tool_seismic_gong: 'sfx_wpn_concussion',
  tool_quantum_sympathy: 'sfx_wpn_gravitic',
};

test('every catalog weapon resolves to a recipe that exists in the registry', () => {
  assert.equal(Object.keys(EXPECTED).length, WEAPONS.length,
    'EXPECTED table must cover the whole catalog — add a row when the catalog grows');
  const unclassified = [];
  for (const def of WEAPONS) {
    const recipeId = recipeForWeapon(def.id);
    const recipe = recipeById.get(recipeId);
    assert.ok(recipe, `${def.id} resolves to ${recipeId}, which is missing from RECIPES`);
    assert.equal(recipe.id, recipeId);
    assert.equal(getBusForRecipe(recipe, recipeId), 'combat',
      `${recipeId} must ride the combat one-shot bus`);
    if (recipeId === 'sfx_wpn_unclassified') unclassified.push(def.id);
  }
  assert.deepEqual(unclassified, [],
    'no catalog weapon should need the generic discharge');
});

test('the physics families stop borrowing the autocannon and generic voices', () => {
  for (const [id, recipeId] of Object.entries(EXPECTED)) {
    assert.equal(recipeForWeapon(id), recipeId, `${id} must resolve to ${recipeId}`);
  }
  assert.notEqual(recipeForWeapon('wpn_concussion_cannon_s'), recipeForWeapon('wpn_autocannon_s'));
  assert.notEqual(recipeForWeapon('wpn_concussion_cannon_m'), recipeForWeapon('wpn_autocannon_m'));
  assert.notEqual(recipeForWeapon('wpn_plasma_cannon_m'), recipeForWeapon('wpn_autocannon_m'));
});

test('the five new family recipes are distinct from each other and from the existing voices', () => {
  const all = [...Object.values(NEW_FAMILY), ...LEGACY_FAMILY];
  assert.equal(new Set(all).size, all.length, 'table itself must be collision-free');
  for (const recipeId of all) assert.ok(recipeById.has(recipeId), `${recipeId} must be registered`);
});

test('only pulse/laser/blaster-class weapons get the starter pulse voice', () => {
  const onPulse = WEAPONS
    .filter((d) => recipeForWeapon(d.id) === 'sfx_wpn_pulse_laser')
    .map((d) => d.id);
  for (const id of onPulse) {
    assert.ok(/(pulse|laser|blaster)/.test(id), `${id} borrowed the starter pulse voice`);
  }
});

test('unknown ids keep the substring families and never borrow the pulse voice', () => {
  assert.equal(recipeForWeapon('wpn_frigate_gatling_x'), 'sfx_wpn_autocannon');
  assert.equal(recipeForWeapon('wpn_comet_beam_x'), 'sfx_wpn_beam_laser');
  assert.equal(recipeForWeapon('wpn_long_rail_x'), 'sfx_wpn_railgun');
  assert.equal(recipeForWeapon('wpn_swarm_missile_x'), 'sfx_wpn_missile');
  assert.equal(recipeForWeapon('wpn_particle_concussion_x'), 'sfx_wpn_concussion');
  assert.equal(recipeForWeapon('wpn_sun_plasma_x'), 'sfx_wpn_plasma');
  assert.equal(recipeForWeapon('wpn_well_gravity_x'), 'sfx_wpn_gravitic');
  assert.equal(recipeForWeapon('wpn_arc_disruptor_x'), 'sfx_wpn_disruptor');
  assert.equal(recipeForWeapon('wpn_fang_mine_x'), 'sfx_wpn_charge');
  assert.equal(recipeForWeapon('wpn_pulse_blaster_x'), 'sfx_wpn_pulse_laser');
  assert.equal(recipeForWeapon('wpn_ferrothorn_x'), 'sfx_wpn_unclassified');
  assert.equal(recipeForWeapon(''), 'sfx_wpn_unclassified');
});
