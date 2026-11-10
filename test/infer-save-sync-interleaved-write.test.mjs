import test from 'node:test';
import assert from 'node:assert/strict';
import { applySharedStoreKeysChunked } from '../src/save/sharedPlayerStore.js';

const save = (stamp) => JSON.stringify({ savedAt: `2026-10-13T00:00:${stamp}.000Z`, data: {} });
function storage(keys) {
  const values = new Map(Object.entries(keys));
  return { get length() { return values.size; }, key: n => [...values.keys()][n],
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key) };
}
function corpus() {
  const keys = {};
  for (let i = 0; i < 8; i++) keys[`sf.save.${i}`] = save('01');
  keys['sf.save.quick'] = save('01');
  return keys;
}

test('boot reconciliation preserves a newer local save written during a chunk yield', async () => {
  const baseKeys = corpus();
  const merged = { ...baseKeys, 'sf.save.quick': save('02') };
  const store = storage(baseKeys);
  await applySharedStoreKeysChunked(merged, store, { baseKeys, yieldQueue: async () => {
    store.setItem('sf.save.quick', save('03'));
  } });
  assert.equal(store.getItem('sf.save.quick'), save('03'));
});

test('a local delete while reconciling cannot be resurrected by captured remote bytes', async () => {
  const baseKeys = corpus();
  const store = storage(baseKeys);
  await applySharedStoreKeysChunked(baseKeys, store, { baseKeys, yieldQueue: async () => {
    store.removeItem('sf.save.quick');
  } });
  assert.equal(store.getItem('sf.save.quick'), null);
});

test('unchanged local saves still receive the fresher remote copy', async () => {
  const baseKeys = { 'sf.save.quick': save('01') };
  const store = storage(baseKeys);
  assert.equal(await applySharedStoreKeysChunked({ 'sf.save.quick': save('02') }, store, { baseKeys }), 1);
  assert.equal(store.getItem('sf.save.quick'), save('02'));
});

test('a fresh deletion tombstone also covers a remote slot absent at local capture', async () => {
  const baseKeys = corpus();
  delete baseKeys['sf.save.quick'];
  const store = storage(baseKeys);
  await applySharedStoreKeysChunked({ ...baseKeys, 'sf.save.quick': save('02') }, store, {
    baseKeys, yieldQueue: async () => {
      store.setItem('sf.save.deleted.quick', JSON.stringify({ deletedAt: '2026-10-13T00:00:03.000Z' }));
    },
  });
  assert.equal(store.getItem('sf.save.quick'), null);
});
