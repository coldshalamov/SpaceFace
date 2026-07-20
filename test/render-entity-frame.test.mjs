import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  beginRenderEntityFrame,
  classifyRenderEntity,
  createRenderEntityFrame,
  endRenderEntityFrame,
} from '../src/render/renderEntityFrame.js';
import {
  clearAsteroidInstancePool,
  createAsteroidInstancePool,
  disposeAsteroidInstancePool,
  invalidateAsteroidInstancePool,
  registerAsteroidBaseLeaf,
  releaseAsteroidInstancesForEntity,
  resolveAsteroidInstanceEntityId,
  syncAsteroidInstancePool,
} from '../src/render/asteroidInstancePool.js';
import * as partsLibrary from '../src/render/partsLibrary.js';

function meshFor(entity, { shadow = false, authored = false, asteroid = false } = {}) {
  const root = new THREE.Group();
  root.userData.hasContactShadow = shadow;
  if (authored) root.userData.authoredAssetState = 'ready';
  if (asteroid) root.userData.asteroidInstanceBody = new THREE.Object3D();
  root.position.set(entity.id * 3, 0, -entity.id * 2);
  return root;
}

function createAsteroidHarness(entries) {
  const scene = new THREE.Scene();
  const pool = createAsteroidInstancePool(scene);
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const material = new THREE.MeshStandardMaterial();
  const asteroids = entries.map(({ id, x = 0, y = 0, z = 0, variant = 0 }) => {
    const entity = { id, alive: true, type: 'asteroid' };
    const root = new THREE.Group();
    root.position.set(x, y, z);
    const leaf = new THREE.Mesh(geometry, material);
    leaf.userData.asteroidInstanceTypeId = 'ast_common_rock';
    leaf.userData.asteroidInstanceVariant = variant;
    root.userData.asteroidInstanceBody = leaf;
    root.add(leaf);
    scene.add(root);
    assert.equal(registerAsteroidBaseLeaf(pool, entity, root), true);
    return { entity, root, leaf };
  });
  return { scene, pool, geometry, material, asteroids };
}

function classifyAsteroids(frame, asteroids, viewCulled = false) {
  beginRenderEntityFrame(frame);
  for (const { entity, root } of asteroids) {
    classifyRenderEntity(frame, entity, root, { viewCulled });
  }
  return endRenderEntityFrame(frame);
}

function disposeAsteroidHarness(harness) {
  disposeAsteroidInstancePool(harness.pool);
  harness.geometry.dispose();
  harness.material.dispose();
}

test('one traversal retains records, reclaims membership, and detects visibility and LOD changes', () => {
  const frame = createRenderEntityFrame();
  const ship = { id: 1, alive: true, type: 'ship', shield: 50 };
  const station = { id: 2, alive: true, type: 'station' };
  const asteroid = { id: 3, alive: true, type: 'asteroid' };
  const shipMesh = meshFor(ship, { shadow: true, authored: true });
  const stationMesh = meshFor(station, { shadow: true });
  const asteroidMesh = meshFor(asteroid, { asteroid: true });
  shipMesh.userData.lod = { level: 'lod0' };

  beginRenderEntityFrame(frame);
  const shipRecord = classifyRenderEntity(frame, ship, shipMesh, { viewCulled: false });
  const stationRecord = classifyRenderEntity(frame, station, stationMesh, { viewCulled: false });
  const asteroidRecord = classifyRenderEntity(frame, asteroid, asteroidMesh, { viewCulled: false });
  endRenderEntityFrame(frame);

  assert.equal(frame.traversals, 1);
  assert.equal(frame.entitiesVisited, 3);
  assert.deepEqual(frame.contactShadows, [shipRecord, stationRecord]);
  assert.deepEqual(frame.shipAux, [shipRecord]);
  assert.deepEqual(frame.authored, [shipRecord]);
  assert.deepEqual(frame.asteroids, [asteroidRecord]);
  assert.equal(shipRecord.transformDirty, true);

  beginRenderEntityFrame(frame);
  const reusedShip = classifyRenderEntity(frame, ship, shipMesh, { viewCulled: false });
  classifyRenderEntity(frame, asteroid, asteroidMesh, { viewCulled: false });
  endRenderEntityFrame(frame);
  assert.equal(reusedShip, shipRecord, 'records mutate in place instead of allocating per frame');
  assert.equal(reusedShip.renderDirty, false);
  assert.equal(frame.byId.has(station.id), false, 'records for removed meshes are reclaimed');

  shipMesh.userData.lod.level = 'lod1';
  beginRenderEntityFrame(frame);
  const lodShip = classifyRenderEntity(frame, ship, shipMesh, { viewCulled: false });
  endRenderEntityFrame(frame);
  assert.equal(lodShip.transformDirty, false);
  assert.equal(lodShip.detailDirty, true, 'LOD-only changes dirty authored instance visibility');
  assert.equal(lodShip.renderDirty, true);

  shipMesh.visible = false;
  beginRenderEntityFrame(frame);
  const hiddenShip = classifyRenderEntity(frame, ship, shipMesh, { viewCulled: false });
  endRenderEntityFrame(frame);
  assert.equal(hiddenShip.visibilityDirty, true);
  assert.deepEqual(frame.authored, [], 'hidden owners leave the authored frame set for cleanup');
});

