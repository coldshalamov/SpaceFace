// Quality-preserving common-rock submission pool.
//
// The procedural asteroid builder still owns the exact geometry, PBR material, scale, rotation,
// shadows, entity root, and all valuable-ore detail children. This pool only replaces separate
// opaque base-body submissions for untinted common rocks with five compact InstancedMesh draws.
// Renderer view culling is applied before compaction, avoiding sector-wide always-visible batches.
import * as THREE from 'three';
import { stampOpeningSubmissionPackage } from './openingSubmissionPlan.js';
import {
  assertDynamicBufferOwnerWritable,
  commitDynamicBufferOwner,
  markDynamicBufferItems,
  registerDynamicBufferOwner,
  releaseDynamicBufferOwner,
} from './dynamicBufferRanges.js';

export const ASTEROID_INSTANCE_TYPE_ID = 'ast_common_rock';
export const ASTEROID_INSTANCE_VARIANT_COUNT = 5;
const INITIAL_CAPACITY = 64;
const _viewProjection = new THREE.Matrix4();
const _shadowProjection = new THREE.Matrix4();
const _viewFrustum = new THREE.Frustum();
const _shadowFrustum = new THREE.Frustum();
const _worldSphere = new THREE.Sphere();

function createVariantStats(variant) {
  return { variant, registered: 0, submitted: 0, capacity: 0, uploads: 0, reuses: 0 };
}

export function createAsteroidInstancePool(scene, options = {}) {
  const variants = new Array(ASTEROID_INSTANCE_VARIANT_COUNT);
  const variantStats = new Array(ASTEROID_INSTANCE_VARIANT_COUNT);
  for (let variant = 0; variant < ASTEROID_INSTANCE_VARIANT_COUNT; variant++) {
    variants[variant] = {
      variant,
      geometry: null,
      material: null,
      mesh: null,
      dynamicBufferOwner: null,
      capacity: 0,
      records: [],
      entityIds: [],
    };
    variantStats[variant] = createVariantStats(variant);
  }
  const pool = {
    scene,
    // A freshly created variant InstancedMesh carries a never-compiled instanced program. The
    // renderer's hook routes it through the admission latch so its first live draw is not a
    // synchronous link inside a presented pass.
    onMeshCreated: typeof options.onMeshCreated === 'function' ? options.onMeshCreated : null,
    variants,
    byEntity: new Map(),
    stats: {
      registered: 0,
      submitted: 0,
      visibleBatches: 0,
      matrixUploads: 0,
      matrixReuses: 0,
      matrixEvaluations: 0,
      variants: variantStats,
    },
    dirty: true,
    disposed: false,
    cameraState: {
      view: createCameraState(),
      shadow: createCameraState(),
    },
  };
  pool.dispose = () => disposeAsteroidInstancePool(pool);
  return pool;
}

export function collectAsteroidInstancePoolRoots(pool) {
  if (!pool || pool.disposed || !Array.isArray(pool.variants)) return [];
  return pool.variants
    .map((bucket) => bucket && bucket.mesh)
    .filter((mesh) => mesh && mesh.visible !== false && mesh.count > 0);
}

export function registerAsteroidBaseLeaf(pool, entity, ownerRoot) {
  if (!pool || pool.disposed || !entity || !ownerRoot || entity.type !== 'asteroid') return false;
  if (pool.byEntity.has(entity.id)) return true;
  const leaf = ownerRoot.userData && ownerRoot.userData.asteroidInstanceBody;
  const info = leaf && leaf.userData;
  if (!leaf || !info || info.asteroidInstanceTypeId !== ASTEROID_INSTANCE_TYPE_ID) return false;
  const variant = info.asteroidInstanceVariant | 0;
  if (variant < 0 || variant >= ASTEROID_INSTANCE_VARIANT_COUNT) return false;
  if (!leaf.geometry || !leaf.material || Array.isArray(leaf.material) || leaf.material.transparent) return false;

  const bucket = pool.variants[variant];
  if (bucket.geometry && (bucket.geometry !== leaf.geometry || bucket.material !== leaf.material)) return false;
  bucket.geometry = leaf.geometry;
  bucket.material = leaf.material;
  ensureCapacity(pool, bucket, bucket.records.length + 1);
  if (!bucket.mesh) return false;

  const record = { entityId: entity.id, ownerRoot, leaf };
  bucket.records.push(record);
  pool.byEntity.set(entity.id, { bucket, record });
  pool.dirty = true;
  leaf.visible = false;
  leaf.userData.asteroidInstanceAdopted = true;
  return true;
}

