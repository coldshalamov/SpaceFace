import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveGeometryAdmissionQueue } from '../src/render/liveGeometryAdmission.js';

test('late rocks upload serially, become ready only after upload, and reject retired identities', async () => {
  const calls = [], ready = [];
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  const a = { id: 1, alive: true }, b = { id: 2, alive: true }, c = { id: 3, alive: false };
  const roots = [a, b, c].map(entity => ({ id: entity.id }));
  const queue = createLiveGeometryAdmissionQueue({
    yieldToMain: async () => {}, isActive: entity => entity.alive,
    compile: async root => { calls.push(`compile:${root.id}`); },
    prepare: async root => { calls.push(`upload:${root.id}`); if (root.id === 1) await hold; return { skipped: false }; },
    onReady: entity => ready.push(entity.id), onError: error => { throw error; },
  });
  const first = queue.enqueue(a, roots[0]);
  assert.equal(queue.enqueue(a, roots[0]), first, 'one admission per root');
  const second = queue.enqueue(b, roots[1]);
  const retired = queue.enqueue(c, roots[2]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['compile:1', 'upload:1']);
  assert.deepEqual(ready, [], 'pending geometry stays hidden');
  release();
  assert.deepEqual(await Promise.all([first, second, retired]), [true, true, false]);
  assert.deepEqual(calls, ['compile:1', 'upload:1', 'compile:2', 'upload:2']);
  assert.deepEqual(ready, [1, 2]);
});
