import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { Object3D as VendoredObject3D, spacefaceShadowCastersIn } from '../vendor/three.module.js';

import {
  initializePresentationAdmission,
} from '../src/core/presentationAdmission.js';
import * as partsLibrary from '../src/render/partsLibrary.js';
import { render, disposeObjectNode, disposeRendererOwnedResources } from '../src/render/renderer.js';
import {
  createPackageDetachManifest, detachPackageTexture, measureLivePackageCpuPayloads,
  LIVE_PACKAGE_CPU_PAYLOAD, resetPackageDetachManifestsForTests,
} from '../src/render/packageCpuDetach.js';

Object.defineProperty(THREE.Object3D.prototype, 'castShadow',
  Object.getOwnPropertyDescriptor(VendoredObject3D.prototype, 'castShadow'));

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const CAPSULE_ASSET_ID = 'pod_cargo_container';
const CAPSULE_PART_FILE = 'pods/pod_cargo_container.glb';
const CAPSULE_RELEASE_URL = `assets/ships/release/parts/${CAPSULE_PART_FILE}`;

function capsuleEntity(id = 'cargo_capsule') {
  return {
    id,
    type: 'payload',
    alive: true,
    radius: 6,
    pos: { x: 0, z: 0 },
    rot: 0,
    factionId: 'faction_union',
    data: {
      payloadStableId: 'cargo_capsule',
      authoredPayloadAssetId: CAPSULE_ASSET_ID,
    },
  };
}

function fixtureRecord() {
  const geometry = new THREE.BoxGeometry(5.2, 2.25, 3);
  const material = new THREE.MeshStandardMaterial({
    color: 0x65717b,
    roughness: 0.58,
    metalness: 0.4,
  });
  material.name = 'Material_Hull';
  return {
    url: CAPSULE_RELEASE_URL,
    assetId: 'SF_POD_CARGO_CONTAINER',
    slot: 'pod',
    bounds: {
      min: [-0.5, -0.125, -1.5],
      max: [4.7, 2.125, 1.5],
      size: [5.2, 2.25, 3],
      center: [2.1, 1, 0],
    },
    primitives: [{
      key: 'fixture:cargo-capsule',
      name: 'LOD0_CargoCapsule',
      geometry,
      material,
      matrix: new THREE.Matrix4().makeTranslation(2.1, 1, 0),
      tags: { lod: 'lod0', tint: 'hull', instance: true },
    }],
    markers: [],
    sockets: [],
    materials: [material],
  };
}

async function preparedLivePayload({ fail = false, stale = false } = {}) {
  const scene = new THREE.Scene();
  const owner = Object.assign(Object.create(render), { scene, state: { render: {} }, _rendererResourcesDisposed: false });
  owner._installLivePackageCpuPayloads(scene);
  const entity = capsuleEntity();
  owner.state.entities = new Map([[entity.id, entity]]);
  initializePresentationAdmission(entity);
  const boundary = partsLibrary.buildAuthoredCargoCapsule(entity, { releaseMode: true, fallbackRoot: new THREE.Group() });
  boundary.userData.presentationEntityId = entity.id;
  scene.add(boundary);
  const record = fixtureRecord();
  const texture = new THREE.DataTexture(new Uint8Array([20, 40, 60, 255]), 1, 1);
  texture.needsUpdate = true;
  record.materials[0].map = texture;
  const geometry = record.primitives[0].geometry;
  createPackageDetachManifest({ contentHash: 'live-capsule', resources: [geometry, texture] }, {
    redecode: () => { throw new Error('A live ready payload must not need a rotation decode'); },
    collectResources: value => value.resources,
  });
  let pipelineObserved = false;
  await boundary.userData.requestAuthoredUpgrade({}, scene, {
    deferBoundaryPublication: true,
    loadAuthoredPart: async () => record,
    prepareAuthoredPipelines: async () => {
      pipelineObserved = true;
      assert.ok(owner._livePackageCpuPayloads.size > 0, 'the actual producer acquires before GPU admission');
      assert.ok(partsLibrary.inspectAuthoredBoundaryRegistrations(scene, boundary).preparedRoots > 0);
      assert.equal(detachPackageTexture(texture), false, 'the first upload cannot detach the live map');
      if (fail) throw new Error('retired preparation');
      if (stale) boundary.userData.admissionEpoch += 1;
    },
    prepareAuthoredGpuResidency: async () => ({}),
  }).catch(error => { if (!fail && !stale) throw error; });
  assert.equal(pipelineObserved, true);
  return { owner, scene, boundary, texture };
}

