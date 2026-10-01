// ANI-00 contract tests: the rigid motion bank is the only legal channel from Blender-authored
// actions to live ship graphs. These cover the clauses the program calls out by name —
// pivot/channel legality, signed-mirror math, rest-relative composition, illegal-binding
// rejection, two independent instances, lifecycle/disposal, and the freeze exemption.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as THREE from 'three';

import {
  MOTION_BANK_SCHEMA,
  bindAuthoredMotion,
  evaluateMotionClip,
  motionGroupIdFor,
  motionNodeNameFor,
  slerp,
  validateMotionBank,
} from '../src/contracts/motionBank.js';
import {
  attachAuthoredMotionDriver,
  authoredMotionControllersFor,
  installAuthoredMotionBus,
} from '../src/render/authoredMotion.js';

const BANK = {
  schema: MOTION_BANK_SCHEMA,
  rigId: 'test_rig',
  sourceAssetId: 'SF_TEST_RIG_V1',
  sourceGlbSha256: '0'.repeat(64),
  fps: 60,
  bindings: [
    {
      id: 'test_rig',
      node: 'MOTION_TEST_RIG',
      parent: null,
      restPose: { translation: [1, 2, 3], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      requiredAtLod: [0],
    },
  ],
  clips: [
    {
      name: 'sweep',
      durationS: 1,
      loop: false,
      endMode: 'rest',
      channels: [
        { group: 'test_rig', path: 'translation', times: [0, 1], values: [0, 0, 0, 0, 0.5, 0] },
        {
          group: 'test_rig',
          path: 'rotation',
          times: [0, 1],
          values: [0, 0, 0, 1, 0, 0.7071067811865475, 0, 0.7071067811865476],
        },
      ],
    },
  ],
  events: { 'scan:pulse': 'sweep' },
};

function cloneBank() {
  return JSON.parse(JSON.stringify(BANK));
}

function makePivotTree({ name = 'MOTION_TEST_RIG', visible = true } = {}) {
  const root = new THREE.Object3D();
  const pivot = new THREE.Object3D();
  pivot.name = name;
  pivot.position.set(1, 2, 3);
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  mesh.visible = visible;
  pivot.add(mesh);
  root.add(pivot);
  return { root, pivot, mesh };
}

// --- pivot/channel legality ---------------------------------------------------

test('motion bank naming maps group ids to MOTION_ nodes both ways', () => {
  assert.equal(motionNodeNameFor('kestrel_dish'), 'MOTION_KESTREL_DISH');
  assert.equal(motionGroupIdFor('MOTION_KESTREL_DISH'), 'kestrel_dish');
  assert.equal(motionGroupIdFor('HOOK_SENSOR'), null);
});

test('validateMotionBank accepts the canonical shape', () => {
  const bank = cloneBank();
  assert.equal(validateMotionBank(bank), bank);
});

test('validateMotionBank rejects illegal channel scopes', () => {
  // scale channel — never legal for a rigid-part group.
  const scaleBank = cloneBank();
  scaleBank.clips[0].channels[0].path = 'scale';
  assert.throws(() => validateMotionBank(scaleBank), /translation or rotation/);

  // undeclared group channel — a channel must resolve to a declared binding.
  const undeclared = cloneBank();
  undeclared.clips[0].channels[0].group = 'ghost_group';
  assert.throws(() => validateMotionBank(undeclared), /undeclared group/);

  // reserved group ids — root/camera/collider/whole-hull/simulation ownership.
  const reserved = cloneBank();
  reserved.bindings[0].id = 'root';
  assert.throws(() => validateMotionBank(reserved), /reserved/);

  // wrong sample rate — banks are pinned at 60 fps.
  const fps = cloneBank();
  fps.fps = 30;
  assert.throws(() => validateMotionBank(fps), /fps 60/);
});

// --- signed-mirror / coordinate math ------------------------------------------

test('slerp takes the short signed arc; mirrored angles land opposite', () => {
  const plus = slerp([0, 0, 0, 1], [0, Math.SQRT1_2, 0, Math.SQRT1_2], 1);
  const minus = slerp([0, 0, 0, 1], [0, -Math.SQRT1_2, 0, Math.SQRT1_2], 1);
  assert.ok(plus[1] > 0.7 && minus[1] < -0.7, 'signed rotation deltas must not collapse');
});

test('evaluateMotionClip composes rest-relative deltas at any sample time', () => {
  const deltas = evaluateMotionClip(cloneBank(), BANK.clips[0], 0.5);
  const d = deltas.get('test_rig');
  assert.ok(Math.abs(d.translation[1] - 0.25) < 1e-6, 'translation is a rest-relative delta');
  assert.ok(d.rotation[1] > 0.3 && d.rotation[1] < 0.5, 'half-sweep rotation delta');
});

// --- illegal binding rejection -------------------------------------------------

test('bindAuthoredMotion throws when the bank was not validated against this tree', () => {
  const { root } = makePivotTree({ name: 'MOTION_OTHER' });
  assert.throws(() => bindAuthoredMotion(root, cloneBank()), /no MOTION_TEST_RIG node/);
});

test('bindAuthoredMotion throws on rest-pose drift', () => {
  const { root, pivot } = makePivotTree();
  pivot.position.set(9, 9, 9);
  assert.throws(() => bindAuthoredMotion(root, cloneBank()), /rest pose/);
});

// --- two independent instances ---------------------------------------------------

test('two instances bound to one bank sweep independently', () => {
  const a = makePivotTree();
  const b = makePivotTree();
  const ca = bindAuthoredMotion(a.root, cloneBank());
  const cb = bindAuthoredMotion(b.root, cloneBank());
  ca.setState({ state: 'sweep', startTimeS: 0 });
  ca.update(0.5);
  assert.ok(a.pivot.position.y > 2.2, 'instance A moved');
  assert.equal(b.pivot.position.y, 2, 'instance B stayed at rest');
  assert.notEqual(ca, cb);
  cb.dispose();
  ca.dispose();
});

// --- lifecycle / freeze exemption -----------------------------------------------

test('rest end mode parks the rig exactly at its authored rest pose', () => {
  const { root, pivot } = makePivotTree();
  const c = bindAuthoredMotion(root, cloneBank());
  c.setState({ state: 'sweep', startTimeS: 0 });
  c.update(5); // past durationS with endMode 'rest'
  assert.equal(pivot.position.y, 2);
  assert.equal(c.state, 'rest');
});

test('binding clears the frozen-matrix flag up the chain', () => {
  const { root, pivot } = makePivotTree();
  root.userData.sfMatrixFrozen = true;
  pivot.userData.sfMatrixFrozen = true;
  bindAuthoredMotion(root, cloneBank());
  assert.equal(pivot.userData.sfMatrixFrozen, false);
  assert.equal(root.userData.sfMatrixFrozen, false);
});

// --- driver + bus gate ----------------------------------------------------------

test('attachAuthoredMotionDriver exposes update + detach hooks and disposes cleanly', () => {
  const { root, pivot } = makePivotTree();
  const ship = new THREE.Object3D();
  const controller = bindAuthoredMotion(root, cloneBank());
  const detach = attachAuthoredMotionDriver(ship, { id: 'ent-1' }, [controller]);
  assert.equal(typeof ship.userData.updateAuthoredMotion, 'function');
  assert.equal(authoredMotionControllersFor('ent-1').length, 1);
  ship.userData.updateAuthoredMotion({ id: 'ent-1' }, 0);
  controller.setState({ state: 'sweep', startTimeS: 0 });
  ship.userData.updateAuthoredMotion({ id: 'ent-1' }, 0.5);
  assert.ok(pivot.position.y > 2.2);
  detach();
  assert.equal(authoredMotionControllersFor('ent-1').length, 0);
  assert.equal(ship.userData.updateAuthoredMotion, undefined);
});

test('installAuthoredMotionBus gates foreign pulses and replays', () => {
  const { root } = makePivotTree();
  const ship = new THREE.Object3D();
  const controller = bindAuthoredMotion(root, cloneBank());
  attachAuthoredMotionDriver(ship, { id: 'player-1' }, [controller]);

  const handlers = new Map();
  const bus = { on: (type, fn) => { handlers.set(type, fn); return () => handlers.delete(type); } };
  const unbind = installAuthoredMotionBus(bus);
  const pulse = handlers.get('scan:pulse');

  // Foreign source — ignored.
  pulse({ source: 'npc-scanner', scannerId: 'player-1', seq: 1, simTime: 10 });
  assert.equal(controller.state, 'rest');
  // Wrong entity — ignored.
  pulse({ source: 'player-scanner', scannerId: 'someone-else', seq: 1, simTime: 10 });
  assert.equal(controller.state, 'rest');
  // Accepted — the bank's events map drives the 'sweep' clip.
  pulse({ source: 'player-scanner', scannerId: 'player-1', seq: 1, simTime: 10 });
  assert.equal(controller.state, 'sweep');
  assert.equal(controller.generation, 1);
  // Replay of the same generation — ignored.
  pulse({ source: 'player-scanner', scannerId: 'player-1', seq: 1, simTime: 10 });
  assert.equal(controller.generation, 1);
  pulse({ source: 'player-scanner', scannerId: 'player-1', seq: 2, simTime: 20 });
  assert.equal(controller.generation, 2);
  unbind();
});

// --- ANI-06/07 service-arm + armour-cap gating ---------------------------------

const SERVICE_GROUPS_FLAT = ['kestrel_pod_hatch', 'kestrel_pod_arm_shoulder', 'kestrel_pod_arm_elbow'];

const SERVICE_BANK = {
  schema: MOTION_BANK_SCHEMA,
  rigId: 'kestrel_test',
  sourceAssetId: 'SF_KESTREL_TEST',
  sourceGlbSha256: '0'.repeat(64),
  fps: 60,
  bindings: [
    { id: 'kestrel_pod_hatch', node: 'MOTION_KESTREL_POD_HATCH', parent: null,
      restPose: { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      requiredAtLod: [0] },
    { id: 'kestrel_pod_arm_shoulder', node: 'MOTION_KESTREL_POD_ARM_SHOULDER', parent: null,
      restPose: { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      requiredAtLod: [0] },
    { id: 'kestrel_pod_arm_elbow', node: 'MOTION_KESTREL_POD_ARM_ELBOW',
      parent: 'kestrel_pod_arm_shoulder',
      restPose: { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      requiredAtLod: [0] },
    { id: 'kestrel_armor_cap', node: 'MOTION_KESTREL_ARMOR_CAP', parent: null,
      restPose: { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      requiredAtLod: [0] },
    { id: 'kestrel_dish', node: 'MOTION_KESTREL_DISH', parent: null,
      restPose: { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      requiredAtLod: [0] },
  ],
  clips: [
    { name: 'serviceArm', durationS: 3.6, loop: false, endMode: 'hold',
      channels: SERVICE_GROUPS_FLAT.map((group) => (
        { group, path: 'translation', times: [0, 3.6], values: [0, 0, 0, 0, 0.5, 0] })) },
    { name: 'serviceStow', durationS: 2.9, loop: false, endMode: 'hold',
      channels: SERVICE_GROUPS_FLAT.map((group) => (
        { group, path: 'translation', times: [0, 2.9], values: [0, 0.5, 0, 0, 0, 0] })) },
    { name: 'armorPeel', durationS: 2.6, loop: false, endMode: 'hold',
      channels: [
        { group: 'kestrel_armor_cap', path: 'translation', times: [0, 2.6], values: [0, 0, 0, 0, 0.4, 0] },
      ] },
    { name: 'armorStow', durationS: 0.9, loop: false, endMode: 'hold',
      channels: [
        { group: 'kestrel_armor_cap', path: 'translation', times: [0, 0.9], values: [0, 0.4, 0, 0, 0, 0] },
      ] },
    { name: 'sweep', durationS: 1, loop: false, endMode: 'rest',
      channels: [
        { group: 'kestrel_dish', path: 'translation', times: [0, 1], values: [0, 0, 0, 0, 0.5, 0] },
      ] },
  ],
  events: {
    'kestrel:serviceArm': 'serviceArm',
    'kestrel:serviceDone': 'serviceStow',
    'kestrel:armorPeel': 'armorPeel',
    'kestrel:armorFix': 'armorStow',
    'scan:pulse': 'sweep',
  },
};

function makeServiceBus() {
  const handlers = new Map();
  const bus = {
    on: (type, fn) => {
      const list = handlers.get(type) || [];
      list.push(fn);
      handlers.set(type, list);
      return () => handlers.set(type, (handlers.get(type) || []).filter((f) => f !== fn));
    },
  };
  const emit = (type, payload) => {
    for (const fn of handlers.get(type) || []) fn(payload);
  };
  return { emit, bus };
}

function makeServiceRig() {
  const root = new THREE.Object3D();
  for (const name of ['MOTION_KESTREL_POD_HATCH', 'MOTION_KESTREL_POD_ARM_SHOULDER',
    'MOTION_KESTREL_POD_ARM_ELBOW', 'MOTION_KESTREL_ARMOR_CAP', 'MOTION_KESTREL_DISH']) {
    const pivot = new THREE.Object3D();
    pivot.name = name;
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    pivot.add(mesh);
    root.add(pivot);
  }
  return root;
}

test('service + armor gates are independent per channel on the shared bank', () => {
  const bank = JSON.parse(JSON.stringify(SERVICE_BANK));
  const root = makeServiceRig();
  const ship = new THREE.Object3D();
  const controller = bindAuthoredMotion(root, bank);
  attachAuthoredMotionDriver(ship, { id: 'player-1' }, [controller]);
  let now = 10;
  const { emit, bus } = makeServiceBus();
  const unbind = installAuthoredMotionBus(bus, { clock: () => now, playerEntityId: () => 'player-1' });

  // Canonical flow: hull hit -> repair -> completion must fire BOTH stows, in either sub-order.
  emit('combat:damage', { targetId: 'player-1', hullHit: true });
  assert.ok(controller.clipActive('armorPeel'), 'peel dispatches on hull hit');
  emit('service:started', { type: 'repair' });
  assert.ok(controller.clipActive('serviceArm'), 'arm unfolds on repair start');
  now = 14; // peel aged past its 2.6s deploy -> designed stow path, not a settle
  emit('service:completed', { type: 'repair' });
  assert.ok(controller.clipActive('serviceStow'), 'stow runs on completion');
  assert.ok(controller.clipActive('armorStow'), 'armorFix still fires — the fix must not be gated by the just-started stow');
  unbind();
});

test('hull hit during an active repair still stows the arm', () => {
  const bank = JSON.parse(JSON.stringify(SERVICE_BANK));
  const root = makeServiceRig();
  const ship = new THREE.Object3D();
  const controller = bindAuthoredMotion(root, bank);
  attachAuthoredMotionDriver(ship, { id: 'player-1' }, [controller]);
  let now = 20;
  const { emit, bus } = makeServiceBus();
  const unbind = installAuthoredMotionBus(bus, { clock: () => now, playerEntityId: () => 'player-1' });

  emit('service:started', { type: 'repair' });
  now = 21;
  emit('combat:damage', { targetId: 'player-1', hullHit: true });
  now = 25; // peel age 4s > 2.6s clip -> completed peel, so the fix runs the designed stow
  emit('service:completed', { type: 'repair' });
  assert.ok(controller.clipActive('serviceStow'), 'arm still stows — completion must not be lost to the peel ordering');
  assert.ok(controller.clipActive('armorStow'), 'cap re-seats');
  // a stray completion with nothing out is inert
  controller.setState({ state: 'rest', startTimeS: 0 });
  emit('service:completed', { type: 'repair' });
  assert.equal(controller.state, 'rest');
  unbind();
});

test('service:aborted blends the service rig home instead of snapping to the stow pose', () => {
  const bank = JSON.parse(JSON.stringify(SERVICE_BANK));
  const root = makeServiceRig();
  const ship = new THREE.Object3D();
  const controller = bindAuthoredMotion(root, bank);
  attachAuthoredMotionDriver(ship, { id: 'player-1' }, [controller]);
  const { emit, bus } = makeServiceBus();
  const unbind = installAuthoredMotionBus(bus, { clock: () => 10, playerEntityId: () => 'player-1' });

  // deploy mid-flight + a live dish sweep on another group
  emit('service:started', { type: 'repair' });
  emit('scan:pulse', { source: 'player-scanner', scannerId: 'player-1', seq: 1 });
  emit('service:aborted', { type: 'repair' });
  assert.ok(controller.clipActive('__settle__'), 'abort settles the service rig');
  assert.ok(!controller.clipActive('serviceStow'), 'abort never runs the deploy-assuming stow');
  assert.ok(controller.clipActive('sweep'), 'scoped settle leaves other rigs running');
  // arm still counts as deployed until the settle lands? no — flag cleared at abort, so a
  // following completion is inert.
  emit('service:completed', { type: 'repair' });
  unbind();
});

test('a repair completing mid-peel settles the cap from its live pose', () => {
  const bank = JSON.parse(JSON.stringify(SERVICE_BANK));
  const root = makeServiceRig();
  const ship = new THREE.Object3D();
  const controller = bindAuthoredMotion(root, bank);
  attachAuthoredMotionDriver(ship, { id: 'player-1' }, [controller]);
  let now = 30;
  const { emit, bus } = makeServiceBus();
  const unbind = installAuthoredMotionBus(bus, { clock: () => now, playerEntityId: () => 'player-1' });

  emit('combat:damage', { targetId: 'player-1', hullHit: true });
  now = 31; // peel age 1s < 2.6s clip — still animating, stow's first key would snap it
  emit('service:completed', { type: 'repair' });
  assert.ok(controller.clipActive('__settle__'), 'mid-peel fix blends the cap home');
  assert.ok(!controller.clipActive('armorStow'), 'designed stow never runs mid-peel');
  // and the next hull hit can peel again — the flag cleared with the fix
  now = 40;
  controller.setState({ state: 'rest', startTimeS: 40 });
  emit('combat:damage', { targetId: 'player-1', hullHit: true });
  assert.ok(controller.clipActive('armorPeel'), 'cap can peel again after a fix');
  unbind();
});
