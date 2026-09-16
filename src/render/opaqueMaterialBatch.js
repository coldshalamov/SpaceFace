// Fold many tiny same-material InstancedMesh pools into a few BatchedMeshes.
//
// Authored traffic is already instanced, but each unique plate is still its own
// draw. On an Intel iGPU the driver cost of ~200 one-instance draws is the
// missed-vsync tax. BatchedMesh keeps the authored geometry and material and
// submits one multi-draw per material × shadow-lane. Source instance chunks are
// only hidden when every submitted slot made it into the batch.

import * as THREE from 'three';
import { SHADOW_CAST_RADIUS_SQ } from './shadowCasterPolicy.js';
import { isOpaqueInstancePoolMaterial } from './instanceChunkSubmitPolicy.js';
import { materialBatchProgramKey } from './materialBatchKey.js';

export const OPAQUE_BATCH_MAX_INSTANCES = 512;
export const OPAQUE_BATCH_MAX_VERTS = 200000;
export const OPAQUE_BATCH_MAX_INDICES = 400000;
export const OPAQUE_BATCH_INITIAL_VERTS = 4096;
export const OPAQUE_BATCH_INITIAL_INDICES = 8192;

const _matrix = new THREE.Matrix4();
const _color = new THREE.Color();

export function supportsOpaqueMaterialBatch(gl) {
  if (!gl || typeof gl.getExtension !== 'function') return false;
  try {
    return !!gl.getExtension('WEBGL_multi_draw');
  } catch (_) {
    return false;
  }
}

export function materialBatchAttrKey(geometry) {
  if (!geometry || !geometry.attributes) return '';
  const names = Object.keys(geometry.attributes).sort();
  const parts = [];
  for (const name of names) {
    const attr = geometry.getAttribute(name);
    if (!attr) continue;
    parts.push(`${name}:${attr.itemSize}:${attr.normalized ? 1 : 0}`);
  }
  return `${geometry.index ? 'idx' : 'arr'}|${parts.join(',')}`;
}

export function opaqueBatchLane(
  nearestDistanceSq,
  castRadiusSq = SHADOW_CAST_RADIUS_SQ,
  axisDistance = null,
  castRadius = null,
) {
  const axis = Number(axisDistance);
  const axisRadius = Number(castRadius);
  if (axisDistance != null && Number.isFinite(axis)
    && Number.isFinite(axisRadius) && axisRadius > 0) {
    return axis <= axisRadius ? 'cast' : 'nocast';
  }
  const dist = Number(nearestDistanceSq);
  const radiusSq = Number(castRadiusSq);
  const limit = Number.isFinite(radiusSq) && radiusSq > 0 ? radiusSq : SHADOW_CAST_RADIUS_SQ;
  if (Number.isFinite(dist) && dist <= limit) return 'cast';
  return 'nocast';
}

export function shouldConsolidateInstanceChunk(chunk) {
  if (!chunk || !chunk.mesh || !chunk.pool) return false;
  if (!chunk.visibleIndices || chunk.visibleIndices.size === 0) return false;
  if (!chunk.pool.geometry || !chunk.pool.material) return false;
  return isOpaqueInstancePoolMaterial(chunk.pool.material);
}

export function createOpaqueMaterialBatchState() {
  return {
    batches: new Map(),
    consolidatedChunks: new Set(),
    slots: new Map(),
    stats: createBatchStats(),
  };
}

function createBatchStats() {
  return {
    batches: 0,
    instances: 0,
    hiddenChunks: 0,
    skippedChunks: 0,
    matrixWrites: 0,
    colorWrites: 0,
  };
}

