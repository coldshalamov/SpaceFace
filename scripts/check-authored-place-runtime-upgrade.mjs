#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';

import {
  buildAuthoredPlaceProp,
  buildAuthoredStationArchetype,
  resolvePlaceFileForEntity,
  upgradeAuthoredPlaceBoundaryForProbe,
} from '../src/render/partsLibrary.js';

const RELEASE_ROOT = resolve('assets/ships/release/parts/places');
const CASES = [
  {
    id: 'place_station_trade_hub',
    type: 'station',
    radius: 34,
    data: { archetypeGlb: 'place_station_trade_hub', placeId: 'place_station_trade_hub', dockRadius: 72, placeScale: 72 / 14 },
  },
  {
    id: 'place_gate_jump_ring',
    type: 'station',
    radius: 32,
    data: {
      archetypeGlb: 'place_gate_jump_ring',
      placeId: 'place_gate_jump_ring',
      isGate: true,
      dockRadius: 70,
      placeScale: 70 / 14,
    },
  },
  ...['a', 'b', 'c'].map((suffix) => ({
    id: `place_asteroid_rock_${suffix}`,
    type: 'fx',
    radius: 10,
    data: {
      landmarkGlb: `place_asteroid_rock_${suffix}`,
      placeId: `place_asteroid_rock_${suffix}`,
      placeScale: 1,
    },
  })),
];

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
});

const records = new Map();
for (const entry of CASES) records.set(entry.id, await recordFromReleaseGlb(entry.id));

