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
  createAuthoredClock,
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

// --- dock events: a retrigger of a clip that is still playing is not a restart ---------------

test('dock:range / dock:denied retriggers mid-clip are ignored; a finished clip plays again', () => {
  const bank = cloneBank();
  bank.clips[0].durationS = 10;
  bank.clips[0].channels.forEach((ch) => { ch.times = [0, 10]; });
  bank.events = { 'dock:range': 'sweep', 'dock:denied': 'sweep' };
  const { root, pivot } = makePivotTree();
  const ship = new THREE.Object3D();
  const controller = bindAuthoredMotion(root, bank);
  assert.equal(controller.eventClip('dock:range'), 'sweep', 'the controller exposes its bank event map');
  assert.equal(controller.eventClip('dock:docked'), null, 'and null for an event the bank does not answer');
  const detach = attachAuthoredMotionDriver(ship, { id: 'berth-1' }, [controller]);

  let now = 10;
  const { emit, bus } = makeServiceBus();
  const unbind = installAuthoredMotionBus(bus, {
    clock: () => now,
    entityForStationId: (id) => (id === 'st-1' ? 'berth-1' : null),
  });
  const tick = () => ship.userData.updateAuthoredMotion({ id: 'berth-1' }, now, {});
  const expectY = (elapsed) => 2 + (evaluateMotionClip(bank, bank.clips[0], elapsed).get('test_rig').translation[1]);
  tick();

  emit('dock:range', { stationId: 'st-1', inRange: true });
  assert.ok(controller.clipActive('sweep'));
  now = 14;
  tick();
  assert.ok(pivot.position.y > 2.1, `mid-sweep, off rest (y=${pivot.position.y})`);

  for (const event of ['dock:range', 'dock:denied']) {
    now += 0.2;
    emit(event, { stationId: 'st-1', inRange: true });
    assert.equal(controller.activeClipNames().some((n) => n.startsWith('__settle__')), false,
      `${event} did not bridge the live pose back to rest`);
    assert.ok(Math.abs(controller.clipElapsed('sweep', now) - (now - 10)) < 1e-9, `${event} did not restart the clip`);
    tick();
    assert.ok(Math.abs(pivot.position.y - expectY(now - 10)) < 1e-6, `${event}: pose stays on the sweep curve`);
  }

  // A rig that never answered the event is untouched (no throw, no state change).
  assert.equal(controller.generation, -1);

  now = 22;
  tick();
  assert.equal(controller.clipActive('sweep'), false, 'the sweep finished');
  emit('dock:range', { stationId: 'st-1', inRange: true });
  assert.ok(controller.clipActive('sweep'), 'a retrigger after the clip ended plays it again');
  assert.equal(controller.clipElapsed('sweep', now), 0);
  unbind();
  detach();
  controller.dispose();
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

const anySettleActive = (controller) => (controller.activeClipNames?.() || [])
  .some((name) => name.startsWith('__settle__'));

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
  assert.ok(anySettleActive(controller), 'abort settles the service rig');
  assert.ok(!controller.clipActive('serviceStow'), 'abort never runs the deploy-assuming stow');
  assert.ok(controller.clipActive('sweep'), 'scoped settle leaves other rigs running');
  // the settle clip must still exist in the bank map — a trim that collects it would throw
  // TypeError on this update (the r4 bug: trim ran before settleName joined state.clips)
  controller.update(10.5);
  assert.ok(anySettleActive(controller), 'settle evaluates mid-blend without throwing');
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
  assert.ok(anySettleActive(controller), 'mid-peel fix blends the cap home');
  assert.ok(!controller.clipActive('armorStow'), 'designed stow never runs mid-peel');
  controller.update(31.4); // the blend must evaluate, not throw on a trimmed clip
  assert.ok(anySettleActive(controller), 'cap blend still running');
  // and the next hull hit can peel again — the flag cleared with the fix
  now = 40;
  controller.setState({ state: 'rest', startTimeS: 40 });
  emit('combat:damage', { targetId: 'player-1', hullHit: true });
  assert.ok(controller.clipActive('armorPeel'), 'cap can peel again after a fix');
  unbind();
});

