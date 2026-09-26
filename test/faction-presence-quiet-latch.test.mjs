import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import {
  factionPresence,
  setFactionPresenceQuietLatchForBench,
  getFactionPresenceQuietLatchForBench,
} from '../src/systems/factionPresence.js';
import { sampleFactionBehavior } from '../src/data/factionDoctrines.js';

function boot() {
  const state = createGameState(1603);
  state.mode = 'flight';
  state.tick = 0;
  state.simTime = 0;
  state.runtime = { profileId: 'production' };
  state.meta = { seed: 1603 };
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
  factionPresence.init({ state, bus, helpers, registry: null });
  return { state, bus, helpers, ships, player };
}

function bumpIndex(state) {
  if (state.entityIndex) {
    state.entityIndex.version = (state.entityIndex.version | 0) + 1;
  }
}

test('factionPresence quiet latch arms and skips empty shipLike work', () => {
  assert.equal(getFactionPresenceQuietLatchForBench(), true);
  setFactionPresenceQuietLatchForBench(true);
  const { state } = boot();
  for (let i = 0; i < 5; i++) {
    state.tick++;
    state.simTime += 1 / 60;
    factionPresence.update();
  }
  assert.equal(state.factionPresenceRuntime?.quietLatched, true);
  assert.ok(factionPresence._presenceQuiet);
  const armedTick = factionPresence._presenceQuiet.armedTick;
  for (let i = 0; i < 10; i++) {
    state.tick++;
    state.simTime += 1 / 60;
    factionPresence.update();
  }
  assert.equal(state.factionPresenceRuntime?.quietLatched, true);
  assert.equal(factionPresence._presenceQuiet.armedTick, armedTick);
});

test('factionPresence quiet latch wakes on fixed-route presence spawn', () => {
  setFactionPresenceQuietLatchForBench(true);
  const { state, helpers, ships } = boot();
  for (let i = 0; i < 4; i++) {
    state.tick++;
    factionPresence.update();
  }
  assert.equal(state.factionPresenceRuntime?.quietLatched, true);

  const doctrine = sampleFactionBehavior('faction_fulfillment', 1603)[0];
  const routeShip = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 120, z: 80 },
    vel: { x: 0, z: 0 }, rot: 0,
    radius: 10, mass: 40, hull: 120, hullMax: 120, collides: true, team: 2,
    factionId: 'faction_fulfillment',
    data: {
      ai: {
        passive: true,
        factionPresenceDoctrine: doctrine,
        activity: {},
      },
      factionPresence: {
        factionId: 'faction_fulfillment',
        fixedRoute: true,
        routeId: 'fulfillment_tethys_helios',
        routeStart: { x: 0, z: 0 },
        routeEnd: { x: 400, z: 0 },
        routePeriodS: 32,
        formationIndex: 0,
        formationCount: 1,
        formationSpacing: 52,
      },
    },
  });
  ships.push(routeShip);
  state.entityIndex.ships = ships;
  state.entityIndex.shipLike = ships;
  bumpIndex(state);
  // Mimic bus spawn notification
  factionPresence._onEntitySpawned({ entity: routeShip });
  assert.equal(factionPresence._presenceQuiet, null);

  state.tick++;
  state.simTime += 1 / 60;
  factionPresence.update();
  assert.equal(state.factionPresenceRuntime?.quietLatched, false);
  assert.equal(routeShip.data.ai.activity?.kind, 'transit');
  assert.ok(routeShip.data.ai.activity?.anchor);
  assert.equal(routeShip.data.ai.activity?.routeId, 'fulfillment_tethys_helios');
});

test('factionPresence quiet latch bench toggle restores always-update', () => {
  setFactionPresenceQuietLatchForBench(false);
  assert.equal(getFactionPresenceQuietLatchForBench(), false);
  const { state } = boot();
  for (let i = 0; i < 5; i++) {
    state.tick++;
    factionPresence.update();
  }
  assert.equal(state.factionPresenceRuntime?.quietLatched, undefined);
  assert.equal(factionPresence._presenceQuiet, null);
  setFactionPresenceQuietLatchForBench(true);
});

test('factionPresence quiet latch wakes on boarding', () => {
  setFactionPresenceQuietLatchForBench(true);
  const { state } = boot();
  for (let i = 0; i < 4; i++) {
    state.tick++;
    factionPresence.update();
  }
  assert.equal(state.factionPresenceRuntime?.quietLatched, true);
  state.factionPresence.boarding = {
    id: 'test_boarding',
    phase: 'holding',
    routeId: 'fulfillment_tethys_helios',
    subsystemId: 'subsystem_drive',
    startedAt: 0,
    phaseStartedAt: 0,
    holdingPos: { x: 1, z: 2 },
    routed: true,
  };
  state.tick++;
  factionPresence.update();
  assert.equal(state.factionPresenceRuntime?.quietLatched, false);
});
