// FB-051 — a claim warning and a worksite credit become cited lines, then a dock card.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createMarketNews } from '../src/ui/marketNews.js';

test('warning, receipt, and income stay in order and cite their events', () => {
  const state = { simTime: 50, meta: { seed: 4242 }, ui: {} };
  const bus = createBus();
  createMarketNews({ state, bus, helpers: { voice: { say: () => false } } });
  bus.emit('claim:defenseWarning', { bodyId: 'claim_ceres', attackerName: 'Raiders', defenseId: 'd1' });
  bus.emit('claim:receipt', { receiptId: 'rc-4242', text: 'Claim receipt filed for claim_ceres.' });
  bus.emit('automation:incomeCredited', { amount: 80, source: 'ceres-yard' });
  const texts = state.ui.marketNews.log.map((row) => row.text);
  assert.equal(texts.length, 3);
  assert.match(texts[2], /Raiders/);
  assert.match(texts[1], /receipt/i);
  assert.match(texts[0], /80/);
  assert.ok(state.ui.marketNews.log.every((row) => row.sourceRef));
});
