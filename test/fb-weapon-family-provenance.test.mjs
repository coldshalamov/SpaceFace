// FB-071 — every weapon's picture and voice agree, keyed on the impulse provenance the def
// already carries. One classifier (src/data/vfxProfiles.js classifyWeaponFamily) feeds the
// render resolver (src/render/vfxProfiles.js resolveWeaponPresentationFamily) and the audio
// resolver (src/audio/audioSystem.js recipeForWeapon): provenance FIRST, damage type second.
// The table below is the whole catalog — the contract is that eye and ear can never disagree
// about what a mount IS.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RECIPES } from '../src/data/audioRecipes.js';
import { WEAPONS } from '../src/data/weapons.js';
import {
  PROVENANCE_PICTURE,
  classifyWeaponFamily,
  pictureForWeapon,
} from '../src/data/vfxProfiles.js';
import { resolveWeaponPresentationFamily } from '../src/render/vfxProfiles.js';
import { resolveWeaponRecipe } from '../src/render/weapons/recipes.js';
import {
  HEAVY_BEAM_IMPULSE_MIN,
  WEAPON_FAMILY_RECIPE,
  WEAPON_VARIANT_RECIPE,
  recipeForWeapon,
} from '../src/audio/audioSystem.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { offerDraft } from '../src/data/survivalDraft.js';

const DEF_BY_ID = new Map(WEAPONS.map((def) => [def.id, def]));
const RECIPE_BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

// The five corrected miskeys: what the provenance tag says the mount IS, and the family it was
// collapsing onto before this packet.
const CORRECTED = [
  ['wpn_snarl_s', 'snarl_catch', 'web', 'filament', 'kinetic'],
  ['wpn_gravity_marker_s', 'gravity_marker_ping', 'gravitic', 'field-ring', 'emp'],
  ['wpn_momentum_sink_s', 'momentum_sink_latch', 'latch', 'filament-latch', 'emp'],
  ['wpn_gravity_well_m', 'gravity_well_pull', 'well', 'well-collar', 'mine'],
  ['wpn_inertial_shunt_s', 'inertial_shunt_ping', 'ram', 'wedge', 'kinetic'],
];

const EMERGENT = [
  ['wpn_sticky_detonator', 'sticky_detonator', 'sticky', 'sticky-charge'],
  ['wpn_conductive_primer', 'conductive_primer', 'primer', 'primer-arc'],
  ['wpn_thermal_cooker', 'thermal_cooker', 'cooker', 'cooker-seam'],
  ['wpn_mass_driver', 'mass_driver_slug', 'driver', 'driver-slug'],
];

test('FB-071: every catalog id resolves to the same family in render and audio', () => {
  assert.ok(WEAPONS.length >= 31, 'the packet pins the full catalog');
  for (const def of WEAPONS) {
    // The render resolver is the shared classifier — literally the same call.
    const render = resolveWeaponPresentationFamily(def.id);
    const shared = classifyWeaponFamily(def.id, def);
    assert.equal(render.family, shared.family, `${def.id}: render and shared family diverge`);
    assert.equal(render.variant, shared.variant, `${def.id}: render and shared variant diverge`);

    // The ear resolves the same family through the one centralized table: variant voices first,
    // then the family row, with the capital-beam register pinned above both (INST-34).
    let recipe = WEAPON_VARIANT_RECIPE[shared.variant] || WEAPON_FAMILY_RECIPE[shared.family];
    if (shared.family === 'beam' && (def.impulsePerHit || 0) >= HEAVY_BEAM_IMPULSE_MIN) {
      recipe = 'sfx_wpn_heavy_beam';
    }
    assert.equal(recipeForWeapon(def.id), recipe,
      `${def.id}: family ${shared.family} must land on ${recipe}`);
    assert.notEqual(recipeForWeapon(def.id), 'sfx_wpn_unclassified',
      `${def.id} must not need the generic discharge`);
    assert.ok(RECIPE_BY_ID.has(recipe), `${recipe} is registered`);
  }
});

