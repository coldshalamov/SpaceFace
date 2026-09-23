import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

import {
  initializePresentationAdmission,
} from '../src/core/presentationAdmission.js';
import * as partsLibrary from '../src/render/partsLibrary.js';

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

// A prepared admission whose boundary is detached before publication runs the parked
// disposer. When a resource dispose() throws inside that disposer, the registry entry in
// sceneState.preparedAuthoredRoots must still be released — a Map keyed by the boundary
// that would otherwise pin the boundary, the prepared tree, and every retained closure
// forever (the dock/save/load heap witness pinned survivors on exactly this entry).
test('a throwing prepared-capsule disposer still releases the prepared-root registry', async () => {
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
  THREE.Object3D.prototype.clear = function clear() {
    if (typeof this.name === 'string' && this.name.startsWith('GLTFKit_')) {
      clears++;
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
  } finally {
    THREE.Object3D.prototype.clear = originalClear;
  }

  assert.ok(clears > 0, 'the parked disposer must have attempted to clear the authored root');

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
    const body = source.match(new RegExp(`const ${name} = \\(\\) => \\{[\\s\\S]*?\\n  \\};`));
    assert.ok(body, `${name} not found`);
    const finallyAt = body[0].indexOf('} finally {');
    const unregisterIn = body[0].indexOf('unregisterPreparedAuthoredAdmission(authored)');
    assert.ok(finallyAt > 0 && unregisterIn > finallyAt,
      `${name} must unregister inside finally so a disposal throw cannot strand the registry entry`);
  }
});
