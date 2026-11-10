import test from 'node:test';
import assert from 'node:assert/strict';

import { admitReceipt, stuntDetectionReceipt, stuntTrickReceiptLine } from '../src/ui/hudAttention.js';
import { bindStuntReceipts } from '../src/ui/toasts.js';

test('VERB-05 a detected stunt admits one receipt with the trick name', () => {
  const seen = new Set();
  const first = stuntDetectionReceipt(seen, { name: 'Wrecking Ball', episodeId: 'ep-1' });
  assert.deepEqual(first, { text: 'Wrecking Ball', kind: 'stunt', channel: 'stunt' });
  assert.equal(stuntDetectionReceipt(seen, { name: 'Wrecking Ball', episodeId: 'ep-1' }), null);
  assert.equal(stuntTrickReceiptLine({ name: 'Clothesline', amendment: true }), '');

  const duringFight = admitReceipt({ text: first.text, kind: 'stunt', channel: 'stunt', combat: true });
  assert.equal(duringFight.admit, true);
  assert.equal(duringFight.reason, 'stunt');
  assert.equal(admitReceipt({ text: 'You shoved the hull', kind: 'info', combat: true }).admit, false);
});

test('VERB-05 the live binder emits one toast for stunt:trickDetected', () => {
  const events = new Map();
  const emitted = [];
  const bus = {
    on(name, fn) { events.set(name, fn); },
    emit(name, payload) { emitted.push({ name, payload }); },
  };
  bindStuntReceipts(bus);
  const hear = events.get('stunt:trickDetected');
  hear({ name: 'Close Shave', episodeId: 'ep-9' });
  hear({ name: 'Close Shave', episodeId: 'ep-9' });
  hear({ name: 'Close Shave', episodeId: 'ep-9', amendment: true });
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].payload.text, 'Close Shave');
  assert.equal(emitted[0].payload.kind, 'stunt');
});
