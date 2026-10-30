// The mission log's settled receipts say why a contract failed in the same words as the failure
// toast (one map: src/data/missionFailReasons.js), and a voided failure that handed the deposit
// back shows the refund instead of a bare "No payout".
import test from 'node:test';
import assert from 'node:assert/strict';
import { missionReceiptRows } from '../src/ui/screens/missionLog.js';
import { FAIL_REASON_WORD, failReasonWord } from '../src/data/missionFailReasons.js';

const receipt = (over) => ({
  missionId: 'm1', type: 'bounty_hunt', title: 'Mark', outcome: 'failed',
  rewardCr: 0, collateralLostCr: 0, collateralRefundCr: 0, repDelta: 0, ...over,
});
const row = (over) => missionReceiptRows({ missions: { receipts: [receipt(over)] } }, 1)[0];

test('every known failure reason reads as the toast words, sentence-cased, never a raw id', () => {
  for (const [id, words] of Object.entries(FAIL_REASON_WORD)) {
    const { meta } = row({ reason: id });
    const expected = 'Reason: ' + words.charAt(0).toUpperCase() + words.slice(1);
    assert.ok(meta.includes(expected), `${id}: ${meta}`);
    assert.doesNotMatch(meta, /_/, `${id} leaks an internal id: ${meta}`);
  }
});

test('race DNF and expired receipts use the shared words', () => {
  assert.match(row({ reason: 'race_left_course' }).meta, /Reason: You left the course/);
  assert.match(row({ outcome: 'expired', reason: 'deadline' }).meta, /Reason: The window lapsed/);
});

test('a broken contract term names the term, matching the toast', () => {
  const words = failReasonWord('clause_broken:no_scan');
  assert.ok(words);
  const { meta } = row({ reason: 'clause_broken:no_scan' });
  assert.ok(meta.includes('Reason: ' + words.charAt(0).toUpperCase() + words.slice(1)), meta);
  assert.doesNotMatch(meta, /Clause Broken|no_scan/);
});

test('an unknown reason prints no reason rather than a title-cased id', () => {
  const { meta } = row({ reason: 'some_internal_code' });
  assert.doesNotMatch(meta, /Reason:/);
  assert.doesNotMatch(meta, /Some Internal Code/i);
});

test('a voided failure shows the returned deposit; a forfeit still shows the loss', () => {
  const voided = row({ reason: 'failed_external', collateralRefundCr: 120 });
  assert.match(voided.body, /No payout · 120 cr stake returned/);
  assert.doesNotMatch(voided.body, /forfeited/);
  assert.match(voided.meta, /Reason: The objective went down to someone else/);

  const forfeit = row({ reason: 'abandoned', collateralLostCr: 300, repDelta: -3 });
  assert.match(forfeit.body, /No payout · -3 contract standing · 300 cr stake forfeited/);
  assert.doesNotMatch(forfeit.body, /returned/);
});
