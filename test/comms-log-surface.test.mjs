// INFERENCE U3 (WF-14) — comms:log had emitters and zero consumers: rescue acks,
// survey/rumor lines, and cargo barks all evaporated. They now read on the
// receipt lane. Pure formatter + bus wiring; no DOM needed.
import test from 'node:test';
import assert from 'node:assert/strict';

import { commsToastSpec, bindCommsLogToasts } from '../src/ui/floatingText.js';

function fakeBus() {
  const handlers = new Map();
  return {
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
    },
    emit(name, payload) {
      for (const fn of handlers.get(name) || []) fn(payload);
    },
  };
}

test('encounter and cargo lines format as callsign receipts', () => {
  assert.deepEqual(
    commsToastSpec({ from: 'RUMOR', text: 'Sable Iask is dead.', kind: 'encounter' }),
    { text: 'RUMOR: Sable Iask is dead.', kind: 'info', ttl: 5 },
  );
  assert.deepEqual(
    commsToastSpec({ from: 'SURVEY', text: 'Signal source identified.', kind: 'encounter' }),
    { text: 'SURVEY: Signal source identified.', kind: 'info', ttl: 5 },
  );
  assert.deepEqual(
    commsToastSpec({ from: 'Stricken Hauler', text: 'You came.', kind: 'encounter' }),
    { text: 'STRICKEN HAULER: You came.', kind: 'info', ttl: 5 },
  );
  assert.deepEqual(
    commsToastSpec({ from: 'Free Trader Ana', text: 'holds full', kind: 'cargo' }),
    { text: 'FREE TRADER ANA: holds full', kind: 'info', ttl: 5 },
  );
});

test('self-toasted kinds and empty lines stay out (no doubles, no blanks)', () => {
  assert.equal(commsToastSpec({ from: 'Derelict', text: 'x', kind: 'salvage' }), null);
  assert.equal(commsToastSpec({ from: 'RUMOR', text: '   ', kind: 'encounter' }), null);
  assert.equal(commsToastSpec(null), null);
  assert.equal(commsToastSpec({}), null);
});

test('long lines truncate to the lane instead of overflowing it', () => {
  const spec = commsToastSpec({ from: 'RUMOR', text: 'x'.repeat(200), kind: 'encounter' });
  assert.ok(spec.text.length <= 140);
  assert.match(spec.text, /\.\.\.$/);
});

test('binding turns each comms line into exactly one toast', () => {
  const bus = fakeBus();
  const toasts = [];
  bus.on('toast', (p) => toasts.push(p));
  bindCommsLogToasts(bus);
  bus.emit('comms:log', { from: 'RUMOR', text: 'Sable Iask is dead.', kind: 'encounter' });
  bus.emit('comms:log', { from: 'Derelict', text: 'self-toasted', kind: 'salvage' });
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].text, 'RUMOR: Sable Iask is dead.');
});

test('binding tolerates a missing bus', () => {
  assert.doesNotThrow(() => bindCommsLogToasts(null));
  assert.doesNotThrow(() => bindCommsLogToasts({}));
});