test('a repair completing inside the deploy window settles instead of snapping to stow', () => {
  const bank = JSON.parse(JSON.stringify(SERVICE_BANK));
  const root = makeServiceRig();
  const ship = new THREE.Object3D();
  const controller = bindAuthoredMotion(root, bank);
  attachAuthoredMotionDriver(ship, { id: 'player-1' }, [controller]);
  let now = 10;
  const { emit, bus } = makeServiceBus();
  const unbind = installAuthoredMotionBus(bus, { clock: () => now, playerEntityId: () => 'player-1' });

  emit('service:started', { type: 'repair', jobId: 'job-1' });
  assert.ok(controller.clipActive('serviceArm'), 'arm unfolding');
  now = 11; // 1s into the 3.6s deploy — short repairs land here on the live wall clock
  emit('service:completed', { type: 'repair', jobId: 'job-1' });
  assert.ok(anySettleActive(controller), 'early completion blends the arm home');
  assert.ok(!controller.clipActive('serviceStow'), 'deploy-assuming stow never fires mid-deploy');
  controller.update(11.4);
  assert.ok(anySettleActive(controller), 'blend evaluates mid-flight without throwing');
  unbind();
});

test('completions for other job types or job ids never consume the arm flag', () => {
  const bank = JSON.parse(JSON.stringify(SERVICE_BANK));
  const root = makeServiceRig();
  const ship = new THREE.Object3D();
  const controller = bindAuthoredMotion(root, bank);
  attachAuthoredMotionDriver(ship, { id: 'player-1' }, [controller]);
  let now = 10;
  const { emit, bus } = makeServiceBus();
  const unbind = installAuthoredMotionBus(bus, { clock: () => now, playerEntityId: () => 'player-1' });

  emit('service:started', { type: 'repair', jobId: 'job-1' });
  emit('service:completed', { type: 'refuel', jobId: 'job-9' });
  emit('service:completed', { type: 'repair', jobId: 'job-2' });
  emit('service:aborted', { type: 'refuel', jobId: 'job-9' });
  assert.ok(controller.clipActive('serviceArm'), 'arm still deployed — foreign completions/aborts are inert');
  now = 14.5; // past the deploy window
  emit('service:completed', { type: 'repair', jobId: 'job-1' });
  assert.ok(controller.clipActive('serviceStow'), 'the real repair completion still stows');
  unbind();
});

test('createAuthoredClock follows sim while it advances and wall time while frozen', () => {
  let sim = 100;
  let wall = 50;
  const clock = createAuthoredClock({ simNow: () => sim, wallNow: () => wall });

  assert.equal(clock(), 100, 'seeds from sim time');
  sim += 2;
  wall += 5;
  assert.equal(clock(), 102, 'tracks sim while it advances — wall delta ignored');
  wall += 0.3; // sim frozen (docked): the yard keepalive convention drives the clock
  assert.equal(clock(), 102.3, 'advances on wall dt while the sim is frozen');
  wall += 3; // a hidden-tab hitch is capped so clips cannot teleport through their timeline
  assert.equal(clock(), 102.8, 'wall deltas beyond the 0.5s cap are absorbed');
  sim += 10;
  wall += 1;
  assert.equal(clock(), 112.8, 're-locks to sim the moment it advances again');
  sim = 4; // sector reset — clock must stay monotonic forward
  wall += 0.25;
  const after = clock();
  assert.ok(after >= 112.8 && after <= 113.3, 'a sim reset never runs clips backwards');
});

