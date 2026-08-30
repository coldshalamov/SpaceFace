import test from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';

import {
  SECTOR_BOUNDARY_PREPARATION_STATE,
  authoredBoundaryPreparationSignature,
  createSectorPrewarmCertification,
  createSectorBoundaryGenerationManager,
  disposePreparedSectorBoundary,
  isLiveSectorBoundaryRecordCurrent,
  isSectorPrewarmEntityEligible,
  promoteSectorPrewarmAbortQuarantine,
  promoteSectorPrewarmGenerationInvalidation,
  pruneSettledSectorBoundaryRecords,
  publishSectorBoundaryRecordSnapshot,
  publishPreparedSectorBoundary,
  reconcileSettledSectorBoundaryRecords,
  sectorPrewarmPopulationNeedsSynchronousRefresh,
  sectorPrewarmCertificationIsCurrent,
  settleLiveSectorBoundaryAdmissions,
  settleSectorPrewarmPopulationFixpoint,
  validateSectorPrewarmPopulationCoverage,
} from '../src/render/renderer.js';
import {
  authoredCompositionFingerprintForEntity,
  buildAuthoredCargoCapsule,
  disposePreparedAuthoredBoundary,
  enqueueBoundaryUpgrade,
  upgradeAuthoredCargoCapsuleBoundaryForProbe,
} from '../src/render/partsLibrary.js';
import { prepareSectorEntry, preloadAuthoredParts } from '../src/render/assetLoader.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

test('exact sector boundary prewarm excludes generic and off-runway entities', () => {
  const player = {
    id: 1,
    isPlayer: true,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
  };
  const state = {
    playerId: 1,
    player: { targetId: null },
    entities: new Map([[1, player]]),
    camera: { zoom: 144, liveZoom: 144, fov: 50, aspect: 16 / 9, tilt: 60 },
    settings: { video: { fov: 50 } },
  };
  const record = { sectorId: 'sector_test' };
  const genericNear = {
    id: 2,
    type: 'asteroid',
    alive: true,
    homeSectorId: 'sector_test',
    pos: { x: 20, z: 0 },
  };
  const authoredNear = {
    id: 3,
    type: 'ship',
    alive: true,
    homeSectorId: 'sector_test',
    pos: { x: 20, z: 0 },
    data: { defId: 'ship_wasp' },
  };
  const authoredFar = {
    ...authoredNear,
    id: 4,
    pos: { x: 8_000, z: 0 },
  };

  assert.equal(isSectorPrewarmEntityEligible(record, genericNear, state), false,
    'the shared spawnable archetype list does not make a generic entity authored');
  assert.equal(isSectorPrewarmEntityEligible(record, authoredNear, state), true,
    'an exact authored identity on the entry runway joins hidden publication');
  assert.equal(isSectorPrewarmEntityEligible(record, authoredFar, state), false,
    'off-runway authored identities stay on ordinary bounded streaming');
});

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

test('sector prewarm prefetch keeps request order with a bounded decode lane', async () => {
  const requests = ['a', 'b', 'c', 'd', 'e'].map((url) => ({ url, slot: 'hull' }));
  const started = [];
  const gates = new Map();
  let active = 0;
  let peak = 0;
  const loading = preloadAuthoredParts(requests, {}, {
    concurrency: 2,
    loadPart: async (url) => {
      started.push(url);
      active++;
      peak = Math.max(peak, active);
      const gate = deferred();
      gates.set(url, gate);
      try {
        return await gate.promise;
      } finally {
        active--;
      }
    },
  });

  await flushMicrotasks();
  assert.deepEqual(started, ['a', 'b']);
  assert.equal(peak, 2, 'the sector lane admits at most two decodes at once');

  gates.get('a').resolve('record-a');
  await flushMicrotasks();
  assert.deepEqual(started, ['a', 'b', 'c']);
  gates.get('b').resolve('record-b');
  await flushMicrotasks();
  gates.get('c').resolve('record-c');
  await flushMicrotasks();
  gates.get('d').resolve('record-d');
  await flushMicrotasks();
  gates.get('e').resolve('record-e');

  assert.deepEqual(await loading, [
    'record-a', 'record-b', 'record-c', 'record-d', 'record-e',
  ], 'bounded workers preserve the authored request order');
  assert.equal(peak, 2);
});

test('sector prewarm cancellation releases its waiter without awaiting shared decode completion', async () => {
  const cancellation = deferred();
  const gates = new Map();
  const started = [];
  let active = true;
  const loading = preloadAuthoredParts(
    ['a', 'b', 'c'].map((url) => ({ url, slot: 'hull' })),
    {},
    {
      concurrency: 2,
      isActive: () => active,
      cancelPromise: cancellation.promise,
      loadPart: async (url) => {
        started.push(url);
        const gate = deferred();
        gates.set(url, gate);
        return gate.promise;
      },
    },
  );

  await flushMicrotasks();
  assert.deepEqual(started, ['a', 'b']);
  active = false;
  cancellation.resolve('superseded-sector');
  assert.deepEqual(await loading, [],
    'a superseded sector does not hold the next generation behind its decode promises');

  // The shared package tasks are allowed to finish after logical cancellation. They are observed
  // by the prefetch helper and therefore cannot become unhandled rejections.
  gates.get('a').resolve('late-a');
  gates.get('b').resolve('late-b');
  await flushMicrotasks();
  assert.deepEqual(started, ['a', 'b']);
});

test('sector entry cancellation does not await load or shader warm promises from a stale generation', async () => {
  const cancellation = deferred();
  const load = deferred();
  const warm = deferred();
  let active = true;
  let released = 0;
  let warmed = 0;
  const preparing = prepareSectorEntry({}, 'sector-stale', [{ url: 'a', slot: 'hull' }], {
    owner: {},
    residency: {
      releaseOwner() { released++; },
      rotateSector() { throw new Error('stale generation must not rotate residency'); },
    },
    isEntryActive: () => active,
    cancelPromise: cancellation.promise,
    loadPart: () => load.promise,
    warmShaders: async () => {
      warmed++;
      await warm.promise;
    },
  });

  await flushMicrotasks();
  load.resolve({ url: 'admitted-a' });
  await flushMicrotasks();
  assert.equal(warmed, 1);
  active = false;
  cancellation.resolve('superseded-sector');
  const receipt = await preparing;
  assert.equal(receipt.cancelled, true);
  assert.equal(receipt.rotated, false);
  assert.equal(released, 1);
  warm.resolve();
  await flushMicrotasks();

  // Both underlying stages may finish after logical cancellation, but the stale entry has already
  // returned its cancellation receipt and never reaches the residency rotation call.
});

test('sector prewarm repeats the synchronous census only for an unseeded or dirty active record', () => {
  assert.equal(sectorPrewarmPopulationNeedsSynchronousRefresh(null), false);
  assert.equal(sectorPrewarmPopulationNeedsSynchronousRefresh({ active: false }), false);
  assert.equal(sectorPrewarmPopulationNeedsSynchronousRefresh({ active: true }), true);
  assert.equal(sectorPrewarmPopulationNeedsSynchronousRefresh({
    active: true,
    populationSeeded: true,
    populationCoverageDirty: false,
  }), false);
  assert.equal(sectorPrewarmPopulationNeedsSynchronousRefresh({
    active: true,
    populationSeeded: true,
    populationCoverageDirty: true,
  }), true);
});

