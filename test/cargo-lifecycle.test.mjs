import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { cargo } from '../src/systems/cargo.js';

const COMMODITY_ID = 'cmdty_ore_iron';

function createHarness(playerId = 1) {
  const state = createGameState(31);
  state.playerId = playerId;
  return { state, bus: createBus(), helpers: {} };
}

function collect(harness, amount = 1) {
  const payload = {
    collectorId: harness.state.playerId,
    kind: 'ore',
    commodityId: COMMODITY_ID,
    amount,
  };
  harness.bus.emit('pickup:collected', payload);
  return payload;
}

function held(harness) {
  return harness.state.player.cargo.items[COMMODITY_ID] || 0;
}

test('cargo init is idempotent for one state and bus', () => {
  const harness = createHarness();
  const system = Object.create(cargo);
  try {
    system.init(harness);
    system.init(harness);
    const payload = collect(harness);

    assert.equal(held(harness), 1);
    assert.equal(payload.acceptedAmount, 1);
    assert.equal(payload.rejectedAmount, 0);
  } finally {
    system.destroy?.();
    harness.bus.clear();
  }
});

test('cargo destroy removes listeners and reinit restores one handler', () => {
  const harness = createHarness();
  const system = Object.create(cargo);
  try {
    system.init(harness);
    system.destroy();
    collect(harness);
    assert.equal(held(harness), 0, 'destroyed cargo must not consume pickups');

    system.init(harness);
    collect(harness);
    assert.equal(held(harness), 1);

    system.destroy();
    collect(harness);
    assert.equal(held(harness), 1, 'teardown must remain effective after reinit');
  } finally {
    system.destroy?.();
    harness.bus.clear();
  }
});

test('isolated cargo states emit only on their own buses', () => {
  const first = createHarness();
  const second = createHarness();
  const firstSystem = Object.create(cargo);
  const secondSystem = Object.create(cargo);
  const firstChanged = [];
  const secondChanged = [];
  first.bus.on('cargo:changed', (payload) => firstChanged.push(payload));
  second.bus.on('cargo:changed', (payload) => secondChanged.push(payload));

  try {
    firstSystem.init(first);
    secondSystem.init(second);
    firstChanged.length = 0;
    secondChanged.length = 0;
    collect(first);

    assert.equal(held(first), 1);
    assert.equal(held(second), 0);
    assert.equal(firstChanged.length, 1);
    assert.equal(secondChanged.length, 0, 'first state must not publish through second bus');
  } finally {
    firstSystem.destroy?.();
    secondSystem.destroy?.();
    first.bus.clear();
    second.bus.clear();
  }
});

test('reinitializing one cargo system detaches its previous state binding', () => {
  const first = createHarness();
  const second = createHarness();
  const system = Object.create(cargo);
  try {
    system.init(first);
    system.init(second);

    collect(first);
    assert.equal(held(first), 0, 'a rebound system must stop consuming the old state bus');
    collect(second);
    assert.equal(held(second), 1);
  } finally {
    system.destroy?.();
    first.bus.clear();
    second.bus.clear();
  }
});