export function syncOpaqueMaterialBatches(state, pools, options = {}) {
  const stats = state && state.stats ? state.stats : createBatchStats();
  stats.batches = 0;
  stats.instances = 0;
  stats.hiddenChunks = 0;
  stats.skippedChunks = 0;
  stats.matrixWrites = 0;
  stats.colorWrites = 0;
  if (state) state.stats = stats;
  if (!state) return stats;
  if (options.enabled !== true || !options.scene || !pools) {
    disableOpaqueMaterialBatches(state);
    return stats;
  }

  if (!state.slots) state.slots = new Map();
  for (const slot of state.slots.values()) slot.seen = false;
  for (const batch of state.batches.values()) batch.used = 0;

  for (const pool of pools.values()) {
    for (const chunk of pool.chunks) {
      if (!shouldConsolidateInstanceChunk(chunk)) {
        restoreConsolidatedChunk(state, chunk);
        if (chunk && chunk.visibleIndices && chunk.visibleIndices.size) stats.skippedChunks++;
        continue;
      }
      const hidden = consolidateChunk(state, chunk, options);
      if (hidden) stats.hiddenChunks++;
      else stats.skippedChunks++;
    }
  }

  releaseUnseenSlots(state);
  const refreshBounds = options.refreshBounds === true;
  for (const batch of state.batches.values()) {
    batch.mesh.visible = batch.used > 0;
    if (batch.used > 0) {
      if (refreshBounds || batch.boundsDirty === true) {
        refreshBatchWorldBounds(batch.mesh);
        batch.boundsDirty = false;
      }
      stats.batches++;
      stats.instances += batch.used;
    }
  }
  return stats;
}

function slotKeyFor(chunk, index, lane) {
  return `${chunk.pool.key}|${index}|${lane}`;
}

function matrixHashFromArray(array, offset) {
  let hash = 0;
  for (let i = 0; i < 16; i++) {
    hash = (Math.imul(hash, 31) + ((array[offset + i] * 1024) | 0)) | 0;
  }
  return hash;
}

function consolidateChunk(state, chunk, options) {
  const array = chunk.mesh.instanceMatrix && chunk.mesh.instanceMatrix.array;
  if (!array) return false;
  const playerX = Number(options.playerX) || 0;
  const playerZ = Number(options.playerZ) || 0;
  const planned = [];
  for (const index of chunk.visibleIndices) {
    const offset = index * 16;
    const dx = (array[offset + 12] || 0) - playerX;
    const dz = (array[offset + 14] || 0) - playerZ;
    planned.push({
      index,
      lane: opaqueBatchLane(
        (dx * dx) + (dz * dz),
        options.castRadiusSq,
        Math.max(Math.abs(dx), Math.abs(dz)),
        options.castRadius,
      ),
      offset,
    });
  }
  const created = [];
  for (const item of planned) {
    const key = slotKeyFor(chunk, item.index, item.lane);
    let slot = state.slots.get(key);
    if (!slot) {
      const reservation = reserveBatchInstance(state, chunk, item.lane, options.scene);
      if (!reservation) {
        for (const undo of created) releaseSlot(state, undo.key, undo.slot);
        restoreConsolidatedChunk(state, chunk);
        return false;
      }
      slot = {
        batch: reservation.batch,
        instanceId: reservation.instanceId,
        matrixHash: null,
        colorHash: null,
        seen: true,
      };
      state.slots.set(key, slot);
      created.push({ key, slot });
    }
    slot.seen = true;
    slot.batch.used++;
    const hash = matrixHashFromArray(array, item.offset);
    if (slot.matrixHash !== hash) {
      _matrix.fromArray(array, item.offset);
      slot.batch.mesh.setMatrixAt(slot.instanceId, _matrix);
      slot.matrixHash = hash;
      state.stats.matrixWrites++;
      slot.batch.boundsDirty = true;
    }
    const sourceColor = chunk.pool.material && chunk.pool.material.color;
    const colorHash = sourceColor && typeof sourceColor.getHex === 'function'
      ? sourceColor.getHex()
      : 0;
    if (sourceColor && typeof slot.batch.mesh.setColorAt === 'function' && slot.colorHash !== colorHash) {
      _color.copy(sourceColor);
      slot.batch.mesh.setColorAt(slot.instanceId, _color);
      slot.colorHash = colorHash;
      state.stats.colorWrites++;
    }
    if (slot.visible !== true) {
      try { slot.batch.mesh.setVisibleAt(slot.instanceId, true); } catch (_) {}
      slot.visible = true;
    }
  }
  if (chunk.consolidated !== true) chunk.unconsolidatedCastShadow = chunk.mesh.castShadow === true;
  chunk.consolidated = true;
  state.consolidatedChunks.add(chunk);
  chunk.mesh.visible = false;
  chunk.mesh.castShadow = false;
  return true;
}