test('actual prepared publication retains live maps until replacement disposal and session exit', async () => {
  resetPackageDetachManifestsForTests();
  const f = await preparedLivePayload();
  try {
    assert.equal(f.boundary.userData.authoredVisualRoot, 'authored-root', 'the real capsule producer publishes normally');
    assert.equal(partsLibrary.inspectAuthoredBoundaryRegistrations(f.scene, f.boundary).preparedRoots, 0);
    assert.equal(detachPackageTexture(f.texture), false, 'publication must not retire the live lease');
    const root = f.boundary.children.find(child => child[LIVE_PACKAGE_CPU_PAYLOAD]);
    assert.ok(root, 'the published authored root owns its disposal hook');
    const bytes = measureLivePackageCpuPayloads(f.owner._livePackageCpuPayloads);
    assert.ok(bytes.liveCpuBufferBytes >= 4);
    disposeObjectNode(root);
    assert.equal(f.owner._livePackageCpuPayloads.size, 0, 'replaced root disposal retires its exact lease');
    assert.equal(detachPackageTexture(f.texture), true);
    disposeRendererOwnedResources(f.owner);
    assert.equal(f.scene[LIVE_PACKAGE_CPU_PAYLOAD], undefined);
    assert.equal(f.owner._livePackageCpuPayloads, null);
  } finally {
    f.owner._releaseLivePackageCpuPayloads?.();
    resetPackageDetachManifestsForTests();
  }
});

test('failed actual prepared admission releases the existing owner claim without publication', async () => {
  resetPackageDetachManifestsForTests();
  const f = await preparedLivePayload({ fail: true });
  try {
    assert.equal(f.owner._livePackageCpuPayloads.size, 0);
    assert.equal(detachPackageTexture(f.texture), true);
  } finally {
    f.owner._releaseLivePackageCpuPayloads?.();
    resetPackageDetachManifestsForTests();
  }
});

test('stale actual admission retires its epoch and session exit releases an admitted live cohort', async () => {
  resetPackageDetachManifestsForTests();
  const stale = await preparedLivePayload({ stale: true });
  try {
    assert.equal(stale.owner._livePackageCpuPayloads.size, 0);
    assert.notEqual(stale.boundary.userData.authoredVisualRoot, 'authored-root');
    assert.equal(detachPackageTexture(stale.texture), true);
  } finally { stale.owner._releaseLivePackageCpuPayloads?.(); resetPackageDetachManifestsForTests(); }
  const live = await preparedLivePayload();
  try {
    assert.ok(live.owner._livePackageCpuPayloads.size > 0);
    disposeRendererOwnedResources(live.owner);
    assert.equal(live.owner._livePackageCpuPayloads, null);
    assert.equal(live.owner._releaseLivePackageCpuPayloads, null);
    assert.equal(live.scene[LIVE_PACKAGE_CPU_PAYLOAD], undefined);
    assert.equal(detachPackageTexture(live.texture), true);
  } finally { live.owner._releaseLivePackageCpuPayloads?.(); resetPackageDetachManifestsForTests(); }
});

