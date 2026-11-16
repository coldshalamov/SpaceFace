import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createVisualFactory, setFactoryPresentationNow } from '../src/render/visualFactory.js';
import { createPickupMotionTracker } from '../src/render/pickupMotionPresentation.js';

test('ordinary pickup meshes cull offscreen and return with current motion and glint', () => {
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
  for (const amount of [1, 1000]) {
    const entity = { id: amount, type: 'pickup', radius: 2, pos: { x: 0, z: 0 },
      data: { commodityId: 'cmdty_ore_iron', amount } };
    const root = factory.build(entity);
    const meshes = [root.userData.gem, root.userData.pickupHalo, root.userData.worthBand].filter(Boolean);
    assert.equal(meshes.length, amount === 1 ? 2 : 3);
    assert.ok(meshes.every((mesh) => mesh.frustumCulled));
    const pose = (x, time) => {
      root.position.x = x;
      tracker.updatePickupMotion(entity, root, time, 0.3, null, {});
      root.updateMatrixWorld(true);
      return meshes.map((mesh) => frustum.intersectsObject(mesh));
    };
    assert.ok(pose(20.1, 0).every(Boolean), 'partially visible edge meshes remain submitted');
    const initialScale = root.userData.pickupHalo.scale.x;
    let changedScale = false;
    for (let step = 1; step <= 20; step++) {
      assert.ok(pose(60, step * 0.3).every((visible) => !visible), 'all meshes are outside');
      changedScale ||= root.userData.pickupHalo.scale.x !== initialScale;
    }
    assert.ok(changedScale, 'motion updates the bound transform');
    assert.ok(pose(0, 6.3).every(Boolean), 'all meshes return when the pickup re-enters');
    setFactoryPresentationNow(6.3);
    root.userData.gem.onBeforeRender();
    assert.ok(root.userData.gem.material.emissiveIntensity > 0, 'glint is refreshed on re-entry');
  }
  setFactoryPresentationNow(null);
});
