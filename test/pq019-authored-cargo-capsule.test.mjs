import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import {
  PRESENTATION_ADMISSION,
  initializePresentationAdmission,
} from '../src/core/presentationAdmission.js';
import * as partsLibrary from '../src/render/partsLibrary.js';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { installVisualOverrides } from '../src/render/visualOverrides.js';

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

function visibleRenderables(root) {
  let count = 0;
  root.traverse((object) => {
    if (!(object.isMesh || object.isLine || object.isPoints)) return;
    let visible = object.visible !== false;
    for (let parent = object.parent; parent && visible; parent = parent.parent) {
      visible = parent.visible !== false;
    }
    if (visible) count++;
  });
  return count;
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
    markers: [{
      name: 'MOUNT_Child',
      matrix: new THREE.Matrix4().makeTranslation(0, 0, 0),
      tags: { mount: true, mountKey: 'child', lod: 'lod0' },
      userData: { role: 'stack', forward: [1, 0, 0] },
    }],
  };
}

test('the exact PQ-019 cargo capsule enters a hidden authored boundary while generic payloads remain procedural', () => {
  assert.equal(typeof partsLibrary.buildAuthoredCargoCapsule, 'function');

  const authored = capsuleEntity();
  initializePresentationAdmission(authored);
  assert.equal(authored.presentationAdmission, PRESENTATION_ADMISSION.pending);

  const factory = installVisualOverrides(createVisualFactory(), { releaseMode: true });
  const boundary = factory.build(authored);
  assert.equal(boundary.userData.kind, 'payload');
  assert.equal(boundary.userData.authoredPayloadAssetId, CAPSULE_ASSET_ID);
  assert.equal(boundary.userData.authoredAssetState, 'awaiting-authored-admission');
  assert.equal(boundary.userData.authoredVisualRoot, 'none-pending-admission');
  assert.equal(boundary.userData.renderContract.gracefulFallback, false);
  assert.equal(typeof boundary.userData.requestAuthoredUpgrade, 'function');
  assert.equal(boundary.children.length, 1);
  assert.equal(boundary.children[0].visible, false);
  assert.equal(visibleRenderables(boundary), 0, 'the generic cylinder must never be published before authored admission');

  const generic = {
    id: 'ordinary_payload',
    type: 'payload',
    alive: true,
    radius: 3,
    data: {},
  };
  initializePresentationAdmission(generic);
  const genericVisual = factory.build(generic);
  assert.equal(generic.presentationAdmission, undefined);
  assert.equal(genericVisual.userData.visualLanguage, 'sealed-cargo-canister');
  assert.ok(visibleRenderables(genericVisual) > 0);
});

test('the PQ-019 cargo boundary loads the exact release pod slot and admits a centered radius-matched root', async () => {
  assert.equal(typeof partsLibrary.buildAuthoredCargoCapsule, 'function');
  assert.equal(typeof partsLibrary.upgradeAuthoredCargoCapsuleBoundaryForProbe, 'function');

  const entity = capsuleEntity();
  const factory = installVisualOverrides(createVisualFactory(), { releaseMode: true });
  const boundary = factory.build(entity);
  const fallbackRoot = boundary.children[0];
  const fallbackResources = [];
  fallbackRoot.traverse((object) => {
    if (object.geometry) fallbackResources.push(object.geometry);
    if (object.material) fallbackResources.push(object.material);
  });
  let fallbackDisposals = 0;
  for (const resource of fallbackResources) {
    resource.addEventListener('dispose', () => { fallbackDisposals++; });
  }
  const scene = new THREE.Scene();
  scene.add(boundary);
  const requests = [];

  const upgraded = await partsLibrary.upgradeAuthoredCargoCapsuleBoundaryForProbe(
    boundary,
    fallbackRoot,
    entity,
    {},
    scene,
    {
      releaseMode: true,
      loadAuthoredPart: async (url, options) => {
        requests.push({ url, slot: options.slot, optional: options.optional });
        return fixtureRecord();
      },
    },
  );

  assert.equal(upgraded, true);
  assert.deepEqual(requests, [{ url: CAPSULE_RELEASE_URL, slot: 'pod', optional: true }]);
  assert.equal(entity.presentationAdmission, PRESENTATION_ADMISSION.ready);
  assert.equal(boundary.userData.authoredAssetState, 'authored');
  assert.equal(boundary.userData.authoredVisualRoot, 'authored-root');
  assert.equal(boundary.userData.assetId, 'SF_POD_CARGO_CONTAINER');
  assert.deepEqual(boundary.userData.authoredSlots, { pod: [CAPSULE_RELEASE_URL] });
  assert.equal(boundary.children.includes(fallbackRoot), false);
  assert.equal(fallbackRoot.parent, null);
  assert.equal(fallbackRoot.children.length, 0, 'the detached procedural Object3D graph must be released');
  assert.equal(fallbackDisposals, 0, 'shared procedural cache resources must not be disposed');
  assert.equal(boundary.userData.requestAuthoredUpgrade, undefined);
  assert.equal(boundary.userData.__setActiveVisualRoot, undefined);
  assert.equal(boundary.children.length, 1);
  assert.equal(boundary.children[0].userData.authoredWorldScale, 12 / 5.2);
  assert.equal(boundary.children[0].position.x, -2.1 * (12 / 5.2));
  assert.equal(boundary.children[0].position.y, -1 * (12 / 5.2));
  assert.ok(Math.abs(boundary.children[0].position.z) < 1e-12);
  assert.ok(visibleRenderables(boundary) > 0);
});