function cargoCapsuleFixtureRecord() {
  const geometry = new THREE.BoxGeometry(5.2, 2.25, 3);
  const material = new THREE.MeshStandardMaterial({
    color: 0x65717b,
    roughness: 0.58,
    metalness: 0.4,
  });
  material.name = 'Material_Hull';
  return {
    url: 'assets/ships/release/parts/pods/pod_cargo_container.glb',
    assetId: 'SF_POD_CARGO_CONTAINER',
    slot: 'pod',
    bounds: {
      min: [-0.5, -0.125, -1.5],
      max: [4.7, 2.125, 1.5],
      size: [5.2, 2.25, 3],
      center: [2.1, 1, 0],
    },
    primitives: [{
      key: 'fixture:prewarm-cargo-capsule',
      name: 'LOD0_CargoCapsule',
      geometry,
      material,
      matrix: new THREE.Matrix4().makeTranslation(2.1, 1, 0),
      tags: { lod: 'lod0', tint: 'hull', instance: true },
    }],
    markers: [],
  };
}

function preparedManager(overrides = {}) {
  const events = [];
  const scene = { id: 'final-scene' };
  const manager = createSectorBoundaryGenerationManager({
    buildBoundary(record) {
      const boundary = {
        id: `boundary:${record.id}:${record.generation}`,
        parent: null,
        visible: true,
        prepared: false,
      };
      events.push(['build', boundary]);
      return boundary;
    },
    mountBoundary(record) {
      record.boundary.parent = scene;
      record.boundary.visible = false;
      events.push(['mount-hidden', record.boundary]);
    },
    async requestPreparation(record) {
      record.boundary.prepared = true;
      events.push(['prepare', record.boundary]);
      return { status: 'authored-prepared' };
    },
    isPrepared(record) {
      return record.boundary.prepared === true;
    },
    validate(record) {
      return record.valid !== false;
    },
    publishBoundary(record) {
      assert.equal(record.boundary.visible, false, 'the prepared boundary remains hidden through commit');
      assert.equal(record.boundary.parent, scene, 'the exact final-scene owner is never reparented');
      record.entity.mesh = record.boundary;
      events.push(['bind', record.boundary]);
      record.boundary.visible = true;
      events.push(['reveal-last', record.boundary]);
      return true;
    },
    disposeBoundary(record) {
      events.push(['dispose', record.boundary]);
      record.boundary.visible = false;
      record.boundary.parent = null;
      if (record.entity.mesh === record.boundary) record.entity.mesh = null;
    },
    restoreEntity(record) {
      events.push(['restore', record.entity]);
      record.entity.restored = (record.entity.restored || 0) + 1;
    },
    ...overrides,
  });
  return { manager, events, scene };
}

function reservation(id = 'incoming-hauler', generation = 1) {
  return {
    id,
    entity: { id, alive: true, mesh: null },
    sectorId: 'sector_tethys',
    generation,
    valid: true,
  };
}

test('sector prewarm publishes the exact hidden boundary once and reveals it last', async () => {
  const { manager, events, scene } = preparedManager();
  const spec = reservation();
  const record = manager.reserve(spec);
  const repeated = manager.reserve(spec);

  assert.strictEqual(repeated, record, 'same entity/generation reservation is idempotent');
  await record.settled;
  assert.equal(record.state, SECTOR_BOUNDARY_PREPARATION_STATE.ready);
  assert.equal(record.boundary.visible, false);
  assert.strictEqual(record.boundary.parent, scene);
  assert.equal(manager.has(spec.id), true, 'READY reservations exclude ordinary reconciliation');

  assert.equal(await manager.publish(record), true);
  assert.equal(record.state, SECTOR_BOUNDARY_PREPARATION_STATE.live);
  assert.strictEqual(spec.entity.mesh, record.boundary, 'publication adopts the prepared boundary by identity');
  assert.equal(record.boundary.visible, true);
  assert.equal(manager.has(spec.id), false, 'the reservation is released only after live publication');
  assert.equal(await manager.publish(record), true, 'duplicate arrival publication is idempotent');
  assert.deepEqual(events.map(([name]) => name), [
    'build', 'mount-hidden', 'prepare', 'bind', 'reveal-last',
  ]);
});

test('numeric entity ids remain numeric through reservation, publication, and cleanup', async () => {
  const { manager } = preparedManager();
  const spec = reservation(1042);
  const record = manager.reserve(spec);

  assert.equal(manager.has(1042), true);
  assert.equal(manager.has('1042'), false, 'a numeric game-state key is never string-coerced');
  await record.settled;
  assert.equal(await manager.publish(record), true);
  assert.strictEqual(spec.entity.mesh, record.boundary);
  assert.equal(manager.has(1042), false);
  assert.equal(manager.get('1042'), null);
});

test('in-flight abort waits for owned preparation before one cleanup and restoration', async () => {
  const admission = deferred();
  let disposeCount = 0;
  const { manager, events } = preparedManager({
    requestPreparation(record) {
      events.push(['prepare', record.boundary]);
      return admission.promise;
    },
    isPrepared() {
      return true;
    },
    disposeBoundary(record) {
      disposeCount++;
      events.push(['dispose', record.boundary]);
      record.boundary.parent = null;
    },
  });
  const record = manager.reserve(reservation('abort-in-flight'));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(record.state, SECTOR_BOUNDARY_PREPARATION_STATE.preparing);

  let abortSettled = false;
  const aborting = manager.abort(record, 'jump-charge-aborted').then(() => { abortSettled = true; });
  await Promise.resolve();
  assert.equal(abortSettled, false, 'cleanup cannot race an admitted GPU/load task');
  assert.equal(disposeCount, 0);

  admission.resolve({ status: 'authored-prepared' });
  await aborting;
  assert.equal(record.state, SECTOR_BOUNDARY_PREPARATION_STATE.disposed);
  assert.equal(disposeCount, 1);
  assert.equal(record.entity.restored, 1);
  assert.equal(manager.has(record.id), false);
  assert.deepEqual(events.map(([name]) => name), [
    'build', 'mount-hidden', 'prepare', 'dispose', 'restore',
  ]);
});

test('stale fingerprint or renderer epoch refuses publication and restores the entity', async () => {
  let publishCount = 0;
  const { manager } = preparedManager({
    validate(record) {
      return record.fingerprint === record.currentFingerprint
        && record.contextGeneration === record.currentContextGeneration;
    },
    publishBoundary() {
      publishCount++;
      return true;
    },
  });
  const record = manager.reserve({
    ...reservation('stale-before-publish'),
    fingerprint: 'before',
    currentFingerprint: 'after',
    contextGeneration: 4,
    currentContextGeneration: 5,
  });
  await record.settled;

  assert.equal(await manager.publish(record), false);
  assert.equal(publishCount, 0);
  assert.equal(record.state, SECTOR_BOUNDARY_PREPARATION_STATE.disposed);
  assert.equal(record.entity.mesh, null);
  assert.equal(record.entity.restored, 1);
});

test('new generation waits for superseded work and never mounts two hidden owners', async () => {
  const firstAdmission = deferred();
  const mounted = new Set();
  let firstRecord;
  const { manager } = preparedManager({
    mountBoundary(record) {
      assert.equal(mounted.size, 0, 'superseded generation is disposed before replacement mount');
      mounted.add(record.boundary);
      record.boundary.parent = { id: 'scene' };
      record.boundary.visible = false;
    },
    requestPreparation(record) {
      if (record.generation === 1) return firstAdmission.promise;
      record.boundary.prepared = true;
      return { status: 'authored-prepared' };
    },
    isPrepared(record) {
      return record.generation !== 1 && record.boundary.prepared === true;
    },
    disposeBoundary(record) {
      mounted.delete(record.boundary);
      record.boundary.parent = null;
    },
  });
  firstRecord = manager.reserve(reservation('superseded', 1));
  await Promise.resolve();
  await Promise.resolve();
  const secondRecord = manager.reserve({
    ...reservation('superseded', 2),
    entity: firstRecord.entity,
  });
  await Promise.resolve();
  assert.equal(secondRecord.state, SECTOR_BOUNDARY_PREPARATION_STATE.reserved);
  assert.equal(mounted.size, 1);

  firstAdmission.resolve({ status: 'late-authored-prepared' });
  await firstRecord.settled;
  await secondRecord.settled;
  assert.equal(firstRecord.state, SECTOR_BOUNDARY_PREPARATION_STATE.disposed);
  assert.equal(secondRecord.state, SECTOR_BOUNDARY_PREPARATION_STATE.ready);
  assert.equal(mounted.size, 1);
  assert.strictEqual([...mounted][0], secondRecord.boundary);
});

