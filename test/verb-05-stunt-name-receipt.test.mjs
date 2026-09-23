import test from 'node:test';
import assert from 'node:assert/strict';

import { admitReceipt } from '../src/ui/hudAttention.js';
import { bindStuntReceipts } from '../src/ui/toasts.js';

// VERB-05 — a detected stunt says its name once, as a receipt. The detector emits
// stunt:trickDetected once per episode; re-grades ride stunt:trickAmended and never post again.
// bindStuntReceipts is the single live binder wired in createToasts.

function fakeBus() {
  const handlers = new Map();
  const emitted = [];
  return {
    emitted,
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(fn);
    },
    emit(event, payload) {
      emitted.push({ event, payload });
      for (const fn of handlers.get(event) ?? []) fn(payload);
    },
  };
}

test('VERB-05 stunt:trickDetected admits one receipt carrying the trick name', () => {
  const bus = fakeBus();
  bindStuntReceipts(bus);
  bus.emit('stunt:trickDetected', { trickId: 'bulldozer', name: 'Bulldozer', episodeId: 'ep-1', tick: 120 });
  const toasts = bus.emitted.filter((e) => e.event === 'toast');
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].payload.text, 'Bulldozer');
  assert.equal(toasts[0].payload.channel, 'stunt');
  // The receipt must survive the receipt gate in every HUD job.
  for (const combat of [false, true]) {
    const decision = admitReceipt({ ...toasts[0].payload, combat });
    assert.equal(decision.admit, true, `combat=${combat}: ${decision.reason}`);
  }
});

test('VERB-05 the same episode never posts twice', () => {
  const bus = fakeBus();
  bindStuntReceipts(bus);
  const trick = { trickId: 'bolas', name: 'Bolas Snare', episodeId: 'ep-9', tick: 60 };
  bus.emit('stunt:trickDetected', trick);
  bus.emit('stunt:trickDetected', { ...trick, tick: 61 });
  assert.equal(bus.emitted.filter((e) => e.event === 'toast').length, 1);
});

test('VERB-05 distinct episodes each earn one receipt; nameless and amendment payloads post none', () => {
  const bus = fakeBus();
  bindStuntReceipts(bus);
  bus.emit('stunt:trickDetected', { trickId: 'a', name: 'Alpha', episodeId: 'ep-a', tick: 1 });
  bus.emit('stunt:trickDetected', { trickId: 'b', name: 'Beta', episodeId: 'ep-b', tick: 2 });
  bus.emit('stunt:trickDetected', { episodeId: 'ep-c', tick: 3 });
  bus.emit('stunt:trickDetected', { trickId: 'a', name: 'Alpha', episodeId: 'ep-d', tick: 4, amendment: true });
  bus.emit('stunt:trickDetected', null);
  const texts = bus.emitted.filter((e) => e.event === 'toast').map((e) => e.payload.text);
  assert.deepEqual(texts, ['Alpha', 'Beta']);
});

test('VERB-05 a stunt receipt survives combat quiet; ordinary lines still drop', () => {
  assert.equal(
    admitReceipt({ text: 'Bulldozer', kind: 'stunt', channel: 'stunt', combat: true }).admit,
    true,
  );
  assert.equal(
    admitReceipt({ text: 'Bulldozer', kind: 'success', combat: true }).admit,
    false,
  );
  // Chatter channels remain refused — the stunt lane is not a chatter backdoor.
  assert.equal(
    admitReceipt({ text: 'Bulldozer', kind: 'success', channel: 'bark', combat: true }).admit,
    false,
  );
});

test('VERB-05 binder tolerates a missing bus and a missing payload', () => {
  bindStuntReceipts(null);
  const bus = fakeBus();
  bindStuntReceipts(bus);
  bus.emit('stunt:trickDetected', undefined);
  assert.equal(bus.emitted.filter((e) => e.event === 'toast').length, 0);
});
