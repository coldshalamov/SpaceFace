import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { audio } from '../src/audio/audioSystem.js';
import { bombs } from '../src/systems/bombs.js';
import { RECIPES } from '../src/data/audioRecipes.js';
import { BOMB_RACK_CUES } from '../src/audio/bombAudio.js';
import { mulberry32 } from '../src/core/rng.js';

const SEED = 4242;

test('VERB-23: bomb rack recipes exist and are distinct authored clicks', () => {
  assert.equal(BOMB_RACK_CUES.cycle, 'sfx_bomb_rack_cycle');
  assert.equal(BOMB_RACK_CUES.rackChanged, 'sfx_bomb_rack_change');
  assert.notEqual(BOMB_RACK_CUES.cycle, BOMB_RACK_CUES.rackChanged);

  const cycleRecipe = RECIPES.find((r) => r.id === 'sfx_bomb_rack_cycle');
  const changeRecipe = RECIPES.find((r) => r.id === 'sfx_bomb_rack_change');

  assert.ok(cycleRecipe, 'sfx_bomb_rack_cycle must exist in RECIPES');
  assert.ok(changeRecipe, 'sfx_bomb_rack_change must exist in RECIPES');
  assert.equal(cycleRecipe.type, 'noise_burst');
  assert.equal(changeRecipe.type, 'noise_burst');
});

test('VERB-23: on seed 4242 bombs:cycle and bombs:rackChanged each play one short authored click', () => {
  const bus = createBus();
  const player = { id: 1, pos: { x: 0, z: 0 }, credits: 1000 };
  const state = {
    tick: 1,
    simTime: 1 / 60,
    mode: 'flight',
    playerId: player.id,
    player,
    meta: { seed: SEED },
    rng: mulberry32(SEED),
    settings: { video: {}, accessibility: { captions: false } },
    entities: new Map([[player.id, player]]),
    entityList: [player],
    bombs: {
      rack: {
        capacity: 4,
        cells: [
          { id: 'bomb_frag', count: 3, max: 5 },
          { id: 'bomb_emp', count: 2, max: 5 },
        ],
      },
      stock: { bomb_frag: 5, bomb_emp: 5 },
      selectedId: 'bomb_frag',
    },
    input: { actions: {} },
  };

  const ear = Object.create(audio);
  const plays = [];
  ear.init({ state, bus });
  ear.play = (recipeId, opts) => {
    plays.push({ recipeId, opts });
    return { recipeId };
  };

  const bombsSys = Object.create(bombs);
  bombsSys.init({ state, bus, helpers: {} });

  try {
    // 1. Cycling bomb selection plays sfx_bomb_rack_cycle
    plays.length = 0;
    const nextId = bombsSys.cycleSelection(state);
    bus.flush();

    assert.equal(nextId, 'bomb_emp');
    assert.equal(plays.length, 1);
    assert.equal(plays[0].recipeId, 'sfx_bomb_rack_cycle');

    // 2. Changing rack composition plays sfx_bomb_rack_change
    plays.length = 0;
    const unfitOk = bombsSys.unfitPayload({ socketIndex: 0 });
    bus.flush();

    assert.equal(unfitOk, true);
    assert.equal(plays.length, 1);
    assert.equal(plays[0].recipeId, 'sfx_bomb_rack_change');

    // 3. Both events pin two distinct IDs
    assert.notEqual(plays[0].recipeId, 'sfx_bomb_rack_cycle');
  } finally {
    ear.destroy();
  }
});
