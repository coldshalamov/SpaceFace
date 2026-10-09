// Quality-preserving asteroid submission pool.
//
// The procedural asteroid builder still owns the exact geometry, PBR material, scale, rotation,
// shadows, entity root, and all valuable-ore detail children. This pool only replaces separate
// opaque submissions with compact InstancedMesh draws: untinted common-rock bodies group into
// the five displacement-variant chunks, while every other opaque body leaf (tinted, non-common,
// optic skins) lands in a keyed bucket bound to its exact shared (geometry, material) pair —
// as do the stamped detail children (ore veins, crystal shards, prism inclusions; never the
// translucent gas hull). A kind swap (optic diamond↔spent) releases + re-registers so records
// migrate to the swapped material's bucket.
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
const INSTANCE_MATRIX_BYTES = 64;
const _viewProjection = new THREE.Matrix4();
const _shadowProjection = new THREE.Matrix4();
const _viewFrustum = new THREE.Frustum();
const _shadowFrustum = new THREE.Frustum();
const _worldSphere = new THREE.Sphere();
const _syncRootsSeen = new Set();

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
      retiring: null,
      capacity: 0,
      reservedCapacity: 0,
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
    // Whether the owner can currently run the deferred depth-stage arm that restores a
    // withheld authored castShadow after the variant links. Read at mint time only.
    shadowStageGate: typeof options.shadowStageGate === 'function' ? options.shadowStageGate : null,
    variants,
    // Beyond the five fixed common-rock variant buckets, every other repeated asteroid leaf
    // (non-common bodies, tinted rocks, optic cells, and stamped detail children — veins,
    // crystal shards, prism inclusions) pools into buckets keyed by the exact shared
    // (geometry, material) object pair the factory hands it.
    keyed: new Map(),
    nextKeyedIndex: 0,
    byEntity: new Map(),
    // Detail records are 1:N per entity (`entityId#d<index>`); they stay out of byEntity so the
    // classified-record dirty check keeps comparing presentation rows to body records 1:1.
    byDetail: new Map(),
    // entityId -> Set<detailKey> index: a mass-depart evict burst used to scan the
    // whole byDetail map per released row.
    byDetailOwner: new Map(),
    stats: {
      registered: 0,
      registeredDetails: 0,
      submitted: 0,
      visibleBatches: 0,
      matrixUploads: 0,
      matrixReuses: 0,
      matrixEvaluations: 0,
      shadowMatrixUploads: 0,
      powerOfTwoRebuilds: 0,
      reservedRosterCount: 0,
      reservedCapacityCount: 0,
      variants: variantStats,
      keyed: [],
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
  for (const bucket of allBuckets(pool)) {
    if (bucket && bucket.mesh && bucket.mesh.visible !== false && bucket.mesh.count > 0) {
      roots.push(bucket.mesh);
    }
    // The outgoing batch bridging a growth is still a drawing pool root.
    const retiring = bucket && bucket.retiring && bucket.retiring.mesh;
    if (retiring && retiring.visible !== false && retiring.count > 0) roots.push(retiring);
  }
  return roots;
}

function* allBuckets(pool) {
  for (const bucket of pool.variants) yield bucket;
  for (const bucket of pool.keyed.values()) yield bucket;
}

function createKeyedBucket(key, geometry, material, castShadow, receiveShadow, logicalKey) {
  return {
    variant: -1,
    key,
    logicalKey,
    geometry,
    material,
    castShadow: castShadow !== false,
    receiveShadow: receiveShadow !== false,
    mesh: null,
    dynamicBufferOwner: null,
    // Outgoing batch kept drawing while a grown replacement clears the admission latch.
    retiring: null,
    capacity: 0,
    reservedCapacity: 0,
    records: [],
    entityIds: [],
    retiredOwnerCount: 0,
    stats: createVariantStats(logicalKey || key),
  };
}

function keyedBucketFor(pool, key, leaf) {
  let bucket = pool.keyed.get(key);
  if (!bucket) {
    bucket = createKeyedBucket(key, leaf.geometry, leaf.material, leaf.castShadow, leaf.receiveShadow, null);
    pool.keyed.set(key, bucket);
    pool.stats.keyed.push(bucket.stats);
  }
  return bucket;
}

function leafPoolKey(leaf) {
  const geometry = leaf && leaf.geometry;
  const material = leaf && leaf.material;
  return (geometry && material) ? `${geometry.uuid}|${material.uuid}` : null;
}

