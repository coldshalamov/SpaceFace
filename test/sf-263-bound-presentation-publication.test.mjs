// SF-263 — a complex body commits whole, or not at all. Preparation may be
// sliced and canceled; a stale generation cannot publish a partial body.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import * as THREE from 'three';

import { createPresentationJournal, PRESENTATION_JOURNAL_KINDS } from '../src/core/presentationJournal.js';
import {
  RENDER_PACKAGE_SCHEMA,
  RENDER_PACKAGE_SEMANTIC_EXTRAS_KEY,
  RENDER_PACKAGE_SEMANTIC_EXTRAS_SCHEMA,
  renderPackageContentIdentity,
  stableJsonStringify,
} from '../src/contracts/renderPackage.js';
import {
  compileSubjectsAcrossPresents,
} from '../src/render/compilePresentSlice.js';
import {
  classifyRequiredPackageAdmission,
  commitRequiredPackageAdmission,
  createPipelineAdmissionTracker,
} from '../src/render/pipelineReadiness.js';
import { createPresentationPublisher } from '../src/render/presentationPublisher.js';
import { createPresentationWorld } from '../src/render/presentationWorld.js';
import { createAssetResidencyRegistry } from '../src/render/assetResidency.js';
import { createRenderPackageLoader } from '../src/render/renderPackageLoader.js';

const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function packageMetadata() {
  const metadata = {
    schema: RENDER_PACKAGE_SCHEMA,
    assetId: 'fixture.ship',
    kind: 'ship',
    compiler: { name: 'spaceface-render-package-compiler', version: '1.0.0' },
    contentHash: '0'.repeat(64),
    render: { uri: 'render.glb', sha256: '2'.repeat(64), bytes: 256 },
    provenance: {
      sourceGlb: { uri: 'fixture.glb', sha256: '3'.repeat(64), bytes: 512 },
      sourceManifest: null,
      semantics: { sha256: '4'.repeat(64) },
    },
    nodes: [
      {
        id: 'fixture.body',
        nodeName: 'Hull',
        nodePath: [0],
        role: 'immutable',
        parentId: null,
        localTransform: [...IDENTITY],
        worldTransform: [...IDENTITY],
        materialPipelineKey: 'opaque:front',
        spatialClusterId: 'body',
        mergeBoundary: 'body',
      },
      {
        id: 'fixture.turret',
        nodeName: 'Turret',
        nodePath: [1],
        role: 'dynamic',
        parentId: null,
        localTransform: [...IDENTITY],
        worldTransform: [...IDENTITY],
        materialPipelineKey: 'opaque:front',
        spatialClusterId: 'body',
        mergeBoundary: 'turret',
      },
    ],
    anchors: [{
      id: 'fixture.trail.left',
      nodeName: 'FX_Trail_Left',
      nodePath: [0, 0],
      kind: 'trail',
      parentNodeId: 'fixture.body',
      localTransform: [...IDENTITY],
      worldTransform: [...IDENTITY],
    }],
    dynamicGroups: [{
      id: 'fixture.turret.group',
      nodeId: 'fixture.turret',
      kind: 'moving-part',
    }],
    geometry: [],
    materials: [],
    lods: [],
    hlods: [],
    collisions: [{ id: 'fixture.hull_collider', nodeId: 'fixture.body', reference: 'hull-skin' }],
    spatialClusters: [{ id: 'body', nodeIds: ['fixture.body', 'fixture.turret'], bounds: null }],
  };
  metadata.contentHash = createHash('sha256')
    .update(stableJsonStringify(renderPackageContentIdentity(metadata)))
    .digest('hex');
  return metadata;
}

function semanticLocator(rawNodeName, recordIds) {
  return {
    [RENDER_PACKAGE_SEMANTIC_EXTRAS_KEY]: {
      schema: RENDER_PACKAGE_SEMANTIC_EXTRAS_SCHEMA,
      recordIds,
      rawNodeName,
    },
  };
}

function decodedFixture() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setIndex([0, 1, 2]);
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const root = new THREE.Group();
  root.name = 'FixtureScene';
  const hull = new THREE.Mesh(geometry, material);
  hull.name = 'Hull';
  hull.userData = semanticLocator('Hull', ['fixture.body']);
  const anchor = new THREE.Object3D();
  anchor.name = 'FX_Trail_Left';
  anchor.userData = semanticLocator('FX_Trail_Left', ['fixture.trail.left']);
  hull.add(anchor);
  const turret = new THREE.Mesh(geometry, material);
  turret.name = 'Turret';
  turret.userData = semanticLocator('Turret', ['fixture.turret']);
  const collider = new THREE.Mesh(geometry, material);
  collider.name = 'Collider';
  root.add(hull, turret, collider);
  return { scene: root, geometry, material, texture };
}

