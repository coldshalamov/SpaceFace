// Swarm residual readability contracts outside the Perf Lane.
// Threat markers are camera-facing crimson rims. A filled disk the size of the hull hid the
// ship. The harness counts a layer only when it is additive, or transparent with depthWrite
// false and a Points/Sprite/Shader. An opaque MeshBasic rim must not join that budget.
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

test('a hostile ship wears one opaque threat rim that faces the camera', () => {
  const camQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, -0.7, 0.15));
  const meshQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 1.1, 0.55));
  const { mesh, camera, plate } = plateOn(hostile(1, 8), meshQuat, camQuat);
  assert.ok(plate && plate.isMesh, 'hostile team 1 mounts a mesh rim');
  assert.equal(plate.isSprite, undefined);
  assert.equal(plate.geometry.type, 'RingGeometry');
  assert.equal(plate.geometry.parameters.innerRadius, 0.70);
  assert.equal(plate.geometry.parameters.outerRadius, 1);
  const pos = plate.geometry.attributes.position;
  let minR = Infinity;
  let maxR = 0;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
  }
  assert.ok(minR >= 0.70 - 1e-3, `ring reaches into the hull (min ${minR})`);
  assert.ok(maxR <= 1 + 1e-3, `ring extends past the silhouette (max ${maxR})`);
  assert.equal(plate.renderOrder, 12);
  assert.equal(plate.frustumCulled, true);
  assert.equal(plate.scale.x, 8);
  assert.equal(plate.scale.y, 8);
  assert.equal(plate.material.isMeshBasicMaterial, true);
  assert.equal(plate.material.color.getHex(), 0xff1a3a);
  assert.equal(plate.material.side, THREE.DoubleSide);
  assert.equal(plate.material.transparent, false);
  assert.equal(plate.material.depthWrite, false, 'the rim must not occlude the hull');
  assert.equal(plate.material.depthTest, false);
  assert.equal(plate.material.blending, THREE.NormalBlending);
  assert.notEqual(plate.material.blending, THREE.AdditiveBlending);
  assert.ok(plate.material.opacity > 0.02);

  const worldQ = plate.getWorldQuaternion(new THREE.Quaternion());
  const plateZ = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQ);
  const camZ = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
  assert.ok(plateZ.dot(camZ) > 0.999, 'plate +Z matches the camera +Z, so the face looks back at the lens');

  // The silhouette rim sits outside the inner 70% disk the readability sample
  // reads. This hoop is inside that disk and leaves the center open. It shares
  // the rim material, so it stays MeshBasic and out of the additive budget.
  const core = mesh.getObjectByName('sf-swarm-threat-core');
  assert.ok(core && core.isMesh, 'hostile team 1 mounts an inner hoop');
  assert.equal(core.geometry.type, 'RingGeometry');
  assert.equal(core.geometry.parameters.innerRadius, 0.42);
  assert.equal(core.geometry.parameters.outerRadius, 0.62);
  assert.ok(core.geometry.parameters.outerRadius < 0.7, 'the hoop sits inside the readability sample');
  assert.ok(core.geometry.parameters.innerRadius > 0.2, 'the center of the hull stays open');
  assert.equal(core.material, plate.material);
  assert.equal(core.scale.x, plate.scale.x);
  assert.equal(core.scale.y, plate.scale.y);
  assert.equal(core.renderOrder, 12);
  assert.equal(core.visible, true);
  const coreZ = new THREE.Vector3(0, 0, 1).applyQuaternion(core.getWorldQuaternion(new THREE.Quaternion()));
  assert.ok(coreZ.dot(camZ) > 0.999, 'the inner hoop faces the camera with the rim');

  const again = mesh.getObjectByName('sf-swarm-threat-plate');
  const againCore = mesh.getObjectByName('sf-swarm-threat-core');
  syncSwarmThreatPlate(mesh, hostile(1, 8), camera);
  assert.equal(mesh.getObjectByName('sf-swarm-threat-plate'), again, 'a second sync reuses the plate');
  assert.equal(mesh.getObjectByName('sf-swarm-threat-core'), againCore, 'a second sync reuses the inner hoop');

  const other = plateOn(hostile(3, 1), null, null).plate;
  assert.ok(other);
  assert.equal(other.scale.x, 2, 'radius floor is 2');
  assert.equal(other.geometry, plate.geometry, 'rims share one ring');
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
  const core = mesh.getObjectByName('sf-swarm-threat-core');
  const coreWorld = core.getWorldScale(new THREE.Vector3());
  assert.ok(Math.abs(world.x - 8) < 1e-3, `world radius ${world.x} should be 1×8`);
  assert.ok(Math.abs(world.y - 8) < 1e-3);
  assert.ok(Math.abs(coreWorld.x - world.x) < 1e-3, 'the inner hoop uses the rim scale');
  assert.ok(Math.abs(coreWorld.y - world.y) < 1e-3);
  // Outer edge sits on the silhouette. It must not grow past the ship into the
  // readability background ring (d > 1.2r).
  assert.ok(world.x <= 8 * 1.05);
  assert.ok(world.x >= 8 * 0.99);
});

