// ANI-06/07: kestrel repair-pod service arm + shoulder armour-cap peel on the shared bank.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateMotionClip } from '../src/contracts/motionBank.js';

const bank = JSON.parse(readFileSync(new URL('../assets/ships/motions/kestrel.motion.json', import.meta.url)));

function clip(name) {
  const c = bank.clips.find((x) => x.name === name);
  assert.ok(c, `clip ${name} missing`);
  return c;
}

function delta(name, t, group) {
  return evaluateMotionClip(bank, clip(name), t).get(group) || {};
}

// Bank channels are glTF-axis deltas: blender rotX stays rotX, blender rotY lands on rotZ.
function axisMag(d, idx) {
  if (!d.rotation) return 0;
  return 2 * Math.abs(Math.asin(Math.min(1, Math.abs(d.rotation[idx]))));
}

function rotMax(d) {
  return Math.max(axisMag(d, 0), axisMag(d, 1), axisMag(d, 2));
}

test('ANI-06/07 binds pod hatch/arm rig and armour cap alongside the older kestrel rigs', () => {
  const ids = bank.bindings.map((b) => b.id);
  for (const id of ['kestrel_pod_hatch', 'kestrel_pod_arm_shoulder',
    'kestrel_pod_arm_elbow', 'kestrel_armor_cap']) {
    assert.ok(ids.includes(id), `${id} missing`);
  }
  for (const id of ['kestrel_dish', 'kestrel_mining', 'kestrel_iris_0']) {
    assert.ok(ids.includes(id), `${id} dropped`);
  }
  const names = bank.clips.map((c) => c.name);
  assert.equal(new Set(names).size, names.length, `duplicate clip names: ${names}`);
});

test('ANI-06 hatch swings ~104deg open, arm unfolds under it, and the stow parks at rest', () => {
  // hatch hinge on the -X edge: blender rotY -> glTF rotZ (same axis family as the arm)
  const hatch = delta('serviceArm', 3.6, 'kestrel_pod_hatch');
  assert.ok(axisMag(hatch, 2) > Math.PI * 0.5, `hatch open ${axisMag(hatch, 2)} rad`);
  // shoulder + elbow unfold: blender rotY -> glTF rotZ. Low flat reach aft, not a tall V:
  // shoulder pitches ~55deg just clear of the opening, elbow counter-rotates ~105deg so the
  // forearm lays horizontal aft over the pod's rear edge.
  const shoulder = delta('serviceArm', 3.6, 'kestrel_pod_arm_shoulder');
  assert.ok(axisMag(shoulder, 2) > 0.8 && axisMag(shoulder, 2) < 1.15,
    `shoulder pitched ${axisMag(shoulder, 2)} rad (~55deg — clear of the lid, stays low)`);
  const elbow = delta('serviceArm', 3.6, 'kestrel_pod_arm_elbow');
  assert.ok(axisMag(elbow, 2) > 1.6 && axisMag(elbow, 2) < 2.1,
    `elbow counter-rotated ${axisMag(elbow, 2)} rad (~105deg — forearm flat aft, no tall V)`);
  assert.equal(clip('serviceArm').endMode, 'hold', 'service pose holds for the job duration');
  // stow returns every group to rest and evicts: starting it already deleted the
  // fully-claimed deploy clip, so 'rest' frees the channels without a re-deploy
  assert.equal(clip('serviceStow').endMode, 'rest');
  for (const id of ['kestrel_pod_hatch', 'kestrel_pod_arm_shoulder', 'kestrel_pod_arm_elbow']) {
    const parked = delta('serviceStow', 2.9, id);
    assert.ok(rotMax(parked) < 0.02, `${id} parked at rest (rot ${rotMax(parked)})`);
  }
});

test('ANI-07 cap peels ~17deg at peak, rocks once, and settles at a ~10deg damaged hold', () => {
  assert.equal(clip('armorPeel').endMode, 'hold');
  // cap hinge about its inner long edge: blender rotX -> glTF rotX
  const peak = delta('armorPeel', 0.68, 'kestrel_armor_cap');
  const settled = delta('armorPeel', 2.6, 'kestrel_armor_cap');
  assert.ok(axisMag(peak, 0) > 0.25 && axisMag(peak, 0) < 0.4, `peel peak ${axisMag(peak, 0)} rad`);
  assert.ok(axisMag(settled, 0) > 0.12 && axisMag(settled, 0) < 0.22,
    `settled gap ${axisMag(settled, 0)} rad`);
  const fix = delta('armorStow', 0.9, 'kestrel_armor_cap');
  assert.ok(rotMax(fix) < 0.02, 'armorFix re-seats the cap');
  assert.equal(clip('armorStow').endMode, 'rest');
});

test('ANI-06/07 bank events route service and damage lifecycle', () => {
  assert.equal(bank.events['kestrel:serviceArm'], 'serviceArm');
  assert.equal(bank.events['kestrel:serviceDone'], 'serviceStow');
  assert.equal(bank.events['kestrel:armorPeel'], 'armorPeel');
  assert.equal(bank.events['kestrel:armorFix'], 'armorStow');
});

test('ANI-06 elbow binding nests under the shoulder pivot', () => {
  const elbow = bank.bindings.find((b) => b.id === 'kestrel_pod_arm_elbow');
  const shoulder = bank.bindings.find((b) => b.id === 'kestrel_pod_arm_shoulder');
  // elbow rest translation is parent-local: its offset from the shoulder pivot, not world
  const mag = Math.hypot(...elbow.restPose.translation);
  assert.ok(mag < 1.5, `elbow rest is parent-local (${mag}m)`);
  const shoulderMag = Math.hypot(...shoulder.restPose.translation);
  assert.ok(shoulderMag > 3.0, 'shoulder rest is ship-root-local');
});
