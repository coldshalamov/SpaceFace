// INST-22: one cruise:engaged is one lane-lock voice. The presentation path
// (travel.cruise.engaged → presentation.travel.lane_lock → sfx_travel_lane_lock) owns the
// answer; the raw verb-cue row is SILENT so a boost sting can never double it.
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

test('seed 4242 one cruise:engaged plays the lane-lock voice exactly once', () => {
  const h = harness();
  try {
    assert.equal(h.state.meta.seed, SEED);
    // The raw verb row is SILENT and says why — the lane-lock recipe owns the answer.
    const row = combatVerbCueRow('cruise:engaged');
    assert.equal(row && row.recipe, 'SILENT');
    assert.equal(typeof row.reason, 'string');
    assert.match(row.reason, /lane_lock/, 'the SILENT reason names the owning voice');
    assert.equal(combatVerbRecipe('cruise:engaged'), '');

    h.bus.emit('cruise:engaged', { playerId: 1 });
    h.bus.flush(); // presentation:cue is deferred to the end-of-step flush

    const laneLocks = h.plays.filter((id) => id === 'sfx_travel_lane_lock');
    assert.equal(laneLocks.length, 1, 'exactly one lane-lock play per engage');
    assert.equal(
      h.plays.filter((id) => id === 'sfx_engine_boost').length, 0,
      'no raw boost sting doubles the engage',
    );
  } finally {
    // noop — harness owns no timers
  }
});
