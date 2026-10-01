// INFERENCE INST-33 + INST-34 — the weapon voice table stops lying about two mounts.
//
// INST-33: "Flak has its own muzzle voice instead of sharing the autocannon's."
//   Done: `wpn_flak_turret_s` fire resolves a flak recipe id and `wpn_autocannon_s` keeps
//   `sfx_wpn_autocannon`; the ids differ.
// INST-34: "Heavy beams sound heavier than the beam laser."
//   Done: `wpn_heavy_beam_l` resolves a LOWER-REGISTER beam recipe than `wpn_beam_laser_m`;
//   the two ids and the rate order are pinned.
//
// Proof is the live owners — recipeForWeapon (what combat:fire resolves through) and the authored
// recipe/sample tables — not a copy of the expectation.
import test from 'node:test';
import assert from 'node:assert/strict';

import { RECIPES } from '../src/data/audioRecipes.js';
import { WEAPONS } from '../src/data/weapons.js';
import { resolveSampleBinding } from '../src/audio/sampleLibrary.js';
import {
  SUSTAINED_BEAM_RECIPE_IDS,
  getBusForRecipe,
  recipeForWeapon,
  resolveWeaponAudioSignature,
} from '../src/audio/audioSystem.js';

const recipeById = new Map(RECIPES.map((r) => [r.id, r]));
const defById = new Map(WEAPONS.map((d) => [d.id, d]));
const EMPTY_STATE = { entities: new Map() };
const resolveLive = (weaponId) => resolveWeaponAudioSignature({ weaponId }, EMPTY_STATE).recipeId;

// ---------------------------------------------------------------------------------------
// INST-33 — flak owns a muzzle voice
// ---------------------------------------------------------------------------------------

test('INST-33: the flak/PD turret resolves a flak recipe and the autocannon keeps its own', () => {
  const flak = resolveLive('wpn_flak_turret_s');
  const cannon = resolveLive('wpn_autocannon_s');

  assert.equal(flak, 'sfx_wpn_flak');
  assert.notEqual(flak, cannon, 'flak must not borrow the autocannon voice');
  assert.equal(cannon, 'sfx_wpn_autocannon', 'the autocannon keeps its authored voice');
  assert.ok(recipeById.has(flak), 'the flak recipe must be registered in audioRecipes.js');
});

test('INST-33: the flak voice is its own weapon, not the autocannon pitched or enveloped', () => {
  const flak = recipeById.get('sfx_wpn_flak');
  const cannon = recipeById.get('sfx_wpn_autocannon');

  assert.equal(flak.category, 'weapon');
  assert.equal(getBusForRecipe(flak, flak.id), 'combat', 'flak rides the combat one-shot bus');
  assert.notDeepEqual(flak.gainEnvelope, cannon.gainEnvelope,
    'flak must not reuse the autocannon envelope (8 rps needs a far shorter one)');
  assert.notEqual(flak.filterFreq, cannon.filterFreq,
    'flak must not reuse the autocannon band (a light shell is not a low thump)');
  assert.ok(!(flak.layers || []).includes(cannon.id),
    'flak must not layer the autocannon voice');
  // The authored facts behind the voice: a flak turret throws far more, far lighter rounds.
  const def = defById.get('wpn_flak_turret_s');
  assert.ok(def.rof > defById.get('wpn_autocannon_s').rof,
    'flak is the rapid mount; the voice follows the mount');
  assert.ok(def.impulsePerHit < defById.get('wpn_autocannon_s').impulsePerHit,
    'flak hits light; the voice must not carry the autocannon sub weight');
});

test('INST-33: flak reuses the cannon RECORDING without inheriting the autocannon voice', () => {
  // No new sample bank is allowed, so the hybrid binds an existing designed sample. It must be a
  // different binding shape from the autocannon's, or the two mounts land on the same sound.
  // Assert through resolveSampleBinding — the live resolver that applies the share/rate/gain
  // defaults — so a defaulted field is read as the runtime actually reads it.
  const flak = resolveSampleBinding('sfx_wpn_flak');
  const cannon = resolveSampleBinding('sfx_wpn_autocannon');
  assert.ok(flak, 'the flak recipe must keep a sample binding');
  assert.equal(flak.sampleId, cannon.sampleId,
    'flak reuses the cannon sample rather than authoring a new one');
  assert.ok(flak.rate > cannon.rate,
    `a light fast shell plays the cannon body at a higher rate (${flak.rate} > ${cannon.rate})`);
  assert.ok(flak.share < cannon.share,
    'flak hands more of the peak back to its own synth layer');
  assert.ok(flak.share > 0 && flak.share < 1, 'the hybrid split stays inside (0, 1)');
});