function restoreConsolidatedChunk(state, chunk) {
  if (!chunk || !chunk.mesh) return false;
  if (state && chunk.pool && chunk.pool.key != null && state.slots) {
    const prefix = `${chunk.pool.key}|`;
    for (const [key, slot] of [...state.slots]) {
      if (!String(key).startsWith(prefix)) continue;
      releaseSlot(state, key, slot);
    }
  }
  if (chunk.consolidated !== true) return false;
  chunk.consolidated = false;
  chunk.mesh.visible = (chunk.mesh.count || 0) > 0;
  chunk.mesh.castShadow = chunk.unconsolidatedCastShadow === true;
  delete chunk.unconsolidatedCastShadow;
  state?.consolidatedChunks?.delete(chunk);
  return true;
}

function disableOpaqueMaterialBatches(state) {
  for (const chunk of [...(state.consolidatedChunks || [])]) restoreConsolidatedChunk(state, chunk);
  if (state.slots) {
    for (const [key, slot] of [...state.slots]) releaseSlot(state, key, slot);
  }
  for (const batch of state.batches.values()) {
    batch.used = 0;
    hideUnusedInstances(batch);
    batch.mesh.visible = false;
  }
}

function releaseSlot(state, key, slot) {
  if (!slot) return;
  try { slot.batch.mesh.setVisibleAt(slot.instanceId, false); } catch (_) {}
  slot.visible = false;
  if (slot.batch.freeIds) slot.batch.freeIds.push(slot.instanceId);
  state.slots.delete(key);
}

function releaseUnseenSlots(state) {
  for (const [key, slot] of [...state.slots]) {
    if (slot.seen === true) continue;
    releaseSlot(state, key, slot);
  }
}

function reserveBatchInstance(state, chunk, lane, scene) {
  const material = chunk.pool.material;
  const geometry = chunk.pool.geometry;
  const attrKey = materialBatchAttrKey(geometry);
  const key = `${materialBatchProgramKey(material)}|${attrKey}|${lane}`;
  let batch = state.batches.get(key);
  if (!batch) {
    batch = createBatch(material, lane, scene);
    if (!batch) return null;
    state.batches.set(key, batch);
  }
  let geometryId = batch.geometryIds.get(chunk.pool.key);
  if (geometryId == null) {
    const verts = geometry.getAttribute('position') ? geometry.getAttribute('position').count : 0;
    const indices = geometry.index ? geometry.index.count : verts;
    if (!ensureBatchGeometryCapacity(batch.mesh, verts, indices)) return null;
    try {
      geometryId = batch.mesh.addGeometry(geometry);
    } catch (_) {
      return null;
    }
    batch.geometryIds.set(chunk.pool.key, geometryId);
    batch.boundsDirty = true;
  }
  const live = batch.allocated - (batch.freeIds ? batch.freeIds.length : 0);
  if (live >= OPAQUE_BATCH_MAX_INSTANCES) return null;
  let instanceId;
  if (batch.freeIds && batch.freeIds.length) {
    instanceId = batch.freeIds.pop();
    try {
      if (typeof batch.mesh.setGeometryIdAt === 'function') {
        batch.mesh.setGeometryIdAt(instanceId, geometryId);
      }
    } catch (_) {
      return null;
    }
  } else {
    try {
      instanceId = batch.mesh.addInstance(geometryId);
    } catch (_) {
      return null;
    }
    batch.instanceIds.push(instanceId);
    batch.allocated++;
    batch.boundsDirty = true;
  }
  return { batch, instanceId };
}

