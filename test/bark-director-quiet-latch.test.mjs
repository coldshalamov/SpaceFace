import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import {
  barkDirector,
  setBarkDirectorQuietLatchForBench,
  getBarkDirectorQuietLatchForBench,
} from '../src/systems/barkDirector.js';

function boot() {
  const state = createGameState(1531);
  state.mode = 'flight';
  state.tick = 0;
  state.simTime = 0;
  state.meta = state.meta || {};
  state.meta.seed = 1531;
  const bus = createBus();
  let said = [];
  const helpers = {
    voice: {
      say(payload) {
        said.push(payload);
        return true;
      },
    },
  };
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 80, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0, data: {},
  });
  state.playerId = player.id;
  const ships = [player];
  for (let i = 0; i < 48; i++) {
    ships.push(helpers.spawnEntity({
      type: 'ship',
      pos: { x: 800 + i * 40, z: i * 20 },
      vel: { x: 0, z: 0 },
      radius: 8, mass: 12, hull: 80, hullMax: 80, collides: true, team: 0,
      data: { ai: { passive: true, fsm: 'idle' } },
    }));
  }
  if (state.entityIndex) {
    state.entityIndex.ready = true;
    state.entityIndex.__spacefaceEntityIndexV1 = true;
    state.entityIndex.ships = ships;
    state.entityIndex.shipLike = ships;
    state.entityIndex.version = 1;
  }
  const system = Object.assign({}, barkDirector);
  system.init({ state, bus, helpers, registry: null });
  return { state, helpers, ships, bus, player, system, said };
}

function step(system, state, n = 1) {
  for (let i = 0; i < n; i++) {
    state.tick++;
    state.simTime += 1 / 60;
    system.update(1 / 60, state);
  }
}

test('bark director quiet latch arms and skips census', () => {
  assert.equal(getBarkDirectorQuietLatchForBench(), true);
  const { state, system } = boot();
  setBarkDirectorQuietLatchForBench(true);
  step(system, state, 5);
  assert.equal(state.barkDirectorRuntime?.quietLatched, true);
  assert.ok(system._barkQuiet);
  const membership = system._barkQuiet.membership;
  step(system, state, 10);
  assert.equal(state.barkDirectorRuntime?.quietLatched, true);
  assert.equal(system._barkQuiet.membership, membership);
});

test('bark director quiet latch wakes on hostile attack spawn and speaks', () => {
  const { state, helpers, ships, system, player, said } = boot();
  setBarkDirectorQuietLatchForBench(true);
  step(system, state, 5);
  assert.equal(state.barkDirectorRuntime?.quietLatched, true);

  const foe = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 120, z: 0 },
    vel: { x: -10, z: 0 },
    radius: 12, mass: 60, hull: 80, hullMax: 80, collides: true, team: 1,
    data: {
      ai: { fsm: 'attack', forcePlayerTarget: true },
      combat: { targetId: player.id, lockTarget: player.id },
      factionId: 'faction_reach',
    },
  });
  ships.push(foe);
  if (state.entityIndex) {
    state.entityIndex.ships = ships;
    state.entityIndex.shipLike = ships;
    state.entityIndex.version = (state.entityIndex.version | 0) + 1;
  }
  system.noteBarkWake();
  step(system, state, 1);
  assert.equal(state.barkDirectorRuntime?.quietLatched, false);
  assert.ok(said.some((p) => p && p.kind === 'barkDirector'));
});

test('bark director quiet latch bench toggle restores census', () => {
  const { state, system } = boot();
  setBarkDirectorQuietLatchForBench(true);
  step(system, state, 5);
  assert.equal(state.barkDirectorRuntime?.quietLatched, true);
  setBarkDirectorQuietLatchForBench(false);
  step(system, state, 1);
  assert.equal(system._barkQuiet, null);
  setBarkDirectorQuietLatchForBench(true);
});
