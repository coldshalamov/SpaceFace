import * as THREE from 'three';

const PAGE_INSTANCE_CAPACITY = 128;
const PAGE_GEOMETRY_RESERVE = 8;
const MIN_PAGE_VERTEX_CAPACITY = 8192;
const MIN_PAGE_INDEX_CAPACITY = 16384;
const MATRIX_EPSILON = 0.00001;
const IDENTITY_MATRIX = new THREE.Matrix4();
const PAGE_INVERSE = new THREE.Matrix4();
const PAGE_LOCAL_MATRIX = new THREE.Matrix4();

const worlds = new WeakMap();
const ownerStates = new WeakMap();

/**
 * Allocate one retained object handle in an opaque, exact-material BatchedMesh page.
 * Geometry is copied into the page once; the source Object3D remains the authoritative transform,
 * visibility, LOD, and damage handle for the owning ship.
 */
export function allocateOpaqueBatchInstance(scene, owner, proxy, geometry, material, options = {}) {
  validateAllocation(scene, owner, proxy, geometry, material);
  const world = getOrCreateWorld(scene);
  const geometryKey = options.geometryKey
    || geometry.userData?.spacefaceBatchKey
    || geometry.uuid;
  const materialKey = material.userData?.spacefaceBatchKey || material.uuid;
  const layoutKey = geometryLayoutKey(geometry);
  const bucketKey = `${materialKey}|${layoutKey}`;
  let bucket = world.buckets.get(bucketKey);
  if (!bucket) {
    bucket = {
      key: bucketKey,
      materialKey,
      layoutKey,
      material,
      pages: [],
      nextOrdinal: 0,
    };
    world.buckets.set(bucketKey, bucket);
  } else if (bucket.material !== material) {
    throw new Error(`Opaque batch material key collision: ${materialKey}`);
  }

  const dimensions = geometryDimensions(geometry);
  const page = findPage(bucket, geometryKey, dimensions)
    || createPage(world, bucket, dimensions, options.label || geometry.name || 'Opaque');
  let geometryEntry = page.geometries.get(geometryKey);
  if (!geometryEntry) {
    const geometryId = page.mesh.addGeometry(geometry);
    geometryEntry = {
      id: geometryId,
      key: geometryKey,
      source: geometry,
      signature: exactGeometrySignature(geometry),
      refs: 0,
    };
    page.geometries.set(geometryKey, geometryEntry);
    page.geometryById.set(geometryId, geometryEntry);
    page.userData.spacefaceBatchPageGeometryCount = page.geometries.size;
    disposeDerivedCandidate(geometry);
  } else {
    if (geometryEntry.signature !== exactGeometrySignature(geometry)) {
      throw new Error(`Opaque batch geometry key collision: ${geometryKey}`);
    }
    if (geometryEntry.source !== geometry) disposeDerivedCandidate(geometry);
  }

  const instanceId = page.mesh.addInstance(geometryEntry.id);
  page.mesh.setMatrixAt(instanceId, IDENTITY_MATRIX);
  page.mesh.setVisibleAt(instanceId, false);
  const slot = {
    owner,
    proxy,
    page,
    geometryEntry,
    instanceId,
    released: false,
    visible: false,
    matrixInitialized: false,
    matrixElements: new Float32Array(16),
  };
  page.slots.set(instanceId, slot);
  geometryEntry.refs++;

  let ownerState = world.owners.get(owner);
  if (!ownerState) {
    ownerState = { world, owner, slots: new Set(), dirty: true, submittedCount: 0 };
    world.owners.set(owner, ownerState);
    ownerStates.set(owner, ownerState);
  }
  ownerState.slots.add(slot);
  ownerState.dirty = true;
  slot.ownerState = ownerState;
  publishPageCounts(page);

  const release = () => releaseSlot(slot);
  return { release, instanceId, geometryId: geometryEntry.id, page: page.mesh };
}

export function markOpaqueBatchOwnerDirty(owner) {
  const ownerState = owner && ownerStates.get(owner);
  if (ownerState) ownerState.dirty = true;
}