const silhouetteKeys = new Map();
for (const fixture of CASES) {
  const entity = makeEntity(fixture, `success_${fixture.id}`);
  const mounted = mountBoundary(entity);
  const fallbackSize = new THREE.Box3().setFromObject(mounted.fallback).getSize(new THREE.Vector3());
  const cleanup = observeFallbackCleanup(mounted.fallback);
  const placeFile = resolvePlaceFileForEntity(entity);
  const expectedUrl = `assets/ships/release/parts/places/${fixture.id}.glb`;

  const swapped = await upgradeAuthoredPlaceBoundaryForProbe(
    mounted.boundary,
    mounted.fallback,
    entity,
    placeFile,
    {},
    mounted.scene,
    {
      releaseMode: true,
      loadAuthoredPart: async (url) => {
        assert.equal(url, expectedUrl, `${fixture.id}: runtime requests its release GLB URL`);
        return records.get(fixture.id);
      },
    },
  );

  assert.equal(swapped, true, `${fixture.id}: validated authored record upgrades the runtime boundary`);
  assert.equal(mounted.boundary.userData.authoredAssetState, 'authored', `${fixture.id}: boundary state is authored`);
  assert.equal(mounted.boundary.userData.authoredVisualRoot, 'authored-root', `${fixture.id}: authored root is dominant`);
  assert.equal(mounted.boundary.userData.authoredReadableFallbackRetained, false,
    `${fixture.id}: procedural readable fallback is not retained after success`);
  assert.deepEqual(mounted.boundary.userData.authoredParts, [expectedUrl], `${fixture.id}: authored URL is published`);
  assert.deepEqual(mounted.boundary.userData.authoredSlots, { place: [expectedUrl] },
    `${fixture.id}: authored place slot is published`);
  assert.match(mounted.boundary.userData.authoredCompositionId || '', /^GLTFKIT_/,
    `${fixture.id}: GLTFKit composition id is present`);

  const authoredRoot = mounted.boundary.children.find((child) => child.name === `GLTFKit_${fixture.id}`);
  assert.ok(authoredRoot, `${fixture.id}: GLTFKit authored root is mounted`);
  assert.equal(mounted.boundary.userData.hull, authoredRoot, `${fixture.id}: active hull points at authored root`);
  assert.equal(mounted.fallback.parent, null, `${fixture.id}: fallback root is detached`);
  assert.deepEqual(visibleFallbackMeshNames(mounted.visual), [], `${fixture.id}: zero visible fallback mesh names remain`);
  assert.equal(mounted.boundary.children.filter((child) => child.name === `GLTFKit_${fixture.id}`).length, 1,
    `${fixture.id}: authored shell is mounted exactly once`);

  const authoredSize = new THREE.Box3().setFromObject(authoredRoot).getSize(new THREE.Vector3());
  const boundarySize = new THREE.Box3().setFromObject(mounted.boundary).getSize(new THREE.Vector3());
  const expectedScale = Number(entity.data.placeScale) || 1;
  const expectedAuthoredSize = new THREE.Vector3(...records.get(fixture.id).bounds.size).multiplyScalar(expectedScale);
  const expectedVisibleSize = new THREE.Vector3(...records.get(fixture.id).visibleBounds.size).multiplyScalar(expectedScale);
  const publishedVisualSize = new THREE.Vector3(...authoredRoot.userData.visualBounds.size);
  assert.ok(Math.min(authoredSize.x, authoredSize.y, authoredSize.z) > 0,
    `${fixture.id}: authored AABB is non-degenerate`);
  assertVectorRelativeNear(publishedVisualSize, expectedAuthoredSize, 1e-5,
    `${fixture.id}: runtime publishes the exact release-metre visual envelope times placeScale`);
  // The visible runtime AABB is allowed to be modestly smaller than the published source envelope:
  // collision helpers, sockets, and inactive LOD tiers are deliberately non-rendering. It may never
  // exceed that envelope or collapse toward the tiny fallback proxy. This tests the real runtime
  // contract instead of requiring invisible authoring helpers to contribute visible pixels.
  assertVectorInsideEnvelope(authoredSize, expectedVisibleSize, 0.80,
    `${fixture.id}: visible authored body remains dominant inside its published visual envelope`);
  assertVectorNear(boundarySize, authoredSize, `${fixture.id}: boundary AABB is authored-dominant`);
  assert.ok(Math.max(authoredSize.x, authoredSize.y, authoredSize.z) > Math.max(fallbackSize.x, fallbackSize.y, fallbackSize.z),
    `${fixture.id}: authored silhouette exceeds the tiny fallback proxy`);
  silhouetteKeys.set(fixture.id, silhouetteKey(authoredSize));

  for (const count of cleanup.materialDisposeCounts.values()) {
    assert.equal(count(), 1, `${fixture.id}: each detached fallback material is disposed once`);
  }
  for (const count of cleanup.geometryDisposeCounts.values()) {
    assert.equal(count(), 0, `${fixture.id}: shared fallback geometry remains valid for failure controls`);
  }

  if (mounted.wrapper) {
    assert.equal(mounted.wrapper.userData.authoredAssetState, 'authored', `${fixture.id}: HLOD wrapper mirrors authored state`);
    assert.equal(mounted.wrapper.userData.authoredVisualRoot, 'authored-root', `${fixture.id}: HLOD wrapper mirrors visual root`);
    assert.equal(mounted.wrapper.userData.authoredReadableFallbackRetained, false,
      `${fixture.id}: HLOD wrapper mirrors fallback lifecycle`);
    assert.deepEqual(mounted.wrapper.userData.authoredParts, [expectedUrl], `${fixture.id}: HLOD wrapper mirrors authored URL`);
    assert.equal(mounted.wrapper.userData.hull, authoredRoot, `${fixture.id}: HLOD wrapper mirrors active authored root`);
  }

  if (fixture.id.includes('rock_')) {
    const authoredMeshes = [];
    authoredRoot.traverse((object) => { if (object.isMesh) authoredMeshes.push(object); });
    assert.ok(authoredMeshes.length > 0, `${fixture.id}: authored rock has renderable meshes`);
    assert.ok(authoredMeshes.every((mesh) => mesh.geometry && mesh.geometry.type !== 'BoxGeometry'),
      `${fixture.id}: authored rock is not BoxGeometry`);
    let instanceProxyCount = 0;
    authoredRoot.traverse((object) => {
      if (object.userData && object.userData.spacefaceInstanceProxy) instanceProxyCount++;
    });
    assert.equal(instanceProxyCount, 0, `${fixture.id}: authored rock is not an instance proxy shell`);
  }
}

assert.notEqual(silhouetteKeys.get('place_station_trade_hub'), silhouetteKeys.get('place_gate_jump_ring'),
  'Helios hub and jump gate retain distinct authored silhouettes');
