// ANI-15 seal test: the jump-ring motion bank must validate against its contract, describe
// exactly the MOTION_ emitter-tip pivots the compiled render package carries, and its
// runtime-table reference must hash-bind the bytes on disk.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { bindAuthoredMotion, evaluateMotionClip, validateMotionBank } from '../src/contracts/motionBank.js';

const BANK_PATH = 'assets/ships/motions/jump-ring.motion.json';
const PACKAGE_PATH = 'assets/ships/release/render-packages/jump-ring/render-package.json';
const N_TIPS = 12;

const bank = JSON.parse(readFileSync(BANK_PATH, 'utf8'));
const pkg = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8'));

test('ANI-15 jump-ring bank validates and is sealed into the runtime table', () => {
  assert.equal(validateMotionBank(bank), bank);
  assert.equal(bank.rigId, 'gate_emitter_index');
  assert.equal(bank.bindings.length, N_TIPS, 'one binding per emitter tip');

  const ref = pkg.runtime && pkg.runtime.motionBank;
  assert.ok(ref, 'jump-ring render package must carry runtime.motionBank');
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

test('ANI-15 index clip drives every tip radially inward and holds', () => {
  const clip = bank.clips.find((c) => c.name === 'index');
  assert.ok(clip, 'bank must declare an index clip');
  assert.equal(clip.endMode, 'hold', 'index holds while the gate charge runs');

  const atRest = evaluateMotionClip(bank, clip, 0);
  for (let i = 0; i < N_TIPS; i++) {
    const t = atRest.get(`gate_tip_${i}`).translation;
    assert.ok(Math.hypot(...t) < 1e-3, `tip ${i} starts at rest`);
  }

  const mid = evaluateMotionClip(bank, clip, clip.durationS / 2);
  const end = evaluateMotionClip(bank, clip, clip.durationS);
  for (let i = 0; i < N_TIPS; i++) {
    const midT = mid.get(`gate_tip_${i}`).translation;
    const endT = end.get(`gate_tip_${i}`).translation;
    const midMag = Math.hypot(...midT);
    const endMag = Math.hypot(...endT);
    assert.ok(midMag > 0.05 && midMag < endMag, `tip ${i} travels mid-index (${midMag})`);
    assert.ok(Math.abs(endMag - 0.55) < 0.02, `tip ${i} seats at 0.55 m inward (got ${endMag})`);
    // Inward radial: the delta must oppose the tip's rest offset direction in the ring plane.
    // gate_tip_i rest sits at angle (i + 0.5) * 2π/12 in the glTF y–z ring plane, so the
    // inward unit is (0, -sin(a), +cos(a)).
    const a = (i + 0.5) * (Math.PI * 2) / N_TIPS;
    const dot = (endT[1] * -Math.sin(a) + endT[2] * Math.cos(a)) / endMag;
    assert.ok(dot > 0.98, `tip ${i} index direction is inward-radial (dot ${dot})`);
  }
});

test('ANI-15 reset clip returns tips to rest and events route the gate lifecycle', () => {
  const reset = bank.clips.find((c) => c.name === 'reset');
  assert.ok(reset, 'bank must declare a reset clip');
  assert.equal(reset.endMode, 'rest');

  const start = evaluateMotionClip(bank, reset, 0);
  for (let i = 0; i < N_TIPS; i++) {
    const t = start.get(`gate_tip_${i}`).translation;
    assert.ok(Math.abs(Math.hypot(...t) - 0.55) < 0.02, `reset starts from indexed pose (tip ${i})`);
  }
  const end = evaluateMotionClip(bank, reset, reset.durationS);
  for (let i = 0; i < N_TIPS; i++) {
    const t = end.get(`gate_tip_${i}`).translation;
    assert.ok(Math.hypot(...t) < 1e-3, `reset ends at rest (tip ${i})`);
  }

  assert.equal(bank.events['gate:index'], 'index');
  assert.equal(bank.events['gate:reset'], 'reset');
});

// Controller lifecycle: 'index' endMode 'hold' stays in the active-clip map, so a plain
// evaluate-only test cannot see the defect — after 'reset' parks, the held index delta used
// to re-apply and snap every tip back to the indexed pose. This drives the real
// bindAuthoredMotion state machine over a stub node tree so the regression is locked out.
test('ANI-15 controller lifecycle: reset stays parked and index refires', () => {
  const mkVec = (a) => ({
    x: a[0], y: a[1], z: a[2],
    set(x, y, z) { this.x = x; this.y = y; this.z = z; },
  });
  const mkQuat = (a) => ({
    x: a[0], y: a[1], z: a[2], w: a[3],
    set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; },
  });
  const root = { name: 'root', children: [], userData: {}, visible: true };
  for (const binding of bank.bindings) {
    const mesh = {
      isMesh: true, visible: true, children: [], userData: {},
      position: mkVec([0, 0, 0]), quaternion: mkQuat([0, 0, 0, 1]),
    };
    const pivot = {
      name: binding.node, children: [mesh], userData: {}, visible: true, parent: root,
      position: mkVec(binding.restPose.translation),
      quaternion: mkQuat(binding.restPose.rotation),
    };
    mesh.parent = pivot;
    root.children.push(pivot);
  }
  const controller = bindAuthoredMotion(root, bank);
  const tip0 = root.children[0];
  const rest = bank.bindings[0].restPose.translation;
  const drift = () => Math.hypot(
    tip0.position.x - rest[0], tip0.position.y - rest[1], tip0.position.z - rest[2],
  );

  controller.handleEvent('gate:index', {}, 10);
  controller.update(10.55);
  assert.equal(controller.clipActive('index'), true, 'index holds while the charge runs');
  assert.ok(Math.abs(drift() - 0.55) < 0.02, `tip0 indexed (drift ${drift()})`);

  controller.handleEvent('gate:reset', {}, 12);
  controller.update(12.7);
  assert.equal(controller.clipActive('index'), false, 'reset permanently supersedes index');
  controller.update(15);
  assert.ok(drift() < 1e-3, `tip0 stays parked after reset ends (drift ${drift()})`);

  controller.handleEvent('gate:index', {}, 20);
  controller.update(20.55);
  assert.equal(controller.clipActive('index'), true, 'index refires on a later charge');
  assert.ok(Math.abs(drift() - 0.55) < 0.02, `tip0 re-indexed (drift ${drift()})`);
});