function adoptPoolLeaf(pool, entity, ownerRoot, leaf, detail) {
  const info = leaf && leaf.userData;
  if (!leaf || !info) return false;
  if (!leaf.geometry || !leaf.material || Array.isArray(leaf.material) || leaf.material.transparent) return false;

  let bucket = null;
  const isCommon = info.asteroidInstanceTypeId === ASTEROID_INSTANCE_TYPE_ID;
  if (!detail && isCommon) {
    const variant = info.asteroidInstanceVariant | 0;
    if (variant < 0 || variant >= ASTEROID_INSTANCE_VARIANT_COUNT) return false;
    bucket = pool.variants[variant];
    if (bucket.geometry && (bucket.geometry !== leaf.geometry || bucket.material !== leaf.material)) return false;
    bucket.geometry = leaf.geometry;
    bucket.material = leaf.material;
  } else {
    bucket = keyedBucketFor(pool, leafPoolKey(leaf), leaf);
  }
  ensureCapacity(pool, bucket, bucket.records.length + 1);
  if (!bucket.mesh) return false;

  const record = { entityId: entity.id, ownerRoot, leaf, detail: detail === true };
  bucket.records.push(record);
  if (detail === true) {
    // The pool parks leaf.visible=false for the life of the record, so a LOD-hidden detail
    // leaf keeps its "would draw" state in poolLeafVisible (hlod writes it instead of visible).
    if (info.poolLeafVisible === undefined) info.poolLeafVisible = leaf.visible !== false;
    record.detailKey = `${entity.id}#${leaf.uuid}`;
    pool.byDetail.set(record.detailKey, { bucket, record });
    let ownerKeys = pool.byDetailOwner.get(entity.id);
    if (!ownerKeys) pool.byDetailOwner.set(entity.id, ownerKeys = new Set());
    ownerKeys.add(record.detailKey);
  } else {
    pool.byEntity.set(entity.id, { bucket, record });
  }
  pool.dirty = true;
  leaf.visible = false;
  info.asteroidInstanceAdopted = true;
  return true;
}

export function registerAsteroidBaseLeaf(pool, entity, ownerRoot) {
  if (!pool || pool.disposed || !entity || !ownerRoot || entity.type !== 'asteroid') return false;
  const leaf = ownerRoot.userData && ownerRoot.userData.asteroidInstanceBody;
  const info = leaf && leaf.userData;
  if (!leaf || !info) return false;

  let adopted = false;
  if (!pool.byEntity.has(entity.id)) {
    adopted = adoptPoolLeaf(pool, entity, ownerRoot, leaf, false);
  }
  // Stamped detail children share geometry+material across every rock of their kind — each
  // pools into its own keyed chunk under an `entityId#leafUuid` detail record.
  if (typeof ownerRoot.traverse === 'function') {
    ownerRoot.traverse((child) => {
      const ud = child && child.userData;
      if (!ud || ud.asteroidInstanceDetail !== true || ud.asteroidInstanceAdopted === true) return;
      // A retired-bucket direct-draw fallback clears the adopted flag but keeps the record —
      // re-registration must not duplicate it.
      if (pool.byDetail.has(`${entity.id}#${child.uuid}`)) return;
      adoptPoolLeaf(pool, entity, ownerRoot, child, true);
    });
  }
  return adopted;
}

export function isBorrowedAsteroidInstanceResource(object) {
  const userData = object && object.userData;
  return !!(userData && (
    userData.borrowedGeometryMaterial
    || userData.asteroidInstancePool
    || userData.asteroidInstanceTypeId
    || userData.asteroidInstanceAdopted
    || userData.asteroidInstanceDetail
  ));
}

function releasePoolRecord(pool, bucket, record) {
  const index = bucket.records.indexOf(record);
  if (index >= 0) bucket.records.splice(index, 1);
  const leaf = record.leaf;
  if (leaf) {
    const ud = leaf.userData;
    if (record.detail === true) {
      leaf.visible = !ud || ud.poolLeafVisible !== false;
      if (ud) delete ud.poolLeafVisible;
    } else {
      leaf.visible = true;
    }
    if (ud) ud.asteroidInstanceAdopted = false;
  }
  pool.dirty = true;
}

export function releaseAsteroidInstancesForEntity(pool, entityId) {
  if (!pool || pool.disposed) return false;
  let released = false;
  const owned = pool.byEntity.get(entityId);
  if (owned) {
    releasePoolRecord(pool, owned.bucket, owned.record);
    pool.byEntity.delete(entityId);
    released = true;
  }
  const ownedKeys = pool.byDetailOwner.get(entityId);
  if (ownedKeys) {
    pool.byDetailOwner.delete(entityId);
    for (const key of ownedKeys) {
      const ownedDetail = pool.byDetail.get(key);
      if (!ownedDetail) continue;
      releasePoolRecord(pool, ownedDetail.bucket, ownedDetail.record);
      pool.byDetail.delete(key);
      released = true;
    }
  }
  return released;
}

/**
 * Move one entity's pool membership onto a reissued id. Same-sector save restores keep GPU
 * meshes while assigning fresh entity ids; the renderer rekeys its `_meshes` map and must rekey
 * this record with it — otherwise the adopted leaf's record is stranded under a dead id: every
 * release misses, the record keeps pinning ownerRoot+leaf, and the classified-record dirty check
 * misses every frame (forcing a full matrix reclassify). Only the entity id changes — the record
 * keeps the exact ownerRoot/leaf slot it already owns in its bucket.
 */