export function releaseOpaqueBatchOwner(owner) {
  const ownerState = owner && ownerStates.get(owner);
  if (!ownerState) return;
  for (const slot of [...ownerState.slots]) releaseSlot(slot);
}

export function syncOpaqueBatchWorld(scene, options = {}) {
  const world = scene && worlds.get(scene);
  if (!world) return emptyDiagnostics();
  const stats = createDiagnostics(world);
  const entityFrame = options.entityFrame;
  const authoredRecords = Array.isArray(options.authoredRecords)
    ? options.authoredRecords
    : (Array.isArray(entityFrame?.authored) ? entityFrame.authored : null);
  const frameBounded = !!(Number.isFinite(entityFrame?.frameId) && authoredRecords);
  stats.frameBounded = frameBounded;

  if (frameBounded) syncBoundedFrame(world, authoredRecords, stats);
  else syncFallback(world, stats);
  finalizeDiagnostics(world, stats);
  world.stats = stats;
  return { ...stats };
}

export function getOpaqueBatchWorldDiagnostics(scene) {
  const world = scene && worlds.get(scene);
  if (!world) return emptyDiagnostics();
  const stats = createDiagnostics(world);
  stats.matrixDirtyPages = world.stats.matrixDirtyPages || 0;
  stats.matrixUploads = world.stats.matrixUploads || 0;
  stats.matrixReuses = world.stats.matrixReuses || 0;
  stats.visibilityChanges = world.stats.visibilityChanges || 0;
  stats.frameBounded = world.stats.frameBounded === true;
  stats.ownersVisited = world.stats.ownersVisited || 0;
  stats.slotsVisited = world.stats.slotsVisited || 0;
  finalizeDiagnostics(world, stats);
  return { ...stats };
}

/**
 * Return exact USE_BATCHING compile subjects without moving the live pages out of the scene.
 * Every child is an Object3D, never an array; clear() also releases the temporary GPU resources.
 */
export function createOpaqueBatchPipelineAdmission(scene, owner) {
  const world = scene && worlds.get(scene);
  const ownerState = world && world.owners.get(owner);
  if (!ownerState?.slots.size) return null;

  const admission = new THREE.Group();
  admission.name = 'SF_AuthoredOpaqueBatchPipelineAdmission';
  const admittedPages = new Map();
  for (const slot of ownerState.slots) {
    const page = slot.page;
    if (admittedPages.has(page)) continue;
    const geometryEntries = [...ownerState.slots]
      .filter((candidate) => candidate.page === page)
      .map((candidate) => candidate.geometryEntry);
    const uniqueGeometries = [...new Map(geometryEntries.map((entry) => [entry.id, entry])).values()];
    const vertexCount = uniqueGeometries.reduce((sum, entry) => sum + geometryDimensions(entry.source).vertices, 0);
    const indexCount = uniqueGeometries.reduce((sum, entry) => sum + geometryDimensions(entry.source).indices, 0);
    const subject = new THREE.BatchedMesh(
      Math.max(1, uniqueGeometries.length),
      Math.max(1, vertexCount),
      Math.max(0, indexCount),
      page.material,
    );
    subject.name = `SF_AuthoredOpaqueBatchPipeline_${page.label}`;
    subject.frustumCulled = false;
    subject.perObjectFrustumCulled = true;
    subject.sortObjects = true;
    for (const entry of uniqueGeometries) {
      const geometryId = subject.addGeometry(entry.source);
      const instanceId = subject.addInstance(geometryId);
      subject.setMatrixAt(instanceId, IDENTITY_MATRIX);
    }
    subject.userData.spacefaceOpaqueBatchPipelineAdmission = true;
    subject.userData.spacefaceOpaqueBatchSourcePageKey = page.bucket.key;
    admission.add(subject);
    admittedPages.set(page, subject);
  }
  if (!admission.children.length) return null;

  const clearChildren = admission.clear.bind(admission);
  let cleared = false;
  admission.clear = () => {
    if (!cleared) {
      cleared = true;
      for (const subject of admittedPages.values()) subject.dispose();
      admittedPages.clear();
    }
    clearChildren();
    return admission;
  };
  return admission;
}

