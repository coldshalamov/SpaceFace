import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { beacons } from '../src/systems/beacons.js';

function bootBeacons({ credits = 1000 } = {}) {
  const state = createGameState(47);
  state.mode = 'flight';
  state.playerId = 1;
  state.player.credits = credits;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 12, z: -8 }, vel: { x: 0, z: 0 },
  };
  state.entities.set(1, player);
  state.entityList = [player];
  const bus = createBus();
  const charges = [];
  bus.on('economy:chargeCredits', (p) => charges.push(p));
  const system = Object.create(beacons);
  system.init({ state, bus, helpers: {} });
  return { state, bus, system, charges };
}

test('a claim beacon plants a record at the player and charges credits', () => {
  const { state, bus, system, charges } = bootBeacons();
  try {
    bus.emit('beacon:deploy');
    assert.equal(state.beacons.length, 1);
    assert.equal(state.beacons[0].alive, true);
    assert.equal(state.beacons[0].x, 12);
    assert.equal(state.beacons[0].z, -8);
    assert.equal(charges.length, 1);
    assert.equal(charges[0].amount, 250);
    assert.equal(charges[0].reason, 'claim_beacon');
  } finally {
    bus.clear();
  }
});

test('a broke pilot cannot plant a beacon', () => {
  const { state, bus, system } = bootBeacons({ credits: 10 });
  try {
    const ok = system.deploy();
    assert.equal(ok, false);
    assert.equal((state.beacons || []).length, 0);
  } finally {
    bus.clear();
  }
});
