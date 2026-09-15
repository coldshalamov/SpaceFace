import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  createGpuResourceCensusCore,
  diffGpuResourceCensus,
  gpuCensusVerdict,
  gpuGeometryCensusKey,
  gpuTextureCensusKey,
  installGpuResourceCensusInPage,
  patchEventDispatcherForGpuCensus,
} from '../scripts/lib/gpuResourceCensus.mjs';

// The census exists because the PQ-022 H3 diagnostic receipts showed renderer-loaded geometry
// growing ~310 per corridor cycle while the residency ledger stayed flat: the growth lives outside
// the registry, so counting cannot attribute it. These contracts pin the attribution machinery
// itself: registration/disposal tracking through the real three.js dispatcher, uuid-level diffs
// that expose duplicate generations, and the leak-versus-warm-up judgement.

function registerGpuResource(core, resource) {
  // three.js registers its 'dispose' listener at upload time; the census observes exactly that.
  resource.addEventListener('dispose', () => {});
  void core;
}

function disposeGpuResource(resource) {
  resource.dispose();
}

function makeGeometry(label, { vertices = 12, batchKey = null, shared = false } = {}) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices * 3), 3));
  if (label) geometry.name = label;
  geometry.userData = {};
  if (batchKey) geometry.userData.spacefaceBatchKey = batchKey;
  if (shared) geometry.userData.spacefaceSharedAsset = true;
  return geometry;
}

test('census tracks GPU registration and disposal through the real three.js dispatcher', () => {
  const core = createGpuResourceCensusCore();
  const restore = patchEventDispatcherForGpuCensus(THREE, core);
  try {
    const geometry = makeGeometry('CensusProbeHull', { batchKey: 'wholeships/probe_lod0.glb' });
    const texture = new THREE.Texture();
    texture.name = 'probe_basecolor';

    registerGpuResource(core, geometry);
    registerGpuResource(core, texture);
    assert.equal(core.sizes().geometries, 1, 'one geometry registered at upload');
    assert.equal(core.sizes().textures, 1, 'one texture registered at upload');

    // A second listener registration for the same resource is not a second GPU allocation.
    registerGpuResource(core, geometry);
    assert.equal(core.sizes().geometries, 1);

    disposeGpuResource(geometry);
    assert.equal(core.sizes().geometries, 0, 'dispose event removes the geometry');
    assert.equal(core.sizes().textures, 1);
    disposeGpuResource(texture);
    assert.equal(core.sizes().textures, 0);
  } finally {
    restore();
  }
  // The prototype patch must be fully removed so later tests and imports stay pristine.
  assert.equal(
    THREE.EventDispatcher.prototype.addEventListener.name,
    'addEventListener',
    'addEventListener wrapper restored',
  );
});

test('collect marks scene-attached rows and clusters detached rows by their batch identity', () => {
  const core = createGpuResourceCensusCore();
  const restore = patchEventDispatcherForGpuCensus(THREE, core);
  try {
    const scene = new THREE.Scene();
    const attachedGeometry = makeGeometry('AttachedHull', { batchKey: 'wholeships/helios_lark.glb', vertices: 40 });
    const attachedMaterial = new THREE.MeshStandardMaterial();
    const attachedTexture = new THREE.Texture();
    attachedTexture.name = 'lark_hull_basecolor';
    attachedMaterial.map = attachedTexture;
    scene.add(new THREE.Mesh(attachedGeometry, attachedMaterial));
    const detachedGeometry = makeGeometry('DetachedGate', {
      batchKey: 'places/SF_PLACE_GATE_JUMP_RING|LOD0_Station_Material_Hull',
      shared: true,
      vertices: 19584,
    });

    for (const resource of [attachedGeometry, attachedTexture, detachedGeometry]) {
      registerGpuResource(core, resource);
    }

    const census = core.collect({ scene, info: { geometries: 3, textures: 1, programs: 2 }, sectorId: 'probe_sector' });
    const attached = census.geometries.find((row) => row.uuid === attachedGeometry.uuid);
    const detached = census.geometries.find((row) => row.uuid === detachedGeometry.uuid);
    assert.equal(attached.attached, true, 'scene-reachable geometry is attached');
    assert.equal(detached.attached, false, 'registered-but-unreachable geometry is detached');
    assert.match(detached.key, /batch:SF_PLACE_GATE_JUMP_RING\|LOD0_Station_Material_Hull/);
    assert.match(detached.key, /sharedAsset/);
    assert.match(detached.key, /v:19584/);
    assert.equal(census.registered.geometries, 2);
    assert.equal(census.registered.textures, 1);
    assert.equal(census.info.geometries, 3);
    assert.equal(census.sectorId, 'probe_sector');
    const textureRow = census.textures[0];
    assert.equal(textureRow.attached, true, 'texture reachable through a scene material is attached');
    assert.match(gpuTextureCensusKey(attachedTexture), /lark_hull_basecolor/);
  } finally {
    restore();
  }
});

function censusFromRows({ geometries, textures = [], sectorId = 'probe' } = {}) {
  return {
    schema: 'spaceface.gpuResourceCensus.v1',
    atPerfMs: 1,
    sectorId,
    info: { geometries: geometries.length, textures: textures.length, programs: 0 },
    registered: { geometries: geometries.length, textures: textures.length },
    truncated: false,
    geometries,
    textures,
  };
}

