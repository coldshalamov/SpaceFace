import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { missions } from '../src/systems/missions.js';

function harness(expiresAtEpoch) {
  const state = createGameState(471);
  const bus = createBus();
  const events = [];
  for (const event of ['toast', 'mission:accepted', 'economy:chargeCredits', 'mission:updated']) {
    bus.on(event, payload => events.push({ event, payload }));
  }
  state.simTime = 1200;
  state.player.credits = 500;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40 };
  state.missions = { config: { refreshSec: 600, maxActive: 8 }, nextId: 1, active: [], boards: {
    station_helios: { refreshEpoch: 1, slots: [{
      id: 'old-freight', stationId: 'station_helios', type: 'cargo_delivery',
      title: 'A time sensitive manifest', params: { cmdtyId: 'cmdty_fuel_cells', qty: 8 },
      preloadedCargo: true, collateral_cr: 100, reward_cr: 300, expiresAtEpoch,
    }] },
  } };
  const owner = Object.create(missions);
  owner.state = state;
  owner.bus = bus;
  owner.helpers = {};
  owner._ensureMissionTargets = () => {};
  owner.trackMission = () => true;
  owner._emitMissionTargetProjection = () => {};
  owner._maybeSetBranch = () => {};
  owner._startLongReadObjective = () => {};
  owner._startWreckBoundStageObjective = () => {};
  return { state, owner, events };
}

test('an offer that expired while displayed cannot charge or load the player', () => {
  const { state, owner, events } = harness(2);
  assert.equal(owner.acceptMission('old-freight'), false);
  assert.equal(state.missions.active.length, 0);
  assert.deepEqual(state.player.cargo.items, {});
  assert.equal(state.player.credits, 500);
  assert.equal(state.missions.boards.station_helios.slots.length, 0);
  assert.equal(events.some(row => row.event === 'mission:accepted' || row.event === 'economy:chargeCredits'), false);
  assert.match(events.find(row => row.event === 'toast').payload.text, /expired/i);
});

test('unexpired and non-expiring authored offers still accept', () => {
  for (const expiry of [3, undefined]) {
    const { state, owner } = harness(expiry);
    assert.equal(owner.acceptMission('old-freight'), true);
    assert.equal(state.missions.active.length, 1);
    assert.equal(state.player.cargo.items.cmdty_fuel_cells, 8);
  }
});