// A prepared admission whose boundary is detached before publication runs the parked
// disposer. When a resource dispose() throws inside that disposer, the registry entry in
// sceneState.preparedAuthoredRoots must still be released — a Map keyed by the boundary
// that would otherwise pin the boundary, the prepared tree, and every retained closure
// forever (the dock/save/load heap witness pinned survivors on exactly this entry).
test('a throwing prepared-capsule disposer still releases the prepared-root registry', { timeout: 2000 }, async () => {
  const entity = capsuleEntity();
  initializePresentationAdmission(entity);
  const fallbackRoot = new THREE.Group();
  fallbackRoot.name = 'SF_GenericPayloadFallback';
  const boundary = partsLibrary.buildAuthoredCargoCapsule(entity, {
    releaseMode: true,
    fallbackRoot,
  });
  const scene = new THREE.Scene();
  scene.add(boundary);

  // Fault injection: every prepared disposer ends with root.clear() on the GLTFKit_ authored
  // root (disposeDetachedAuthoredCargoCapsule -> root.clear, disposePreparedPlace ->
  // authored.root.clear, disposePreparedAuthoredShip -> attempt(root, root.clear)). Throwing
  // there exercises the exact ordering bug — disposal failure must not skip the unregister.
  const originalClear = THREE.Object3D.prototype.clear;
  let clears = 0;
  let flaggedAtClear = 0;
  const retiredMeshes = new Set();
  let resolveClear;
  const clearAttempted = new Promise((resolve) => { resolveClear = resolve; });
  THREE.Object3D.prototype.clear = function clear() {
    if (typeof this.name === 'string' && this.name.startsWith('GLTFKit_')) {
      clears++;
      this.traverse((object) => {
        if (!object.isMesh) return;
        retiredMeshes.add(object);
        if (object.castShadow) flaggedAtClear++;
      });
      resolveClear();
      throw new Error('witness-forced dispose failure');
    }
    return originalClear.call(this);
  };
  const record = fixtureRecord();
  try {
    const completion = boundary.userData.requestAuthoredUpgrade({}, scene, {
      deferBoundaryPublication: true,
      // Failing the pipeline stage routes through disposePreparedAuthoredBoundary — the exact
      // production path whose resource-disposal throw used to skip the registry unregister.
      prepareAuthoredPipelines: async () => { throw new Error('witness-forced pipeline failure'); },
      loadAuthoredPart: async () => record,
    });
    assert.ok(completion && typeof completion.then === 'function');
    await completion.catch(() => null);
    // The admission releases registry ownership immediately; GPU cleanup now
    // runs in the paced detached queue. Keep the injector until that work runs.
    assert.equal(partsLibrary.inspectAuthoredBoundaryRegistrations(scene, boundary).preparedRoots, 0);
    await clearAttempted;
  } finally {
    THREE.Object3D.prototype.clear = originalClear;
  }

  assert.ok(clears > 0, 'the parked disposer must have attempted to clear the authored root');
  assert.ok(retiredMeshes.size > 0, 'the real failed preparation created authored Mesh nodes');
  assert.equal(flaggedAtClear, 0, 'prepared meshes leave the strong shadow registry before a throwing clear');
  const retiredScene = new THREE.Scene();
  retiredScene.add(...retiredMeshes);
  assert.deepEqual(spacefaceShadowCastersIn(retiredScene), [],
    'failed cleanup leaves no retired Mesh registered after reparenting');

  const registries = partsLibrary.inspectAuthoredBoundaryRegistrations(scene, boundary);
  assert.equal(registries.preparedRoots, 0,
    'the prepared-root registry must release the boundary even when resource disposal throws');
});

// Contract for all three prepared disposers: registry detachment is unconditional. A throw
// inside resource cleanup must never skip unregisterPreparedAuthoredAdmission.
test('every prepared-admission disposer unregisters under a failure-proof ordering', () => {
  const source = readFileSync(`${REPO_ROOT}src/render/partsLibrary.js`, 'utf8');

  const shipDispose = source.match(/async function disposePreparedAuthoredShip[\s\S]*?\n\}/);
  assert.ok(shipDispose, 'disposePreparedAuthoredShip not found');
  const unregisterAt = shipDispose[0].indexOf('unregisterPreparedAuthoredAdmission(authored)');
  const throwAt = shipDispose[0].indexOf("throw new AggregateError(cleanupErrors");
  assert.ok(unregisterAt > 0, 'disposePreparedAuthoredShip never unregisters');
  assert.ok(throwAt > 0, 'disposePreparedAuthoredShip no longer aggregates cleanup errors');
  assert.ok(unregisterAt < throwAt,
    'unregister must run before the cleanup-error throw or a failed dispose re-pins the registry');

  for (const name of ['disposePreparedCargoCapsule', 'disposePreparedPlace']) {
    const body = source.match(new RegExp(`const ${name} = (?:async )?\\(\\) => \\{[\\s\\S]*?\\n  \\};`));
    assert.ok(body, `${name} not found`);
    const finallyAt = body[0].indexOf('} finally {');
    const unregisterIn = body[0].indexOf('unregisterPreparedAuthoredAdmission(authored)');
    assert.ok(finallyAt > 0 && unregisterIn > finallyAt,
      `${name} must unregister inside finally so a disposal throw cannot strand the registry entry`);
  }
});
