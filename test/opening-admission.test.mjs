import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOpeningAdmissionCohort,
  openingSliceWithinBudget,
} from '../src/render/openingAdmission.js';
import { createPipelineAdmissionTracker } from '../src/render/pipelineReadiness.js';

test('frozen opening cohort rejects late identities without growing the watermark', () => {
  const cohort = createOpeningAdmissionCohort({ nowMs: 10 });
  const captured = cohort.capture(['player:kestrel', 'station:helios']);
  assert.equal(captured.frozen, true);
  assert.equal(captured.size, 2);
  assert.equal(cohort.admits('player:kestrel'), true);
  assert.equal(cohort.admits('traffic:late-hauler'), false);
  assert.equal(cohort.extendBlocked('traffic:late-hauler'), false);
  assert.equal(cohort.size, 2);
  assert.deepEqual(cohort.snapshot().identities, ['player:kestrel', 'station:helios']);
});

test('live pipeline tracker watermark ignores later pending roots', async () => {
  const completions = [];
  const tracker = createPipelineAdmissionTracker((subjects) => {
    completions.push(subjects.map((subject) => subject.id));
    return Promise.resolve();
  }, { quietMs: 0, maxWaitMs: 0, deferAutoFlush: () => true });
  const early = tracker.compile({ id: 'player' });
  const plan = tracker.capturePending();
  tracker.compile({ id: 'late-traffic' });
  await tracker.waitForCaptured(plan);
  await early;
  assert.deepEqual(completions[0], ['player']);
  assert.ok(plan.watermark >= 1);
});

test('opening slice budget uses the live helper, not a hardcoded pass', () => {
  assert.equal(openingSliceWithinBudget(7, { targetMs: 8, hardMs: 12 }).targetMet, true);
  assert.equal(openingSliceWithinBudget(10, { targetMs: 8, hardMs: 12 }).targetMet, false);
  assert.equal(openingSliceWithinBudget(10, { targetMs: 8, hardMs: 12 }).hardMet, true);
  assert.equal(openingSliceWithinBudget(13, { targetMs: 8, hardMs: 12 }).ok, false);
});