function validateAllocation(scene, owner, proxy, geometry, material) {
  if (!scene?.isScene) throw new Error('Opaque batch allocation requires a THREE.Scene');
  if (!owner?.isObject3D || !proxy?.isObject3D) throw new Error('Opaque batch allocation requires Object3D owner and proxy');
  if (!geometry?.isBufferGeometry || !geometry.getAttribute('position')) {
    throw new Error('Opaque batch allocation requires positioned BufferGeometry');
  }
  if (!material?.isMaterial) throw new Error('Opaque batch allocation requires one material');
  if (material.transparent === true || Number(material.transmission) > 0) {
    throw new Error('Transparent material cannot enter the opaque batch world');
  }
}

function getOrCreateWorld(scene) {
  let world = worlds.get(scene);
  if (!world) {
    world = {
      scene,
      buckets: new Map(),
      pages: new Set(),
      owners: new Map(),
      activeOwners: new Set(),
      nextOwners: new Set(),
      stats: emptyDiagnostics(),
    };
    worlds.set(scene, world);
  }
  return world;
}

function geometryLayoutKey(geometry) {
  const attributes = Object.keys(geometry.attributes).sort().map((name) => {
    const attribute = geometry.getAttribute(name);
    return [
      name,
      attribute.itemSize,
      attribute.normalized ? 1 : 0,
      attribute.array?.constructor?.name || 'Array',
      attribute.isInterleavedBufferAttribute ? 1 : 0,
    ].join(':');
  });
  return `${geometry.getIndex() ? 'indexed' : 'nonindexed'}|${attributes.join('|')}`;
}

function exactGeometrySignature(geometry) {
  const dimensions = geometryDimensions(geometry);
  const sphere = geometry.boundingSphere;
  const box = geometry.boundingBox;
  return [
    geometryLayoutKey(geometry),
    dimensions.vertices,
    dimensions.indices,
    geometry.drawRange?.start ?? 0,
    geometry.drawRange?.count ?? Infinity,
    sphere ? `${sphere.center.x},${sphere.center.y},${sphere.center.z},${sphere.radius}` : 'sphere:none',
    box ? `${box.min.x},${box.min.y},${box.min.z},${box.max.x},${box.max.y},${box.max.z}` : 'box:none',
  ].join('|');
}

function geometryDimensions(geometry) {
  return {
    vertices: geometry.getAttribute('position').count,
    indices: geometry.getIndex()?.count || 0,
  };
}

function findPage(bucket, geometryKey, dimensions) {
  for (const page of bucket.pages) {
    if (page.slots.size >= page.mesh.maxInstanceCount) continue;
    if (page.geometries.has(geometryKey)) return page;
    if (page.mesh.unusedVertexCount < dimensions.vertices) continue;
    if (page.mesh.unusedIndexCount < dimensions.indices) continue;
    return page;
  }
  return null;
}

function createPage(world, bucket, dimensions, label) {
  const maxVertices = Math.max(MIN_PAGE_VERTEX_CAPACITY, dimensions.vertices * PAGE_GEOMETRY_RESERVE);
  const maxIndices = dimensions.indices > 0
    ? Math.max(MIN_PAGE_INDEX_CAPACITY, dimensions.indices * PAGE_GEOMETRY_RESERVE)
    : 0;
  const mesh = new THREE.BatchedMesh(PAGE_INSTANCE_CAPACITY, maxVertices, maxIndices, bucket.material);
  const ordinal = bucket.nextOrdinal++;
  mesh.name = `GLTFKit_OpaqueBatchPage_${label}_${ordinal}`;
  mesh.frustumCulled = false;
  mesh.perObjectFrustumCulled = true;
  mesh.sortObjects = true;
  mesh.castShadow = bucket.material.transparent !== true && bucket.material.depthWrite !== false;
  mesh.receiveShadow = bucket.material.transparent !== true;
  mesh.userData = {
    ...(mesh.userData || {}),
    spacefaceInstancePool: true,
    spacefaceOpaqueBatchPage: true,
    spacefaceOpaqueBatchPageKey: bucket.key,
    spacefaceOpaqueBatchPageLabel: label,
    spacefaceBatchPageCapacity: PAGE_INSTANCE_CAPACITY,
    spacefaceBatchPageActiveInstances: 0,
    spacefaceBatchPageVisibleInstances: 0,
    spacefaceBatchPageGeometryCount: 0,
  };
  mesh.geometry.userData = {
    ...(mesh.geometry.userData || {}),
    spacefaceDerivedStaticBatch: true,
    spacefaceOpaqueBatchPageGeometry: true,
  };
  const page = {
    world,
    bucket,
    mesh,
    material: bucket.material,
    label,
    slots: new Map(),
    geometries: new Map(),
    geometryById: new Map(),
    submittedCount: 0,
    disposed: false,
    userData: mesh.userData,
  };
  bucket.pages.push(page);
  world.pages.add(page);
  world.scene.add(mesh);
  return page;
}

