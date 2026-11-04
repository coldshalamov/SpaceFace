import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  LANTERN_WARD_ID, LANTERN_WARD_BODY_CONTRACTS, LANTERN_WARD_OFFSETS,
  LANTERN_WARD_KIT_DRESSING, LANTERN_WARD_SHORE_SPINES,
  lanternWardPoint, lanternWardSocketWorld,
} from '../src/data/lanternWardLayout.js';
import {
  isLanternWardBody, buildLanternWardVisual, lanternWardVisualPose,
} from '../src/render/lanternWardVisuals.js';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { installVisualOverrides, packagedPropSpec } from '../src/render/visualOverrides.js';
import { lanternWardHardwareSpec } from '../src/data/lanternWardHardware.js';

function entity(role, extra = {}) {
  return { id: `lantern:${role}`, type: role === 'lamp' ? 'payload' : 'wreck', alive: true,
    occupantGeneration: 7, pos: { x: 1792, z: -640 }, rot: 0,
    data: { worldRecordId: `lantern:original:${role}`, lanternWardId: LANTERN_WARD_ID,
      lanternWardRole: role, lanternWardPhase: 'waiting', ...extra } };
}
function near(actual, expected, label, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
}
function poses(root) {
  const out = [];
  root.traverse(node => {
    if (node.userData.animated) out.push([node.name, ...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()]);
  });
  return out;
}

test('the installed production wrapper retains finite Ward geometry instead of admitting a generic cargo model', () => {
  const factory = installVisualOverrides(createVisualFactory(), {
    releaseMode: true, directAuthoredMount: true, authoredWholeShipsOnly: true,
  });
  for (const [index, role] of ['cradle', 'lamp', 'receiver', 'obstruction', 'service_face', 'maintenance_part'].entries()) {
    const e = { ...lanternWardHardwareSpec(role), id: 800 + index, occupantGeneration: 3 };
    const before = JSON.stringify(e), root = factory.build(e);
    assert.ok(root);
    assert.equal(packagedPropSpec(e), null);
    assert.equal(root.userData.requestAuthoredUpgrade, undefined, 'no later cargo admission may hide the producer');
    assert.equal(root.userData.authoredUpgradePromise, undefined);
    assert.equal(root.userData.authoredPayloadAssetId, undefined);
    assert.equal(root.getObjectByName('payload_PackagedBody'), undefined);
    assert.equal(JSON.stringify(e), before, 'the presentation wrapper does not rewrite body or custody');
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    assert.equal(box.isEmpty(), false);
    assert.ok(box.max.x - box.min.x <= e.radius * 2);
    assert.ok(box.max.z - box.min.z <= e.radius * 2);
    if (role !== 'maintenance_part') {
      assert.equal(root.userData.generatedVisualProducer, 'lantern-ward-authored-civic-v1');
      assert.equal(root.userData.lanternWardAssetId, LANTERN_WARD_BODY_CONTRACTS[role].assetId);
      assert.ok(box.max.y - box.min.y <= LANTERN_WARD_BODY_CONTRACTS[role].size[1]);
    }
    if (role === 'lamp') {
      const globe = root.getObjectByName('Family_Globe');
      assert.ok(globe?.isMesh); assert.equal(globe.material.emissiveIntensity, 0);
      e.data.lanternWardLit = true; root.userData.updateRuntimeState(e);
      assert.ok(globe.material.emissiveIntensity > 0, 'a committed light remains the visible body after wrapping');
    }
    if (role === 'cradle') assert.ok(root.getObjectByName('Cradle_Swivel_Brace'));
    root.userData.disposeLanternWardVisual?.();
  }
});