test('authored instance pools consume bounded frame records, clean omissions, and retain fallback sync', () => {
  assert.equal(typeof partsLibrary.runAuthoredInstanceFrameContractProbe, 'function',
    'parts library exposes a real-object contract probe for the retained frame path');
  const result = partsLibrary.runAuthoredInstanceFrameContractProbe();

  assert.deepEqual(result.pipeline, {
    subjects: 1,
    usesInstancing: true,
    sharesGeometry: true,
    sharesMaterial: true,
    livePoolRetainedInScene: true,
  }, 'pipeline admission uses the exact pooled instancing program without reparenting the live mesh');
  assert.equal(result.first.frameBounded, true);
  assert.equal(result.first.ownersVisited, 1);
  assert.equal(result.first.slotsVisited, 1);
  assert.equal(result.first.submittedInstanceSlots, 1);
  assert.equal(result.stable.frameBounded, true);
  assert.equal(result.stable.ownersVisited, 0, 'stable frame records avoid owner work');
  assert.equal(result.stable.slotsVisited, 0, 'stable frame records avoid a pooled-slot rescan');
  assert.equal(result.stableVersion, result.firstVersion, 'stable frame performs no GPU upload');
  assert.equal(result.damageHidden.ownersVisited, 1,
    'explicit damage visibility dirtiness overrides an otherwise stable owner record');
  assert.equal(result.damageHidden.submittedInstanceSlots, 0,
    'a stationary owner cannot retain a pooled secondary after damage hides its proxy');
  assert.ok(result.damageVersion > result.stableVersion);
  assert.equal(result.replaced.submittedInstanceSlots, 1);
  assert.equal(result.replaced.ownersVisited, 2, 'new owner sync and omitted-owner cleanup are both bounded');
  assert.ok(result.replacedVersion > result.stableVersion);
  assert.equal(result.cleaned.submittedInstanceSlots, 0);
  assert.equal(result.fallback.frameBounded, false);
  assert.equal(result.fallback.submittedInstanceSlots, 2, 'missing frame data preserves the full-scan probe path');
  assert.equal(result.afterRelease.pooledInstanceSlots, 1);
  assert.equal(result.afterRelease.submittedInstanceSlots, 1, 'removed owner leaves no ghost instance');
});