function disposeDerivedCandidate(geometry) {
  if (geometry?.userData?.spacefaceDerivedStaticBatch && !geometry.userData.spacefacePageSourceDisposed) {
    geometry.userData.spacefacePageSourceDisposed = true;
    geometry.dispose();
  }
}

function releaseSlot(slot) {
  if (!slot || slot.released) return;
  slot.released = true;
  const { ownerState, page, geometryEntry, instanceId } = slot;
  if (slot.visible) {
    page.submittedCount = Math.max(0, page.submittedCount - 1);
    ownerState.submittedCount = Math.max(0, ownerState.submittedCount - 1);
  }
  slot.visible = false;
  page.mesh.deleteInstance(instanceId);
  page.slots.delete(instanceId);
  geometryEntry.refs = Math.max(0, geometryEntry.refs - 1);
  ownerState.slots.delete(slot);
  if (!ownerState.slots.size) {
    ownerState.world.owners.delete(ownerState.owner);
    ownerState.world.activeOwners.delete(ownerState.owner);
    ownerState.world.nextOwners.delete(ownerState.owner);
    if (ownerStates.get(ownerState.owner) === ownerState) ownerStates.delete(ownerState.owner);
  }
  if (!page.slots.size) retirePage(page);
  else publishPageCounts(page);
}

function retirePage(page) {
  if (!page || page.disposed || page.slots.size) return;
  page.disposed = true;
  if (page.mesh.parent) page.mesh.parent.remove(page.mesh);
  page.mesh.dispose();
  page.world.pages.delete(page);
  const pageIndex = page.bucket.pages.indexOf(page);
  if (pageIndex >= 0) page.bucket.pages.splice(pageIndex, 1);
  if (!page.bucket.pages.length) page.world.buckets.delete(page.bucket.key);
  page.geometries.clear();
  page.geometryById.clear();
}

function syncBoundedFrame(world, records, stats) {
  const nextOwners = world.nextOwners;
  nextOwners.clear();
  for (const record of records) {
    const owner = record?.mesh;
    const ownerState = owner && world.owners.get(owner);
    if (!ownerState) continue;
    nextOwners.add(owner);
    if (record.renderDirty === true || ownerState.dirty || !world.activeOwners.has(owner)) {
      syncOwner(ownerState, record, false, stats);
    } else {
      stats.matrixReuses += ownerState.submittedCount;
    }
  }
  for (const owner of world.activeOwners) {
    if (nextOwners.has(owner)) continue;
    const ownerState = world.owners.get(owner);
    if (ownerState) syncOwner(ownerState, null, true, stats);
  }
  const previousOwners = world.activeOwners;
  world.activeOwners = nextOwners;
  world.nextOwners = previousOwners;
  world.nextOwners.clear();
}

function syncFallback(world, stats) {
  for (const ownerState of world.owners.values()) syncOwner(ownerState, null, false, stats);
  world.activeOwners.clear();
}