test('Ward admission exclusion preserves ordinary cargo and explicit authored recipe priority', () => {
  const ordinary = { type: 'payload', alive: true, radius: 4, data: {} };
  const generic = packagedPropSpec(ordinary);
  assert.ok(generic?.file);
  for (const mutate of [
    e => { e.data.worldRecordId = 'unrelated:cradle'; },
    e => { e.data.lanternWardId = 'another_district'; },
  ]) {
    const e = lanternWardHardwareSpec('cradle'); mutate(e);
    assert.deepEqual(packagedPropSpec(e), generic, 'public-looking tags cannot suppress unrelated cargo admission');
  }
  const explicit = lanternWardHardwareSpec('cradle');
  Object.assign(explicit.data, { packagedPropFile: 'places/place_cargo_pod_standard.glb', packagedPropRadius: 4 });
  assert.equal(packagedPropSpec(explicit).file, explicit.data.packagedPropFile);
  assert.equal(packagedPropSpec(explicit).radius, 4);
});

test('ordinary visual selector only accepts its explicit ward identity; never the Candle Fleet', () => {
  for (const e of [null, {}, { ...entity('cradle'), alive: false },
    entity('cradle', { lanternWardId: 'different_district' }),
    entity('unknown'), entity('receiver', { worldRecordId: '' }),
    { id: 'poi_memorial', type: 'anomaly', data: { poiId: 'poi_memorial', landmarkGlb: 'place_landmark_candle_fleet' } }]) {
    assert.equal(isLanternWardBody(e), false);
    assert.equal(buildLanternWardVisual(e), null);
  }
  assert.equal(isLanternWardBody(entity('cradle')), true);
});

test('lamp is one distinct physical visual; empty cradle and receiver contain no cosmetic payload', () => {
  const roots = ['cradle', 'receiver', 'lamp'].map(role => buildLanternWardVisual(entity(role)));
  assert.equal(roots[0].getObjectByName('Family_Globe'), undefined);
  assert.equal(roots[1].getObjectByName('Family_Globe'), undefined);
  assert.ok(roots[2].getObjectByName('Family_Globe')?.isMesh);
  assert.equal(roots[0].userData.lanternWardAssetId, 'place_lw_lantern_cradle');
  assert.equal(roots[1].userData.lanternWardAssetId, 'place_lw_family_receiver');
  for (const root of roots) root.userData.disposeLanternWardVisual();
});

function exposedTop(root, x, z) {
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 20, z), new THREE.Vector3(0, -1, 0));
  return ray.intersectObject(root, true).find(hit => {
    for (let node = hit.object; node; node = node.parent) if (!node.visible) return false;
    return true;
  });
}

test('three broad matching brass strokes are exposed on the lamp cap and both seats at every LOD', () => {
  const factory = installVisualOverrides(createVisualFactory(), { releaseMode: true, directAuthoredMount: true });
  let brassColor;
  for (const [index, [role, x, z, scale]] of [
    ['lamp', 0, 0.1, 1], ['cradle', 4.5, 6.3, 1.1], ['receiver', -4.8, -7.3, 1.25],
  ].entries()) {
    const e = { ...lanternWardHardwareSpec(role), id: 920 + index, occupantGeneration: 3 };
    const root = factory.build(e), before = JSON.stringify(e);
    try {
      const mark = root.getObjectByName('Family_Three_Brass_Strokes_brass');
      assert.ok(mark?.isMesh, `${role} carries physical brass geometry`);
      mark.geometry.computeBoundingBox();
      const size = mark.geometry.boundingBox.getSize(new THREE.Vector3());
      assert.ok(size.x / scale > 3.8 && size.z / scale > 2.7, `${role} mark is a broad top-face feature`);
      assert.ok(size.y > 0.15, 'the strokes are raised plates');
      assert.equal(mark.material.emissiveIntensity, 0, 'the household mark cannot imply an illuminated lamp');
      brassColor ??= mark.material.color.getHex();
      assert.equal(mark.material.color.getHex(), brassColor, 'all three bodies carry the same brass finish');
      for (const lod of ['lod0', 'lod1', 'lod2']) {
        root.userData.updateLod(lod); root.updateMatrixWorld(true);
        for (const stroke of [-1, 0, 1]) {
          // Probe a broad patch on each stroke, not just a potentially exposed
          // vertex. Other geometry above it would defeat the first-hit check.
          for (const dx of [-0.28, 0.28]) for (const dz of [-0.9, 0.9]) {
            const hit = exposedTop(root, x + (stroke * 1.4 + dx) * scale, z + dz * scale);
            assert.equal(hit?.object, mark, `${role}/${lod}: the brass top face remains uncovered`);
          }
        }
        for (const gap of [-0.7, 0.7]) {
          const hit = exposedTop(root, x + gap * scale, z);
          assert.equal(hit?.object.material.name, 'LanternWard_machinery',
            `${role}/${lod}: dark gaps keep three strokes distinguishable`);
        }
      }
      assert.equal(JSON.stringify(e), before);
    } finally { root.userData.disposeLanternWardVisual(); }
  }
});

