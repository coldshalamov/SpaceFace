// Swarm residual readability contracts outside the Perf Lane.
// Threat plates are opaque camera-facing markers. The harness counts a layer only when it is
// additive, or transparent with depthWrite false and a Points/Sprite/Shader. An opaque MeshBasic
// plate must not join that budget.
// Foundry room solids are dark furniture. The generic station (white greeble, rings, blinkers)
// read as a geodesic sitting on the pilot.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createVisualFactory, syncSwarmThreatPlate } from '../src/render/visualFactory.js';

function hostile(team, radius) {
  return { id: `ship-${team}`, type: 'ship', team, radius, alive: true };
}

function plateOn(entity, meshQuat, camQuat) {
  const mesh = new THREE.Group();
  if (meshQuat) mesh.quaternion.copy(meshQuat);
  const camera = new THREE.Object3D();
  if (camQuat) camera.quaternion.copy(camQuat);
  syncSwarmThreatPlate(mesh, entity, camera);
  mesh.updateMatrixWorld(true);
  return { mesh, camera, plate: mesh.getObjectByName('sf-swarm-threat-plate') };
}

test('a hostile ship wears one opaque threat plate that faces the camera', () => {
  const camQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, -0.7, 0.15));
  const meshQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 1.1, 0.55));
  const { mesh, camera, plate } = plateOn(hostile(1, 8), meshQuat, camQuat);
  assert.ok(plate && plate.isMesh, 'hostile team 1 mounts a mesh plate');
  assert.equal(plate.isSprite, undefined);
  assert.equal(plate.renderOrder, 12);
  assert.equal(plate.frustumCulled, true);
  assert.equal(plate.scale.x, 8);
  assert.equal(plate.scale.y, 8);
  assert.equal(plate.material.isMeshBasicMaterial, true);
  assert.equal(plate.material.color.getHex(), 0xff1a3a);
  assert.equal(plate.material.side, THREE.DoubleSide);
  assert.equal(plate.material.transparent, false);
  assert.equal(plate.material.depthWrite, true);
  assert.equal(plate.material.depthTest, false);
  assert.equal(plate.material.blending, THREE.NormalBlending);
  assert.notEqual(plate.material.blending, THREE.AdditiveBlending);
  assert.ok(plate.material.opacity > 0.02);

  const worldQ = plate.getWorldQuaternion(new THREE.Quaternion());
  const plateZ = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQ);
  const camZ = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
  assert.ok(plateZ.dot(camZ) > 0.999, 'plate +Z matches the camera +Z, so the face looks back at the lens');

  const again = mesh.getObjectByName('sf-swarm-threat-plate');
  syncSwarmThreatPlate(mesh, hostile(1, 8), camera);
  assert.equal(mesh.getObjectByName('sf-swarm-threat-plate'), again, 'a second sync reuses the plate');

  const other = plateOn(hostile(3, 1), null, null).plate;
  assert.ok(other);
  assert.equal(other.scale.x, 2, 'radius floor is 2');
  assert.equal(other.geometry, plate.geometry, 'plates share one circle');
  assert.equal(other.material, plate.material);
});

test('a scaled hull does not inflate the threat plate past the ship', () => {
  const mesh = new THREE.Group();
  mesh.scale.setScalar(4);
  const camera = new THREE.Object3D();
  syncSwarmThreatPlate(mesh, hostile(1, 8), camera);
  mesh.updateMatrixWorld(true);
  const plate = mesh.getObjectByName('sf-swarm-threat-plate');
  const world = plate.getWorldScale(new THREE.Vector3());
  assert.ok(Math.abs(world.x - 8) < 1e-3, `world radius ${world.x} should be 1×8`);
  assert.ok(Math.abs(world.y - 8) < 1e-3);
  // Readability samples the inner 70% of entity.radius. The plate covers that
  // square (corners ~0.99r) and stays inside the background ring at 1.2r.
  assert.ok(world.x >= 8 * 0.99);
  assert.ok(world.x <= 8 * 1.05);
});