test('authored ships instance merged composition batches instead of individual primitives', () => {
  assert.equal(typeof partsLibrary.runAuthoredStaticBatchPoolContractProbe, 'function');
  const result = partsLibrary.runAuthoredStaticBatchPoolContractProbe();

  assert.equal(result.pools, 1, 'identical opaque compositions share one merged geometry pool');
  assert.equal(result.chunks, 1, 'two matching compositions fit in one draw chunk');
  assert.equal(result.proxies, 2, 'each owner retains one transform and visibility proxy');
  assert.equal(result.localMeshes, 0, 'pooled opaque batches do not leave duplicate local draw meshes');
  assert.equal(result.pooledInstanceSlots, 2);
  assert.equal(result.submittedInstanceSlots, 2);
  assert.equal(result.poolGeometryIsDerived, true);
  assert.equal(result.pipelineSubjects, 1);
  assert.equal(result.pipelineUsesExactGeometry, true,
    'pipeline admission compiles the retained merged geometry used by the live pool');
  assert.equal(result.pipelineUsesExactMaterial, true);
  assert.equal(result.afterFirstRelease.pooledInstanceSlots, 1);
  assert.equal(result.afterFirstRelease.submittedInstanceSlots, 1,
    'releasing one composition removes its slot without disturbing the shared batch');
  assert.equal(result.afterFinalRelease.pooledInstanceSlots, 0);
  assert.equal(result.finalPools, 0, 'the final owner retires the empty pool state');
  assert.equal(result.finalPoolMeshes, 0, 'the final owner removes its empty InstancedMesh from the scene');
  assert.equal(result.disposalsBeforeAdmissionClear, 0,
    'an in-flight pipeline subject retains derived geometry after the final live owner leaves');
  assert.equal(result.derivedGeometryDisposals, 1, 'the final owner releases the derived merged geometry');
  assert.deepEqual(result.churn, {
    iterations: 6,
    peakPools: 1,
    peakPoolMeshes: 1,
    derivedGeometryDisposals: 6,
    finalPools: 0,
    finalPoolMeshes: 0,
  }, 'repeated composition churn leaves no pool state, scene nodes, or derived geometry resident');
});

test('asteroid pool reuses a static matrix and uploads real instance data after transform and rebase', () => {
  const harness = createAsteroidHarness([{ id: 7 }]);
  const [{ entity, root }] = harness.asteroids;
  const frame = createRenderEntityFrame();
  classifyAsteroids(frame, harness.asteroids);

  const bucket = harness.pool.variants[0];
  const beforeVersion = bucket.mesh.instanceMatrix.version;
  const warm = syncAsteroidInstancePool(harness.pool, { records: frame.asteroids });
  const warmVersion = bucket.mesh.instanceMatrix.version;
  assert.ok(warm.matrixEvaluations > 0);
  assert.ok(warm.matrixUploads > 0);
  assert.ok(warmVersion > beforeVersion, 'Three.js instanceMatrix version records the upload');

  classifyAsteroids(frame, harness.asteroids);
  const stable = syncAsteroidInstancePool(harness.pool, { records: frame.asteroids });
  assert.equal(stable.matrixEvaluations, 0);
  assert.equal(stable.matrixUploads, 0);
  assert.equal(bucket.mesh.instanceMatrix.version, warmVersion);

  root.position.x = 12.5;
  classifyAsteroids(frame, harness.asteroids);
  const moved = syncAsteroidInstancePool(harness.pool, { records: frame.asteroids });
  const movedVersion = bucket.mesh.instanceMatrix.version;
  assert.ok(moved.matrixEvaluations > 0);
  assert.ok(moved.matrixUploads > 0);
  assert.ok(movedVersion > warmVersion);

  classifyAsteroids(frame, harness.asteroids);
  root.position.x -= 4096; // floating-origin rebase lands after classification in the renderer path
  invalidateAsteroidInstancePool(harness.pool);
  const rebased = syncAsteroidInstancePool(harness.pool, { records: frame.asteroids });
  assert.ok(rebased.matrixEvaluations > 0);
  assert.ok(bucket.mesh.instanceMatrix.version > movedVersion, 'explicit rebase invalidation uploads the new local matrix');
  assert.equal(resolveAsteroidInstanceEntityId(harness.pool, bucket.mesh, 0), entity.id);

  disposeAsteroidHarness(harness);
});

