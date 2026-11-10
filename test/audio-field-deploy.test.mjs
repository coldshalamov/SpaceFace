import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { audio, fieldDeployRecipe, resolveAudioCueRecipeId } from '../src/audio/audioSystem.js';
import { fieldDeployCaption, resolveAccessibilityCue } from '../src/ui/captions.js';

const KINDS = ['well', 'repulsor', 'cone', 'skim', 'seed'];
const EXPECTED_RECIPES = {
  well: 'sfx_field_deploy_well',
  repulsor: 'sfx_field_deploy_repulsor',
  cone: 'sfx_field_deploy_cone',
  skim: 'sfx_field_deploy_skim',
  seed: 'sfx_field_deploy_seed',
};
const EXPECTED_CAPTIONS = {
  well: 'Gravity well',
  repulsor: 'Repulsor deployed',
  cone: 'Cone deployed',
  skim: 'Skim sheet deployed',
  seed: 'Seed deployed',
};

test('INST-24: primary cue table resolves all 5 field deploy kinds', () => {
  for (const kind of KINDS) {
    const expected = EXPECTED_RECIPES[kind];
    assert.equal(fieldDeployRecipe(kind), expected, `${kind} must resolve to ${expected}`);
    assert.equal(resolveAudioCueRecipeId(`fields:deployed:${kind}`), expected);
    assert.equal(resolveAudioCueRecipeId(`fields.deployed.${kind}`), expected);
    assert.equal(resolveAudioCueRecipeId(`field.deploy.${kind}`), expected);
    assert.equal(resolveAudioCueRecipeId(kind), expected);
  }
});

test('INST-24: fields:deployed plays from primary cue table with accessibility audio cues disabled', () => {
  const bus = createBus();
  const state = {
    tick: 1,
    simTime: 1 / 60,
    settings: {
      accessibility: {
        audioCues: false, // Accessibility table explicitly disabled!
        captions: false,
      },
    },
    player: { heat: 0 },
    entities: new Map(),
    entityList: [],
  };

  // Confirm accessibility table is disabled
  for (const kind of KINDS) {
    assert.equal(resolveAccessibilityCue(kind, state.settings), null, 'accessibility cue table must be disabled');
  }

  const ear = Object.create(audio);
  const plays = [];
  ear.init({ state, bus });
  ear.play = (recipeId, opts) => {
    plays.push({ recipeId, opts });
    return { recipeId };
  };

  try {
    for (const kind of KINDS) {
      bus.emit('fields:deployed', { kind, center: { x: 100, z: 200 } });
      bus.flush();
    }

    assert.equal(plays.length, KINDS.length);
    for (let i = 0; i < KINDS.length; i++) {
      const kind = KINDS[i];
      assert.equal(plays[i].recipeId, EXPECTED_RECIPES[kind]);
      assert.deepEqual(plays[i].opts.position, { x: 100, z: 200 });
    }
  } finally {
    ear.destroy();
  }
});

test('INST-24: captions still fire when captions are enabled', () => {
  const bus = createBus();
  const state = {
    tick: 1,
    simTime: 1 / 60,
    settings: {
      accessibility: {
        audioCues: false,
        captions: true, // Captions enabled
      },
    },
    player: { heat: 0 },
    entities: new Map(),
    entityList: [],
  };

  const ear = Object.create(audio);
  const captions = [];
  bus.on('presentation:caption', (p) => captions.push(p));

  ear.init({ state, bus });
  ear.play = () => ({});

  try {
    for (const kind of KINDS) {
      bus.emit('fields:deployed', { kind });
      bus.flush();
    }

    assert.equal(captions.length, KINDS.length);
    for (let i = 0; i < KINDS.length; i++) {
      const kind = KINDS[i];
      assert.equal(captions[i].text, EXPECTED_CAPTIONS[kind]);
      assert.equal(captions[i].channel, 'cue');
      assert.equal(captions[i].kind, kind);
    }
  } finally {
    ear.destroy();
  }
});

test('INST-24: captions do not fire when captions are disabled', () => {
  const bus = createBus();
  const state = {
    tick: 1,
    simTime: 1 / 60,
    settings: {
      accessibility: {
        audioCues: false,
        captions: false,
      },
    },
    player: { heat: 0 },
    entities: new Map(),
    entityList: [],
  };

  const ear = Object.create(audio);
  const captions = [];
  bus.on('presentation:caption', (p) => captions.push(p));

  ear.init({ state, bus });
  ear.play = () => ({});

  try {
    for (const kind of KINDS) {
      bus.emit('fields:deployed', { kind });
      bus.flush();
    }

    assert.equal(captions.length, 0);
  } finally {
    ear.destroy();
  }
});
