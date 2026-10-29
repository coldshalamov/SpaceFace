import test from 'node:test';
import assert from 'node:assert/strict';
import { palletJack } from '../src/systems/palletJack.js';

test('player jettison wakes the Pallet Jack scan instead of waiting out the five-second retry cadence', () => {
  const listeners = new Map();
  const bus = {
    on(name, fn) {
      const rows = listeners.get(name) || new Set(); rows.add(fn); listeners.set(name, rows);
      return () => rows.delete(fn);
    },
    emit(name, payload) { for (const fn of listeners.get(name) || []) fn(payload); },
  };
  const state = { mode: 'flight', simTime: 100, tick: 6000, playerId: 1,
    entities: new Map([[1, { id: 1, alive: true }]]), world: { currentSectorId: 'sector_ceres_belt' }, ui: {} };
  const owner = Object.create(palletJack);
  owner.init({ state, bus, helpers: {}, registry: { get: () => null } });
  owner._nextRequest = 104;
  bus.emit('cargo:jettisoned', { commodityId: 'cmdty_electronics', amount: 1 });
  assert.equal(owner._nextRequest, 100);
  owner.destroy();
});
