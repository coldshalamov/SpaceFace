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

test('once() fires once even when an EARLIER listener recursively re-emits the event', () => {
  // The wrapper used to unsubscribe inside its own invocation — after the nested emit had
  // already snapshotted it — so the outer dispatch's captured copy ran fn a second time.
  const bus = createBus();
  const seen = [];
  bus.on('e', (p) => { if (p === 'outer') bus.emit('e', 'inner'); });
  bus.once('e', (p) => seen.push(p));
  bus.emit('e', 'outer');
  assert.deepEqual(seen, ['inner'],
    'the nested emit consumes the once; the outer snapshot\'s copy must be inert');
});

test('a once() listener that throws still runs exactly once', () => {
  const bus = createBus();
  let calls = 0;
  bus.once('e', () => { calls += 1; throw new Error('listener fault'); });
  assert.doesNotThrow(() => bus.emit('e'));
  bus.emit('e');
  assert.equal(calls, 1, 'throwing must not re-arm or duplicate the registration');
});

test('clear() mid-flush aborts the rest of the captured batch; only post-clear work survives', () => {
  // flush() captures the whole batch up front: without a generation check, an event that
  // clears the bus and rebinds listeners still receives the pre-clear remainder.
  const bus = createBus();
  const seen = [];
  bus.on('reset', () => {
    seen.push('reset');
    bus.clear();
    bus.on('work', (p) => seen.push(`new:${p}`));
    bus.queue('work', 'fresh');
  });
  bus.on('work', (p) => seen.push(`old:${p}`));
  bus.queue('reset');
  bus.queue('work', 'stale');
  bus.flush();
  assert.deepEqual(seen, ['reset'],
    'the stale batch item must not reach the fresh (post-clear) listener');
  bus.flush();
  assert.deepEqual(seen, ['reset', 'new:fresh'],
    'work queued after clear lands on the next flush, in the new bus');
});