test('the threat crimson clears the low-contrast bar against a dark field', () => {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = (r, g, b) => {
    const y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const f = y > 0.008856 ? Math.cbrt(y) : 7.787 * y + 16 / 116;
    return 116 * f - 16;
  };
  const plateL = L(1, 0x1a / 255, 0x3a / 255);
  const fieldL = L(0.02, 0.02, 0.03);
  assert.ok(Math.abs(plateL - fieldL) >= 8, `ΔL ${plateL - fieldL} is below the readability floor`);
});

test('friendly teams and non-ships grow no threat plate', () => {
  for (const team of [null, undefined, 0, 2]) {
    const { plate } = plateOn({ type: 'ship', team, radius: 8 }, null, null);
    assert.equal(plate, undefined, `team ${team} stays unmarked`);
  }
  const rock = plateOn({ type: 'asteroid', team: 1, radius: 8 }, null, null).plate;
  assert.equal(rock, undefined);
  assert.equal(syncSwarmThreatPlate(null, hostile(1, 8), null), undefined);
});

function foundry(kind, radius = 16) {
  const vf = createVisualFactory();
  const root = vf.build({
    id: `survival-room-${kind}`,
    type: 'station',
    radius,
    data: { roomOwner: 'survival-arena', roomKind: kind },
  });
  assert.ok(root && root.isObject3D, `${kind} builds`);
  return root;
}

function meshesOf(root) {
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  return meshes;
}

test('a foundry room solid is dark furniture, not a lit station', () => {
  const kinds = {
    plate: { color: 0x2c2926, geo: 'BoxGeometry' },
    gate: { color: 0x2c2926, geo: 'CylinderGeometry' },
    furnace: { color: 0x3a2418, geo: 'BoxGeometry' },
    crate: { color: 0x2c2926, geo: 'BoxGeometry' },
  };
  for (const [kind, expect] of Object.entries(kinds)) {
    const root = foundry(kind);
    assert.equal(root.userData.roomToy, kind);
    assert.equal(root.userData.kind, 'station');
    assert.equal(root.userData.hlodAttached, true);
    const meshes = meshesOf(root);
    assert.ok(meshes.length >= 1 && meshes.length <= 2, `${kind} stays a couple of solids`);
    let sawBody = false;
    let sawMouth = false;
    for (const mesh of meshes) {
      assert.equal(mesh.isSprite, undefined);
      assert.equal(mesh.isPoints, undefined);
      const mat = mesh.material;
      assert.ok(!Array.isArray(mat));
      assert.notEqual(mat.blending, THREE.AdditiveBlending);
      assert.equal(mat.transparent, false);
      assert.equal(mat.type === 'ShaderMaterial', false);
      assert.equal(mesh.geometry.type === 'TorusGeometry', false, `${kind} has no ring`);
      assert.equal(mesh.geometry.type === 'SphereGeometry', false, `${kind} has no blinker lens`);
      assert.equal(mesh.geometry.type === 'IcosahedronGeometry', false);
      assert.equal(mesh.userData.blink, undefined);
      const bright = mat.color.r > 0.75 && mat.color.g > 0.75 && mat.color.b > 0.75;
      assert.equal(bright, false, `${kind} material stays off white`);
      if (mat.isMeshStandardMaterial) {
        sawBody = true;
        assert.equal(mat.color.getHex(), expect.color);
        assert.equal(mat.roughness, 0.94);
        assert.equal(mat.metalness, 0.06);
        assert.equal(mesh.geometry.type, expect.geo);
        if (kind === 'furnace') assert.equal(mat.emissiveIntensity, 0.16);
        else assert.equal(mat.emissiveIntensity, 0);
      }
      if (mat.isMeshBasicMaterial) {
        sawMouth = true;
        assert.equal(kind, 'furnace');
        assert.equal(mat.color.getHex(), 0x6a3014);
        assert.equal(mat.depthWrite, true);
      }
    }
    assert.equal(sawBody, true, `${kind} has a matte body`);
    assert.equal(sawMouth, kind === 'furnace');
  }
});
