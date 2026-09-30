// ANI-10 seal test: the shipped mining-drone motion bank must validate against its contract,
// describe the MOTION_ pivot the compiled render package carries, and its runtime-table reference
// must hash-bind the bytes on disk.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { evaluateMotionClip, validateMotionBank } from '../src/contracts/motionBank.js';

const BANK_PATH = 'assets/ships/motions/mining-drone.motion.json';
const PACKAGE_PATH = 'assets/ships/release/render-packages/mining-drone/render-package.json';

const bank = JSON.parse(readFileSync(BANK_PATH, 'utf8'));
const pkg = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8'));

test('ANI-10 mining-drone bank validates and is sealed into the runtime table', () => {
  assert.equal(validateMotionBank(bank), bank);
  assert.equal(bank.rigId, 'mining_drone_drum');

  const ref = pkg.runtime && pkg.runtime.motionBank;
  assert.ok(ref, 'mining-drone render package must carry runtime.motionBank');
  const bytes = readFileSync(BANK_PATH);
  assert.equal(ref.bytes, bytes.length);
  assert.equal(ref.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(ref.uri, BANK_PATH);
  assert.equal(ref.rigId, bank.rigId);

  const nodeNames = new Set((pkg.nodes || []).map((n) => n.nodeName));
  for (const binding of bank.bindings) {
    assert.ok(nodeNames.has(binding.node), `compiled package is missing ${binding.node}`);
  }
});

test('ANI-10 grindCycle spins the drum four turns and lands on the wrap pose', () => {
  const clip = bank.clips.find((c) => c.name === 'grindCycle');
  assert.ok(clip, 'bank must declare a grindCycle clip');
  assert.equal(clip.endMode, 'rest', 'one deliberate cycle returns to rest');
  assert.ok(clip.durationS >= 3.5 && clip.durationS <= 5.0, `cycle length reads the reference beat (got ${clip.durationS})`);

  const start = evaluateMotionClip(bank, clip, 0).get('drone_drum');
  assert.ok(Math.abs(start.rotation[0]) < 1e-6 && Math.abs(start.rotation[3] - 1) < 1e-6,
    'drum starts at rest');
  assert.ok(Math.abs(start.translation[0]) < 1e-6, 'drum starts unstroked');

  // Mid-cycle the drum is turning: the roll quaternion x component is non-trivial.
  const mid = evaluateMotionClip(bank, clip, clip.durationS / 2).get('drone_drum');
  assert.ok(Math.abs(mid.rotation[0]) > 0.05, `drum is rolling mid-cycle (got ${mid.rotation[0]})`);

  // Pressure strokes along the guide: peak +x travel ~0.08 m inside the sustained phase.
  const channel = clip.channels
    .find((c) => c.group === 'drone_drum' && c.path === 'translation');
  const xs = [];
  for (let i = 0; i < channel.times.length; i++) xs.push(channel.values[i * 3]);
  const peak = Math.max(...xs);
  assert.ok(Math.abs(peak - 0.08) < 0.02, `pressure stroke peaks near 0.08 m (got ${peak})`);

  // The roll ends at an integral wrap: end pose is the rest pose, so cycles chain seamlessly.
  const end = evaluateMotionClip(bank, clip, clip.durationS).get('drone_drum');
  assert.ok(Math.abs(end.rotation[0]) < 1e-6 && Math.abs(end.rotation[3] - 1) < 1e-6,
    `cycle lands on the wrap pose (got qx=${end.rotation[0]})`);
  assert.ok(Math.abs(end.translation[0]) < 1e-6, 'cycle ends unstroked');
});

test('ANI-10 events map routes the grind lifecycle to the cycle and rest', () => {
  assert.equal(bank.events['drone:grindStart'], 'grindCycle');
  assert.equal(bank.events['drone:grindStop'], 'rest');
});