test('the receiver shows a broad pale annulus around a recessed empty cup', () => {
  const root = buildLanternWardVisual(entity('receiver'));
  try {
    root.updateMatrixWorld(true);
    const well = exposedTop(root, 0, 0);
    assert.equal(well?.object.material.name, 'LanternWard_machinery', 'the empty center is a dark recess');
    for (const angle of [0, Math.PI / 2]) for (const radius of [3.6, 4.1, 4.35]) {
      const rim = exposedTop(root, Math.cos(angle) * radius, Math.sin(angle) * radius);
      assert.equal(rim?.object.material.name, 'LanternWard_reused_enamel', 'a broad pale surface outlines the cup');
      assert.ok(rim.point.y - well.point.y > 0.4, 'the empty well sits below its physical rim');
      assert.ok(rim.face.normal.y > 0.95, 'the rim presents a flat top face to the gameplay camera');
    }
    assert.equal(root.getObjectByName('Family_Globe'), undefined);
  } finally { root.userData.disposeLanternWardVisual(); }
});

test('phase, clamp and saved damage articulate real parts and never mutate the entity', () => {
  const e = entity('cradle'), before = JSON.stringify(e), root = buildLanternWardVisual(e);
  const jaw = root.getObjectByName('Cradle_Retainer_Port'), arm = root.getObjectByName('Cradle_Swivel_Brace');
  near(jaw.rotation.y, 0.62, 'unloaded jaw stands open');
  assert.equal(JSON.stringify(e), before);
  e.data.lanternWardClamp01 = 1;
  e.data.lanternWardPhase = 'connect'; e.data.lanternWardProgress01 = 0.4;
  root.userData.updateRuntimeState(e, 20);
  near(jaw.rotation.y, 0, 'actual retained load closes the jaw');
  near(arm.rotation.y, 0, 'connected brace reaches the work axis');
  const frozen = poses(root), truth = JSON.stringify(e);
  for (let i = 0; i < 30; i++) root.userData.updateRuntimeState(e, 20000 + i);
  assert.deepEqual(poses(root), frozen, 'wall time or repeated rendering cannot advance a job');
  assert.equal(JSON.stringify(e), truth);
  root.userData.disposeLanternWardVisual();
});

test('tool tip contacts the named power socket after rotation and nonzero frame translation', () => {
  for (const role of ['receiver', 'service_face']) {
    const e = entity(role, { lanternWardPhase: 'connect', lanternWardProgress01: 0.7,
      lanternWardWorkerPresent: true });
    e.pos = { x: 43892.75, z: -17301.5 }; e.rot = 1.13;
    const root = buildLanternWardVisual(e);
    root.position.set(e.pos.x, 0, e.pos.z); root.rotation.y = -e.rot; root.updateMatrixWorld(true);
    const actual = new THREE.Vector3(), expected = lanternWardSocketWorld(e, 'service_power');
    root.getObjectByName('Worker_Actual_Tool_Contact').getWorldPosition(actual);
    near(actual.x, expected.x, 'tool X'); near(actual.y, expected.y, 'tool Y'); near(actual.z, expected.z, 'tool Z');
    for (let i = 0; i <= 10; i++) {
      e.data.lanternWardProgress01 = i / 10; root.userData.updateRuntimeState(e); root.updateMatrixWorld(true);
      root.getObjectByName('Worker_Actual_Tool_Contact').getWorldPosition(actual);
      near(actual.distanceTo(new THREE.Vector3(expected.x, expected.y, expected.z)), 0, 'contact remains on the real face');
    }
    e.data.lanternWardWorkerPresent = false; root.userData.updateRuntimeState(e);
    assert.equal(root.getObjectByName('Ward_EVA_Technician').visible, false);
    assert.equal(root.getObjectByName('Worker_Umbilical').visible, false);
    root.userData.disposeLanternWardVisual();
  }
});

