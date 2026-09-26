import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import {
  salvageActions,
  setSalvageUnstableQuietLatchForBench,
  getSalvageUnstableQuietLatchForBench,
} from '../src/systems/salvageActions.js';

function boot() {
  const state = createGameState(1481);
  state.mode = 'flight';
  state.tick = 0;
  state.simTime = 0;
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0, data: {},
  });
  state.playerId = player.id;
  // Fat roster: ships + asteroids + a few inert wrecks (no unstable reactors).
  const ships = [player];
  for (let i = 0; i < 24; i++) {
    ships.push(helpers.spawnEntity({
      type: 'ship',
      pos: { x: 80 + i * 15, z: 40 },
      vel: { x: 0, z: 0 },
      radius: 8, mass: 12, hull: 80, hullMax: 80, collides: true, team: 1,
      data: { ai: { passive: true } },
    }));
  }
  for (let i = 0; i < 40; i++) {
    helpers.spawnEntity({
      type: 'asteroid',
      pos: { x: -200 + i * 12, z: -100 },
      radius: 20, mass: 200, hull: 50, hullMax: 50, collides: true,
      data: {},
    });
  }
  const wrecks = [];
  for (let i = 0; i < 6; i++) {
    wrecks.push(helpers.spawnEntity({
      type: 'wreck',
      pos: { x: 300 + i * 20, z: 200 },
      radius: 10, mass: 40, hull: 1, hullMax: 1, collides: true,
      data: { salvagePool: { scrap: 1 } },
    }));
  }
  if (state.entityIndex) {
    state.entityIndex.ready = true;
    state.entityIndex.__spacefaceEntityIndexV1 = true;
    state.entityIndex.ships = ships;
    state.entityIndex.shipLike = ships;
    state.entityIndex.wrecks = wrecks;
    state.entityIndex.version = 1;
  }
  salvageActions.init({ state, bus, helpers, registry: null });
  // Annotate inert wrecks (no unstable action for generic scrap).
  for (const w of wrecks) salvageActions._annotate(w);
  return { state, helpers, wrecks, bus };
}

test('salvage unstable quiet latch arms and skips census', () => {
  assert.equal(getSalvageUnstableQuietLatchForBench(), true);
  const { state } = boot();
  setSalvageUnstableQuietLatchForBench(true);
  for (let i = 0; i < 5; i++) {
    state.tick++;
    salvageActions.update(1 / 60, state);
  }
  assert.equal(state.salvageActionsRuntime?.unstableQuietLatched, true);
  assert.ok(salvageActions._unstableQuiet);
  const membership = salvageActions._unstableQuiet.membership;
  for (let i = 0; i < 10; i++) {
    state.tick++;
    salvageActions.update(1 / 60, state);
  }
  assert.equal(state.salvageActionsRuntime?.unstableQuietLatched, true);
  assert.equal(salvageActions._unstableQuiet.membership, membership);
});

test('salvage unstable quiet latch wakes on reactor arm and bursts', () => {
  const { state, helpers, wrecks } = boot();
  setSalvageUnstableQuietLatchForBench(true);
  for (let i = 0; i < 5; i++) {
    state.tick++;
    salvageActions.update(1 / 60, state);
  }
  assert.equal(state.salvageActionsRuntime?.unstableQuietLatched, true);

  const hot = wrecks[0];
  salvageActions.configureAuthoredWreck(hot, { reactorTimerS: 0.05, salvagePool: { scrap: 2 } });
  assert.ok(hot.data.unstableReactor);
  assert.equal(hot.data.unstableReactor.burst, false);
  // Wake clears latch.
  assert.equal(salvageActions._unstableQuiet, null);

  state.simTime = 1; // past dueAt
  state.tick++;
  salvageActions.update(1 / 60, state);
  assert.equal(hot.data.unstableReactor.burst, true);
  assert.equal(hot.alive, false);
});

test('salvage unstable quiet latch can disable for bench', () => {
  const { state } = boot();
  setSalvageUnstableQuietLatchForBench(false);
  assert.equal(getSalvageUnstableQuietLatchForBench(), false);
  for (let i = 0; i < 5; i++) {
    state.tick++;
    salvageActions.update(1 / 60, state);
  }
  assert.equal(state.salvageActionsRuntime?.unstableQuietLatched, undefined);
  assert.equal(salvageActions._unstableQuiet, null);
  setSalvageUnstableQuietLatchForBench(true);
});
