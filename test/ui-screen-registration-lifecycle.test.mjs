import test from 'node:test';
import assert from 'node:assert/strict';

import {
  beginScreenRegistrationCycle,
  invalidateScreenRegistrationCycle,
  isScreenRegistrationCycleCurrent,
} from '../src/ui/uiRoot.js';

test('a destroyed or reinitialized uiRoot cannot complete stale screen registrations', () => {
  const firstManager = { id: 'first' };
  const owner = { screenManager: firstManager };
  const firstCycle = beginScreenRegistrationCycle(owner, firstManager);
  assert.equal(isScreenRegistrationCycleCurrent(firstCycle), true);

  invalidateScreenRegistrationCycle(owner);
  owner.screenManager = null;
  assert.equal(isScreenRegistrationCycleCurrent(firstCycle), false);

  owner.screenManager = firstManager;
  assert.equal(
    isScreenRegistrationCycleCurrent(firstCycle),
    false,
    'restoring the old manager reference must not revive a destroyed registration generation',
  );

  const secondManager = { id: 'second' };
  owner.screenManager = secondManager;
  const secondCycle = beginScreenRegistrationCycle(owner, secondManager);
  assert.equal(isScreenRegistrationCycleCurrent(firstCycle), false);
  assert.equal(isScreenRegistrationCycleCurrent(secondCycle), true);
});
