import assert from 'node:assert/strict';
import test from 'node:test';

import { core } from '../src/core/coreSystem.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';

test('reinitializing core does not duplicate entity command listeners', () => {
  const state = createGameState(41);
  const bus = createBus();
  const helpers = {};
  try {
    core.init({ state, bus, helpers });
    core.init({ state, bus, helpers });

    bus.emit('entity:spawnRequest', { spec: asteroidSpec() });
    assert.equal(state.entityList.length, 1);
  } finally {
    core.destroy();
    bus.clear();
  }
});

test('destroying core detaches entity command listeners', () => {
  const state = createGameState(42);
  const bus = createBus();
  const helpers = {};
  try {
    core.init({ state, bus, helpers });
    core.destroy();

    bus.emit('entity:spawnRequest', { spec: asteroidSpec() });
    assert.equal(state.entityList.length, 0);
  } finally {
    core.destroy();
    bus.clear();
  }
});

function asteroidSpec() {
  return {
    type: 'asteroid',
    pos: { x: 0, z: 0 },
    data: {},
  };
}
