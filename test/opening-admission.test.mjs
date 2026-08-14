import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOpeningAdmissionCohort,
  openingSliceWithinBudget,
  openingSubjectIdentity,
  shouldAdmitOpeningSubject,
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

test('frozen cohort gates late compile subjects through admits()', () => {
  const cohort = createOpeningAdmissionCohort();
  const player = { uuid: 'player-root', userData: { entityId: 1 } };
  const late = { uuid: 'late-root', userData: { entityId: 99 } };
  cohort.capture([openingSubjectIdentity(player)]);
  assert.equal(shouldAdmitOpeningSubject(cohort, player), true);
  assert.equal(shouldAdmitOpeningSubject(cohort, late), false);
  assert.equal(cohort.admits(openingSubjectIdentity(late)), false);
});

test('resumed compile waits when the last present was late', async () => {
  const compiles = [];
  const resumes = [];
  let last = 33.3;
  const tracker = createPipelineAdmissionTracker((subjects) => {
    compiles.push(subjects.map((subject) => subject.id));
    return Promise.resolve();
  }, {
    quietMs: 0,
    maxWaitMs: 0,
    scheduleResume: (callback) => { resumes.push(callback); },
    getLastPresentDtMs: () => last,
  });
  tracker.resumeAutoFlush();
  const done = tracker.compile({ id: 'traffic' });
  assert.equal(compiles.length, 0);
  assert.equal(resumes.length, 1);
  resumes.shift()();
  assert.equal(compiles.length, 0, 'a late present must not start a compile');
  last = 16.7;
  assert.ok(resumes.length >= 1);
  resumes.shift()();
  await done;
  assert.deepEqual(compiles[0], ['traffic']);
});

test('opening slice budget uses the live helper, not a hardcoded pass', () => {
  assert.equal(openingSliceWithinBudget(7, { targetMs: 8, hardMs: 12 }).targetMet, true);
  assert.equal(openingSliceWithinBudget(10, { targetMs: 8, hardMs: 12 }).targetMet, false);
  assert.equal(openingSliceWithinBudget(10, { targetMs: 8, hardMs: 12 }).hardMet, true);
  assert.equal(openingSliceWithinBudget(13, { targetMs: 8, hardMs: 12 }).ok, false);
});