export function isBorrowedAsteroidInstanceResource(object) {
  const userData = object && object.userData;
  return !!(userData && (
    userData.borrowedGeometryMaterial
    || userData.asteroidInstancePool
    || userData.asteroidInstanceTypeId
    || userData.asteroidInstanceAdopted
  ));
}

export function releaseAsteroidInstancesForEntity(pool, entityId) {
  const owned = pool && !pool.disposed && pool.byEntity.get(entityId);
  if (!owned) return false;
  const { bucket, record } = owned;
  const index = bucket.records.indexOf(record);
  if (index >= 0) bucket.records.splice(index, 1);
  if (record.leaf) {
    record.leaf.visible = true;
    if (record.leaf.userData) record.leaf.userData.asteroidInstanceAdopted = false;
  }
  pool.byEntity.delete(entityId);
  pool.dirty = true;
  return true;
}

export function invalidateAsteroidInstancePool(pool) {
  if (pool && !pool.disposed) pool.dirty = true;
}

/**
 * Pre-size variant buckets so later registrations never trigger a capacity rebuild — a rebuild
 * allocates a fresh instanceMatrix buffer (a bufferData a fight would otherwise pay mid-round).
 * Buckets with no registered leaf keep no mesh and are untouched: a variant with zero live rocks
 * still lazily creates its chunk on the first registration, which is the only legal path to one.
 * @param {object} pool
 * @param {Array<number>} requiredByVariant - total records each variant may ever hold
 */
export function reserveAsteroidInstanceCapacity(pool, requiredByVariant) {
  if (!pool || pool.disposed || !Array.isArray(requiredByVariant)) return false;
  let reserved = false;
  for (let variant = 0; variant < pool.variants.length; variant++) {
    const required = Math.max(0, Math.trunc(Number(requiredByVariant[variant]) || 0));
    if (required <= 0) continue;
    const bucket = pool.variants[variant];
    if (!bucket || !bucket.mesh) continue;
    if (bucket.capacity < required) {
      ensureCapacity(pool, bucket, required);
      reserved = true;
    }
  }
  return reserved;
}

/**
 * Create (or rebind while empty) each variant's InstancedMesh chunk before flight. A chunk can
 * otherwise only appear on the first live registration of that variant — inside a presented
 * frame — where its fresh instanced program links and its buffers upload mid-round. Warming
 * behind the loading shell publishes the chunk so the first real rock of each variant is only a
 * matrix write.
 * @param {object} pool
 * @param {Array<{variant:number, geometry:object, material:object}>} resources - shared leaf
 *   geometry/material per variant (the exact objects registerAsteroidBaseLeaf binds)
 */
export function warmAsteroidInstanceVariants(pool, resources) {
  if (!pool || pool.disposed || !Array.isArray(resources)) return 0;
  let warmed = 0;
  for (const res of resources) {
    const variant = res && (res.variant | 0);
    const bucket = variant >= 0 && variant < pool.variants.length ? pool.variants[variant] : null;
    if (!bucket || !res.geometry || !res.material) continue;
    // A live bucket's bound resources are authoritative — records already draw through the
    // chunk built from them. Only an empty bucket may rebind (e.g. a warm landed before the
    // rock surface library decoded and the leaf material was re-skinned in place).
    if (bucket.records.length > 0) continue;
    if (bucket.mesh && bucket.geometry === res.geometry && bucket.material === res.material) continue;
    bucket.geometry = res.geometry;
    bucket.material = res.material;
    ensureCapacity(pool, bucket, 1, bucket.mesh != null);
    if (bucket.mesh) warmed += 1;
  }
  return warmed;
}

