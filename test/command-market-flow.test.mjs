import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createTradeFlow } from '../src/ui/market/transactionFlow.js';

const request = { stationId: 'station_test', commodityId: 'cmdty_iron', commodityName: 'Iron', side: 'buy', qty: 3, afterSequence: 4 };
const receipt = { ...request, receiptId: 'trade:5', tradeSequence: 5, total: 60 };
function fixture() {
  const bus = createBus(), changes = [];
  let timeout, cancelled = 0;
  const flow = createTradeFlow({ bus, onChange: v => changes.push(v),
    schedule: fn => { timeout = fn; return 1; }, cancel: () => cancelled++ });
  return { bus, changes, flow, expire: () => timeout(), cancelled: () => cancelled };
}
test('dispatch is pending, only an authoritative receipt announces completion', () => {
  const f = fixture();
  assert.equal(f.flow.begin(request), true);
  assert.equal(f.flow.view.kind, 'pending');
  assert.equal(f.flow.begin(request), false, 'double click cannot submit a second transfer');
  f.bus.emit('economy:tradeCompleted', receipt);
  assert.equal(f.flow.view.kind, 'success');
  assert.match(f.flow.view.text, /3 u Iron.*60 CR/);
  assert.equal(f.flow.pending, null);
  assert.equal(f.cancelled(), 1);
  f.flow.dispose();
});
test('unrelated, old and malformed receipts cannot complete the current request', () => {
  const f = fixture(); f.flow.begin(request);
  for (const bad of [ {stationId:'other'}, {commodityId:'other'}, {side:'sell'},
    {tradeSequence:4}, {qty:0}, {qty:4}, {qty:1.5}, {total:-1} ]) {
    f.bus.emit('economy:tradeCompleted', { ...receipt, ...bad });
    assert.equal(f.flow.view.kind, 'pending');
  }
  f.flow.dispose();
});
test('partial actual fills use actual quantity and total, not the original quote', () => {
  const f = fixture(); f.flow.begin(request);
  f.bus.emit('economy:tradeCompleted', { ...receipt, qty: 2, total: 43 });
  assert.equal(f.flow.view.kind, 'success'); assert.match(f.flow.view.text, /2 u Iron.*43 CR/);
  f.flow.dispose();
});
test('failures and a lost dock release pending with a truthful reason', () => {
  const f = fixture(); f.flow.begin(request);
  f.bus.emit('economy:tradeFailed', { ...request, reason: 'credits' });
  assert.equal(f.flow.view.kind, 'error'); assert.match(f.flow.view.text, /Insufficient/);
  f.flow.begin(request);
  f.bus.emit('economy:tradeFailed', { ...request, stationId: null, reason: 'not_docked' });
  assert.match(f.flow.view.text, /Dock/); assert.equal(f.flow.pending, null);
  f.flow.dispose();
});
test('timeout is unconfirmed, never success, and never retries', () => {
  const f = fixture(); let sent = 0; f.bus.on('ui:buy', () => sent++);
  f.flow.begin(request); f.expire();
  assert.equal(f.flow.view.kind, 'unconfirmed'); assert.equal(sent, 0);
  f.bus.emit('economy:tradeCompleted', receipt);
  assert.equal(f.flow.view.kind, 'unconfirmed'); f.flow.dispose();
});
test('duplicate receipts cannot satisfy a subsequent request', () => {
  const f = fixture(); f.flow.begin(request); f.bus.emit('economy:tradeCompleted', receipt);
  f.flow.begin(request); f.bus.emit('economy:tradeCompleted', receipt);
  assert.equal(f.flow.view.kind, 'pending'); f.flow.dispose();
});
test('dispose releases listeners/timer and cannot restart', () => {
  const f = fixture(); f.flow.begin(request); f.flow.dispose();
  assert.equal(f.bus._listeners.get('economy:tradeCompleted').size, 0);
  assert.equal(f.bus._listeners.get('economy:tradeFailed').size, 0);
  assert.equal(f.flow.begin(request), false); f.expire();
  assert.equal(f.changes.length, 1);
});