test('simTime-carrying payloads are translated onto the authored clock across a dock freeze', () => {
  const bank = JSON.parse(JSON.stringify(SERVICE_BANK));
  const root = makeServiceRig();
  const ship = new THREE.Object3D();
  const controller = bindAuthoredMotion(root, bank);
  attachAuthoredMotionDriver(ship, { id: 'player-1' }, [controller]);
  let sim = 100;
  let wall = 0;
  const authored = createAuthoredClock({ simNow: () => sim, wallNow: () => wall });
  const { emit, bus } = makeServiceBus();
  const unbind = installAuthoredMotionBus(bus, {
    clock: authored, simClock: () => sim, playerEntityId: () => 'player-1',
  });

  assert.equal(authored(), 100);
  for (let i = 0; i < 40; i += 1) { wall += 0.5; authored(); } // docked 20s, frame-by-frame
  assert.equal(authored(), 120);
  // scanner emitted its clip anchor as raw simTime=100 while the eval clock reads 120 —
  // without translation the clip would evaluate 20s past its end and park instantly.
  emit('scan:pulse', { source: 'player-scanner', scannerId: 'player-1', seq: 1, simTime: 100 });
  controller.update(120.4);
  assert.ok(controller.clipActive('sweep'), 'sweep stays alive on the authored clock after a freeze');
  unbind();
});

test('a flag whose rig lost its clips is pruned — a late completion cannot pop a stow', () => {
  const bank = JSON.parse(JSON.stringify(SERVICE_BANK));
  const root = makeServiceRig();
  const ship = new THREE.Object3D();
  const controller = bindAuthoredMotion(root, bank);
  attachAuthoredMotionDriver(ship, { id: 'player-1' }, [controller]);
  let now = 10;
  const { emit, bus } = makeServiceBus();
  const unbind = installAuthoredMotionBus(bus, { clock: () => now, playerEntityId: () => 'player-1' });

  emit('service:started', { type: 'repair', jobId: 'job-1' });
  assert.ok(controller.clipActive('serviceArm'), 'arm deployed');
  // entity rebuild: the controllers were replaced and the new rig is at rest — the flag in
  // the bus closure is now dead and must be pruned, not stowed against.
  controller.settle(0.05, 10);
  controller.update(11);
  emit('service:completed', { type: 'repair', jobId: 'job-1' });
  assert.ok(!controller.clipActive('serviceStow'), 'no deployed-first-key pop on a rebuilt rig');
  assert.ok(!anySettleActive(controller), 'nothing left to blend — the flag was simply dead');
  unbind();
});

test('a payload-less abort neither crashes nor consumes a jobId-flagged deploy', () => {
  const bank = JSON.parse(JSON.stringify(SERVICE_BANK));
  const root = makeServiceRig();
  const ship = new THREE.Object3D();
  const controller = bindAuthoredMotion(root, bank);
  attachAuthoredMotionDriver(ship, { id: 'player-1' }, [controller]);
  const { emit, bus } = makeServiceBus();
  const unbind = installAuthoredMotionBus(bus, { clock: () => 10, playerEntityId: () => 'player-1' });

  emit('service:started', { type: 'repair', jobId: 'job-1' });
  emit('service:aborted'); // foreign payload-less abort — old matchesJob threw here
  assert.ok(controller.clipActive('serviceArm'), 'deploy survives the unattributable abort');
  emit('service:aborted', { type: 'repair', jobId: 'job-1' });
  assert.ok(anySettleActive(controller), 'the real abort still settles the rig');
  unbind();
});

test('a held peel keeps its flag at any age — the repair still lands the armor fix', () => {
  const bank = JSON.parse(JSON.stringify(SERVICE_BANK));
  const root = makeServiceRig();
  const ship = new THREE.Object3D();
  const controller = bindAuthoredMotion(root, bank);
  attachAuthoredMotionDriver(ship, { id: 'player-1' }, [controller]);
  let now = 30;
  const { emit, bus } = makeServiceBus();
  const unbind = installAuthoredMotionBus(bus, { clock: () => now, playerEntityId: () => 'player-1' });

  emit('combat:damage', { targetId: 'player-1', hullHit: true });
  assert.ok(controller.clipActive('armorPeel'), 'cap peeled');
  now = 730; // the peel is a held pose, not a flag lifetime — damage stays up for minutes
  emit('service:completed', { type: 'repair' });
  assert.ok(controller.clipActive('armorStow'), 'age-based pruning would have dropped the live flag and lost the fix');
  unbind();
});

