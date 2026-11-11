// words-field-counts — the counts outside the station screens can count to one.
//
// The station screens' count lines were repaired (words-receipt-counts, words-yard-count-lines);
// these are the field surfaces that read the same numbers to a different player: the automation
// operation's screen-reader summary, the recovery prompt's custody threshold, the asteroid site
// transfer announcement, the depot-run news beat, the borrowed-sun carrier's stock and trade
// register, and a claim defense warning's wing size. "1 units", "1 credits per minute" and
// "1 ships" were leaks, not voice.
import test from 'node:test';
import assert from 'node:assert/strict';

import { describeProgrammedMinerOperation, OPERATING_STATE } from '../src/systems/automationOperations.js';
import { recoveryCustodyView } from '../src/ui/recoveryEncounterPrompt.js';

test('the automation summary counts one unit and one credit in the singular', () => {
  const one = describeProgrammedMinerOperation({
    operation: {
      operatingState: OPERATING_STATE.RUNNING, label: 'Running',
      grossUnits: 1, storedUnits: 1, storedCap: 1,
      operatingCostPerMin: 1, netThroughputPerMin: -1,
    },
  });
  assert.ok(one.accessibleSummary.includes('Gross cut 1 unit.'), `"${one.accessibleSummary}"`);
  assert.ok(one.accessibleSummary.includes('Stored 1 of 1 unit.'), 'the stored count reads the cap');
  assert.ok(one.accessibleSummary.includes('Operating cost 1 credit per minute.'), 'one credit');
  const many = describeProgrammedMinerOperation({
    operation: {
      operatingState: OPERATING_STATE.RUNNING, label: 'Running',
      grossUnits: 12, storedUnits: 4, storedCap: 20,
      operatingCostPerMin: 9, netThroughputPerMin: 30,
    },
  });
  assert.ok(many.accessibleSummary.includes('Gross cut 12 units.'), 'the plural keeps its s');
  assert.ok(many.accessibleSummary.includes('Operating cost 9 credits per minute.'), 'plural credits');
});

test('the recovery custody line can ask for one unit', () => {
  const payload = { id: 'rec-1', shape: 'freight_run', phase: 'tethered', secureReel_wu: 1, destinationId: 'station_ash_cache' };
  const state = { simTime: 500 };
  const one = recoveryCustodyView(payload, state, 500);
  assert.ok(one.detail.includes('Reel to 1 unit for custody lock'), `"${one.detail}"`);
  const many = recoveryCustodyView({ ...payload, secureReel_wu: 12 }, state, 500);
  assert.ok(many.detail.includes('Reel to 12 units for custody lock'), 'the plural keeps its s');
});