export function syncAsteroidInstancePool(pool, options = {}) {
  if (!pool || pool.disposed) return null;
  if (!pool.cameraState) return null;
  const classifiedRecords = Array.isArray(options.records) ? options.records : null;
  const viewCameraDirty = cameraStateChanged(options.camera, pool.cameraState.view);
  const shadowCameraDirty = cameraStateChanged(options.shadowCamera, pool.cameraState.shadow);
  const cameraDirty = viewCameraDirty || shadowCameraDirty;
  const classifiedDirty = options.recordsDirty === true
    ? true
    : options.recordsDirty === false
      ? false
      : classifiedRecords
        ? hasDirtyClassifiedRecord(classifiedRecords, pool)
        : true;
  const canReuseStaticSubmission = !pool.dirty && !classifiedDirty && !cameraDirty;
  const stats = pool.stats;
  stats.registered = pool.byEntity.size;
  stats.matrixUploads = 0;
  stats.matrixReuses = 0;
  stats.matrixEvaluations = 0;

  if (canReuseStaticSubmission) {
    stats.matrixReuses = stats.visibleBatches;
    for (let variant = 0; variant < pool.variants.length; variant++) {
      const variantStats = stats.variants[variant];
      variantStats.uploads = 0;
      variantStats.reuses = variantStats.submitted > 0 ? 1 : 0;
    }
    return stats;
  }

  const viewFrustumReady = prepareFrustum(options.camera, _viewProjection, _viewFrustum);
  const shadowFrustumReady = prepareFrustum(options.shadowCamera, _shadowProjection, _shadowFrustum);
  stats.submitted = 0;
  stats.visibleBatches = 0;

  for (let variant = 0; variant < pool.variants.length; variant++) {
    const bucket = pool.variants[variant];
    const variantStats = stats.variants[variant];
    variantStats.registered = bucket.records.length;
    variantStats.submitted = 0;
    variantStats.capacity = bucket.capacity;
    variantStats.uploads = 0;
    variantStats.reuses = 0;
    if (!bucket.mesh) continue;

    let submitted = 0;
    let matrixDirty = false;
    if (bucket.dynamicBufferOwner && bucket.dynamicBufferOwner.invalid
      && !recoverRetiredBucket(pool, bucket, variantStats)) {
      // Out of rebuilds: the rocks still exist, so they are drawn one by one. Never nothing.
      drawBucketLeavesDirectly(bucket);
      variantStats.submitted = 0;
      continue;
    }
    const matrixArray = bucket.mesh.instanceMatrix.array;
    const dynamicBufferOwner = bucket.dynamicBufferOwner;
    assertDynamicBufferOwnerWritable(dynamicBufferOwner);
    for (let index = 0; index < bucket.records.length; index++) {
      const record = bucket.records[index];
      const root = record.ownerRoot;
      const leaf = record.leaf;
      if (!root || !leaf) continue;
      leaf.visible = false;
      if (!root.parent || root.visible === false) continue;
      leaf.updateWorldMatrix(true, false);
      if (viewFrustumReady || shadowFrustumReady) {
        const geometry = leaf.geometry;
        if (!geometry || !geometry.attributes || !geometry.attributes.position) continue;
        if (!geometry.boundingSphere) geometry.computeBoundingSphere();
        if (!geometry.boundingSphere) continue;
        const localSphere = geometry.boundingSphere;
        _worldSphere.center.copy(localSphere.center).applyMatrix4(leaf.matrixWorld);
        _worldSphere.radius = localSphere.radius * leaf.matrixWorld.getMaxScaleOnAxis();
        const inView = viewFrustumReady && _viewFrustum.intersectsSphere(_worldSphere);
        const inShadow = shadowFrustumReady && _shadowFrustum.intersectsSphere(_worldSphere);
        if (!inView && !inShadow) continue;
      } else if (root.userData.asteroidInstanceViewCulled) {
        continue;
      }
      const elements = leaf.matrixWorld.elements;
      stats.matrixEvaluations++;
      const offset = submitted * 16;
      let slotDirty = false;
      for (let component = 0; component < 16; component++) {
        const value = Math.fround(elements[component]);
        if (matrixArray[offset + component] !== value) {
          if (!slotDirty) {
            markDynamicBufferItems(dynamicBufferOwner, 0, submitted);
            slotDirty = true;
            matrixDirty = true;
          }
          matrixArray[offset + component] = value;
        }
      }
      bucket.entityIds[submitted] = record.entityId;
      submitted++;
    }

    const countChanged = bucket.mesh.count !== submitted;
    if (dynamicBufferOwner) commitDynamicBufferOwner(dynamicBufferOwner, submitted);
    else bucket.mesh.count = submitted;
    bucket.mesh.visible = submitted > 0;
    const uploadDirty = matrixDirty || (!dynamicBufferOwner && countChanged);
    if (uploadDirty) {
      if (!dynamicBufferOwner) bucket.mesh.instanceMatrix.needsUpdate = true;
      stats.matrixUploads++;
      variantStats.uploads++;
    } else if (submitted > 0) {
      stats.matrixReuses++;
      variantStats.reuses++;
    }
    variantStats.submitted = submitted;
    stats.submitted += submitted;
    if (submitted > 0) stats.visibleBatches++;
    bucket.entityIds.length = submitted;
  }
  pool.dirty = false;
  return stats;
}

