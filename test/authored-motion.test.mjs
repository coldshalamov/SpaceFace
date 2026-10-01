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
