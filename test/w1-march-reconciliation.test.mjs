// W1 — Provost March's reconciliation counter has a writer (the last frozen depth counter).
// Deed: an aftermath wreck recovery completing (`aftermathWreck:completed`) bumps
// `march.reconciliation` once per wreck (deduped by wreck/marker receipt), clamped by the def.
// Run: node --test test/w1-march-reconciliation.test.mjs

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { createGameState } from '../src/core/gameState.js';
import { stationContacts } from '../src/systems/stationContacts.js';
import { stationContactCounterValue, CONTACT_COUNTER_DEFS } from '../src/data/stationContacts.js';

function boot() {
  const state = createGameState(47);
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers });
  core.preStep(1 / 60, state);
  return { state, bus };
}

test('March files a dragged-home wreck exactly once', () => {
  const { state, bus } = boot();
  const contacts = { ...stationContacts };
  contacts.init({ state, bus, helpers: {} });

  assert.equal(stationContactCounterValue(state, 'march.reconciliation'), 0, 'counter starts at 0');

  bus.emit('aftermathWreck:completed', { markerId: 'mk_1', wreckId: 'wreck_a', sectorId: 'sector_helios_prime' });
  assert.equal(stationContactCounterValue(state, 'march.reconciliation'), 1, 'one wreck filed');

  // The same wreck re-reported does not file twice (dedup by receipt).
  bus.emit('aftermathWreck:completed', { markerId: 'mk_1', wreckId: 'wreck_a', sectorId: 'sector_helios_prime' });
  assert.equal(stationContactCounterValue(state, 'march.reconciliation'), 1, 'same wreck deduped');

  // A different wreck files again.
  bus.emit('aftermathWreck:completed', { markerId: 'mk_2', wreckId: 'wreck_b', sectorId: 'sector_ceres_belt' });
  assert.equal(stationContactCounterValue(state, 'march.reconciliation'), 2, 'second wreck filed');
});

test('March counter clamps at its def bound and survives a payload without ids', () => {
  const { state, bus } = boot();
  const contacts = { ...stationContacts };
  contacts.init({ state, bus, helpers: {} });

  bus.emit('aftermathWreck:completed', { sectorId: 'sector_helios_prime' });
  assert.equal(stationContactCounterValue(state, 'march.reconciliation'), 0, 'no id, no deed');

  const def = CONTACT_COUNTER_DEFS['march.reconciliation'];
  const cap = def.max;
  for (let i = 0; i < cap + 3; i++) {
    bus.emit('aftermathWreck:completed', { markerId: `mk_${i}`, wreckId: `wreck_${i}`, sectorId: 'sector_ceres_belt' });
  }
  assert.equal(stationContactCounterValue(state, 'march.reconciliation'), cap, 'counter clamps at def max');
});
