// ANI-13/14 seal test: the fab-yard motion bank must validate against its contract, describe
// exactly the MOTION_ pivots the compiled render package carries, and its runtime-table
// reference must hash-bind the bytes on disk. The work loop is exercised kinematically
// (welder reach, crane traverse/hoist) and the craft-queue bus routing is proven against a
// stub controller tree.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  bindAuthoredMotion,
  evaluateMotionClip,
  validateMotionBank,
} from '../src/contracts/motionBank.js';
import {
  installAuthoredMotionBus,
  registerAuthoredMotionController,
  unregisterAuthoredMotionController,
} from '../src/render/authoredMotion.js';

const BANK_PATH = 'assets/ships/motions/fab.motion.json';
const PACKAGE_PATH = 'assets/ships/release/render-packages/fab/render-package.json';

const bank = JSON.parse(readFileSync(BANK_PATH, 'utf8'));
const pkg = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8'));

test('ANI-13 fab bank validates and is sealed into the runtime table', () => {
  assert.equal(validateMotionBank(bank), bank);
  assert.equal(bank.rigId, 'fab_yard_work');

  const ref = pkg.runtime && pkg.runtime.motionBank;
  assert.ok(ref, 'fab render package must carry runtime.motionBank');
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

test('ANI-13 workLoop presses arm1 onto the seam and returns to rest', () => {
  const clip = bank.clips.find((c) => c.name === 'workLoop');
  assert.ok(clip, 'bank must declare a workLoop clip');
  assert.equal(clip.loop, true);

  const atRest = evaluateMotionClip(bank, clip, 0);
  for (const group of ['arm1_shoulder', 'arm1_elbow', 'arm1_wrist',
                       'crane0_trolley', 'crane0_hoist']) {
    const delta = atRest.get(group) || {};
    const tilt = delta.rotation
      ? Math.abs(delta.rotation[0]) + Math.abs(delta.rotation[1]) + Math.abs(delta.rotation[2])
      : 0;
    const slide = delta.translation
      ? Math.abs(delta.translation[0]) + Math.abs(delta.translation[1]) + Math.abs(delta.translation[2])
      : 0;
    assert.ok(tilt < 1e-3 && slide < 1e-3, `${group} starts at rest`);
  }
  // Spec: ONE welder works — arm4's channels must not exist in this bank.
  assert.ok(!clip.channels.some((c) => c.group.startsWith('arm4_')),
    'only arm1 animates (the yard\'s other arms stay parked)');

  // Mid-pass (t≈1.5): arm1's shoulder swings the tool head along the seam (blender rotZ →
  // stored glTF rotY quaternion delta, so the swing shows up in rotation[1]).
  const mid = evaluateMotionClip(bank, clip, 1.5).get('arm1_shoulder');
  assert.ok(Math.abs(mid.rotation[1]) > 0.02, 'arm1 shoulder swings mid-pass');
  // The elbow straightens ~-18deg local X to press the weld point onto the plate —
  // glTF X rotation about that axis shows in rotation[0] (half-angle, |q| component).
  const elbow = evaluateMotionClip(bank, clip, 1.5).get('arm1_elbow');
  assert.ok(Math.abs(elbow.rotation[0]) > 0.1, 'arm1 elbow presses the tip to the hull');

  // Loop-seam continuity: a looping clip must end where it begins — no pop at the wrap.
  const seam0 = evaluateMotionClip(bank, clip, 0.001);
  const seam9 = evaluateMotionClip(bank, clip, clip.durationS - 0.001);
  for (const group of ['arm1_shoulder', 'arm1_elbow', 'arm1_wrist',
                       'crane0_trolley', 'crane0_hoist']) {
    const a = seam0.get(group) || {};
    const b = seam9.get(group) || {};
    const dr = ['rotation'].reduce((acc, k) => acc
      + (a[k] && b[k] ? Math.max(...a[k].map((v, i) => Math.abs(v - b[k][i]))) : 0), 0);
    const dt = a.translation && b.translation
      ? Math.max(...a.translation.map((v, i) => Math.abs(v - b.translation[i]))) : 0;
    assert.ok(dr < 1e-3 && dt < 1e-3, `${group} loop seam pops (rot ${dr}, trans ${dt})`);
  }
});

test('ANI-14 crane0 traverses, pays the hoist ~2 m, holds, and returns', () => {
  const clip = bank.clips.find((c) => c.name === 'workLoop');

  // glTF axes: blender y-travel → stored z delta; blender z-drop → stored y delta.
  const travel = Math.max(...clip.channels
    .filter((c) => c.group === 'crane0_trolley' && c.path === 'translation')
    .flatMap((c) => c.values.filter((_, i) => i % 3 === 2).map(Math.abs)));
  assert.ok(travel > 0.8 && travel < 4, `trolley traverse is short (got ${travel} m)`);

  const drop = Math.max(...clip.channels
    .filter((c) => c.group === 'crane0_hoist' && c.path === 'translation')
    .flatMap((c) => c.values.filter((_, i) => i % 3 === 1).map(Math.abs)));
  assert.ok(drop > 1.2 && drop <= 2.5, `hoist pays a little stroke (got ${drop} m)`);

  const lowered = evaluateMotionClip(bank, clip, 5.0).get('crane0_hoist');
  assert.ok(lowered.translation[1] < -1.5, 'plate is down in the hold window');
  const back = evaluateMotionClip(bank, clip, clip.durationS - 0.01).get('crane0_hoist');
  assert.ok(Math.abs(back.translation[1]) < 1e-3, 'hoist returns to suspension by loop end');
});

test('ANI-13/14 events route the queue receipt to the work loop', () => {
  assert.equal(bank.events['fab:workStart'], 'workLoop');
});

function stubRoot(bankJson) {
  const mkVec = () => ({ x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; } });
  const mkQuat = () => ({
    x: 0, y: 0, z: 0, w: 1,
    set(a, b, c, d) { this.x = a; this.y = b; this.z = c; this.w = d; },
  });
  const nodes = [];
  for (const binding of bankJson.bindings) {
    const [rx, ry, rz] = binding.restPose.translation;
    const [qx, qy, qz, qw] = binding.restPose.rotation;
    const node = {
      name: binding.node,
      children: [{ isMesh: true, name: `${binding.node}_mesh`, children: [] }],
      position: mkVec(),
      quaternion: mkQuat(),
      userData: {},
      visible: true,
      parent: null,
    };
    node.position.set(rx, ry, rz);
    node.quaternion.set(qx, qy, qz, qw);
    nodes.push(node);
  }
  const root = { name: 'root', children: nodes, userData: {} };
  for (const n of nodes) n.parent = root;
  return { root, nodes };
}

test('fab controller works on a bound stub tree then settles home from a mid-pass pose', () => {
  const { root, nodes } = stubRoot(bank);
  const controller = bindAuthoredMotion(root, bank);
  assert.ok(controller, 'controller binds onto the pivot tree');

  controller.handleEvent('fab:workStart', {}, 100);
  assert.ok(controller.clipActive('workLoop'), 'work loop started');
  controller.update(101.5);
  const moved = nodes.some((n) => Math.abs(n.quaternion.x) > 0.005
    || Math.abs(n.quaternion.y) > 0.005 || Math.abs(n.quaternion.z) > 0.005);
  assert.ok(moved, 'welder pivots posed mid-loop');

  // Queue empties mid-phase: settle blends the live pose home rather than snapping.
  assert.ok(controller.settle(1.2, 101.5), 'settle accepted');
  controller.update(102.8);
  assert.equal(controller.clipActive('workLoop'), false, 'loop superseded by settle');
  const drift = nodes.reduce((acc, n) => acc + Math.abs(n.quaternion.x)
    + Math.abs(n.quaternion.y) + Math.abs(n.quaternion.z), 0);
  assert.ok(drift < 1e-4, `pivots parked at rest after settle (drift ${drift})`);

  // A fresh job restarts the loop cleanly.
  controller.handleEvent('fab:workStart', {}, 200);
  assert.ok(controller.clipActive('workLoop'), 'work loop restarts after settle');
});

test('craft:queueChanged receipts reach only the resolved station entity', () => {
  const handlers = new Map();
  const bus = {
    on(type, fn) { handlers.set(type, fn); return () => handlers.delete(type); },
  };
  const calls = [];
  const controller = {
    handleEvent: (type, payload, t) => calls.push(['handleEvent', type, t]),
    settle: (d, t) => calls.push(['settle', d, t]),
    clipActive: () => false,
  };
  registerAuthoredMotionController('ent-fab', controller);
  try {
    installAuthoredMotionBus(bus, {
      clock: () => 42,
      entityForStationId: (id) => (id === 'station_forge' ? 'ent-fab' : null),
    });
    const emit = handlers.get('craft:queueChanged');
    assert.ok(emit, 'bus subscribed to craft:queueChanged');

    emit({ stationId: 'station_forge', active: true });
    // the reposition stroke rides the bank's own event map before the work loop claims it
    assert.deepEqual(calls, [
      ['handleEvent', 'craft:queueChanged', 42],
      ['handleEvent', 'fab:workStart', 42],
    ]);

    calls.length = 0;
    emit({ stationId: 'station_forge', active: false });
    assert.deepEqual(calls, [['settle', 1.2, 42]]);

    calls.length = 0;
    emit({ stationId: 'station_trade_hub', active: true });   // foreign queue: no entity
    emit({ stationId: '__any__', active: true });             // undocked envelope: skip
    emit({});                                                  // legacy empty payload: skip
    assert.deepEqual(calls, []);
  } finally {
    unregisterAuthoredMotionController('ent-fab', controller);
  }
});