test('a cohort mark widens the bracket and a heading wedge points along the hull nose', () => {
  const mesh = new THREE.Group();
  // entity.rot = PI/2 is world heading +Z. The renderer applies mesh.rotation.y = -entity.rot.
  mesh.rotation.y = -Math.PI / 2;
  const camera = new THREE.Object3D();
  camera.quaternion.setFromEuler(new THREE.Euler(0.4, 1.2, 0.2));
  const entity = { type: 'ship', team: 1, radius: 12, alive: true, data: { swarmMarkRadius: 20 } };
  syncSwarmThreatPlate(mesh, entity, camera);
  mesh.updateMatrixWorld(true);
  const plate = mesh.getObjectByName('sf-swarm-threat-plate');
  const core = mesh.getObjectByName('sf-swarm-threat-core');
  const chevron = mesh.getObjectByName('sf-swarm-threat-chevron');
  const plateWorld = plate.getWorldScale(new THREE.Vector3());
  const coreWorld = core.getWorldScale(new THREE.Vector3());
  assert.ok(Math.abs(plateWorld.x - 20) < 1e-3, `bracket world radius ${plateWorld.x}`);
  assert.ok(Math.abs(coreWorld.x - 12) < 1e-3, 'the inner hoop stays on the hull, not the bracket');
  assert.ok(chevron && chevron.isMesh);
  assert.equal(chevron.geometry.type, 'ConeGeometry');
  assert.equal(chevron.material, plate.material);
  assert.equal(chevron.material.depthTest, false);
  // Cone tip is geometric +Y. After the mount it must agree with the mesh nose (+X),
  // which this yaw sends to world +Z. The camera quat above is a different direction.
  const tip = new THREE.Vector3(0, 1, 0).applyQuaternion(chevron.getWorldQuaternion(new THREE.Quaternion()));
  const nose = new THREE.Vector3(1, 0, 0).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
  assert.ok(tip.dot(nose) > 0.99, `chevron tip ${tip.x.toFixed(2)},${tip.y.toFixed(2)},${tip.z.toFixed(2)} leaves the nose`);
  assert.ok(tip.z > 0.99 && Math.abs(tip.x) < 0.05, 'yawed hull points the wedge at world +Z');
  const camFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
  assert.ok(Math.abs(tip.dot(camFwd)) < 0.95, 'the wedge is not a camera billboard');
  syncSwarmThreatPlate(mesh, { type: 'ship', team: 0, radius: 12 }, camera);
  assert.equal(chevron.visible, false);
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
    const built = plateOn({ type: 'ship', team, radius: 8 }, null, null);
    assert.equal(built.plate, undefined, `team ${team} stays unmarked`);
    assert.equal(built.mesh.getObjectByName('sf-swarm-threat-core'), undefined, `team ${team} grows no inner hoop`);
  }
  const rockBuilt = plateOn({ type: 'asteroid', team: 1, radius: 8 }, null, null);
  assert.equal(rockBuilt.plate, undefined);
  assert.equal(rockBuilt.mesh.getObjectByName('sf-swarm-threat-core'), undefined);
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
