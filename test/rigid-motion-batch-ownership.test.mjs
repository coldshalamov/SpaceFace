import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import { hasBoundRigidMotionNode } from '../src/contracts/motionBank.js';
import {
  bindInstanceMotion,
  isAttestedRigidMotionOwner,
  loadMotionBank,
} from '../src/render/authoredMotion.js';
import {
  createRetainedRigidOpaqueBatchController,
} from '../src/render/rigidOpaqueBatch.js';
import {
  isRigidOpaqueAshlineCohortRoot,
  isRigidOpaqueDefaultCohortSource,
  render as renderSystem,
} from '../src/render/renderer.js';
import {
  isRigidOpaqueBatchMotionSafe,
  isRigidOpaqueBatchableSurface,
  rigidOpaqueMaterialProgramKey,
} from '../src/render/rigidOpaqueBatchPolicy.js';
import { readGlbJson, sceneFromGlbJson } from '../scripts/lib/renderPackageRuntimeTable.mjs';

const PACKAGE_FILE = 'assets/ships/release/render-packages/ashline-dart/render-package.json';
const SHIP_FILE = 'assets/ships/release/parts/wholeships/ashline_dart.glb';
const BANK_FILE = 'assets/ships/motions/ashline-dart.motion.json';
const SOURCE_ID = 'SF_WHOLESHIP_ASHLINE_DART';
const packageManifest = JSON.parse(readFileSync(PACKAGE_FILE, 'utf8'));
const bankText = readFileSync(BANK_FILE, 'utf8').replace(/\r\n/g, '\n');
const bankBytes = new TextEncoder().encode(bankText);
const ref = packageManifest.runtime.motionBank;
const expected = Object.freeze({
  packageAssetId: packageManifest.assetId,
  packageContentHash: packageManifest.contentHash,
  bankSha256: ref.sha256,
  sourceAssetId: SOURCE_ID,
  rigId: ref.rigId,
  bindingId: 'hull_core',
});

async function verifiedBank(bytes = bankBytes) {
  return loadMotionBank(ref, async () => ({
    ok: true,
    arrayBuffer: async () => bytes.slice().buffer,
  }));
}

function findNamed(root, name) {
  let found = null;
  root.traverse((node) => { if (!found && node.name === name) found = node; });
  return found;
}

async function makeFixture({ bank = null, ownerId = 77, generation = 4 } = {}) {
  const loaded = bank || await verifiedBank();
  const glb = readGlbJson(readFileSync(SHIP_FILE));
  const packageRoot = sceneFromGlbJson(glb);
  const packageIdentity = {
    assetId: packageManifest.assetId,
    contentHash: packageManifest.contentHash,
  };
  packageRoot.userData.spacefaceRenderPackage = packageIdentity;
  const scene = new THREE.Scene();
  const boundary = new THREE.Group();
  boundary.userData.presentationEntityId = ownerId;
  boundary.userData.presentationEntityType = 'ship';
  boundary.userData.presentationOccupantGeneration = generation;
  boundary.add(packageRoot);
  scene.add(boundary);
  const pivot = findNamed(packageRoot, 'MOTION_HULL_CORE');
  const hull = findNamed(packageRoot, 'LOD0_MOTION_HULL_CORE_Hull');
  const hullLod1 = findNamed(packageRoot, 'LOD1_MOTION_HULL_CORE_Hull');
  assert.ok(pivot, 'the real Ashline GLB contains its authored motion pivot');
  assert.ok(hull?.isMesh, 'the real Ashline GLB contains the selected LOD0 hull leaf');
  assert.ok(hullLod1?.isMesh, 'the real Ashline GLB contains the matching LOD1 hull leaf');
  for (const mesh of [hull, hullLod1]) {
    const placeholderGeometry = mesh.geometry;
    mesh.geometry = new THREE.BoxGeometry(1, 1, 1);
    placeholderGeometry.dispose();
  }
  scene.updateMatrixWorld(true);
  const motion = bindInstanceMotion(packageRoot, loaded, {
    sourceAssetId: SOURCE_ID,
    packageIdentity,
    residencyOwner: boundary,
  });
  assert.ok(motion, 'the shipped motion bank binds to the shipped GLB pivot');
  return {
    loaded, scene, boundary, packageRoot, packageIdentity, pivot, hull, hullLod1, motion,
    dispose() {
      motion.dispose();
      scene.traverse((node) => {
        if (node.isMesh) {
          node.geometry?.dispose?.();
          if (Array.isArray(node.material)) node.material.forEach((material) => material.dispose());
          else node.material?.dispose?.();
        }
      });
    },
  };
}