test('uuid diff exposes re-created generations under one batch key as duplicates', () => {
  const generationOne = {
    uuid: 'gen-1',
    key: 'batch:SF_PLACE_GATE_JUMP_RING|LOD0_Station_Material_Hull|v:19584',
    attached: false,
  };
  const first = censusFromRows({ geometries: [generationOne] });
  // Reload without disposal: same cluster key, new uuid, old generation still registered.
  const second = censusFromRows({
    geometries: [
      generationOne,
      { uuid: 'gen-2', key: generationOne.key, attached: true },
    ],
  });
  const diff = diffGpuResourceCensus(first, second);
  assert.equal(diff.geometry.added, 1);
  assert.equal(diff.geometry.disposed, 0);
  assert.equal(diff.geometry.net, 1);
  assert.equal(diff.geometry.duplicateGenerations, 1, 'one extra uuid under one batch key is one leaked generation');
  assert.deepEqual(
    diff.geometry.duplicateClusters,
    [{ key: generationOne.key, count: 1 }],
  );
  // A true dispose removes the old generation: no duplicates remain.
  const third = censusFromRows({
    geometries: [{ uuid: 'gen-2', key: generationOne.key, attached: true }],
  });
  const balanced = diffGpuResourceCensus(second, third);
  assert.equal(balanced.geometry.disposed, 1);
  assert.equal(balanced.geometry.net, -1, 'the reloaded generation replaces the disposed one: net negative, no duplicates');
  assert.equal(balanced.geometry.duplicateGenerations, 0);
});

test('verdict separates a decaying warm-up from sustained and duplicate-generation growth', () => {
  // Warm-up: each cycle adds visibly less, converging toward the noise band.
  const warmUp = gpuCensusVerdict([
    { geometry: { net: 320, duplicateGenerations: 0 } },
    { geometry: { net: 90, duplicateGenerations: 0 } },
    { geometry: { net: 12, duplicateGenerations: 0 } },
  ]);
  assert.equal(warmUp.verdict, 'warm-up');

  // The observed diagnostic shape: ~+310 per completed cycle, not decaying.
  const sustained = gpuCensusVerdict([
    { geometry: { net: 430, duplicateGenerations: 0 } },
    { geometry: { net: 310, duplicateGenerations: 0 } },
  ]);
  assert.equal(sustained.verdict, 'leak-suspected');
  assert.match(sustained.reason, /without decaying/);

  // Same-batch-key generations piling up names the culprit clusters directly.
  const duplicated = gpuCensusVerdict([
    { geometry: { net: 40, duplicateGenerations: 15 } },
    { geometry: { net: 40, duplicateGenerations: 31, duplicateClusters: [{ key: 'batch:probe', count: 31 }] } },
  ]);
  assert.equal(duplicated.verdict, 'leak-suspected');
  assert.match(duplicated.reason, /duplicate cluster generations grow/);
  assert.deepEqual(duplicated.latestDuplicateClusters, [{ key: 'batch:probe', count: 31 }]);

  // Stable band and insufficient evidence stay honest.
  assert.equal(gpuCensusVerdict([
    { geometry: { net: 4, duplicateGenerations: 0 } },
    { geometry: { net: -3, duplicateGenerations: 0 } },
  ]).verdict, 'stable');
  assert.equal(gpuCensusVerdict([{ geometry: { net: 310 } }]).verdict, 'inconclusive');
  assert.equal(gpuCensusVerdict([]).verdict, 'inconclusive');
});

test('page installer exposes the sampler and refuses to double-install', async () => {
  globalThis.window = { SF: { THREE } };
  globalThis.performance = globalThis.performance || { now: () => 0 };
  try {
    const first = await installGpuResourceCensusInPage();
    assert.equal(first.installed, true);
    assert.equal(typeof window.__sfGpuResourceCensus, 'function');
    const again = await installGpuResourceCensusInPage();
    assert.equal(again.installed, false);
    assert.equal(again.alreadyInstalled, true);

    // The sampler works against the installed state shape and returns the census schema.
    globalThis.window.SF.state = {
      render: { renderer: { info: { memory: { geometries: 0, textures: 0 }, programs: [] } }, scene: null },
      world: { currentSectorId: 'probe_sector' },
    };
    const census = window.__sfGpuResourceCensus();
    assert.equal(census.schema, 'spaceface.gpuResourceCensus.v1');
    assert.equal(census.sectorId, 'probe_sector');
  } finally {
    delete globalThis.window;
    // Restore the prototypes the installer patched.
    const core = createGpuResourceCensusCore();
    const restore = patchEventDispatcherForGpuCensus(THREE, core);
    restore();
  }
});

test('geometry census key keeps unmarked procedural geometry attributable', () => {
  const plain = makeGeometry('Wreck_Debris_Chunk', { vertices: 540 });
  assert.equal(gpuGeometryCensusKey(plain), 'name:Wreck_Debris_Chunk|v:540');
  assert.equal(gpuGeometryCensusKey(makeGeometry('', {})), 'unmarked|v:12');
  assert.equal(gpuGeometryCensusKey(null), 'null');
});