function syncOwner(ownerState, record, forceHidden, stats) {
  stats.ownersVisited++;
  const owner = ownerState.owner;
  const ownerVisible = !forceHidden
    && !!owner.parent
    && record?.visible !== false
    && record?.viewCulled !== true;
  if (ownerVisible) {
    owner.updateWorldMatrix(true, false);
    owner.updateWorldMatrix(false, true);
  }
  for (const slot of ownerState.slots) {
    if (slot.released) continue;
    stats.slotsVisited++;
    const visible = ownerVisible && visibleThroughOwner(slot.proxy, owner);
    setSlotVisible(slot, visible, stats);
    if (!visible) continue;
    slot.page.mesh.updateWorldMatrix(true, false);
    PAGE_INVERSE.copy(slot.page.mesh.matrixWorld).invert();
    PAGE_LOCAL_MATRIX.multiplyMatrices(PAGE_INVERSE, slot.proxy.matrixWorld);
    if (setSlotMatrixIfChanged(slot, PAGE_LOCAL_MATRIX)) stats.matrixUploads++;
    else stats.matrixReuses++;
  }
  ownerState.dirty = false;
}

function visibleThroughOwner(proxy, owner) {
  for (let current = proxy; current; current = current.parent) {
    if (!current.visible) return false;
    if (current === owner) return true;
  }
  return false;
}

function setSlotVisible(slot, visible, stats) {
  if (slot.visible === visible) return;
  slot.visible = visible;
  slot.page.mesh.setVisibleAt(slot.instanceId, visible);
  if (visible) {
    slot.page.submittedCount++;
    slot.ownerState.submittedCount++;
  } else {
    slot.page.submittedCount = Math.max(0, slot.page.submittedCount - 1);
    slot.ownerState.submittedCount = Math.max(0, slot.ownerState.submittedCount - 1);
  }
  stats.visibilityChanges++;
  stats.dirtyPages.add(slot.page);
  publishPageCounts(slot.page);
}

function setSlotMatrixIfChanged(slot, matrix) {
  const elements = matrix.elements;
  let changed = !slot.matrixInitialized;
  if (!changed) {
    for (let index = 0; index < 16; index++) {
      if (Math.abs(slot.matrixElements[index] - elements[index]) > MATRIX_EPSILON) {
        changed = true;
        break;
      }
    }
  }
  if (!changed) return false;
  slot.matrixElements.set(elements);
  slot.matrixInitialized = true;
  slot.page.mesh.setMatrixAt(slot.instanceId, matrix);
  return true;
}

function publishPageCounts(page) {
  page.mesh.visible = page.slots.size > 0 && page.submittedCount > 0;
  page.userData.spacefaceBatchPageActiveInstances = page.slots.size;
  page.userData.spacefaceBatchPageVisibleInstances = page.submittedCount;
  page.userData.spacefaceBatchPageGeometryCount = page.geometries.size;
}

function createDiagnostics(world) {
  const stats = emptyDiagnostics();
  stats.dirtyPages = new Set();
  stats.pages = world.pages.size;
  stats.pipelines = world.buckets.size;
  for (const page of world.pages) {
    stats.geometrySlots += page.geometries.size;
    stats.activeInstanceSlots += page.slots.size;
    if (page.slots.size > 0 && page.slots.size <= 3) stats.tinyPages++;
  }
  return stats;
}

function finalizeDiagnostics(world, stats) {
  for (const page of world.pages) {
    publishPageCounts(page);
    stats.submittedInstanceSlots += page.submittedCount;
    if (page.submittedCount > 0) stats.visiblePages++;
    else stats.offscreenPages++;
  }
  stats.matrixDirtyPages = stats.dirtyPages.size;
  delete stats.dirtyPages;
  stats.averageInstancesPerPage = stats.pages > 0 ? stats.activeInstanceSlots / stats.pages : 0;
}

function emptyDiagnostics() {
  return {
    pages: 0,
    pipelines: 0,
    geometrySlots: 0,
    activeInstanceSlots: 0,
    submittedInstanceSlots: 0,
    visiblePages: 0,
    offscreenPages: 0,
    averageInstancesPerPage: 0,
    tinyPages: 0,
    matrixDirtyPages: 0,
    matrixUploads: 0,
    matrixReuses: 0,
    visibilityChanges: 0,
    frameBounded: false,
    ownersVisited: 0,
    slotsVisited: 0,
  };
}
