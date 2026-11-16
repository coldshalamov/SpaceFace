import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createVisualFactory, setFactoryPresentationNow } from '../src/render/visualFactory.js';
import { createPickupMotionTracker } from '../src/render/pickupMotionPresentation.js';

test('Swarm pickup meshes retain edge visibility and resume their draw callbacks on re-entry', () => {
  const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 200);
  camera.position.set(0, 80, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
  const factory = createVisualFactory();
  const tracker = createPickupMotionTracker();
  const families = [
    { id: 42, data: { swarmRepair: true }, expected: 7 },
    { id: 43, data: { kind: 'swarm_drop', swarmDrop: true, dropId: 'magnet' }, expected: 3 },
  ];
  try {
    for (const family of families) {
      const entity = { id: family.id, type: 'pickup', radius: 2, pos: { x: 0, z: 0 }, data: family.data };
      const root = factory.build(entity);
      const meshes = [];
      root.traverse((object) => { if (object.isMesh) meshes.push(object); });
      assert.equal(meshes.length, family.expected);
      assert.ok(meshes.every((mesh) => mesh.frustumCulled));
      // Origin-centered drop spheres remain valid when its callback rotates the meshes.
      for (const mesh of meshes) {
        mesh.geometry.computeBoundingSphere();
        if (family.expected === 3) assert.equal(mesh.geometry.boundingSphere.center.lengthSq(), 0);
      }
      const pose = (x, time, options = {}) => {
        root.position.x = x;
        tracker.updatePickupMotion(entity, root, time, 0.3, null, options);
        root.updateMatrixWorld(true);
        return meshes.map((mesh) => frustum.intersectsObject(mesh));
      };
      assert.ok(pose(20.05, 0).every(Boolean), 'partially visible edge retains all meshes');
      assert.ok(pose(60, 0.3).every((inside) => !inside), 'offscreen meshes cull');
      assert.ok(pose(0, 0.6).every(Boolean), 'all meshes return on re-entry');
      setFactoryPresentationNow(0.6);
      if (family.data.swarmRepair) {
        const cross = root.getObjectByName('SwarmRepairCrossBarA');
        const before = cross.material.emissiveIntensity;
        cross.onBeforeRender();
        assert.notEqual(cross.material.emissiveIntensity, before, 'visible cross refreshes its glint');
        assert.ok(pose(0, 0.9, { reducedMotion: true }).every(Boolean));
      } else {
        const body = root.getObjectByName('SwarmDropCrystal');
        const outer = root.children[2];
        const before = body.rotation.y;
        body.onBeforeRender();
        assert.notEqual(body.rotation.y, before, 'visible drop resumes rotation');
        root.updateMatrixWorld(true);
        assert.ok(meshes.every((mesh) => frustum.intersectsObject(mesh)));
        pose(23.5, 0.9);
        assert.equal(frustum.intersectsObject(body), false, 'body is beyond the edge');
        assert.equal(frustum.intersectsObject(outer), true, 'larger ring still crosses the edge');
        const beforeRing = outer.rotation.x;
        setFactoryPresentationNow(0.9);
        outer.onBeforeRender();
        assert.notEqual(outer.rotation.x, beforeRing, 'visible ring animates even when body is culled');
        pose(0, 1.2, { reducedMotion: true });
        const held = body.rotation.y;
        const heldRing = outer.rotation.x;
        setFactoryPresentationNow(1.5);
        body.onBeforeRender();
        outer.onBeforeRender();
        assert.equal(body.rotation.y, held, 'reduced motion keeps the tracker pose');
        assert.equal(outer.rotation.x, heldRing, 'reduced motion keeps the outer ring pose');
      }
    }
  } finally {
    setFactoryPresentationNow(null);
  }
});
