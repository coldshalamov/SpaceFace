import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMISSION_SLICE_MIN_ITEMS,
  ADMISSION_SLICE_TARGET_MS,
  admissionSliceOverHardLimit,
  shouldContinueAdmissionSlice,
} from '../src/render/admissionSliceBudget.js';

test('always admits the first item, then stops once the target milliseconds are spent', () => {
  assert.equal(ADMISSION_SLICE_MIN_ITEMS, 1);
  assert.equal(shouldContinueAdmissionSlice({
    startedAtMs: 0,
    nowMs: 10,
    itemsDone: 0,
    targetMs: ADMISSION_SLICE_TARGET_MS,
  }), true);
  assert.equal(shouldContinueAdmissionSlice({
    startedAtMs: 0,
    nowMs: ADMISSION_SLICE_TARGET_MS + 0.5,
    itemsDone: 1,
    targetMs: ADMISSION_SLICE_TARGET_MS,
  }), false);
  assert.equal(shouldContinueAdmissionSlice({
    startedAtMs: 0,
    nowMs: 1,
    itemsDone: 1,
    targetMs: ADMISSION_SLICE_TARGET_MS,
  }), true);
});

test('loading Infinity budget never time-slices', () => {
  assert.equal(shouldContinueAdmissionSlice({
    unlimited: true,
    startedAtMs: 0,
    nowMs: 50,
    itemsDone: 8,
  }), true);
  assert.equal(shouldContinueAdmissionSlice({
    buildBudget: Infinity,
    startedAtMs: 0,
    nowMs: 50,
    itemsDone: 8,
  }), true);
});

test('hard-limit helper flags slices that already blew the hitch ceiling', () => {
  assert.equal(admissionSliceOverHardLimit({
    startedAtMs: 0,
    nowMs: 7,
    hardMs: 8,
  }), false);
  assert.equal(admissionSliceOverHardLimit({
    startedAtMs: 0,
    nowMs: 9,
    hardMs: 8,
  }), true);
});
