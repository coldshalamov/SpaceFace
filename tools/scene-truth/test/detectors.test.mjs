import assert from 'node:assert/strict';
import test from 'node:test';
import { runCritique } from '../lib/critique.mjs';
import { SCENE_TRUTH_TOLERANCE } from '../lib/constants.mjs';
import { faultCases } from '../lib/faults.mjs';

test('planted faults are detected and benign cases are allowed', () => {
  const critique = runCritique();
  const failed = critique.attempts.filter((row) => !row.ok);
  assert.deepEqual(failed, [], critique.summary);
  assert.ok(faultCases().length >= 15);
  assert.ok(critique.benign.length >= 5);
  assert.equal(critique.faults.length, faultCases().length);
  assert.ok(critique.faults.every((row) => row.detected));
  assert.ok(critique.benign.every((row) => row.highCount === 0));
  assert.equal(critique.drift.failBuild, false);
  assert.equal(SCENE_TRUTH_TOLERANCE.pixelDriftFailsBuild, false);
});