test('READY supersession awaits the one retained async cleanup before replacement mount', async () => {
  const cleanup = deferred();
  const mounted = new Set();
  let disposeCount = 0;
  const { manager } = preparedManager({
    mountBoundary(record) {
      assert.equal(mounted.size, 0);
      mounted.add(record.boundary);
      record.boundary.parent = { id: 'scene' };
      record.boundary.visible = false;
    },
    async disposeBoundary(record) {
      disposeCount++;
      await cleanup.promise;
      mounted.delete(record.boundary);
      record.boundary.parent = null;
    },
  });
  const entity = reservation('ready-supersession', 1).entity;
  const first = manager.reserve({ ...reservation('ready-supersession', 1), entity });
  await first.settled;
  assert.equal(first.state, SECTOR_BOUNDARY_PREPARATION_STATE.ready);
  assert.equal(mounted.size, 1);

  const second = manager.reserve({ ...reservation('ready-supersession', 2), entity });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(disposeCount, 1);
  assert.equal(second.state, SECTOR_BOUNDARY_PREPARATION_STATE.reserved);
  assert.equal(mounted.size, 1, 'replacement cannot mount while old cleanup owns the scene slot');

  cleanup.resolve();
  await second.settled;
  assert.equal(first.state, SECTOR_BOUNDARY_PREPARATION_STATE.disposed);
  assert.equal(second.state, SECTOR_BOUNDARY_PREPARATION_STATE.ready);
  assert.equal(disposeCount, 1, 'concurrent abort/replacement paths share one cleanup promise');
  assert.equal(mounted.size, 1);
  assert.strictEqual([...mounted][0], second.boundary);
});

test('superseded generations capture presentation rollback only after prior cleanup', async () => {
  for (const firstPhase of ['PREPARING', 'READY']) {
    const firstPreparation = deferred();
    const entity = {
      id: firstPhase === 'PREPARING' ? 501 : 502,
      alive: true,
      mesh: null,
      presentationAdmission: 'original-admission',
    };
    const { manager } = preparedManager({
      captureBeforeStart(record) {
        record.presentationAdmissionBefore = record.entity.presentationAdmission;
      },
      requestPreparation(record) {
        record.entity.presentationAdmission = `pending-generation-${record.generation}`;
        if (record.generation === 1 && firstPhase === 'PREPARING') return firstPreparation.promise;
        record.boundary.prepared = true;
        return { status: 'authored-prepared' };
      },
      isPrepared(record) {
        return record.generation !== 1 || firstPhase === 'READY';
      },
      disposeBoundary(record) {
        record.boundary.parent = null;
      },
      restoreEntity(record) {
        record.entity.presentationAdmission = record.presentationAdmissionBefore;
      },
    });
    const first = manager.reserve({ ...reservation(entity.id, 1), entity });
    if (firstPhase === 'READY') await first.settled;
    else {
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(first.state, SECTOR_BOUNDARY_PREPARATION_STATE.preparing);
    }
    const second = manager.reserve({ ...reservation(entity.id, 2), entity });
    if (firstPhase === 'PREPARING') firstPreparation.resolve({ status: 'authored-prepared' });
    await second.settled;
    assert.equal(second.presentationAdmissionBefore, 'original-admission');
    assert.equal(entity.presentationAdmission, 'pending-generation-2');

    await manager.abort(second, 'injected-second-generation-abort');
    assert.equal(entity.presentationAdmission, 'original-admission');
  }
});

test('publication failure rolls back the partially bound hidden boundary exactly once', async () => {
  let disposeCount = 0;
  const { manager } = preparedManager({
    publishBoundary(record) {
      record.entity.mesh = record.boundary;
      throw new Error('injected-presentation-bind-failure');
    },
    disposeBoundary(record) {
      disposeCount++;
      record.boundary.visible = false;
      record.boundary.parent = null;
      if (record.entity.mesh === record.boundary) record.entity.mesh = null;
    },
  });
  const record = manager.reserve(reservation('publish-failure'));
  await record.settled;

  assert.equal(await manager.publish(record), false);
  assert.match(record.error.message, /injected-presentation-bind-failure/);
  assert.equal(record.state, SECTOR_BOUNDARY_PREPARATION_STATE.disposed);
  assert.equal(disposeCount, 1);
  assert.equal(record.entity.mesh, null);
  assert.equal(record.entity.restored, 1);
});

test('production publication helper rolls back bind and asteroid hooks that mutate then throw', () => {
  for (const failingHook of ['presentation', 'asteroid']) {
    const entity = { id: 77, mesh: null, view: null };
    const boundary = { visible: false };
    const meshes = new Map();
    const bindings = new Map();
    const asteroids = new Set();
    let unbindCalls = 0;
    let releaseAsteroidCalls = 0;
    const record = { id: entity.id, entity, boundary };

    assert.throws(() => publishPreparedSectorBoundary(record, {
      publishAuthoredBoundary: () => true,
      meshes,
      bindPresentationMesh: () => {
        bindings.set(entity.id, boundary);
        if (failingHook === 'presentation') throw new Error('injected partial presentation bind');
      },
      unbindPresentationMesh: (id) => { unbindCalls++; bindings.delete(id); },
      registerAsteroid: () => {
        asteroids.add(entity.id);
        if (failingHook === 'asteroid') throw new Error('injected partial asteroid bind');
      },
      releaseAsteroid: (id) => { releaseAsteroidCalls++; asteroids.delete(id); },
    }), new RegExp(`injected partial ${failingHook}`));

    assert.equal(boundary.visible, false);
    assert.equal(entity.mesh, null);
    assert.equal(entity.view, null);
    assert.equal(meshes.has(entity.id), false);
    assert.equal(bindings.has(entity.id), false);
    assert.equal(asteroids.has(entity.id), false);
    assert.equal(unbindCalls, 1);
    assert.equal(releaseAsteroidCalls, 1);
    assert.equal(record.presentationBindingAttempted, false);
    assert.equal(record.asteroidBindingAttempted, false);
  }
});

test('production publication helper rejects an explicit presentation bind refusal', () => {
  const entity = { id: 771, mesh: null, view: null };
  const boundary = { visible: false };
  const meshes = new Map();
  let unbindCalls = 0;
  let releaseAsteroidCalls = 0;
  const record = { id: entity.id, entity, boundary };

  assert.throws(() => publishPreparedSectorBoundary(record, {
    publishAuthoredBoundary: () => true,
    meshes,
    bindPresentationMesh: () => false,
    unbindPresentationMesh: () => { unbindCalls++; },
    releaseAsteroid: () => { releaseAsteroidCalls++; },
  }), /could not bind presentation ownership/);
  assert.equal(boundary.visible, false);
  assert.equal(entity.mesh, null);
  assert.equal(entity.view, null);
  assert.equal(meshes.has(entity.id), false);
  assert.equal(unbindCalls, 1);
  assert.equal(releaseAsteroidCalls, 1);
});

