import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import {
  pirateParley,
  setPirateParleyEmptyQuietLatchForBench,
  getPirateParleyEmptyQuietLatchForBench,
} from '../src/systems/pirateParley.js';

function boot(opts = {}) {
  const state = createGameState(1511);
  state.mode = 'flight';
  state.tick = 0;
  state.simTime = 0;
  if (opts.withCargo) {
    state.player = { cargo: { items: { cmdty_refined_metals: 12 } } };
  }
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0, data: {},
  });
  state.playerId = player.id;
  const ships = [player];
  for (let i = 0; i < 48; i++) {
    ships.push(helpers.spawnEntity({
      type: 'ship',
      pos: { x: 80 + i * 15, z: 40 },
      vel: { x: 0, z: 0 },
      radius: 8, mass: 12, hull: 80, hullMax: 80, collides: true, team: 1,
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
  pirateParley.init({ state, bus, helpers, registry: null });
  return { state, helpers, ships, bus, player };
}

test('pirate parley empty quiet latch arms and skips census', () => {
  assert.equal(getPirateParleyEmptyQuietLatchForBench(), true);
  const { state } = boot();
  setPirateParleyEmptyQuietLatchForBench(true);
  for (let i = 0; i < 5; i++) {
    state.tick++;
    pirateParley.update(1 / 60, state);
  }
  assert.equal(state.pirateParleyRuntime?.emptyQuietLatched, true);
  assert.ok(pirateParley._parleyQuiet);
  const membership = pirateParley._parleyQuiet.membership;
  for (let i = 0; i < 10; i++) {
    state.tick++;
    pirateParley.update(1 / 60, state);
  }
  assert.equal(state.pirateParleyRuntime?.emptyQuietLatched, true);
  assert.equal(pirateParley._parleyQuiet.membership, membership);
});

test('pirate parley empty quiet latch wakes on toll spawn and starts scan', () => {
  const { state, helpers, ships } = boot({ withCargo: true });
  setPirateParleyEmptyQuietLatchForBench(true);
  for (let i = 0; i < 5; i++) {
    state.tick++;
    pirateParley.update(1 / 60, state);
  }
  assert.equal(state.pirateParleyRuntime?.emptyQuietLatched, true);

  const toll = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 400, z: 400 },
    vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 80, hullMax: 80, collides: true, team: 1,
    factionId: 'faction_reach',
    data: {
      ai: {
        doctrine: 'toll',
        motive: 'cargo_extortion',
        squadId: 'sq-toll-wake',
        passive: false,
      },
    },
  });
  ships.push(toll);
  if (state.entityIndex) {
    state.entityIndex.ships = ships;
    state.entityIndex.shipLike = ships;
    state.entityIndex.version = (state.entityIndex.version | 0) + 1;
  }
  pirateParley.noteParleyWake();
  state.tick++;
  pirateParley.update(1 / 60, state);
  assert.equal(state.pirateParleyRuntime?.emptyQuietLatched, false);
  const rec = state.pirateParley?.squads?.['sq-toll-wake'];
  assert.ok(rec);
  assert.equal(rec.phase, 'scan');
  assert.equal(rec.resolved, false);
});

test('pirate parley empty quiet latch bench toggle restores census', () => {
  const { state } = boot();
  setPirateParleyEmptyQuietLatchForBench(true);
  for (let i = 0; i < 5; i++) {
    state.tick++;
    pirateParley.update(1 / 60, state);
  }
  assert.equal(state.pirateParleyRuntime?.emptyQuietLatched, true);
  setPirateParleyEmptyQuietLatchForBench(false);
  state.tick++;
  pirateParley.update(1 / 60, state);
  assert.equal(pirateParley._parleyQuiet, null);
  // Restore production default for other suites.
  setPirateParleyEmptyQuietLatchForBench(true);
});
