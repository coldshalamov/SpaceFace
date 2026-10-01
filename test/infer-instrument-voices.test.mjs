// INST-17 / INST-22 / INST-26. Seed 4242. One voice per moment: the jump whoosh under
// the arrival chord, cruise answered by the lane-lock sting, reactor-clear relief.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { mulberry32 } from '../src/core/rng.js';
import { audio, AUDIO_RECIPE_BY_ID } from '../src/audio/audioSystem.js';
import { combatVerbCueRow, combatVerbRecipe } from '../src/audio/combatVerbCues.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';
import { salvage } from '../src/systems/salvage.js';

const SEED = 4242;
const CRUISE_SILENT_REASON = 'Cruise engage is owned by the lane-lock voice (presentation.travel.lane_lock); a boost row would double it.';
const JUMP_ARRIVE_SILENT_REASON = 'Jump arrival is owned by the semantic journey voice (travel.arrival); a verb-cue row would double it.';

function count(plays, id) {
  return plays.filter((recipeId) => recipeId === id).length;
}

function harness({ withSalvage = false } = {}) {
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
    world: {
      currentSectorId: 'sector_helios',
      sectors: { sector_ceres_belt: { id: 'sector_ceres_belt', palette: 'belt' } },
    },
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
  if (withSalvage) {
    const yard = Object.create(salvage);
    yard.init({ state, bus, helpers: null });
  }
  ear.play = (recipeId) => {
    plays.push(recipeId);
    return { recipeId };
  };
  return { state, bus, ear, plays };
}

function arriveByJump(h, sectorId = 'sector_ceres_belt') {
  h.bus.emit('jump:chargeStart', {
    targetSectorId: sectorId, via: 'gate', chargeNeeded: 2, playerId: h.state.playerId,
  });
  h.bus.flush();
  h.bus.emit('jump:start', {
    from: 'sector_helios', to: sectorId, via: 'gate', fromPos: { x: 0, z: 0 }, playerId: h.state.playerId,
  });
  h.bus.flush();
  h.state.tick += 40;
  h.state.simTime = h.state.tick / 60;
  h.state.world.currentSectorId = sectorId;
  h.bus.emit('sector:enter', {
    sectorId,
    sector: h.state.world.sectors[sectorId],
    entryPoint: { x: 10, z: 0 },
    firstVisit: false,
  });
  h.bus.flush();
  h.bus.emit('jump:arrive', {
    sectorId, interdicted: false, ambushCount: 0, toPos: { x: 10, z: 0 }, playerId: h.state.playerId,
  });
  h.bus.flush();
}

test('seed 4242 a jump arrival plays the arrival chord and the jump whoosh once each', () => {
  const h = harness();
  try {
    assert.equal(h.state.meta.seed, SEED);
    const raw = combatVerbCueRow('jump:arrive');
    assert.equal(raw.recipe, 'SILENT');
    assert.equal(raw.reason, JUMP_ARRIVE_SILENT_REASON);
    assert.equal(combatVerbRecipe('jump:arrive'), '');
    const chord = AUDIO_RECIPE_BY_ID.sfx_travel_arrival;
    assert.equal(chord.type, 'layered');
    assert.equal(chord.layers.includes('sfx_jump_arrive'), false);

    h.bus.emit('jump:arrive', {
      sectorId: 'sector_ceres_belt', interdicted: false, ambushCount: 0,
      toPos: { x: 0, z: 0 }, playerId: h.state.playerId,
    });
    h.bus.flush();
    assert.equal(count(h.plays, 'sfx_jump_arrive'), 0);
    assert.equal(count(h.plays, 'sfx_travel_arrival'), 0);

    h.plays.length = 0;
    arriveByJump(h);
    assert.equal(count(h.plays, 'sfx_travel_arrival'), 1);
    assert.equal(count(h.plays, 'sfx_jump_arrive'), 1);

    h.plays.length = 0;
    h.state.tick += 40;
    h.bus.emit('sector:enter', {
      sectorId: 'sector_helios', continuous: true, noTeleport: true, sector: { id: 'sector_helios' },
    });
    h.bus.flush();
    assert.equal(count(h.plays, 'sfx_jump_arrive'), 0, 'a corridor crossing is not a jump');

    h.plays.length = 0;
    h.state.world.currentSectorId = 'sector_helios';
    arriveByJump(h);
    assert.equal(count(h.plays, 'sfx_travel_arrival'), 1);
    assert.equal(count(h.plays, 'sfx_jump_arrive'), 1);
  } finally {
    h.ear.destroy();
  }
});

test('seed 4242 one cruise engage is the lane-lock voice, and the boost row is silent', () => {
  const h = harness();
  try {
    assert.equal(h.state.meta.seed, SEED);
    const row = combatVerbCueRow('cruise:engaged');
    assert.equal(row.recipe, 'SILENT');
    assert.equal(row.reason, CRUISE_SILENT_REASON);
    assert.equal(combatVerbRecipe('cruise:engaged'), '');

    h.bus.emit('cruise:engaged', { playerId: h.state.playerId });
    h.bus.flush();
    assert.equal(count(h.plays, 'sfx_travel_motif'), 1);
    assert.equal(count(h.plays, 'sfx_engine_boost'), 0);
    assert.equal(h.plays.length, 1);

    h.state.tick += 40;
    h.plays.length = 0;
    h.bus.emit('cruise:engaged', { playerId: h.state.playerId });
    h.bus.flush();
    assert.equal(count(h.plays, 'sfx_travel_motif'), 1);
    assert.equal(h.plays.length, 1);
  } finally {
    h.ear.destroy();
  }
});

test('seed 4242 towing a reactor clear plays one relief tone', () => {
  const h = harness({ withSalvage: true });
  try {
    assert.equal(h.state.meta.seed, SEED);
    assert.equal(combatVerbRecipe('salvage:reactorTowedClear'), 'sfx_wanted_clear');
    assert.equal(AUDIO_RECIPE_BY_ID.sfx_wanted_clear.category, 'ui');

    h.bus.emit('salvage:reactorTowedClear', { wreckId: 7, targetId: 7, t: h.state.simTime });
    h.bus.flush();
    assert.deepEqual(h.plays, ['sfx_wanted_clear']);

    h.plays.length = 0;
    h.bus.emit('salvage:placed', { sectorId: 'sector_helios', count: 1, communicators: 0 });
    h.bus.flush();
    assert.deepEqual(h.plays, []);
  } finally {
    h.ear.destroy();
  }
});
