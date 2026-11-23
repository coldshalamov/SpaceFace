// The coalesced spawn receipt — the entity:destroyedBatch pattern applied to the
// spawn lifecycle (sector-entry materialization used to fan ~75 entity:spawned
// emits into ~30 listeners each inside one task). entity:spawned stays
// synchronous: every individual receipt fires at emit time for identity-critical
// subscribers, and ONE entity:spawnedBatch carrying { receipts, count } lands
// when the collection window closes — the sim-step window (beginStep→endStep),
// an explicit beginSpawnedBatchWindow/endSpawnedBatchWindow pair (worker-reply
// replay), or a count:1 immediate batch when no window is open. Run:
//   node --test test/entity-spawned-batch.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus, ENTITY_SPAWNED_BATCH_EVENT, ENTITY_SPAWNED_EVENT } from '../src/core/eventBus.js';

function spawned(id, extra = {}) {
  return { id, type: 'ship', entity: { id }, ...extra };
}

test('a step-window spawn burst delivers every individual receipt at emit, then one batch at endStep', () => {
  const bus = createBus();
  const order = [];
  const batches = [];
  bus.on(ENTITY_SPAWNED_EVENT, (p) => order.push(`receipt:${p.id}`));
  bus.on(ENTITY_SPAWNED_BATCH_EVENT, (b) => {
    order.push('batch');
    batches.push(b);
  });
  bus.beginStep('player');
  for (const id of [7, 8, 9]) bus.emit(ENTITY_SPAWNED_EVENT, spawned(id));
  bus.endStep();
  assert.deepEqual(order, ['receipt:7', 'receipt:8', 'receipt:9', 'batch'],
    'individual spawns stay synchronous at emit; the batch lands at the window close');
  assert.equal(batches.length, 1, 'one coalesced event per window, not one per spawn');
  assert.equal(batches[0].count, 3);
  assert.deepEqual(batches[0].receipts.map((p) => p.id), [7, 8, 9],
    'receipts keep emit order and identity payloads intact');
});

test('a window with no spawns emits no batch', () => {
  const bus = createBus();
  let batches = 0;
  bus.on(ENTITY_SPAWNED_BATCH_EVENT, () => { batches += 1; });
  bus.beginStep();
  bus.emit('some:other', {});
  bus.endStep();
  assert.equal(batches, 0);
});

test('each step emits its own batch — receipts are not merged across windows', () => {
  const bus = createBus();
  const batches = [];
  bus.on(ENTITY_SPAWNED_BATCH_EVENT, (b) => batches.push(b.count));
  bus.beginStep();
  bus.emit(ENTITY_SPAWNED_EVENT, spawned(1));
  bus.endStep();
  bus.beginStep();
  bus.emit(ENTITY_SPAWNED_EVENT, spawned(2));
  bus.emit(ENTITY_SPAWNED_EVENT, spawned(3));
  bus.endStep();
  assert.deepEqual(batches, [1, 2]);
});

test('a direct emit outside any window still reaches batch subscribers', () => {
  const bus = createBus();
  const order = [];
  bus.on(ENTITY_SPAWNED_EVENT, (p) => order.push(`receipt:${p.id}`));
  bus.on(ENTITY_SPAWNED_BATCH_EVENT, (b) => order.push(`batch:${b.count}:${b.receipts[0].id}`));
  // Boot/restore materialization and test emitters run outside step windows —
  // the uniform contract keeps batch subscribers whole there too.
  bus.emit(ENTITY_SPAWNED_EVENT, spawned(4));
  assert.deepEqual(order, ['receipt:4', 'batch:1:4']);
});

test('explicit windows nest: only the outermost close dispatches', () => {
  const bus = createBus();
  const batches = [];
  bus.on(ENTITY_SPAWNED_BATCH_EVENT, (b) => batches.push(b.count));
  bus.beginSpawnedBatchWindow();           // e.g. a reply replay pass
  bus.emit(ENTITY_SPAWNED_EVENT, spawned(1));
  bus.beginStep('player');                 // a step nested inside the reply
  bus.emit(ENTITY_SPAWNED_EVENT, spawned(2));
  bus.endStep();                           // inner close — still collecting
  bus.emit(ENTITY_SPAWNED_EVENT, spawned(3));
  bus.endSpawnedBatchWindow();             // outer close — one batch for all
  assert.deepEqual(batches, [3]);
});

