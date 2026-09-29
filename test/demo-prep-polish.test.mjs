// Demo-prep sweep: frontend micro-polish seams + receipt-lane regression pins.
// Headless only — every helper under test is DOM-free by construction.
import test from 'node:test';
import assert from 'node:assert/strict';

import { planArrivalStagger, planConfirmCopy } from '../src/ui/kit/motion.js';
import { combatDenialToastSpec, formatCombatActionRejectLine, planReceiptArrival } from '../src/ui/toasts.js';
import { planLadder } from '../src/ui/promptDeck.js';

test('arrival stagger cascades within the delay budget and never throws', () => {
  assert.deepEqual(planArrivalStagger(0), []);
  assert.deepEqual(planArrivalStagger(4), [0, 60, 120, 180]);
  assert.deepEqual(planArrivalStagger(4, { gap: 60, budget: 100 }), [0, 60, 100, 100]);
  assert.deepEqual(planArrivalStagger('junk'), []);
});

test('confirm copy never ships blank chrome', () => {
  assert.deepEqual(planConfirmCopy({}), { title: 'Confirm', body: '', confirmLabel: 'Confirm' });
  assert.deepEqual(
    planConfirmCopy({ title: '  Sell ship?  ', body: 'Refund: 12,500 CR. ', confirmLabel: ' Sell ' }),
    { title: 'Sell ship?', body: 'Refund: 12,500 CR.', confirmLabel: 'Sell' },
  );
});

test('combat denials teach the fix and never leak snake_case', () => {
  const spec = combatDenialToastSpec({ reason: 'insufficient_capacitor' });
  assert.equal(spec.text, 'Not enough capacitor');
  assert.equal(spec.hint, 'Let the capacitor refill');
  assert.equal(combatDenialToastSpec({ reason: '' }), null);
  assert.equal(combatDenialToastSpec({ reason: 'mystery_snake_reason' }), null);
  assert.equal(formatCombatActionRejectLine('heat_limit'), 'Too hot to act');
});

test('receipt arrival groups bursts and caps at the lane max', () => {
  const plan = planReceiptArrival([
    { text: '+1 Platinum', kind: 'info' },
    { text: '+1 Platinum', kind: 'info' },
    { text: ' ', kind: 'info' },
    { text: 'Enemy Destroyed · +800 CR', kind: 'credits' },
    { text: 'Extra line', kind: 'info' },
  ]);
  assert.deepEqual(plan, [
    { text: '+1 Platinum', kind: 'info', count: 2 },
    { text: 'Enemy Destroyed · +800 CR', kind: 'credits', count: 1 },
  ]);
});

test('prompt ladder still orders soonest deadline first', () => {
  const order = planLadder([
    { id: 'law', deadlineAt: 30, seq: 1 },
    { id: 'parley', deadlineAt: 20, seq: 2 },
  ]);
  assert.deepEqual(order, ['parley', 'law']);
});
