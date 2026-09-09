// Presentation snapshot fence. Render reads the latest complete packed frame,
// never live entity objects. Required before a simulation Worker.

import { createPresentationSnapshot } from './presentationSnapshot.js';

export const SNAPSHOT_FENCE_BUFFERS = 3;

function readonlyColumns(columns) {
  // Ownership is the immutability boundary: only the writer slot can call
  // write(), and commit rotates to another slot before the next pack. Do not
  // proxy typed-array element reads on the render hot path. The facade is built once per buffer;
  // getters resolve the current typed-array value because presentationSnapshot grows by replacing
  // columns[name] when a population spike exceeds capacity.
  const facade = {};
  for (const name of Object.keys(columns || {})) {
    Object.defineProperty(facade, name, {
      enumerable: true,
      configurable: false,
      get() { return columns[name]; },
    });
  }
  return Object.freeze(facade);
}

function readonlyIndex(index) {
  return Object.freeze({
    get(entityId) { return index.get(entityId); },
    has(entityId) { return index.has(entityId); },
    get size() { return index.size; },
  });
}

export function createSnapshotFence(options = {}) {
  const buffers = Array.from({ length: SNAPSHOT_FENCE_BUFFERS }, () => {
    const snapshot = createPresentationSnapshot({
      capacity: options.capacity || 256,
      journalCapacity: options.journalCapacity,
    });
    const indexByEntityId = new Map();
    const publishedIndexByEntityId = readonlyIndex(indexByEntityId);
    const publishedColumns = readonlyColumns(snapshot.columns);
    const state = {
      snapshot,
      indexByEntityId,
      publishedIndexByEntityId,
      sealed: true,
      simTime: 0,
      sequence: 0,
    };
    const writable = {
      get schema() { return snapshot.schema; },
      get columns() { return snapshot.columns; },
      get count() { return snapshot.count; },
      get capacity() { return snapshot.capacity; },
      get generation() { return snapshot.generation; },
      get journalDropped() { return snapshot.journalDropped; },
      beginFrame(expectedCount) {
        if (state.sealed) state.sealed = false;
        indexByEntityId.clear();
        return snapshot.beginFrame(expectedCount);
      },
      write(...args) {
        if (state.sealed) throw new Error('Presentation snapshot fence buffer is sealed');
        const index = snapshot.write(...args);
        state.indexByEntityId.set(args[0] >>> 0, index);
        return index;
      },
      setTint(...args) {
        if (state.sealed) throw new Error('Presentation snapshot fence buffer is sealed');
        return snapshot.setTint(...args);
      },
      record(...args) {
        if (state.sealed) throw new Error('Presentation snapshot fence buffer is sealed');
        return snapshot.record(...args);
      },
      drainJournal(...args) { return snapshot.drainJournal(...args); },
    };
    const published = Object.freeze({
      schema: snapshot.schema,
      columns: publishedColumns,
      get count() { return snapshot.count; },
      get capacity() { return snapshot.capacity; },
      get generation() { return snapshot.generation; },
      get journalDropped() { return snapshot.journalDropped; },
      get simTime() { return state.simTime; },
      get sequence() { return state.sequence; },
      get indexByEntityId() { return state.publishedIndexByEntityId; },
    });
    state.writable = Object.freeze(writable);
    state.published = published;
    return state;
  });
  let write = 0;
  let latest = -1;
  let previous = -1;
  let sequence = 0;
  let packCount = 0;

  return {
    beginPack(expectedCount, simTime = 0) {
      const buffer = buffers[write];
      buffer.writable.beginFrame(expectedCount);
      buffer.simTime = Number.isFinite(simTime) ? simTime : 0;
      buffer.sequence = sequence + 1;
      return buffer.writable;
    },
    commit() {
      const buffer = buffers[write];
      if (buffer.sealed) throw new Error('Presentation snapshot fence commit without beginPack');
      sequence++;
      previous = latest;
      latest = write;
      buffer.sealed = true;
      buffer.sequence = sequence;
      write = (write + 1) % SNAPSHOT_FENCE_BUFFERS;
      packCount++;
      return sequence;
    },
    latestSnapshot() {
      if (latest < 0) return null;
      return buffers[latest].published;
    },
    previousSnapshot() {
      if (packCount < 2 || previous < 0) return null;
      return buffers[previous].published;
    },
    get sequence() { return sequence; },
    get packCount() { return packCount; },
  };
}