test('asteroid visibility and normal-shadow camera union preserve only relevant exact bodies', () => {
  const harness = createAsteroidHarness([
    { id: 11, x: 0, z: 0 },
    { id: 12, x: 200, z: 0 },
  ]);
  const frame = createRenderEntityFrame();
  classifyAsteroids(frame, harness.asteroids, true);

  const viewCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  viewCamera.position.set(0, 0, 20);
  viewCamera.lookAt(0, 0, 0);
  const viewOnly = syncAsteroidInstancePool(harness.pool, {
    camera: viewCamera,
    records: frame.asteroids,
  });
  assert.equal(viewOnly.submitted, 1, 'normal camera ignores coarse cull flags and keeps its exact body');

  const shadowCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
  shadowCamera.position.set(200, 0, 20);
  shadowCamera.lookAt(200, 0, 0);
  const viewAndShadow = syncAsteroidInstancePool(harness.pool, {
    camera: viewCamera,
    shadowCamera,
    records: frame.asteroids,
  });
  assert.equal(viewAndShadow.submitted, 2, 'shadow-only caster joins the normal-camera submission union');

  harness.asteroids[0].root.visible = false;
  classifyAsteroids(frame, harness.asteroids, false);
  const hidden = syncAsteroidInstancePool(harness.pool, { records: frame.asteroids });
  assert.equal(hidden.submitted, 1, 'hidden owner is removed without disturbing the other instance');

  disposeAsteroidHarness(harness);
});

test('asteroid static reuse invalidates for parented camera motion and detached owners', () => {
  const harness = createAsteroidHarness([{ id: 18 }]);
  const frame = createRenderEntityFrame();
  classifyAsteroids(frame, harness.asteroids);

  const cameraRig = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 20);
  camera.lookAt(0, 0, 0);
  cameraRig.add(camera);
  harness.scene.add(cameraRig);
  assert.equal(syncAsteroidInstancePool(harness.pool, {
    camera,
    records: frame.asteroids,
  }).submitted, 1);

  classifyAsteroids(frame, harness.asteroids);
  cameraRig.position.x = 200;
  const parentMoved = syncAsteroidInstancePool(harness.pool, {
    camera,
    records: frame.asteroids,
  });
  assert.equal(parentMoved.submitted, 0, 'camera world motion invalidates reuse even when local pose is stable');
  assert.ok(parentMoved.matrixEvaluations >= 0);

  cameraRig.position.x = 0;
  assert.equal(syncAsteroidInstancePool(harness.pool, {
    camera,
    records: frame.asteroids,
  }).submitted, 1);
  classifyAsteroids(frame, harness.asteroids);
  harness.scene.remove(harness.asteroids[0].root);
  const detached = syncAsteroidInstancePool(harness.pool, {
    camera,
    records: frame.asteroids,
  });
  assert.equal(detached.submitted, 0, 'detached owners cannot survive a retained-frame reuse');

  disposeAsteroidHarness(harness);
});

test('asteroid membership, release, and LOD detail visibility keep source ownership exact', () => {
  const harness = createAsteroidHarness([
    { id: 21, x: -2 },
    { id: 22, x: 2 },
  ]);
  const detail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), harness.material);
  harness.asteroids[0].root.add(detail);
  detail.visible = false; // representative LOD2 detail state; the pool owns only the base leaf
  const frame = createRenderEntityFrame();
  classifyAsteroids(frame, harness.asteroids);
  const first = syncAsteroidInstancePool(harness.pool, { records: frame.asteroids });
  assert.equal(first.registered, 2);
  assert.equal(first.submitted, 2);
  assert.equal(detail.visible, false, 'base-body instancing does not overwrite LOD-controlled detail');

  const released = harness.asteroids[0];
  assert.equal(releaseAsteroidInstancesForEntity(harness.pool, released.entity.id), true);
  assert.equal(released.leaf.visible, true, 'release restores the exact borrowed source mesh');
  assert.equal(released.leaf.userData.asteroidInstanceAdopted, false);
  const afterRelease = syncAsteroidInstancePool(harness.pool, { records: frame.asteroids });
  assert.equal(afterRelease.registered, 1);
  assert.equal(afterRelease.submitted, 1);

  clearAsteroidInstancePool(harness.pool);
  assert.equal(harness.asteroids[1].leaf.visible, true);
  assert.equal(harness.pool.variants[0].mesh.count, 0);
  detail.geometry.dispose();
  disposeAsteroidHarness(harness);
});