test('clear() inside a nested flush aborts the outer batch as well', () => {
  // A nested flush delivering an event whose listener clears — and rebinds on — the bus must
  // invalidate the captured batch of every flush still on the stack, not just its own.
  const bus = createBus();
  const seen = [];
  bus.on('a', () => {
    seen.push('a');
    bus.queue('inner');
    bus.flush(); // nested flush delivers 'inner', which clears and rebinds
  });
  bus.on('inner', () => {
    seen.push('inner');
    bus.clear();
    bus.on('b', () => seen.push('b-post-clear'));
  });
  bus.on('b', () => seen.push('b-old'));
  bus.queue('a');
  bus.queue('b');
  bus.flush();
  assert.deepEqual(seen, ['a', 'inner'],
    'the outer batch\'s stale b must not reach the listener bound after clear');
  bus.flush();
  assert.deepEqual(seen, ['a', 'inner'], 'nothing stale is left to deliver');
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

test('a second sliced emit drains the predecessor tail instead of dropping its listeners', () => {
  const bus = createBus();
  const seen = [];
  bus.setEmitSliceBudget('sector:enter', 2);
  for (let i = 0; i < 5; i++) bus.on('sector:enter', (p) => seen.push(`${i}:${p && p.sector}`));
  bus.emit('sector:enter', { sector: 'a' });
  assert.deepEqual(seen, ['0:a', '1:a'], 'first emit runs the inline slice');
  bus.emit('sector:enter', { sector: 'b' });
  // The 'a' tail must have been drained, not discarded — every listener still hears it.
  assert.deepEqual(seen, ['0:a', '1:a', '2:a', '3:a', '4:a', '0:b', '1:b']);
  bus.drainEmitSlice(SECTOR_ENTER_DRAIN_BUDGET);
  assert.deepEqual(seen.slice(-3), ['2:b', '3:b', '4:b'], 'b tail drains normally');
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

test('a reentrant drain mid-dispatch continues after the running listener instead of re-running it', () => {
  const bus = createBus();
  const seen = [];
  let middleCalls = 0;
  let innerRan = -1;
  bus.setEmitSliceBudget('sector:enter', 1);
  bus.on('sector:enter', () => seen.push('first'));
  bus.on('sector:enter', () => {
    seen.push('middle');
    middleCalls += 1;
    if (middleCalls === 1) innerRan = bus.drainEmitSlice(1);
  });
  bus.on('sector:enter', () => seen.push('last'));
  bus.emit('sector:enter');
  const outerRan = bus.drainEmitSlice(2);
  assert.deepEqual(seen, ['first', 'middle', 'last'], 'the nested drain must resume after middle, not replay it');
  assert.equal(bus.pendingEmitSliceCount(), 0);
  assert.equal(innerRan, 1, 'the nested drain ran exactly one callback: the tail listener');
  assert.equal(outerRan, 1, 'the outer drain ran only middle; last was delivered by the nested drain');
});

test('a listener emitting a replacement sector event mid-slice delivers every listener both events once', () => {
  const bus = createBus();
  const seen = [];
  let redirected = false;
  bus.setEmitSliceBudget('sector:enter', 2);
  for (const name of ['l0', 'l1', 'l2']) {
    bus.on('sector:enter', (p) => {
      seen.push(`${name}:${p}`);
      if (name === 'l0' && p === 'a' && !redirected) {
        redirected = true;
        bus.emit('sector:enter', 'b');
      }
    });
  }
  bus.emit('sector:enter', 'a');
  assert.deepEqual(seen, ['l0:a', 'l1:a', 'l2:a', 'l0:b', 'l1:b'], 'a drains its whole tail before b starts');
  assert.equal(bus.pendingEmitSliceCount(), 1);
  bus.drainEmitSlice(SECTOR_ENTER_DRAIN_BUDGET);
  assert.deepEqual(seen, ['l0:a', 'l1:a', 'l2:a', 'l0:b', 'l1:b', 'l2:b'], 'each listener hears a and b exactly once');
  assert.equal(bus.pendingEmitSliceCount(), 0);
});

test('a sliced emit arriving behind a pending slice drains all earlier events in order before starting', () => {
  const bus = createBus();
  const seen = [];
  let emittedB = false;
  bus.setEmitSliceBudget('sector:enter', 1);
  for (const name of ['l0', 'l1', 'l2']) {
    bus.on('sector:enter', (p) => {
      seen.push(`${name}:${p}`);
      if (name === 'l1' && p === 'a' && !emittedB) {
        emittedB = true;
        bus.emit('sector:enter', 'b');
      }
    });
  }
  bus.emit('sector:enter', 'a');
  assert.deepEqual(seen, ['l0:a'], 'only the inline slice ran');
  bus.emit('sector:enter', 'c');
  assert.deepEqual(seen, ['l0:a', 'l1:a', 'l2:a', 'l0:b', 'l1:b', 'l2:b', 'l0:c'], 'a and b fully finish before c begins; no b tail is lost');
  assert.equal(bus.pendingEmitSliceCount(), 2, 'only the c tail remains');
  bus.drainEmitSlice(SECTOR_ENTER_DRAIN_BUDGET);
  assert.deepEqual(seen.slice(-2), ['l1:c', 'l2:c'], 'the c tail drains once');
  assert.equal(bus.pendingEmitSliceCount(), 0);
});

test('a sliced listener calling clear() during a drain stops the rest of that slice; fresh listeners still work', () => {
  const bus = createBus();
  const seen = [];
  bus.setEmitSliceBudget('sector:enter', 4);
  bus.on('sector:enter', () => seen.push('l0'));
  bus.on('sector:enter', () => { seen.push('l1'); bus.clear(); });
  bus.on('sector:enter', () => seen.push('l2'));
  bus.on('sector:enter', () => seen.push('l3'));
  bus.emit('sector:enter');
  assert.deepEqual(seen, ['l0', 'l1'], 'teardown inside the drain window aborts: later handlers never run');
  assert.equal(bus.pendingEmitSliceCount(), 0);
  bus.drainEmitSlice(SECTOR_ENTER_DRAIN_BUDGET);
  assert.deepEqual(seen, ['l0', 'l1'], 'no stale tail survives teardown');
  bus.on('sector:enter', () => seen.push('fresh'));
  bus.emit('sector:enter');
  assert.deepEqual(seen, ['l0', 'l1', 'fresh'], 'a fresh listener on the cleared bus still works');
});

test('a once() listener emitting a new sliced event still fires once and every tail listener hears both events once', () => {
  const bus = createBus();
  const seen = [];
  bus.setEmitSliceBudget('sector:enter', 2);
  bus.on('sector:enter', (p) => seen.push(`a:${p}`));
  bus.once('sector:enter', (p) => {
    seen.push(`once:${p}`);
    if (p === 'x') bus.emit('sector:enter', 'y');
  });
  bus.on('sector:enter', (p) => seen.push(`b:${p}`));
  bus.on('sector:enter', (p) => seen.push(`c:${p}`));
  bus.emit('sector:enter', 'x');
  assert.deepEqual(seen, ['a:x', 'once:x', 'b:x', 'c:x', 'a:y', 'b:y'], 'the once wrapper is gone before y snapshots; x tail finishes first');
  assert.equal(bus.pendingEmitSliceCount(), 1, 'c still waits in the y tail');
  bus.drainEmitSlice(SECTOR_ENTER_DRAIN_BUDGET);
  assert.deepEqual(seen, ['a:x', 'once:x', 'b:x', 'c:x', 'a:y', 'b:y', 'c:y']);
  assert.equal(bus.pendingEmitSliceCount(), 0);
});