export function resolveAsteroidInstanceEntityId(pool, object, instanceId) {
  if (!pool || pool.disposed || !object || !object.userData || !object.userData.asteroidInstancePool) return null;
  const variant = object.userData.asteroidInstanceVariant | 0;
  const bucket = pool.variants[variant];
  if (!bucket || !Number.isInteger(instanceId) || instanceId < 0) return null;
  return bucket.entityIds[instanceId] ?? null;
}

// Read-only acceptance surface for diagnosing source-mesh/instance handoff stability. It identifies
// both ownership sides and the submitted slot without changing matrices, culling, or residency.
export function asteroidInstanceMembership(pool, entityId) {
  const owned = pool && !pool.disposed && pool.byEntity.get(entityId);
  if (!owned) return {
    entityId,
    registered: false,
    adopted: false,
    submitted: false,
    submittedIndex: -1,
  };
  const { bucket, record } = owned;
  const submittedIndex = bucket.entityIds.indexOf(entityId);
  return {
    entityId,
    registered: true,
    variant: bucket.variant,
    adopted: record.leaf?.userData?.asteroidInstanceAdopted === true,
    sourceRootUuid: record.ownerRoot?.uuid || null,
    sourceLeafUuid: record.leaf?.uuid || null,
    sourceGeometryUuid: record.leaf?.geometry?.uuid || null,
    sourceMaterialUuid: record.leaf?.material?.uuid || null,
    poolMeshUuid: bucket.mesh?.uuid || null,
    submitted: submittedIndex >= 0,
    submittedIndex,
  };
}

export function clearAsteroidInstancePool(pool) {
  if (!pool || pool.disposed) return;
  for (const bucket of pool.variants) {
    for (const record of bucket.records) {
      if (!record.leaf) continue;
      record.leaf.visible = true;
      if (record.leaf.userData) record.leaf.userData.asteroidInstanceAdopted = false;
    }
    bucket.records.length = 0;
    bucket.entityIds.length = 0;
    if (bucket.mesh) {
      if (bucket.dynamicBufferOwner) commitDynamicBufferOwner(bucket.dynamicBufferOwner, 0);
      else bucket.mesh.count = 0;
      bucket.mesh.visible = false;
    }
  }
  pool.byEntity.clear();
  pool.dirty = true;
}

export function disposeAsteroidInstancePool(pool) {
  if (!pool || pool.disposed) return false;
  clearAsteroidInstancePool(pool);
  const scene = pool.scene;
  for (const bucket of pool.variants) {
    const mesh = bucket.mesh;
    if (mesh) disposeOwnedInstanceMesh(mesh, bucket.dynamicBufferOwner, scene);
    else if (bucket.dynamicBufferOwner) releaseDynamicBufferOwner(bucket.dynamicBufferOwner);
    bucket.dynamicBufferOwner = null;
    bucket.geometry = null;
    bucket.material = null;
    bucket.mesh = null;
    bucket.capacity = 0;
    bucket.records.length = 0;
    bucket.entityIds.length = 0;
  }
  pool.byEntity.clear();
  pool.stats.registered = 0;
  pool.stats.submitted = 0;
  pool.stats.visibleBatches = 0;
  pool.stats.matrixUploads = 0;
  pool.stats.matrixReuses = 0;
  pool.stats.matrixEvaluations = 0;
  for (const variantStats of pool.stats.variants) {
    variantStats.registered = 0;
    variantStats.submitted = 0;
    variantStats.capacity = 0;
    variantStats.uploads = 0;
    variantStats.reuses = 0;
  }
  pool.dirty = false;
  pool.disposed = true;
  pool.cameraState = null;
  pool.scene = null;
  return true;
}

export function getAsteroidInstancePoolDiagnostics(pool) {
  return pool ? pool.stats : null;
}

