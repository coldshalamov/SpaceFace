import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { core } from '../src/core/coreSystem.js';
import {
  createTacticalAISystem,
  setTacticalAiQuietLatchForBench,
  getTacticalAiQuietLatchForBench,
} from '../src/systems/tacticalAI.js';
import { ensureActivityClassified } from '../src/world/activityRuntime.js';
import { SIM_TIER } from '../src/world/activityClassification.js';

function stubHelpers(helpers) {
  helpers.aiSensors = {
    frameFor(entityId, tick) {
      return {
        tick,
        self: {
          id: entityId, team: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
          radius: 12, hullFraction: 1, energyFraction: 1, heatFraction: 0,
          disabled: false, tethered: false, capabilities: ['drive', 'weapon', 'ranged'],
          subsystemFractions: {}, activity: null, roe: 'weapons_free', combatDoctrineId: null,
        },
        contacts: [], events: [],
      };
    },
  };
  helpers.aiRoster = {
    listSquads() { return []; },
    liveListSquads() { return []; },
  };
  helpers.aiManeuver = { request(req) { return req; } };
}

function boot(nNpc = 0) {
  const state = createGameState(21 + nNpc);
  state.mode = 'flight';
  state.runtime = { profileId: 'production' };
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  stubHelpers(helpers);
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 12,
    hull: 100, hullMax: 100, collides: true, team: 1,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  const npcs = [];
  for (let i = 0; i < nNpc; i++) {
    // Far past the near-activity bubble so the real classifier shelves them
    // (S4_AGGREGATE, no due wake) — dormancy must come from classification, not
    // a hand-stamped activity the next classifyWorld pass would overwrite.
    npcs.push(helpers.spawnEntity({
      type: 'ship', pos: { x: 40000 + i * 30, z: 40000 }, vel: { x: 0, z: 0 }, radius: 8, mass: 10,
      hull: 80, hullMax: 80, collides: true, team: 2,
      data: { ai: true, intent: {} },
    }));
  }
  if (state.entityIndex) state.entityIndex.ready = true;
  // Production create: ports via helpers only so quiet latch is eligible.
  const tactical = createTacticalAISystem({
    actionPortFactory: () => ({
      list() { return []; },
      canStart() { return { ok: false, reason: 'idle_fixture' }; },
      start() { return null; },
      status() { return 'idle'; },
      interrupt() { return true; },
    }),
  });
  tactical.init({ state, bus, helpers, registry: null });
  return { state, helpers, bus, tactical, player, npcs };
}



test('bench toggle defaults ON', () => {
  assert.equal(getTacticalAiQuietLatchForBench(), true);
});

test('player-only quiet flight latches tacticalAI', () => {
  setTacticalAiQuietLatchForBench(true);
  const { state, tactical } = boot(0);
  for (let i = 0; i < 5; i++) {
    state.tick = (state.tick | 0) + 1;
    state.simTime = (state.simTime || 0) + 1 / 60;
    ensureActivityClassified(state);
    tactical.update(1 / 60, state);
  }
  assert.equal(!!(state.tacticalAiRuntime && state.tacticalAiRuntime.quietLatched), true);
  setTacticalAiQuietLatchForBench(true);
});

test('dormant NPCs latch; a due scheduled wake unlatches', () => {
  setTacticalAiQuietLatchForBench(true);
  const { state, tactical, npcs } = boot(2);
  for (let i = 0; i < 5; i++) {
    state.tick = (state.tick | 0) + 1;
    state.simTime = (state.simTime || 0) + 1 / 60;
    tactical.update(1 / 60, state);
  }
  assert.equal(npcs[0].activity.simTier, SIM_TIER.S4_AGGREGATE);
  assert.equal(!!(state.tacticalAiRuntime && state.tacticalAiRuntime.quietLatched), true);

  // Wake: the dormant ship's scheduled due arrives. `entityNeedsAiThink` reads
  // activity.nextEventAtT live — a pin would only show after the entity's next
  // classify cadence slot, but a due flip must wake the latch the same tick.
  npcs[0].activity.nextEventAtT = state.simTime - 1e-6;
  state.tick = (state.tick | 0) + 1;
  state.simTime = (state.simTime || 0) + 1 / 60;
  tactical.update(1 / 60, state);
  assert.equal(!!(state.tacticalAiRuntime && state.tacticalAiRuntime.quietLatched), false);
  setTacticalAiQuietLatchForBench(true);
});

test('membership spawn wakes quiet latch', () => {
  setTacticalAiQuietLatchForBench(true);
  const { state, tactical, helpers } = boot(0);
  for (let i = 0; i < 4; i++) {
    state.tick = (state.tick | 0) + 1;
    state.simTime = (state.simTime || 0) + 1 / 60;
    tactical.update(1 / 60, state);
  }
  assert.equal(!!(state.tacticalAiRuntime && state.tacticalAiRuntime.quietLatched), true);

  const hostile = helpers.spawnEntity({
    type: 'ship', pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 10,
    hull: 80, hullMax: 80, collides: true, team: 2,
    data: { ai: true, intent: {} },
  });
  // No activity → entityNeedsAiThink true (fail-open).
  assert.equal(hostile.activity == null || !hostile.activity.simTier, true);
  state.tick = (state.tick | 0) + 1;
  state.simTime = (state.simTime || 0) + 1 / 60;
  tactical.update(1 / 60, state);
  assert.equal(!!(state.tacticalAiRuntime && state.tacticalAiRuntime.quietLatched), false);
  setTacticalAiQuietLatchForBench(true);
});

test('bench toggle OFF refuses latch', () => {
  setTacticalAiQuietLatchForBench(false);
  const { state, tactical } = boot(0);
  for (let i = 0; i < 5; i++) {
    state.tick = (state.tick | 0) + 1;
    state.simTime = (state.simTime || 0) + 1 / 60;
    tactical.update(1 / 60, state);
  }
  assert.equal(!!(state.tacticalAiRuntime && state.tacticalAiRuntime.quietLatched), false);
  setTacticalAiQuietLatchForBench(true);
});