export function snapshotIndexOf(snapshot, entityId) {
  if (!snapshot || entityId == null) return -1;
  if (snapshot.indexByEntityId && typeof snapshot.indexByEntityId.get === 'function') {
    const indexed = snapshot.indexByEntityId.get(entityId >>> 0);
    return indexed == null ? -1 : indexed;
  }
  const ids = snapshot.columns && snapshot.columns.entityId;
  if (!ids) return -1;
  const want = entityId >>> 0;
  const n = snapshot.count | 0;
  for (let i = 0; i < n; i++) if (ids[i] === want) return i;
  return -1;
}

export function applySnapshotPoseToMesh(mesh, snapshot, entityId, origin, previous = null, alpha = 1) {
  if (!mesh || !mesh.position || !snapshot) return false;
  const index = snapshotIndexOf(snapshot, entityId);
  if (index < 0) return false;
  const p = index * 3;
  const q = index * 4;
  let x = snapshot.columns.position[p];
  let z = snapshot.columns.position[p + 2];
  let qy = snapshot.columns.quaternion[q + 1];
  let qw = snapshot.columns.quaternion[q + 3];
  const t = Number.isFinite(alpha) ? alpha : 1;
  if (previous && t < 1) {
    const prev = snapshotIndexOf(previous, entityId);
    if (prev >= 0) {
      const pp = prev * 3;
      const pq = prev * 4;
      x = previous.columns.position[pp] + (x - previous.columns.position[pp]) * t;
      z = previous.columns.position[pp + 2] + (z - previous.columns.position[pp + 2]) * t;
      qy = previous.columns.quaternion[pq + 1] + (qy - previous.columns.quaternion[pq + 1]) * t;
      qw = previous.columns.quaternion[pq + 3] + (qw - previous.columns.quaternion[pq + 3]) * t;
    }
  }
  const ox = origin && Number.isFinite(origin.x) ? origin.x : 0;
  const oy = origin && Number.isFinite(origin.y) ? origin.y : 0;
  const oz = origin && Number.isFinite(origin.z) ? origin.z : 0;
  mesh.position.x = x - ox;
  mesh.position.y = (snapshot.columns.position[p + 1] || 0) - oy;
  mesh.position.z = z - oz;
  mesh.rotation.y = -2 * Math.atan2(qy, qw || 1);
  return true;
}

export function packPresentationWorldToFence(world, fence, simTime = 0) {
  if (!world || !fence) return 0;
  const diagnostics = typeof world.getDiagnostics === 'function' ? world.getDiagnostics() : null;
  const active = diagnostics && Number.isInteger(diagnostics.active) ? diagnostics.active : 0;
  const snapshot = fence.beginPack(Math.max(1, active), simTime);
  let packed = 0;
  for (let index = 0; index < active; index++) {
    const slot = world.activeSlots[index];
    if (world.alive[slot] !== 1) continue;
    const rot = world.rot ? Number(world.rot[slot]) || 0 : 0;
    const half = rot * 0.5;
    snapshot.write(
      world.entityIds[slot] >>> 0,
      world.typeCodes ? world.typeCodes[slot] : 0,
      world.x[slot],
      world.y[slot],
      world.z[slot],
      0, Math.sin(half), 0, Math.cos(half),
      1, 1, 1,
      world.flags[slot] >>> 0,
    );
    packed++;
  }
  fence.commit();
  return packed;
}

export function packEntityIntoSnapshot(snapshot, entity, options = {}) {
  if (!snapshot || !entity || entity.alive === false) return -1;
  const pos = entity.pos || {};
  const flags = options.flags || 0;
  return snapshot.write(
    entity.id >>> 0,
    options.archetype || 0,
    Number(pos.x) || 0,
    Number(pos.y) || 0,
    Number(pos.z) || 0,
    0, 0, 0, 1,
    1, 1, 1,
    flags >>> 0,
  );
}