test('new occupants cannot reuse the old visual worker, light or attachment pose', () => {
  const e = entity('receiver', { lanternWardWorkerPresent: true, lanternWardLit: true });
  const root = buildLanternWardVisual(e);
  for (const bad of [{ ...e, occupantGeneration: 8 }, { ...e, alive: false },
    { ...e, data: { ...e.data, worldRecordId: 'recycled' } },
    { ...e, data: { ...e.data, lanternWardRole: 'lamp' } }, { ...e, id: 'another' }]) {
    root.userData.updateRuntimeState(bad); assert.equal(root.visible, false);
  }
  root.userData.updateRuntimeState(e); assert.equal(root.visible, true);
  root.userData.detachAuthoredMotion(); root.userData.updateRuntimeState(e);
  assert.equal(root.visible, false, 'retired callbacks cannot relight a scene');
  root.userData.disposeLanternWardVisual();
});

test('damage and actual service truth distinguish return views without flashing', () => {
  const e = entity('lamp'), root = buildLanternWardVisual(e), globe = root.getObjectByName('Family_Globe');
  const before = poses(root); assert.equal(globe.material.emissiveIntensity, 0);
  e.data.lanternWardLit = true; root.userData.updateRuntimeState(e);
  assert.ok(globe.material.emissiveIntensity > 0);
  e.data.lanternWardDamage01 = 0.8; root.userData.updateRuntimeState(e);
  assert.equal(globe.material.emissiveIntensity, 0);
  assert.equal(root.getObjectByName('Family_Lamp_Damaged_Guard').visible, true);
  assert.notDeepEqual(poses(root), before);
  root.updateMatrixWorld(true);
  assert.equal(globe.matrixAutoUpdate, true, 'damage pose stays live after static child freezing');
  root.userData.disposeLanternWardVisual();
});

test('finite authored bounds contain all work, empty, broken and retreat poses', () => {
  const phases = ['waiting', 'approach', 'brace', 'connect', 'finish', 'retreat', 'damaged'];
  for (const [role, contract] of Object.entries(LANTERN_WARD_BODY_CONTRACTS)) {
    const e = entity(role, { lanternWardWorkerPresent: true }), root = buildLanternWardVisual(e);
    const box = new THREE.Box3();
    for (const phase of phases) for (const p of [0, 0.5, 1]) {
      Object.assign(e.data, { lanternWardPhase: phase, lanternWardProgress01: p,
        lanternWardClamp01: p, lanternWardDamage01: p });
      root.userData.updateRuntimeState(e); root.updateMatrixWorld(true); box.setFromObject(root);
      for (let axis = 0; axis < 3; axis++) {
        const key = ['x', 'y', 'z'][axis], low = contract.center[axis] - contract.size[axis] / 2;
        const high = contract.center[axis] + contract.size[axis] / 2;
        assert.ok(box.min[key] >= low - 1e-4, `${role}/${phase}/${p} ${key} min ${box.min[key]} below ${low}`);
        assert.ok(box.max[key] <= high + 1e-4, `${role}/${phase}/${p} ${key} max ${box.max[key]} above ${high}`);
      }
    }
    for (const shape of contract.collision) {
      assert.ok(Math.hypot(Math.abs(shape.x) + shape.hx, Math.abs(shape.z) + shape.hz) <= contract.radius,
        `${role} broadphase bounds include each native proxy`);
    }
    root.userData.disposeLanternWardVisual();
  }
});

