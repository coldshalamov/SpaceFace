import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { Object3D as VendoredObject3D, spacefaceShadowCastersIn } from '../vendor/three.module.js';
import {
  buildPlacePropRootSteps,
  disposeDetachedObject,
  disposeDetachedObjectSteps,
  upgradeAuthoredCargoCapsuleBoundaryForProbe,
  upgradeAuthoredPlaceBoundaryForProbe,
} from '../src/render/partsLibrary.js';

// Browser imports map `three` to this vendor. Exercise its real registry accessor
// on the npm Three classes used by these Node-owned production seams.
Object.defineProperty(THREE.Object3D.prototype, 'castShadow',
  Object.getOwnPropertyDescriptor(VendoredObject3D.prototype, 'castShadow'));

function drain(steps) {
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

for (const stepped of [false, true]) {
  test(`${stepped ? 'stepped' : 'synchronous'} detached cleanup releases shadow membership despite a throwing resource`, () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshStandardMaterial();
    geometry.userData.spacefaceSharedAsset = true;
    material.userData.spacefaceSharedAsset = true;
    let sharedDisposals = 0;
    geometry.dispose = material.dispose = () => { sharedDisposals++; };
    const live = new THREE.Mesh(geometry, material);
    live.castShadow = true;
    const badGeometry = new THREE.BoxGeometry();
    badGeometry.dispose = () => { throw new Error('retiring geometry failure'); };
    const bad = new THREE.Mesh(badGeometry, material);
    bad.castShadow = true;
    root.add(bad);
    const retired = [bad];
    for (let i = 0; i < 130; i++) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      retired.push(mesh);
      root.add(mesh);
    }
    scene.add(root, live);
    assert.equal(spacefaceShadowCastersIn(scene).length, retired.length + 1);
    root.removeFromParent();
    if (stepped) {
      const steps = disposeDetachedObjectSteps(root);
      assert.equal(steps.next().done, false, 'a real stride interrupts the disposal walk');
      assert.ok(retired.some((mesh) => mesh.castShadow === false));
      assert.ok(retired.some((mesh) => mesh.castShadow === true));
      drain(steps);
    } else {
      disposeDetachedObject(root);
    }
    scene.add(root);
    assert.deepEqual(spacefaceShadowCastersIn(scene), [live],
      'retired meshes cannot re-enter the global registry when their old graph is inspected');
    assert.ok(retired.every((mesh) => mesh.castShadow === false));
    assert.equal(live.castShadow, true, 'a live sibling sharing resources keeps its own flag');
    assert.equal(sharedDisposals, 0, 'retiring Object3Ds do not dispose the shared live resources');
    if (stepped) drain(disposeDetachedObjectSteps(root));
    else disposeDetachedObject(root);
    assert.deepEqual(spacefaceShadowCastersIn(scene), [live], 'duplicate cleanup is membership-idempotent');
    assert.equal(sharedDisposals, 0);
    live.castShadow = false;
  });
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

test('stale authored place cleanup preserves canonical fallback disposal policy', async () => {
  const record = recordFor(2, 2);
  record.primitives[0].geometry.userData.spacefaceSharedFallback = true;
  record.primitives[0].material.userData.spacefaceSharedAsset = true;
  let sharedGeometryDisposals = 0;
  let sharedMaterialDisposals = 0;
  record.primitives[0].geometry.dispose = () => { sharedGeometryDisposals++; };
  record.primitives[0].material.dispose = () => { sharedMaterialDisposals++; };

  const localGeometry = new THREE.BoxGeometry();
  const localMaterial = new THREE.MeshStandardMaterial();
  let localGeometryDisposals = 0;
  let localMaterialDisposals = 0;
  localGeometry.dispose = () => { localGeometryDisposals++; };
  localMaterial.dispose = () => { localMaterialDisposals++; };
  let staleRoot = null;
  let localMeshes = [];
  const createInstance = record.renderPackage.createInstance;
  let boundary;
  record.primitives.forEach((primitive) => {
    primitive.tags = { ...primitive.tags, instance: false };
  });
  record.renderPackage.createInstance = () => {
    const instance = createInstance();
    staleRoot = instance.root;
    localMeshes = [new THREE.Mesh(localGeometry, localMaterial), new THREE.Mesh(localGeometry, localMaterial)];
    for (const mesh of localMeshes) {
      mesh.castShadow = true;
      staleRoot.add(mesh);
    }
    boundary.userData.admissionEpoch = 2;
    return instance;
  };

  const entity = { id: 'stale-place-disposal', type: 'place', alive: true, radius: 2, data: {} };
  boundary = new THREE.Group();
  const fallbackRoot = new THREE.Group();
  boundary.add(fallbackRoot);
  boundary.userData.admissionEpoch = 1;
  const scene = new THREE.Scene();
  scene.add(boundary);

  try {
    const swapped = await upgradeAuthoredPlaceBoundaryForProbe(
      boundary, fallbackRoot, entity, 'places/yield-probe-stale.glb', {}, scene,
      {
        releaseMode: true,
        admissionEpoch: 1,
        admissionDeadline: true,
        loadAuthoredPart: async () => record,
      },
    );
    // A valid detached root enters the paced teardown queue. Wait for the
    // resource callbacks themselves rather than assuming one scheduler turn
    // drains the queue under every host scheduler.
    const cleanupDeadline = Date.now() + 500;
    while (localGeometryDisposals === 0 || localMaterialDisposals === 0) {
      if (Date.now() >= cleanupDeadline) break;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    assert.equal(swapped, false, 'the superseded place build is not published');
    assert.ok(staleRoot, 'the stale prepared root reached cleanup');
    assert.equal(localGeometryDisposals, 1, 'repeated owner-local geometry is deduplicated');
    assert.equal(localMaterialDisposals, 1, 'repeated owner-local material is deduplicated');
    assert.equal(sharedGeometryDisposals, 0, 'shared fallback geometry remains owned by its cache');
    assert.equal(sharedMaterialDisposals, 0, 'shared authored material remains owned by its cache');
    assert.ok(localMeshes.every((mesh) => mesh.castShadow === false),
      'the detached stale subtree is removed from shadow membership before disposal');
  } finally {
    boundary.userData.dispose?.();
    localGeometry.dispose = () => {};
    localMaterial.dispose = () => {};
    localGeometry.dispose();
    localMaterial.dispose();
    record.primitives[0].geometry.dispose = () => {};
    record.primitives[0].material.dispose = () => {};
    record.primitives[0].geometry.dispose();
    record.primitives[0].material.dispose();
  }
});
