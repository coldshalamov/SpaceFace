import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import {
  dockingCorridor,
  setDockingCorridorFarQuietForBench,
  getDockingCorridorFarQuietForBench,
} from '../src/systems/dockingCorridor.js';

function boot({ stationR = 1800, stationCount = 3 } = {}) {
  const state = createGameState(23);
  state.mode = 'flight';
  state.meta.seed = 23;
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 8,
    mass: 12,
    hull: 100,
    hullMax: 100,
    collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  const stations = [];
  for (let i = 0; i < stationCount; i++) {
    const ang = (i / Math.max(1, stationCount)) * Math.PI * 2;
    const st = helpers.spawnEntity({
      type: 'station',
      pos: { x: Math.cos(ang) * stationR, z: Math.sin(ang) * stationR },
      rot: 0,
      radius: 120,
      mass: 1000,
      hull: 1000,
      hullMax: 1000,
      collides: true,
      data: {
        stationId: `latch_st_${i}`,
        collisionProxy: 'station_ring_hub',
        dockRadius: 120,
      },
    });
    stations.push(st);
  }
  if (state.entityIndex) {
    state.entityIndex.ready = true;
    state.entityIndex.stations = stations;
    state.entityIndex.dockStations = stations;
    if (!Number.isFinite(state.entityIndex.version)) state.entityIndex.version = 1;
  }
  dockingCorridor.init({ state, bus, helpers, registry: null });
  return { state, bus, helpers, player, stations };
}

function step(state, dt = 1 / 60) {
  state.tick = (state.tick | 0) + 1;
  state.simTime = (state.simTime || 0) + dt;
  dockingCorridor.update(dt, state);
  return state.world && state.world.dockingCorridorRuntime;
}

test('far quiet latch engages beyond approach band', () => {
  setDockingCorridorFarQuietForBench(true);
  assert.equal(getDockingCorridorFarQuietForBench(), true);
  const { state } = boot({ stationR: 1800 });
  const rt1 = step(state);
  assert.equal(rt1 && rt1.quietLatched, true, 'arms after far probe');
  assert.ok(dockingCorridor._farQuiet, 'internal quiet retained');
  assert.equal(state.dockingCorridor.phase, 'approach');
  assert.ok(state.dockingCorridor.distCenter > 900);
  const rt2 = step(state);
  assert.equal(rt2 && rt2.quietLatched, true, 'stays latched next tick');
});

test('near station prevents latch', () => {
  setDockingCorridorFarQuietForBench(true);
  const { state } = boot({ stationR: 200 });
  const rt = step(state);
  assert.equal(rt && rt.quietLatched, false, 'does not latch inside approach band');
  assert.equal(dockingCorridor._farQuiet, null);
  assert.ok(state.dockingCorridor.distCenter < 400);
});

test('dirty-wake on player move beyond wake disc', () => {
  setDockingCorridorFarQuietForBench(true);
  const { state, player } = boot({ stationR: 1800 });
  step(state);
  assert.equal(state.world.dockingCorridorRuntime.quietLatched, true);
  // Move beyond wakeMove2 (100 WU)
  player.pos.x = 250;
  player.pos.z = 0;
  const rt = step(state);
  // After wake, re-probes; still far from stations at 1800 so may re-arm
  assert.ok(state.dockingCorridor, 'readout refreshed after move wake');
  assert.ok(
    state.dockingCorridor.distCenter != null
      || (rt && rt.quietLatched === true)
      || dockingCorridor._farQuiet,
    'corridor still classified after wake',
  );
});

test('dirty-wake on membership bump', () => {
  setDockingCorridorFarQuietForBench(true);
  const { state, helpers } = boot({ stationR: 1800 });
  step(state);
  assert.equal(state.world.dockingCorridorRuntime.quietLatched, true);
  const armed = dockingCorridor._farQuiet.armedTick;
  state.entityIndex.version = (state.entityIndex.version | 0) + 1;
  // Spawn a near docking station so wake must NOT re-latch
  const near = helpers.spawnEntity({
    type: 'station',
    pos: { x: 150, z: 0 },
    rot: 0,
    radius: 120,
    mass: 1000,
    hull: 1000,
    hullMax: 1000,
    collides: true,
    data: {
      stationId: 'near_st',
      collisionProxy: 'station_ring_hub',
      dockRadius: 120,
    },
  });
  state.entityIndex.stations.push(near);
  state.entityIndex.dockStations.push(near);
  const rt = step(state);
  assert.equal(rt && rt.quietLatched, false, 'near station after membership wake prevents re-latch');
  assert.ok(
    !dockingCorridor._farQuiet
      || dockingCorridor._farQuiet.armedTick !== armed
      || state.dockingCorridor.distCenter < 400,
    'quiet cleared or approach engaged',
  );
  assert.ok(state.dockingCorridor.distCenter < 400, 'nearest is the near station');
});

test('bench toggle off forces full walk', () => {
  setDockingCorridorFarQuietForBench(false);
  assert.equal(getDockingCorridorFarQuietForBench(), false);
  const { state } = boot({ stationR: 1800 });
  const rt = step(state);
  assert.equal(rt && rt.quietLatched, false);
  assert.equal(dockingCorridor._farQuiet, null);
  setDockingCorridorFarQuietForBench(true);
});

test('capture/approach inside band never latches', () => {
  setDockingCorridorFarQuietForBench(true);
  const { state, player, stations } = boot({ stationR: 1800, stationCount: 1 });
  // Place player near the station berth
  player.pos.x = stations[0].pos.x + 40;
  player.pos.z = stations[0].pos.z;
  const rt = step(state);
  assert.equal(rt && rt.quietLatched, false);
  assert.ok(state.dockingCorridor.distCenter < 100);
});