function createBatch(material, lane, scene) {
  let mesh;
  const batchMaterial = material && typeof material.clone === 'function' ? material.clone() : material;
  if (batchMaterial && batchMaterial.color && typeof batchMaterial.color.setRGB === 'function') {
    batchMaterial.color.setRGB(1, 1, 1);
  }
  try {
    mesh = new THREE.BatchedMesh(
      OPAQUE_BATCH_MAX_INSTANCES,
      OPAQUE_BATCH_MAX_VERTS,
      OPAQUE_BATCH_MAX_INDICES,
      batchMaterial,
    );
  } catch (_) {
    return null;
  }
  mesh.name = `SF_OpaqueBatch_${lane}`;
  mesh.castShadow = lane === 'cast';
  mesh.receiveShadow = true;
  // Parent sphere goes stale after a floating-origin rebase. Per-object
  // culling still skips plates the camera cannot see.
  mesh.frustumCulled = false;
  mesh.perObjectFrustumCulled = true;
  mesh.sortObjects = false;
  mesh.userData.spacefaceOpaqueMaterialBatch = true;
  mesh.userData.spacefaceOpaqueBatchLane = lane;
  scene.add(mesh);
  return {
    mesh,
    lane,
    material,
    geometryIds: new Map(),
    instanceIds: [],
    freeIds: [],
    allocated: 0,
    used: 0,
    boundsDirty: true,
  };
}

function ensureBatchGeometryCapacity(mesh, verts, indices) {
  if (!mesh) return false;
  const needVerts = Math.max(0, Number(verts) || 0);
  const needIndices = Math.max(0, Number(indices) || 0);
  let nextVerts = mesh._maxVertexCount;
  let nextIndices = mesh._maxIndexCount;
  if (mesh.unusedVertexCount < needVerts) {
    nextVerts = Math.min(
      OPAQUE_BATCH_MAX_VERTS,
      Math.max(nextVerts * 2, nextVerts + needVerts),
    );
  }
  if (typeof mesh.unusedIndexCount === 'number' && mesh.unusedIndexCount < needIndices) {
    nextIndices = Math.min(
      OPAQUE_BATCH_MAX_INDICES,
      Math.max(nextIndices * 2, nextIndices + needIndices),
    );
  }
  if (nextVerts > OPAQUE_BATCH_MAX_VERTS || nextIndices > OPAQUE_BATCH_MAX_INDICES) return false;
  if ((nextVerts > mesh._maxVertexCount || nextIndices > mesh._maxIndexCount)
      && typeof mesh.setGeometrySize === 'function') {
    try {
      mesh.setGeometrySize(nextVerts, nextIndices);
    } catch (_) {
      return false;
    }
  }
  if (mesh.unusedVertexCount < needVerts) return false;
  if (typeof mesh.unusedIndexCount === 'number' && mesh.unusedIndexCount < needIndices) return false;
  return true;
}

export function refreshBatchWorldBounds(mesh) {
  if (!mesh || typeof mesh.computeBoundingSphere !== 'function') return false;
  mesh.computeBoundingSphere();
  return !!(mesh.boundingSphere);
}

function hideUnusedInstances(batch) {
  for (let i = batch.used; i < batch.allocated; i++) {
    try {
      batch.mesh.setVisibleAt(batch.instanceIds[i], false);
    } catch (_) {
      // Deleted or not yet validated instance; skip.
    }
  }
}

export function getOpaqueMaterialBatchDiagnostics(state) {
  return state && state.stats ? { ...state.stats } : createBatchStats();
}