function disposeFixture(decoded) {
  decoded.geometry.dispose();
  decoded.material.dispose();
  decoded.texture.dispose();
}

function namesUnder(root) {
  const names = [];
  root.traverse((object) => names.push(object.name));
  return names;
}

function entity(id, x = 0) {
  return {
    id,
    type: 'ship',
    alive: true,
    pos: { x, y: 0, z: 0 },
    prevPos: { x, y: 0, z: 0 },
    rot: 0,
    prevRot: 0,
    bank: 0,
    prevBank: 0,
    pitch: 0,
    prevPitch: 0,
    radius: 4,
    flags: {},
    presentationVisualRevision: 0,
  };
}

function stateFor(entities) {
  return {
    entityList: entities,
    entities: new Map(entities.map((value) => [value.id, value])),
  };
}

function aliveIds(world) {
  const ids = [];
  for (let slot = 0; slot < world.capacity; slot++) {
    if (world.alive[slot] === 1) ids.push(world.entityIds[slot]);
  }
  ids.sort((a, b) => a - b);
  return ids;
}

function mountedIds(world) {
  const ids = [];
  for (let slot = 0; slot < world.capacity; slot++) {
    if (world.alive[slot] === 1 && world.meshRefs[slot]) ids.push(world.entityIds[slot]);
  }
  ids.sort((a, b) => a - b);
  return ids;
}

function assertUnmounted(world) {
  for (let slot = 0; slot < world.capacity; slot++) {
    if (world.alive[slot] !== 1) continue;
    assert.equal(world.visible[slot], 0, `slot ${slot} is drawn before a body is bound`);
    assert.equal(world.meshRefs[slot], null, `slot ${slot} has a mesh before publication bind`);
  }
}

test('SF-263 package publication commits one complete unparented body; a canceled generation mounts nothing', async () => {
  const decoded = decodedFixture();
  const templateScene = new THREE.Scene();
  templateScene.add(decoded.scene);
  const publishScene = new THREE.Scene();
  const loader = createRenderPackageLoader({
    residency: createAssetResidencyRegistry(),
    loadGlb: async () => ({ scene: decoded.scene }),
  });
  try {
    const loaded = await loader.load(packageMetadata());
    const instance = loaded.createInstance();
    assert.equal(instance.root.parent, null);
    assert.equal(publishScene.children.length, 0);
    assert.equal(templateScene.children.length, 1);
    assert.equal(templateScene.children[0], decoded.scene);
    const names = namesUnder(instance.root);
    assert.ok(names.includes('Hull'));
    assert.ok(names.includes('Turret'));
    assert.ok(names.includes('Collider'));
    assert.equal(names.filter((name) => name === 'Collider').length, 1);

    publishScene.add(instance.root);
    assert.equal(publishScene.children.length, 1);
    assert.equal(publishScene.children[0], instance.root);
    let colliderParentedToScene = false;
    publishScene.traverse((object) => {
      if (object.name === 'Collider' && object.parent === publishScene) colliderParentedToScene = true;
    });
    assert.equal(colliderParentedToScene, false, 'the collider commits only as part of the complete root');
    instance.dispose();

    let builtRoot = null;
    assert.throws(() => loaded.createInstance({
      createNode({ source, planIndex }) {
        if (source.name === 'Collider') throw new Error('canceled-before-body-ready');
        if (planIndex === 0) {
          builtRoot = new THREE.Group();
          builtRoot.name = source.name;
          return builtRoot;
        }
        return null;
      },
    }), /canceled-before-body-ready/);
    assert.ok(builtRoot);
    assert.equal(builtRoot.parent, null);
    assert.equal(namesUnder(builtRoot).includes('Collider'), false);
    assert.equal(publishScene.children.includes(builtRoot), false);
    assert.equal(templateScene.children.length, 1);
  } finally {
    loader.dispose();
    disposeFixture(decoded);
  }
});

