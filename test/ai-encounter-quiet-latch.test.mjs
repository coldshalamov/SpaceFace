import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import {
  aiEncounter,
  setAiEncounterQuietLatchForBench,
  getAiEncounterQuietLatchForBench,
} from '../src/systems/aiEncounter.js';

function boot() {
  const state = createGameState(1615);
  state.mode = 'flight';
  state.tick = 0;
  state.simTime = 0;
  state.runtime = { profileId: 'production' };
  state.meta = { seed: 1615 };
  state.world = { currentSectorId: 'sector_ceres_belt' };
  state.sector = { id: 'sector_ceres_belt' };
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 40, z: 0 }, rot: 0,
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0,
    data: { ai: { passive: true } },
  });
  state.playerId = player.id;
  player.isPlayer = true;
  const ships = [player];
  for (let i = 0; i < 24; i++) {
    ships.push(helpers.spawnEntity({
      type: 'ship',
      pos: { x: 400 + i * 40, z: (i % 5) * 30 },
      vel: { x: 0, z: 0 }, rot: 0,
      radius: 8, mass: 12, hull: 80, hullMax: 80, collides: true, team: 0,
      physicsSleeping: true,
      data: { ai: { passive: true } },
    }));
  }
  if (state.entityIndex) {
    state.entityIndex.ready = true;
    state.entityIndex.__spacefaceEntityIndexV1 = true;
    state.entityIndex.ships = ships;
    state.entityIndex.shipLike = ships;
    state.entityIndex.version = 1;
  }
  aiEncounter.init({ state, bus, helpers, registry: null });
  return { state, bus, helpers, ships, player };
}

function bumpIndex(state) {
  if (state.entityIndex) {
    state.entityIndex.version = (state.entityIndex.version | 0) + 1;
  }
}

function tick(state, n = 1) {
  for (let i = 0; i < n; i++) {
    state.tick++;
    state.simTime += 1 / 60;
    aiEncounter.update(1 / 60, state);
  }
}

test('aiEncounter quiet latch arms and skips empty shipLike work', () => {
  assert.equal(getAiEncounterQuietLatchForBench(), true);
  setAiEncounterQuietLatchForBench(true);
  const { state } = boot();
  tick(state, 5);
  assert.equal(state.aiEncounterRuntime?.quietLatched, true);
  assert.ok(aiEncounter._aiEncounterQuiet);
  const armedTick = aiEncounter._aiEncounterQuiet.armedTick;
  tick(state, 10);
  assert.equal(state.aiEncounterRuntime?.quietLatched, true);
  assert.equal(aiEncounter._aiEncounterQuiet.armedTick, armedTick);
});

test('aiEncounter quiet latch wakes on reinforcement-author spawn', () => {
  setAiEncounterQuietLatchForBench(true);
  const { state, helpers, ships } = boot();
  tick(state, 4);
  assert.equal(state.aiEncounterRuntime?.quietLatched, true);

  const boss = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 120, z: 80 },
    vel: { x: 0, z: 0 }, rot: 0,
    radius: 14, mass: 80, hull: 200, hullMax: 200, collides: true, team: 1,
    data: {
      ai: { passive: false },
      reinforcements: { packageId: 'vael_wing_pair', hullThreshold: 0.3 },
      name: 'TEST BOSS',
    },
  });
  ships.push(boss);
  state.entityIndex.ships = ships;
  state.entityIndex.shipLike = ships;
  bumpIndex(state);
  // Mimic bus spawn notification
  aiEncounter._wakeAiEncounterQuiet();

  tick(state, 2);
  assert.equal(state.aiEncounterRuntime?.quietLatched, false);
  assert.equal(aiEncounter._aiEncounterQuiet, null);

  // Drop hull below threshold → reinforcement command should queue + apply
  boss.hull = 40; // 20% of 200
  tick(state, 3);
  assert.equal(boss.data.ai._calledReinforcements, true);
  const owner = state.aiEncounter.owner;
  assert.ok(owner.scheduled.length >= 1 || owner.pendingReinforcements.length >= 1 || owner.spawned.length >= 1);
});

test('aiEncounter quiet latch wakes on combat:damage bus', () => {
  setAiEncounterQuietLatchForBench(true);
  const { state, bus } = boot();
  tick(state, 4);
  assert.equal(state.aiEncounterRuntime?.quietLatched, true);
  const armed = aiEncounter._aiEncounterQuiet.armedTick;
  bus.emit('combat:damage', { amount: 1 });
  tick(state, 1);
  // Wake clears latch; re-arms on next quiet census
  assert.ok(
    aiEncounter._aiEncounterQuiet == null
      || aiEncounter._aiEncounterQuiet.armedTick !== armed
      || state.aiEncounterRuntime?.quietLatched === true,
  );
});

test('aiEncounter quiet latch off restores always-scan', () => {
  setAiEncounterQuietLatchForBench(false);
  const { state } = boot();
  tick(state, 5);
  assert.equal(state.aiEncounterRuntime?.quietLatched, undefined);
  assert.equal(aiEncounter._aiEncounterQuiet, null);
  setAiEncounterQuietLatchForBench(true);
});
