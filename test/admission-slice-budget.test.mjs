import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMISSION_SLICE_MIN_ITEMS,
  ADMISSION_SLICE_TARGET_MS,
  admissionSliceOverHardLimit,
  shouldContinueAdmissionSlice,
  shouldRedrawAfterLatePresent,
  shouldStartHeavyAdmission,
  shouldStartHeavyAdmissionEventually,
  shouldStartWorkAfterLatePresent,
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

test('late presents do not start another heavy admission', () => {
  assert.equal(shouldStartHeavyAdmission(16.7), true);
  assert.equal(shouldStartHeavyAdmission(21), true);
  assert.equal(shouldStartHeavyAdmission(33.3), false);
  assert.equal(shouldStartHeavyAdmission(undefined), true);
});

test('overlay recovery may force the next frame; heavy mesh builds must not', () => {
  assert.equal(shouldStartWorkAfterLatePresent(33.3, false), false);
  assert.equal(shouldStartWorkAfterLatePresent(33.3, true), true);
  assert.equal(shouldStartHeavyAdmission(33.3), false);
});

test('sustained late presents still start one heavy item after several skips', () => {
  let skipped = 0;
  for (let i = 0; i < 7; i++) {
    const gate = shouldStartHeavyAdmissionEventually(33.3, skipped);
    assert.equal(gate.start, false);
    skipped = gate.skippedCount;
  }
  const released = shouldStartHeavyAdmissionEventually(33.3, skipped);
  assert.equal(released.start, true);
  assert.equal(released.skippedCount, 0);
  const recovered = shouldStartHeavyAdmissionEventually(16.7, 7);
  assert.equal(recovered.start, true);
  assert.equal(recovered.skippedCount, 0);
});

test('live drain and upgrade consult the late-present gate', async () => {
  const { readFile } = await import('node:fs/promises');
  const renderer = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const parts = await readFile(new URL('../src/render/partsLibrary.js', import.meta.url), 'utf8');
  assert.match(renderer, /shouldStartHeavyAdmissionEventually\(/);
  assert.match(renderer, /_meshBuildLateSkips/);
  assert.match(parts, /shouldStartHeavyAdmissionEventually\(/);
  assert.match(parts, /lateSkips/);
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

test('a late present keeps last overlay pixels one frame, then must redraw', () => {
  assert.equal(shouldRedrawAfterLatePresent(16.7, false), true);
  assert.equal(shouldRedrawAfterLatePresent(33.3, false), false);
  assert.equal(shouldRedrawAfterLatePresent(33.3, true), true);
});

test('live speed-line overlay consults the late-present redraw gate', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/render/feel.js', import.meta.url), 'utf8');
  assert.match(source, /shouldRedrawAfterLatePresent/);
});