test('SF-263 an aborted package generation never returns a mountable partial body', async () => {
  const decoded = decodedFixture();
  const publishScene = new THREE.Scene();
  let releasePrepare = () => {};
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const loader = createRenderPackageLoader({
    residency: createAssetResidencyRegistry(),
    loadGlb: async () => ({ scene: decoded.scene }),
    prepareDecoded: () => new Promise((resolve) => {
      markStarted();
      releasePrepare = () => resolve(null);
    }),
  });
  const controller = new AbortController();
  const metadata = packageMetadata();
  try {
    const pending = loader.load(metadata, { signal: controller.signal });
    const rejected = assert.rejects(pending, (error) => {
      assert.equal(error.name, 'AbortError');
      return true;
    });
    await started;
    controller.abort();
    const replacement = loader.load(metadata);
    releasePrepare();
    await rejected;
    const loaded = await replacement;
    const instance = loaded.createInstance();
    assert.equal(instance.root.parent, null);
    assert.equal(publishScene.children.length, 0);
    const names = namesUnder(instance.root);
    assert.ok(names.includes('Hull') && names.includes('Turret') && names.includes('Collider'));
    publishScene.add(instance.root);
    assert.deepEqual(publishScene.children, [instance.root]);
  } finally {
    releasePrepare();
    loader.dispose();
    disposeFixture(decoded);
  }
});

test('SF-263 a mismatched or canceled admission generation does not publish a ready body', async () => {
  const render = {
    admissionRunGeneration: 7,
    requiredPackageAdmission: {
      status: 'accepted',
      ready: true,
      packageId: 'ship_kestrel',
      reason: '',
      generation: 7,
    },
  };
  const superseded = classifyRequiredPackageAdmission({
    capturedGeneration: 6,
    currentGeneration: 7,
    settled: { ok: true, value: { assetId: 'ship_half', packageId: 'ship_half' } },
  });
  assert.equal(superseded.status, 'superseded');
  assert.equal(superseded.ready, false);
  assert.equal(superseded.publish, false);
  assert.equal(commitRequiredPackageAdmission(render, 6, {
    publish: true,
    status: 'accepted',
    ready: true,
    packageId: 'ship_half',
  }), false);
  assert.equal(render.requiredPackageAdmission.packageId, 'ship_kestrel');
  assert.equal(render.requiredPackageAdmission.generation, 7);
  assert.equal(render.requiredPackageAdmission.ready, true);

  const canceled = classifyRequiredPackageAdmission({
    capturedGeneration: 7,
    currentGeneration: 7,
    canceledStamp: true,
  });
  assert.equal(canceled.status, 'rejected');
  assert.equal(canceled.ready, false);
  assert.equal(commitRequiredPackageAdmission(render, 7, canceled), true);
  assert.equal(render.requiredPackageAdmission.status, 'rejected');
  assert.equal(render.requiredPackageAdmission.ready, false);
  assert.equal(render.requiredPackageAdmission.generation, 7);

  const late = classifyRequiredPackageAdmission({
    capturedGeneration: 7,
    currentGeneration: 7,
    existing: render.requiredPackageAdmission,
    settled: { ok: true, value: { assetId: 'ship_half', packageId: 'ship_half' } },
  });
  assert.equal(late.status, 'rejected');
  assert.equal(late.ready, false);
  assert.equal(late.publish, false);
  assert.equal(commitRequiredPackageAdmission(render, 7, {
    publish: true,
    status: 'accepted',
    ready: true,
    packageId: 'ship_half',
  }), false);
  assert.equal(render.requiredPackageAdmission.status, 'rejected');
  assert.equal(render.requiredPackageAdmission.ready, false);

  const compiled = [];
  const tracker = createPipelineAdmissionTracker((subjects) => {
    compiled.push(subjects.length);
    return { linked: subjects.length };
  }, { quietMs: 5, maxWaitMs: 5 });
  const subject = { name: 'complex-body' };
  let live = true;
  const admission = tracker.compile(subject, { isActive: () => live });
  live = false;
  await assert.rejects(admission, { name: 'AbortError' });
  assert.deepEqual(compiled, [], 'a canceled owner never enters the compile batch');
});

