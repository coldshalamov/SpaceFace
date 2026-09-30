// INST-21: one mining:yield is one ore voice. The verb route must not stack a second play
// on the presentation recipe. Seed 4242 is the harness seed; the yield itself is not rolled.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { mulberry32 } from '../src/core/rng.js';
import { audio } from '../src/audio/audioSystem.js';
import { combatVerbCueRow, combatVerbRecipe } from '../src/audio/combatVerbCues.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';

const SEED = 4242;

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
    player: { heat: 0 },
    meta: { seed: SEED },
    rng: mulberry32(SEED),
    settings: { video: {}, accessibility: { captions: false } },
    world: { currentSectorId: 'sector_helios' },
    entities: new Map([[player.id, player]]),
    entityList: [player],
  };
  const bus = createBus();
  const presenter = Object.create(presentationOrchestrator);
  const adapters = Object.create(presentationAdapters);
  const ear = Object.create(audio);
  const plays = [];
  presenter.init({ state, bus });
  adapters.init({ state, bus });
  ear.init({ state, bus });
  ear.play = (recipeId) => {
    plays.push(recipeId);
    return { recipeId };
  };
  return { state, bus, ear, plays };
}

function silentReason(verb) {
  const row = combatVerbCueRow(verb);
  assert.equal(row && row.recipe, 'SILENT', verb);
  assert.equal(typeof row.reason, 'string');
  assert.ok(row.reason.length > 8, verb);
  assert.equal(combatVerbRecipe(verb), '');
  return row.reason;
}

test('seed 4242 one mining yield plays the ore voice once', () => {
  const h = harness();
  try {
    assert.equal(h.state.meta.seed, SEED);
    const yieldReason = silentReason('mining:yield');
    assert.match(yieldReason, /mining\.yield\.collected/);
    const seamReason = silentReason('mining:seamHit');
    assert.match(seamReason, /mining\.seam\.reward/);

    h.bus.emit('mining:yield', {
      commodityId: 'cmdty_ore_iron',
      qty: 1,
      pos: { x: 12, z: -4 },
      minerId: h.state.playerId,
    });
    h.bus.flush();
    assert.deepEqual(h.plays, ['sfx_mining_yield']);

    h.state.tick += 30;
    h.plays.length = 0;
    h.bus.emit('mining:seamHit', { asteroidId: 9, pos: { x: 12, z: -4 } });
    h.bus.flush();
    assert.deepEqual(h.plays, ['sfx_mining_seam_reward']);

    h.plays.length = 0;
    h.bus.emit('tether:latched', { actorId: h.state.playerId });
    h.bus.flush();
    assert.deepEqual(h.plays, ['sfx_tether_latch_lock']);

    h.plays.length = 0;
    h.bus.emit('tether:snagged', { x: 4, z: 8, obstacleId: 3 });
    h.bus.flush();
    assert.deepEqual(h.plays, ['sfx_tether_twang']);
    silentReason('tether:snagCleared');
  } finally {
    h.ear.destroy();
  }
});
