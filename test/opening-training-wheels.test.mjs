import test from 'node:test';
import assert from 'node:assert/strict';
import { trainingWheelsHold } from '../src/onboarding/trainingWheels.js';

const rock = { data: { rescueRole: 'rock' } };
const wheels = (over = {}) => ({ onboarding: { active: true, finished: false, firstThrowSeen: false, beatDoneAt: {}, ...over } });

test('the first loose rock cannot strain-break its line while the wheels are on', () => {
  for (const reason of ['threshold', 'brace_overload', 'overload', 'snap', 'line_overclass_snap', 'npc_tractor_phase']) {
    assert.equal(trainingWheelsHold(wheels(), rock, reason), true, reason);
  }
});

test('the pilot can always cut, release or lose the target: only strain breaks are withheld', () => {
  for (const reason of ['tether_cut', 'target_lost', 'accepted', 'endpoint_lost', 'break']) {
    assert.equal(trainingWheelsHold(wheels(), rock, reason), false, reason);
  }
});

test('wheels come off after the first throw, outside the tutorial, and for any other body', () => {
  assert.equal(trainingWheelsHold(wheels({ firstThrowSeen: true }), rock, 'threshold'), false);
  assert.equal(trainingWheelsHold(wheels({ beatDoneAt: { raid: 1 } }), rock, 'threshold'), false);
  assert.equal(trainingWheelsHold(wheels({ active: false }), rock, 'threshold'), true, 'the wheels do not wait for the rail to speak');
  assert.equal(trainingWheelsHold(wheels({ finished: true }), rock, 'threshold'), false);
  assert.equal(trainingWheelsHold(wheels(), { data: {} }, 'threshold'), false);
  assert.equal(trainingWheelsHold({}, rock, 'threshold'), false);
});