test('prepared cargo capsule installs an owner cleanup journal before publication', async () => {
  const entity = {
    id: 78,
    type: 'payload',
    alive: true,
    radius: 6,
    pos: { x: 0, z: 0 },
    rot: 0,
    factionId: 'faction_union',
    data: {
      payloadStableId: 'cargo_capsule_prepared',
      authoredPayloadAssetId: 'pod_cargo_container',
    },
  };
  const fallbackRoot = new THREE.Group();
  const sharedGeometry = new THREE.BoxGeometry(1, 1, 1);
  const sharedMaterial = new THREE.MeshBasicMaterial();
  sharedGeometry.userData.spacefaceSharedFallback = true;
  sharedMaterial.userData.spacefaceSharedAsset = true;
  fallbackRoot.add(new THREE.Mesh(sharedGeometry, sharedMaterial));
  const boundary = buildAuthoredCargoCapsule(entity, {
    releaseMode: true,
    fallbackRoot,
  });
  const scene = new THREE.Scene();
  scene.add(boundary);
  const fixture = cargoCapsuleFixtureRecord();
  let stagedRoot = null;
  let stagedGeometryDisposals = 0;
  let sharedGeometryDisposals = 0;
  let sharedMaterialDisposals = 0;
  sharedGeometry.addEventListener('dispose', () => { sharedGeometryDisposals++; });
  sharedMaterial.addEventListener('dispose', () => { sharedMaterialDisposals++; });

  const upgraded = await upgradeAuthoredCargoCapsuleBoundaryForProbe(
    boundary,
    fallbackRoot,
    entity,
    {},
    scene,
    {
      releaseMode: true,
      deferBoundaryPublication: true,
      loadAuthoredPart: async () => fixture,
      prepareAuthoredPipelines: async (root) => {
        stagedRoot = root;
        root.traverse((object) => {
          if (object.geometry) {
            object.geometry.addEventListener('dispose', () => { stagedGeometryDisposals++; });
          }
        });
        return { skipped: false };
      },
      prepareAuthoredGpuResidency: async () => ({ skipped: false }),
    },
  );

  assert.equal(upgraded, true);
  assert.equal(boundary.userData.authoredAssetState, 'authored-prepared');
  assert.equal(typeof boundary.userData.__disposePreparedAuthoredBoundary, 'function');
  assert.ok(stagedRoot);
  entity.mesh = boundary;
  entity.view = { root: boundary };
  const meshes = new Map([[entity.id, boundary]]);
  let renderablesAtGenericCleanup = -1;

  await disposePreparedSectorBoundary({
    id: entity.id,
    entity,
    boundary,
    presentationBindingAttempted: false,
    asteroidBindingAttempted: false,
  }, {
    meshes,
    removeBoundary: (subject) => subject.removeFromParent(),
    disposePreparedBoundary: disposePreparedAuthoredBoundary,
    disposeBoundaryObject: (subject) => {
      renderablesAtGenericCleanup = 0;
      subject.traverse((object) => {
        if (object.isMesh || object.isLine || object.isPoints) renderablesAtGenericCleanup++;
      });
      subject.clear();
    },
  });

  assert.ok(stagedGeometryDisposals > 0, 'the staged owner-local batch geometry is retired');
  assert.equal(stagedRoot.children.length, 0);
  assert.equal(renderablesAtGenericCleanup, 0,
    'the authored cleanup journal runs before ordinary boundary traversal');
  assert.equal(sharedGeometryDisposals, 0);
  assert.equal(sharedMaterialDisposals, 0);
  assert.equal(meshes.has(entity.id), false);
  assert.equal(entity.mesh, null);
  assert.equal(entity.view, null);
  fixture.primitives[0].geometry.dispose();
  fixture.primitives[0].material.dispose();
});

test('cleanup failure quarantines the id and prevents a replacement boundary mount', async () => {
  let builds = 0;
  const { manager } = preparedManager({
    buildBoundary(record) {
      builds++;
      return { id: `boundary:${record.id}:${record.generation}`, parent: null, visible: true, prepared: false };
    },
    disposeBoundary() {
      throw new Error('injected cleanup refusal');
    },
  });
  const entity = reservation(88, 1).entity;
  const first = manager.reserve({ ...reservation(88, 1), entity });
  await first.settled;
  const second = manager.reserve({ ...reservation(88, 2), entity });

  await assert.rejects(second.settled, /could not be retired safely/);
  assert.equal(builds, 1, 'the replacement never mounts beside a cleanup-blocked owner');
  assert.equal(first.state, SECTOR_BOUNDARY_PREPARATION_STATE.aborting);
  assert.equal(second.state, SECTOR_BOUNDARY_PREPARATION_STATE.aborting);
  assert.equal(second.cleanupBlocked, true);
  assert.equal(manager.has(88), true, 'the quarantined identity remains excluded from reconciliation');

  const third = manager.reserve({ ...reservation(88, 3), entity });
  await assert.rejects(third.settled, /could not be retired safely|cleanup refusal/);
  assert.equal(builds, 1, 'later generations cannot bypass the retained quarantine');
});

test('abort cleanup quarantine promotes ordinary failure before clear or fallback rotation', () => {
  const originalError = new Error('optional authored admission failed');
  const cleanupError = new Error('injected abort cleanup refusal');
  const blocked = {
    id: 89,
    state: SECTOR_BOUNDARY_PREPARATION_STATE.aborting,
    cleanupBlocked: true,
    cleanupError,
  };
  const records = new Set([blocked]);
  const promoted = promoteSectorPrewarmAbortQuarantine(
    records,
    [{ status: 'fulfilled', value: blocked }],
    originalError,
  );
  let rotations = 0;
  if (promoted?.preventSectorFallbackRotation !== true) {
    records.clear();
    rotations++;
  }

  assert.equal(promoted.code, 'SPACEFACE_SECTOR_PREWARM_CLEANUP_QUARANTINE');
  assert.equal(promoted.preventSectorFallbackRotation, true);
  assert.equal(promoted.cause, originalError);
  assert.ok(promoted instanceof AggregateError);
  assert.ok(promoted.errors.includes(cleanupError));
  assert.deepEqual([...records], [blocked], 'the cleanup-blocked owner remains quarantined');
  assert.equal(rotations, 0, 'cleanup quarantine cannot rotate fallback residency');

  const disposed = { id: 90, state: SECTOR_BOUNDARY_PREPARATION_STATE.disposed };
  const cleanFailure = new Error('ordinary optional admission failure');
  assert.strictEqual(
    promoteSectorPrewarmAbortQuarantine(
      new Set([disposed]),
      [{ status: 'fulfilled', value: disposed }],
      cleanFailure,
    ),
    cleanFailure,
    'successful abort cleanup preserves the ordinary procedural fallback policy',
  );

  const rejectedCleanup = new Error('abortRecords rejected');
  const rejected = promoteSectorPrewarmAbortQuarantine(
    new Set([disposed]),
    [{ status: 'rejected', reason: rejectedCleanup }],
    cleanFailure,
  );
  assert.equal(rejected.preventSectorFallbackRotation, true);
  assert.ok(rejected.errors.includes(rejectedCleanup),
    'a rejected abort outcome fails closed even when the record already reports disposed');
});