export function rekeyAsteroidInstanceEntity(pool, oldId, newId) {
  if (!pool || pool.disposed || oldId == null || newId == null || oldId === newId) return false;
  const owned = pool.byEntity.get(oldId);
  if (!owned) return false;
  pool.byEntity.delete(oldId);
  if (pool.byEntity.has(newId)) {
    // The new id already owns a different leaf's record — this one can never be reached through
    // its entity again. Splice it out like a release so it cannot pin its mesh tree forever,
    // and drop the orphaned entity's detail records alongside it.
    releasePoolRecord(pool, owned.bucket, owned.record);
    releaseEntityDetailRecords(pool, oldId);
    return false;
  }
  owned.record.entityId = newId;
  pool.byEntity.set(newId, owned);
  // Detail records ride the same entity id under their `oldId#leaf` composite keys.
  const ownedKeys = pool.byDetailOwner.get(oldId);
  if (ownedKeys) {
    pool.byDetailOwner.delete(oldId);
    let newKeys = pool.byDetailOwner.get(newId);
    if (!newKeys) pool.byDetailOwner.set(newId, newKeys = new Set());
    for (const key of ownedKeys) {
      const ownedDetail = pool.byDetail.get(key);
      if (!ownedDetail) continue;
      pool.byDetail.delete(key);
      ownedDetail.record.entityId = newId;
      ownedDetail.record.detailKey = `${newId}#${ownedDetail.record.leaf && ownedDetail.record.leaf.uuid}`;
      pool.byDetail.set(ownedDetail.record.detailKey, ownedDetail);
      newKeys.add(ownedDetail.record.detailKey);
    }
  }
  pool.dirty = true;
  return true;
}

function releaseEntityDetailRecords(pool, entityId) {
  const ownedKeys = pool.byDetailOwner.get(entityId);
  if (!ownedKeys) return;
  pool.byDetailOwner.delete(entityId);
  for (const key of ownedKeys) {
    const ownedDetail = pool.byDetail.get(key);
    if (!ownedDetail) continue;
    releasePoolRecord(pool, ownedDetail.bucket, ownedDetail.record);
    pool.byDetail.delete(key);
  }
}

export function invalidateAsteroidInstancePool(pool) {
  if (pool && !pool.disposed) pool.dirty = true;
}

// Origin rebase companion: every stored instanceMatrix is frame-local, so a
// quantum crossing shifts each stored translation by (dx,dz) — elements 12/14
// of each column-major 4x4. Translating the stored bytes plus one upload per
// bucket replaces the full updateWorldMatrix re-eval + per-record compare the
// invalidate path pays on the next sync; subsequent syncs then compare equal
// and write nothing.
export function translateAsteroidInstancePool(pool, dx, dz) {
  if (!pool || pool.disposed || (!dx && !dz)) return;
  const shiftBucket = (bucket) => {
    if (!bucket || !bucket.mesh || !bucket.mesh.instanceMatrix) return;
    const array = bucket.mesh.instanceMatrix.array;
    for (let offset = 0; offset + 15 < array.length; offset += 16) {
      array[offset + 12] += dx;
      array[offset + 14] += dz;
    }
    if (bucket.dynamicBufferOwner) {
      markDynamicBufferItems(bucket.dynamicBufferOwner, 0, 0, array.length / 16);
    } else {
      bucket.mesh.instanceMatrix.needsUpdate = true;
    }
  };
  for (const bucket of pool.variants) shiftBucket(bucket);
  for (const bucket of pool.keyed.values()) shiftBucket(bucket);
}

/**
 * Pre-size variant buckets so later registrations never trigger a capacity rebuild — a rebuild
 * allocates a fresh instanceMatrix buffer (a bufferData a fight would otherwise pay mid-round).
 * The reserve is remembered even when the bucket has no mesh yet, so the first create is born
 * at the roster size. Instance-matrix bytes (64 per slot) stay inside the residency ceiling.
 * @param {object} pool
 * @param {Array<number>} requiredByVariant - total records each variant may ever hold
 * @param {{rosterCount?: number, byteCeiling?: number}} [options]
 */
