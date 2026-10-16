import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { traffic } from '../src/systems/traffic.js';

const ID_FIELDS = [
  'disruptedStationIds',
  'passengerReceiptIds',
  'passengerLinerSuspendedIds',
  'passengerLinerInvalidatedIds',
];

function harness() {
  const state = createGameState(14920);
  const owner = Object.create(traffic);
  owner.init({ state, bus: createBus(), helpers: {} });
  return { state, owner };
}

test('repeated live traffic normalization keeps empty and populated ID arrays', () => {
  const { state, owner } = harness();
  for (const populated of [false, true]) {
    const arrays = new Map(ID_FIELDS.map(key => {
      const ids = populated ? [`${key}:b`, `${key}:a`] : [];
      state.traffic[key] = ids;
      return [key, ids];
    }));
    for (let i = 0; i < 20; i++) owner._ensureState();
    for (const [key, ids] of arrays) {
      assert.equal(state.traffic[key], ids, `${key} must not allocate on unchanged ticks`);
      assert.deepEqual(ids, populated ? [`${key}:b`, `${key}:a`] : []);
    }
  }
});

test('live normalization still repairs in-place edits and keeps first occurrence order', () => {
  const { state, owner } = harness();
  for (const key of ID_FIELDS) {
    state.traffic[key] = ['b', 'a'];
    owner._ensureState();
    // A reference-only memo would miss these same-array mutations.
    state.traffic[key].push('b', '', null, 9, 'c');
    owner._ensureState();
    assert.deepEqual(state.traffic[key], ['b', 'a', 'c']);
    state.traffic[key] = { invalid: true };
    owner._ensureState();
    assert.deepEqual(state.traffic[key], []);
  }
});

test('receipt caps retain the same newest unique IDs and disruption has no cap', () => {
  const { state, owner } = harness();
  const all = Array.from({ length: 30 }, (_, i) => `id:${i}`);
  for (const key of ID_FIELDS) state.traffic[key] = [...all, 'id:0'];
  owner._ensureState();
  assert.deepEqual(state.traffic.passengerReceiptIds, all.slice(-24));
  assert.deepEqual(state.traffic.passengerLinerSuspendedIds, all.slice(-4));
  assert.deepEqual(state.traffic.passengerLinerInvalidatedIds, all.slice(-8));
  assert.deepEqual(state.traffic.disruptedStationIds, all);
});

test('traffic save and load own their ID arrays across later live mutation', () => {
  const { state, owner } = harness();
  for (const key of ID_FIELDS) state.traffic[key] = [`${key}:initial`];
  const serialized = owner.serialize();
  for (const key of ID_FIELDS) {
    assert.notEqual(serialized[key], state.traffic[key]);
    state.traffic[key].push(`${key}:live`);
    assert.deepEqual(serialized[key], [`${key}:initial`]);
  }
  owner.deserialize(serialized);
  for (const key of ID_FIELDS) {
    assert.notEqual(state.traffic[key], serialized[key]);
    serialized[key].push(`${key}:save`);
    assert.deepEqual(state.traffic[key], [`${key}:initial`]);
  }
});
