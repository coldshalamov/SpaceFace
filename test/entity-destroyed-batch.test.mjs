// The coalesced corpse receipt (burst fix): every flush() that delivered at least one
// queued entity:destroyed emits ONE entity:destroyedBatch — after the per-entity
// deliveries, same step — so observer-tier subscribers pay one dispatch per step instead
// of one per corpse. Identity-critical subscribers keep the per-entity receipts, which are
// unchanged in order, count and timing. Run:
//   node --test test/entity-destroyed-batch.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus, ENTITY_DESTROYED_BATCH_EVENT } from '../src/core/eventBus.js';

function corpse(id) {
  return { id, type: 'ship', pos: { x: id, z: -id }, radius: 7, factionId: null, entity: { id } };
}

test('a flushed corpse burst delivers every per-entity receipt, then one batch carrying them all', () => {
  const bus = createBus();
  const order = [];
  const batches = [];
  bus.on('entity:destroyed', (p) => order.push(`receipt:${p.id}`));
  bus.on(ENTITY_DESTROYED_BATCH_EVENT, (b) => {
    order.push('batch');
    batches.push(b);
  });
  for (const id of [7, 8, 9]) bus.queue('entity:destroyed', corpse(id));
  bus.queue('some:other', { n: 1 });
  bus.on('some:other', () => order.push('other'));
  bus.flush();
  assert.deepEqual(order, ['receipt:7', 'receipt:8', 'receipt:9', 'other', 'batch'],
    'the batch lands after every queued delivery inside the same flush');
  assert.equal(batches.length, 1, 'one coalesced event per flush, not one per corpse');
  assert.equal(batches[0].count, 3);
  assert.deepEqual(batches[0].receipts.map((p) => p.id), [7, 8, 9],
    'receipts keep queue order and identity payloads intact');
});

test('a flush with no destroyed receipts emits no batch', () => {
  const bus = createBus();
  let batches = 0;
  bus.on(ENTITY_DESTROYED_BATCH_EVENT, () => { batches += 1; });
  bus.queue('some:other', {});
  bus.flush();
  assert.equal(batches, 0);
});

test('each flush emits its own batch — queued receipts are not merged across steps', () => {
  const bus = createBus();
  const batches = [];
  bus.on(ENTITY_DESTROYED_BATCH_EVENT, (b) => batches.push(b.count));
  bus.queue('entity:destroyed', corpse(1));
  bus.flush();
  bus.queue('entity:destroyed', corpse(2));
  bus.queue('entity:destroyed', corpse(3));
  bus.flush();
  assert.deepEqual(batches, [1, 2]);
});

test('a direct (non-queued) entity:destroyed emit still reaches batch subscribers', () => {
  const bus = createBus();
  const order = [];
  bus.on('entity:destroyed', (p) => order.push(`receipt:${p.id}`));
  bus.on(ENTITY_DESTROYED_BATCH_EVENT, (b) => order.push(`batch:${b.count}:${b.receipts[0].id}`));
  // Teardown emitters bypass the deferred queue — the uniform corpse contract means a
  // batch subscriber must observe those corpses too.
  bus.emit('entity:destroyed', corpse(4));
  assert.deepEqual(order, ['receipt:4', 'batch:1:4']);
});

test('clear() mid-flush keeps pre-teardown corpses out of the batch', () => {
  const bus = createBus();
  const seen = [];
  bus.on(ENTITY_DESTROYED_BATCH_EVENT, (b) => seen.push(b.receipts.map((p) => p.id)));
  let cleared = false;
  bus.on('entity:destroyed', () => {
    if (!cleared) { cleared = true; bus.clear(); }
  });
  bus.queue('entity:destroyed', corpse(1));
  bus.queue('entity:destroyed', corpse(2));
  bus.flush();
  assert.deepEqual(seen, [], 'a teardown mid-flush invalidates the whole pre-clear corpse set');
});

test('a batch subscriber fault cannot interrupt delivery of the remaining per-entity receipts', () => {
  const bus = createBus();
  const order = [];
  bus.on(ENTITY_DESTROYED_BATCH_EVENT, () => { throw new Error('batch listener fault'); });
  bus.on('entity:destroyed', (p) => order.push(p.id));
  bus.queue('entity:destroyed', corpse(1));
  bus.queue('entity:destroyed', corpse(2));
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.doesNotThrow(() => bus.flush());
  } finally { console.error = originalError; }
  assert.deepEqual(order, [1, 2], 'per-entity delivery precedes and survives the batch');
});

// --- setPayloadRelease: the pooled-receipt contract's return trip -------------------------
// Core mints destroyed receipts from a pool; the bus hands each record back once its
// delivery (per-entity dispatch + batch fanout) completes. Foreign literals are ignored by
// the owner-side lease check, so only the lease proves reuse.