test('clear() mid-window keeps pre-teardown receipts out of the batch', () => {
  const bus = createBus();
  const seen = [];
  bus.on(ENTITY_SPAWNED_BATCH_EVENT, (b) => seen.push(b.receipts.map((p) => p.id)));
  let cleared = false;
  bus.on(ENTITY_SPAWNED_EVENT, () => {
    if (!cleared) { cleared = true; bus.clear(); }
  });
  bus.beginStep();
  bus.emit(ENTITY_SPAWNED_EVENT, spawned(1));
  bus.emit(ENTITY_SPAWNED_EVENT, spawned(2));
  bus.endStep();
  assert.deepEqual(seen, [], 'a teardown inside the window invalidates its pending batch');
});

test('latest-wins: a spawn destroyed inside the same window drops out of the batch', () => {
  const bus = createBus();
  const batches = [];
  const corpses = [];
  bus.on(ENTITY_SPAWNED_BATCH_EVENT, (b) => batches.push(b.receipts.map((p) => p.id)));
  bus.on('entity:destroyedBatch', (b) => corpses.push(b.receipts.map((p) => p.id)));
  bus.beginStep();
  bus.emit(ENTITY_SPAWNED_EVENT, spawned(7));
  bus.emit(ENTITY_SPAWNED_EVENT, spawned(8));
  // Queued destroys flush inside the sweep, before the window closes.
  bus.queue('entity:destroyed', { id: 7, type: 'ship' });
  bus.flush();
  bus.endStep();
  assert.deepEqual(batches, [[8]],
    'the corpse supersedes its same-window spawn receipt — batch consumers read the live map');
  assert.deepEqual(corpses, [[7]], 'the destroy still reports through destroyedBatch');
});

test('latest-wins: a direct (non-queued) destroy also supersedes a same-window spawn', () => {
  const bus = createBus();
  const batches = [];
  bus.on(ENTITY_SPAWNED_BATCH_EVENT, (b) => batches.push(b.receipts.map((p) => p.id)));
  bus.beginStep();
  bus.emit(ENTITY_SPAWNED_EVENT, spawned(7));
  bus.emit('entity:destroyed', { id: 7, type: 'ship' }); // teardown emitters bypass the queue
  bus.endStep();
  assert.deepEqual(batches, [],
    'every spawn receipt superseded → no batch at all (a count:0 batch is noise)');
});

test('latest-wins: destroy before a same-id re-spawn keeps the newest spawn receipt', () => {
  const bus = createBus();
  const batches = [];
  bus.on(ENTITY_SPAWNED_BATCH_EVENT, (b) => batches.push(b.receipts.map((p) => p.tag)));
  bus.beginStep();
  bus.emit(ENTITY_SPAWNED_EVENT, spawned(7, { tag: 'first' }));
  bus.emit('entity:destroyed', { id: 7, type: 'ship' });
  // The id recycles inside the same window — the live occupant is the newest spawn.
  bus.emit(ENTITY_SPAWNED_EVENT, spawned(7, { tag: 'second' }));
  bus.endStep();
  assert.deepEqual(batches, [['second']],
    'the batch carries the current occupant of the recycled id, not the dead first spawn');
});

test('a spawn queued through bus.queue still batches at the flush (defensive contract)', () => {
  const bus = createBus();
  const order = [];
  bus.on(ENTITY_SPAWNED_EVENT, (p) => order.push(`receipt:${p.id}`));
  bus.on(ENTITY_SPAWNED_BATCH_EVENT, (b) => order.push(`batch:${b.count}`));
  // Nothing queues entity:spawned today — the contract is synchronous — but a
  // queue() caller gets the same batch semantics the destroyed channel enjoys.
  bus.queue(ENTITY_SPAWNED_EVENT, spawned(1));
  bus.queue(ENTITY_SPAWNED_EVENT, spawned(2));
  bus.flush();
  assert.deepEqual(order, ['receipt:1', 'receipt:2', 'batch:2']);
});

test('a batch subscriber fault cannot interrupt the next window or the queue', () => {
  const bus = createBus();
  const seen = [];
  bus.on(ENTITY_SPAWNED_BATCH_EVENT, () => { throw new Error('batch listener fault'); });
  bus.on(ENTITY_SPAWNED_EVENT, (p) => seen.push(p.id));
  const originalError = console.error;
  console.error = () => {};
  try {
    bus.beginStep();
    assert.doesNotThrow(() => bus.emit(ENTITY_SPAWNED_EVENT, spawned(1)));
    assert.doesNotThrow(() => bus.endStep());
    assert.doesNotThrow(() => bus.emit(ENTITY_SPAWNED_EVENT, spawned(2)));
  } finally { console.error = originalError; }
  assert.deepEqual(seen, [1, 2], 'individual delivery precedes and survives the batch');
});

