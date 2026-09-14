import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createVisualFactory } from '../src/render/visualFactory.js';

// The generic packaged-body admission path (wrecks, drones) must meet the same contract as the
// authored 47-A place props: weld same-material opaque leaves into one draw while detached, run
// the exact pipeline compile + GPU residency stages before the boundary can submit a first draw,
// and classify an owner teardown mid-admission as the designed abort rather than a failure.

function wreckRoot() {
  const vf = createVisualFactory();
  const entity = {
    id: 918273,
    type: 'wreck',
    radius: 60,
    alive: true,
    pos: { x: 0, z: 0 },
    rot: 0,
    data: {},
  };
  const root = vf.build(entity);
  return { root, entity };
}

function packagedRecord({ sharedOpaque = true } = {}) {
  const opaque = new THREE.MeshStandardMaterial({ name: 'wrk_frame_steel' });
  const glass = new THREE.MeshStandardMaterial({ name: 'wrk_glass', transparent: true, opacity: 0.5 });
  const geo = () => new THREE.BoxGeometry(1, 1, 1);
  const at = (x) => new THREE.Matrix4().makeTranslation(x, 0, 0);
  return {
    assetId: 'test-packaged-body',
    primitives: [
      { name: 'hull_a', geometry: geo(), material: opaque, matrix: at(0) },
      { name: 'hull_b', geometry: geo(), material: opaque, matrix: at(2) },
      { name: 'hull_c', geometry: geo(), material: opaque, matrix: at(4) },
      { name: 'canopy', geometry: geo(), material: glass, matrix: at(6) },
    ],
  };
}

test('packaged body batches same-material opaque leaves and admits pipelines while detached', async () => {
  const { root, entity } = wreckRoot();
  assert.equal(typeof root.userData.requestAuthoredUpgrade, 'function');
  const scene = new THREE.Scene();
  scene.add(root);

  const record = packagedRecord();
  let compiledSubject = null;
  let residedSubject = null;
  const calls = [];
  const receipt = await root.userData.requestAuthoredUpgrade({}, scene, {
    loadAuthoredPart: async (url, options) => {
      // The boundary pins its own residency so disposeObject can release it.
      assert.equal(options.residencyOwner, root);
      return record;
    },
    isResidencyOwnerActive: () => root.parent === scene && entity.alive !== false,
    prepareAuthoredPipelines: async (subject) => {
      compiledSubject = subject;
      calls.push('compile');
      assert.equal(subject.parent, null, 'pipeline compile must run before the body publishes');
    },
    prepareAuthoredGpuResidency: async (subject) => {
      residedSubject = subject;
      calls.push('residency');
      assert.equal(subject.parent, null, 'GPU residency must run before the body publishes');
    },
  });

  assert.equal(receipt.status, 'authored');
  assert.equal(root.userData.authoredAssetState, 'authored');
  const packaged = root.userData.hull;
  assert.ok(packaged && packaged.parent === root, 'packaged body publishes under the boundary');
  assert.equal(compiledSubject, packaged);
  assert.equal(residedSubject, packaged);
  assert.deepEqual(calls, ['compile', 'residency']);
  // Three opaque leaves weld into one batch draw; the transparent canopy stays a separate leaf.
  const batches = packaged.children.filter((child) => child.userData?.scenarioStaticBatch === true);
  assert.equal(batches.length, 1, 'same-material opaque leaves merge into one batch');
  assert.equal(packaged.children.length, 2, 'batch plus the transparent canopy leaf');
  assert.equal(batches[0].userData.sourcePartNames.length, 3);
  // Source record geometry stays owned by the cached record — the weld never disposes it.
  for (const primitive of record.primitives) {
    assert.ok(primitive.geometry.getAttribute('position'), 'record geometry survives batching');
  }
});

test('packaged body owner release aborts admission without publishing', async () => {
  const { root } = wreckRoot();
  const scene = new THREE.Scene();
  scene.add(root);

  const record = packagedRecord();
  let compiled = null;
  const receipt = await root.userData.requestAuthoredUpgrade({}, scene, {
    loadAuthoredPart: async () => record,
    // The owner is gone before the detached body reaches its GPU stages — the designed abort.
    isResidencyOwnerActive: () => false,
    prepareAuthoredPipelines: async (subject) => { compiled = subject; },
  });

  assert.equal(receipt.status, 'owner-released');
  assert.equal(root.userData.authoredAssetState, 'orphaned-before-swap');
  assert.equal(root.userData.hull, undefined, 'no body publishes under a released owner');
  assert.equal(compiled, null, 'pipeline compile is skipped once the owner is gone');
  assert.equal(receipt.error?.admissionOwnerReleased, true);
});

test('packaged body pipeline failure fails closed without publishing', async () => {
  const { root } = wreckRoot();
  const scene = new THREE.Scene();
  scene.add(root);

  const receipt = await root.userData.requestAuthoredUpgrade({}, scene, {
    loadAuthoredPart: async () => packagedRecord(),
    isResidencyOwnerActive: () => true,
    prepareAuthoredPipelines: async () => { throw new Error('compile blew up'); },
  });

  assert.equal(receipt.status, 'unavailable');
  assert.equal(root.userData.authoredAssetState, 'unavailable');
  assert.equal(root.userData.hull, undefined);
  assert.equal(receipt.error?.message, 'compile blew up');
});

test('packaged body still publishes when no GPU preparation hooks exist', async () => {
  const { root } = wreckRoot();
  const scene = new THREE.Scene();
  scene.add(root);

  // Headless/probe contexts resolve no render facade — admission degrades to a skipped prep,
  // but batching and publication still run exactly as before.
  const receipt = await root.userData.requestAuthoredUpgrade({}, scene, {
    loadAuthoredPart: async () => packagedRecord(),
  });

  assert.equal(receipt.status, 'authored');
  assert.equal(root.userData.authoredAssetState, 'authored');
  const packaged = root.userData.hull;
  assert.ok(packaged && packaged.parent === root);
  assert.ok(packaged.children.some((child) => child.userData?.scenarioStaticBatch === true));
});
