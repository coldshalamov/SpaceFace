// INFERENCE — onboarding:rangePrompt, rescue:complete, and firsthour:complete
// were emitted and unsubscribed. Voice owns them; a toast is the headless fallback.
import test from 'node:test';
import assert from 'node:assert/strict';

import { bindFirstHourFelt, FIRST_HOUR_FELT_EVENTS, firstHourFeltLine } from '../src/ui/firstHourFelt.js';
import { RANGE_POINTER_LINE } from '../src/ui/hudAttention.js';

function busOf() {
  const handlers = {};
  const bus = {
    on(event, handler) {
      (handlers[event] = handlers[event] || []).push(handler);
      return () => bus.off(event, handler);
    },
    off(event, handler) {
      handlers[event] = (handlers[event] || []).filter((fn) => fn !== handler);
    },
    emit(event, payload) {
      for (const handler of [...(handlers[event] || [])]) handler(payload);
    },
  };
  return bus;
}

test('seed 4242: the three unfelt first-hour seams each toast once without a voice', () => {
  assert.equal(4242, 4242);
  const bus = busOf();
  const toasts = [];
  bus.on('toast', (payload) => toasts.push(payload));
  const bound = bindFirstHourFelt(bus, {});
  bus.emit('onboarding:rangePrompt', { text: RANGE_POINTER_LINE, beat: 'swing', atS: 12 });
  bus.emit('onboarding:rangePrompt', { text: RANGE_POINTER_LINE, beat: 'swing', atS: 12 });
  bus.emit('rescue:complete', { atS: 40, fails: 1 });
  bus.emit('rescue:complete', { atS: 41, fails: 1 });
  bus.emit('firsthour:complete', { atS: 90 });
  bus.emit('firsthour:complete', { atS: 91 });
  assert.deepEqual(FIRST_HOUR_FELT_EVENTS, ['onboarding:rangePrompt', 'rescue:complete', 'firsthour:complete']);
  assert.equal(toasts.length, 3);
  assert.equal(toasts[0].text, RANGE_POINTER_LINE);
  assert.equal(toasts[0].id, 'firsthour:range:swing');
  assert.equal(toasts[1].text, firstHourFeltLine('rescue:complete', {}));
  assert.equal(toasts[1].id, 'rescue:complete');
  assert.equal(toasts[2].text, 'The three are yours. The lane is open.');
  assert.equal(toasts[2].channel, undefined);
  bound.destroy();
  bus.emit('firsthour:complete', { atS: 120 });
  assert.equal(toasts.length, 3);
});

test('seed 4242: tutorial voice takes the seam and does not also toast', () => {
  const bus = busOf();
  const toasts = [];
  const said = [];
  bus.on('toast', (payload) => toasts.push(payload));
  bindFirstHourFelt(bus, {
    voice: {
      say(packet) { said.push(packet); return true; },
    },
  });
  bus.emit('onboarding:rangePrompt', { text: '', atS: 1 });
  bus.emit('onboarding:rangePrompt', { text: RANGE_POINTER_LINE, atS: 3 });
  bus.emit('rescue:complete', {});
  bus.emit('firsthour:complete', {});
  assert.equal(toasts.length, 0);
  assert.equal(said.length, 3);
  assert.equal(said[0].channel, 'tutorial');
  assert.equal(said[0].text, RANGE_POINTER_LINE);
  assert.equal(said[0].id, 'firsthour:range:3');
  assert.equal(said[1].id, 'rescue:complete');
  assert.equal(said[2].id, 'firsthour:complete');
});
