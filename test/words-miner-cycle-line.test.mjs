// words-miner-cycle-line — the programmed miner's closed-cycle line reads as whole sentences.
// SF-115's cycle note used to read "cut 1u, sold 1u for 5 cr · upkeep -0 cr · fuel 1u → net 3 cr":
// bare abbreviations in prose, no singular branch, an upkeep clause printed even when nothing was
// owed, ungrouped money, and a zero net printed as a signed number. The same line feeds the
// screen-reader summary, so a blind pilot heard the abbreviations too.
import assert from 'node:assert/strict';
import test from 'node:test';

import { describeProgrammedMinerOperation } from '../src/systems/automationOperations.js';

const DEF = { bufferCap: 50 };

function groupWithCycle(cycle, lastSale = null) {
  return { operation: { lastCycle: cycle, lastSale, storedUnits: 0, storedCap: 50 } };
}

test('a one-unit run reads whole singular sentences with no bare abbreviation', () => {
  const readout = describeProgrammedMinerOperation(
    groupWithCycle({
      carryInUnits: 0, minedUnits: 1, quantity: 1, soldUnits: 1, withdrawnUnits: 0,
      credited: 5, upkeepAccrued: 0, fuelUsed: 1, heldUnits: 0, netCr: 4,
    }),
    DEF,
  );
  assert.equal(readout.cycleText,
    'Last run: cut 1 unit, sold 1 unit for 5 cr · burned 1 unit of fuel → net +4 cr');
  // No upkeep clause when nothing was owed; no "-0 cr".
  assert.ok(!readout.cycleText.includes('upkeep'), 'an unpaid cycle prints no upkeep clause');
  assert.ok(!/[0-9]u\b/.test(readout.cycleText), 'no bare "Nu" abbreviation survives');
});

test('a many-unit run counts plurals, groups money, and names every stock movement', () => {
  const readout = describeProgrammedMinerOperation(
    groupWithCycle({
      carryInUnits: 0, minedUnits: 12, quantity: 12, soldUnits: 12, withdrawnUnits: 1,
      credited: 12345, upkeepAccrued: 7, fuelUsed: 3, heldUnits: 2, netCr: -8,
    }),
    DEF,
  );
  assert.equal(readout.cycleText,
    'Last run: cut 12 units, sold 12 units for 12,345 cr · upkeep cost 7 cr'
    + ' · burned 3 units of fuel · lost 1 unit · 2 units still held → net -8 cr');
});

test('a zero net reads "broke even" instead of a signed nothing', () => {
  const readout = describeProgrammedMinerOperation(
    groupWithCycle({
      carryInUnits: 0, minedUnits: 4, quantity: 4, soldUnits: 4, withdrawnUnits: 0,
      credited: 6, upkeepAccrued: 6, fuelUsed: 0, heldUnits: 0, netCr: 0,
    }),
    DEF,
  );
  assert.ok(readout.cycleText.endsWith('→ broke even'), `got: ${readout.cycleText}`);
  assert.ok(!readout.cycleText.includes('fuel'), 'a dry cycle prints no fuel clause');
  assert.ok(!readout.cycleText.includes('net 0'), 'no "net 0 cr" non-event');
});

test('the last-sale chip counts to one and groups big receipts', () => {
  const one = describeProgrammedMinerOperation(
    groupWithCycle(null, { credited: 12345, quantity: 1 }), DEF);
  assert.equal(one.lastText, '12,345 cr for 1 unit');
  const many = describeProgrammedMinerOperation(
    groupWithCycle(null, { credited: 40, quantity: 5 }), DEF);
  assert.equal(many.lastText, '40 cr for 5 units');
  const none = describeProgrammedMinerOperation(groupWithCycle(null), DEF);
  assert.equal(none.lastText, 'No sale yet');
});

test('the screen-reader summary carries the counted cycle line, never NaN or junk', () => {
  const readout = describeProgrammedMinerOperation(
    groupWithCycle({
      carryInUnits: 0, minedUnits: 1, quantity: 1, soldUnits: 1, withdrawnUnits: 0,
      credited: 5, upkeepAccrued: 0, fuelUsed: NaN, heldUnits: 0, netCr: 4,
    }),
    DEF,
  );
  assert.ok(readout.accessibleSummary.includes(readout.cycleText),
    'the spoken summary reads the same counted line');
  assert.ok(!/NaN|undefined/.test(readout.accessibleSummary), 'junk numbers never leak as NaN');
  const junk = describeProgrammedMinerOperation(
    groupWithCycle({
      minedUnits: 'x', quantity: null, credited: -5, upkeepAccrued: NaN,
      fuelUsed: Infinity, heldUnits: {}, withdrawnUnits: '3', netCr: NaN,
    }),
    DEF,
  );
  assert.ok(!/NaN|undefined/.test(junk.cycleText), 'a corrupt cycle still reads honest words');
});