test('rejecting settle after context, settings, or resize invalidation never rotates residency', async () => {
  const scenarios = [
    {
      name: 'context loss',
      invalidate(current) {
        current.preparationEpoch++;
        current.contextLost = true;
      },
    },
    {
      name: 'video settings',
      invalidate(current) {
        current.preparationEpoch++;
      },
    },
    {
      name: 'render-target resize',
      invalidate(current) {
        current.preparationEpoch++;
        current.preparationSignature = 'signature:resized';
      },
    },
  ];

  for (const scenario of scenarios) {
    const candidate = {
      id: `candidate:${scenario.name}`,
      entity: { id: `candidate:${scenario.name}`, alive: true },
      fingerprint: `fingerprint:${scenario.name}`,
      state: SECTOR_BOUNDARY_PREPARATION_STATE.ready,
    };
    const record = {
      active: true,
      sectorId: 'sector_tethys',
      generation: 7,
      preparationEpoch: 11,
      contextGeneration: 3,
      preparationSignature: 'signature:original',
      promise: Promise.resolve([]),
      boundaryRevision: 1,
      boundaryRecords: new Set([candidate]),
      liveBoundaryPromises: new Map(),
    };
    const current = {
      record,
      sectorId: record.sectorId,
      generation: record.generation,
      preparationEpoch: record.preparationEpoch,
      contextGeneration: record.contextGeneration,
      preparationSignature: record.preparationSignature,
      contextLost: false,
    };
    const generationIsCurrent = () => record.active === true
      && current.record === record
      && current.generation === record.generation
      && current.preparationEpoch === record.preparationEpoch
      && current.contextGeneration === record.contextGeneration
      && current.preparationSignature === record.preparationSignature
      && current.contextLost === false;
    let publications = 0;
    let rotations = 0;

    const settled = await settleSectorPrewarmPopulationFixpoint(record, {
      isActive: generationIsCurrent,
      async settleBoundaryRecords() {
        await Promise.resolve();
        scenario.invalidate(current);
        throw new Error(`${scenario.name} invalidated a rejecting boundary settle`);
      },
      publishBoundaryRecords() {
        publications++;
      },
    }).then((value) => {
      if (value === true) rotations++;
      return value;
    });

    assert.equal(settled, false, `${scenario.name} converts the stale rejection to invalidation`);
    assert.equal(publications, 0, `${scenario.name} cannot publish the invalid generation`);
    assert.equal(rotations, 0, `${scenario.name} cannot reach the success rotation path`);

    const rawError = new Error(`${scenario.name} raw preparation rejection`);
    const cleanAbort = { id: candidate.id, state: SECTOR_BOUNDARY_PREPARATION_STATE.disposed };
    const afterCleanup = promoteSectorPrewarmAbortQuarantine(
      new Set([cleanAbort]),
      [{ status: 'fulfilled', value: cleanAbort }],
      rawError,
    );
    assert.strictEqual(afterCleanup, rawError, 'cleanup itself succeeded and is not the blocker');
    const guarded = promoteSectorPrewarmGenerationInvalidation(record, current, afterCleanup);
    if (guarded?.preventSectorFallbackRotation !== true
        && record.active === true
        && record.sectorId === current.sectorId) {
      rotations++;
    }
    assert.equal(guarded.code, 'SPACEFACE_SECTOR_PREWARM_GENERATION_INVALIDATED');
    assert.equal(guarded.preventSectorFallbackRotation, true);
    assert.equal(guarded.cause, rawError);
    assert.equal(rotations, 0, `${scenario.name} raw rejection cannot rotate after clean abort`);
  }

  const exactRecord = {
    active: true,
    sectorId: 'sector_tethys',
    generation: 9,
    preparationEpoch: 4,
    contextGeneration: 2,
    preparationSignature: 'signature:current',
  };
  const ordinaryFailure = new Error('current optional asset failure');
  assert.strictEqual(
    promoteSectorPrewarmGenerationInvalidation(exactRecord, {
      record: exactRecord,
      sectorId: exactRecord.sectorId,
      generation: exactRecord.generation,
      preparationEpoch: exactRecord.preparationEpoch,
      contextGeneration: exactRecord.contextGeneration,
      preparationSignature: exactRecord.preparationSignature,
      contextLost: false,
    }, ordinaryFailure),
    ordinaryFailure,
    'a complete current envelope preserves the established optional procedural fallback',
  );
});

test('generation invalidation preserves a simultaneous cleanup quarantine failure', async () => {
  const blocked = {
    id: 'invalidated-cleanup-blocked',
    state: SECTOR_BOUNDARY_PREPARATION_STATE.aborting,
    cleanupBlocked: true,
    cleanupError: new Error('injected invalidated cleanup refusal'),
  };
  const originalError = new Error('optional admission failed during invalidation');
  const failClosed = promoteSectorPrewarmAbortQuarantine(
    new Set([blocked]),
    [{ status: 'fulfilled', value: blocked }],
    originalError,
  );
  const record = {
    active: true,
    promise: Promise.resolve([]),
    boundaryRevision: 1,
    boundaryRecords: new Set([blocked]),
    liveBoundaryPromises: new Map(),
  };
  let generationActive = true;
  let releases = 0;
  let publications = 0;

  await assert.rejects(
    settleSectorPrewarmPopulationFixpoint(record, {
      isActive: () => generationActive,
      async settleBoundaryRecords() {
        await Promise.resolve();
        generationActive = false;
        throw failClosed;
      },
      publishBoundaryRecords() {
        publications++;
      },
    }).then((settled) => {
      if (settled === false) releases++;
      return settled;
    }),
    (error) => error === failClosed
      && error.preventSectorFallbackRotation === true
      && error.errors.includes(blocked.cleanupError),
  );
  assert.equal(releases, 0,
    'invalidation cannot convert cleanup quarantine into the ordinary generation-release result');
  assert.equal(publications, 0);
});

test('restaging prunes only successfully disposed records and retains cleanup quarantine', () => {
  const disposed = { id: 91, state: SECTOR_BOUNDARY_PREPARATION_STATE.disposed };
  const cleanupBlocked = {
    id: 92,
    state: SECTOR_BOUNDARY_PREPARATION_STATE.disposed,
    cleanupBlocked: true,
  };
  const aborting = {
    id: 93,
    state: SECTOR_BOUNDARY_PREPARATION_STATE.aborting,
    active: false,
  };
  const ready = { id: 94, state: SECTOR_BOUNDARY_PREPARATION_STATE.ready, active: true };
  const records = new Set([null, disposed, cleanupBlocked, aborting, ready]);

  assert.strictEqual(pruneSettledSectorBoundaryRecords(records), records);
  assert.deepEqual([...records], [cleanupBlocked, aborting, ready]);
});

