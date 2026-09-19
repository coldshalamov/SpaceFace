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

test('pending roots drain nearest-deadline-first when priorityOf grades them', async () => {
  const calls = [], ready = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const queue = createLiveGeometryAdmissionQueue({
    yieldToMain: async () => {}, isActive: () => true,
    compile: async root => { calls.push(`compile:${root.id}`); if (root.id === 'far') await gate; },
    prepare: async root => { calls.push(`upload:${root.id}`); return { skipped: false }; },
    onReady: entity => ready.push(entity.id), onError: error => { throw error; },
    priorityOf: entity => entity.priority,
  });
  const far = queue.enqueue({ id: 'far', priority: 10, alive: true }, { id: 'far' });
  const near = queue.enqueue({ id: 'near', priority: 1, alive: true }, { id: 'near' });
  const mid = queue.enqueue({ id: 'mid', priority: 5, alive: true }, { id: 'mid' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['compile:far'], 'in-flight admission still owns the serial slot');
  release();
  assert.deepEqual(await Promise.all([far, near, mid]), [true, true, true]);
  assert.deepEqual(calls, [
    'compile:far', 'upload:far',
    'compile:near', 'upload:near',
    'compile:mid', 'upload:mid',
  ]);
  assert.deepEqual(ready, ['far', 'near', 'mid'], 'pending order is by deadline, not enqueue order');
});

test('priority is re-evaluated per pick so a moved entity keeps its new deadline', async () => {
  const ready = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const approaching = { id: 'approaching', priority: 9, alive: true };
  const queue = createLiveGeometryAdmissionQueue({
    yieldToMain: async () => {}, isActive: () => true,
    compile: async root => { if (root.id === 'first') await gate; },
    prepare: async () => ({ skipped: false }),
    onReady: entity => ready.push(entity.id), onError: error => { throw error; },
    priorityOf: entity => entity.priority,
  });
  const first = queue.enqueue({ id: 'first', priority: 0, alive: true }, { id: 'first' });
  const mover = queue.enqueue(approaching, { id: 'approaching' });
  const dweller = queue.enqueue({ id: 'dweller', priority: 5, alive: true }, { id: 'dweller' });
  approaching.priority = 1; // crossed the runway while the first admission was in flight
  release();
  await Promise.all([first, mover, dweller]);
  assert.deepEqual(ready, ['first', 'approaching', 'dweller']);
});

test('failed uploads resolve false without a retry loop; interrupted roots re-enqueue', async () => {
  let attempts = 0;
  const queue = createLiveGeometryAdmissionQueue({
    yieldToMain: async () => {}, isActive: () => true,
    compile: async () => {},
    prepare: async () => { attempts += 1; throw new Error('upload failed'); },
    onReady: () => {}, onError: () => {},
  });
  const entity = { id: 'broken', alive: true };
  const root = { id: 'broken' };
  const first = queue.enqueue(entity, root);
  assert.equal(await first, false);
  assert.equal(attempts, 1);
  assert.equal(queue.enqueue(entity, root), first, 'a settled failure is not silently retried');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(attempts, 1);

  // Inactive-at-drain roots leave the map so the next live frame can re-admit them.
  const sleepy = { id: 'sleepy', alive: false };
  const queue2 = createLiveGeometryAdmissionQueue({
    yieldToMain: async () => {}, isActive: entity => entity.alive,
    compile: async () => {}, prepare: async () => ({ skipped: false }),
    onReady: () => {}, onError: () => {},
  });
  const interrupted = queue2.enqueue(sleepy, { id: 'sleepy' });
  assert.equal(await interrupted, false);
  sleepy.alive = true;
  const retried = queue2.enqueue(sleepy, { id: 'sleepy2' });
  assert.notEqual(retried, interrupted, 'interrupted admission re-enqueues');
  assert.equal(await retried, true);
});
