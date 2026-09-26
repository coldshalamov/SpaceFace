// Adversarial contract for the shared event bus (ARCHITECTURE §4). Every system and screen
// routes through this one module, so its edge behavior is load-bearing: duplicate/unsubscribe
// during dispatch, listener faults, re-entrant queue and drain, sliced sector:enter delivery
// under the presentation runner's budgets, and teardown mid-slice. Run:
//   node --test test/event-bus-contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus, SECTOR_ENTER_LISTENER_BUDGET, SECTOR_ENTER_DRAIN_BUDGET } from '../src/core/eventBus.js';

test('duplicate on() of the same listener delivers once and a single off() removes it', () => {
  const bus = createBus();
  const seen = [];
  const fn = (p) => seen.push(p);
  bus.on('e', fn);
  bus.on('e', fn);
  bus.emit('e', 'a');
  assert.deepEqual(seen, ['a'], 'a Set-backed registry dedupes identical listeners');
  bus.off('e', fn);
  bus.emit('e', 'b');
  assert.equal(seen.length, 1, 'one off() clears the duplicated registration');
});

test('off() during dispatch follows snapshot semantics: current emit completes, the next does not see it', () => {
  const bus = createBus();
  const seen = [];
  let offB;
  bus.on('e', () => { seen.push('a'); offB(); });
  bus.on('e', () => seen.push('b'));
  offB = bus.on('e', () => seen.push('never'));
  bus.emit('e');
  assert.deepEqual(seen, ['a', 'b', 'never'], 'the in-flight emit keeps its captured listener set: off() mid-dispatch does not retract a pending delivery');
  bus.emit('e');
  assert.deepEqual(seen, ['a', 'b', 'never', 'a', 'b'], 'the removed listener is gone from the next emit');
});

test('one listener fault never starves the rest of the dispatch', () => {
  const bus = createBus();
  const seen = [];
  bus.on('e', () => { throw new Error('listener fault'); });
  bus.on('e', () => seen.push('after-fault'));
  assert.doesNotThrow(() => bus.emit('e'));
  assert.deepEqual(seen, ['after-fault']);
});

test('once() fires exactly once even when the payload handler re-emits', () => {
  const bus = createBus();
  const seen = [];
  bus.once('e', (p) => { seen.push(p); if (seen.length < 5) bus.emit('e', 'again'); });
  bus.emit('e', 'first');
  assert.deepEqual(seen, ['first'], 'the re-entrant emit sees no listener: it already ran once');
});

test('queue() defers past the current emit and flush() delivers in queue order', () => {
  const bus = createBus();
  const seen = [];
  bus.on('direct', () => seen.push('direct'));
  bus.on('deferred', (p) => seen.push(`deferred:${p}`));
  bus.emit('direct');
  bus.queue('deferred', 1);
  bus.queue('deferred', 2);
  assert.deepEqual(seen, ['direct'], 'queued events do not jump the queue during the same emit');
  bus.flush();
  assert.deepEqual(seen, ['direct', 'deferred:1', 'deferred:2'], 'flush preserves queue order');
  bus.flush();
  assert.equal(seen.length, 3, 'flush is idempotent when the queue is empty');
});

test('an event queued during flush() waits for the next flush, never the same batch', () => {
  const bus = createBus();
  const seen = [];
  bus.on('chain', (p) => { if (p < 4) { seen.push(p); bus.queue('chain', p + 1); } });
  bus.queue('chain', 1);
  bus.flush();
  assert.deepEqual(seen, [1], 'the chained item lands after this batch drains');
  bus.flush();
  assert.deepEqual(seen, [1, 2], 'one link per flush: the deferred queue never starves a step');
  bus.flush();
  assert.deepEqual(seen, [1, 2, 3]);
});
test('sliced sector:enter delivers the first budget inline and the rest across drains', () => {
  const bus = createBus();
  const seen = [];
  bus.setEmitSliceBudget('sector:enter', 2);
  for (let i = 0; i < 5; i++) bus.on('sector:enter', () => seen.push(i));
  bus.emit('sector:enter');
  assert.deepEqual(seen, [0, 1], 'the inline slice ran exactly the budget');
  assert.equal(bus.pendingEmitSliceCount(), 3, 'the rest are pending');
  bus.drainEmitSlice(2);
  assert.deepEqual(seen, [0, 1, 2, 3], 'drain takes its own budget');
  bus.drainEmitSlice(SECTOR_ENTER_DRAIN_BUDGET);
  assert.deepEqual(seen, [0, 1, 2, 3, 4], 'the final drain clears the slice');
  assert.equal(bus.pendingEmitSliceCount(), 0);
});

test('a listener unsubscribing a LATER slice listener mid-drain still receives its own in-flight slice', () => {
  const bus = createBus();
  const seen = [];
  bus.setEmitSliceBudget('sector:enter', 1);
  bus.on('sector:enter', () => seen.push('a'));
  bus.on('sector:enter', () => seen.push('b'));
  bus.emit('sector:enter');
  assert.deepEqual(seen, ['a'], 'only the first slice ran');
  bus.drainEmitSlice(1);
  assert.deepEqual(seen, ['a', 'b']);
});

test('clear() mid-slice aborts the pending slice: no listener runs after teardown', () => {
  const bus = createBus();
  const seen = [];
  bus.setEmitSliceBudget('sector:enter', 2);
  bus.on('sector:enter', () => seen.push('x'));
  bus.on('sector:enter', () => { seen.push('teardown'); bus.clear(); });
  bus.emit('sector:enter');
  assert.deepEqual(seen, ['x', 'teardown'], 'the inline slice ran; teardown cleared the bus mid-dispatch');
  bus.on('sector:enter', () => seen.push('post-clear'));
  assert.equal(bus.pendingEmitSliceCount(), 0, 'clear() dropped the stale slice state');
  bus.drainEmitSlice(4);
  assert.deepEqual(seen, ['x', 'teardown'], 'the aborted slice delivers nothing');
  bus.emit('sector:enter');
  assert.deepEqual(seen, ['x', 'teardown', 'post-clear'], 'a fresh listener on the cleared bus still works');
});

test('setEmitSliceBudget round-trips zero, negative and fractional budgets', () => {
  const bus = createBus();
  assert.equal(bus.setEmitSliceBudget('sector:enter', 0), 0, 'zero clears the budget');
  assert.equal(bus.setEmitSliceBudget('sector:enter', -5), 0, 'negative clamps to cleared');
  assert.equal(bus.setEmitSliceBudget('sector:enter', 2.9), 2, 'fractional floors');
  assert.equal(bus.setEmitSliceBudget('sector:enter', Number.NaN), 0, 'NaN clears');
  assert.equal(SECTOR_ENTER_LISTENER_BUDGET > 0, true);
  assert.equal(SECTOR_ENTER_DRAIN_BUDGET > 0, true);
});

test('the default emit is fully synchronous: a sliced budget for a foreign event is ignored', () => {
  const bus = createBus();
  const seen = [];
  bus.setEmitSliceBudget('not-sector-enter', 1);
  bus.on('not-sector-enter', () => seen.push('a'));
  bus.on('not-sector-enter', () => seen.push('b'));
  bus.emit('not-sector-enter');
  assert.deepEqual(seen, ['a', 'b'], 'only sector:enter slices; everything else fires inline');
});
