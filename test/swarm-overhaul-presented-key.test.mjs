// On-screen harness key: admission labels collapse, and a body presents at most two
// real picture changes per 10 s. The machine state stays readable for the kick.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  holdPresentedHarnessKey,
  machineAuthoredAssetState,
  notePresentedAdmissionRefused,
  PRESENTED_KEY_CAP,
} from '../src/render/lod.js';

test('pending admission labels do not re-key an on-screen body', () => {
  assert.equal(PRESENTED_KEY_CAP, 2);
  const ud = { authoredAssetState: 'awaiting-authored-admission', _appliedLodLevel: 'lod1' };
  assert.equal(holdPresentedHarnessKey(ud, 0, true), 'awaiting-authored-admission');
  ud.authoredAssetState = 'loading';
  assert.equal(holdPresentedHarnessKey(ud, 0.2, true), 'awaiting-authored-admission');
  assert.equal(machineAuthoredAssetState(ud), 'loading');
  ud.authoredAssetState = 'compiling-pipelines';
  assert.equal(holdPresentedHarnessKey(ud, 0.4, true), 'awaiting-authored-admission');
  assert.equal(machineAuthoredAssetState(ud), 'compiling-pipelines');
  assert.equal(ud.authoredAssetState, 'awaiting-authored-admission');
});

test('a pre-job refusal returns a parked loading label to the stand-in', () => {
  const ud = { authoredAssetState: 'awaiting-authored-admission', _appliedLodLevel: 'lod1' };
  holdPresentedHarnessKey(ud, 0, true);
  ud.authoredAssetState = 'loading';
  holdPresentedHarnessKey(ud, 0.2, true);
  assert.equal(ud.authoredAssetState, 'awaiting-authored-admission');
  assert.equal(machineAuthoredAssetState(ud), 'loading');
  notePresentedAdmissionRefused(ud);
  assert.equal(ud.authoredAssetState, 'awaiting-authored-admission');
  assert.equal(machineAuthoredAssetState(ud), 'awaiting-authored-admission');
  assert.equal(holdPresentedHarnessKey(ud, 0.4, true), 'awaiting-authored-admission');
  assert.equal(machineAuthoredAssetState(ud), 'awaiting-authored-admission');
  const fresh = { authoredAssetState: 'loading', _appliedLodLevel: 'lod1' };
  holdPresentedHarnessKey(fresh, 0, true);
  notePresentedAdmissionRefused(fresh);
  assert.equal(fresh.authoredAssetState, 'awaiting-authored-admission');
  assert.equal(machineAuthoredAssetState(fresh), 'awaiting-authored-admission');
});

test('the authored commit is one publish, and a third picture change holds', () => {
  const ud = {
    authoredAssetState: 'awaiting-authored-admission',
    authoredCompositionId: 'DIRECT_AUTHORED_ADMISSION',
    _appliedLodLevel: 'lod1',
  };
  holdPresentedHarnessKey(ud, 0, true);
  ud.authoredAssetState = 'authored';
  ud.authoredCompositionId = 'GLTFKIT_ship_wasp';
  assert.equal(holdPresentedHarnessKey(ud, 1, true), 'authored');
  assert.equal(ud.authoredCompositionId, 'GLTFKIT_ship_wasp');
  ud._appliedLodLevel = 'lod2';
  assert.equal(holdPresentedHarnessKey(ud, 2, true), 'authored');
  assert.equal(ud._appliedLodLevel, 'lod2');
  ud._appliedLodLevel = 'lod0';
  holdPresentedHarnessKey(ud, 3, true);
  assert.equal(ud._appliedLodLevel, 'lod2', 'third change inside the window is held');
  ud._appliedLodLevel = 'lod0';
  holdPresentedHarnessKey(ud, 3 + 10, true);
  assert.equal(ud._appliedLodLevel, 'lod0', 'the window rolls');
});
