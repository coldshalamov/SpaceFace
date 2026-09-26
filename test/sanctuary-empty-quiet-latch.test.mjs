import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import {
  lawSecurity,
  setSanctuaryEmptyQuietLatchForBench,
  getSanctuaryEmptyQuietLatchForBench,
} from '../src/systems/lawSecurity.js';

function boot() {
  const state = createGameState(1471);
  state.mode = 'flight';
  state.tick = 0;
  state.world = state.world || {};
  state.world.currentSectorId = 'sector_ceres';
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 800, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0, data: {},
  });
  state.playerId = player.id;
  helpers.spawnEntity({
    type: 'station', pos: { x: 800, z: 0 }, radius: 80, mass: 1000,
    hull: 1000, hullMax: 1000, collides: true, team: 0,
    factionId: 'faction_dmc',
    data: { stationId: 'station_ceres' },
  });
  const ships = [player];
  const aiShips = [];
  for (let i = 0; i < 8; i++) {
    const e = helpers.spawnEntity({
      type: 'ship',
      pos: { x: 100 + i * 20, z: 50 },
      vel: { x: 0, z: 0 },
      radius: 8, mass: 12, hull: 80, hullMax: 80, collides: true, team: 1,
      factionId: 'faction_scn',
      data: { ai: { passive: true, lawful: true }, role: 'patrol' },
    });
    ships.push(e);
    aiShips.push(e);
  }
  for (let i = 0; i < 4; i++) {
    const e = helpers.spawnEntity({
      type: 'ship',
      pos: { x: -200 - i * 20, z: -100 },
      vel: { x: 0, z: 0 },
      radius: 8, mass: 12, hull: 80, hullMax: 80, collides: true, team: 2,
      factionId: 'faction_reach',
      data: {
        ai: { passive: true, lawful: false, archetype: 'raider' },
        combat: {},
        intent: {},
        role: 'raider',
      },
    });
    ships.push(e);
    aiShips.push(e);
  }
  const stations = [];
  for (const e of state.entityList || []) {
    if (e && e.type === 'station') stations.push(e);
  }
  if (state.entityIndex) {
    state.entityIndex.ready = true;
    state.entityIndex.__spacefaceEntityIndexV1 = true;
    state.entityIndex.ships = ships;
    state.entityIndex.shipLike = ships;
    state.entityIndex.aiShips = aiShips;
    state.entityIndex.stations = stations;
    state.entityIndex.wrecks = [];
    state.entityIndex.payloads = [];
    state.entityIndex.pickups = [];
    state.entityIndex.version = 1;
  }
  lawSecurity.init({ state, bus, helpers, registry: null });
  return { state, helpers, ships, aiShips, player };
}

test('sanctuary empty quiet latch arms and skips walk', () => {
  assert.equal(getSanctuaryEmptyQuietLatchForBench(), true);
  const { state } = boot();
  setSanctuaryEmptyQuietLatchForBench(true);
  for (let i = 0; i < 5; i++) {
    state.tick++;
    lawSecurity._enforceSanctuaryWithdrawals(state);
  }
  assert.equal(state.lawSecurityRuntime?.sanctuaryQuietLatched, true);
  assert.ok(lawSecurity._sanctuaryQuiet);
  const membership = lawSecurity._sanctuaryQuiet.membership;
  for (let i = 0; i < 10; i++) {
    state.tick++;
    lawSecurity._enforceSanctuaryWithdrawals(state);
  }
  assert.equal(state.lawSecurityRuntime?.sanctuaryQuietLatched, true);
  assert.equal(lawSecurity._sanctuaryQuiet.membership, membership);
});

test('sanctuary empty quiet latch wakes on chase into jurisdiction', () => {
  const { state, aiShips, player } = boot();
  setSanctuaryEmptyQuietLatchForBench(true);
  for (let i = 0; i < 5; i++) {
    state.tick++;
    lawSecurity._enforceSanctuaryWithdrawals(state);
  }
  assert.equal(state.lawSecurityRuntime?.sanctuaryQuietLatched, true);

  const pirate = aiShips.find((e) => e.factionId === 'faction_reach');
  assert.ok(pirate);
  pirate.pos.x = 820;
  pirate.pos.z = 10;
  pirate.data.ai.forcePlayerTarget = true;
  pirate.data.combat.targetId = player.id;
  state.entityIndex.version = (state.entityIndex.version | 0) + 1;

  state.tick++;
  lawSecurity._enforceSanctuaryWithdrawals(state);
  assert.equal(state.lawSecurityRuntime?.sanctuaryQuietLatched, false);
  assert.equal(pirate.data.ai.sanctuaryWithdrawn, true);
  assert.equal(pirate.data.ai.engagementTrigger, 'jurisdiction_withdrawal');
});

test('sanctuary empty quiet latch wakes on combat fire seq', () => {
  const { state } = boot();
  setSanctuaryEmptyQuietLatchForBench(true);
  for (let i = 0; i < 5; i++) {
    state.tick++;
    lawSecurity._enforceSanctuaryWithdrawals(state);
  }
  assert.equal(state.lawSecurityRuntime?.sanctuaryQuietLatched, true);
  // Fire handler clears latch even without a live withdrawal candidate.
  if (typeof lawSecurity._onFire === 'function') {
    lawSecurity._onFire({ attackerId: state.playerId });
  }
  assert.equal(lawSecurity._sanctuaryQuiet, null);
  state.tick++;
  lawSecurity._enforceSanctuaryWithdrawals(state);
  // Re-arms after empty aggressive scan.
  assert.equal(state.lawSecurityRuntime?.sanctuaryQuietLatched, true);
});

test('sanctuary empty quiet latch can be disabled for bench', () => {
  const { state } = boot();
  setSanctuaryEmptyQuietLatchForBench(false);
  assert.equal(getSanctuaryEmptyQuietLatchForBench(), false);
  for (let i = 0; i < 5; i++) {
    state.tick++;
    lawSecurity._enforceSanctuaryWithdrawals(state);
  }
  assert.notEqual(state.lawSecurityRuntime?.sanctuaryQuietLatched, true);
  setSanctuaryEmptyQuietLatchForBench(true);
});