test('an unavailable cargo pod fails closed without revealing the procedural cylinder', async () => {
  assert.equal(typeof partsLibrary.buildAuthoredCargoCapsule, 'function');
  assert.equal(typeof partsLibrary.upgradeAuthoredCargoCapsuleBoundaryForProbe, 'function');

  const entity = capsuleEntity('cargo_capsule_unavailable');
  const factory = installVisualOverrides(createVisualFactory(), { releaseMode: true });
  const boundary = factory.build(entity);
  const fallbackRoot = boundary.children[0];
  const scene = new THREE.Scene();
  scene.add(boundary);

  const upgraded = await partsLibrary.upgradeAuthoredCargoCapsuleBoundaryForProbe(
    boundary,
    fallbackRoot,
    entity,
    {},
    scene,
    {
      releaseMode: true,
      loadAuthoredPart: async () => null,
    },
  );

  assert.equal(upgraded, false);
  assert.equal(entity.presentationAdmission, PRESENTATION_ADMISSION.unavailable);
  assert.equal(boundary.userData.authoredAssetState, 'unavailable');
  assert.equal(boundary.userData.authoredVisualRoot, 'none-load-failed');
  assert.equal(fallbackRoot.visible, false);
  assert.equal(visibleRenderables(boundary), 0);
});

test('pipeline rejection disposes the detached authored composition and preserves the hidden substrate', async () => {
  const entity = capsuleEntity('cargo_capsule_pipeline_rejected');
  const factory = installVisualOverrides(createVisualFactory(), { releaseMode: true });
  const boundary = factory.build(entity);
  const fallbackRoot = boundary.children[0];
  const scene = new THREE.Scene();
  scene.add(boundary);
  let stagedRoot = null;
  let stagedGeometryDisposals = 0;

  const upgraded = await partsLibrary.upgradeAuthoredCargoCapsuleBoundaryForProbe(
    boundary,
    fallbackRoot,
    entity,
    {},
    scene,
    {
      releaseMode: true,
      loadAuthoredPart: async () => fixtureRecord(),
      prepareAuthoredPipelines: async (root) => {
        stagedRoot = root;
        root.traverse((object) => {
          if (object.geometry) {
            object.geometry.addEventListener('dispose', () => { stagedGeometryDisposals++; });
          }
        });
        throw new Error('synthetic cargo capsule pipeline rejection');
      },
    },
  );

  assert.equal(upgraded, false);
  assert.equal(entity.presentationAdmission, PRESENTATION_ADMISSION.unavailable);
  assert.equal(boundary.userData.authoredAssetState, 'unavailable');
  assert.equal(boundary.userData.authoredVisualRoot, 'none-pipeline-failed');
  assert.ok(stagedRoot);
  assert.ok(stagedGeometryDisposals > 0);
  assert.equal(stagedRoot.children.length, 0);
  assert.equal(fallbackRoot.parent, boundary);
  assert.equal(fallbackRoot.visible, false);
});

test('removal during pipeline compile disposes the uncommitted authored composition', async () => {
  const entity = capsuleEntity('cargo_capsule_removed_during_compile');
  const factory = installVisualOverrides(createVisualFactory(), { releaseMode: true });
  const boundary = factory.build(entity);
  const fallbackRoot = boundary.children[0];
  const scene = new THREE.Scene();
  scene.add(boundary);
  let stagedRoot = null;
  let stagedGeometryDisposals = 0;

  const upgraded = await partsLibrary.upgradeAuthoredCargoCapsuleBoundaryForProbe(
    boundary,
    fallbackRoot,
    entity,
    {},
    scene,
    {
      releaseMode: true,
      loadAuthoredPart: async () => fixtureRecord(),
      prepareAuthoredPipelines: async (root) => {
        stagedRoot = root;
        root.traverse((object) => {
          if (object.geometry) {
            object.geometry.addEventListener('dispose', () => { stagedGeometryDisposals++; });
          }
        });
        boundary.removeFromParent();
      },
    },
  );

  assert.equal(upgraded, false);
  assert.equal(boundary.parent, null);
  assert.ok(stagedRoot);
  assert.ok(stagedGeometryDisposals > 0);
  assert.equal(stagedRoot.children.length, 0);
  assert.equal(fallbackRoot.parent, boundary);
  assert.equal(fallbackRoot.visible, false);
});

test('the existing cargo pod is already present in source, release, and the runtime pod slot', () => {
  const sourceManifest = JSON.parse(readFileSync(
    new URL('../assets/ships/parts/parts_manifest.json', import.meta.url),
    'utf8',
  ));
  const releaseManifest = JSON.parse(readFileSync(
    new URL('../assets/ships/release/release_manifest.json', import.meta.url),
    'utf8',
  ));
  const source = sourceManifest.parts.find((entry) => entry.id === CAPSULE_ASSET_ID);
  const release = releaseManifest.assets.find((entry) => entry.id === CAPSULE_ASSET_ID);

  assert.equal(source?.file, CAPSULE_PART_FILE);
  assert.equal(source?.tris, 3776);
  assert.equal(release?.release, CAPSULE_RELEASE_URL);
  assert.equal(release?.releaseSha256, 'fd5b538629d17a9191a147be1a3ef6222d6fb890565f5cf4d11722c7ece0d5fa');
  assert.ok(partsLibrary.PART_LIBRARY_CONTRACT.slots.pod.includes(CAPSULE_PART_FILE));
});
