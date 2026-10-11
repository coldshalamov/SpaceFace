// h7's moral return picks the first pending debt whose cause may come back.
// Nameless pod debts stay on the ledger in record order; they are not a corsair return.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MORAL_RETURN_CAUSES,
  MORAL_RETURN_CAUSE_PREFIXES,
  moralCauseMayReturn,
  nextMoralDebt,
  rememberMoralDebt,
} from '../src/systems/moralMemory.js';

const EXCLUDED_POD_CAUSES = ['captured_survivors', 'abandoned_survivors', 'ransomed_survivors'];

function freshState() {
  return { simTime: 10, meta: { seed: 7 }, story: { flags: {} } };
}

function remember(state, id, cause, t) {
  return rememberMoralDebt(state, {
    id,
    name: cause.endsWith('_survivors') ? 'Survivor Pod' : id,
    cause,
    factionId: 'faction_reach',
    t,
    source: 'test:moral-return-cause',
  });
}

test('the returnable set is the named-opponent causes plus a rescued pod', () => {
  assert.deepEqual([...MORAL_RETURN_CAUSES].sort(), [
    'accepted_surrender',
    'escaped_custody',
    'executed_prisoner',
    'rescued_survivors',
    'spared',
    'spared_escape',
  ]);
  assert.deepEqual([...MORAL_RETURN_CAUSE_PREFIXES], ['moral_trap:']);
  assert.equal(moralCauseMayReturn('moral_trap:passenger_is_fugitive:turn_in'), true);
  for (const cause of EXCLUDED_POD_CAUSES) assert.equal(moralCauseMayReturn(cause), false);
});

test('a pending pod capture is skipped for the later spared debt', () => {
  const state = freshState();
  const captured = remember(state, 'pod-captured', 'captured_survivors', 1);
  const spared = remember(state, 'pilot-spared', 'spared', 2);
  const picked = nextMoralDebt(state);
  assert.equal(picked, spared);
  assert.equal(picked.id, 'pilot-spared');
  assert.equal(picked.cause, 'spared');
  assert.equal(captured.status, 'pending');
  assert.equal(captured.cause, 'captured_survivors');
  assert.deepEqual(state.story.moralMemory.order, ['pod-captured', 'pilot-spared']);
});

test('only excluded pod debts are not a moral return', () => {
  const state = freshState();
  const debts = EXCLUDED_POD_CAUSES.map((cause, index) => remember(state, `pod-${cause}`, cause, index + 1));
  assert.equal(nextMoralDebt(state), null);
  assert.deepEqual(state.story.moralMemory.order, EXCLUDED_POD_CAUSES.map((cause) => `pod-${cause}`));
  for (const debt of debts) {
    assert.equal(debt.status, 'pending');
    assert.equal(debt.name, 'Survivor Pod');
  }
});

test('a rescued pod is still a moral return', () => {
  const state = freshState();
  const rescued = remember(state, 'pod-rescued', 'rescued_survivors', 4);
  assert.equal(nextMoralDebt(state), rescued);
  assert.equal(rescued.cause, 'rescued_survivors');
  assert.equal(rescued.status, 'pending');
});

test('an excluded pod ahead of a rescue does not hide the rescue', () => {
  const state = freshState();
  remember(state, 'pod-ransomed', 'ransomed_survivors', 1);
  remember(state, 'pod-abandoned', 'abandoned_survivors', 2);
  const rescued = remember(state, 'pod-rescued', 'rescued_survivors', 3);
  assert.equal(nextMoralDebt(state).id, rescued.id);
  assert.deepEqual(state.story.moralMemory.order, ['pod-ransomed', 'pod-abandoned', 'pod-rescued']);
});