test('stale LIVE preparation records retire only after exact same-id owner replacement', async () => {
  const boundary = new THREE.Group();
  const entity = {
    id: 925,
    alive: true,
    homeSectorId: 'sector_tethys',
    mesh: boundary,
    prewarmFingerprint: 'fingerprint:original',
  };
  const prepared = {
    id: entity.id,
    entity,
    boundary,
    fingerprint: entity.prewarmFingerprint,
    state: SECTOR_BOUNDARY_PREPARATION_STATE.ready,
  };
  const records = new Set([prepared]);
  await publishSectorBoundaryRecordSnapshot(records, {
    sectorId: 'sector_tethys',
    publishRecords(candidates) {
      for (const candidate of candidates) candidate.state = SECTOR_BOUNDARY_PREPARATION_STATE.live;
      return candidates.map(() => true);
    },
  });
  const entities = new Map([[entity.id, entity]]);
  const meshes = new Map([[entity.id, boundary]]);
  const currentOptions = () => ({
    entities,
    meshes,
    sectorId: 'sector_tethys',
    fingerprintForEntity: (candidate) => candidate?.prewarmFingerprint,
    isEligible: (candidate) => candidate?.alive !== false,
  });

  assert.equal(isLiveSectorBoundaryRecordCurrent(prepared, currentOptions()), true);
  pruneSettledSectorBoundaryRecords(records, {
    isLiveRecordCurrent: (candidate) => isLiveSectorBoundaryRecordCurrent(candidate, currentOptions()),
  });
  assert.deepEqual([...records], [prepared], 'the exact published owner remains certified');

  const replacementBoundary = new THREE.Group();
  const replacement = {
    ...entity,
    mesh: replacementBoundary,
    prewarmFingerprint: 'fingerprint:replacement',
  };
  entities.set(entity.id, replacement);
  meshes.set(entity.id, replacementBoundary);
  let pruned = 0;
  pruneSettledSectorBoundaryRecords(records, {
    isLiveRecordCurrent: (candidate) => isLiveSectorBoundaryRecordCurrent(candidate, currentOptions()),
    onPruned: () => { pruned++; },
  });
  assert.equal(pruned, 1);
  assert.equal(records.size, 0,
    'the same-id entity and boundary replacement retires the stale published evidence');

  const quarantined = { ...prepared, cleanupBlocked: true };
  records.add(quarantined);
  pruneSettledSectorBoundaryRecords(records, {
    isLiveRecordCurrent: (candidate) => isLiveSectorBoundaryRecordCurrent(candidate, currentOptions()),
  });
  assert.deepEqual([...records], [quarantined], 'cleanup quarantine is never pruned as stale evidence');
});

test('post-settle reconciliation drops a safely retired generation only after its replacement is ready', async () => {
  const { manager } = preparedManager();
  const spec = reservation(941, 1);
  const first = manager.reserve(spec);
  await first.settled;
  assert.equal(first.state, SECTOR_BOUNDARY_PREPARATION_STATE.ready);

  const replacement = manager.reserve({ ...spec, generation: 2 });
  assert.equal(first.state, SECTOR_BOUNDARY_PREPARATION_STATE.aborting,
    'the old generation remains visible to settlement while its cleanup is in flight');
  const records = new Set([first, replacement]);
  await manager.settleRecords(records);
  assert.equal(first.state, SECTOR_BOUNDARY_PREPARATION_STATE.disposed);
  assert.equal(replacement.state, SECTOR_BOUNDARY_PREPARATION_STATE.ready);

  reconcileSettledSectorBoundaryRecords(records, {
    entities: new Map([[spec.entity.id, spec.entity]]),
    sectorId: spec.sectorId,
    currentRecordForId: (id) => manager.get(id),
  });
  assert.deepEqual([...records], [replacement],
    'successful supersession does not poison the otherwise-ready sector generation');
});

test('live sector boundaries must finish exact authored admission before rotation', async () => {
  const entity = {
    id: 95,
    type: 'ship',
    alive: true,
    radius: 18,
    homeSectorId: 'sector_tethys',
    data: { defId: 'ship_wasp' },
  };
  const boundary = new THREE.Group();
  boundary.userData.authoredAssetState = 'authored';
  entity.mesh = boundary;
  const entities = new Map([[entity.id, entity]]);
  const meshes = new Map([[entity.id, boundary]]);
  const fingerprint = authoredCompositionFingerprintForEntity(entity);
  const options = {
    entities,
    meshes,
    fingerprintForEntity: authoredCompositionFingerprintForEntity,
    preparationEpoch: 4,
    contextGeneration: 7,
    preparationSignature: 'sig-a',
    contextLost: false,
  };
  const liveEntry = (overrides = {}) => ({
    id: entity.id,
    entity,
    boundary,
    sectorId: 'sector_tethys',
    fingerprint,
    preparationEpoch: 4,
    contextGeneration: 7,
    preparationSignature: 'sig-a',
    promise: Promise.resolve({ status: 'no-authored-upgrade', result: null, error: null }),
    ...overrides,
  });

  assert.equal(await settleLiveSectorBoundaryAdmissions([liveEntry()], options), true,
    'an already-authored live root may return the stable no-op receipt');

  for (const [state, receipt, message] of [
    ['cancelled-before-load', { status: 'cancelled-before-load', result: null, error: null }, /did not finish exact admission/],
    ['fallback-after-error', {
      status: 'fallback-after-error',
      result: false,
      error: new Error('injected live authored admission failure'),
    }, /injected live authored admission failure/],
  ]) {
    boundary.userData.authoredAssetState = state;
    await assert.rejects(settleLiveSectorBoundaryAdmissions([liveEntry({
      promise: Promise.resolve(receipt),
    })], options), message);
  }

  boundary.userData.authoredAssetState = 'authored';
  entity.data = { ...entity.data, appearance: { finish: 'worn', wear: 0.8 } };
  await assert.rejects(settleLiveSectorBoundaryAdmissions([liveEntry({
    promise: Promise.resolve({ status: 'authored', result: true, error: null }),
  })], options), /did not finish exact admission/);

  entity.data = { defId: 'ship_wasp' };
  const replacement = new THREE.Group();
  replacement.userData.authoredAssetState = 'authored';
  entity.mesh = replacement;
  meshes.set(entity.id, replacement);
  await assert.rejects(settleLiveSectorBoundaryAdmissions([liveEntry()], options),
    /did not finish exact admission/,
    'a settled promise for an older same-id boundary cannot certify its replacement');
  entity.mesh = boundary;
  meshes.set(entity.id, boundary);

  for (const [entryOverride, optionOverride, message] of [
    [{ preparationEpoch: 3 }, {}, 'preparation epoch drift'],
    [{ contextGeneration: 6 }, {}, 'context generation drift'],
    [{ preparationSignature: 'sig-old' }, {}, 'render-target signature drift'],
    [{}, { contextLost: true }, 'active context loss'],
  ]) {
    await assert.rejects(
      settleLiveSectorBoundaryAdmissions(
        [liveEntry(entryOverride)],
        { ...options, ...optionOverride },
      ),
      /did not finish exact admission/,
      `${message} must invalidate live authored admission`,
    );
  }

  entity.alive = false;
  assert.equal(await settleLiveSectorBoundaryAdmissions([liveEntry({
    promise: Promise.reject(new Error('expected destroyed-owner cancellation')),
  })], options), true, 'destroyed live entities leave the prewarm population without failing siblings');
});

test('sector boundary construction starts at most two records per scheduled turn', async () => {
  const turns = [];
  const buildOrder = [];
  const { manager } = preparedManager({
    startBudgetPerTurn: 2,
    scheduleNextStartTurn(callback) { turns.push(callback); },
    buildBoundary(record) {
      buildOrder.push(record.id);
      return { id: `boundary:${record.id}`, parent: null, visible: true, prepared: false };
    },
  });
  const records = Array.from({ length: 5 }, (_, index) => (
    manager.reserve(reservation(200 + index))
  ));

  assert.deepEqual(buildOrder, []);
  await Promise.resolve();
  assert.equal(turns.length, 1);
  turns.shift()();
  await Promise.resolve();
  assert.deepEqual(buildOrder, [200, 201]);
  assert.equal(turns.length, 1);
  turns.shift()();
  await Promise.resolve();
  assert.deepEqual(buildOrder, [200, 201, 202, 203]);
  assert.equal(turns.length, 1);
  turns.shift()();
  await Promise.all(records.map((record) => record.settled));
  assert.deepEqual(buildOrder, [200, 201, 202, 203, 204]);
  assert.ok(records.every((record) => record.state === SECTOR_BOUNDARY_PREPARATION_STATE.ready));
});

