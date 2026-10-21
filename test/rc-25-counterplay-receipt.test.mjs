import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTERPLAY_DOCTRINES } from '../src/ai/counterplay/catalog.js';
import { counterplayReceipt, bindCounterplayReceipts, COUNTERPLAY_RECEIPT_TTL_S } from '../src/ui/toasts.js';
import { admitReceipt } from '../src/ui/hudAttention.js';

// RC-25: a counterplay encounter teaches with one short receipt — title plus the
// counter move — never the 8-second playerPlan paragraph it replaced.

test('every doctrine produces a short admissible receipt', () => {
  assert.equal(COUNTERPLAY_DOCTRINES.length, 10);
  for (const d of COUNTERPLAY_DOCTRINES) {
    const receipt = counterplayReceipt({ doctrineId: d.id });
    assert.ok(receipt, `receipt for ${d.id}`);
    assert.equal(receipt.kind, 'info');
    assert.ok(receipt.ttl < 8, `ttl ${receipt.ttl} < 8 for ${d.id}`);
    assert.equal(receipt.ttl, COUNTERPLAY_RECEIPT_TTL_S);
    assert.ok(receipt.text.startsWith(`${d.title} — `), `title — counter shape for ${d.id}`);
    assert.ok(receipt.text.length <= 90, `receipt short for ${d.id}: ${receipt.text}`);
    assert.ok(!receipt.text.includes(d.playerPlan), `no playerPlan leak for ${d.id}`);
    const admitted = admitReceipt(receipt, {});
    assert.equal(admitted.admit, true, `admitReceipt admits ${d.id} (${admitted.reason})`);
  }
});

test('unknown or missing doctrine emits no receipt', () => {
  assert.equal(counterplayReceipt({ doctrineId: 'cp_not_real' }), null);
  assert.equal(counterplayReceipt(null), null);
  assert.equal(counterplayReceipt({}), null);
});

test('binder maps one counterplay:encountered to exactly one toast', () => {
  const toasts = [];
  const handlers = new Map();
  const bus = {
    on: (name, fn) => handlers.set(name, fn),
    emit: (name, payload) => { if (name === 'toast') toasts.push(payload); },
  };
  bindCounterplayReceipts(bus);
  assert.ok(handlers.has('counterplay:encountered'));
  handlers.get('counterplay:encountered')({ doctrineId: 'cp_rescue_tow', sectorId: 'sector_helios_prime', caseKey: 'k', entityId: 7 });
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].channel, 'counterplay');
  assert.ok(toasts[0].text.includes('Cut the tow'));
});