test('SF-263 presentation publication keeps a complete body; a stale generation cannot split it', () => {
  const first = entity(1, 2);
  const second = entity(2, 8);
  const third = entity(3, 14);
  const state = stateFor([first, second, third]);
  const journal = createPresentationJournal(16);
  journal.recordSpawn(1, first);
  journal.recordSpawn(1, second);
  journal.recordSpawn(1, third);
  const world = createPresentationWorld({ capacity: 16 });
  const realAllocate = world.allocateRecord.bind(world);
  let allocations = 0;
  world.allocateRecord = (record, value) => {
    allocations += 1;
    if (allocations === 2) throw new Error('generation-canceled');
    return realAllocate(record, value);
  };
  const publisher = createPresentationPublisher(world, state, { journal });
  const frame = {
    journal,
    journalStart: 0,
    journalEnd: 3,
    journalFullRebuild: false,
    journalRebuildGeneration: 0,
    journalValid: true,
  };
  const failed = publisher.consume(frame);
  assert.equal(failed.fallback, true);
  assert.equal(failed.valid, false);
  assert.equal(failed.spawnedCount, 0);
  assert.deepEqual(aliveIds(world), [1, 2, 3]);
  assertUnmounted(world);

  const live = createPresentationWorld({ capacity: 16 });
  const liveState = stateFor([first, second]);
  const liveJournal = createPresentationJournal(16);
  liveJournal.recordSpawn(1, first);
  liveJournal.recordSpawn(1, second);
  const livePublisher = createPresentationPublisher(live, liveState, { journal: liveJournal });
  const liveFrame = {
    journal: liveJournal,
    journalStart: 0,
    journalEnd: 2,
    journalFullRebuild: false,
    journalRebuildGeneration: 0,
    journalValid: true,
  };
  const published = livePublisher.consume(liveFrame);
  assert.equal(published.applied, 2);
  assert.equal(published.fallback, false);
  assert.deepEqual(aliveIds(live), [1, 2]);
  assertUnmounted(live);
  for (const value of [first, second]) {
    const handle = live.handleForEntityId(value.id);
    assert.equal(live.bindMesh(handle, { id: value.id }, value, value.radius), true);
  }
  assert.deepEqual(mountedIds(live), [1, 2]);

  const stale = livePublisher.consume({
    journal: {
      getWriteSequence: () => 3,
      needsRebuild: () => false,
      hasRange: () => true,
      requestRebuild() {},
      visitRange(_start, _end, _scratch, apply) {
        apply({
          kind: PRESENTATION_JOURNAL_KINDS.DESTROY,
          entityId: first.id,
          generation: 999,
        });
        return 1;
      },
    },
    journalStart: 2,
    journalEnd: 3,
    journalFullRebuild: false,
    journalRebuildGeneration: 0,
    journalValid: true,
  });
  assert.equal(stale.fallback, true);
  assert.deepEqual(aliveIds(live), [1, 2]);
  const mounted = mountedIds(live);
  assert.notEqual(mounted.length, 1, 'a stale generation must not leave one body mounted and its sibling stripped');

  second.alive = false;
  liveState.entityList.splice(liveState.entityList.indexOf(second), 1);
  liveState.entities.delete(second.id);
  assert.equal(liveJournal.rebuildFrom(liveState.entityList, 4), true);
  const replaced = livePublisher.consume({
    journal: liveJournal,
    journalStart: liveJournal.getLastRebuildStart(),
    journalEnd: liveJournal.getLastRebuildEnd(),
    journalFullRebuild: true,
    journalRebuildGeneration: liveJournal.getRebuildGeneration(),
    journalValid: true,
  });
  assert.equal(replaced.rebuilt, true);
  assert.deepEqual(aliveIds(live), [1]);
  assert.equal(live.getSlotForEntityId(second.id), -1);
  assertUnmounted(live);
});

test('SF-263 compile preparation stays bounded and hidden, and a failure cancels the tail', async () => {
  const scene = new THREE.Scene();
  const hull = new THREE.Mesh();
  hull.name = 'Hull';
  hull.visible = false;
  const collider = new THREE.Mesh();
  collider.name = 'Collider';
  collider.visible = false;
  const order = [];
  await compileSubjectsAcrossPresents(
    [hull, collider],
    async (mesh) => {
      order.push(mesh.name);
      assert.equal(mesh.parent, null);
      assert.equal(scene.children.length, 0);
      mesh.visible = false;
    },
    async () => { order.push('yield'); },
    { budgetMs: 0, now: () => 8 },
  );
  assert.deepEqual(order, ['Hull', 'yield', 'Collider']);
  assert.equal(hull.visible, false);
  assert.equal(collider.visible, false);
  assert.equal(hull.parent, null);
  assert.equal(collider.parent, null);

  const ran = [];
  await assert.rejects(
    compileSubjectsAcrossPresents(
      ['hull', 'wing', 'collider'],
      async (name) => {
        ran.push(name);
        if (name === 'wing') throw new Error('superseded');
      },
      async () => {},
      { budgetMs: 0, now: () => 5 },
    ),
    /superseded/,
  );
  assert.deepEqual(ran, ['hull', 'wing']);
});