test('INST-33: an uncatalogued flak mount still lands on the flak family, not the autocannon', () => {
  assert.equal(recipeForWeapon('wpn_corvette_flak_x'), 'sfx_wpn_flak');
  assert.equal(recipeForWeapon('wpn_point_defence_s'), 'sfx_wpn_flak');
  // The autocannon substring family is untouched by the new flak row.
  assert.equal(recipeForWeapon('wpn_frigate_gatling_x'), 'sfx_wpn_autocannon');
  assert.equal(recipeForWeapon('wpn_autocannon_s'), 'sfx_wpn_autocannon');
});

test('INST-33: the interceptor flag classifies flak from weapon data, not from its name', () => {
  // The catalog row is named "flak", but the DATA that makes it a flak gun is that its rounds
  // intercept incoming fire. A future flak mount with a different name still classifies.
  const flakDef = defById.get('wpn_flak_turret_s');
  assert.equal(flakDef.intercepts, true, 'the flak/PD turret is the interceptor mount');
  const interceptors = WEAPONS.filter((d) => d.intercepts === true);
  assert.deepEqual(interceptors.map((d) => d.id), ['wpn_flak_turret_s']);
  for (const def of interceptors) {
    assert.equal(recipeForWeapon(def.id), 'sfx_wpn_flak',
      `${def.id} intercepts, so it must read as flak`);
  }
});

// ---------------------------------------------------------------------------------------
// INST-34 — heavy beams sound heavier than the beam laser
// ---------------------------------------------------------------------------------------

test('INST-34: the capital heavy beam resolves a lower-register beam recipe than the beam laser', () => {
  const heavy = resolveLive('wpn_heavy_beam_l');
  const laser = resolveLive('wpn_beam_laser_m');

  assert.equal(heavy, 'sfx_wpn_heavy_beam');
  assert.notEqual(heavy, laser, 'the heavy beam must not BE the beam laser');
  assert.equal(laser, 'sfx_wpn_beam_laser', 'the M beam laser keeps its authored voice');
  assert.ok(recipeById.has(heavy), 'the heavy-beam recipe must be registered');

  const heavyRecipe = recipeById.get(heavy);
  const laserRecipe = recipeById.get(laser);
  assert.ok(heavyRecipe.baseFreq < laserRecipe.baseFreq,
    `the heavy beam must sit lower in register (${heavyRecipe.baseFreq} < ${laserRecipe.baseFreq})`);
  assert.ok(heavyRecipe.filterFreq < laserRecipe.filterFreq,
    'the heavy beam carries its weight below the laser band, not above it');
  // It is a heavier CUT, not a different verb: both remain sustained beams.
  assert.equal(heavyRecipe.type, 'continuous_oscillator');
  assert.equal(laserRecipe.type, 'continuous_oscillator');
});

test('INST-34: the heavy beam plays the beam-loop recording an octave-and-a-bit down', () => {
  // "Lower register" is literal at the sample layer too: same designed loop body, rate < 1.
  const heavy = resolveSampleBinding('sfx_wpn_heavy_beam');
  const laser = resolveSampleBinding('sfx_wpn_beam_laser');
  assert.ok(heavy, 'the heavy-beam recipe must keep a sample binding');
  assert.equal(heavy.sampleId, laser.sampleId,
    'it reuses the authored beam loop rather than authoring a new one');
  assert.ok(heavy.rate < laser.rate, `rate order: heavy ${heavy.rate} < laser ${laser.rate}`);
  assert.ok(heavy.rate < 1, 'a lower-register reading of the same loop is a rate below 1');
  assert.equal(heavy.loop, laser.loop, 'both stay sustained loop bodies');
});

