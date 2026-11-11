// words-receipt-counts — the game's own receipts can count to one.
//
// Player problem: a hot docking that cashed a single salvage unit read "Salvage bay
// cashed in: 1 units for 12 cr.", the same dock said "1 units" twice more about what
// stayed behind, and the comms band said "a raider made off with 1 units of ore".
// Every count-bearing receipt line below is now a whole singular or plural sentence,
// and the money reads grouped like the station screens' other credit receipts.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  restrictedSalvageLine,
  salvageCashInLine,
  unvaluedSalvageLine,
} from '../src/systems/cargo.js';
import { raiderTheftLine } from '../src/systems/barkDirector.js';

test('the cash-in receipt names one unit in the singular', () => {
  assert.equal(salvageCashInLine(1, 12), 'Salvage bay cashed in: 1 unit for 12 cr.');
});

test('the cash-in receipt counts many units and groups the money', () => {
  assert.equal(
    salvageCashInLine(38, 25000),
    'Salvage bay cashed in: 38 units for 25,000 cr.',
    'large credit totals read like every other station receipt',
  );
});

test('the cash-in receipt never prints a negative or fractional count', () => {
  assert.equal(salvageCashInLine(0, 0), 'Salvage bay cashed in: 0 units for 0 cr.');
  assert.equal(salvageCashInLine(2.9, 250.6), 'Salvage bay cashed in: 2 units for 251 cr.');
  assert.equal(salvageCashInLine(NaN, undefined), 'Salvage bay cashed in: 0 units for 0 cr.');
});

test('the restricted-salvage refusal names one unit in the singular', () => {
  assert.equal(
    restrictedSalvageLine(1),
    "Restricted salvage stays in your bay: 1 unit. Lawful docks won't buy it.",
  );
  assert.equal(
    restrictedSalvageLine(5),
    "Restricted salvage stays in your bay: 5 units. Lawful docks won't buy it.",
  );
});

test('the unvalued-salvage note names one unit in the singular', () => {
  assert.equal(
    unvaluedSalvageLine(1),
    'Salvage remains in your bay: 1 unit could not be valued or paid.',
  );
  assert.equal(
    unvaluedSalvageLine(12),
    'Salvage remains in your bay: 12 units could not be valued or paid.',
  );
});

test('the band theft receipt names one unit in the singular', () => {
  assert.equal(
    raiderTheftLine('a Drift raider', 1, 'Platinoid Ore', 'the belt'),
    'a Drift raider made off with 1 unit of Platinoid Ore — last seen headed the belt.',
  );
});

test('the band theft receipt counts many and keeps the bearing clause', () => {
  assert.equal(
    raiderTheftLine('an Understory raider', 24, 'Refined Metals', 'the gate'),
    'an Understory raider made off with 24 units of Refined Metals — last seen headed the gate.',
  );
});

test('the band theft receipt falls back to honest nouns when the lookups miss', () => {
  assert.equal(
    raiderTheftLine('', 3, '', ''),
    'a raider made off with 3 units of cargo.',
    'no name and no commodity id still reads as words, never a raw id',
  );
  assert.equal(
    raiderTheftLine(null, 0, 'Platinoid Ore'),
    'a raider made off with 0 units of Platinoid Ore.',
    'the caller guards qty <= 0 before speaking; the words stay honest anyway',
  );
});