// A dynamic-buffer owner retires itself (and never un-retires) when it sees an upload it did not
// ask for, a version it did not write, or a throw inside a publish. The pool used to answer that
// by setting the variant's count to zero and hiding it — for the rest of the session. Every leaf
// in the bucket is already hidden in favour of the instanced draw, so one fifth of every common
// rock on screen vanished at once and never came back: "asteroids pop out of existence all the
// time." A retired owner is a bookkeeping fault, not a reason to stop drawing rocks.
const MAX_RETIRED_BUCKET_REBUILDS = 3;

function recoverRetiredBucket(pool, bucket, variantStats) {
  const retired = bucket.dynamicBufferOwner;
  bucket.retiredOwnerCount = (bucket.retiredOwnerCount | 0) + 1;
  if (variantStats) variantStats.retiredOwners = bucket.retiredOwnerCount;
  const reason = retired && retired.diagnostics && retired.diagnostics.lastError;
  if (bucket.retiredOwnerCount <= MAX_RETIRED_BUCKET_REBUILDS + 1 && typeof console !== 'undefined') {
    console.warn(`[asteroid-pool] variant ${bucket.variant} buffer owner retired (${reason || 'unknown'}); `
      + (bucket.retiredOwnerCount <= MAX_RETIRED_BUCKET_REBUILDS
        ? 'rebuilding the instanced batch'
        : 'drawing its rocks individually from now on'));
  }
  if (bucket.retiredOwnerCount > MAX_RETIRED_BUCKET_REBUILDS) {
    if (bucket.mesh) {
      bucket.mesh.count = 0;
      bucket.mesh.visible = false;
    }
    return false;
  }
  ensureCapacity(pool, bucket, Math.max(bucket.capacity | 0, bucket.records.length, 1), true);
  return !!bucket.mesh && !(bucket.dynamicBufferOwner && bucket.dynamicBufferOwner.invalid);
}

function drawBucketLeavesDirectly(bucket) {
  for (let index = 0; index < bucket.records.length; index++) {
    const record = bucket.records[index];
    if (record && record.leaf) record.leaf.visible = true;
  }
}

function ensureCapacity(pool, bucket, required, rebuild = false) {
  if (!rebuild && bucket.mesh && bucket.capacity >= required) return;
  const capacity = Math.max(INITIAL_CAPACITY, nextPowerOfTwo(required));
  const previous = bucket.mesh;
  const previousOwner = bucket.dynamicBufferOwner;
  const mesh = new THREE.InstancedMesh(bucket.geometry, bucket.material, capacity);
  mesh.name = `SF_CommonRockInstances_v${bucket.variant}`;
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.userData.asteroidInstancePool = true;
  mesh.userData.asteroidInstanceVariant = bucket.variant;
  mesh.userData.borrowedGeometryMaterial = true;
  stampOpeningSubmissionPackage(mesh, {
    schema: 'spaceface.asteroidInstancePoolProducer.v1',
    producer: 'asteroid-instance-pool',
    variant: bucket.variant,
    geometry: {
      type: bucket.geometry && bucket.geometry.type || 'BufferGeometry',
      attributes: Object.keys(bucket.geometry?.attributes || {}).sort().map((name) => {
        const attribute = bucket.geometry.attributes[name];
        return {
          name,
          itemSize: attribute && attribute.itemSize || 0,
          normalized: attribute && attribute.normalized === true,
        };
      }),
    },
    material: {
      type: bucket.material && bucket.material.type || 'Material',
      transparent: bucket.material && bucket.material.transparent === true,
      vertexColors: bucket.material && bucket.material.vertexColors === true,
    },
    instanceAbi: ['instanceMatrix'],
  }, {
    assetId: `asteroid-instance-pool-v${bucket.variant}`,
    producer: 'asteroid-instance-pool',
  });
  if (previous) {
    disposeOwnedInstanceMesh(previous, previousOwner, pool.scene);
  }
  bucket.mesh = mesh;
  bucket.capacity = capacity;
  pool.dirty = true;
  if (pool.scene) pool.scene.add(mesh);
  // The instanced program variant this mesh needs has never been linked when the mesh is new:
  // without the admission latch its first visible draw links it inside the presented pass.
  if (typeof pool.onMeshCreated === 'function') {
    try { pool.onMeshCreated(mesh); } catch { /* admission must never break the sync pass */ }
  }
  bucket.dynamicBufferOwner = registerDynamicBufferOwner(pool.scene, {
    id: `common-rock-instances-v${bucket.variant}`,
    mesh,
    attributes: [{ name: 'instanceMatrix', attribute: mesh.instanceMatrix }],
  });
}

