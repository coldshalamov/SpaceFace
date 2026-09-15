// Quality-preserving common-rock submission pool.
//
// The procedural asteroid builder still owns the exact geometry, PBR material, scale, rotation,
// shadows, entity root, and all valuable-ore detail children. This pool only replaces separate
// opaque base-body submissions for untinted common rocks with five compact InstancedMesh draws.
// Renderer view culling is applied before compaction, avoiding sector-wide always-visible batches.
import * as THREE from 'three';
import { stampOpeningSubmissionPackage } from './openingSubmissionPlan.js';
import { createLodState, projectedWidthPx } from './lod.js';
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
const _lodViewport = { width: 0, height: 0 };

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
      dynamicBufferOwner: null,
      capacity: 0,
      records: [],
      entityIds: [],
      // Coarser same-variant geometries supplied by the procedural leaf for projected-size
      // LOD submission (spec §12.4). lodTiers holds one InstancedMesh slot per coarser
      // geometry; each slot mirrors the bucket's own fields (mesh/capacity/entityIds/
      // dynamicBufferOwner) so the sync loop treats the bucket itself as slot 0.
      lodGeometries: null,
      lodTiers: null,
    };
    variantStats[variant] = createVariantStats(variant);
  }
  const pool = {
    scene,
    variants,
    byEntity: new Map(),
    // Bucket meshes minted since the last drain. The renderer compiles each once so a
    // variant that first registers mid-flight never links its instanced depth program
    // inside a measured frame.
    pendingAdmission: [],
    stats: {
      registered: 0,
      submitted: 0,
      visibleBatches: 0,
      matrixUploads: 0,
      matrixReuses: 0,
      matrixEvaluations: 0,
      variants: variantStats,
      // Per-tier submission counts for projected-size LOD observability (diagnostics only).
      tierSubmissions: [0, 0, 0],
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
  const roots = [];
  for (const bucket of pool.variants) {
    if (!bucket) continue;
    forEachBucketSlot(bucket, (slot) => {
      if (slot.mesh && slot.mesh.visible !== false && slot.mesh.count > 0) roots.push(slot.mesh);
    });
  }
  return roots;
}

function forEachBucketSlot(bucket, fn) {
  fn(bucket);
  const tiers = bucket.lodTiers;
  if (tiers) for (let index = 0; index < tiers.length; index++) fn(tiers[index]);
}

// Bucket meshes minted since the last drain — a new (geometry, material) instanced combo
// needs its surface + shadow-depth variants compiled before its first populated draw.
export function drainAsteroidInstancePoolAdmissions(pool) {
  if (!pool || !Array.isArray(pool.pendingAdmission) || pool.pendingAdmission.length === 0) return [];
  return pool.pendingAdmission.splice(0);
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
  const lodGeometries = normalizeLodGeometries(info.asteroidInstanceLodGeometries);
  if (bucket.lodGeometries == null) {
    bucket.lodGeometries = lodGeometries;
  } else if (bucket.lodGeometries.length !== lodGeometries.length
    || bucket.lodGeometries.some((geometry, index) => geometry !== lodGeometries[index])) {
    // A variant whose records disagree on the coarser geometry set stays uninstanced —
    // same contract as the base geometry/material check above.
    return false;
  }
  ensureCapacity(pool, bucket, bucket, bucket.records.length + 1);
  for (let tier = 0; tier < bucket.lodGeometries.length; tier++) {
    if (!bucket.lodTiers) bucket.lodTiers = [];
    if (!bucket.lodTiers[tier]) {
      bucket.lodTiers[tier] = {
        tier: tier + 1,
        geometry: bucket.lodGeometries[tier],
        mesh: null,
        dynamicBufferOwner: null,
        capacity: 0,
        entityIds: [],
      };
    }
    ensureCapacity(pool, bucket, bucket.lodTiers[tier], bucket.records.length + 1);
  }
  if (!bucket.mesh) return false;

  const record = { entityId: entity.id, ownerRoot, leaf, lod: createLodState() };
  bucket.records.push(record);
  pool.byEntity.set(entity.id, { bucket, record });
  pool.dirty = true;
  leaf.visible = false;
  leaf.userData.asteroidInstanceAdopted = true;
  return true;
}

function normalizeLodGeometries(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((geometry) => geometry && geometry.attributes && geometry.attributes.position);
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

export function syncAsteroidInstancePool(pool, options = {}) {
  if (!pool || pool.disposed) return null;
  if (!pool.cameraState) return null;
  const classifiedRecords = Array.isArray(options.records) ? options.records : null;
  const viewCameraDirty = cameraStateChanged(options.camera, pool.cameraState.view);
  const shadowCameraDirty = cameraStateChanged(options.shadowCamera, pool.cameraState.shadow);
  const viewportHeight = Number(options.viewportHeight) || 0;
  const viewportDirty = pool.cameraState.viewportHeight !== viewportHeight;
  pool.cameraState.viewportHeight = viewportHeight;
  const cameraDirty = viewCameraDirty || shadowCameraDirty || viewportDirty;
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
  stats.tierSubmissions[0] = 0;
  stats.tierSubmissions[1] = 0;
  stats.tierSubmissions[2] = 0;

  for (let variant = 0; variant < pool.variants.length; variant++) {
    const bucket = pool.variants[variant];
    const variantStats = stats.variants[variant];
    variantStats.registered = bucket.records.length;
    variantStats.submitted = 0;
    variantStats.capacity = 0;
    forEachBucketSlot(bucket, (slot) => { variantStats.capacity += slot.capacity; });
    variantStats.uploads = 0;
    variantStats.reuses = 0;
    if (!bucket.mesh) continue;

    const lodTiers = bucket.lodTiers;
    const slotCount = 1 + (lodTiers ? lodTiers.length : 0);
    // An invalid buffer owner cannot accept writes this frame — park the whole variant
    // (same contract as the single-slot path) and try again next sync.
    let anyOwnerInvalid = false;
    forEachBucketSlot(bucket, (slot) => {
      slot._submit = 0;
      slot._matrixDirty = false;
      if (slot.dynamicBufferOwner && slot.dynamicBufferOwner.invalid) anyOwnerInvalid = true;
    });
    if (anyOwnerInvalid) {
      forEachBucketSlot(bucket, (slot) => {
        if (slot.mesh) {
          slot.mesh.count = 0;
          slot.mesh.visible = false;
        }
      });
      variantStats.submitted = 0;
      continue;
    }
    forEachBucketSlot(bucket, (slot) => assertDynamicBufferOwnerWritable(slot.dynamicBufferOwner));
    const lodMeasurable = slotCount > 1 && viewFrustumReady && viewportHeight > 0;
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
      // Projected-size tier pick: the record's LodState holds hysteresis so a rock holding
      // station on a boundary does not oscillate between tiers each sync.
      let tierIndex = 0;
      if (lodMeasurable) {
        _lodViewport.height = viewportHeight;
        const px = projectedWidthPx(_worldSphere.center, _worldSphere.radius, options.camera, _lodViewport);
        // resolve() steps one level per call so a boundary hover cannot oscillate; repeat
        // until stable so a record deep inside a coarser band reaches it in one sync.
        let level = record.lod ? record.lod.resolve(px) : 'lod0';
        for (let settle = 0; settle < 2; settle++) {
          const next = record.lod ? record.lod.resolve(px) : 'lod0';
          if (next === level) break;
          level = next;
        }
        tierIndex = level === 'lod2' ? 2 : level === 'lod1' ? 1 : 0;
        if (tierIndex >= slotCount) tierIndex = slotCount - 1;
      }
      const slot = tierIndex === 0 ? bucket : lodTiers[tierIndex - 1];
      const matrixArray = slot.mesh.instanceMatrix.array;
      const dynamicBufferOwner = slot.dynamicBufferOwner;
      const submitted = slot._submit;
      const elements = leaf.matrixWorld.elements;
      stats.matrixEvaluations++;
      const offset = submitted * 16;
      for (let component = 0; component < 16; component++) {
        const value = Math.fround(elements[component]);
        if (matrixArray[offset + component] !== value) {
          if (!slot._matrixDirty) {
            markDynamicBufferItems(dynamicBufferOwner, 0, submitted);
            slot._matrixDirty = true;
          }
          matrixArray[offset + component] = value;
        }
      }
      slot.entityIds[submitted] = record.entityId;
      slot._submit = submitted + 1;
    }

    forEachBucketSlot(bucket, (slot) => {
      const submitted = slot._submit;
      const dynamicBufferOwner = slot.dynamicBufferOwner;
      const countChanged = slot.mesh.count !== submitted;
      if (dynamicBufferOwner) commitDynamicBufferOwner(dynamicBufferOwner, submitted);
      else slot.mesh.count = submitted;
      slot.mesh.visible = submitted > 0;
      const uploadDirty = slot._matrixDirty || (!dynamicBufferOwner && countChanged);
      if (uploadDirty) {
        if (!dynamicBufferOwner) slot.mesh.instanceMatrix.needsUpdate = true;
        stats.matrixUploads++;
        variantStats.uploads++;
      } else if (submitted > 0) {
        stats.matrixReuses++;
        variantStats.reuses++;
      }
      variantStats.submitted += submitted;
      stats.submitted += submitted;
      if (submitted > 0) stats.visibleBatches++;
      const slotTier = slot.tier | 0;
      if (slotTier < stats.tierSubmissions.length) stats.tierSubmissions[slotTier] += submitted;
      slot.entityIds.length = submitted;
    });
  }
  pool.dirty = false;
  return stats;
}

export function resolveAsteroidInstanceEntityId(pool, object, instanceId) {
  if (!pool || pool.disposed || !object || !object.userData || !object.userData.asteroidInstancePool) return null;
  const variant = object.userData.asteroidInstanceVariant | 0;
  const bucket = pool.variants[variant];
  if (!bucket || !Number.isInteger(instanceId) || instanceId < 0) return null;
  const tier = object.userData.asteroidInstanceLodTier | 0;
  const slot = tier === 0 ? bucket : bucket.lodTiers && bucket.lodTiers[tier - 1];
  if (!slot) return null;
  return slot.entityIds[instanceId] ?? null;
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
  let submittedIndex = bucket.entityIds.indexOf(entityId);
  let submittedTier = 0;
  if (submittedIndex < 0 && bucket.lodTiers) {
    for (let tier = 0; tier < bucket.lodTiers.length; tier++) {
      const index = bucket.lodTiers[tier].entityIds.indexOf(entityId);
      if (index >= 0) {
        submittedIndex = index;
        submittedTier = tier + 1;
        break;
      }
    }
  }
  const submittedSlot = submittedTier === 0 ? bucket : bucket.lodTiers[submittedTier - 1];
  return {
    entityId,
    registered: true,
    variant: bucket.variant,
    adopted: record.leaf?.userData?.asteroidInstanceAdopted === true,
    sourceRootUuid: record.ownerRoot?.uuid || null,
    sourceLeafUuid: record.leaf?.uuid || null,
    sourceGeometryUuid: record.leaf?.geometry?.uuid || null,
    sourceMaterialUuid: record.leaf?.material?.uuid || null,
    poolMeshUuid: submittedIndex >= 0 ? submittedSlot.mesh?.uuid || null : bucket.mesh?.uuid || null,
    submitted: submittedIndex >= 0,
    submittedIndex,
    submittedTier,
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
    forEachBucketSlot(bucket, (slot) => {
      slot.entityIds.length = 0;
      if (slot.mesh) {
        if (slot.dynamicBufferOwner) commitDynamicBufferOwner(slot.dynamicBufferOwner, 0);
        else slot.mesh.count = 0;
        slot.mesh.visible = false;
      }
    });
  }
  pool.byEntity.clear();
  pool.dirty = true;
}

export function disposeAsteroidInstancePool(pool) {
  if (!pool || pool.disposed) return false;
  clearAsteroidInstancePool(pool);
  const scene = pool.scene;
  for (const bucket of pool.variants) {
    forEachBucketSlot(bucket, (slot) => {
      if (slot.mesh) disposeOwnedInstanceMesh(slot.mesh, slot.dynamicBufferOwner, scene);
      else if (slot.dynamicBufferOwner) releaseDynamicBufferOwner(slot.dynamicBufferOwner);
      slot.dynamicBufferOwner = null;
      slot.mesh = null;
      slot.capacity = 0;
      slot.entityIds.length = 0;
    });
    bucket.geometry = null;
    bucket.material = null;
    bucket.lodGeometries = null;
    bucket.lodTiers = null;
    bucket.records.length = 0;
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

function ensureCapacity(pool, bucket, slot, required) {
  if (slot.mesh && slot.capacity >= required) return;
  const capacity = Math.max(INITIAL_CAPACITY, nextPowerOfTwo(required));
  const previous = slot.mesh;
  const previousOwner = slot.dynamicBufferOwner;
  const tier = slot.tier | 0;
  const mesh = new THREE.InstancedMesh(slot.geometry, bucket.material, capacity);
  mesh.name = `SF_CommonRockInstances_v${bucket.variant}${tier ? `_lod${tier}` : ''}`;
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.userData.asteroidInstancePool = true;
  mesh.userData.asteroidInstanceVariant = bucket.variant;
  mesh.userData.asteroidInstanceLodTier = tier;
  mesh.userData.borrowedGeometryMaterial = true;
  stampOpeningSubmissionPackage(mesh, {
    schema: 'spaceface.asteroidInstancePoolProducer.v1',
    producer: 'asteroid-instance-pool',
    variant: bucket.variant,
    lodTier: tier,
    geometry: {
      type: slot.geometry && slot.geometry.type || 'BufferGeometry',
      attributes: Object.keys(slot.geometry?.attributes || {}).sort().map((name) => {
        const attribute = slot.geometry.attributes[name];
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
    assetId: `asteroid-instance-pool-v${bucket.variant}${tier ? `-lod${tier}` : ''}`,
    producer: 'asteroid-instance-pool',
  });
  if (previous) {
    disposeOwnedInstanceMesh(previous, previousOwner, pool.scene);
  }
  slot.mesh = mesh;
  slot.capacity = capacity;
  pool.dirty = true;
  if (pool.scene) pool.scene.add(mesh);
  if (Array.isArray(pool.pendingAdmission)) pool.pendingAdmission.push(mesh);
  slot.dynamicBufferOwner = registerDynamicBufferOwner(pool.scene, {
    id: `common-rock-instances-v${bucket.variant}${tier ? `-lod${tier}` : ''}`,
    mesh,
    attributes: [{ name: 'instanceMatrix', attribute: mesh.instanceMatrix }],
  });
}

function disposeOwnedInstanceMesh(mesh, dynamicBufferOwner, scene) {
  if (!mesh) return;
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
