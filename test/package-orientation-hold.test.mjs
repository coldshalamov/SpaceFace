import test from 'node:test';
import assert from 'node:assert/strict';
import {
  noteOrientationDetachedHold,
  orientationDetachedHoldActive,
  presentedDetachRehydrateInFlight,
  queuePresentedDetachRehydrate,
  resetPackageDetachManifestsForTests,
} from '../src/render/packageCpuDetach.js';

test('every renderer sharing a graphics refill resumes after it settles', async () => {
  resetPackageDetachManifestsForTests();
  const flightRenderer = {};
  const previewRenderer = {};
  noteOrientationDetachedHold(flightRenderer);
  const refill = presentedDetachRehydrateInFlight();
  noteOrientationDetachedHold(previewRenderer);
  assert.equal(presentedDetachRehydrateInFlight(), refill, 'both views share one decode');
  assert.equal(orientationDetachedHoldActive(flightRenderer), true);
  assert.equal(orientationDetachedHoldActive(previewRenderer), true);
  await refill;
  assert.equal(orientationDetachedHoldActive(flightRenderer), false);
  assert.equal(orientationDetachedHoldActive(previewRenderer), false);

  // An ordinary draw can initiate the shared refill before either view rotates.
  const nextRefill = queuePresentedDetachRehydrate();
  noteOrientationDetachedHold(previewRenderer);
  assert.equal(presentedDetachRehydrateInFlight(), nextRefill);
  await nextRefill;
  assert.equal(orientationDetachedHoldActive(previewRenderer), false);
  assert.equal(presentedDetachRehydrateInFlight(), null);
});