assert.equal(new Set([
  silhouetteKeys.get('place_asteroid_rock_a'),
  silhouetteKeys.get('place_asteroid_rock_b'),
  silhouetteKeys.get('place_asteroid_rock_c'),
]).size, 3, 'hero rocks A/B/C retain distinct authored silhouettes');

const failedEntity = makeEntity(CASES[0], 'failed_hub');
const failed = mountBoundary(failedEntity);
const failedSwap = await upgradeAuthoredPlaceBoundaryForProbe(
  failed.boundary,
  failed.fallback,
  failedEntity,
  resolvePlaceFileForEntity(failedEntity),
  {},
  failed.scene,
  { releaseMode: true, loadAuthoredPart: async () => null },
);
assert.equal(failedSwap, false, 'failed authored load does not swap the boundary');
assert.equal(failed.fallback.parent, failed.boundary, 'failed authored load retains the fallback root');
assert.ok(visibleFallbackMeshNames(failed.visual).length > 0, 'failed authored load keeps fallback meshes visible');
assert.equal(failed.boundary.userData.authoredAssetState, 'unavailable', 'failed load publishes unavailable state');
assert.equal(failed.boundary.userData.authoredVisualRoot, 'readable-fallback', 'failed load keeps fallback authoritative');
assert.equal(failed.boundary.userData.authoredReadableFallbackRetained, true, 'failed load reports retained fallback');
assert.equal(failed.wrapper.userData.authoredAssetState, 'unavailable', 'failed HLOD wrapper mirrors unavailable state');
assert.equal(failed.wrapper.userData.hull, failed.fallback, 'failed HLOD wrapper keeps fallback active');

const failedPlaceEntity = makeEntity(CASES[2], 'failed_rock');
const failedPlace = mountBoundary(failedPlaceEntity);
const failedPlaceSwap = await upgradeAuthoredPlaceBoundaryForProbe(
  failedPlace.boundary,
  failedPlace.fallback,
  failedPlaceEntity,
  resolvePlaceFileForEntity(failedPlaceEntity),
  {},
  failedPlace.scene,
  { releaseMode: true, loadAuthoredPart: async () => null },
);
assert.equal(failedPlaceSwap, false, 'failed authored place load does not swap the boundary');
assert.equal(failedPlace.fallback.parent, failedPlace.boundary, 'failed authored place load retains its fallback root');
assert.equal(failedPlace.boundary.userData.authoredVisualRoot, 'readable-fallback',
  'failed authored place load keeps fallback authoritative');
assert.equal(failedPlace.boundary.userData.authoredReadableFallbackRetained, true,
  'failed authored place load reports retained fallback');

console.log('Authored place runtime upgrade checks OK');

function makeEntity(fixture, id) {
  return {
    id,
    type: fixture.type,
    alive: true,
    radius: fixture.radius,
    pos: { x: 0, z: 0 },
    data: { ...fixture.data },
  };
}

function mountBoundary(entity) {
  const visual = entity.type === 'station'
    ? buildAuthoredStationArchetype(entity, { releaseMode: true })
    : buildAuthoredPlaceProp(entity, { releaseMode: true });
  assert.ok(visual && visual.isObject3D, `${entity.id}: synchronous fallback boundary exists`);
  const scene = new THREE.Scene();
  scene.add(visual);
  const wrapper = entity.type === 'station' ? visual : null;
  const detailed = wrapper && wrapper.children.find((child) => child.name === 'HLOD_Detailed');
  const boundary = wrapper ? detailed && detailed.children[0] : visual;
  assert.ok(boundary && /AuthoredAssetBoundary/.test(boundary.name), `${entity.id}: authored boundary is reachable`);
  const fallback = boundary.children.find((child) => /Fallback/.test(child.name));
  assert.ok(fallback, `${entity.id}: fallback root is mounted before async success`);
  return { visual, wrapper, boundary, fallback, scene };
}

function visibleFallbackMeshNames(root) {
  const names = [];
  root.traverseVisible((object) => {
    if (object.isMesh && /Fallback|PlaceFallback|StationArchetypeFallback/i.test(object.name || '')) names.push(object.name);
  });
  return names;
}

function observeFallbackCleanup(root) {
  const materials = new Set();
  const geometries = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const list = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
    for (const material of list) if (material) materials.add(material);
  });
  return {
    materialDisposeCounts: observeDisposeCounts(materials),
    geometryDisposeCounts: observeDisposeCounts(geometries),
  };
}

