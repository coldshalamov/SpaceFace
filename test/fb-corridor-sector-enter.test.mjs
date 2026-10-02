// FB-134 — the corridor's far-quiet latch clears on the arrival event the world actually
// emits (`sector:enter`, emitted by systems/world.js on jump-in), not the plural
// `sector:entered` the bug subscription once waited on. Pin both directions so a renamed
// event fails loudly instead of letting the latch survive a sector jump.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import {
  dockingCorridor,
  setDockingCorridorFarQuietForBench,
} from '../src/systems/dockingCorridor.js';

function boot({ stationR = 1800 } = {}) {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.meta.seed = 4242;
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  const stations = [0, 1, 2].map((i) => {
    const ang = (i / 3) * Math.PI * 2;
    return helpers.spawnEntity({
      type: 'station',
      pos: { x: Math.cos(ang) * stationR, z: Math.sin(ang) * stationR },
      rot: 0, radius: 120, mass: 1000, hull: 1000, hullMax: 1000, collides: true,
      data: { stationId: `fb134_st_${i}`, collisionProxy: 'station_ring_hub', dockRadius: 120 },
    });
  });
  if (state.entityIndex) {
    state.entityIndex.ready = true;
    state.entityIndex.stations = stations;
    state.entityIndex.dockStations = stations;
    if (!Number.isFinite(state.entityIndex.version)) state.entityIndex.version = 1;
  }
  dockingCorridor.init({ state, bus, helpers, registry: null });
  return { state, bus };
}

function armLatch(state) {
  state.tick = (state.tick | 0) + 1;
  state.simTime = (state.simTime || 0) + 1 / 60;
  dockingCorridor.update(1 / 60, state);
  assert.ok(dockingCorridor._farQuiet, 'precondition: far quiet latched beyond the approach band');
  return dockingCorridor._farQuiet;
}

test('far quiet clears on sector:enter — the arrival event the world emits (FB-134)', () => {
  setDockingCorridorFarQuietForBench(true);
  try {
    const { state, bus } = boot({ stationR: 1800 });
    armLatch(state);
    // The reproduction: far-quiet survives a jump to Helios when the subscription waits on
    // a name nothing emits. The world emits 'sector:enter' (systems/world.js:988).
    bus.emit('sector:enter', { sectorId: 'sector_helios' });
    assert.equal(dockingCorridor._farQuiet, null,
      'arrival clears the far-quiet latch so the corridor wakes on the new sector');
  } finally {
    dockingCorridor.destroy();
  }
});

test('counterexample: a typoed plural does not clear the latch — the event name is pinned', () => {
  setDockingCorridorFarQuietForBench(true);
  try {
    const { state, bus } = boot({ stationR: 1800 });
    armLatch(state);
    bus.emit('sector:entered', { sectorId: 'sector_helios' });
    assert.ok(dockingCorridor._farQuiet,
      'the misspelled event name must NOT clear the latch — that was the FB-134 bug');
    // Other lifecycle boundaries still clear it.
    bus.emit('sector:exit', {});
    assert.equal(dockingCorridor._farQuiet, null, 'sector:exit still clears');
    armLatch(state);
    bus.emit('save:loaded', {});
    assert.equal(dockingCorridor._farQuiet, null, 'save:loaded still clears');
    armLatch(state);
    bus.emit('game:new', {});
    assert.equal(dockingCorridor._farQuiet, null, 'game:new still clears');
  } finally {
    dockingCorridor.destroy();
  }
});

test('corridor re-arms quiet in the new sector after the arrival clear', () => {
  setDockingCorridorFarQuietForBench(true);
  try {
    const { state, bus } = boot({ stationR: 1800 });
    armLatch(state);
    bus.emit('sector:enter', { sectorId: 'sector_helios' });
    assert.equal(dockingCorridor._farQuiet, null);
    // Next far tick re-latches — the clear is a boundary, not a permanent disable.
    state.tick += 1;
    state.simTime += 1 / 60;
    dockingCorridor.update(1 / 60, state);
    assert.equal(state.world.dockingCorridorRuntime.quietLatched, true,
      'far probe re-latches in the new sector');
  } finally {
    dockingCorridor.destroy();
  }
});
