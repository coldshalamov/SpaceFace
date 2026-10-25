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
    // The compile-wait poll assumes a macrotask yield (scheduler.yield /
    // setTimeout(0) in the renderer); a microtask stub spins the poll forever
    // and starves this test's setImmediate release.
    yieldToMain: () => new Promise(resolve => setImmediate(resolve)), isActive: () => true,
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

test('priorityContext is derived once per pick and shared by every graded entry', async () => {
  let contextCalls = 0;
  const graded = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const queue = createLiveGeometryAdmissionQueue({
    yieldToMain: async () => {}, isActive: () => true,
    compile: async root => { if (root.id === 'first') await gate; },
    prepare: async () => ({ skipped: false }),
    onReady: () => {}, onError: error => { throw error; },
    priorityContext: () => { contextCalls += 1; return { pick: contextCalls }; },
    priorityOf: (entity, root, context) => { graded.push([entity.id, context]); return entity.priority; },
  });
  const first = queue.enqueue({ id: 'first', priority: 9, alive: true }, { id: 'first' });
  const a = queue.enqueue({ id: 'a', priority: 2, alive: true }, { id: 'a' });
  const b = queue.enqueue({ id: 'b', priority: 1, alive: true }, { id: 'b' });
  const c = queue.enqueue({ id: 'c', priority: 3, alive: true }, { id: 'c' });
  release();
  await Promise.all([first, a, b, c]);
  // Seven gradings over four ambient picks ('first', then three-, two- and
  // one-entry scans) must share one derived context per pick — a per-entry
  // derivation would mint a fresh object for every grading call.
  assert.equal(graded.length, 7);
  assert.ok(graded.every(([, context]) => context && Number.isFinite(context.pick)),
    'priorityOf receives the pick\'s context');
  assert.ok(graded[1][1] === graded[2][1] && graded[2][1] === graded[3][1],
    'the three-entry pick grades all of them with one context');
  assert.ok(graded[4][1] === graded[5][1], 'the two-entry pick shares its context');
  const distinctContexts = new Set(graded.map(([, context]) => context));
  assert.equal(distinctContexts.size, 4, 'one context object per grading pick');
  assert.ok(contextCalls >= distinctContexts.size,
    'context is derived once per pick — the urgent lane\'s empty scans count too');
  assert.equal(queue.stats().admitted, 4);
});

test('an entry that went inactive while queued is dropped at the pick, not at run time', async () => {
  const calls = [], graded = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const queue = createLiveGeometryAdmissionQueue({
    yieldToMain: async () => {}, isActive: entity => entity.alive !== false,
    compile: async root => { calls.push(`compile:${root.id}`); if (root.id === 'first') await gate; },
    prepare: async root => { calls.push(`upload:${root.id}`); return { skipped: false }; },
    onReady: () => {}, onError: error => { throw error; },
    priorityOf: entity => { graded.push(entity.id); return 1; },
  });
  const first = queue.enqueue({ id: 'first', alive: true }, { id: 'first' });
  const dead = { id: 'dead', alive: false };
  const deadAdmission = queue.enqueue(dead, { id: 'dead' });
  release();
  assert.deepEqual(await Promise.all([first, deadAdmission]), [true, false],
    'the dead entry\'s waiter still settles');
  assert.deepEqual(calls, ['compile:first', 'upload:first'],
    'a dropped entry never reaches compile or upload');
  assert.deepEqual(graded, ['first'],
    'the scan drops it before grading — it cannot win a pick');
  assert.equal(queue.stats().skipped, 1, 'the drop counts the same as an inactive bail');
  // The dedupe latch released with it, so a revived identity re-admits cleanly.
  dead.alive = true;
  const revived = queue.enqueue(dead, { id: 'dead2' });
  assert.equal(await revived, true);
});

test('failed uploads resolve false, retry per re-offer up to the budget, then dedupe until the cooldown reopens; interrupted roots re-enqueue', async () => {
  let attempts = 0;
  const queue = createLiveGeometryAdmissionQueue({
    yieldToMain: async () => {}, isActive: () => true,
    compile: async () => {},
    prepare: async () => { attempts += 1; throw new Error('upload failed'); },
    onReady: () => {}, onError: () => {},
  });
  const entity = { id: 'broken', alive: true };
  const root = { id: 'broken' };
  // Each re-offer buys one drain attempt until the retry budget (4) is spent.
  let last;
  for (let i = 1; i <= 4; i++) {
    last = queue.enqueue(entity, root);
    assert.equal(await last, false);
    assert.equal(attempts, i);
  }
  // Past the budget the latch dedupes: a re-offer returns the settled promise
  // and pays no upload attempt until the cooldown window reopens it.
  assert.equal(queue.enqueue(entity, root), last, 'a spent failure dedupes inside the cooldown');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(attempts, 4);

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