test('spawns emitted while endStep drains leftovers still join the closing batch', () => {
  const bus = createBus();
  const order = [];
  bus.on(ENTITY_SPAWNED_EVENT, (p) => order.push(`receipt:${p.id}`));
  bus.on(ENTITY_SPAWNED_BATCH_EVENT, () => order.push('batch'));
  // A step-deferred emit whose listener spawns mid-drain must not strand that
  // receipt — the batch point is the very end of the window.
  bus.on('audio:cue', () => bus.emit(ENTITY_SPAWNED_EVENT, spawned(9)));
  bus.beginStep();
  bus.emit('audio:cue', { kind: 'nonplayer' });
  bus.endStep();
  assert.deepEqual(order, ['receipt:9', 'batch']);
});

// --- setPayloadRelease: the pooled-receipt contract's return trip -------------------------
// Spawn receipts minted from an owner pool are handed back once delivery (per-entity
// dispatch + batch fanout) completes — the same lease rule destroyedBatch already proves.

function makeReceiptPool() {
  const free = [];
  const leased = new Set();
  return {
    free, leased,
    acquire(id) { const p = { id }; leased.add(p); return p; },
    release(p) { if (!leased.delete(p)) return; free.push(p); },
  };
}

test('setPayloadRelease fires after the batch fanout, once per delivered receipt', () => {
  const bus = createBus();
  const pool = makeReceiptPool();
  bus.setPayloadRelease(ENTITY_SPAWNED_EVENT, pool.release);
  const order = [];
  bus.on(ENTITY_SPAWNED_EVENT, (p) => order.push(`receipt:${p.id}`));
  bus.on(ENTITY_SPAWNED_BATCH_EVENT, (b) => {
    order.push('batch');
    assert.equal(pool.leased.size, b.receipts.length,
      'batch dispatch still sees the live records — release cannot precede the fanout');
  });
  bus.beginStep();
  bus.emit(ENTITY_SPAWNED_EVENT, pool.acquire(11));
  bus.emit(ENTITY_SPAWNED_EVENT, pool.acquire(12));
  bus.endStep();
  assert.deepEqual(order, ['receipt:11', 'receipt:12', 'batch']);
  assert.equal(pool.leased.size, 0, 'every delivered receipt returned to the pool');
  assert.equal(pool.free.length, 2, 'released records are reusable');
});

test('clear() releases window receipts that were collected but never batched', () => {
  const bus = createBus();
  const pool = makeReceiptPool();
  bus.setPayloadRelease(ENTITY_SPAWNED_EVENT, pool.release);
  bus.beginStep();
  bus.emit(ENTITY_SPAWNED_EVENT, pool.acquire(1));
  bus.emit(ENTITY_SPAWNED_EVENT, pool.acquire(2));
  bus.clear();
  assert.equal(pool.leased.size, 0, 'a teardown cannot leak leased window receipts');
  assert.equal(pool.free.length, 2);
});

test('a direct emit outside a window releases its receipt after the count:1 batch', () => {
  const bus = createBus();
  const pool = makeReceiptPool();
  bus.setPayloadRelease(ENTITY_SPAWNED_EVENT, pool.release);
  const order = [];
  bus.on(ENTITY_SPAWNED_EVENT, () => order.push('receipt'));
  bus.on(ENTITY_SPAWNED_BATCH_EVENT, () => order.push('batch'));
  bus.emit(ENTITY_SPAWNED_EVENT, pool.acquire(5));
  assert.deepEqual(order, ['receipt', 'batch']);
  assert.equal(pool.leased.size, 0, 'direct delivery completes the lease inline');
  assert.equal(pool.free.length, 1);
});

test('a releaser ignores foreign literal receipts it did not lease', () => {
  const bus = createBus();
  const pool = makeReceiptPool();
  bus.setPayloadRelease(ENTITY_SPAWNED_EVENT, pool.release);
  bus.beginStep();
  bus.emit(ENTITY_SPAWNED_EVENT, spawned(99));
  bus.endStep();
  assert.equal(pool.leased.size, 0);
  assert.equal(pool.free.length, 0, 'foreign payloads pass through untouched');
});
