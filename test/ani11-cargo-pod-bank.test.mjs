// ANI-11 seal test: the shipped cargo-pod motion bank must validate against its contract,
// describe exactly the MOTION_ pivots the compiled render package carries, and its
// runtime-table reference must hash-bind the bytes on disk.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { evaluateMotionClip, validateMotionBank } from '../src/contracts/motionBank.js';

const BANK_PATH = 'assets/ships/motions/cargo-pod-standard.motion.json';
const PACKAGE_PATH = 'assets/ships/release/render-packages/cargo-pod-standard/render-package.json';

const bank = JSON.parse(readFileSync(BANK_PATH, 'utf8'));
const pkg = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8'));

const clip = (name) => bank.clips.find((c) => c.name === name);
const delta = (clipName, t, group) => evaluateMotionClip(bank, clip(clipName), t).get(group);

test('ANI-11 cargo-pod bank validates and is sealed into the runtime table', () => {
  assert.equal(validateMotionBank(bank), bank);
  assert.equal(bank.rigId, 'cargo_pod_door');

  const ref = pkg.runtime && pkg.runtime.motionBank;
  assert.ok(ref, 'cargo-pod-standard render package must carry runtime.motionBank');
  const bytes = readFileSync(BANK_PATH);
  assert.equal(ref.bytes, bytes.length);
  assert.equal(ref.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(ref.uri, BANK_PATH);
  assert.equal(ref.rigId, bank.rigId);

  // Eight bindings: four lock bars, two leaves, two retainers — all present in the package.
  assert.equal(bank.bindings.length, 8);
  const nodeNames = new Set((pkg.nodes || []).map((n) => n.nodeName));
  for (const binding of bank.bindings) {
    assert.ok(nodeNames.has(binding.node), `compiled package is missing ${binding.node}`);
  }
});

test('ANI-11 breach turns the bars, swings the leaves and holds the open pose', () => {
  const breach = clip('breach');
  assert.ok(breach, 'bank must declare a breach clip');
  assert.equal(breach.endMode, 'hold', 'breach holds the doorway open until the pod is consumed');

  // lock bars start at rest, end quarter-turned and retracted along +x.
  const barStart = delta('breach', 0, 'cargo_lock_t0');
  assert.ok(Math.abs(barStart.rotation[1]) < 1e-4, 'bars start unrotated');
  const barEnd = delta('breach', breach.durationS, 'cargo_lock_t0');
  assert.ok(barEnd.translation[0] > 0.1, `bar withdrawn (x=${barEnd.translation[0]})`);
  assert.ok(Math.abs(barEnd.rotation[1]) > 0.5, `bar quarter-turned (qy=${barEnd.rotation[1]})`);

  // leaves crack during the latch beat, then swing past 90 deg and hold.
  const leafHold = delta('breach', breach.durationS, 'cargo_door_port');
  const leafAngle = 2 * Math.asin(Math.abs(leafHold.rotation[1]));
  assert.ok(leafAngle > 1.6, `port leaf open past 90deg (rad=${leafAngle.toFixed(2)})`);
  const leafStar = delta('breach', breach.durationS, 'cargo_door_star');
  assert.ok(leafStar.rotation[1] * leafHold.rotation[1] < 0, 'leaves mirror each other');

  // retainers fold down into the ramp and hold (blender-Y -> glTF -Z).
  const retHold = delta('breach', breach.durationS, 'cargo_retain_port');
  const retAngle = 2 * Math.asin(Math.abs(retHold.rotation[2]));
  assert.ok(retAngle > 1.0, `retainer folded down (rad=${retAngle.toFixed(2)})`);

  // past the clip end the pose stays held.
  const past = delta('breach', breach.durationS + 2, 'cargo_door_port');
  assert.deepEqual(past.rotation, leafHold.rotation);
});

test('ANI-11 seal parks everything and events map the beam lifecycle', () => {
  const seal = clip('seal');
  assert.ok(seal, 'bank must declare a seal clip');
  assert.equal(seal.endMode, 'rest');

  for (const g of ['cargo_lock_t0', 'cargo_door_port', 'cargo_door_star',
    'cargo_retain_port', 'cargo_retain_star']) {
    const end = delta('seal', seal.durationS, g);
    assert.ok(end.rotation.every((v, i) => Math.abs(v - [0, 0, 0, 1][i]) < 1e-3),
      `${g} returns to rest`);
    assert.ok(end.translation.every((v) => Math.abs(v) < 1e-3), `${g} translation parked`);
  }

  assert.equal(bank.events['mining:start'], 'breach');
  assert.equal(bank.events['mining:stop'], 'seal');
  assert.equal(bank.events['beam:denied'], 'seal');
});