// --- ambient attach clips (ANI phase-2) -----------------------------------------

// Two-group rig: a shared binding shape for supersede/ambient tests.
const AMBIENT_BINDINGS = [
  {
    id: 'arm', node: 'MOTION_ARM', parent: null,
    restPose: { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    requiredAtLod: [0],
  },
  {
    id: 'gear', node: 'MOTION_GEAR', parent: null,
    restPose: { translation: [1, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    requiredAtLod: [0],
  },
];

function makeTwoGroupTree() {
  const root = new THREE.Object3D();
  const arm = new THREE.Object3D(); arm.name = 'MOTION_ARM';
  const gear = new THREE.Object3D(); gear.name = 'MOTION_GEAR';
  arm.position.set(0, 0, 0); gear.position.set(1, 0, 0);
  for (const pivot of [arm, gear]) {
    pivot.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()));
    root.add(pivot);
  }
  return { root, arm, gear };
}

function ambientBank({ events = { 'authoredMotion:attach': 'hum' } } = {}) {
  return {
    schema: MOTION_BANK_SCHEMA,
    rigId: 'ambient_rig',
    sourceAssetId: 'SF_AMBIENT_RIG_V1',
    sourceGlbSha256: '0'.repeat(64),
    fps: 60,
    bindings: AMBIENT_BINDINGS,
    clips: [
      {
        name: 'hum', durationS: 2, loop: true, endMode: 'hold',
        channels: [
          { group: 'arm', path: 'translation', times: [0, 2], values: [0, 0, 0, 0, 0.4, 0] },
        ],
      },
      {
        name: 'kick', durationS: 0.5, loop: false, endMode: 'rest',
        channels: [
          { group: 'arm', path: 'translation', times: [0, 0.5], values: [0, 0, 0, 1, 0, 0] },
          { group: 'gear', path: 'translation', times: [0, 0.5], values: [0, 0, 0, 0, 0, 1] },
        ],
      },
    ],
    events,
  };
}

test('the attach kick arms the ambient loop once, on the first update', () => {
  const { root, arm } = makeTwoGroupTree();
  const ship = new THREE.Object3D();
  const controller = bindAuthoredMotion(root, ambientBank());
  attachAuthoredMotionDriver(ship, { id: 'ent-amb' }, [controller]);
  ship.userData.updateAuthoredMotion({ id: 'ent-amb' }, 10);
  assert.ok(controller.clipActive('hum'), 'ambient clip armed at attach');
  ship.userData.updateAuthoredMotion({ id: 'ent-amb' }, 11);
  assert.ok(arm.position.y > 0.05, 'ambient clip is evaluating');
});

test('ambient loop re-enters when the last event clip drains', () => {
  const { root } = makeTwoGroupTree();
  const ship = new THREE.Object3D();
  const controller = bindAuthoredMotion(
    root, ambientBank({ events: { 'authoredMotion:attach': 'hum', 'test:kick': 'kick' } }),
  );
  attachAuthoredMotionDriver(ship, { id: 'ent-amb2' }, [controller]);
  ship.userData.updateAuthoredMotion({ id: 'ent-amb2' }, 0);
  assert.ok(controller.clipActive('hum'));
  controller.handleEvent('test:kick', {}, 1);
  assert.ok(controller.clipActive('kick'));
  // Kick's claim auto-bridges (hum mid-loop vs kick's key0); the bridge drains on this
  // update and chains into kick — the clip itself starts here, so one more tick past its
  // 0.5s length is what drains it.
  ship.userData.updateAuthoredMotion({ id: 'ent-amb2' }, 2.0);
  ship.userData.updateAuthoredMotion({ id: 'ent-amb2' }, 3.0);
  assert.equal(controller.clipActive('kick'), false);
  assert.ok(controller.clipActive('hum'), 'ambient resumed after drain');
});

test('hasActiveClipsIn ignores channels a newer clip superseded', () => {
  const bank = ambientBank({ events: {} });
  // A clip owning arm+gear superseded out of 'arm' still runs 'gear' — arm must read inactive.
  bank.clips.push({
    name: 'grab', durationS: 10, loop: true, endMode: 'hold',
    channels: [
      { group: 'arm', path: 'translation', times: [0, 10], values: [0, 0, 0, 0, 0.5, 0] },
    ],
  });
  const { root } = makeTwoGroupTree();
  const controller = bindAuthoredMotion(root, bank);
  controller.setState({ state: 'kick', startTimeS: 0 });
  controller.setState({ state: 'grab', startTimeS: 0.1 }); // claims 'arm' out of kick
  assert.equal(controller.hasActiveClipsIn(['arm']), true, 'grab owns arm now');
  controller.setState({ state: 'rest', startTimeS: 0.2 });
  controller.setState({ state: 'kick', startTimeS: 0.3 });
  controller.setState({ state: 'grab', startTimeS: 0.4 });
  controller.setState({ state: 'hum', startTimeS: 0.5 }); // hum owns nothing new
  // kick is superseded on 'arm' by grab; gear claim check: 'gear' is only on kick (live).
  assert.equal(controller.hasActiveClipsIn(['gear']), true);
  controller.setState({ state: 'rest', startTimeS: 0.6 });
  controller.setState({ state: 'hum', startTimeS: 0.7 });
  controller.setState({ state: 'grab', startTimeS: 0.8 });
  // Now kick keeps only 'gear' live; a gear-only query hits kick, an arm query hits grab.
  assert.equal(controller.hasActiveClipsIn(['arm']), true);
  controller.dispose();
});

test('clipElapsed scales by rateScale', () => {
  const { root } = makeTwoGroupTree();
  const controller = bindAuthoredMotion(root, ambientBank());
  controller.setState({ state: 'kick', startTimeS: 10, rateScale: 2 });
  assert.equal(controller.clipElapsed('kick', 11), 2);
  controller.dispose();
});

test('settle merges only live (non-superseded) channel poses', () => {
  const bank = ambientBank({ events: {} });
  bank.clips.push({
    name: 'grab', durationS: 10, loop: true, endMode: 'hold',
    channels: [
      { group: 'arm', path: 'translation', times: [0, 10], values: [0, 0, 0, 0, 0.5, 0] },
    ],
  });
  const { root, arm } = makeTwoGroupTree();
  const controller = bindAuthoredMotion(root, bank);
  controller.setState({ state: 'kick', startTimeS: 0 });
  controller.update(0.25); // kick mid-flight: arm ~0.5, gear ~0.5
  controller.setState({ state: 'grab', startTimeS: 0.3 }); // claims 'arm' mid-kick → auto-bridges
  const ok = controller.settle(0.5, 0.3);
  assert.ok(ok);
  controller.update(0.3);
  // The grab claim auto-bridges (live kick pose 0.6 vs grab's key0 0), so the settle's
  // live 'arm' sample is the mid-bridge pose ~0.6 — the merged truth of what's driving.
  // Kick's superseded channel must NOT leak in: alone it reads ~1.0 at clamp.
  const settle = controller.clipActive('__settle__2') ? '__settle__2' : null;
  assert.ok(settle || controller.state !== 'rest', 'settle clip is running');
  assert.ok(arm.position.x < 0.75,
    `arm x=${arm.position.x} should follow the live merged pose (~0.6), not kick's leaked delta (~1.0)`);
  controller.update(0.9); // settle duration elapsed → parked at rest
  assert.ok(arm.position.x < 0.02, `arm x=${arm.position.x} should have settled to rest`);
  controller.dispose();
});

test('reserved clip names and translation slerp are rejected', () => {
  for (const bad of ['__settle__9', 'rest', 'idle']) {
    const b = ambientBank({ events: {} });
    b.clips[0].name = bad;
    assert.throws(() => validateMotionBank(b), new RegExp(bad === 'rest' || bad === 'idle' ? 'reserved' : 'reserved'));
  }
  const slerpT = ambientBank({ events: {} });
  slerpT.clips[0].channels[0].interpolation = 'slerp';
  assert.throws(() => validateMotionBank(slerpT), /cannot slerp/);
});
