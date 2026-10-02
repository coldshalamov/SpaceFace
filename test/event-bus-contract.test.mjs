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

test('presentation-tier listeners run inline until a drain is claimed, then slice across drains', () => {
  const bus = createBus();
  const seen = [];
  bus.on('e', (p) => seen.push(`sim:${p}`));
  bus.on('e', (p) => seen.push(`p0:${p}`), { presentation: true });
  bus.on('e', (p) => seen.push(`p1:${p}`), { presentation: true });
  bus.emit('e', 'a');
  assert.deepEqual(seen, ['sim:a', 'p0:a', 'p1:a'], 'unclaimed: presentation listeners dispatch inline like plain ones');
  bus.claimPresentationDrain();
  bus.emit('e', 'b');
  assert.deepEqual(seen.slice(-1), ['sim:b'], 'claimed: the sim tail still runs in-emit; presentation tails queue');
  assert.equal(bus.pendingPresentationCount(), 2);
  bus.drainPresentationTail(1);
  assert.deepEqual(seen.slice(-1), ['p0:b'], 'drain takes its own budget');
  bus.drainPresentationTail(8);
  assert.deepEqual(seen.slice(-1), ['p1:b']);
  assert.equal(bus.pendingPresentationCount(), 0);
});

test('presentation queue preserves per-emit FIFO and off() retracts a queued tier listener', () => {
  const bus = createBus();
  bus.claimPresentationDrain();
  const seen = [];
  bus.on('e', (p) => seen.push(`x:${p}`), { presentation: true });
  bus.on('e', (p) => seen.push(`y:${p}`), { presentation: true });
  bus.emit('e', 1);
  bus.emit('e', 2);
  const offY = bus.on('e', (p) => seen.push(`y:${p}`), { presentation: true });
  // The snapshot semantics of the sim tier apply per-emit slice too: a listener added after
  // the first emit is absent from it, present in later slices.
  bus.emit('e', 3);
  bus.drainPresentationTail(Number.MAX_SAFE_INTEGER);
  assert.deepEqual(seen, ['x:1', 'y:1', 'x:2', 'y:2', 'x:3', 'y:3', 'y:3'], 'slices drain in emit order; late listener joins from its own emit');
  offY();
  bus.emit('e', 4);
  bus.drainPresentationTail(Number.MAX_SAFE_INTEGER);
  assert.deepEqual(seen.slice(-2), ['x:4', 'y:4'], 'off() hits both tier tables by fn identity');
});

test('a queued presentation tail emitting synchronously lands behind the drain, not ahead of it', () => {
  const bus = createBus();
  bus.claimPresentationDrain();
  const seen = [];
  bus.on('e', (p) => { seen.push(`p0:${p}`); if (p === 'a') bus.emit('e', 'nested'); }, { presentation: true });
  bus.on('e', (p) => seen.push(`p1:${p}`), { presentation: true });
  bus.emit('e', 'a');
  bus.drainPresentationTail(2);
  assert.deepEqual(seen, ['p0:a', 'p1:a'], 'the nested emit queues behind the current slice');
  bus.drainPresentationTail(Number.MAX_SAFE_INTEGER);
  assert.deepEqual(seen.slice(-2), ['p0:nested', 'p1:nested']);
});

test('clear() drops the presentation queue; a claimed bus keeps slicing after clear', () => {
  const bus = createBus();
  bus.claimPresentationDrain();
  const seen = [];
  bus.on('e', () => seen.push('x'), { presentation: true });
  bus.emit('e');
  bus.clear();
  assert.equal(bus.pendingPresentationCount(), 0, 'clear() aborts queued presentation tails');
  bus.drainPresentationTail(Number.MAX_SAFE_INTEGER);
  assert.deepEqual(seen, []);
  bus.on('e', () => seen.push('fresh'), { presentation: true });
  bus.emit('e');
  bus.drainPresentationTail(Number.MAX_SAFE_INTEGER);
  assert.deepEqual(seen, ['fresh'], 'the claim survives clear(): the runner still owns the frame pump');
});

test('clear() also drops the lifecycle priority queue', () => {
  const bus = createBus();
  bus.claimPresentationDrain();
  const seen = [];
  bus.on('entity:destroyed', () => seen.push('gone'), { presentation: true });
  bus.emit('entity:destroyed', { id: 1 });
  bus.clear();
  assert.equal(bus.pendingPresentationCount(), 0, 'clear() aborts queued priority tails');
  bus.drainPresentationTail(Number.MAX_SAFE_INTEGER);
  assert.deepEqual(seen, [], 'no phantom lifecycle presents after clear');
});

test('kill-burst overflow cannot evict once-only spawn tails under their deeper floor', () => {
  const bus = createBus();
  bus.claimPresentationDrain();
  const seen = [];
  bus.on('entity:destroyed', (p) => seen.push(`d:${p.id}`), { presentation: true });
  bus.on('entity:spawned', (p) => seen.push(`s:${p.id}`), { presentation: true });
  // 20 spawn tails armed, then a 100-destroy clump: combined 120 > 64-cap → 56 must shed.
  // entity:spawned is once-only (materializeT0/spiralDone stamps): under the 32-slice
  // once-only floor all 20 survive and the priority lane pays the whole overflow.
  for (let i = 0; i < 20; i++) bus.emit('entity:spawned', { id: i });
  for (let i = 0; i < 100; i++) bus.emit('entity:destroyed', { id: 1000 + i });
  bus.drainPresentationTail(Number.MAX_SAFE_INTEGER);
  const spawned = seen.filter((s) => s.startsWith('s:')).length;
  assert.equal(spawned, 20, 'once-only spawn tails are fully retained below the 32-slice floor');
  const destroyed = seen.filter((s) => s.startsWith('d:')).length;
  assert.equal(destroyed, 44, 'the priority lane sheds its own oldest while the floor holds');
});