function observeDisposeCounts(resources) {
  const counts = new Map();
  for (const resource of resources) {
    let count = 0;
    resource.addEventListener('dispose', () => { count++; });
    counts.set(resource, () => count);
  }
  return counts;
}

function assertVectorNear(actual, expected, label) {
  for (const axis of ['x', 'y', 'z']) {
    assert.ok(Math.abs(actual[axis] - expected[axis]) < 1e-6,
      `${label} (${axis}: ${actual[axis]} vs ${expected[axis]})`);
  }
}

function silhouetteKey(size) {
  const max = Math.max(size.x, size.y, size.z, 1e-9);
  return [size.x / max, size.y / max, size.z / max].map((value) => value.toFixed(3)).join(':');
}

async function recordFromReleaseGlb(id) {
  const url = `assets/ships/release/parts/places/${id}.glb`;
  const doc = await io.read(resolve(RELEASE_ROOT, `${id}.glb`));
  const primitives = [];
  const bounds = new THREE.Box3();
  const visibleBounds = new THREE.Box3();
  let primitiveIndex = 0;

  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const nodeName = String(node.getName() || id);
    const matrix = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      if (!position) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(
        position.getArray().slice(),
        3,
        position.getNormalized(),
      ));
      const indices = primitive.getIndices();
      if (indices) geometry.setIndex(new THREE.BufferAttribute(indices.getArray().slice(), 1));
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      const primitiveBounds = geometry.boundingBox.clone().applyMatrix4(matrix);
      bounds.union(primitiveBounds);
      if (!/^(COLLISION_|LOD1_|LOD2_|SOCKET_)/i.test(nodeName)) visibleBounds.union(primitiveBounds);
      primitives.push(Object.freeze({
        key: `${id}:${primitiveIndex}`,
        name: `${node.getName() || id}_${primitiveIndex}`,
        geometry,
        material: new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.72, metalness: 0.2 }),
        matrix,
        tags: Object.freeze({}),
      }));
      primitiveIndex++;
    }
  }

  assert.ok(primitives.length > 0, `${id}: release GLB decodes real mesh primitives`);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const visibleSize = visibleBounds.getSize(new THREE.Vector3());
  const visibleCenter = visibleBounds.getCenter(new THREE.Vector3());
  assert.ok(size.lengthSq() > 0, `${id}: release GLB has finite authored bounds`);
  return Object.freeze({
    url,
    assetId: id,
    slot: 'place',
    primitives: Object.freeze(primitives),
    markers: Object.freeze([]),
    bounds: Object.freeze({
      min: Object.freeze(bounds.min.toArray()),
      max: Object.freeze(bounds.max.toArray()),
      size: Object.freeze(size.toArray()),
      center: Object.freeze(center.toArray()),
    }),
    visibleBounds: Object.freeze({
      min: Object.freeze(visibleBounds.min.toArray()),
      max: Object.freeze(visibleBounds.max.toArray()),
      size: Object.freeze(visibleSize.toArray()),
      center: Object.freeze(visibleCenter.toArray()),
    }),
  });
}

function assertVectorRelativeNear(actual, expected, tolerance, label) {
  for (const axis of ['x', 'y', 'z']) {
    const denominator = Math.max(1, Math.abs(expected[axis]));
    const relativeError = Math.abs(actual[axis] - expected[axis]) / denominator;
    assert.ok(relativeError <= tolerance,
      `${label} (${axis}: ${actual[axis]} vs ${expected[axis]}, relativeError=${relativeError})`);
  }
}

function assertVectorInsideEnvelope(actual, expected, minimumRatio, label) {
  for (const axis of ['x', 'y', 'z']) {
    const expectedValue = Math.max(1e-9, Math.abs(expected[axis]));
    const ratio = Math.abs(actual[axis]) / expectedValue;
    // Meshopt/quantized accessor reconstruction can expand a decoded axis by a few percent.
    assert.ok(ratio >= minimumRatio && ratio <= 1.05,
      `${label} (${axis}: ${actual[axis]} vs ${expected[axis]}, ratio=${ratio})`);
  }
}