test('FB-071: provenance branches before damage type — the five collapsed verbs get their own families', () => {
  const families = new Set();
  for (const [id, provenance, family, variant, collapsed] of CORRECTED) {
    const def = DEF_BY_ID.get(id);
    assert.ok(def, `${id} is a catalog def`);
    assert.equal(def.impulseProvenance, provenance, `${id} carries its provenance tag`);
    const resolved = resolveWeaponPresentationFamily(id);
    assert.equal(resolved.family, family, `${id} resolves to ${family}`);
    assert.equal(resolved.variant, variant);
    assert.notEqual(resolved.family, collapsed, `${id} must not still render as ${collapsed}`);
    assert.equal(classifyWeaponFamily(id, def).family, family);
    assert.equal(pictureForWeapon(id).family, family);
    // The drawn recipe (muzzle + bolt + trail) follows the family — no per-weapon rows.
    assert.equal(resolveWeaponRecipe(id).variant, variant);
    families.add(family);
  }
  assert.equal(families.size, CORRECTED.length,
    'snarl, marker, sink, well and shunt each own a distinct family');
});

test('FB-071: no two verbs with different provenance share a family', () => {
  const provenanceByFamily = new Map();
  for (const def of WEAPONS) {
    const tag = def.impulseProvenance;
    if (!tag || !PROVENANCE_PICTURE[tag]) continue;
    const { family } = classifyWeaponFamily(def.id, def);
    const owner = provenanceByFamily.get(family);
    assert.equal(owner == null || owner === tag, true,
      `provenance ${tag} lands on family ${family}, which ${owner} already owns`);
    provenanceByFamily.set(family, tag);
  }
  assert.equal(provenanceByFamily.size, Object.keys(PROVENANCE_PICTURE).length,
    'every pictured provenance resolves to its own family');
});

test('FB-071: the four emergent weapons classify on their provenance, not their damage type', () => {
  const families = new Set();
  for (const [id, provenance, family, variant] of EMERGENT) {
    const def = DEF_BY_ID.get(id);
    assert.ok(def, `${id} is a catalog def`);
    assert.equal(def.impulseProvenance, provenance);
    const resolved = resolveWeaponPresentationFamily(id);
    assert.equal(resolved.family, family);
    assert.equal(resolved.variant, variant);
    assert.equal(resolveWeaponRecipe(id).variant, variant);
    families.add(family);
  }
  assert.equal(families.size, EMERGENT.length,
    'the four emergent verbs are four distinct presentation families');
});

test('FB-071: the starter pulse voice and generic families are undisturbed', () => {
  // The shared classifier must not shift the DPS families it was never asked to move.
  const pinned = [
    ['wpn_pulse_laser_s', 'plasma', 'pulse-bolt', 'sfx_wpn_pulse_laser'],
    ['wpn_autocannon_m', 'kinetic', 'autocannon', 'sfx_wpn_autocannon'],
    ['wpn_emp_disruptor_m', 'emp', 'disruptor', 'sfx_wpn_disruptor'],
    ['wpn_concussion_cannon_m', 'concussion', 'concussion-slug', 'sfx_wpn_concussion'],
    ['wpn_vector_mine_m', 'mine', 'vector-mine', 'sfx_wpn_charge'],
    ['wpn_flak_turret_s', 'kinetic', 'flak', 'sfx_wpn_flak'],
    ['wpn_beam_laser_m', 'beam', 'continuous-beam', 'sfx_wpn_beam_laser'],
  ];
  for (const [id, family, variant, recipe] of pinned) {
    const resolved = resolveWeaponPresentationFamily(id);
    assert.equal(resolved.family, family, `${id} keeps family ${family}`);
    assert.equal(resolved.variant, variant, `${id} keeps variant ${variant}`);
    assert.equal(recipeForWeapon(id), recipe, `${id} keeps voice ${recipe}`);
  }
  // The starter pulse stays the energy-bolt voice and is never lent out.
  for (const def of WEAPONS) {
    if (recipeForWeapon(def.id) === 'sfx_wpn_pulse_laser') {
      assert.match(def.id, /(pulse|laser|blaster)/, `${def.id} borrowed the starter pulse voice`);
    }
  }
});

test('FB-071: the Crucible can actually show the web — the snarl card carries the web family', () => {
  // Seed 4242 Crucible: the snarl card sits in the swarm shelf and the classifier says it is a
  // web before the first shot is ever drawn.
  const result = offerDraft({
    seed: 4242, wave: 1, hullId: 'ship_hornet',
    fittings: [null, null, null], pickCount: 0, ruleset: SWARM_RULESET, count: 100,
  });
  assert.equal(result.ok, true);
  const snarl = result.offers.find((offer) => offer.defId === 'wpn_snarl_s');
  assert.ok(snarl, 'the snarl card is draftable in the Crucible');
  const family = resolveWeaponPresentationFamily(snarl.defId);
  assert.equal(family.family, 'web', 'the drafted snarl shows the web family on its first shot');
  assert.equal(family.variant, 'filament');
});
