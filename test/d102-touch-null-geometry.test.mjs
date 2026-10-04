import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

// D102 class (demo defect ledger): native seed-47 launch reached null
// `geometry.id` inside Three WebGLGeometries.get via
// openingGpuAdmission.touchSubjectOnExactTarget. A subject whose geometry is
// gone (torn-down/never-committed mesh reaching the touch lane) must be
// skipped with provenance, never drawn into the native call.
import { touchSubjectOnExactTarget } from '../src/render/openingGpuAdmission.js';

function makeRendererStub({ calls }) {
  return {
    autoClear: true,
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    render: (scene, camera) => {
      calls.push(true);
      scene.traverse((object) => {
        if (object && object.isMesh === true && object.visible !== false) {
          // Mirror the native crash site: three's WebGLGeometries.get reads
          // geometry.id unconditionally. Seed 4242 pins the crash.
          if (!object.geometry || object.geometry.id == null) {
            throw new TypeError("Cannot read properties of null (reading 'id')");
          }
        }
      });
    },
  };
}

test('D102 seed 4242: touch skips a null-geometry subject instead of reaching the native geometry read', async () => {
  const seed = 4242;
  assert.equal(seed, 4242);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const live = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial(),
  );
  live.name = 'live-hull';
  const dead = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial(),
  );
  dead.name = 'retired-hull';
  dead.geometry = null;
  scene.add(live, dead);

  const calls = [];
  const renderer = makeRendererStub({ calls });
  const result = touchSubjectOnExactTarget(renderer, null, [live, dead], camera, scene);

  assert.equal(calls.length, 1, 'exactly one native draw issues (no retry into the crash)');
  assert.equal(result.skipped, false);
  assert.equal(result.drawn, 1, 'the live subject still draws');
  assert.equal(result.skippedSubjects, 1, 'the null-geometry subject is skipped, not drawn');
  assert.ok(Array.isArray(result.skippedNullGeometry) && result.skippedNullGeometry.length === 1);
  assert.match(JSON.stringify(result.skippedNullGeometry), /retired-hull/);
  assert.equal(scene.children.includes(dead), true, 'foreign subject parentage restored');
  assert.equal(dead.visible, true, 'hidden-subject visibility restored');
});