test('the shipped Ashline bank attests only its live, originally bound pivot descendants', async () => {
  const fixture = await makeFixture();
  try {
    const { loaded, motion, boundary, packageRoot, pivot, hull } = fixture;
    assert.equal(createHash('sha256').update(bankBytes).digest('hex'), ref.sha256);
    assert.ok(Object.isFrozen(loaded) && Object.isFrozen(loaded.ref) && Object.isFrozen(loaded.bank));
    assert.equal(hasBoundRigidMotionNode(motion, pivot, expected.bindingId), true);
    assert.equal(hasBoundRigidMotionNode(motion, hull, expected.bindingId), true);
    assert.equal(isAttestedRigidMotionOwner(motion, hull, expected), true);

    const copiedRoot = packageRoot.clone(true);
    boundary.add(copiedRoot);
    const fabricated = bindInstanceMotion(copiedRoot, { ref: loaded.ref, bank: loaded.bank }, {
      sourceAssetId: SOURCE_ID,
      packageIdentity: copiedRoot.userData.spacefaceRenderPackage,
      residencyOwner: boundary,
    });
    const wrongSource = bindInstanceMotion(copiedRoot, loaded, {
      sourceAssetId: 'SF_WHOLESHIP_OTHER',
      packageIdentity: copiedRoot.userData.spacefaceRenderPackage,
      residencyOwner: boundary,
    });
    assert.equal(isAttestedRigidMotionOwner(fabricated, findNamed(copiedRoot, 'LOD0_MOTION_HULL_CORE_Hull'), expected), false,
      'copying the verified document into a caller-created wrapper does not copy its private receipt');
    assert.equal(isAttestedRigidMotionOwner(wrongSource, findNamed(copiedRoot, 'LOD0_MOTION_HULL_CORE_Hull'), expected), false,
      'a caller-supplied source id must match the verified bank provenance');
    fabricated.dispose();
    wrongSource.dispose();

    const copiedNode = hull.clone();
    copiedNode.userData = { ...hull.userData };
    pivot.add(copiedNode);
    assert.equal(isAttestedRigidMotionOwner(motion, copiedNode, expected), false,
      'copied public userData cannot forge membership in the private binding');
    for (const mismatch of [
      { ...expected, packageAssetId: 'sf.render.other' },
      { ...expected, packageContentHash: 'f'.repeat(64) },
      { ...expected, bankSha256: 'e'.repeat(64) },
      { ...expected, sourceAssetId: 'SF_WHOLESHIP_OTHER' },
      { ...expected, rigId: 'other' },
      { ...expected, bindingId: 'other' },
    ]) assert.equal(isAttestedRigidMotionOwner(motion, hull, mismatch), false);

    boundary.userData.presentationOccupantGeneration += 1;
    assert.equal(isAttestedRigidMotionOwner(motion, hull, expected), false,
      'a recycled presentation boundary loses the old generation receipt');
    boundary.userData.presentationOccupantGeneration -= 1;
    packageRoot.userData.spacefaceRenderPackage.contentHash = 'd'.repeat(64);
    assert.equal(isAttestedRigidMotionOwner(motion, hull, expected), false,
      'changing the live package identity invalidates the receipt');
    packageRoot.userData.spacefaceRenderPackage.contentHash = expected.packageContentHash;
    const detached = new THREE.Group();
    detached.add(packageRoot);
    assert.equal(isAttestedRigidMotionOwner(motion, hull, expected), false,
      'reparenting the package outside its authored boundary invalidates the receipt');
    boundary.add(packageRoot);
    const lateMesh = new THREE.Mesh(new THREE.BoxGeometry(), hull.material);
    lateMesh.name = hull.name;
    lateMesh.userData = { ...hull.userData };
    pivot.add(lateMesh);
    assert.equal(isAttestedRigidMotionOwner(motion, lateMesh, expected), false,
      'nodes introduced after binding are not part of its private descendant set');
    lateMesh.geometry.dispose();
    motion.dispose();
    assert.equal(isAttestedRigidMotionOwner(motion, hull, expected), false,
      'disposed motion controllers cannot retain ownership');
  } finally { fixture.dispose(); }
});

