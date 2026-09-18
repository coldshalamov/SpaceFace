// Prompt deck policy contracts — headless. The deck module must stay importable without a DOM
// (src/ui/promptDeck.js keeps its pure helpers pure); these tests pin the ladder, digit routing
// and countdown grammar that the live deck and its adapters rely on.
import test from 'node:test';
import assert from 'node:assert/strict';

import { planLadder, routeDigit, deadlineText, digitIndex } from '../src/ui/promptDeck.js';

const entry = (id, deadlineAt, seq = 0, choices = []) => ({ id, deadlineAt, seq, choices });

test('ladder orders soonest deadline first, offer sequence breaks ties', () => {
  const order = planLadder([
    entry('law', 30, 1),
    entry('parley', 20, 2),
    entry('encounter', 40, 0),
    entry('customs', null, 3),
  ]);
  assert.deepEqual(order, ['parley', 'law', 'encounter', 'customs']);
});

test('ladder treats a ttl-only decision like an undisplayed deadline that still expires', () => {
  const order = planLadder([
    entry('receipt-ish', null, 5, []),
    entry('timed', 25, 6),
  ]);
  assert.deepEqual(order, ['timed', 'receipt-ish']);
});

test('digits are global display-line slots: every printed keycap fires, chips claim the rest', () => {
  const entries = [
    entry('parley', 20, 1, [{ id: 'comply' }, { id: 'refuse' }, { id: 'run' }]),
    entry('law', 30, 2, [{ id: 'comply' }]),
    entry('encounter', 40, 0, [{ id: 'respond' }, { id: 'log' }]),
  ];
  // Display line: parley (raised) + law full; encounter is the one chip.
  // Walk: comply=1 refuse=2 run=3 law-comply=4, chip encounter=5.
  assert.deepEqual(routeDigit(entries, 'parley', '1'), { type: 'choose', id: 'parley', choiceId: 'comply' });
  assert.deepEqual(routeDigit(entries, 'parley', '3'), { type: 'choose', id: 'parley', choiceId: 'run' });
  assert.deepEqual(routeDigit(entries, 'parley', '4'), { type: 'choose', id: 'law', choiceId: 'comply' });
  assert.deepEqual(routeDigit(entries, 'parley', '5'), { type: 'raise', id: 'encounter' });
  assert.equal(routeDigit(entries, 'parley', '6'), null);
  // numpad and bare digit keys route identically
  assert.deepEqual(routeDigit(entries, 'parley', 'Digit2'), { type: 'choose', id: 'parley', choiceId: 'refuse' });
  assert.deepEqual(routeDigit(entries, 'parley', 'Numpad3'), { type: 'choose', id: 'parley', choiceId: 'run' });
});

test('a player raise re-orders the display line and the digit walk follows what is printed', () => {
  const entries = [
    entry('a', 20, 1, [{ id: 'x' }]),
    entry('b', 30, 2, [{ id: 'y' }]),
    entry('c', 40, 3, [{ id: 'z' }]),
  ];
  // 'c' was raised: display line c, a, b — full c+a, chip b. Walk: z=1, x=2, chip b=3.
  assert.deepEqual(routeDigit(entries, 'c', '1'), { type: 'choose', id: 'c', choiceId: 'z' });
  assert.deepEqual(routeDigit(entries, 'c', '2'), { type: 'choose', id: 'a', choiceId: 'x' });
  assert.deepEqual(routeDigit(entries, 'c', '3'), { type: 'raise', id: 'b' });
  assert.equal(routeDigit(entries, 'c', '4'), null);
  // a stale raised id falls back to the ladder head
  assert.deepEqual(routeDigit(entries, 'gone', '1'), { type: 'choose', id: 'a', choiceId: 'x' });
});

test('disabled choices never claim a digit — the key routes to the next visible thing', () => {
  const entries = [
    entry('law', 30, 1, [{ id: 'comply', disabled: true }, { id: 'flee' }]),
  ];
  // digit 1 targets the first NON-disabled choice (flee), digit 2 raises (no chips → null)
  assert.deepEqual(routeDigit(entries, 'law', '1'), { type: 'choose', id: 'law', choiceId: 'flee' });
  assert.equal(routeDigit(entries, 'law', '2'), null);
});

test('countdown grammar counts whole seconds and stands down to the flight-active line', () => {
  assert.equal(deadlineText(30, 18.4), 'Choose a response · 12 seconds');
  assert.equal(deadlineText(30, 29.2), 'Choose a response · 1 second');
  assert.equal(deadlineText(30, 40), 'Choose a response · 0 seconds');
  assert.equal(deadlineText(null, 10), 'Choose a response. Flight remains active.');
  assert.equal(deadlineText(30, 18, 'SCAN AUTHORIZED'), 'SCAN AUTHORIZED',
    'an explicit status flag replaces the countdown line (the flag slot repeats it)');
});

test('digit parsing covers bare keys and both keypad code families', () => {
  assert.equal(digitIndex('5'), 4);
  assert.equal(digitIndex('Digit9'), 8);
  assert.equal(digitIndex('Numpad1'), 0);
  assert.equal(digitIndex('Digit0'), -1);
  assert.equal(digitIndex('Tab'), -1);
});