test('all named sockets agree with the same XZ transform used by physical owners', () => {
  for (const role of Object.keys(LANTERN_WARD_BODY_CONTRACTS)) {
    const e = entity(role), root = buildLanternWardVisual(e);
    e.pos = { x: -38211, z: 6402 }; e.rot = -0.91;
    root.position.set(e.pos.x, 0, e.pos.z); root.rotation.y = -e.rot; root.updateMatrixWorld(true);
    for (const name of Object.keys(LANTERN_WARD_BODY_CONTRACTS[role].sockets)) {
      const actual = new THREE.Vector3(), expected = lanternWardSocketWorld(e, name);
      root.getObjectByName(`SOCKET_${name}`).getWorldPosition(actual);
      near(actual.x, expected.x, `${role}/${name}/x`);
      near(actual.y, expected.y, `${role}/${name}/y`);
      near(actual.z, expected.z, `${role}/${name}/z`);
    }
    root.userData.disposeLanternWardVisual();
  }
});

test('bounded graph and private resources survive LOD, malformed poses and repeated retirement', () => {
  const e = entity('cradle'), root = buildLanternWardVisual(e), sibling = buildLanternWardVisual(entity('cradle'));
  const nodes = [], otherMaterials = new Set(), otherGeometries = new Set();
  root.traverse(n => nodes.push(n)); sibling.traverse(n => {
    if (n.material) otherMaterials.add(n.material); if (n.geometry) otherGeometries.add(n.geometry);
  });
  let disposedGeometry = 0, disposedMaterials = 0;
  const geometries = new Set(), materials = new Set();
  for (const n of nodes) {
    if (n.geometry) { geometries.add(n.geometry); assert.equal(otherGeometries.has(n.geometry), false); }
    if (n.material) { materials.add(n.material); assert.equal(otherMaterials.has(n.material), false); }
  }
  for (const g of geometries) g.addEventListener('dispose', () => disposedGeometry++);
  for (const m of materials) m.addEventListener('dispose', () => disposedMaterials++);
  for (let i = 0; i < 120; i++) {
    Object.assign(e.data, { lanternWardPhase: i % 2 ? 'unknown' : 'retreat', lanternWardProgress01: NaN,
      lanternWardClamp01: Infinity, lanternWardDamage01: -10 });
    root.userData.updateRuntimeState(e); root.userData.updateLod(i % 2 ? 'lod0' : 'lod2');
  }
  const after = []; root.traverse(n => after.push(n)); assert.deepEqual(after, nodes);
  assert.ok(root.getObjectByName('Cradle_Retainer_Port').visible, 'LOD never removes the working silhouette');
  root.userData.disposeLanternWardVisual(); root.userData.disposeLanternWardVisual();
  assert.equal(disposedGeometry, geometries.size); assert.equal(disposedMaterials, materials.size);
  sibling.userData.updateRuntimeState(entity('cradle')); assert.equal(sibling.visible, true);
  sibling.userData.disposeLanternWardVisual();
  const pose = lanternWardVisualPose({ lanternWardPhase: 'connect', lanternWardProgress01: NaN });
  assert.equal(pose.progress, 0); assert.equal(pose.contact, true);
});

test('district geometry is a live-anchor-relative crescent with a real clear service gap', () => {
  const anchor = { x: 421680, z: -83820 };
  assert.deepEqual(lanternWardPoint(anchor, 'cradle'), { x: 421710, z: -83650 });
  assert.equal(lanternWardPoint({ x: NaN, z: 0 }, 'cradle'), null);
  assert.equal(lanternWardPoint(anchor, 'unknown'), null);
  const opening = LANTERN_WARD_OFFSETS.serviceCutSouth.z - LANTERN_WARD_OFFSETS.serviceCutNorth.z
    - LANTERN_WARD_BODY_CONTRACTS.service_cheek.size[2];
  assert.equal(opening, 84);
  const mastLength = LANTERN_WARD_BODY_CONTRACTS.obstruction.size[0];
  assert.ok((opening - mastLength) / 2 < 28, 'fallen transverse mast blocks a Hitch-width cut');
  for (const row of LANTERN_WARD_KIT_DRESSING) {
    assert.ok(Math.hypot(row.offset.x, row.offset.z) - row.radius >= 125, `${row.id} protects the memorial membrane`);
  }
  for (const row of LANTERN_WARD_SHORE_SPINES) {
    assert.ok(Math.hypot(row.offset.x, row.offset.z) - LANTERN_WARD_BODY_CONTRACTS.shore_spine.radius >= 125,
      `${row.id} protects the memorial membrane`);
  }
});