test('a retained opaque leaf uses the attested motion pose and refreshes its instance matrix', async () => {
  const fixture = await makeFixture();
  const { scene, boundary, hull, hullLod1, motion } = fixture;
  const sources = new Set([hull, hullLod1]);
  const controller = createRetainedRigidOpaqueBatchController({
    scene,
    selectSource: (source) => sources.has(source),
    isTransformOnlySource: (source) => sources.has(source),
    isAttestedRigidMotionOwner: (source) => isAttestedRigidMotionOwner(motion, source, expected),
    prepare: async () => ({ ready: true }),
  });
  try {
    const admitted = await controller.sync(boundary);
    assert.equal(admitted.status, 'active', JSON.stringify(admitted));
    assert.equal(hull.layers.mask, 0, 'the direct leaf is suppressed only after retained admission');
    const batch = scene.children.find((node) => node.isBatchedMesh);
    assert.ok(batch);
    const before = new THREE.Matrix4();
    batch.getMatrixAt(0, before);

    motion.handleEvent('ship:boostStart', {}, 0);
    motion.update(0.31);
    scene.updateMatrixWorld(true);
    const refreshed = await controller.sync(boundary);
    assert.equal(refreshed.status, 'active');
    const after = new THREE.Matrix4();
    batch.getMatrixAt(0, after);
    assert.notDeepEqual(after.elements, before.elements,
      'the retained draw follows the bank-driven pivot instead of freezing its admission pose');
    assert.ok(controller.getDiagnostics().matrixUpdates > 0);
  } finally {
    controller.dispose();
    fixture.dispose();
  }
});

test('unverified bytes still animate but cannot attest a transform-only batching exception', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  assert.ok(descriptor?.configurable, 'the test host exposes configurable WebCrypto for this capability check');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
  let fixture;
  try {
    const loaded = await verifiedBank();
    assert.ok(loaded && !Object.isFrozen(loaded), 'without WebCrypto, loading retains compatibility behavior');
    fixture = await makeFixture({ bank: loaded });
    assert.equal(isAttestedRigidMotionOwner(fixture.motion, fixture.hull, expected), false);
    fixture.motion.handleEvent('ship:boostStart', {}, 0);
    fixture.motion.update(0.31);
    assert.ok(fixture.pivot.position.lengthSq() > 0 || fixture.pivot.quaternion.angleTo(new THREE.Quaternion()) > 0.001,
      'the unverified controller still applies its authored clip');
    const safeOptions = {
      isTransformOnlySource: (source) => source === fixture.hull,
      isAttestedRigidMotionOwner: (source) => isAttestedRigidMotionOwner(fixture.motion, source, expected),
    };
    assert.equal(isRigidOpaqueBatchMotionSafe(fixture.hull, {}, safeOptions), false,
      'a missing cryptographic receipt keeps the animated source direct');
  } finally {
    fixture?.dispose();
    Object.defineProperty(globalThis, 'crypto', descriptor);
  }
});

