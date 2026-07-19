// Quality-preserving common-rock submission pool.
//
// The procedural asteroid builder still owns the exact geometry, PBR material, scale, rotation,
// shadows, entity root, and all valuable-ore detail children. This pool only replaces separate
// opaque base-body submissions for untinted common rocks with five compact InstancedMesh draws.
// Renderer view culling is applied before compaction, avoiding sector-wide always-visible batches.
import * as THREE from 'three';

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

export function createAsteroidInstancePool(scene) {
  const variants = new Array(ASTEROID_INSTANCE_VARIANT_COUNT);
  const variantStats = new Array(ASTEROID_INSTANCE_VARIANT_COUNT);
  for (let variant = 0; variant < ASTEROID_INSTANCE_VARIANT_COUNT; variant++) {
    variants[variant] = {
      variant,
      geometry: null,
      material: null,
      mesh: null,
      capacity: 0,
      records: [],
      entityIds: [],
    };
    variantStats[variant] = createVariantStats(variant);
  }
  return {
    scene,
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
    cameraState: {
      view: createCameraState(),
      shadow: createCameraState(),
    },
  };
}

export function registerAsteroidBaseLeaf(pool, entity, ownerRoot) {
  if (!pool || !entity || !ownerRoot || entity.type !== 'asteroid') return false;
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

export function releaseAsteroidInstancesForEntity(pool, entityId) {
  const owned = pool && pool.byEntity.get(entityId);
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
  if (pool) pool.dirty = true;
}

export function syncAsteroidInstancePool(pool, options = {}) {
  if (!pool) return null;
  const classifiedRecords = Array.isArray(options.records) ? options.records : null;
  const viewCameraDirty = cameraStateChanged(options.camera, pool.cameraState.view);
  const shadowCameraDirty = cameraStateChanged(options.shadowCamera, pool.cameraState.shadow);
  const cameraDirty = viewCameraDirty || shadowCameraDirty;
  const classifiedDirty = classifiedRecords
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
    let dirty = false;
    const matrixArray = bucket.mesh.instanceMatrix.array;
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
        if (!geometry.boundingSphere) geometry.computeBoundingSphere();
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
      for (let component = 0; component < 16; component++) {
        const value = Math.fround(elements[component]);
        if (matrixArray[offset + component] !== value) {
          matrixArray[offset + component] = value;
          dirty = true;
        }
      }
      bucket.entityIds[submitted] = record.entityId;
      submitted++;
    }

    if (bucket.mesh.count !== submitted) {
      bucket.mesh.count = submitted;
      dirty = true;
    }
    bucket.mesh.visible = submitted > 0;
    if (dirty) {
      bucket.mesh.instanceMatrix.needsUpdate = true;
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
  if (!pool || !object || !object.userData || !object.userData.asteroidInstancePool) return null;
  const variant = object.userData.asteroidInstanceVariant | 0;
  const bucket = pool.variants[variant];
  if (!bucket || !Number.isInteger(instanceId) || instanceId < 0) return null;
  return bucket.entityIds[instanceId] ?? null;
}

// Read-only acceptance surface for diagnosing source-mesh/instance handoff stability. It identifies
// both ownership sides and the submitted slot without changing matrices, culling, or residency.
export function asteroidInstanceMembership(pool, entityId) {
  const owned = pool && pool.byEntity.get(entityId);
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
  if (!pool) return;
  for (const bucket of pool.variants) {
    for (const record of bucket.records) {
      if (!record.leaf) continue;
      record.leaf.visible = true;
      if (record.leaf.userData) record.leaf.userData.asteroidInstanceAdopted = false;
    }
    bucket.records.length = 0;
    bucket.entityIds.length = 0;
    if (bucket.mesh) {
      bucket.mesh.count = 0;
      bucket.mesh.visible = false;
    }
  }
  pool.byEntity.clear();
  pool.dirty = true;
}

export function disposeAsteroidInstancePool(pool) {
  if (!pool) return;
  clearAsteroidInstancePool(pool);
  for (const bucket of pool.variants) {
    const mesh = bucket.mesh;
    if (!mesh) continue;
    if (mesh.parent) mesh.parent.remove(mesh);
    mesh.geometry = null;
    mesh.material = null;
    if (typeof mesh.dispose === 'function') mesh.dispose();
    bucket.mesh = null;
    bucket.capacity = 0;
  }
}

export function getAsteroidInstancePoolDiagnostics(pool) {
  return pool ? pool.stats : null;
}

function ensureCapacity(pool, bucket, required) {
  if (bucket.mesh && bucket.capacity >= required) return;
  const capacity = Math.max(INITIAL_CAPACITY, nextPowerOfTwo(required));
  const previous = bucket.mesh;
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
  if (previous) {
    if (previous.parent) previous.parent.remove(previous);
    previous.geometry = null;
    previous.material = null;
    if (typeof previous.dispose === 'function') previous.dispose();
  }
  bucket.mesh = mesh;
  bucket.capacity = capacity;
  pool.dirty = true;
  if (pool.scene) pool.scene.add(mesh);
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
