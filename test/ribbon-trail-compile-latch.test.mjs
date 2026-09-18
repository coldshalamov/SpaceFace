// PQ-033.02: a lazily-created ribbon trail must not draw before its program links.
//
// NPC trails are created mid-flight and their compile is queued after-present; revealing
// first links the program inside the presented bloom pass (1.7 s Intel GPU brick in soak
// evidence: unstamped SF_RibbonTrail + a program link). The trail honors the same
// userData.pipelinesPending latch entity meshes use: geometry still builds while held,
// visibility waits for the latch to clear. No latch (headless/tests/preview contexts)
// keeps the old immediate reveal.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createRibbonTrail } from '../src/render/engineTrailSurfaces.js';

function liveTrail() {
  const scene = new THREE.Scene();
  const trail = createRibbonTrail(scene, '#7fe0ff', 8, 3);
  trail.push(-3, 0, 0);
  trail.push(3, 0, Math.PI / 2);
  return { trail, mesh: trail.getMesh() };
}

test('ribbon trail rebuild holds visibility while pipelines are pending', () => {
  const { trail, mesh } = liveTrail();
  mesh.userData.pipelinesPending = true;
  trail.rebuild(0.85, 0.1, 1, 1.6);
  assert.equal(mesh.visible, false, 'held trail must not draw before its program links');
  assert.ok(
    mesh.geometry.drawRange.count > 0,
    'held trail still builds its geometry so reveal is instant',
  );
});

test('ribbon trail rebuild reveals once pipelines settle', () => {
  const { trail, mesh } = liveTrail();
  mesh.userData.pipelinesPending = true;
  trail.rebuild(0.85, 0.1, 1, 1.6);
  assert.equal(mesh.visible, false);
  mesh.userData.pipelinesPending = false;
  trail.rebuild(0.85, 0.1, 1, 1.6);
  assert.equal(mesh.visible, true, 'settled trail must draw');
});

test('ribbon trail without a latch behaves as before', () => {
  const { trail, mesh } = liveTrail();
  assert.equal(mesh.userData.pipelinesPending, undefined);
  trail.rebuild(0.85, 0.1, 1, 1.6);
  assert.equal(mesh.visible, true, 'no latch means immediate reveal');
});