test('the default renderer admits one verified live writer and keeps overlapping writers direct', async () => {
  const fixture = await makeFixture();
  const { scene, boundary, packageRoot, hull, hullLod1, loaded } = fixture;
  const id = 77, generation = 4;
  boundary.userData.presentationShipDefId = 'ship_wasp';
  boundary.userData.authoredAssetState = 'authored';
  boundary.userData.authoredSlots = { hull: ['assets/ships/release/parts/wholeships/ashline_dart.glb'] };
  for (const source of [hull, hullLod1]) {
    source.userData.spacefacePartUrl = 'assets/ships/release/parts/wholeships/ashline_dart.glb';
  }
  packageRoot.userData.authoredMotionControllers = [fixture.motion];
  const entity = {
    id, type: 'ship', alive: true, occupantGeneration: generation,
    data: { defId: 'ship_wasp', lootTableId: 'wasp_swarmer' },
  };
  const state = {
    mode: 'active', contextRestoreSeq: 0,
    entities: new Map([[id, entity]]),
    world: { enterSerial: 1, currentSectorId: 'fixture' },
    render: {
      admissionRunGeneration: 1,
      compileObjectPipelines: () => ({ pipelines: {}, gpuResidency: {}, geometryResidency: {}, results: {} }),
    },
  };
  const owner = Object.assign(Object.create(renderSystem), {
    scene, state, renderer: {}, _opaqueBatchSupported: true,
    _meshes: new Map([[id, boundary]]),
    _entityFrame: { authored: [], shipAux: [{ mesh: boundary, visible: true, viewCulled: false }] },
    _authoredInstanceSyncOptions: {},
  });
  let secondMotion = null;
  try {
    owner._enableRigidOpaqueBatch(true);
    assert.equal(owner._rigidOpaqueBatchAshlineLifetimes?.has(boundary), true,
      'the visible shipAux record claims the bounded Ashline lifetime');
    assert.equal(isRigidOpaqueAshlineCohortRoot(owner, boundary), true);
    assert.equal(isRigidOpaqueDefaultCohortSource(owner, hull), true);
    assert.equal(isRigidOpaqueDefaultCohortSource(owner, hullLod1), true);
    assert.equal(isAttestedRigidMotionOwner(fixture.motion, hull, expected), true);
    assert.equal(isRigidOpaqueBatchableSurface(hull, hull.userData.spacefaceTags || {}, {
      isTransformOnlySource: (source) => isRigidOpaqueDefaultCohortSource(owner, source),
      isAttestedRigidMotionOwner: (object) => isAttestedRigidMotionOwner(fixture.motion, object, expected),
    }), true, 'the real source leaf is eligible under the actual renderer ownership predicates');
    assert.equal(isRigidOpaqueBatchMotionSafe(hull, hull.userData.spacefaceTags || {}, {
      isTransformOnlySource: (source) => isRigidOpaqueDefaultCohortSource(owner, source),
      isAttestedRigidMotionOwner: (object) => isAttestedRigidMotionOwner(fixture.motion, object, expected),
    }), true, JSON.stringify(hull.userData.spacefaceTags || {}));
    await owner._syncRigidOpaqueBatchProbe();
    assert.equal(owner.getRigidOpaqueBatchDiagnosticsForBench().status, 'active',
      JSON.stringify(owner.getRigidOpaqueBatchDiagnosticsForBench()));
    assert.equal(hull.layers.mask, 0, 'one live verified controller permits transform-only submission');

    secondMotion = bindInstanceMotion(packageRoot, loaded, {
      sourceAssetId: SOURCE_ID,
      packageIdentity: fixture.packageIdentity,
      residencyOwner: boundary,
    });
    packageRoot.userData.authoredMotionControllers.push(secondMotion);
    await owner._syncRigidOpaqueBatchProbe();
    assert.equal(owner.getRigidOpaqueBatchDiagnosticsForBench().status, 'idle');
    assert.equal(hull.layers.mask, 1, 'distinct controllers writing the same pivot restore the direct body');
    assert.equal(hullLod1.layers.mask, 1);
  } finally {
    owner._rigidOpaqueBatchController?.dispose();
    secondMotion?.dispose();
    fixture.dispose();
  }
});

test('bank hash mismatch is rejected and protected animated or deforming leaves stay direct', async () => {
  const corrupted = bankBytes.slice();
  corrupted[corrupted.length - 3] ^= 1;
  await assert.rejects(() => verifiedBank(corrupted), /SHA-256 mismatch/);

  const fixture = await makeFixture();
  try {
    const { hull, motion } = fixture;
    const originalMaterial = hull.material;
    const attested = {
      isTransformOnlySource: (source) => source === hull,
      isAttestedRigidMotionOwner: (source) => isAttestedRigidMotionOwner(motion, source, expected),
    };
    assert.equal(isRigidOpaqueBatchMotionSafe(hull, {}, attested), true);
    hull.userData.spacefaceTags = { canopy: true };
    assert.equal(isRigidOpaqueBatchableSurface(hull, hull.userData.spacefaceTags, attested), false,
      'attestation cannot relax canopy policy');
    hull.userData.spacefaceTags = { navLight: true };
    assert.equal(isRigidOpaqueBatchableSurface(hull, hull.userData.spacefaceTags, attested), false,
      'attestation cannot relax navigation-light policy');
    hull.userData.spacefaceTags = { animated: true };
    assert.equal(isRigidOpaqueBatchMotionSafe(hull, hull.userData.spacefaceTags, attested), false,
      'semantic animated tags remain protected even with a verified motion owner');
    hull.userData.spacefaceTags = {};
    hull.morphTargetInfluences = [];
    assert.equal(isRigidOpaqueBatchableSurface(hull, {}, attested), false,
      'morph-deformed leaves remain direct');
    delete hull.morphTargetInfluences;
    const skinned = new THREE.SkinnedMesh(hull.geometry, hull.material);
    assert.equal(isRigidOpaqueBatchableSurface(skinned, {}, attested), false,
      'skinned leaves remain direct');
    const custom = hull.material.clone();
    custom.onBeforeCompile = () => {};
    hull.material = custom;
    assert.equal(rigidOpaqueMaterialProgramKey(custom), null,
      'custom shader hooks cannot enter the retained program key even when transform ownership is attested');
    custom.dispose();
    hull.material = originalMaterial;
  } finally { fixture.dispose(); }
});
