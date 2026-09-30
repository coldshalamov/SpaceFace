// ANI-03: yard-tug massline winch motion bank — payout/catch/reel/release lifecycle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateMotionClip } from '../src/contracts/motionBank.js';

const bank = JSON.parse(readFileSync(new URL('../assets/ships/motions/yard-tug.motion.json', import.meta.url)));

function clip(name) {
  const c = bank.clips.find((x) => x.name === name);
  assert.ok(c, `clip ${name} missing`);
  return c;
}

function delta(name, t, group) {
  return evaluateMotionClip(bank, clip(name), t).get(group) || {};
}

test('ANI-03 yard_tug winch bindings exist for drum, fairlead and hook', () => {
  assert.equal(bank.schema, 'spaceface.rigidMotionBank.v1');
  const ids = bank.bindings.map((b) => b.id).sort();
  assert.deepEqual(ids, ['yard_tug_fairlead', 'yard_tug_hook', 'yard_tug_winch']);
  for (const b of bank.bindings) {
    assert.equal(b.node, `MOTION_${b.id.toUpperCase()}`);
    assert.ok(b.restPose && b.restPose.translation && b.restPose.rotation);
  }
});

test('ANI-03 payout spins the drum and slides the hook aft, then holds', () => {
  const c = clip('payout');
  assert.equal(c.endMode, 'hold');
  const start = delta('payout', 0, 'yard_tug_hook');
  assert.ok(Math.abs(start.translation[0]) < 1e-4, 'payout starts at rest');
  const held = delta('payout', 1.3, 'yard_tug_hook');
  assert.ok(held.translation[0] < -0.5, `hook slid aft (x=${held.translation[0]})`);
  const drum = delta('payout', 1.3, 'yard_tug_winch').rotation;
  assert.ok(Math.abs(drum[2]) > 0.3, `drum visibly rotated (quat z=${drum[2]})`);
  const fairlead = delta('payout', 1.3, 'yard_tug_fairlead').rotation;
  assert.ok(Math.abs(fairlead[1]) > 0.02, 'fairlead aligned a little');
  // hold: sample past the clip's end stays at the held pose
  const past = delta('payout', 5.0, 'yard_tug_hook');
  assert.ok(Math.abs(past.translation[0] - held.translation[0]) < 1e-6, 'payout holds extended');
});

test('ANI-03 reel brings the hook nearly home and release parks everything', () => {
  const reeled = delta('reel', 1.5, 'yard_tug_hook');
  assert.ok(reeled.translation[0] > -0.2 && reeled.translation[0] < 0,
    `line still out after reel (x=${reeled.translation[0]})`);
  const parked = delta('release', 0.85, 'yard_tug_hook');
  assert.ok(Math.abs(parked.translation[0]) < 1e-4, 'release ends at rest');
  const drum = delta('release', 0.85, 'yard_tug_winch').rotation;
  assert.ok(drum.every((v, i) => Math.abs(v - [0, 0, 0, 1][i]) < 1e-4), 'drum parked');
  assert.equal(clip('release').endMode, 'rest');
});

test('ANI-03 events map routes the massline lifecycle', () => {
  assert.equal(bank.events['tether:attached'], 'payout');
  assert.equal(bank.events['massline:snareDeployed'], 'payout');
  assert.equal(bank.events['tether:snapCatch'], 'catch');
  assert.equal(bank.events['tether:reelPump'], 'reel');
  assert.equal(bank.events['tether:released'], 'release');
  assert.equal(bank.events['massline:snareEnded'], 'release');
  assert.equal(bank.events['tether:latchDenied'], 'release');
});
