// words-offline-receipt — the away receipt names only what moved, and can count to one.
//
// Player problem: coming back to a hull whose drones earned while the upkeep lapsed read
// "While you were away (2.1h): +0 cr wallet change · +0 cr earned · 0 cr upkeep · 2 lost"
// — three clauses that say nothing, and a "lost" with no noun. The receipt now names only
// the facts that happened, says what was lost, and reads a sub-minute absence honestly.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  awayDurationLabel,
  formatOfflineReceiptLine,
  isOfflineReceiptShowable,
} from '../src/ui/automationPayoff.js';

test('a one-sided receipt stops printing the zero side of the ledger', () => {
  const line = formatOfflineReceiptLine({ elapsedSec: 7560, credited: 0, upkeepCharged: 400 });
  assert.equal(line, 'While you were away (2.1h): 400 cr upkeep');
  const clauses = line.split(': ')[1].split(' · ');
  assert.ok(!clauses.some((clause) => /^\+0|^-0|^[+-]?0 cr /.test(clause)), 'no zero clause anywhere on the receipt');
  assert.ok(!clauses.includes('wallet change') && !clauses.some((c) => c.includes('wallet change')),
    'a net that mirrors one clause is not said twice');
});

test('an earning hull with no upkeep bill reads the earn honestly', () => {
  const line = formatOfflineReceiptLine({ elapsedSec: 3600, credited: 1200, upkeepCharged: 0 });
  assert.equal(line, 'While you were away (1.0h): +1,200 cr earned');
});

test('the full ledger keeps every nonzero clause in order', () => {
  const line = formatOfflineReceiptLine({
    elapsedSec: 36000, credited: 1200, upkeepCharged: 1500, upkeepUnpaid: 200, lost: 3,
  });
  assert.equal(
    line,
    'While you were away (10h): −300 cr wallet change · +1,200 cr earned · 1,500 cr upkeep'
    + ' · 200 cr unpaid (not yet charged) · 3 assets lost',
  );
});

test('one lost asset is named as an asset', () => {
  const line = formatOfflineReceiptLine({ elapsedSec: 3600, credited: 0, upkeepCharged: 0, lost: 1 });
  assert.equal(line, 'While you were away (1.0h): 1 asset lost');
});

test('a distressed-only receipt still reads as a sentence', () => {
  const line = formatOfflineReceiptLine({ elapsedSec: 3600, credited: 0, upkeepCharged: 0, distressed: true });
  assert.equal(line, 'While you were away (1.0h): assets distressed');
  const empty = formatOfflineReceiptLine({ elapsedSec: 3600, credited: 0, upkeepCharged: 0 });
  assert.equal(empty, 'While you were away (1.0h): nothing moved');
});

test('a short absence never reads as a zero-hour fraction', () => {
  assert.equal(
    formatOfflineReceiptLine({ elapsedSec: 40, credited: 50, upkeepCharged: 0 }),
    'While you were away (under a minute): +50 cr earned',
  );
  assert.equal(
    formatOfflineReceiptLine({ elapsedSec: 700, credited: 80, upkeepCharged: 10 }),
    'While you were away (12 min): +70 cr wallet change · +80 cr earned · 10 cr upkeep',
  );
  assert.equal(awayDurationLabel(0), 'under a minute');
  assert.equal(awayDurationLabel(-5), 'under a minute');
  assert.equal(awayDurationLabel(59), 'under a minute');
  assert.equal(awayDurationLabel(60), '1 min');
  assert.equal(awayDurationLabel(3599), '60 min');
  assert.equal(awayDurationLabel(3600), '1.0h');
  assert.equal(awayDurationLabel(36000), '10h');
});

test('the showable gate still refuses receipts where nothing happened at all', () => {
  assert.equal(isOfflineReceiptShowable({ elapsedSec: 40, credited: 0, upkeepCharged: 0 }), false);
  assert.equal(isOfflineReceiptShowable({ elapsedSec: 40, credited: 0, upkeepCharged: 0, distressed: true }), true);
});