test('final sector population fixpoint closes late, same-size, and during-publish additions', async () => {
  const entity = (id) => ({ id, alive: true });
  const prepared = (id, state = SECTOR_BOUNDARY_PREPARATION_STATE.reserved) => ({
    id,
    entity: entity(id),
    fingerprint: `fingerprint:${id}`,
    state,
  });
  const a = prepared('A', SECTOR_BOUNDARY_PREPARATION_STATE.ready);
  const b = prepared('B');
  const c = prepared('C');
  const d = prepared('D');
  const releaseB = deferred();
  const record = {
    active: true,
    promise: Promise.resolve([]),
    boundaryRevision: 1,
    boundaryRecords: new Set([a]),
    liveBoundaryPromises: new Map(),
  };
  const published = [];
  let settled = false;
  let addedB = false;
  let replacedAWithC = false;
  let addedDuringPublish = false;

  const completion = settleSectorPrewarmPopulationFixpoint(record, {
    maxPasses: 12,
    settlePrefetch: (pending) => pending,
    async settleBoundaryRecords(snapshot) {
      if (!addedB) {
        addedB = true;
        record.boundaryRecords.add(b);
        record.boundaryRevision++;
      }
      for (const candidate of snapshot) {
        if (candidate.state === SECTOR_BOUNDARY_PREPARATION_STATE.live
            || candidate.state === SECTOR_BOUNDARY_PREPARATION_STATE.ready) continue;
        if (candidate === b) await releaseB.promise;
        candidate.state = SECTOR_BOUNDARY_PREPARATION_STATE.ready;
      }
    },
    refreshPopulation(_record, { phase }) {
      if (phase === 'after-settle'
          && b.state === SECTOR_BOUNDARY_PREPARATION_STATE.ready
          && !replacedAWithC) {
        replacedAWithC = true;
        record.boundaryRecords.delete(a);
        record.boundaryRecords.add(c);
        record.boundaryRevision++;
      }
    },
    async publishBoundaryRecords(snapshot) {
      await publishSectorBoundaryRecordSnapshot(snapshot, {
        sectorId: 'sector_tethys',
        async publishRecords(candidates) {
          for (const candidate of candidates) {
            published.push(candidate.id);
            candidate.state = SECTOR_BOUNDARY_PREPARATION_STATE.live;
          }
          return candidates.map(() => true);
        },
      });
      if (!addedDuringPublish) {
        addedDuringPublish = true;
        record.boundaryRecords.add(d);
        record.boundaryRevision++;
      }
    },
    validatePopulation() {
      assert.ok([...record.boundaryRecords].every((candidate) => (
        candidate.state === SECTOR_BOUNDARY_PREPARATION_STATE.live
      )));
    },
  }).then((value) => {
    settled = true;
    return value;
  });

  await Promise.resolve();
  await Promise.resolve();
  assert.equal(settled, false, 'late B blocks the final generation while its admission is pending');
  assert.deepEqual(published, [], 'nothing publishes from a population that changed during settle');

  releaseB.resolve();
  assert.equal(await completion, true);
  assert.deepEqual([...record.boundaryRecords].map(({ id }) => id).sort(), ['B', 'C', 'D']);
  assert.deepEqual(published.sort(), ['B', 'C', 'D']);
  assert.equal(published.includes('A'), false, 'equal-cardinality A -> C churn invalidates A before publish');
  assert.ok([...record.boundaryRecords].every((candidate) => (
    candidate.state === SECTOR_BOUNDARY_PREPARATION_STATE.live
  )));
});

test('post-warm certification blocks late census growth and renderer invalidation before rotation', async () => {
  const boundary = new THREE.Group();
  const entityA = {
    id: 'certified:A',
    alive: true,
    homeSectorId: 'sector_tethys',
    mesh: boundary,
    prewarmEligible: true,
    prewarmFingerprint: 'fingerprint:A',
  };
  const preparedA = {
    id: entityA.id,
    entity: entityA,
    boundary,
    fingerprint: entityA.prewarmFingerprint,
    state: SECTOR_BOUNDARY_PREPARATION_STATE.ready,
  };
  const record = {
    active: true,
    sectorId: 'sector_tethys',
    generation: 12,
    preparationEpoch: 6,
    contextGeneration: 4,
    preparationSignature: 'signature:certified',
    promise: Promise.resolve([]),
    boundaryRevision: 1,
    boundaryRecords: new Set([preparedA]),
    liveBoundaryPromises: new Map(),
  };
  const entities = new Map([[entityA.id, entityA]]);
  const entityList = [entityA];
  const meshes = new Map([[entityA.id, boundary]]);
  const current = {
    record,
    sectorId: record.sectorId,
    generation: record.generation,
    preparationEpoch: record.preparationEpoch,
    contextGeneration: record.contextGeneration,
    preparationSignature: record.preparationSignature,
    contextLost: false,
  };
  const coverageOptions = () => ({
    entities,
    entityList,
    meshes,
    sectorId: record.sectorId,
    preparationEpoch: current.preparationEpoch,
    contextGeneration: current.contextGeneration,
    preparationSignature: current.preparationSignature,
    contextLost: current.contextLost,
    fingerprintForEntity: (entity) => entity?.prewarmFingerprint,
    isEligible: (entity) => entity?.prewarmEligible === true && entity.alive !== false,
  });
  const certificationCurrent = () => sectorPrewarmCertificationIsCurrent(
    record,
    record.certification,
    {
      ...current,
      validatePopulation: () => validateSectorPrewarmPopulationCoverage(record, coverageOptions()),
    },
  );

  assert.equal(await settleSectorPrewarmPopulationFixpoint(record, {
    publishBoundaryRecords: (snapshot) => publishSectorBoundaryRecordSnapshot(snapshot, {
      sectorId: record.sectorId,
      publishRecords(candidates) {
        for (const candidate of candidates) candidate.state = SECTOR_BOUNDARY_PREPARATION_STATE.live;
        return candidates.map(() => true);
      },
    }),
    validatePopulation: () => validateSectorPrewarmPopulationCoverage(record, coverageOptions()),
    certifyPopulation: (currentRecord, snapshot) => {
      validateSectorPrewarmPopulationCoverage(currentRecord, coverageOptions());
      return createSectorPrewarmCertification(currentRecord, snapshot, current);
    },
  }), true);
  assert.equal(certificationCurrent(), true, 'the exact post-warm population is synchronously certified');

  let rotations = 0;
  const entityB = {
    id: 'certified:B',
    alive: true,
    homeSectorId: 'sector_tethys',
    mesh: new THREE.Group(),
    prewarmEligible: true,
    prewarmFingerprint: 'fingerprint:B',
  };
  entities.set(entityB.id, entityB);
  entityList.push(entityB);
  meshes.set(entityB.id, entityB.mesh);
  if (certificationCurrent()) rotations++;
  assert.equal(rotations, 0,
    'a synchronous post-warm/pre-rotate spawn invalidates the authoritative census without a revision event');

  entities.delete(entityB.id);
  entityList.pop();
  meshes.delete(entityB.id);
  assert.equal(certificationCurrent(), true, 'removing the unadmitted late census member restores the exact token');
  current.preparationEpoch++;
  if (certificationCurrent()) rotations++;
  assert.equal(rotations, 0, 'late settings/resize generation drift invalidates the token before rotation');
  current.preparationEpoch--;

  const stagedLate = {
    id: 'certified:C',
    entity: { id: 'certified:C', alive: true },
    fingerprint: 'fingerprint:C',
    state: SECTOR_BOUNDARY_PREPARATION_STATE.reserved,
  };
  record.boundaryRecords.add(stagedLate);
  record.boundaryRevision++;
  if (certificationCurrent()) rotations++;
  assert.equal(rotations, 0, 'late staged membership and revision cannot reuse the older certification');
});

