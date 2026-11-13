import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleDockedStationPresentation } from '../src/ui/uiRoot.js';

function docked() {
  return { state: { mode: 'flight', ui: { docked: true, dockedStationId: 's1' } } };
}

test('the arrival beat waits its delay, and any key ends it early with the same swap', () => {
  const owner = docked();
  const calls = [];
  scheduleDockedStationPresentation(owner, 's1', (finish) => { calls.push('present'); finish(); }, () => calls.push('release'), { delayMs: 60000 });
  const pending = owner._pendingDockedStationPresentation;
  assert.equal(calls.length, 0, 'the screen has not opened yet');
  assert.equal(pending.skip(), true);
  assert.deepEqual(calls, ['present', 'release']);
  assert.equal(pending.skip(), false, 'a second key does nothing');
});

test('an invalidated arrival cannot be skipped into a stale screen', () => {
  const owner = docked();
  const calls = [];
  scheduleDockedStationPresentation(owner, 's1', () => calls.push('present'), () => calls.push('release'), { delayMs: 60000 });
  const pending = owner._pendingDockedStationPresentation;
  owner.state.ui.docked = false;
  pending.skip();
  assert.deepEqual(calls, ['release']);
});
