// Production visual -> snapshot pose -> authored state -> late ordnance motion.
// The last owner used to turn finite Ward seats and workpieces off their native
// plane, after the isolated visual tests had already verified their geometry.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { installVisualOverrides } from '../src/render/visualOverrides.js';
import { createOrdnanceMotionTracker } from '../src/render/ordnanceMotionPresentation.js';
import { applySnapshotPoseToMesh, createSnapshotFence } from '../src/render/snapshotFence.js';
import {
  LANTERN_WARD_HARDWARE_ROLES, lanternWardHardwareSpec,
} from '../src/data/lanternWardHardware.js';
import { LANTERN_WARD_BODY_CONTRACTS, lanternWardSocketWorld } from '../src/data/lanternWardLayout.js';

const ORIGIN = { x: 420000, y: 0, z: -83000 };
const factory = () => installVisualOverrides(createVisualFactory(), {
  releaseMode: true, directAuthoredMount: true, authoredWholeShipsOnly: true,
});
const hardware = (role, id = 600) => ({ ...lanternWardHardwareSpec(role), id, occupantGeneration: 4 });
function near(actual, expected, label, tolerance = 1e-4) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
}
function nearVector(actual, expected, label) {
  for (const axis of ['x', 'y', 'z']) near(actual[axis], expected[axis], `${label}.${axis}`);
}
function busFixture() {
  const listeners = new Map();
  return {
    on(name, listener) {
      let set = listeners.get(name);
      if (!set) listeners.set(name, set = new Set());
      set.add(listener); return () => set.delete(listener);
    },
    emit(name, data) { for (const listener of listeners.get(name) || []) listener(data); },
  };
}
function applyNativePose(fence, entity, root, time, origin = ORIGIN) {
  const snapshot = fence.beginPack(1, time, 1);
  const row = snapshot.write(entity.id, 0, entity.pos.x, 0, entity.pos.z,
    0, Math.sin(entity.rot / 2), 0, Math.cos(entity.rot / 2), 1, 1, 1, 0);
  snapshot.setGeneration(row, entity.occupantGeneration); fence.commit();
  assert.equal(applySnapshotPoseToMesh(root, fence.latestSnapshot(), entity.id, origin), true);
}
function articulatedPose(root) {
  const poses = [];
  root.traverse(node => {
    if (node !== root && node.userData.animated) {
      poses.push([node.name, node.visible, ...node.position.toArray(),
        ...node.quaternion.toArray(), ...node.scale.toArray()]);
    }
  });
  return poses;
}
function checkNativePose(root, entity, scale, label) {
  near(root.rotation.x, 0, `${label} pitch`, 1e-12);
  near(root.rotation.z, 0, `${label} roll`, 1e-12);
  near(root.rotation.y, -entity.rot, `${label} snapshot yaw`);
  nearVector(root.position, new THREE.Vector3(entity.pos.x - ORIGIN.x, 0, entity.pos.z - ORIGIN.z), `${label} position`);
  assert.deepEqual(root.scale.toArray(), scale.toArray(), `${label} native producer scale`);
  root.updateMatrixWorld(true);
  const expected = new THREE.Matrix4().compose(root.position,
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, root.rotation.y, 0)), scale);
  root.matrixWorld.elements.forEach((value, i) => near(value, expected.elements[i], `${label} world matrix`));
  const role = entity.data.lanternWardRole;
  for (const name of Object.keys(LANTERN_WARD_BODY_CONTRACTS[role]?.sockets || {})) {
    const actual = root.getObjectByName(`SOCKET_${name}`).getWorldPosition(new THREE.Vector3());
    const socket = lanternWardSocketWorld(entity, name);
    nearVector(actual, new THREE.Vector3(socket.x - ORIGIN.x, socket.y, socket.z - ORIGIN.z), `${label}/${name}`);
  }
}
function checkExposedMark(root) {
  const mark = root.getObjectByName('Family_Three_Brass_Strokes_brass');
  if (!mark) return;
  mark.geometry.computeBoundingBox();
  const center = mark.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(root.matrixWorld);
  const ray = new THREE.Raycaster(new THREE.Vector3(center.x, root.position.y + 20, center.z), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObject(root, true).find(row => {
    for (let node = row.object; node; node = node.parent) if (!node.visible) return false;
    return true;
  });
  assert.equal(hit?.object, mark, 'the physical top mark remains exposed after the late motion owner');
}

test('all six Ward bodies retain the native pose and authored articulation after full/reduced late motion', () => {
  const phases = ['waiting', 'approach', 'brace', 'connect', 'finish', 'retreat', 'damaged', 'waiting', 'finish'];
  const times = [0, 1 / 60, 0.08, 0.2, 0.5, 1, 37, 37453 / 60, 1000];
  for (const a11y of [{}, { reducedMotion: true, reducedFlash: true }, { motionReduce: true, flashReduce: true }]) {
    const tracker = createOrdnanceMotionTracker(), bus = busFixture(); tracker.bindEvents(bus);
    const visuals = factory();
    try {
      for (const [index, role] of LANTERN_WARD_HARDWARE_ROLES.entries()) {
        const entity = hardware(role, 602 + index), root = visuals.build(entity);
        const nativeScale = root.scale.clone(), base = { ...entity.pos }, fence = createSnapshotFence({ capacity: 1 });
        try {
          assert.equal(nativeScale.x, role === 'maintenance_part' ? 5 : 1);
          // Spawn envelopes can arrive before a renderer knows the full recipe.
          bus.emit('entity:spawned', { id: entity.id, type: 'payload' });
          let firstArmPose;
          for (const [frame, time] of times.entries()) {
            const moving = entity.physicsBody.dynamic;
            entity.pos = { x: ORIGIN.x + base.x + (moving ? frame * 0.25 : 0),
              z: ORIGIN.z + base.z + (moving ? frame * -0.5 : 0) };
            entity.rot = moving ? 0.03125 + frame * 0.0625 : 0;
            entity.ttl = frame === 4 ? 0.07 : Infinity;
            Object.assign(entity.data, { lanternWardPhase: phases[frame], lanternWardProgress01: frame / 8,
              lanternWardClamp01: frame > 2 ? 1 : 0, lanternWardLit: frame > 3,
              lanternWardDamage01: frame === 6 ? 0.8 : 0, lanternWardWorkerPresent: frame > 1 });
            applyNativePose(fence, entity, root, time);
            root.userData.updateRuntimeState?.(entity);
            root.userData.updateLod?.(`lod${frame % 3}`);
            const before = JSON.stringify(entity), pose = articulatedPose(root);
            tracker.updateOrdnanceMotion(entity, root, time, 1 / 60, { pos: { x: 0, z: 0 } }, a11y);
            checkNativePose(root, entity, nativeScale, `${role}/${frame}`);
            assert.deepEqual(articulatedPose(root), pose, 'the later owner cannot overwrite authored parts');
            assert.equal(JSON.stringify(entity), before, 'presentation cannot rewrite native body or work state');
            checkExposedMark(root);
            if (role === 'cradle') {
              const arm = root.getObjectByName('Cradle_Swivel_Brace');
              if (frame === 0) firstArmPose = arm.rotation.y;
              if (phases[frame] === 'connect') {
                near(arm.rotation.y, 0, 'committed brace still reaches its work pose');
                assert.notEqual(arm.rotation.y, firstArmPose, 'native articulation still responds to committed work');
              }
            }
            if ((role === 'receiver' || role === 'service_face') && phases[frame] === 'connect') {
              const contact = root.getObjectByName('Worker_Actual_Tool_Contact').getWorldPosition(new THREE.Vector3());
              const socket = lanternWardSocketWorld(entity, 'service_power');
              nearVector(contact, new THREE.Vector3(socket.x - ORIGIN.x, socket.y, socket.z - ORIGIN.z), 'live worker socket contact');
            }
          }
        } finally { root.userData.disposeLanternWardVisual?.(); }
      }
    } finally { tracker.unbindEvents(); }
  }
});

test('stale tumble and scale clean up on the exact mesh, across pooled IDs and fresh same-ID roots', () => {
  for (const role of ['receiver', 'maintenance_part']) for (const mode of ['same-root', 'pooled-new-id', 'fresh-root']) {
    const entity = hardware(role, 840), root = factory().build(entity), nativeScale = root.scale.clone();
    entity.pos.x += ORIGIN.x; entity.pos.z += ORIGIN.z; entity.rot = 0.67;
    const tracker = createOrdnanceMotionTracker(), bus = busFixture(); tracker.bindEvents(bus);
    const oldMesh = mode === 'fresh-root' ? new THREE.Group() : root;
    if (mode === 'fresh-root') oldMesh.scale.set(9, 7, 5);
    const former = { id: mode === 'pooled-new-id' ? entity.id - 1 : entity.id,
      type: 'payload', radius: 6, data: {} };
    try {
      tracker.updateOrdnanceMotion(former, oldMesh, 10, 1 / 60);
      bus.emit('entity:spawned', { id: former.id, type: 'payload' });
      tracker.updateOrdnanceMotion(former, oldMesh, 10.01, 1 / 60);
      assert.notEqual(oldMesh.rotation.x, 0, 'the fixture has real prior cosmetic tumble');
      assert.ok(oldMesh.scale.x < (mode === 'fresh-root' ? 9 : nativeScale.x), 'the fixture has a live unfold scale');
      const oldScale = oldMesh.scale.clone(), oldTilt = oldMesh.rotation.x;
      if (mode === 'fresh-root') {
        // A stale tilt can also survive without a scale record for this new root.
        root.rotation.x = 8.53470120867; root.rotation.z = -6.2016253899;
      }
      root.matrixAutoUpdate = false; root.updateMatrix();
      applyNativePose(createSnapshotFence({ capacity: 1 }), entity, root, 10.02);
      const before = JSON.stringify(entity);
      tracker.updateOrdnanceMotion(entity, root, 10.02, 1 / 60, null, { reducedMotion: true });
      checkNativePose(root, entity, nativeScale, `${role}/${mode}`);
      assert.equal(JSON.stringify(entity), before);
      if (mode === 'fresh-root') {
        assert.deepEqual(oldMesh.scale.toArray(), oldScale.toArray(), 'a fresh root cannot rewrite another mesh');
        assert.equal(oldMesh.rotation.x, oldTilt);
      }
      // The old occupant's tracker state was retired too, not merely hidden for
      // one frame. A subsequent ordinary body begins with its normal fresh pose.
      const next = new THREE.Group(), reference = new THREE.Group();
      tracker.updateOrdnanceMotion(former, next, 20, 1 / 60);
      createOrdnanceMotionTracker().updateOrdnanceMotion(former, reference, 20, 1 / 60);
      assert.deepEqual(next.rotation.toArray(), reference.rotation.toArray());
      assert.deepEqual(next.scale.toArray(), reference.scale.toArray());
    } finally { tracker.unbindEvents(); root.userData.disposeLanternWardVisual?.(); }
  }
});

test('unrelated cargo and forged Ward identities keep their ordinary tumble and deploy envelope', () => {
  const cases = [{ id: 910, type: 'payload', radius: 4, alive: true, data: {} }];
  for (const [role, field, value] of [
    ['receiver', 'worldRecordId', 'lantern-ward:unrelated'],
    ['receiver', 'lanternWardId', 'another-district'],
    ['lamp', 'lanternWardSerial', 'replacement-lamp'],
    ['maintenance_part', 'lanternWardSerial', 'replacement-bearing'],
  ]) {
    const forged = hardware(role, 911 + cases.length); forged.data[field] = value; cases.push(forged);
  }
  for (const entity of cases) {
    const tracker = createOrdnanceMotionTracker(), bus = busFixture(); tracker.bindEvents(bus);
    const root = factory().build(entity), nativeScale = root.scale.clone();
    root.position.set(12, 3, -18); root.rotation.y = 0.42;
    const before = JSON.stringify(entity);
    try {
      tracker.updateOrdnanceMotion(entity, root, 5, 1 / 60);
      const x = root.rotation.x, z = root.rotation.z;
      bus.emit('entity:spawned', { entity, id: entity.id, type: 'payload' });
      tracker.updateOrdnanceMotion(entity, root, 5.01, 1 / 60);
      assert.ok(root.rotation.x !== x || root.rotation.z !== z, 'ordinary payload still tumbles');
      assert.ok(root.scale.x < nativeScale.x, 'ordinary payload still unfolds');
      for (let frame = 0; frame < 20; frame++) tracker.updateOrdnanceMotion(entity, root, 5.05 + frame * 0.05, 0.05);
      assert.deepEqual(root.scale.toArray(), nativeScale.toArray(), 'ordinary unfold settles at its existing native scale');
      assert.equal(root.rotation.y, 0.42); assert.deepEqual(root.position.toArray(), [12, 3, -18]);
      assert.equal(JSON.stringify(entity), before);
    } finally { tracker.unbindEvents(); root.userData.disposeLanternWardVisual?.(); }
  }
});
