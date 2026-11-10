// VERB-19: a line that rebounds twangs once. Strain (nearBreak / loaded phase) is not that twang.
// Seed 4242 is the harness seed; the rebound itself is not rolled.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { mulberry32 } from '../src/core/rng.js';
import { audio } from '../src/audio/audioSystem.js';
import { combatVerbRecipe } from '../src/audio/combatVerbCues.js';

const SEED = 4242;
const TWANG = 'sfx_tether_twang';

function harness() {
  const player = makeEntity({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, data: {},
  });
  player.id = 1;
  const state = {
    tick: 120,
    simTime: 120 / 60,
    mode: 'flight',
    playerId: player.id,
    player: { heat: 0, tether: null },
    meta: { seed: SEED },
    rng: mulberry32(SEED),
    settings: { video: {}, accessibility: { captions: false } },
    world: { currentSectorId: 'sector_helios' },
    entities: new Map([[player.id, player]]),
    entityList: [player],
  };
  const bus = createBus();
  const ear = Object.create(audio);
  const plays = [];
  ear.init({ state, bus });
  ear.play = (recipeId) => {
    plays.push(recipeId);
    return { recipeId };
  };
  return { state, bus, ear, plays };
}

test('seed 4242 a rebounding line twangs once per rebound and strain is not the twang', () => {
  const h = harness();
  try {
    assert.equal(h.state.meta.seed, SEED);
    assert.equal(combatVerbRecipe('tether:rebound'), TWANG);
    assert.equal(combatVerbRecipe('tether:snagged'), TWANG);
    assert.notEqual(combatVerbRecipe('tether:nearBreak'), TWANG);

    h.bus.emit('tether:rebound', {
      actorId: h.state.playerId, attachmentId: 7, restLength: 40,
    });
    h.bus.emit('tether:rebound', {
      actorId: h.state.playerId, attachmentId: 7, restLength: 40, x: 4, z: 8,
    });
    assert.deepEqual(h.plays, [TWANG, TWANG]);

    h.plays.length = 0;
    h.state.player.tether = { phase: 'loaded', load: 0.8, strain: 0.7 };
    h.bus.emit('tether:nearBreak', {
      actorId: h.state.playerId, tension: 0.9, ratio: 0.9,
    });
    h.bus.emit('tether:strain', { phase: 'loaded', load: 0.8 });
    assert.equal(h.plays.includes(TWANG), false);
    assert.ok(h.plays.length > 0, 'strain still speaks, just not as the twang');
    assert.ok(h.plays.every((id) => id !== TWANG));
  } finally {
    h.ear.destroy();
  }
});
