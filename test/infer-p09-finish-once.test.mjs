// SFQ-I031 — docking a delivery pays the reward once, including a re-dock after save.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { missions } from '../src/systems/missions.js';
import { addCargo } from '../src/systems/cargo.js';

const DEST = 'station_tycho';
const REWARD = 400;

function harness() {
  const state = createGameState(4242);
  const bus = createBus();
  const rewards = [];
  bus.on('economy:grantCredits', (payload) => {
    const reason = String(payload && payload.reason || '');
    if (!reason.startsWith('mission:')) return;
    rewards.push(payload.amount);
    state.player.credits += payload.amount;
  });
  state.player.credits = 1000;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, richLots: [] };
  state.simTime = 100;
  state.missions.active = [{
    id: 'm-4242',
    status: 'active',
    type: 'cargo_delivery',
    title: 'Iron to Tycho',
    stationId: 'station_helios',
    destStationId: DEST,
    reward_cr: REWARD,
    collateral_cr: 100,
    preloadedCargo: true,
    params: {
      cmdtyId: 'cmdty_ore_iron',
      qty: 4,
      sealedRemaining: 4,
      sealedDelivered: 0,
      sealAccounted: true,
    },
    objectiveProgress: 0,
    objectiveTarget: 1,
  }];
  addCargo(state, 'cmdty_ore_iron', 4);
  const owner = Object.create(missions);
  owner.state = state;
  owner.bus = bus;
  owner.helpers = {};
  bus.on('dock:docked', (payload) => owner._onDockedObjectives(payload && payload.stationId));
  return { state, bus, owner, rewards };
}

test('a delivery dock pays the reward once, and a reload does not pay it again', () => {
  const { state, bus, owner, rewards } = harness();
  const start = state.player.credits;
  bus.emit('dock:docked', { stationId: DEST });
  bus.emit('dock:docked', { stationId: DEST });
  assert.deepEqual(rewards, [REWARD]);
  assert.equal(state.player.credits, start + REWARD);
  assert.equal(state.missions.active.length, 0);

  const saved = owner.serialize();
  const restored = createGameState(4242);
  restored.player.credits = state.player.credits;
  const owner2 = Object.create(missions);
  owner2.state = restored;
  owner2.bus = bus;
  owner2.helpers = {};
  owner2.deserialize(saved);
  owner2._onDockedObjectives(DEST);
  bus.emit('dock:docked', { stationId: DEST });

  assert.deepEqual(rewards, [REWARD]);
  assert.equal(state.player.credits, start + REWARD);
  assert.equal(restored.missions.active.length, 0);
});
