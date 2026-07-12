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
      variants: variantStats,
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
  return true;
}

export function syncAsteroidInstancePool(pool, options = {}) {
  if (!pool) return null;
  const viewFrustumReady = prepareFrustum(options.camera, _viewProjection, _viewFrustum);
  const shadowFrustumReady = prepareFrustum(options.shadowCamera, _shadowProjection, _shadowFrustum);
  const stats = pool.stats;
  stats.registered = pool.byEntity.size;
  stats.submitted = 0;
  stats.visibleBatches = 0;
  stats.matrixUploads = 0;
  stats.matrixReuses = 0;

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
  return stats;
}

export function resolveAsteroidInstanceEntityId(pool, object, instanceId) {
  if (!pool || !object || !object.userData || !object.userData.asteroidInstancePool) return null;
  const variant = object.userData.asteroidInstanceVariant | 0;
  const bucket = pool.variants[variant];
  if (!bucket || !Number.isInteger(instanceId) || instanceId < 0) return null;
  return bucket.entityIds[instanceId] ?? null;
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
  if (pool.scene) pool.scene.add(mesh);
}

function nextPowerOfTwo(value) {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

function prepareFrustum(camera, projection, frustum) {
  if (!camera || !camera.projectionMatrix || !camera.matrixWorldInverse) return false;
  camera.updateMatrixWorld(true);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projection);
  return true;
}
