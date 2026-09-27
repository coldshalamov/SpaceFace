// CV-EAR — every field power deploys in its own voice (build_map §23, slice 1).
// Done-when: the five field kinds resolve to five distinct dedicated recipes (not the UI
// confirm, not the borrowed anomaly swell), every recipe is registered and captioned, and a
// player deploy no longer emits the generic audio:cue 'confirm' click.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { RECIPES } from '../src/data/audioRecipes.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { FIELD_WINDUP_S, fields } from '../src/systems/fields.js';
import {
  ACCESSIBILITY_AUDIO_CUE_TABLE,
  AUDIO_CUE_CAPTIONS,
  resolveAccessibilityCue,
} from '../src/ui/captions.js';
import { getBusForRecipe } from '../src/audio/audioSystem.js';

const SEED = 23010;
const DT = SIM_DT;
const KINDS = ['well', 'repulsor', 'cone', 'skim', 'seed'];
const RECIPE_IDS = {
  well: 'sfx_field_deploy_well',
  repulsor: 'sfx_field_deploy_repulsor',
  cone: 'sfx_field_deploy_cone',
  skim: 'sfx_field_deploy_skim',
  seed: 'sfx_field_deploy_seed',
};

const recipeById = new Map(RECIPES.map((r) => [r.id, r]));

function withFlag(on, fn) {
  const prev = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = on;
  let result;
  try {
    result = fn();
  } catch (err) {
    FIELD_FLAGS.enabled = prev;
    throw err;
  }
  FIELD_FLAGS.enabled = prev;
  return result;
}

function boot(seed = SEED) {
  const sim = createSimulation({ seed, bus: createBus(), systems: [fields] });
  const { state } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, collides: true,
    vel: { x: 0, z: 0 }, rot: 0, angVel: 0, hull: 200, hullMax: 200,
    flightModel: { inertia: 88 }, flags: {},
    physicsBody: { schemaVersion: 1, radius: 12, mass: 28, inertiaY: 88, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { combatProfileId: 'combat_profile_standard_ship' },
  });
  state.playerId = player.id;
  return { sim, state, player };
}

test('each of the five field kinds resolves to its own dedicated deploy recipe', () => {
  const resolvedIds = [];
  for (const kind of KINDS) {
    const cue = resolveAccessibilityCue(kind);
    assert.ok(cue, `${kind} must have an accessibility cue entry`);
    assert.equal(cue.id, `a11y.${kind}`);
    assert.equal(cue.kind, kind);
    assert.equal(cue.recipeId, RECIPE_IDS[kind], `${kind} must own ${RECIPE_IDS[kind]}`);
    assert.ok(typeof cue.caption === 'string' && cue.caption.length > 0, `${kind} needs a caption`);
    assert.equal(AUDIO_CUE_CAPTIONS[kind], cue.caption);
    assert.equal(ACCESSIBILITY_AUDIO_CUE_TABLE[kind], cue);
    resolvedIds.push(cue.recipeId);
  }
  assert.equal(new Set(resolvedIds).size, KINDS.length, 'deploy voices must be mutually distinct');
});

test('every deploy voice is a registered recipe on the combat one-shot bus — never the borrowed cues', () => {
  for (const kind of KINDS) {
    const id = RECIPE_IDS[kind];
    assert.notEqual(id, 'sfx_ui_confirm');
    assert.notEqual(id, 'sfx_anomaly_swell');
    const recipe = recipeById.get(id);
    assert.ok(recipe, `${id} must exist in the RECIPES registry`);
    assert.equal(recipe.id, id);
    assert.equal(getBusForRecipe(recipe, id), 'combat', `${id} must route to the combat/SFX bus`);
    assert.ok(!id.startsWith('sfx_ui_'), `${id} must not be a UI recipe`);
  }
});

test('a player deploy publishes its field kind on fields:deployed — all five powers', () => {
  withFlag(true, () => {
    const t = boot();
    const deployed = [];
    t.sim.bus.on('fields:deployed', (p) => deployed.push(p));
    const press = (name) => {
      t.state.input.actions[name] = true;
      t.sim.step();
      t.state.input.actions[name] = false;
    };
    const windupTicks = Math.ceil(FIELD_WINDUP_S / DT) + 2;

    press('deployWell');
    for (let i = 0; i < windupTicks; i++) t.sim.step();
    assert.ok(deployed.some((p) => p.kind === 'well'), 'the Well deploy emits kind=well');

    t.state.fields.cooldowns.repulsor = 0;
    press('deployRepulsor');
    for (let i = 0; i < windupTicks; i++) t.sim.step();
    assert.ok(deployed.some((p) => p.kind === 'repulsor'), 'the Repulsor deploy emits kind=repulsor');

    press('toggleClearingCone');
    t.sim.step();
    assert.ok(deployed.some((p) => p.kind === 'cone' && p.isPlayer === true),
      'the Cone wedge opening emits kind=cone for the player');

    // The Skim sheet has no press — the collector latch opening it IS the deploy.
    t.state.planet = { player: { collectorOn: true } };
    t.sim.step();
    assert.ok(deployed.some((p) => p.kind === 'skim' && p.isPlayer === true),
      'the Skim sheet opening emits kind=skim');

    // The Seed power's deploy is the lock-ring field registering on a live seed.
    const seedEnt = t.sim.spawn({
      type: 'debris', team: 0, pos: { x: 40, z: 0 }, radius: 2, alive: true,
      vel: { x: 0, z: 0 }, rot: 0, angVel: 0, flags: {}, data: {},
    });
    t.state.massSeed = { phase: 'active', seedId: seedEnt.id, ownerId: t.player.id };
    t.sim.step();
    assert.ok(deployed.some((p) => p.kind === 'seed' && p.sourceId === seedEnt.id),
      'the Seed lock-ring registering emits kind=seed');
  });
});

test('a player deploy no longer clicks the generic UI confirm', () => {
  withFlag(true, () => {
    const t = boot();
    const audio = [];
    t.sim.bus.on('audio:cue', (p) => audio.push(p));
    const press = (name) => {
      t.state.input.actions[name] = true;
      t.sim.step();
      t.state.input.actions[name] = false;
    };
    const windupTicks = Math.ceil(FIELD_WINDUP_S / DT) + 2;

    press('deployWell');
    for (let i = 0; i < windupTicks; i++) t.sim.step();
    press('toggleClearingCone');
    t.sim.step();

    assert.equal(
      audio.filter((p) => p && p.id === 'confirm').length, 0,
      `deploying a force power must not emit audio:cue 'confirm' (got ${JSON.stringify(audio)})`,
    );
  });
});
