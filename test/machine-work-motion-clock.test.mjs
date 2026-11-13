import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMachineMesh } from '../src/render/machineVisuals.js';

function entity(winding = false) {
  return { data: { machine: { kind: 'surveyor_prism', visualScanWinding: winding } } };
}
function scanner(root) { return root.children.find(child => child.isGroup); }
function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`); }

test('absolute clock initializes the current pose and eases later transitions', () => {
  const e = entity(false), root = buildMachineMesh(e), arm = scanner(root);
  root.userData.updateAuthoredMotion(e, 100);
  near(arm.rotation.x, 0.5);
  e.data.machine.visualScanWinding = true;
  root.userData.updateAuthoredMotion(e, 100.016);
  near(arm.rotation.x, 0.5 - 1.1 * 0.016 * 3.2);
  near(arm.rotation.y, 100.016 * 0.7);
  const pose = arm.rotation.x;
  root.userData.updateAuthoredMotion(e, 100.016);
  near(arm.rotation.x, pose);
  root.userData.updateAuthoredMotion(e, 3);
  near(arm.rotation.x, pose);
  root.userData.updateAuthoredMotion(e, 3.1);
  assert.ok(arm.rotation.x < pose && arm.rotation.x > -0.6, 'movement resumes smoothly after a clock reset');

  const alreadyWorking = entity(true), workingRoot = buildMachineMesh(alreadyWorking);
  workingRoot.userData.updateAuthoredMotion(alreadyWorking, 400);
  near(scanner(workingRoot).rotation.x, -0.6);
});

test('explicit and default deltas retain their supported behavior', () => {
  const e = entity(false), root = buildMachineMesh(e), arm = scanner(root);
  root.userData.updateAuthoredMotion(0.016, e);
  near(arm.rotation.x, 0.5);
  e.data.machine.visualScanWinding = true;
  root.userData.updateAuthoredMotion(0.016, e);
  near(arm.rotation.x, 0.5 - 1.1 * 0.016 * 3.2);
  const first = arm.rotation.x;
  root.userData.updateAuthoredMotion(0, e);
  near(arm.rotation.x, first);
  root.userData.updateAuthoredMotion(e);
  assert.ok(arm.rotation.x < first && arm.rotation.x > -0.6);
  const beforeAbsolute = arm.rotation.x;
  root.userData.updateAuthoredMotion(e, 75);
  near(arm.rotation.x, beforeAbsolute);
  root.userData.updateAuthoredMotion(e, 75.016);
  assert.ok(arm.rotation.x < beforeAbsolute && arm.rotation.x > -0.6);
});
