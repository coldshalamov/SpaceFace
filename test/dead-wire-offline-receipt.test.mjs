import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { buildOfflineReceipt } from '../src/systems/automation.js';
import {
  bindAutomationPayoffUi,
  consumeOfflineReceiptOnce,
  formatOfflineReceiptLine,
  isOfflineReceiptShowable,
} from '../src/ui/automationPayoff.js';

const SEED = 47;

function realReceipt(overrides = {}) {
  return buildOfflineReceipt({
    windowStartMs: 1_000_000,
    nowMs: 1_000_000 + 3_600_000,
    elapsedSec: 3600,
    skipped: false,
    credited: 1200,
    upkeep: 400,
    upkeepCharged: 400,
    upkeepUnpaid: 0,
    lost: 1,
    distressed: true,
    cycles: 12,
    ...overrides,
  });
}

test('offline receipt line uses the stored numbers and skips empty/skipped receipts', () => {
  const receipt = realReceipt();
  const line = formatOfflineReceiptLine(receipt);
  assert.match(line, /While you were away \(1\.0h\)/);
  assert.match(line, /\+1200 cr earned/);
  assert.match(line, /400 cr upkeep/);
  assert.match(line, /1 lost/);
  assert.match(line, /assets distressed/);
  assert.equal(isOfflineReceiptShowable(receipt), true);
  assert.equal(isOfflineReceiptShowable(buildOfflineReceipt({ skipped: true, skipReason: 'idempotent' })), false);
  assert.equal(isOfflineReceiptShowable(buildOfflineReceipt({ skipped: false, credited: 0 })), false);
});

test('seed 47 stored receipt shows once on save:loaded and does not return', () => {
  const bus = createBus();
  const toasts = [];
  bus.on('toast', (payload) => toasts.push(payload));
  const receipt = realReceipt();
  const state = {
    meta: { seed: SEED },
    ui: {},
    automation: { meta: { lastOfflineReceipt: receipt } },
  };
  bindAutomationPayoffUi(bus, () => state);

  bus.emit('save:loaded', { slot: 1 });
  assert.equal(toasts.length, 1, 'first load shows the summary');
  assert.equal(toasts[0].kind, 'credits');
  assert.match(toasts[0].text, /\+1200 cr earned/);
  assert.match(toasts[0].text, /400 cr upkeep/);
  assert.match(toasts[0].text, /1 lost/);

  bus.emit('save:loaded', { slot: 1 });
  bus.emit('automation:offlineSummary', receipt);
  bus.emit('ui:screenChanged', { screen: 'automation' });
  assert.equal(toasts.length, 1, 'the same receipt must not reappear');
  assert.equal(consumeOfflineReceiptOnce(state, receipt), null);
});

test('distressed and repossessed assets toast as events', () => {
  const bus = createBus();
  const toasts = [];
  bus.on('toast', (payload) => toasts.push(payload));
  bindAutomationPayoffUi(bus, () => ({ ui: {} }));
  bus.emit('automation:assetDistressed', { kind: 'drone', id: 'drone_1' });
  bus.emit('automation:assetRepossessed', { kind: 'trader', id: 'trader_1' });
  assert.equal(toasts.length, 2);
  assert.equal(toasts[0].kind, 'warn');
  assert.match(toasts[0].text, /drone distressed/i);
  assert.equal(toasts[1].kind, 'error');
  assert.equal(toasts[1].text, 'Asset repossessed (unpaid upkeep): trader');
});