test('sector population livelock exhausts deterministically without publication or rotation', async () => {
  let current = {
    id: 'churn:0',
    entity: { id: 'churn:0', alive: true },
    fingerprint: 'churn:0',
    state: SECTOR_BOUNDARY_PREPARATION_STATE.ready,
  };
  const record = {
    active: true,
    promise: Promise.resolve([]),
    boundaryRevision: 0,
    boundaryRecords: new Set([current]),
    liveBoundaryPromises: new Map(),
  };
  let publications = 0;
  let rotations = 0;
  let revision = 0;

  await assert.rejects(
    settleSectorPrewarmPopulationFixpoint(record, {
      maxPasses: 3,
      refreshPopulation(_record, { phase }) {
        if (phase !== 'after-settle') return;
        revision++;
        current = {
          id: `churn:${revision}`,
          entity: { id: `churn:${revision}`, alive: true },
          fingerprint: `churn:${revision}`,
          state: SECTOR_BOUNDARY_PREPARATION_STATE.ready,
        };
        record.boundaryRecords = new Set([current]);
        record.boundaryRevision++;
      },
      settleBoundaryRecords() {},
      publishBoundaryRecords() { publications++; },
    }).then(() => { rotations++; }),
    (error) => error?.code === 'SPACEFACE_SECTOR_PREWARM_FIXPOINT_EXHAUSTED'
      && error.preventSectorFallbackRotation === true,
  );
  assert.equal(publications, 0);
  assert.equal(rotations, 0);
});

test('renderer-generation invalidation at every final await boundary prevents rotation', async () => {
  for (const invalidationPhase of ['after-settle', 'after-publish', 'validation']) {
    const candidate = {
      id: `generation:${invalidationPhase}`,
      entity: { id: `generation:${invalidationPhase}`, alive: true },
      fingerprint: `fingerprint:${invalidationPhase}`,
      state: SECTOR_BOUNDARY_PREPARATION_STATE.ready,
    };
    const record = {
      active: true,
      promise: Promise.resolve([]),
      boundaryRevision: 1,
      boundaryRecords: new Set([candidate]),
      liveBoundaryPromises: new Map(),
    };
    let generationActive = true;
    let publications = 0;
    let rotations = 0;

    const settled = await settleSectorPrewarmPopulationFixpoint(record, {
      isActive: () => generationActive,
      settleBoundaryRecords() {},
      async refreshPopulation(_record, { phase }) {
        if (phase !== invalidationPhase) return;
        await Promise.resolve();
        generationActive = false;
      },
      async publishBoundaryRecords(snapshot) {
        await publishSectorBoundaryRecordSnapshot(snapshot, {
          sectorId: 'sector_tethys',
          async publishRecords(candidates) {
            publications += candidates.length;
            for (const published of candidates) {
              published.state = SECTOR_BOUNDARY_PREPARATION_STATE.live;
            }
            return candidates.map(() => true);
          },
        });
      },
      async validatePopulation() {
        if (invalidationPhase !== 'validation') return;
        await Promise.resolve();
        generationActive = false;
      },
    }).then((value) => {
      if (value === true) rotations++;
      return value;
    });

    assert.equal(settled, false, `${invalidationPhase} cannot certify an obsolete generation`);
    assert.equal(rotations, 0, `${invalidationPhase} never reaches residency rotation`);
    assert.equal(
      publications,
      invalidationPhase === 'after-settle' ? 0 : 1,
      `${invalidationPhase} stops at the earliest causally reachable boundary`,
    );
  }
});

test('authored composition fingerprint binds every station, geology, and material selector', () => {
  const base = {
    id: 301,
    type: 'station',
    alive: true,
    radius: 20,
    data: {
      placeId: 'place_station_trade_hub',
      assetId: 'place_station_trade_hub',
      visualRadius: 72,
      dockRadius: 68,
      stationRadius: 64,
      typeId: 'ast_common_rock',
      tint: '#778899',
      paletteClass: 'belt',
      appearance: { hullColor: '#ffffff', accentColor: '#112233' },
    },
  };
  const baseline = authoredCompositionFingerprintForEntity(base);
  for (const [field, value] of [
    ['assetId', 'place_claim_outpost_base'],
    ['visualRadius', 73],
    ['dockRadius', 69],
    ['stationRadius', 65],
    ['typeId', 'ast_crystal'],
    ['tint', '#998877'],
    ['paletteClass', 'anomaly'],
  ]) {
    const changed = { ...base, data: { ...base.data, [field]: value } };
    assert.notEqual(authoredCompositionFingerprintForEntity(changed), baseline, `${field} is bound`);
  }
  const changedAppearance = {
    ...base,
    data: { ...base.data, appearance: { ...base.data.appearance, accentColor: '#445566' } },
  };
  assert.notEqual(authoredCompositionFingerprintForEntity(changedAppearance), baseline);
});

test('authored boundary signature binds context, target dimensions, and video settings', () => {
  const renderer = {
    domElement: { width: 1600, height: 900 },
    outputColorSpace: 'srgb',
    toneMapping: 4,
    shadowMap: { enabled: true },
    getPixelRatio: () => 1.25,
  };
  const state = { settings: { video: { bloom: true, shadows: true } } };
  const baseline = authoredBoundaryPreparationSignature(renderer, state, 7);

  assert.equal(authoredBoundaryPreparationSignature(renderer, state, 7), baseline);
  assert.notEqual(authoredBoundaryPreparationSignature(renderer, state, 8), baseline);
  renderer.domElement.width = 1440;
  assert.notEqual(authoredBoundaryPreparationSignature(renderer, state, 7), baseline);
  renderer.domElement.width = 1600;
  state.settings.video.bloom = false;
  assert.notEqual(authoredBoundaryPreparationSignature(renderer, state, 7), baseline);
});

test('in-flight keyed authored work settles before its replacement enters the serial lane', async () => {
  const scene = new THREE.Scene();
  const firstBoundary = new THREE.Group();
  const secondBoundary = new THREE.Group();
  scene.add(firstBoundary, secondBoundary);
  const firstEntity = { id: 'same-authored-identity', alive: true, mesh: firstBoundary };
  const secondEntity = { id: 'same-authored-identity', alive: true, mesh: secondBoundary };
  const firstStarted = deferred();
  const releaseFirst = deferred();
  const order = [];

  const firstCompletion = enqueueBoundaryUpgrade(scene, {
    key: 'same-authored-identity',
    boundary: firstBoundary,
    entity: firstEntity,
    run: async () => {
      order.push('first-start');
      firstStarted.resolve();
      await releaseFirst.promise;
      order.push('first-finish');
      return 'first-result';
    },
  });
  await firstStarted.promise;
  scene.remove(firstBoundary);

  let firstSettled = false;
  firstCompletion.then(() => { firstSettled = true; });
  const secondCompletion = enqueueBoundaryUpgrade(scene, {
    key: 'same-authored-identity',
    boundary: secondBoundary,
    entity: secondEntity,
    run: async () => {
      order.push('second-start');
      return 'second-result';
    },
  });
  await Promise.resolve();
  assert.equal(firstSettled, false, 'supersession cannot settle an admitted job before its work ends');
  assert.deepEqual(order, ['first-start']);

  releaseFirst.resolve();
  const firstReceipt = await firstCompletion;
  const secondReceipt = await secondCompletion;
  assert.equal(firstReceipt.result, 'first-result');
  assert.equal(secondReceipt.result, 'second-result');
  assert.deepEqual(order, ['first-start', 'first-finish', 'second-start']);
  scene.remove(secondBoundary);
});
