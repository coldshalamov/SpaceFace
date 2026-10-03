// NXI-202 / NXI-229 — pooled marks stay with one entity; a shared texture
// disposes only when its last flagged consumer leaves.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearPooledTransientMarks,
  noteSharedTextureConsumer,
  releaseSharedTextureConsumer,
} from '../src/render/renderer.js';

test('rebinding the same entity keeps transient marks and a new entity clears them', () => {
  const mesh = { userData: {} };
  clearPooledTransientMarks(mesh, 7);
  mesh.userData.impactMarks = [{ at: 1 }];
  mesh.userData.graffitiLine = 'tag';
  mesh.userData.heatScorch = 3;

  assert.equal(clearPooledTransientMarks(mesh, 7), false);
  assert.deepEqual(mesh.userData.impactMarks, [{ at: 1 }]);
  assert.equal(mesh.userData.graffitiLine, 'tag');
  assert.equal(mesh.userData.heatScorch, 3);

  assert.equal(clearPooledTransientMarks(mesh, 8), true);
  assert.equal(Object.hasOwn(mesh.userData, 'impactMarks'), false);
  assert.equal(Object.hasOwn(mesh.userData, 'graffitiLine'), false);
  assert.equal(Object.hasOwn(mesh.userData, 'heatScorch'), false);
  assert.equal(mesh.userData.sfBoundEntityId, 8);
});

test('a shared texture disposes only when the last flagged consumer leaves', () => {
  let disposals = 0;
  const shared = {
    userData: { sfEvictWhenEmpty: true },
    dispose() { disposals += 1; },
  };
  noteSharedTextureConsumer(shared, 'hull-a');
  noteSharedTextureConsumer(shared, 'hull-b');
  assert.equal(releaseSharedTextureConsumer(shared, 'hull-a'), false);
  assert.equal(disposals, 0);
  assert.equal(shared.userData.sfConsumers.has('hull-b'), true);

  assert.equal(releaseSharedTextureConsumer(shared, 'hull-b'), true);
  assert.equal(disposals, 1);
  assert.equal(shared.userData.sfConsumers.size, 0);

  let kept = 0;
  const unflagged = {
    userData: {},
    dispose() { kept += 1; },
  };
  noteSharedTextureConsumer(unflagged, 'hull-a');
  noteSharedTextureConsumer(unflagged, 'hull-b');
  assert.equal(releaseSharedTextureConsumer(unflagged, 'hull-a'), false);
  assert.equal(releaseSharedTextureConsumer(unflagged, 'hull-b'), false);
  assert.equal(kept, 0);
});
