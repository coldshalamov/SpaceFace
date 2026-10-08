import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  buildPlacePropRootSteps,
  disposeDetachedObjectSteps,
  upgradeAuthoredCargoCapsuleBoundaryForProbe,
  upgradeAuthoredPlaceBoundaryForProbe,
} from '../src/render/partsLibrary.js';

function drain(steps) {
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

function recordFor(width, count = 1) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial();
  const primitives = Array.from({ length: count }, (_, i) => ({
    key: `node-${i}`, name: `Node_${i}`, geometry, material,
    matrix: new THREE.Matrix4(), tags: { lod: 'lod0', damageRole: 'armor' },
  }));
  return {
    url: `assets/ships/release/parts/places/yield-probe-${width}.glb`,
    assetId: `yield-probe-${width}`, slot: 'place',
    bounds: { size: [width, 1, 1], center: [0, 0, 0] }, primitives, markers: [],
    renderPackage: {
      createInstance() {
        const root = new THREE.Group();
        const meshes = primitives.map((primitive, i) => {
          const mesh = new THREE.Mesh(geometry, material);
          mesh.name = primitive.name;
          mesh.position.x = count > 1 ? (i / (count - 1) - 0.5) * width : 0;
          root.add(mesh);
          return mesh;
        });
        return { root, planNodes: [root, ...meshes], dispose() { root.clear(); } };
      },
    },
  };
}

test('interleaved place composition retains each build\'s measured envelope', () => {
  const records = [recordFor(10, 140), recordFor(1000, 140)];
  const roots = [];
  const create = (record, id) => {
    const scene = new THREE.Scene();
    const owner = new THREE.Group();
    scene.add(owner);
    return buildPlacePropRootSteps({ id, type: 'place', alive: true, data: {} }, record, scene, owner);
  };
  try {
    const expected = records.map((record, i) => {
      const built = drain(create(record, `serial-${i}`));
      roots.push(built.root);
      return built.root.userData.visualBounds;
    });
    const iterators = records.map((record, i) => create(record, `interleaved-${i}`));
    const results = [null, null];
    while (results.some((result) => !result)) {
      for (let i = 0; i < iterators.length; i++) {
        if (results[i]) continue;
        const step = iterators[i].next();
        if (step.done) results[i] = step.value;
      }
    }
    results.forEach((built, i) => {
      roots.push(built.root);
      assert.deepEqual(built.root.userData.visualBounds, expected[i]);
    });
  } finally {
    for (const root of roots) drain(disposeDetachedObjectSteps(root));
    for (const record of records) {
      record.primitives[0].geometry.dispose();
      record.primitives[0].material.dispose();
    }
  }
});

for (const kind of ['place', 'cargo']) {
  test(`${kind} graft publishes before a queued admission can supersede it`, async () => {
    const record = recordFor(2);
    // The legacy primitive route is sufficient for this publication seam.
    delete record.renderPackage;
    const entity = {
      id: `${kind}-atomic-publication`, type: kind === 'cargo' ? 'payload' : 'place',
      alive: true, radius: 2,
      data: kind === 'cargo' ? { authoredPayloadAssetId: 'pod_cargo_container' } : {},
    };
    const scene = new THREE.Scene();
    const boundary = new THREE.Group();
    const fallback = new THREE.Group();
    boundary.add(fallback);
    scene.add(boundary);
    boundary.userData.admissionEpoch = 1;
    let publishedEpoch = null;
    boundary.addEventListener('childadded', () => {
      queueMicrotask(() => { boundary.userData.admissionEpoch = 2; });
    });
    const options = {
      releaseMode: true, admissionEpoch: 1, loadAuthoredPart: async () => record,
      onSwap: () => { publishedEpoch = boundary.userData.admissionEpoch; },
    };
    try {
      const swapped = kind === 'cargo'
        ? await upgradeAuthoredCargoCapsuleBoundaryForProbe(boundary, fallback, entity, {}, scene, options)
        : await upgradeAuthoredPlaceBoundaryForProbe(boundary, fallback, entity, 'places/yield-probe.glb', {}, scene, options);
      assert.equal(swapped, true);
      assert.equal(publishedEpoch, 1, 'the committed root publishes under its own admission epoch');
      assert.equal(boundary.userData.admissionEpoch, 2, 'the competing admission actually ran');
    } finally {
      drain(disposeDetachedObjectSteps(boundary));
      record.primitives[0].geometry.dispose();
      record.primitives[0].material.dispose();
    }
  });
}
