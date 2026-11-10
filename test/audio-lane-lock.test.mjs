import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { mulberry32 } from '../src/core/rng.js';
import { audio, resolveAudioCueRecipeId } from '../src/audio/audioSystem.js';
import { RECIPES } from '../src/data/audioRecipes.js';

const SEED = 4242;

test('INST-20: locking a lane plays the authored travel motif sting on seed 4242', () => {
  // Recipe resolution check
  const resolved = resolveAudioCueRecipeId('presentation.travel.lane_lock');
  assert.equal(resolved, 'sfx_travel_motif');

  const recipe = RECIPES.find((r) => r.id === 'sfx_travel_motif');
  assert.ok(recipe, 'sfx_travel_motif recipe must exist');
  assert.equal(recipe.type, 'oscillator');
  assert.equal(recipe.wave, 'triangle');

  // Seeded simulation audio harness
  const player = makeEntity({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, data: {},
  });
  player.id = 1;
  const state = {
    tick: 60,
    simTime: 1.0,
    mode: 'flight',
    playerId: player.id,
    player: { heat: 0 },
    meta: { seed: SEED },
    rng: mulberry32(SEED),
    settings: { video: {}, accessibility: { captions: false } },
    world: { currentSectorId: 'sector_helios', sectors: {} },
    entities: new Map([[player.id, player]]),
    entityList: [player],
  };

  const bus = createBus();
  const ear = Object.create(audio);
  const plays = [];

  ear.init({ state, bus });
  ear.play = (recipeId, opts) => {
    plays.push({ recipeId, opts });
    return { recipeId };
  };

  try {
    // 1. Emitting audio:cue with presentation.travel.lane_lock plays sfx_travel_motif once
    bus.emit('audio:cue', { id: 'presentation.travel.lane_lock' });
    bus.flush();

    assert.equal(plays.length, 1);
    assert.equal(plays[0].recipeId, 'sfx_travel_motif');

    // 2. Lock a second time after tick advance plays once more (once per lock)
    state.tick += 60;
    state.simTime += 1.0;
    bus.emit('audio:cue', { id: 'presentation.travel.lane_lock' });
    bus.flush();

    assert.equal(plays.length, 2);
    assert.equal(plays[1].recipeId, 'sfx_travel_motif');
  } finally {
    ear.destroy();
  }
});
