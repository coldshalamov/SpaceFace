import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { cloak } from '../src/systems/cloak.js';
import { FRESH_RUN_SYSTEMS } from '../src/core/runReset.js';

test('cloak is on the fresh-run reset list and newGame restores a full charge', () => {
  assert.equal(FRESH_RUN_SYSTEMS.includes('cloak'), true);
  assert.equal(FRESH_RUN_SYSTEMS.includes('titles'), true);
  assert.equal(FRESH_RUN_SYSTEMS.includes('fragileCargo'), true);

  const bus = createBus();
  const state = { massline2: { cloak: { available: true, active: true, energy: 0.12, radius: 900, baseRadius: 320 } } };
  const system = Object.assign({}, cloak);
  system.init({ state, bus });
  system.newGame();
  assert.equal(state.massline2.cloak.active, false);
  assert.equal(state.massline2.cloak.energy, 1);
  assert.equal(state.massline2.cloak.radius, 0);
});

test('game:new and game:newGame both reset leaked cloak charge', () => {
  const bus = createBus();
  const state = { massline2: { cloak: { available: true, active: true, energy: 0.04, radius: 700, baseRadius: 320 } } };
  const system = Object.assign({}, cloak);
  system.init({ state, bus });
  bus.emit('game:new', {});
  assert.equal(state.massline2.cloak.energy, 1);
  state.massline2.cloak.energy = 0.2;
  state.massline2.cloak.active = true;
  bus.emit('game:newGame', {});
  assert.equal(state.massline2.cloak.active, false);
  assert.equal(state.massline2.cloak.energy, 1);
});