function makeReceiptPool() {
  const free = [];
  const leased = new Set();
  return {
    free, leased,
    acquire(id) { const p = free.pop() || { pos: { x: 0, z: 0 } }; p.id = id; leased.add(p); return p; },
    release(p) { if (!leased.delete(p)) return; free.push(p); },
  };
}

test('setPayloadRelease fires after the batch fanout, once per delivered receipt', () => {
  const bus = createBus();
  const pool = makeReceiptPool();
  bus.setPayloadRelease('entity:destroyed', pool.release);
  const order = [];
  bus.on('entity:destroyed', (p) => order.push(`receipt:${p.id}`));
  bus.on(ENTITY_DESTROYED_BATCH_EVENT, (b) => {
    order.push('batch');
    assert.equal(pool.leased.size, b.receipts.length,
      'batch dispatch still sees the live records — release cannot precede the fanout');
  });
  for (const id of [11, 12]) bus.queue('entity:destroyed', pool.acquire(id));
  bus.flush();
  assert.deepEqual(order, ['receipt:11', 'receipt:12', 'batch']);
  assert.equal(pool.leased.size, 0, 'every delivered receipt returned to the pool');
  assert.equal(pool.free.length, 2, 'released records are reusable');
});

test('the next burst mints the released records — pool reuse, not fresh allocation', () => {
  const bus = createBus();
  const pool = makeReceiptPool();
  bus.setPayloadRelease('entity:destroyed', pool.release);
  const first = pool.acquire(1);
  bus.queue('entity:destroyed', first);
  bus.flush();
  const second = pool.acquire(2);
  assert.equal(second, first, 'the same record object is leased to the next corpse');
  assert.equal(second.id, 2, 'refilled fields show the new corpse, not the last one');
});

test('a straddler queued mid-flush is released at the flush that delivers it, not earlier', () => {
  const bus = createBus();
  const pool = makeReceiptPool();
  bus.setPayloadRelease('entity:destroyed', pool.release);
  const straddler = pool.acquire(9);
  const seen = [];
  bus.on('entity:destroyed', (p) => {
    seen.push(p.id);
    if (p.id === 8) bus.queue('entity:destroyed', straddler);
  });
  bus.queue('entity:destroyed', pool.acquire(8));
  bus.flush();
  assert.deepEqual(seen, [8], 'the straddler waits for the next flush');
  assert.equal(pool.leased.size, 1, 'the undelivered straddler stays leased — never refilled pre-delivery');
  bus.flush();
  assert.deepEqual(seen, [8, 9]);
  assert.equal(pool.leased.size, 0, 'delivered straddler releases at its own flush');
});

test('clear() releases minted-but-undelivered receipts back to the pool', () => {
  const bus = createBus();
  const pool = makeReceiptPool();
  bus.setPayloadRelease('entity:destroyed', pool.release);
  bus.queue('entity:destroyed', pool.acquire(1));
  bus.queue('entity:destroyed', pool.acquire(2));
  bus.clear();
  assert.equal(pool.leased.size, 0, 'a teardown cannot leak leased records');
  assert.equal(pool.free.length, 2);
});

test('clear() mid-flush still releases every corpse the teardown invalidated', () => {
  const bus = createBus();
  const pool = makeReceiptPool();
  bus.setPayloadRelease('entity:destroyed', pool.release);
  let cleared = false;
  bus.on('entity:destroyed', () => {
    if (!cleared) { cleared = true; bus.clear(); }
  });
  for (const id of [1, 2, 3]) bus.queue('entity:destroyed', pool.acquire(id));
  bus.flush();
  assert.equal(pool.leased.size, 0, 'delivered and generation-dropped receipts both return');
  assert.equal(pool.free.length, 3);
});

test('a direct emit releases its receipt after the same-step batch', () => {
  const bus = createBus();
  const pool = makeReceiptPool();
  bus.setPayloadRelease('entity:destroyed', pool.release);
  const order = [];
  bus.on('entity:destroyed', () => order.push('receipt'));
  bus.on(ENTITY_DESTROYED_BATCH_EVENT, () => order.push('batch'));
  bus.emit('entity:destroyed', pool.acquire(5));
  assert.deepEqual(order, ['receipt', 'batch']);
  assert.equal(pool.leased.size, 0, 'direct delivery completes the lease inline');
  assert.equal(pool.free.length, 1);
});

test('a releaser ignores foreign literal receipts it did not lease', () => {
  const bus = createBus();
  const pool = makeReceiptPool();
  bus.setPayloadRelease('entity:destroyed', pool.release);
  // Teardown emitters mint their own literals — never pooled, never leased.
  bus.emit('entity:destroyed', { id: 99, reason: 'run_reset' });
  assert.equal(pool.leased.size, 0);
  assert.equal(pool.free.length, 0, 'foreign payloads pass through untouched');
});