function disposeOwnedInstanceMesh(mesh, dynamicBufferOwner, scene) {
  if (!mesh) return;
  // A replaced batch draws nothing from the moment it is replaced, whoever still holds a reference.
  mesh.count = 0;
  mesh.visible = false;
  // The pool creates instanceMatrix; source geometry/material belong to the borrowed leaf and
  // must never be disposed here. Release the dynamic callback owner before the attribute event.
  if (dynamicBufferOwner) releaseDynamicBufferOwner(dynamicBufferOwner);
  else if (mesh.instanceMatrix && typeof mesh.instanceMatrix.dispose === 'function') {
    mesh.instanceMatrix.dispose();
  }
  if (mesh.parent === scene) scene.remove(mesh);
  if (mesh.instanceMatrix && typeof mesh.instanceMatrix.dispose === 'function' && dynamicBufferOwner) {
    mesh.instanceMatrix.dispose();
  }
  mesh.instanceMatrix = null;
  mesh.geometry = null;
  mesh.material = null;
  if (typeof mesh.dispose === 'function') mesh.dispose();
  if (mesh.userData) mesh.userData = {};
}

function nextPowerOfTwo(value) {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

function prepareFrustum(camera, projection, frustum) {
  if (!camera || !camera.projectionMatrix || !camera.matrixWorldInverse) return false;
  if (typeof camera.updateWorldMatrix === 'function') camera.updateWorldMatrix(true, false);
  else camera.updateMatrixWorld(true);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projection);
  return true;
}

function createCameraState() {
  return { initialized: false, present: false, values: new Float64Array(45) };
}

function hasDirtyClassifiedRecord(records, pool) {
  if (records.length !== pool.byEntity.size) return true;
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (!record || record.renderDirty) return true;
    const root = record.mesh;
    const owned = pool.byEntity.get(record.id);
    if (!root || !root.parent || !owned || owned.record.ownerRoot !== root) return true;
  }
  return false;
}

function cameraStateChanged(camera, state) {
  const present = !!camera;
  let changed = !state.initialized || state.present !== present;
  state.initialized = true;
  state.present = present;
  if (!camera) return changed;
  if (typeof camera.updateWorldMatrix === 'function') camera.updateWorldMatrix(true, false);
  else if (typeof camera.updateMatrixWorld === 'function') camera.updateMatrixWorld(true);
  const position = camera.position;
  const quaternion = camera.quaternion;
  const scale = camera.scale;
  const world = camera.matrixWorld && camera.matrixWorld.elements;
  const projection = camera.projectionMatrix && camera.projectionMatrix.elements;
  const values = state.values;
  for (let index = 0; index < 13; index++) {
    let raw = 0;
    switch (index) {
      case 0: raw = position ? position.x : 0; break;
      case 1: raw = position ? position.y : 0; break;
      case 2: raw = position ? position.z : 0; break;
      case 3: raw = quaternion ? quaternion.x : 0; break;
      case 4: raw = quaternion ? quaternion.y : 0; break;
      case 5: raw = quaternion ? quaternion.z : 0; break;
      case 6: raw = quaternion ? quaternion.w : 1; break;
      case 7: raw = scale ? scale.x : 1; break;
      case 8: raw = scale ? scale.y : 1; break;
      case 9: raw = scale ? scale.z : 1; break;
      case 10: raw = camera.near; break;
      case 11: raw = camera.far; break;
      case 12: raw = camera.zoom; break;
      default: break;
    }
    const value = Number(raw) || 0;
    if (values[index] !== value) changed = true;
    values[index] = value;
  }
  for (let index = 0; index < 16; index++) {
    const value = world ? Number(world[index]) || 0 : 0;
    if (values[index + 13] !== value) changed = true;
    values[index + 13] = value;
  }
  for (let index = 0; index < 16; index++) {
    const value = projection ? Number(projection[index]) || 0 : 0;
    if (values[index + 29] !== value) changed = true;
    values[index + 29] = value;
  }
  return changed;
}