test('once-only spawn tails shed their own oldest past the 32-slice floor', () => {
  const bus = createBus();
  bus.claimPresentationDrain();
  const seen = [];
  bus.on('entity:destroyed', (p) => seen.push(`d:${p.id}`), { presentation: true });
  bus.on('entity:spawned', (p) => seen.push(`s:${p.id}`), { presentation: true });
  // 40 spawn tails + 60 destroys: combined 100 → 36 must shed. The once-only floor is 32,
  // so 8 spawn tails shed their oldest first; the remaining 28 overflow slots come out of
  // the priority lane (60 → 32).
  for (let i = 0; i < 40; i++) bus.emit('entity:spawned', { id: i });
  for (let i = 0; i < 60; i++) bus.emit('entity:destroyed', { id: 1000 + i });
  bus.drainPresentationTail(Number.MAX_SAFE_INTEGER);
  const spawned = seen.filter((s) => s.startsWith('s:'));
  assert.equal(spawned.length, 32, 'once-only floor retains the newest 32 spawn tails');
  assert.equal(spawned[0], 's:8', 'the floor sheds the OLDEST once-only slices');
  const destroyed = seen.filter((s) => s.startsWith('d:')).length;
  assert.equal(destroyed, 32, 'the priority lane pays the remaining overflow');
});

test('zero-priority overflow prefers non-once-only cosmetics before spawn tails', () => {
  const bus = createBus();
  bus.claimPresentationDrain();
  const seen = [];
  bus.on('entity:spawned', (p) => seen.push(`s:${p.id}`), { presentation: true });
  bus.on('hud:fx', (p) => seen.push(`f:${p.id}`), { presentation: true });
  // 40 spawn tails + 40 plain cosmetics, priority lane empty: combined 80 → 16 shed.
  // The trim must skip past the once-only slices to the first non-once-only row —
  // an unconditional head-drop would eat spawn stamps the floor exists to protect.
  for (let i = 0; i < 40; i++) bus.emit('entity:spawned', { id: i });
  for (let i = 0; i < 40; i++) bus.emit('hud:fx', { id: 1000 + i });
  bus.drainPresentationTail(Number.MAX_SAFE_INTEGER);
  const spawned = seen.filter((s) => s.startsWith('s:')).length;
  assert.equal(spawned, 40, 'non-once-only cosmetics shed before any spawn tail');
  const fx = seen.filter((s) => s.startsWith('f:')).length;
  assert.equal(fx, 24, 'the overflow comes out of the non-once-only lane oldest-first');
});

test('pure once-only overflow past the floor sheds its own oldest with no priority lane', () => {
  const bus = createBus();
  bus.claimPresentationDrain();
  const seen = [];
  bus.on('entity:spawned', (p) => seen.push(`s:${p.id}`), { presentation: true });
  // 70 once-only slices, nothing else: the queue is 100% once-only past the 32-slice
  // floor, so the trim sheds the oldest spawn tails to hold the 64-slice cap.
  for (let i = 0; i < 70; i++) bus.emit('entity:spawned', { id: i });
  bus.drainPresentationTail(Number.MAX_SAFE_INTEGER);
  const spawned = seen.filter((s) => s.startsWith('s:'));
  assert.equal(spawned.length, 64, 'the cap still holds with no other lane to pay');
  assert.equal(spawned[0], 's:6', 'the trim sheds the oldest once-only slices');
});

test('a sustained priority burst cannot starve the cosmetic lane — bounded interleave', () => {
  const bus = createBus();
  bus.claimPresentationDrain();
  const seen = [];
  bus.on('entity:destroyed', (p) => seen.push(`d:${p.id}`), { presentation: true });
  bus.on('entity:spawned', (p) => seen.push(`s:${p.id}`), { presentation: true });
  // 30 destroys + 5 spawn tails pending: the drain must interleave cosmetics every K=8
  // priority invocations instead of starving them for the whole burst.
  for (let i = 0; i < 30; i++) bus.emit('entity:destroyed', { id: i });
  for (let i = 0; i < 5; i++) bus.emit('entity:spawned', { id: 100 + i });
  while (bus.pendingPresentationCount() > 0) bus.drainPresentationTail(Number.MAX_SAFE_INTEGER);
  const firstSpawn = seen.findIndex((s) => s.startsWith('s:'));
  assert.ok(firstSpawn !== -1 && firstSpawn <= 8,
    `a cosmetic tail drains within 8 priority invocations (first spawn at ${firstSpawn})`);
  const lastDestroyed = seen.lastIndexOf('d:29');
  assert.ok(firstSpawn < lastDestroyed, 'cosmetics interleave before the burst fully drains');
  // Per-lane FIFO is preserved within each event family.
  const spawns = seen.filter((s) => s.startsWith('s:'));
  assert.deepEqual(spawns, ['s:100', 's:101', 's:102', 's:103', 's:104']);
});
