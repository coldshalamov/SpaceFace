import test from 'node:test';
import assert from 'node:assert/strict';
import { offerHistoryTierLabel } from '../src/data/missions.js';
import { contractAccessHeading, contractHistoryTierLabel } from '../src/ui/station/screens/factions.js';

function career(completed) {
  return {
    meta: { seed: 4242 },
    missions: { completedLog: Array.from({ length: completed }, () => ({ id: 'done' })) },
    world: { discovery: {} },
    player: { tradeLedger: [] },
    fieldDepletion: { fields: {} },
    story: { beatIndex: 0 },
  };
}

test('seed 4242: the contracts desk names the history tier, and a new pilot reads First contracts', () => {
  assert.equal(offerHistoryTierLabel(0), 'First contracts');
  assert.equal(contractHistoryTierLabel(career(0)), 'First contracts');
  assert.equal(contractAccessHeading(career(0)), 'Contract access · First contracts');
  assert.equal(contractHistoryTierLabel(career(2)), 'Working spacer');
  assert.match(contractAccessHeading(career(2)), /Working spacer/);
  assert.equal(contractHistoryTierLabel(career(5)), 'Established');
  assert.equal(contractHistoryTierLabel(career(12)), 'Veteran');
});
