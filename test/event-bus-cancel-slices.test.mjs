import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';

function pacedBus(t) {
  let clock = performance.now();
  t.mock.method(performance, 'now', () => (clock += 10));
  const bus = createBus();
  bus.setEmitSliceBudget('save:loaded', 1);
  bus.setEmitSliceBudget('sector:enter', 1);
  return bus;
}

function finish(bus) {
  for (let i = 0; bus.pendingEmitSliceCount() && i < 100; i++) bus.drainEmitSlice(4, 16);
  assert.equal(bus.pendingEmitSliceCount(), 0);
}

test('cancelSlicedEmits drops current and queued restore payloads but preserves subscribers and budgets', t => {
  const bus = pacedBus(t);
  const seen = [];
  for (let i = 0; i < 12; i++) {
    bus.on('save:loaded', payload => seen.push(['save', payload, i]));
    bus.on('sector:enter', payload => seen.push(['sector', payload, i]));
  }
  bus.emit('save:loaded', 'failed');
  bus.emit('sector:enter', 'failed-sector');
  assert.ok(bus.pendingEmitSliceCount() > 0);
  assert.equal(seen.some(row => row[0] === 'sector'), false, 'sector payload is queued behind save');
  const beforeCancel = seen.length;
  bus.cancelSlicedEmits();
  bus.cancelSlicedEmits();
  assert.equal(bus.pendingEmitSliceCount(), 0);
  assert.equal(bus.drainEmitSlice(), 0);
  bus.flushSlicedEmits();
  assert.equal(seen.length, beforeCancel, 'cancelled payloads never resume');

  bus.emit('save:loaded', 'newer');
  assert.ok(bus.pendingEmitSliceCount() > 0, 'configured slicing survives cancellation');
  finish(bus);
  bus.emit('sector:enter', 'newer-sector');
  finish(bus);
  assert.deepEqual(seen.slice(beforeCancel), [
    ...Array.from({ length: 12 }, (_, i) => ['save', 'newer', i]),
    ...Array.from({ length: 12 }, (_, i) => ['sector', 'newer-sector', i]),
  ]);
});

test('slice cancellation preserves deferred ordinary events and presentation snapshots', t => {
  const bus = pacedBus(t);
  const ordinary = [], presented = [];
  bus.on('ordinary', value => ordinary.push(value));
  bus.on('visual', value => presented.push(value.value), { presentation: true });
  bus.claimPresentationDrain();
  bus.setPayloadSnapshot('visual', value => ({ ...value }));
  for (let i = 0; i < 12; i++) bus.on('save:loaded', () => {});
  bus.queue('ordinary', 'queued');
  const payload = { value: 'before' };
  bus.emit('visual', payload);
  payload.value = 'after';
  bus.emit('save:loaded', 'failed');
  bus.cancelSlicedEmits();
  bus.flush();
  bus.emit('ordinary', 'live');
  bus.drainPresentationTail();
  assert.deepEqual(ordinary, ['queued', 'live']);
  assert.deepEqual(presented, ['before']);
  bus.emit('visual', payload);
  payload.value = 'later';
  bus.drainPresentationTail();
  assert.deepEqual(presented, ['before', 'after'], 'snapshot registration also survives');
});

test('reentrant cancellation stops the active drain without discarding a newer sliced emit', t => {
  const bus = pacedBus(t);
  const seen = [];
  let cancelNext = false;
  bus.on('save:loaded', payload => seen.push(['first', payload]));
  bus.on('save:loaded', payload => {
    seen.push(['second', payload]);
    if (cancelNext) {
      cancelNext = false;
      bus.cancelSlicedEmits();
      bus.emit('save:loaded', 'newer');
    }
  });
  for (let i = 0; i < 8; i++) bus.on('save:loaded', payload => seen.push([i, payload]));
  bus.emit('save:loaded', 'failed');
  cancelNext = true;
  bus.drainEmitSlice(4, 16);
  finish(bus);
  assert.deepEqual(seen.filter(row => row[1] === 'failed'), [['first', 'failed'], ['second', 'failed']]);
  assert.deepEqual(seen.filter(row => row[1] === 'newer'), [
    ['first', 'newer'], ['second', 'newer'], ...Array.from({ length: 8 }, (_, i) => [i, 'newer']),
  ]);
});