test('INST-34: the heavy beam is a sustained loop voice, never a per-tick one-shot', () => {
  // The regression this guards: _onFire used to gate the loop drone on one hardcoded recipe id.
  // A second sustained beam that fell through would machine-gun its drone at the weapon's rof.
  assert.ok(SUSTAINED_BEAM_RECIPE_IDS.has('sfx_wpn_heavy_beam'),
    'the heavy beam must be in the sustained-beam set');
  assert.ok(SUSTAINED_BEAM_RECIPE_IDS.has('sfx_wpn_beam_laser'));
  assert.equal(SUSTAINED_BEAM_RECIPE_IDS.size, 2, 'the set names exactly the two beam voices');

  // Every sustained-beam recipe must actually be a continuous type, or the loop path would
  // start a finite voice and leave a silent gap where the drone should be.
  for (const id of SUSTAINED_BEAM_RECIPE_IDS) {
    const recipe = recipeById.get(id);
    assert.ok(recipe, `${id} must be authored`);
    assert.equal(String(recipe.type).startsWith('continuous'), true,
      `${id} is treated as a sustained beam and must be a continuous recipe type`);
  }
  // And no non-beam mount may be swept into the drone path.
  for (const def of WEAPONS) {
    const recipeId = recipeForWeapon(def.id);
    if (!SUSTAINED_BEAM_RECIPE_IDS.has(recipeId)) continue;
    assert.equal(def.continuous === true && def.tracking === 'hitscan', true,
      `${def.id} resolved to sustained beam ${recipeId} without being a continuous hitscan mount`);
  }
});

test('INST-34: the heavy-beam split is the capital threshold, not a name match', () => {
  const heavy = ['wpn_heavy_beam_l', 'unique_lighthouse_heavy_beam'];
  const light = ['wpn_beam_laser_m', 'unique_veil_cutter', 'wpn_thermal_cooker'];
  for (const id of heavy) {
    assert.equal(recipeForWeapon(id), 'sfx_wpn_heavy_beam', `${id} is a capital beam`);
  }
  for (const id of light) {
    assert.equal(recipeForWeapon(id), 'sfx_wpn_beam_laser', `${id} keeps the beam-laser voice`);
  }
  // Data-driven: the capital beams are exactly the sustained emitters whose per-hit momentum
  // clears the threshold, so a renamed or newly authored L-slot emitter classifies correctly.
  const capitals = WEAPONS
    .filter((d) => d.continuous && d.tracking === 'hitscan' && (d.impulsePerHit || 0) >= 24)
    .map((d) => d.id);
  assert.deepEqual(capitals.sort(), [...heavy].sort());
  assert.equal(recipeForWeapon('wpn_heavy_beam_x'), 'sfx_wpn_heavy_beam',
    'an uncatalogued heavy beam still lands on the heavy voice');
  assert.equal(recipeForWeapon('wpn_comet_beam_x'), 'sfx_wpn_beam_laser',
    'an uncatalogued light beam keeps the laser voice');
});

test('neither new voice disturbs the families around it', () => {
  const neighbours = {
    wpn_autocannon_s: 'sfx_wpn_autocannon',
    wpn_autocannon_m: 'sfx_wpn_autocannon',
    unique_ironsong_ac: 'sfx_wpn_autocannon',
    wpn_bank_stream_m: 'sfx_wpn_autocannon',
    wpn_concussion_cannon_s: 'sfx_wpn_concussion',
    wpn_concussion_cannon_m: 'sfx_wpn_concussion',
    wpn_plasma_cannon_m: 'sfx_wpn_plasma',
    wpn_railgun_m: 'sfx_wpn_railgun',
    wpn_siege_lance_l: 'sfx_wpn_railgun',
    wpn_missile_rack_m: 'sfx_wpn_missile',
    wpn_torpedo_l: 'sfx_wpn_missile',
    wpn_pulse_laser_s: 'sfx_wpn_pulse_laser',
    wpn_pulse_laser_m: 'sfx_wpn_pulse_laser',
    wpn_emp_disruptor_m: 'sfx_wpn_disruptor',
    wpn_rcs_disruptor_m: 'sfx_wpn_disruptor',
    wpn_gravity_marker_s: 'sfx_wpn_gravitic',
    wpn_momentum_sink_s: 'sfx_wpn_gravitic',
    wpn_gravity_well_m: 'sfx_wpn_gravitic',
    wpn_vector_mine_m: 'sfx_wpn_charge',
    wpn_sticky_detonator: 'sfx_wpn_charge',
  };
  for (const [id, expected] of Object.entries(neighbours)) {
    assert.equal(recipeForWeapon(id), expected, `${id} must keep ${expected}`);
  }
  // The starter pulse still belongs to the pulse/laser/blaster family only.
  const onPulse = WEAPONS
    .filter((d) => recipeForWeapon(d.id) === 'sfx_wpn_pulse_laser')
    .map((d) => d.id);
  for (const id of onPulse) {
    assert.ok(/(pulse|laser|blaster)/.test(id), `${id} borrowed the starter pulse voice`);
  }
});