export function reserveAsteroidInstanceCapacity(pool, requiredByVariant, options = {}) {
  if (!pool || pool.disposed || !Array.isArray(requiredByVariant)) return false;
  const ceiling = Number(options.byteCeiling) > 0 ? Number(options.byteCeiling) : Number.POSITIVE_INFINITY;
  let byteBudget = ceiling;
  const rosterCount = Math.max(0, Math.trunc(Number(options.rosterCount) || 0));
  if (pool.stats) pool.stats.reservedRosterCount = rosterCount;
  let reservedCapacity = 0;
  let reserved = false;
  for (let variant = 0; variant < pool.variants.length; variant++) {
    const required = Math.max(0, Math.trunc(Number(requiredByVariant[variant]) || 0));
    if (required <= 0) continue;
    const bucket = pool.variants[variant];
    if (!bucket) continue;
    const affordable = Math.floor(byteBudget / INSTANCE_MATRIX_BYTES);
    const capped = Math.min(required, Math.max(0, affordable));
    if (capped <= 0) continue;
    bucket.reservedCapacity = Math.max(bucket.reservedCapacity | 0, capped);
    reservedCapacity += bucket.reservedCapacity;
    byteBudget -= capped * INSTANCE_MATRIX_BYTES;
    if (bucket.mesh && bucket.capacity < bucket.reservedCapacity) {
      ensureCapacity(pool, bucket, bucket.reservedCapacity);
    }
    reserved = true;
  }
  if (pool.stats) pool.stats.reservedCapacityCount = reservedCapacity;
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
 * @param {Array<number>} [requiredByVariant] - optional per-variant capacity floor (the cook's
 *   field census). A chunk created or rebound here must not come up short of it, and a rebind
 *   must never shrink a bucket the reserve pass already sized — either mistake hands the
 *   power-of-two rebuild (a fresh instanceMatrix bufferData) back to a live registration.
 */
export function warmAsteroidInstanceVariants(pool, resources, requiredByVariant) {
  if (!pool || pool.disposed || !Array.isArray(resources)) return 0;
  let warmed = 0;
  for (const res of resources) {
    const variant = res && (res.variant | 0);
    const bucket = variant >= 0 && variant < pool.variants.length ? pool.variants[variant] : null;
    if (!bucket || !res.geometry || !res.material) continue;
    // A live bucket's bound resources are authoritative — records already draw through the
    // chunk built from them. Only an empty bucket may rebind (e.g. a warm landed before the
    // rock surface library decoded and the leaf material was re-skinned in place). Exception:
    // a bucket that bound a BARE rock material before the library decoded must follow the
    // reskin even with records — upgradeBareRockMaterials already rebound every registered
    // leaf's material object to this exact resource, so the bucket reference is the stale one.
    // Without it the chunk keeps drawing the mapless variant and its depth program links cold
    // the first time the shadow camera covers a pooled rock in flight (Asteroid_368 NOVEL).
    const boundBare = bucket.material && bucket.material.userData
      && bucket.material.userData.spacefaceBareRock;
    if (bucket.records.length > 0 && !(boundBare && bucket.geometry === res.geometry)) continue;
    if (bucket.mesh && bucket.geometry === res.geometry && bucket.material === res.material) continue;
    bucket.geometry = res.geometry;
    bucket.material = res.material;
    if (bucket.records.length > 0) {
      // Live chunk: swap the material in place — the instanceMatrix buffer and committed
      // record slots are untouched, so no rebuild or fresh bufferData is needed.
      if (bucket.mesh) bucket.mesh.material = res.material;
      warmed += 1;
      continue;
    }
    // Create/rebind at the larger of the bucket's current capacity and the field census —
    // never below either: a bare 1 would shrink a reserved (or previously grown) empty bucket
    // back to the 64 default and return its next growth rebuild to a mid-round registration.
    const censusFloor = Array.isArray(requiredByVariant)
      ? Math.max(0, Math.trunc(Number(requiredByVariant[variant]) || 0)) : 0;
    ensureCapacity(pool, bucket, Math.max(1, bucket.capacity | 0, censusFloor), bucket.mesh != null);
    if (bucket.mesh) warmed += 1;
  }
  return warmed;
}

/**
 * Keyed-bucket counterpart of warmAsteroidInstanceVariants: publish one InstancedMesh per
 * shared (geometry, material) pair a non-common body or stamped detail child can register
 * with — valuable-ore bodies, optic cell skins, veins, crystal shards and prism inclusions —
 * so their chunk and its instanced program exist before the first live registration rather
 * than linking inside a presented frame.
 * @param {object} pool
 * @param {Array<{key:string, geometry:object, material:object, castShadow?:boolean, receiveShadow?:boolean}>} resources
 * @param {Map<string, number>} [requiredByKey] - optional per-logical-key capacity floor
 */
export function warmAsteroidInstanceKeys(pool, resources, requiredByKey) {
  if (!pool || pool.disposed || !Array.isArray(resources)) return 0;
  let warmed = 0;
  for (const res of resources) {
    if (!res || !res.geometry || !res.material) continue;
    const key = `${res.geometry.uuid}|${res.material.uuid}`;
    const logical = res.key || key;
    const floor = requiredByKey
      ? Math.max(0, Math.trunc(Number(typeof requiredByKey.get === 'function' ? requiredByKey.get(logical) : requiredByKey[logical]) || 0))
      : 0;
    let bucket = pool.keyed.get(key);
    if (!bucket) {
      bucket = createKeyedBucket(key, res.geometry, res.material, res.castShadow, res.receiveShadow, res.key || key);
      pool.keyed.set(key, bucket);
      pool.stats.keyed.push(bucket.stats);
    } else if (bucket.mesh && bucket.capacity >= Math.max(1, floor)) {
      // Bound resources are authoritative — an identical re-warm is a no-op, not a rebuild.
      continue;
    }
    ensureCapacity(pool, bucket, Math.max(1, bucket.capacity | 0, floor), bucket.mesh != null);
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
  stats.registeredDetails = pool.byDetail.size;
  stats.matrixUploads = 0;
  stats.matrixReuses = 0;
  stats.matrixEvaluations = 0;
  stats.shadowMatrixUploads = 0;

  if (canReuseStaticSubmission) {
    stats.matrixReuses = stats.visibleBatches;
    for (let variant = 0; variant < pool.variants.length; variant++) {
      const variantStats = stats.variants[variant];
      variantStats.uploads = 0;
      variantStats.reuses = variantStats.submitted > 0 ? 1 : 0;
    }
    for (const bucketStats of stats.keyed) {
      bucketStats.uploads = 0;
      bucketStats.reuses = bucketStats.submitted > 0 ? 1 : 0;
    }
    return stats;
  }

  const viewFrustumReady = prepareFrustum(options.camera, _viewProjection, _viewFrustum);
  const shadowFrustumReady = prepareFrustum(options.shadowCamera, _shadowProjection, _shadowFrustum);
  _syncRootsSeen.clear();
  stats.submitted = 0;
  stats.visibleBatches = 0;

  let retiring = false;
  for (let variant = 0; variant < pool.variants.length; variant++) {
    const bucket = pool.variants[variant];
    syncPoolBucket(pool, bucket, stats.variants[variant], viewFrustumReady, shadowFrustumReady);
    if (settleRetiringBucketMesh(pool, bucket)) retiring = true;
  }
  for (const bucket of pool.keyed.values()) {
    syncPoolBucket(pool, bucket, bucket.stats, viewFrustumReady, shadowFrustumReady);
    if (settleRetiringBucketMesh(pool, bucket)) retiring = true;
  }
  // A bucket bridging a growth stays off the static fast path so the settle check runs each
  // sync; the outgoing batch is released the frame its replacement clears the admission latch.
  pool.dirty = retiring;
  return stats;
}

// Longest an outgoing batch may bridge a pending replacement. The latch normally clears in a
// few presents; this only bounds a replacement whose admission never settles.
const RETIRING_BATCH_MAX_SYNCS = 300;

/**
 * Release a bucket's outgoing batch once its replacement is drawable (pipelinesPending cleared by
 * the admission latch) or the bridge has run its course. Returns true while still bridging.
 */
function settleRetiringBucketMesh(pool, bucket) {
  const retiring = bucket.retiring;
  if (!retiring) return false;
  const next = bucket.mesh;
  const nextPending = !!(next && next.userData && next.userData.pipelinesPending === true);
  retiring.frames += 1;
  if (nextPending && retiring.frames < RETIRING_BATCH_MAX_SYNCS) return true;
  // Cap hit with the replacement still latched: releasing blind lands the
  // family-wide blink exactly when the admission lane is wedged — the defect
  // this bridge exists to prevent. Re-kick the admission once (the lane
  // dedupes a live request) and run one more window; a lane that truly never
  // settles still releases at the second cap.
  if (nextPending && retiring.rekick !== true && typeof pool.onMeshCreated === 'function') {
    retiring.rekick = true;
    retiring.frames = 0;
    try { pool.onMeshCreated(next); } catch (_) { /* admission must never break the sync pass */ }
    return true;
  }
  bucket.retiring = null;
  disposeOwnedInstanceMesh(retiring.mesh, retiring.owner, pool.scene);
  return false;
}

function syncPoolBucket(pool, bucket, variantStats, viewFrustumReady, shadowFrustumReady) {
  const stats = pool.stats;
  variantStats.registered = bucket.records.length;
  variantStats.submitted = 0;
  variantStats.capacity = bucket.capacity;
  variantStats.uploads = 0;
  variantStats.reuses = 0;
  if (!bucket.mesh) return;

  let submitted = 0;
  let matrixDirty = false;
  let shadowDirty = false;
  if (bucket.dynamicBufferOwner && bucket.dynamicBufferOwner.invalid
    && !recoverRetiredBucket(pool, bucket, variantStats)) {
    // Out of rebuilds: the rocks still exist, so they are drawn one by one. Never nothing.
    drawBucketLeavesDirectly(bucket);
    variantStats.submitted = 0;
    return;
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
    // A LOD-hidden detail leaf (hlod parks it via poolLeafVisible, not visible) submits
    // nothing while the hide holds.
    if (record.detail === true && leaf.userData && leaf.userData.poolLeafVisible === false) continue;
    if (!root.parent || root.visible === false) continue;
    // Per-record leaf.updateWorldMatrix(true, false) re-walks the whole ancestor chain for every
    // record — updateWorldMatrix has no dirty gate. One (true, true) refresh per owner root
    // covers the shared chain and every leaf hanging under it; the leaf-local call below then
    // only recomposes the leaf itself.
    if (!_syncRootsSeen.has(root)) {
      _syncRootsSeen.add(root);
      root.updateWorldMatrix(true, true);
    }
    leaf.updateWorldMatrix(false, false);
    // With no live shadow ortho the upload cannot move a readable texel anyway, so records
    // stay shadow-relevant whenever the shadow frustum was not tested.
    let recordInShadow = true;
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
      recordInShadow = !shadowFrustumReady || inShadow;
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
          if (recordInShadow) shadowDirty = true;
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
    if (shadowDirty) stats.shadowMatrixUploads++;
  } else if (submitted > 0) {
    stats.matrixReuses++;
    variantStats.reuses++;
  }
  variantStats.submitted = submitted;
  stats.submitted += submitted;
  if (submitted > 0) stats.visibleBatches++;
  bucket.entityIds.length = submitted;
}

export function resolveAsteroidInstanceEntityId(pool, object, instanceId) {
  if (!pool || pool.disposed || !object || !object.userData || !object.userData.asteroidInstancePool) return null;
  const bucket = object.userData.asteroidInstanceBucket
    || pool.variants[object.userData.asteroidInstanceVariant | 0];
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
  for (const bucket of allBuckets(pool)) {
    for (const record of bucket.records) {
      const leaf = record.leaf;
      if (!leaf) continue;
      if (record.detail === true) {
        const ud = leaf.userData;
        leaf.visible = !ud || ud.poolLeafVisible !== false;
        if (ud) delete ud.poolLeafVisible;
      } else {
        leaf.visible = true;
      }
      if (leaf.userData) leaf.userData.asteroidInstanceAdopted = false;
    }
    bucket.records.length = 0;
    bucket.entityIds.length = 0;
    if (bucket.mesh) {
      if (bucket.dynamicBufferOwner) commitDynamicBufferOwner(bucket.dynamicBufferOwner, 0);
      else bucket.mesh.count = 0;
      bucket.mesh.visible = false;
    }
    // A cleared pool draws nothing: the bridging batch goes with its records.
    if (bucket.retiring) {
      const retiring = bucket.retiring;
      bucket.retiring = null;
      disposeOwnedInstanceMesh(retiring.mesh, retiring.owner, pool.scene);
    }
  }
  pool.byEntity.clear();
  pool.byDetail.clear();
  pool.byDetailOwner.clear();
  pool.dirty = true;
}

export function disposeAsteroidInstancePool(pool) {
  if (!pool || pool.disposed) return false;
  clearAsteroidInstancePool(pool);
  const scene = pool.scene;
  for (const bucket of allBuckets(pool)) {
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
  pool.keyed.clear();
  pool.byEntity.clear();
  pool.byDetail.clear();
  pool.byDetailOwner.clear();
  pool.stats.registered = 0;
  pool.stats.registeredDetails = 0;
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
  for (const keyedStats of pool.stats.keyed) {
    keyedStats.registered = 0;
    keyedStats.submitted = 0;
    keyedStats.capacity = 0;
    keyedStats.uploads = 0;
    keyedStats.reuses = 0;
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
    const leaf = record && record.leaf;
    if (!leaf) continue;
    if (record.detail === true) {
      // A parked detail leaf draws directly again under its own hlod state: drop the
      // adoption flag once so projected-detail LOD writes `visible`, not the proxy field.
      // Guarded — hlod may already own `visible` on a repeat call and must not be stomped.
      const ud = leaf.userData;
      if (ud && ud.asteroidInstanceAdopted === true) {
        leaf.visible = ud.poolLeafVisible !== false;
        delete ud.poolLeafVisible;
        ud.asteroidInstanceAdopted = false;
      }
    } else {
      leaf.visible = true;
    }
  }
}

function ensureCapacity(pool, bucket, required, rebuild = false) {
  const need = Math.max(required | 0, bucket.reservedCapacity | 0);
  if (!rebuild && bucket.mesh && bucket.capacity >= need) return;
  const capacity = Math.max(INITIAL_CAPACITY, nextPowerOfTwo(Math.max(need, 1)));
  const previous = bucket.mesh;
  const previousCapacity = bucket.capacity | 0;
  const previousOwner = bucket.dynamicBufferOwner;
  const mesh = new THREE.InstancedMesh(bucket.geometry, bucket.material, capacity);
  const isVariantBucket = bucket.variant >= 0;
  if (!isVariantBucket && bucket.chunkIndex === undefined) {
    bucket.chunkIndex = pool.nextKeyedIndex++;
  }
  mesh.name = isVariantBucket
    ? `SF_CommonRockInstances_v${bucket.variant}`
    : `SF_KeyedAsteroidInstances_${bucket.chunkIndex}`;
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false;
  // An authored-cast family first minted mid-session may never have entered the warm
  // census — minting the flag straight on cold-links its depth variant inside the first
  // presented shadow refresh. Mint withheld while a live depth-stage latch can queue the
  // variant's arm (the arm's restore lands the authored flag); pools with no latch —
  // previews, tests — keep the immediate authored mint.
  mesh.castShadow = bucket.castShadow !== false
    && !(pool.shadowStageGate && pool.shadowStageGate() === true);
  mesh.receiveShadow = bucket.receiveShadow !== false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.userData.asteroidInstancePool = true;
  if (bucket.castShadow !== false) mesh.userData.sfPoolCastAuthored = true;
  if (isVariantBucket) mesh.userData.asteroidInstanceVariant = bucket.variant;
  else mesh.userData.asteroidInstanceBucket = bucket;
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
  // Only one retiring batch per bucket: a second growth while the first replacement is still
  // pending releases the older batch now (its rocks are already covered by the pending one).
  if (bucket.retiring) {
    const stale = bucket.retiring;
    bucket.retiring = null;
    disposeOwnedInstanceMesh(stale.mesh, stale.owner, pool.scene);
  }
  if (previous) {
    // OWNER 2026-09-29 ("asteroids on screen blip gone and come back"): growing a bucket used to
    // dispose the drawing batch on the spot while its replacement sat hidden behind the
    // pipeline-admission latch (count 0, then bloom's unready-drawable hide) for however many
    // presents the compile → residency → touch chain took — every rock of that kind vanished
    // together and came back. Keep the outgoing batch drawing its last committed matrices until
    // the replacement clears the latch (settleRetiringBucketMesh, per sync), then release it.
    // A rebuild after a retired buffer owner has nothing drawable to keep; a pool without the
    // admission latch (tests, previews) shows the new batch immediately, so nothing to bridge.
    const keepDrawing = !rebuild
      && typeof pool.onMeshCreated === 'function'
      && previous.visible === true
      && (previous.count | 0) > 0
      && previous.parent === pool.scene
      && !(previousOwner && previousOwner.invalid);
    if (keepDrawing) {
      bucket.retiring = { mesh: previous, owner: previousOwner, frames: 0 };
    } else {
      disposeOwnedInstanceMesh(previous, previousOwner, pool.scene);
    }
  }
  if (previous && capacity > previousCapacity && pool.stats) {
    pool.stats.powerOfTwoRebuilds = (pool.stats.powerOfTwoRebuilds | 0) + 1;
  }
  bucket.mesh = mesh;
  bucket.capacity = capacity;
  pool.dirty = true;
  if (pool.scene) {
    pool.scene.add(mesh);
    const notes = pool.scene.userData && pool.scene.userData.shadowMeshNotes;
    if (notes && typeof notes.added === 'function') notes.added(mesh);
  }
  // The instanced program variant this mesh needs has never been linked when the mesh is new:
  // without the admission latch its first visible draw links it inside the presented pass.
  if (typeof pool.onMeshCreated === 'function') {
    try { pool.onMeshCreated(mesh); } catch { /* admission must never break the sync pass */ }
  }
  bucket.dynamicBufferOwner = registerDynamicBufferOwner(pool.scene, {
    id: isVariantBucket ? `common-rock-instances-v${bucket.variant}` : `keyed-asteroid-instances:${bucket.key}`,
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
  if (mesh.parent === scene) {
    scene.remove(mesh);
    const notes = scene.userData && scene.userData.shadowMeshNotes;
    if (notes && typeof notes.removed === 'function') notes.removed(mesh);
  }
  if (mesh.instanceMatrix && typeof mesh.instanceMatrix.dispose === 'function' && dynamicBufferOwner) {
    mesh.instanceMatrix.dispose();
  }
  // InstancedMesh.dispose() only dispatches the dispose event — borrowed source
  // geometry/material stay source-owned — but three's onInstancedMeshDispose reads
  // mesh.instanceMatrix unconditionally (WebGLAttributes.remove dereferences the
  // attribute before checking its cache entry). Dispose while attached, then clear.
  if (typeof mesh.dispose === 'function') mesh.dispose();
  mesh.instanceMatrix = null;
  mesh.geometry = null;
  mesh.material = null;
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

// Chase follow damping moves the camera every frame by <<1 WU. Exact matrix equality
// marked cameraDirty continuously, forcing every registered rock through frustum +
// matrixWorld evaluate under prepareFrame → syncAsteroidInstancePool. Quantize
// translation to 0.25 WU and basis/projection to 1e-3 (same contract as authored
// instance cull #53) so quiet micro-moves reuse the static submission path; real
// pans/zooms still dirty. Soft-GPU fps not claimed.
const ASTEROID_CAMERA_CULL_POS_QUANT_WU = 0.25;
const ASTEROID_CAMERA_CULL_BASIS_EPS = 1e-3;
// Bench-only: force exact matrix compare (pre-quantize residual).
let _asteroidCameraCullExactCompare = false;
export function setAsteroidInstanceCameraCullExactCompare(enabled) {
  _asteroidCameraCullExactCompare = enabled === true;
  return _asteroidCameraCullExactCompare;
}
export function getAsteroidInstanceCameraCullExactCompare() {
  return _asteroidCameraCullExactCompare === true;
}

function quantizeAsteroidCullCameraValue(value, kind, matrixIndex = -1) {
  const n = Number(value) || 0;
  if (kind === 'pos') {
    return Math.round(n / ASTEROID_CAMERA_CULL_POS_QUANT_WU) * ASTEROID_CAMERA_CULL_POS_QUANT_WU;
  }
  if (kind === 'world' && (matrixIndex === 12 || matrixIndex === 13 || matrixIndex === 14)) {
    return Math.round(n / ASTEROID_CAMERA_CULL_POS_QUANT_WU) * ASTEROID_CAMERA_CULL_POS_QUANT_WU;
  }
  return Math.round(n / ASTEROID_CAMERA_CULL_BASIS_EPS) * ASTEROID_CAMERA_CULL_BASIS_EPS;
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
  const exact = _asteroidCameraCullExactCompare;
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
    const kind = index <= 2 ? 'pos' : 'basis';
    const value = exact ? (Number(raw) || 0) : quantizeAsteroidCullCameraValue(raw, kind);
    if (values[index] !== value) changed = true;
    values[index] = value;
  }
  for (let index = 0; index < 16; index++) {
    const raw = world ? Number(world[index]) || 0 : 0;
    const value = exact ? raw : quantizeAsteroidCullCameraValue(raw, 'world', index);
    if (values[index + 13] !== value) changed = true;
    values[index + 13] = value;
  }
  for (let index = 0; index < 16; index++) {
    const raw = projection ? Number(projection[index]) || 0 : 0;
    const value = exact ? raw : quantizeAsteroidCullCameraValue(raw, 'basis');
    if (values[index + 29] !== value) changed = true;
    values[index + 29] = value;
  }
  return changed;
}

/**
 * Portable microbench harness for asteroid-instance camera cull quantize.
 * Soft-GPU fps not claimed. exactCameraDirty=true restores pre-quantize residual.
 */
export function runAsteroidInstanceCameraDirtyMicrobench(options = {}) {
  const rockCount = Math.max(2, Math.floor(Number(options.rockCount) || 80));
  const frames = Math.max(10, Math.floor(Number(options.frames) || 2000));
  const jitterWu = Number.isFinite(Number(options.jitterWu)) ? Number(options.jitterWu) : 0.05;
  const exact = options.exactCameraDirty === true;
  const scene = new THREE.Scene();
  const pool = createAsteroidInstancePool(scene);
  const geometries = new Array(ASTEROID_INSTANCE_VARIANT_COUNT);
  for (let v = 0; v < ASTEROID_INSTANCE_VARIANT_COUNT; v++) {
    geometries[v] = new THREE.IcosahedronGeometry(1, 1);
  }
  const material = new THREE.MeshStandardMaterial({ color: 0x4a4540 });
  const roots = [];
  for (let id = 1; id <= rockCount; id++) {
    const variant = id % ASTEROID_INSTANCE_VARIANT_COUNT;
    const root = new THREE.Group();
    root.position.set((id % 20) * 40, 0, Math.floor(id / 20) * 40);
    const leaf = new THREE.Mesh(geometries[variant], material);
    leaf.scale.setScalar(8);
    leaf.userData.asteroidInstanceTypeId = ASTEROID_INSTANCE_TYPE_ID;
    leaf.userData.asteroidInstanceVariant = variant;
    root.userData.asteroidInstanceBody = leaf;
    root.add(leaf);
    scene.add(root);
    roots.push(root);
    registerAsteroidBaseLeaf(pool, { id, type: 'asteroid' }, root);
  }
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 8000);
  camera.position.set(0, 120, 180);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  const shadowCamera = new THREE.OrthographicCamera(-400, 400, 400, -400, 0.1, 4000);
  shadowCamera.position.set(80, 200, 80);
  shadowCamera.lookAt(0, 0, 0);
  shadowCamera.updateMatrixWorld(true);
  shadowCamera.updateProjectionMatrix();

  const priorExact = _asteroidCameraCullExactCompare;
  _asteroidCameraCullExactCompare = exact;
  try {
    pool.cameraState.view.initialized = false;
    pool.cameraState.view.values.fill(0);
    pool.cameraState.shadow.initialized = false;
    pool.cameraState.shadow.values.fill(0);
    pool.dirty = true;
    syncAsteroidInstancePool(pool, { camera, shadowCamera, recordsDirty: false });
    pool.dirty = false;

    let dirtyFrames = 0;
    let matrixEvals = 0;
    let matrixReuses = 0;
    const t0 = performance.now();
    for (let f = 0; f < frames; f++) {
      camera.position.x += jitterWu * Math.sin(f * 0.17);
      camera.position.z += jitterWu * 0.5 * Math.cos(f * 0.13);
      camera.updateMatrixWorld(true);
      // Capture pre-sync dirty via a probe: reset initialized false would cheat. Instead
      // compare cameraState after sync — if reuse path, matrixEvaluations stay 0.
      const beforeEvals = pool.stats.matrixEvaluations;
      const stats = syncAsteroidInstancePool(pool, { camera, shadowCamera, recordsDirty: false });
      const evals = (stats && stats.matrixEvaluations | 0) - (beforeEvals | 0);
      // stats.matrixEvaluations is absolute counter reset each sync — read directly.
      if ((stats.matrixEvaluations | 0) > 0) dirtyFrames++;
      matrixEvals += stats.matrixEvaluations | 0;
      matrixReuses += stats.matrixReuses | 0;
    }
    const ms = performance.now() - t0;
    return {
      rockCount,
      frames,
      jitterWu,
      exact,
      ms,
      dirtyFrames,
      dirtyRate: dirtyFrames / frames,
      matrixEvals,
      matrixReuses,
    };
  } finally {
    _asteroidCameraCullExactCompare = priorExact;
    disposeAsteroidInstancePool(pool);
    for (const g of geometries) g.dispose();
    material.dispose();
  }
}
